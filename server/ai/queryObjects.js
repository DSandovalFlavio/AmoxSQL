/**
 * AmoxSQL AI — Query object resolver.
 *
 * Given the SQL the user has in the editor, find every object it references in
 * FROM/JOIN — both DB tables AND file reads (CSV/JSON/Parquet/Excel/…) — and
 * DESCRIBE each to get its columns + types. This is what stops the assistant
 * from being "blind" to a `SELECT * FROM 'data.csv'`: it no longer has to ask
 * "what's your table?", it already sees the columns.
 *
 * DESCRIBE only reads the schema (header / type inference), not the rows, so it
 * is cheap even for big files.
 */

'use strict';

// Distinctive file tokens — safe to match anywhere in the query.
const FILE_READ_RE = /read_(?:csv|csv_auto|parquet|json|json_auto|ndjson|xlsx)\s*\([^)]*\)/gi;
const FILE_PATH_RE = /'[^']*\.(?:csv|tsv|parquet|json|jsonl|ndjson|xlsx|xls)'/gi;

/** The underlying file path inside a ref (for dedup), or the ref itself. */
function refPath(ref) {
    const m = ref.match(/'([^']+)'/);
    return (m ? m[1] : ref).toLowerCase();
}

/** Extract file-read references (read_*() calls and quoted data-file paths),
 *  deduped by underlying path so read_json_auto('x.json') and 'x.json' don't
 *  both resolve the same file twice. read_*() form wins (carries options). */
function extractFileRefs(query) {
    const byPath = new Map();
    // read_*() calls first — they win (they may carry parsing options).
    for (const m of String(query).matchAll(FILE_READ_RE)) {
        const ref = m[0].trim();
        byPath.set(refPath(ref), ref);
    }
    for (const m of String(query).matchAll(FILE_PATH_RE)) {
        const ref = m[0].trim();
        const key = refPath(ref);
        if (!byPath.has(key)) byPath.set(key, ref);
    }
    return [...byPath.values()];
}

/** Which DB tables (from a known-name list) does this query reference? */
function extractTableRefs(query, knownNames) {
    if (!query || !Array.isArray(knownNames) || knownNames.length === 0) return [];
    const q = String(query);
    return knownNames.filter(name => {
        const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^A-Za-z0-9_])"?${esc}"?($|[^A-Za-z0-9_])`, 'i').test(q);
    });
}

function fileLabel(ref) {
    // read_json_auto('a/b/c.csv') or 'a/b/c.csv' → "c.csv"
    const pathMatch = ref.match(/'([^']+)'/);
    const p = pathMatch ? pathMatch[1] : ref;
    return p.split(/[\\/]/).pop() || ref;
}

function fileFormat(ref) {
    const m = ref.match(/\.([a-z]+)'/i) || ref.match(/read_(\w+?)(?:_auto)?\s*\(/i);
    return m ? m[1].toLowerCase() : 'file';
}

/**
 * Resolve the objects a query references, with columns + types.
 * @param {string} query
 * @param {object} dbManager - must expose systemQuery(sql, opts)
 * @param {string[]} knownTableNames - user table names (for DB-table matching)
 * @param {number} [max=12] - safety cap on objects described
 * @returns {Promise<Array<{ref,kind,label,format?,columns:Array<{name,type}>}>>}
 */
async function resolveQueryObjects(query, dbManager, knownTableNames = [], max = 12) {
    if (!query || !dbManager) return [];
    const out = [];
    const seen = new Set();

    const describe = async (fromExpr) => {
        const rows = await dbManager.systemQuery(`DESCRIBE SELECT * FROM ${fromExpr} LIMIT 0`, { lane: 'meta' });
        return rows.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
    };

    // 1. File references (the case the old bounded context missed entirely).
    for (const ref of extractFileRefs(query)) {
        if (out.length >= max) break;
        if (seen.has(ref)) continue;
        seen.add(ref);
        try {
            out.push({ ref, kind: 'file', label: fileLabel(ref), format: fileFormat(ref), columns: await describe(ref) });
        } catch { /* file missing / unreadable — skip */ }
    }

    // 2. DB tables referenced by name.
    for (const name of extractTableRefs(query, knownTableNames)) {
        if (out.length >= max) break;
        if (seen.has(name)) continue;
        seen.add(name);
        try {
            const rows = await dbManager.systemQuery(`DESCRIBE "${name.replace(/"/g, '""')}"`, { lane: 'meta' });
            out.push({ ref: name, kind: 'table', label: name, columns: rows.map(c => ({ name: c.column_name, type: c.column_type || c.data_type })) });
        } catch { /* skip */ }
    }

    return out;
}

module.exports = { resolveQueryObjects, extractFileRefs, extractTableRefs };
