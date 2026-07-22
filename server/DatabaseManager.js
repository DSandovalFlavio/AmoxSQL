const { DuckDBInstance } = require('@duckdb/node-api');
const path = require('path');
const fs = require('fs');

/**
 * Connection lanes — one physical DuckDB connection per lane, all on the same
 * DuckDBInstance (so they share the attached database and catalog):
 *
 *   - 'main': user-facing queries (/api/query, exports, chains). The default —
 *             callers that don't pass a lane keep today's behavior.
 *   - 'meta': autocomplete / schema probes (DESCRIBE, information_schema).
 *             Keeps the editor responsive while a long user query runs.
 *   - 'ai':   AI tool queries + amoxsql_ai persistence bookkeeping. Lets the
 *             30s AI timeout interrupt ONLY its own query, and stops AI work
 *             from queueing behind user queries.
 *
 * Per-connection semantics to keep in mind (DuckDB):
 *   - ATTACH/DETACH are instance-wide (shared by all lanes).
 *   - `USE`, `SET` (session scope), LOADed extensions, temp tables and
 *     prepared statements are PER CONNECTION. The codebase uses no temp
 *     tables or prepared statements (verified 2026-07); `USE` is replicated
 *     to every lane on connect/close; session `SET s3_*` and explicit `LOAD`s
 *     happen on 'main' only — other lanes rely on DuckDB's extension
 *     autoloading (on by default) if they ever touch extension functions.
 */
const LANES = ['main', 'meta', 'ai'];

class DatabaseManager {
    constructor() {
        this.instance = null;
        this.connections = { main: null, meta: null, ai: null };
        this.attachedPath = null;
        this.alias = 'user_db';
        this._laneFacades = {};

        // Extensions the user has explicitly LOADed. LOAD is per-connection and
        // is lost whenever the instance is recreated (reconnect / open / reset),
        // so we remember them here and re-LOAD after every _initSystem — otherwise
        // opening a database silently drops every activated extension.
        this.loadedExtensions = new Set();

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
            // New API: explicit create; every lane connects to the SAME instance
            this.instance = await DuckDBInstance.create(':memory:');
            for (const lane of LANES) {
                this.connections[lane] = await this.instance.connect();
            }
            this.attachedPath = null;
            console.log("[DB Manager] System DB initialized (Neo Client, lanes: " + LANES.join(', ') + ").");

            // Re-LOAD any extensions the user had activated. The instance is
            // brand new here, so a fresh reconnect/reset would otherwise leave
            // them installed-but-unloaded.
            await this.restoreExtensions();
        } catch (e) {
            console.error("[DB Manager] FATAL: Could not init system DB", e);
        }
    }

    // ─── Extension activation memory ───────────────────────────────────────
    // The endpoints run INSTALL/LOAD; they call rememberExtension so the manager
    // can re-LOAD on the next instance. Startup seeds this set from config so
    // activations survive an app restart, not just a reconnect.
    rememberExtension(name) {
        const safe = String(name || '').trim();
        if (safe) this.loadedExtensions.add(safe);
    }

    forgetExtension(name) {
        this.loadedExtensions.delete(String(name || '').trim());
    }

    getLoadedExtensions() {
        return [...this.loadedExtensions];
    }

    /**
     * LOAD every remembered extension on the 'main' lane. Best-effort per
     * extension: one failure (e.g. binary removed from disk) must not abort the
     * rest or break the connection. Called at the end of _initSystem (where
     * connections.main is freshly set) and by the server on startup.
     */
    async restoreExtensions() {
        if (!this.loadedExtensions || this.loadedExtensions.size === 0) return;
        let conn = this.connections.main;
        if (!conn) {
            try { conn = await this._ensureLane('main'); } catch { return; }
        }
        for (const name of this.loadedExtensions) {
            try {
                await conn.run(`LOAD ${name}`);
            } catch (e) {
                console.warn(`[DB Manager] Could not restore extension '${name}':`, e?.message || e);
            }
        }
    }

    /** Resolve a lane name to its connection; unknown lanes fall back to 'main'. */
    _conn(lane) {
        return this.connections[LANES.includes(lane) ? lane : 'main'];
    }

    /** Ensure the instance and the requested lane's connection exist. */
    async _ensureLane(lane) {
        if (!this.instance || !this.connections.main) {
            await this._initSystem();
        }
        const key = LANES.includes(lane) ? lane : 'main';
        if (!this.connections[key] && this.instance) {
            // Lane lost (e.g. failed init) — reconnect it and restore context
            this.connections[key] = await this.instance.connect();
            if (this.attachedPath) {
                try { await this.connections[key].run(`USE ${this.alias}`); } catch { /* best-effort */ }
            }
        }
        return this._conn(key);
    }

    /**
     * Returns a lightweight facade bound to a lane. It inherits everything
     * from the manager but routes query/systemQuery/queryWithMetadata (and
     * interruptQuery) to the given lane. Lets helpers that receive a
     * "dbManager" (persistence, joinSanityCheck, profiling) run on a lane
     * without changing their signatures.
     */
    lane(laneName) {
        const key = LANES.includes(laneName) ? laneName : 'main';
        if (this._laneFacades[key]) return this._laneFacades[key];
        const mgr = this;
        const facade = Object.create(this);
        facade.query = (sql, options = {}) => mgr.query(sql, { ...options, lane: options.lane || key });
        facade.systemQuery = (sql, options = {}) => mgr.systemQuery(sql, { ...options, lane: options.lane || key });
        facade.queryWithMetadata = (sql, options = {}) => mgr.queryWithMetadata(sql, { ...options, lane: options.lane || key });
        facade.interruptQuery = (l) => mgr.interruptQuery(l || key);
        this._laneFacades[key] = facade;
        return facade;
    }

    // Checkpointing in Neo might differ, but `CHECKPOINT` SQL command works universally
    async checkpoint() {
        await this.query('CHECKPOINT');
    }

    async reinitializeSystem() {
        console.log("[DB Manager] HARD RESET REQUESTED.");

        // PASO NUEVO: Intentar cerrar lo que estaba abierto antes de reiniciar
        if (this.connections.main) {
            try {
                console.log("[DB Manager] Cleaning up previous connection...");
                await this.close(); // Reutilizamos tu método close para hacer DETACH
            } catch (e) {
                console.warn("[DB Manager] Warning during cleanup:", e);
            }
        }

        // Disconnect every lane explicitly so the old instance releases its
        // resources (the instance itself is abandoned to GC, as before —
        // closeSync() could block on in-flight queries).
        for (const lane of LANES) {
            try { this.connections[lane]?.disconnectSync?.(); } catch { /* best-effort */ }
            this.connections[lane] = null;
        }
        this._laneFacades = {};

        // Damos un pequeño respiro al sistema de archivos (IO) de Windows
        // Windows a veces tarda unos milisegundos en liberar el candado del archivo
        await new Promise(resolve => setTimeout(resolve, 200));

        this.instance = null;

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

            if (!this.connections.main) await this._initSystem();

            // Execute SQL ATTACH — instance-wide, visible to every lane
            await this.query(`ATTACH '${fullPath}' AS ${this.alias} ${attachMode}`);

            this.attachedPath = fullPath;

            // `USE` is per-connection: replicate it on every lane so unqualified
            // names (and objects created by the AI, e.g. attach_file views)
            // resolve to the same catalog everywhere.
            for (const lane of LANES) {
                await this._ensureLane(lane);
                await this.connections[lane].run(`USE ${this.alias}`);
            }

            console.log("[DB Manager] Attach successful.");

            // --- QUERY HISTORY INITIALIZATION (RW ONLY) ---
            if (!options.readOnly) {
                await this._initHistory();
            }

        } catch (e) {
            console.error("[DB Manager] Attach failed:", e);
            await this.reinitializeSystem();
            throw e;
        }
    }

    async _initHistory() {
        try {
            // Ensure amoxsql_ai schema exists (may not exist yet if AI persistence hasn't run)
            await this.query(`CREATE SCHEMA IF NOT EXISTS amoxsql_ai`);

            // Create history table in the internal schema (not in main)
            await this.query(`CREATE TABLE IF NOT EXISTS amoxsql_ai.query_history (query TEXT, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

            // ─── Migration: move data from old main.amox_query_history if it exists ───
            try {
                const oldExists = await this.query(
                    "SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema='main' AND table_name='amox_query_history'"
                );
                if (oldExists[0]?.cnt > 0) {
                    console.log('[DB Manager] Migrating amox_query_history → amoxsql_ai.query_history...');
                    await this.query(`INSERT INTO amoxsql_ai.query_history SELECT * FROM main.amox_query_history`);
                    await this.query(`DROP TABLE main.amox_query_history`);
                    console.log('[DB Manager] Migration complete.');
                }
            } catch (migErr) {
                console.warn('[DB Manager] History migration skipped:', migErr.message);
            }

            // Prune old records (> 30 days)
            await this.query(`DELETE FROM amoxsql_ai.query_history WHERE executed_at < CURRENT_DATE - INTERVAL '30 days'`);
            console.log("[DB Manager] Query History initialized and pruned.");
        } catch (e) {
            console.warn("[DB Manager] Failed to init history table:", e.message);
        }
    }

    async _logQuery(sql) {
        if (!this.attachedPath) return;

        // Filter tagged system queries (comment-based tagging)
        if (sql.trimStart().startsWith('-- AMOX_SYSTEM')) return;

        // Filter out system queries and self-logging
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.includes('AMOXSQL_AI.QUERY_HISTORY')) return;
        if (trimmed.startsWith('SELECT * FROM "AMOX_QUERY_HISTORY"')) return;
        if (trimmed.startsWith('INSERT INTO AMOX_QUERY_HISTORY')) return;
        if (trimmed.startsWith('PRAGMA')) return;
        if (trimmed.startsWith('EXPLAIN')) return;
        if (trimmed.startsWith('SUMMARIZE')) return;
        if (trimmed.startsWith('DESCRIBE')) return;
        if (trimmed.startsWith('SHOW')) return;
        if (trimmed.startsWith('USE ')) return;
        if (trimmed.startsWith('SELECT VERSION()')) return;
        if (trimmed.startsWith('CREATE TABLE IF NOT EXISTS AMOX_')) return;
        if (trimmed.startsWith('DELETE FROM AMOX_QUERY_HISTORY')) return;

        // Exclude system schema queries
        if (trimmed.includes('FROM INFORMATION_SCHEMA')) return;
        if (trimmed.includes('FROM "INFORMATION_SCHEMA"')) return;
        // Exclude internal schemas
        if (trimmed.includes('AMOXSQL_AI')) return;
        if (trimmed.includes('AMOXSQL_CHAINS')) return;
        if (trimmed.includes('AMOX_QUERY_HISTORY')) return;

        // Batched: one multi-VALUES INSERT every ~3s / 20 entries instead of a
        // bookkeeping INSERT per user query. Rides the 'ai' lane either way.
        if (!this._historyBuffer) this._historyBuffer = [];
        this._historyBuffer.push(sql);
        if (this._historyBuffer.length >= 20) {
            this.flushQueryHistory();
        } else if (!this._historyFlushTimer) {
            this._historyFlushTimer = setTimeout(() => this.flushQueryHistory(), 3000);
            if (this._historyFlushTimer.unref) this._historyFlushTimer.unref();
        }
    }

    /**
     * Flush the pending query-history batch. Called on timer/size, before the
     * history endpoint reads, and on close() so nothing recent is lost.
     */
    async flushQueryHistory() {
        if (this._historyFlushTimer) {
            clearTimeout(this._historyFlushTimer);
            this._historyFlushTimer = null;
        }
        if (!this._historyBuffer || this._historyBuffer.length === 0) return;
        const batch = this._historyBuffer.splice(0);
        const values = batch.map(q => `('${q.replace(/'/g, "''")}')`).join(',');
        try {
            await this.query(`INSERT INTO amoxsql_ai.query_history (query) VALUES ${values}`, { lane: 'ai' });
        } catch (e) {
            // History is best-effort bookkeeping — never surface to the caller
        }
    }

    /**
     * Execute a system/internal query that should NOT be logged to history.
     * Prefixes the SQL with a comment tag so _logQuery can identify and skip it.
     * @param {string} sql
     * @param {{lane?: 'main'|'meta'|'ai'}} [options]
     */
    async systemQuery(sql, options = {}) {
        return this.query(`-- AMOX_SYSTEM\n${sql}`, options);
    }

    // ─── Running-query tracking (per lane) ─────────────────────────────────
    // DuckDB's interrupt() cancels whatever runs on the connection — and if
    // nothing runs, the flag can cancel the NEXT statement. Callers that may
    // interrupt (cancel endpoint, client-disconnect) must first check that the
    // query they intend to kill is actually the one running on the lane.
    _setRunning(lane, trackId) {
        if (!this._running) this._running = {};
        this._running[lane] = trackId;
    }
    _clearRunning(lane, trackId) {
        if (this._running && this._running[lane] === trackId) this._running[lane] = null;
    }
    isRunning(lane, trackId) {
        return !!(this._running && this._running[lane] === trackId);
    }

    /**
     * Run SQL and return rows as JSON-safe objects.
     * @param {string} sql
     * @param {{lane?: 'main'|'meta'|'ai', trackId?: string}} [options] - lane defaults to 'main'
     */
    async query(sql, options = {}) {
        const lane = options.lane || 'main';
        const connection = await this._ensureLane(lane);

        // Log it (fire & forget logic inside)
        // Only log if we have an attached DB (implicit check in _logQuery)
        // And ensure we don't cause infinite text loop
        if (sql && !sql.includes('amox_query_history')) {
            this._logQuery(sql);
        }

        try {
            if (options.trackId) this._setRunning(lane, options.trackId);
            // Neo API: run() returns a result with reader-style methods.
            const reader = await connection.run(sql);

            // getRowObjectsJson() handles BigInts safely (as strings) and maps headers.
            const rows = await reader.getRowObjectsJson();
            return rows;

        } catch (err) {
            throw new Error(err?.message || String(err));
        } finally {
            if (options.trackId) this._clearRunning(lane, options.trackId);
        }
    }

    /**
     * Run SQL and return { rows, types }.
     * @param {string} sql
     * @param {{lane?: 'main'|'meta'|'ai'}} [options] - lane defaults to 'main'
     */
    async queryWithMetadata(sql, options = {}) {
        const lane = options.lane || 'main';
        const connection = await this._ensureLane(lane);

        if (sql && !sql.includes('amox_query_history')) {
            this._logQuery(sql);
        }

        try {
            if (options.trackId) this._setRunning(lane, options.trackId);
            const reader = await connection.run(sql);

            const types = {};
            if (reader.columnNames && reader.columnTypes) {
                const names = reader.columnNames();
                const typeObjs = reader.columnTypes();
                for (let i = 0; i < names.length; i++) {
                    types[names[i]] = typeObjs[i].toString();
                }
            }

            const rows = await reader.getRowObjectsJson();
            return { rows, types };

        } catch (err) {
            throw new Error(err?.message || String(err));
        } finally {
            if (options.trackId) this._clearRunning(lane, options.trackId);
        }
    }

    async close() {
        if (!this.connections.main) return;

        // Persist any batched history entries before the DB goes away
        await this.flushQueryHistory().catch(() => {});

        try {
            console.log("[DB Manager] Switching to system context before detaching...");
            // PASO CRÍTICO: "Bajarse de la escalera".
            // Cambiamos a la memoria interna antes de intentar soltar la base de datos externa.
            // `USE` es por conexión: hay que bajarse en TODOS los carriles, o el
            // DETACH fallará porque otro carril sigue "usando" user_db.
            for (const lane of LANES) {
                const conn = this.connections[lane];
                if (!conn) continue;
                try {
                    await conn.run("USE memory");
                } catch (e) {
                    // Si 'memory' falla, intentamos 'main' (depende de la versión de DuckDB)
                    try { await conn.run("USE main"); } catch (e2) { }
                }
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

    /**
     * Interrupt whatever query is running on the given lane ONLY.
     * User cancellation (/api/query/cancel, client disconnect) targets 'main';
     * the AI tool timeout targets 'ai' — neither kills the other's work.
     */
    interruptQuery(lane = 'main') {
        const connection = this._conn(lane);
        if (connection && typeof connection.interrupt === 'function') {
            connection.interrupt();
        }
    }
}

module.exports = new DatabaseManager();
