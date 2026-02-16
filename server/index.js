/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dbManager = require('./DatabaseManager');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

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
        const tables = await dbManager.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");

        const result = [];
        for (const t of tables) {
            const tableName = t.table_name;
            const columns = await dbManager.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`);
            result.push({ name: tableName, columns: columns });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
    }
});

app.post('/api/db/table-details', async (req, res) => {
    const { tableName, limit = 100, offset = 0 } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Table name required' });

    try {
        // 1. Schema & Metadata
        // DuckDB 'DESCRIBE' gives column_name, column_type, null, key, default, extra
        const describe = await dbManager.query(`DESCRIBE "${tableName}"`);

        // 2. Row Count (Estimated or Exact)
        const countRes = await dbManager.query(`SELECT COUNT(1) as count FROM "${tableName}"`);
        const totalRows = countRes[0].count; // Serialized as string or number

        // 3. Preview Data
        const preview = await dbManager.query(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`);

        // 4. DDL
        let ddl = '';
        try {
            const ddlRes = await dbManager.query(`SELECT sql FROM sqlite_master WHERE name = '${tableName}'`);
            if (ddlRes.length > 0) ddl = ddlRes[0].sql;
        } catch (e) {
            console.warn("DDL fetch fallback failed", e);
            ddl = `-- Could not retrieve DDL for ${tableName}`;
        }

        // 5. Data Profile (SUMMARIZE)
        // DuckDB SUMMARIZE returns: column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage
        let profile = [];
        try {
            profile = await dbManager.query(`SUMMARIZE "${tableName}"`);
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
            const describe = await dbManager.query(`DESCRIBE SELECT * FROM '${fullSourcePath}'`);
            const selectParts = describe.map(col => {
                const oldName = col.column_name;
                const newName = oldName.trim().replace(/\s+/g, '_');
                return `"${oldName}" AS "${newName}"`;
            }).join(', ');
            await dbManager.query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT ${selectParts} FROM '${fullSourcePath}'`);
        } else {
            await dbManager.query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM '${fullSourcePath}'`);
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
            await dbManager.query("INSTALL spatial; LOAD spatial;");
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

            await dbManager.query(`CREATE OR REPLACE TABLE "${tableName}" AS ${unionQuery}`);
            summary.push(`Merged ${sheets.length} sheets into "${tableName}"`);

        } else {
            // INDIVIDUAL
            for (const sheet of sheets) {
                // Determine table name: User might have provided mapping or use sheet name
                // Sanitize sheet name for table name
                const safeTableName = sheet.replace(/[^a-zA-Z0-9_]/g, '_');

                await dbManager.query(`CREATE OR REPLACE TABLE "${safeTableName}" AS SELECT * FROM read_xlsx('${fullPath}', sheet='${sheet}')`);
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

app.post('/api/ai/init', (req, res) => {
    // Start init in background, don't await (it might take time to download)
    aiManager.initialize()
        .then(() => console.log("[API] AI Init finished"))
        .catch(err => console.error("[API] AI Init failed", err));

    res.json({ success: true, message: "Initialization started" });
});

app.post('/api/ai/generate', async (req, res) => {
    const { schema, question } = req.body;
    if (!schema || !question) return res.status(400).json({ error: "Missing schema or question" });

    try {
        const sql = await aiManager.generateQuery(schema, question);
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

app.get('/api/db/tables', async (req, res) => {
    try {
        // When using attached DBs, we need to know what tables exist in the current default schema.
        // DuckDB 'USE' command sets the default catalog/schema.
        // We query 'active_schema' tables.

        // This query works for the currently selected database (via USE)
        const tables = await dbManager.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main' OR table_schema='public'");

        const result = [];
        for (const t of tables) {
            const tableName = t.table_name;
            const columns = await dbManager.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}'`);
            result.push({ name: tableName, columns: columns });
        }

        res.json(result);
    } catch (err) {
        // Fallback for empty/init state
        console.warn("Schema fetch error (might be empty):", err.message);
        res.json([]);
    }
});

app.get('/api/schema', async (req, res) => {
    try {
        const tables = await dbManager.query("SELECT table_name as name FROM information_schema.tables WHERE table_schema='main' OR table_schema='public'");
        res.json(tables);
    } catch (err) {
        res.json([]);
    }
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
