import { Parser as TreeSitter, Language } from 'web-tree-sitter';
import {
    determineClause,
    clauseFromText,
    extractDerivedRelations,
    extractTablesAndAliases,
    extractFileReferences,
    findEnclosingStatement,
    isDotAccess,
    isJinjaContext,
    isCleanStart
} from './treeSitterUtils.js';

let parser = null;
let currentTree = null;
let currentText = '';

let schemaCache = { tables: {}, allColumns: [] };
let dbtCache = { available: false, models: [], sources: [] };

// SQL reserved words — identifiers matching these must be double-quoted
const SQL_RESERVED_WORDS = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AS', 'AND', 'OR', 'NOT',
    'IN', 'IS', 'NULL', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT',
    'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE',
    'INDEX', 'VIEW', 'SET', 'VALUES', 'INTO', 'BETWEEN', 'LIKE',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'EXISTS',
    'ALL', 'ANY', 'SOME', 'TRUE', 'FALSE', 'DEFAULT', 'CHECK',
    'UNION', 'EXCEPT', 'INTERSECT', 'WITH', 'DISTINCT', 'WINDOW',
    'OVER', 'PARTITION', 'ROWS', 'RANGE', 'CURRENT', 'ROW',
    'DATE', 'TIME', 'TIMESTAMP', 'INTERVAL', 'KEY', 'PRIMARY',
    'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'OFFSET',
]);

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------
async function initParser(treeSitterWasmUrl, sqlWasmUrl) {
    if (parser) return;
    
    await TreeSitter.init({
        locateFile() {
            return treeSitterWasmUrl;
        }
    });
    
    const SQL = await Language.load(sqlWasmUrl);
    parser = new TreeSitter();
    parser.setLanguage(SQL);
}

// -----------------------------------------------------------------------------
// Message Handler
// -----------------------------------------------------------------------------
self.onmessage = async (e) => {
    const { action, id, payload } = e.data;
    
    try {
        if (action === 'init') {
            await initParser(payload.treeSitterWasmUrl, payload.sqlWasmUrl);
            self.postMessage({ id, status: 'success', result: { ready: true } });
        }
        else if (action === 'syncDocument') {
            currentText = payload.text;
            if (parser) {
                // If we implemented incremental parsing we would use old tree + edits,
                // but for SQL queries full re-parse is typically < 5ms.
                currentTree = parser.parse(currentText);
            }
        }
        else if (action === 'updateSchema') {
            schemaCache = payload;
        }
        else if (action === 'updateDbtManifest') {
            dbtCache = payload;
        }
        else if (action === 'requestCompletions') {
            const { suggestions, clause, derived } = getCompletions(payload.line, payload.column, payload.triggerChar);
            self.postMessage({ id, status: 'success', result: { suggestions, clause, derived } });
        }
    } catch (err) {
        console.error('[SQL Worker Error]', err);
        if (id) {
            self.postMessage({ id, status: 'error', error: err.message || String(err) });
        }
    }
};

// -----------------------------------------------------------------------------
// Completion Logic
// -----------------------------------------------------------------------------
function getCompletions(line, column, triggerChar) {
    const suggestions = [];
    
    if (!parser || !currentTree) {
        return { suggestions, clause: 'ROOT' }; // Parser not ready yet
    }

    // Convert Monaco's 1-indexed line/column to tree-sitter's 0-indexed row/column
    const row = line - 1;
    const col = column - 1;

    // We need the offset to check Jinja contexts easily
    const lines = currentText.split('\n');
    // Editor and worker sync asynchronously — a completion request can name a
    // position our snapshot doesn't have yet (stale text). Return quietly; the
    // next syncDocument + request pair will be consistent. Never throw here:
    // this runs on every keystroke and a console error per key freezes dev.
    if (row < 0 || row >= lines.length) {
        return { suggestions, clause: 'ROOT' };
    }
    let offset = 0;
    for (let i = 0; i < row; i++) {
        offset += lines[i].length + 1;
    }
    offset += Math.min(Math.max(col, 0), lines[row].length);

    // 1. Clean Start Detection (empty editor, after `;`)
    if (isCleanStart(currentText, offset)) {
        // Only DDL/DML keywords — zero noise
        const rootKeywords = ['SELECT', 'WITH', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'COPY', 'DESCRIBE', 'SHOW', 'PRAGMA', 'SET'];
        rootKeywords.forEach(kw => {
            suggestions.push({
                label: kw,
                kind: 14, // Constant
                insertText: kw + ' ',
                detail: 'Keyword',
                sortText: '0_k_' + kw,
                filterText: kw + ' ' + kw.toLowerCase()
            });
        });
        return { suggestions, clause: 'ROOT' };
    }

    // 2. Jinja / DBT Context Check
    if (isJinjaContext(currentText, offset)) {
        // Find if we are inside `ref('` or `source('`
        const textUpToCursor = currentText.substring(0, offset);
        if (textUpToCursor.match(/ref\(\s*['"]$/)) {
            (dbtCache.models || []).forEach(m => {
                suggestions.push({
                    label: m.name,
                    kind: 9, // Module
                    insertText: m.name,
                    detail: `Model (${m.schema})`,
                    documentation: m.description,
                    sortText: '0_' + m.name
                });
            });
            return { suggestions, clause: 'ROOT' };
        }

        // source('src_name', 'table_name') — suggest source names then table names
        const srcMatch = textUpToCursor.match(/source\(\s*['"]([^'"]*)['"]\s*,\s*['"]$/);
        if (srcMatch) {
            // We're in the second argument — suggest tables for this source
            const sourceName = srcMatch[1];
            const src = (dbtCache.sources || []).find(s => s.name === sourceName);
            if (src && src.tables) {
                src.tables.forEach(t => {
                    suggestions.push({
                        label: t.name,
                        kind: 7, // Class (Table)
                        insertText: t.name,
                        detail: `Source Table (${sourceName})`,
                        documentation: t.description,
                        sortText: '0_' + t.name
                    });
                });
            }
            return { suggestions, clause: 'ROOT' };
        }
        if (textUpToCursor.match(/source\(\s*['"]$/)) {
            // First argument — suggest source names
            (dbtCache.sources || []).forEach(s => {
                suggestions.push({
                    label: s.name,
                    kind: 9, // Module
                    insertText: s.name,
                    detail: 'DBT Source',
                    documentation: s.schema || '',
                    sortText: '0_' + s.name
                });
            });
            return { suggestions, clause: 'ROOT' };
        }
        
        // General jinja block fallback returns nothing (we don't pollute with SQL tables)
        return { suggestions, clause: 'ROOT' };
    }

    // 2. Locate AST Node at cursor
    // descendantForPosition returns the most specific node spanning the point.
    // If we're at the end of a line or after a space, we might be at the edge, 
    // so let's get the node precisely at or right before cursor.
    let cursorNode = currentTree.rootNode.descendantForPosition({ row, column: Math.max(0, col - 1) });
    
    // Find enclosing statement to restrict scope (e.g., this avoids leaking parent scope into subqueries)
    const statementNode = findEnclosingStatement(cursorNode);
    let clause = determineClause(cursorNode, statementNode);
    
    // Fallback manual regex for Dot access (AST often marks `table.` as ERROR node)
    const dotAlias = isDotAccess(cursorNode, { row, column: col }, currentText);
    
    // 3. Extract Tables mapped in this specific statement scope
    let aliasMap = {};
    let referencedTables = new Set();
    let tableAliases = {};
    if (statementNode) {
        const extracted = extractTablesAndAliases(statementNode);
        aliasMap = extracted.aliasMap || {};
        referencedTables = extracted.referencedTables || new Set();
        tableAliases = extracted.tableAliases || {};
    }

    // --- FILE REFERENCE RESOLUTION (regex fallback for tree-sitter) ---
    // Tree-sitter SQL grammar treats 'file.csv' as a string literal, not a relation.
    // Use regex to extract file references + aliases from raw text.
    // IMPORTANT: statementNode.text is unreliable — tree-sitter often splits the query
    // into smaller nodes (e.g., 'statement' only covers 'SELECT col', not the FROM clause).
    // Instead, find the full SQL statement by scanning between semicolons.
    let searchText;
    let stmtStart = 0;
    {
        const beforeCursor = currentText.substring(0, offset);
        const afterCursor = currentText.substring(offset);
        const lastSemi = beforeCursor.lastIndexOf(';');
        const nextSemi = afterCursor.indexOf(';');
        stmtStart = lastSemi >= 0 ? lastSemi + 1 : 0;
        const stmtEnd = nextSemi >= 0 ? offset + nextSemi + 1 : currentText.length;
        searchText = currentText.substring(stmtStart, stmtEnd).trim();
    }

    // Robust clause fallback: tree-sitter's AST clause detection returns null on DuckDB file
    // refs ('data.csv' parses as a string → ERROR node). Scan the statement text up to the
    // cursor for the last clause keyword so e.g. GROUP BY is recognised (and functions aren't
    // wrongly offered there).
    if (!clause) {
        clause = clauseFromText(currentText.substring(stmtStart, offset)) || 'SELECT';
    }

    const fileRefs = extractFileReferences(searchText);

    // Merge file references into scope maps
    fileRefs.fileTables.forEach(f => referencedTables.add(f));
    Object.entries(fileRefs.fileAliasMap).forEach(([alias, table]) => {
        aliasMap[alias] = table;
    });
    Object.entries(fileRefs.fileTableAliases).forEach(([table, alias]) => {
        tableAliases[table] = alias;
    });

    // Secondary pass: catch files in cache not found by extractFileReferences regex.
    // IMPORTANT: Only add if the file appears in a FROM/JOIN context, not just anywhere.
    Object.keys(schemaCache.tables).forEach(cachedTable => {
        if (cachedTable.includes('.') && !referencedTables.has(cachedTable)) {
            const escapedName = cachedTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const contextPattern = new RegExp(
                `(?:FROM|JOIN)\\s+(?:read_\\w+\\s*\\(\\s*)?['"]${escapedName}['"]`, 'i'
            );
            if (contextPattern.test(searchText)) {
                referencedTables.add(cachedTable);
            }
        }
    });

    // --- PARTIAL FILE REFERENCE RESOLUTION ---
    // When user is still typing a file path (e.g., FROM 'Da — no closing quote),
    // match the partial input against cached files so columns appear immediately.
    if (referencedTables.size === 0) {
        // Capture partial file paths: FROM ' followed by text without a closing quote
        const partialFilePattern = /(?:FROM|JOIN)\s+(?:read_\w+\s*\(\s*)?['"]([^'"]+)$/gim;
        let partialMatch;
        while ((partialMatch = partialFilePattern.exec(searchText)) !== null) {
            const partialName = partialMatch[1].toLowerCase();
            // Find cached files whose name starts with the partial input
            Object.keys(schemaCache.tables).forEach(cachedTable => {
                if (cachedTable.includes('.') && cachedTable.startsWith(partialName)) {
                    referencedTables.add(cachedTable);
                }
            });
        }
    }

    // Statement-aware locality: tokens already present in this statement are likely what the
    // user wants again (e.g. a SELECT column repeated in GROUP BY / ORDER BY / HAVING). We
    // boost those to the top bucket below. The statement is short, so this scan is trivial —
    // no need for Monaco's editor-worker localityBonus (which would block the main thread here).
    const usedTokens = new Set((searchText.toLowerCase().match(/[a-z_][a-z0-9_]*/g) || []));

    // ====== FORMATTING UTILS ======
    function formatIdentifier(name) {
        // Quote if: contains spaces, accents, special chars, starts with digit,
        // or is a SQL reserved word
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || SQL_RESERVED_WORDS.has(name.toUpperCase())) {
            return `"${name}"`;
        }
        return name;
    }

    // === Derived relations (CTEs + FROM-subqueries) ===
    // Build a DESCRIBE-able probe per derived relation so the provider can ask DuckDB for its
    // real output columns (which the AST can't compute). CTE probes carry the full WITH clause
    // so inter-CTE dependencies resolve. `relations` = the derived relations in this scope.
    const { withClause, cteNames, subqueries } = extractDerivedRelations(searchText);
    const derivedProbe = {}; // name(lower) -> probe SQL
    cteNames.forEach(n => {
        derivedProbe[n.toLowerCase()] = `${withClause} SELECT * FROM ${formatIdentifier(n)}`.trim();
    });
    (subqueries || []).forEach(sq => {
        derivedProbe[sq.alias.toLowerCase()] = `${withClause} SELECT * FROM (${sq.sql}) AS ${formatIdentifier(sq.alias)}`.trim();
    });
    const inScopeRelations = [
        // CTEs actually referenced in this statement's FROM
        ...cteNames.filter(n => referencedTables.has(n.toLowerCase()))
            .map(n => ({ name: n, probeSql: derivedProbe[n.toLowerCase()] })),
        // Subqueries are inherently in scope (they sit in the FROM of this statement)
        ...(subqueries || []).map(sq => ({ name: sq.alias, probeSql: derivedProbe[sq.alias.toLowerCase()] })),
    ];

    // === MODE: DOT_PROPERTY (e.g. u.id) ===
    if (dotAlias) {
        const resolvedTable = aliasMap[dotAlias] || Object.keys(schemaCache.tables).find(t => t.toLowerCase() === dotAlias) || dotAlias;
        const columns = schemaCache.tables[resolvedTable];
        if (columns) {
            columns.forEach(c => {
                 suggestions.push({
                     label: c.name,
                     kind: 3, // CompletionItemKind.Field
                     insertText: formatIdentifier(c.name),
                     detail: `${c.type || 'Column'} (${resolvedTable})`,
                     sortText: '0_' + c.name
                 });
            });
            return { suggestions, clause };
        }
        // No base-table columns: if the dot target is a derived relation (CTE/subquery),
        // let the provider DESCRIBE it.
        const derivedKey = derivedProbe[dotAlias] ? dotAlias
            : (aliasMap[dotAlias] && derivedProbe[aliasMap[dotAlias]] ? aliasMap[dotAlias] : null);
        if (derivedKey) {
            return { suggestions: [], clause, derived: { relations: [], dotTarget: { name: derivedKey, probeSql: derivedProbe[derivedKey] } } };
        }
        return { suggestions, clause };
    }

    // === MODE: FROM / JOIN CLAUSE ===
    if (clause === 'FROM' || clause === 'JOIN') {
        Object.keys(schemaCache.tables).forEach(tableName => {
            suggestions.push({
                label: tableName,
                kind: 7, // CompletionItemKind.Class
                insertText: formatIdentifier(tableName),
                detail: 'Table',
                sortText: '0_' + tableName
            });
        });
    } else if (clause !== 'ROOT' && clause !== 'LIMIT') {
        // === MODE: SELECT / WHERE / HAVING / etc ===
        // ROOT and LIMIT: only keywords, no columns/aliases/tables
        // Aliases
        Object.entries(aliasMap).forEach(([alias, table]) => {
            suggestions.push({
                label: alias,
                kind: 4, // Variable
                insertText: alias,
                detail: `Alias → ${table}`,
                sortText: (usedTokens.has(alias.toLowerCase()) ? '0_used_' : '1_a_') + alias
            });
        });

        // Columns from referenced tables in THIS scope
        if (referencedTables.size > 0) {
            const addedCols = new Set();
            // Smart Dotting: if multiple tables, ALWAYS prefix with alias
            // to prevent "Ambiguous Column Name" errors at DuckDB runtime
            const multiTable = referencedTables.size > 1;
            referencedTables.forEach(table => {
                const cols = schemaCache.tables[table];
                if (cols) {
                    const alias = tableAliases[table.toLowerCase()];
                    cols.forEach(c => {
                        const key = `${table}.${c.name}`;
                        if (!addedCols.has(key)) {
                            addedCols.add(key);
                            const formattedCol = formatIdentifier(c.name);
                            const needsPrefix = multiTable && alias;
                            suggestions.push({
                                label: needsPrefix ? `${alias}.${c.name}` : c.name,
                                kind: 3, // Field
                                insertText: needsPrefix ? `${alias}.${formattedCol}` : formattedCol,
                                detail: `${c.type || 'Column'} (${alias || table})`,
                                // Filter by the bare column name even when the label carries an
                                // alias prefix, so typing the column (not "alias.col") matches cleanly.
                                filterText: c.name,
                                // Boost columns already used in the statement (e.g. a SELECT column
                                // typed again in GROUP BY/ORDER BY) — the "reads my mind" ranking.
                                sortText: (usedTokens.has(c.name.toLowerCase()) ? '0_used_' : '1_b_') + c.name
                            });
                        }
                    });
                }
            });
        }
        // If no tables referenced in FROM/JOIN → no columns to suggest. This is correct.
        // The user needs to write a FROM clause first.
    }

    // ====== CONTEXTUAL KEYWORDS ======
    function getContextKeywords(clauseType) {
        switch(clauseType) {
            case 'ROOT': return ['SELECT', 'FROM', 'WITH', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'COPY', 'DESCRIBE', 'SHOW', 'PRAGMA', 'SET'];
            case 'SELECT': return ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'CASE', 'CAST', 'EXCLUDE', 'REPLACE', 'OVER', 'AS', 'WINDOW', 'DISTINCT', 'ALL'];
            case 'FROM': 
            case 'JOIN': return ['FROM', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'CROSS JOIN', 'ON', 'USING', 'AS', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'LATERAL', 'UNNEST'];
            case 'WHERE': return ['WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'ILIKE', 'EXISTS', 'ANY', 'ALL', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'TRUE', 'FALSE'];
            case 'GROUP BY': return ['GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT'];
            case 'ORDER BY': return ['ORDER BY', 'LIMIT', 'ASC', 'DESC', 'NULLS FIRST', 'NULLS LAST'];
            case 'HAVING': return ['HAVING', 'ORDER BY', 'LIMIT', 'AND', 'OR'];
            case 'WINDOW': return ['WINDOW', 'AS', 'PARTITION BY', 'ORDER BY', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT ROW'];
            case 'QUALIFY': return ['QUALIFY', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'ORDER BY', 'LIMIT'];
            case 'LIMIT': return ['LIMIT', 'OFFSET'];
            case 'CTE': return ['WITH', 'AS', 'SELECT', 'FROM'];
            default: return ['SELECT', 'FROM', 'WHERE'];
        }
    }

    const allowedKeywords = getContextKeywords(clause);
    allowedKeywords.forEach(kw => {
        suggestions.push({
            label: kw,
            kind: 14, // Constant (bypasses editor.suggest.showKeywords: false)
            insertText: kw + ' ',
            detail: 'Keyword',
            // Keywords rank BELOW in-scope columns/aliases (bucket 1_): when you're actively
            // typing an identifier the column you want wins the tie; fuzzy score still lets a
            // clearly-typed keyword (e.g. "wh" -> WHERE) float to the top on its own merit.
            sortText: '2_k_' + kw,
            filterText: kw + ' ' + kw.toLowerCase()
        });
    });

    return { suggestions, clause, derived: { relations: inScopeRelations, dotTarget: null } };
}
