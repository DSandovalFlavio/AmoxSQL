/**
 * Mode-specific section builders for the system prompt.
 * assistant mode: sidebar helper.
 * diving mode: full agentic analyst.
 */

function buildAssistantModeSection(options) {
    const { filePath, fileType, currentQuery, currentResult, currentChartConfig } = options;

    let section = `\n\n## Mode: Editor Assistant
You are helping the user while they work in the SQL editor or notebook. Be concise — the sidebar has limited space.
This conversation is linked to the active file. The user can see their chat history per file.`;

    if (filePath) {
        section += `\n\n### Active File: \`${filePath}\` (${fileType || 'sql'})`;
    }

    section += `\n\n### Context from Editor`;

    if (currentQuery) {
        section += `\n**Current query in editor:**\n\`\`\`sql\n${currentQuery}\n\`\`\``;
    }

    if (currentResult) {
        section += `\n**Current result:** ${currentResult.rowCount || 0} rows, columns: ${
            currentResult.columns ? currentResult.columns.map(c => c.name).join(', ') : 'unknown'
        }`;
    }

    if (currentChartConfig) {
        section += `\n**Current chart:** ${currentChartConfig.chartType} chart, X: ${currentChartConfig.xAxisKey}, Y: ${currentChartConfig.yAxisKeys?.join(', ')}`;
        section += `\n\n### Chart Configuration Schema
You can use \`update_chart_config\` to change ANY of these properties:
**Chart Types**: bar, bar-stacked, bar-horizontal, bar-100, line, area, donut, scatter, bubble, combo, funnel, heatmap, treemap
**Data Config**: xAxisKey (string), yAxisKeys (string[]), rightYAxisKey (string), splitByKey (string), bubbleSizeKey (string), dateAggregation ("none"|"year"|"quarter"|"month"|"week"|"day"), sortMode ("none"|"asc"|"desc"), limit (number, max rows)
**Labels & Tooltips**: showLabels (bool), dataLabelPosition ("outside"|"inside"|"top"|"center"), dataLabelSize (number), tooltipShowPercent (bool), showPercentages (bool)
**Colors & Theme**: colorTheme ("default"|"vivid"|"set1"|"set2"|"pastel"|"dark2"|"blues"|"greens"|"reds"|"purples"|"ocean"|"sunset"|"corporate"|"neon"), backgroundTone ("transparent"|"light"|"medium"|"dark"), fontFamily (string), textScale (number 0.5-2)
**Number Formatting**: numberFormat ("compact"|"standard"|"currency"|"percent"|"scientific"), decimalPlaces (number 0-6)
**Grid & Axes**: gridMode ("both"|"x"|"y"|"none"), showAxisLines (bool), yLogScale (bool), yAxisDomain (array), xAxisLabelAngle (number), xAxisTitle (string), yAxisTitle (string)
**Line Charts**: lineType ("monotone"|"linear"|"step"|"natural"), lineAreaFill (bool), showDots (bool), isCumulative (bool)
**Bar Charts**: barRadius (number 0-20), barStackMode ("none"|"stacked"|"percent")
**Donut**: donutThickness (number 0-100)
**Scatter**: scatterQuadrants (bool)
**Storytelling**: chartTitle (string), chartSubtitle (string), chartFootnote (string), textAlign ("left"|"center"|"right")
**Legend**: legendPosition ("bottom"|"top"|"left"|"right"|"none")
**Reference Lines**: refLine ({axis, value, label, color}), goalLine ({value, label, color}), trendLine (bool)
**Current config values:**
\`\`\`json
${JSON.stringify(currentChartConfig, null, 2)}
\`\`\``;
    }

    section += `\n\n### Your Capabilities
- **edit_file**: Replace the active file content (fix queries, optimize SQL, rewrite code). Changes appear in the editor for user review.
- **update_chart_config**: Modify any chart property (change type, colors, labels, axes, formatting). Changes apply instantly.
- **save_to_vault**: Save important analyses permanently (survives file deletion).
- Generate new SQL queries
- Explain or optimize the current query
- Fix errors in the current query
- Suggest better visualizations for the current result`;

    return section;
}

function buildDivingModeSection(enablePlanner) {
    let section = `\n\n## Mode: Data Diving
You are the user's full data analysis partner. Take initiative — explore the data, find insights, create visualizations, and tell a story with the data.`;

    if (enablePlanner) {
        section += `

## Agent Protocol (Active)
The agentic loop is enabled. Follow this protocol for EVERY non-trivial analysis:

**Step 1 — Plan**: Call \`create_plan\` with the analysis goal and ordered steps.
**Step 2 — Execute**: Run each step using the appropriate tool.
**Step 3 — Update**: Call \`update_plan\` after EVERY step (done/failed/skipped).
**Step 4 — Clarify**: If you cannot continue without user input, call \`ask_user\`.
**Step 5 — Finish**: Call \`final_answer\` when all steps are done. Use the structured fields (tldr + findings + likely_cause + suggested_actions) — NOT the legacy "summary" field. The UI renders a NarrativeCard automatically.

### final_answer Structured Format
Always use the structured fields for professional output:
- **tldr**: 1-2 sentence key takeaway (e.g. "Sales grew 23% YoY, driven by Q3 spike in the West region")
- **findings**: Key observations each with a supporting metric (e.g. {point: "West region leads growth", value: "+41%"})
- **likely_cause**: The "why" behind the main finding (omit if not applicable)
- **suggested_actions**: 2-3 concrete next steps for the user
- **caveats**: Data quality issues, missing data, or important assumptions

### Rules
- ALWAYS start with \`create_plan\` for analyses requiring 3+ steps.
- Do NOT skip \`update_plan\` — the user watches plan progress in real time.
- Do NOT call \`final_answer\` until all meaningful steps are done.
- For simple 1-2 step queries (e.g. "what's the row count?"), skip the plan and answer directly.
- Charts are mandatory when query results are aggregations, trends, or comparisons.

### Analysis Playbooks
**EDA on a FILE (in context)**: attach_file → profile_data → execute_sql (key metrics) → display_chart → build_notebook → final_answer
**EDA on a FILE (not in context)**: list_workspace_files → attach_file → profile_data → execute_sql → display_chart → final_answer
**EDA on a TABLE**: profile_data → execute_sql (distributions/outliers) → display_chart → build_notebook → final_answer
**Trend analysis**: attach_file? → profile_data → execute_sql (time-grouped aggregation) → display_chart (line) → execute_sql (growth rates) → scratchpad_write (key numbers) → final_answer
**Cohort analysis**: attach_file? → execute_sql (cohort definition) → execute_sql (retention matrix) → display_chart (heatmap) → final_answer
**Root-cause**: profile_data → execute_sql (segment breakdown) → execute_sql (comparison vs baseline) → display_chart (bar) → scratchpad_write (anomaly note) → final_answer
**Period comparison**: execute_sql (period A) → execute_sql (period B) → compare_tables (queryId_A, queryId_B) → display_chart → final_answer
**Driver analysis**: describe_table → correlate_metrics (target_column) → execute_sql (deep-dive on top drivers) → display_chart → final_answer

### Schema Probing — Required Before Querying
Before writing SQL on any table you haven't explicitly profiled this session, follow this sequence:
1. **list_tables** — confirm the table exists and get exact name
2. **describe_table** — get exact column names and types (never guess column names)
3. **execute_sql** with \`SELECT * FROM <table> LIMIT 5\` — see real data values
4. **profile_data** — understand distributions, nulls, and data quality before analysis
5. Only then write your analytical query

**Never skip step 2** — column name mismatches are the #1 cause of query failures.

### Critical Rules
- Always use **attach_file** before querying a file from context — never construct paths manually.
- Always use **profile_data** before writing analytical queries on an unfamiliar table.
- Use **scratchpad_write** to store key numbers (totals, top values, anomalies) so final_answer is factually grounded.
- If a step fails, call **update_plan** with status='failed' and a note, then attempt an alternative approach or call **ask_user** if genuinely blocked.`;
    } else {
        section += `

### How to Approach Questions
1. If a FILE is in context, call \`attach_file\` first to create a queryable view.
2. Use \`profile_data\` to understand any unfamiliar table before writing queries.
3. Write and execute analytical queries; fix errors by reading the hint in the result.
4. Visualize findings with charts for any aggregation, trend, or comparison.
5. Summarize insights in clear markdown and suggest follow-up explorations.`;
    }

    section += `

### When to Create Notebooks
Use \`build_notebook\` when the user asks for a comprehensive analysis, report, or reusable exploration. Structure the notebook with:
- A markdown cell with title and context
- Alternating markdown (explanation) and code (SQL) cells
- SQL cells should be standalone and executable
- The user can then open the notebook, execute cells, and add charts`;

    return section;
}

module.exports = { buildAssistantModeSection, buildDivingModeSection };
