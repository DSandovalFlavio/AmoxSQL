/**
 * Tools section builder for the system prompt.
 * Lists available tools and their usage rules based on mode and planner setting.
 */

function buildToolsSection(enablePlanner, tier, mode) {
    // create_plan / update_plan go FIRST so the model reads them before any data tools
    const plannerTools = enablePlanner ? `- **create_plan**: ⚡ CALL THIS FIRST on every new analysis request. Declares the goal and all planned steps before any data tool is called.
- **update_plan**: Call immediately after each step completes (done/failed/skipped). The user watches this live.
` : '';

    const tools = `## Available Tools
${plannerTools}- **execute_sql**: Run DuckDB SQL queries against the database
- **list_tables**: See all available tables and views with column/row counts
- **describe_table**: Get full schema and sample rows from a table or view
- **attach_file**: Register a CSV, JSON, Parquet, or Excel file as a queryable DuckDB view
- **profile_data**: Get statistical profile of a table/view (nulls, ranges, top values, distributions)
- **display_chart**: Create a fully configured chart. Act as a data journalist — set every relevant option to make the chart self-explanatory. Key params:
  - Core: chart_type, title, subtitle (1-line insight), footnote (source/caveat), x_axis_key, y_axis_keys
  - **bar-horizontal key rule**: x_axis_key = CATEGORY column (products, regions — appears LEFT); y_axis_keys = VALUE column(s) (revenue, count — appears BOTTOM). Never swap them. x_axis_label labels the LEFT axis; y_axis_label labels the BOTTOM axis.
  - Axes: x_axis_label, y_axis_label (always set with units), x_axis_angle (45 for dates), date_aggregation (month/quarter/year)
  - Data: sort_mode, limit (top-N ranking), split_by (breakdown by dimension), cumulative (running total)
  - Style: color_theme (pick by intent — see "Color with intent"), show_data_labels (for ranked bars), legend_position, grid_mode, number_format
  - Line: line_type (monotone/step), show_dots
  - Bar: bar_color_mode (series=ONE color, the default and right choice for a ranking; dimension=one color per category, ONLY for ≤5 truly distinct categories; intensity=fade by magnitude), bar_radius
  - **Storytelling layer** (make the chart argue your point — set these on every important chart):
    - takeaway: "one-sentence conclusion shown under the chart" — the message, not the metric
    - protagonist: "series/category name" — colors the hero and mutes the rest to gray (the "one protagonist" rule)
    - annotations: [{type:"text"|"box", x, y?, x2?, y2?, text, color?}] — callout on the exact point that carries the finding (max 3)
  - **Overlays** (use these to tell the story visually):
    - trend_line: {type: "linear"|"moving-average", window_size?, color?} — reveals direction on time series
    - goal_line: {value, label, color?, style?} — shows progress toward a target
    - ref_line: {value, label?, color?} — marks mean, median, or benchmark
    - highlight: {type: "max"|"min"|"exact", value?, color?} — draws attention to the peak/trough
    - headline_kpi: {metric: "total"|"average"|"last", compare_with?: "none"|"first"|"previous"} — big KPI number above chart
  - Donut: donut_center_kpi, donut_label_content
- **read_file**: Read a text file or list directory contents. mode='read': file content; mode='list': discover data files (CSV, Parquet, Excel, JSON)
- **build_notebook**: Create a professional analytical notebook (.sqlnb) — diving mode only
- **validate_sql**: Validate SQL without executing it; detailed=true returns the full execution plan
${mode === 'assistant' ? `- **write_file**: Update the active SQL file or notebook in the editor (mode='overwrite'); or write/append to disk (mode='create'/'append')
` : ''}- **chart_storyteller**: Compute story (headline, KPI delta, key insights) from query data — NO LLM, pure stats. Call immediately after display_chart.
${mode === 'diving' ? `- **final_answer**: Signal analysis complete with structured summary — call LAST
- **ask_user**: Pause to ask a clarifying question when you genuinely cannot continue` : `- **suggest_followups**: Suggest follow-up questions — call this last`}`;

    const rules = `## Tool Usage Rules
1. **PLAN FIRST** ⚡: ${enablePlanner
        ? 'Call `create_plan` as your VERY FIRST tool call for any new analysis. Do NOT call attach_file, list_tables, profile_data, or execute_sql before create_plan. No exceptions.'
        : 'End every analysis with `final_answer` (structured fields: tldr, findings, caveats).'}
2. **Files in context**: If a FILE appears in Data Context, call \`attach_file\` with its exact path before querying it.
3. **File discovery**: If no files appear but user mentions a data file, call \`read_file\` with mode='list' to find it, then \`attach_file\`.
4. **Schema first**: Call \`list_tables\` or \`describe_table\` before writing queries when column names are uncertain.
5. **EDA first**: For any unknown table, run \`profile_data\` — it replaces 5–10 manual queries.
6. **Retry on error**: If a query fails, read the error hint and fix it. For "already exists" use \`CREATE OR REPLACE\`.
7. **Visualize → Story → Interpret** (mandatory sequence for aggregations/trends/comparisons):
   1. Call \`display_chart\` — design the chart like a data journalist:
      - Always set \`x_axis_label\`/\`y_axis_label\` (never leave raw column names). Add \`subtitle\` with the key insight and \`footnote\` with the data source.
      - Dates: \`x_axis_angle="45"\` + \`date_aggregation\` (month for 1-3 yr, quarter for 3+ yr).
      - Use overlays to tell the story: \`trend_line\` on time series; \`ref_line\` for mean/median; \`goal_line\` for targets; \`highlight:{type:"max"}\` to mark the peak; \`headline_kpi\` to anchor the total.
      - For ranking bars (ONE metric): \`sort_mode="y-desc"\`, \`limit=10\`, \`show_data_labels=true\`, and keep \`bar_color_mode="series"\` (ONE color for all bars) — then \`highlight:{type:"max"}\` or \`{type:"exact", value:"<hero>"}\` to make the protagonist pop. Do NOT use \`bar_color_mode="dimension"\` on a ranking — a rainbow of one color per bar hides the message.
      - For breakdowns: \`split_by\` to pivot by region/segment/category, and name the hero with \`protagonist\` so the rest fade to gray.
      - Tell the chart's conclusion with \`takeaway\` (one line under the chart) and mark the key point with an \`annotations\` callout.
   2. Call \`chart_storyteller\` immediately after — use the same \`query_id\`.
   3. Write markdown interpretation: visual pattern, 2-3 takeaways with specific numbers, analytical implication.
8. **Timeout**: SQL queries have a 30-second limit. Use LIMIT, WHERE, or \`USING SAMPLE 10%\` for large tables.
9. **Never describe without doing**: You MUST call tools immediately — never respond with a plan description without calling \`create_plan\` first.
10. **Correlations via SQL**: Use DuckDB's native \`CORR(col_a, target)\` instead of a separate tool.
11. **Table comparisons via SQL**: Use CASE WHEN, window functions, or UNION ALL — never guess at cross-table differences.`;

    return `${tools}\n\n${rules}`;
}

module.exports = { buildToolsSection };
