/**
 * Operations: schedules and their calendar, runs, deliveries and their destinations, what changed in a process.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const dbManager        = require('../DatabaseManager');
const baseCentral      = require('../central/BaseCentral');

const ctx = require('./compartido');
const {
    conCentral, destinoDeFuente,
} = ctx;

const rutas = express.Router();

const entregas         = require('../entregas');

const dbtCorrer        = require('../dbt/correr');

const dbtEjecutar      = require('../dbt/ejecutar');

const dbtFuentes       = require('../dbt/fuentes');

/* ─── Git ─── */
const gitManager = require('../git/gitManager');

const historialDeProcesos = require('../ejecucion/historial');

const { ejecutarProceso } = require('../ejecucion/ejecutarProceso');

// 5.14 (F3, Dec-52): la entrega anterior de un archivo y la comparación.
rutas.get('/api/entregas', async (req, res) => {
    try {
        const d = entregas.deCopia(req.query.copia);
        let clave = null;
        if (d.actual) { try { clave = await entregas.claveSugerida(dbManager, d.ruta); } catch { /* sin sugerencia */ } }
        res.json({ ...d, clave });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

rutas.post('/api/entregas/comparar', async (req, res) => {
    try {
        const { copia, clave } = req.body || {};
        const d = entregas.deCopia(copia);
        if (!d.actual) throw new Error(`${path.basename(d.ruta)} is no longer there.`);
        res.json(await entregas.comparar(dbManager, { actual: d.ruta, anterior: path.resolve(copia), clave: Array.isArray(clave) ? clave : (clave ? [clave] : []) }));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// 5.14 (J9, Dec-53): qué cambió en un proceso, en pasos y no en JSON. `antes`:
// HEAD (el último commit) o index (lo preparado); `despues`: index o el disco.
rutas.get('/api/procesos/cambios', async (req, res) => {
    try {
        const rel = String(req.query.ruta || '');
        const abs = path.resolve(ctx.ROOT_DIR, rel);
        // 5.15: también un Canvas, con la misma forma.
        if (!/\.(sqlchain|amoxcanvas)$/i.test(rel) || path.relative(ctx.ROOT_DIR, abs).startsWith('..')) throw new Error('Only a process or a canvas of this project can be compared.');
        const relGit = path.relative(ctx.ROOT_DIR, abs);
        const antes = await gitManager.getFileAt(ctx.ROOT_DIR, relGit, req.query.antes === 'index' ? 'index' : 'HEAD');
        const despues = req.query.despues === 'index'
            ? await gitManager.getFileAt(ctx.ROOT_DIR, relGit, 'index')
            : await fs.promises.readFile(abs, 'utf8').catch(() => null);
        const diffDeProcesos = require('../diffDeProcesos');
        const d = /\.amoxcanvas$/i.test(rel) ? diffDeProcesos.diferenciasDeLienzo(antes, despues) : diffDeProcesos.diferencias(antes, despues);
        res.json({ ...d, lineas: diffDeProcesos.describir(d), nuevo: antes == null, borrado: despues == null });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Lo programado (5.11, D1) ─────────────────────────────────────────────────
// Las programaciones son de esta máquina (Dec-15). Ver server/programacion/.
const programaciones = require('../programacion/programaciones');

const programador = require('../programacion/programador');

const reglasDeProgramacion = require('../programacion/reglas');

const calendarioDeTrabajo = require('../programacion/calendario');

// 5.12 (I10): un comando de dbt («dbt build …») no es una ruta.
const rutaDeProceso = (proceso, proyecto) => (/^dbt\s/.test(String(proceso)) ? String(proceso) : path.isAbsolute(String(proceso)) ? String(proceso) : path.resolve(proyecto, String(proceso)));

const tras = async (r) => { programador.anunciarProxima(); return r; };

rutas.get('/api/programaciones', conCentral(async (req) => {
    let lista = await programaciones.listar();
    if (req.query.proceso && ctx.PROYECTO_ABIERTO) {
        const abs = rutaDeProceso(req.query.proceso, ctx.ROOT_DIR);
        lista = lista.filter(p => (/^dbt\s/.test(abs) ? /^dbt\s/.test(p.proceso) && path.resolve(p.proyecto) === path.resolve(ctx.ROOT_DIR) : path.resolve(p.proceso) === path.resolve(abs)));
    }
    return {
        programaciones: lista,
        pausaGeneral: await programaciones.pausaGeneral(),
        sistema: { activo: (await baseCentral.preferencia('programador_sistema')) === true, soportado: process.platform === 'win32' },
        alAbrir: programador.alAbrir(),
    };
}));

rutas.post('/api/programaciones', conCentral(async (req) => {
    const b = req.body || {};
    const proyecto = b.proyecto || (ctx.PROYECTO_ABIERTO ? ctx.ROOT_DIR : null);
    if (!proyecto) throw new Error('Open the project of the process first.');
    return tras({ programacion: await programaciones.crear({ ...b, proyecto, proceso: rutaDeProceso(b.proceso, proyecto) }) });
}));

rutas.put('/api/programaciones/pausa', conCentral(async (req) => tras({ pausaGeneral: await programaciones.pausaGeneral(req.body?.hasta || null) })));

rutas.put('/api/programaciones/sistema', conCentral(async (req) => {
    await baseCentral.guardarPreferencia('programador_sistema', req.body?.activo === true);
    return tras({ activo: req.body?.activo === true, soportado: process.platform === 'win32' });
}));

rutas.post('/api/programaciones/vista-previa', conCentral(async (req) => {
    const { regla, workspaceId = null } = req.body || {};
    try {
        const ws = workspaceId || (ctx.PROYECTO_ABIERTO ? programaciones.workspaceDe(ctx.ROOT_DIR) : null);
        const cal = calendarioDeTrabajo.leer(ws);
        return {
            descripcion: reglasDeProgramacion.describir(regla),
            proximas: reglasDeProgramacion.proximas(regla, new Date(), cal, 5).map(d => d.toISOString()),
            calendarioPropio: cal.propio,
        };
    } catch (e) {
        return { error: e.message, proximas: [] };
    }
}));

rutas.put('/api/programaciones/:id', conCentral(async (req) => tras({ programacion: await programaciones.actualizar(req.params.id, req.body || {}) })));

rutas.delete('/api/programaciones/:id', conCentral(async (req) => { await programaciones.borrar(req.params.id); return tras({ ok: true }); }));

rutas.post('/api/programaciones/:id/pausar', conCentral(async (req) => tras({ programacion: await programaciones.pausar(req.params.id, { hasta: req.body?.hasta || undefined, reanudar: !!req.body?.reanudar }) })));

// «Run now»: una ocurrencia a mano, que queda en su historial como las demás.
rutas.post('/api/programaciones/:id/correr', conCentral(async (req) => {
    const prog = await programaciones.leer(req.params.id);
    if (!prog) throw new Error('That schedule does not exist.');
    return programador.correrOcurrencia(prog, new Date().toISOString(), { origen: 'programada' });
}));

// ── El panel de operación (5.11, D7) ─────────────────────────────────────────
// Todo lo programado, de todos los workspaces, en un sitio: lo de hoy (lo que
// corrió y lo que falta), lo de mañana, las programaciones y la bitácora.
rutas.get('/api/operacion', conCentral(async (req) => {
    const ahora = new Date();
    const dia = (d, n = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const hoy0 = dia(ahora), manana0 = dia(ahora, 1), pasado0 = dia(ahora, 2);
    const dos = (n) => String(n).padStart(2, '0');
    const localSql = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} 00:00:00`;
    const ws = new Map((await baseCentral.query(`SELECT id, nombre, color FROM workspaces`)).map(w => [w.id, w]));
    const pausa = await programaciones.pausaGeneral();
    const lista = (await programaciones.listar()).map(p => ({
        ...p, workspaceNombre: ws.get(p.workspaceId)?.nombre || null, workspaceColor: ws.get(p.workspaceId)?.color || null,
        proyectoNombre: path.basename(p.proyecto || ''),
    }));
    // Lo que falta hoy y lo de mañana: las ocurrencias de cada una, salvo pausas.
    const pendientes = [];
    for (const p of lista) {
        if (!p.activa || p.regla?.tipo === 'al_llegar') continue;
        const cal = calendarioDeTrabajo.leer(p.workspaceId);
        let occ = [];
        try { occ = reglasDeProgramacion.ocurrencias(p.regla, ahora, new Date(pasado0.getTime() - 1), cal, 200); } catch { continue; }
        for (const t of occ) {
            if (p.pausadaHasta && new Date(p.pausadaHasta) > t) continue;
            pendientes.push({ programacionId: p.id, nombre: p.nombre, workspaceNombre: p.workspaceNombre, workspaceColor: p.workspaceColor, cuando: t.toISOString(), pausadaGeneral: !!(pausa && new Date(pausa) > t), manana: t >= manana0 });
        }
    }
    pendientes.sort((a, b) => a.cuando.localeCompare(b.cuando));
    const resumenDe = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
    const fila = (e) => {
        const p = lista.find(x => x.id === e.programacion_id);
        const r = resumenDe(e.resumen);
        return {
            id: e.id, estado: e.estado, origen: e.origen, inicio: e.inicio, fin: e.fin, error: e.error,
            nombre: p?.nombre || r?.nombre || path.basename(e.proceso || '').replace(/\.sqlchain$/i, ''),
            proyectoNombre: path.basename(e.proyecto || ''), workspaceNombre: ws.get(e.workspace_id)?.nombre || null,
            workspaceColor: ws.get(e.workspace_id)?.color || null, programacionId: e.programacion_id || null,
            prevista: horaUtc(e.prevista), linea: r?.linea || null,
        };
    };
    const hoyCorridas = (await baseCentral.query(
        `SELECT * FROM ejecuciones WHERE programacion_id IS NOT NULL AND inicio >= CAST($1 AS TIMESTAMP) ORDER BY inicio`, [localSql(hoy0)]
    )).map(fila);
    const limite = Math.min(Number(req.query.limite) || 150, 500);
    const bitacora = (await baseCentral.query(`SELECT * FROM ejecuciones ORDER BY inicio DESC LIMIT ${limite}`)).map(fila);
    return {
        ahora: ahora.toISOString(),
        hoy: { corridas: hoyCorridas, pendientes: pendientes.filter(x => !x.manana) },
        manana: { pendientes: pendientes.filter(x => x.manana) },
        programaciones: lista,
        bitacora,
        pausaGeneral: pausa,
        // 5.13 (Dec-45): lo que falló y nadie ha mirado, no sólo lo de hoy.
        atencion: (await atencion.listar(baseCentral).catch(() => [])).length,
        // 5.13 (Dec-42): cuánto puede usar lo de fondo mientras se trabaja.
        limites: { ...(await require('../ejecucion/limites').preferencias()), nucleos: require('os').cpus()?.length || 2, memoriaGb: Math.round(require('os').totalmem() / 1073741824) },
        sistema: { activo: (await baseCentral.preferencia('programador_sistema')) === true, soportado: process.platform === 'win32' },
    };
}));

// ── Lo que falló y nadie ha mirado (5.13, Dec-45) ────────────────────────────
// La bienvenida (todas) y la ficha de cada workspace (las suyas). Ver
// server/ejecucion/atencion.js.
const atencion = require('../ejecucion/atencion');

rutas.get('/api/operacion/atencion', conCentral(async (req) => ({
    atencion: await atencion.listar(baseCentral, { workspaceId: req.query.workspace ? String(req.query.workspace) : null }),
})));

rutas.post('/api/operacion/atencion/vista', conCentral(async (req) => {
    await atencion.marcarVistas(baseCentral, req.body?.ids || []);
    return { ok: true };
}));

// ── La ficha de una ejecución (5.11, D2) ─────────────────────────────────────
// Lo que pasó en una ejecución, para quien llega desde un aviso, la bitácora o
// el panel de operación: pasos, lo que leyó y dejó, sus parámetros y de dónde vino.
const horaUtc = (t) => (t ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? String(t) : `${String(t).replace(' ', 'T')}Z`).toISOString() : null);

rutas.get('/api/ejecuciones/:id', conCentral(async (req) => {
    const [e] = await baseCentral.query(`SELECT * FROM ejecuciones WHERE id = $1`, [req.params.id]);
    if (!e) throw new Error('That run does not exist in the history.');
    // 5.12 (Dec-34): una ejecución de dbt; sus pasos son sus modelos y tests.
    if (dbtEjecutar.esDeDbt(e.proceso)) {
        let r = null;
        try { r = e.resumen ? JSON.parse(e.resumen) : null; } catch { /* sin resumen */ }
        let programacion = null;
        if (e.programacion_id) {
            const p = await programaciones.leer(e.programacion_id).catch(() => null);
            programacion = p ? { id: p.id, nombre: p.nombre, descripcion: p.descripcion } : { id: e.programacion_id, borrada: true };
        }
        const OK = new Set(['success', 'pass']);
        return {
            ejecucion: { id: e.id, proceso: e.proceso, proyecto: e.proyecto, origen: e.origen, estado: e.estado, inicio: e.inicio, fin: e.fin, error: e.error, parametros: {}, prevista: horaUtc(e.prevista) },
            programacion, dbt: true, resumen: r, procesoEnProyecto: null,
            pasos: (r?.nodos || []).map(n => ({ nodo: n.nombre, tipo: n.tipo, estado: OK.has(n.estado) ? 'success' : ['error', 'fail'].includes(n.estado) ? 'failed' : n.estado, ms: Math.round((n.segundos || 0) * 1000), filas: null, error: ['error', 'fail', 'warn'].includes(n.estado) ? (n.mensaje || n.estado) : null })),
        };
    }
    const { nodeRuns } = await historialDeProcesos.leer({ base: baseCentral, dbManager, runId: e.id });
    const pasos = [...nodeRuns].sort((a, b) => String(a.started_at || a.finished_at || '').localeCompare(String(b.started_at || b.finished_at || ''))).map(n => {
        let s = {};
        try { s = JSON.parse(n.result_summary || '{}'); } catch { /* sin resumen */ }
        return { nodo: n.node_label || n.node_id, tipo: n.node_type, estado: n.status, ms: n.duration_ms, filas: s.rowCount ?? null, error: n.error_message || null, reintentos: s.reintentos || 0 };
    });
    const resumen = await require('../ejecucion/resumen').resumir({ base: baseCentral, dbManager, runId: e.id, proyecto: e.proyecto }).catch(() => null);
    let programacion = null;
    if (e.programacion_id) {
        const p = await programaciones.leer(e.programacion_id).catch(() => null);
        programacion = p ? { id: p.id, nombre: p.nombre, descripcion: p.descripcion } : { id: e.programacion_id, borrada: true };
    }
    let parametros = {};
    try { parametros = JSON.parse(e.parametros || '{}'); } catch { /* sin parámetros */ }
    // Si es del proyecto abierto, la interfaz puede abrir el proceso.
    let procesoEnProyecto = null;
    if (ctx.PROYECTO_ABIERTO && e.proyecto && path.resolve(e.proyecto) === path.resolve(ctx.ROOT_DIR) && e.proceso) {
        const rel = path.relative(ctx.ROOT_DIR, e.proceso);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) procesoEnProyecto = rel.split(path.sep).join('/');
    }
    return {
        ejecucion: {
            id: e.id, proceso: e.proceso, proyecto: e.proyecto, origen: e.origen, estado: e.estado,
            inicio: e.inicio, fin: e.fin, error: e.error, parametros, prevista: horaUtc(e.prevista),
        },
        programacion, pasos, resumen, procesoEnProyecto,
        // 5.13 (Dec-42): con qué límites corrió de fondo, si los llevó.
        limites: (() => { try { return JSON.parse(e.resumen || 'null')?.limites || null; } catch { return null; } })(),
    };
}));

// «Run again»: el mismo proceso con los mismos valores. Una ocurrencia
// programada se repite como tal (queda en el historial de su programación).
rutas.post('/api/ejecuciones/:id/repetir', conCentral(async (req) => {
    const [e] = await baseCentral.query(`SELECT * FROM ejecuciones WHERE id = $1`, [req.params.id]);
    if (!e) throw new Error('That run does not exist in the history.');
    if (e.programacion_id) {
        const prog = await programaciones.leer(e.programacion_id);
        if (prog) return programador.correrOcurrencia(prog, horaUtc(e.prevista) || new Date().toISOString(), { origen: 'programada' });
    }
    // 5.12: un comando de dbt se repite tal cual, en su proyecto.
    if (dbtEjecutar.esDeDbt(e.proceso)) {
        const { args } = dbtCorrer.analizarComando(e.proceso);
        const r = await dbtEjecutar.ejecutarDbt({ base: baseCentral, dbManager: e.proyecto && path.resolve(e.proyecto) === path.resolve(ctx.ROOT_DIR) ? dbManager : null, raiz: e.proyecto, args, env: await dbtFuentes.variables(e.proyecto).catch(() => ({})), origen: e.origen === 'interfaz' ? 'interfaz' : 'linea_de_comandos' });
        return { runId: r.runId, estado: r.resumen.estado === 'fallo' ? 'fallo' : 'ok', error: r.resumen.estado === 'fallo' ? r.resumen.linea : null };
    }
    if (!e.proceso || !fs.existsSync(e.proceso)) throw new Error(`The process is no longer there: ${e.proceso}`);
    const cadena = JSON.parse(fs.readFileSync(e.proceso, 'utf8'));
    let parametros = {};
    try { parametros = JSON.parse(e.parametros || '{}'); } catch { /* sin parámetros */ }
    const r = await ejecutarProceso({
        dbManager, chainDef: cadena, proyecto: e.proyecto, chainFile: path.relative(e.proyecto, e.proceso),
        variables: { ...(cadena.variables || {}), ...parametros }, origen: e.origen === 'interfaz' ? 'interfaz' : 'linea_de_comandos',
    });
    return { runId: r.runId || null, estado: r.status === 'completed' ? 'ok' : 'fallo', error: r.error || null };
}));

rutas.get('/api/calendario', conCentral(async (req) => {
    const ws = req.query.workspaceId || (ctx.PROYECTO_ABIERTO ? programaciones.workspaceDe(ctx.ROOT_DIR) : null);
    return { workspaceId: ws, calendario: calendarioDeTrabajo.leer(ws) };
}));

rutas.put('/api/calendario', conCentral(async (req) => {
    const ws = req.body?.workspaceId;
    if (!ws) throw new Error('The calendar belongs to a group of projects: choose one.');
    const cal = calendarioDeTrabajo.guardar(ws, req.body?.calendario || {});
    return tras({ workspaceId: ws, calendario: cal });
}));

// ── Destinos de entrega (5.11, D6) ──────────────────────────────────────────
// Las mismas dos mitades que una fuente: la definición viaja, la carpeta de
// esta máquina va a la base de AmoxSQL. Ver server/destinos.js.
const destinosDeEntrega = require('../destinos');

rutas.get('/api/destinos', conCentral(async (req) => {
    if (req.query.workspaceId) return { destinos: await destinosDeEntrega.listar({ workspaceId: String(req.query.workspaceId) }) };
    if (!ctx.PROYECTO_ABIERTO) return { destinos: [] };
    return { destinos: await destinosDeEntrega.listar({ raiz: ctx.ROOT_DIR }) };
}));

rutas.post('/api/destinos', conCentral(async (req) => {
    const donde = destinoDeFuente(req);
    let { definicion, ubicacionAqui } = req.body || {};
    // Una carpeta dentro del proyecto, en un destino del proyecto: relativa y en
    // la definición, como las fuentes.
    if (donde.raiz && ubicacionAqui && path.isAbsolute(ubicacionAqui)) {
        const rel = path.relative(donde.raiz, ubicacionAqui);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            definicion = { ...definicion, ubicacion: rel.split(path.sep).join('/') };
            ubicacionAqui = null;
        }
    }
    const def = await destinosDeEntrega.guardar(donde, definicion);
    if (ubicacionAqui !== undefined) await destinosDeEntrega.ubicar(donde, def.nombre, ubicacionAqui || null);
    return { destino: def };
}));

rutas.delete('/api/destinos/:nombre', conCentral(async (req) => {
    await destinosDeEntrega.borrar(destinoDeFuente(req), req.params.nombre);
    return { ok: true };
}));

rutas.put('/api/destinos/:nombre/ubicacion', conCentral(async (req) => {
    return { ubicacion: await destinosDeEntrega.ubicar(destinoDeFuente(req), req.params.nombre, req.body?.ubicacion || null) };
}));

module.exports = rutas;
