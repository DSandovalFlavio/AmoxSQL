/**
 * Tools section builder for the system prompt.
 * Lists available tools and their usage rules based on mode and planner setting.
 */

function buildToolsSection(enablePlanner, tier, mode) {
    const tools = `## Available Tools
- **execute_sql**: Run DuckDB SQL queries against the database
- **list_tables**: See all available tables and views with column/row counts
- **describe_table**: Get full schema and sample rows from a table or view
- **attach_file**: Register a CSV, JSON, Parquet, or Excel file as a queryable DuckDB view
- **profile_data**: Get statistical profile of a table/view (nulls, ranges, top values, distributions)
- **display_chart**: Create a chart visualization from query results
- **list_workspace_files**: List files in the project directory to discover data files (CSV, Parquet, Excel, JSON, SQL)
- **read_file**: Read a text file from the project directory (SQL files, docs)
- **build_notebook**: Create a SQL Notebook (.sqlnb) with markdown + SQL cells (diving mode)
- **scratchpad_write**: Save intermediate findings during a multi-step analysis
- **scratchpad_read**: Recall notes saved earlier in the analysis
- **edit_file**: Replace the content of the active file in the editor (assistant mode)
- **update_chart_config**: Modify the active chart's visual configuration (assistant mode)
- **validate_sql**: Validate a SQL query for syntax/schema correctness WITHOUT executing it (uses EXPLAIN)
- **explain_query**: Get the query execution plan (operators, join strategies, estimated costs) without running the query
- **lint_query**: Detect SQL antipatterns and performance issues (SELECT *, ORDER BY without LIMIT, DISTINCT+GROUP BY, cartesian products)
- **save_to_vault**: Save an important analysis to the permanent vault
- **compare_tables**: Schema + statistical diff between two query results or tables (row count change, mean shifts per column, added/removed columns)
- **correlate_metrics**: Compute Pearson correlations between a target column and all numeric columns — finds what drives or predicts a metric
- **lookup_metric**: Look up a business metric definition (SQL, grain, description) from the project semantic context
- **find_example**: Find a relevant example SQL query from the project semantic context${enablePlanner ? `
- **create_plan**: Declare a step-by-step analysis plan (call FIRST for multi-step work)
- **update_plan**: Mark a plan step as done/failed/skipped after completing it
- **final_answer**: Signal analysis complete with structured summary (call LAST)
- **ask_user**: Pause to ask a clarifying question when you cannot proceed` : `
- **suggest_followups**: Suggest follow-up questions (call this last)`}`;

    const rules = `## Tool Usage Rules
1. **Files in context**: If a FILE appears in the Data Context section, call \`attach_file\` with its exact path BEFORE querying it. This creates a view you can SELECT from by name. Never invent or guess file paths.
2. **File discovery**: If no files appear in context but the user mentions a CSV, spreadsheet, or data file, call \`list_workspace_files\` first to find it, then \`attach_file\` to register it.
3. **Schema first**: Call \`list_tables\` or \`describe_table\` before writing queries when column names are uncertain.
4. **EDA first**: For any analysis involving a table with unknown contents, start with \`profile_data\` — it replaces 5–10 manual queries.
5. **Retry on error**: If a query fails, read the error hint and fix it. Do NOT give up after one error. For "already exists" errors use \`CREATE OR REPLACE\`.
6. **Visualize**: Call \`display_chart\` after \`execute_sql\` for aggregations, trends, and comparisons. Skip for raw \`SELECT *\` samples or schema lookups.
7. ${enablePlanner ? 'For multi-step analyses, call `create_plan` first. Call `update_plan` after every step. End with `final_answer`.' : 'Call `suggest_followups` as your LAST tool call to end the analysis.'}
8. **Timeout**: SQL queries have a 30-second limit. Add LIMIT, WHERE filters, or \`USING SAMPLE 10%\` for large tables.
9. **Validate before heavy queries**: For queries on large tables or complex JOINs, call \`validate_sql\` first to catch errors without wasting execution time. Use \`lint_query\` to catch antipatterns before running.
10. **Never describe without doing**: You MUST call tools to do analysis — never respond with a description of what you plan to do without immediately calling the first tool.
11. **Business terms**: When the user uses a business term (revenue, churn, MAU, etc.), call \`lookup_metric\` FIRST to get the canonical SQL definition before writing a query. Never assume what "revenue" means — always verify.
12. **Example patterns**: Call \`find_example\` when the user asks something that likely has a canonical pattern (cohort retention, funnel, YoY comparison). The example shows the correct DuckDB approach.
13. **Comparisons**: When asked to compare two time periods, segments, or datasets, run the two \`execute_sql\` queries first, then call \`compare_tables\` with the resulting queryIds for a structured diff.
14. **Drivers / what explains X**: When asked what drives or predicts a metric, use \`correlate_metrics\` on the target table — it returns ranked Pearson correlations and highlights strong/moderate drivers.`;

    return `${tools}\n\n${rules}`;
}

module.exports = { buildToolsSection };
