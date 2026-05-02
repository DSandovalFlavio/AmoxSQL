/**
 * AmoxSQL — Project Scaffolder
 * Manages project folder structure and .amoxsql/project.json config.
 */
const fs   = require('fs');
const path = require('path');

// ─── Folder definitions ──────────────────────────────────────────────────────
const SCAFFOLD_FOLDERS = [
    {
        id:          'queries',
        label:       'Queries',
        description: 'SQL files and analysis scripts',
        icon:        'sql',
        gitkeep:     true,
    },
    {
        id:          'notebooks',
        label:       'Notebooks',
        description: 'Multi-cell SQL notebooks (.sqlnb)',
        icon:        'notebook',
        gitkeep:     true,
    },
    {
        id:          'charts',
        label:       'Charts',
        description: 'Saved chart configurations (.amoxvis)',
        icon:        'chart',
        gitkeep:     true,
    },
    {
        id:          'chains',
        label:       'Chains',
        description: 'Execution chain workflows',
        icon:        'chain',
        gitkeep:     true,
    },
    {
        id:          'data',
        label:       'Data',
        description: 'CSV, Parquet and raw data files',
        icon:        'data',
        gitkeep:     true,
    },
    {
        id:          'exports',
        label:       'Exports',
        description: 'Generated reports and exports',
        icon:        'export',
        gitkeep:     true,
    },
    {
        id:          'context',
        label:       'Context (AI)',
        description: 'AI semantic layer: metrics.yml, joins.yml, glossary.md',
        icon:        'context',
        gitkeep:     false, // will create real template files
    },
    {
        id:          'agent',
        label:       'Agent',
        description: 'Custom AI agent skills (Markdown)',
        icon:        'agent',
        gitkeep:     false, // will create skills/ subdir
    },
];

// Default project.json skeleton
function makeProjectConfig(rootDir) {
    const name = path.basename(rootDir);
    return {
        version:     '1.0',
        name,
        createdAt:   new Date().toISOString(),
        folders:     {},
        defaultDb:   'main.duckdb',
        git:         { initialized: false },
        wizard:      { completed: false },
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns scaffold status: which canonical folders exist and which don't.
 * Also returns the project config if it exists.
 */
function getScaffoldStatus(rootDir) {
    const configPath = path.join(rootDir, '.amoxsql', 'project.json');
    let config = null;
    if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    }

    const folders = SCAFFOLD_FOLDERS.map(f => ({
        ...f,
        exists: fs.existsSync(path.join(rootDir, f.id)),
    }));

    // Consider a project "new" if fewer than 2 canonical folders exist
    const existingCount = folders.filter(f => f.exists).length;
    const isNewProject  = existingCount < 2;

    return {
        folders,
        isNewProject,
        config,
        wizardCompleted: config?.wizard?.completed || false,
    };
}

/**
 * Creates the requested folders (by id) and writes `.amoxsql/project.json`.
 * Returns list of actually created paths.
 */
function createFolders(rootDir, folderIds = []) {
    const created = [];

    // Ensure .amoxsql/ directory exists
    const amoxDir = path.join(rootDir, '.amoxsql');
    if (!fs.existsSync(amoxDir)) {
        fs.mkdirSync(amoxDir, { recursive: true });
        created.push('.amoxsql/');
    }

    // Write / update project.json
    const configPath = path.join(amoxDir, 'project.json');
    let config;
    try {
        config = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
            : makeProjectConfig(rootDir);
    } catch {
        config = makeProjectConfig(rootDir);
    }
    config.wizard     = { completed: true, completedAt: new Date().toISOString() };
    config.folders    = folderIds.reduce((acc, id) => { acc[id] = true; return acc; }, config.folders || {});
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

    for (const id of folderIds) {
        const def     = SCAFFOLD_FOLDERS.find(f => f.id === id);
        const dirPath = path.join(rootDir, id);

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            created.push(`${id}/`);
        }

        if (!def) continue;

        if (def.gitkeep) {
            // Drop a .gitkeep so the folder shows up in git
            const gk = path.join(dirPath, '.gitkeep');
            if (!fs.existsSync(gk)) fs.writeFileSync(gk, '', 'utf8');
        }

        // Special-case: context/ — scaffold minimal template files
        if (id === 'context') {
            _scaffoldContext(dirPath, created);
        }

        // Special-case: agent/ — scaffold skills/ subdir
        if (id === 'agent') {
            _scaffoldAgent(dirPath, created);
        }
    }

    return created;
}

/**
 * Returns the parsed project.json config or null.
 */
function getProjectConfig(rootDir) {
    const configPath = path.join(rootDir, '.amoxsql', 'project.json');
    if (!fs.existsSync(configPath)) return null;
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return null; }
}

/**
 * Merges `updates` into the project.json config and writes it back.
 */
function saveProjectConfig(rootDir, updates) {
    const amoxDir    = path.join(rootDir, '.amoxsql');
    const configPath = path.join(amoxDir, 'project.json');
    if (!fs.existsSync(amoxDir)) fs.mkdirSync(amoxDir, { recursive: true });

    let existing = {};
    if (fs.existsSync(configPath)) {
        try { existing = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
    }
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
}

/** Returns the canonical folder definitions list. */
function getFolderDefs() {
    return SCAFFOLD_FOLDERS;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function _scaffoldContext(contextDir, created) {
    const examplesDir = path.join(contextDir, 'examples');
    if (!fs.existsSync(examplesDir)) {
        fs.mkdirSync(examplesDir, { recursive: true });
        created.push('context/examples/');
    }

    const files = {
        'metrics.yml': `# Business Metric Definitions
# The AI uses these when you mention terms like "revenue" or "active users".
# Format: name, sql (DuckDB expression), description, grain, table

metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Total paid revenue — excludes pending and refunded orders
    grain: order
    table: orders

  - name: monthly_active_users
    sql: "COUNT(DISTINCT user_id)"
    description: Unique users with at least one event in the period
    grain: day
    table: events
`,
        'joins.yml': `# Canonical Join Relationships
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
`,
        'glossary.md': `# Domain Glossary

**Revenue**: Paid order amounts only (\`status = 'paid'\`). Never include pending or refunded orders.

**Active User**: Any user who triggered at least one event in the analysis period.

**Churn**: A user who has not returned in the last 30 days.
`,
    };

    for (const [filename, content] of Object.entries(files)) {
        const filePath = path.join(contextDir, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, content, 'utf8');
            created.push(`context/${filename}`);
        }
    }

    const examplePath = path.join(examplesDir, 'starter_query.sql');
    if (!fs.existsSync(examplePath)) {
        fs.writeFileSync(examplePath, `-- Example: how many records are in each table?
-- Replace "my_table" with your actual table name.
SELECT
    table_name,
    estimated_size  AS approx_rows
FROM duckdb_tables()
ORDER BY estimated_size DESC;
`, 'utf8');
        created.push('context/examples/starter_query.sql');
    }
}

function _scaffoldAgent(agentDir, created) {
    const skillsDir = path.join(agentDir, 'skills');
    if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
        created.push('agent/skills/');
    }

    const skillPath = path.join(skillsDir, 'explore-first.md');
    if (!fs.existsSync(skillPath)) {
        fs.writeFileSync(skillPath, `---
name: Explore First
description: Forces careful schema inspection before writing SQL
---

# Explore First

Before writing SQL on any table you haven't explicitly profiled:

1. \`list_tables\` — confirm the exact table name exists
2. \`describe_table\` — get exact column names and types
3. \`execute_sql\` with \`SELECT * FROM <table> LIMIT 5\` — see real data values
4. \`profile_data\` — understand distributions, nulls, data quality
5. Only then write your analytical query

**Never skip step 2** — column name mismatches are the #1 cause of query failures.
`, 'utf8');
        created.push('agent/skills/explore-first.md');
    }
}

module.exports = {
    SCAFFOLD_FOLDERS,
    getScaffoldStatus,
    createFolders,
    getProjectConfig,
    saveProjectConfig,
    getFolderDefs,
};
