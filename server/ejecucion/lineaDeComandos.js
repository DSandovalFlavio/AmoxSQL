/**
 * El lado del servidor de la línea de comandos (A3, fase 4 del plan).
 *
 *     AmoxSQL.exe run <proceso.sqlchain> --project <ruta> [--param nombre=valor]…
 *
 * El proceso principal lee los argumentos y, por parentPort, entrega aquí una
 * orden ya resuelta: rutas absolutas, parámetros como objeto y un id. Aquí se
 * comprueba, se corre con `ejecutarProceso` y se deja:
 *
 *   <home>/registros/<id>.log     — lo que pasó, legible, uno por ejecución.
 *   <home>/ejecuciones/<id>.json  — el resultado, para quien lanzó la orden.
 *                                   Se escribe de una vez (temporal + rename):
 *                                   quien lo espera nunca lee medio archivo.
 *
 * Los códigos de salida (4.4):
 *   0 bien · 1 el proceso falló · 2 argumentos inválidos · 3 falta una
 *   credencial · 4 la aplicación abierta no contestó · 5 no existe el proyecto
 *   o el proceso. El 2 y el 4 los decide el proceso principal; el 5 también,
 *   pero aquí se vuelve a mirar, porque entre medias pasa tiempo.
 */
const fs = require('fs');
const path = require('path');
const chainExecutor = require('../ChainExecutor');
const manifiesto = require('../manifiesto');
const secretos = require('../secretos');
const { ejecutarProceso } = require('./ejecutarProceso');
const { CODIGO, rutaDelResultado, rutaDelRegistro, escribirJson } = require('./ordenes');

const hora = () => new Date().toISOString().replace('T', ' ').slice(0, 23);

/** Una línea legible por evento del ejecutor. */
function lineaDeEvento(e) {
    const nombre = e.nodeLabel || e.nodeId || '';
    switch (e.type) {
        case 'node_start': return `  > ${nombre} (${e.nodeType})`;
        case 'node_complete': {
            const detalle = [
                e.rowCount != null ? `${e.rowCount} rows` : null,
                e.path ? `→ ${e.path}` : null,
                e.resultType === 'disabled' ? 'disabled, passed through' : null,
            ].filter(Boolean).join(', ');
            return `  ✓ ${nombre} — ${e.durationMs} ms${detalle ? `, ${detalle}` : ''}`;
        }
        case 'node_error': return `  ✗ ${nombre} — ${e.error}`;
        case 'run_paused': return `  ‖ paused at checkpoint ${e.pausedAtNode}`;
        default: return null;
    }
}

/**
 * @param orden { id, proceso, proyecto, parametros, lanzada }
 * @returns {Promise<object>} el resultado, también escrito en su archivo
 */
async function atender(orden, { dbManager, config }) {
    const { id } = orden;
    const inicio = Date.now();
    const registro = rutaDelRegistro(id);
    const lineas = [];
    const anotar = (texto) => {
        lineas.push(texto);
        try { fs.appendFileSync(registro, texto + '\n'); } catch { /* sin registro, pero se corre */ }
    };

    const terminar = (codigo, extra = {}) => {
        const fin = Date.now();
        const resultado = {
            id,
            codigo,
            estado: codigo === 0 ? 'ok' : 'fallo',
            proceso: orden.proceso,
            proyecto: orden.proyecto,
            parametros: orden.parametros || {},
            inicio: new Date(inicio).toISOString(),
            fin: new Date(fin).toISOString(),
            duracionMs: fin - inicio,
            registro,
            // Si la atendió la aplicación que ya estaba abierta, o este arranque sin ventana.
            entregada: !!orden.entregada,
            ...extra,
        };
        anotar(`${hora()}  ${codigo === 0 ? 'Finished' : 'Failed'} (exit code ${codigo}) in ${((fin - inicio) / 1000).toFixed(1)} s${extra.mensaje ? ` — ${extra.mensaje}` : ''}`);
        try { escribirJson(rutaDelResultado(id), resultado); } catch (e) { console.error('[CLI] No se pudo escribir el resultado:', e.message); }
        return resultado;
    };

    anotar(`${hora()}  AmoxSQL run ${orden.proceso}`);
    anotar(`${hora()}  Project: ${orden.proyecto}`);
    if (orden.parametros && Object.keys(orden.parametros).length) {
        anotar(`${hora()}  Parameters: ${Object.entries(orden.parametros).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }

    // ── existe lo que se pide ────────────────────────────────────────────────
    if (!fs.existsSync(orden.proyecto) || !fs.statSync(orden.proyecto).isDirectory()) {
        return terminar(CODIGO.noExiste, { mensaje: `The project folder does not exist: ${orden.proyecto}` });
    }
    if (!fs.existsSync(orden.proceso)) {
        return terminar(CODIGO.noExiste, { mensaje: `The process does not exist: ${orden.proceso}` });
    }

    let cadena;
    try {
        cadena = JSON.parse(fs.readFileSync(orden.proceso, 'utf8'));
    } catch (e) {
        return terminar(CODIGO.fallo, { mensaje: `The process could not be read: ${e.message}` });
    }
    const validacion = chainExecutor.validate(cadena, orden.proyecto);
    if (!validacion.valid) {
        return terminar(CODIGO.fallo, { mensaje: `The process is not valid: ${validacion.errors.join('; ')}` });
    }

    // ── las credenciales: las del manifiesto del proyecto y las de este proceso
    const necesita = new Map();
    for (const c of manifiesto.requisitos(orden.proyecto).credenciales) necesita.set(c.nombre, c);
    for (const c of manifiesto.credencialesDeCadena(cadena)) necesita.set(c.nombre, c);
    const faltan = [...necesita.values()].filter(c => !secretos.existe(c.nombre, config));
    if (faltan.length) {
        return terminar(CODIGO.credencial, {
            mensaje: `Missing credential${faltan.length > 1 ? 's' : ''} on this machine: ${faltan.map(c => c.nombre).join(', ')}. Add ${faltan.length > 1 ? 'them' : 'it'} in Settings → Credentials.`,
            faltan: faltan.map(c => c.nombre),
        });
    }

    // ── correr ───────────────────────────────────────────────────────────────
    const relativo = path.relative(orden.proyecto, orden.proceso);
    const chainFile = relativo.startsWith('..') || path.isAbsolute(relativo) ? orden.proceso : relativo;
    const variables = { ...(cadena.variables || {}), ...(orden.parametros || {}) };
    const pasos = [];
    const oyente = (e) => {
        const l = lineaDeEvento(e);
        if (l) anotar(`${hora()}${l}`);
        if (e.type === 'node_complete') pasos.push({ nodo: e.nodeLabel || e.nodeId, estado: 'ok', ms: e.durationMs, filas: e.rowCount ?? null });
        if (e.type === 'node_error') pasos.push({ nodo: e.nodeLabel || e.nodeId, estado: 'fallo', ms: e.durationMs, error: e.error });
    };

    try {
        const r = await ejecutarProceso({
            dbManager, chainDef: cadena, proyecto: orden.proyecto, chainFile,
            variables, origen: 'linea_de_comandos', oyente,
        });
        const extra = { runId: r.runId, base: r.base, pasos };
        if (r.status === 'completed') return terminar(CODIGO.ok, extra);
        if (r.status === 'paused') {
            return terminar(CODIGO.fallo, { ...extra, mensaje: `Paused at checkpoint "${r.pausedAtNode}": resume it from Data Flow's history` });
        }
        return terminar(CODIGO.fallo, { ...extra, mensaje: r.error || `The process ended as ${r.status}` });
    } catch (e) {
        return terminar(CODIGO.fallo, { pasos, mensaje: e.message });
    }
}

module.exports = { atender };
