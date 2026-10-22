/**
 * Una ejecución de dbt es una ejecución (5.12, fase 1; Dec-34).
 *
 * Deja su fila en `ejecuciones` como un proceso de Data Flow —el mismo historial,
 * la misma ficha, el mismo aviso—, con el comando en `proceso` («dbt build
 * --select …») y su resumen (de `run_results.json`) en `resumen`. No hace falta una
 * migración: una fila de dbt se reconoce porque su proceso empieza por «dbt ».
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { correr } = require('./correr');
const resultados = require('./resultados');

// estado del resumen → estado de `ejecuciones` (un test en warn termina «ok»: el
// resumen dice «aviso» y el aviso del sistema lo cuenta).
const ESTADO = { ok: 'ok', aviso: 'ok', fallo: 'fallo', cancelada: 'cancelada' };

const esDeDbt = (proceso) => /^dbt\s/.test(String(proceso || ''));

function workspaceDelProyecto(raiz) {
    try { return JSON.parse(fs.readFileSync(path.join(raiz, '.amoxsql', 'project.json'), 'utf8'))?.workspace?.id || null; } catch { return null; }
}

/**
 * @param {object} o
 * @param {object} [o.base]        la base central (sin ella, corre sin historial)
 * @param {string} o.raiz
 * @param {string[]} o.args        después de «dbt»
 * @param {string} [o.origen]      interfaz · linea_de_comandos · programada
 * @returns {Promise<{ runId, codigo, cancelado, resumen, resultados }>}
 */
async function ejecutarDbt({ base = null, dbManager = null, raiz, args, entorno, env, origen = 'interfaz', programacionId = null, prevista = null, alLinea, senal }) {
    const runId = crypto.randomUUID();
    const comandoProvisional = ['dbt', ...args].join(' ');
    const anotar = async (sql, params) => { if (base?.estaAbierta?.()) await base.query(sql, params).catch((e) => console.warn('[dbt] historial:', e.message)); };
    await anotar(
        `INSERT INTO ejecuciones (id, proceso, proyecto, workspace_id, origen, inicio, estado, programacion_id, prevista)
         VALUES ($1, $2, $3, $4, $5, current_timestamp, 'en_curso', $6, $7)`,
        [runId, comandoProvisional, raiz, workspaceDelProyecto(raiz), origen, programacionId, prevista ? new Date(prevista).toISOString() : null],
    );
    let r;
    try {
        r = await correr({ raiz, args, entorno, dbManager, env, alLinea, senal });
    } catch (e) {
        r = { codigo: 1, cancelado: false, ms: 0, inicio: new Date(), comando: comandoProvisional, error: e.message };
        alLinea?.({ tipo: 'stderr', texto: e.message });
    }
    const res = resultados.leer(raiz, { desde: r.inicio });
    const resumen = resultados.resumir({ comando: r.comando, codigo: r.codigo, ms: r.ms, resultados: res, cancelado: r.cancelado, error: r.error });
    // Los pasos, para la ficha (como los de un proceso de Data Flow).
    resumen.nodos = (res?.nodos || []).slice(0, 500).map(n => ({ nombre: n.nombre, tipo: n.tipo, estado: n.estado, segundos: n.segundos, mensaje: n.mensaje ? String(n.mensaje).slice(0, 300) : null }));
    const error = resumen.estado === 'fallo'
        ? (r.error || resumen.fallidos.filter(f => f.estado !== 'warn').map(f => `${f.nombre}: ${f.mensaje || f.estado}`).join('\n') || `dbt ended with code ${r.codigo}`).slice(0, 4000)
        : null;
    await anotar(
        `UPDATE ejecuciones SET proceso = $2, estado = $3, fin = current_timestamp, error = $4, resumen = $5 WHERE id = $1`,
        [runId, r.comando, ESTADO[resumen.estado] || 'fallo', error, JSON.stringify({ ...resumen, runId })],
    );
    return { runId, codigo: r.codigo, cancelado: r.cancelado, resumen: { ...resumen, runId }, resultados: res, noArranco: r.noArranco };
}

module.exports = { ejecutarDbt, esDeDbt };
