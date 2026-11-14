/**
 * AmoxSQL AI — Agent Tool Definitions
 * Uses Vercel AI SDK tool format with Zod schemas.
 *
 * Each tool receives a `context` object injected at runtime containing:
 *   - dbManager: the DuckDB database manager instance
 *   - queryResults: Map<string, object> — accumulated query results for chart references
 */
const registrador = require('../registrador');
const { z } = require('zod');
const { tool } = require('ai');
const fs = require('fs');
const path = require('path');

const { analyzeJoin } = require('./joinSanityCheck');
const duckdbDocs = require('./duckdbDocs');
const { applyRowLimit } = require('../_sqlUtils');

const SQL_TIMEOUT_MS = 30000;
const MAX_FILE_SIZE = 50 * 1024;
/** Hard cap applied INSIDE DuckDB (via LIMIT N+1) before materializing rows in JS.
 *  Without it, a SELECT * over millions of rows freezes the event loop (and the SSE)
 *  converting the full result to JS objects just to throw most of it away. */
const TOOL_ROW_LIMIT = 500;

/**
 * Creates the complete set of agent tools, filtered by mode.
 * @param {object} context - Runtime context
 * @param {object} context.dbManager - DatabaseManager instance
 * @param {Map} context.queryResults - In-memory Map (fast local cache)
 * @param {string} context.projectPath - Project root directory
 * @param {string} [context.mode='diving'] - 'assistant' | 'diving'
 * @param {string} [context.conversationId] - Active conversation ID
 * @param {object} [context.aiPersistence] - Persistence layer for query_cache writes
 * @param {object} [context.activePlan] - Shared mutable plan ref (planner tools)
 * @param {object} [context.archivo] - The active file as prepared by archivoActivo (assistant): decides whether write_file is offered
 * @param {boolean} [context.enablePlanner=false] - Enable create_plan/update_plan (analysis-planning skill only)
 * @returns {object} Tools object for Vercel AI SDK
 */
function createTools(context) {
    const {
        dbManager, queryResults, projectPath, mode = 'diving',
        conversationId = null, aiPersistence = null,
        archivo = null,
        activePlan = null,
        enablePlanner = false,
    } = context;

    // All AI tool queries ride the dedicated 'ai' connection lane: they don't
    // queue behind user queries on 'main', and the tool timeout can interrupt
    // them without killing the user's running query. Falls back to the plain
    // manager if lanes are unavailable (e.g. test doubles).
    const db = (dbManager && typeof dbManager.lane === 'function')
        ? dbManager.lane('ai')
        : dbManager;

    // ─── Universal tools (all modes) ──────────────────────────────────────────

    const allTools = {

        execute_sql: tool({
            description: "Execute a DuckDB SQL query to analyze data. Always verify column names with describe_table first. Returns a queryId for display_chart. If a 'join-fanout' warning appears in results, add DISTINCT or GROUP BY — the JOIN produced more rows than expected due to non-unique keys.",
            inputSchema: z.object({
                query: z.string().describe('Valid DuckDB SELECT statement.'),
                confirmed: z.preprocess(v => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional())
                    .describe('Only true after the user agreed to run a query that came back with needs_confirmation (it would move tens of millions of rows).'),
            }),
            execute: async ({ query, confirmed }) => {
                try {
                    if (!query || typeof query !== 'string') {
                        return { error: 'Invalid query parameter. Expected a SQL string.' };
                    }
                    // 6.0 (O6): a query the engine estimates as very large is not run
                    // until the user agrees (the estimated plan reads no data).
                    if (confirmed !== true && confirmed !== 'true') {
                        const pregunta = await require('./costoDeConsulta').antesDeCorrer(db, query);
                        if (pregunta) return pregunta;
                    }
                    // Cap the result INSIDE DuckDB (LIMIT 501 probe) instead of
                    // materializing millions of rows in JS and slicing after.
                    // Queries with their own inner LIMIT are unaffected (the
                    // outer LIMIT only caps); DDL/DML pass through unchanged.
                    const { sql: limitedSql, limited } = applyRowLimit(query, TOOL_ROW_LIMIT);

                    const start = performance.now();
                    let timeoutTimer = null;
                    let result;
                    // Keep a handled reference: after a timeout+interrupt the losing
                    // promise still rejects later — without this it would surface as
                    // an unhandledRejection.
                    const trackId = `aiq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    const queryPromise = db.queryWithMetadata(limitedSql, { trackId });
                    queryPromise.catch(() => {});
                    try {
                        result = await Promise.race([
                            queryPromise,
                            new Promise((_, reject) => {
                                timeoutTimer = setTimeout(() => {
                                    // Cancel the running query on the AI lane — but only
                                    // if OUR query is still the one executing there:
                                    // DuckDB's interrupt flag is sticky and would kill
                                    // the next statement (e.g. a persistence write).
                                    try {
                                        if (!db.isRunning || db.isRunning('ai', trackId)) db.interruptQuery('ai');
                                    } catch { /* best-effort */ }
                                    reject(new Error(`Query exceeded timeout of ${SQL_TIMEOUT_MS / 1000}s`));
                                }, SQL_TIMEOUT_MS);
                            }),
                        ]);
                    } finally {
                        if (timeoutTimer) clearTimeout(timeoutTimer);
                    }
                    const end = performance.now();
                    const executionTime = Math.round(end - start);

                    // We fetched TOOL_ROW_LIMIT + 1 rows: the extra row only signals
                    // that the full result has more rows than the cap.
                    let allRows = result.rows;
                    let dbTruncated = false;
                    if (limited && allRows.length > TOOL_ROW_LIMIT) {
                        allRows = allRows.slice(0, TOOL_ROW_LIMIT);
                        dbTruncated = true;
                    }

                    const MAX_ROWS = 200;
                    const data = allRows.length > MAX_ROWS
                        ? allRows.slice(0, MAX_ROWS)
                        : allRows;

                    const queryId = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

                    const columns = result.types
                        ? Object.entries(result.types).map(([name, type]) => ({ name, type }))
                        : [];

                    // Cached rows are already capped at TOOL_ROW_LIMIT (500) by the
                    // DB-side LIMIT above, so the whole set is safe to keep per entry.
                    // Consumers (display_chart, chart story, /api/ai/query-cache)
                    // fall back to the DB cache, which stores the same rows.
                    const cacheEntry = {
                        query,
                        columns,
                        data: allRows,
                        rowCount: allRows.length,
                        executionTime,
                    };

                    if (queryResults.size >= 50) {
                        queryResults.delete(queryResults.keys().next().value);
                    }
                    queryResults.set(queryId, cacheEntry);

                    if (aiPersistence) {
                        aiPersistence.saveQueryCache(dbManager, {
                            queryId,
                            conversationId,
                            sqlQuery: query,
                            columns,
                            data: cacheEntry.data,
                            rowCount: allRows.length,
                            execMs: executionTime,
                        }).then(() => {
                            if (conversationId) {
                                aiPersistence.pruneQueryCache(dbManager, conversationId, 100).catch(() => {});
                            }
                        }).catch(e => registrador.aviso('[Tools] query_cache write failed:', e.message));
                    }

                    const joinWarning = await analyzeJoin(query, allRows.length, db);

                    return {
                        queryId,
                        columns,
                        data,
                        rowCount: allRows.length,
                        executionTime,
                        truncated: dbTruncated || allRows.length > MAX_ROWS,
                        // Honest reporting: with the DB-side cap we never know the true
                        // total. Tell the model rowCount is a lower bound so it uses
                        // COUNT(*)/GROUP BY instead of trusting 500 as exact.
                        ...(dbTruncated ? {
                            rowCountIsLowerBound: true,
                            note: `Result capped at ${TOOL_ROW_LIMIT} rows by a server-side LIMIT (the full result has more). Use aggregations (COUNT(*), GROUP BY) or add your own LIMIT for exact figures.`,
                        } : {}),
                        ...(joinWarning ? { warnings: [joinWarning] } : {}),
                    };
                } catch (err) {
                    const errMsg = err?.message || String(err);
                    const msg = errMsg.toLowerCase();
                    let hint;
                    if (msg.includes('timeout')) {
                        hint = 'Query took too long. Add LIMIT, simplify JOINs, or filter with WHERE. For large files, use USING SAMPLE 10%.';
                    } else if (msg.includes('already exists')) {
                        hint = 'Object already exists. Use CREATE OR REPLACE TABLE/VIEW, or DROP it first.';
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

        list_tables: tool({
            description: 'List all tables in the current DuckDB database with column and row counts. Call this first to understand what data is available before writing queries.',
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    // Schema = its full path (`ventas.crudo`): DuckDB 2 nests schemas (esquemas.js).
                    const { TABLAS, COLUMNAS } = require('../esquemas');
                    const tables = await db.systemQuery(`
                        SELECT
                            table_schema,
                            table_name,
                            (SELECT COUNT(*) FROM ${COLUMNAS} c
                             WHERE c.table_catalog = t.table_catalog AND c.table_name = t.table_name AND c.table_schema = t.table_schema) as column_count
                        FROM ${TABLAS} t
                        WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains')
                        AND NOT (table_schema = 'main' AND table_name IN ('amox_query_history'))
                        AND table_name NOT LIKE '\\_\\_chain\\_%' ESCAPE '\\'
                        AND table_catalog NOT LIKE '\\_\\_ducklake\\_metadata\\_%' ESCAPE '\\'
                        AND table_type = 'BASE TABLE'
                        ORDER BY table_schema, table_name
                    `);

                    const tablesWithCounts = [];
                    for (const t of tables.slice(0, 50)) {
                        try {
                            const countRes = await db.systemQuery(
                                `SELECT COUNT(*) as cnt FROM ${require('../esquemas').referencia(t.table_schema, t.table_name)}`
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

                    // Named sources: views in the `fuentes` catalog, read from
                    // their file each time (rows are not counted for that reason).
                    let sources = [];
                    try {
                        sources = (await db.systemQuery(`
                            SELECT v.view_name AS name, v.comment AS description,
                                   (SELECT COUNT(*) FROM information_schema.columns c
                                    WHERE c.table_catalog = 'fuentes' AND c.table_name = v.view_name) AS column_count
                            FROM duckdb_views() v
                            WHERE v.database_name = 'fuentes' AND NOT v.internal
                            ORDER BY v.view_name
                        `)).map(s => ({
                            ref: `fuentes."${s.name}"`,
                            description: s.description || undefined,
                            columns: s.column_count,
                        }));
                    } catch { /* no sources catalog in this session */ }

                    return sources.length
                        ? { tables: tablesWithCounts, sources, note: 'Sources are read from their files: query them as fuentes."name" (quoted, the name has hyphens).' }
                        : { tables: tablesWithCounts };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        describe_table: tool({
            description: 'Get the schema (column names, types) and sample rows from a table. Use this to verify exact column names before writing queries.',
            inputSchema: z.object({
                table_name: z.string().describe('Table name. Use "schema.table" for non-main schemas (a nested schema keeps its full path: "sales.raw.orders").'),
            }),
            execute: async ({ table_name }) => {
                try {
                    // "schema.table", or a nested schema's full path ("sales.raw.orders"), each
                    // part quoted. Parts may come quoted already (fuentes."weekly-sales").
                    const { partes } = require('../esquemas');
                    const trozos = partes(table_name.trim());
                    const sinComillas = (s) => String(s).replace(/"/g, '""');
                    const dot = trozos.length > 1 ? 1 : -1;
                    const ref = trozos.map(p => `"${sinComillas(p)}"`).join('.');
                    const columns = await db.systemQuery(`DESCRIBE ${ref}`);
                    const sample = await db.systemQuery(`SELECT * FROM ${ref} LIMIT 5`);
                    // 5.12 (I5): lo que dicen la tabla y sus columnas (comentarios, o dbt).
                    let d = null;
                    try {
                        const todas = await require('../descripciones').deLaBase(db, { raiz: typeof projectPath === 'string' ? projectPath : null, attachedPath: dbManager?.attachedPath || null });
                        const clave = dot > 0 ? `${trozos.slice(0, -1).join('.')}.${trozos[trozos.length - 1]}` : `main.${trozos[0]}`;
                        d = todas[clave] || null;
                    } catch { /* sin descripciones */ }

                    return {
                        table: table_name,
                        ...(d?.descripcion ? { description: d.descripcion } : {}),
                        columns: columns.map(c => ({
                            name: c.column_name,
                            type: c.column_type,
                            nullable: c.null === 'YES',
                            ...(d?.columnas?.[c.column_name] ? { description: d.columnas[c.column_name] } : {}),
                        })),
                        sampleRows: sample,
                    };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        lookup_duckdb_docs: tool({
            description: "Look up the official DuckDB SQL documentation (bundled offline) for a specific feature, function, clause, or syntax. Call this BEFORE writing SQL when you are unsure of exact DuckDB syntax — especially DuckDB-specific features that differ from other SQL dialects: EXCLUDE / REPLACE / COLUMNS(*), filtering columns BY NAME with LIKE/GLOB/SIMILAR TO, QUALIFY, PIVOT / UNPIVOT, list comprehensions & lambdas, ASOF joins, struct/map/list types, SAMPLE, window functions, GROUPING SETS. Returns the relevant section PLUS the full list of sections in that doc (`sections`) — if the answer isn't in the section you got, call again with the `section` param set to a sibling section name. Prefer this over guessing.",
            inputSchema: z.object({
                topic: z.string().describe('The DuckDB feature, function, clause or syntax. Be specific, e.g. "exclude columns matching a pattern", "QUALIFY window filter", "list comprehension", "date_trunc". You may ask in the user\'s language.'),
                section: z.string().optional().describe('Optional: request a specific section heading within the resolved doc (from a previous result\'s `sections` list), e.g. "Column Filtering via Pattern Matching Operators".'),
            }),
            execute: async ({ topic, section }) => {
                try {
                    const r = duckdbDocs.lookup(topic, section);
                    if (!r.found) {
                        return { found: false, hint: 'No matching DuckDB doc. Try a more specific English feature name, or validate your SQL with validate_sql.' };
                    }
                    return {
                        found: true,
                        title: r.title,
                        section: r.matchedHeading || null,
                        // The other sections in this doc — if your answer isn't here,
                        // call lookup_duckdb_docs again with section set to one of these.
                        sections: r.sections || [],
                        source: r.url,
                        content: r.content,
                        alternatives: r.alternatives || [],
                    };
                } catch (err) {
                    return { found: false, error: err?.message || String(err) };
                }
            },
        }),

        lookup_duckdb_function: tool({
            description: "Get the EXACT signature(s) of a DuckDB function straight from the running engine (duckdb_functions()) — the authoritative source, always matching this exact DuckDB version, impossible to hallucinate. Use it when unsure a function exists or what arguments/types it takes (e.g. list_transform, date_trunc, regexp_replace, strftime). Returns every overload's parameter types, return type, description and examples.",
            inputSchema: z.object({
                name: z.string().describe('The function name (or a fragment) to look up, e.g. "date_trunc", "list_", "regexp".'),
            }),
            execute: async ({ name }) => {
                const safe = String(name || '').replace(/[^a-z0-9_]/gi, '').toLowerCase();
                if (!safe) return { found: false, hint: 'Provide a function name.' };
                try {
                    const rows = await db.systemQuery(`
                        SELECT function_name,
                          any_value(function_type) AS function_type,
                          left(any_value(description), 200) AS description,
                          array_to_string(list(DISTINCT array_to_string(parameter_types, ', ')), '  |  ') AS signatures,
                          array_to_string(list(DISTINCT return_type), ', ') AS return_types,
                          array_to_string(list_distinct(flatten(list(examples))), ' ;; ') AS examples
                        FROM duckdb_functions()
                        WHERE function_name = '${safe}' OR function_name ILIKE '%${safe}%'
                        GROUP BY function_name
                        ORDER BY (function_name = '${safe}') DESC, length(function_name)
                        LIMIT 12`);
                    if (!rows || rows.length === 0) {
                        return { found: false, hint: `No DuckDB function matches "${safe}". It may not exist — check the docs with lookup_duckdb_docs, or verify with validate_sql.` };
                    }
                    return {
                        found: true,
                        count: rows.length,
                        functions: rows.map(r => ({
                            name: r.function_name,
                            type: r.function_type,
                            signatures: r.signatures ? r.signatures.split('  |  ') : [],
                            returns: r.return_types,
                            description: r.description || null,
                            examples: r.examples || null,
                        })),
                    };
                } catch (err) {
                    return { found: false, error: err?.message || String(err) };
                }
            },
        }),

        display_chart: tool({
            description: 'Render a fully configured chart from a previous execute_sql result. Act as a data journalist. CHOOSE THE CHART TYPE BY REASONING, not by column type — follow the "Chart Selection" framework in your instructions: (1) state the ONE message, (2) classify the intent (comparison / change-over-time / part-of-whole / relationship / ranking-change), (3) check the data shape. Key trap: a date column with only 2–3 periods is a COMPARISON, not a trend — use grouped bars (split_by) rather than a line; lines need ≥4–5 points to be honest. For real date/timestamp time series set date_aggregation and x_axis_angle=45. Set `takeaway` (the chart\'s one-line conclusion) and, when a specific point carries the finding, an `annotations` callout — right here on display_chart.',
            inputSchema: z.object({
                // ── Core ──────────────────────────────────────────────────────────
                query_id: z.string().describe('The queryId from a previous execute_sql result.'),
                chart_type: z.enum([
                    'bar', 'bar-stacked', 'bar-horizontal', 'bar-100',
                    'line', 'area', 'donut',
                    'scatter', 'bubble', 'combo',
                    'funnel', 'heatmap', 'treemap',
                    'histogram', 'boxplot', 'errorbar', 'slope',
                    'lollipop', 'dumbbell', 'density', 'strip', 'bump',
                ]).describe('Chart type — pick by the message + data shape, NOT by column type. bar=compare categories (with split_by → grouped bars, ideal for before/after across 2–3 periods); bar-horizontal=ranking or long category names (x_axis_key=category shown LEFT, y_axis_keys=value shown BOTTOM); line/area=true time series with ≥4–5 points; donut=part-of-whole (≤7 slices); scatter=correlation; combo=two metrics at different scales; histogram=distribution of ONE numeric column (x_axis_key=that column, counts are computed — pass raw rows, not pre-aggregated); boxplot=spread per category from raw rows (x_axis_key=category, y_axis_keys=[value]); errorbar=a value with a low–high interval per category (needs error_low_key and error_high_key); slope=each category from one moment to another (x_axis_key=the 2 periods, y_axis_keys=[value], split_by=category); lollipop=a ranking with less ink than bars; dumbbell=two values per category joined (y_axis_keys=[before, after] or [plan, actual]); density=smooth distribution of x_axis_key (split_by = one curve per group); strip=every raw row as a tick per category; bump=how the RANK of each category changes over periods (split_by=category). A date column with only 2–3 points is a comparison → use grouped bars or slope, not a line.'),
                title: z.string().describe('The title is a CLAIM, not a label — state what the data shows, e.g. "West leads with 34% of sales", NOT "Sales by region". Write it WITHOUT a terminal period (the figure can add a QED-style mark). Include the key metric and dimension/time range.'),
                subtitle: z.string().optional().describe('One factual line that explains the calculation, scope, or reading of the chart (not a second headline). When the series are colour-encoded, name them here so the subtitle doubles as the legend, e.g. "Quarterly revenue by region, in USD".'),
                footnote: z.string().optional().describe('Scope or caveat — row count, date range, method, e.g. "Based on 1,240 transactions · Jan–Dec 2024". NEVER invent a data source or provenance you cannot support from the query context; describe scope instead of naming a source you are guessing.'),

                // ── Data mapping ──────────────────────────────────────────────────
                x_axis_key: z.string().describe('Column for the X axis or category dimension.'),
                y_axis_keys: z.array(z.string()).describe('One or more columns for the Y axis / values.'),
                right_y_axis_key: z.string().optional().describe('Column to plot on a secondary right Y axis (combo charts with two scales).'),
                split_by: z.string().optional().describe('Column to pivot/split the data by (creates one series per unique value). Use for breakdowns by region, category, segment, etc.'),
                bubble_size_key: z.string().optional().describe('Column for bubble radius (bubble charts only).'),
                bin_count: z.number().int().min(2).max(200).optional().describe('histogram only: maximum number of bins (default 20).'),
                histogram_stats: z.array(z.enum(['mean', 'median'])).optional().describe('histogram only: draw a vertical rule at the mean and/or median. Use both when the distribution is skewed — the gap between them IS the story.'),
                error_low_key: z.string().optional().describe('errorbar only: column with the low end of the interval.'),
                error_high_key: z.string().optional().describe('errorbar only: column with the high end of the interval.'),
                band_low_key: z.string().optional().describe('line/area: column with the low end of a band drawn behind the line (a confidence interval, a forecast range, min–max). Needs band_high_key.'),
                band_high_key: z.string().optional().describe('line/area: column with the high end of the band.'),
                facet_by: z.string().optional().describe('Small multiples: repeat the chart for each value of this column (≤12 values). Better than one crowded chart with many series.'),
                facet_columns: z.number().int().min(1).max(6).optional().describe('Charts per row for facet_by (default 3).'),
                end_labels: z.boolean().optional().describe('line/area/bump: name each series at the end of its line instead of a legend (direct labeling — usually clearer).'),
                tooltip_fields: z.array(z.string()).optional().describe('Extra result columns to show in the tooltip.'),
                orientation: z.enum(['horizontal', 'vertical']).optional().describe('boxplot / errorbar: horizontal (categories on the left, default — best for long names) or vertical.'),

                // ── Axes ──────────────────────────────────────────────────────────
                x_axis_label: z.string().optional().describe('Label for the CATEGORY axis. For bar/line: appears at bottom. For bar-horizontal: appears on the LEFT (where category names are shown). e.g. "Product", "Region", "Month".'),
                y_axis_label: z.string().optional().describe('Label for the VALUES axis with units. For bar/line: appears on the left. For bar-horizontal: appears at the BOTTOM (where numeric values are shown). e.g. "Revenue (USD)", "Active Users", "Orders".'),
                x_axis_angle: z.enum(['0', '45', '90']).optional().describe('X axis label rotation. Use 45 or 90 for date/timestamp columns to prevent label overlap.'),
                date_aggregation: z.enum(['none', 'day', 'week', 'month', 'quarter', 'year']).optional().describe('Aggregate date/timestamp X values. Use month for 1–3 yr spans, quarter for 3+ yr, week for <3 mo.'),
                y_log_scale: z.boolean().optional().describe('Logarithmic Y axis. Use for data spanning multiple orders of magnitude.'),

                // ── Data options ──────────────────────────────────────────────────
                number_format: z.enum(['compact', 'raw', 'percent']).optional().describe('Y axis number format. compact=1.2M (default), raw=1200000, percent=12.3%.'),
                sort_mode: z.enum(['x-asc', 'x-desc', 'y-asc', 'y-desc', 'natural']).optional().describe('Sort order. y-desc=rank highest first (good for bar charts); natural=original SQL order (good for time series).'),
                limit: z.number().int().optional().describe('Max data points to show. Use for ranking charts (e.g. top 10 products).'),
                cumulative: z.boolean().optional().describe('Show running total instead of individual values (line/area charts).'),

                // ── Visual style ──────────────────────────────────────────────────
                color_theme: z.enum([
                    'default', 'vivid', 'dark2', 'set1', 'set2', 'pastel', 'neon',
                    'blues', 'greens', 'purples', 'ylorbr', 'reds',
                    'spectral', 'rdylbu', 'rdylgn', 'piyg',
                    'ocean', 'sunset', 'corporate',
                    'sterling', 'sterlingDark', 'sterlingSequential', 'sterlingDiverging', 'sterlingHeat',
                ]).optional().describe('Color palette — reason it by data role + theme + readability (see "Color is a design decision" and "Rendering context" in your instructions), do NOT default blindly. Qualitative (distinct series): default, dark2, set2, vivid, pastel, neon, sterling (editorial, calibrated for light & dark), sterlingDark. Sequential (ordered magnitude, light→dark): blues, greens, purples, ylorbr, sterlingSequential. Diverging (+/- around a center): spectral, rdylbu, rdylgn, piyg, sterlingDiverging (violet=positive, teal=negative). Brand/mono: ocean, sunset, corporate(grays). reds/sunset & red overlays: RESERVED for negative/alarm metrics only. For a single-metric ranking keep one color + highlight the leader, never one color per bar (categorical only when the categories carry meaning).'),
                show_data_labels: z.boolean().optional().describe('Show value labels directly on bars/points. Good for ranked bar charts. Default: false.'),
                legend_position: z.enum(['top', 'bottom', 'left', 'right', 'inline', 'none']).optional().describe('Legend placement. "inline" weaves the series names into the subtitle sentence (editorial style — clean for 2–4 series). none hides it. Default: top.'),
                grid_mode: z.enum(['both', 'horizontal', 'vertical', 'none']).optional().describe('Grid lines. Default: horizontal.'),

                // ── Line/Area chart options ───────────────────────────────────────
                line_type: z.enum(['monotone', 'linear', 'step']).optional().describe('Line interpolation. monotone=smooth curves (default); linear=straight segments; step=staircase (good for state changes).'),
                show_dots: z.boolean().optional().describe('Show data points on line/area charts. Default: true.'),

                // ── Bar chart options ─────────────────────────────────────────────
                bar_color_mode: z.enum(['series', 'dimension', 'intensity']).optional().describe('Bar coloring. series=ONE color for all bars (default; the CORRECT choice for a single-metric ranking — pair with highlight for emphasis). dimension=one color per category, ONLY when there are ≤5 genuinely distinct categories whose identity matters (NOT a sorted ranking — that makes a misleading rainbow). intensity=fade opacity by value magnitude.'),
                bar_radius: z.number().int().min(0).max(20).optional().describe('Bar corner radius in px. 0=sharp, 4=slight rounding (default), 8=rounded.'),

                // ── Analytical overlays ───────────────────────────────────────────
                trend_line: z.object({
                    type: z.enum(['linear', 'moving-average', 'loess']).describe('linear=OLS regression line (on a scatter, the regression of y on x); moving-average=smoothed trend over ordered x; loess=smooth curve (scatter only).'),
                    window_size: z.number().int().min(2).max(50).optional().describe('Window for moving average (default: 3).'),
                    color: z.string().optional().describe('Hex color, e.g. "#fbbf24". Default: amber.'),
                }).optional().describe('Overlay a trend/moving-average line. GUARDRAIL: only for a SINGLE-series time series with ≥5 points. NEVER use together with split_by or multiple y_axis_keys — the trend would sum unrelated series into a meaningless line. Omit it for ≤4 points.'),

                goal_line: z.object({
                    value: z.number().describe('Y value for the goal/target line.'),
                    label: z.string().optional().describe('Label shown on the line, e.g. "Target", "Budget".'),
                    color: z.string().optional().describe('Hex color. Default: green.'),
                    style: z.enum(['solid', 'dashed', 'dotted']).optional().describe('Line style. Default: dashed.'),
                }).optional().describe('Horizontal target line. Use to show progress toward a goal or SLA.'),

                ref_line: z.object({
                    value: z.union([z.number(), z.enum(['mean', 'median'])]).describe('Y value for the reference line, or "mean"/"median" to compute it from the plotted values.'),
                    label: z.string().optional().describe('Label shown on the line, e.g. "Average", "Median".'),
                    color: z.string().optional().describe('Hex color. Default: red.'),
                }).optional().describe('Horizontal reference line. Use for mean, median, or benchmark values.'),

                highlight: z.object({
                    type: z.enum(['max', 'min', 'exact', 'below', 'above', 'range']).describe('max=highlight the highest bar/point; min=lowest; exact=specific category; below/above=every bar under/over a threshold (e.g. ROAS below 1); range=a stretch of a line from value to value2 on the x axis (e.g. the weeks of an incident).'),
                    value: z.string().optional().describe('Category for exact; the threshold for below/above; the start of the stretch for range.'),
                    value2: z.string().optional().describe('range only: the end of the stretch.'),
                    color: z.string().optional().describe('Highlight color hex. Default: red.'),
                }).optional().describe('Highlight a specific data point. Use to draw attention to the peak, trough, or a key category in the story.'),

                // ── Headline KPI overlay ──────────────────────────────────────────
                headline_kpi: z.object({
                    metric: z.enum(['total', 'average', 'last', 'first']).describe('Aggregate to display prominently above the chart.'),
                    compare_with: z.enum(['none', 'first', 'previous']).optional().describe('Show delta vs first or previous value. Default: none.'),
                }).optional().describe('Large KPI number overlay above the chart. Use to anchor the key metric before showing the trend.'),

                // ── Donut-specific ────────────────────────────────────────────────
                donut_center_kpi: z.enum(['none', 'total', 'average']).optional().describe('Show total or average in the donut center hole. Default: none.'),
                donut_label_content: z.enum(['percent', 'value', 'name', 'name_percent', 'name_value']).optional().describe('What to show on donut slice labels. Default: percent.'),

                // ── Storytelling layer ────────────────────────────────────────────
                takeaway: z.string().optional().describe('One-sentence conclusion shown under the chart — the MESSAGE, not the metric. e.g. "San Francisco alone drives a quarter of all revenue." Set this on every important chart.'),
                annotations: z.array(z.object({
                    type: z.enum(['text', 'box']).describe('text=point callout at (x[,y]); box=shaded region from x..x2 [and y..y2].'),
                    x: z.string().describe('Category/x value to anchor to (must match an x_axis_key value in the data).'),
                    x2: z.string().optional().describe('End x value for a box region.'),
                    y: z.union([z.number(), z.string()]).optional().describe('Y value; omit for a text callout to auto-place it on the data point.'),
                    y2: z.union([z.number(), z.string()]).optional().describe('End y value for a box region.'),
                    text: z.string().describe('Short callout label (a few words) naming what the reader should notice here.'),
                    color: z.string().optional().describe('Hex color. Default: warning amber.'),
                })).max(3).optional().describe('Up to 3 callouts marking the exact points that carry your finding. Use sparingly — annotate the "aha", not everything.'),

                // ── Escape hatch: a full Vega-Lite spec ───────────────────────────
                vega_lite: z.record(z.string(), z.any()).optional().describe('ADVANCED — only when no chart_type + options can express the figure (layered or faceted views, custom transforms, small multiples). A complete Vega-Lite v6 spec whose data is {"name": "dataset"} (the query result is bound to that name); use the result columns as fields. Do NOT put title or takeaway here — pass them as title/takeaway. chart_type, x_axis_key and y_axis_keys are still required (they describe the figure for the panels). The spec is compiled on the server; on error, fix it and re-call.'),
            }),
            execute: async ({
                query_id, chart_type, title, subtitle, footnote,
                x_axis_key, y_axis_keys, right_y_axis_key, split_by, bubble_size_key,
                x_axis_label, y_axis_label, x_axis_angle, date_aggregation, y_log_scale,
                number_format, sort_mode, limit, cumulative,
                color_theme, show_data_labels, legend_position, grid_mode,
                line_type, show_dots,
                bar_color_mode, bar_radius,
                trend_line, goal_line, ref_line, highlight,
                headline_kpi, donut_center_kpi, donut_label_content,
                takeaway, annotations,
                bin_count, histogram_stats, error_low_key, error_high_key, orientation, band_low_key, band_high_key,
                facet_by, facet_columns, end_labels, tooltip_fields,
                vega_lite,
            }) => {
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
                        queryResults.set(query_id, queryResult);
                    }
                }
                if (!queryResult) {
                    return { error: `Query result '${query_id}' not found. Call execute_sql first and use the returned queryId.` };
                }

                const chartWarnings = [];
                const availableColumns = queryResult.columns.map(c => c.name);
                const missingX = !availableColumns.includes(x_axis_key);
                const missingY = y_axis_keys.filter(k => !availableColumns.includes(k))
                    .concat([error_low_key, error_high_key, band_low_key, band_high_key, facet_by, ...(tooltip_fields || [])].filter(k => k && !availableColumns.includes(k)));

                // Un Vega-Lite escrito por el modelo se compila AQUÍ: un error vuelve
                // al modelo con el mensaje del compilador para que lo corrija.
                let especVL = null;
                if (vega_lite) {
                    const { title: _t, usermeta: _u, ...resto } = vega_lite;
                    especVL = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', ...resto, data: { name: 'dataset' } };
                    try {
                        const vl = await import('vega-lite');
                        const avisos = [];
                        const logger = { level() { return this; }, warn: (...a) => avisos.push(a.join(' ')), info() {}, debug() {}, error: (...a) => avisos.push(a.join(' ')) };
                        vl.compile(especVL, { logger });
                        const usados = new Set();
                        JSON.stringify(especVL, (k, v) => { if (k === 'field' && typeof v === 'string') usados.add(v.replace(/\\(.)/g, '$1')); return v; });
                        const derivados = new Set();
                        JSON.stringify(especVL, (k, v) => { if (k === 'as') (Array.isArray(v) ? v : [v]).forEach(x => typeof x === 'string' && derivados.add(x)); return v; });
                        const ajenos = [...usados].filter(f => !availableColumns.includes(f) && !derivados.has(f));
                        if (ajenos.length) {
                            return { error: `vega_lite uses field(s) not in the result: ${ajenos.join(', ')}. Available: ${availableColumns.join(', ')}` };
                        }
                        if (avisos.length) chartWarnings.push(...avisos.slice(0, 3).map(a => `Vega-Lite: ${a}`));
                    } catch (e) {
                        return { error: `The vega_lite spec does not compile: ${e.message}`, hint: 'Fix the spec (Vega-Lite v6, data {"name": "dataset"}) and re-call display_chart, or drop vega_lite and use chart_type with its options.' };
                    }
                }
                if (!vega_lite && (missingX || missingY.length > 0)) {
                    return {
                        error: `Column(s) not found in query result. Available: ${availableColumns.join(', ')}`,
                        missingX: missingX ? x_axis_key : null,
                        missingY: missingY.length > 0 ? missingY : null,
                    };
                }

                // ── Storytelling guardrails (data-driven, not prompt-only) ──────────
                // These catch the choices that misrepresent the data even when the
                // model ignores the prompt guidance. A hard error makes the model
                // re-call correctly; soft issues are surfaced as warnings.
                const rows = Array.isArray(queryResult.data) ? queryResult.data : [];

                if (chart_type === 'line' || chart_type === 'area') {
                    const distinctX = new Set(rows.map(r => String(r?.[x_axis_key] ?? ''))).size;
                    if (rows.length > 0 && distinctX <= 2) {
                        return {
                            error: `A ${chart_type} chart needs ≥4–5 points to show a trend, but '${x_axis_key}' has only ${distinctX} distinct value(s). Two periods is a COMPARISON, not a trend — a line implies a continuous progression that doesn't exist here.`,
                            hint: split_by
                                ? `Re-call display_chart with chart_type='bar' and split_by='${split_by}' for grouped before/after bars per category, and omit trend_line.`
                                : `Re-call display_chart with chart_type='bar' (one bar per '${x_axis_key}'); add split_by='<category>' for a breakdown, and omit trend_line.`,
                        };
                    }
                    if (rows.length > 0 && distinctX === 3) {
                        chartWarnings.push(`Only 3 '${x_axis_key}' points — a line is borderline; grouped bars usually read clearer for a 3-period comparison.`);
                    }
                }

                // A trend line over split/multiple series would sum unrelated series
                // into a meaningless line — strip it rather than render nonsense.
                if (trend_line && (split_by || (Array.isArray(y_axis_keys) && y_axis_keys.length > 1))) {
                    trend_line = undefined;
                    chartWarnings.push(`Removed the trend line: it cannot be computed over split/multiple series (it would aggregate unrelated series into a meaningless trend).`);
                }

                // ── Color linter (soft warnings; the agent re-calls if it agrees) ──
                const distinctXCount = new Set(rows.map(r => String(r?.[x_axis_key] ?? ''))).size;
                const singleSeries = !split_by && Array.isArray(y_axis_keys) && y_axis_keys.length === 1;

                // 1. Rainbow ranking: dimension mode on a single-metric bar w/ many categories.
                if (bar_color_mode === 'dimension' && singleSeries && distinctXCount > 5 &&
                    (chart_type === 'bar' || chart_type === 'bar-horizontal')) {
                    chartWarnings.push(`bar_color_mode="dimension" paints each of the ${distinctXCount} bars a different color — a rainbow that hides the ranking. Re-call with bar_color_mode="series" (one color) plus highlight:{type:"max"} to spotlight the leader.`);
                }
                // 2. Sequential palette on categorical bars that aren't sorted by value → misleading.
                if (['blues', 'greens', 'reds'].includes(color_theme) && singleSeries &&
                    (chart_type === 'bar' || chart_type === 'bar-horizontal') &&
                    sort_mode && !String(sort_mode).startsWith('y')) {
                    chartWarnings.push(`A sequential palette ("${color_theme}") signals ordered magnitude, but the bars aren't sorted by value. Sort with sort_mode="y-desc", or use one solid color.`);
                }
                // 3. Red palette on a metric with no negative semantics → false alarm.
                const yText = (Array.isArray(y_axis_keys) ? y_axis_keys.join(' ') : '').toLowerCase();
                const negativeSemantics = /(loss|churn|error|cost|defect|fail|drop|decline|refund|complaint|debt|overdue|deficit|attrition)/.test(yText);
                if ((color_theme === 'reds' || color_theme === 'sunset') && !negativeSemantics) {
                    chartWarnings.push(`Red reads as alarm/negative, but "${(y_axis_keys || []).join(', ')}" looks neutral. Reserve red for loss/churn/below-target; use a neutral palette (default/blues/ocean) for revenue/volume.`);
                }
                // 4. Donut with too many slices (was prompt-only; now enforced as a warning).
                if (chart_type === 'donut' && distinctXCount > 7) {
                    chartWarnings.push(`A donut with ${distinctXCount} slices is unreadable (>7). Use a bar/bar-horizontal ranking instead.`);
                }

                // Annotations → renderer shape (id + only the set fields).
                const mappedAnnotations = Array.isArray(annotations)
                    ? annotations.map((a, i) => ({
                        id: `ann-${i}`,
                        type: a.type,
                        x: a.x,
                        ...(a.x2 !== undefined && { x2: a.x2 }),
                        ...(a.y  !== undefined && { y: a.y }),
                        ...(a.y2 !== undefined && { y2: a.y2 }),
                        text: a.text,
                        ...(a.color && { color: a.color }),
                    }))
                    : null;

                const chartConfig = {
                    // Core
                    chartType: chart_type,
                    ...(especVL ? { modo: 'codigo', spec: especVL } : {}),
                    ...(bin_count       !== undefined && { binCount: bin_count }),
                    ...(histogram_stats !== undefined && { histogramStats: histogram_stats }),
                    ...(error_low_key   !== undefined && { errorLowKey: error_low_key }),
                    ...(band_low_key    !== undefined && { bandLowKey: band_low_key }),
                    ...(band_high_key   !== undefined && { bandHighKey: band_high_key }),
                    ...(error_high_key  !== undefined && { errorHighKey: error_high_key }),
                    ...(orientation     !== undefined && { orientation }),
                    ...(facet_by        !== undefined && { facetKey: facet_by }),
                    ...(facet_columns   !== undefined && { facetColumns: facet_columns }),
                    ...(end_labels      !== undefined && { endLabels: end_labels }),
                    ...(tooltip_fields  !== undefined && { tooltipFields: tooltip_fields }),
                    title,
                    xAxisKey: x_axis_key,
                    yAxisKeys: y_axis_keys,
                    queryId: query_id,
                    // Storytelling texts
                    ...(subtitle   !== undefined && { chartSubtitle: subtitle }),
                    ...(footnote   !== undefined && { chartFootnote: footnote }),
                    // Data mapping
                    ...(right_y_axis_key !== undefined && { rightYAxisKey: right_y_axis_key }),
                    ...(split_by        !== undefined && { splitByKey: split_by }),
                    ...(bubble_size_key !== undefined && { bubbleSizeKey: bubble_size_key }),
                    // Axes
                    ...(x_axis_label !== undefined && { xAxisLabel: x_axis_label }),
                    ...(y_axis_label !== undefined && { yAxisLabel: y_axis_label }),
                    ...(x_axis_angle !== undefined && { xAxisLabelAngle: Number(x_axis_angle) }),
                    ...(date_aggregation !== undefined && { dateAggregation: date_aggregation }),
                    ...(y_log_scale  !== undefined && { yLogScale: y_log_scale }),
                    // Data options
                    ...(number_format !== undefined && { numberFormat: number_format }),
                    ...(sort_mode    !== undefined && { sortMode: sort_mode }),
                    ...(limit        !== undefined && { limit }),
                    ...(cumulative   !== undefined && { isCumulative: cumulative }),
                    // Visual style
                    ...(color_theme      !== undefined && { colorTheme: color_theme }),
                    ...(show_data_labels !== undefined && { showLabels: show_data_labels }),
                    ...(legend_position  !== undefined && { legendPosition: legend_position }),
                    ...(grid_mode        !== undefined && { gridMode: grid_mode }),
                    // Line/Area
                    ...(line_type  !== undefined && { lineType: line_type }),
                    ...(show_dots  !== undefined && { showDots: show_dots }),
                    // Bar
                    ...(bar_color_mode !== undefined && { barColorMode: bar_color_mode }),
                    ...(bar_radius     !== undefined && { barRadius: bar_radius }),
                    // Analytical overlays
                    ...(trend_line !== undefined && {
                        trendLine: {
                            type: trend_line.type,
                            windowSize: trend_line.window_size || 3,
                            color: trend_line.color || '#fbbf24',
                        },
                    }),
                    ...(goal_line !== undefined && {
                        goalLine: {
                            enabled: true,
                            value: String(goal_line.value),
                            label: goal_line.label || 'Goal',
                            color: goal_line.color || '#22c55e',
                            style: goal_line.style || 'dashed',
                        },
                    }),
                    ...(ref_line !== undefined && {
                        refLine: {
                            value: String(ref_line.value),
                            label: ref_line.label || '',
                            color: ref_line.color || '#ff4444',
                            style: 'dashed',
                        },
                    }),
                    ...(highlight !== undefined && {
                        highlightConfig: {
                            type: highlight.type,
                            value: highlight.value || '',
                            value2: highlight.value2 || '',
                            // Spotlight follows the theme accent, not alarm-red — a
                            // highlighted leader is emphasis, not something negative.
                            color: highlight.color || 'var(--accent-primary)',
                        },
                    }),
                    // Storytelling layer (takeaway / annotations)
                    ...(takeaway !== undefined && { takeaway }),
                    ...(mappedAnnotations && mappedAnnotations.length ? { annotations: mappedAnnotations } : {}),
                    // Headline KPI
                    ...(headline_kpi !== undefined && {
                        headline: {
                            visible: true,
                            metric: headline_kpi.metric,
                            compareWith: headline_kpi.compare_with || 'none',
                            size: 'auto',
                        },
                    }),
                    // Donut
                    ...(donut_center_kpi    !== undefined && { donutCenterKpi: donut_center_kpi }),
                    ...(donut_label_content !== undefined && { donutLabelContent: donut_label_content }),
                };

                return {
                    success: true,
                    chartConfig,
                    dataRowCount: queryResult.rowCount,
                    ...(chartWarnings.length ? { warnings: chartWarnings } : {}),
                };
            },
        }),

        // Merged: read_file + list_workspace_files (mode='list' for directory listing)
        read_file: tool({
            description: "Read a text file or list a directory from the project. mode='read' (default): returns file content up to 50KB. mode='list': lists files in a directory filtered by extension — use to discover CSV, Parquet, SQL, and other data files available for attach_file.",
            inputSchema: z.object({
                file_path: z.string().describe("Relative path to a file (mode='read') or subdirectory to scan (mode='list'). Use '.' or '' for the project root when listing."),
                mode: z.enum(['read', 'list']).optional().default('read'),
                extensions: z.array(z.string()).optional().describe("mode='list' only: filter by extensions, e.g. ['.csv', '.parquet']. Defaults to common data and query file types."),
            }),
            execute: async ({ file_path: filePath = '.', mode: fileMode = 'read', extensions }) => {
                try {
                    if (!projectPath) return { error: 'No project directory available.' };

                    if (fileMode === 'list') {
                        const DEFAULT_EXTS = ['.csv', '.tsv', '.json', '.jsonl', '.parquet', '.xlsx', '.xls', '.sql', '.sqlnb', '.txt', '.md'];
                        const allowedExts = new Set((extensions || DEFAULT_EXTS).map(e => e.toLowerCase().replace(/^\.?/, '.')));

                        const normalizedSub = path.normalize(filePath || '');
                        if (normalizedSub.startsWith('..') || path.isAbsolute(normalizedSub)) {
                            return { error: 'Invalid path. Use relative paths within the project directory.' };
                        }
                        const targetDir = path.join(projectPath, normalizedSub === '.' ? '' : normalizedSub);
                        if (!path.resolve(targetDir).startsWith(path.resolve(projectPath))) {
                            return { error: 'Path is outside the project directory.' };
                        }
                        if (!fs.existsSync(targetDir)) {
                            return { error: `Directory not found: ${filePath}` };
                        }

                        const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
                        const files = [];
                        const subdirs = [];

                        for (const entry of entries) {
                            if (entry.name.startsWith('.')) continue;
                            if (entry.isDirectory()) {
                                subdirs.push(entry.name);
                            } else {
                                const ext = path.extname(entry.name).toLowerCase();
                                if (!allowedExts.has(ext)) continue;
                                const fullEntryPath = path.join(targetDir, entry.name);
                                const stat = await fs.promises.stat(fullEntryPath);
                                const relPath = path.relative(projectPath, fullEntryPath).replace(/\\/g, '/');
                                files.push({
                                    name: entry.name,
                                    path: relPath,
                                    ext,
                                    size_kb: +(stat.size / 1024).toFixed(1),
                                    modified: stat.mtime.toISOString().slice(0, 10),
                                    attachable: ['.csv', '.tsv', '.json', '.jsonl', '.parquet', '.xlsx', '.xls'].includes(ext),
                                });
                            }
                        }

                        files.sort((a, b) => b.size_kb - a.size_kb);
                        return {
                            directory: filePath || '(project root)',
                            file_count: files.length,
                            files,
                            subdirectories: subdirs.slice(0, 20),
                            tip: files.some(f => f.attachable)
                                ? "Use attach_file with the 'path' field to register data files as queryable views."
                                : undefined,
                        };
                    }

                    // mode === 'read'
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
                        const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
                        return {
                            type: 'directory',
                            path: filePath,
                            entries: entries.slice(0, 100).map(e => ({ name: e.name, isDirectory: e.isDirectory() })),
                            tip: "Use mode='list' with extensions filter to discover data files.",
                        };
                    }

                    if (stat.size > MAX_FILE_SIZE) {
                        return { error: `File too large (${(stat.size / 1024).toFixed(1)}KB). Limit is ${MAX_FILE_SIZE / 1024}KB.` };
                    }

                    const ext = path.extname(fullPath).toLowerCase();
                    const binaryExts = ['.db', '.duckdb', '.sqlite', '.parquet', '.xlsx', '.xls', '.zip', '.gz', '.tar', '.png', '.jpg', '.gif', '.pdf', '.exe', '.dll', '.wasm', '.ducklake'];
                    if (binaryExts.includes(ext)) {
                        return { error: `Cannot read binary file (${ext}). Only text files are supported.` };
                    }

                    const content = await fs.promises.readFile(fullPath, 'utf8');
                    const lines = content.split('\n').length;
                    return { path: filePath, content, size: stat.size, lines };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        build_notebook: tool({
            description: "Create or update a SQL Notebook (.sqlnb). mode='create': new file, minimum 8 cells structured as (1) title+summary, (2) data overview, (3-4) profiling+quality, (5+) analysis pairs, (last) conclusions. mode='update': append cells via targetPath. IMPORTANT for storytelling: attach a `chart` to each analysis CODE cell so its result renders as a Story Flow chart — a report should be visual, not just text + tables.",
            inputSchema: z.object({
                mode: z.enum(['create', 'update']).optional().default('create').describe('"create" builds a new notebook (default); "update" appends to an existing one.'),
                title: z.string().describe('Analytical title. Required for create; used as section heading for update.'),
                targetPath: z.string().optional().describe('mode="update" only: relative path to an existing .sqlnb file.'),
                cells: z.array(z.object({
                    type: z.enum(['markdown', 'code']).describe('"markdown" for analysis prose; "code" for standalone SQL queries.'),
                    content: z.string().describe('Markdown: analytical text with findings (GFM tables/lists supported). Code: executable SQL.'),
                    chart: z.object({
                        chart_type: z.enum(['bar', 'bar-stacked', 'bar-horizontal', 'bar-100', 'line', 'area', 'donut', 'scatter', 'bubble', 'combo', 'funnel', 'heatmap', 'treemap', 'lollipop', 'slope', 'dumbbell', 'bump', 'histogram', 'boxplot', 'density', 'strip']).describe('Pick by message + data shape (same rules as display_chart): slope/dumbbell for two moments per category, bump for rank over periods, histogram/boxplot/density/strip for a distribution of RAW rows.'),
                        x_axis_key: z.string().describe('Column for the X axis / category.'),
                        y_axis_keys: z.array(z.string()).describe('Value column(s).'),
                        split_by: z.string().optional().describe('Column to split into one series per value (grouped bars / multi-line).'),
                        title: z.string().optional(),
                        subtitle: z.string().optional(),
                        color_theme: z.string().optional(),
                        date_aggregation: z.enum(['none', 'day', 'week', 'month', 'quarter', 'year']).optional(),
                        sort_mode: z.enum(['x-asc', 'x-desc', 'y-asc', 'y-desc', 'natural']).optional(),
                        show_data_labels: z.boolean().optional(),
                    }).optional().describe('Attach a chart to a CODE cell so its SQL result renders as a Story Flow chart in the notebook. Add one to every analysis query so the report is visual, not just text + tables.'),
                })).min(1).describe('Cells to add. create: min 8. update: just the new cells to append.'),
            }),
            execute: async ({ mode = 'create', title, targetPath, cells }) => {
                try {
                    if (!projectPath) return { error: 'No project directory available.' };

                    // Map a compact chart spec to the notebook cell's chartConfig (DataVisualizer
                    // shape). Stored under cell.state so the SQL result renders as a chart once run.
                    const cellState = (cell) => {
                        if (cell.type !== 'code' || !cell.chart) return undefined;
                        const c = cell.chart;
                        const chartConfig = {
                            chartType: c.chart_type,
                            xAxisKey: c.x_axis_key,
                            yAxisKeys: c.y_axis_keys,
                            ...(c.split_by !== undefined && { splitByKey: c.split_by }),
                            ...(c.title !== undefined && { chartTitle: c.title }),
                            ...(c.subtitle !== undefined && { chartSubtitle: c.subtitle }),
                            ...(c.color_theme !== undefined && { colorTheme: c.color_theme }),
                            ...(c.date_aggregation !== undefined && { dateAggregation: c.date_aggregation }),
                            ...(c.sort_mode !== undefined && { sortMode: c.sort_mode }),
                            ...(c.show_data_labels !== undefined && { showLabels: c.show_data_labels }),
                        };
                        return { viewMode: 'chart', chartConfig };
                    };

                    if (mode === 'update') {
                        if (!targetPath) return { error: 'targetPath is required for mode="update".' };
                        const absPath = path.isAbsolute(targetPath)
                            ? targetPath
                            : path.join(projectPath, targetPath);
                        if (!fs.existsSync(absPath)) return { error: `Notebook not found: ${targetPath}` };
                        const raw = await fs.promises.readFile(absPath, 'utf8');
                        const notebook = JSON.parse(raw);
                        const ts = Date.now();
                        const divider = { id: `${ts}_divider`, type: 'markdown', content: `---\n## ${title}` };
                        const newCells = cells.map((cell, i) => {
                            const state = cellState(cell);
                            return {
                                id: `${ts}_append_${i}`,
                                type: cell.type,
                                content: cell.content,
                                ...(state ? { state } : {}),
                            };
                        });
                        notebook.cells.push(divider, ...newCells);
                        await fs.promises.writeFile(absPath, JSON.stringify(notebook, null, 2), 'utf8');
                        const relativePath = path.relative(projectPath, absPath);
                        return {
                            success: true,
                            path: relativePath,
                            cellCount: notebook.cells.length,
                            fileName: path.basename(absPath),
                            appended: newCells.length,
                        };
                    }

                    const notebookCells = cells.map((cell, i) => {
                        const state = cellState(cell);
                        return {
                            id: `${Date.now()}_${i}`,
                            type: cell.type,
                            content: cell.content,
                            ...(state ? { state } : {}),
                        };
                    });

                    const notebook = { version: '3.0', cells: notebookCells, environment: {} };

                    const safeName = title
                        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                        .replace(/\s+/g, '_')
                        .substring(0, 60);
                    const fileName = `${safeName}.sqlnb`;
                    const filePath = path.join(projectPath, fileName);

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

        attach_file: tool({
            description: 'Register a CSV, JSON, Parquet, or Excel file as a queryable DuckDB view. Call this before using execute_sql on any file from context. Returns the view name to use in queries.',
            inputSchema: z.object({
                file_path: z.string().describe('Absolute path to the file (use the path shown in the Files context section).'),
                alias: z.string().optional().describe('Optional short view name (letters, digits, underscores). Derived from filename if omitted.'),
            }),
            execute: async ({ file_path: filePath, alias }) => {
                try {
                    const ext = path.extname(filePath).toLowerCase();
                    const baseName = path.basename(filePath, ext);
                    const viewName = (alias || baseName)
                        .replace(/[^a-zA-Z0-9_]/g, '_')
                        .replace(/^(\d)/, '_$1')
                        .substring(0, 60) || 'attached_file';

                    const safePath = filePath.replace(/'/g, "''");

                    let readerExpr;
                    switch (ext) {
                        case '.csv': case '.tsv': case '.txt':
                            readerExpr = `read_csv_auto('${safePath}')`;
                            break;
                        case '.json': case '.jsonl': case '.ndjson':
                            readerExpr = `read_json_auto('${safePath}')`;
                            break;
                        case '.parquet':
                            readerExpr = `read_parquet('${safePath}')`;
                            break;
                        case '.xlsx': case '.xls':
                            readerExpr = `read_xlsx('${safePath}')`;
                            break;
                        default:
                            readerExpr = `read_csv_auto('${safePath}')`;
                    }

                    try { await db.systemQuery(`DROP TABLE IF EXISTS "${viewName}"`); } catch (_) {}
                    try { await db.systemQuery(`DROP VIEW IF EXISTS "${viewName}"`); } catch (_) {}
                    await db.systemQuery(`CREATE VIEW "${viewName}" AS SELECT * FROM ${readerExpr}`);

                    const columns = await db.systemQuery(`DESCRIBE "${viewName}"`);
                    const countRes = await db.systemQuery(`SELECT COUNT(*) AS cnt FROM "${viewName}"`);
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

        profile_data: tool({
            description: 'Statistical profile of a table: row count, null %, unique counts, min/max/avg for numeric columns, date ranges, and top values for categoricals. Use at the START of any EDA to understand the data shape in a single call.',
            inputSchema: z.object({
                table_name: z.string().describe('Table or view name to profile.'),
                columns: z.array(z.string()).optional().describe('Subset of columns to profile. Omit to profile all (up to 40).'),
            }),
            execute: async ({ table_name, columns }) => {
                try {
                    const { profileTable } = require('./profiling');
                    const tableExpr = `"${table_name.replace(/"/g, '""')}"`;
                    return await profileTable(db, tableExpr, columns || null);
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
            },
        }),

        // Merged: validate_sql + explain_query (detailed=true for verbose plan)
        validate_sql: tool({
            description: 'Validate a SQL query for syntax and schema correctness without executing it. Returns the query execution plan if valid, or a detailed error. Set detailed=true for a verbose plan showing operators, estimated row counts, and join strategies. Use before running expensive queries on large tables.',
            inputSchema: z.object({
                query: z.string().describe('The DuckDB SQL query to validate.'),
                detailed: z.boolean().optional().describe('If true, returns EXPLAIN VERBOSE for full plan details. Default: false.'),
            }),
            execute: async ({ query, detailed = false }) => {
                if (!query || typeof query !== 'string') {
                    return { valid: false, error: 'Query must be a non-empty string.' };
                }
                try {
                    const explainSql = detailed ? `EXPLAIN (FORMAT JSON) ${query}` : `EXPLAIN ${query}`;
                    const plan = await db.systemQuery(explainSql);
                    const planText = plan.map(r => Object.values(r).join('\t')).join('\n');
                    return {
                        valid: true,
                        message: 'SQL is valid.',
                        plan: planText.substring(0, detailed ? 4000 : 2000),
                        note: detailed ? 'Verbose execution plan.' : 'Estimated plan — no data was read or modified.',
                    };
                } catch (err) {
                    const errMsg = err?.message || String(err);
                    const msg = errMsg.toLowerCase();
                    let hint;
                    if (msg.includes('column') && (msg.includes('not found') || msg.includes('does not exist'))) {
                        hint = 'Column not found. Call describe_table to verify exact column names.';
                    } else if (msg.includes('does not exist') || msg.includes('not found')) {
                        hint = 'Table/view not found. Call list_tables to see available objects.';
                    } else if (msg.includes('syntax') || msg.includes('parser') || msg.includes('binder')) {
                        hint = 'DuckDB rejected this syntax. Do NOT show it to the user. Call lookup_duckdb_docs for the feature (or lookup_duckdb_function for a function signature), fix the SQL, and validate again.';
                    } else {
                        hint = 'Fix the query and retry. Use list_tables and describe_table to verify names.';
                    }
                    return { valid: false, error: errMsg, hint };
                }
            },
        }),

        suggest_followups: tool({
            description: 'After completing an analysis, suggest 2-4 follow-up questions the user might want to explore. Call this as the final step.',
            inputSchema: z.object({
                suggestions: z.array(z.string()).min(2).max(4)
                    .describe('Array of 2-4 follow-up question suggestions based on the analysis.'),
            }),
            execute: async ({ suggestions }) => {
                return { suggestions };
            },
        }),
    };

    // ─── Mode-specific tools ───────────────────────────────────────────────────

    if (mode === 'assistant') {
        // Los modelos pequeños mandan a veces el objetivo de propose_change como un
        // número suelto («"4"»), sin `kind` o con los números como texto (visto con
        // un modelo local de 2B en E4). Se convierte antes de validar, en vez de
        // devolverles un error de esquema que no saben leer. El JSON Schema que ve
        // el modelo no cambia (el conversor usa el esquema de dentro).
        const tolerante = ({ porNumero = null, porClave = [], numericos = [] }) => (v) => {
            const esNumero = (x) => typeof x === 'number' || (typeof x === 'string' && /^\s*\d+\s*$/.test(x));
            if (porNumero && esNumero(v)) return { kind: porNumero.kind, [porNumero.campo]: Number(v) };
            if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
            const o = { ...v };
            for (const k of numericos) if (typeof o[k] === 'string' && esNumero(o[k])) o[k] = Number(o[k]);
            if (!o.kind) { const m = porClave.find(([campo]) => campo in o); if (m) o.kind = m[1]; }
            return o;
        };

        // Nada de lo que propone el Assistant escribe en disco (plan del
        // Assistant, E1/X1). Antes `write_file` tenía además los modos `create` y
        // `append`, que escribían directamente —`create` pisaba un archivo que ya
        // existiera— sin que el usuario viera nada.
        //
        // write_file: una versión nueva del archivo activo, para revisar en el
        // chat. Solo se ofrece si el archivo admite propuestas: en los
        // estructurados (gráfico, Data Flow, Canvas, diagrama) reescribir el
        // fuente a mano lo rompe o no se ve, y si el modelo no ve el archivo
        // entero (recortado o con partes retenidas) perdería lo que no ve.
        // propose_change (E2): en los archivos que se cambian por líneas (.sql,
        // texto), un RANGO en lugar del archivo entero. El modelo ve las líneas
        // numeradas; aquí se comprueba que el rango exista y, si manda el texto que
        // cree reemplazar, que coincida (o se busca dónde está). La respuesta lleva
        // `original` y las líneas vecinas: el cliente ubica el cambio aunque el
        // archivo se haya movido, y lo da por caducado si esa parte cambió.
        if (archivo && archivo.porLineas && archivo.puedeProponer) {
            allTools.propose_change = tool({
                description: "Propose replacing a range of lines of the ACTIVE file. The user reviews it as a diff in their editor and accepts or rejects it; nothing is saved to disk. Use the line numbers shown in 'Current editor state'. Change only the lines the request needs. To insert without replacing anything, set end_line = start_line - 1 (the text goes before start_line); to add at the end, start_line = last line + 1.",
                inputSchema: z.object({
                    target: z.preprocess(tolerante({ porClave: [['start_line', 'lines']], numericos: ['start_line', 'end_line'] }), z.discriminatedUnion('kind', [
                        z.object({
                            kind: z.literal('lines'),
                            start_line: z.number().int().min(1).describe('First line replaced (1-based).'),
                            end_line: z.number().int().min(0).describe('Last line replaced, inclusive. start_line - 1 to insert without replacing.'),
                            current_text: z.string().optional().describe('The exact current text of those lines (without line-number prefixes), to make sure the change lands in the right place.'),
                        }),
                    ])),
                    new_text: z.string().describe('The new text for those lines, without line-number prefixes. Empty string deletes them.'),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ target, new_text: nuevo, summary = '' }) => {
                    const lineas = String(archivo.contenido || '').split(/\r?\n/);
                    const n = lineas.length;
                    let desde = target.start_line;
                    let hasta = target.end_line;
                    if (desde > n + 1 || hasta < desde - 1 || hasta > n) {
                        return { error: `The file has ${n} lines: start_line must be 1–${n + 1} and end_line between start_line - 1 and ${n}.` };
                    }
                    const sinPrefijo = (t) => String(t || '').replace(/\r/g, '').split('\n').map(l => l.replace(/^\s*\d+\s\|\s?/, ''));
                    const igual = (a, b) => a.length === b.length && a.every((l, i) => l.trimEnd() === b[i].trimEnd());
                    if (target.current_text !== undefined && target.current_text.trim()) {
                        const buscado = sinPrefijo(target.current_text);
                        if (!igual(lineas.slice(desde - 1, hasta), buscado)) {
                            // El texto existe en otro sitio (números corridos): se corrige el rango si es único.
                            const hallados = [];
                            for (let i = 0; i + buscado.length <= n; i++) {
                                if (igual(lineas.slice(i, i + buscado.length), buscado)) hallados.push(i);
                            }
                            if (hallados.length !== 1) {
                                return { error: `Lines ${desde}–${hasta} are:\n${lineas.slice(desde - 1, hasta).join('\n') || '(nothing: it is an insertion point)'}\nThey don't match current_text${hallados.length > 1 ? ', which appears more than once' : ''}. Check the line numbers and call again.` };
                            }
                            desde = hallados[0] + 1;
                            hasta = hallados[0] + buscado.length;
                        }
                    }
                    const original = lineas.slice(desde - 1, hasta).join('\n');
                    const contenido = sinPrefijo(nuevo).join('\n');
                    if (contenido === original) return { error: 'new_text is the same as the current lines: there is nothing to change.' };
                    return {
                        success: true,
                        action: 'propose_change',
                        objetivo: { tipo: 'rango', desde, hasta },
                        contenido,
                        original,
                        // Las líneas vecinas: con ellas se ubica una inserción (que no tiene `original`).
                        ancla: { antes: desde > 1 ? lineas[desde - 2] : null, despues: hasta < n ? lineas[hasta] : null },
                        resumen: summary,
                    };
                },
            });
        }

        // propose_change por celdas (E3): un notebook se cambia celda a celda,
        // nunca entero. El modelo señala la celda por su número; aquí se comprueba
        // que exista y que sea del tipo que dice, y la respuesta lleva su nombre y
        // su texto, con los que el editor la vuelve a encontrar aunque se haya
        // movido, o da la propuesta por caducada si cambió.
        if (archivo && archivo.porCeldas && archivo.puedeProponer) {
            const celdas = archivo.celdas || [];
            allTools.propose_change = tool({
                description: "Propose ONE change to the ACTIVE notebook: replace the text of a cell (kind 'cell', with its number as shown in 'Current editor state') or add a new cell after one (kind 'new_cell', after_cell = its number, 0 for the top). The user reviews it on the cell and accepts or rejects it; nothing is saved to disk. For several cells, call it once per cell.",
                inputSchema: z.object({
                    target: z.preprocess(tolerante({ porNumero: { kind: 'cell', campo: 'cell' }, porClave: [['after_cell', 'new_cell'], ['cell', 'cell']], numericos: ['cell', 'after_cell'] }), z.discriminatedUnion('kind', [
                        z.object({
                            kind: z.literal('cell'),
                            cell: z.number().int().min(1).describe('The number of the cell whose text changes.'),
                        }),
                        z.object({
                            kind: z.literal('new_cell'),
                            after_cell: z.number().int().min(0).describe('The new cell goes after this cell number (0 = at the top).'),
                            cell_type: z.enum(['sql', 'text']),
                            name: z.string().optional().describe('For a SQL cell: a short snake_case name, different from the other cells (it becomes the view other cells read).'),
                        }),
                    ])),
                    new_text: z.string().describe('The full new text of that cell (SQL, or Markdown for a text cell), without fences or cell markers.'),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ target, new_text: nuevo, summary = '' }) => {
                    const sinCerca = String(nuevo || '').replace(/\r/g, '').replace(/^\s*```(?:sql)?\s*\n/, '').replace(/\n\s*```\s*$/, '').trim();
                    const lista = celdas.map(c => `${c.n} ${c.tipo === 'texto' ? 'text' : 'SQL'}${c.nombre ? ` ${c.nombre}` : ''}`).join(', ');
                    if (target.kind === 'cell') {
                        const c = celdas.find(x => x.n === target.cell);
                        if (!c) return { error: `There is no cell ${target.cell}. The cells are: ${lista}.` };
                        if (sinCerca === String(c.texto).trim()) return { error: 'new_text is the same as the cell: there is nothing to change.' };
                        return {
                            success: true, action: 'propose_change',
                            objetivo: { tipo: 'celda', accion: 'cambiar', n: c.n, celdaTipo: c.tipo },
                            contenido: sinCerca, original: c.texto, anclaNombre: c.nombre || null, resumen: summary,
                        };
                    }
                    const tras = target.after_cell;
                    if (tras > celdas.length) return { error: `There are ${celdas.length} cells: after_cell must be 0–${celdas.length}.` };
                    const tipo = target.cell_type === 'text' ? 'texto' : 'sql';
                    let nombre = null;
                    if (tipo === 'sql' && target.name) {
                        nombre = String(target.name).trim();
                        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre)) return { error: `"${nombre}" is not a valid cell name: use letters, digits and underscores, starting with a letter.` };
                        if (celdas.some(c => String(c.nombre || '').toLowerCase() === nombre.toLowerCase())) return { error: `There is already a cell named ${nombre}. Pick another name.` };
                    }
                    if (!sinCerca) return { error: 'new_text is empty.' };
                    const ancla = tras ? celdas.find(x => x.n === tras) : null;
                    return {
                        success: true, action: 'propose_change',
                        objetivo: { tipo: 'celda', accion: 'despues_de', n: tras, celdaTipo: tipo, nombre },
                        contenido: sinCerca, original: ancla ? ancla.texto : null, anclaNombre: ancla?.nombre || null, resumen: summary,
                    };
                },
            });
        }

        // propose_change por láminas (E4): un deck se cambia lámina a lámina, nunca
        // entero (R1). El modelo manda las PARTES de la lámina —diseño, texto,
        // gráficos, notas— y el Studio la compone con su propio constructor, así
        // las directivas que no ve (antetítulo, pie, tono) no se pierden. Aquí se
        // comprueba que el diseño exista, que los gráficos que nombra existan y que
        // el texto no parta la lámina en dos.
        if (archivo && archivo.porLaminas && archivo.puedeProponer) {
            const laminas = archivo.laminas || [];
            const disenos = archivo.disenos || [];
            allTools.propose_change = tool({
                description: "Propose ONE change to the ACTIVE Report Flow deck: change a slide (kind 'slide', its number as shown in 'Current editor state') or add a new slide after one (kind 'new_slide', after_slide = its number, 0 for the start). Send the slide's parts: layout, text (its markdown, without charts or notes), charts (paths of .amoxvis files) and notes. A part you leave out stays as it is. The user reviews it on the slide and accepts or rejects it; nothing is saved to disk. For several slides, call it once per slide.",
                inputSchema: z.object({
                    target: z.preprocess(tolerante({ porNumero: { kind: 'slide', campo: 'slide' }, porClave: [['after_slide', 'new_slide'], ['slide', 'slide']], numericos: ['slide', 'after_slide'] }), z.discriminatedUnion('kind', [
                        z.object({ kind: z.literal('slide'), slide: z.number().int().min(1).describe('The number of the slide that changes.') }),
                        z.object({ kind: z.literal('new_slide'), after_slide: z.number().int().min(0).describe('The new slide goes after this slide number (0 = at the start).') }),
                    ])),
                    layout: z.string().optional().describe(`The slide's layout, one of: ${disenos.join(', ')}. Leave it out to keep the current one (a new slide defaults to content).`),
                    text: z.string().optional().describe("The slide's markdown text: its heading (the claim) and body. No ```amoxchart or ```notes blocks and no --- lines (they would split the slide). Leave it out to keep the current text."),
                    charts: z.array(z.string()).optional().describe('Paths of the .amoxvis charts on the slide, in order (project-relative). Leave it out to keep the current charts; [] removes them.'),
                    notes: z.string().optional().describe('Speaker notes. Leave it out to keep the current ones.'),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ target, layout, text, charts, notes, summary = '' }) => {
                    const lista = laminas.map(l => `${l.n} ${l.diseno}${l.titulo ? ` "${l.titulo}"` : ''}`).join(', ');
                    if (layout !== undefined && !disenos.includes(layout)) {
                        return { error: `"${layout}" is not a layout. Use one of: ${disenos.join(', ')}.` };
                    }
                    let prosa = text;
                    if (prosa !== undefined) {
                        prosa = String(prosa).replace(/\r/g, '').replace(/^\s*<!--\s*layout:\s*[\w-]+\s*-->\s*\n?/, '').trim();
                        if (/```(amoxchart|notes)\b/.test(prosa)) return { error: 'Put charts in `charts` and speaker notes in `notes`, not as blocks inside `text`.' };
                        let enCerca = false;
                        for (const linea of prosa.split('\n')) {
                            if (/^\s*(```|~~~)/.test(linea)) enCerca = !enCerca;
                            if (!enCerca && linea.trim() === '---') return { error: 'A line with only --- splits the slide in two. Remove it (to add a slide, call propose_change again with kind new_slide).' };
                        }
                    }
                    if (Array.isArray(charts) && projectPath) {
                        const raiz = path.resolve(projectPath);
                        const faltan = charts.filter(src => {
                            const completo = path.resolve(raiz, String(src).replace(/^(\.\/|\/)/, ''));
                            return !completo.startsWith(raiz + path.sep) || !/\.amoxvis$/i.test(completo) || !fs.existsSync(completo);
                        });
                        if (faltan.length) return { error: `These charts do not exist in the project: ${faltan.join(', ')}. Use the path of an existing .amoxvis (list them with read_file mode 'list').` };
                    }
                    const parte = {
                        ...(layout !== undefined ? { diseno: layout } : {}),
                        ...(prosa !== undefined ? { prosa } : {}),
                        ...(Array.isArray(charts) ? { graficos: charts.map(String) } : {}),
                        ...(notes !== undefined ? { notas: String(notes) } : {}),
                    };
                    if (target.kind === 'slide') {
                        const l = laminas.find(x => x.n === target.slide);
                        if (!l) return { error: `There is no slide ${target.slide}. The slides are: ${lista}.` };
                        const igual = (parte.diseno === undefined || parte.diseno === l.diseno)
                            && (parte.prosa === undefined || parte.prosa === String(l.prosa).trim())
                            && (parte.graficos === undefined || JSON.stringify(parte.graficos) === JSON.stringify(l.graficos))
                            && (parte.notas === undefined || parte.notas.trim() === String(l.notas).trim());
                        if (igual) return { error: 'That is the slide as it already is: there is nothing to change.' };
                        return {
                            success: true, action: 'propose_change',
                            objetivo: { tipo: 'lamina', accion: 'cambiar', n: l.n },
                            lamina: parte, original: l.raw, resumen: summary,
                        };
                    }
                    const tras = target.after_slide;
                    if (tras > laminas.length) return { error: `There are ${laminas.length} slides: after_slide must be 0–${laminas.length}.` };
                    if (!parte.prosa && !parte.graficos?.length) return { error: 'A new slide needs a text or a chart.' };
                    const ancla = tras ? laminas.find(x => x.n === tras) : null;
                    return {
                        success: true, action: 'propose_change',
                        objetivo: { tipo: 'lamina', accion: 'despues_de', n: tras },
                        lamina: { diseno: 'content', ...parte }, original: ancla ? ancla.raw : null, resumen: summary,
                    };
                },
            });
        }

        // propose_change por paneles (E4, V1): un gráfico se cambia por sus paneles
        // —las mismas claves que guarda Story Flow—, nunca reescribiendo su JSON,
        // que en modo interfaz se rehace al abrir. Se validan las claves, el tipo
        // de valor, las columnas y que el tipo de gráfico dibuje ese panel (la tabla
        // `capacidades` del cliente, que llega en la estructura). En la vista Code
        // cabe además un Vega-Lite entero, compilado aquí como en display_chart.
        if (archivo && archivo.porPaneles && archivo.puedeProponer) {
            const g = archivo.grafico;
            const claves = g.claves || {};
            const columnas = (g.columnas || []).map(c => (typeof c === 'string' ? c : c.name));
            const COMPUESTOS = { 'bar-stacked': { chartType: 'bar', barStackMode: 'stack' }, 'bar-100': { chartType: 'bar', barStackMode: 'expand' }, 'bar-horizontal-stacked': { chartType: 'bar-horizontal', barStackMode: 'stack' }, 'bar-horizontal-100': { chartType: 'bar-horizontal', barStackMode: 'expand' }, bubble: { chartType: 'scatter' } };
            const DE_COLUMNA = ['xAxisKey', 'yAxisKeys', 'rightYAxisKey', 'splitByKey', 'bubbleSizeKey', 'errorLowKey', 'errorHighKey', 'bandLowKey', 'bandHighKey', 'facetKey', 'tooltipFields', 'comboLineKeys'];
            const FUNCION = { highlightConfig: 'resalte', refLine: 'referencias', goalLine: 'referencias', refArea: 'referencias', trendLine: 'tendencia', annotations: 'anotaciones', splitByKey: 'partir', bubbleSizeKey: 'tamano', rightYAxisKey: 'derecha', bandLowKey: 'banda', bandHighKey: 'banda', showLabels: 'etiquetas', facetKey: 'facetas', isCumulative: 'acumulado', endLabels: 'finales' };
            const esObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
            const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
            allTools.propose_change = tool({
                description: "Propose a change to the ACTIVE Story Flow chart. kind 'panels': the Story Flow settings that change (the same keys the chart keeps, e.g. chartType, xAxisKey, yAxisKeys, splitByKey, sortMode, limit, colorTheme, chartTitle, chartSubtitle, takeaway, highlightConfig, refLine, goalLine, trendLine, annotations, showLabels, legendPosition). Objects (highlightConfig, refLine…) merge with their current value. kind 'spec' (only in the Code view): a complete Vega-Lite v6 spec with data {\"name\": \"dataset\"}. The user sees Before / Proposal on the figure and accepts or rejects it; nothing is saved to disk.",
                inputSchema: z.object({
                    target: z.preprocess((v) => {
                        if (!v || typeof v !== 'object' || Array.isArray(v) || v.kind) return v;
                        if (v.vega_lite) return { kind: 'spec', vega_lite: v.vega_lite };
                        if (v.changes) return { kind: 'panels', changes: v.changes };
                        return { kind: 'panels', changes: v };
                    }, z.discriminatedUnion('kind', [
                        z.object({ kind: z.literal('panels'), changes: z.record(z.string(), z.any()).describe('Story Flow keys → new values. Only the keys that change.') }),
                        z.object({ kind: z.literal('spec'), vega_lite: z.record(z.string(), z.any()).describe('A complete Vega-Lite v6 spec; data must be {"name": "dataset"}. Only in the Code view.') }),
                    ])),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ target, summary = '' }) => {
                    if (target.kind === 'spec') {
                        if (g.vista !== 'codigo' && g.modo !== 'codigo') return { error: "A Vega-Lite spec is only proposed in the Code view. Use kind 'panels' with Story Flow keys." };
                        const { title: _t, usermeta: _u, ...resto } = target.vega_lite || {};
                        const spec = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', ...resto, data: { name: 'dataset' } };
                        try {
                            const vl = await import('vega-lite');
                            const logger = { level() { return this; }, warn() {}, info() {}, debug() {}, error() {} };
                            vl.compile(spec, { logger });
                        } catch (e) {
                            return { error: `The spec does not compile: ${e.message}. Fix it and call again.` };
                        }
                        if (columnas.length) {
                            const usados = new Set();
                            const derivados = new Set();
                            JSON.stringify(spec, (k, v) => {
                                if (k === 'field' && typeof v === 'string') usados.add(v.replace(/\\(.)/g, '$1'));
                                if (k === 'as') (Array.isArray(v) ? v : [v]).forEach(x => typeof x === 'string' && derivados.add(x));
                                return v;
                            });
                            const ajenos = [...usados].filter(f => !columnas.includes(f) && !derivados.has(f));
                            if (ajenos.length) return { error: `The spec uses field(s) not in the result: ${ajenos.join(', ')}. Columns: ${columnas.join(', ')}.` };
                        }
                        return { success: true, action: 'propose_change', objetivo: { tipo: 'spec' }, spec, resumen: summary };
                    }
                    const errores = [];
                    let cambios = {};
                    for (const [k, v] of Object.entries(target.changes || {})) {
                        if (k === 'chartType' && COMPUESTOS[v]) { cambios = { ...cambios, ...COMPUESTOS[v] }; continue; }
                        if (!(k in claves)) { errores.push(`"${k}" is not a Story Flow setting`); continue; }
                        const t = claves[k];
                        if (t !== 'any' && !(t === 'array' ? Array.isArray(v) : typeof v === t)) { errores.push(`"${k}" must be ${t === 'array' ? 'a list' : `a ${t}`}`); continue; }
                        cambios[k] = v;
                    }
                    if (cambios.chartType && g.tipos.length && !g.tipos.includes(cambios.chartType)) {
                        errores.push(`"${cambios.chartType}" is not a chart type (use one of: ${g.tipos.join(', ')})`);
                        delete cambios.chartType;
                    }
                    if (columnas.length) {
                        for (const k of DE_COLUMNA) {
                            if (!(k in cambios)) continue;
                            const fuera = (Array.isArray(cambios[k]) ? cambios[k] : [cambios[k]]).filter(x => x !== '' && x != null && !columnas.includes(x));
                            if (fuera.length) { errores.push(`${k}: ${fuera.join(', ')} is not a column of the result (columns: ${columnas.join(', ')})`); delete cambios[k]; }
                        }
                    }
                    const tipo = cambios.chartType || g.tipo;
                    for (const [k, pieza] of Object.entries(FUNCION)) {
                        if (!(k in cambios) || !Array.isArray(g.admite[pieza])) continue;
                        const v = cambios[k];
                        const apaga = v === '' || v === false || (Array.isArray(v) && !v.length) || (esObj(v) && (v.type === 'none' || v.enabled === false));
                        if (!apaga && !g.admite[pieza].includes(tipo)) { errores.push(`a ${tipo} chart does not draw ${k}`); delete cambios[k]; }
                    }
                    if (errores.length) return { error: `Nothing was proposed: ${errores.join('; ')}. Fix it and call again.` };
                    const original = {};
                    for (const k of Object.keys(cambios)) original[k] = g.valores[k] === undefined ? null : g.valores[k];
                    const cambia = Object.keys(cambios).some(k => !igual(esObj(cambios[k]) && esObj(original[k]) ? { ...original[k], ...cambios[k] } : cambios[k], original[k]));
                    if (!cambia) return { error: 'Those settings are already as they are: there is nothing to change.' };
                    return { success: true, action: 'propose_change', objetivo: { tipo: 'paneles' }, cambios, original, resumen: summary };
                },
            });
        }

        // propose_change por pasos (E5, F1): un Data Flow se cambia con operaciones
        // sobre sus pasos —añadir, cambiar la configuración, quitar, conectar—, que
        // se aplican aquí sobre el .sqlchain: tipos de paso que existen, ids que no
        // chocan, sin ciclos. La respuesta lleva el flujo que quedaría (sin
        // posiciones: las pone el lienzo) y la lista de diffDeProcesos (F3).
        if (archivo && archivo.porPasos && archivo.puedeProponer) {
            const E = require('./estructurados');
            const paso = z.object({ id: z.string(), type: z.string(), label: z.string().optional(), config: z.record(z.string(), z.any()).optional(), after: z.array(z.string()).optional().describe('The steps it reads from (its inputs).') });
            const lista = (s) => z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(s)).optional();
            allTools.propose_change = tool({
                description: "Propose a change to the ACTIVE Data Flow through operations on its steps: add steps (with the steps they read from), change a step's label or config (the keys you send replace those keys), remove steps, connect or disconnect two steps. Use the step ids shown in 'Current editor state'. The user sees the new steps as ghosts on the canvas with the list of changes, and accepts or rejects; nothing is saved to disk. Several operations can go in one call.",
                inputSchema: z.object({
                    add: lista(paso).describe('New steps. id: short snake_case, not used yet. type: one of the step types. config: as in the step types list.'),
                    change: lista(z.object({ id: z.string(), label: z.string().optional(), config: z.record(z.string(), z.any()).optional(), disabled: z.boolean().optional() })),
                    remove: lista(z.string()),
                    connect: lista(z.object({ from: z.string(), to: z.string() })),
                    disconnect: lista(z.object({ from: z.string(), to: z.string() })),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ summary = '', ...ops }) => {
                    const r = E.aplicarPasos(archivo.flujo, ops);
                    if (r.error) return { error: r.error };
                    const sinPos = (d) => ({ nodes: d.nodes, edges: d.edges });
                    return {
                        success: true, action: 'propose_change', objetivo: { tipo: 'pasos' },
                        despues: sinPos(r.despues), original: r.original, cambios: r.lineas, resumen: summary,
                    };
                },
            });
        }

        // propose_change por tarjetas (E5): en el Canvas, cambiar el SQL o el texto
        // de una tarjeta, o añadir una (una consulta que lee la seleccionada, una
        // nota, un texto). Nunca las fotos ni las posiciones.
        if (archivo && archivo.porTarjetas && archivo.puedeProponer) {
            const E = require('./estructurados');
            const tarjetas = archivo.lienzo.tarjetas;
            allTools.propose_change = tool({
                description: "Propose ONE change to the ACTIVE Canvas: change the SQL of a Query card or the text of a Note/Text card (kind 'card'), or add a new card (kind 'new_card': a 'query' that reads other cards with FROM <their name>, a 'note' or a 'text'), placed next to the card in `near`. The user sees it on the canvas as a ghost card and accepts or rejects it; nothing is saved to disk.",
                inputSchema: z.object({
                    target: z.preprocess(tolerante({ porClave: [['card_type', 'new_card'], ['card', 'card']] }), z.discriminatedUnion('kind', [
                        z.object({ kind: z.literal('card'), card: z.string().describe('The id (name) of the card that changes.') }),
                        z.object({
                            kind: z.literal('new_card'),
                            card_type: z.enum(['query', 'note', 'text']),
                            name: z.string().optional().describe('For a query: a short snake_case name (it becomes the view other cards read). Must be new.'),
                            near: z.string().optional().describe('The card it goes next to (usually the one it reads, or the selected one).'),
                        }),
                    ])),
                    content: z.string().describe('The SQL (for a query) or the text (for a note or a text card).'),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ target, content, summary = '' }) => {
                    const nuevo = String(content || '').replace(/\r/g, '').replace(/^\s*```(?:sql)?\s*\n/, '').replace(/\n\s*```\s*$/, '').trim();
                    if (!nuevo) return { error: 'content is empty.' };
                    const ids = tarjetas.map(t => `${t.id} (${t.tipo})`).join(', ');
                    if (target.kind === 'card') {
                        const t = tarjetas.find(x => x.id === target.card);
                        if (!t) return { error: `There is no card "${target.card}". The cards are: ${ids}.` };
                        const campo = t.tipo === 'query' ? 'sql' : (t.tipo === 'note' || t.tipo === 'text') ? 'texto' : null;
                        if (!campo) return { error: `A ${t.tipo} card is not changed with text: only queries (SQL), notes and texts.` };
                        const antes = String(t[campo] || '');
                        if (antes.trim() === nuevo) return { error: 'That is the card as it already is: there is nothing to change.' };
                        return { success: true, action: 'propose_change', objetivo: { tipo: 'tarjeta', accion: 'cambiar', id: t.id, tarjetaTipo: t.tipo, campo }, contenido: nuevo, original: antes, resumen: summary };
                    }
                    const tipo = target.card_type;
                    let id = target.name ? String(target.name).trim() : null;
                    if (id && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return { error: `"${id}" is not a valid card name: letters, digits and underscores, starting with a letter.` };
                    if (id && tarjetas.some(t => t.id.toLowerCase() === id.toLowerCase())) return { error: `There is already a card named "${id}". Pick another name.` };
                    if (tipo === 'query' && !id) return { error: 'A new query needs a name (it becomes the view other cards read).' };
                    if (target.near && !tarjetas.some(t => t.id === target.near)) return { error: `There is no card "${target.near}" to place it next to. The cards are: ${ids}.` };
                    return {
                        success: true, action: 'propose_change',
                        objetivo: { tipo: 'tarjeta', accion: 'nueva', id, tarjetaTipo: tipo, campo: E.TARJETAS_NUEVAS[tipo], cerca: target.near || null },
                        contenido: nuevo, original: null, resumen: summary,
                    };
                },
            });
        }

        // propose_change del diagrama (E5, D1): el diagrama entero —es pequeño y es
        // la unidad—, pero como grafo (cajas, flechas, grupos), nunca como mermaid:
        // el editor lo escribe con su propio serializador, así que lo que entra
        // siempre se puede volver a editar visualmente.
        if (archivo && archivo.porDiagrama && archivo.puedeProponer) {
            const E = require('./estructurados');
            const d = archivo.diagrama;
            allTools.propose_change = tool({
                description: `Propose the ACTIVE diagram as it should be: all its boxes, arrows and groups (boxes you leave out are removed). Keep the ids of the boxes that stay. Shapes: ${d.formas.join(', ')}. Arrow styles: ${d.estilos.join(', ')}. The user sees Before / Proposal drawn and accepts or rejects it; nothing is saved to disk.`,
                inputSchema: z.object({
                    diagram: z.object({
                        direction: z.enum(['TB', 'TD', 'BT', 'LR', 'RL']).optional(),
                        nodes: z.array(z.object({ id: z.string(), text: z.string(), shape: z.string().optional(), layer: z.string().optional() })),
                        edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), style: z.string().optional() })).optional(),
                        groups: z.array(z.object({ id: z.string(), title: z.string().optional(), nodes: z.array(z.string()) })).optional(),
                    }),
                    summary: z.string().optional().default('').describe('One short line saying what changes.'),
                }),
                execute: async ({ diagram, summary = '' }) => {
                    const v = E.validarDiagrama(diagram, d);
                    if (v.error) return { error: v.error };
                    if (E.estable({ ...v.grafo }) === E.estable({ direccion: d.grafo.direccion, nodos: d.grafo.nodos, aristas: d.grafo.aristas, subgrafos: d.grafo.subgrafos || [] })) {
                        return { error: 'That is the diagram as it already is: there is nothing to change.' };
                    }
                    return { success: true, action: 'propose_change', objetivo: { tipo: 'diagrama' }, grafo: v.grafo, original: d.mermaid, resumen: summary };
                },
            });
        }

        if (!archivo || (archivo.puedeProponer && !archivo.porLineas && !archivo.porCeldas && !archivo.porLaminas && !archivo.porPaneles
            && !archivo.porPasos && !archivo.porTarjetas && !archivo.porDiagrama)) {
            allTools.write_file = tool({
                description: "Propose a new version of the ACTIVE file. The user reviews it in the chat and clicks Accept or Reject; accepting puts it in the editor without saving to disk. Send the COMPLETE file content, keeping every part you were not asked to change exactly as it is.",
                inputSchema: z.object({
                    content: z.string().describe('The complete new content of the active file.'),
                    description: z.string().optional().default('Updated by AmoxSQL AI').describe('One short line saying what changed.'),
                }),
                execute: async ({ content, description: desc = 'Updated by AmoxSQL AI' }) => (
                    // El cliente la guarda como propuesta pendiente: no se escribe nada.
                    { success: true, content, description: desc, action: 'edit_file' }
                ),
            });
        }

        // propose_file: un archivo NUEVO. El usuario lo ve y decide si se crea;
        // si ya existe, se dice y no se ofrece crear (nunca se pisa).
        allTools.propose_file = tool({
            description: "Propose creating a NEW file in the project (for example a .sql with a query the user asked for). Nothing is written: the user sees the path and content and decides whether to create it. It never overwrites an existing file — pick a new name if the path exists.",
            inputSchema: z.object({
                file_path: z.string().describe("Relative path inside the project, with its extension, e.g. 'queries/ventas_por_region.sql'."),
                content: z.string().describe('The complete content of the new file.'),
                description: z.string().optional().default('').describe('One short line saying what the file is for.'),
            }),
            execute: async ({ file_path: filePath, content, description: desc = '' }) => {
                if (!projectPath) return { error: 'No project directory.' };
                const normalized = path.normalize(String(filePath || '').trim());
                if (!normalized || normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized)) {
                    return { error: 'Invalid path. Use a relative path inside the project, with the file name and extension.' };
                }
                const fullPath = path.join(projectPath, normalized);
                if (!path.resolve(fullPath).startsWith(path.resolve(projectPath) + path.sep)) {
                    return { error: 'Path is outside the project directory.' };
                }
                const ruta = normalized.split(path.sep).join('/');
                if (fs.existsSync(fullPath)) {
                    return { error: `${ruta} already exists. Propose a different file name; an existing file is never overwritten.` };
                }
                return { success: true, action: 'propose_file', path: ruta, content, description: desc };
            },
        });

        // Assistant mode doesn't get build_notebook
        delete allTools.build_notebook;
    }

    // ─── Diving-mode tools ─────────────────────────────────────────────────────
    // final_answer and ask_user always available in diving mode (structured output
    // and user handoff are always needed, regardless of whether the planner is active).

    if (mode === 'diving') {
        allTools.final_answer = tool({
            description: 'Signal that the analysis is complete — the structured recap of the closing narrative you just wrote in the chat. Call it as the LAST action. ALWAYS include `summary` (your closing story in prose) AND the structured fields; they complement each other, they do not replace the narrative.',
            inputSchema: z.object({
                tldr: z.string().optional().describe('1-2 sentence TL;DR: the single most important takeaway.'),
                findings: z.array(z.object({
                    point: z.string().describe('Key observation or insight.'),
                    value: z.string().optional().describe('Supporting metric, number, or percentage.'),
                    so_what: z.string().optional().describe('Why this finding deserves attention / what it implies for the user. A finding without its "so what" is just a number — always include it.'),
                    source_query_id: z.string().optional().describe('queryId from the execute_sql call that produced this number.'),
                })).min(1).max(8).optional().describe('Key findings, each with a metric AND its so_what (why it matters).'),
                likely_cause: z.string().optional().describe('Probable explanation for the main finding (the "why").'),
                suggested_actions: z.array(z.string()).min(1).max(4).optional().describe('Concrete next steps, each with a brief reason.'),
                caveats: z.array(z.string()).optional().describe('Data quality notes, limitations, or assumptions.'),
                summary: z.string().optional().describe('Your CLOSING NARRATIVE in flowing markdown prose (2-4 short paragraphs): the story of what you found, why it happens, and what to do. ALWAYS provide it — it is the answer; the structured fields are its recap.'),
                followup_questions: z.array(z.string()).min(2).max(4).optional().describe('Follow-up questions to explore next.'),
            }),
            execute: async ({ tldr, findings, likely_cause, suggested_actions, caveats, summary, followup_questions }) => {
                // Fallback ONLY when the model gave no narrative summary: build flowing
                // prose (not bare bullets) from the structured fields so the reply still
                // reads like analysis, weaving each finding's so_what into the sentence.
                const resolvedSummary = summary || [
                    tldr || '',
                    findings?.length
                        ? findings.map(f => {
                            const metric = f.value ? ` (${f.value})` : '';
                            const soWhat = f.so_what ? ` — ${f.so_what}` : '';
                            return `${f.point}${metric}${soWhat}.`;
                          }).join(' ')
                        : '',
                    likely_cause ? `The likely driver: ${likely_cause}` : '',
                    suggested_actions?.length
                        ? `Next, ${suggested_actions.map(a => a.replace(/\.$/, '')).join('; ')}.`
                        : '',
                    caveats?.length ? `A caveat: ${caveats.join(' ')}` : '',
                ].filter(Boolean).join('\n\n');

                if (activePlan?.steps) {
                    for (const step of activePlan.steps) {
                        // The step the agent was working on when it concluded is done
                        // (update_plan writes 'in_progress', never 'running'; missing it
                        // left the last step spinning forever). A step it never started
                        // is NOT done: marking it so put a green check on work that never
                        // happened. It stays visibly unfinished.
                        if (step.status === 'running' || step.status === 'in_progress') {
                            step.status = 'done';
                        } else if (step.status === 'pending') {
                            step.status = 'not_done';
                        }
                    }
                }
                if (aiPersistence && activePlan?.id) {
                    aiPersistence.updatePlan(dbManager, activePlan.id, {
                        status: 'completed', steps: activePlan.steps,
                    }).catch(() => {});
                }

                return {
                    tldr:              tldr              || null,
                    findings:          findings          || null,
                    likely_cause:      likely_cause      || null,
                    suggested_actions: suggested_actions || null,
                    caveats:           caveats           || null,
                    summary:           resolvedSummary,
                    followup_questions: followup_questions || [],
                    plan_id:           activePlan?.id || null,
                    status:            'completed',
                };
            },
        });

        allTools.ask_user = tool({
            description: 'Pause the analysis to ask the user a clarifying question. Use ONLY when you genuinely cannot continue without their input.',
            inputSchema: z.object({
                question: z.string().describe('The specific question to ask.'),
                options: z.array(z.string()).optional().describe('Optional list of choices to present.'),
                context: z.string().optional().describe('Why you need this information to continue.'),
            }),
            execute: async ({ question, options, context }) => {
                if (aiPersistence && activePlan?.id) {
                    aiPersistence.updatePlan(dbManager, activePlan.id, { status: 'paused' }).catch(() => {});
                }
                return { question, options: options || [], context: context || '', status: 'paused' };
            },
        });

        // NOTE: chart_storyteller was retired from the agent's toolset. The agent
        // now writes the chart's `takeaway` and `annotations` itself on display_chart
        // (with full analytical context — richer than the pure-stats storyteller),
        // so calling a separate tool was a wasted iteration whose output never
        // reached the chat chart. The generateChartStory stats engine still powers
        // the interactive Story tab via the /api/ai/chart-story endpoint.

        // Planner tools (create_plan + update_plan) in all diving-mode sessions
        if (enablePlanner) {
            const { createPlannerTools } = require('./tools_planner');
            Object.assign(allTools, createPlannerTools({ activePlan, aiPersistence, dbManager, conversationId }));
        }

        // In diving mode, final_answer replaces suggest_followups
        delete allTools.suggest_followups;
    }

    return allTools;
}

module.exports = { createTools };
