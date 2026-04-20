/**
 * AmoxSQL AI — DuckDB Persistence Layer
 *
 * Manages the `amoxsql_ai` schema within each project's DuckDB database.
 * Provides CRUD operations for conversations, messages, query results,
 * and chart configs.
 *
 * The schema is created per-project when the database is connected (non-read-only).
 * Each project has its own conversation history, stored locally.
 *
 * All user-supplied values are sanitised through the helpers in _sqlHelpers.js
 * before being interpolated into SQL strings (DuckDB Neo's systemQuery does not
 * accept bind parameters).
 */
const crypto = require('crypto');
const { s, j, n } = require('./_sqlHelpers');

function generateId() {
    return crypto.randomUUID();
}

class AiPersistence {
    /**
     * Initialize the amoxsql_ai schema and tables.
     * Called once per database connection (idempotent via IF NOT EXISTS).
     *
     * @param {object} dbManager - DatabaseManager instance
     */
    async initSchema(dbManager) {
        try {
            await dbManager.systemQuery(`CREATE SCHEMA IF NOT EXISTS amoxsql_ai`);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.conversations (
                    id              VARCHAR PRIMARY KEY,
                    title           VARCHAR DEFAULT 'New Conversation',
                    mode            VARCHAR DEFAULT 'diving',
                    is_starred      BOOLEAN DEFAULT false,
                    provider        VARCHAR,
                    model           VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp,
                    updated_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.messages (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR NOT NULL,
                    role            VARCHAR NOT NULL,
                    content         VARCHAR,
                    tool_calls      VARCHAR,
                    token_count     INTEGER,
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.query_results (
                    id              VARCHAR PRIMARY KEY,
                    message_id      VARCHAR NOT NULL,
                    sql_query       VARCHAR NOT NULL,
                    columns_info    VARCHAR,
                    data            VARCHAR,
                    row_count       INTEGER,
                    execution_time  INTEGER,
                    error           VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.chart_configs (
                    id              VARCHAR PRIMARY KEY,
                    query_result_id VARCHAR NOT NULL,
                    chart_type      VARCHAR,
                    config          VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.memories (
                    id              VARCHAR PRIMARY KEY,
                    category        VARCHAR NOT NULL,
                    content         VARCHAR NOT NULL,
                    superseded_by   VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            // ─── Schema Migration: new columns for conversations ───
            // Each ALTER is attempted individually; if the column already exists
            // DuckDB raises an error that we silence intentionally.
            // Wrapped in a transaction so a partial failure doesn't leave the
            // schema in an inconsistent state.
            const migrationColumns = [
                { name: 'file_path',        type: 'VARCHAR' },
                { name: 'session_name',     type: 'VARCHAR' },
                { name: 'description',      type: 'VARCHAR' },
                { name: 'archived',         type: 'BOOLEAN DEFAULT false' },
                { name: 'context_objects',  type: 'VARCHAR' },
            ];
            for (const col of migrationColumns) {
                try {
                    await dbManager.systemQuery(`BEGIN`);
                    await dbManager.systemQuery(
                        `ALTER TABLE amoxsql_ai.conversations ADD COLUMN ${col.name} ${col.type}`
                    );
                    await dbManager.systemQuery(`COMMIT`);
                } catch (err) {
                    try { await dbManager.systemQuery(`ROLLBACK`); } catch {}
                    // Column already exists — safe to ignore
                    if (!err.message?.includes('already exists') && !err.message?.includes('duplicate')) {
                        console.error(`[AI Persistence] Migration warning for column ${col.name}:`, err.message);
                    }
                }
            }

            // ─── Session Artifacts (Data Diving) ───
            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.session_artifacts (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR NOT NULL,
                    artifact_type   VARCHAR NOT NULL,
                    file_path       VARCHAR,
                    file_name       VARCHAR,
                    created_by      VARCHAR DEFAULT 'ai',
                    sql_snapshot    VARCHAR,
                    metadata        VARCHAR,
                    save_location   VARCHAR DEFAULT 'session',
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            // ─── Analysis Vault ───
            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.analysis_vault (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR,
                    title           VARCHAR NOT NULL,
                    description     VARCHAR,
                    sql_content     VARCHAR,
                    result_snapshot VARCHAR,
                    chart_config    VARCHAR,
                    tags            VARCHAR,
                    source_file     VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp,
                    updated_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            // ─── Query Cache (replaces in-memory LRU Map) ───
            // Survives restarts and long sessions; queryId references remain valid
            // across turns and after context compaction.
            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.query_cache (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR,
                    sql_query       VARCHAR NOT NULL,
                    columns_info    VARCHAR,
                    data            VARCHAR,
                    row_count       INTEGER DEFAULT 0,
                    exec_ms         INTEGER DEFAULT 0,
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            // ─── Agent Plans (Fase 1: Planner-Executor) ───
            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.plans (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR NOT NULL,
                    status          VARCHAR DEFAULT 'pending',
                    steps_json      VARCHAR,
                    goal            VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp,
                    updated_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            // ─── Conversation Metrics (observability) ───
            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.conversation_metrics (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR NOT NULL,
                    turn_idx        INTEGER DEFAULT 0,
                    prompt_tokens   INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    tool_calls_json VARCHAR,
                    latency_ms      INTEGER DEFAULT 0,
                    error           VARCHAR,
                    created_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            // ─── Agent Scratchpad (Fase 2) ───
            // Per-conversation key/value store for intermediate agent notes.
            await dbManager.systemQuery(`
                CREATE TABLE IF NOT EXISTS amoxsql_ai.scratchpad (
                    id              VARCHAR PRIMARY KEY,
                    conversation_id VARCHAR NOT NULL,
                    key             VARCHAR NOT NULL,
                    value           VARCHAR,
                    updated_at      TIMESTAMP DEFAULT current_timestamp
                )
            `);

            console.log('[AI Persistence] Schema amoxsql_ai initialized.');
        } catch (err) {
            console.warn('[AI Persistence] Schema init warning:', err.message);
        }
    }

    // ─── Conversations ───────────────────────────────────────────────────────

    /**
     * Create a new conversation.
     * @returns {object} The created conversation
     */
    async createConversation(dbManager, { mode = 'diving', provider, model, title, file_path, session_name, description } = {}) {
        const id = generateId();
        const resolvedTitle = title || 'New Conversation';

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.conversations
                (id, title, mode, provider, model, file_path, session_name, description)
            VALUES
                (${s(id)}, ${s(resolvedTitle)}, ${s(mode)}, ${s(provider)}, ${s(model)},
                 ${s(file_path)}, ${s(session_name)}, ${s(description)})
        `);

        return {
            id,
            title: resolvedTitle,
            mode,
            provider,
            model,
            is_starred: false,
            file_path: file_path || null,
            session_name: session_name || null,
            description: description || null,
            created_at: new Date().toISOString(),
        };
    }

    /**
     * Get all conversations, newest first.
     * @param {object} options - { search, limit, offset, mode }
     */
    async getConversations(dbManager, { search, limit = 50, offset = 0, mode } = {}) {
        const modeClause = mode ? `AND c.mode = ${s(mode)}` : '';

        if (search) {
            const likeVal = `%${search}%`;
            let query = `
                SELECT DISTINCT c.*
                FROM amoxsql_ai.conversations c
                LEFT JOIN amoxsql_ai.messages m ON m.conversation_id = c.id
                WHERE (c.title ILIKE ${s(likeVal)} OR m.content ILIKE ${s(likeVal)})
                ${modeClause}
                ORDER BY c.updated_at DESC
                LIMIT ${n(limit)}
            `;
            if (offset > 0) query += ` OFFSET ${n(offset)}`;
            return dbManager.systemQuery(query);
        }

        let query = `SELECT * FROM amoxsql_ai.conversations c WHERE 1=1 ${modeClause}`;
        query += ` ORDER BY c.updated_at DESC LIMIT ${n(limit)}`;
        if (offset > 0) query += ` OFFSET ${n(offset)}`;
        return dbManager.systemQuery(query);
    }

    /**
     * Get conversations associated with a specific file (assistant mode).
     */
    async getConversationsByFile(dbManager, filePath) {
        return dbManager.systemQuery(`
            SELECT * FROM amoxsql_ai.conversations
            WHERE file_path = ${s(filePath)} AND mode = 'assistant'
            ORDER BY updated_at DESC
        `);
    }

    /**
     * Get a single conversation with all messages, query results, and chart configs.
     */
    async getConversation(dbManager, id) {
        const conversations = await dbManager.systemQuery(
            `SELECT * FROM amoxsql_ai.conversations WHERE id = ${s(id)}`
        );
        if (conversations.length === 0) return null;

        const conversation = conversations[0];

        // Get messages
        conversation.messages = await dbManager.systemQuery(
            `SELECT * FROM amoxsql_ai.messages WHERE conversation_id = ${s(id)} ORDER BY created_at ASC`
        );

        // Parse tool_calls JSON for each message
        for (const msg of conversation.messages) {
            if (msg.tool_calls) {
                try { msg.tool_calls = JSON.parse(msg.tool_calls); } catch { /* keep as string */ }
            }
        }

        // Get query results for all messages
        const messageIds = conversation.messages.map(m => s(m.id)).join(',');
        if (messageIds) {
            const queryResults = await dbManager.systemQuery(
                `SELECT * FROM amoxsql_ai.query_results WHERE message_id IN (${messageIds}) ORDER BY created_at ASC`
            );
            for (const qr of queryResults) {
                if (qr.columns_info) { try { qr.columns_info = JSON.parse(qr.columns_info); } catch {} }
                if (qr.data)         { try { qr.data         = JSON.parse(qr.data);         } catch {} }
            }
            conversation.queryResults = queryResults;

            // Get chart configs
            const qrIds = queryResults.map(q => s(q.id)).join(',');
            if (qrIds) {
                const chartConfigs = await dbManager.systemQuery(
                    `SELECT * FROM amoxsql_ai.chart_configs WHERE query_result_id IN (${qrIds}) ORDER BY created_at ASC`
                );
                for (const cc of chartConfigs) {
                    if (cc.config) { try { cc.config = JSON.parse(cc.config); } catch {} }
                }
                conversation.chartConfigs = chartConfigs;
            } else {
                conversation.chartConfigs = [];
            }
        } else {
            conversation.queryResults = [];
            conversation.chartConfigs = [];
        }

        // Parse context_objects JSON
        if (conversation.context_objects) {
            try { conversation.context_objects = JSON.parse(conversation.context_objects); }
            catch { conversation.context_objects = []; }
        } else {
            conversation.context_objects = [];
        }

        return conversation;
    }

    /**
     * Delete a conversation and all its messages/results.
     */
    async deleteConversation(dbManager, id) {
        // Get message IDs for cascading deletes
        const messages = await dbManager.systemQuery(
            `SELECT id FROM amoxsql_ai.messages WHERE conversation_id = ${s(id)}`
        );
        const messageIds = messages.map(m => s(m.id)).join(',');

        if (messageIds) {
            const queryResults = await dbManager.systemQuery(
                `SELECT id FROM amoxsql_ai.query_results WHERE message_id IN (${messageIds})`
            );
            const qrIds = queryResults.map(q => s(q.id)).join(',');

            if (qrIds) {
                await dbManager.systemQuery(`DELETE FROM amoxsql_ai.chart_configs WHERE query_result_id IN (${qrIds})`);
            }
            await dbManager.systemQuery(`DELETE FROM amoxsql_ai.query_results WHERE message_id IN (${messageIds})`);
            await dbManager.systemQuery(`DELETE FROM amoxsql_ai.messages WHERE conversation_id = ${s(id)}`);
        }

        await dbManager.systemQuery(`DELETE FROM amoxsql_ai.session_artifacts WHERE conversation_id = ${s(id)}`);
        await dbManager.systemQuery(`DELETE FROM amoxsql_ai.conversations WHERE id = ${s(id)}`);
        return { success: true };
    }

    /**
     * Update session name for a diving conversation.
     */
    async updateSessionName(dbManager, id, sessionName) {
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations
            SET session_name = ${s(sessionName)}, updated_at = current_timestamp
            WHERE id = ${s(id)}
        `);
        return { success: true };
    }

    /**
     * Persist context objects (dragged tables/files) for a conversation.
     * @param {Array} contextObjects - Array of {type, name, path?} objects
     */
    async updateContextObjects(dbManager, id, contextObjects) {
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations
            SET context_objects = ${j(contextObjects)}, updated_at = current_timestamp
            WHERE id = ${s(id)}
        `);
        return { success: true };
    }

    /**
     * Toggle the starred status of a conversation.
     */
    async toggleStar(dbManager, id) {
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations
            SET is_starred = NOT is_starred, updated_at = current_timestamp
            WHERE id = ${s(id)}
        `);
        const result = await dbManager.systemQuery(
            `SELECT is_starred FROM amoxsql_ai.conversations WHERE id = ${s(id)}`
        );
        return { is_starred: result[0]?.is_starred };
    }

    /**
     * Update conversation title.
     */
    async updateTitle(dbManager, id, title) {
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations
            SET title = ${s(title)}, updated_at = current_timestamp
            WHERE id = ${s(id)}
        `);
        return { success: true };
    }

    // ─── Messages ────────────────────────────────────────────────────────────

    /**
     * Add a message to a conversation.
     * @returns {object} The created message with its ID
     */
    async addMessage(dbManager, { conversationId, role, content, toolCalls, tokenCount }) {
        const id = generateId();

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.messages
                (id, conversation_id, role, content, tool_calls, token_count)
            VALUES
                (${s(id)}, ${s(conversationId)}, ${s(role)}, ${s(content || '')},
                 ${j(toolCalls)}, ${n(tokenCount)})
        `);

        // Keep conversation's updated_at current
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations
            SET updated_at = current_timestamp
            WHERE id = ${s(conversationId)}
        `);

        return { id, conversationId, role, content, toolCalls, tokenCount, created_at: new Date().toISOString() };
    }

    // ─── Query Results ────────────────────────────────────────────────────────

    /**
     * Save a query result from a tool call.
     */
    async saveQueryResult(dbManager, { messageId, sqlQuery, columns, data, rowCount, executionTime, error }) {
        const id = generateId();
        // Limit stored data to 500 rows to cap blob size
        const limitedData = data ? data.slice(0, 500) : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.query_results
                (id, message_id, sql_query, columns_info, data, row_count, execution_time, error)
            VALUES
                (${s(id)}, ${s(messageId)}, ${s(sqlQuery)},
                 ${j(columns)}, ${j(limitedData)},
                 ${n(rowCount)}, ${n(executionTime)}, ${s(error)})
        `);

        return { id };
    }

    // ─── Chart Configs ────────────────────────────────────────────────────────

    /**
     * Save a chart configuration.
     */
    async saveChartConfig(dbManager, { queryResultId, chartType, config }) {
        const id = generateId();

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.chart_configs (id, query_result_id, chart_type, config)
            VALUES (${s(id)}, ${s(queryResultId)}, ${s(chartType || '')}, ${j(config)})
        `);

        return { id };
    }

    // ─── Memories ─────────────────────────────────────────────────────────────

    async getMemories(dbManager) {
        try {
            return await dbManager.systemQuery(
                `SELECT * FROM amoxsql_ai.memories WHERE superseded_by IS NULL ORDER BY created_at DESC`
            );
        } catch {
            return [];
        }
    }

    async addMemory(dbManager, { category, content }) {
        const id = generateId();
        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.memories (id, category, content)
            VALUES (${s(id)}, ${s(category)}, ${s(content)})
        `);
        return { id };
    }

    async deleteMemory(dbManager, id) {
        await dbManager.systemQuery(
            `DELETE FROM amoxsql_ai.memories WHERE id = ${s(id)}`
        );
        return { success: true };
    }

    async updateMemory(dbManager, id, { content, category }) {
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.memories
            SET content = ${s(content)}, category = ${s(category || '')}
            WHERE id = ${s(id)}
        `);
        return { success: true };
    }

    // ─── Session Artifacts ────────────────────────────────────────────────────

    /**
     * Create an artifact linked to a diving session.
     */
    async createArtifact(dbManager, { conversationId, artifactType, filePath, fileName, createdBy = 'ai', sqlSnapshot, metadata, saveLocation = 'session' }) {
        const id = generateId();

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.session_artifacts
                (id, conversation_id, artifact_type, file_path, file_name,
                 created_by, sql_snapshot, metadata, save_location)
            VALUES
                (${s(id)}, ${s(conversationId)}, ${s(artifactType)},
                 ${s(filePath)}, ${s(fileName)}, ${s(createdBy)},
                 ${s(sqlSnapshot)}, ${j(metadata)}, ${s(saveLocation)})
        `);

        return { id, conversationId, artifactType, filePath, fileName, createdBy, saveLocation, created_at: new Date().toISOString() };
    }

    /**
     * Get all artifacts for a session.
     */
    async getArtifacts(dbManager, conversationId) {
        const artifacts = await dbManager.systemQuery(`
            SELECT * FROM amoxsql_ai.session_artifacts
            WHERE conversation_id = ${s(conversationId)}
            ORDER BY created_at ASC
        `);
        for (const a of artifacts) {
            if (a.metadata) { try { a.metadata = JSON.parse(a.metadata); } catch {} }
        }
        return artifacts;
    }

    /**
     * Delete an artifact.
     */
    async deleteArtifact(dbManager, id) {
        await dbManager.systemQuery(
            `DELETE FROM amoxsql_ai.session_artifacts WHERE id = ${s(id)}`
        );
        return { success: true };
    }

    /**
     * Get diving sessions with artifact counts.
     */
    async getDivingSessions(dbManager, { search, limit = 50, offset = 0 } = {}) {
        const conditions = [`c.mode = 'diving'`];
        if (search) {
            const likeVal = `%${search}%`;
            conditions.push(`(c.title ILIKE ${s(likeVal)} OR c.session_name ILIKE ${s(likeVal)})`);
        }

        const query = `
            SELECT c.*, COUNT(a.id) AS artifact_count
            FROM amoxsql_ai.conversations c
            LEFT JOIN amoxsql_ai.session_artifacts a ON a.conversation_id = c.id
            WHERE ${conditions.join(' AND ')}
            GROUP BY c.id, c.title, c.mode, c.is_starred, c.provider, c.model,
                     c.created_at, c.updated_at, c.file_path, c.session_name,
                     c.description, c.archived
            ORDER BY c.updated_at DESC
            LIMIT ${n(limit)}${offset > 0 ? ` OFFSET ${n(offset)}` : ''}
        `;
        return dbManager.systemQuery(query);
    }

    // ─── Query Cache ──────────────────────────────────────────────────────────

    /**
     * Save an execute_sql result to the persistent query cache.
     * Replaces the in-memory LRU Map so queryIds survive restarts and long sessions.
     * @returns {string} The queryId stored
     */
    async saveQueryCache(dbManager, { queryId, conversationId, sqlQuery, columns, data, rowCount, execMs }) {
        const limitedData = data ? data.slice(0, 500) : null;
        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.query_cache
                (id, conversation_id, sql_query, columns_info, data, row_count, exec_ms)
            VALUES
                (${s(queryId)}, ${s(conversationId || null)}, ${s(sqlQuery)},
                 ${j(columns)}, ${j(limitedData)}, ${n(rowCount)}, ${n(execMs)})
        `);
        return queryId;
    }

    /**
     * Retrieve a cached query result by queryId.
     * Returns null if not found.
     */
    async getQueryCache(dbManager, queryId) {
        try {
            const rows = await dbManager.systemQuery(
                `SELECT * FROM amoxsql_ai.query_cache WHERE id = ${s(queryId)}`
            );
            if (rows.length === 0) return null;
            const row = rows[0];
            if (row.columns_info) { try { row.columns_info = JSON.parse(row.columns_info); } catch {} }
            if (row.data)         { try { row.data         = JSON.parse(row.data);         } catch {} }
            return row;
        } catch {
            return null;
        }
    }

    /**
     * Prune old query cache entries (keep latest N per conversation).
     * Called opportunistically after each save to avoid unbounded growth.
     */
    async pruneQueryCache(dbManager, conversationId, keepLatest = 100) {
        if (!conversationId) return;
        try {
            await dbManager.systemQuery(`
                DELETE FROM amoxsql_ai.query_cache
                WHERE conversation_id = ${s(conversationId)}
                AND id NOT IN (
                    SELECT id FROM amoxsql_ai.query_cache
                    WHERE conversation_id = ${s(conversationId)}
                    ORDER BY created_at DESC
                    LIMIT ${n(keepLatest)}
                )
            `);
        } catch { /* non-critical */ }
    }

    // ─── Plans ────────────────────────────────────────────────────────────────

    async savePlan(dbManager, { id, conversationId, goal, steps }) {
        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.plans (id, conversation_id, goal, steps_json, status)
            VALUES (${s(id)}, ${s(conversationId)}, ${s(goal)}, ${j(steps)}, 'pending')
        `);
        return { id, conversationId, goal, steps, status: 'pending' };
    }

    async updatePlan(dbManager, id, { status, steps }) {
        const sets = [`updated_at = current_timestamp`];
        if (status !== undefined) sets.push(`status = ${s(status)}`);
        if (steps  !== undefined) sets.push(`steps_json = ${j(steps)}`);
        await dbManager.systemQuery(
            `UPDATE amoxsql_ai.plans SET ${sets.join(', ')} WHERE id = ${s(id)}`
        );
        return { success: true };
    }

    async getActivePlan(dbManager, conversationId) {
        try {
            const rows = await dbManager.systemQuery(`
                SELECT * FROM amoxsql_ai.plans
                WHERE conversation_id = ${s(conversationId)}
                AND status NOT IN ('completed', 'cancelled')
                ORDER BY created_at DESC LIMIT 1
            `);
            if (rows.length === 0) return null;
            const plan = rows[0];
            if (plan.steps_json) { try { plan.steps = JSON.parse(plan.steps_json); } catch { plan.steps = []; } }
            return plan;
        } catch { return null; }
    }

    // ─── Conversation Metrics ─────────────────────────────────────────────────

    async saveMetrics(dbManager, { conversationId, turnIdx, promptTokens, completionTokens, toolCalls, latencyMs, error }) {
        const id = generateId();
        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.conversation_metrics
                (id, conversation_id, turn_idx, prompt_tokens, completion_tokens, tool_calls_json, latency_ms, error)
            VALUES
                (${s(id)}, ${s(conversationId)}, ${n(turnIdx || 0)},
                 ${n(promptTokens || 0)}, ${n(completionTokens || 0)},
                 ${j(toolCalls)}, ${n(latencyMs || 0)}, ${s(error || null)})
        `).catch(() => { /* non-critical */ });
        return { id };
    }

    // ─── Analysis Vault ───────────────────────────────────────────────────────

    /**
     * Save an analysis to the vault.
     */
    async saveToVault(dbManager, { conversationId, title, description, sqlContent, resultSnapshot, chartConfig, tags, sourceFile }) {
        const id = generateId();

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.analysis_vault
                (id, conversation_id, title, description, sql_content,
                 result_snapshot, chart_config, tags, source_file)
            VALUES
                (${s(id)}, ${s(conversationId)}, ${s(title)}, ${s(description)},
                 ${s(sqlContent)}, ${j(resultSnapshot)}, ${j(chartConfig)},
                 ${s(tags)}, ${s(sourceFile)})
        `);

        return { id, title, description, tags, sourceFile, created_at: new Date().toISOString() };
    }

    /**
     * Get vault entries with optional search and tag filter.
     */
    async getVaultEntries(dbManager, { search, tags, limit = 50, offset = 0 } = {}) {
        const conditions = [];
        if (search) {
            const likeVal = `%${search}%`;
            conditions.push(`(title ILIKE ${s(likeVal)} OR description ILIKE ${s(likeVal)})`);
        }
        if (tags) {
            conditions.push(`tags ILIKE ${s(`%${tags}%`)}`);
        }

        let query = `SELECT * FROM amoxsql_ai.analysis_vault`;
        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ` ORDER BY updated_at DESC LIMIT ${n(limit)}`;
        if (offset > 0) query += ` OFFSET ${n(offset)}`;

        const entries = await dbManager.systemQuery(query);
        for (const e of entries) {
            if (e.result_snapshot) { try { e.result_snapshot = JSON.parse(e.result_snapshot); } catch {} }
            if (e.chart_config)    { try { e.chart_config    = JSON.parse(e.chart_config);    } catch {} }
        }
        return entries;
    }

    /**
     * Update a vault entry.
     */
    async updateVaultEntry(dbManager, id, changes) {
        const sets = [];
        if (changes.title       !== undefined) sets.push(`title       = ${s(changes.title)}`);
        if (changes.description !== undefined) sets.push(`description = ${s(changes.description)}`);
        if (changes.tags        !== undefined) sets.push(`tags        = ${s(changes.tags)}`);
        if (sets.length === 0) return { success: true };

        sets.push(`updated_at = current_timestamp`);
        await dbManager.systemQuery(
            `UPDATE amoxsql_ai.analysis_vault SET ${sets.join(', ')} WHERE id = ${s(id)}`
        );
        return { success: true };
    }

    /**
     * Delete a vault entry.
     */
    async deleteVaultEntry(dbManager, id) {
        await dbManager.systemQuery(
            `DELETE FROM amoxsql_ai.analysis_vault WHERE id = ${s(id)}`
        );
        return { success: true };
    }

    // ─── Agent Scratchpad (Fase 2) ────────────────────────────────────────────

    /**
     * Write (upsert) a scratchpad note for a conversation.
     * If a note with the same key already exists it is replaced.
     */
    async saveScratchpad(dbManager, conversationId, key, value) {
        // DELETE + INSERT (DuckDB doesn't support ON CONFLICT UPDATE yet on all versions)
        await dbManager.systemQuery(
            `DELETE FROM amoxsql_ai.scratchpad
             WHERE conversation_id = ${s(conversationId)} AND key = ${s(key)}`
        );
        const id = generateId();
        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.scratchpad (id, conversation_id, key, value, updated_at)
            VALUES (${s(id)}, ${s(conversationId)}, ${s(key)}, ${s(value)}, current_timestamp)
        `);
        return { id, key, value };
    }

    /**
     * Read scratchpad notes for a conversation.
     * @param {string|null} key - If provided, returns only that entry; otherwise returns all.
     */
    async getScratchpad(dbManager, conversationId, key = null) {
        const keyFilter = key ? `AND key = ${s(key)}` : '';
        const rows = await dbManager.systemQuery(`
            SELECT key, value, updated_at
            FROM amoxsql_ai.scratchpad
            WHERE conversation_id = ${s(conversationId)} ${keyFilter}
            ORDER BY updated_at ASC
        `);
        return rows.map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at }));
    }
}

module.exports = new AiPersistence();
