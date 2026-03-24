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

/**
 * Creates the complete set of agent tools.
 * @param {object} context - Runtime context
 * @param {object} context.dbManager - DatabaseManager instance
 * @param {Map} context.queryResults - Map to store query results by ID
 * @returns {object} Tools object for Vercel AI SDK
 */
function createTools(context) {
    const { dbManager, queryResults } = context;

    return {
        /**
         * execute_sql — Executes a SQL query against DuckDB.
         * The agent uses this to run analytical queries.
         */
        execute_sql: tool({
            description: 'Execute a SQL query against the DuckDB database. Use this to analyze data, aggregate metrics, join tables, and answer questions. Always verify column names exist before using them. The query must be valid DuckDB SQL.',
            parameters: z.object({
                query: z.string().describe('The DuckDB SQL query to execute. Must be a valid SELECT statement.'),
            }),
            execute: async ({ query }) => {
                try {
                    const start = performance.now();
                    const result = await dbManager.queryWithMetadata(query);
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
                    return {
                        error: err.message,
                        hint: 'Check that the table and column names exist. Use list_tables or describe_table to verify.',
                    };
                }
            },
        }),

        /**
         * list_tables — Lists all tables available in the current DuckDB database.
         */
        list_tables: tool({
            description: 'List all tables available in the current DuckDB database with their column counts and approximate row counts. Use this first to understand what data is available before writing queries.',
            parameters: z.object({}),
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
                    return { error: err.message };
                }
            },
        }),

        /**
         * describe_table — Returns the schema and sample rows of a table.
         */
        describe_table: tool({
            description: 'Get the full schema (column names, types) and a few sample rows from a specific table. Use this to understand the structure and content of a table before writing queries.',
            parameters: z.object({
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
                    return { error: err.message };
                }
            },
        }),

        /**
         * display_chart — Generates a chart configuration to render a visualization.
         * The frontend will use this config to render a chart using ChartRenderer.
         */
        display_chart: tool({
            description: `Generate a chart visualization from a previous query result. You MUST reference a queryId from a previous execute_sql call. Available chart types: bar, bar-stacked, bar-horizontal, line, area, donut, scatter, combo, funnel, heatmap, treemap. Choose the chart type that best represents the data pattern.`,
            parameters: z.object({
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
         * suggest_followups — Suggests follow-up questions.
         * This tool STOPS the agent loop (used as the termination signal).
         */
        suggest_followups: tool({
            description: 'After answering the user\'s question, suggest 2-4 relevant follow-up questions they might want to explore next. This should be the LAST tool you call.',
            parameters: z.object({
                suggestions: z.array(z.string()).min(2).max(4)
                    .describe('Array of 2-4 follow-up question suggestions based on the analysis.'),
            }),
            execute: async ({ suggestions }) => {
                return { suggestions };
            },
        }),
    };
}

module.exports = { createTools };
