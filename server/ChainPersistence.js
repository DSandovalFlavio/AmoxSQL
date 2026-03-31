/**
 * AmoxSQL — Execution Chain Persistence Layer
 *
 * Manages the `amoxsql_chains` schema within each project's DuckDB database.
 * Stores execution history (runs and per-node results) for .sqlchain workflows.
 *
 * Chain definitions live as .sqlchain files in the project directory.
 * Only execution history is persisted in DuckDB.
 */
const crypto = require('crypto');

function generateId() {
    return crypto.randomUUID();
}

class ChainPersistence {
    async initSchema(dbManager) {
        try {
            await dbManager.systemQuery(`CREATE SCHEMA IF NOT EXISTS amoxsql_chains`);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_chains.runs (
                    id              VARCHAR PRIMARY KEY,
                    chain_file      VARCHAR NOT NULL,
                    chain_name      VARCHAR,
                    started_at      TIMESTAMP DEFAULT current_timestamp,
                    finished_at     TIMESTAMP,
                    status          VARCHAR DEFAULT 'running',
                    start_node_id   VARCHAR,
                    run_mode        VARCHAR DEFAULT 'full',
                    total_nodes     INTEGER,
                    completed_nodes INTEGER DEFAULT 0,
                    failed_node_id  VARCHAR
                )
            `);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_chains.node_runs (
                    id              VARCHAR PRIMARY KEY,
                    run_id          VARCHAR NOT NULL,
                    node_id         VARCHAR NOT NULL,
                    node_type       VARCHAR NOT NULL,
                    node_label      VARCHAR,
                    status          VARCHAR DEFAULT 'pending',
                    started_at      TIMESTAMP,
                    finished_at     TIMESTAMP,
                    duration_ms     INTEGER,
                    result_type     VARCHAR,
                    result_summary  VARCHAR,
                    error_message   VARCHAR,
                    sql_executed    VARCHAR
                )
            `);

            console.log('[Chains] Schema initialized');
        } catch (err) {
            console.error('[Chains] Schema init failed:', err.message);
            throw err;
        }
    }

    // --- Run CRUD ---

    async createRun(dbManager, { chainFile, chainName, runMode, startNodeId, totalNodes }) {
        const id = generateId();
        const escapeSql = (s) => s ? `'${String(s).replace(/'/g, "''")}'` : 'NULL';

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_chains.runs (id, chain_file, chain_name, run_mode, start_node_id, total_nodes)
            VALUES ('${id}', ${escapeSql(chainFile)}, ${escapeSql(chainName)}, ${escapeSql(runMode)}, ${escapeSql(startNodeId)}, ${totalNodes || 0})
        `);
        return id;
    }

    async updateRunStatus(dbManager, runId, { status, completedNodes, failedNodeId }) {
        const parts = [`status = '${status}'`];
        if (completedNodes !== undefined) parts.push(`completed_nodes = ${completedNodes}`);
        if (failedNodeId) parts.push(`failed_node_id = '${failedNodeId.replace(/'/g, "''")}'`);
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
            parts.push(`finished_at = current_timestamp`);
        }
        await dbManager.systemQuery(`
            UPDATE amoxsql_chains.runs SET ${parts.join(', ')} WHERE id = '${runId}'
        `);
    }

    async getRun(dbManager, runId) {
        const rows = await dbManager.systemQuery(`
            SELECT * FROM amoxsql_chains.runs WHERE id = '${runId}'
        `);
        return rows[0] || null;
    }

    async listRuns(dbManager, { chainFile, limit = 20 } = {}) {
        let where = '';
        if (chainFile) {
            where = `WHERE chain_file = '${chainFile.replace(/'/g, "''")}'`;
        }
        return await dbManager.systemQuery(`
            SELECT * FROM amoxsql_chains.runs ${where}
            ORDER BY started_at DESC
            LIMIT ${limit}
        `);
    }

    async deleteRun(dbManager, runId) {
        await dbManager.systemQuery(`DELETE FROM amoxsql_chains.node_runs WHERE run_id = '${runId}'`);
        await dbManager.systemQuery(`DELETE FROM amoxsql_chains.runs WHERE id = '${runId}'`);
    }

    // --- Node Run CRUD ---

    async createNodeRun(dbManager, { runId, nodeId, nodeType, nodeLabel }) {
        const id = generateId();
        const escapeSql = (s) => s ? `'${String(s).replace(/'/g, "''")}'` : 'NULL';

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_chains.node_runs (id, run_id, node_id, node_type, node_label, status)
            VALUES ('${id}', '${runId}', '${nodeId}', '${nodeType}', ${escapeSql(nodeLabel)}, 'pending')
        `);
        return id;
    }

    async updateNodeRun(dbManager, nodeRunId, { status, durationMs, resultType, resultSummary, errorMessage, sqlExecuted }) {
        const escapeSql = (s) => s ? `'${String(s).replace(/'/g, "''")}'` : 'NULL';
        const parts = [`status = '${status}'`];

        if (status === 'running') {
            parts.push(`started_at = current_timestamp`);
        }
        if (status === 'success' || status === 'failed' || status === 'skipped') {
            parts.push(`finished_at = current_timestamp`);
        }
        if (durationMs !== undefined) parts.push(`duration_ms = ${durationMs}`);
        if (resultType) parts.push(`result_type = ${escapeSql(resultType)}`);
        if (resultSummary) parts.push(`result_summary = ${escapeSql(JSON.stringify(resultSummary))}`);
        if (errorMessage) parts.push(`error_message = ${escapeSql(errorMessage)}`);
        if (sqlExecuted) parts.push(`sql_executed = ${escapeSql(sqlExecuted)}`);

        await dbManager.systemQuery(`
            UPDATE amoxsql_chains.node_runs SET ${parts.join(', ')} WHERE id = '${nodeRunId}'
        `);
    }

    async getNodeRuns(dbManager, runId) {
        return await dbManager.systemQuery(`
            SELECT * FROM amoxsql_chains.node_runs
            WHERE run_id = '${runId}'
            ORDER BY started_at ASC NULLS LAST
        `);
    }

    async getLatestNodeResults(dbManager, chainFile) {
        const runs = await this.listRuns(dbManager, { chainFile, limit: 1 });
        if (!runs.length) return [];
        return await this.getNodeRuns(dbManager, runs[0].id);
    }
}

module.exports = new ChainPersistence();
