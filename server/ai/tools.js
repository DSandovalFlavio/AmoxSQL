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
 * @param {Map} context.queryResults - In-memory Map (still used as fast local cache)
 * @param {string} context.projectPath - Project root directory
 * @param {string} [context.mode='diving'] - 'assistant' | 'diving'
 * @param {string} [context.conversationId] - Active conversation ID for persistent query cache
 * @param {object} [context.aiPersistence] - Persistence layer for query_cache writes
 * @returns {object} Tools object for Vercel AI SDK
 */
function createTools(context) {
    const {
        dbManager, queryResults, projectPath, mode = 'diving',
        conversationId = null, aiPersistence = null,
        activePlan = null,   // shared mutable ref { id, goal, steps[] } for planner tools
        enablePlanner = false,
    } = context;

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

                    const columns = result.types
                        ? Object.entries(result.types).map(([name, type]) => ({ name, type }))
                        : [];

                    const cacheEntry = {
                        query,
                        columns,
                        data: result.rows,
                        rowCount: result.rows.length,
                        executionTime,
                    };

                    // Store in fast in-memory Map for same-session chart references.
                    // LRU cap kept for safety but the persistent cache is the source of truth.
                    if (queryResults.size >= 50) {
                        queryResults.delete(queryResults.keys().next().value);
                    }
                    queryResults.set(queryId, cacheEntry);

                    // Persist to DuckDB query_cache so queryIds survive context compaction
                    // and long sessions (fire-and-forget — never blocks the response).
                    if (aiPersistence) {
                        aiPersistence.saveQueryCache(dbManager, {
                            queryId,
                            conversationId,
                            sqlQuery: query,
                            columns,
                            data: result.rows,
                            rowCount: result.rows.length,
                            execMs: executionTime,
                        }).then(() => {
                            if (conversationId) {
                                aiPersistence.pruneQueryCache(dbManager, conversationId, 100).catch(() => {});
                            }
                        }).catch(e => console.warn('[Tools] query_cache write failed:', e.message));
                    }

                    return {
                        queryId,
                        columns,
                        data,
                        rowCount: result.rows.length,
                        executionTime,
                        truncated: result.rows.length > MAX_ROWS,
                    };
                } catch (err) {
                    const errMsg = err?.message || String(err);
                    const msg = errMsg.toLowerCase();
                    let hint;
                    if (msg.includes('timeout')) {
                        hint = 'Query took too long. Add LIMIT, simplify JOINs, or filter with WHERE. For large files, use USING SAMPLE 10%.';
                    } else if (msg.includes('already exists')) {
                        hint = 'Object already exists. Use CREATE OR REPLACE TABLE/VIEW, or DROP it first: DROP TABLE IF EXISTS "name".';
                    } else if (msg.includes('column') && (msg.includes('not found') || msg.includes('does not exist') || msg.includes('unknown'))) {
                        hint = 'Column not found. Call describe_table to verify exact column names — they are case-sensitive.';
                    } else if (msg.includes('does not exist') || msg.includes('not found') || msg.includes('table') && msg.includes('missing')) {
                        hint = 'Table/view not found. Call list_tables to see available objects, or use attach_file to register a CSV/Parquet/JSON file.';
                    } else if (msg.includes('binder') || msg.includes('parser') || msg.includes('syntax')) {
                        hint = 'SQL syntax error. Check quoting: use double quotes for identifiers ("column name") and single quotes for strings (\'value\').';
                    } else {
                        hint = 'Check that table and column names exist. Use list_tables or describe_table to verify.';
                    }
                    return { error: errMsg, hint };
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
                        WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains')
                        AND NOT (table_schema = 'main' AND table_name IN ('amox_query_history'))
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
                // Look up in fast in-memory Map first, then fall back to persistent cache.
                let queryResult = queryResults.get(query_id);
                if (!queryResult && aiPersistence) {
                    const cached = await aiPersistence.getQueryCache(dbManager, query_id);
                    if (cached) {
                        queryResult = {
                            query: cached.sql_query,
                            columns: cached.columns_info || [],
                            data: cached.data || [],
                            rowCount: cached.row_count || 0,
                            executionTime: cached.exec_ms || 0,
                        };
                        // Warm back into in-memory Map for subsequent calls
                        queryResults.set(query_id, queryResult);
                    }
                }
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
         * list_workspace_files — Lists files in the project directory.
         * Lets the agent discover available data files without prior user attachment.
         */
        list_workspace_files: tool({
            description: 'List files in the project workspace directory. Use this to discover what data files (CSV, Parquet, Excel, JSON) or SQL files are available, then use attach_file to register the data files you need. Returns file names, sizes, and types.',
            inputSchema: z.object({
                sub_path: z.string().optional().describe('Optional subdirectory relative to the project root (e.g. "data", "exports"). Defaults to the project root.'),
                extensions: z.array(z.string()).optional().describe('Filter by extensions (e.g. [".csv", ".parquet"]). Defaults to common data and query file types.'),
            }),
            execute: async ({ sub_path: subPath = '', extensions }) => {
                try {
                    if (!projectPath) return { error: 'No project directory available.' };

                    const DEFAULT_EXTS = ['.csv', '.tsv', '.json', '.jsonl', '.parquet', '.xlsx', '.xls', '.sql', '.sqlnb', '.txt', '.md'];
                    const allowedExts = new Set(
                        (extensions || DEFAULT_EXTS).map(e => e.toLowerCase().replace(/^\.?/, '.'))
                    );

                    // Security: prevent path traversal
                    const normalizedSub = path.normalize(subPath || '');
                    if (normalizedSub.startsWith('..') || path.isAbsolute(normalizedSub)) {
                        return { error: 'Invalid path. Use relative paths within the project directory.' };
                    }
                    const targetDir = path.join(projectPath, normalizedSub);
                    if (!path.resolve(targetDir).startsWith(path.resolve(projectPath))) {
                        return { error: 'Path is outside the project directory.' };
                    }

                    if (!fs.existsSync(targetDir)) {
                        return { error: `Directory not found: ${subPath || '(project root)'}` };
                    }

                    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
                    const files = [];
                    const subdirs = [];

                    for (const entry of entries) {
                        if (entry.name.startsWith('.')) continue; // skip hidden
                        if (entry.isDirectory()) {
                            subdirs.push(entry.name);
                        } else {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (!allowedExts.has(ext)) continue;
                            const fullPath = path.join(targetDir, entry.name);
                            const stat = await fs.promises.stat(fullPath);
                            const relPath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
                            files.push({
                                name:      entry.name,
                                path:      relPath,
                                ext,
                                size_kb:   +(stat.size / 1024).toFixed(1),
                                modified:  stat.mtime.toISOString().slice(0, 10),
                                attachable: ['.csv','.tsv','.json','.jsonl','.parquet','.xlsx','.xls'].includes(ext),
                            });
                        }
                    }

                    files.sort((a, b) => b.size_kb - a.size_kb);

                    return {
                        directory:  subPath || '(project root)',
                        file_count: files.length,
                        files,
                        subdirectories: subdirs.slice(0, 20),
                        tip: files.some(f => f.attachable)
                            ? 'Use attach_file with the "path" field to register data files as queryable views.'
                            : undefined,
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
         * attach_file — Registers a file as a DuckDB view.
         * Solves the path-invention problem: agent calls this once with the full
         * path from context, then queries the returned view name like a table.
         */
        attach_file: tool({
            description: 'Register a CSV, JSON, Parquet, or Excel file as a DuckDB view so you can query it with SELECT statements. Call this FIRST whenever a file appears in the context before using execute_sql on it. Returns the view name to use in subsequent queries.',
            inputSchema: z.object({
                file_path: z.string().describe('The absolute path to the file (use the path shown in the Files context section of the system prompt).'),
                alias: z.string().optional().describe('Optional short name for the view (letters, digits, underscores only). If omitted, derived from the filename.'),
            }),
            execute: async ({ file_path: filePath, alias }) => {
                try {
                    const ext = path.extname(filePath).toLowerCase();
                    const baseName = path.basename(filePath, ext);
                    const viewName = (alias
                        ? alias
                        : baseName
                    ).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1').substring(0, 60) || 'attached_file';

                    // Escape single quotes in path for SQL
                    const safePath = filePath.replace(/'/g, "''");

                    let readerExpr;
                    switch (ext) {
                        case '.csv':
                        case '.tsv':
                        case '.txt':
                            readerExpr = `read_csv_auto('${safePath}')`;
                            break;
                        case '.json':
                        case '.jsonl':
                        case '.ndjson':
                            readerExpr = `read_json_auto('${safePath}')`;
                            break;
                        case '.parquet':
                            readerExpr = `read_parquet('${safePath}')`;
                            break;
                        case '.xlsx':
                        case '.xls':
                            readerExpr = `read_xlsx('${safePath}')`;
                            break;
                        default:
                            readerExpr = `read_csv_auto('${safePath}')`;
                    }

                    // DuckDB requires DROP before CREATE OR REPLACE when switching types.
                    // Both drops are wrapped in try-catch because DROP TABLE throws on VIEWs
                    // and vice-versa (DuckDB doesn't silently skip wrong-type drops).
                    try { await dbManager.systemQuery(`DROP TABLE IF EXISTS "${viewName}"`); } catch (_) {}
                    try { await dbManager.systemQuery(`DROP VIEW IF EXISTS "${viewName}"`); } catch (_) {}
                    await dbManager.systemQuery(
                        `CREATE VIEW "${viewName}" AS SELECT * FROM ${readerExpr}`
                    );

                    // Get schema + row count
                    const columns = await dbManager.systemQuery(`DESCRIBE "${viewName}"`);
                    const countRes = await dbManager.systemQuery(`SELECT COUNT(*) AS cnt FROM "${viewName}"`);
                    const rowCount = Number(countRes[0]?.cnt ?? 0);

                    return {
                        success: true,
                        view_name: viewName,
                        row_count: rowCount,
                        columns: columns.map(c => ({ name: c.column_name, type: c.column_type })),
                        usage: `Query with: SELECT ... FROM "${viewName}"`,
                    };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * profile_data — Compact statistical profile of a table or view.
         * Replaces 5–10 manual queries with a single structured result.
         */
        profile_data: tool({
            description: 'Get a statistical profile of a table or view: row count, column types, null percentages, unique value counts, min/max/avg for numeric columns, date ranges, and top values for categorical columns. Use this at the START of any EDA instead of many individual queries.',
            inputSchema: z.object({
                table_name: z.string().describe('Table or view name to profile (no quotes needed).'),
                columns: z.array(z.string()).optional().describe('Optional: subset of column names to profile. Omit to profile all columns (up to 40).'),
            }),
            execute: async ({ table_name, columns }) => {
                try {
                    const { profileTable } = require('./profiling');
                    // Quote the table name to handle spaces and special chars
                    const tableExpr = `"${table_name.replace(/"/g, '""')}"`;
                    return await profileTable(dbManager, tableExpr, columns || null);
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * scratchpad_write — Persists an intermediate finding for later recall.
         * Useful in multi-step analyses to track key numbers across iterations.
         */
        scratchpad_write: tool({
            description: 'Save a note or intermediate finding to your scratchpad. Use during multi-step analyses to store key numbers, hypotheses, or partial conclusions so you can reference them in final_answer without re-running queries.',
            inputSchema: z.object({
                key: z.string().describe('Short identifier (e.g. "total_revenue", "top_region", "anomaly_note").'),
                value: z.string().describe('The note content: a number, text, or JSON snippet.'),
            }),
            execute: async ({ key, value }) => {
                try {
                    if (aiPersistence && conversationId) {
                        await aiPersistence.saveScratchpad(dbManager, conversationId, key, value);
                    }
                    return { success: true, key };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        /**
         * scratchpad_read — Retrieves notes from the scratchpad.
         */
        scratchpad_read: tool({
            description: 'Read notes from your scratchpad. Use to recall key findings stored earlier in the analysis.',
            inputSchema: z.object({
                key: z.string().optional().describe('Specific key to retrieve. Omit to read all notes.'),
            }),
            execute: async ({ key }) => {
                try {
                    if (!aiPersistence || !conversationId) return { notes: [] };
                    const notes = await aiPersistence.getScratchpad(dbManager, conversationId, key || null);
                    return { notes };
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

    // ─── Planner tools (diving mode + experimental.planner=true) ───
    // These replace suggest_followups as the loop termination signal.
    if (mode === 'diving' && enablePlanner && activePlan) {

        allTools.create_plan = tool({
            description: `Create an analysis plan before starting multi-step work. Call this FIRST when the user asks for an analysis that requires more than 2 steps. Declare all steps upfront so the user can see your plan and follow progress. You MUST then execute each step in order, calling update_plan after each, and finish with final_answer.`,
            inputSchema: z.object({
                goal: z.string().describe('The main objective in one clear sentence.'),
                steps: z.array(z.object({
                    id: z.string().describe('Short step id: "s1", "s2", etc.'),
                    description: z.string().describe('What this step does, in plain language.'),
                    tool_hint: z.enum([
                        'list_tables', 'describe_table', 'execute_sql', 'display_chart',
                        'attach_file', 'profile_data', 'scratchpad_write', 'scratchpad_read',
                        'build_notebook', 'read_file', 'list_workspace_files', 'ask_user', 'final_answer', 'other',
                    ]).optional().describe('Which tool will likely be used in this step.'),
                })).min(2).max(15).describe('Ordered steps to complete the analysis.'),
            }),
            execute: async ({ goal, steps }) => {
                const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

                activePlan.id = planId;
                activePlan.goal = goal;
                activePlan.steps = steps.map(s => ({ ...s, status: 'pending' }));

                if (aiPersistence && conversationId) {
                    aiPersistence.savePlan(dbManager, {
                        id: planId, conversationId, goal, steps: activePlan.steps,
                    }).catch(e => console.warn('[Tools] create_plan persist:', e.message));
                }

                return { planId, goal, steps: activePlan.steps, status: 'created' };
            },
        });

        allTools.update_plan = tool({
            description: 'Mark a plan step as done, failed, or skipped. Call this after EVERY step completes so the plan stays current and the user sees progress.',
            inputSchema: z.object({
                step_id: z.string().describe('The step id to update (e.g. "s1").'),
                status: z.enum(['done', 'failed', 'skipped']).describe('New status.'),
                note: z.string().optional().describe('Brief note on what was found or why a step was skipped/failed.'),
            }),
            execute: async ({ step_id, status, note }) => {
                const step = activePlan.steps?.find(s => s.id === step_id);
                if (step) {
                    step.status = status;
                    if (note) step.note = note;
                }

                if (aiPersistence && activePlan.id) {
                    aiPersistence.updatePlan(dbManager, activePlan.id, {
                        steps: activePlan.steps,
                    }).catch(e => console.warn('[Tools] update_plan persist:', e.message));
                }

                const remaining = activePlan.steps?.filter(s => s.status === 'pending').length ?? 0;
                return { step_id, status, note: note || null, remaining_steps: remaining };
            },
        });

        allTools.final_answer = tool({
            description: 'Signal that the analysis is complete. Call this as the LAST action after all plan steps are done. Provide a comprehensive markdown summary of findings and 2-4 follow-up questions.',
            inputSchema: z.object({
                summary: z.string().describe('Complete markdown summary of findings, key numbers, insights, and conclusions.'),
                followup_questions: z.array(z.string()).min(2).max(4).optional().describe('Follow-up questions the user might want to explore next.'),
            }),
            execute: async ({ summary, followup_questions }) => {
                // Mark any still-pending steps as done so the plan panel shows complete
                if (activePlan.steps) {
                    for (const step of activePlan.steps) {
                        if (step.status === 'pending' || step.status === 'running') {
                            step.status = 'done';
                        }
                    }
                }
                if (aiPersistence && activePlan.id) {
                    aiPersistence.updatePlan(dbManager, activePlan.id, {
                        status: 'completed', steps: activePlan.steps,
                    }).catch(() => {});
                }

                return {
                    summary,
                    followup_questions: followup_questions || [],
                    plan_id: activePlan.id,
                    status: 'completed',
                };
            },
        });

        allTools.ask_user = tool({
            description: 'Pause the analysis to ask the user a clarifying question. Use ONLY when you genuinely cannot continue without their input — not for rhetorical questions.',
            inputSchema: z.object({
                question: z.string().describe('The specific question to ask.'),
                options: z.array(z.string()).optional().describe('Optional list of choices to present.'),
                context: z.string().optional().describe('Why you need this information to continue.'),
            }),
            execute: async ({ question, options, context }) => {
                if (aiPersistence && activePlan.id) {
                    aiPersistence.updatePlan(dbManager, activePlan.id, {
                        status: 'paused',
                    }).catch(() => {});
                }

                return { question, options: options || [], context: context || '', status: 'paused' };
            },
        });

        // In planner mode final_answer replaces suggest_followups
        delete allTools.suggest_followups;
    }

    return allTools;
}

module.exports = { createTools };
