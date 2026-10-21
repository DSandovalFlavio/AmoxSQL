/**
 * programador.js — lo programado dentro del servidor (5.11, D1).
 *
 *   - `correrOcurrencia`: corre una ocurrencia de una programación, igual que
 *     la línea de comandos (contexto aislado, `origen: 'programada'`), con los
 *     parámetros de la programación y la fecha que tocaba; guarda su resumen
 *     en `ejecuciones` y avisa (D2) según la programación.
 *   - el reloj de la aplicación abierta: un `tick` cada minuto. Al arrancar,
 *     uno enseguida: ponerse al día con lo que se perdió con AmoxSQL cerrado.
 *   - la tarea del sistema (opcional, Dec-16): cada vez que algo cambia se le
 *     dice al proceso principal a qué hora es la próxima, y él reescribe la
 *     tarea si el usuario la activó.
 */
const fs = require('fs');
const path = require('path');
const baseCentral = require('../central/BaseCentral');
const programaciones = require('./programaciones');
const { ejecutarProceso } = require('../ejecucion/ejecutarProceso');
const { resumir } = require('../ejecucion/resumen');

let estado = {
    esperaLlegadaMs: 60000,  // D8: varias llegadas seguidas son una ejecución (Dec-23)
    esperas: new Map(),      // programación → temporizador de su llegada
    dbManager: null,
    avisar: null,            // (aviso) => void — el aviso del sistema (D2)
    proximaCambio: null,     // (iso|null, activo) => void — para la tarea del sistema
    reloj: null,
    alAbrir: null,           // lo que hizo el primer tick (para «se perdieron…» en la interfaz)
    oyentes: new Set(),      // quien quiere saber que algo corrió (la interfaz, por SSE)
};

const emitir = (evento) => { for (const f of estado.oyentes) { try { f(evento); } catch { /* uno que falla no tapa al resto */ } } };

/** Corre una ocurrencia. Devuelve { runId, estado, resumen }. */
async function correrOcurrencia(prog, prevista, { perdidas = 0, origen = 'programada' } = {}) {
    let cadena;
    try { cadena = JSON.parse(fs.readFileSync(prog.proceso, 'utf8')); } catch (e) {
        const error = `The process could not be read: ${e.message}`;
        avisar(prog, { estado: 'fallo', linea: `${prog.nombre} could not start: ${error}` }, perdidas);
        return { estado: 'fallo', error };
    }
    const chainFile = path.relative(prog.proyecto, prog.proceso);
    emitir({ tipo: 'empieza', programacionId: prog.id, nombre: prog.nombre, prevista });
    const r = await ejecutarProceso({
        dbManager: estado.dbManager, chainDef: cadena, proyecto: prog.proyecto,
        chainFile: chainFile.startsWith('..') ? prog.proceso : chainFile,
        variables: cadena.variables || {}, deFuera: programaciones.parametrosDeOcurrencia(prog, prevista),
        fechaReferencia: prevista, origen, programacionId: prog.id, prevista,
    }).catch(e => ({ status: 'failed', error: e.message }));
    let res = null;
    if (r.runId) {
        res = await resumir({ base: baseCentral, dbManager: estado.dbManager, runId: r.runId, proyecto: prog.proyecto }).catch(() => null);
        if (res) await baseCentral.query(`UPDATE ejecuciones SET resumen = $2 WHERE id = $1`, [r.runId, JSON.stringify(res)]).catch(() => {});
    }
    const est = r.status === 'completed' ? 'ok' : 'fallo';
    avisar(prog, res || { estado: est, linea: `${prog.nombre} ${est === 'ok' ? 'finished' : `failed: ${r.error || ''}`}`, runId: r.runId }, perdidas);
    emitir({ tipo: 'termina', programacionId: prog.id, nombre: prog.nombre, prevista, runId: r.runId || null, estado: est });
    return { runId: r.runId || null, estado: est, error: r.error || null, resumen: res };
}

/** El aviso del sistema (D2), según lo que pidió la programación. */
function avisar(prog, res, perdidas) {
    if (!estado.avisar || prog.avisar === 'nunca') return;
    if (prog.avisar === 'fallo' && res.estado === 'ok') return;
    const extra = perdidas > 0 ? ` (${perdidas === 1 ? '1 earlier run was' : `${perdidas} earlier runs were`} missed while AmoxSQL was closed; this is the latest)` : '';
    estado.avisar({
        titulo: res.estado === 'ok' ? prog.nombre : `${prog.nombre} failed`,
        texto: `${res.estado === 'ok' ? res.linea.replace(`${res.nombre} · `, '') : res.linea}${extra}`,
        runId: res.runId || null,
        ok: res.estado === 'ok',
    });
}

async function tick(ahora = new Date()) {
    if (!baseCentral.estaAbierta()) return { corridas: [], saltadas: [] };
    const r = await programaciones.tick({ ahora, correr: (prog, prevista, o) => correrOcurrencia(prog, prevista, o) });
    await anunciarProxima();
    return r;
}

/** Le dice al proceso principal la próxima hora, para la tarea del sistema. */
async function anunciarProxima() {
    if (!estado.proximaCambio || !baseCentral.estaAbierta()) return;
    try {
        const activo = (await baseCentral.preferencia('programador_sistema')) === true;
        const p = await programaciones.proximaGlobal();
        estado.proximaCambio(p ? p.toISOString() : null, activo);
    } catch { /* sólo es un aviso */ }
}

/**
 * D8 (Dec-23): llegó un archivo a una fuente de carpeta del proyecto abierto.
 * Las programaciones «al llegar» de esa fuente corren cuando pasa un rato sin
 * que llegue nada más: diez archivos que bajan juntos son una ejecución. Sólo
 * con AmoxSQL abierto (la vigilancia de carpetas vive en la aplicación).
 */
async function alLlegar(fuentesLlegadas, proyecto) {
    if (!baseCentral.estaAbierta() || !proyecto) return [];
    if (await programaciones.pausaGeneral()) return [];
    const lista = await programaciones.listar();
    const tocan = lista.filter(p => p.activa && p.regla?.tipo === 'al_llegar' && (fuentesLlegadas || []).includes(p.regla.fuente)
        && path.resolve(p.proyecto) === path.resolve(proyecto)
        && !(p.pausadaHasta && new Date(p.pausadaHasta) > new Date()));
    for (const prog of tocan) {
        clearTimeout(estado.esperas.get(prog.id));
        estado.esperas.set(prog.id, setTimeout(() => {
            estado.esperas.delete(prog.id);
            correrOcurrencia(prog, new Date().toISOString(), { origen: 'al_llegar' }).catch(e => console.warn('[Programador] Al llegar:', e.message));
        }, estado.esperaLlegadaMs));
    }
    return tocan.map(p => p.id);
}

/** Con qué corre y a quién avisa (lo da el servidor al arrancar). */
function configurar({ dbManager, avisar: alAvisar, proximaCambio, esperaLlegadaMs } = {}) {
    if (esperaLlegadaMs !== undefined) estado.esperaLlegadaMs = esperaLlegadaMs;
    if (dbManager) estado.dbManager = dbManager;
    if (alAvisar !== undefined) estado.avisar = alAvisar;
    if (proximaCambio !== undefined) estado.proximaCambio = proximaCambio;
}

/**
 * Arranca el reloj de la aplicación abierta. Al empezar, un tick enseguida:
 * lo que se perdió mientras AmoxSQL estaba cerrado (Dec-17). Un arranque sin
 * ventana (una orden `run`) no lo arranca: sólo corre su orden.
 */
function arrancar({ cadaMs = 60000, ...config } = {}) {
    configurar(config);
    if (estado.reloj) clearInterval(estado.reloj);
    const primera = async () => {
        for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 200));
        try { estado.alAbrir = { ...(await tick()), cuando: new Date().toISOString() }; } catch (e) { console.warn('[Programador] Primer tick:', e.message); }
    };
    setTimeout(primera, 3000);
    estado.reloj = setInterval(() => { tick().catch(e => console.warn('[Programador] Tick:', e.message)); }, cadaMs);
    if (estado.reloj.unref) estado.reloj.unref();
}

function parar() {
    if (estado.reloj) clearInterval(estado.reloj);
    estado.reloj = null;
}

module.exports = {
    correrOcurrencia, tick, configurar, arrancar, parar, anunciarProxima, alLlegar,
    relojEnMarcha: () => !!estado.reloj,
    alAbrir: () => estado.alAbrir,
    oir: (f) => { estado.oyentes.add(f); return () => estado.oyentes.delete(f); },
    _estado: estado,
};
