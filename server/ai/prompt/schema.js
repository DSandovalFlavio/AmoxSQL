/**
 * Schema section builders for the system prompt.
 * Formats table and file context into human-readable schema strings.
 */

function formatTableSchemas(tables) {
    if (!tables || tables.length === 0) return 'No tables available.';
    return tables.map(t => {
        const cols = t.columns
            ? t.columns.map(c => `  ${c.name} ${c.type}`).join('\n')
            : '  (schema unknown)';
        const rowInfo = t.rows !== undefined ? ` — ${t.rows} rows` : '';
        return `TABLE "${t.name}"${rowInfo}\n${cols}`;
    }).join('\n\n');
}

function formatFileSchemas(files) {
    if (!files || files.length === 0) return '';
    return '\n\n## Files Available as Context\n' + files.map(f => {
        const cols = f.columns
            ? f.columns.map(c => `  ${c.name} ${c.type}`).join('\n')
            : '  (schema unknown)';
        const rowInfo = f.rowCount != null ? ` — ~${f.rowCount} rows` : '';
        let text = `FILE "${f.name}" (path: ${f.path})${rowInfo}\n${cols}`;
        if (f.sampleRows && f.sampleRows.length > 0) {
            const colNames = f.columns ? f.columns.map(c => c.name) : Object.keys(f.sampleRows[0] || {});
            if (colNames.length > 0) {
                text += '\nSample data:';
                for (const row of f.sampleRows.slice(0, 3)) {
                    const vals = colNames.map(c => {
                        const v = row[c];
                        return v === null || v === undefined ? 'NULL' : String(v).substring(0, 60);
                    });
                    text += `\n  | ${vals.join(' | ')} |`;
                }
            }
        }
        return text;
    }).join('\n\n');
}

function formatTableSchemasCompact(tables) {
    if (!tables || tables.length === 0) return 'No tables.';
    return tables.map(t => {
        const cols = t.columns ? t.columns.map(c => c.name).join(', ') : '?';
        return `"${t.name}": ${cols}`;
    }).join('\n');
}

function formatFileSchemasCompact(files) {
    if (!files || files.length === 0) return '';
    return '\n\n## Files\n' + files.map(f => {
        const cols = f.columns ? f.columns.map(c => c.name).join(', ') : '(unknown)';
        return `"${f.name}" (${f.path}): ${cols}`;
    }).join('\n');
}

module.exports = {
    formatTableSchemas,
    formatFileSchemas,
    formatTableSchemasCompact,
    formatFileSchemasCompact,
};
