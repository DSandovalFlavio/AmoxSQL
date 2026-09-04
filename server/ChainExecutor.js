/**
 * AmoxSQL — Execution Chain Engine
 *
 * Executes .sqlchain DAG workflows using topological ordering.
 * Supports full runs, partial runs (from/to a node), and checkpoint pausing.
 * Results are persisted via ChainPersistence.
 */
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const chainPersistence = require('./ChainPersistence');
const aiManager = require('./AiManager');
const { detectResultType } = require('./_sqlClassify');

/**
 * Node types that produce a *derived intermediate* table — plumbing between
 * source and sink. Their physical output is materialized under a deterministic,
 * chain-scoped name (see physName) so two different chains using the same default
 * table name (e.g. "filtered_data") never collide, and intermediates don't
 * pollute the user's main namespace. Sources (import_*, http_fetch) and explicit
 * outputs (create_table, rename_table) keep writing to their user-facing name.
 */
const DERIVED_NODE_TYPES = new Set([
    'merge_tables', 'join_tables', 'filter', 'group_aggregate', 'select_columns',
    'deduplicate', 'add_column', 'sort', 'sample', 'pivot', 'unpivot',
    'type_cast', 'window_functions', 'clean', 'date_ops', 'flatten',
]);

/**
 * Derived nodes that are safe + beneficial to materialize as a lazy TEMP VIEW
 * instead of a TABLE: pure deterministic projections/filters. A downstream filter
 * then pushes down into the source scan. EXCLUDED on purpose: deduplicate (rowid),
 * sort (view order isn't guaranteed), sample (non-deterministic), aggregations /
 * reshapes (natural materialization points), type_cast (EXCLUDE fallback path).
 * A view-eligible node still materializes as a TABLE when it has fan-out > 1.
 */
const VIEW_ELIGIBLE_NODE_TYPES = new Set([
    'filter', 'select_columns', 'add_column', 'clean', 'date_ops',
]);

class ChainExecutor extends EventEmitter {
    constructor() {
        super();
        // Active runs map: runId -> { cancelled: boolean }
        this.activeRuns = new Map();
        // SSE subscribers: runId -> res[]
        this.sseClients = new Map();
    }

    // --- SSE helpers ---

    subscribeSSE(runId, res) {
        if (!this.sseClients.has(runId)) this.sseClients.set(runId, []);
        this.sseClients.get(runId).push(res);
    }

    unsubscribeSSE(runId, res) {
        const clients = this.sseClients.get(runId) || [];
        this.sseClients.set(runId, clients.filter(c => c !== res));
    }

    emitLog(runId, event) {
        const clients = this.sseClients.get(runId) || [];
        const data = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
        for (const res of clients) {
            try { res.write(`data: ${data}\n\n`); } catch {}
        }
    }

    closeSSE(runId) {
        const clients = this.sseClients.get(runId) || [];
        for (const res of clients) {
            try { res.write('data: {"type":"done"}\n\n'); res.end(); } catch {}
        }
        this.sseClients.delete(runId);
    }

    // --- Path helpers ---

    /**
     * Fase 6 — picks xAxisKey/yAxisKeys for a Chart/Report node, honoring any
     * explicit config first. Uses DESCRIBE (cheap — no rows materialized) to
     * read the query's column names/types, then falls back to the first
     * column as the axis and the first numeric column as the value — the
     * same auto-detect heuristic DataVisualizer.jsx already applies client
     * side when a chart is opened with no axes configured, so a chart the
     * pipeline writes unattended looks the same as one a person would have
     * picked by hand on first open.
     */
    async resolveChartAxes(dbManager, query, config) {
        if (config.xAxisKey && config.yAxisKeys) {
            const yAxisKeys = Array.isArray(config.yAxisKeys)
                ? config.yAxisKeys
                : String(config.yAxisKeys).split(',').map(s => s.trim()).filter(Boolean);
            if (yAxisKeys.length > 0) return { xAxisKey: config.xAxisKey, yAxisKeys };
        }
        const cols = await dbManager.query(`DESCRIBE ${query}`);
        const numericTypeRe = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL|REAL)/i;
        const names = cols.map(c => c.column_name);
        const numeric = cols.filter(c => numericTypeRe.test(c.column_type || '')).map(c => c.column_name);
        const xAxisKey = config.xAxisKey || names[0] || '';
        const fallbackY = numeric.find(n => n !== xAxisKey) || names.find(n => n !== xAxisKey) || names[0] || '';
        const yAxisKeys = config.yAxisKeys
            ? (Array.isArray(config.yAxisKeys) ? config.yAxisKeys : String(config.yAxisKeys).split(',').map(s => s.trim()).filter(Boolean))
            : (fallbackY ? [fallbackY] : []);
        return { xAxisKey, yAxisKeys };
    }

    resolvePath(projectPath, filePath) {
        if (!filePath) return '';
        // Already absolute
        if (path.isAbsolute(filePath)) return filePath.replace(/\\/g, '/');
        return path.resolve(projectPath, filePath).replace(/\\/g, '/');
    }

    async ensureSpatialExtension(dbManager) {
        try {
            await dbManager.query("INSTALL spatial; LOAD spatial;");
        } catch {
            // Already installed or unavailable — do not throw
        }
    }

    // --- Topological Sort ---

    /**
     * Compute topological layers from nodes + edges.
     * Returns array of arrays: each inner array is a set of node IDs that can execute in parallel.
     */
    computeLayers(nodes, edges) {
        const nodeIds = new Set(nodes.map(n => n.id));
        const inDegree = new Map();
        const adjacency = new Map();

        for (const id of nodeIds) {
            inDegree.set(id, 0);
            adjacency.set(id, []);
        }

        for (const edge of edges) {
            if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
                adjacency.get(edge.source).push(edge.target);
                inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
            }
        }

        const layers = [];
        let queue = [...nodeIds].filter(id => inDegree.get(id) === 0);

        while (queue.length > 0) {
            layers.push([...queue]);
            const nextQueue = [];
            for (const id of queue) {
                for (const neighbor of adjacency.get(id)) {
                    inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                    if (inDegree.get(neighbor) === 0) {
                        nextQueue.push(neighbor);
                    }
                }
            }
            queue = nextQueue;
        }

        // Cycle detection
        const processedCount = layers.reduce((sum, layer) => sum + layer.length, 0);
        if (processedCount < nodeIds.size) {
            throw new Error('Cycle detected in the execution chain. Please check your dependencies.');
        }

        return layers;
    }

    // --- Subgraph Computation ---

    getDownstreamNodes(nodeId, edges, allNodeIds) {
        const reachable = new Set([nodeId]);
        const adjacency = new Map();
        for (const id of allNodeIds) adjacency.set(id, []);
        for (const e of edges) {
            if (adjacency.has(e.source)) adjacency.get(e.source).push(e.target);
        }

        const queue = [nodeId];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const next of (adjacency.get(current) || [])) {
                if (!reachable.has(next)) {
                    reachable.add(next);
                    queue.push(next);
                }
            }
        }
        return reachable;
    }

    getUpstreamNodes(nodeId, edges, allNodeIds) {
        const reachable = new Set([nodeId]);
        const reverseAdj = new Map();
        for (const id of allNodeIds) reverseAdj.set(id, []);
        for (const e of edges) {
            if (reverseAdj.has(e.target)) reverseAdj.get(e.target).push(e.source);
        }

        const queue = [nodeId];
        while (queue.length > 0) {
            const current = queue.shift();
            for (const next of (reverseAdj.get(current) || [])) {
                if (!reachable.has(next)) {
                    reachable.add(next);
                    queue.push(next);
                }
            }
        }
        return reachable;
    }

    // --- Validation ---

    validate(chainDef, projectPath) {
        const errors = [];
        const { nodes = [], edges = [] } = chainDef;

        if (nodes.length === 0) {
            errors.push('Chain has no nodes');
            return { valid: false, errors };
        }

        // Check for cycles
        try {
            this.computeLayers(nodes, edges);
        } catch (e) {
            errors.push(e.message);
        }

        // Check file references
        for (const node of nodes) {
            if (node.type === 'sql_file' && node.config?.filePath) {
                const fullPath = path.resolve(projectPath, node.config.filePath);
                if (!fs.existsSync(fullPath)) {
                    errors.push(`Node "${node.label || node.id}": file not found — ${node.config.filePath}`);
                }
            }
            if (node.type === 'import_file' && node.config?.sourcePath) {
                const fullPath = path.resolve(projectPath, node.config.sourcePath);
                if (!fs.existsSync(fullPath)) {
                    errors.push(`Node "${node.label || node.id}": source file not found — ${node.config.sourcePath}`);
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    // --- Result Type Detection ---
    // Delegates to the shared classifier (server/_sqlClassify.js) so the editor's
    // "run as script" summary and chain node results speak the same language.

    detectResultType(sql) {
        return detectResultType(sql);
    }

    // --- Output Context ---

    isDerivedNode(type) {
        return DERIVED_NODE_TYPES.has(type);
    }

    /**
     * Recursively substitute ${var} placeholders in every string value of a
     * config object/array, using the provided variables map. Non-string leaves
     * are left untouched; unknown ${...} placeholders are left intact (so they
     * surface as a clear error rather than silently becoming empty).
     */
    applyVars(value, vars) {
        if (typeof value === 'string') {
            return value.replace(/\$\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
        }
        if (Array.isArray(value)) return value.map(v => this.applyVars(v, vars));
        if (value && typeof value === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(value)) out[k] = this.applyVars(v, vars);
            return out;
        }
        return value;
    }

    /**
     * Small, stable, dependency-free hash of a string → short base36 token.
     * Used to scope intermediate table names to a specific chain file.
     */
    hashString(str) {
        let h = 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
        }
        return (h >>> 0).toString(36);
    }

    /**
     * Deterministic physical name for a derived node's materialized output,
     * scoped to the chain. Same (chainFile, nodeId) → same name across runs,
     * so partial runs and checkpoint resume can resolve upstream outputs left
     * behind by a previous run. Re-running overwrites the same name (CREATE OR
     * REPLACE), so there is no unbounded growth.
     */
    physName(chainFile, nodeId) {
        const scope = chainFile ? this.hashString(chainFile) : 'adhoc';
        const safeNode = String(nodeId).replace(/[^a-zA-Z0-9_]/g, '_');
        return `__chain_${scope}_${safeNode}`;
    }

    /**
     * Build the materialization prefix for a derived node: a lazy TEMP VIEW when the
     * node is view-eligible and has fan-out ≤ 1, otherwise a TABLE. Drops the opposite
     * object kind first so a stale TABLE/VIEW from a prior run (or a different fan-out)
     * can't shadow the new one. `ctx.fanout` is a Map nodeId → downstream edge count.
     */
    async materializeTarget(dbManager, node, ctx, name) {
        const eligible = VIEW_ELIGIBLE_NODE_TYPES.has(node.type);
        const fan = (ctx && ctx.fanout) ? (ctx.fanout.get(node.id) || 0) : 0;
        const asView = eligible && fan <= 1;
        // Drop the opposite object kind first (separate single statement). DROP … IF EXISTS
        // is type-tolerant in DuckDB (no-op on the wrong kind), so this is safe and prevents
        // a stale TABLE/VIEW from shadowing the new one when a node toggles kind across runs.
        try {
            await dbManager.query(asView ? `DROP TABLE IF EXISTS "${name}"` : `DROP VIEW IF EXISTS "${name}"`);
        } catch { /* tolerant */ }
        return asView ? `CREATE OR REPLACE TEMP VIEW "${name}"` : `CREATE OR REPLACE TABLE "${name}"`;
    }

    /**
     * The output reference a node *would* produce, derived statically (without
     * executing it). Used to resolve upstream parents that were not part of the
     * current (partial) run — e.g. when resuming after a checkpoint or running
     * "from here". Returns null when the output can't be known without running
     * (sql_inline/sql_file, etc.).
     */
    staticOutputRef(node, chainFile) {
        if (!node) return null;
        const c = node.config || {};
        if (this.isDerivedNode(node.type)) {
            return { table: this.physName(chainFile, node.id) };
        }
        switch (node.type) {
            case 'table_ref':     return c.tableName ? { table: c.tableName } : null;
            case 'import_file':
            case 'import_folder': return { table: c.tableName || 'imported_data' };
            case 'http_fetch':    return { table: c.tableName || 'fetched_data' };
            case 'bucket_read':   return { table: c.tableName || 'cloud_data' };
            case 'gsheet_read':   return { table: c.tableName || 'gsheet_data' };
            case 'ai_enrich':     return { table: this.physName(chainFile, node.id) };
            case 'create_table':  return c.tableName ? { table: c.tableName } : null;
            case 'rename_table':  return c.newName ? { table: c.newName } : null;
            default:              return null;
        }
    }

    /**
     * Resolve the output references from a node's upstream parents.
     * Parents executed in this run are read from nodeOutputs; parents NOT in this
     * run (partial run / checkpoint resume) fall back to their deterministic
     * static output name, so the materialized table left by a previous run is
     * found. For a full run every parent is in nodeOutputs, so behavior is
     * identical to before.
     */
    resolveUpstreamOutputs(nodeId, fullParentMap, nodeOutputs, nodeMap, chainFile) {
        const parents = fullParentMap.get(nodeId) || [];
        const outputs = [];
        for (const pid of parents) {
            let out = nodeOutputs.get(pid);
            if (!out) out = this.staticOutputRef(nodeMap?.get(pid), chainFile);
            if (out) outputs.push(out);
        }
        return outputs;
    }

    /**
     * Drop all intermediate tables materialized for a given chain
     * (the deterministic "__chain_<scope>_*" namespace). Exposed for an explicit
     * "clean intermediates" action; not run automatically so partial runs and
     * checkpoint resume keep working across separate run() invocations.
     */
    async cleanupChainArtifacts(dbManager, chainFile) {
        const prefix = `__chain_${chainFile ? this.hashString(chainFile) : 'adhoc'}_`;
        let dropped = 0;
        try {
            const tables = await dbManager.query('SELECT table_name FROM information_schema.tables');
            for (const row of (tables || [])) {
                const t = row.table_name;
                if (t && t.startsWith(prefix)) {
                    // Intermediates may be a TABLE or a TEMP VIEW — drop whichever exists.
                    try { await dbManager.query(`DROP VIEW IF EXISTS "${t}"`); } catch {}
                    try { await dbManager.query(`DROP TABLE IF EXISTS "${t}"`); } catch {}
                    dropped++;
                }
            }
        } catch {}
        return { dropped };
    }

    /**
     * Build a SELECT query from an upstream output reference.
     */
    outputToQuery(output) {
        if (!output) return null;
        if (output.table) {
            // Honor an explicit schema (e.g. a Table Reference to a non-main table)
            const ref = output.schema ? `"${output.schema}"."${output.table}"` : `"${output.table}"`;
            return `SELECT * FROM ${ref}`;
        }
        if (output.view) return `SELECT * FROM "${output.view}"`;
        if (output.query) return output.query;
        return null;
    }

    /**
     * Extract the output reference from a node's execution result.
     * This is stored in nodeOutputs so downstream nodes can use it.
     */
    extractOutputRef(node, sql, resultType, resultSummary, upstreamOutputs = []) {
        // For table_ref, the output is the referenced table (carry the resolved schema)
        if (node.type === 'table_ref') {
            return { schema: resultSummary?.schema || null, table: resultSummary?.table || node.config?.tableName || null };
        }

        // Assert, checkpoint, chart and report are pass-through: none of them
        // create a new table, so downstream nodes should still see whatever
        // was upstream of them.
        if (node.type === 'assert' || node.type === 'checkpoint' || node.type === 'chart' || node.type === 'report') {
            if (resultSummary.table) return { table: resultSummary.table };
            return upstreamOutputs[0] || null;
        }

        // For import nodes, the output is the created table
        if (resultType === 'table_created' && resultSummary.table) {
            return { table: resultSummary.table };
        }

        // For CREATE TABLE/VIEW, extract the name
        if (resultType === 'table_created' && resultSummary.table) {
            return { table: resultSummary.table };
        }
        if (resultType === 'view_created' && resultSummary.view) {
            return { view: resultSummary.view };
        }

        // For sql_file/sql_inline that do CREATE TABLE/VIEW, extract from detected details
        if (resultSummary.table && (resultType === 'table_created' || resultType === 'rows_inserted')) {
            return { table: resultSummary.table };
        }
        if (resultSummary.view) {
            return { view: resultSummary.view };
        }

        // For SELECT queries, wrap as subquery reference
        if (resultType === 'query_result' && sql) {
            return { query: sql.replace(/;\s*$/, '') };
        }

        // For merge_tables, the output is the merged table
        if (node.type === 'merge_tables' && resultSummary.table) {
            return { table: resultSummary.table };
        }

        return null;
    }

    /**
     * Build the SELECT body for a Date/Time node from its operations list. Each op
     * adds a column (replaces in place when alias === source column, via EXCLUDE).
     * Uses TRY_* so invalid values become NULL instead of failing. `fromSrc` is the
     * already-parenthesized source (e.g. "(SELECT …)").
     */
    dateOpsSelect(config, fromSrc) {
        const ops = config.operations || [];
        const exprs = [];
        const replaced = [];
        const esc = (s) => String(s || '').replace(/'/g, "''");
        for (const o of ops) {
            if (!o.column || !o.op) continue;
            const col = `"${o.column}"`;
            const alias = (o.alias && o.alias.trim()) ? o.alias.trim() : `${o.column}_${o.op}`;
            let expr;
            switch (o.op) {
                case 'parse':    expr = o.format ? `TRY_STRPTIME(${col}, '${esc(o.format)}')` : `TRY_CAST(${col} AS TIMESTAMP)`; break;
                case 'extract':  expr = `date_part('${esc(o.part || 'year')}', ${col})`; break;
                case 'truncate': expr = `date_trunc('${esc(o.unit || 'month')}', ${col})`; break;
                case 'format':   expr = `strftime(${col}, '${esc(o.format || '%Y-%m-%d')}')`; break;
                case 'add':      expr = `(${col} + (${parseInt(o.amount) || 0} * INTERVAL '1 ${esc(o.unit || 'day')}'))`; break;
                case 'diff':     expr = `date_diff('${esc(o.unit || 'day')}', ${col}, "${o.column2 || o.column}")`; break;
                case 'age':      expr = `date_diff('${esc(o.unit || 'day')}', ${col}, current_date)`; break;
                default: continue;
            }
            exprs.push(`${expr} AS "${alias}"`);
            if (alias === o.column) replaced.push(col);
        }
        if (exprs.length === 0) return `SELECT * FROM ${fromSrc} AS _src`;
        const exclude = replaced.length ? ` EXCLUDE (${[...new Set(replaced)].join(', ')})` : '';
        return `SELECT *${exclude}, ${exprs.join(', ')} FROM ${fromSrc} AS _src`;
    }

    /**
     * Build the SELECT for a Flatten node: 'fields' extracts JSON paths to columns,
     * 'explode' unnests an array/list column into rows. `fromSrc` is parenthesized.
     */
    flattenSelect(config, fromSrc) {
        const col = `"${config.column}"`;
        const esc = (s) => String(s || '').replace(/'/g, "''");
        if (config.mode === 'explode') {
            const alias = (config.alias && config.alias.trim()) ? config.alias.trim() : `${config.column}_item`;
            return `SELECT *, UNNEST(${col}) AS "${alias}" FROM ${fromSrc} AS _src`;
        }
        const paths = (config.paths || []).filter(p => p && p.path);
        if (paths.length === 0) return `SELECT * FROM ${fromSrc} AS _src`;
        const exprs = paths.map(p => {
            const alias = (p.alias && p.alias.trim()) ? p.alias.trim() : String(p.path).replace(/[^a-zA-Z0-9_]/g, '_');
            return `json_extract_string(${col}, '${esc(p.path)}') AS "${alias}"`;
        });
        return `SELECT *, ${exprs.join(', ')} FROM ${fromSrc} AS _src`;
    }

    /**
     * Resolve a join node's key pairs. Prefers the new composite `keys: [{left,right}]`,
     * falls back to the legacy single `leftKey`/`rightKey` for older .sqlchain files.
     */
    joinKeys(config) {
        if (config.keys && config.keys.length) return config.keys.filter(k => k && k.left && k.right);
        if (config.leftKey && config.rightKey) return [{ left: config.leftKey, right: config.rightKey }];
        return [];
    }

    /**
     * Build one aggregation SELECT expression (with alias) for a group_aggregate node.
     * Handles COUNT(*), COUNT DISTINCT, PERCENTILE, STRING_AGG and plain funcs
     * (SUM/AVG/MIN/MAX/MEDIAN/STDDEV/VAR_SAMP/LIST/FIRST/LAST).
     */
    aggExpr(a) {
        const func = a.func || 'COUNT';
        const col = a.column;
        const alias = a.alias || `${String(func).toLowerCase()}_${col}`;
        let e;
        if (func === 'COUNT' && col === '*') e = 'COUNT(*)';
        else if (func === 'COUNT_DISTINCT') e = `COUNT(DISTINCT "${col}")`;
        else if (func === 'PERCENTILE') e = `PERCENTILE_CONT(${parseFloat(a.percentile) || 0.5}) WITHIN GROUP (ORDER BY "${col}")`;
        else if (func === 'STRING_AGG') e = `STRING_AGG("${col}", '${String(a.sep || ', ').replace(/'/g, "''")}')`;
        else e = `${func}("${col}")`;
        return `${e} AS "${alias === '*' ? 'count' : alias}"`;
    }

    // --- Cloud / external source helpers (reuse the app's existing config & extensions) ---

    /** Load httpfs + apply S3/GCS credentials from config (mirrors /api/export/cloud). */
    async prepareCloud(dbManager, provider) {
        const config = aiManager.getConfig();
        await dbManager.query('INSTALL httpfs; LOAD httpfs;');
        if (provider === 'gcs') {
            const gcs = config.gcsConfig || {};
            await dbManager.query(`SET s3_endpoint='storage.googleapis.com'`);
            await dbManager.query(`SET s3_url_style='path'`);
            if (gcs.accessKeyId) await dbManager.query(`SET s3_access_key_id='${gcs.accessKeyId}'`);
            if (gcs.secretKey) await dbManager.query(`SET s3_secret_access_key='${gcs.secretKey}'`);
        } else {
            const s3 = config.s3Config || {};
            if (s3.accessKeyId) await dbManager.query(`SET s3_access_key_id='${s3.accessKeyId}'`);
            if (s3.secretKey) await dbManager.query(`SET s3_secret_access_key='${s3.secretKey}'`);
            if (s3.region) await dbManager.query(`SET s3_region='${s3.region}'`);
            if (s3.endpoint) await dbManager.query(`SET s3_endpoint='${s3.endpoint}'`);
        }
    }

    /** Ensure the DuckDB gsheets extension + service-account secret (mirrors ensureGSheetsReady). */
    async ensureGSheets(dbManager) {
        try {
            const exts = await dbManager.query("SELECT installed, loaded FROM duckdb_extensions() WHERE extension_name = 'gsheets'");
            const ext = exts[0];
            if (!ext || !ext.installed) await dbManager.query('INSTALL gsheets FROM community');
            if (!ext || !ext.loaded) await dbManager.query('LOAD gsheets');
        } catch (e) { if (!String(e.message || '').includes('already loaded')) throw e; }
        const gs = (aiManager.getConfig().gsheets) || {};
        if (gs.serviceAccountKeyPath) {
            try {
                try { await dbManager.query('DROP SECRET IF EXISTS __amox_gsheet'); } catch {}
                const saPath = gs.serviceAccountKeyPath.replace(/\\/g, '/');
                await dbManager.query(`CREATE SECRET __amox_gsheet (TYPE gsheet, PROVIDER key_file, FILEPATH '${saPath}')`);
            } catch (e) { if (!String(e.message || '').includes('already exists')) throw e; }
        }
    }

    /**
     * Run an LLM over each row's input value (bounded concurrency). Returns
     * [{ rn, out }] keyed by the row index. Failures per row → out: null.
     */
    async runAiEnrich(rows, opts) {
        const { generateText } = require('ai');
        const cfg = aiManager.getConfig();
        const provider = opts.provider || cfg.provider || 'ollama';
        const model = opts.model || cfg.defaultModel;
        const llm = aiManager.getModel(provider, model);
        const o = opts.options || {};
        const buildPrompt = (val) => {
            const v = String(val ?? '');
            switch (opts.task) {
                case 'classify':  return `Classify the text into exactly one of these labels: ${o.categories || o.labels || 'positive, negative, neutral'}. Reply with ONLY the label.\n\nText: ${v}`;
                case 'extract':   return `Extract ${o.instruction || o.what || 'the key entity'} from the text. Reply with ONLY the value, or empty if none.\n\nText: ${v}`;
                case 'summarize': return `Summarize the text in one short sentence. Reply with ONLY the summary.\n\nText: ${v}`;
                case 'redact_pii':return `Redact all personal data (names, emails, phones, addresses), replacing each with [REDACTED]. Reply with ONLY the redacted text.\n\nText: ${v}`;
                default:          return `${o.instruction || o.prompt || 'Process the following text'}:\n\n${v}`;
            }
        };
        const concurrency = 4;
        const out = [];
        for (let i = 0; i < rows.length; i += concurrency) {
            const batch = rows.slice(i, i + concurrency);
            const settled = await Promise.all(batch.map(async (row) => {
                try {
                    const res = await generateText({ model: llm, prompt: buildPrompt(row.__val), maxOutputTokens: 200 });
                    return { rn: row.__rn, out: (res.text || '').trim() };
                } catch { return { rn: row.__rn, out: null }; }
            }));
            out.push(...settled);
        }
        return out;
    }

    // --- Chain → SQL compiler ---
    // NOTE: buildNodeSql mirrors the statements produced by executeNode but is pure
    // (no execution). It powers the "export to runnable SQL" feature. Unifying it with
    // executeNode into a single source is a safe follow-up (kept separate for now so the
    // live execution path is untouched).

    /**
     * Build the primary SQL a node produces, without executing it.
     * `sources` is the array of upstream SELECT strings (already resolved). Returns a SQL
     * string, or null for nodes that have no SQL to emit (checkpoint/notification/table_ref).
     */
    buildNodeSql(node, sources, chainFile, vars = {}, projectPath = '') {
        const config = this.applyVars(node.config || {}, vars);
        const out = this.physName(chainFile, node.id);
        const src0 = sources[0];
        const fromSrc = src0 ? `(${src0})` : '(SELECT NULL /* connect an upstream node */)';

        switch (node.type) {
            case 'sql_inline':
                return config.query || null;
            case 'sql_file': {
                try {
                    const fp = path.resolve(projectPath, config.filePath || '');
                    if (config.filePath && fs.existsSync(fp)) {
                        return `-- from file: ${config.filePath}\n${fs.readFileSync(fp, 'utf-8').trim()}`;
                    }
                } catch { /* ignore */ }
                return `-- SQL file: ${config.filePath || '?'} (not found at export time)`;
            }
            case 'table_ref':
                return null;
            case 'import_file': {
                const tbl = config.tableName || 'imported_data';
                const p = (config.sourcePath || '').replace(/\\/g, '/');
                const ft = config.fileType || this.detectFileType(config.sourcePath || '');
                let reader;
                if (ft === 'parquet') reader = `read_parquet('${p}')`;
                else if (ft === 'json' || ft === 'jsonl') reader = `read_json_auto('${p}')`;
                else if (ft === 'xlsx' || ft === 'excel') reader = `read_xlsx('${p}')`;
                else reader = `read_csv('${p}', auto_detect=true, header=true)`;
                return `CREATE OR REPLACE TABLE "${tbl}" AS SELECT * FROM ${reader}`;
            }
            case 'import_folder': {
                const tbl = config.tableName || 'imported_data';
                const fp = (config.folderPath || '').replace(/\\/g, '/');
                const pattern = config.filePattern || '*.csv';
                const ext = pattern.replace('*.', '').toLowerCase();
                let reader;
                if (ext === 'parquet') reader = `read_parquet('${fp}/${pattern}', union_by_name=true)`;
                else if (ext === 'json' || ext === 'jsonl') reader = `read_json_auto('${fp}/${pattern}', union_by_name=true)`;
                else reader = `read_csv('${fp}/${pattern}', auto_detect=true, header=true, union_by_name=true)`;
                return `CREATE OR REPLACE TABLE "${tbl}" AS SELECT * FROM ${reader}`;
            }
            case 'http_fetch': {
                const tbl = config.tableName || 'fetched_data';
                const url = config.url || '';
                const ft = config.format || 'csv';
                const reader = ft === 'parquet' ? `read_parquet('${url}')` : ft === 'json' ? `read_json_auto('${url}')` : `read_csv('${url}', auto_detect=true, header=true)`;
                return `INSTALL httpfs; LOAD httpfs;\nCREATE OR REPLACE TABLE "${tbl}" AS SELECT * FROM ${reader}`;
            }
            case 'create_table': {
                const tbl = config.tableName || 'new_table';
                const q = config.query || src0 || '(SELECT NULL)';
                return `CREATE OR REPLACE TABLE "${tbl}" AS ${q}`;
            }
            case 'export_file': {
                const q = config.query || src0 || '(SELECT NULL)';
                const fmt = config.format || 'csv';
                const p = (config.outputPath || '').replace(/\\/g, '/');
                const partCols = Array.isArray(config.partitionBy) ? config.partitionBy : (config.partitionBy ? String(config.partitionBy).split(',').map(s => s.trim()).filter(Boolean) : []);
                const partOpt = partCols.length ? `, PARTITION_BY (${partCols.map(pc => `"${pc}"`).join(', ')})` : '';
                if (fmt === 'parquet') {
                    const c = config.compression ? `, COMPRESSION ${config.compression.toUpperCase()}` : '';
                    return `COPY (${q}) TO '${p}' (FORMAT PARQUET${c}${partOpt})`;
                }
                if (fmt === 'json') return `COPY (${q}) TO '${p}' (FORMAT JSON${partOpt})`;
                if (fmt === 'xlsx' || fmt === 'excel') return `COPY (${q}) TO '${p}' WITH (FORMAT GDAL, DRIVER 'xlsx')`;
                const d = (config.delimiter && config.delimiter !== ',') ? `, SEPARATOR '${config.delimiter}'` : '';
                return `COPY (${q}) TO '${p}' (FORMAT CSV, HEADER${d}${partOpt})`;
            }
            case 'merge_tables': {
                if (sources.length === 0) return null;
                const joiner = config.mergeMode === 'union' ? ' UNION ' : ' UNION ALL ';
                return `CREATE OR REPLACE TABLE "${out}" AS ${sources.join(joiner)}`;
            }
            case 'join_tables': {
                if (sources.length < 2) return '-- join_tables: needs 2 upstream inputs';
                const jt = config.joinType || 'LEFT';
                const jkeys = this.joinKeys(config);
                const jon = jkeys.length ? jkeys.map(k => `_left."${k.left}" = _right."${k.right}"`).join(' AND ') : `_left."?" = _right."?"`;
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT * FROM (${sources[0]}) AS _left ${jt} JOIN (${sources[1]}) AS _right ON ${jon}`;
            }
            case 'filter': {
                const conds = config.conditions || [];
                if (!conds.length) return null;
                const connector = config.connector || 'AND';
                const where = conds.map(c => {
                    const col = `"${c.column}"`;
                    switch (c.operator) {
                        case 'IS NULL': return `${col} IS NULL`;
                        case 'IS NOT NULL': return `${col} IS NOT NULL`;
                        case '>': case '>=': case '<': case '<=': return `${col} ${c.operator} ${c.value}`;
                        case 'LIKE': return `${col} LIKE '${(c.value || '').replace(/'/g, "''")}'`;
                        case 'NOT LIKE': return `${col} NOT LIKE '${(c.value || '').replace(/'/g, "''")}'`;
                        case 'IN': { const vals = (c.value || '').split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`).join(', '); return `${col} IN (${vals})`; }
                        case 'BETWEEN': return `${col} BETWEEN ${c.value} AND ${c.value2}`;
                        default: return `${col} ${c.operator || '='} '${(c.value || '').replace(/'/g, "''")}'`;
                    }
                }).join(` ${connector} `);
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT * FROM ${fromSrc} AS _src WHERE ${where}`;
            }
            case 'group_aggregate': {
                const groups = config.groupColumns || [];
                const aggs = config.aggregations || [];
                if (!aggs.length) return null;
                const parts = [
                    ...groups.map(g => `"${g}"`),
                    ...aggs.map(a => this.aggExpr(a)),
                ];
                const gb = groups.length ? ` GROUP BY ${groups.map(g => `"${g}"`).join(', ')}` : '';
                const having = (config.having && config.having.trim()) ? ` HAVING ${config.having.trim()}` : '';
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT ${parts.join(', ')} FROM ${fromSrc} AS _src${gb}${having}`;
            }
            case 'select_columns': {
                const cols = config.columns || [];
                if (!cols.length) return null;
                const exprs = cols.map(c => (c.alias && c.alias !== c.name) ? `"${c.name}" AS "${c.alias}"` : `"${c.name}"`);
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT ${exprs.join(', ')} FROM ${fromSrc} AS _src`;
            }
            case 'deduplicate': {
                const keys = config.keyColumns || [];
                if (!keys.length) return `CREATE OR REPLACE TABLE "${out}" AS SELECT DISTINCT * FROM ${fromSrc} AS _src`;
                const part = keys.map(k => `"${k}"`).join(', ');
                const order = config.keep === 'last' ? 'DESC' : 'ASC';
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT * EXCLUDE (_rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ${part} ORDER BY rowid ${order}) AS _rn FROM ${fromSrc} AS _src) WHERE _rn = 1`;
            }
            case 'add_column': {
                const cols = config.newColumns || [];
                if (!cols.length) return null;
                const exprs = cols.map(c => `(${c.expression}) AS "${c.name}"`);
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT *, ${exprs.join(', ')} FROM ${fromSrc} AS _src`;
            }
            case 'sort': {
                const s = config.sortColumns || [];
                if (!s.length) return null;
                const ob = s.map(c => `"${c.column}" ${c.direction || 'ASC'}`).join(', ');
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT * FROM ${fromSrc} AS _src ORDER BY ${ob}`;
            }
            case 'sample': {
                const v = parseInt(config.sampleValue) || 100;
                if (config.sampleType === 'percent') return `CREATE OR REPLACE TABLE "${out}" AS SELECT * FROM ${fromSrc} AS _src USING SAMPLE ${Math.min(v, 100)}%`;
                if (config.sampleType === 'stratified' && config.strataColumn) return `CREATE OR REPLACE TABLE "${out}" AS SELECT * EXCLUDE (_rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "${config.strataColumn}" ORDER BY random()) AS _rn FROM ${fromSrc} AS _src) WHERE _rn <= ${v}`;
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT * FROM ${fromSrc} AS _src LIMIT ${v}`;
            }
            case 'pivot': {
                if (!config.groupColumn || !config.pivotColumn || !config.valueColumn) return null;
                return `CREATE OR REPLACE TABLE "${out}" AS PIVOT ${fromSrc} ON "${config.pivotColumn}" USING ${config.aggFunc || 'SUM'}("${config.valueColumn}") GROUP BY "${config.groupColumn}"`;
            }
            case 'unpivot': {
                const vc = (config.valueColumns || []).map(c => `"${c}"`).join(', ');
                if (!vc) return null;
                return `CREATE OR REPLACE TABLE "${out}" AS UNPIVOT ${fromSrc} ON (${vc}) INTO NAME "${config.nameColumn || 'variable'}" VALUE "${config.valueColumn || 'value'}"`;
            }
            case 'type_cast': {
                const casts = config.casts || [];
                if (!casts.length) return null;
                const ce = casts.map(c => `TRY_CAST("${c.column}" AS ${c.targetType}) AS "${c.alias || c.column}"`);
                const ex = casts.map(c => `"${c.column}"`).join(', ');
                // DuckDB requires EXCLUDE attached to the star, then the new expressions.
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT * EXCLUDE (${ex}), ${ce.join(', ')} FROM ${fromSrc} AS _src`;
            }
            case 'window_functions': {
                const ws = config.windows || [];
                if (!ws.length) return null;
                const we = ws.map(w => {
                    const pb = (w.partitionBy && w.partitionBy.length) ? `PARTITION BY ${w.partitionBy.map(c => `"${c}"`).join(', ')}` : '';
                    const ob = (w.orderBy && w.orderBy.length) ? `ORDER BY ${w.orderBy.map(c => `"${c}"`).join(', ')}` : '';
                    const over = `OVER (${[pb, ob].filter(Boolean).join(' ')})`;
                    const col = (w.column && w.column !== '*') ? `"${w.column}"` : (w.column === '*' ? '*' : '');
                    const fn = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE'].includes(w.func) ? `${w.func}()` : (col ? `${w.func}(${col})` : `${w.func}()`);
                    return `${fn} ${over} AS "${w.alias || String(w.func || '').toLowerCase()}"`;
                });
                return `CREATE OR REPLACE TABLE "${out}" AS SELECT *, ${we.join(', ')} FROM ${fromSrc} AS _src`;
            }
            case 'clean':
                return `-- clean/replace: column transforms resolved from the live schema at run time — not inlined`;
            case 'date_ops':
                return (config.operations || []).length
                    ? `CREATE OR REPLACE TABLE "${out}" AS ${this.dateOpsSelect(config, fromSrc)}`
                    : null;
            case 'flatten':
                return config.column
                    ? `CREATE OR REPLACE TABLE "${out}" AS ${this.flattenSelect(config, fromSrc)}`
                    : null;
            case 'bucket_read': {
                const bf = config.format || 'parquet';
                const breader = bf === 'csv' ? `read_csv('${config.uri || ''}', auto_detect=true, header=true)` : bf === 'json' ? `read_json_auto('${config.uri || ''}')` : `read_parquet('${config.uri || ''}')`;
                return `-- cloud credentials applied at run time (httpfs)\nCREATE OR REPLACE TABLE "${config.tableName || 'cloud_data'}" AS SELECT * FROM ${breader}`;
            }
            case 'gsheet_read': {
                const sid = config.spreadsheetId || config.url || '';
                const sc = config.sheet ? `, sheet='${config.sheet}'` : '';
                return `-- Google Sheets via the gsheets extension\nCREATE OR REPLACE TABLE "${config.tableName || 'gsheet_data'}" AS SELECT * FROM read_gsheet('${sid}'${sc})`;
            }
            case 'ai_enrich':
                return `-- ai_enrich: an LLM is applied per row at run time (not pure SQL)`;
            case 'rename_table':
                return config.newName ? `-- rename upstream table to "${config.newName}" (ALTER TABLE … RENAME TO)` : null;
            case 'assert':
            case 'schema_validation':
                return `-- ${node.type}: data-quality gate (no table output)`;
            case 'checkpoint':
            case 'notification':
                return null;
            case 'chart':
                return `-- chart: writes a .amoxvis file (no table output)`;
            case 'report':
                return `-- report: writes a notebook or deck file (no table output)`;
            default:
                return null;
        }
    }

    /**
     * Compile a whole chain into an ordered, (mostly) runnable DuckDB SQL script.
     * Reuses the topological order and the deterministic intermediate naming, so the
     * emitted script reproduces what a run would do. Nodes that resolve only at run
     * time (clean, rename, asserts, notifications) are emitted as comments.
     */
    compileToSql(chainDef, projectPath = '', chainFile = '', variables = {}) {
        const { nodes = [], edges = [], name = 'chain' } = chainDef;
        const vars = { ...(chainDef.variables || {}), ...(variables || {}) };
        const layers = this.computeLayers(nodes, edges);
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        const parentMap = new Map(nodes.map(n => [n.id, []]));
        for (const e of edges) if (parentMap.has(e.target)) parentMap.get(e.target).push(e.source);

        // The SELECT string a parent exposes to its children.
        const refQuery = (pid) => {
            const pn = nodeMap.get(pid);
            if (!pn) return null;
            if (pn.type === 'sql_inline') {
                // Only inline as a subquery if it's a read query; a CREATE/INSERT can't be a FROM source.
                const q = (this.applyVars(pn.config || {}, vars).query || '').trim().replace(/;\s*$/, '');
                return /^(select|with)\b/i.test(q) ? q : null;
            }
            return this.outputToQuery(this.staticOutputRef(pn, chainFile));
        };

        const lines = [
            `-- AmoxSQL Chain → SQL: ${name}`,
            `-- Reproduces the chain run order. Intermediate tables use the chain's`,
            `-- deterministic names; nodes resolved only at run time appear as comments.`,
            ``,
        ];
        if (Object.keys(vars).length) {
            lines.push('-- Variables:');
            for (const [k, v] of Object.entries(vars)) lines.push(`--   ${k} = ${v}`);
            lines.push('');
        }

        let step = 0;
        for (const layer of layers) {
            for (const nodeId of layer) {
                const node = nodeMap.get(nodeId);
                if (!node) continue;
                step++;
                const sources = (parentMap.get(nodeId) || []).map(refQuery).filter(Boolean);
                lines.push(`-- Step ${step}: [${node.type}] ${node.label || node.id}`);
                if (node.description) lines.push(`-- ${node.description}`);
                const sql = this.buildNodeSql(node, sources, chainFile, vars, projectPath);
                if (sql && sql.trim()) {
                    const t = sql.trim();
                    // Leave comment-only emissions as-is; terminate real statements with ';'.
                    lines.push(t.startsWith('--') ? t : (t.endsWith(';') ? t : `${t};`));
                } else {
                    lines.push(`-- (${node.type}: nothing to emit)`);
                }
                lines.push('');
            }
        }
        return lines.join('\n');
    }

    // --- Node Execution ---

    async executeNode(node, dbManager, projectPath, upstreamOutputs = [], ctx = {}) {
        const { type } = node;
        const chainFile = ctx.chainFile || '';
        // Interpolate ${var} placeholders across all string config fields before use.
        const vars = ctx.variables || {};
        const config = Object.keys(vars).length > 0 ? this.applyVars(node.config || {}, vars) : (node.config || {});
        let sql = '';
        let resultType = 'unknown';
        let resultSummary = {};

        switch (type) {
            case 'sql_file': {
                const filePath = path.resolve(projectPath, config.filePath);
                sql = fs.readFileSync(filePath, 'utf-8');
                const result = await dbManager.query(sql);
                const detected = this.detectResultType(sql);
                resultType = detected.resultType;
                resultSummary = { ...detected.details, rowCount: Array.isArray(result) ? result.length : 0 };
                break;
            }

            case 'sql_inline': {
                sql = config.query || '';
                const result = await dbManager.query(sql);
                const detected = this.detectResultType(sql);
                resultType = detected.resultType;
                resultSummary = { ...detected.details, rowCount: Array.isArray(result) ? result.length : 0 };
                break;
            }

            case 'table_ref': {
                const tableName = config.tableName || '';
                if (!tableName) throw new Error('Table Reference node has no table selected');
                // Resolve the schema (explicit config, "schema.table" form, or catalog
                // lookup preferring main) so non-default schemas work, and validate.
                let schema = config.schema || null;
                let bare = tableName;
                if (!schema && tableName.includes('.')) {
                    const dot = tableName.indexOf('.');
                    schema = tableName.slice(0, dot);
                    bare = tableName.slice(dot + 1);
                }
                if (!schema) {
                    const found = await dbManager.query(
                        `SELECT table_schema FROM information_schema.tables WHERE table_name = '${bare.replace(/'/g, "''")}' ORDER BY (table_schema = 'main') DESC LIMIT 1`
                    );
                    schema = found[0]?.table_schema || null;
                }
                if (!schema) throw new Error(`Table "${tableName}" does not exist`);
                const ref = `"${schema}"."${bare}"`;
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM ${ref}`);
                const rowCount = countResult[0]?.cnt || 0;
                sql = `-- Table Reference: ${schema}.${bare}`;
                resultType = 'table_referenced';
                resultSummary = { table: bare, schema, rowCount };
                break;
            }

            case 'merge_tables': {
                const targetTable = this.physName(chainFile, node.id);
                const mergeMode = config.mergeMode || 'union_all';

                // Build UNION ALL / UNION from upstream outputs
                const queries = [];
                for (const out of upstreamOutputs) {
                    const q = this.outputToQuery(out);
                    if (q) queries.push(q);
                }
                if (queries.length === 0) {
                    throw new Error('Merge Tables node has no upstream data sources connected');
                }

                const joiner = mergeMode === 'union' ? ' UNION ' : ' UNION ALL ';
                const combinedQuery = queries.join(joiner);
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS ${combinedQuery}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, sourceCount: queries.length };
                break;
            }

            case 'assert': {
                const assertType = config.assertType || 'row_count_gt';
                const targetTable = config.tableName || '';

                // Resolve table: use config or first upstream output
                let tableToCheck = targetTable;
                if (!tableToCheck && upstreamOutputs.length > 0) {
                    const up = upstreamOutputs[0];
                    tableToCheck = up.table || up.view || '';
                }
                if (!tableToCheck) throw new Error('Assert node: no table specified and no upstream table found');

                if (assertType === 'row_count_gt') {
                    const threshold = parseInt(config.threshold) || 0;
                    sql = `SELECT COUNT(*) as cnt FROM "${tableToCheck}"`;
                    const result = await dbManager.query(sql);
                    const count = result[0]?.cnt || 0;
                    if (count <= threshold) {
                        throw new Error(`Assertion failed: "${tableToCheck}" has ${count} rows (expected > ${threshold})`);
                    }
                    resultType = 'assertion_passed';
                    resultSummary = { table: tableToCheck, assertion: `rows > ${threshold}`, actual: count };
                } else if (assertType === 'not_empty') {
                    sql = `SELECT COUNT(*) as cnt FROM "${tableToCheck}"`;
                    const result = await dbManager.query(sql);
                    const count = result[0]?.cnt || 0;
                    if (count === 0) {
                        throw new Error(`Assertion failed: "${tableToCheck}" is empty`);
                    }
                    resultType = 'assertion_passed';
                    resultSummary = { table: tableToCheck, assertion: 'not empty', actual: count };
                } else if (assertType === 'no_nulls') {
                    const column = config.column || '';
                    if (!column) throw new Error('Assert "no nulls": column not specified');
                    sql = `SELECT COUNT(*) as cnt FROM "${tableToCheck}" WHERE "${column}" IS NULL`;
                    const result = await dbManager.query(sql);
                    const nullCount = result[0]?.cnt || 0;
                    if (nullCount > 0) {
                        throw new Error(`Assertion failed: "${tableToCheck}"."${column}" has ${nullCount} NULL values`);
                    }
                    resultType = 'assertion_passed';
                    resultSummary = { table: tableToCheck, assertion: `no nulls in ${column}`, actual: 0 };
                } else if (assertType === 'unique') {
                    const column = config.column || '';
                    if (!column) throw new Error('Assert "unique": column not specified');
                    sql = `SELECT COUNT(*) - COUNT(DISTINCT "${column}") as dupes FROM "${tableToCheck}"`;
                    const result = await dbManager.query(sql);
                    const dupes = result[0]?.dupes || 0;
                    if (dupes > 0) {
                        throw new Error(`Assertion failed: "${tableToCheck}"."${column}" has ${dupes} duplicate values`);
                    }
                    resultType = 'assertion_passed';
                    resultSummary = { table: tableToCheck, assertion: `${column} is unique`, actual: 'pass' };
                } else if (assertType === 'custom_query') {
                    sql = config.query || '';
                    if (!sql) throw new Error('Assert "custom query": no query provided');
                    const result = await dbManager.query(sql);
                    const count = Array.isArray(result) ? result.length : 0;
                    if (count === 0) {
                        throw new Error('Assertion failed: custom query returned no rows (expected at least 1)');
                    }
                    resultType = 'assertion_passed';
                    resultSummary = { assertion: 'custom query', actual: `${count} rows` };
                }
                break;
            }

            case 'import_file': {
                const sourcePath = this.resolvePath(projectPath, config.sourcePath);
                const tableName = config.tableName || 'imported_data';
                const fileType = config.fileType || this.detectFileType(config.sourcePath || '');
                const delimiter = config.delimiter || ',';
                const skipRows = parseInt(config.skipRows) || 0;
                const sheetName = config.sheetName || '';

                if (!config.sourcePath) throw new Error('Import File node: source file path is required');
                if (!fs.existsSync(sourcePath)) throw new Error(`Import File: file not found — ${config.sourcePath}`);

                if (fileType === 'csv' || fileType === 'tsv') {
                    const delimOpt = fileType === 'tsv' ? `delim='\\t'` : `delim='${delimiter}'`;
                    const skipOpt = skipRows > 0 ? `, skip=${skipRows}` : '';
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${sourcePath}', auto_detect=true, header=true, ${delimOpt}${skipOpt})`;
                } else if (fileType === 'parquet') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${sourcePath}')`;
                } else if (fileType === 'json' || fileType === 'jsonl') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${sourcePath}')`;
                } else if (fileType === 'xlsx' || fileType === 'excel') {
                    await this.ensureSpatialExtension(dbManager);
                    const sheetOpt = sheetName ? `, sheet='${sheetName}'` : '';
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_xlsx('${sourcePath}'${sheetOpt})`;
                } else {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${sourcePath}', auto_detect=true)`;
                }

                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount, source: config.sourcePath };
                break;
            }

            case 'import_folder': {
                const folderPath = this.resolvePath(projectPath, config.folderPath);
                const pattern = config.filePattern || '*.csv';
                const tableName = config.tableName || 'imported_data';
                const ext = pattern.replace('*.', '').toLowerCase();

                if (!config.folderPath) throw new Error('Import Folder node: folder path is required');
                if (!fs.existsSync(folderPath)) throw new Error(`Import Folder: folder not found — ${config.folderPath}`);

                if (ext === 'parquet') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${folderPath}/${pattern}', union_by_name=true)`;
                } else if (ext === 'json' || ext === 'jsonl') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${folderPath}/${pattern}', union_by_name=true)`;
                } else {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${folderPath}/${pattern}', auto_detect=true, header=true, union_by_name=true)`;
                }

                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount, folder: config.folderPath };
                break;
            }

            case 'export_file': {
                if (!config.outputPath) throw new Error('Export File node: output file path is required');
                const isCloud = /^(s3|gs|gcs):\/\//i.test(config.outputPath);
                const outputPath = isCloud ? config.outputPath : this.resolvePath(projectPath, config.outputPath);
                const format = config.format || 'csv';
                const delimiter = config.delimiter || ',';
                const compression = config.compression || '';
                let query = config.query || '';

                // AUTO-RESOLVE: If no query configured, use upstream node's output
                if (!query && upstreamOutputs.length > 0) {
                    const upstreamQuery = this.outputToQuery(upstreamOutputs[0]);
                    if (upstreamQuery) query = upstreamQuery;
                }
                if (!query) {
                    throw new Error('Export node has no query and no upstream node connected. Connect a source node or write a SQL query manually.');
                }

                if (isCloud) {
                    await this.prepareCloud(dbManager, /^(gs|gcs):/i.test(config.outputPath) ? 'gcs' : 's3');
                } else {
                    const outputDir = path.dirname(outputPath);
                    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
                }

                // Partitioned output (writes to a directory of parquet/csv files).
                const partCols = Array.isArray(config.partitionBy)
                    ? config.partitionBy
                    : (config.partitionBy ? String(config.partitionBy).split(',').map(s => s.trim()).filter(Boolean) : []);
                const partOpt = partCols.length ? `, PARTITION_BY (${partCols.map(c => `"${c}"`).join(', ')})` : '';

                if (format === 'csv') {
                    const delimOpt = delimiter !== ',' ? `, SEPARATOR '${delimiter}'` : '';
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT CSV, HEADER${delimOpt}${partOpt})`;
                } else if (format === 'parquet') {
                    const comprOpt = compression ? `, COMPRESSION ${compression.toUpperCase()}` : '';
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT PARQUET${comprOpt}${partOpt})`;
                } else if (format === 'xlsx' || format === 'excel') {
                    await this.ensureSpatialExtension(dbManager);
                    sql = `COPY (${query}) TO '${outputPath}' WITH (FORMAT GDAL, DRIVER 'xlsx')`;
                } else if (format === 'json') {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT JSON${partOpt})`;
                } else {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT CSV, HEADER${partOpt})`;
                }

                await dbManager.query(sql);
                const stat = (!isCloud && fs.existsSync(outputPath)) ? fs.statSync(outputPath) : null;
                const sizeKb = stat ? (stat.size / 1024).toFixed(1) : '?';
                resultType = 'file_exported';
                resultSummary = { path: config.outputPath, format, size: isCloud ? 'cloud' : `${sizeKb} KB` };
                break;
            }

            case 'create_table': {
                const targetTable = config.tableName || '';
                if (!targetTable) throw new Error('Create Table node: table name is required');

                let query = config.query || '';
                // Auto-resolve from upstream if no query
                if (!query && upstreamOutputs.length > 0) {
                    query = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!query) {
                    throw new Error('Create Table node has no query and no upstream data source connected');
                }

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS ${query}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount };
                break;
            }

            case 'checkpoint': {
                resultType = 'checkpoint_reached';
                resultSummary = { label: config.resumeLabel || node.label || 'Checkpoint' };
                return { sql: '', resultType, resultSummary, isCheckpoint: true };
            }

            case 'join_tables': {
                const targetTable = this.physName(chainFile, node.id);
                const joinType = config.joinType || 'LEFT';
                const keys = this.joinKeys(config);

                if (upstreamOutputs.length < 2) {
                    throw new Error('Join node requires exactly 2 upstream nodes connected (left and right tables)');
                }
                if (keys.length === 0) {
                    throw new Error('Join node: at least one key pair (left = right) is required');
                }

                const leftQuery = this.outputToQuery(upstreamOutputs[0]);
                const rightQuery = this.outputToQuery(upstreamOutputs[1]);
                if (!leftQuery || !rightQuery) {
                    throw new Error('Join node: could not resolve upstream tables');
                }

                const onClause = keys.map(k => `_left."${k.left}" = _right."${k.right}"`).join(' AND ');
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (${leftQuery}) AS _left ${joinType} JOIN (${rightQuery}) AS _right ON ${onClause}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, joinType };
                break;
            }

            case 'filter': {
                const targetTable = this.physName(chainFile, node.id);
                const conditions = config.conditions || [];

                // Resolve source from upstream or config
                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Filter node: no upstream data source connected and no source table specified');
                }

                if (conditions.length === 0) {
                    throw new Error('Filter node: at least one filter condition is required');
                }

                const connector = config.connector || 'AND';
                const whereClauses = conditions.map(c => {
                    const col = `"${c.column}"`;
                    switch (c.operator) {
                        case '=': return `${col} = '${(c.value || '').replace(/'/g, "''")}'`;
                        case '!=': return `${col} != '${(c.value || '').replace(/'/g, "''")}'`;
                        case '>': return `${col} > ${c.value}`;
                        case '>=': return `${col} >= ${c.value}`;
                        case '<': return `${col} < ${c.value}`;
                        case '<=': return `${col} <= ${c.value}`;
                        case 'LIKE': return `${col} LIKE '${(c.value || '').replace(/'/g, "''")}'`;
                        case 'NOT LIKE': return `${col} NOT LIKE '${(c.value || '').replace(/'/g, "''")}'`;
                        case 'IS NULL': return `${col} IS NULL`;
                        case 'IS NOT NULL': return `${col} IS NOT NULL`;
                        case 'IN': {
                            const vals = (c.value || '').split(',').map(v => `'${v.trim().replace(/'/g, "''")}'`).join(', ');
                            return `${col} IN (${vals})`;
                        }
                        case 'BETWEEN': return `${col} BETWEEN ${c.value} AND ${c.value2}`;
                        default: return `${col} = '${(c.value || '').replace(/'/g, "''")}'`;
                    }
                });

                const whereStr = whereClauses.join(` ${connector} `);
                const mp = await this.materializeTarget(dbManager, node, ctx, targetTable);
                sql = `${mp} AS SELECT * FROM (${sourceQuery}) AS _src WHERE ${whereStr}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, conditionCount: conditions.length };
                break;
            }

            case 'group_aggregate': {
                const targetTable = this.physName(chainFile, node.id);
                const groupColumns = config.groupColumns || [];
                const aggregations = config.aggregations || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Group/Aggregate node: no upstream data source connected');
                }
                if (aggregations.length === 0) {
                    throw new Error('Group/Aggregate node: at least one aggregation is required');
                }

                const selectParts = [];
                for (const col of groupColumns) {
                    selectParts.push(`"${col}"`);
                }
                for (const agg of aggregations) {
                    selectParts.push(this.aggExpr(agg));
                }

                const groupByStr = groupColumns.length > 0
                    ? ` GROUP BY ${groupColumns.map(c => `"${c}"`).join(', ')}`
                    : '';
                const havingStr = (config.having && config.having.trim()) ? ` HAVING ${config.having.trim()}` : '';

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT ${selectParts.join(', ')} FROM (${sourceQuery}) AS _src${groupByStr}${havingStr}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount };
                break;
            }

            case 'select_columns': {
                const targetTable = this.physName(chainFile, node.id);
                const columns = config.columns || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Select Columns node: no upstream data source connected');
                }
                if (columns.length === 0) {
                    throw new Error('Select Columns node: at least one column must be selected');
                }

                const colExprs = columns.map(c => {
                    if (c.alias && c.alias !== c.name) {
                        return `"${c.name}" AS "${c.alias}"`;
                    }
                    return `"${c.name}"`;
                });

                const mp = await this.materializeTarget(dbManager, node, ctx, targetTable);
                sql = `${mp} AS SELECT ${colExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, columnCount: columns.length };
                break;
            }

            case 'deduplicate': {
                const targetTable = this.physName(chainFile, node.id);
                const keyColumns = config.keyColumns || [];
                const keepPolicy = config.keep || 'first';

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Deduplicate node: no upstream data source connected');
                }

                if (keyColumns.length === 0) {
                    // Deduplicate all columns
                    sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT DISTINCT * FROM (${sourceQuery}) AS _src`;
                } else {
                    const partitionBy = keyColumns.map(c => `"${c}"`).join(', ');
                    const order = keepPolicy === 'last' ? 'DESC' : 'ASC';
                    sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY ${partitionBy} ORDER BY rowid ${order}) AS _rn FROM (${sourceQuery}) AS _src) WHERE _rn = 1`;
                }
                await dbManager.query(sql);
                // Remove helper column if present
                try { await dbManager.query(`ALTER TABLE "${targetTable}" DROP COLUMN IF EXISTS _rn`); } catch {}
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount };
                break;
            }

            case 'add_column': {
                const targetTable = this.physName(chainFile, node.id);
                const newColumns = config.newColumns || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Add Column node: no upstream data source connected');
                }
                if (newColumns.length === 0) {
                    throw new Error('Add Column node: at least one column definition is required');
                }

                const colExprs = newColumns.map(c => `(${c.expression}) AS "${c.name}"`);
                const mp = await this.materializeTarget(dbManager, node, ctx, targetTable);
                sql = `${mp} AS SELECT *, ${colExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, addedColumns: newColumns.length };
                break;
            }

            case 'sort': {
                const targetTable = this.physName(chainFile, node.id);
                const sortColumns = config.sortColumns || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Sort node: no upstream data source connected');
                }
                if (sortColumns.length === 0) {
                    throw new Error('Sort node: at least one sort column is required');
                }

                const orderParts = sortColumns.map(c => `"${c.column}" ${c.direction || 'ASC'}`);
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (${sourceQuery}) AS _src ORDER BY ${orderParts.join(', ')}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount };
                break;
            }

            case 'sample': {
                const targetTable = this.physName(chainFile, node.id);
                const sampleType = config.sampleType || 'rows';
                const sampleValue = parseInt(config.sampleValue) || 100;

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Sample node: no upstream data source connected');
                }

                if (sampleType === 'percent') {
                    sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (${sourceQuery}) AS _src USING SAMPLE ${Math.min(sampleValue, 100)}%`;
                } else if (sampleType === 'stratified' && config.strataColumn) {
                    sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * EXCLUDE (_rn) FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY "${config.strataColumn}" ORDER BY random()) AS _rn FROM (${sourceQuery}) AS _src) WHERE _rn <= ${sampleValue}`;
                } else {
                    sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (${sourceQuery}) AS _src LIMIT ${sampleValue}`;
                }
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, sampleType, sampleValue };
                break;
            }

            case 'pivot': {
                const targetTable = this.physName(chainFile, node.id);
                const groupColumn = config.groupColumn || '';
                const pivotColumn = config.pivotColumn || '';
                const valueColumn = config.valueColumn || '';
                const aggFunc = config.aggFunc || 'SUM';

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) {
                    sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                }
                if (!sourceQuery && config.sourceTable) {
                    sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                }
                if (!sourceQuery) {
                    throw new Error('Pivot node: no upstream data source connected');
                }
                if (!groupColumn || !pivotColumn || !valueColumn) {
                    throw new Error('Pivot node: group column, pivot column, and value column are all required');
                }

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS PIVOT (${sourceQuery}) ON "${pivotColumn}" USING ${aggFunc}("${valueColumn}") GROUP BY "${groupColumn}"`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount };
                break;
            }

            case 'rename_table': {
                let sourceTable = '';
                if (upstreamOutputs.length > 0) {
                    sourceTable = upstreamOutputs[0].table || upstreamOutputs[0].view || '';
                }
                if (!sourceTable && config.sourceTable) {
                    sourceTable = config.sourceTable;
                }
                const newName = config.newName || '';
                if (!sourceTable) {
                    throw new Error('Rename Table node: no upstream table found');
                }
                if (!newName) {
                    throw new Error('Rename Table node: new table name is required');
                }

                sql = `ALTER TABLE "${sourceTable}" RENAME TO "${newName}"`;
                await dbManager.query(sql);
                resultType = 'table_created';
                resultSummary = { table: newName, renamedFrom: sourceTable };
                break;
            }

            case 'type_cast': {
                const targetTable = this.physName(chainFile, node.id);
                const casts = config.casts || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('Type Cast node: no upstream data source connected');
                if (casts.length === 0) throw new Error('Type Cast node: at least one cast is required');

                const castExprs = casts.map(c => `TRY_CAST("${c.column}" AS ${c.targetType}) AS "${c.alias || c.column}"`);
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT *, ${castExprs.join(', ')} EXCLUDE (${casts.map(c => `"${c.column}"`).join(', ')}) FROM (${sourceQuery}) AS _src`;
                // Fallback: simpler form if EXCLUDE fails
                try {
                    await dbManager.query(sql);
                } catch {
                    // Build explicit column list: all original + cast replacements
                    const castColSet = new Set(casts.map(c => c.column));
                    // Get all columns from upstream
                    const schemaResult = await dbManager.query(`DESCRIBE ${sourceQuery}`);
                    const allCols = (schemaResult || []).map(r => r.column_name || r.name);
                    const selParts = allCols.map(col => {
                        const cast = casts.find(c => c.column === col);
                        if (cast) return `TRY_CAST("${col}" AS ${cast.targetType}) AS "${cast.alias || col}"`;
                        return `"${col}"`;
                    });
                    sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT ${selParts.join(', ')} FROM (${sourceQuery}) AS _src`;
                    await dbManager.query(sql);
                }
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0, castsApplied: casts.length };
                break;
            }

            case 'window_functions': {
                const targetTable = this.physName(chainFile, node.id);
                const windows = config.windows || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('Window Functions node: no upstream data source connected');
                if (windows.length === 0) throw new Error('Window Functions node: at least one window function is required');

                const windowExprs = windows.map(w => {
                    const partBy = w.partitionBy && w.partitionBy.length > 0
                        ? `PARTITION BY ${w.partitionBy.map(c => `"${c}"`).join(', ')}`
                        : '';
                    const orderBy = w.orderBy && w.orderBy.length > 0
                        ? `ORDER BY ${w.orderBy.map(c => `"${c}"`).join(', ')}`
                        : '';
                    const over = `OVER (${[partBy, orderBy].filter(Boolean).join(' ')})`;
                    const col = w.column && w.column !== '*' ? `"${w.column}"` : (w.column === '*' ? '*' : '');
                    const func = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE'].includes(w.func)
                        ? `${w.func}()`
                        : col ? `${w.func}(${col})` : `${w.func}()`;
                    return `${func} ${over} AS "${w.alias || w.func.toLowerCase()}"`;
                });

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT *, ${windowExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0 };
                break;
            }

            case 'unpivot': {
                const targetTable = this.physName(chainFile, node.id);
                const idColumns = config.idColumns || [];
                const valueColumns = config.valueColumns || [];
                const nameColumn = config.nameColumn || 'variable';
                const valueColumn = config.valueColumn || 'value';

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('Unpivot node: no upstream data source connected');
                if (valueColumns.length === 0) throw new Error('Unpivot node: at least one value column is required');

                const valCols = valueColumns.map(c => `"${c}"`).join(', ');
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS UNPIVOT (${sourceQuery}) ON (${valCols}) INTO NAME "${nameColumn}" VALUE "${valueColumn}"`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0 };
                break;
            }

            case 'http_fetch': {
                const tableName = config.tableName || 'fetched_data';
                const url = config.url || '';
                const fetchFormat = config.format || 'csv';

                if (!url) throw new Error('HTTP Fetch node: URL is required');

                // Load httpfs if needed
                try { await dbManager.query("INSTALL httpfs; LOAD httpfs;"); } catch {}

                if (fetchFormat === 'parquet') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${url}')`;
                } else if (fetchFormat === 'json') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${url}')`;
                } else {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${url}', auto_detect=true, header=true)`;
                }
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount: countResult[0]?.cnt || 0, url };
                break;
            }

            case 'bucket_read': {
                const tableName = config.tableName || 'cloud_data';
                const uri = config.uri || '';
                const fmt = config.format || 'parquet';
                if (!uri) throw new Error('Cloud Bucket node: a URI (s3:// or gs://) is required');
                await this.prepareCloud(dbManager, config.provider || (uri.startsWith('gs://') ? 'gcs' : 's3'));
                const reader = fmt === 'csv' ? `read_csv('${uri}', auto_detect=true, header=true)`
                    : fmt === 'json' ? `read_json_auto('${uri}')`
                    : `read_parquet('${uri}')`;
                sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM ${reader}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount: countResult[0]?.cnt || 0, uri };
                break;
            }

            case 'gsheet_read': {
                const tableName = config.tableName || 'gsheet_data';
                const sheetId = config.spreadsheetId || config.url || '';
                if (!sheetId) throw new Error('Google Sheets node: a spreadsheet ID or URL is required');
                await this.ensureGSheets(dbManager);
                const sheetClause = config.sheet ? `, sheet='${String(config.sheet).replace(/'/g, "''")}'` : '';
                sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_gsheet('${String(sheetId).replace(/'/g, "''")}'${sheetClause})`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount: countResult[0]?.cnt || 0 };
                break;
            }

            case 'ai_enrich': {
                const targetTable = this.physName(chainFile, node.id);
                const inputColumn = config.inputColumn || '';
                const outputColumn = config.outputColumn || 'ai_result';
                const maxRows = Math.min(parseInt(config.maxRows) || 500, 2000);
                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('AI Enrich node: no upstream data source connected');
                if (!inputColumn) throw new Error('AI Enrich node: an input column is required');

                // Materialize the source ONCE with a fixed row index, so the LLM read and the
                // final join align on the same rows (two separate ROW_NUMBER() scans could differ).
                const tmp = `__ai_src_${this.hashString(String(node.id))}`;
                await dbManager.query(`CREATE OR REPLACE TEMP TABLE "${tmp}" AS SELECT *, ROW_NUMBER() OVER () AS __rn FROM (${sourceQuery}) AS _src LIMIT ${maxRows}`);
                const rows = await dbManager.query(`SELECT __rn, "${inputColumn}" AS __val FROM "${tmp}"`);
                const results = await this.runAiEnrich(rows, { task: config.task || 'classify', options: config.options || {}, provider: config.provider, model: config.model });
                const valuesList = results.map(r => `(${parseInt(r.rn)}, '${String(r.out ?? '').replace(/'/g, "''")}')`).join(', ');
                const valuesClause = valuesList ? `(VALUES ${valuesList})` : `(SELECT NULL::BIGINT AS __rn, NULL::VARCHAR AS out WHERE false)`;
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT t.* EXCLUDE (__rn), v.out AS "${outputColumn}" FROM "${tmp}" AS t LEFT JOIN ${valuesClause} AS v(__rn, out) ON t.__rn = v.__rn`;
                await dbManager.query(sql);
                try { await dbManager.query(`DROP TABLE IF EXISTS "${tmp}"`); } catch {}
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0, enriched: results.length };
                break;
            }

            case 'clean': {
                const targetTable = this.physName(chainFile, node.id);
                const operations = config.operations || [];

                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('Clean node: no upstream data source connected');
                if (operations.length === 0) throw new Error('Clean node: at least one cleaning operation is required');

                // Get all columns
                const schemaResult = await dbManager.query(`DESCRIBE ${sourceQuery}`);
                const allCols = (schemaResult || []).map(r => r.column_name || r.name);

                const colExprs = allCols.map(col => {
                    const ops = operations.filter(o => o.column === col);
                    if (ops.length === 0) return `"${col}"`;
                    let expr = `"${col}"`;
                    for (const op of ops) {
                        switch (op.type) {
                            case 'trim': expr = `TRIM(${expr})`; break;
                            case 'lower': expr = `LOWER(${expr})`; break;
                            case 'upper': expr = `UPPER(${expr})`; break;
                            case 'replace': expr = `REPLACE(${expr}, '${(op.from||'').replace(/'/g,"''")}', '${(op.to||'').replace(/'/g,"''")}')` ; break;
                            case 'regex_replace': expr = `REGEXP_REPLACE(${expr}, '${(op.pattern||'').replace(/'/g,"''")}', '${(op.replacement||'').replace(/'/g,"''")}')` ; break;
                            case 'fill_null': expr = `COALESCE(${expr}, '${(op.defaultValue||'').replace(/'/g,"''")}')` ; break;
                            case 'nullify_empty': expr = `NULLIF(${expr}, '')`; break;
                            case 'regex_extract': expr = `REGEXP_EXTRACT(${expr}, '${(op.pattern||'').replace(/'/g,"''")}')`; break;
                            case 'normalize': expr = `TRIM(REGEXP_REPLACE(STRIP_ACCENTS(${expr}), '\\s+', ' ', 'g'))`; break;
                            case 'split_part': expr = `SPLIT_PART(${expr}, '${(op.delimiter||',').replace(/'/g,"''")}', ${parseInt(op.part)||1})`; break;
                        }
                    }
                    return `${expr} AS "${col}"`;
                });

                const mp = await this.materializeTarget(dbManager, node, ctx, targetTable);
                sql = `${mp} AS SELECT ${colExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0, opsApplied: operations.length };
                break;
            }

            case 'date_ops': {
                const targetTable = this.physName(chainFile, node.id);
                const operations = config.operations || [];
                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('Date/Time node: no upstream data source connected');
                if (operations.length === 0) throw new Error('Date/Time node: at least one operation is required');
                const mp = await this.materializeTarget(dbManager, node, ctx, targetTable);
                sql = `${mp} AS ${this.dateOpsSelect(config, `(${sourceQuery})`)}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0, opsApplied: operations.length };
                break;
            }

            case 'flatten': {
                const targetTable = this.physName(chainFile, node.id);
                let sourceQuery = '';
                if (upstreamOutputs.length > 0) sourceQuery = this.outputToQuery(upstreamOutputs[0]);
                if (!sourceQuery && config.sourceTable) sourceQuery = `SELECT * FROM "${config.sourceTable}"`;
                if (!sourceQuery) throw new Error('Flatten node: no upstream data source connected');
                if (!config.column) throw new Error('Flatten node: a source column is required');
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS ${this.flattenSelect(config, `(${sourceQuery})`)}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0 };
                break;
            }

            case 'schema_validation': {
                const expectedCols = config.expectedColumns || [];
                const strict = config.strict || false;

                let tableToCheck = '';
                if (upstreamOutputs.length > 0) {
                    const up = upstreamOutputs[0];
                    tableToCheck = up.table || up.view || '';
                }
                if (!tableToCheck) throw new Error('Schema Validation node: no upstream table found');
                if (expectedCols.length === 0) throw new Error('Schema Validation node: at least one expected column is required');

                const schemaResult = await dbManager.query(`DESCRIBE SELECT * FROM "${tableToCheck}"`);
                const actualCols = new Map((schemaResult || []).map(r => [r.column_name || r.name, r.column_type || r.type]));

                const failures = [];
                for (const expected of expectedCols) {
                    if (!actualCols.has(expected.name)) {
                        failures.push(`Column "${expected.name}" is missing`);
                    } else if (expected.type && !actualCols.get(expected.name).toUpperCase().includes(expected.type.toUpperCase())) {
                        failures.push(`Column "${expected.name}" expected type ${expected.type}, got ${actualCols.get(expected.name)}`);
                    }
                }
                if (strict) {
                    const expectedSet = new Set(expectedCols.map(c => c.name));
                    for (const [col] of actualCols) {
                        if (!expectedSet.has(col)) failures.push(`Unexpected column "${col}"`);
                    }
                }
                if (failures.length > 0) {
                    throw new Error(`Schema validation failed:\n${failures.join('\n')}`);
                }

                sql = `-- Schema validated: ${tableToCheck}`;
                resultType = 'assertion_passed';
                resultSummary = { table: tableToCheck, assertion: 'schema matches', columnsChecked: expectedCols.length };
                break;
            }

            case 'notification': {
                const notifType = config.notifType || 'log';
                const message = config.message || 'Chain step completed';

                if (notifType === 'log_file' && config.logFilePath) {
                    const logPath = this.resolvePath(projectPath, config.logFilePath);
                    const logDir = path.dirname(logPath);
                    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
                    const entry = `[${new Date().toISOString()}] ${message}\n`;
                    fs.appendFileSync(logPath, entry, 'utf-8');
                } else if (notifType === 'webhook' && config.webhookUrl) {
                    try {
                        const https = require('https');
                        const http = require('http');
                        const urlObj = new URL(config.webhookUrl);
                        const mod = urlObj.protocol === 'https:' ? https : http;
                        const payload = JSON.stringify({ message, timestamp: new Date().toISOString() });
                        await new Promise((resolve, reject) => {
                            const req = mod.request(config.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, resolve);
                            req.on('error', reject);
                            req.write(payload);
                            req.end();
                        });
                    } catch (err) {
                        // Non-fatal: log but don't fail the chain
                        console.warn('[Chains] Notification webhook failed:', err.message);
                    }
                }

                sql = `-- Notification: ${message}`;
                resultType = 'unknown';
                resultSummary = { message, type: notifType };
                break;
            }

            // Fase 6 — Data Flow cierra el círculo. A pipeline today can only
            // end in a file, a table, or a checkpoint someone has to go look
            // at. These two node types let it end in something that IS the
            // deliverable: a saved chart, or a notebook/deck built around it —
            // same artifacts Story Flow and Report Flow already produce, just
            // reachable from a scheduled/re-run pipeline instead of by hand.
            case 'chart': {
                if (!config.outputPath) throw new Error('Chart node: output .amoxvis path is required');
                let query = config.query || '';
                if (!query && upstreamOutputs.length > 0) query = this.outputToQuery(upstreamOutputs[0]);
                if (!query) throw new Error('Chart node has no query and no upstream data source connected');

                const { xAxisKey, yAxisKeys } = await this.resolveChartAxes(dbManager, query, config);
                const outputPath = config.outputPath.endsWith('.amoxvis') ? config.outputPath : `${config.outputPath}.amoxvis`;
                const fullPath = this.resolvePath(projectPath, outputPath);
                const outDir = path.dirname(fullPath);
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

                const chartConfig = {
                    chartType: config.chartType || 'bar',
                    xAxisKey,
                    yAxisKeys,
                    chartTitle: config.chartTitle || '',
                    query,
                };
                fs.writeFileSync(fullPath, JSON.stringify(chartConfig, null, 2), 'utf-8');

                sql = `-- Chart: wrote ${outputPath} from\n${query}`;
                resultType = 'chart_created';
                resultSummary = { path: outputPath, chartType: chartConfig.chartType, xAxisKey, yAxisKeys };
                break;
            }

            case 'report': {
                if (!config.outputPath) throw new Error('Report node: output path is required');
                let query = config.query || '';
                if (!query && upstreamOutputs.length > 0) query = this.outputToQuery(upstreamOutputs[0]);
                if (!query) throw new Error('Report node has no query and no upstream data source connected');

                const reportType = config.outputType === 'deck' ? 'deck' : 'notebook';
                const title = config.title || 'Report';

                if (reportType === 'notebook') {
                    const outputPath = config.outputPath.endsWith('.sqlnb') ? config.outputPath : `${config.outputPath}.sqlnb`;
                    const fullPath = this.resolvePath(projectPath, outputPath);
                    const outDir = path.dirname(fullPath);
                    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

                    // Same v3.0 cell shape the app's own "create notebook from
                    // selection" writes — a markdown title cell + one SQL cell.
                    // No cached result: opening it and hitting Run All is the
                    // same guided empty state every other fresh notebook has.
                    const notebook = {
                        version: '3.0',
                        cells: [
                            { id: 'title', type: 'markdown', content: `# ${title}\n\nGenerated by the "${config._nodeLabel || 'Report'}" node in this pipeline.` },
                            { id: 'query', type: 'code', content: query },
                        ],
                        environment: {},
                    };
                    fs.writeFileSync(fullPath, JSON.stringify(notebook, null, 2), 'utf-8');
                    sql = `-- Report (notebook): wrote ${outputPath}`;
                    resultType = 'report_created';
                    resultSummary = { path: outputPath, outputType: 'notebook' };
                } else {
                    // Deck: materialize a chart .amoxvis alongside the deck (same
                    // axis auto-resolution as the Chart node above) and reference
                    // it from a single chart-full slide.
                    const { xAxisKey, yAxisKeys } = await this.resolveChartAxes(dbManager, query, config);
                    const deckOutputPath = config.outputPath.endsWith('.amoxdeck') ? config.outputPath : `${config.outputPath}.amoxdeck`;
                    const deckFullPath = this.resolvePath(projectPath, deckOutputPath);
                    const deckDir = path.dirname(deckFullPath);
                    if (!fs.existsSync(deckDir)) fs.mkdirSync(deckDir, { recursive: true });

                    const chartRelPath = deckOutputPath.replace(/\.amoxdeck$/, '.amoxvis').replace(/\\/g, '/');
                    const chartFullPath = this.resolvePath(projectPath, chartRelPath);
                    const chartConfig = {
                        chartType: config.chartType || 'bar',
                        xAxisKey,
                        yAxisKeys,
                        chartTitle: config.chartTitle || title,
                        query,
                    };
                    fs.writeFileSync(chartFullPath, JSON.stringify(chartConfig, null, 2), 'utf-8');

                    const deckMarkdown = `---\ntitle: ${title}\ntheme: dark\naspect: "16:9"\n---\n\n<!-- layout: title -->\n# ${title}\n\n## Generated by pipeline\n\n---\n\n<!-- layout: chart-full -->\n\`\`\`amoxchart\nsrc: ${chartRelPath}\n\`\`\`\n`;
                    fs.writeFileSync(deckFullPath, deckMarkdown, 'utf-8');

                    sql = `-- Report (deck): wrote ${deckOutputPath} + ${chartRelPath}`;
                    resultType = 'report_created';
                    resultSummary = { path: deckOutputPath, outputType: 'deck', chartPath: chartRelPath };
                }
                break;
            }

            default:
                throw new Error(`Unknown node type: ${type}`);
        }

        return { sql, resultType, resultSummary };
    }

    detectFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const map = { csv: 'csv', tsv: 'csv', parquet: 'parquet', json: 'json', jsonl: 'json', xlsx: 'xlsx', xls: 'xlsx' };
        return map[ext] || 'csv';
    }

    // --- Main Execution Loop ---

    async run(dbManager, chainDef, projectPath, { mode = 'full', startNodeId = null, chainFile = '', variables = {} } = {}) {
        const { nodes, edges = [], name = 'Untitled Chain' } = chainDef;
        // Chain-level variables (from the .sqlchain) merged with run-time overrides.
        const chainVars = { ...(chainDef.variables || {}), ...(variables || {}) };

        // Determine which nodes to execute based on mode
        let activeNodeIds;
        const allNodeIds = new Set(nodes.map(n => n.id));

        if (mode === 'from_node' && startNodeId) {
            activeNodeIds = this.getDownstreamNodes(startNodeId, edges, allNodeIds);
        } else if (mode === 'to_node' && startNodeId) {
            activeNodeIds = this.getUpstreamNodes(startNodeId, edges, allNodeIds);
        } else {
            activeNodeIds = allNodeIds;
        }

        const activeNodes = nodes.filter(n => activeNodeIds.has(n.id));
        const activeEdges = edges.filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target));

        // Compute execution layers
        const layers = this.computeLayers(activeNodes, activeEdges);

        // Create run record
        const runId = await chainPersistence.createRun(dbManager, {
            chainFile,
            chainName: name,
            runMode: mode,
            startNodeId: mode !== 'full' ? startNodeId : null,
            totalNodes: activeNodes.length,
        });

        this.activeRuns.set(runId, { cancelled: false });

        // Create node run records
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const nodeRunIds = new Map(); // nodeId -> nodeRunId
        const nodeStatuses = new Map(); // nodeId -> status

        for (const node of activeNodes) {
            const nodeRunId = await chainPersistence.createNodeRun(dbManager, {
                runId,
                nodeId: node.id,
                nodeType: node.type,
                nodeLabel: node.label || node.id,
            });
            nodeRunIds.set(node.id, nodeRunId);
            nodeStatuses.set(node.id, 'pending');
        }

        // Build adjacency for parent checking
        const parentMap = new Map();
        for (const id of activeNodeIds) parentMap.set(id, []);
        for (const e of activeEdges) {
            if (parentMap.has(e.target)) parentMap.get(e.target).push(e.source);
        }

        // Full parent map (across ALL edges, not just the active subgraph) so that
        // partial runs / checkpoint resume can resolve parents left behind by a
        // previous run via their deterministic output name. For a full run this is
        // equivalent to parentMap (every parent is active and in nodeOutputs).
        const fullParentMap = new Map();
        for (const n of nodes) fullParentMap.set(n.id, []);
        for (const e of edges) {
            if (fullParentMap.has(e.target)) fullParentMap.get(e.target).push(e.source);
        }

        // Downstream fan-out per node (across ALL edges, deterministic) — drives the
        // TEMP VIEW vs TABLE materialization decision (fan-out > 1 → materialize a table).
        const fanout = new Map();
        for (const e of edges) fanout.set(e.source, (fanout.get(e.source) || 0) + 1);

        let completedCount = 0;
        let failed = false;

        // Track node outputs for data flow between connected nodes
        const nodeOutputs = new Map(); // nodeId -> { table?, view?, query? }

        try {
            for (const layer of layers) {
                // Check cancellation
                if (this.activeRuns.get(runId)?.cancelled) {
                    await chainPersistence.updateRunStatus(dbManager, runId, { status: 'cancelled', completedNodes: completedCount });
                    this.activeRuns.delete(runId);
                    return { runId, status: 'cancelled' };
                }

                // Execute nodes in layer sequentially (for v1 simplicity)
                for (const nodeId of layer) {
                    if (this.activeRuns.get(runId)?.cancelled) break;

                    const node = nodeMap.get(nodeId);
                    const nodeRunId = nodeRunIds.get(nodeId);

                    // Check if all parents succeeded
                    const parents = parentMap.get(nodeId) || [];
                    const allParentsOk = parents.every(pid => nodeStatuses.get(pid) === 'success');

                    if (!allParentsOk) {
                        await chainPersistence.updateNodeRun(dbManager, nodeRunId, { status: 'skipped' });
                        nodeStatuses.set(nodeId, 'skipped');
                        continue;
                    }

                    // Resolve upstream outputs for this node
                    const upstreamOutputs = this.resolveUpstreamOutputs(nodeId, fullParentMap, nodeOutputs, nodeMap, chainFile);

                    // Mark as running
                    await chainPersistence.updateNodeRun(dbManager, nodeRunId, { status: 'running' });
                    nodeStatuses.set(nodeId, 'running');
                    this.emitLog(runId, { type: 'node_start', nodeId, nodeLabel: node.label || node.id, nodeType: node.type });

                    const startTime = Date.now();

                    try {
                        const result = await this.executeNode(node, dbManager, projectPath, upstreamOutputs, { chainFile, variables: chainVars, fanout });
                        const durationMs = Date.now() - startTime;

                        // Emit SQL executed
                        if (result.sql) {
                            this.emitLog(runId, { type: 'node_sql', nodeId, nodeLabel: node.label || node.id, sql: result.sql });
                        }

                        // Store output reference for downstream nodes
                        const outputRef = this.extractOutputRef(node, result.sql, result.resultType, result.resultSummary, upstreamOutputs);
                        if (outputRef) {
                            nodeOutputs.set(nodeId, outputRef);
                        }

                        // Handle checkpoint
                        if (result.isCheckpoint) {
                            await chainPersistence.updateNodeRun(dbManager, nodeRunId, {
                                status: 'success',
                                durationMs,
                                resultType: result.resultType,
                                resultSummary: result.resultSummary,
                            });
                            nodeStatuses.set(nodeId, 'success');
                            completedCount++;

                            this.emitLog(runId, { type: 'node_complete', nodeId, nodeLabel: node.label || node.id, durationMs, resultType: result.resultType, resultSummary: result.resultSummary });
                            await chainPersistence.updateRunStatus(dbManager, runId, {
                                status: 'paused',
                                completedNodes: completedCount,
                            });
                            this.emitLog(runId, { type: 'run_paused', pausedAtNode: nodeId });
                            this.closeSSE(runId);
                            this.activeRuns.delete(runId);
                            return { runId, status: 'paused', pausedAtNode: nodeId };
                        }

                        await chainPersistence.updateNodeRun(dbManager, nodeRunId, {
                            status: 'success',
                            durationMs,
                            resultType: result.resultType,
                            resultSummary: result.resultSummary,
                            sqlExecuted: result.sql,
                        });
                        nodeStatuses.set(nodeId, 'success');
                        completedCount++;

                        this.emitLog(runId, {
                            type: 'node_complete',
                            nodeId,
                            nodeLabel: node.label || node.id,
                            durationMs,
                            resultType: result.resultType,
                            rowCount: result.resultSummary?.rowCount,
                            table: result.resultSummary?.table,
                            path: result.resultSummary?.path,
                        });
                        this.emitLog(runId, { type: 'run_progress', completed: completedCount, total: activeNodes.length });

                        await chainPersistence.updateRunStatus(dbManager, runId, {
                            status: 'running',
                            completedNodes: completedCount,
                        });
                    } catch (err) {
                        const durationMs = Date.now() - startTime;
                        await chainPersistence.updateNodeRun(dbManager, nodeRunId, {
                            status: 'failed',
                            durationMs,
                            errorMessage: err.message,
                        });
                        nodeStatuses.set(nodeId, 'failed');
                        failed = true;

                        this.emitLog(runId, { type: 'node_error', nodeId, nodeLabel: node.label || node.id, durationMs, error: err.message });

                        // Mark all downstream nodes as skipped
                        const downstream = this.getDownstreamNodes(nodeId, activeEdges, activeNodeIds);
                        downstream.delete(nodeId);
                        for (const skipId of downstream) {
                            const skipRunId = nodeRunIds.get(skipId);
                            if (skipRunId && nodeStatuses.get(skipId) === 'pending') {
                                await chainPersistence.updateNodeRun(dbManager, skipRunId, { status: 'skipped' });
                                nodeStatuses.set(skipId, 'skipped');
                            }
                        }

                        await chainPersistence.updateRunStatus(dbManager, runId, {
                            status: 'failed',
                            completedNodes: completedCount,
                            failedNodeId: nodeId,
                        });
                        this.emitLog(runId, { type: 'run_complete', status: 'failed', failedNodeId: nodeId });
                        this.closeSSE(runId);
                        this.activeRuns.delete(runId);
                        return { runId, status: 'failed', failedNodeId: nodeId, error: err.message };
                    }
                }
            }
        } catch (err) {
            await chainPersistence.updateRunStatus(dbManager, runId, { status: 'failed', completedNodes: completedCount });
            this.emitLog(runId, { type: 'run_complete', status: 'failed', error: err.message });
            this.closeSSE(runId);
            this.activeRuns.delete(runId);
            return { runId, status: 'failed', error: err.message };
        }

        await chainPersistence.updateRunStatus(dbManager, runId, { status: 'completed', completedNodes: completedCount });
        this.emitLog(runId, { type: 'run_complete', status: 'completed', totalNodes: activeNodes.length });
        this.closeSSE(runId);
        this.activeRuns.delete(runId);
        return { runId, status: 'completed' };
    }

    cancelRun(runId) {
        const run = this.activeRuns.get(runId);
        if (run) run.cancelled = true;
    }
}

module.exports = new ChainExecutor();
