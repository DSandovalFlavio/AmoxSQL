/**
 * AmoxSQL — Execution Chain Persistence Layer
 *
 * Manages the `amoxsql_chains` schema: runs and per-node results of .sqlchain
 * workflows. Since 5.9 it lives in AmoxSQL's own database (central migration 2,
 * one history for every project); a project's database keeps the history the
 * 5.8 wrote there, read-only. Every method takes the database it writes to, so
 * the same code serves both.
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

    async createRun(dbManager, { chainFile, chainName, runMode, startNodeId, totalNodes, proyecto }) {
        const id = generateId();
        const escapeSql = (s) => s ? `'${String(s).replace(/'/g, "''")}'` : 'NULL';
        // `proyecto` sólo existe en la tabla de la base central.
        const conProyecto = proyecto !== undefined;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_chains.runs (id, chain_file, chain_name, run_mode, start_node_id, total_nodes${conProyecto ? ', proyecto' : ''})
            VALUES ('${id}', ${escapeSql(chainFile)}, ${escapeSql(chainName)}, ${escapeSql(runMode)}, ${escapeSql(startNodeId)}, ${totalNodes || 0}${conProyecto ? `, ${escapeSql(proyecto)}` : ''})
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

    /**
     * Lo que el ejecutor necesita para ir anotando una ejecución, atado a una
     * base. Es el historial «de siempre», en la base del proyecto: el de la
     * base central lo arma `server/ejecucion/historial.js` con las mismas piezas.
     */
    ligar(db) {
        return {
            createRun: (d) => this.createRun(db, d),
            createNodeRun: (d) => this.createNodeRun(db, d),
            updateNodeRun: (id, d) => this.updateNodeRun(db, id, d),
            updateRunStatus: (id, d) => this.updateRunStatus(db, id, d),
        };
    }

    /** ¿Tiene esta base el historial de la 5.8? Mirar no lo crea. */
    async tieneHistorial(db) {
        try {
            const filas = await db.systemQuery(
                `SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE schema_name = 'amoxsql_chains' AND table_name = 'runs'`
            );
            return (filas[0]?.n || 0) > 0;
        } catch {
            return false;
        }
    }
}

module.exports = new ChainPersistence();
