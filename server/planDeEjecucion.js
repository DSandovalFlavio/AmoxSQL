/**
 * El plan de ejecución que devuelve el motor, en la forma que pinta el visor (Dec-65).
 *
 * DuckDB 2.0 cambió entero el JSON de `EXPLAIN (ANALYZE, FORMAT json)`:
 *   { io, operator: [ { type, timing, intermediate_rows, extra_info, children } ],
 *     optimizer, parser, physical_planner, planner, query, system }
 * y las fases del planificador vienen siempre (ya no hace falta `profiling_mode`, que en
 * 2.0 además dejaba el perfilado encendido en la conexión). El plan estimado
 * (`EXPLAIN (FORMAT json)`) sigue siendo una lista de { name, children, extra_info }.
 *
 * También se lee la forma de 1.x (raíz con `latency`, `children` de `operator_name`…),
 * por si una salida guardada llega de un motor anterior.
 *
 * Salida: { plan: { name, timing, cardinality, estimated_cardinality, extra_info, children },
 *           metrics: { latency, rowsReturned, cpuTime, rowsScanned, bytesRead, bytesWritten,
 *                      peakMemory, tempDirSize, rowGroupsScanned, rowGroupsToScan,
 *                      phases: { parser, planner, optimizer, physicalPlanner } } | null }
 */

const ENVOLTORIOS = new Set(['EXPLAIN_ANALYZE', 'EXPLAIN', 'RESULT_COLLECTOR', 'QUERY_ROOT']);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function estimadaDe(ei) {
    if (!ei || typeof ei !== 'object') return undefined;
    const v = ei['Estimated Cardinality'] ?? ei.estimated_cardinality;
    if (v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
}

/** Un operador de cualquiera de las formas → el nodo del visor. */
function nodo(n) {
    if (!n || typeof n !== 'object') return null;
    const ei = n.extra_info && typeof n.extra_info === 'object' ? n.extra_info : (n.extra_info || {});
    return {
        // 2.0: `type`; 1.x analyze: `operator_name` / `operator_type`; estimado: `name`.
        name: n.operator_name || n.type || n.operator_type || n.name || 'Operator',
        timing: num(n.timing) ?? num(n.operator_timing),
        cardinality: num(n.intermediate_rows) ?? num(n.operator_cardinality),
        estimated_cardinality: n.estimated_cardinality ?? estimadaDe(ei),
        extra_info: ei,
        children: Array.isArray(n.children) ? n.children.map(nodo).filter(Boolean) : [],
    };
}

/** El primer operador de verdad, debajo de los envoltorios. */
function raizReal(n) {
    let x = n;
    while (x && ENVOLTORIOS.has(x.name) && x.children && x.children.length === 1) x = x.children[0];
    return x;
}

const esDos = (raw) => raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.operator);

function normalizar(raw, modo = 'analyze') {
    if (raw == null) return { plan: null, metrics: null };

    // ── DuckDB 2.x ──────────────────────────────────────────────────────────────
    if (esDos(raw)) {
        const plan = nodo(raw.operator.length === 1 ? raw.operator[0] : { type: 'QUERY_ROOT', children: raw.operator });
        if (modo !== 'analyze') return { plan, metrics: null };
        const q = raw.query || {}, io = raw.io || {}, s = raw.system || {};
        const real = raizReal(plan);
        const metrics = {
            latency: num(q.total_time),
            rowsReturned: real ? real.cardinality : undefined,
            cpuTime: num(q.cpu_time),
            rowsScanned: num(q.total_rows_scanned),
            bytesRead: num(io.total_bytes_read),
            bytesWritten: num(io.total_bytes_written),
            peakMemory: num(s.peak_buffer_memory),
            tempDirSize: num(s.peak_temp_dir_size),
            rowGroupsScanned: num(q.total_row_groups_scanned),
            rowGroupsToScan: num(q.total_row_groups_to_scan),
            phases: {
                parser: num(raw.parser?.total_time),
                planner: num(raw.planner?.total_time),
                optimizer: num(raw.optimizer?.total_time),
                physicalPlanner: num(raw.physical_planner?.total_time),
            },
        };
        return { plan, metrics };
    }

    // ── El plan estimado (lista) y la forma de 1.x ─────────────────────────────
    let top = null, raizCruda;
    if (Array.isArray(raw)) raizCruda = raw.length === 1 ? raw[0] : { name: 'QUERY_ROOT', children: raw };
    else if (raw.operator_name || raw.operator_type) raizCruda = raw;
    else if (Array.isArray(raw.children)) { top = raw; raizCruda = raw.children[0] || raw; }
    else raizCruda = raw;

    const plan = nodo(raizCruda);
    const metrics = (modo === 'analyze' && top) ? {
        latency: num(top.latency),
        rowsReturned: num(top.rows_returned),
        cpuTime: num(top.cpu_time),
        rowsScanned: num(top.cumulative_rows_scanned),
        bytesRead: num(top.total_bytes_read),
        bytesWritten: num(top.total_bytes_written),
        peakMemory: num(top.system_peak_buffer_memory),
        tempDirSize: num(top.system_peak_temp_dir_size),
        phases: {
            planner: num(top.planner),
            optimizer: num(top.all_optimizers),
            physicalPlanner: num(top.physical_planner),
        },
    } : null;
    return { plan, metrics };
}

/** La celda que devuelve `EXPLAIN … FORMAT json` (texto o ya objeto) → objeto. */
function deFilas(filas) {
    const f = filas && filas[0];
    if (!f) return null;
    const celda = f.explain_value ?? Object.values(f).pop();
    return typeof celda === 'string' ? JSON.parse(celda) : celda;
}

module.exports = { normalizar, deFilas, raizReal };
