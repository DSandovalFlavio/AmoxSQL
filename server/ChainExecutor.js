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

    detectResultType(sql) {
        if (!sql) return { resultType: 'unknown', details: {} };
        const trimmed = sql.trim().toUpperCase();

        if (/^CREATE\s+(OR\s+REPLACE\s+)?TABLE/i.test(trimmed)) {
            const match = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
            return { resultType: 'table_created', details: { table: match?.[1] || 'unknown' } };
        }
        if (/^CREATE\s+(OR\s+REPLACE\s+)?VIEW/i.test(trimmed)) {
            const match = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
            return { resultType: 'view_created', details: { view: match?.[1] || 'unknown' } };
        }
        if (/^INSERT\s+INTO/i.test(trimmed)) {
            const match = sql.match(/INSERT\s+INTO\s+([^\s(]+)/i);
            return { resultType: 'rows_inserted', details: { table: match?.[1] || 'unknown' } };
        }
        if (/^UPDATE\s+/i.test(trimmed)) {
            const match = sql.match(/UPDATE\s+([^\s]+)/i);
            return { resultType: 'rows_updated', details: { table: match?.[1] || 'unknown' } };
        }
        if (/^DELETE\s+FROM/i.test(trimmed)) {
            const match = sql.match(/DELETE\s+FROM\s+([^\s]+)/i);
            return { resultType: 'rows_deleted', details: { table: match?.[1] || 'unknown' } };
        }
        if (/^COPY\s+.*\s+TO\s+/i.test(trimmed)) {
            return { resultType: 'file_exported', details: {} };
        }
        if (/^DROP\s+TABLE/i.test(trimmed)) {
            const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s;]+)/i);
            return { resultType: 'table_dropped', details: { table: match?.[1] || 'unknown' } };
        }
        if (/^DROP\s+VIEW/i.test(trimmed)) {
            const match = sql.match(/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([^\s;]+)/i);
            return { resultType: 'view_dropped', details: { view: match?.[1] || 'unknown' } };
        }
        if (/^SELECT/i.test(trimmed)) {
            return { resultType: 'query_result', details: {} };
        }

        return { resultType: 'unknown', details: {} };
    }

    // --- Output Context ---

    /**
     * Resolve the output reference from upstream parent nodes.
     * Returns the table/view name or query that can be used by downstream nodes.
     * If multiple parents, returns an array of references.
     */
    resolveUpstreamOutputs(nodeId, parentMap, nodeOutputs) {
        const parents = parentMap.get(nodeId) || [];
        const outputs = [];
        for (const pid of parents) {
            const out = nodeOutputs.get(pid);
            if (out) outputs.push(out);
        }
        return outputs;
    }

    /**
     * Build a SELECT query from an upstream output reference.
     */
    outputToQuery(output) {
        if (!output) return null;
        if (output.table) return `SELECT * FROM "${output.table}"`;
        if (output.view) return `SELECT * FROM "${output.view}"`;
        if (output.query) return output.query;
        return null;
    }

    /**
     * Extract the output reference from a node's execution result.
     * This is stored in nodeOutputs so downstream nodes can use it.
     */
    extractOutputRef(node, sql, resultType, resultSummary, upstreamOutputs = []) {
        // For table_ref, the output is the referenced table
        if (node.type === 'table_ref') {
            return { table: node.config?.tableName || null };
        }

        // Assert and checkpoint are pass-through: forward the upstream output
        if (node.type === 'assert' || node.type === 'checkpoint') {
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

    // --- Node Execution ---

    async executeNode(node, dbManager, projectPath, upstreamOutputs = []) {
        const { type, config = {} } = node;
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
                // Validate table exists
                const checkResult = await dbManager.query(
                    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_name = '${tableName.replace(/'/g, "''")}'`
                );
                const exists = checkResult[0]?.cnt > 0;
                if (!exists) throw new Error(`Table "${tableName}" does not exist`);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                const rowCount = countResult[0]?.cnt || 0;
                sql = `-- Table Reference: ${tableName}`;
                resultType = 'table_referenced';
                resultSummary = { table: tableName, rowCount };
                break;
            }

            case 'merge_tables': {
                const targetTable = config.tableName || 'merged_data';
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
                const outputPath = this.resolvePath(projectPath, config.outputPath);
                const format = config.format || 'csv';
                const delimiter = config.delimiter || ',';
                const compression = config.compression || '';
                let query = config.query || '';

                if (!config.outputPath) throw new Error('Export File node: output file path is required');

                // AUTO-RESOLVE: If no query configured, use upstream node's output
                if (!query && upstreamOutputs.length > 0) {
                    const upstreamQuery = this.outputToQuery(upstreamOutputs[0]);
                    if (upstreamQuery) query = upstreamQuery;
                }

                if (!query) {
                    throw new Error('Export node has no query and no upstream node connected. Connect a source node or write a SQL query manually.');
                }

                // Ensure output directory exists
                const outputDir = path.dirname(outputPath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                if (format === 'csv') {
                    const delimOpt = delimiter !== ',' ? `, SEPARATOR '${delimiter}'` : '';
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT CSV, HEADER${delimOpt})`;
                } else if (format === 'parquet') {
                    const comprOpt = compression ? `, COMPRESSION ${compression.toUpperCase()}` : '';
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT PARQUET${comprOpt})`;
                } else if (format === 'xlsx' || format === 'excel') {
                    await this.ensureSpatialExtension(dbManager);
                    sql = `COPY (${query}) TO '${outputPath}' WITH (FORMAT GDAL, DRIVER 'xlsx')`;
                } else if (format === 'json') {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT JSON)`;
                } else {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT CSV, HEADER)`;
                }

                await dbManager.query(sql);
                const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
                const sizeKb = stat ? (stat.size / 1024).toFixed(1) : '?';
                resultType = 'file_exported';
                resultSummary = { path: config.outputPath, format, size: `${sizeKb} KB` };
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
                const targetTable = config.tableName || 'joined_data';
                const joinType = config.joinType || 'LEFT';
                const leftKey = config.leftKey || '';
                const rightKey = config.rightKey || '';

                if (upstreamOutputs.length < 2) {
                    throw new Error('Join node requires exactly 2 upstream nodes connected (left and right tables)');
                }
                if (!leftKey || !rightKey) {
                    throw new Error('Join node: left key and right key columns must be specified');
                }

                const leftQuery = this.outputToQuery(upstreamOutputs[0]);
                const rightQuery = this.outputToQuery(upstreamOutputs[1]);
                if (!leftQuery || !rightQuery) {
                    throw new Error('Join node: could not resolve upstream tables');
                }

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (${leftQuery}) AS _left ${joinType} JOIN (${rightQuery}) AS _right ON _left."${leftKey}" = _right."${rightKey}"`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, joinType };
                break;
            }

            case 'filter': {
                const targetTable = config.tableName || 'filtered_data';
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
                        default: return `${col} = '${(c.value || '').replace(/'/g, "''")}'`;
                    }
                });

                const whereStr = whereClauses.join(` ${connector} `);
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT * FROM (${sourceQuery}) AS _src WHERE ${whereStr}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, conditionCount: conditions.length };
                break;
            }

            case 'group_aggregate': {
                const targetTable = config.tableName || 'aggregated_data';
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
                    const alias = agg.alias || `${agg.func.toLowerCase()}_${agg.column}`;
                    if (agg.func === 'COUNT' && agg.column === '*') {
                        selectParts.push(`COUNT(*) AS "${alias}"`);
                    } else {
                        selectParts.push(`${agg.func}("${agg.column}") AS "${alias}"`);
                    }
                }

                const groupByStr = groupColumns.length > 0
                    ? ` GROUP BY ${groupColumns.map(c => `"${c}"`).join(', ')}`
                    : '';

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT ${selectParts.join(', ')} FROM (${sourceQuery}) AS _src${groupByStr}`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount };
                break;
            }

            case 'select_columns': {
                const targetTable = config.tableName || 'selected_columns';
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

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT ${colExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, columnCount: columns.length };
                break;
            }

            case 'deduplicate': {
                const targetTable = config.tableName || 'deduplicated';
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
                const targetTable = config.tableName || 'with_column';
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
                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT *, ${colExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount, addedColumns: newColumns.length };
                break;
            }

            case 'sort': {
                const targetTable = config.tableName || 'sorted_data';
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
                const targetTable = config.tableName || 'sample_data';
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
                const targetTable = config.tableName || 'pivoted_data';
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
                const targetTable = config.tableName || 'casted_data';
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
                const targetTable = config.tableName || 'with_window';
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
                const targetTable = config.tableName || 'unpivoted_data';
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

            case 'clean': {
                const targetTable = config.tableName || 'cleaned_data';
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
                        }
                    }
                    return `${expr} AS "${col}"`;
                });

                sql = `CREATE OR REPLACE TABLE "${targetTable}" AS SELECT ${colExprs.join(', ')} FROM (${sourceQuery}) AS _src`;
                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${targetTable}"`);
                resultType = 'table_created';
                resultSummary = { table: targetTable, rowCount: countResult[0]?.cnt || 0, opsApplied: operations.length };
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

    async run(dbManager, chainDef, projectPath, { mode = 'full', startNodeId = null, chainFile = '' } = {}) {
        const { nodes, edges = [], name = 'Untitled Chain' } = chainDef;

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
                    const upstreamOutputs = this.resolveUpstreamOutputs(nodeId, parentMap, nodeOutputs);

                    // Mark as running
                    await chainPersistence.updateNodeRun(dbManager, nodeRunId, { status: 'running' });
                    nodeStatuses.set(nodeId, 'running');
                    this.emitLog(runId, { type: 'node_start', nodeId, nodeLabel: node.label || node.id, nodeType: node.type });

                    const startTime = Date.now();

                    try {
                        const result = await this.executeNode(node, dbManager, projectPath, upstreamOutputs);
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
