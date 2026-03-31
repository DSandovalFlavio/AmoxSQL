/**
 * Utilities for analyzing the Tree-sitter SQL Abstract Syntax Tree.
 */

/**
 * Finds the nearest enclosing statement or subquery for a given node.
 * Uses a heuristic of looking for nodes that typically act as query boundaries.
 */
export function findEnclosingStatement(node) {
    let current = node;
    const STATEMENT_TYPES = new Set([
        'statement',
        'select_statement',
        'subquery',
        'insert_statement',
        'update_statement',
        'delete_statement'
    ]);

    while (current) {
        if (STATEMENT_TYPES.has(current.type)) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

/**
 * Determines the specific clause context the node is in.
 * e.g., 'SELECT', 'FROM', 'WHERE', 'JOIN', 'ORDER BY'
 */
export function determineClause(node, statementNode) {
    if (!statementNode) return 'ROOT';

    let current = node;
    while (current && current !== statementNode) {
        // Most SQL grammars have node types like from_clause, where_clause, etc.
        if (current.type === 'from_clause') return 'FROM';
        if (current.type === 'where_clause') return 'WHERE';
        if (current.type === 'join_clause' || current.type === 'join') return 'JOIN';
        if (current.type === 'group_by_clause') return 'GROUP BY';
        if (current.type === 'order_by_clause') return 'ORDER BY';
        if (current.type === 'having_clause') return 'HAVING';
        if (current.type === 'window_clause') return 'WINDOW';
        if (current.type === 'qualify_clause' || current.type === 'qualify') return 'QUALIFY';
        if (current.type === 'limit_clause') return 'LIMIT';
        if (current.type === 'with_clause' || current.type === 'cte') return 'CTE';
        if (current.type === 'select_clause_body' || current.type === 'select_expression') return 'SELECT';
        current = current.parent;
    }
    
    // If we're inside the statement but not in a specific clause, default to root or select
    return 'SELECT'; 
}

/**
 * Walks the AST to extract tables and their aliases **only** from the FROM and JOIN clauses
 * of the given statement node. This prevents identifiers in SELECT, WHERE, GROUP BY, etc.
 * from being misidentified as referenced tables.
 * Returns { aliasMap: { 'u': 'usuarios' }, referencedTables: Set('usuarios') }
 */
export function extractTablesAndAliases(statementNode) {
    const aliasMap = {};
    const referencedTables = new Set();
    const tableAliases = {};

    if (!statementNode) {
        return { aliasMap, referencedTables, tableAliases };
    }

    // --- Phase 1: Collect only FROM/JOIN clause nodes from the statement ---
    const FROM_JOIN_TYPES = new Set([
        'from_clause', 'join_clause', 'join',
        'from', 'cross_join', 'natural_join',
    ]);
    const fromJoinNodes = [];

    function collectFromJoinNodes(node) {
        // Don't descend into subqueries — they are a separate scope
        if (node !== statementNode &&
            (node.type === 'subquery' || node.type === 'select' || node.type === 'select_statement')) {
            return;
        }
        if (FROM_JOIN_TYPES.has(node.type)) {
            fromJoinNodes.push(node);
            // Still recurse children because JOIN clauses can contain nested JOINs
        }
        for (let i = 0; i < node.namedChildCount; i++) {
            collectFromJoinNodes(node.namedChild(i));
        }
    }
    collectFromJoinNodes(statementNode);

    // --- Phase 2: Extract tables/aliases only from FROM/JOIN nodes ---
    function extractFromNode(node) {
        // Don't descend into subqueries
        if (node.type === 'subquery' || node.type === 'select' || node.type === 'select_statement') {
            return;
        }

        if (node.type === 'aliased_relation' || node.type === 'alias') {
            const tableNode = node.children.find(c => c.type === 'relation' || c.type === 'object_reference' || c.type === 'identifier');
            let aliasNode = node.children.find(c => c.type === 'identifier' && c !== tableNode);
            
            if (!aliasNode && node.isNamed) {
                aliasNode = node.children[node.children.length - 1]; 
            }

            if (tableNode && aliasNode) {
                const tableName = tableNode.text.replace(/^['"]|['"]$/g, '').toLowerCase();
                const aliasName = aliasNode.text.replace(/^['"]|['"]$/g, '').toLowerCase();
                if (tableName && aliasName && tableName.toLowerCase() !== 'as') {
                     aliasMap[aliasName] = tableName;
                     tableAliases[tableName] = aliasName;
                     referencedTables.add(tableName);
                }
            }
        } else if (node.type === 'relation' || node.type === 'object_reference') {
             const tableName = node.text.replace(/^['"]|['"]$/g, '').toLowerCase();
             referencedTables.add(tableName);
        }

        for (let i = 0; i < node.namedChildCount; i++) {
            extractFromNode(node.namedChild(i));
        }
    }

    fromJoinNodes.forEach(n => extractFromNode(n));

    // --- Phase 3: Regex fallback for when tree-sitter can't find FROM clause nodes ---
    // This happens when the user is still typing (e.g., `SELECT col FROM use|`)
    // and tree-sitter marks the whole statement as ERROR.
    if (referencedTables.size === 0 && statementNode.hasError) {
        const text = statementNode.text;
        const SKIP = new Set(['where','join','left','right','inner','cross','full','on','group','order','having','limit','union','set','natural','using','lateral']);

        // Pattern A: Bare table names — FROM users [AS u]
        const barePattern = /\b(?:FROM|JOIN)\s+(?!SELECT\b)([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?/gi;
        let m;
        while ((m = barePattern.exec(text)) !== null) {
            const tableName = m[1].toLowerCase();
            const alias = m[2] ? m[2].toLowerCase() : null;
            if (SKIP.has(tableName)) continue;
            referencedTables.add(tableName);
            if (alias && !SKIP.has(alias)) {
                aliasMap[alias] = tableName;
                tableAliases[tableName] = alias;
            }
        }

        // Pattern B: Quoted file paths (complete) — FROM 'data.csv' [AS d]
        const quotedPattern = /\b(?:FROM|JOIN)\s+(?:read_\w+\s*\(\s*)?['"]([^'"]+\.[a-z0-9]+)['"]\)?(?:\s*,[^)]*\))?\s*(?:AS\s+)?([a-zA-Z_]\w*)?/gi;
        while ((m = quotedPattern.exec(text)) !== null) {
            const fileName = m[1].toLowerCase();
            const alias = m[2] ? m[2].toLowerCase() : null;
            if (alias && SKIP.has(alias)) {
                referencedTables.add(fileName);
                continue;
            }
            referencedTables.add(fileName);
            if (alias) {
                aliasMap[alias] = fileName;
                tableAliases[fileName] = alias;
            }
        }
    }

    return { aliasMap, referencedTables, tableAliases };
}

/**
 * Regex-based fallback to extract file references and their aliases from raw SQL text.
 * Tree-sitter treats 'file.csv' as a string literal, not a relation, so this function
 * fills the gap for DuckDB's file-based queries (FROM 'file.csv', read_csv_auto, etc.).
 */
const FILE_ALIAS_STOP_WORDS = new Set([
    'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'CROSS', 'FULL', 'ON',
    'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT',
    'SET', 'VALUES', 'SELECT', 'AS', 'AND', 'OR', 'WINDOW', 'QUALIFY',
    'NATURAL', 'USING', 'INTO', 'RETURNING', 'SEMI', 'ANTI', 'POSITIONAL',
    'LATERAL', 'ASOF',
]);

export function extractFileReferences(sqlText) {
    const fileAliasMap = {};      // alias -> filename
    const fileTables = new Set(); // set of filenames
    const fileTableAliases = {};  // filename -> alias

    if (!sqlText) return { fileAliasMap, fileTables, fileTableAliases };

    // Matches: FROM/JOIN [read_xxx(] 'file.ext' [)] [AS] [alias]
    const filePattern = /(?:FROM|JOIN)\s+(?:read_\w+\s*\(\s*)?['"]([^'"]+\.[a-z0-9]+)['"]\)?(?:\s*,[^)]*\))?\s*(?:AS\s+)?([a-zA-Z_]\w*)?/gi;

    let match;
    while ((match = filePattern.exec(sqlText)) !== null) {
        const fileName = match[1].toLowerCase();
        const alias = match[2] ? match[2].toLowerCase() : null;

        // Skip SQL keywords that could be captured as alias
        if (alias && FILE_ALIAS_STOP_WORDS.has(alias.toUpperCase())) {
            fileTables.add(fileName);
            continue;
        }

        fileTables.add(fileName);
        if (alias) {
            fileAliasMap[alias] = fileName;
            fileTableAliases[fileName] = alias;
        }
    }

    return { fileAliasMap, fileTables, fileTableAliases };
}

/**
 * Checks if the cursor is at the right side of a DOT '.'
 * e.g. "alias." or "alias.partial_word"
 * Returns the target alias string or null.
 */
export function isDotAccess(node, position, fullText) {
    let current = node;
    
    // Walk up slightly to see if we're in a field expression (alias.column)
    while (current && current.type !== 'statement' && current.type !== 'select') {
        if (current.type === 'field' || current.type === 'object_reference' || current.type === 'column_reference' || current.type === 'dot_expression') {
            // Check if there is a dot
            const text = current.text;
            if (text.includes('.')) {
                // If it's a field like "u.something", the first child is usually the alias
                const parts = text.split('.');
                if (parts.length >= 2) {
                     return parts[0].replace(/^"|"$/g, '').toLowerCase();
                }
            }
        }
        current = current.parent;
    }
    
    // Heuristic fallback for incomplete typing (where Tree-sitter marks as ERROR)
    // If tree-sitter marks it as error, the node might just be an ERROR node.
    // Let's do a quick regex on the line text up to the cursor.
    const lines = fullText.split('\n');
    if (position.row < lines.length) {
        const lineToCursor = lines[position.row].substring(0, position.column);
        // Match a word followed by a dot, possibly followed by incomplete word
        const match = lineToCursor.match(/\b([a-zA-Z0-9_]+)\.\w*$/);
        if (match) {
            return match[1].toLowerCase();
        }
    }

    return null;
}

/**
 * Quick Regex-based check to see if we are inside a Jinja {{ }} block
 */
export function isJinjaContext(text, cursorOffset) {
    // Find the last {{ and }} before cursor
    const lastOpen = text.lastIndexOf('{{', cursorOffset);
    if (lastOpen === -1) return false;
    
    const lastClose = text.lastIndexOf('}}', cursorOffset);
    // If the last open tag is AFTER the last close tag, we are inside a block
    return lastOpen > lastClose;
}

/**
 * Checks if cursor is in a "clean start" position:
 * empty document, or after a `;` with only whitespace/comments following.
 * Used to show only DDL/DML keywords (SELECT, WITH, CREATE…) without noise.
 */
export function isCleanStart(text, cursorOffset) {
    const textBefore = text.substring(0, cursorOffset).trimEnd();
    // Totally empty editor
    if (textBefore.length === 0) return true;
    // Cursor right after a semicolon (with optional whitespace)
    if (textBefore.endsWith(';')) return true;
    // Check for whitespace-only content after the last semicolon
    const lastSemicolon = textBefore.lastIndexOf(';');
    if (lastSemicolon !== -1) {
        const afterSemi = textBefore.substring(lastSemicolon + 1).trim();
        return afterSemi.length === 0;
    }
    return false;
}
