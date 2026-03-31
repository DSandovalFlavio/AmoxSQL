/**
 * AmoxSQL — Execution Chain Engine
 *
 * Executes .sqlchain DAG workflows using topological ordering.
 * Supports full runs, partial runs (from/to a node), and checkpoint pausing.
 * Results are persisted via ChainPersistence.
 */
const fs = require('fs');
const path = require('path');
const { glob } = require('fs').promises ? require('fs/promises') : require('fs');
const chainPersistence = require('./ChainPersistence');

class ChainExecutor {
    constructor() {
        // Active runs map: runId -> { cancelled: boolean }
        this.activeRuns = new Map();
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

    // --- Node Execution ---

    async executeNode(node, dbManager, projectPath) {
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

            case 'import_file': {
                const sourcePath = path.resolve(projectPath, config.sourcePath).replace(/\\/g, '/');
                const tableName = config.tableName || 'imported_data';
                const fileType = config.fileType || this.detectFileType(config.sourcePath);

                if (fileType === 'csv') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${sourcePath}', auto_detect=true, header=true)`;
                } else if (fileType === 'parquet') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${sourcePath}')`;
                } else if (fileType === 'json') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${sourcePath}')`;
                } else if (fileType === 'xlsx' || fileType === 'excel') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_xlsx('${sourcePath}')`;
                } else {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${sourcePath}', auto_detect=true)`;
                }

                const result = await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount };
                break;
            }

            case 'import_folder': {
                const folderPath = path.resolve(projectPath, config.folderPath).replace(/\\/g, '/');
                const pattern = config.filePattern || '*.csv';
                const tableName = config.tableName || 'imported_data';
                const ext = pattern.replace('*.', '');

                sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_csv('${folderPath}/${pattern}', auto_detect=true, header=true, union_by_name=true)`;

                if (ext === 'parquet') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_parquet('${folderPath}/${pattern}', union_by_name=true)`;
                } else if (ext === 'json') {
                    sql = `CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${folderPath}/${pattern}', union_by_name=true)`;
                }

                await dbManager.query(sql);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
                const rowCount = countResult[0]?.cnt || 0;
                resultType = 'table_created';
                resultSummary = { table: tableName, rowCount, folder: config.folderPath };
                break;
            }

            case 'export_file': {
                const outputPath = path.resolve(projectPath, config.outputPath).replace(/\\/g, '/');
                const format = config.format || 'csv';
                const query = config.query || '';

                // Ensure output directory exists
                const outputDir = path.dirname(outputPath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                if (format === 'csv') {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT CSV, HEADER)`;
                } else if (format === 'parquet') {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT PARQUET)`;
                } else if (format === 'xlsx' || format === 'excel') {
                    sql = `COPY (${query}) TO '${outputPath}' WITH (FORMAT GDAL, DRIVER 'xlsx')`;
                } else {
                    sql = `COPY (${query}) TO '${outputPath}' (FORMAT CSV, HEADER)`;
                }

                await dbManager.query(sql);
                const stat = fs.existsSync(outputPath) ? fs.statSync(outputPath) : null;
                resultType = 'file_exported';
                resultSummary = { path: config.outputPath, format, size: stat ? `${(stat.size / 1024).toFixed(1)} KB` : 'unknown' };
                break;
            }

            case 'checkpoint': {
                resultType = 'checkpoint_reached';
                resultSummary = { label: config.resumeLabel || node.label || 'Checkpoint' };
                // Checkpoint signals the executor to pause — handled by the run loop
                return { sql: '', resultType, resultSummary, isCheckpoint: true };
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

                    // Mark as running
                    await chainPersistence.updateNodeRun(dbManager, nodeRunId, { status: 'running' });
                    nodeStatuses.set(nodeId, 'running');

                    const startTime = Date.now();

                    try {
                        const result = await this.executeNode(node, dbManager, projectPath);
                        const durationMs = Date.now() - startTime;

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

                            await chainPersistence.updateRunStatus(dbManager, runId, {
                                status: 'paused',
                                completedNodes: completedCount,
                            });
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
                        this.activeRuns.delete(runId);
                        return { runId, status: 'failed', failedNodeId: nodeId, error: err.message };
                    }
                }
            }
        } catch (err) {
            await chainPersistence.updateRunStatus(dbManager, runId, { status: 'failed', completedNodes: completedCount });
            this.activeRuns.delete(runId);
            return { runId, status: 'failed', error: err.message };
        }

        await chainPersistence.updateRunStatus(dbManager, runId, { status: 'completed', completedNodes: completedCount });
        this.activeRuns.delete(runId);
        return { runId, status: 'completed' };
    }

    cancelRun(runId) {
        const run = this.activeRuns.get(runId);
        if (run) run.cancelled = true;
    }
}

module.exports = new ChainExecutor();
