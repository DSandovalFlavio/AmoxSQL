/**
 * Shared SQL result-type classifier.
 *
 * Used by both the /api/query endpoint (to tell the editor whether a statement
 * produced a table or was a DML/DDL side-effect) and the Chain executor (per
 * node). Kept dependency-free so requiring it from either side can never create
 * a circular require.
 *
 * Returns { resultType, details } where resultType is one of the keys mirrored
 * by RESULT_TYPE_LABELS on the client (client/src/components/chains/chainNodeTypes.js).
 */
function detectResultType(sql) {
    if (!sql) return { resultType: 'unknown', details: {} };

    // Strip leading/inline comments FIRST — a statement may carry a leading
    // comment (e.g. a notebook cell that preserves "-- step 2\nINSERT …"), and
    // matching `^INSERT` against the comment would misclassify it as 'unknown'.
    const cleaned = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const trimmed = cleaned.toUpperCase();

    if (/^CREATE\s+(OR\s+REPLACE\s+)?TABLE/i.test(trimmed)) {
        const match = cleaned.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
        return { resultType: 'table_created', details: { table: match?.[1] || 'unknown' } };
    }
    if (/^CREATE\s+(OR\s+REPLACE\s+)?VIEW/i.test(trimmed)) {
        const match = cleaned.match(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
        return { resultType: 'view_created', details: { view: match?.[1] || 'unknown' } };
    }
    if (/^INSERT\s+INTO/i.test(trimmed)) {
        const match = cleaned.match(/INSERT\s+INTO\s+([^\s(]+)/i);
        return { resultType: 'rows_inserted', details: { table: match?.[1] || 'unknown' } };
    }
    if (/^UPDATE\s+/i.test(trimmed)) {
        const match = cleaned.match(/UPDATE\s+([^\s]+)/i);
        return { resultType: 'rows_updated', details: { table: match?.[1] || 'unknown' } };
    }
    if (/^DELETE\s+FROM/i.test(trimmed)) {
        const match = cleaned.match(/DELETE\s+FROM\s+([^\s]+)/i);
        return { resultType: 'rows_deleted', details: { table: match?.[1] || 'unknown' } };
    }
    if (/^COPY\s+.*\s+TO\s+/i.test(trimmed)) {
        return { resultType: 'file_exported', details: {} };
    }
    if (/^DROP\s+TABLE/i.test(trimmed)) {
        const match = cleaned.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s;]+)/i);
        return { resultType: 'table_dropped', details: { table: match?.[1] || 'unknown' } };
    }
    if (/^DROP\s+VIEW/i.test(trimmed)) {
        const match = cleaned.match(/DROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([^\s;]+)/i);
        return { resultType: 'view_dropped', details: { view: match?.[1] || 'unknown' } };
    }
    if (/^INSTALL\s+/i.test(trimmed)) {
        const match = cleaned.match(/INSTALL\s+["']?([a-zA-Z0-9_-]+)/i);
        return { resultType: 'extension_installed', details: { extension: match?.[1] || 'unknown' } };
    }
    if (/^LOAD\s+/i.test(trimmed)) {
        const match = cleaned.match(/LOAD\s+["']?([a-zA-Z0-9_-]+)/i);
        return { resultType: 'extension_loaded', details: { extension: match?.[1] || 'unknown' } };
    }
    if (/^(SELECT|WITH|FROM|PIVOT|UNPIVOT|VALUES|DESCRIBE|SUMMARIZE|SHOW|EXPLAIN|PRAGMA|TABLE)\b/i.test(trimmed)) {
        return { resultType: 'query_result', details: {} };
    }

    return { resultType: 'unknown', details: {} };
}

module.exports = { detectResultType };
