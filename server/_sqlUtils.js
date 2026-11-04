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
    // No solo SELECT/WITH: `FROM 'x.parquet'`, lo natural en DuckDB, se traía el
    // archivo entero al navegador (5 M de filas: 29 s de servidor congelado y
    // 4,5 GB para acabar en «Invalid string length»).
    if (!DEVUELVEN_FILAS.test(stripped)) return { sql, limited: false };
    // Strip trailing semicolons so the subquery wrapping stays valid
    const cleanSql = sql.trimEnd().replace(/;+$/, '');
    return {
        sql: `SELECT * FROM (\n${cleanSql}\n) __amox_rows LIMIT ${limit + 1}`,
        limited: true,
        limit,
    };
}

// Lo que empieza así devuelve filas y admite ir de subconsulta.
const DEVUELVEN_FILAS = /^\(*\s*(SELECT|WITH|FROM|VALUES|TABLE|PIVOT|UNPIVOT)\b/i;

// El tope de seguridad, también con el ajuste de filas en 0: lo que cabe en una
// ventana sin ponerla en peligro. Para más, exportar: no pasa por aquí.
const TOPE_FILAS = 1000000;
const TOPE_BYTES = 256 * 1024 * 1024;

module.exports = { applyRowLimit, TOPE_FILAS, TOPE_BYTES };
