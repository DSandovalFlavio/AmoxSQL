/**
 * AmoxSQL AI — Prompt-Only Mode for Low-Tier Models
 * 
 * For models that don't reliably support tool calling (< 3B params),
 * this module provides an alternative approach:
 * 
 * 1. Auto-reads schema from dragged files/tables
 * 2. Assigns simple virtual table names the LLM can reference easily
 * 3. Injects schemas as context in the system prompt
 * 4. Extracts SQL from the LLM's text response (```sql blocks)
 * 5. Intercepts virtual table names and replaces with real file paths
 * 6. Executes the corrected SQL via DuckDB
 * 7. Re-injects results into the conversation for the LLM to summarize
 * 
 * This allows even 1-2B models to work effectively for data analysis.
 */

/**
 * File extension to DuckDB read function mapping.
 */
const READ_FUNCTIONS = {
    '.csv': 'read_csv_auto',
    '.tsv': 'read_csv_auto',
    '.json': 'read_json_auto',
    '.jsonl': 'read_json_auto',
    '.ndjson': 'read_json_auto',
    '.parquet': 'read_parquet',
    '.xlsx': 'read_xlsx',
    '.xls': 'read_xlsx',
};

/**
 * Generates a simple virtual table name from a filename.
 * e.g., "ventas_2024.csv" → "ventas_2024"
 * e.g., "Sales Data (2).xlsx" → "sales_data_2"
 */
function generateVirtualName(filename) {
    // Determine the read function based on the extension to wrap the filename natively
    const ext = (filename.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    let readFn = 'read_csv_auto';
    if (ext === '.parquet') readFn = 'read_parquet';
    else if (ext === '.json' || ext === '.jsonl') readFn = 'read_json_auto';
    else if (ext === '.xlsx' || ext === '.xls') readFn = 'read_xlsx';
    
    // Return e.g. "read_csv_auto('dataset.csv')"
    // This looks like a valid table to the LLM and creates correct syntax in the markdown text
    return `${readFn}('${filename}')`;
}

/**
 * Determines the DuckDB read function for a file path.
 */
function getReadFunction(filePath) {
    const ext = (filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    return READ_FUNCTIONS[ext] || 'read_csv_auto';
}

/**
 * Builds a virtual-to-real mapping for context files and tables.
 * 
 * @param {Array} files - File context objects [{name, path, columns, sampleRows}]
 * @param {Array} tables - Table context objects [{name, schema, columns, rows}]
 * @returns {object} { virtualMap: Map<virtualName, {type, realRef, name}>, schemaText: string }
 */
function buildVirtualMapping(files, tables) {
    const virtualMap = new Map();
    let schemaText = '';

    // Map tables (these can be referenced directly by name)
    if (tables && tables.length > 0) {
        schemaText += '## Available Tables\n';
        for (const t of tables) {
            const vName = t.name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '_');
            virtualMap.set(vName, {
                type: 'table',
                realRef: `"${t.name}"`,
                name: t.name,
            });
            // Also map the original name in case LLM uses it
            virtualMap.set(t.name.toLowerCase(), {
                type: 'table',
                realRef: `"${t.name}"`,
                name: t.name,
            });

            const cols = t.columns
                ? t.columns.map(c => `  - ${c.name} (${c.type})`).join('\n')
                : '  (unknown columns)';
            const rowInfo = t.rows != null ? ` [${t.rows} rows]` : '';
            schemaText += `\nTable: ${vName}${rowInfo}\n${cols}\n`;
        }
    }

    // Map files to virtual table names
    if (files && files.length > 0) {
        schemaText += '\n## Available Files (use as table names)\n';
        for (const f of files) {
            const vName = generateVirtualName(f.name);
            const readFn = getReadFunction(f.path || f.name);

            virtualMap.set(vName, {
                type: 'file',
                realRef: `${readFn}('${f.path}')`,
                name: f.name,
                readFn,
                path: f.path,
            });

            const cols = f.columns
                ? f.columns.map(c => `  - ${c.name} (${c.type})`).join('\n')
                : '  (unknown columns)';
            const rowInfo = f.rowCount != null ? ` [~${f.rowCount} rows]` : '';
            schemaText += `\nTable: ${vName}${rowInfo}\n${cols}\n`;

            // Include sample row if available
            if (f.sampleRows && f.sampleRows.length > 0) {
                const colNames = f.columns ? f.columns.map(c => c.name) : Object.keys(f.sampleRows[0] || {});
                schemaText += 'Sample:\n';
                for (const row of f.sampleRows.slice(0, 2)) {
                    const vals = colNames.map(c => {
                        const v = row[c];
                        return v == null ? 'NULL' : String(v).substring(0, 40);
                    });
                    schemaText += `  ${vals.join(' | ')}\n`;
                }
            }
        }
    }

    return { virtualMap, schemaText };
}

/**
 * Extracts SQL code blocks from LLM response text.
 * Looks for ```sql ... ``` blocks.
 * 
 * @param {string} text - The LLM's response text
 * @returns {Array<string>} Array of extracted SQL strings
 */
function extractSqlBlocks(text) {
    if (!text) return [];

    const blocks = [];
    const regex = /```sql\s*\n?([\s\S]*?)```/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const sql = match[1].trim();
        if (sql) blocks.push(sql);
    }

    // Fallback: if no fenced blocks found, try to find standalone SELECT statements
    if (blocks.length === 0) {
        const selectRegex = /\b(SELECT\s[\s\S]*?)(;|\n\n|$)/gi;
        while ((match = selectRegex.exec(text)) !== null) {
            const sql = match[1].trim();
            if (sql.length > 10) blocks.push(sql);
        }
    }

    return blocks;
}

/**
 * Replaces virtual table names in SQL with real DuckDB references.
 * 
 * @param {string} sql - The SQL query from the LLM
 * @param {Map} virtualMap - Map of virtual names to real references
 * @returns {string} Corrected SQL with real file paths / table references
 */
function interceptTableNames(sql, virtualMap) {
    if (!sql || !virtualMap || virtualMap.size === 0) return sql;

    let corrected = sql;

    // Sort by length descending to avoid partial matches
    const entries = [...virtualMap.entries()].sort((a, b) => b[0].length - a[0].length);

    for (const [vName, info] of entries) {
        // vName is likely "read_csv_auto('dataset.csv')"
        // Small LLMs might truncate this to just "read_csv_auto"
        const baseName = vName.split('(')[0];
        
        // We match either the full vName or just the baseName (if truncated)
        const vEsc = escapeRegex(vName);
        const baseEsc = escapeRegex(baseName);
        const matchPattern = `(?:${vEsc}|${baseEsc})`;

        const patterns = [
            new RegExp(`\\bFROM\\s+["'\`]?${matchPattern}["'\`]?(?:\\([^\\)]*\\))?(?!\\w)`, 'gi'),
            new RegExp(`\\bJOIN\\s+["'\`]?${matchPattern}["'\`]?(?:\\([^\\)]*\\))?(?!\\w)`, 'gi'),
            new RegExp(`\\bINTO\\s+["'\`]?${matchPattern}["'\`]?(?:\\([^\\)]*\\))?(?!\\w)`, 'gi'),
            new RegExp(`\\bTABLE\\s+["'\`]?${matchPattern}["'\`]?(?:\\([^\\)]*\\))?(?!\\w)`, 'gi'),
        ];

        for (const pattern of patterns) {
            corrected = corrected.replace(pattern, (match) => {
                const keyword = match.split(/\s+/)[0]; // FROM, JOIN, etc.
                return `${keyword} ${info.realRef}`;
            });
        }
    }

    return corrected;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats a DuckDB query result for injection back into the conversation.
 * Keeps it concise for small model context budgets.
 * 
 * @param {Array} rows - Query result rows
 * @param {number} maxRows - Max rows to include (default: 20)
 * @returns {string} Formatted result text
 */
function formatResultForContext(rows, maxRows = 20) {
    if (!rows || rows.length === 0) return 'No results returned.';

    const cols = Object.keys(rows[0]);
    const displayRows = rows.slice(0, maxRows);

    let text = `Results (${rows.length} rows):\n`;
    text += cols.join(' | ') + '\n';
    text += cols.map(() => '---').join(' | ') + '\n';

    for (const row of displayRows) {
        text += cols.map(c => {
            const v = row[c];
            return v == null ? 'NULL' : String(v).substring(0, 30);
        }).join(' | ') + '\n';
    }

    if (rows.length > maxRows) {
        text += `... and ${rows.length - maxRows} more rows`;
    }

    return text;
}

module.exports = {
    generateVirtualName,
    getReadFunction,
    buildVirtualMapping,
    extractSqlBlocks,
    interceptTableNames,
    formatResultForContext,
    READ_FUNCTIONS,
};
