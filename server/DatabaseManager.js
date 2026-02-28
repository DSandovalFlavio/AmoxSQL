const { DuckDBInstance } = require('@duckdb/node-api');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        this.instance = null;
        this.connection = null;
        this.attachedPath = null;
        this.alias = 'user_db';

        // Initialize immediately
        this._initSystem();
    }

    async _resetMainSchema() {
        // Drop any user tables in the main schema to simulate a clean slate
        // In :memory: mode this is simpler: just re-init
        await this.reinitializeSystem();
    }

    async _initSystem() {
        console.log("[DB Manager] _initSystem (Neo) called.");
        try {
            // New API: explicit create
            this.instance = await DuckDBInstance.create(':memory:');
            this.connection = await this.instance.connect();
            this.attachedPath = null;
            console.log("[DB Manager] System DB initialized (Neo Client).");
        } catch (e) {
            console.error("[DB Manager] FATAL: Could not init system DB", e);
        }
    }

    async query(sql) {
        if (!this.connection) await this._initSystem();

        try {
            // Neo API: run() returns a Reader, which is async iterable or has methods
            const reader = await this.connection.run(sql);

            // Neo API: run() returns a Reader. We want Objects for the API.
            // getRowObjectsJson() handles BigInts safely (as strings) and maps headers.
            const rows = await reader.getRowObjectsJson();
            return rows;

        } catch (err) {
            throw new Error(err.message);
        }
    }

    // Checkpointing in Neo might differ, but `CHECKPOINT` SQL command works universally
    async checkpoint() {
        await this.query('CHECKPOINT');
    }

    async reinitializeSystem() {
        console.log("[DB Manager] HARD RESET REQUESTED.");
        // Just create a new instance, old one gets GC'd or we effectively abandon it
        // The Neo connection doesn't strictly need a close() if it goes out of scope, but let's be clean if possible.
        // There is no explicit .close() on connection in some versions of node-api yet, but let's check basic usage.

        // PASO NUEVO: Intentar cerrar lo que estaba abierto antes de reiniciar
        if (this.connection) {
            try {
                console.log("[DB Manager] Cleaning up previous connection...");
                await this.close(); // Reutilizamos tu método close para hacer DETACH
            } catch (e) {
                console.warn("[DB Manager] Warning during cleanup:", e);
            }
        }

        // Damos un pequeño respiro al sistema de archivos (IO) de Windows
        // Windows a veces tarda unos milisegundos en liberar el candado del archivo
        await new Promise(resolve => setTimeout(resolve, 200));

        this.instance = null;
        this.connection = null;

        await this._initSystem();
        console.log("[DB Manager] Engine re-initialized.");
    }

    async connect(dbPath, rootDir, options = {}) {
        console.log(`[DB Manager] Request to attach: ${dbPath}`);

        // 0. Resolve Path
        let fullPath = ':memory:';
        if (dbPath && dbPath !== ':memory:') {
            fullPath = path.isAbsolute(dbPath) ? dbPath : path.join(rootDir, dbPath);
            fullPath = fullPath.replace(/\\/g, '/');
        }
        // SI YA HAY UNA DB CONECTADA, PRIMERO REINICIAMOS LIMPIAMENTE
        // Esto previene que se acumulen conexiones
        if (this.attachedPath) {
            await this.reinitializeSystem();
        } else if (fullPath === ':memory:') {
            await this.reinitializeSystem();
            return;
        }

        console.log(`[DB Manager] Request to attach: ${fullPath}`);

        // 3. Attach new
        try {
            const attachMode = options.readOnly ? '(READ_ONLY)' : '';
            console.log(`[DB Manager] Attaching: ${fullPath} AS ${this.alias} ${attachMode}`);

            if (!this.connection) await this._initSystem();

            // Execute SQL ATTACH
            await this.query(`ATTACH '${fullPath}' AS ${this.alias} ${attachMode}`);

            this.attachedPath = fullPath;
            await this.query(`USE ${this.alias}`);

            console.log("[DB Manager] Attach successful.");

            // --- QUERY HISTORY INITIALIZATION (RW ONLY) ---
            if (!options.readOnly) {
                await this._initHistory();
            }

            // Log tables for debug
            // const tables = await this.query("SHOW TABLES");
            // console.log("Tables:", tables);

        } catch (e) {
            console.error("[DB Manager] Attach failed:", e);
            await this.reinitializeSystem();
            throw e;
        }
    }

    async _initHistory() {
        try {
            // Create hidden history table
            await this.query(`CREATE TABLE IF NOT EXISTS amox_query_history (query TEXT, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

            // Prune old records (> 30 days)
            await this.query(`DELETE FROM amox_query_history WHERE executed_at < CURRENT_DATE - INTERVAL '30 days'`);
            console.log("[DB Manager] Query History initialized and pruned.");
        } catch (e) {
            console.warn("[DB Manager] Failed to init history table:", e.message);
        }
    }

    async _logQuery(sql) {
        if (!this.attachedPath) return;

        // Filter out system queries and self-logging
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT * FROM "AMOX_QUERY_HISTORY"')) return;
        if (trimmed.startsWith('INSERT INTO AMOX_QUERY_HISTORY')) return;
        if (trimmed.startsWith('PRAGMA')) return;
        if (trimmed.startsWith('EXPLAIN')) return;
        if (trimmed.startsWith('SUMMARIZE')) return;
        if (trimmed.startsWith('DESCRIBE')) return;
        if (trimmed.startsWith('SHOW')) return;
        if (trimmed.startsWith('CREATE TABLE IF NOT EXISTS AMOX_')) return;
        if (trimmed.startsWith('DELETE FROM AMOX_QUERY_HISTORY')) return;

        // Exclude system schema queries
        if (trimmed.includes('FROM INFORMATION_SCHEMA')) return;
        if (trimmed.includes('FROM "INFORMATION_SCHEMA"')) return;
        // Exclude system utility queries (from Quality Check, Data Profiler, etc.)
        if (trimmed.includes('AMOX_QUERY_HISTORY')) return;

        const escapedSql = sql.replace(/'/g, "''");
        this.query(`INSERT INTO amox_query_history (query) VALUES ('${escapedSql}')`).catch(e => {
        });
    }

    async query(sql) {
        if (!this.connection) await this._initSystem();

        // Log it (fire & forget logic inside)
        // Only log if we have an attached DB (implicit check in _logQuery)
        // And ensure we don't cause infinite text loop
        if (!sql.includes('amox_query_history')) {
            this._logQuery(sql);
        }

        try {
            // Neo API: run() returns a Reader, which is async iterable or has methods
            const reader = await this.connection.run(sql);

            // Neo API: run() returns a Reader. We want Objects for the API.
            // getRowObjectsJson() handles BigInts safely (as strings) and maps headers.
            const rows = await reader.getRowObjectsJson();
            return rows;

        } catch (err) {
            throw new Error(err.message);
        }
    }

    async close() {
        if (!this.connection) return;

        try {
            console.log("[DB Manager] Switching to system context before detaching...");
            // PASO CRÍTICO: "Bajarse de la escalera".
            // Cambiamos a la memoria interna antes de intentar soltar la base de datos externa.
            try {
                await this.query("USE memory");
            } catch (e) {
                // Si 'memory' falla, intentamos 'main' (depende de la versión de DuckDB)
                try { await this.query("USE main"); } catch (e2) { }
            }

            // Ahora que ya no estamos 'usando' user_db, podemos listarlas y desconectarlas
            const dbs = await this.query("PRAGMA database_list");

            for (const db of dbs) {
                // DuckDB Neo API puede devolver filas como objetos o arrays, aseguramos lectura:
                const name = db.name || db.name;
                const file = db.file || db.file;

                // No tocar la memoria ni el sistema
                if (name === 'memory' || name === 'system') continue;
                // Si no tiene archivo o es :memory:, ignorar
                if (!file || file === ':memory:') continue;

                console.log(`[DB Manager] Detaching database: ${name}`);
                try {
                    await this.query(`DETACH ${name}`);
                    console.log(`[DB Manager] ${name} detached successfully.`);
                } catch (e) {
                    console.error(`[DB Manager] Failed to detach ${name}:`, e.message);
                }
            }
        } catch (e) {
            console.error("[DB Manager] Error during close execution:", e);
        }

        this.attachedPath = null;
    }

    getCurrentPath() {
        return this.attachedPath || ':memory:';
    }
}

module.exports = new DatabaseManager();
