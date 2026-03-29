/**
 * AmoxSQL AI — Agent Tool Definitions
 * Uses Vercel AI SDK tool format with Zod schemas.
 * 
 * Each tool receives a `context` object injected at runtime containing:
 *   - dbManager: the DuckDB database manager instance
 *   - queryResults: Map<string, object> — accumulated query results for chart references
 */
const { z } = require('zod');
const { tool } = require('ai');
const fs = require('fs');
const path = require('path');

const SQL_TIMEOUT_MS = 30000; // 30 seconds
const MAX_FILE_SIZE = 50 * 1024; // 50KB

/**
 * Creates the complete set of agent tools, filtered by mode.
 * @param {object} context - Runtime context
 * @param {object} context.dbManager - DatabaseManager instance
 * @param {Map} context.queryResults - Map to store query results by ID
 * @param {string} context.projectPath - Project root directory
 * @param {string} [context.mode='diving'] - 'assistant' | 'diving'
 * @returns {object} Tools object for Vercel AI SDK
 */
function createTools(context) {
    const { dbManager, queryResults, projectPath, mode = 'diving' } = context;

    const allTools = {
        /**
         * execute_sql — Executes a SQL query against DuckDB.
         * The agent uses this to run analytical queries.
         */
        execute_sql: tool({
            description: 'Execute a SQL query against the DuckDB database. Use this to analyze data, aggregate metrics, join tables, and answer questions. Always verify column names exist before using them. The query must be valid DuckDB SQL. Queries have a 30-second timeout.',
            inputSchema: z.object({
                query: z.string().describe('The DuckDB SQL query to execute. Must be a valid SELECT statement.'),
            }),
            execute: async ({ query }) => {
                try {
                    if (!query || typeof query !== 'string') {
                        return { error: `Invalid query parameter. Expected a SQL string.` };
                    }
                    const start = performance.now();
                    const result = await Promise.race([
                        dbManager.queryWithMetadata(query),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error(`Query exceeded timeout of ${SQL_TIMEOUT_MS / 1000}s`)), SQL_TIMEOUT_MS)
                        ),
                    ]);
                    const end = performance.now();
                    const executionTime = Math.round(end - start);

                    // Limit data to first 200 rows for context window efficiency
                    const MAX_ROWS = 200;
                    const data = result.rows.length > MAX_ROWS
                        ? result.rows.slice(0, MAX_ROWS)
                        : result.rows;

                    // Generate a unique queryId for chart references
                    const queryId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

                    // Store full result for chart tool to reference
                    queryResults.set(queryId, {
                        query,
                        columns: result.types ? Object.entries(result.types).map(([name, type]) => ({ name, type })) : [],
                        data: result.rows,
                        rowCount: result.rows.length,
                        executionTime,
                    });

                    return {
                        queryId,
                        columns: result.types ? Object.entries(result.types).map(([name, type]) => ({ name, type })) : [],
                        data,
                        rowCount: result.rows.length,
                        executionTime,
                        truncated: result.rows.length > MAX_ROWS,
                    };
                } catch (err) {
                    const errMsg = err?.message || String(err);
                    const isTimeout = errMsg.includes('timeout');
                    return {
                        error: errMsg,
                        hint: isTimeout
                            ? 'The query took too long. Try adding LIMIT, simplifying JOINs, or filtering with WHERE to reduce data volume.'
                            : 'Check that the table and column names exist. Use list_tables or describe_table to verify.',
                    };
                }
            },
        }),

        /**
         * list_tables — Lists all tables available in the current DuckDB database.
         */
        list_tables: tool({
            description: 'List all tables available in the current DuckDB database with their column counts and approximate row counts. Use this first to understand what data is available before writing queries.',
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    // Get tables from information_schema
                    const tables = await dbManager.systemQuery(`
                        SELECT 
                            table_schema,
                            table_name,
                            (SELECT COUNT(*) FROM information_schema.columns c 
                             WHERE c.table_name = t.table_name AND c.table_schema = t.table_schema) as column_count
                        FROM information_schema.tables t
                        WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'amoxsql_ai')
                        AND table_type = 'BASE TABLE'
                        ORDER BY table_schema, table_name
                    `);

                    // Get row counts for each table (can be slow for large tables, so we limit)
                    const tablesWithCounts = [];
                    for (const t of tables.slice(0, 50)) {
                        try {
                            const countRes = await dbManager.systemQuery(
                                `SELECT COUNT(*) as cnt FROM "${t.table_schema}"."${t.table_name}"`
                            );
                            tablesWithCounts.push({
                                schema: t.table_schema,
                                name: t.table_name,
                                columns: t.column_count,
                                rows: countRes[0]?.cnt || 0,
                            });
                        } catch {
                            tablesWithCounts.push({
                                schema: t.table_schema,
                                name: t.table_name,
                                columns: t.column_count,
                                rows: '?',
                            });
                        }
                    }

                    return { tables: tablesWithCounts };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * describe_table — Returns the schema and sample rows of a table.
         */
        describe_table: tool({
            description: 'Get the full schema (column names, types) and a few sample rows from a specific table. Use this to understand the structure and content of a table before writing queries.',
            inputSchema: z.object({
                table_name: z.string().describe('The name of the table to describe. Use just the table name if in the main schema, or "schema.table" for other schemas.'),
            }),
            execute: async ({ table_name }) => {
                try {
                    // Get column info
                    const columns = await dbManager.systemQuery(`DESCRIBE "${table_name}"`);

                    // Get sample rows
                    const sample = await dbManager.systemQuery(`SELECT * FROM "${table_name}" LIMIT 5`);

                    return {
                        table: table_name,
                        columns: columns.map(c => ({
                            name: c.column_name,
                            type: c.column_type,
                            nullable: c.null === 'YES',
                        })),
                        sampleRows: sample,
                    };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * display_chart — Generates a chart configuration to render a visualization.
         * The frontend will use this config to render a chart using ChartRenderer.
         */
        display_chart: tool({
            description: `Generate a chart visualization from a previous query result. You MUST reference a queryId from a previous execute_sql call. Available chart types: bar, bar-stacked, bar-horizontal, line, area, donut, scatter, combo, funnel, heatmap, treemap. Choose the chart type that best represents the data pattern.`,
            inputSchema: z.object({
                query_id: z.string().describe('The queryId from a previous execute_sql result.'),
                chart_type: z.enum([
                    'bar', 'bar-stacked', 'bar-horizontal', 'bar-100',
                    'line', 'area', 'donut',
                    'scatter', 'bubble', 'combo',
                    'funnel', 'heatmap', 'treemap',
                ]).describe('The type of chart to display.'),
                title: z.string().describe('A descriptive title for the chart.'),
                x_axis_key: z.string().describe('The column name to use for the X axis or category dimension.'),
                y_axis_keys: z.array(z.string()).describe('One or more column names to use for the Y axis / values.'),
            }),
            execute: async ({ query_id, chart_type, title, x_axis_key, y_axis_keys }) => {
                // Look up the query result
                const queryResult = queryResults.get(query_id);
                if (!queryResult) {
                    return {
                        error: `Query result '${query_id}' not found. Make sure to call execute_sql first and use the returned queryId.`,
                    };
                }

                // Validate that referenced columns exist
                const availableColumns = queryResult.columns.map(c => c.name);
                const missingX = !availableColumns.includes(x_axis_key);
                const missingY = y_axis_keys.filter(k => !availableColumns.includes(k));

                if (missingX || missingY.length > 0) {
                    return {
                        error: `Column(s) not found in query result. Available: ${availableColumns.join(', ')}`,
                        missingX: missingX ? x_axis_key : null,
                        missingY: missingY.length > 0 ? missingY : null,
                    };
                }

                // Build chart config compatible with ChartRenderer
                const chartConfig = {
                    chartType: chart_type,
                    title,
                    xAxisKey: x_axis_key,
                    yAxisKeys: y_axis_keys,
                    queryId: query_id,
                    // The frontend will use queryId to find the data in the message history
                };

                return {
                    success: true,
                    chartConfig,
                    dataRowCount: queryResult.rowCount,
                };
            },
        }),

        /**
         * read_file — Reads a file from the project directory.
         * Useful for reading SQL files, documentation, CSV headers, etc.
         */
        read_file: tool({
            description: 'Read a text file from the project directory. Use this to read SQL files, documentation, CSV files, or any text file for additional context. Limited to 50KB files.',
            inputSchema: z.object({
                file_path: z.string().describe('Relative path to the file from the project root (e.g., "queries/analysis.sql", "docs/README.md").'),
            }),
            execute: async ({ file_path: filePath }) => {
                try {
                    if (!projectPath) {
                        return { error: 'No project directory available.' };
                    }

                    // Security: prevent path traversal
                    const normalized = path.normalize(filePath);
                    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
                        return { error: 'Invalid path. Use relative paths within the project directory.' };
                    }

                    const fullPath = path.join(projectPath, normalized);
                    const resolvedPath = path.resolve(fullPath);
                    const resolvedProject = path.resolve(projectPath);

                    if (!resolvedPath.startsWith(resolvedProject)) {
                        return { error: 'Path is outside the project directory.' };
                    }

                    if (!fs.existsSync(fullPath)) {
                        return { error: `File not found: ${filePath}` };
                    }

                    const stat = await fs.promises.stat(fullPath);
                    if (stat.isDirectory()) {
                        // Return directory listing instead
                        const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
                        return {
                            type: 'directory',
                            path: filePath,
                            entries: entries.slice(0, 100).map(e => ({
                                name: e.name,
                                isDirectory: e.isDirectory(),
                            })),
                        };
                    }

                    if (stat.size > MAX_FILE_SIZE) {
                        return { error: `File too large (${(stat.size / 1024).toFixed(1)}KB). Limit is ${MAX_FILE_SIZE / 1024}KB.` };
                    }

                    // Check if likely binary
                    const ext = path.extname(fullPath).toLowerCase();
                    const binaryExts = ['.db', '.duckdb', '.sqlite', '.parquet', '.xlsx', '.xls', '.zip', '.gz', '.tar', '.png', '.jpg', '.gif', '.pdf', '.exe', '.dll', '.wasm'];
                    if (binaryExts.includes(ext)) {
                        return { error: `Cannot read binary file (${ext}). Only text files are supported.` };
                    }

                    const content = await fs.promises.readFile(fullPath, 'utf8');
                    const lines = content.split('\n').length;

                    return {
                        path: filePath,
                        content,
                        size: stat.size,
                        lines,
                    };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * build_notebook — Creates a SQL Notebook (.sqlnb) with analysis cells.
         * The user can then open, execute, and expand the notebook.
         */
        build_notebook: tool({
            description: 'Create a SQL Notebook (.sqlnb) file with multiple analysis cells (markdown + SQL code). Use this when the user asks for a comprehensive analysis, report, or exploration that would benefit from being saved as a reusable notebook.',
            inputSchema: z.object({
                title: z.string().describe('The title for the notebook and filename.'),
                cells: z.array(z.object({
                    type: z.enum(['markdown', 'code']).describe('Cell type: "markdown" for explanatory text, "code" for SQL queries.'),
                    content: z.string().describe('The cell content. Markdown text or SQL query.'),
                })).min(2).describe('Array of notebook cells. Start with a markdown cell for context, alternate between markdown and code cells.'),
            }),
            execute: async ({ title, cells }) => {
                try {
                    if (!projectPath) {
                        return { error: 'No project directory available.' };
                    }

                    // Build v3.0 notebook structure
                    const notebookCells = cells.map((cell, i) => ({
                        id: `${Date.now()}_${i}`,
                        type: cell.type,
                        content: cell.content,
                    }));

                    const notebook = {
                        version: '3.0',
                        cells: notebookCells,
                        environment: {},
                    };

                    // Sanitize filename
                    const safeName = title
                        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                        .replace(/\s+/g, '_')
                        .substring(0, 60);
                    const fileName = `${safeName}.sqlnb`;
                    const filePath = path.join(projectPath, fileName);

                    // Avoid overwriting existing files
                    let finalPath = filePath;
                    let counter = 1;
                    while (fs.existsSync(finalPath)) {
                        finalPath = path.join(projectPath, `${safeName}_${counter}.sqlnb`);
                        counter++;
                    }

                    await fs.promises.writeFile(finalPath, JSON.stringify(notebook, null, 2), 'utf8');

                    const relativePath = path.relative(projectPath, finalPath);
                    return {
                        success: true,
                        path: relativePath,
                        cellCount: cells.length,
                        fileName: path.basename(finalPath),
                    };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * suggest_followups — Suggests follow-up questions.
         * This tool STOPS the agent loop (used as the termination signal).
         */
        suggest_followups: tool({
            description: 'After answering the user\'s question, suggest 2-4 relevant follow-up questions they might want to explore next. This should be the LAST tool you call.',
            inputSchema: z.object({
                suggestions: z.array(z.string()).min(2).max(4)
                    .describe('Array of 2-4 follow-up question suggestions based on the analysis.'),
            }),
            execute: async ({ suggestions }) => {
                return { suggestions };
            },
        }),
    };

    // ─── Mode-specific tools ───

    // Assistant-only tools: edit active file and update chart config
    if (mode === 'assistant') {
        allTools.edit_file = tool({
            description: 'Replace the content of the currently active SQL file or notebook in the editor. Use when the user asks you to fix, improve, rewrite, or modify their query or notebook. The changes will be applied to the active editor tab without writing to disk — the user can review, undo, or save.',
            inputSchema: z.object({
                content: z.string().describe('The complete new content for the file.'),
                description: z.string().describe('Brief description of what was changed.'),
            }),
            execute: async ({ content, description: desc }) => {
                return { success: true, content, description: desc, action: 'edit_file' };
            },
        });

        allTools.update_chart_config = tool({
            description: 'Update the chart configuration for the current visualization. Use when the user asks to change chart type, colors, axes, labels, formatting, or any visual property. The changes will be merged into the active chart config.',
            inputSchema: z.object({
                changes: z.record(z.any()).describe('Object with chart config properties to change. Valid keys include: chartType, xAxisKey, yAxisKeys, colorTheme, chartTitle, chartSubtitle, showLabels, dataLabelPosition, numberFormat, gridMode, lineType, barRadius, donutThickness, legendPosition, and many more.'),
                explanation: z.string().describe('Brief explanation of the visual changes.'),
            }),
            execute: async ({ changes, explanation }) => {
                return { success: true, changes, explanation, action: 'update_chart_config' };
            },
        });

        // Assistant doesn't get build_notebook
        delete allTools.build_notebook;
    }

    // Vault tool — available in both modes
    allTools.save_to_vault = tool({
        description: 'Save an important analysis or query to the vault for permanent reference. Use when the user wants to bookmark, archive, or save a query/analysis for future reference. The vault persists even if files are deleted.',
        inputSchema: z.object({
            title: z.string().describe('A descriptive title for the saved analysis.'),
            description: z.string().optional().describe('Optional longer description of the analysis.'),
            sql_content: z.string().describe('The SQL query or content to save.'),
            tags: z.array(z.string()).optional().describe('Optional tags for categorization (e.g., ["performance", "sales"]).'),
        }),
        execute: async ({ title, description: desc, sql_content, tags }) => {
            try {
                const aiPersistence = require('./persistence');
                const entry = await aiPersistence.saveToVault(dbManager, {
                    title,
                    description: desc,
                    sqlContent: sql_content,
                    tags: tags ? tags.join(',') : null,
                });
                return { success: true, id: entry.id, title };
            } catch (err) {
                return { error: err?.message || String(err) };
            }
        },
    });

    return allTools;
}

module.exports = { createTools };
