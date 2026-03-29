/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { exec, execSync } = require('child_process');
const dbManager = require('./DatabaseManager');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// FIX: Handle BigInt serialization for JSON
BigInt.prototype.toJSON = function () {
    return this.toString();
};

let ROOT_DIR = process.cwd();

/* --- Project Management APIs --- */
app.get('/api/project/path', (req, res) => {
    res.json({ path: ROOT_DIR });
});

app.post('/api/project/open', async (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath) return res.status(400).json({ error: 'Path is required' });

    if (!fs.existsSync(newPath)) return res.status(404).json({ error: 'Path does not exist' });
    if (!fs.statSync(newPath).isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    try {
        // CLOSE and RE-INIT previous DB connections safely before switching context
        await dbManager.reinitializeSystem();

        ROOT_DIR = newPath;
        process.chdir(ROOT_DIR);
        console.log(`Project root changed to: ${ROOT_DIR}`);
        res.json({ success: true, path: ROOT_DIR });
    } catch (err) {
        console.error("Failed to change directory", err);
        res.status(500).json({ error: 'Failed to change directory', details: err.message });
    }
});

app.get('/api/project/scan-dbs', (req, res) => {
    try {
        const files = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
        const dbFiles = files
            .filter(file => file.isFile() && (file.name.endsWith('.duckdb') || file.name.endsWith('.db') || file.name.endsWith('.wal')))
            .map(file => ({
                name: file.name,
                path: file.name // Relative path from root is enough for now
            }));
        res.json(dbFiles);
    } catch (err) {
        res.status(500).json({ error: 'Failed to scan for databases', details: err.message });
    }
});

app.get('/api/files/list', (req, res) => {
    const relativePath = req.query.path || '';
    const dirPath = path.resolve(ROOT_DIR, relativePath);

    // Security check: Ensure we don't go above ROOT_DIR unless authorized (skipping complex checks for local tool)
    if (!dirPath.startsWith(ROOT_DIR)) {
        // Warning: This simplistic check might block valid sub-paths if ROOT_DIR has symlinks, 
        // but it's a basic safeguard.
    }

    try {
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            return res.json([]);
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: path.relative(ROOT_DIR, path.join(dirPath, entry.name)).replace(/\\/g, '/')
        }));

        // Sort: Directories first, then files
        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        res.json(result);
    } catch (err) {
        console.error("List files failed:", err);
        res.status(500).json({ error: 'Failed to list files', details: err.message });
    }
});

/* --- Database Management APIs --- */

app.post('/api/db/connect', async (req, res) => {
    const { path: dbPath, readOnly } = req.body;
    try {
        await dbManager.connect(dbPath, ROOT_DIR, { readOnly: !!readOnly });

        // Initialize AI persistence schema for this project's database
        if (!readOnly) {
            try {
                const aiPersistence = require('./ai/persistence');
                await aiPersistence.initSchema(dbManager);
            } catch (aiErr) {
                console.warn('[AI] Schema init warning (non-fatal):', aiErr.message);
            }
        }

        res.json({ success: true, path: dbManager.getCurrentPath() });
    } catch (err) {
        console.error("DB Connection Failed:", err);
        res.status(500).json({ error: 'Failed to connect to database', details: err.message });
    }
});

// API: Explicitly Close Database (Reset to Memory)
app.post('/api/db/close', async (req, res) => {
    try {
        await dbManager.close();
        res.json({ success: true, message: 'Database closed, reset to :memory:' });
    } catch (err) {
        console.error("DB Close Failed:", err);
        res.status(500).json({ error: 'Failed to close database', details: err.message });
    }
});

app.get('/api/db/location', (req, res) => {
    res.json({ path: dbManager.getCurrentPath() });
});

app.get('/api/db/tables', async (req, res) => {
    try {
        const tables = await dbManager.systemQuery("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='main'");

        const result = [];
        for (const t of tables) {
            const tableName = t.table_name;
            const tableType = t.table_type;
            // Hide internal history table and memory-specific tables if any
            if (tableName === 'amox_query_history') continue;

            const columns = await dbManager.systemQuery(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}' AND table_schema = 'main'`);
            result.push({ name: tableName, type: tableType, columns: columns });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
    }
});

// ER Diagram schema — enriched with constraints
app.get('/api/db/er-schema', async (req, res) => {
    try {
        // 1. Get all tables
        const tables = await dbManager.systemQuery(
            "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='main' AND table_name != 'amox_query_history'"
        );

        const result = [];
        for (const t of tables) {
            // 2. Columns for each table
            const columns = await dbManager.systemQuery(
                `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${t.table_name}' AND table_schema = 'main' ORDER BY ordinal_position`
            );

            // 3. Constraints (PK, FK, UNIQUE)
            let constraints = [];
            try {
                constraints = await dbManager.systemQuery(
                    `SELECT tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
                     FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                     LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND ccu.table_name != tc.table_name
                     WHERE tc.table_name = '${t.table_name}' AND tc.table_schema = 'main'`
                );
            } catch (e) { /* constraints not available */ }

            const pkColumns = new Set(constraints.filter(c => c.constraint_type === 'PRIMARY KEY').map(c => c.column_name));
            const fkMap = {};
            for (const c of constraints.filter(c => c.constraint_type === 'FOREIGN KEY')) {
                fkMap[c.column_name] = { table: c.foreign_table_name, column: c.foreign_column_name };
            }

            result.push({
                name: t.table_name,
                type: t.table_type,
                columns: columns.map(c => ({
                    name: c.column_name,
                    type: c.data_type,
                    nullable: c.is_nullable === 'YES',
                    isPK: pkColumns.has(c.column_name),
                    fk: fkMap[c.column_name] || null,
                })),
            });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch ER schema', details: err.message });
    }
});

app.get('/api/db/file-schema', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path required' });

        let fullSourcePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
        fullSourcePath = fullSourcePath.replace(/\\/g, '/');

        const describe = await dbManager.systemQuery(`DESCRIBE SELECT * FROM '${fullSourcePath}'`);
        res.json(describe);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch file schema', details: err.message });
    }
});

app.get('/api/db/history', async (req, res) => {
    try {
        // Check if history table exists first to avoid error
        const check = await dbManager.systemQuery("SELECT count(*) as cnt FROM information_schema.tables WHERE table_name = 'amox_query_history'");
        if (check[0].cnt == 0) {
            return res.json([]);
        }

        const history = await dbManager.systemQuery("SELECT * FROM amox_query_history ORDER BY executed_at DESC LIMIT 1000");
        res.json(history);
    } catch (err) {
        console.error("Failed to fetch history:", err);
        res.status(500).json({ error: 'Failed to fetch history', details: err.message });
    }
});

app.post('/api/db/table-details', async (req, res) => {
    const { tableName, limit = 100, offset = 0 } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Table name required' });

    try {
        // 1. Schema & Metadata
        // DuckDB 'DESCRIBE' gives column_name, column_type, null, key, default, extra
        const describe = await dbManager.systemQuery(`DESCRIBE "${tableName}"`);

        // 2. Row Count (Estimated or Exact)
        const countRes = await dbManager.systemQuery(`SELECT COUNT(1) as count FROM "${tableName}"`);
        const totalRows = countRes[0].count; // Serialized as string or number

        // 3. Preview Data
        const preview = await dbManager.systemQuery(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`);

        // 4. DDL
        let ddl = '';
        try {
            const ddlRes = await dbManager.systemQuery(`SELECT sql FROM sqlite_master WHERE name = '${tableName}'`);
            if (ddlRes.length > 0) ddl = ddlRes[0].sql;
        } catch (e) {
            console.warn("DDL fetch fallback failed", e);
            ddl = `-- Could not retrieve DDL for ${tableName}`;
        }

        // 5. Data Profile (SUMMARIZE)
        // DuckDB SUMMARIZE returns: column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage
        let profile = [];
        try {
            profile = await dbManager.systemQuery(`SUMMARIZE "${tableName}"`);
        } catch (e) {
            console.warn("Profile generation failed", e);
        }

        res.json({
            tableName,
            schema: describe,
            totalRows,
            preview,
            ddl,
            profile // New field
        });

    } catch (err) {
        console.error("Table details fetch failed:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/db/import', async (req, res) => {
    const { filePath, tableName, cleanColumns } = req.body;

    if (!filePath || !tableName) return res.status(400).json({ error: 'File path and table name required' });

    let fullSourcePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    fullSourcePath = fullSourcePath.replace(/\\/g, '/');

    console.log(`[DEBUG] Import Request:`, { filePath, fullSourcePath, hasWildcard: fullSourcePath.includes('*'), exists: fs.existsSync(fullSourcePath) });

    if (!fullSourcePath.includes('*') && !fs.existsSync(fullSourcePath)) {
        return res.status(404).json({ error: `File not found on server: ${fullSourcePath}` });
    }

    try {
        if (cleanColumns) {
            const describe = await dbManager.systemQuery(`DESCRIBE SELECT * FROM '${fullSourcePath}'`);
            const selectParts = describe.map(col => {
                const oldName = col.column_name;
                const newName = oldName.trim().replace(/\s+/g, '_');
                return `"${oldName}" AS "${newName}"`;
            }).join(', ');
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT ${selectParts} FROM '${fullSourcePath}'`);
        } else {
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM '${fullSourcePath}'`);
        }

        // Force flush of WAL file to avoid locks
        await dbManager.checkpoint();

        res.json({ success: true, table: tableName });
    } catch (err) {
        console.error("Import Error:", err);
        let errorMsg = err.message;
        if (errorMsg.includes('No files found')) {
            errorMsg = "DuckDB could not find any files matching the pattern.";
        }
        res.status(500).json({ error: 'Import failed in DB engine', details: errorMsg });
    }
});

/* --- Extension Management APIs --- */
app.get('/api/db/extensions', async (req, res) => {
    try {
        const extensions = await dbManager.systemQuery('SELECT * FROM duckdb_extensions()');
        res.json(extensions);
    } catch (err) {
        console.error("Failed to fetch extensions:", err);
        res.status(500).json({ error: 'Failed to fetch extensions', details: err.message });
    }
});

app.post('/api/db/extensions/install', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });

    // Sanitize: only allow alphanumeric and underscores
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    try {
        await dbManager.systemQuery(`INSTALL ${safeName}`);
        await dbManager.systemQuery(`LOAD ${safeName}`);
        res.json({ success: true, message: `Extension '${safeName}' installed and loaded.` });
    } catch (err) {
        console.error(`Failed to install extension '${safeName}':`, err);
        res.status(500).json({ error: `Failed to install extension '${safeName}'`, details: err.message });
    }
});

/* --- Excel Import APIs --- */
const xlsx = require('xlsx');

app.get('/api/files/inspect-excel', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    try {
        const workbook = xlsx.read(fs.readFileSync(fullPath), { type: 'buffer', bookSheets: true });
        res.json({ sheets: workbook.SheetNames });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read Excel file', details: err.message });
    }
});

app.post('/api/db/import-excel', async (req, res) => {
    const { filePath, mode, sheets, tableName, cleanColumns, tableMapping } = req.body;
    // mode: 'MERGE' | 'INDIVIDUAL'

    if (!filePath || !sheets || sheets.length === 0) {
        return res.status(400).json({ error: 'File path and sheets are required' });
    }

    let fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    fullPath = fullPath.replace(/\\/g, '/'); // DuckDB prefers forward slashes

    try {
        // Ensure spatial extension is loaded for read_xlsx
        // We try to install/load it. This might fail if no internet or restricted, 
        // but it's required for the user's requested feature.
        try {
            await dbManager.systemQuery("INSTALL spatial; LOAD spatial;");
        } catch (e) {
            console.warn("Spatial extension load warning:", e.message);
            // Proceed anyway, maybe it's already there or built-in
        }

        const summary = [];

        if (mode === 'MERGE') {
            if (!tableName) return res.status(400).json({ error: 'Table name required for MERGE mode' });

            // Construct UNION ALL query
            // We need to know columns to be safe, but read_xlsx w/ union_by_name might handle it.
            // DuckDB Syntax: SELECT * FROM read_xlsx('file', sheet='A') UNION ALL BY NAME SELECT * FROM read_xlsx('file', sheet='B')

            const queries = sheets.map(sheet => {
                return `SELECT *, '${sheet}' as source_duck FROM read_xlsx('${fullPath}', sheet='${sheet}')`;
            });

            const unionQuery = queries.join(' UNION ALL BY NAME ');

            await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${tableName}" AS ${unionQuery}`);
            summary.push(`Merged ${sheets.length} sheets into "${tableName}"`);

        } else {
            // INDIVIDUAL
            for (const sheet of sheets) {
                // Determine table name: User might have provided mapping or use sheet name
                // Sanitize sheet name for table name
                const safeTableName = sheet.replace(/[^a-zA-Z0-9_]/g, '_');

                await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${safeTableName}" AS SELECT * FROM read_xlsx('${fullPath}', sheet='${sheet}')`);
                summary.push(`Created table "${safeTableName}" from sheet "${sheet}"`);
            }
        }

        // Checkpoint
        await dbManager.checkpoint();

        res.json({ success: true, summary: summary.join('\n') });

    } catch (err) {
        console.error("Excel Import Error:", err);
        res.status(500).json({ error: err.message });
    }
});

const aiManager = require('./AiManager');

/* --- AI / LLM APIs --- */

app.get('/api/ai/status', (req, res) => {
    res.json(aiManager.getStatus());
});

app.get('/api/settings/config', (req, res) => {
    try {
        const config = aiManager.getConfig();
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/config', (req, res) => {
    const { geminiApiKey, provider, defaultModel, s3Config, gcsConfig } = req.body;
    try {
        const config = aiManager.getConfig();
        if (geminiApiKey !== undefined) config.geminiApiKey = geminiApiKey;
        if (provider !== undefined) config.provider = provider;
        if (defaultModel !== undefined) config.defaultModel = defaultModel;
        if (s3Config !== undefined) config.s3Config = s3Config;
        if (gcsConfig !== undefined) config.gcsConfig = gcsConfig;

        fs.writeFileSync(aiManager.configPath, JSON.stringify(config, null, 2));
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Cloud Export (S3 / GCS via DuckDB httpfs) ──
app.post('/api/export/cloud', async (req, res) => {
    const { query, destination, format, provider: cloudProvider } = req.body;
    // destination: s3://bucket/path/file.parquet or gs://bucket/path/file.csv
    // format: parquet, csv, json
    // cloudProvider: s3 or gcs
    try {
        const config = aiManager.getConfig();

        // Load httpfs extension
        await dbManager.systemQuery('INSTALL httpfs; LOAD httpfs;');

        // Set credentials based on provider
        if (cloudProvider === 's3') {
            const s3 = config.s3Config || {};
            if (s3.accessKeyId) await dbManager.systemQuery(`SET s3_access_key_id='${s3.accessKeyId}'`);
            if (s3.secretKey) await dbManager.systemQuery(`SET s3_secret_access_key='${s3.secretKey}'`);
            if (s3.region) await dbManager.systemQuery(`SET s3_region='${s3.region}'`);
            if (s3.endpoint) await dbManager.systemQuery(`SET s3_endpoint='${s3.endpoint}'`);
        } else if (cloudProvider === 'gcs') {
            const gcs = config.gcsConfig || {};
            // GCS uses S3-compatible API via DuckDB
            await dbManager.systemQuery(`SET s3_endpoint='storage.googleapis.com'`);
            await dbManager.systemQuery(`SET s3_url_style='path'`);
            if (gcs.accessKeyId) await dbManager.systemQuery(`SET s3_access_key_id='${gcs.accessKeyId}'`);
            if (gcs.secretKey) await dbManager.systemQuery(`SET s3_secret_access_key='${gcs.secretKey}'`);
        }

        // Build COPY statement
        const formatUpper = (format || 'parquet').toUpperCase();
        const copyOpts = formatUpper === 'CSV' ? "(FORMAT CSV, HEADER)" : formatUpper === 'JSON' ? "(FORMAT JSON, ARRAY true)" : "(FORMAT PARQUET)";
        const copyQuery = `COPY (${query}) TO '${destination}' ${copyOpts}`;

        await dbManager.systemQuery(copyQuery);
        res.json({ success: true, message: `Exported to ${destination}` });
    } catch (err) {
        console.error('[Cloud Export] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/export/cloud/test', async (req, res) => {
    const { provider: cloudProvider } = req.body;
    try {
        const config = aiManager.getConfig();
        await dbManager.systemQuery('INSTALL httpfs; LOAD httpfs;');

        if (cloudProvider === 's3') {
            const s3 = config.s3Config || {};
            if (s3.accessKeyId) await dbManager.systemQuery(`SET s3_access_key_id='${s3.accessKeyId}'`);
            if (s3.secretKey) await dbManager.systemQuery(`SET s3_secret_access_key='${s3.secretKey}'`);
            if (s3.region) await dbManager.systemQuery(`SET s3_region='${s3.region}'`);
            if (s3.endpoint) await dbManager.systemQuery(`SET s3_endpoint='${s3.endpoint}'`);
            // Try to list a bucket
            if (s3.defaultBucket) {
                const result = await dbManager.systemQuery(`SELECT count(*) as cnt FROM glob('s3://${s3.defaultBucket}/*')`);
                res.json({ success: true, message: `Connected. Found files in bucket.`, count: result[0]?.cnt });
            } else {
                res.json({ success: true, message: 'Credentials set. No bucket specified for testing.' });
            }
        } else if (cloudProvider === 'gcs') {
            const gcs = config.gcsConfig || {};
            await dbManager.systemQuery(`SET s3_endpoint='storage.googleapis.com'`);
            await dbManager.systemQuery(`SET s3_url_style='path'`);
            if (gcs.accessKeyId) await dbManager.systemQuery(`SET s3_access_key_id='${gcs.accessKeyId}'`);
            if (gcs.secretKey) await dbManager.systemQuery(`SET s3_secret_access_key='${gcs.secretKey}'`);
            res.json({ success: true, message: 'GCS credentials configured.' });
        } else {
            res.json({ success: false, message: 'Unknown provider' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/ollama/models', async (req, res) => {
    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const models = await ollamaClient.list();
        res.json(models);
    } catch (err) {
        console.error("Failed to list Ollama models", err);
        // Do not throw full 500 if Ollama isn't running, return empty so UI doesn't break
        res.json({ models: [] });
    }
});

app.post('/api/settings/ollama/pull', async (req, res) => {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: "Model name is required" });

    // Set up Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    req.on('close', () => res.end());

    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const stream = await ollamaClient.pull({ model: model, stream: true });

        for await (const part of stream) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
        }
        res.write(`data: {"status":"success"}\n\n`);
        res.end();
    } catch (err) {
        console.error("Ollama pull failed", err);
        res.write(`data: {"error": "${err.message}"}\n\n`);
        res.end();
    }
});

app.post('/api/ai/init', async (req, res) => {
    try {
        await aiManager.initialize();
        res.json({ success: true, message: "Initialization complete" });
    } catch (err) {
        console.error("[API] AI Init failed", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai/generate', async (req, res) => {
    const { schema, question, provider, model } = req.body;
    if (!schema || !question) return res.status(400).json({ error: "Missing schema or question" });

    try {
        const sql = await aiManager.generateQuery(schema, question, provider, model);
        res.json({ sql });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Agent Chat API (Tool Loop) --- */

/**
 * Helper: Build table context from DuckDB for the AI agent.
 */
// Table context cache with 5-minute TTL
let _tableContextCache = null;
let _tableContextCacheTime = 0;
const TABLE_CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

async function buildTableContext(contextTables = null) {
    // If contextTables is explicitly provided but empty, return empty
    if (contextTables && contextTables.length === 0) return [];

    // Skip cache if explicitly requesting certain tables
    const useCache = !contextTables;

    // Return cached result if fresh
    const now = Date.now();
    if (useCache && _tableContextCache && (now - _tableContextCacheTime) < TABLE_CONTEXT_TTL) {
        return _tableContextCache;
    }

    try {
        let query = `
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'amoxsql_ai')
            AND table_type = 'BASE TABLE'
        `;

        // If explicit context tables requested, filter by them
        if (contextTables) {
            const tableNames = contextTables.map(t => `'${t.name.replace(/'/g, "''")}'`).join(',');
            query += `\n            AND table_name IN (${tableNames})`;
        }

        query += `\n            ORDER BY table_schema, table_name`;

        const tables = await dbManager.systemQuery(query);

        const tableContexts = [];
        for (const t of tables.slice(0, 30)) {
            try {
                const cols = await dbManager.systemQuery(`DESCRIBE "${t.table_name}"`);
                const countRes = await dbManager.systemQuery(`SELECT COUNT(*) as cnt FROM "${t.table_name}"`);
                tableContexts.push({
                    name: t.table_name,
                    schema: t.table_schema,
                    columns: cols.map(c => ({ name: c.column_name, type: c.column_type })),
                    rows: countRes[0]?.cnt || 0,
                });
            } catch {
                tableContexts.push({ name: t.table_name, schema: t.table_schema, columns: [], rows: '?' });
            }
        }

        _tableContextCache = tableContexts;
        _tableContextCacheTime = now;
        return tableContexts;
    } catch (err) {
        console.error('[AI] Failed to build table context:', err);
        return [];
    }
}

/**
 * Invalidate the table context cache (call after schema changes).
 */
function invalidateTableContextCache() {
    _tableContextCache = null;
    _tableContextCacheTime = 0;
}

/**
 * Helper: Build file context from file paths for the AI agent.
 */
async function buildFileContext(contextFiles) {
    if (!contextFiles || contextFiles.length === 0) return [];

    const fileContexts = [];
    for (const file of contextFiles) {
        try {
            let fullPath = path.isAbsolute(file.path) ? file.path : path.join(ROOT_DIR, file.path);
            fullPath = fullPath.replace(/\\/g, '/');
            
            // Get proper read function based on extension
            const ext = (fullPath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
            let readFn = 'read_csv_auto';
            if (ext === '.parquet') readFn = 'read_parquet';
            else if (ext === '.json' || ext === '.jsonl') readFn = 'read_json_auto';
            else if (ext === '.xlsx' || ext === '.xls') readFn = 'read_xlsx';
            
            const queryRef = `${readFn}('${fullPath}')`;
            console.log(`[AI File Context] Loading schema for: ${queryRef}`);
            
            const cols = await dbManager.systemQuery(`DESCRIBE SELECT * FROM ${queryRef}`);

            // Fetch sample rows (3) for data format context
            let sampleRows = [];
            let rowCount = null;
            try {
                sampleRows = await dbManager.systemQuery(`SELECT * FROM ${queryRef} LIMIT 3`);
            } catch { /* ignore sample read errors */ }

            // Approximate row count
            try {
                const countRes = await dbManager.systemQuery(`SELECT COUNT(*) as cnt FROM ${queryRef}`);
                rowCount = countRes[0]?.cnt || null;
            } catch { /* ignore count errors */ }

            fileContexts.push({
                name: file.name,
                path: fullPath,
                columns: cols.map(c => ({ name: c.column_name, type: c.column_type || c.data_type })),
                sampleRows,
                rowCount,
            });
        } catch (err) {
            console.warn(`[AI File Context] 🛑 Failed to load schema for ${file.name}:`, err.message);
            fileContexts.push({ name: file.name, path: file.path, columns: [], sampleRows: [], rowCount: null });
        }
    }
    return fileContexts;
}

/**
 * POST /api/ai/chat — Non-streaming tool loop chat
 * Body: { messages, provider?, model?, mode?, contextFiles?, currentQuery?, currentResult?, currentChartConfig? }
 */
app.post('/api/ai/chat', async (req, res) => {
    const { messages, provider, model, mode, contextFiles, contextTables, currentQuery, currentResult, currentChartConfig } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
    }

    try {
        // If the user provides explicit context items, we only load those.
        // If NO explicit context items are provided, we load the whole DB schema.
        const hasExplicitContext = (contextFiles && contextFiles.length > 0) || (contextTables && contextTables.length > 0);
        const tablesToLoad = hasExplicitContext ? (contextTables || []) : null;

        const [tables, files] = await Promise.all([
            buildTableContext(tablesToLoad),
            buildFileContext(contextFiles),
        ]);

        const result = await aiManager.chat({
            messages,
            dbManager,
            providerOverride: provider,
            modelOverride: model,
            mode: mode || 'diving',
            tables,
            files,
            currentQuery,
            currentResult,
            currentChartConfig,
        });

        res.json(result);
    } catch (err) {
        console.error('[API] AI Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/chat/stream — SSE streaming tool loop chat
 * Body: same as /api/ai/chat
 * Response: Server-Sent Events stream
 * 
 * Automatically selects prompt-only mode for low-tier models.
 */
const { getModelProfile: getModelProfileForRoute } = require('./ai/modelProfiles');

app.post('/api/ai/chat/stream', async (req, res) => {
    const { messages, provider, model, mode, contextFiles, contextTables, currentQuery, currentResult, currentChartConfig, activeSkillId, filePath, fileType } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
    }

    // Log assistant context for debugging
    if (mode === 'assistant') {
        console.log(`[AI Assistant Context] filePath=${filePath || 'none'} | fileType=${fileType || 'none'} | hasQuery=${!!currentQuery} | hasResult=${!!currentResult} | hasChart=${!!currentChartConfig}`);
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
        const hasExplicitContext = (contextFiles && contextFiles.length > 0) || (contextTables && contextTables.length > 0);
        const tablesToLoad = hasExplicitContext ? (contextTables || []) : null;

        const [tables, files] = await Promise.all([
            buildTableContext(tablesToLoad),
            buildFileContext(contextFiles),
        ]);

        const chatOptions = {
            messages,
            dbManager,
            providerOverride: provider,
            modelOverride: model,
            mode: mode || 'diving',
            tables,
            files,
            currentQuery,
            currentResult,
            currentChartConfig,
            activeSkillId,
            filePath,
            fileType,
        };

        // Detect model tier to choose between tool-loop and prompt-only
        const resolvedModel = model || aiManager.modelName;
        const resolvedProvider = provider || aiManager.provider;
        const profile = getModelProfileForRoute(resolvedModel, resolvedProvider);

        if (profile.tier === 'low') {
            // ── Prompt-Only Mode for low-tier models ──
            console.log(`[API] Using prompt-only mode for ${resolvedModel} (tier: low)`);

            for await (const event of aiManager.promptOnlyStreamChat(chatOptions)) {
                if (res.closed) {
                    console.log('[AI PromptOnly] Client disconnected, stopping.');
                    break;
                }
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            }

            res.write(`data: [DONE]\n\n`);
            res.end();
        } else {
            // ── Standard Tool-Loop Mode for medium+ tiers ──
            const result = await aiManager.streamChat(chatOptions);

            for await (const part of result.fullStream) {
                if (res.closed) {
                    console.log('[AI FULLSTREAM] Client disconnected, stopping stream.');
                    break;
                }

                if (part.type === 'text-delta') {
                    res.write(`data: ${JSON.stringify({ type: 'text-delta', text: part.textDelta || part.text })}\n\n`);
                } else if (part.type === 'tool-call') {
                    // AI SDK v6 uses `input` instead of `args` for tool-call parts
                    const toolArgs = part.input ?? part.args ?? {};
                    res.write(`data: ${JSON.stringify({ type: 'tool-call', toolName: part.toolName, args: toolArgs, toolCallId: part.toolCallId })}\n\n`);
                } else if (part.type === 'tool-result') {
                    // AI SDK v6 uses `output` instead of `result`, and `input` instead of `args`
                    const toolResult = part.output ?? part.result ?? { error: 'Tool returned no result' };
                    const toolArgs = part.input ?? part.args ?? {};
                    if (toolResult.error) {
                        console.error(`[AI Tool Error] ${part.toolName}:`, toolResult.error);
                    }
                    res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId, result: toolResult, args: toolArgs })}\n\n`);
                } else if (part.type === 'tool-error') {
                    // AI SDK v6 emits tool-error when a tool throws an unhandled exception
                    const errorMsg = part.error?.message || String(part.error || 'Unknown tool error');
                    const toolArgs = part.input ?? part.args ?? {};
                    console.error(`[AI Tool Error] ${part.toolName}: ${errorMsg}`);
                    res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId, result: { error: errorMsg }, args: toolArgs })}\n\n`);
                } else if (part.type === 'step-finish') {
                    res.write(`data: ${JSON.stringify({ type: 'step-finish' })}\n\n`);
                } else if (part.type === 'finish') {
                    const queryResults = result._queryResults ? Object.fromEntries(result._queryResults) : {};
                    res.write(`data: ${JSON.stringify({ type: 'finish', usage: part.usage, queryResults })}\n\n`);
                } else if (part.type === 'error') {
                    res.write(`data: ${JSON.stringify({ type: 'error', error: part.error?.message || String(part.error) })}\n\n`);
                }
            }

            res.write(`data: [DONE]\n\n`);
            res.end();
        }
    } catch (err) {
        console.error('[API] AI Stream error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        }
    }

});

/* --- AI Conversation CRUD APIs --- */
const aiPersistence = require('./ai/persistence');
const aiSkills = require('./ai/skills');
const aiTestRunner = require('./ai/testRunner');

/**
 * GET /api/ai/conversations — List conversations (newest first)
 * Query: ?search=text&limit=50
 */
app.get('/api/ai/conversations', async (req, res) => {
    try {
        const { search, limit, offset, mode } = req.query;
        const conversations = await aiPersistence.getConversations(dbManager, {
            search,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
            mode,
        });
        res.json(conversations);
    } catch (err) {
        console.error('[API] List conversations error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/conversations/by-file — Get conversations for a specific file
 * Query: ?path=relative/path/to/file.sql
 * NOTE: Must be registered BEFORE /api/ai/conversations/:id to avoid route conflict
 */
app.get('/api/ai/conversations/by-file', async (req, res) => {
    try {
        const { path: filePath } = req.query;
        if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
        const conversations = await aiPersistence.getConversationsByFile(dbManager, filePath);
        res.json(conversations);
    } catch (err) {
        console.error('[API] Get conversations by file error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/conversations/:id — Get a conversation with all messages/results
 */
app.get('/api/ai/conversations/:id', async (req, res) => {
    try {
        const conversation = await aiPersistence.getConversation(dbManager, req.params.id);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        res.json(conversation);
    } catch (err) {
        console.error('[API] Get conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations — Create a new conversation
 * Body: { mode?, provider?, model?, title? }
 */
app.post('/api/ai/conversations', async (req, res) => {
    try {
        const conversation = await aiPersistence.createConversation(dbManager, req.body);
        res.json(conversation);
    } catch (err) {
        console.error('[API] Create conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/conversations/:id — Delete a conversation and all its data
 */
app.delete('/api/ai/conversations/:id', async (req, res) => {
    try {
        const result = await aiPersistence.deleteConversation(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        console.error('[API] Delete conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/star — Toggle starred status
 */
app.put('/api/ai/conversations/:id/star', async (req, res) => {
    try {
        const result = await aiPersistence.toggleStar(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        console.error('[API] Toggle star error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/title — Update conversation title
 * Body: { title }
 */
app.put('/api/ai/conversations/:id/title', async (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const result = await aiPersistence.updateTitle(dbManager, req.params.id, title);
        res.json(result);
    } catch (err) {
        console.error('[API] Update title error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/messages — Add a message to a conversation
 * Body: { role, content, toolCalls?, tokenCount? }
 */
app.post('/api/ai/conversations/:id/messages', async (req, res) => {
    const { role, content, toolCalls, tokenCount } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required' });

    try {
        const message = await aiPersistence.addMessage(dbManager, {
            conversationId: req.params.id,
            role,
            content: content || '',
            toolCalls,
            tokenCount,
        });
        res.json(message);
    } catch (err) {
        console.error('[API] Add message error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/query-results — Save a query result
 * Body: { messageId, sqlQuery, columns, data, rowCount, executionTime, error }
 */
app.post('/api/ai/conversations/:id/query-results', async (req, res) => {
    const { messageId, sqlQuery, columns, data, rowCount, executionTime, error } = req.body;
    if (!messageId || !sqlQuery) return res.status(400).json({ error: 'messageId and sqlQuery are required' });

    try {
        const result = await aiPersistence.saveQueryResult(dbManager, {
            messageId, sqlQuery, columns, data, rowCount, executionTime, error,
        });
        res.json(result);
    } catch (err) {
        console.error('[API] Save query result error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/chart-configs — Save a chart config
 * Body: { queryResultId, chartType, config }
 */
app.post('/api/ai/conversations/:id/chart-configs', async (req, res) => {
    const { queryResultId, chartType, config } = req.body;
    if (!queryResultId) return res.status(400).json({ error: 'queryResultId is required' });

    try {
        const result = await aiPersistence.saveChartConfig(dbManager, {
            queryResultId, chartType, config,
        });
        res.json(result);
    } catch (err) {
        console.error('[API] Save chart config error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/title/auto — Auto-generate title from first message
 * Body: { firstMessage }
 */
app.put('/api/ai/conversations/:id/title/auto', async (req, res) => {
    const { firstMessage } = req.body;
    if (!firstMessage) return res.status(400).json({ error: 'firstMessage is required' });

    try {
        const title = firstMessage.length > 60 ? firstMessage.substring(0, 57) + '...' : firstMessage;
        const result = await aiPersistence.updateTitle(dbManager, req.params.id, title);
        res.json(result);
    } catch (err) {
        console.error('[API] Auto title error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Skills APIs --- */

/**
 * GET /api/ai/skills — List available skills for the current project
 */
app.get('/api/ai/skills', async (req, res) => {
    try {
        const skills = await aiSkills.loadSkills(ROOT_DIR);
        res.json(skills.map(s => ({ id: s.id, name: s.name, description: s.description })));
    } catch (err) {
        console.error('[API] Load skills error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/skills/:id — Get a single skill's full content
 */
app.get('/api/ai/skills/:id', async (req, res) => {
    try {
        const skill = await aiSkills.getSkill(ROOT_DIR, req.params.id);
        if (!skill) return res.status(404).json({ error: 'Skill not found' });
        res.json(skill);
    } catch (err) {
        console.error('[API] Get skill error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI File-Conversation & Session APIs --- */

/**
 * PUT /api/ai/conversations/:id/session-name — Update session name
 * Body: { sessionName }
 */
app.put('/api/ai/conversations/:id/session-name', async (req, res) => {
    try {
        const { sessionName } = req.body;
        if (!sessionName) return res.status(400).json({ error: 'sessionName is required' });
        const result = await aiPersistence.updateSessionName(dbManager, req.params.id, sessionName);
        res.json(result);
    } catch (err) {
        console.error('[API] Update session name error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Diving Session APIs --- */

/**
 * GET /api/ai/sessions — List diving sessions with artifact counts
 * Query: ?search=text&limit=50&offset=0
 */
app.get('/api/ai/sessions', async (req, res) => {
    try {
        const { search, limit, offset } = req.query;
        const sessions = await aiPersistence.getDivingSessions(dbManager, {
            search,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
        });
        res.json(sessions);
    } catch (err) {
        console.error('[API] List diving sessions error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/sessions/:id/artifacts — Get artifacts for a session
 */
app.get('/api/ai/sessions/:id/artifacts', async (req, res) => {
    try {
        const artifacts = await aiPersistence.getArtifacts(dbManager, req.params.id);
        res.json(artifacts);
    } catch (err) {
        console.error('[API] Get session artifacts error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/sessions/:id/artifacts — Add an artifact to a session
 * Body: { artifactType, filePath, fileName, createdBy?, sqlSnapshot?, metadata?, saveLocation? }
 */
app.post('/api/ai/sessions/:id/artifacts', async (req, res) => {
    try {
        const artifact = await aiPersistence.createArtifact(dbManager, {
            conversationId: req.params.id,
            ...req.body,
        });
        res.json(artifact);
    } catch (err) {
        console.error('[API] Create artifact error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/sessions/:id/artifacts/:artifactId — Delete an artifact
 */
app.delete('/api/ai/sessions/:id/artifacts/:artifactId', async (req, res) => {
    try {
        const result = await aiPersistence.deleteArtifact(dbManager, req.params.artifactId);
        res.json(result);
    } catch (err) {
        console.error('[API] Delete artifact error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- Analysis Vault APIs --- */

/**
 * GET /api/ai/vault — List vault entries
 * Query: ?search=text&tags=tag1&limit=50&offset=0
 */
app.get('/api/ai/vault', async (req, res) => {
    try {
        const { search, tags, limit, offset } = req.query;
        const entries = await aiPersistence.getVaultEntries(dbManager, {
            search,
            tags,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
        });
        res.json(entries);
    } catch (err) {
        console.error('[API] List vault entries error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/vault — Save an analysis to the vault
 * Body: { title, description?, sqlContent?, resultSnapshot?, chartConfig?, tags?, sourceFile?, conversationId? }
 */
app.post('/api/ai/vault', async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });
        const entry = await aiPersistence.saveToVault(dbManager, req.body);
        res.json(entry);
    } catch (err) {
        console.error('[API] Save to vault error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/vault/:id — Update a vault entry
 * Body: { title?, description?, tags? }
 */
app.put('/api/ai/vault/:id', async (req, res) => {
    try {
        const result = await aiPersistence.updateVaultEntry(dbManager, req.params.id, req.body);
        res.json(result);
    } catch (err) {
        console.error('[API] Update vault entry error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/vault/:id — Delete a vault entry
 */
app.delete('/api/ai/vault/:id', async (req, res) => {
    try {
        const result = await aiPersistence.deleteVaultEntry(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        console.error('[API] Delete vault entry error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Agent Test APIs --- */

/**
 * GET /api/ai/tests — List available test cases
 */
app.get('/api/ai/tests', async (req, res) => {
    try {
        const tests = await aiTestRunner.loadTests(ROOT_DIR);
        res.json(tests);
    } catch (err) {
        console.error('[API] Load tests error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/tests/run — Run all tests or a specific test
 * Body: { testId? } — if testId provided, runs only that test
 */
app.post('/api/ai/tests/run', async (req, res) => {
    const { testId } = req.body || {};

    try {
        if (testId) {
            const tests = await aiTestRunner.loadTests(ROOT_DIR);
            const test = tests.find(t => t.id === testId);
            if (!test) return res.status(404).json({ error: 'Test not found' });

            const result = await aiTestRunner.runTest(test, aiManager, dbManager);
            res.json({ total: 1, passed: result.pass ? 1 : 0, failed: result.pass ? 0 : 1, results: [result] });
        } else {
            const summary = await aiTestRunner.runAllTests(ROOT_DIR, aiManager, dbManager);
            res.json(summary);
        }
    } catch (err) {
        console.error('[API] Run tests error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/files', (req, res) => {
    const dirPath = req.query.path || '';
    const fullPath = path.join(ROOT_DIR, dirPath);

    fs.readdir(fullPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read directory', details: err.message });
        }

        const fileList = files.map(file => ({
            name: file.name,
            isDirectory: file.isDirectory(),
            path: path.relative(ROOT_DIR, path.join(fullPath, file.name)),
            fullPath: path.join(fullPath, file.name)
        }));

        res.json(fileList);
    });
});

app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ROOT_DIR, filePath);
    }

    fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read file', details: err.message });
        res.json({ content: data });
    });
});

app.post('/api/file', (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content are required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ROOT_DIR, filePath);
    }

    fs.writeFile(fullPath, content, 'utf8', (err) => {
        if (err) return res.status(500).json({ error: 'Failed to write file', details: err.message });
        res.json({ success: true });
    });
});

app.post('/api/folder', (req, res) => {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = folderPath;
    if (!path.isAbsolute(folderPath)) {
        fullPath = path.join(ROOT_DIR, folderPath);
    }

    fs.mkdir(fullPath, { recursive: true }, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to create folder', details: err.message });
        res.json({ success: true });
    });
});

/* --- File Rename & Delete APIs --- */
app.post('/api/file/rename', (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });

    const fullOld = path.isAbsolute(oldPath) ? oldPath : path.join(ROOT_DIR, oldPath);
    const fullNew = path.isAbsolute(newPath) ? newPath : path.join(ROOT_DIR, newPath);

    if (!fs.existsSync(fullOld)) return res.status(404).json({ error: 'Source file not found' });
    if (fs.existsSync(fullNew)) return res.status(409).json({ error: 'Destination already exists' });

    try {
        fs.renameSync(fullOld, fullNew);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Rename failed', details: err.message });
    }
});

app.post('/api/file/delete', (req, res) => {
    const { path: filePath, isDirectory } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    try {
        if (isDirectory) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed', details: err.message });
    }
});

const getDirectories = (srcPath) => {
    let dirs = [];
    try {
        const items = fs.readdirSync(srcPath, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
                const relativePath = path.relative(ROOT_DIR, path.join(srcPath, item.name)).replace(/\\/g, '/');
                dirs.push({ name: item.name, path: relativePath });
                const subDirs = getDirectories(path.join(srcPath, item.name));
                dirs = dirs.concat(subDirs);
            }
        }
    } catch (err) {
    }
    return dirs;
};

app.get('/api/folders', (req, res) => {
    try {
        const folders = getDirectories(ROOT_DIR);
        folders.unshift({ name: 'Root', path: '' });
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/query', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        const start = performance.now();
        const result = await dbManager.queryWithMetadata(query);
        const end = performance.now();

        // Invalidate table context cache if query may have changed schema
        const upperQuery = query.toUpperCase().trim();
        if (upperQuery.startsWith('CREATE') || upperQuery.startsWith('DROP') ||
            upperQuery.startsWith('ALTER') || upperQuery.startsWith('INSERT') ||
            upperQuery.startsWith('DELETE') || upperQuery.startsWith('UPDATE')) {
            invalidateTableContextCache();
        }

        res.json({
            data: result.rows,
            types: result.types,
            executionTime: (end - start).toFixed(2),
            rowCount: result.rows.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/profile', async (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        // Strip trailing semicolons to prevent syntax errors when nesting
        const cleanQuery = query.trim().replace(/;+$/, '');

        // 1. DuckDB SUMMARIZE for core statistics
        const profileQuery = `SUMMARIZE ${cleanQuery}`;
        const start = performance.now();
        const profileData = await dbManager.systemQuery(profileQuery);

        // 2. Fetch Global Stats
        const globalRowsQuery = `SELECT COUNT(*) as total_rows FROM (${cleanQuery}) as sq`;
        const globalDupesQuery = `SELECT COUNT(*) as duplicate_rows FROM (SELECT * FROM (${cleanQuery}) as sq GROUP BY ALL HAVING COUNT(*) > 1) as sq2`;

        // 3. Build Advanced Summary & Correlation Queries
        let advancedSelects = [];
        let numericCols = [];
        profileData.forEach(col => {
            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
            const colName = col.column_name;
            const safeCol = `"${colName}"`;

            if (isNumeric) {
                numericCols.push(colName);
                advancedSelects.push(`SKEWNESS(${safeCol}) as "${colName}_skewness"`);
                advancedSelects.push(`KURTOSIS(${safeCol}) as "${colName}_kurtosis"`);
                advancedSelects.push(`COUNT(CASE WHEN ${safeCol} = 0 THEN 1 END) as "${colName}_zeros"`);
                advancedSelects.push(`COUNT(CASE WHEN ${safeCol} < 0 THEN 1 END) as "${colName}_negatives"`);
            } else {
                advancedSelects.push(`MAX(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_max_length"`);
                advancedSelects.push(`MIN(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_min_length"`);
                advancedSelects.push(`AVG(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_avg_length"`);
            }
        });

        // Add correlation matrix if multiple numerics
        let corrSelects = [];
        if (numericCols.length > 1) {
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const c1 = numericCols[i];
                    const c2 = numericCols[j];
                    corrSelects.push(`CORR("${c1}", "${c2}") as "corr_${c1}_${c2}"`);
                }
            }
        }

        let advancedQuery = '';
        if (advancedSelects.length > 0 || corrSelects.length > 0) {
            const allSelects = [...advancedSelects, ...corrSelects].join(',\n');
            advancedQuery = `SELECT \n${allSelects}\nFROM (${cleanQuery}) as subq`;
        }

        // 4. Fetch Visual Data (Histograms for numeric, Top 5 for text)
        const visualQueries = profileData.map(col => {
            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
            const colName = `"${col.column_name}"`;

            if (isNumeric) {
                if (col.min === null || col.max === null || col.min === col.max) return null;
                const min = parseFloat(col.min);
                const max = parseFloat(col.max);
                const range = max - min;
                const binWidth = range / 5;

                return `SELECT 
                    '${col.column_name}' as col_name,
                    COUNT(CASE WHEN ${colName} >= ${min} AND ${colName} < ${min + binWidth} THEN 1 END) as b1,
                    COUNT(CASE WHEN ${colName} >= ${min + binWidth} AND ${colName} < ${min + (binWidth * 2)} THEN 1 END) as b2,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 2)} AND ${colName} < ${min + (binWidth * 3)} THEN 1 END) as b3,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 3)} AND ${colName} < ${min + (binWidth * 4)} THEN 1 END) as b4,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 4)} AND ${colName} <= ${max} THEN 1 END) as b5
                    FROM (${cleanQuery}) as subq`;
            } else {
                return `SELECT 
                    '${col.column_name}' as col_name,
                    ${colName} as val, 
                    COUNT(*) as count 
                    FROM (${cleanQuery}) as subq 
                    WHERE ${colName} IS NOT NULL 
                    GROUP BY ${colName} 
                    ORDER BY count DESC 
                    LIMIT 5`;
            }
        }).filter(q => q !== null);

        let visuals = {};
        if (visualQueries.length > 0) {
            const visualResults = await Promise.all(visualQueries.map(q => dbManager.systemQuery(q)));
            visualResults.forEach(res => {
                if (!res || res.length === 0) return;
                const colName = res[0].col_name;
                if ('b1' in res[0]) {
                    const row = res[0];
                    visuals[colName] = { type: 'histogram', data: [Number(row.b1), Number(row.b2), Number(row.b3), Number(row.b4), Number(row.b5)] };
                } else {
                    visuals[colName] = { type: 'top', data: res.map(r => ({ value: String(r.val), count: Number(r.count) })) };
                }
            });
        }

        // 5. Execute Global & Advanced queries in parallel
        const parallelExecutions = [
            dbManager.systemQuery(globalRowsQuery),
            dbManager.systemQuery(globalDupesQuery)
        ];
        if (advancedQuery) {
            parallelExecutions.push(dbManager.systemQuery(advancedQuery));
        }

        const parallelResults = await Promise.all(parallelExecutions);

        const totalRows = parallelResults[0][0]?.total_rows || 0;
        const duplicateRows = parallelResults[1][0]?.duplicate_rows || 0;
        const advancedStats = advancedQuery ? parallelResults[2][0] : {};

        // Process Correlational Matrix
        let correlations = [];
        if (corrSelects.length > 0 && advancedStats) {
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const c1 = numericCols[i];
                    const c2 = numericCols[j];
                    const key = `corr_${c1}_${c2}`;
                    if (advancedStats[key] !== undefined && advancedStats[key] !== null) {
                        correlations.push({ col1: c1, col2: c2, score: advancedStats[key] });
                    }
                }
            }
        }

        const end = performance.now();

        res.json({
            profile: profileData,
            visuals: visuals,
            advanced: advancedStats,
            global: {
                totalRows: Number(totalRows),
                duplicateRows: Number(duplicateRows)
            },
            correlations: correlations,
            executionTime: (end - start).toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Data Export API (DuckDB COPY TO) --- */
app.post('/api/export-data', async (req, res) => {
    const { query, format, filename } = req.body;
    if (!query || !format || !filename) {
        return res.status(400).json({ error: 'query, format, and filename are required' });
    }

    const allowedFormats = ['csv', 'parquet', 'xlsx'];
    if (!allowedFormats.includes(format)) {
        return res.status(400).json({ error: `Unsupported format: ${format}. Use: ${allowedFormats.join(', ')}` });
    }

    const fullPath = path.join(ROOT_DIR, filename).replace(/\\/g, '/');
    const cleanQuery = query.trim().replace(/;+$/, '');

    try {
        let copyFormat;
        if (format === 'csv') copyFormat = "CSV";
        else if (format === 'parquet') copyFormat = "PARQUET";
        else if (format === 'xlsx') {
            try {
                await dbManager.query(`COPY (${cleanQuery}) TO '${fullPath}' WITH (FORMAT CSV, HEADER)`);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${cleanQuery}) t`);
                const rowCount = countResult[0]?.cnt || 0;
                return res.json({ success: true, path: filename, rowCount, note: 'Exported as CSV (rename to .csv for best compatibility)' });
            } catch (xlsxErr) {
                return res.status(500).json({ error: `Excel export failed: ${xlsxErr.message}. Try CSV or Parquet instead.` });
            }
        }

        // Count rows first
        const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${cleanQuery}) t`);
        const rowCount = countResult[0]?.cnt || 0;

        // Execute COPY TO (Parquet doesn't accept HEADER)
        const copyOptions = format === 'csv' ? "(HEADER, DELIMITER ',')" : "(FORMAT PARQUET)";
        await dbManager.query(`COPY (${cleanQuery}) TO '${fullPath}' ${copyOptions}`);

        res.json({ success: true, path: filename, rowCount });
    } catch (err) {
        console.error("Export data failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// (Removed duplicate `/api/db/tables` endpoint from here to avoid conflicts)

/* --- dbt Integration API --- */

// GET /api/dbt/manifest — Read target/manifest.json from project root
app.get('/api/dbt/manifest', (req, res) => {
    try {
        const manifestPath = path.join(ROOT_DIR, 'target', 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            return res.json({ available: false, models: [], sources: [] });
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // Extract Models
        const models = Object.values(manifest.nodes || {})
            .filter(n => n.resource_type === 'model')
            .map(n => ({
                name: n.name,
                schema: n.schema || '',
                description: n.description || ''
            }));
            
        // Extract Sources
        const sourcesMap = {};
        Object.values(manifest.sources || {}).forEach(s => {
            const srcName = s.source_name;
            if (!sourcesMap[srcName]) {
                sourcesMap[srcName] = { name: srcName, schema: s.source_description || '', tables: [] };
            }
            sourcesMap[srcName].tables.push({
                name: s.name,
                description: s.description || ''
            });
        });
        const sources = Object.values(sourcesMap);

        res.json({ available: true, models, sources });
    } catch (err) {
        console.error('[dbt] Error reading manifest:', err);
        res.status(500).json({ error: err.message, available: false });
    }
});
/* --- DuckDB Function Catalog API --- */
const AMOX_DIR = () => path.join(ROOT_DIR, '.amox');
const ensureAmoxDir = () => { if (!fs.existsSync(AMOX_DIR())) fs.mkdirSync(AMOX_DIR(), { recursive: true }); };

// Load curated docs (static, shipped with app)
const CURATED_DOCS_PATH = path.join(__dirname, 'data', 'duckdb-functions-docs.json');
const loadCuratedDocs = () => {
    try {
        if (fs.existsSync(CURATED_DOCS_PATH)) {
            return JSON.parse(fs.readFileSync(CURATED_DOCS_PATH, 'utf8'));
        }
    } catch (e) { console.error('[Functions] Error loading curated docs:', e.message); }
    return { functions: {} };
};

// Load introspection cache (per-project, in .amox/)
const CACHE_FILENAME = 'duckdb-functions-cache.json';
const loadFunctionsCache = () => {
    try {
        const cachePath = path.join(AMOX_DIR(), CACHE_FILENAME);
        if (fs.existsSync(cachePath)) {
            return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        }
    } catch (e) { console.error('[Functions] Error loading cache:', e.message); }
    return null;
};

// Auto-generate snippet from function name + parameters
const autoGenerateSnippet = (fn) => {
    if (!fn.parameters || fn.parameters.length === 0) {
        return `${fn.function_name}()`;
    }
    const params = fn.parameters.map((p, i) => `\${${i + 1}:${p || 'arg' + (i + 1)}}`).join(', ');
    return `${fn.function_name}(${params})`;
};

// Auto-generate doc from description + params/types
const autoGenerateDoc = (fn) => {
    let doc = fn.description || `\`${fn.function_name}\` function.`;
    if (fn.parameters && fn.parameters.length > 0 && fn.parameter_types && fn.parameter_types.length > 0) {
        doc += '\n\n**Parameters:**\n| Name | Type |\n|------|------|\n';
        for (let i = 0; i < fn.parameters.length; i++) {
            const name = fn.parameters[i] || `arg${i + 1}`;
            const type = fn.parameter_types[i] || 'ANY';
            doc += `| \`${name}\` | ${type} |\n`;
        }
    }
    return doc;
};

// POST /api/functions/refresh — Run duckdb_functions() and update cache
app.post('/api/functions/refresh', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT ON(function_name)
            function_name,
            function_type,
            return_type,
            parameters,
            parameter_types,
            description
        FROM duckdb_functions()
        ORDER BY function_name;`;

        const rows = await dbManager.query(sql);

        const cache = {
            _meta: {
                generatedAt: new Date().toISOString(),
                totalFunctions: rows.length
            },
            functions: rows.map(row => ({
                function_name: row.function_name,
                function_type: row.function_type,
                return_type: row.return_type,
                parameters: row.parameters || [],
                parameter_types: row.parameter_types || [],
                description: row.description || ''
            }))
        };

        ensureAmoxDir();
        const cachePath = path.join(AMOX_DIR(), CACHE_FILENAME);
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

        res.json({ success: true, totalFunctions: cache.functions.length, generatedAt: cache._meta.generatedAt });
    } catch (err) {
        console.error('[Functions] Refresh error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/functions/catalog — Merge cache + curated docs
app.get('/api/functions/catalog', (req, res) => {
    try {
        const curated = loadCuratedDocs();
        const cache = loadFunctionsCache();

        // If no cache yet, return curated-only (with auto-generated base fields)
        if (!cache) {
            const catalog = Object.values(curated.functions || {}).map(fn => ({
                function_name: fn.function_name,
                function_type: fn.function_type || 'scalar',
                return_type: fn.return_type || '',
                parameters: fn.parameters || [],
                parameter_types: fn.parameter_types || [],
                description: fn.description || fn.doc || '',
                category: fn.category || '',
                snippet: fn.snippet || autoGenerateSnippet(fn),
                doc: fn.doc || '',
                examples: fn.examples || [],
                documented: true
            }));
            return res.json({ functions: catalog, source: 'curated-only' });
        }

        // Merge: cache as base, curated extends
        const curatedMap = curated.functions || {};
        const catalog = cache.functions.map(fn => {
            const name = fn.function_name;
            // Case-insensitive lookup: try exact, then lowercase, then uppercase
            const doc = curatedMap[name] || curatedMap[name.toLowerCase()] || curatedMap[name.toUpperCase()];

            if (doc) {
                return {
                    ...fn,
                    category: doc.category || '',
                    snippet: doc.snippet || autoGenerateSnippet(fn),
                    doc: doc.doc || autoGenerateDoc(fn),
                    examples: doc.examples || [],
                    documented: true
                };
            } else {
                return {
                    ...fn,
                    category: '',
                    snippet: autoGenerateSnippet(fn),
                    doc: autoGenerateDoc(fn),
                    examples: [],
                    documented: false
                };
            }
        });

        res.json({
            functions: catalog,
            source: 'merged',
            cacheGeneratedAt: cache._meta?.generatedAt
        });
    } catch (err) {
        console.error('[Functions] Catalog error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/functions/coverage — Doc coverage stats
app.get('/api/functions/coverage', (req, res) => {
    try {
        const curated = loadCuratedDocs();
        const cache = loadFunctionsCache();

        if (!cache) {
            return res.json({
                total: 0,
                documented: Object.keys(curated.functions || {}).length,
                cacheExists: false,
                undocumented: []
            });
        }

        const curatedMap = curated.functions || {};
        const total = cache.functions.length;
        const undocumented = [];

        cache.functions.forEach(fn => {
            const name = fn.function_name;
            if (!curatedMap[name] && !curatedMap[name.toLowerCase()] && !curatedMap[name.toUpperCase()]) {
                undocumented.push({
                    function_name: fn.function_name,
                    function_type: fn.function_type,
                    description: fn.description || ''
                });
            }
        });

        res.json({
            total,
            documented: total - undocumented.length,
            cacheExists: true,
            cacheGeneratedAt: cache._meta?.generatedAt,
            undocumented
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- SQL Snippets API --- */

app.get('/api/snippets', (req, res) => {
    try {
        const file = path.join(AMOX_DIR(), 'snippets.json');
        if (!fs.existsSync(file)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/snippets', (req, res) => {
    try {
        ensureAmoxDir();
        const file = path.join(AMOX_DIR(), 'snippets.json');
        fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Query Bookmarks API --- */
app.get('/api/bookmarks', (req, res) => {
    try {
        const file = path.join(AMOX_DIR(), 'bookmarks.json');
        if (!fs.existsSync(file)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/bookmarks', (req, res) => {
    try {
        ensureAmoxDir();
        const file = path.join(AMOX_DIR(), 'bookmarks.json');
        fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Notebook State Persistence API --- */
app.get('/api/notebook-state', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        if (!fs.existsSync(statePath)) return res.json(null);
        const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        res.json(data);
    } catch (err) {
        console.warn('Failed to read notebook state:', err.message);
        res.json(null);
    }
});

app.post('/api/notebook-state', (req, res) => {
    const { path: filePath, state } = req.body;
    if (!filePath || !state) return res.status(400).json({ error: 'Path and state are required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to write notebook state:', err.message);
        res.status(500).json({ error: 'Failed to write state', details: err.message });
    }
});

app.get('/api/schema', async (req, res) => {
    try {
        const tables = await dbManager.systemQuery("SELECT table_name as name FROM information_schema.tables WHERE table_schema='main' OR table_schema='public'");
        res.json(tables);
    } catch (err) {
        res.json([]);
    }
});


/* --- DBT Management APIs --- */

// Validate environment: check Python, DBT, and Conda/Mamba availability (ASYNC — non-blocking)
app.get('/api/dbt/validate-env', async (req, res) => {
    const result = {
        python: false, pythonVersion: null,
        dbt: false, dbtVersion: null,
        conda: false, condaVersion: null, condaPath: null,
        mamba: false, mambaVersion: null,
        activeCondaEnv: null,
    };

    const execAsync = (cmd, timeout = 5000) => new Promise((resolve) => {
        exec(cmd, { encoding: 'utf8', timeout, maxBuffer: 1024 * 512 }, (err, stdout) => {
            if (err) resolve({ ok: false, output: '' });
            else resolve({ ok: true, output: (stdout || '').trim() });
        });
    });

    // Run all independent checks concurrently (non-blocking)
    const [pythonRes, python3Res, dbtRes, condaRes, mambaRes] = await Promise.all([
        execAsync('python --version'),
        execAsync('python3 --version'),
        execAsync('dbt --version', 10000),
        execAsync('conda --version'),
        execAsync('mamba --version'),
    ]);

    // Python
    if (pythonRes.ok) {
        result.python = true;
        result.pythonVersion = pythonRes.output.replace('Python ', '');
    } else if (python3Res.ok) {
        result.python = true;
        result.pythonVersion = python3Res.output.replace('Python ', '');
    }

    // DBT
    if (dbtRes.ok) {
        result.dbt = true;
        const match = dbtRes.output.match(/installed:\s*([\d.]+)/);
        result.dbtVersion = match ? match[1] : dbtRes.output.split('\n')[0];
    }

    // Conda — PATH first
    if (condaRes.ok) {
        result.conda = true;
        result.condaVersion = condaRes.output.replace('conda ', '');
        result.condaPath = 'conda';
    } else {
        // Not in PATH — scan common install locations (sequential fs checks are fast)
        const home = process.env.USERPROFILE || process.env.HOME || '';
        const localAppData = process.env.LOCALAPPDATA || '';
        const programData = process.env.ProgramData || 'C:\\ProgramData';
        const candidateDirs = [
            path.join(home, 'anaconda3'), path.join(home, 'Anaconda3'),
            path.join(home, 'miniconda3'), path.join(home, 'Miniconda3'),
            path.join(home, 'miniforge3'), path.join(home, 'mambaforge'),
            path.join(localAppData, 'anaconda3'), path.join(localAppData, 'Anaconda3'),
            path.join(localAppData, 'miniconda3'), path.join(localAppData, 'Miniconda3'),
            path.join(localAppData, 'miniforge3'),
            path.join(programData, 'anaconda3'), path.join(programData, 'Anaconda3'),
            path.join(programData, 'miniconda3'), path.join(programData, 'Miniconda3'),
            'C:\\anaconda3', 'C:\\miniconda3', 'C:\\Anaconda3', 'C:\\Miniconda3',
            path.join(home, 'opt', 'anaconda3'), path.join(home, 'opt', 'miniconda3'),
            '/opt/anaconda3', '/opt/miniconda3', '/opt/homebrew/anaconda3',
        ].filter(d => d && !d.startsWith(path.join('', '')));

        for (const dir of candidateDirs) {
            if (result.conda) break;
            const exePaths = [
                path.join(dir, 'condabin', 'conda.bat'),
                path.join(dir, 'Scripts', 'conda.exe'),
                path.join(dir, 'conda.exe'),
                path.join(dir, 'condabin', 'conda'),
                path.join(dir, 'bin', 'conda'),
            ];
            for (const condaExe of exePaths) {
                if (fs.existsSync(condaExe)) {
                    const scanRes = await execAsync(`"${condaExe}" --version`);
                    if (scanRes.ok) {
                        result.conda = true;
                        result.condaVersion = scanRes.output.replace('conda ', '');
                        result.condaPath = condaExe;
                        break;
                    }
                }
            }
        }
    }

    // Mamba
    if (mambaRes.ok) {
        result.mamba = true;
        const match = mambaRes.output.match(/mamba\s+([\d.]+)/);
        result.mambaVersion = match ? match[1] : mambaRes.output.split('\n')[0];
    }

    // Check active conda env
    if (process.env.CONDA_DEFAULT_ENV) {
        result.activeCondaEnv = process.env.CONDA_DEFAULT_ENV;
    }

    res.json(result);
});
// Parse dbt manifest.json for DAG lineage
app.get('/api/dbt/manifest', (req, res) => {
    const manifestPath = path.join(ROOT_DIR, 'target', 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        return res.json({ exists: false, hint: 'Run "dbt compile" or "dbt run" first to generate the manifest.' });
    }

    try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const nodes = [];
        const edges = [];

        // Process nodes (models, seeds, snapshots, tests)
        for (const [key, node] of Object.entries(raw.nodes || {})) {
            const resourceType = node.resource_type; // model, test, seed, snapshot, analysis
            nodes.push({
                id: key,
                name: node.name,
                resourceType,
                schema: node.schema,
                materialized: node.config?.materialized || null,
                path: node.original_file_path || node.path || null,
                description: node.description || '',
                tags: node.tags || [],
            });

            // Build edges from depends_on
            for (const dep of (node.depends_on?.nodes || [])) {
                edges.push({ from: dep, to: key });
            }
        }

        // Process sources
        for (const [key, source] of Object.entries(raw.sources || {})) {
            nodes.push({
                id: key,
                name: `${source.source_name}.${source.name}`,
                resourceType: 'source',
                schema: source.schema,
                materialized: null,
                path: source.original_file_path || null,
                description: source.description || '',
                tags: source.tags || [],
            });
        }

        // Process exposures
        for (const [key, exposure] of Object.entries(raw.exposures || {})) {
            nodes.push({
                id: key,
                name: exposure.name,
                resourceType: 'exposure',
                schema: null,
                materialized: null,
                path: exposure.original_file_path || null,
                description: exposure.description || '',
                tags: exposure.tags || [],
            });
            for (const dep of (exposure.depends_on?.nodes || [])) {
                edges.push({ from: dep, to: key });
            }
        }

        res.json({ exists: true, nodes, edges });
    } catch (err) {
        res.status(500).json({ exists: true, error: `Failed to parse manifest: ${err.message}` });
    }
});

// List conda environments and check for dbt in each
app.get('/api/dbt/conda-envs', (req, res) => {
    const condaCmd = req.query.condaPath || 'conda';
    try {
        const output = execSync(`"${condaCmd}" env list --json`, { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
        const parsed = JSON.parse(output);
        const envPaths = parsed.envs || [];

        const envs = envPaths.map(envPath => {
            const name = path.basename(envPath);
            const isBase = envPath === (parsed.root_prefix || envPath);
            const envName = isBase ? 'base' : name;

            // Fast filesystem check for dbt executable (no process spawn)
            let hasDbt = false;
            const dbtCandidates = [
                path.join(envPath, 'Scripts', 'dbt.exe'),   // Windows
                path.join(envPath, 'bin', 'dbt'),            // macOS/Linux
                path.join(envPath, 'Scripts', 'dbt'),        // Windows alt
            ];
            for (const dbtExe of dbtCandidates) {
                if (fs.existsSync(dbtExe)) {
                    hasDbt = true;
                    break;
                }
            }

            return { name: envName, path: envPath, hasDbt, dbtVersion: null };
        });

        res.json({ success: true, envs });
    } catch (err) {
        // Conda not available or failed
        res.json({ success: false, envs: [], error: err.message });
    }
});

// Check dbt version in a specific conda env (ASYNC — non-blocking)
app.get('/api/dbt/check-env-dbt', async (req, res) => {
    const { envName, condaPath: cp } = req.query;
    if (!envName) return res.status(400).json({ error: 'envName is required' });

    const condaCmd = cp || 'conda';
    try {
        const output = await new Promise((resolve, reject) => {
            exec(`"${condaCmd}" run --no-capture-output -n ${envName} pip show dbt-core`, {
                encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 512
            }, (err, stdout) => {
                if (err) reject(err);
                else resolve((stdout || '').trim());
            });
        });
        const match = output.match(/Version:\s*([\d.]+)/i);
        if (match) {
            res.json({ found: true, version: match[1] });
        } else {
            res.json({ found: false, version: null });
        }
    } catch (e) {
        res.json({ found: false, version: null });
    }
});

// Detect existing DBT project
app.get('/api/dbt/detect', (req, res) => {
    const projectFile = path.join(ROOT_DIR, 'dbt_project.yml');
    if (!fs.existsSync(projectFile)) {
        return res.json({ exists: false });
    }

    try {
        const content = yaml.load(fs.readFileSync(projectFile, 'utf8'));
        res.json({
            exists: true,
            projectName: content.name || 'unknown',
            version: content.version || '1.0.0',
            profile: content.profile || content.name,
            modelPaths: content['model-paths'] || content['source-paths'] || ['models'],
        });
    } catch (err) {
        res.json({ exists: true, error: err.message });
    }
});

// Initialize a new DBT project
app.post('/api/dbt/init', (req, res) => {
    const { projectName = 'amox_dbt_project', profileName } = req.body;
    const safeName = projectName.replace(/[^a-zA-Z0-9_]/g, '_');
    const profile = profileName || safeName;

    try {
        // Create directory structure
        const dirs = [
            'models/staging',
            'models/intermediate',
            'models/marts',
            'macros',
            'tests',
            'seeds',
            'snapshots',
            'analyses',
        ];

        for (const dir of dirs) {
            const dirPath = path.join(ROOT_DIR, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        }

        // Create dbt_project.yml
        const projectConfig = {
            name: safeName,
            version: '1.0.0',
            'config-version': 2,
            profile: profile,
            'model-paths': ['models'],
            'analysis-paths': ['analyses'],
            'test-paths': ['tests'],
            'seed-paths': ['seeds'],
            'macro-paths': ['macros'],
            'snapshot-paths': ['snapshots'],
            'clean-targets': ['target', 'dbt_packages'],
            models: {
                [safeName]: {
                    staging: { '+materialized': 'view', '+schema': 'staging' },
                    intermediate: { '+materialized': 'view', '+schema': 'intermediate' },
                    marts: { '+materialized': 'table', '+schema': 'marts' },
                },
            },
        };

        const projectPath = path.join(ROOT_DIR, 'dbt_project.yml');
        if (!fs.existsSync(projectPath)) {
            fs.writeFileSync(projectPath, yaml.dump(projectConfig, { lineWidth: 120, quotingType: "'", forceQuotes: false }), 'utf8');
        }

        // Create profiles.yml (local, DuckDB target)
        const profilesConfig = {
            [profile]: {
                target: 'dev',
                outputs: {
                    dev: {
                        type: 'duckdb',
                        path: 'dev.duckdb',
                        schema: 'main',
                        threads: 4,
                    },
                },
            },
        };

        const profilesPath = path.join(ROOT_DIR, 'profiles.yml');
        if (!fs.existsSync(profilesPath)) {
            fs.writeFileSync(profilesPath, yaml.dump(profilesConfig, { lineWidth: 120 }), 'utf8');
        }

        // Create .gitignore for DBT
        const gitignorePath = path.join(ROOT_DIR, '.gitignore');
        const dbtIgnoreContent = '\n# DBT\ntarget/\ndbt_packages/\nlogs/\n*.duckdb\n*.duckdb.wal\n';
        if (fs.existsSync(gitignorePath)) {
            const existing = fs.readFileSync(gitignorePath, 'utf8');
            if (!existing.includes('# DBT')) {
                fs.appendFileSync(gitignorePath, dbtIgnoreContent, 'utf8');
            }
        } else {
            fs.writeFileSync(gitignorePath, dbtIgnoreContent.trim(), 'utf8');
        }

        // Create a starter staging model
        const starterModelPath = path.join(ROOT_DIR, 'models', 'staging', '.gitkeep');
        if (!fs.existsSync(starterModelPath)) {
            fs.writeFileSync(starterModelPath, '', 'utf8');
        }

        // Create packages.yml
        const packagesPath = path.join(ROOT_DIR, 'packages.yml');
        if (!fs.existsSync(packagesPath)) {
            fs.writeFileSync(packagesPath, yaml.dump({ packages: [{ package: 'dbt-labs/dbt_utils', version: '1.1.1' }] }), 'utf8');
        }

        res.json({
            success: true,
            message: `DBT project "${safeName}" initialized successfully.`,
            createdDirs: dirs,
            createdFiles: ['dbt_project.yml', 'profiles.yml', 'packages.yml'],
        });
    } catch (err) {
        console.error('DBT Init Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Read profiles.yml
app.get('/api/dbt/profiles', (req, res) => {
    const profilesPath = path.join(ROOT_DIR, 'profiles.yml');
    if (!fs.existsSync(profilesPath)) {
        return res.json({ exists: false });
    }

    try {
        const content = yaml.load(fs.readFileSync(profilesPath, 'utf8'));
        res.json({ exists: true, profiles: content });
    } catch (err) {
        res.status(500).json({ error: 'Failed to parse profiles.yml', details: err.message });
    }
});

// Write profiles.yml
app.post('/api/dbt/profiles', (req, res) => {
    const { profiles } = req.body;
    if (!profiles) return res.status(400).json({ error: 'Profiles data is required' });

    try {
        const profilesPath = path.join(ROOT_DIR, 'profiles.yml');
        fs.writeFileSync(profilesPath, yaml.dump(profiles, { lineWidth: 120 }), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write profiles.yml', details: err.message });
    }
});

// Read dbt_project.yml
app.get('/api/dbt/project-config', (req, res) => {
    const projectPath = path.join(ROOT_DIR, 'dbt_project.yml');
    if (!fs.existsSync(projectPath)) {
        return res.json({ exists: false });
    }

    try {
        const content = yaml.load(fs.readFileSync(projectPath, 'utf8'));
        res.json({ exists: true, config: content });
    } catch (err) {
        res.status(500).json({ error: 'Failed to parse dbt_project.yml', details: err.message });
    }
});

// Write dbt_project.yml
app.post('/api/dbt/project-config', (req, res) => {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'Config data is required' });

    try {
        const projectPath = path.join(ROOT_DIR, 'dbt_project.yml');
        fs.writeFileSync(projectPath, yaml.dump(config, { lineWidth: 120, quotingType: "'", forceQuotes: false }), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write dbt_project.yml', details: err.message });
    }
});

// Generate model template
app.post('/api/dbt/template/model', (req, res) => {
    const { name, materialization = 'view', schema, description, tags, path: modelPath = 'models/staging', template = 'basic' } = req.body;
    if (!name) return res.status(400).json({ error: 'Model name is required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');

    // Template variations
    const templates = {
        basic: `{{
  config(
    materialized='${materialization}'${schema ? `,\n    schema='${schema}'` : ''}${tags ? `,\n    tags=${JSON.stringify(tags.split(',').map(t => t.trim()))}` : ''}
  )
}}

${description ? `{# ${description} #}\n\n` : ''}SELECT
    *
FROM {{ source('source_name', 'table_name') }}
`,
        staging: `{{
  config(
    materialized='view'${schema ? `,\n    schema='${schema}'` : ''}
  )
}}

WITH source AS (
    SELECT * FROM {{ source('source_name', 'table_name') }}
),

renamed AS (
    SELECT
        -- ids
        id,

        -- dimensions
        name,
        category,

        -- timestamps
        created_at,
        updated_at

    FROM source
)

SELECT * FROM renamed
`,
        intermediate: `{{
  config(
    materialized='view'${schema ? `,\n    schema='${schema}'` : ''}
  )
}}

WITH model_a AS (
    SELECT * FROM {{ ref('stg_model_a') }}
),

model_b AS (
    SELECT * FROM {{ ref('stg_model_b') }}
),

joined AS (
    SELECT
        a.id,
        a.name,
        b.metric_value
    FROM model_a a
    LEFT JOIN model_b b ON a.id = b.foreign_id
)

SELECT * FROM joined
`,
        mart: `{{
  config(
    materialized='table'${schema ? `,\n    schema='${schema}'` : ''}${tags ? `,\n    tags=${JSON.stringify(tags.split(',').map(t => t.trim()))}` : ''}
  )
}}

WITH final AS (
    SELECT
        -- primary key
        id,

        -- dimensions
        category,
        status,

        -- measures
        total_amount,
        item_count,

        -- timestamps
        created_at,
        updated_at

    FROM {{ ref('int_model_name') }}
)

SELECT * FROM final
`,
        incremental: `{{
  config(
    materialized='incremental',
    unique_key='id'${schema ? `,\n    schema='${schema}'` : ''}
  )
}}

SELECT
    id,
    status,
    amount,
    updated_at

FROM {{ source('source_name', 'table_name') }}

{% if is_incremental() %}
    WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }})
{% endif %}
`,
    };

    const content = templates[template] || templates.basic;

    try {
        const dirPath = path.join(ROOT_DIR, modelPath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, `${safeName}.sql`);
        if (fs.existsSync(filePath)) {
            return res.status(409).json({ error: `Model file already exists: ${safeName}.sql` });
        }

        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate source YAML
app.post('/api/dbt/template/source', (req, res) => {
    const { sourceName, database, sourceSchema, tables, targetPath = 'models/staging' } = req.body;
    if (!sourceName || !tables || tables.length === 0) {
        return res.status(400).json({ error: 'Source name and at least one table are required' });
    }

    const sourceConfig = {
        version: 2,
        sources: [{
            name: sourceName,
            ...(database ? { database } : {}),
            ...(sourceSchema ? { schema: sourceSchema } : {}),
            tables: tables.map(t => ({
                name: t.name,
                ...(t.description ? { description: t.description } : {}),
                ...(t.columns && t.columns.length > 0 ? {
                    columns: t.columns.map(c => ({
                        name: c.name,
                        ...(c.description ? { description: c.description } : {}),
                        ...(c.tests && c.tests.length > 0 ? { tests: c.tests } : {}),
                    }))
                } : {}),
            })),
        }],
    };

    try {
        const dirPath = path.join(ROOT_DIR, targetPath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const fileName = `_${sourceName}__sources.yml`;
        const filePath = path.join(dirPath, fileName);
        const content = yaml.dump(sourceConfig, { lineWidth: 120, quotingType: "'", forceQuotes: false });

        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate test template
app.post('/api/dbt/template/test', (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Test name is required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const content = `-- ${description || 'Custom data test'}
-- This query should return zero rows to pass

SELECT
    *
FROM {{ ref('model_name') }}
WHERE 1 = 0  -- Replace with your test condition
`;

    try {
        const dirPath = path.join(ROOT_DIR, 'tests');
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const filePath = path.join(dirPath, `${safeName}.sql`);
        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate macro template
app.post('/api/dbt/template/macro', (req, res) => {
    const { name, description, args = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Macro name is required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const content = `{# ${description || safeName + ' macro'} #}

{% macro ${safeName}(${args}) %}

    -- Your macro logic here

{% endmacro %}
`;

    try {
        const dirPath = path.join(ROOT_DIR, 'macros');
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const filePath = path.join(dirPath, `${safeName}.sql`);
        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Build command string
app.post('/api/dbt/command', (req, res) => {
    const { action = 'run', select, exclude, fullRefresh, vars, profilesDir, target } = req.body;
    const validActions = ['run', 'build', 'compile', 'test', 'seed', 'snapshot', 'debug', 'clean', 'deps', 'parse'];

    if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Valid: ${validActions.join(', ')}` });
    }

    let cmd = `dbt ${action}`;

    if (select) cmd += ` --select ${select}`;
    if (exclude) cmd += ` --exclude ${exclude}`;
    if (fullRefresh && ['run', 'build'].includes(action)) cmd += ' --full-refresh';
    if (vars) cmd += ` --vars '${typeof vars === 'string' ? vars : JSON.stringify(vars)}'`;
    if (profilesDir !== undefined) cmd += ` --profiles-dir ${profilesDir || '.'}`;
    else cmd += ' --profiles-dir .';
    if (target) cmd += ` --target ${target}`;

    res.json({ command: cmd });
});

// Execute a DBT command (Option A+: simple exec with output streaming)
app.post('/api/dbt/execute', (req, res) => {
    const { command, condaEnv } = req.body;
    if (!command) return res.status(400).json({ error: 'Command is required' });

    // Security: only allow dbt commands
    if (!command.trim().startsWith('dbt ')) {
        return res.status(403).json({ error: 'Only dbt commands are allowed' });
    }

    // Wrap with conda run if a conda env is specified
    const { condaPath } = req.body;
    let finalCmd = command;
    if (condaEnv && condaEnv !== 'none') {
        const condaCmd = condaPath || 'conda';
        finalCmd = `"${condaCmd}" run --no-capture-output -n ${condaEnv} ${command}`;
    }

    // Set up SSE for streaming output
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const child = exec(finalCmd, { cwd: ROOT_DIR, timeout: 300000, maxBuffer: 1024 * 1024 * 10 });

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) res.write(`data: ${JSON.stringify({ type: 'stdout', text: line })}\n\n`);
        }
    });

    child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) res.write(`data: ${JSON.stringify({ type: 'stderr', text: line })}\n\n`);
        }
    });

    child.on('close', (code) => {
        res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
        res.end();
    });

    child.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', text: err.message })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        try { child.kill(); } catch (e) { /* already dead */ }
    });
});

// Serve Static Assets in Production (Electron App)
if (process.env.NODE_ENV === 'production') {
    // In Electron packing, __dirname might call inside asar. 
    // We need to point to where 'client/dist' is relative to 'server/index.js'.
    // In win-unpacked: resources/app/server/index.js -> resources/app/client/dist
    const clientDistPath = path.join(__dirname, '../client/dist');

    console.log(`[Server] Serving static files from: ${clientDistPath}`);
    app.use(express.static(clientDistPath));

    // Handle React Routing, return all requests to React app
    app.get(/.*/, (req, res) => {
        // Build API safety: Don't return HTML for failed API calls
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: `API route not found: ${req.path}` });
        }
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}

const startServer = (port = 3001) => {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
            console.log(`Serving files from: ${ROOT_DIR}`);
            resolve(server);
        });
        server.on('error', reject);
    });
};

// Allow standalone execution (node server/index.js)
if (require.main === module) {
    startServer(PORT);
}

module.exports = { startServer };
// Trigger restart for Excel Import features
