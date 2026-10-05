/**
 * El resumen de una ejecución (5.11, D5 y D2): lo que se le cuenta a quien no
 * miró el proceso. Sale de lo que el historial ya guarda paso a paso
 * (`amoxsql_chains.node_runs`), sin anotar nada nuevo:
 *
 *   - qué leyó: los pasos que traen datos de fuera (importar, una fuente, un
 *     bucket, una dirección web);
 *   - qué dejó: los archivos que escribió (Export, Excel, Publish, un gráfico,
 *     un informe), con su ruta y si siguen ahí;
 *   - si falló, en qué paso y por qué;
 *   - una línea para un aviso: «3 files read, 1 saved · 4 s».
 */
const fs = require('fs');
const path = require('path');
const historial = require('./historial');

const LEEN = new Set(['import_file', 'import_folder', 'fuente', 'bucket_read', 'gsheet_read', 'http_fetch']);
const ESTADO = { completed: 'ok', failed: 'fallo', cancelled: 'cancelada', paused: 'pausada', running: 'en_curso' };

const json = (t) => { try { return t ? JSON.parse(t) : {}; } catch { return {}; } };
const ms = (a, b) => (a && b ? Math.max(0, new Date(b) - new Date(a)) : null);

function duracionLegible(m) {
    if (m == null) return '';
    if (m < 1000) return `${m} ms`;
    if (m < 60000) return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} s`;
    const min = Math.floor(m / 60000), s = Math.round((m % 60000) / 1000);
    return `${min} min${s ? ` ${s} s` : ''}`;
}

/**
 * @param fuentes { base, dbManager } — dónde buscar la ejecución (como `historial.leer`)
 * @param proyecto la carpeta del proyecto, para las rutas relativas
 */
async function resumir({ base, dbManager, runId, proyecto }) {
    const { run, nodeRuns } = await historial.leer({ base, dbManager, runId });
    if (!run) return null;
    const pasos = [...nodeRuns].sort((a, b) => String(a.started_at || '').localeCompare(String(b.started_at || '')));
    const leidos = [];
    const guardados = [];
    let fallo = null;
    for (const p of pasos) {
        const s = json(p.result_summary);
        const paso = p.node_label || p.node_id;
        if (p.status === 'failed' && !fallo) fallo = { paso, error: p.error_message || 'failed' };
        if (p.status !== 'success') continue;
        if (LEEN.has(p.node_type) && s.resultType !== 'disabled') {
            leidos.push({ paso, tabla: s.table || null, filas: s.rowCount ?? null, de: s.source || s.sourcePath || s.folder || s.url || (p.node_type === 'fuente' ? `fuentes."${s.table}"` : null) });
        }
        const ruta = p.result_type === 'file_exported' || p.result_type === 'chart_created' || p.result_type === 'report_created' ? (s.path || s.outputPath) : null;
        if (ruta && !/^[a-z][a-z0-9+.-]*:\/\//i.test(ruta)) {
            const abs = path.isAbsolute(ruta) ? path.normalize(ruta) : path.resolve(proyecto || '.', ruta);
            let st = null;
            try { st = fs.statSync(abs); } catch { /* ya no está */ }
            guardados.push({ paso, ruta: abs, existe: !!st, bytes: st?.size ?? null, filas: s.rowCount ?? null, hojas: s.sheets || null });
        } else if (ruta) {
            guardados.push({ paso, ruta, existe: null, bytes: null, filas: s.rowCount ?? null, remoto: true });
        }
    }
    if (!fallo && run.status === 'failed') fallo = { paso: run.failed_node_id || null, error: 'failed' };
    const duracionMs = ms(run.started_at, run.finished_at);
    const estado = ESTADO[run.status] || run.status;
    const partes = [];
    if (leidos.length) partes.push(`${leidos.length} file${leidos.length === 1 ? '' : 's'} read`);
    if (guardados.length) partes.push(`${guardados.length} saved`);
    const cuenta = partes.join(', ');
    const nombre = run.chain_name || path.basename(run.chain_file || '').replace(/\.sqlchain$/i, '') || 'Process';
    const linea = estado === 'fallo'
        ? `${nombre} failed${fallo?.paso ? ` at "${fallo.paso}"` : ''}: ${String(fallo?.error || '').split('\n')[0].slice(0, 160)}`
        : `${nombre} · ${[cuenta || 'finished', duracionLegible(duracionMs)].filter(Boolean).join(' · ')}`;
    return {
        runId, estado, nombre, proceso: run.chain_file, inicio: run.started_at, fin: run.finished_at,
        duracionMs, leidos, guardados, fallo, pasos: pasos.length, linea,
    };
}

module.exports = { resumir, duracionLegible };
