'use strict';

/**
 * AmoxSQL AI — Context-as-Code Loader
 *
 * Reads `.amoxsql/context/` from the current project directory and builds
 * a structured context object for injection into the system prompt.
 *
 * Convention:
 *   .amoxsql/context/metrics.yml   — business metric definitions
 *   .amoxsql/context/glossary.md   — domain terms and their meanings
 *   .amoxsql/context/joins.yml     — canonical join relationships between tables
 *   .amoxsql/context/examples/     — *.sql files with Q→SQL pairs (question in first comment)
 *
 * All files are optional — if the directory doesn't exist, returns null (no context injected).
 */

const fs   = require('fs');
const path = require('path');

// Simple YAML parser for our known formats (no dep required)
function parseSimpleYaml(text) {
    const lines  = text.split('\n');
    const result = {};
    let currentKey = null;
    let currentList = null;
    let currentObj  = null;
    let inList      = false;

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith('#')) continue;

        // List item
        if (/^  - /.test(line)) {
            const value = line.replace(/^  - /, '').trim();
            if (currentList) currentList.push(value);
            continue;
        }
        if (/^    - /.test(line)) {
            const value = line.replace(/^    - /, '').trim();
            if (currentList) currentList.push(value);
            continue;
        }

        // Nested object under a list item (indented key: value)
        if (/^  [a-zA-Z_]/.test(line) && line.includes(':')) {
            const [k, ...rest] = line.trim().split(':');
            const v = rest.join(':').trim();
            if (currentObj) currentObj[k.trim()] = v || null;
            continue;
        }

        // Top-level key
        if (/^[a-zA-Z_]/.test(line) && line.includes(':')) {
            const [k, ...rest] = line.split(':');
            const v = rest.join(':').trim();
            currentKey = k.trim();
            if (!v) {
                // Starts a block (list or object follows)
                result[currentKey] = [];
                currentList = result[currentKey];
                currentObj  = null;
            } else {
                result[currentKey] = v;
                currentList = null;
                currentObj  = null;
            }
            continue;
        }

        // List item at root level starting a new block object
        if (/^- /.test(line)) {
            const value = line.replace(/^- /, '').trim();
            if (!currentList) {
                if (currentKey) {
                    if (!Array.isArray(result[currentKey])) result[currentKey] = [];
                    currentList = result[currentKey];
                }
            }
            if (currentList) {
                // if value contains ':', it's an object start
                if (value.includes(':')) {
                    const [k, ...rest] = value.split(':');
                    currentObj = { [k.trim()]: rest.join(':').trim() };
                    currentList.push(currentObj);
                } else {
                    currentList.push(value);
                    currentObj = null;
                }
            }
            continue;
        }
    }

    return result;
}

/**
 * Parse a metrics YAML file.
 * Expected format:
 *   metrics:
 *     - name: revenue
 *       sql: "SUM(amount) FILTER (WHERE status = 'paid')"
 *       description: Total paid revenue
 *       grain: order
 *       table: orders
 */
function parseMetrics(text) {
    const metrics = [];
    const blocks  = text.split(/\n(?=  - name:|\n- name:)/);

    for (const block of blocks) {
        const name  = (block.match(/name:\s*(.+)/))?.[1]?.trim();
        const sql   = (block.match(/sql:\s*"?(.+?)"?\s*$/))?.[1]?.trim() ||
                      (block.match(/sql:\s*'(.+?)'\s*$/))?.[1]?.trim();
        const desc  = (block.match(/description:\s*(.+)/))?.[1]?.trim();
        const grain = (block.match(/grain:\s*(.+)/))?.[1]?.trim();
        const table = (block.match(/table:\s*(.+)/))?.[1]?.trim();

        if (name && sql) {
            metrics.push({ name, sql, description: desc || '', grain: grain || null, table: table || null });
        }
    }
    return metrics;
}

/**
 * Parse a joins YAML file.
 * Expected format:
 *   joins:
 *     - from: orders
 *       to: customers
 *       on: "orders.customer_id = customers.id"
 *       type: LEFT
 */
function parseJoins(text) {
    const joins = [];
    const blocks = text.split(/\n(?=  - from:|\n- from:)/);

    for (const block of blocks) {
        const from = (block.match(/from:\s*(.+)/))?.[1]?.trim();
        const to   = (block.match(/to:\s*(.+)/))?.[1]?.trim();
        const on   = (block.match(/on:\s*"?(.+?)"?\s*$/))?.[1]?.trim() ||
                     (block.match(/on:\s*'(.+?)'\s*$/))?.[1]?.trim();
        const type = (block.match(/type:\s*(.+)/))?.[1]?.trim() || 'INNER';

        if (from && to && on) {
            joins.push({ from, to, on, type });
        }
    }
    return joins;
}

/**
 * Parse an example SQL file.
 * The first block comment or -- comment becomes the question.
 * The SQL body is the example query.
 *
 * Example file:
 *   -- What is the monthly revenue trend for the last 12 months?
 *   SELECT DATE_TRUNC('month', order_date) AS month,
 *          SUM(amount) AS revenue
 *   FROM orders
 *   WHERE order_date >= CURRENT_DATE - INTERVAL 12 MONTHS
 *   GROUP BY 1 ORDER BY 1;
 */
function parseExampleFile(fileName, text) {
    const lines = text.split('\n');
    const questionLines = [];
    const sqlLines = [];
    let inQuestion = true;

    for (const line of lines) {
        const trimmed = line.trim();
        if (inQuestion && (trimmed.startsWith('--') || trimmed.startsWith('/*') || trimmed.startsWith('*'))) {
            const cleaned = trimmed.replace(/^\/\*\*?/, '').replace(/^\*\/?/, '').replace(/^--/, '').trim();
            if (cleaned) questionLines.push(cleaned);
        } else if (trimmed) {
            inQuestion = false;
            sqlLines.push(line);
        }
    }

    const question = questionLines.join(' ').replace(/\*\/$/, '').trim();
    const sql      = sqlLines.join('\n').trim();

    return { question: question || fileName.replace(/\.sql$/, ''), sql };
}

/**
 * Load all context files from `.amoxsql/context/` in the given project path.
 * Returns null if the directory doesn't exist.
 *
 * @param {string} projectPath - Root directory of the current project
 * @returns {{ metrics, joins, glossary, examples } | null}
 */
async function loadProjectContext(projectPath) {
    if (!projectPath) return null;

    const contextDir = path.join(projectPath, 'context');
    if (!fs.existsSync(contextDir)) return null;

    const ctx = { metrics: [], joins: [], glossary: '', examples: [] };

    try {
        // ── metrics.yml ──
        const metricsPath = path.join(contextDir, 'metrics.yml');
        if (fs.existsSync(metricsPath)) {
            const text = await fs.promises.readFile(metricsPath, 'utf8');
            ctx.metrics = parseMetrics(text);
        }

        // ── joins.yml ──
        const joinsPath = path.join(contextDir, 'joins.yml');
        if (fs.existsSync(joinsPath)) {
            const text = await fs.promises.readFile(joinsPath, 'utf8');
            ctx.joins = parseJoins(text);
        }

        // ── glossary.md ──
        const glossaryPath = path.join(contextDir, 'glossary.md');
        if (fs.existsSync(glossaryPath)) {
            ctx.glossary = await fs.promises.readFile(glossaryPath, 'utf8');
        }

        // ── examples/*.sql ──
        const examplesDir = path.join(contextDir, 'examples');
        if (fs.existsSync(examplesDir)) {
            const files = (await fs.promises.readdir(examplesDir)).filter(f => f.endsWith('.sql'));
            for (const file of files) {
                const text = await fs.promises.readFile(path.join(examplesDir, file), 'utf8');
                ctx.examples.push(parseExampleFile(file, text));
            }
        }

        const hasContent = ctx.metrics.length || ctx.joins.length || ctx.glossary || ctx.examples.length;
        return hasContent ? ctx : null;

    } catch (err) {
        console.warn('[ContextLoader] Failed to load project context:', err.message);
        return null;
    }
}

/**
 * Build a system prompt section from the loaded project context.
 */
function buildProjectContextSection(ctx) {
    if (!ctx) return '';

    const parts = ['\n\n## Project Semantic Context\n'];
    parts.push('The following context was defined by the project owner. Use it to interpret business terms correctly.\n');

    // ── Metrics ──
    if (ctx.metrics.length > 0) {
        parts.push('### Business Metrics\n');
        for (const m of ctx.metrics) {
            parts.push(`**${m.name}**${m.description ? ` — ${m.description}` : ''}`);
            parts.push(`  SQL: \`${m.sql}\``);
            if (m.grain)  parts.push(`  Grain: ${m.grain}`);
            if (m.table)  parts.push(`  Table: ${m.table}`);
            parts.push('');
        }
    }

    // ── Joins ──
    if (ctx.joins.length > 0) {
        parts.push('### Canonical Joins\n');
        for (const j of ctx.joins) {
            parts.push(`- \`${j.from}\` → \`${j.to}\`: \`${j.type} JOIN ON ${j.on}\``);
        }
        parts.push('');
    }

    // ── Glossary ──
    if (ctx.glossary) {
        parts.push('### Domain Glossary\n');
        parts.push(ctx.glossary.trim());
        parts.push('');
    }

    // ── Examples ──
    if (ctx.examples.length > 0) {
        parts.push('### Example Queries\n');
        for (const ex of ctx.examples) {
            parts.push(`**Q: ${ex.question}**`);
            parts.push(`\`\`\`sql\n${ex.sql}\n\`\`\``);
            parts.push('');
        }
    }

    return parts.join('\n');
}

module.exports = { loadProjectContext, buildProjectContextSection };
