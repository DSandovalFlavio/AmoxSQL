/**
 * Shared SQL utilities used by both the Express endpoints (index.js) and the
 * AI subsystem (ai/tools.js). Kept dependency-free so requiring it from either
 * side can never create a circular require.
 */

/**
 * Wraps a SELECT/WITH query with LIMIT N+1 to cap the number of rows DuckDB
 * materializes. Fetching one extra row lets the caller detect truncation:
 * if `limit + 1` rows come back, the result was cut and more rows exist.
 *
 * DDL/DML pass through unchanged. Queries with their own inner LIMIT keep it —
 * the outer subquery LIMIT only caps, never expands.
 */
function applyRowLimit(sql, limit) {
    if (!limit || limit <= 0) return { sql, limited: false };
    const stripped = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const upper = stripped.toUpperCase();
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) return { sql, limited: false };
    // Strip trailing semicolons so the subquery wrapping stays valid
    const cleanSql = sql.trimEnd().replace(/;+$/, '');
    return {
        sql: `SELECT * FROM (\n${cleanSql}\n) __amox_rows LIMIT ${limit + 1}`,
        limited: true,
        limit,
    };
}

module.exports = { applyRowLimit };
