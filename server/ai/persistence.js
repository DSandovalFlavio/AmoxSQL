/**
 * AmoxSQL AI — DuckDB Persistence Layer
 * 
 * Manages the `amoxsql_ai` schema within each project's DuckDB database.
 * Provides CRUD operations for conversations, messages, query results,
 * and chart configs.
 * 
 * The schema is created per-project when the database is connected (non-read-only).
 * Each project has its own conversation history, stored locally.
 */
const crypto = require('crypto');

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
            const migrationColumns = [
                { name: 'file_path', type: 'VARCHAR' },
                { name: 'session_name', type: 'VARCHAR' },
                { name: 'description', type: 'VARCHAR' },
                { name: 'archived', type: 'BOOLEAN DEFAULT false' },
            ];
            for (const col of migrationColumns) {
                try {
                    await dbManager.systemQuery(
                        `ALTER TABLE amoxsql_ai.conversations ADD COLUMN ${col.name} ${col.type}`
                    );
                } catch { /* column already exists — safe to ignore */ }
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

            console.log('[AI Persistence] Schema amoxsql_ai initialized.');
        } catch (err) {
            console.warn('[AI Persistence] Schema init warning:', err.message);
        }
    }

    // ─── Conversations ───

    /**
     * Create a new conversation.
     * @returns {object} The created conversation
     */
    async createConversation(dbManager, { mode = 'diving', provider, model, title, file_path, session_name, description } = {}) {
        const id = generateId();
        const safeTitle = (title || 'New Conversation').replace(/'/g, "''");
        const safeProvider = (provider || '').replace(/'/g, "''");
        const safeModel = (model || '').replace(/'/g, "''");
        const safeFilePath = file_path ? file_path.replace(/'/g, "''") : null;
        const safeSessionName = session_name ? session_name.replace(/'/g, "''") : null;
        const safeDescription = description ? description.replace(/'/g, "''") : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.conversations (id, title, mode, provider, model, file_path, session_name, description)
            VALUES ('${id}', '${safeTitle}', '${mode}', '${safeProvider}', '${safeModel}', ${safeFilePath ? `'${safeFilePath}'` : 'NULL'}, ${safeSessionName ? `'${safeSessionName}'` : 'NULL'}, ${safeDescription ? `'${safeDescription}'` : 'NULL'})
        `);

        return { id, title: title || 'New Conversation', mode, provider, model, is_starred: false, file_path: file_path || null, session_name: session_name || null, description: description || null, created_at: new Date().toISOString() };
    }

    /**
     * Get all conversations, newest first.
     * @param {object} options - { search, limit }
     */
    async getConversations(dbManager, { search, limit = 50, offset = 0, mode } = {}) {
        const conditions = [];
        if (search) {
            const safeSearch = search.replace(/'/g, "''");
            conditions.push(`title ILIKE '%${safeSearch}%'`);
        }
        if (mode) {
            conditions.push(`mode = '${mode}'`);
        }
        let query = `SELECT * FROM amoxsql_ai.conversations`;
        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ` ORDER BY updated_at DESC LIMIT ${limit}`;
        if (offset > 0) query += ` OFFSET ${offset}`;

        return dbManager.systemQuery(query);
    }

    /**
     * Get conversations associated with a specific file (assistant mode).
     */
    async getConversationsByFile(dbManager, filePath) {
        const safePath = filePath.replace(/'/g, "''");
        return dbManager.systemQuery(`
            SELECT * FROM amoxsql_ai.conversations
            WHERE file_path = '${safePath}' AND mode = 'assistant'
            ORDER BY updated_at DESC
        `);
    }

    /**
     * Get a single conversation with all messages, query results, and chart configs.
     */
    async getConversation(dbManager, id) {
        const conversations = await dbManager.systemQuery(
            `SELECT * FROM amoxsql_ai.conversations WHERE id = '${id}'`
        );
        if (conversations.length === 0) return null;

        const conversation = conversations[0];

        // Get messages
        conversation.messages = await dbManager.systemQuery(
            `SELECT * FROM amoxsql_ai.messages WHERE conversation_id = '${id}' ORDER BY created_at ASC`
        );

        // Parse tool_calls JSON for each message
        for (const msg of conversation.messages) {
            if (msg.tool_calls) {
                try { msg.tool_calls = JSON.parse(msg.tool_calls); } catch { /* keep as string */ }
            }
        }

        // Get query results for all messages
        const messageIds = conversation.messages.map(m => `'${m.id}'`).join(',');
        if (messageIds) {
            const queryResults = await dbManager.systemQuery(
                `SELECT * FROM amoxsql_ai.query_results WHERE message_id IN (${messageIds}) ORDER BY created_at ASC`
            );
            for (const qr of queryResults) {
                if (qr.columns_info) { try { qr.columns_info = JSON.parse(qr.columns_info); } catch {} }
                if (qr.data) { try { qr.data = JSON.parse(qr.data); } catch {} }
            }
            conversation.queryResults = queryResults;

            // Get chart configs
            const qrIds = queryResults.map(q => `'${q.id}'`).join(',');
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

        return conversation;
    }

    /**
     * Delete a conversation and all its messages/results.
     */
    async deleteConversation(dbManager, id) {
        // Get message IDs for cascading
        const messages = await dbManager.systemQuery(
            `SELECT id FROM amoxsql_ai.messages WHERE conversation_id = '${id}'`
        );
        const messageIds = messages.map(m => `'${m.id}'`).join(',');

        if (messageIds) {
            // Get query result IDs for chart config cascade
            const queryResults = await dbManager.systemQuery(
                `SELECT id FROM amoxsql_ai.query_results WHERE message_id IN (${messageIds})`
            );
            const qrIds = queryResults.map(q => `'${q.id}'`).join(',');

            if (qrIds) {
                await dbManager.systemQuery(`DELETE FROM amoxsql_ai.chart_configs WHERE query_result_id IN (${qrIds})`);
            }
            await dbManager.systemQuery(`DELETE FROM amoxsql_ai.query_results WHERE message_id IN (${messageIds})`);
            await dbManager.systemQuery(`DELETE FROM amoxsql_ai.messages WHERE conversation_id = '${id}'`);
        }

        // Delete session artifacts
        await dbManager.systemQuery(`DELETE FROM amoxsql_ai.session_artifacts WHERE conversation_id = '${id}'`);

        await dbManager.systemQuery(`DELETE FROM amoxsql_ai.conversations WHERE id = '${id}'`);
        return { success: true };
    }

    /**
     * Update session name for a diving conversation.
     */
    async updateSessionName(dbManager, id, sessionName) {
        const safeName = sessionName.replace(/'/g, "''");
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations
            SET session_name = '${safeName}', updated_at = current_timestamp
            WHERE id = '${id}'
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
            WHERE id = '${id}'
        `);
        const result = await dbManager.systemQuery(`SELECT is_starred FROM amoxsql_ai.conversations WHERE id = '${id}'`);
        return { is_starred: result[0]?.is_starred };
    }

    /**
     * Update conversation title.
     */
    async updateTitle(dbManager, id, title) {
        const safeTitle = title.replace(/'/g, "''");
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations 
            SET title = '${safeTitle}', updated_at = current_timestamp
            WHERE id = '${id}'
        `);
        return { success: true };
    }

    // ─── Messages ───

    /**
     * Add a message to a conversation.
     * @returns {object} The created message with its ID
     */
    async addMessage(dbManager, { conversationId, role, content, toolCalls, tokenCount }) {
        const id = generateId();
        const safeContent = content ? content.replace(/'/g, "''") : '';
        const safeToolCalls = toolCalls ? JSON.stringify(toolCalls).replace(/'/g, "''") : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.messages (id, conversation_id, role, content, tool_calls, token_count)
            VALUES ('${id}', '${conversationId}', '${role}', '${safeContent}', ${safeToolCalls ? `'${safeToolCalls}'` : 'NULL'}, ${tokenCount || 'NULL'})
        `);

        // Update conversation's updated_at
        await dbManager.systemQuery(`
            UPDATE amoxsql_ai.conversations SET updated_at = current_timestamp WHERE id = '${conversationId}'
        `);

        return { id, conversationId, role, content, toolCalls, tokenCount, created_at: new Date().toISOString() };
    }

    // ─── Query Results ───

    /**
     * Save a query result from a tool call.
     */
    async saveQueryResult(dbManager, { messageId, sqlQuery, columns, data, rowCount, executionTime, error }) {
        const id = generateId();
        const safeSql = sqlQuery.replace(/'/g, "''");
        const safeColumns = columns ? JSON.stringify(columns).replace(/'/g, "''") : null;
        // Limit stored data to 500 rows
        const limitedData = data ? data.slice(0, 500) : null;
        const safeData = limitedData ? JSON.stringify(limitedData).replace(/'/g, "''") : null;
        const safeError = error ? error.replace(/'/g, "''") : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.query_results (id, message_id, sql_query, columns_info, data, row_count, execution_time, error)
            VALUES ('${id}', '${messageId}', '${safeSql}', ${safeColumns ? `'${safeColumns}'` : 'NULL'}, ${safeData ? `'${safeData}'` : 'NULL'}, ${rowCount || 'NULL'}, ${executionTime || 'NULL'}, ${safeError ? `'${safeError}'` : 'NULL'})
        `);

        return { id };
    }

    // ─── Chart Configs ───

    /**
     * Save a chart configuration.
     */
    async saveChartConfig(dbManager, { queryResultId, chartType, config }) {
        const id = generateId();
        const safeConfig = config ? JSON.stringify(config).replace(/'/g, "''") : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.chart_configs (id, query_result_id, chart_type, config)
            VALUES ('${id}', '${queryResultId}', '${chartType || ''}', ${safeConfig ? `'${safeConfig}'` : 'NULL'})
        `);

        return { id };
    }

    // ─── Memories ───

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
        const safeContent = content.replace(/'/g, "''");
        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.memories (id, category, content)
            VALUES ('${id}', '${category}', '${safeContent}')
        `);
        return { id };
    }

    // ─── Session Artifacts ───

    /**
     * Create an artifact linked to a diving session.
     */
    async createArtifact(dbManager, { conversationId, artifactType, filePath, fileName, createdBy = 'ai', sqlSnapshot, metadata, saveLocation = 'session' }) {
        const id = generateId();
        const safePath = filePath ? filePath.replace(/'/g, "''") : null;
        const safeName = fileName ? fileName.replace(/'/g, "''") : null;
        const safeSql = sqlSnapshot ? sqlSnapshot.replace(/'/g, "''") : null;
        const safeMeta = metadata ? JSON.stringify(metadata).replace(/'/g, "''") : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.session_artifacts (id, conversation_id, artifact_type, file_path, file_name, created_by, sql_snapshot, metadata, save_location)
            VALUES ('${id}', '${conversationId}', '${artifactType}', ${safePath ? `'${safePath}'` : 'NULL'}, ${safeName ? `'${safeName}'` : 'NULL'}, '${createdBy}', ${safeSql ? `'${safeSql}'` : 'NULL'}, ${safeMeta ? `'${safeMeta}'` : 'NULL'}, '${saveLocation}')
        `);

        return { id, conversationId, artifactType, filePath, fileName, createdBy, saveLocation, created_at: new Date().toISOString() };
    }

    /**
     * Get all artifacts for a session.
     */
    async getArtifacts(dbManager, conversationId) {
        const artifacts = await dbManager.systemQuery(`
            SELECT * FROM amoxsql_ai.session_artifacts
            WHERE conversation_id = '${conversationId}'
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
        await dbManager.systemQuery(`DELETE FROM amoxsql_ai.session_artifacts WHERE id = '${id}'`);
        return { success: true };
    }

    /**
     * Get diving sessions with artifact counts.
     */
    async getDivingSessions(dbManager, { search, limit = 50, offset = 0 } = {}) {
        const conditions = [`c.mode = 'diving'`];
        if (search) {
            const safeSearch = search.replace(/'/g, "''");
            conditions.push(`(c.title ILIKE '%${safeSearch}%' OR c.session_name ILIKE '%${safeSearch}%')`);
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
            LIMIT ${limit}${offset > 0 ? ` OFFSET ${offset}` : ''}
        `;
        return dbManager.systemQuery(query);
    }

    // ─── Analysis Vault ───

    /**
     * Save an analysis to the vault.
     */
    async saveToVault(dbManager, { conversationId, title, description, sqlContent, resultSnapshot, chartConfig, tags, sourceFile }) {
        const id = generateId();
        const safeTitle = title.replace(/'/g, "''");
        const safeDesc = description ? description.replace(/'/g, "''") : null;
        const safeSql = sqlContent ? sqlContent.replace(/'/g, "''") : null;
        const safeResult = resultSnapshot ? JSON.stringify(resultSnapshot).replace(/'/g, "''") : null;
        const safeChart = chartConfig ? JSON.stringify(chartConfig).replace(/'/g, "''") : null;
        const safeTags = tags ? tags.replace(/'/g, "''") : null;
        const safeSource = sourceFile ? sourceFile.replace(/'/g, "''") : null;

        await dbManager.systemQuery(`
            INSERT INTO amoxsql_ai.analysis_vault (id, conversation_id, title, description, sql_content, result_snapshot, chart_config, tags, source_file)
            VALUES ('${id}', ${conversationId ? `'${conversationId}'` : 'NULL'}, '${safeTitle}', ${safeDesc ? `'${safeDesc}'` : 'NULL'}, ${safeSql ? `'${safeSql}'` : 'NULL'}, ${safeResult ? `'${safeResult}'` : 'NULL'}, ${safeChart ? `'${safeChart}'` : 'NULL'}, ${safeTags ? `'${safeTags}'` : 'NULL'}, ${safeSource ? `'${safeSource}'` : 'NULL'})
        `);

        return { id, title, description, tags, sourceFile, created_at: new Date().toISOString() };
    }

    /**
     * Get vault entries with optional search and tag filter.
     */
    async getVaultEntries(dbManager, { search, tags, limit = 50, offset = 0 } = {}) {
        const conditions = [];
        if (search) {
            const safeSearch = search.replace(/'/g, "''");
            conditions.push(`(title ILIKE '%${safeSearch}%' OR description ILIKE '%${safeSearch}%')`);
        }
        if (tags) {
            const safeTags = tags.replace(/'/g, "''");
            conditions.push(`tags ILIKE '%${safeTags}%'`);
        }

        let query = `SELECT * FROM amoxsql_ai.analysis_vault`;
        if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
        query += ` ORDER BY updated_at DESC LIMIT ${limit}`;
        if (offset > 0) query += ` OFFSET ${offset}`;

        const entries = await dbManager.systemQuery(query);
        for (const e of entries) {
            if (e.result_snapshot) { try { e.result_snapshot = JSON.parse(e.result_snapshot); } catch {} }
            if (e.chart_config) { try { e.chart_config = JSON.parse(e.chart_config); } catch {} }
        }
        return entries;
    }

    /**
     * Update a vault entry.
     */
    async updateVaultEntry(dbManager, id, changes) {
        const sets = [];
        if (changes.title !== undefined) sets.push(`title = '${changes.title.replace(/'/g, "''")}'`);
        if (changes.description !== undefined) sets.push(`description = '${changes.description.replace(/'/g, "''")}'`);
        if (changes.tags !== undefined) sets.push(`tags = '${changes.tags.replace(/'/g, "''")}'`);
        if (sets.length === 0) return { success: true };

        sets.push(`updated_at = current_timestamp`);
        await dbManager.systemQuery(`UPDATE amoxsql_ai.analysis_vault SET ${sets.join(', ')} WHERE id = '${id}'`);
        return { success: true };
    }

    /**
     * Delete a vault entry.
     */
    async deleteVaultEntry(dbManager, id) {
        await dbManager.systemQuery(`DELETE FROM amoxsql_ai.analysis_vault WHERE id = '${id}'`);
        return { success: true };
    }
}

module.exports = new AiPersistence();
