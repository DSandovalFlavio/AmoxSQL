/**
 * AmoxSQL AI — Data Profiling Helper
 *
 * Powers the `profile_data` tool. Uses DuckDB's built-in SUMMARIZE plus
 * supplementary per-column queries to return a compact profile that an LLM
 * can consume without running many individual queries.
 */

'use strict';

const MAX_PROFILE_COLS  = 40;   // hard cap to keep response size reasonable
const TOP_VALUES_LIMIT  = 5;    // top-N for low-cardinality string columns
const LOW_CARD_THRESHOLD = 50;  // unique count below which we fetch top values

/**
 * Returns true if the DuckDB type string represents a numeric type.
 */
function isNumericType(typeStr) {
    return /^(INTEGER|BIGINT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL|SMALLINT|TINYINT|HUGEINT|UBIGINT|INT|UINTEGER|USMALLINT|UTINYINT)\b/.test(
        typeStr.toUpperCase()
    );
}

/**
 * Returns true if the DuckDB type string represents a temporal type.
 */
function isTemporalType(typeStr) {
    return /^(DATE|TIMESTAMP|TIME|INTERVAL)\b/.test(typeStr.toUpperCase());
}

/**
 * Profiles a table or view.
 *
 * @param {object} dbManager     - DatabaseManager instance
 * @param {string} tableExpr     - Table expression to profile (e.g. '"my_table"').
 *                                 Caller is responsible for quoting identifiers safely.
 * @param {string[]|null} colFilter - Optional column subset; null = all columns.
 * @returns {Promise<object>} Profile object suitable for LLM consumption.
 */
async function profileTable(dbManager, tableExpr, colFilter = null) {
    // ── 1. Column list ────────────────────────────────────────────────────────
    const descRows = await dbManager.systemQuery(`DESCRIBE ${tableExpr}`);
    let cols = descRows.map(r => ({
        name: r.column_name,
        type: r.column_type,
    }));

    if (colFilter && colFilter.length > 0) {
        const filterSet = new Set(colFilter);
        cols = cols.filter(c => filterSet.has(c.name));
    }

    if (cols.length > MAX_PROFILE_COLS) {
        cols = cols.slice(0, MAX_PROFILE_COLS);
    }

    // ── 2. Row count ──────────────────────────────────────────────────────────
    const countRows = await dbManager.systemQuery(
        `SELECT COUNT(*) AS cnt FROM ${tableExpr}`
    );
    const rowCount = Number(countRows[0]?.cnt ?? 0);

    // ── 3. DuckDB SUMMARIZE ───────────────────────────────────────────────────
    // Returns one row per column with aggregate statistics.
    const summaryMap = {};
    try {
        const summarizeRows = await dbManager.systemQuery(`SUMMARIZE ${tableExpr}`);
        for (const row of summarizeRows) {
            summaryMap[row.column_name] = {
                min:            row.min,
                max:            row.max,
                avg:            row.avg         != null ? Number(row.avg).toFixed(3)  : null,
                std:            row.std         != null ? Number(row.std).toFixed(3)  : null,
                q25:            row['25%'],
                q50:            row['50%'],
                q75:            row['75%'],
                approx_unique:  row.approx_unique != null ? Number(row.approx_unique) : null,
                null_pct:       row.null_percentage != null
                    ? Number(row.null_percentage).toFixed(1)
                    : null,
            };
        }
    } catch {
        // SUMMARIZE may fail on certain view types; fall back to per-column stats below
    }

    // ── 4. Per-column enrichment ──────────────────────────────────────────────
    const columnProfiles = [];

    for (const col of cols) {
        const s = summaryMap[col.name] || {};
        const profile = {
            name:         col.name,
            type:         col.type,
            nulls_pct:    s.null_pct    ?? null,
            unique_approx: s.approx_unique ?? null,
        };

        if (isNumericType(col.type)) {
            profile.min = s.min;
            profile.max = s.max;
            profile.avg = s.avg;
            profile.std = s.std;
            profile.q25 = s.q25;
            profile.q50 = s.q50;
            profile.q75 = s.q75;
        } else if (isTemporalType(col.type)) {
            profile.min = s.min;
            profile.max = s.max;
        } else {
            // String / boolean / other — fetch top values when low cardinality
            const card = s.approx_unique ?? null;
            if (card !== null && card <= LOW_CARD_THRESHOLD) {
                try {
                    const quotedCol = `"${col.name.replace(/"/g, '""')}"`;
                    const topRows = await dbManager.systemQuery(
                        `SELECT ${quotedCol} AS val, COUNT(*) AS cnt
                         FROM ${tableExpr}
                         WHERE ${quotedCol} IS NOT NULL
                         GROUP BY ${quotedCol}
                         ORDER BY cnt DESC
                         LIMIT ${TOP_VALUES_LIMIT}`
                    );
                    profile.top_values = topRows.map(r => ({
                        val:   r.val,
                        count: Number(r.cnt),
                    }));
                } catch {
                    // Ignore — top values are best-effort
                }
            }
        }

        // If SUMMARIZE didn't cover this column, compute null % manually
        if (profile.nulls_pct === null && rowCount > 0) {
            try {
                const quotedCol = `"${col.name.replace(/"/g, '""')}"`;
                const nullRes = await dbManager.systemQuery(
                    `SELECT COUNT(*) AS cnt FROM ${tableExpr} WHERE ${quotedCol} IS NULL`
                );
                const nullCount = Number(nullRes[0]?.cnt ?? 0);
                profile.nulls_pct = ((nullCount / rowCount) * 100).toFixed(1);
            } catch {
                // ignore
            }
        }

        columnProfiles.push(profile);
    }

    return {
        table:        tableExpr,
        row_count:    rowCount,
        column_count: cols.length,
        columns:      columnProfiles,
    };
}

module.exports = { profileTable };
