/**
 * Lo que falló y nadie ha mirado (5.13, Dec-45): «Needs attention».
 *
 * Se ve en la bienvenida (de todos los workspaces) y en la ficha de cada
 * workspace (las suyas), con la razón en una línea. Sale de `ejecuciones`, sin
 * tabla nueva:
 *
 *   - sólo lo que corrió sin nadie delante: programado, línea de comandos, lote.
 *     Lo lanzado desde la interfaz, quien lo lanzó ya lo vio;
 *   - las que fallaron o terminaron en aviso (un contrato que avisa, un test de
 *     dbt en warn), de los últimos 30 días;
 *   - sólo si es la ÚLTIMA ejecución de ese proceso: si después corrió bien, ya
 *     está resuelto;
 *   - menos las ya vistas (la ficha se abrió, o «Dismiss»), que se guardan en la
 *     preferencia `atencion_vistas` (los ids de los últimos 30 días).
 */
const path = require('path');

const DIAS = 30;
const MAX_VISTAS = 500;
const DESATENDIDAS = ['programada', 'linea_de_comandos', 'lote'];

const json = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const horaUtc = (t) => (t ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? String(t) : `${String(t).replace(' ', 'T')}Z`).toISOString() : null);

/** La razón en una línea: la del resumen, o la primera del error. */
function razonDe(e, r) {
    if (r?.linea && (r.estado === 'fallo' || r.estado === 'aviso')) return String(r.linea);
    if (e.error) return String(e.error).split('\n')[0];
    return r?.linea || (e.estado === 'fallo' ? 'It failed.' : 'It finished with a warning.');
}

const nombreDe = (e, r) => r?.nombre || (/^dbt\s/.test(e.proceso || '') ? e.proceso : path.basename(e.proceso || '').replace(/\.sqlchain$/i, '')) || 'Process';

async function vistas(base) {
    const v = await base.preferencia('atencion_vistas').catch(() => undefined);
    return new Set(Array.isArray(v) ? v : []);
}

/** La lista, de la más nueva a la más vieja. `workspaceId` filtra. */
async function listar(base, { workspaceId = null } = {}) {
    const marcadas = await vistas(base);
    const filas = await base.query(
        `SELECT * FROM ejecuciones
         WHERE inicio >= current_timestamp - INTERVAL ${DIAS} DAY AND origen IN (${DESATENDIDAS.map(o => `'${o}'`).join(', ')})
         ORDER BY inicio DESC LIMIT 2000`,
    );
    // La última de cada proceso (mismo proceso en el mismo proyecto).
    const ultima = new Map();
    for (const e of filas) {
        const clave = `${e.proyecto || ''}\u0000${e.proceso || ''}`;
        if (!ultima.has(clave) && e.estado !== 'en_curso') ultima.set(clave, e);
    }
    const ws = new Map((await base.query(`SELECT id, nombre, color FROM workspaces`).catch(() => [])).map(w => [w.id, w]));
    const out = [];
    for (const e of ultima.values()) {
        if (workspaceId && e.workspace_id !== workspaceId) continue;
        if (marcadas.has(e.id)) continue;
        const r = json(e.resumen);
        const estado = e.estado === 'fallo' ? 'fallo' : r?.estado === 'aviso' ? 'aviso' : null;
        if (!estado) continue;
        out.push({
            id: e.id, estado, nombre: nombreDe(e, r), origen: e.origen,
            proyecto: e.proyecto || null, proyectoNombre: e.proyecto ? path.basename(e.proyecto) : null,
            workspaceId: e.workspace_id || null, workspaceNombre: ws.get(e.workspace_id)?.nombre || null, workspaceColor: ws.get(e.workspace_id)?.color || null,
            // `inicio` y `fin` son hora local (como en Operations); `prevista`, UTC.
            cuando: String(e.fin || e.inicio || ''), prevista: horaUtc(e.prevista), programacionId: e.programacion_id || null,
            razon: razonDe(e, r),
        });
    }
    return out.sort((a, b) => String(b.cuando).localeCompare(String(a.cuando)));
}

/** Marca como vistas (la ficha se abrió, o «Dismiss»). */
async function marcarVistas(base, ids) {
    const nuevas = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
    if (!nuevas.length) return;
    const actuales = [...(await vistas(base))];
    // Sólo hace falta recordar las que aún podrían salir (las de los últimos días).
    const recientes = new Set((await base.query(`SELECT id FROM ejecuciones WHERE inicio >= current_timestamp - INTERVAL ${DIAS} DAY`)).map(e => e.id));
    const lista = [...new Set([...actuales.filter(id => recientes.has(id)), ...nuevas])].slice(-MAX_VISTAS);
    await base.guardarPreferencia('atencion_vistas', lista);
}

module.exports = { listar, marcarVistas, DESATENDIDAS, DIAS };
