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
    const { geminiApiKey, provider, defaultModel } = req.body;
    try {
        const config = aiManager.getConfig();
        if (geminiApiKey !== undefined) config.geminiApiKey = geminiApiKey;
        if (provider !== undefined) config.provider = provider;
        if (defaultModel !== undefined) config.defaultModel = defaultModel;

        fs.writeFileSync(aiManager.configPath, JSON.stringify(config, null, 2));
        res.json({ success: true, config });
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
        const result = await dbManager.query(query);
        const end = performance.now();

        res.json({
            data: result,
            executionTime: (end - start).toFixed(2),
            rowCount: result.length
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

    try {
        // Map format to DuckDB COPY options
        let copyFormat;
        if (format === 'csv') copyFormat = "CSV";
        else if (format === 'parquet') copyFormat = "PARQUET";
        else if (format === 'xlsx') {
            // DuckDB doesn't support COPY TO xlsx natively, so we'll use a workaround:
            // Install and load the spatial extension for xlsx support, or fall back to CSV
            // Actually, let's use COPY with json + xlsx package, or just use the simple approach:
            // Export as CSV and let the client rename, OR use DuckDB's INSTALL/LOAD approach
            // For reliability, we'll create a temp table and export via the xlsx npm package
            try {
                // Try using DuckDB's built-in xlsx if spatial extension is loaded
                await dbManager.query(`COPY (${query}) TO '${fullPath}' WITH (FORMAT CSV, HEADER)`);
                // Rename to xlsx — DuckDB doesn't natively write xlsx, so we export as CSV
                // But let the user know
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${query}) t`);
                const rowCount = countResult[0]?.cnt || 0;
                return res.json({ success: true, path: filename, rowCount, note: 'Exported as CSV (rename to .csv for best compatibility)' });
            } catch (xlsxErr) {
                return res.status(500).json({ error: `Excel export failed: ${xlsxErr.message}. Try CSV or Parquet instead.` });
            }
        }

        // Count rows first
        const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${query}) t`);
        const rowCount = countResult[0]?.cnt || 0;

        // Execute COPY TO
        await dbManager.query(`COPY (${query}) TO '${fullPath}' (FORMAT ${copyFormat}, HEADER true)`);

        res.json({ success: true, path: filename, rowCount });
    } catch (err) {
        console.error("Export data failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// (Removed duplicate `/api/db/tables` endpoint from here to avoid conflicts)

/* --- SQL Snippets API --- */
const AMOX_DIR = () => path.join(ROOT_DIR, '.amox');
const ensureAmoxDir = () => { if (!fs.existsSync(AMOX_DIR())) fs.mkdirSync(AMOX_DIR(), { recursive: true }); };

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

// Validate environment: check Python, DBT, and Conda/Mamba availability
app.get('/api/dbt/validate-env', (req, res) => {
    const result = {
        python: false, pythonVersion: null,
        dbt: false, dbtVersion: null,
        conda: false, condaVersion: null,
        mamba: false, mambaVersion: null,
        activeCondaEnv: null,
    };

    // Check Python
    for (const cmd of ['python --version', 'python3 --version']) {
        try {
            const output = execSync(cmd, { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
            result.python = true;
            result.pythonVersion = output.replace('Python ', '');
            break;
        } catch (e) { /* not found, try next */ }
    }

    // Check DBT
    try {
        const output = execSync('dbt --version', { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        result.dbt = true;
        const match = output.match(/installed:\s*([\d.]+)/);
        result.dbtVersion = match ? match[1] : output.split('\n')[0];
    } catch (e) { /* dbt not found */ }

    // Check Conda
    try {
        const output = execSync('conda --version', { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        result.conda = true;
        result.condaVersion = output.replace('conda ', '');
    } catch (e) { /* conda not found */ }

    // Check Mamba
    try {
        const output = execSync('mamba --version', { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        result.mamba = true;
        const match = output.match(/mamba\s+([\d.]+)/);
        result.mambaVersion = match ? match[1] : output.split('\n')[0];
    } catch (e) { /* mamba not found */ }

    // Check active conda env
    if (process.env.CONDA_DEFAULT_ENV) {
        result.activeCondaEnv = process.env.CONDA_DEFAULT_ENV;
    }

    res.json(result);
});

// List conda environments and check for dbt in each
app.get('/api/dbt/conda-envs', (req, res) => {
    try {
        const output = execSync('conda env list --json', { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
        const parsed = JSON.parse(output);
        const envPaths = parsed.envs || [];

        const envs = envPaths.map(envPath => {
            const name = path.basename(envPath);
            // For base env, the name is the full path — detect it
            const isBase = envPath === (parsed.root_prefix || envPath);
            const envName = isBase ? 'base' : name;

            // Check if dbt exists in this env
            let hasDbt = false;
            let dbtVersion = null;
            try {
                const dbtOut = execSync(`conda run --no-capture-output -n ${envName} dbt --version`, {
                    encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe']
                }).trim();
                hasDbt = true;
                const vMatch = dbtOut.match(/installed:\s*([\d.]+)/);
                dbtVersion = vMatch ? vMatch[1] : null;
            } catch (e) { /* dbt not in this env */ }

            return { name: envName, path: envPath, hasDbt, dbtVersion };
        });

        res.json({ success: true, envs });
    } catch (err) {
        // Conda not available or failed
        res.json({ success: false, envs: [], error: err.message });
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
    let finalCmd = command;
    if (condaEnv && condaEnv !== 'none') {
        finalCmd = `conda run --no-capture-output -n ${condaEnv} ${command}`;
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
