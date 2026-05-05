/**
 * chainValidation — Client-side validation rules for chain nodes.
 * Returns errors (block execution) and warnings (informational).
 */

/**
 * Validate a single node given the current edges.
 * @param {object} node - React Flow node with data.nodeType and data.config
 * @param {array} edges - All edges in the chain
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateNode(node, edges = []) {
    const type = node.data?.nodeType || node.type;
    const config = node.data?.config || {};
    const errors = [];
    const warnings = [];

    const inEdges = edges.filter(e => e.target === node.id);
    const hasUpstream = inEdges.length > 0;

    switch (type) {
        case 'import_file': {
            if (!config.sourcePath?.trim()) errors.push('Source file path is required');
            if (!config.tableName?.trim()) warnings.push('Table name is empty — will default to "imported_data"');
            if (config.fileType === 'xlsx' || config.fileType === 'excel') {
                warnings.push('Excel import requires the spatial DuckDB extension (auto-installed on first use)');
            }
            break;
        }

        case 'import_folder': {
            if (!config.folderPath?.trim()) errors.push('Folder path is required');
            if (!config.tableName?.trim()) warnings.push('Table name is empty — will default to "imported_data"');
            break;
        }

        case 'export_file': {
            if (!config.outputPath?.trim()) errors.push('Output file path is required');
            if (!config.format) errors.push('Output format is required (csv, parquet, xlsx, json)');
            if (!config.query?.trim() && !hasUpstream) {
                errors.push('No upstream node connected and no manual query — nothing to export');
            }
            if (config.format === 'xlsx' || config.format === 'excel') {
                warnings.push('Excel export requires the spatial DuckDB extension (auto-installed on first use)');
            }
            break;
        }

        case 'sql_file': {
            if (!config.filePath?.trim()) errors.push('SQL file path is required — select or create a .sql file');
            break;
        }

        case 'sql_inline': {
            if (!config.query?.trim()) errors.push('SQL query is required');
            break;
        }

        case 'table_ref': {
            if (!config.tableName?.trim()) errors.push('Table name is required');
            break;
        }

        case 'create_table': {
            if (!config.tableName?.trim()) errors.push('Target table name is required');
            if (!config.query?.trim() && !hasUpstream) {
                errors.push('No upstream node connected and no manual query');
            }
            break;
        }

        case 'filter': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            const conditions = config.conditions || [];
            if (conditions.length === 0) errors.push('At least one filter condition is required');
            for (const c of conditions) {
                if (!c.column?.trim()) errors.push('Each condition must have a column name');
                if (!c.operator) errors.push('Each condition must have an operator');
                if (!['IS NULL', 'IS NOT NULL'].includes(c.operator) && !c.value?.toString().trim()) {
                    warnings.push(`Condition on "${c.column}" has an empty value`);
                }
            }
            break;
        }

        case 'select_columns': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.columns?.length) errors.push('At least one column must be selected');
            break;
        }

        case 'add_column': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.newColumns?.length) errors.push('At least one column definition is required');
            for (const c of (config.newColumns || [])) {
                if (!c.name?.trim()) errors.push('Each new column must have a name');
                if (!c.expression?.trim()) errors.push(`Column "${c.name || '?'}": expression is required`);
            }
            break;
        }

        case 'group_aggregate': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.aggregations?.length) errors.push('At least one aggregation is required');
            break;
        }

        case 'join_tables': {
            if (inEdges.length < 2) errors.push('Join requires exactly 2 upstream connections (left and right table)');
            if (!config.leftKey?.trim()) errors.push('Left table key column is required');
            if (!config.rightKey?.trim()) errors.push('Right table key column is required');
            break;
        }

        case 'merge_tables': {
            if (inEdges.length < 2) warnings.push('Typically merge tables needs 2+ upstream sources');
            if (!config.tableName?.trim()) warnings.push('Result table name is empty');
            break;
        }

        case 'deduplicate': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            break;
        }

        case 'sort': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.sortColumns?.length) errors.push('At least one sort column is required');
            break;
        }

        case 'pivot': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.groupColumn?.trim()) errors.push('Group column is required');
            if (!config.pivotColumn?.trim()) errors.push('Pivot column is required');
            if (!config.valueColumn?.trim()) errors.push('Value column is required');
            break;
        }

        case 'rename_table': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.newName?.trim()) errors.push('New table name is required');
            break;
        }

        case 'type_cast': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.casts?.length) errors.push('At least one cast operation is required');
            for (const c of (config.casts || [])) {
                if (!c.column?.trim()) errors.push('Each cast must specify a source column');
                if (!c.targetType?.trim()) errors.push(`Cast for "${c.column || '?'}": target type is required`);
            }
            break;
        }

        case 'window_functions': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.windows?.length) errors.push('At least one window function is required');
            for (const w of (config.windows || [])) {
                if (!w.func?.trim()) errors.push('Each window function must have a function name');
                if (!w.alias?.trim()) warnings.push('Window function has no alias — a default will be generated');
            }
            break;
        }

        case 'unpivot': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.valueColumns?.length) errors.push('At least one value column is required');
            if (!config.nameColumn?.trim()) warnings.push('Name column is empty — will default to "variable"');
            if (!config.valueColumn?.trim()) warnings.push('Value column is empty — will default to "value"');
            break;
        }

        case 'http_fetch': {
            if (!config.url?.trim()) errors.push('URL is required');
            else if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) {
                errors.push('URL must start with http:// or https://');
            }
            if (!config.tableName?.trim()) warnings.push('Table name is empty — will default to "fetched_data"');
            warnings.push('HTTP Fetch requires the httpfs DuckDB extension (auto-installed on first use)');
            break;
        }

        case 'clean': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.operations?.length) errors.push('At least one cleaning operation is required');
            for (const op of (config.operations || [])) {
                if (!op.column?.trim()) errors.push('Each operation must specify a column');
                if (!op.type) errors.push('Each operation must have a type (trim, lower, replace, etc.)');
            }
            break;
        }

        case 'schema_validation': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.expectedColumns?.length) errors.push('At least one expected column is required');
            break;
        }

        case 'assert': {
            if (!hasUpstream && !config.tableName?.trim()) {
                errors.push('No upstream connection and no table name specified');
            }
            if (config.assertType === 'custom_query' && !config.query?.trim()) {
                errors.push('Custom query assertion requires a SQL query');
            }
            if (['no_nulls', 'unique'].includes(config.assertType) && !config.column?.trim()) {
                errors.push(`"${config.assertType}" assertion requires a column name`);
            }
            break;
        }

        case 'notification': {
            if (!config.message?.trim()) warnings.push('Message is empty');
            if (config.notifType === 'webhook' && !config.webhookUrl?.trim()) {
                errors.push('Webhook notification requires a URL');
            }
            if (config.notifType === 'log_file' && !config.logFilePath?.trim()) {
                errors.push('Log file notification requires a file path');
            }
            break;
        }

        case 'sample': {
            if (!hasUpstream) errors.push('No upstream data source connected');
            if (!config.sampleValue) errors.push('Sample value is required');
            break;
        }

        case 'checkpoint':
            // No required fields
            break;

        default:
            break;
    }

    return { errors, warnings };
}

/**
 * Validate all nodes in a chain.
 * @returns {{ nodeId: { errors, warnings } }}
 */
export function validateChain(nodes, edges) {
    const results = {};
    for (const node of nodes) {
        const result = validateNode(node, edges);
        if (result.errors.length > 0 || result.warnings.length > 0) {
            results[node.id] = result;
        }
    }
    return results;
}

/**
 * Count total blocking errors across all nodes.
 */
export function countErrors(validationResults) {
    return Object.values(validationResults).reduce((sum, r) => sum + r.errors.length, 0);
}

/**
 * Count total warnings across all nodes.
 */
export function countWarnings(validationResults) {
    return Object.values(validationResults).reduce((sum, r) => sum + r.warnings.length, 0);
}
