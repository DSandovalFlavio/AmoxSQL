'use strict';

/**
 * joinSanityCheck.js
 *
 * After a successful execute_sql that contains a JOIN, checks whether the
 * result row count is plausible given the cardinalities of the base tables.
 *
 * A "fan-out" occurs when the right side of a JOIN has multiple rows per key,
 * causing the result to have MORE rows than the left (driving) table. This
 * silently inflates aggregates (SUM, AVG, COUNT) and is a very common source
 * of wrong numbers in AI-generated analyses.
 *
 * Algorithm:
 *   1. Detect JOINs in the SQL via regex.
 *   2. Extract table names from FROM and JOIN clauses.
 *   3. COUNT(*) each base table (2-second timeout; cached for 60s per session).
 *   4. If result_rows > min(base_table_rows) * FAN_OUT_THRESHOLD → warn.
 *
 * Returns null when the SQL is too complex to parse or counts cannot be fetched.
 * Never throws — errors are swallowed silently so a failed check never
 * disrupts the execute_sql response.
 */

/** Ratio above which we consider a JOIN suspicious. */
const FAN_OUT_THRESHOLD = 1.5;

/** Per-session cache: tableName → { count, ts } */
const countCache = new Map();
const COUNT_CACHE_TTL_MS = 60_000;

/**
 * Simple regex-based SQL parser.
 * Returns an array of base table names (no aliases, no subqueries).
 */
function extractBaseTableNames(sql) {
    const names = [];

    // Strip block comments and line comments to avoid false matches.
    const stripped = sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' ');

    // Match FROM <name> [alias] and JOIN <name> [alias]
    // Deliberately simple: only handles direct table refs, not subquery CTEs.
    const tableRef = /(?:FROM|JOIN)\s+(["`]?[\w.]+["`]?)(?:\s+(?:AS\s+)?[\w]+)?/gi;
    let m;
    while ((m = tableRef.exec(stripped)) !== null) {
        const raw = m[1].replace(/["`]/g, '');
        // Skip if it looks like a subquery or CTE reference inside parens
        if (raw.startsWith('(') || raw === '') continue;
        names.push(raw);
    }

    return [...new Set(names)]; // deduplicate
}

/**
 * Return true if the SQL contains at least one explicit JOIN keyword.
 */
function hasJoin(sql) {
    return /\bJOIN\b/i.test(sql);
}

/**
 * Fetch COUNT(*) for a table, using the per-session cache.
 * Returns null on any error (table not found, timeout, etc.).
 */
async function getTableCount(tableName, dbManager) {
    const cached = countCache.get(tableName);
    if (cached && Date.now() - cached.ts < COUNT_CACHE_TTL_MS) {
        return cached.count;
    }

    try {
        const rows = await Promise.race([
            dbManager.queryWithMetadata(`SELECT COUNT(*) AS n FROM ${tableName}`),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('count timeout')), 2000)
            ),
        ]);
        const count = Number(rows?.rows?.[0]?.n ?? rows?.rows?.[0]?.['count_star()'] ?? -1);
        if (count >= 0) {
            countCache.set(tableName, { count, ts: Date.now() });
            return count;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Main entry point.
 *
 * @param {string} sql             — original SQL query
 * @param {number} resultRowCount  — how many rows execute_sql returned
 * @param {object} dbManager       — DatabaseManager instance
 * @returns {Promise<object|null>} — warning object or null if no issue / cannot determine
 */
async function analyzeJoin(sql, resultRowCount, dbManager) {
    try {
        if (!hasJoin(sql)) return null;

        const tableNames = extractBaseTableNames(sql);
        if (tableNames.length < 2) return null; // need at least 2 tables to compare

        // Fetch counts in parallel
        const counts = await Promise.all(
            tableNames.map(async name => ({
                name,
                count: await getTableCount(name, dbManager),
            }))
        );

        // Filter out tables we couldn't count
        const valid = counts.filter(c => c.count !== null && c.count >= 0);
        if (valid.length === 0) return null;

        const minCount  = Math.min(...valid.map(c => c.count));
        const maxCount  = Math.max(...valid.map(c => c.count));

        // No fan-out possible if result <= smallest table
        if (resultRowCount <= minCount * FAN_OUT_THRESHOLD) return null;

        // Fan-out detected
        const ratio = (resultRowCount / minCount).toFixed(1);
        const baseSummary = valid.map(c => `${c.name}=${c.count}`).join(', ');

        return {
            type:    'join-fanout',
            message: `JOIN produced ${resultRowCount} rows but the smallest base table has ${minCount} rows (${ratio}× fan-out). ` +
                     `This usually means the JOIN key is not unique on the right side, causing row duplication. ` +
                     `Aggregates like SUM/AVG on this result may be inflated. ` +
                     `Consider adding DISTINCT, grouping before joining, or verifying key uniqueness.`,
            resultRowCount,
            baseTableCounts: valid.reduce((o, c) => { o[c.name] = c.count; return o; }, {}),
            ratio: parseFloat(ratio),
            maxBaseCount: maxCount,
            minBaseCount: minCount,
        };
    } catch {
        return null; // never disrupt execute_sql
    }
}

/**
 * Clear the count cache (useful for tests or when a new DB is attached).
 */
function clearCountCache() {
    countCache.clear();
}

module.exports = { analyzeJoin, clearCountCache };
