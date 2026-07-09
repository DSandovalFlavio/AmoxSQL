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

const { analyzeJoin } = require('./joinSanityCheck');
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
 * @param {boolean} [context.enablePlanner=false] - Enable create_plan/update_plan (analysis-planning skill only)
 * @returns {object} Tools object for Vercel AI SDK
 */
function createTools(context) {
    const {
        dbManager, queryResults, projectPath, mode = 'diving',
        conversationId = null, aiPersistence = null,
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
            }),
            execute: async ({ query }) => {
                try {
                    if (!query || typeof query !== 'string') {
                        return { error: 'Invalid query parameter. Expected a SQL string.' };
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
                        }).catch(e => console.warn('[Tools] query_cache write failed:', e.message));
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
                    const tables = await db.systemQuery(`
                        SELECT
                            table_schema,
                            table_name,
                            (SELECT COUNT(*) FROM information_schema.columns c
                             WHERE c.table_name = t.table_name AND c.table_schema = t.table_schema) as column_count
                        FROM information_schema.tables t
                        WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains')
                        AND NOT (table_schema = 'main' AND table_name IN ('amox_query_history'))
                        AND table_name NOT LIKE '\\_\\_chain\\_%' ESCAPE '\\'
                        AND table_type = 'BASE TABLE'
                        ORDER BY table_schema, table_name
                    `);

                    const tablesWithCounts = [];
                    for (const t of tables.slice(0, 50)) {
                        try {
                            const countRes = await db.systemQuery(
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

        describe_table: tool({
            description: 'Get the schema (column names, types) and sample rows from a table. Use this to verify exact column names before writing queries.',
            inputSchema: z.object({
                table_name: z.string().describe('Table name. Use "schema.table" for non-main schemas.'),
            }),
            execute: async ({ table_name }) => {
                try {
                    // Support the documented "schema.table" form → "schema"."table"
                    const dot = table_name.indexOf('.');
                    const ref = dot > 0
                        ? `"${table_name.slice(0, dot)}"."${table_name.slice(dot + 1)}"`
                        : `"${table_name}"`;
                    const columns = await db.systemQuery(`DESCRIBE ${ref}`);
                    const sample = await db.systemQuery(`SELECT * FROM ${ref} LIMIT 5`);

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

        display_chart: tool({
            description: 'Render a fully configured chart from a previous execute_sql result. Act as a data journalist. CHOOSE THE CHART TYPE BY REASONING, not by column type — follow the "Chart Selection" framework in your instructions: (1) state the ONE message, (2) classify the intent (comparison / change-over-time / part-of-whole / relationship / ranking-change), (3) check the data shape. Key trap: a date column with only 2–3 periods is a COMPARISON, not a trend — use grouped bars (split_by) rather than a line; lines need ≥4–5 points to be honest. For real date/timestamp time series set date_aggregation and x_axis_angle=45. After rendering, follow with chart_storyteller.',
            inputSchema: z.object({
                // ── Core ──────────────────────────────────────────────────────────
                query_id: z.string().describe('The queryId from a previous execute_sql result.'),
                chart_type: z.enum([
                    'bar', 'bar-stacked', 'bar-horizontal', 'bar-100',
                    'line', 'area', 'donut',
                    'scatter', 'bubble', 'combo',
                    'funnel', 'heatmap', 'treemap',
                ]).describe('Chart type — pick by the message + data shape, NOT by column type. bar=compare categories (with split_by → grouped bars, ideal for before/after across 2–3 periods); bar-horizontal=ranking or long category names (x_axis_key=category shown LEFT, y_axis_keys=value shown BOTTOM); line/area=true time series with ≥4–5 points; donut=part-of-whole (≤7 slices); scatter=correlation; combo=two metrics at different scales. A date column with only 2–3 points is a comparison → use grouped bars, not a line.'),
                title: z.string().describe('Descriptive chart title including the key metric and time range or dimension.'),
                subtitle: z.string().optional().describe('One-line insight below the title, e.g. "Revenue grew 23% YoY driven by the West region".'),
                footnote: z.string().optional().describe('Data source or caveat below the chart, e.g. "Based on 1,240 transactions · Jan–Dec 2024".'),

                // ── Data mapping ──────────────────────────────────────────────────
                x_axis_key: z.string().describe('Column for the X axis or category dimension.'),
                y_axis_keys: z.array(z.string()).describe('One or more columns for the Y axis / values.'),
                right_y_axis_key: z.string().optional().describe('Column to plot on a secondary right Y axis (combo charts with two scales).'),
                split_by: z.string().optional().describe('Column to pivot/split the data by (creates one series per unique value). Use for breakdowns by region, category, segment, etc.'),
                bubble_size_key: z.string().optional().describe('Column for bubble radius (bubble charts only).'),

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
                color_theme: z.enum(['default', 'vivid', 'neon', 'pastel', 'dark2', 'ocean', 'sunset', 'corporate', 'blues', 'greens', 'reds', 'spectral']).optional().describe('Color palette — choose by data role, not decoration. Qualitative (comparing distinct series): default, vivid, dark2, pastel, neon. Sequential (ordered magnitude, light→dark): blues, greens. Diverging (+/- around a center): spectral. reds/sunset: RESERVED for negative/alarm metrics only — never for neutral revenue/volume. corporate=grays. For a single-metric ranking DO NOT swap palettes per bar — keep one color and use highlight to spotlight the leader.'),
                show_data_labels: z.boolean().optional().describe('Show value labels directly on bars/points. Good for ranked bar charts. Default: false.'),
                legend_position: z.enum(['top', 'bottom', 'left', 'right', 'none']).optional().describe('Legend placement. none hides it. Default: top.'),
                grid_mode: z.enum(['both', 'horizontal', 'vertical', 'none']).optional().describe('Grid lines. Default: horizontal.'),

                // ── Line/Area chart options ───────────────────────────────────────
                line_type: z.enum(['monotone', 'linear', 'step']).optional().describe('Line interpolation. monotone=smooth curves (default); linear=straight segments; step=staircase (good for state changes).'),
                show_dots: z.boolean().optional().describe('Show data points on line/area charts. Default: true.'),

                // ── Bar chart options ─────────────────────────────────────────────
                bar_color_mode: z.enum(['series', 'dimension', 'intensity']).optional().describe('Bar coloring. series=ONE color for all bars (default; the CORRECT choice for a single-metric ranking — pair with highlight for emphasis). dimension=one color per category, ONLY when there are ≤5 genuinely distinct categories whose identity matters (NOT a sorted ranking — that makes a misleading rainbow). intensity=fade opacity by value magnitude.'),
                bar_radius: z.number().int().min(0).max(20).optional().describe('Bar corner radius in px. 0=sharp, 4=slight rounding (default), 8=rounded.'),

                // ── Analytical overlays ───────────────────────────────────────────
                trend_line: z.object({
                    type: z.enum(['linear', 'moving-average']).describe('linear=OLS regression line; moving-average=smoothed trend.'),
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
                    value: z.number().describe('Y value for the reference line.'),
                    label: z.string().optional().describe('Label shown on the line, e.g. "Average", "Median".'),
                    color: z.string().optional().describe('Hex color. Default: red.'),
                }).optional().describe('Horizontal reference line. Use for mean, median, or benchmark values.'),

                highlight: z.object({
                    type: z.enum(['max', 'min', 'exact']).describe('max=highlight the highest bar/point; min=lowest; exact=specific category.'),
                    value: z.string().optional().describe('Category name to highlight when type=exact.'),
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

                // ── Storytelling guardrails (data-driven, not prompt-only) ──────────
                // These catch the choices that misrepresent the data even when the
                // model ignores the prompt guidance. A hard error makes the model
                // re-call correctly; soft issues are surfaced as warnings.
                const rows = Array.isArray(queryResult.data) ? queryResult.data : [];
                const chartWarnings = [];

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
                            color: highlight.color || '#ff4444',
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
                    const binaryExts = ['.db', '.duckdb', '.sqlite', '.parquet', '.xlsx', '.xls', '.zip', '.gz', '.tar', '.png', '.jpg', '.gif', '.pdf', '.exe', '.dll', '.wasm'];
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
                        chart_type: z.enum(['bar', 'bar-stacked', 'bar-horizontal', 'bar-100', 'line', 'area', 'donut', 'scatter', 'bubble', 'combo', 'funnel', 'heatmap', 'treemap']).describe('Pick by message + data shape (same rules as display_chart).'),
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
                        hint = 'SQL syntax error. Use double quotes for identifiers and single quotes for strings.';
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
        // write_file: replaces edit_file. 'overwrite' mode → editor update (no disk write).
        // 'create' / 'append' → actual disk writes.
        allTools.write_file = tool({
            description: "Write content to a file. mode='overwrite' (default): replaces the active SQL file or notebook content in the editor without saving to disk — the user reviews and saves. mode='create': writes a new file to file_path. mode='append': appends content to an existing file.",
            inputSchema: z.object({
                content: z.string().describe('Complete new content (overwrite/create) or text to append.'),
                description: z.string().describe('Brief description of the change.'),
                mode: z.enum(['overwrite', 'create', 'append']).optional().default('overwrite'),
                file_path: z.string().optional().describe("For create/append: relative path within the project. Not needed for 'overwrite'."),
            }),
            execute: async ({ content, description: desc, mode: writeMode = 'overwrite', file_path: filePath }) => {
                if (writeMode === 'overwrite') {
                    // Frontend handles this via action field (no disk write)
                    return { success: true, content, description: desc, action: 'edit_file' };
                }
                if (!projectPath) return { error: 'No project directory.' };
                if (!filePath) return { error: 'file_path is required for create/append.' };
                const normalized = path.normalize(filePath);
                if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
                    return { error: 'Invalid path. Use relative paths within the project directory.' };
                }
                const fullPath = path.join(projectPath, normalized);
                if (!path.resolve(fullPath).startsWith(path.resolve(projectPath))) {
                    return { error: 'Path is outside the project directory.' };
                }
                try {
                    if (writeMode === 'append') {
                        await fs.promises.appendFile(fullPath, content, 'utf8');
                    } else {
                        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
                        await fs.promises.writeFile(fullPath, content, 'utf8');
                    }
                    return { success: true, path: filePath, description: desc };
                } catch (err) {
                    return { error: err?.message || String(err) };
                }
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
                        // Sweep every non-terminal status to done. NOTE: update_plan
                        // writes 'in_progress' (never 'running'); the missing case here
                        // was why the last in-progress step stayed stuck forever.
                        if (step.status === 'pending' || step.status === 'running' || step.status === 'in_progress') {
                            step.status = 'done';
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

        // ── chart_storyteller ────────────────────────────────────────────────
        allTools.chart_storyteller = tool({
            description: 'Generate a data story for a chart: computes stats (top contributors, deltas, outliers) in code and returns a structured headline + insights. Call after display_chart to auto-fill the Story tab. Use query_id from execute_sql result; set x_key and y_key to match the chart axes.',
            inputSchema: z.object({
                query_id:   z.string().describe('queryId returned by execute_sql.'),
                x_key:      z.string().describe('Column used as the X axis / category label.'),
                y_key:      z.string().describe('Primary numeric column (Y axis).'),
                chart_type: z.string().optional().describe('Chart type hint: bar, line, area, donut, etc.'),
                title_hint: z.string().optional().describe('Optional user-specified title to refine the headline.'),
            }),
            execute: async ({ query_id, x_key, y_key, chart_type, title_hint }) => {
                const { generateChartStory } = require('./chartStory');
                let cached = queryResults.get(query_id);
                if (!cached && aiPersistence) {
                    const fromDb = await aiPersistence.getQueryCache(dbManager, query_id);
                    if (fromDb) cached = { data: fromDb.data || [], columns: fromDb.columns_info || [] };
                }
                const rows = cached?.data || cached?.rows;
                if (!cached || !Array.isArray(rows)) {
                    return { error: `Query "${query_id}" not found. Run execute_sql first and use its queryId.` };
                }
                const story = generateChartStory(rows, {
                    xKey: x_key, yKey: y_key,
                    chartType: chart_type || 'bar',
                    titleHint: title_hint || '',
                });
                if (story.error) return story;
                // Persist to queryResults so the frontend can pick it up
                queryResults.set(`story:${query_id}`, story);
                return story;
            },
        });

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
