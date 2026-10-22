/**
 * Lo que dejó una ejecución de dbt (5.12, fase 1; Dec-34).
 *
 * dbt escribe `target/run_results.json` (estado y duración de cada nodo, y cuántas
 * filas falló cada test) y `target/manifest.json` (qué es cada nodo: su nombre, su
 * archivo, su tabla). De los dos sale un resumen para el historial, el aviso del
 * sistema y el linaje. Comprobado en la fase 0: dbt-duckdb **no da filas** por
 * modelo (`adapter_response` sólo trae `_message`) y `dbt build` sale con 0 con un
 * test en `warn`: el resumen lo cuenta aparte, para poder avisar.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/** La carpeta `target` del proyecto (o la que diga `target-path`). */
function carpetaTarget(raiz) {
    try {
        const p = yaml.load(fs.readFileSync(path.join(raiz, 'dbt_project.yml'), 'utf8')) || {};
        if (p['target-path']) return path.resolve(raiz, p['target-path']);
    } catch { /* sin proyecto legible: la de siempre */ }
    return path.join(raiz, 'target');
}

const leerJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

/** El manifiesto, recordado por su fecha de modificación (pesa cientos de KB). */
const cache = new Map();
function manifiesto(raiz) {
    const f = path.join(carpetaTarget(raiz), 'manifest.json');
    let st;
    try { st = fs.statSync(f); } catch { return null; }
    const c = cache.get(f);
    if (c && c.mtime === st.mtimeMs) return c.datos;
    const datos = leerJson(f);
    cache.set(f, { mtime: st.mtimeMs, datos });
    return datos;
}

const TIPO = { model: 'modelo', test: 'test', seed: 'seed', snapshot: 'snapshot', source: 'fuente', operation: 'operacion', unit_test: 'test' };

/**
 * Los resultados de la última ejecución, si son de ésta (`desde`: no se toma por
 * suya la de una ejecución anterior que se quedó en disco).
 * @returns {null | { generado, segundos, nodos: [...] }}
 */
function leer(raiz, { desde = null } = {}) {
    const rr = leerJson(path.join(carpetaTarget(raiz), 'run_results.json'));
    if (!rr?.results) return null;
    const generado = rr.metadata?.generated_at ? new Date(rr.metadata.generated_at) : null;
    if (desde && generado && generado.getTime() < new Date(desde).getTime() - 2000) return null;
    const m = manifiesto(raiz);
    const nodos = rr.results.map((x) => {
        const n = m?.nodes?.[x.unique_id] || m?.sources?.[x.unique_id] || null;
        const tipoDbt = x.unique_id.split('.')[0];
        const prueba = tipoDbt === 'test' || tipoDbt === 'unit_test';
        // De qué modelo es un test: su primer padre que sea un modelo.
        const de = prueba ? (n?.attached_node || n?.depends_on?.nodes?.find(d => d.startsWith('model.')) || null) : null;
        return {
            id: x.unique_id,
            nombre: n?.name || x.unique_id.split('.').slice(-1)[0],
            tipo: TIPO[tipoDbt] || tipoDbt,
            estado: x.status,                      // success · error · skipped · pass · fail · warn
            segundos: Math.round((x.execution_time || 0) * 100) / 100,
            fallos: prueba ? (x.failures ?? null) : null,
            mensaje: x.message || null,
            relacion: n?.relation_name || null,
            archivo: n?.original_file_path || null,
            de: de ? (m?.nodes?.[de]?.name || de.split('.').slice(-1)[0]) : null,
        };
    });
    return { generado: generado ? generado.toISOString() : null, segundos: rr.elapsed_time ?? null, nodos };
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * El resumen de una ejecución para `ejecuciones.resumen`, el aviso y la ficha.
 * `estado`: 'ok' si dbt terminó con 0 y nada falló; 'aviso' si terminó con 0 pero
 * algún test quedó en warn; 'fallo' si no.
 */
function resumir({ comando, codigo, ms, resultados, cancelado = false, error = null }) {
    const nodos = resultados?.nodos || [];
    const cuenta = (tipo, estados) => nodos.filter(n => n.tipo === tipo && estados.includes(n.estado)).length;
    const modelos = { ok: cuenta('modelo', ['success']), error: cuenta('modelo', ['error']), saltados: cuenta('modelo', ['skipped']) };
    const tests = { pass: cuenta('test', ['pass', 'success']), fail: cuenta('test', ['fail', 'error']), warn: cuenta('test', ['warn']) };
    const otros = { seeds: cuenta('seed', ['success']), snapshots: cuenta('snapshot', ['success']) };
    const fallidos = nodos.filter(n => ['error', 'fail', 'warn'].includes(n.estado))
        .map(n => ({ nombre: n.nombre, tipo: n.tipo, estado: n.estado, de: n.de, fallos: n.fallos, mensaje: n.mensaje ? String(n.mensaje).slice(0, 300) : null }));
    const estado = cancelado ? 'cancelada' : codigo !== 0 ? 'fallo' : tests.warn > 0 ? 'aviso' : 'ok';
    const partes = [];
    if (modelos.ok + modelos.error + modelos.saltados) partes.push(plural(modelos.ok + modelos.error, 'model', 'models') + (modelos.error ? ` (${modelos.error} failed)` : ''));
    if (tests.pass + tests.fail + tests.warn) {
        const mal = [tests.fail && `${tests.fail} failed`, tests.warn && plural(tests.warn, 'warning', 'warnings')].filter(Boolean).join(', ');
        partes.push(plural(tests.pass + tests.fail + tests.warn, 'test', 'tests') + (mal ? ` (${mal})` : ''));
    }
    if (otros.seeds) partes.push(plural(otros.seeds, 'seed', 'seeds'));
    if (otros.snapshots) partes.push(plural(otros.snapshots, 'snapshot', 'snapshots'));
    const segundos = ms != null ? (ms < 10000 ? `${(ms / 1000).toFixed(1)} s` : ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`) : '';
    const accion = String(comando || '').replace(/^dbt\s+/, '').split(/\s+--/)[0];
    let linea = [`dbt ${accion}`, partes.join(', ') || null, segundos || null].filter(Boolean).join(' · ');
    if (estado === 'fallo' && !nodos.length) linea = `dbt ${accion} failed${error ? `: ${String(error).slice(0, 200)}` : ''}`;
    if (estado === 'cancelada') linea = `dbt ${accion} was cancelled`;
    return { tipo: 'dbt', comando, estado, codigo, duracionMs: ms, modelos, tests, ...otros, fallidos, linea, nombre: `dbt ${accion}` };
}

module.exports = { carpetaTarget, manifiesto, leer, resumir };
