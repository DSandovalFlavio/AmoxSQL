import { Parser as TreeSitter, Language } from 'web-tree-sitter';
import {
    determineClause,
    extractTablesAndAliases,
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
            const { suggestions, clause } = getCompletions(payload.line, payload.column, payload.triggerChar);
            self.postMessage({ id, status: 'success', result: { suggestions, clause } });
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
    let offset = 0;
    for (let i = 0; i < row; i++) {
        offset += lines[i].length + 1;
    }
    offset += col;

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
    const clause = determineClause(cursorNode, statementNode);
    
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

    // --- DUCKDB FILE RESOLUTION OVERRIDE ---
    // Tree-sitter SQL grammar often fails to classify string paths (e.g. 'data.csv') 
    // as valid 'relation' nodes. We cross-verify raw text against known cached files.
    // Use statementNode text if available, otherwise fall back to FULL document text
    // (critical for when AST produces ERROR nodes during fast typing).
    const searchText = (statementNode ? statementNode.text : currentText).toLowerCase();
    Object.keys(schemaCache.tables).forEach(cachedTable => {
        if (cachedTable.includes('.') && searchText.includes(cachedTable)) {
            referencedTables.add(cachedTable);
        }
    });

    // ====== FORMATTING UTILS ======
    function formatIdentifier(name) {
        // Quote if: contains spaces, accents, special chars, starts with digit,
        // or is a SQL reserved word
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || SQL_RESERVED_WORDS.has(name.toUpperCase())) {
            return `"${name}"`;
        }
        return name;
    }

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
                sortText: '1_a_' + alias
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
                                sortText: '1_b_' + c.name
                            });
                        }
                    });
                }
            });
        } else {
            // Fallback: all columns if no scope found
            (schemaCache.allColumns || []).forEach(col => {
                suggestions.push({
                    label: col, 
                    kind: 3, 
                    insertText: formatIdentifier(col), 
                    detail: 'Column', 
                    sortText: '1_z_' + col
                });
            });
        }
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
            sortText: '0_k_' + kw, // Contextual Keywords ALWAYS get top priority over fuzzy columns
            filterText: kw + ' ' + kw.toLowerCase()
        });
    });

    return { suggestions, clause };
}
