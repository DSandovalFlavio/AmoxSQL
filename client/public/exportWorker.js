/**
 * Off-Main-Thread Data Serializer Worker
 * 
 * Prevents UI freezing by handling massive string concatenations and 
 * data parsing loops in an isolated background thread.
 */

self.onmessage = function (e) {
    const { action, id, data, columns, tableName } = e.data;

    try {
        let result = null;

        if (action === 'exportCSV') {
            result = processCSV(data, columns);
        } else if (action === 'exportJSON') {
            result = processJSON(data);
        } else if (action === 'exportSQL') {
            result = processSQL(data, columns, tableName);
        } else {
            throw new Error(`Unknown worker action: ${action}`);
        }

        // Send success back to main thread
        self.postMessage({ id, status: 'success', result });

    } catch (err) {
        // Send error back to main thread
        self.postMessage({ id, status: 'error', error: err.message });
    }
};

/**
 * High-performance CSV Serializer
 */
function processCSV(data, columns) {
    if (!data || data.length === 0) return '';

    // Header
    let csv = columns.join(',') + '\n';

    // Rows
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        let line = '';
        for (let j = 0; j < columns.length; j++) {
            let val = row[columns[j]];

            // Handle null/undefined
            if (val === null || val === undefined) {
                val = '';
            } else {
                // Escape quotes and wrap in quotes if contains comma
                val = String(val);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = `"${val.replace(/"/g, '""')}"`;
                }
            }

            line += val;
            if (j < columns.length - 1) line += ',';
        }
        csv += line + '\n';
    }

    return csv;
}

/**
 * Standard JSON Stringifier
 * (Browsers already optimize this natively, but moving it off-thread prevents frame dropping on megabyte payloads)
 */
function processJSON(data) {
    return JSON.stringify(data, null, 2);
}

/**
 * SQL INSERT Generator
 */
function processSQL(data, columns, tableName = 'ExportedTable') {
    if (!data || data.length === 0) return '';

    const safeCols = columns.map(c => `"${c}"`).join(', ');
    let sql = `-- Exported from AmoxSQL\n`;
    sql += `CREATE TABLE IF NOT EXISTS "${tableName}" (${columns.map(c => `"${c}" VARCHAR`).join(', ')});\n\n`;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const vals = columns.map(c => {
            let val = row[c];
            if (val === null || val === undefined) return 'NULL';
            // Escape single quotes
            val = String(val).replace(/'/g, "''");
            return `'${val}'`;
        }).join(', ');

        sql += `INSERT INTO "${tableName}" (${safeCols}) VALUES (${vals});\n`;
    }

    return sql;
}
