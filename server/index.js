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
const { exec } = require('child_process');
const dbManager        = require('./DatabaseManager');
const scaffolder       = require('./projectScaffolder');
const { applyRowLimit } = require('./_sqlUtils');
const { detectResultType } = require('./_sqlClassify');

const app = express();
const PORT = 3001;

// ─── Internal schemas & tables to ALWAYS hide from the user ───
// Exact internal schemas created by AmoxSQL itself:
const INTERNAL_SCHEMAS = ['information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains'];
const INTERNAL_TABLES_MAIN = ['amox_query_history']; // legacy tables in 'main' (pre-migration)
// Internal schemas matched by PREFIX (catches generated/future names):
//   amoxsql%  → any current/future AmoxSQL internal schema
//   fts\_%    → DuckDB full-text index schemas (fts_main_<table>, fts_amoxsql_ai_messages, …)
const INTERNAL_SCHEMA_PREFIXES = ['amoxsql', 'fts\\_'];

/** Builds a SQL WHERE clause to exclude internal schemas and tables */
function userTablesWhereClause(schemaCol = 'table_schema', nameCol = 'table_name') {
    const schemaList = INTERNAL_SCHEMAS.map(s => `'${s}'`).join(',');
    const tableList = INTERNAL_TABLES_MAIN.map(t => `'${t}'`).join(',');
    const prefixClauses = INTERNAL_SCHEMA_PREFIXES
        .map(p => `${schemaCol} NOT LIKE '${p}%' ESCAPE '\\'`)
        .join(' AND ');
    // Hide Chains intermediate tables (deterministic "__chain_<scope>_*" namespace).
    // Underscores are escaped so LIKE treats them as literals, not wildcards.
    const chainArtifactClause = `${nameCol} NOT LIKE '\\_\\_chain\\_%' ESCAPE '\\'`;
    return `${schemaCol} NOT IN (${schemaList}) AND ${prefixClauses} AND ${chainArtifactClause} AND NOT (${schemaCol} = 'main' AND ${nameCol} IN (${tableList}))`;
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// FIX: Handle BigInt serialization for JSON
BigInt.prototype.toJSON = function () {
    return this.toString();
};

let ROOT_DIR = process.cwd();
const APP_DIR = process.cwd(); // AmoxSQL app directory — never changes, unlike ROOT_DIR

// Track in-flight user queries for cancellation support
const activeQueries = new Map(); // queryId → { interrupt }

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

/* ─── Project Scaffolding ─── */

app.get('/api/project/scaffold-status', (req, res) => {
    try {
        const status = scaffolder.getScaffoldStatus(ROOT_DIR);
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/project/scaffold', (req, res) => {
    const { folders = [] } = req.body;
    try {
        const created = scaffolder.createFolders(ROOT_DIR, folders);
        res.json({ success: true, created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/project/config', (req, res) => {
    try {
        const config = scaffolder.getProjectConfig(ROOT_DIR);
        res.json({ config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/project/config', (req, res) => {
    const { updates } = req.body;
    if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'updates object required' });
    }
    try {
        const config = scaffolder.saveProjectConfig(ROOT_DIR, updates);
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/project/folder-defs', (req, res) => {
    res.json({ folders: scaffolder.getFolderDefs() });
});

/* ─── Git ─── */
const gitManager = require('./git/gitManager');

app.get('/api/git/available', async (req, res) => {
    try {
        const available = await gitManager.isGitAvailable();
        res.json({ available });
    } catch (err) {
        res.json({ available: false });
    }
});

app.get('/api/git/status', async (req, res) => {
    try {
        const isRepo = await gitManager.isRepo(ROOT_DIR);
        if (!isRepo) return res.json({ isRepo: false });
        const status = await gitManager.getStatus(ROOT_DIR);
        res.json({ isRepo: true, ...status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/init', async (req, res) => {
    try {
        const result = await gitManager.initRepo(ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/stage', async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0)
        return res.status(400).json({ error: 'files array required' });
    try {
        const result = await gitManager.stageFiles(ROOT_DIR, files);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/unstage', async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0)
        return res.status(400).json({ error: 'files array required' });
    try {
        const result = await gitManager.unstageFiles(ROOT_DIR, files);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/commit', async (req, res) => {
    const { message, amend } = req.body;
    if (!amend && !message) return res.status(400).json({ error: 'message required' });
    try {
        const result = await gitManager.commit(ROOT_DIR, message, { amend: !!amend });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/git/diff', async (req, res) => {
    const { file, staged } = req.query;
    if (!file) return res.status(400).json({ error: 'file param required' });
    try {
        const result = await gitManager.getDiff(ROOT_DIR, file, staged === 'true');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/git/log', async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    try {
        const isRepo = await gitManager.isRepo(ROOT_DIR);
        if (!isRepo) return res.json({ commits: [] });
        const result = await gitManager.getLog(ROOT_DIR, limit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/git/branches', async (req, res) => {
    try {
        const isRepo = await gitManager.isRepo(ROOT_DIR);
        if (!isRepo) return res.json({ current: null, branches: [] });
        const result = await gitManager.getBranches(ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/branch', async (req, res) => {
    const { name, checkout = true } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const result = await gitManager.createBranch(ROOT_DIR, name, checkout);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/checkout', async (req, res) => {
    const { branch } = req.body;
    if (!branch) return res.status(400).json({ error: 'branch required' });
    try {
        const result = await gitManager.checkoutBranch(ROOT_DIR, branch);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/discard', async (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0)
        return res.status(400).json({ error: 'files array required' });
    try {
        const result = await gitManager.discardChanges(ROOT_DIR, files);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/branch/delete', async (req, res) => {
    const { name, force = false } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const result = await gitManager.deleteBranch(ROOT_DIR, name, force);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/stash', async (req, res) => {
    try {
        const result = await gitManager.stash(ROOT_DIR, req.body.message);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/git/stash/pop', async (req, res) => {
    try {
        const result = await gitManager.stashPop(ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/git/stash/list', async (req, res) => {
    try {
        const result = await gitManager.getStashList(ROOT_DIR);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ─── AI Context folder status & setup ─── */
app.get('/api/ai/context-status', async (req, res) => {
    const contextDir = path.join(ROOT_DIR, 'context');
    const exists = fs.existsSync(contextDir);
    if (!exists) return res.json({ exists: false });

    const files = {
        metrics:   fs.existsSync(path.join(contextDir, 'metrics.yml')),
        joins:     fs.existsSync(path.join(contextDir, 'joins.yml')),
        glossary:  fs.existsSync(path.join(contextDir, 'glossary.md')),
        examples:  [],
    };

    const examplesDir = path.join(contextDir, 'examples');
    if (fs.existsSync(examplesDir)) {
        files.examples = fs.readdirSync(examplesDir).filter(f => f.endsWith('.sql'));
    }

    res.json({ exists: true, path: contextDir, files });
});

app.post('/api/ai/context-setup', async (req, res) => {
    const { files = ['metrics', 'joins', 'glossary', 'examples'] } = req.body;
    const contextDir  = path.join(ROOT_DIR, 'context');
    const examplesDir = path.join(contextDir, 'examples');

    try {
        if (!fs.existsSync(contextDir))  fs.mkdirSync(contextDir,  { recursive: true });
        if (!fs.existsSync(examplesDir)) fs.mkdirSync(examplesDir, { recursive: true });

        const created = [];

        if (files.includes('metrics') && !fs.existsSync(path.join(contextDir, 'metrics.yml'))) {
            fs.writeFileSync(path.join(contextDir, 'metrics.yml'), `# Business Metric Definitions
# The AI uses these when you mention terms like "revenue" or "churn".
# Format: name, sql (DuckDB expression), description, grain, table

metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Total paid revenue, excludes pending and refunded orders
    grain: order
    table: orders

  - name: monthly_active_users
    sql: "COUNT(DISTINCT user_id)"
    description: Unique users with at least one event in the period
    grain: day
    table: events
`, 'utf8');
            created.push('metrics.yml');
        }

        if (files.includes('joins') && !fs.existsSync(path.join(contextDir, 'joins.yml'))) {
            fs.writeFileSync(path.join(contextDir, 'joins.yml'), `# Canonical Join Relationships
# The AI uses these to write correct JOIN clauses without guessing column names.

joins:
  - from: orders
    to: customers
    on: "orders.customer_id = customers.id"
    type: LEFT

  - from: orders
    to: products
    on: "orders.product_id = products.id"
    type: LEFT
`, 'utf8');
            created.push('joins.yml');
        }

        if (files.includes('glossary') && !fs.existsSync(path.join(contextDir, 'glossary.md'))) {
            fs.writeFileSync(path.join(contextDir, 'glossary.md'), `# Domain Glossary

**Revenue**: Paid order amounts only (\`status = 'paid'\`). Never include pending or refunded orders.

**Active User**: Any user who triggered at least one event in the analysis period.

**Churn**: A user who has not returned in the last 30 days.

**Conversion**: A trial user who upgraded to a paid plan within 14 days.
`, 'utf8');
            created.push('glossary.md');
        }

        if (files.includes('examples')) {
            const ex1 = path.join(examplesDir, 'monthly_revenue_trend.sql');
            if (!fs.existsSync(ex1)) {
                fs.writeFileSync(ex1, `-- What is the monthly revenue trend for the last 12 months?
SELECT
    DATE_TRUNC('month', created_at)                         AS month,
    SUM(amount) FILTER (WHERE status = 'paid')              AS revenue,
    COUNT(*) FILTER (WHERE status = 'paid')                 AS orders
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1
ORDER BY 1;
`, 'utf8');
                created.push('examples/monthly_revenue_trend.sql');
            }
            const ex2 = path.join(examplesDir, 'cohort_retention.sql');
            if (!fs.existsSync(ex2)) {
                fs.writeFileSync(ex2, `-- How do I calculate cohort retention by signup month?
WITH cohorts AS (
    SELECT user_id,
           DATE_TRUNC('month', created_at) AS cohort_month
    FROM users
),
activity AS (
    SELECT DISTINCT user_id,
           DATE_TRUNC('month', event_date) AS active_month
    FROM events
)
SELECT
    c.cohort_month,
    DATEDIFF('month', c.cohort_month, a.active_month) AS months_since_signup,
    COUNT(DISTINCT c.user_id)                          AS retained_users
FROM cohorts c
JOIN activity a USING (user_id)
GROUP BY 1, 2
ORDER BY 1, 2;
`, 'utf8');
                created.push('examples/cohort_retention.sql');
            }
        }

        res.json({ success: true, created, path: contextDir });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
            // Initialize chain execution history schema
            try {
                const chainPersistenceModule = require('./ChainPersistence');
                await chainPersistenceModule.initSchema(dbManager);
            } catch (chainErr) {
                console.warn('[Chains] Schema init warning (non-fatal):', chainErr.message);
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

app.get('/api/db/version', async (req, res) => {
    try {
        const rows = await dbManager.systemQuery('SELECT version() as version');
        res.json({ version: rows[0]?.version || 'N/A' });
    } catch (e) {
        res.json({ version: 'N/A' });
    }
});

app.get('/api/db/tables', async (req, res) => {
    try {
        const tables = await dbManager.systemQuery(
            `SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE ${userTablesWhereClause()} ORDER BY table_schema, table_name`,
            { lane: 'meta' }
        );

        const result = [];
        for (const t of tables) {
            const columns = await dbManager.systemQuery(
                `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${t.table_name}' AND table_schema = '${t.table_schema}'`,
                { lane: 'meta' }
            );
            result.push({ name: t.table_name, schema: t.table_schema, type: t.table_type, columns });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
    }
});

// Schema-aware endpoint: returns hierarchy { schema → tables → columns }
app.get('/api/db/schemas', async (req, res) => {
    try {
        // Single JOIN query instead of N+1 per-table queries
        const rows = await dbManager.systemQuery(
            `SELECT t.table_schema, t.table_name, t.table_type,
                    c.column_name, c.data_type
             FROM information_schema.tables t
             LEFT JOIN information_schema.columns c
                    ON c.table_schema = t.table_schema AND c.table_name = t.table_name
             WHERE ${userTablesWhereClause('t.table_schema', 't.table_name')}
             ORDER BY t.table_schema, t.table_name, c.ordinal_position`,
            { lane: 'meta' }
        );

        const schemaMap = {};
        for (const row of rows) {
            if (!schemaMap[row.table_schema]) {
                schemaMap[row.table_schema] = { schema: row.table_schema, tables: {} };
            }
            const tables = schemaMap[row.table_schema].tables;
            if (!tables[row.table_name]) {
                tables[row.table_name] = { name: row.table_name, type: row.table_type, columns: [] };
            }
            if (row.column_name) {
                tables[row.table_name].columns.push({ column_name: row.column_name, data_type: row.data_type });
            }
        }

        const result = Object.values(schemaMap).map(s => ({
            schema: s.schema,
            tables: Object.values(s.tables),
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schemas', details: err.message });
    }
});

// ER Diagram schema — enriched with constraints
app.get('/api/db/er-schema', async (req, res) => {
    try {
        // Optional: restrict the diagram to a single schema
        const { schema } = req.query;
        const schemaFilter = schema ? ` AND t.table_schema = '${String(schema).replace(/'/g, "''")}'` : '';
        // 1. Get tables + columns in a single JOIN query
        const rows = await dbManager.systemQuery(
            `SELECT t.table_schema, t.table_name, t.table_type,
                    c.column_name, c.data_type, c.is_nullable, c.column_default
             FROM information_schema.tables t
             LEFT JOIN information_schema.columns c
                    ON c.table_schema = t.table_schema AND c.table_name = t.table_name
             WHERE ${userTablesWhereClause('t.table_schema', 't.table_name')}${schemaFilter}
             ORDER BY t.table_schema, t.table_name, c.ordinal_position`
        );

        // Build table map from flat rows
        const tableMap = {};
        for (const row of rows) {
            const key = `${row.table_schema}.${row.table_name}`;
            if (!tableMap[key]) {
                tableMap[key] = {
                    name: row.table_name,
                    schema: row.table_schema,
                    type: row.table_type,
                    columns: [],
                };
            }
            if (row.column_name) {
                tableMap[key].columns.push({
                    column_name: row.column_name,
                    data_type: row.data_type,
                    is_nullable: row.is_nullable,
                    column_default: row.column_default,
                });
            }
        }

        // 2. Constraints per table (PK/FK — optional, DuckDB support varies)
        const result = [];
        for (const entry of Object.values(tableMap)) {
            let constraints = [];
            try {
                constraints = await dbManager.systemQuery(
                    `SELECT tc.constraint_type, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
                     FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                     LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND ccu.table_name != tc.table_name
                     WHERE tc.table_name = '${entry.name}' AND tc.table_schema = '${entry.schema}'`
                );
            } catch (e) { /* constraints not available in this DuckDB version */ }

            const pkColumns = new Set(constraints.filter(c => c.constraint_type === 'PRIMARY KEY').map(c => c.column_name));
            const fkMap = {};
            for (const c of constraints.filter(c => c.constraint_type === 'FOREIGN KEY')) {
                fkMap[c.column_name] = { table: c.foreign_table_name, column: c.foreign_column_name };
            }

            result.push({
                name: entry.name,
                schema: entry.schema,
                type: entry.type,
                columns: entry.columns.map(c => ({
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
        // Deliver any batched-but-unflushed entries so the panel is never stale
        await dbManager.flushQueryHistory?.();
        // Check if history table exists first to avoid error
        const check = await dbManager.systemQuery("SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'amoxsql_ai' AND table_name = 'query_history'");
        if (check[0].cnt == 0) {
            return res.json([]);
        }

        const history = await dbManager.systemQuery("SELECT * FROM amoxsql_ai.query_history ORDER BY executed_at DESC LIMIT 1000");
        res.json(history);
    } catch (err) {
        console.error("Failed to fetch history:", err);
        res.status(500).json({ error: 'Failed to fetch history', details: err.message });
    }
});

// POST /api/db/describe — resolve the OUTPUT columns of an arbitrary SELECT/WITH query
// without executing it. DuckDB's DESCRIBE only binds/plans the query, so this is cheap and
// side-effect-free. The editor uses it to suggest columns of CTEs / subqueries that the
// syntactic (tree-sitter) analyzer cannot compute (e.g. `SELECT a+b AS total`).
app.post('/api/db/describe', async (req, res) => {
    const { sql } = req.body || {};
    if (!sql || typeof sql !== 'string') {
        return res.status(400).json({ columns: [], error: 'sql required' });
    }

    // Read-only guard: a single SELECT / WITH…SELECT probe only. Strip comments, then reject
    // DDL/DML and multi-statement payloads.
    const stripped = sql
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .trim()
        .replace(/;\s*$/, '');
    const head = (stripped.match(/^[a-zA-Z]+/) || [''])[0].toUpperCase();
    if (head !== 'SELECT' && head !== 'WITH') {
        return res.status(400).json({ columns: [], error: 'only SELECT/WITH allowed' });
    }
    if (stripped.includes(';')) {
        return res.status(400).json({ columns: [], error: 'single statement only' });
    }

    // DESCRIBE never hangs in practice, but guard anyway so a pathological probe can't stall
    // the editor's completion request.
    const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error('describe timeout')), ms)),
    ]);

    try {
        // 'meta' lane: keeps editor autocomplete responsive even while a long
        // user query occupies the 'main' connection.
        const rows = await withTimeout(dbManager.systemQuery(`DESCRIBE ${stripped}`, { lane: 'meta' }), 1500);
        const columns = (rows || []).map(c => ({ name: c.column_name, type: c.column_type }));
        res.json({ columns });
    } catch (err) {
        // Invalid / mid-typing query → empty result; the editor falls back to its heuristics.
        res.json({ columns: [], error: err?.message || String(err) });
    }
});

// Normalize DuckDB EXPLAIN output (estimated array, or ANALYZE top-level object) into the
// shape the plan viewer expects: { name, timing, cardinality, estimated_cardinality, extra_info, children }.
function normalizeExplain(raw, mode) {
    let top = null;
    let rootRaw;
    if (Array.isArray(raw)) {
        rootRaw = raw[0];
    } else if (raw && (raw.operator_name || raw.operator_type)) {
        rootRaw = raw;
    } else if (raw && Array.isArray(raw.children)) {
        top = raw;                       // ANALYZE: top-level metrics object wrapping the operator tree
        rootRaw = raw.children[0] || raw;
    } else {
        rootRaw = raw;
    }

    const norm = (n) => {
        if (!n || typeof n !== 'object') return null;
        const ei = n.extra_info;
        const estFromInfo = (ei && typeof ei === 'object')
            ? (ei['Estimated Cardinality'] ?? ei.estimated_cardinality) : undefined;
        return {
            name: n.operator_name || n.operator_type || n.name || 'Operator',
            timing: typeof n.operator_timing === 'number' ? n.operator_timing : undefined,
            cardinality: typeof n.operator_cardinality === 'number' ? n.operator_cardinality : undefined,
            estimated_cardinality: n.estimated_cardinality ?? estFromInfo,
            extra_info: ei,
            children: Array.isArray(n.children) ? n.children.map(norm).filter(Boolean) : [],
        };
    };

    const plan = norm(rootRaw);
    const metrics = (mode === 'analyze' && top) ? {
        latency: top.latency,
        rowsReturned: top.rows_returned,
        resultSetSize: top.result_set_size,
        cpuTime: top.cpu_time,
        rowsScanned: top.cumulative_rows_scanned,
        bytesRead: top.total_bytes_read,
        peakMemory: top.system_peak_buffer_memory,
        tempDirSize: top.system_peak_temp_dir_size,
        // Phase timings (only present with profiling_mode='detailed').
        phases: {
            planner: top.planner,
            optimizer: top.all_optimizers,
            physicalPlanner: top.physical_planner,
        },
    } : null;
    return { plan, metrics };
}

// POST /api/db/explain — query plan for the editor's plan viewer.
//  · mode='explain'  → EXPLAIN (FORMAT json): the ESTIMATED plan, does NOT run the query.
//  · mode='analyze'  → EXPLAIN (ANALYZE, FORMAT json): runs the query and returns REAL per-operator
//    timing + cardinality (returns only the plan, not the result set).
// ANALYZE executes the query, so it is gated to read-only statements; otherwise it falls back to explain.
app.post('/api/db/explain', async (req, res) => {
    const { query, mode = 'analyze' } = req.body || {};
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query required' });
    }

    const headMatch = query
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .trim()
        .match(/^[a-zA-Z]+/);
    const isReadOnly = !!headMatch && /^(SELECT|WITH|TABLE|FROM|VALUES|PIVOT|UNPIVOT|DESCRIBE|SUMMARIZE)$/i.test(headMatch[0]);

    let effectiveMode = mode === 'analyze' ? 'analyze' : 'explain';
    let note = null;
    if (effectiveMode === 'analyze' && !isReadOnly) {
        effectiveMode = 'explain';
        note = 'Analyze runs the query — only available for read-only statements (SELECT/WITH). Showing the estimated plan.';
    }

    const explainSql = effectiveMode === 'analyze'
        ? `EXPLAIN (ANALYZE, FORMAT json) ${query}`
        : `EXPLAIN (FORMAT json) ${query}`;

    try {
        // Detailed profiling adds planner/optimizer/physical-planner phase timings (QUERY_ROOT only).
        if (effectiveMode === 'analyze') {
            await dbManager.systemQuery("PRAGMA profiling_mode='detailed'").catch(() => {});
        }
        let rows;
        try {
            rows = await dbManager.systemQuery(explainSql);
        } finally {
            if (effectiveMode === 'analyze') {
                await dbManager.systemQuery("PRAGMA profiling_mode='standard'").catch(() => {});
            }
        }
        const cell = (rows && rows[0]) ? (rows[0].explain_value ?? Object.values(rows[0]).pop()) : null;
        const raw = typeof cell === 'string' ? JSON.parse(cell) : cell;
        const { plan, metrics } = normalizeExplain(raw, effectiveMode);
        if (!plan) return res.status(400).json({ error: 'Could not parse the execution plan.' });
        res.json({ mode: effectiveMode, plan, metrics, note });
    } catch (err) {
        res.status(400).json({ error: err?.message || String(err) });
    }
});

app.post('/api/db/table-details', async (req, res) => {
    const { tableName, schema, limit = 100, offset = 0 } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Table name required' });

    // Schema-qualified reference — handles tables in non-default schemas (e.g. main_gold)
    const ref = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;

    try {
        // 1. Schema & Metadata
        // DuckDB 'DESCRIBE' gives column_name, column_type, null, key, default, extra
        const describe = await dbManager.systemQuery(`DESCRIBE ${ref}`);

        // 2. Row Count (Estimated or Exact)
        const countRes = await dbManager.systemQuery(`SELECT COUNT(1) as count FROM ${ref}`);
        const totalRows = countRes[0].count; // Serialized as string or number

        // 3. Preview Data
        const preview = await dbManager.systemQuery(`SELECT * FROM ${ref} LIMIT ${limit} OFFSET ${offset}`);

        // 4. DDL — reconstructed from the column schema.
        // DuckDB has no `sqlite_master` and no `SHOW CREATE TABLE`, so we rebuild
        // the CREATE statement from the DESCRIBE result we already fetched.
        let ddl = '';
        try {
            const colDefs = describe.map(c => `    "${c.column_name}" ${c.column_type}`).join(',\n');
            ddl = `CREATE TABLE ${ref} (\n${colDefs}\n);`;
        } catch (e) {
            console.warn("DDL reconstruction failed", e);
            ddl = `-- Could not reconstruct DDL for ${tableName}`;
        }

        // 5. Data Profile (SUMMARIZE)
        // DuckDB SUMMARIZE returns: column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage
        let profile = [];
        try {
            profile = await dbManager.systemQuery(`SUMMARIZE ${ref}`);
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
    const { filePath, tableName, cleanColumns, schema } = req.body;

    if (!filePath || !tableName) return res.status(400).json({ error: 'File path and table name required' });

    // Optional target schema — create it if needed and qualify the new table
    const target = schema && schema !== 'main' ? `"${schema}"."${tableName}"` : `"${tableName}"`;

    let fullSourcePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    fullSourcePath = fullSourcePath.replace(/\\/g, '/');

    console.log(`[DEBUG] Import Request:`, { filePath, fullSourcePath, hasWildcard: fullSourcePath.includes('*'), exists: fs.existsSync(fullSourcePath) });

    if (!fullSourcePath.includes('*') && !fs.existsSync(fullSourcePath)) {
        return res.status(404).json({ error: `File not found on server: ${fullSourcePath}` });
    }

    try {
        if (schema && schema !== 'main') {
            await dbManager.systemQuery(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        }
        if (cleanColumns) {
            const describe = await dbManager.systemQuery(`DESCRIBE SELECT * FROM '${fullSourcePath}'`);
            const selectParts = describe.map(col => {
                const oldName = col.column_name;
                const newName = oldName.trim().replace(/\s+/g, '_');
                return `"${oldName}" AS "${newName}"`;
            }).join(', ');
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE ${target} AS SELECT ${selectParts} FROM '${fullSourcePath}'`);
        } else {
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE ${target} AS SELECT * FROM '${fullSourcePath}'`);
        }

        // Force flush of WAL file to avoid locks
        await dbManager.checkpoint();

        res.json({ success: true, table: tableName, schema: schema || 'main' });
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

// Autoload persistence: which extensions to LOAD automatically on startup.
// Stored in ~/.amoxsql/config.json under `extensions` so activations survive an
// app restart (dbManager.loadedExtensions only survives a reconnect within a run).
function getAutoloadExtensions() {
    try {
        const cfg = aiManager.getConfig();
        return Array.isArray(cfg.extensions) ? cfg.extensions : [];
    } catch { return []; }
}
function addAutoloadExtension(name) {
    try {
        const cfg = aiManager.getConfig();
        const list = Array.isArray(cfg.extensions) ? cfg.extensions : [];
        if (!list.includes(name)) {
            list.push(name);
            cfg.extensions = list;
            aiManager.saveConfig(cfg);
        }
    } catch (e) {
        console.warn('[Extensions] Could not persist autoload extension:', e.message);
    }
}
function removeAutoloadExtension(name) {
    try {
        const cfg = aiManager.getConfig();
        const list = Array.isArray(cfg.extensions) ? cfg.extensions : [];
        cfg.extensions = list.filter(n => n !== name);
        aiManager.saveConfig(cfg);
    } catch (e) {
        console.warn('[Extensions] Could not remove autoload extension:', e.message);
    }
}

app.get('/api/db/extensions', async (req, res) => {
    try {
        const extensions = await dbManager.systemQuery('SELECT * FROM duckdb_extensions()');
        res.json(extensions);
    } catch (err) {
        console.error("Failed to fetch extensions:", err);
        res.status(500).json({ error: 'Failed to fetch extensions', details: err.message });
    }
});

// Names of extensions set to auto-load on startup (drives the "Remove from
// startup" affordance in the client).
app.get('/api/db/extensions/autoload', (req, res) => {
    res.json({ names: getAutoloadExtensions() });
});

app.post('/api/db/extensions/install', async (req, res) => {
    const { name, fromCommunity = false } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });

    // Allow alphanumeric, underscores, and hyphens (some community exts use hyphens)
    const safeName = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    // A community-only extension returns "HTTP 404" from the official repo —
    // indistinguishable by message from a genuinely platform-unavailable one.
    // The only way to tell them apart is to actually try the community repo, so
    // do that transparently here (server-side) instead of a client round-trip.
    let triedCommunity = fromCommunity;
    try {
        try {
            await dbManager.systemQuery(`INSTALL ${safeName}${fromCommunity ? ' FROM community' : ''}`);
        } catch (installErr) {
            const looksMissing = /HTTP 404|not found|does not exist|no extension/i.test(installErr.message);
            if (!fromCommunity && looksMissing) {
                triedCommunity = true;
                await dbManager.systemQuery(`INSTALL ${safeName} FROM community`);
            } else {
                throw installErr;
            }
        }
        await dbManager.systemQuery(`LOAD ${safeName}`);
        dbManager.rememberExtension(safeName);
        addAutoloadExtension(safeName);
        res.json({
            success: true,
            message: `Extension '${safeName}' installed and loaded.`,
            fromCommunity: triedCommunity,
        });
    } catch (err) {
        console.error(`Failed to install extension '${safeName}':`, err);
        // HTTP 404 after we've already tried community = not compiled for this
        // DuckDB version/platform.
        const isPlatformUnavailable = /HTTP 404/.test(err.message);
        const urlMatch = err.message.match(/(?:community-)?extensions\.duckdb\.org\/([^/]+)\/([^/]+)\//);
        res.status(500).json({
            error: `Failed to install extension '${safeName}'`,
            details: err.message,
            // The server already exhausted the community fallback, so there is
            // nothing left for the client to retry.
            canRetryFromCommunity: false,
            platformUnavailable: isPlatformUnavailable,
            duckdbVersion: urlMatch?.[1] ?? null,
            platform: urlMatch?.[2] ?? null,
        });
    }
});

app.post('/api/db/extensions/load', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });

    const safeName = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    try {
        await dbManager.systemQuery(`LOAD ${safeName}`);
        dbManager.rememberExtension(safeName);
        addAutoloadExtension(safeName);
        const rows = await dbManager.systemQuery(
            `SELECT * FROM duckdb_extensions() WHERE extension_name = '${safeName}'`
        );
        res.json({ success: true, extension: rows[0] || null });
    } catch (err) {
        console.error(`Failed to load extension '${safeName}':`, err);
        res.status(500).json({ error: `Failed to load extension '${safeName}'`, details: err.message });
    }
});

// Stop auto-loading an extension on startup. It stays loaded in the current
// session (DuckDB has no clean per-connection UNLOAD); this only removes it from
// the persisted autoload list so it won't come back next launch.
app.post('/api/db/extensions/forget', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });
    const safeName = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    dbManager.forgetExtension(safeName);
    removeAutoloadExtension(safeName);
    res.json({ success: true, message: `'${safeName}' removed from startup auto-load.` });
});


/* --- Excel Import APIs --- */
const xlsx = require('xlsx');
const xlsxMeta = require('./xlsxMeta');

app.get('/api/files/inspect-excel', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    try {
        // Fast path: read sheet names from the zip central directory instead of
        // parsing the whole workbook with SheetJS (which inflates every entry).
        // See docs/dev/auditoria_metadata_archivos.md.
        const cached = xlsxMeta.getCached(fullPath);
        if (cached && cached.sheets) return res.json({ sheets: cached.sheets });

        const { sheets } = xlsxMeta.getSheetNames(fullPath);
        xlsxMeta.setCached(fullPath, { sheets });
        res.json({ sheets });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read Excel file', details: err.message });
    }
});

/**
 * GET /api/files/inspect-columns
 * Returns column names and types for any data file (CSV, Parquet, JSON, Excel).
 * For Excel files, also returns sheet names and columns per sheet.
 * Query params: path (required), sheet (optional, for Excel)
 */
app.get('/api/files/inspect-columns', async (req, res) => {
    const filePath = req.query.path;
    const sheet = req.query.sheet; // optional, for Excel
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    fullPath = fullPath.replace(/\\/g, '/');

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    const ext = (fullPath.match(/\.[^.]+$/) || [''])[0].toLowerCase();

    // Metadata runs on the 'meta' lane so it never queues behind a long user
    // query on the 'main' connection. See docs/dev/auditoria_metadata_archivos.md.
    const meta = dbManager.lane ? dbManager.lane('meta') : dbManager;

    try {
        if (ext === '.xlsx' || ext === '.xls') {
            // Serve from cache when the file is unchanged (covers Direct Query →
            // Import → Export-for-AI on the same file paying the cost once).
            const cached = xlsxMeta.getCached(fullPath);
            if (cached && cached.sheetsWithColumns) {
                const target = sheet || cached.sheets[0];
                return res.json({
                    sheets: cached.sheets,
                    columns: cached.sheetsWithColumns[target] || [],
                    sheetsWithColumns: cached.sheetsWithColumns,
                });
            }

            // Sheet names via the zip central directory — not a full SheetJS parse.
            const { sheets } = xlsxMeta.getSheetNames(fullPath);

            // DESCRIBE every sheet once (bind is early-stopping, ~ms per sheet).
            // The target sheet is included here — no separate/duplicate describe.
            const sheetsWithColumns = {};
            for (const s of sheets) {
                try {
                    const desc = await meta.systemQuery(
                        `DESCRIBE SELECT * FROM read_xlsx('${fullPath}', sheet='${s}')`
                    );
                    sheetsWithColumns[s] = desc.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
                } catch (e) {
                    console.warn(`[inspect-columns] Failed to describe Excel sheet '${s}':`, e.message);
                    sheetsWithColumns[s] = [];
                }
            }

            const targetSheet = sheet || sheets[0];
            const columns = sheetsWithColumns[targetSheet] || [];

            xlsxMeta.setCached(fullPath, { sheets, sheetsWithColumns });
            res.json({ sheets, columns, sheetsWithColumns });
        } else {
            // CSV, Parquet, JSON — DuckDB DESCRIBE (sniffer samples; already cheap)
            const describe = await meta.systemQuery(`DESCRIBE SELECT * FROM '${fullPath}'`);
            const columns = describe.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
            res.json({ columns });
        }
    } catch (err) {
        console.error('[inspect-columns] Error:', err);
        res.status(500).json({ error: 'Failed to inspect columns', details: err.message });
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

app.post('/api/settings/config', async (req, res) => {
    const { geminiApiKey, anthropicApiKey, minimaxApiKey, gcpProject, gcpLocation, provider, defaultModel, s3Config, gcsConfig, experimental, modelTierOverrides, geminiModels } = req.body;
    try {
        const config = aiManager.getConfig();
        if (geminiApiKey    !== undefined) config.geminiApiKey    = geminiApiKey;
        if (anthropicApiKey !== undefined) config.anthropicApiKey = anthropicApiKey;
        if (minimaxApiKey   !== undefined) config.minimaxApiKey   = minimaxApiKey;
        if (gcpProject      !== undefined) config.gcpProject      = gcpProject;
        if (gcpLocation     !== undefined) config.gcpLocation     = gcpLocation || 'us-central1';
        if (provider        !== undefined) config.provider        = provider;
        if (defaultModel    !== undefined) config.defaultModel    = defaultModel;
        if (s3Config        !== undefined) config.s3Config        = s3Config;
        if (gcsConfig       !== undefined) config.gcsConfig       = gcsConfig;
        if (experimental  !== undefined) {
            config.experimental = { ...config.experimental, ...experimental };
        }
        if (modelTierOverrides !== undefined) {
            config.modelTierOverrides = modelTierOverrides;
            // Sync with modelProfiles module immediately
            const { setUserTierOverrides } = require('./ai/modelProfiles');
            setUserTierOverrides(modelTierOverrides);
        }
        if (geminiModels !== undefined) {
            config.geminiModels = geminiModels;
        }

        await fs.promises.writeFile(aiManager.configPath, JSON.stringify(config, null, 2));
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/gemini/models', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const apiKey = config.geminiApiKey;
        
        // Default hardcoded list for fallback or ADC mode
        const defaultModels = [
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
        ];

        if (!apiKey) {
            return res.json({ models: defaultModels });
        }
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) {
            console.error(`Failed to fetch Gemini models: ${response.statusText}`);
            return res.json({ models: defaultModels });
        }
        
        const data = await response.json();
        
        // Filter only models that support 'generateContent' and contain 'gemini' followed by a number in their name
        const validModels = (data.models || [])
            .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
            .filter(m => {
                const nameStr = m.name.toLowerCase();
                const dispStr = m.displayName ? m.displayName.toLowerCase() : '';
                const regex = /gemini[- ]?\d/i;
                return regex.test(nameStr) || regex.test(dispStr);
            })
            .map(m => ({
                id: m.name.replace('models/', ''),
                label: m.displayName || m.name.replace('models/', '')
            }));
            
        res.json({ models: validModels });
    } catch (err) {
        console.error("Error fetching Gemini models:", err);
        // Fallback gracefully so UI doesn't break
        res.json({ models: [
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
        ]});
    }
});

/**
 * Generic cloud model discovery. Queries each provider's live "list models" API
 * so a new release (e.g. MiniMax M3, a new Gemini/Claude) appears automatically
 * with NO code change. Always returns { models: [{id, label}], source } and
 * degrades to a small fallback list when there's no API key or the API is down.
 * New cloud model ids also "just work" at runtime: AiManager.getModel() passes the
 * id straight through, and modelProfiles forces cloud-tier for cloud providers.
 */
async function fetchCloudModels(provider, config) {
    const FALLBACKS = {
        gemini: [
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        ],
        anthropic: [
            { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
            { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
            { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
        ],
        minimax: [
            { id: 'MiniMax-M2.7', label: 'MiniMax M2.7' },
            { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
            { id: 'MiniMax-M2-Her', label: 'MiniMax M2 Her' },
        ],
    };
    const fallback = FALLBACKS[provider] || [];

    try {
        if (provider === 'gemini') {
            const key = config.geminiApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!key) return { models: fallback, source: 'fallback' };
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (!r.ok) return { models: fallback, source: 'fallback' };
            const d = await r.json();
            const re = /gemini[- ]?\d/i;
            const models = (d.models || [])
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .filter(m => re.test(m.name || '') || re.test(m.displayName || ''))
                .map(m => ({ id: m.name.replace('models/', ''), label: m.displayName || m.name.replace('models/', '') }));
            return { models: models.length ? models : fallback, source: models.length ? 'api' : 'fallback' };
        }

        if (provider === 'anthropic') {
            const key = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
            if (!key) return { models: fallback, source: 'fallback' };
            const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
                headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            });
            if (!r.ok) return { models: fallback, source: 'fallback' };
            const d = await r.json();
            const models = (d.data || []).map(m => ({ id: m.id, label: m.display_name || m.id })).filter(m => m.id);
            return { models: models.length ? models : fallback, source: models.length ? 'api' : 'fallback' };
        }

        if (provider === 'minimax') {
            const key = config.minimaxApiKey || process.env.MINIMAX_API_KEY;
            if (!key) return { models: fallback, source: 'fallback' };
            // MiniMax is OpenAI-compatible; /v1/models may or may not be exposed.
            const r = await fetch('https://api.minimax.io/v1/models', {
                headers: { Authorization: `Bearer ${key}` },
            });
            if (!r.ok) return { models: fallback, source: 'fallback' };
            const d = await r.json();
            const raw = d.data || d.models || [];
            const models = raw.map(m => ({ id: m.id || m.name, label: m.id || m.name })).filter(m => m.id);
            return { models: models.length ? models : fallback, source: models.length ? 'api' : 'fallback' };
        }
    } catch (err) {
        console.error(`[Models] ${provider} discovery failed:`, err.message);
        return { models: fallback, source: 'fallback', error: err.message };
    }

    return { models: fallback, source: 'fallback' };
}

// Unified endpoint — works for any cloud provider with a list API.
app.get('/api/settings/models/:provider', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const out = await fetchCloudModels(req.params.provider, config);
        res.json(out);
    } catch (err) {
        res.json({ models: [], source: 'error', error: err.message });
    }
});

app.post('/api/settings/cloud/test-adc', async (req, res) => {
    try {
        const { createVertex } = require('@ai-sdk/google-vertex');
        const { generateText } = require('ai');

        const config = aiManager.getConfig();
        const project  = req.body?.gcpProject  || config.gcpProject  || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
        const location = req.body?.gcpLocation || config.gcpLocation || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

        if (!project) {
            return res.json({
                success: false,
                message: 'GCP Project ID is required for ADC. Fill in the "GCP Project ID" field and save before testing.',
            });
        }

        const vertex = createVertex({ project, location });
        const model  = vertex('gemini-2.5-flash');

        const result = await generateText({
            model,
            prompt: 'Say "ADC authentication successful"',
            maxOutputTokens: 10,
        });

        if (result.text) {
            res.json({ success: true, message: `ADC connection successful. (project: ${project}, location: ${location})` });
        } else {
            res.json({ success: false, message: 'Vertex AI responded but returned no text. Check project and location.' });
        }
    } catch (err) {
        // Surface actionable hints for the most common errors
        let message = err.message || 'ADC connection failed.';
        if (message.includes('UNAUTHENTICATED') || message.includes('credentials')) {
            message = `ADC credentials not found. Run: gcloud auth application-default login\n\nDetails: ${message}`;
        } else if (message.includes('PERMISSION_DENIED') || message.includes('403')) {
            message = `Permission denied. Make sure your GCP account has the "Vertex AI User" role on project "${(aiManager.getConfig().gcpProject || '?')}".\n\nDetails: ${message}`;
        } else if (message.includes('PROJECT_NOT_FOUND') || message.includes('project') && message.includes('not found')) {
            message = `Project not found. Verify the GCP Project ID is correct.\n\nDetails: ${message}`;
        }
        res.json({ success: false, message });
    }
});

// ── Cloud Export (S3 / GCS via DuckDB httpfs) ──
app.post('/api/export/cloud', async (req, res) => {
    const { query, destination, format, provider: cloudProvider } = req.body;
    // destination: s3://bucket/path/file.parquet or gs://bucket/path/file.csv
    // format: parquet, csv, json
    // cloudProvider: s3 or gcs
    // Cloud export supports only CSV/JSON/Parquet — NOT xlsx. Validate up front so
    // an unsupported format never silently falls through to a Parquet body written
    // under a mismatched extension.
    const allowedCloudFormats = ['csv', 'parquet', 'json'];
    if (!allowedCloudFormats.includes((format || '').toLowerCase())) {
        return res.status(400).json({
            error: `Formato no soportado para export a la nube: ${format || '(vacío)'}. Usa CSV, JSON o Parquet.`,
        });
    }

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

// ── Google Sheets Integration (DuckDB gsheets extension) ──

// Helper: ensure gsheets extension installed and loaded, and secret created
async function ensureGSheetsReady() {
    try {
        // Check if extension is already loaded
        const exts = await dbManager.systemQuery(
            "SELECT installed, loaded FROM duckdb_extensions() WHERE extension_name = 'gsheets'"
        );
        const ext = exts[0];
        if (!ext || !ext.installed) {
            await dbManager.systemQuery("INSTALL gsheets FROM community");
        }
        if (!ext || !ext.loaded) {
            await dbManager.systemQuery("LOAD gsheets");
        }
    } catch (e) {
        // If extension is already loaded, DuckDB may throw — ignore
        if (!e.message.includes('already loaded')) throw e;
    }

    // Create secret from config if not already done
    const config = aiManager.getConfig();
    const gsheets = config.gsheets || {};
    if (gsheets.serviceAccountKeyPath) {
        try {
            // Drop existing secret first to avoid conflicts
            try { await dbManager.systemQuery("DROP SECRET IF EXISTS __amox_gsheet"); } catch {}
            const saPath = gsheets.serviceAccountKeyPath.replace(/\\/g, '/');
            await dbManager.systemQuery(
                `CREATE SECRET __amox_gsheet (TYPE gsheet, PROVIDER key_file, FILEPATH '${saPath}')`
            );
        } catch (e) {
            if (!e.message.includes('already exists')) throw e;
        }
    }
}

// POST /api/gsheets/setup — Upload/set SA key path and initialize extension
app.post('/api/gsheets/setup', async (req, res) => {
    const { serviceAccountKeyPath } = req.body;
    if (!serviceAccountKeyPath) return res.status(400).json({ error: 'serviceAccountKeyPath is required' });

    try {
        // Validate the file exists
        if (!fs.existsSync(serviceAccountKeyPath)) {
            return res.status(400).json({ error: 'Service Account key file not found at the specified path.' });
        }

        // Read the SA email from the JSON
        const saData = JSON.parse(fs.readFileSync(serviceAccountKeyPath, 'utf8'));
        const email = saData.client_email || '';

        // Save to config
        const config = aiManager.getConfig();
        if (!config.gsheets) config.gsheets = {};
        config.gsheets.serviceAccountKeyPath = serviceAccountKeyPath;
        config.gsheets.serviceAccountEmail = email;
        if (!config.gsheets.sheets) config.gsheets.sheets = [];
        aiManager.saveConfig(config);

        // Initialize extension and secret
        await ensureGSheetsReady();

        res.json({ success: true, email, message: 'Google Sheets configured successfully.' });
    } catch (err) {
        console.error('[GSheets] Setup failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gsheets/status — Check extension + secret status
app.get('/api/gsheets/status', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const gsheets = config.gsheets || {};
        const isConfigured = !!gsheets.serviceAccountKeyPath;

        let extensionLoaded = false;
        try {
            const exts = await dbManager.systemQuery(
                "SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'gsheets'"
            );
            extensionLoaded = exts[0]?.loaded === true || exts[0]?.loaded === 'true';
        } catch {}

        res.json({
            isConfigured,
            extensionLoaded,
            serviceAccountEmail: gsheets.serviceAccountEmail || '',
            sheetsCount: (gsheets.sheets || []).length,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gsheets/sheets — List registered sheets
app.get('/api/gsheets/sheets', (req, res) => {
    const config = aiManager.getConfig();
    res.json(config.gsheets?.sheets || []);
});

// POST /api/gsheets/sheets — Register a new sheet
app.post('/api/gsheets/sheets', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Sheet URL is required' });

    // Extract spreadsheet ID from URL
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return res.status(400).json({ error: 'Invalid Google Sheets URL. Expected format: https://docs.google.com/spreadsheets/d/{id}/...' });
    const spreadsheetId = idMatch[1];

    try {
        await ensureGSheetsReady();

        // Fetch spreadsheet metadata (title) by reading the first row
        let spreadsheetName = `Sheet ${spreadsheetId.substring(0, 8)}`;
        try {
            // Try to get the title from the Google Sheets API via the SA credentials
            const config = aiManager.getConfig();
            const saPath = config.gsheets?.serviceAccountKeyPath;
            if (saPath) {
                const saData = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                // Generate JWT for Google API
                const jwt = require('jsonwebtoken');
                const now = Math.floor(Date.now() / 1000);
                const token = jwt.sign({
                    iss: saData.client_email,
                    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                    aud: 'https://oauth2.googleapis.com/token',
                    iat: now,
                    exp: now + 3600,
                }, saData.private_key, { algorithm: 'RS256' });

                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`
                });
                const tokenData = await tokenRes.json();

                if (tokenData.access_token) {
                    const metaRes = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
                        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
                    );
                    if (metaRes.ok) {
                        const meta = await metaRes.json();
                        spreadsheetName = meta.properties?.title || spreadsheetName;
                    }
                }
            }
        } catch (e) {
            console.warn('[GSheets] Could not fetch spreadsheet title:', e.message);
        }

        // Validate we can actually read it
        await dbManager.systemQuery(`SELECT * FROM read_gsheet('${spreadsheetId}') LIMIT 1`);

        // Fetch sheet tabs
        let tabs = [];
        try {
            const config = aiManager.getConfig();
            const saPath = config.gsheets?.serviceAccountKeyPath;
            if (saPath) {
                const saData = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                const jwt = require('jsonwebtoken');
                const now = Math.floor(Date.now() / 1000);
                const jwtToken = jwt.sign({
                    iss: saData.client_email,
                    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                    aud: 'https://oauth2.googleapis.com/token',
                    iat: now,
                    exp: now + 3600,
                }, saData.private_key, { algorithm: 'RS256' });
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`
                });
                const tokenData = await tokenRes.json();
                if (tokenData.access_token) {
                    const metaRes = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
                        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
                    );
                    if (metaRes.ok) {
                        const meta = await metaRes.json();
                        tabs = (meta.sheets || []).map(s => ({
                            title: s.properties.title,
                            sheetId: s.properties.sheetId,
                            index: s.properties.index,
                        }));
                    }
                }
            }
        } catch {}

        const newSheet = {
            id: `gs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            url,
            spreadsheetId,
            name: spreadsheetName,
            tabs,
            addedAt: new Date().toISOString(),
        };

        const config = aiManager.getConfig();
        if (!config.gsheets) config.gsheets = {};
        if (!config.gsheets.sheets) config.gsheets.sheets = [];

        // Check duplicate
        if (config.gsheets.sheets.some(s => s.spreadsheetId === spreadsheetId)) {
            return res.status(409).json({ error: 'This spreadsheet is already registered.' });
        }

        config.gsheets.sheets.push(newSheet);
        aiManager.saveConfig(config);

        res.json(newSheet);
    } catch (err) {
        console.error('[GSheets] Register failed:', err);
        res.status(500).json({ error: `Failed to connect to Google Sheet: ${err.message}` });
    }
});

// DELETE /api/gsheets/sheets/:id — Remove a registered sheet
app.delete('/api/gsheets/sheets/:id', (req, res) => {
    const config = aiManager.getConfig();
    if (!config.gsheets?.sheets) return res.json({ success: true });
    config.gsheets.sheets = config.gsheets.sheets.filter(s => s.id !== req.params.id);
    aiManager.saveConfig(config);
    res.json({ success: true });
});

// GET /api/gsheets/preview/:id — Preview first 100 rows of a sheet (specific tab)
app.get('/api/gsheets/preview/:id', async (req, res) => {
    const { tab } = req.query;
    try {
        await ensureGSheetsReady();
        const config = aiManager.getConfig();
        const sheet = (config.gsheets?.sheets || []).find(s => s.id === req.params.id);
        if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

        const sheetClause = tab ? `, sheet='${tab.replace(/'/g, "''")}'` : '';
        const rows = await dbManager.query(
            `SELECT * FROM read_gsheet('${sheet.spreadsheetId}'${sheetClause}) LIMIT 100`
        );
        res.json({ rows, sheetName: sheet.name, tab: tab || 'Sheet1' });
    } catch (err) {
        console.error('[GSheets] Preview failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/gsheets/test — Test connection with SA key
app.post('/api/gsheets/test', async (req, res) => {
    try {
        await ensureGSheetsReady();
        res.json({ success: true, message: 'Google Sheets extension loaded and secret configured.' });
    } catch (err) {
        res.json({ success: false, message: err.message });
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

/**
 * GET /api/settings/ollama/models-enriched
 * Returns installed models with capabilities, tier classification, and metadata.
 * Uses Ollama /api/show for capability detection.
 */
app.get('/api/settings/ollama/models-enriched', async (req, res) => {
    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const { getModelProfile: getProfileFn, classifyModelFromCapabilities, fetchOllamaModelInfo } = require('./ai/modelProfiles');
        const listResult = await ollamaClient.list();
        const models = listResult.models || [];
        const config = aiManager.getConfig();
        const overrides = config.modelTierOverrides || {};

        const enriched = [];
        for (const m of models) {
            try {
                const info = await fetchOllamaModelInfo(m.name);
                const profile = getProfileFn(m.name, 'ollama', info);
                enriched.push({
                    name: m.name,
                    size: m.size,
                    parameterSize: info?.parameterSize || m.details?.parameter_size || '',
                    family: info?.family || m.details?.family || '',
                    quantization: info?.quantization || m.details?.quantization_level || '',
                    capabilities: info?.capabilities || [],
                    tier: profile.tier,
                    isUserOverride: !!overrides[m.name.toLowerCase()],
                    autoDetected: !!profile.autoDetected,
                });
            } catch {
                // Fallback without enrichment
                const profile = getProfileFn(m.name, 'ollama');
                enriched.push({
                    name: m.name,
                    size: m.size,
                    parameterSize: m.details?.parameter_size || '',
                    family: m.details?.family || '',
                    quantization: m.details?.quantization_level || '',
                    capabilities: [],
                    tier: profile.tier,
                    isUserOverride: false,
                    autoDetected: false,
                });
            }
        }

        res.json({ models: enriched });
    } catch (err) {
        console.error("Failed to list enriched Ollama models", err);
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
            WHERE ${userTablesWhereClause()}
            AND table_type = 'BASE TABLE'
        `;

        // If explicit context tables requested, filter by them
        if (contextTables) {
            const tableNames = contextTables.map(t => `'${t.name.replace(/'/g, "''")}'`).join(',');
            query += `\n            AND table_name IN (${tableNames})`;
        }

        query += `\n            ORDER BY table_schema, table_name`;

        const tables = await dbManager.systemQuery(query, { lane: 'meta' });
        const selected = tables.slice(0, 30);
        if (selected.length === 0) {
            _tableContextCache = [];
            _tableContextCacheTime = now;
            return [];
        }

        // Single pass instead of DESCRIBE + COUNT(*) per table (up to 60 queries
        // before the first stream token): one information_schema.columns scan for
        // all selected tables + duckdb_tables() estimated_size for row counts.
        const esc = (v) => String(v).replace(/'/g, "''");
        const keyList = selected
            .map(t => `'${esc(t.table_schema)}.${esc(t.table_name)}'`)
            .join(',');

        let colRows = [];
        let sizeRows = [];
        try {
            [colRows, sizeRows] = await Promise.all([
                dbManager.systemQuery(
                    `SELECT table_schema, table_name, column_name, data_type
                     FROM information_schema.columns
                     WHERE table_schema || '.' || table_name IN (${keyList})
                     ORDER BY table_schema, table_name, ordinal_position`,
                    { lane: 'meta' }
                ),
                dbManager.systemQuery(
                    `SELECT schema_name, table_name, estimated_size
                     FROM duckdb_tables()
                     WHERE schema_name || '.' || table_name IN (${keyList})`,
                    { lane: 'meta' }
                ),
            ]);
        } catch { /* fall through — tables render with empty columns / '?' rows */ }

        const colMap = new Map();   // 'schema.table' → [{name, type}]
        for (const c of colRows) {
            const key = `${c.table_schema}.${c.table_name}`;
            if (!colMap.has(key)) colMap.set(key, []);
            colMap.get(key).push({ name: c.column_name, type: c.data_type });
        }
        const sizeMap = new Map();  // 'schema.table' → estimated row count
        for (const r of sizeRows) {
            const key = `${r.schema_name}.${r.table_name}`;
            if (!sizeMap.has(key)) sizeMap.set(key, r.estimated_size);
        }

        const tableContexts = selected.map(t => {
            const key = `${t.table_schema}.${t.table_name}`;
            const rowsVal = sizeMap.get(key);
            return {
                name: t.table_name,
                schema: t.table_schema,
                columns: colMap.get(key) || [],
                rows: (rowsVal !== undefined && rowsVal !== null) ? rowsVal : '?',
            };
        });

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
const { getModelProfile: getModelProfileForRoute, fetchOllamaModelInfo: fetchOllamaInfoForRoute } = require('./ai/modelProfiles');

// ── Chart Story — on-demand story generation for the UI button ───────────────
app.post('/api/ai/chart-story', async (req, res) => {
    try {
        const { data, xKey, yKey, chartType, titleHint } = req.body;
        if (!data || !Array.isArray(data) || !xKey || !yKey) {
            return res.status(400).json({ error: 'data (array), xKey, and yKey are required.' });
        }
        const { generateChartStory } = require('./ai/chartStory');
        const story = generateChartStory(data, { xKey, yKey, chartType, titleHint });
        if (story.error) return res.status(422).json({ error: story.error });
        return res.json(story);
    } catch (err) {
        console.error('[chart-story]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Expand lightweight artifact references ("Ask about this") into prompt-ready
 * objects: rehydrate SQL + sample rows from the persistent query cache by
 * queryId so the agent can answer anchored to the actual artifact. Refs whose
 * data is no longer cached are flagged `stale` (the agent re-runs their SQL).
 */
async function expandReferencedArtifacts(refs) {
    if (!Array.isArray(refs) || refs.length === 0) return [];
    const persistence = require('./ai/persistence');
    const out = [];
    for (const ref of refs) {
        if (!ref || typeof ref !== 'object') continue;
        const enriched = { ...ref };
        if (ref.queryId) {
            try {
                const cached = await persistence.getQueryCache(dbManager, ref.queryId);
                if (cached) {
                    enriched.sql = cached.sql_query || ref.sql || null;
                    enriched.columns = cached.columns_info || null;
                    enriched.sampleRows = Array.isArray(cached.data) ? cached.data.slice(0, 20) : null;
                } else {
                    enriched.stale = true;
                }
            } catch {
                enriched.stale = true;
            }
        }
        out.push(enriched);
    }
    return out;
}

app.post('/api/ai/chat/stream', async (req, res) => {
    const { messages, provider, model, mode, contextFiles, contextTables, currentQuery, currentResult, currentChartConfig, activeSkillId, filePath, fileType, conversationId, planStepOverrides, continueMode, continueBudget, referencedArtifacts, uiTheme } = req.body;

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
    // Ship headers immediately (context building below can take a while) and
    // disable Nagle so small SSE frames aren't batched by the TCP stack.
    res.flushHeaders();
    res.socket?.setNoDelay?.(true);

    try {
        const hasExplicitContext = (contextFiles && contextFiles.length > 0) || (contextTables && contextTables.length > 0);
        const tablesToLoad = hasExplicitContext ? (contextTables || []) : null;

        const [tables, files, expandedReferences] = await Promise.all([
            buildTableContext(tablesToLoad),
            buildFileContext(contextFiles),
            expandReferencedArtifacts(referencedArtifacts),
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
            referencedArtifacts: expandedReferences,
            activeSkillId,
            filePath,
            fileType,
            uiTheme: uiTheme || null,
            conversationId: conversationId || null,
            planStepOverrides: Array.isArray(planStepOverrides) ? planStepOverrides : [],
            // continueMode: user clicked "Continue" after loop exhaustion — grant extra
            // iterations AND resume the persisted plan (the client sends content-only
            // messages, so the loop can't reconstruct the plan from history).
            // continueBudget lets the client request a smaller fresh budget — e.g.
            // "Finish now" sends 1 so the wrap-up turn forces synthesis immediately.
            continueMode: !!continueMode,
            maxIterations: continueMode
                ? Math.max(1, Math.min(50, Number(continueBudget) || 30))
                : undefined,
        };

        // Detect model tier to choose between tool-loop and prompt-only
        const resolvedModel    = model    || aiManager.modelName;
        const resolvedProvider = provider || aiManager.provider;
        
        // Fetch Ollama model info for capability-based classification (cached)
        let ollamaInfo = null;
        if (resolvedProvider !== 'gemini') {
            ollamaInfo = await fetchOllamaInfoForRoute(resolvedModel).catch(() => null);
        }
        const profile = getModelProfileForRoute(resolvedModel, resolvedProvider, ollamaInfo);

        // Check experimental planner flag
        const appConfig     = aiManager.getConfig();
        const plannerActive = !!(appConfig.experimental?.planner) &&
                              (mode || 'diving') === 'diving' &&
                              profile.tier !== 'low';

        if (profile.tier === 'low') {
            // ── Prompt-Only Mode for low-tier models ──
            console.log(`[API] Using prompt-only mode for ${resolvedModel} (tier: low)`);

            for await (const event of aiManager.promptOnlyStreamChat(chatOptions)) {
                if (res.closed) break;
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            }

            res.write(`data: [DONE]\n\n`);
            res.end();

        } else if (plannerActive) {
            // ── Agentic Loop (experimental.planner=true, diving mode) ──
            console.log(`[API] Using agentic loop for ${resolvedModel} (tier: ${profile.tier})`);

            for await (const event of aiManager.streamChatAgentic(chatOptions)) {
                if (res.closed) {
                    console.log('[AI AgenticLoop] Client disconnected, stopping.');
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
                    const toolArgs = part.input ?? part.args ?? {};
                    res.write(`data: ${JSON.stringify({ type: 'tool-call', toolName: part.toolName, args: toolArgs, toolCallId: part.toolCallId })}\n\n`);
                } else if (part.type === 'tool-result') {
                    const toolResult = part.output ?? part.result ?? { error: 'Tool returned no result' };
                    const toolArgs   = part.input  ?? part.args  ?? {};
                    if (toolResult.error) {
                        console.error(`[AI Tool Error] ${part.toolName}:`, toolResult.error);
                    }
                    res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId, result: toolResult, args: toolArgs })}\n\n`);
                } else if (part.type === 'tool-error') {
                    const errorMsg = part.error?.message || String(part.error || 'Unknown tool error');
                    const toolArgs = part.input ?? part.args ?? {};
                    console.error(`[AI Tool Error] ${part.toolName}: ${errorMsg}`);
                    res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId, result: { error: errorMsg }, args: toolArgs })}\n\n`);
                } else if (part.type === 'step-finish') {
                    res.write(`data: ${JSON.stringify({ type: 'step-finish' })}\n\n`);
                } else if (part.type === 'finish') {
                    // No queryResults here: the payload can be huge and the client
                    // rehydrates rows on demand via /api/ai/query-cache/:queryId.
                    res.write(`data: ${JSON.stringify({ type: 'finish', usage: part.usage })}\n\n`);
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
        const scope = (req.query.scope || '').toLowerCase();
        let skills = await aiSkills.loadSkills(APP_DIR);
        if (scope) skills = skills.filter(s => (s.scope || 'analysis') === scope);
        res.json(skills.map(s => ({ id: s.id, name: s.name, description: s.description, scope: s.scope || 'analysis', keywords: s.keywords || [], fileName: s.fileName || '' })));
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
        const skill = await aiSkills.getSkill(APP_DIR, req.params.id);
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

/**
 * PUT /api/ai/conversations/:id/context-objects — Persist drag-drop context objects
 * Body: { contextObjects: [{type, name, path?}] }
 */
app.put('/api/ai/conversations/:id/context-objects', async (req, res) => {
    try {
        const { contextObjects } = req.body;
        if (!Array.isArray(contextObjects)) return res.status(400).json({ error: 'contextObjects must be an array' });
        const result = await aiPersistence.updateContextObjects(dbManager, req.params.id, contextObjects);
        res.json(result);
    } catch (err) {
        console.error('[API] Update context objects error:', err);
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
        // Accept both legacy field names and the client's shorthand (type/name/data)
        const { type, name, data, artifactType, filePath, fileName, ...rest } = req.body;
        const artifact = await aiPersistence.createArtifact(dbManager, {
            conversationId: req.params.id,
            artifactType:   artifactType || type,
            fileName:       fileName     || name,
            filePath:       filePath     || data?.path  || null,
            metadata:       rest.metadata || data || null,
            ...rest,
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

/* --- AI Memories CRUD APIs --- */

/**
 * GET /api/ai/memories — List all active memories (superseded_by IS NULL)
 */
app.get('/api/ai/memories', async (req, res) => {
    try {
        const memories = await aiPersistence.getMemories(dbManager);
        res.json(memories);
    } catch (err) {
        console.error('[API] Get memories error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/memories/:id — Delete a memory
 */
app.delete('/api/ai/memories/:id', async (req, res) => {
    try {
        const result = await aiPersistence.deleteMemory(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        console.error('[API] Delete memory error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/memories/:id — Update memory content/category
 * Body: { content, category }
 */
app.put('/api/ai/memories/:id', async (req, res) => {
    try {
        const { content, category } = req.body;
        if (!content) return res.status(400).json({ error: 'content is required' });
        const result = await aiPersistence.updateMemory(dbManager, req.params.id, { content, category });
        res.json(result);
    } catch (err) {
        console.error('[API] Update memory error:', err);
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

/* --- AI Query Cache API --- */

/**
 * GET /api/ai/query-cache/:queryId — Retrieve a cached query result by queryId.
 * Used by the NarrativeCard "view query" audit button.
 */
app.get('/api/ai/query-cache/:queryId', async (req, res) => {
    try {
        const cached = await aiPersistence.getQueryCache(dbManager, req.params.queryId);
        if (!cached) return res.status(404).json({ error: 'Query not found' });
        res.json({
            queryId:       cached.id,
            sqlQuery:      cached.sql_query,
            columns:       cached.columns_info || [],
            data:          cached.data         || [],
            rowCount:      cached.row_count,
            execMs:        cached.exec_ms,
            createdAt:     cached.created_at,
        });
    } catch (err) {
        console.error('[API] query-cache fetch error:', err);
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

        const fileList = files.map(file => {
            let sizeBytes = null;
            const itemFullPath = path.join(fullPath, file.name);
            if (!file.isDirectory()) {
                try {
                    const stats = fs.statSync(itemFullPath);
                    sizeBytes = stats.size;
                } catch (e) { /* ignore */ }
            }
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.relative(ROOT_DIR, itemFullPath).replace(/\\/g, '/'),
                fullPath: itemFullPath,
                sizeBytes
            };
        });

        res.json(fileList);
    });
});

app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    const binary = req.query.binary === '1' || req.query.binary === 'true';
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ROOT_DIR, filePath);
    }

    if (binary) {
        // Base64 reads are confined to the project root — this mode returns raw
        // bytes and must not become an arbitrary-file-read primitive.
        const resolvedRoot = path.resolve(ROOT_DIR);
        const resolvedPath = path.resolve(fullPath);
        if (!resolvedPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
            return res.status(400).json({ error: 'Path must be within the project directory.' });
        }
        return fs.readFile(resolvedPath, (err, data) => {
            if (err) return res.status(500).json({ error: 'Failed to read file', details: err.message });
            res.json({ contentBase64: data.toString('base64') });
        });
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

/* --- File Move (also used for drag-and-drop reorder) --- */
app.post('/api/file/move', (req, res) => {
    const { sourcePath, destinationDir } = req.body;
    if (!sourcePath || destinationDir === undefined) {
        return res.status(400).json({ error: 'sourcePath and destinationDir are required' });
    }

    const fullSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(ROOT_DIR, sourcePath);
    const fileName = path.basename(fullSource);
    const destDir = path.isAbsolute(destinationDir) ? destinationDir : path.join(ROOT_DIR, destinationDir);
    const fullDest = path.join(destDir, fileName);

    if (!fs.existsSync(fullSource)) return res.status(404).json({ error: 'Source not found' });
    if (fullSource === fullDest) return res.json({ success: true, noOp: true });
    if (fs.existsSync(fullDest)) return res.status(409).json({ error: `"${fileName}" already exists in the destination folder` });

    try {
        // Ensure destination directory exists
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(fullSource, fullDest);
        res.json({ success: true, newPath: path.relative(ROOT_DIR, fullDest).replace(/\\/g, '/') });
    } catch (err) {
        res.status(500).json({ error: 'Move failed', details: err.message });
    }
});

/* --- File Copy / Duplicate --- */
app.post('/api/file/copy', (req, res) => {
    const { sourcePath, destinationDir } = req.body;
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' });

    const fullSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(ROOT_DIR, sourcePath);
    if (!fs.existsSync(fullSource)) return res.status(404).json({ error: 'Source not found' });

    const isDir = fs.statSync(fullSource).isDirectory();
    const baseName = path.basename(fullSource);
    const ext = path.extname(baseName);
    const nameNoExt = ext ? baseName.slice(0, -ext.length) : baseName;

    // Determine destination directory
    const destDirFull = destinationDir
        ? (path.isAbsolute(destinationDir) ? destinationDir : path.join(ROOT_DIR, destinationDir))
        : path.dirname(fullSource);

    // Auto-generate unique name: "file (copy).ext", "file (copy 2).ext", etc.
    let copyName;
    let counter = 0;
    do {
        const suffix = counter === 0 ? ' (copy)' : ` (copy ${counter + 1})`;
        copyName = isDir ? `${baseName}${suffix}` : `${nameNoExt}${suffix}${ext}`;
        counter++;
    } while (fs.existsSync(path.join(destDirFull, copyName)));

    const fullDest = path.join(destDirFull, copyName);

    try {
        if (isDir) {
            fs.cpSync(fullSource, fullDest, { recursive: true });
        } else {
            fs.copyFileSync(fullSource, fullDest);
        }
        res.json({ success: true, newPath: path.relative(ROOT_DIR, fullDest).replace(/\\/g, '/'), newName: copyName });
    } catch (err) {
        res.status(500).json({ error: 'Copy failed', details: err.message });
    }
});

/* --- Add to .gitignore --- */
app.post('/api/git/ignore', (req, res) => {
    const { pattern } = req.body;
    if (!pattern) return res.status(400).json({ error: 'pattern is required' });

    const gitignorePath = path.join(ROOT_DIR, '.gitignore');

    try {
        let content = '';
        if (fs.existsSync(gitignorePath)) {
            content = fs.readFileSync(gitignorePath, 'utf8');
        }
        // Check if pattern already present
        const lines = content.split(/\r?\n/);
        if (lines.some(line => line.trim() === pattern.trim())) {
            return res.json({ success: true, alreadyExists: true });
        }
        // Append with newline safety
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        fs.writeFileSync(gitignorePath, content + separator + pattern.trim() + '\n', 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update .gitignore', details: err.message });
    }
});

/* --- Reveal in OS File Explorer --- */
app.post('/api/file/reveal', (req, res) => {
    const { filePath: reqPath } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'filePath is required' });

    const fullPath = path.isAbsolute(reqPath) ? reqPath : path.join(ROOT_DIR, reqPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Path not found' });

    const { exec } = require('child_process');
    const isDir = fs.statSync(fullPath).isDirectory();

    let cmd;
    if (process.platform === 'win32') {
        cmd = isDir ? `explorer "${fullPath}"` : `explorer /select,"${fullPath}"`;
    } else if (process.platform === 'darwin') {
        cmd = isDir ? `open "${fullPath}"` : `open -R "${fullPath}"`;
    } else {
        cmd = `xdg-open "${path.dirname(fullPath)}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            console.error('[API] Reveal in explorer failed:', err);
            return res.status(500).json({ error: 'Failed to open file explorer' });
        }
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

/** Recursively collects files whose name ends with `ext` under srcPath, same node_modules/.git skip as getDirectories(). */
const findFilesByExtension = (srcPath, ext) => {
    let matches = [];
    let items;
    try {
        items = fs.readdirSync(srcPath, { withFileTypes: true });
    } catch (err) {
        return matches;
    }
    for (const item of items) {
        const itemFullPath = path.join(srcPath, item.name);
        if (item.isDirectory()) {
            if (item.name === 'node_modules' || item.name === '.git') continue;
            matches = matches.concat(findFilesByExtension(itemFullPath, ext));
        } else if (item.name.toLowerCase().endsWith(ext)) {
            const relativePath = path.relative(ROOT_DIR, itemFullPath).replace(/\\/g, '/');
            matches.push({ name: item.name, path: relativePath });
        }
    }
    return matches;
};

// Always walks from ROOT_DIR (no user-supplied path segment), so there is no
// path-traversal surface here — same trust boundary as GET /api/folders.
app.get('/api/files/find-by-extension', (req, res) => {
    const ext = String(req.query.ext || '').toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(ext)) {
        return res.status(400).json({ error: 'ext must look like ".ext" (letters/digits only)' });
    }
    try {
        const files = findFilesByExtension(ROOT_DIR, ext);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// applyRowLimit lives in ./_sqlUtils (shared with ai/tools.js execute_sql).

app.post('/api/query', async (req, res) => {
    const { query, queryId, limit } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const { sql: limitedSql, limited, limit: rowLimit } = applyRowLimit(query, limit);

    const qid = queryId || require('crypto').randomUUID();
    // User cancellation targets ONLY the 'main' lane, and ONLY if THIS query is
    // the one currently executing there. DuckDB's interrupt flag is sticky: an
    // interrupt with nothing running kills the NEXT statement — which is why
    // opening a chart used to fail with "Interrupted!" when a previous fetch
    // had been aborted client-side (e.g. dev double-mount).
    activeQueries.set(qid, {
        interrupt: () => {
            if (dbManager.isRunning('main', qid)) dbManager.interruptQuery('main');
        },
    });

    // If the client disconnects (AbortController / network drop), interrupt DuckDB
    req.on('close', () => {
        if (activeQueries.has(qid) && !res.headersSent && dbManager.isRunning('main', qid)) {
            dbManager.interruptQuery('main');
        }
        activeQueries.delete(qid);
    });

    try {
        const start = performance.now();
        const result = await dbManager.queryWithMetadata(limitedSql, { trackId: qid });
        const end = performance.now();

        // Detect truncation: we fetched limit+1 rows, if we got them all it means there are more
        let rows = result.rows;
        let truncated = false;
        if (limited && rows.length > rowLimit) {
            rows = rows.slice(0, rowLimit);
            truncated = true;
        }

        // Invalidate table context cache if query may have changed schema
        const upperQuery = query.toUpperCase().trim();
        if (upperQuery.startsWith('CREATE') || upperQuery.startsWith('DROP') ||
            upperQuery.startsWith('ALTER') || upperQuery.startsWith('INSERT') ||
            upperQuery.startsWith('DELETE') || upperQuery.startsWith('UPDATE')) {
            invalidateTableContextCache();
        }

        // If the user activated an extension straight from the editor (a bare
        // `LOAD name;`), remember it so it survives reconnects and app restarts,
        // exactly like the Extensions panel does. Deliberately conservative:
        // only a lone LOAD of a simple identifier, never a file-path LOAD.
        try {
            const loadMatch = /^\s*LOAD\s+["']?([a-zA-Z0-9_]+)["']?\s*;?\s*$/i.exec(query);
            if (loadMatch) {
                const extName = loadMatch[1];
                if (!dbManager.getLoadedExtensions().includes(extName)) {
                    dbManager.rememberExtension(extName);
                    addAutoloadExtension(extName);
                }
            }
        } catch { /* non-fatal bookkeeping */ }

        // Classify the statement so the editor can decide how to render it: a
        // tabular result gets the table, a DML/DDL side-effect gets a summary
        // ("Table Created", "5 rows updated", …) instead of an empty grid.
        const { resultType, details: resultDetails } = detectResultType(query);
        let rowsAffected = null;
        if (['rows_inserted', 'rows_updated', 'rows_deleted'].includes(resultType)) {
            // DuckDB returns DML affected-row counts as a single "Count" column.
            const first = rows[0];
            const count = first?.Count ?? first?.count;
            if (count !== undefined && count !== null) rowsAffected = Number(count);
        }

        res.json({
            data: rows,
            types: result.types,
            executionTime: (end - start).toFixed(2),
            rowCount: rows.length,
            truncated,
            rowLimit: limited ? rowLimit : null,
            queryId: qid,
            resultType,
            resultDetails,
            rowsAffected,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

app.post('/api/query/cancel/:queryId', (req, res) => {
    const { queryId } = req.params;
    const entry = activeQueries.get(queryId);
    if (!entry) return res.status(404).json({ error: 'Query not found or already completed' });
    try {
        entry.interrupt();
        activeQueries.delete(queryId);
        res.json({ ok: true });
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
                // Outliers beyond the 1.5·IQR fences (SUMMARIZE quartiles injected as literals).
                const q25n = parseFloat(col.q25);
                const q75n = parseFloat(col.q75);
                if (!Number.isNaN(q25n) && !Number.isNaN(q75n) && q75n > q25n) {
                    const iqr = q75n - q25n;
                    const lo = q25n - 1.5 * iqr;
                    const hi = q75n + 1.5 * iqr;
                    advancedSelects.push(`COUNT(CASE WHEN ${safeCol} < ${lo} OR ${safeCol} > ${hi} THEN 1 END) as "${colName}_outliers"`);
                }
            } else {
                advancedSelects.push(`MAX(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_max_length"`);
                advancedSelects.push(`MIN(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_min_length"`);
                advancedSelects.push(`AVG(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_avg_length"`);
                // Value-based semantic hint: how many values look like an email address.
                advancedSelects.push(`COUNT(CASE WHEN CAST(${safeCol} AS VARCHAR) LIKE '%_@_%.__%' THEN 1 END) as "${colName}_emaillike"`);
                // Date span + distinct dates → range and gap detection.
                if (/DATE|TIMESTAMP/.test(col.column_type.toUpperCase())) {
                    advancedSelects.push(`DATE_DIFF('day', MIN(${safeCol}), MAX(${safeCol})) as "${colName}_dayspan"`);
                    advancedSelects.push(`COUNT(DISTINCT ${safeCol}) as "${colName}_distinctdates"`);
                }
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

        // Candidate composite key: if no single column is unique, test whether the two
        // highest-cardinality columns together form a unique key (one cheap extra query).
        let candidateKey = null;
        try {
            const tr = Number(totalRows);
            const singleKey = profileData.some((c) => tr > 0 && parseInt(c.approx_unique) >= tr * 0.999);
            if (!singleKey && Number(duplicateRows) === 0 && profileData.length >= 2 && tr > 0) {
                const top2 = [...profileData].sort((a, b) => parseInt(b.approx_unique) - parseInt(a.approx_unique)).slice(0, 2);
                const c1 = top2[0].column_name;
                const c2 = top2[1].column_name;
                const r = await dbManager.systemQuery(`SELECT (COUNT(*) = COUNT(DISTINCT (CAST("${c1}" AS VARCHAR), CAST("${c2}" AS VARCHAR)))) as is_key FROM (${cleanQuery}) __amox_ck`);
                const v = r[0]?.is_key;
                if (v === true || v === 1 || String(v).toLowerCase() === 'true') candidateKey = [c1, c2];
            }
        } catch (e) { /* candidate-key detection is best-effort */ }

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
            candidateKey: candidateKey,
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

    // Security: ensure the resolved export path stays within the project root.
    // path.join + resolve prevents path traversal (e.g. "../../../etc/passwd").
    const resolvedRoot = path.resolve(ROOT_DIR);
    const fullPath = path.resolve(path.join(ROOT_DIR, filename)).replace(/\\/g, '/');
    if (!fullPath.startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Export path must be within the project directory.' });
    }
    const cleanQuery = query.trim().replace(/;+$/, '');

    try {
        let copyFormat;
        if (format === 'csv') copyFormat = "CSV";
        else if (format === 'parquet') copyFormat = "PARQUET";
        else if (format === 'xlsx') {
            try {
                // Real .xlsx via the excel extension. It must be explicitly loaded:
                // unlike read_xlsx (which autoloads), the COPY TO xlsx function does not.
                // Writing FORMAT CSV into a .xlsx used to produce a file Excel couldn't open.
                try { await dbManager.query('INSTALL excel; LOAD excel;'); } catch (e) {
                    console.warn('[export-data] excel extension load warning:', e.message);
                }
                await dbManager.query(`COPY (${cleanQuery}) TO '${fullPath}' WITH (FORMAT xlsx, HEADER true)`);
                const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${cleanQuery}) t`);
                const rowCount = countResult[0]?.cnt || 0;
                return res.json({ success: true, path: filename, rowCount });
            } catch (xlsxErr) {
                // Excel caps a worksheet at 1,048,576 rows; surface a clear, actionable message.
                const overLimit = /row limit/i.test(xlsxErr.message);
                return res.status(500).json({
                    error: overLimit
                        ? 'Excel limita una hoja a 1,048,576 filas y el resultado la supera. Exporta a CSV o Parquet.'
                        : `Excel export failed: ${xlsxErr.message}. Try CSV or Parquet instead.`,
                });
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

/* --- Binary asset write (e.g. pasted images in the Markdown editor) --- */

/**
 * POST /api/files/write-binary
 * Writes a base64-encoded binary file inside the project root.
 * Body: { path, dataBase64 }  → path is project-relative (e.g. "assets/img.png")
 * Returns: { success, path }
 */
app.post('/api/files/write-binary', async (req, res) => {
    const { path: relPath, dataBase64 } = req.body;
    if (!relPath || !dataBase64) {
        return res.status(400).json({ error: 'path and dataBase64 are required' });
    }
    // Confine the resolved path to the project root (prevents path traversal).
    const resolvedRoot = path.resolve(ROOT_DIR);
    const fullPath = path.resolve(path.join(ROOT_DIR, relPath));
    if (!fullPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Path must be within the project directory.' });
    }
    try {
        const b64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, Buffer.from(b64, 'base64'));
        res.json({ success: true, path: relPath.replace(/\\/g, '/') });
    } catch (err) {
        console.error('[write-binary]', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Context Export --- */

/**
 * POST /api/ai/export-context
 * Generates an AI-ready context document (Markdown) from a DuckDB query result.
 * Body: { query, sampleRows?, includeProfile? }
 * Returns: { markdown, rowCount, columnCount, estimatedBytes }
 */
app.post('/api/ai/export-context', async (req, res) => {
    const { query, sampleRows = 20, includeProfile = false } = req.body;
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
    }

    const cleanQuery = query.trim().replace(/;+$/, '');
    const clampedRows = Math.min(Math.max(Number(sampleRows) || 20, 1), 500);

    try {
        // 1. Schema via DESCRIBE
        const descRows = await dbManager.systemQuery(`DESCRIBE (${cleanQuery})`);
        const columns = descRows.map(r => ({ name: r.column_name, type: r.column_type }));

        // 2. Row count
        const countResult = await dbManager.systemQuery(
            `SELECT COUNT(*) AS cnt FROM (${cleanQuery}) t`
        );
        const rowCount = Number(countResult[0]?.cnt ?? 0);

        // 3. Sample rows
        const sampleResult = await dbManager.query(
            `SELECT * FROM (${cleanQuery}) LIMIT ${clampedRows}`
        );

        // 4. Optional rich profile
        let profileSection = '';
        if (includeProfile) {
            const { profileTable } = require('./ai/profiling');
            const profile = await profileTable(dbManager, `(${cleanQuery})`);
            const profileLines = profile.columns.map(col => {
                const parts = [`  - **${col.name}** (${col.type})`];
                if (col.nulls_pct !== null) parts.push(`nulls ${col.nulls_pct}%`);
                if (col.unique_approx !== null) parts.push(`~${col.unique_approx} únicos`);
                if (col.min !== undefined && col.min !== null) parts.push(`min ${col.min}`);
                if (col.max !== undefined && col.max !== null) parts.push(`max ${col.max}`);
                if (col.avg !== undefined && col.avg !== null) parts.push(`avg ${col.avg}`);
                if (col.top_values && col.top_values.length > 0) {
                    const tops = col.top_values.map(v => `"${v.val}"(${v.count})`).join(', ');
                    parts.push(`top: [${tops}]`);
                }
                return parts.join(' — ');
            });
            profileSection = `\n## Perfil estadístico\n${profileLines.join('\n')}\n`;
        }

        // 5. Build Markdown
        const schemaLines = columns.map(c => `- \`${c.name}\` : ${c.type}`).join('\n');

        // Build sample table
        const colNames = columns.map(c => c.name);
        const tableHeader = '| ' + colNames.join(' | ') + ' |';
        const tableSep = '| ' + colNames.map(() => '---').join(' | ') + ' |';
        const tableRows = sampleResult.slice(0, clampedRows).map(row => {
            const cells = colNames.map(c => {
                const v = row[c];
                if (v === null || v === undefined) return '';
                const s = String(v);
                return s.length > 80 ? s.slice(0, 77) + '...' : s;
            });
            return '| ' + cells.join(' | ') + ' |';
        });
        const sampleTable = [tableHeader, tableSep, ...tableRows].join('\n');

        const markdown = `# Contexto de datos — AmoxSQL Data Skill

**Motor:** DuckDB (sintaxis SQL DuckDB). Los datos son locales.
**Filas totales:** ${rowCount.toLocaleString()}
**Columnas:** ${columns.length}

**Query de origen:**
\`\`\`sql
${cleanQuery}
\`\`\`

## Schema

${schemaLines}
${profileSection}
## Muestra (${sampleResult.length} de ${rowCount.toLocaleString()} filas)

${sampleTable}

---
> Utiliza esta información para responder preguntas sobre los datos.
> Devuelve SQL ejecutable en DuckDB (bloques \`\`\`sql\`\`\`) y/o JSON de configuración de gráfico (bloques \`\`\`json\`\`\`).
> Usa exactamente los nombres de columna del schema anterior.
`;

        const estimatedBytes = Buffer.byteLength(markdown, 'utf8');
        res.json({ markdown, rowCount, columnCount: columns.length, estimatedBytes });

    } catch (err) {
        console.error('[export-context]', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- dbt Integration API --- */

// GET /api/dbt/manifest — Read target/manifest.json from project root
// Returns both the "panel" shape (available/models/sources) consumed by SqlEditor
// and the "lineage" shape (exists/nodes/edges) consumed by DbtLineageGraph.
app.get('/api/dbt/manifest', (req, res) => {
    try {
        const manifestPath = path.join(ROOT_DIR, 'target', 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            return res.json({
                available: false,
                exists: false,
                hint: 'Run "dbt compile" or "dbt run" first to generate the manifest.',
                models: [],
                sources: [],
                nodes: [],
                edges: [],
            });
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        // Panel shape: simplified models/sources for SqlEditor autocomplete
        const models = Object.values(manifest.nodes || {})
            .filter(n => n.resource_type === 'model')
            .map(n => ({
                name: n.name,
                schema: n.schema || '',
                description: n.description || ''
            }));

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

        // Lineage shape: full DAG for DbtLineageGraph
        const nodes = [];
        const edges = [];

        for (const [key, node] of Object.entries(manifest.nodes || {})) {
            nodes.push({
                id: key,
                name: node.name,
                resourceType: node.resource_type,
                schema: node.schema,
                materialized: node.config?.materialized || null,
                path: node.original_file_path || node.path || null,
                description: node.description || '',
                tags: node.tags || [],
            });
            for (const dep of (node.depends_on?.nodes || [])) {
                edges.push({ from: dep, to: key });
            }
        }

        for (const [key, source] of Object.entries(manifest.sources || {})) {
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

        for (const [key, exposure] of Object.entries(manifest.exposures || {})) {
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

        res.json({ available: true, exists: true, models, sources, nodes, edges });
    } catch (err) {
        console.error('[dbt] Error reading manifest:', err);
        res.status(500).json({ available: false, exists: true, error: err.message });
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

app.post('/api/notebook-state', async (req, res) => {
    const { path: filePath, state } = req.body;
    if (!filePath || !state) return res.status(400).json({ error: 'Path and state are required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        // Async write: sidecar state can carry MBs of cached results
        await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to write notebook state:', err.message);
        res.status(500).json({ error: 'Failed to write state', details: err.message });
    }
});

app.get('/api/schema', async (req, res) => {
    try {
        const tables = await dbManager.systemQuery(
            `SELECT table_schema as schema, table_name as name FROM information_schema.tables WHERE ${userTablesWhereClause()} ORDER BY table_schema, table_name`
        );
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

// List conda environments and check for dbt in each
app.get('/api/dbt/conda-envs', async (req, res) => {
    const condaCmd = req.query.condaPath || 'conda';
    try {
        // exec async: execSync here froze the WHOLE server (including the AI
        // SSE stream) for up to 10s whenever the DBT panel opened.
        const output = await new Promise((resolve, reject) => {
            exec(`"${condaCmd}" env list --json`, { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout || '');
            });
        });
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
    const { command, condaEnv, condaPath } = req.body;
    if (!command) return res.status(400).json({ error: 'Command is required' });

    // Security: only allow dbt commands
    if (!command.trim().startsWith('dbt ')) {
        return res.status(403).json({ error: 'Only dbt commands are allowed' });
    }

    // Security: validate condaEnv and condaPath to prevent shell injection.
    // condaEnv must be a simple alphanumeric identifier (no special chars).
    const SAFE_ID_RE = /^[a-zA-Z0-9_\-.]+$/;
    if (condaEnv && condaEnv !== 'none' && !SAFE_ID_RE.test(condaEnv)) {
        return res.status(400).json({ error: 'Invalid condaEnv value. Only alphanumeric characters, hyphens, underscores, and dots are allowed.' });
    }
    if (condaPath && !SAFE_ID_RE.test(path.basename(condaPath))) {
        return res.status(400).json({ error: 'Invalid condaPath value.' });
    }

    // Wrap with conda run if a conda env is specified
    let finalCmd = command;
    if (condaEnv && condaEnv !== 'none') {
        const condaCmd = condaPath || 'conda';
        // Use execFile-style argument passing via the args array in exec options
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

/* ============================================================
 * Execution Chain APIs
 * ============================================================ */
const chainPersistence = require('./ChainPersistence');
const chainExecutor = require('./ChainExecutor');

// Run a chain
app.post('/api/chains/run', async (req, res) => {
    const { chainDefinition, chainFile, mode, startNodeId, variables } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition is required' });

    try {
        // Validate first
        const validation = chainExecutor.validate(chainDefinition, ROOT_DIR);
        if (!validation.valid) {
            return res.status(400).json({ error: 'Validation failed', details: validation.errors });
        }

        // Execute asynchronously — respond with runId immediately
        const result = await chainExecutor.run(dbManager, chainDefinition, ROOT_DIR, {
            mode: mode || 'full',
            startNodeId,
            chainFile: chainFile || '',
            variables: variables || undefined,
        });

        res.json(result);
    } catch (err) {
        console.error('[Chains] Run error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get run status (for polling)
app.get('/api/chains/run/:runId/status', async (req, res) => {
    try {
        const run = await chainPersistence.getRun(dbManager, req.params.runId);
        const nodeRuns = await chainPersistence.getNodeRuns(dbManager, req.params.runId);
        res.json({ run, nodeRuns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel a running chain
app.post('/api/chains/run/:runId/cancel', (req, res) => {
    chainExecutor.cancelRun(req.params.runId);
    res.json({ success: true });
});

// Resume from checkpoint (re-run from a specific node)
app.post('/api/chains/run/:runId/resume', async (req, res) => {
    const { chainDefinition, chainFile, startNodeId, variables } = req.body;
    if (!chainDefinition || !startNodeId) {
        return res.status(400).json({ error: 'chainDefinition and startNodeId required' });
    }
    try {
        const result = await chainExecutor.run(dbManager, chainDefinition, ROOT_DIR, {
            mode: 'from_node',
            startNodeId,
            chainFile: chainFile || '',
            variables: variables || undefined,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Validate a chain definition
app.post('/api/chains/validate', (req, res) => {
    const { chainDefinition } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    const result = chainExecutor.validate(chainDefinition, ROOT_DIR);
    res.json(result);
});

// List recent runs (history)
app.get('/api/chains/history', async (req, res) => {
    const { chainFile, limit } = req.query;
    try {
        const runs = await chainPersistence.listRuns(dbManager, {
            chainFile,
            limit: parseInt(limit) || 20,
        });
        res.json({ runs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get detailed run
app.get('/api/chains/history/:runId', async (req, res) => {
    try {
        const run = await chainPersistence.getRun(dbManager, req.params.runId);
        const nodeRuns = await chainPersistence.getNodeRuns(dbManager, req.params.runId);
        res.json({ run, nodeRuns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a run
app.delete('/api/chains/history/:runId', async (req, res) => {
    try {
        await chainPersistence.deleteRun(dbManager, req.params.runId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export chain as YAML
app.post('/api/chains/export-yaml', (req, res) => {
    const { chainDefinition } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    try {
        const { version, name, description, nodes, edges, variables } = chainDefinition;
        const yamlObj = {
            version,
            name,
            description: description || undefined,
            nodes: (nodes || []).map(n => ({
                id: n.id,
                type: n.type,
                label: n.label,
                description: n.description || undefined,
                config: n.config,
            })),
            edges: (edges || []).map(e => ({
                source: e.source,
                target: e.target,
            })),
            variables: variables && Object.keys(variables).length > 0 ? variables : undefined,
        };
        const yamlStr = yaml.dump(yamlObj, { indent: 2, lineWidth: 120, noRefs: true });
        res.json({ yaml: yamlStr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import YAML to chain definition
app.post('/api/chains/import-yaml', (req, res) => {
    const { yamlContent } = req.body;
    if (!yamlContent) return res.status(400).json({ error: 'yamlContent required' });
    try {
        const parsed = yaml.load(yamlContent);
        res.json({ chainDefinition: parsed });
    } catch (err) {
        res.status(400).json({ error: `Invalid YAML: ${err.message}` });
    }
});

// Create a new SQL file from the chain canvas
app.post('/api/chains/create-sql-file', (req, res) => {
    const { filePath, template } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });

    const fullPath = path.resolve(ROOT_DIR, filePath);

    // Security: ensure path is within project
    if (!fullPath.startsWith(ROOT_DIR)) {
        return res.status(403).json({ error: 'Path outside project directory' });
    }

    // Create parent directories if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
        return res.status(409).json({ error: 'File already exists' });
    }

    const content = template || `-- ${path.basename(filePath)}\n-- Created from Execution Chain\n\n`;
    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ success: true, path: filePath });
});

// Scan folder for files matching a pattern
app.get('/api/chains/scan-folder', (req, res) => {
    const { folder, pattern } = req.query;
    if (!folder) return res.status(400).json({ error: 'folder required' });

    const fullPath = path.resolve(ROOT_DIR, folder);
    if (!fullPath.startsWith(ROOT_DIR)) {
        return res.status(403).json({ error: 'Path outside project directory' });
    }

    if (!fs.existsSync(fullPath)) {
        return res.json({ files: [], count: 0 });
    }

    try {
        const allFiles = fs.readdirSync(fullPath);
        const ext = pattern ? pattern.replace('*', '') : '';
        const filtered = ext ? allFiles.filter(f => f.endsWith(ext)) : allFiles;
        res.json({ files: filtered, count: filtered.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detect result type from SQL
app.post('/api/chains/detect-result-type', (req, res) => {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'sql required' });
    const result = chainExecutor.detectResultType(sql);
    res.json(result);
});

// SSE stream for real-time execution logs
app.get('/api/chains/run/:runId/stream', (req, res) => {
    const { runId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 15000);

    chainExecutor.subscribeSSE(runId, res);

    req.on('close', () => {
        clearInterval(heartbeat);
        chainExecutor.unsubscribeSSE(runId, res);
    });
});

// Preview data from a table
app.get('/api/chains/preview/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    try {
        let schema = req.query.schema || null;
        let bare = tableName.replace(/[^a-zA-Z0-9_\-.]/g, '');
        if (!schema && bare.includes('.')) {
            const dot = bare.indexOf('.');
            schema = bare.slice(0, dot);
            bare = bare.slice(dot + 1);
        }
        if (!schema) {
            const found = await dbManager.query(
                `SELECT table_schema FROM information_schema.tables WHERE table_name = '${bare.replace(/'/g, "''")}' ORDER BY (table_schema = 'main') DESC LIMIT 1`
            );
            schema = found[0]?.table_schema || 'main';
        }
        const qref = `"${schema}"."${bare}"`;
        const rows = await dbManager.query(`SELECT * FROM ${qref} LIMIT ${limit}`);
        const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM ${qref}`);
        const totalRows = countResult[0]?.cnt || 0;
        const columns = rows.length > 0 ? Object.keys(rows[0]).map(k => ({
            name: k,
            type: typeof rows[0][k] === 'number' ? 'number' : 'string',
        })) : [];
        res.json({ columns, rows, totalRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Preview a node's OWN output (resolves its physical table; available only after it has run)
app.post('/api/chains/preview-node', async (req, res) => {
    const { nodeId, chainDefinition, chainFile } = req.body;
    const limit = Math.min(parseInt(req.body.limit) || 50, 200);
    if (!nodeId || !chainDefinition) return res.status(400).json({ error: 'nodeId and chainDefinition required' });
    try {
        const node = (chainDefinition.nodes || []).find(n => n.id === nodeId);
        if (!node) return res.json({ available: false });
        const ref = chainExecutor.staticOutputRef(node, chainFile || '');
        const table = ref && ref.table;
        if (!table) return res.json({ available: false });
        const safeTable = table.replace(/[^a-zA-Z0-9_\-.]/g, '');
        // Resolve schema (the output ref may carry it; else catalog lookup preferring main)
        let schema = ref.schema || null;
        if (!schema) {
            const found = await dbManager.query(
                `SELECT table_schema FROM information_schema.tables WHERE table_name = '${safeTable.replace(/'/g, "''")}' ORDER BY (table_schema = 'main') DESC LIMIT 1`
            );
            schema = found[0]?.table_schema || null;
        }
        if (!schema) return res.json({ available: false, table });
        const qref = `"${schema}"."${safeTable}"`;
        const rows = await dbManager.query(`SELECT * FROM ${qref} LIMIT ${limit}`);
        const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM ${qref}`);
        const columns = rows.length > 0
            ? Object.keys(rows[0]).map(k => ({ name: k, type: typeof rows[0][k] === 'number' ? 'number' : 'string' }))
            : [];
        res.json({ available: true, table, columns, rows, totalRows: countResult[0]?.cnt || 0 });
    } catch (err) {
        res.json({ available: false, error: err.message });
    }
});

// Infer schema for a node (upstream schema propagation)
app.post('/api/chains/schema/infer', async (req, res) => {
    const { nodeId, chainDefinition, chainFile } = req.body;
    if (!nodeId || !chainDefinition) return res.status(400).json({ error: 'nodeId and chainDefinition required' });
    try {
        const { nodes = [], edges = [] } = chainDefinition;
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return res.status(404).json({ error: 'Node not found' });

        // Walk upstream to find most direct source with schema
        const parentEdges = edges.filter(e => e.target === nodeId);
        if (parentEdges.length === 0) return res.json({ columns: [] });

        const parentId = parentEdges[0].source;
        const parentNode = nodes.find(n => n.id === parentId);
        if (!parentNode) return res.json({ columns: [] });

        let columns = [];
        const cfg = parentNode.config || {};

        if (parentNode.type === 'import_file' && cfg.sourcePath) {
            const fullPath = chainExecutor.resolvePath(ROOT_DIR, cfg.sourcePath);
            if (fs.existsSync(fullPath)) {
                const fileType = cfg.fileType || chainExecutor.detectFileType(cfg.sourcePath);
                let sql;
                if (fileType === 'parquet') sql = `DESCRIBE SELECT * FROM read_parquet('${fullPath.replace(/\\/g, '/')}') LIMIT 0`;
                else if (fileType === 'json') sql = `DESCRIBE SELECT * FROM read_json_auto('${fullPath.replace(/\\/g, '/')}') LIMIT 0`;
                else if (fileType === 'xlsx') {
                    try { await dbManager.query("INSTALL spatial; LOAD spatial;"); } catch {}
                    sql = `DESCRIBE SELECT * FROM read_xlsx('${fullPath.replace(/\\/g, '/')}') LIMIT 0`;
                } else sql = `DESCRIBE SELECT * FROM read_csv('${fullPath.replace(/\\/g, '/')}', auto_detect=true, header=true) LIMIT 0`;
                try {
                    const result = await dbManager.query(sql);
                    columns = (result || []).map(r => ({ name: r.column_name || r.name, type: r.column_type || r.type }));
                } catch {}
            }
        } else {
            // Any other node — resolve its physical output table (derived nodes use the
            // deterministic "__chain_*" name post-A1) and describe it. Available once that
            // node has run at least once; before that, columns come back empty.
            const ref = chainExecutor.staticOutputRef(parentNode, chainFile || '');
            const tname = ref && ref.table;
            if (tname) {
                try {
                    const result = await dbManager.query(`DESCRIBE SELECT * FROM "${tname}" LIMIT 0`);
                    columns = (result || []).map(r => ({ name: r.column_name || r.name, type: r.column_type || r.type }));
                } catch {}
            }
        }

        res.json({ columns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export chain as a (mostly) runnable SQL script
app.post('/api/chains/export-sql', (req, res) => {
    const { chainDefinition, chainFile, variables } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    try {
        const sql = chainExecutor.compileToSql(chainDefinition, ROOT_DIR, chainFile || '', variables || {});
        res.json({ sql });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate a chain DAG from a natural-language description (embedded canvas AI)
app.post('/api/chains/ai/generate', async (req, res) => {
    const { prompt, chainDefinition, provider, model } = req.body;
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'prompt is required' });
    try {
        const { generateChain } = require('./ai/chainGenerator');

        // Engineering skills as guidance (bias toward good pipeline patterns).
        let skillsText = '';
        try {
            const skills = (await aiSkills.loadSkills(APP_DIR)).filter(s => (s.scope || 'analysis') === 'engineering');
            skillsText = skills.map(s => `## ${s.name}\n${s.content}`).join('\n\n').slice(0, 8000);
        } catch { /* skills optional */ }

        // Available tables for grounding.
        let tables = [];
        try { tables = await buildTableContext(); } catch { /* db optional */ }

        const cfg = aiManager.getConfig();
        const result = await generateChain({
            getModel: aiManager.getModel.bind(aiManager),
            provider: provider || cfg.provider || 'ollama',
            model: model || cfg.defaultModel,
            prompt: String(prompt).trim(),
            currentChain: chainDefinition || null,
            tables,
            skillsText,
            validateGraph: (chain) => {
                try { chainExecutor.computeLayers(chain.nodes, chain.edges); return true; }
                catch (e) { return e.message; }
            },
        });
        res.json(result);
    } catch (err) {
        console.error('[Chains AI] generate error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Chart Gallery ─────────────────────────────────────────────────────────
const { seedGallery, registerGalleryRoutes } = require('./galleryManager');
seedGallery();
registerGalleryRoutes(app);

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

// ─── Graceful shutdown endpoint ───────────────────────────────────────────────
// Called by Electron's before-quit handler to close DuckDB connections cleanly
// before the process exits, preventing write corruption on abrupt termination.
app.post('/api/shutdown', async (_req, res) => {
    res.json({ ok: true });
    try {
        await dbManager.close();
        console.log('[Server] DuckDB connections closed — shutting down.');
    } catch (err) {
        console.error('[Server] Error closing DB on shutdown:', err.message);
    }
    // Give the response time to flush, then exit.
    setTimeout(() => process.exit(0), 200);
});

const startServer = (preferredPort = 3001) => {
    return new Promise((resolve, reject) => {
        const server = app.listen(preferredPort, () => {
            const actualPort = server.address().port;
            console.log(`Server running at http://localhost:${actualPort}`);
            console.log(`Serving files from: ${ROOT_DIR}`);

            // Initialize AI schema in the background so DataDiving works without a
            // project connected. Fire-and-forget — do NOT await here, the listen
            // callback must stay synchronous so resolve() is called immediately and
            // the Electron main process receives the 'ready' message without delay.
            aiPersistence.initSchema(dbManager).catch(err =>
                console.warn('[AI] Startup schema init warning (non-fatal):', err.message)
            );

            // Re-activate extensions the user auto-loads. Fire-and-forget so the
            // listen callback stays synchronous; dbManager re-LOADs them (and
            // keeps re-LOADing on every reconnect) once seeded.
            (async () => {
                try {
                    const names = getAutoloadExtensions();
                    if (names.length === 0) return;
                    names.forEach(n => dbManager.rememberExtension(n));
                    await dbManager.restoreExtensions();
                    console.log(`[Extensions] Auto-loaded ${names.length}: ${names.join(', ')}`);
                } catch (e) {
                    console.warn('[Extensions] Startup autoload warning (non-fatal):', e.message);
                }
            })();

            resolve({ server, port: actualPort });
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                // Port busy — let OS pick a free one
                console.warn(`[Server] Port ${preferredPort} in use, requesting OS-assigned port`);
                const fallback = app.listen(0, () => {
                    const actualPort = fallback.address().port;
                    console.log(`Server running at http://localhost:${actualPort}`);
                    console.log(`Serving files from: ${ROOT_DIR}`);
                    resolve({ server: fallback, port: actualPort });
                });
                fallback.on('error', reject);
            } else {
                reject(err);
            }
        });
    });
};

// Allow standalone execution (node server/index.js)
if (require.main === module) {
    startServer(PORT);
}

module.exports = { startServer };
// Trigger restart for Excel Import features
