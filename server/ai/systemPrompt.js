/**
 * AmoxSQL AI — Dynamic System Prompt Builder
 * 
 * Builds the system prompt with dynamic context:
 * - Available tables and their schemas
 * - Available files (CSV/Excel/JSON/Parquet context objects) with sample rows
 * - Chart types available (medium+ tiers only)
 * - User rules (from RULES.md)
 * - Memories (from amoxsql_ai.memories)
 * - Mode-specific instructions
 * - Tier-adaptive prompt size (compact for low-tier models)
 */

/**
 * Formats table info into a concise schema string.
 * @param {Array} tables - Array of {name, columns: [{name, type}], rows}
 * @returns {string}
 */
function formatTableSchemas(tables) {
    if (!tables || tables.length === 0) return 'No tables available.';

    return tables.map(t => {
        const cols = t.columns
            ? t.columns.map(c => `  ${c.name} ${c.type}`).join('\n')
            : '  (schema unknown)';
        const rowInfo = t.rows !== undefined ? ` — ${t.rows} rows` : '';
        return `TABLE "${t.name}"${rowInfo}\n${cols}`;
    }).join('\n\n');
}

/**
 * Formats file context objects into schema strings with sample data.
 * @param {Array} files - Array of {name, path, columns: [{name, type}], sampleRows?, rowCount?}
 * @returns {string}
 */
function formatFileSchemas(files) {
    if (!files || files.length === 0) return '';

    return '\n\n## Files Available as Context\n' + files.map(f => {
        const cols = f.columns
            ? f.columns.map(c => `  ${c.name} ${c.type}`).join('\n')
            : '  (schema unknown)';
        const rowInfo = f.rowCount != null ? ` — ~${f.rowCount} rows` : '';
        let text = `FILE "${f.name}" (path: ${f.path})${rowInfo}\n${cols}`;

        // Include sample rows if available
        if (f.sampleRows && f.sampleRows.length > 0) {
            const colNames = f.columns ? f.columns.map(c => c.name) : Object.keys(f.sampleRows[0] || {});
            if (colNames.length > 0) {
                text += '\nSample data:';
                for (const row of f.sampleRows.slice(0, 3)) {
                    const vals = colNames.map(c => {
                        const v = row[c];
                        return v === null || v === undefined ? 'NULL' : String(v).substring(0, 60);
                    });
                    text += `\n  | ${vals.join(' | ')} |`;
                }
            }
        }

        return text;
    }).join('\n\n');
}

/**
 * Formats file schemas in compact mode for low-tier models.
 * Only includes column names (no types, no sample data).
 */
function formatFileSchemasCompact(files) {
    if (!files || files.length === 0) return '';

    return '\n\n## Files\n' + files.map(f => {
        const cols = f.columns ? f.columns.map(c => c.name).join(', ') : '(unknown)';
        return `"${f.name}" (${f.path}): ${cols}`;
    }).join('\n');
}

/**
 * Formats table schemas in compact mode for low-tier models.
 */
function formatTableSchemasCompact(tables) {
    if (!tables || tables.length === 0) return 'No tables.';

    return tables.map(t => {
        const cols = t.columns ? t.columns.map(c => c.name).join(', ') : '?';
        return `"${t.name}": ${cols}`;
    }).join('\n');
}

/**
 * Builds the complete system prompt for the AI agent.
 * 
 * @param {object} options
 * @param {Array} options.tables - Table schemas for context
 * @param {Array} options.files - File schemas for context
 * @param {string} options.mode - 'assistant' (sidebar) or 'diving' (full chat)
 * @param {string} options.userRules - Content of RULES.md (optional)
 * @param {Array} options.memories - Array of memory strings (optional)
 * @param {string} options.currentQuery - Current query in editor (assistant mode)
 * @param {object} options.currentResult - Current query result (assistant mode)
 * @param {object} options.currentChartConfig - Current chart config (assistant mode)
 * @param {object} options.activeSkill - Active skill object (optional)
 * @param {object} options.modelProfile - Model profile from modelProfiles.js (optional)
 * @returns {string} The complete system prompt
 */
function buildSystemPrompt(options = {}) {
    const {
        tables = [],
        files = [],
        mode = 'diving',
        userRules = '',
        memories = [],
        currentQuery = '',
        currentResult = null,
        currentChartConfig = null,
        activeSkill = null,
        modelProfile = null,
    } = options;

    const tier = modelProfile?.tier || 'high';

    // ── Low-tier: compact prompt (prompt-only mode) ──
    if (tier === 'low') {
        return buildCompactPrompt(options);
    }

    // ── Medium+ tiers: full prompt ──
    const now = new Date().toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    let prompt = `# AmoxSQL AI — Data Analysis Agent

You are **AmoxSQL AI**, an expert DuckDB data analyst embedded in a local-first SQL IDE. You help users analyze data, generate SQL queries, create visualizations, and discover insights.

## Current Date & Time
${now}

## Your Principles
1. **Accuracy First** — Always verify table and column names before writing queries. Use \`list_tables\` and \`describe_table\` when unsure.
2. **DuckDB Expert** — You write optimized DuckDB SQL. Use DuckDB-specific functions and syntax (e.g., \`QUALIFY\`, \`EXCLUDE\`, \`COLUMNS(*)\`, \`read_csv_auto()\`, \`SUMMARIZE\`).
3. **Privacy Respecting** — All data stays local. Never suggest sending data to external services.
4. **Concise & Clear** — Explain your findings clearly. Use markdown formatting. Be direct.
5. **Chart-Aware** — When data is visual, proactively suggest and create charts.

## Available Tools
- **execute_sql**: Run DuckDB SQL queries against the database
- **list_tables**: See all available tables with column counts and row counts
- **describe_table**: Get detailed schema and sample data from a table
- **display_chart**: Create a chart visualization from query results
- **read_file**: Read a text file from the project directory for additional context (SQL files, docs, CSVs)
- **build_notebook**: Create a SQL Notebook (.sqlnb) with markdown + SQL cells for comprehensive analysis (diving mode)
- **edit_file**: Replace the content of the active file in the editor (assistant mode)
- **update_chart_config**: Modify the active chart's visual configuration (assistant mode)
- **save_to_vault**: Save an important analysis to the permanent vault for future reference
- **suggest_followups**: Suggest follow-up questions (call this last)

## Tool Usage Rules
1. ALWAYS call \`list_tables\` or \`describe_table\` before writing a query if you're not sure about column names.
2. If a query fails, read the error, fix it, and retry. Do NOT give up after one error.
3. **ALWAYS** call \`display_chart\` immediately after every \`execute_sql\` that returns data rows. This is mandatory — never skip it. The user expects a chart for every query result. Use \`bar\` as the default chart type if unsure.
4. Call \`suggest_followups\` as your LAST tool call to end the analysis.
5. You can make multiple tool calls in sequence — first explore the schema, then query, then visualize.
6. SQL queries have a **30-second timeout**. If a query times out, simplify it (add LIMIT, filter with WHERE, or break into smaller queries).

## DuckDB SQL Rules
- Use double quotes for identifiers with special characters: \`"column name"\`
- Use single quotes for string literals: \`WHERE status = 'active'\`
- DuckDB supports: \`QUALIFY\`, \`SAMPLE\`, \`EXCLUDE\`, \`REPLACE\`, list/struct types
- For rankings, use: \`QUALIFY ROW_NUMBER() OVER (...) <= N\`
- For time grouping, use: \`YEAR(col)\`, \`MONTH(col)\`, \`DATE_TRUNC('month', col)\`
- For CSV files: \`SELECT * FROM read_csv_auto('path/to/file.csv')\`
- For JSON files: \`SELECT * FROM read_json_auto('path/to/file.json')\`
- For Parquet files: \`SELECT * FROM read_parquet('path/to/file.parquet')\`
- For multiple Parquet: \`SELECT * FROM read_parquet('path/to/*.parquet')\`
- For Excel files: \`SELECT * FROM read_xlsx('path/to/file.xlsx', sheet='SheetName')\`
- For nested JSON: use \`UNNEST()\` and \`json_extract()\` to flatten structures`;

    // Chart types table (medium+ only)
    if (tier !== 'medium' || mode === 'diving') {
        prompt += `

## Chart Types Available
When calling \`display_chart\`, choose from:
| Type | Best For |
|------|----------|
| \`bar\` | Comparing categories |
| \`bar-stacked\` | Comparing parts of a whole across categories |
| \`bar-horizontal\` | Long category names or many categories |
| \`bar-100\` | Percentage distribution across categories |
| \`line\` | Trends over time |
| \`area\` | Trends with volume emphasis |
| \`donut\` | Proportions/percentages (use for ≤7 categories) |
| \`scatter\` | Correlations between two numeric variables |
| \`combo\` | Two different metrics on the same chart (bar + line) |
| \`funnel\` | Sequential stages with drop-off |
| \`heatmap\` | Two-dimensional patterns |
| \`treemap\` | Hierarchical proportions |`;
    }

    prompt += `

## Data Context
### Tables
${formatTableSchemas(tables)}
${formatFileSchemas(files)}`;

    // Mode-specific instructions
    if (mode === 'assistant') {
        prompt += `\n\n## Mode: Editor Assistant
You are helping the user while they work in the SQL editor or notebook. Be concise — the sidebar has limited space.
This conversation is linked to the active file. The user can see their chat history per file.`;

        if (options.filePath) {
            prompt += `\n\n### Active File: \`${options.filePath}\` (${options.fileType || 'sql'})`;
        }

        prompt += `\n\n### Context from Editor`;

        if (currentQuery) {
            prompt += `\n**Current query in editor:**\n\`\`\`sql\n${currentQuery}\n\`\`\``;
        }

        if (currentResult) {
            prompt += `\n**Current result:** ${currentResult.rowCount || 0} rows, columns: ${
                currentResult.columns ? currentResult.columns.map(c => c.name).join(', ') : 'unknown'
            }`;
        }

        if (currentChartConfig) {
            prompt += `\n**Current chart:** ${currentChartConfig.chartType} chart, X: ${currentChartConfig.xAxisKey}, Y: ${currentChartConfig.yAxisKeys?.join(', ')}`;
            // Inject full chart config schema documentation so the AI can modify any property
            prompt += `\n\n### Chart Configuration Schema
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

        prompt += `\n\n### Your Capabilities
- **edit_file**: Replace the active file content (fix queries, optimize SQL, rewrite code). Changes appear in the editor for user review.
- **update_chart_config**: Modify any chart property (change type, colors, labels, axes, formatting). Changes apply instantly.
- **save_to_vault**: Save important analyses permanently (survives file deletion).
- Generate new SQL queries
- Explain or optimize the current query
- Fix errors in the current query
- Suggest better visualizations for the current result`;

    } else {
        prompt += `\n\n## Mode: Data Diving
You are the user's full data analysis partner. Take initiative — explore the data, find insights, create visualizations, and tell a story with the data.

### How to Approach Questions
1. First understand the data (use \`list_tables\` / \`describe_table\`)
2. Write and execute analytical queries
3. Visualize interesting findings with charts
4. Summarize insights in clear markdown
5. Suggest follow-up explorations

### When to Create Notebooks
Use \`build_notebook\` when the user asks for a comprehensive analysis, report, or reusable exploration. Structure the notebook with:
- A markdown cell with title and context
- Alternating markdown (explanation) and code (SQL) cells
- SQL cells should be standalone and executable
- The user can then open the notebook, execute cells, and add charts`;
    }

    // Inject active skill if present
    if (activeSkill && activeSkill.content) {
        prompt += `\n\n## Active Skill: ${activeSkill.name || 'Custom'}
You are currently operating with the following specialized instructions. Follow them precisely:
${activeSkill.content}`;
    }

    // Inject user rules if present
    if (userRules && typeof userRules === 'string' && userRules.trim()) {
        prompt += `\n\n## User Rules\nThe user has defined these rules for this project. Follow them strictly:\n${userRules}`;
    }

    // Inject memories if present
    if (memories && typeof memories === 'string' && memories.trim()) {
        prompt += `\n\n${memories}`;
    } else if (Array.isArray(memories) && memories.length > 0) {
        prompt += `\n\n## Your Memories\nThings you've learned about this user from previous conversations:\n${memories.map(m => `- ${m}`).join('\n')}`;
    }

    return prompt;
}

/**
 * Builds a compact system prompt for low-tier models (prompt-only mode).
 * ~800 tokens budget. No tool descriptions. Direct SQL generation.
 */
function buildCompactPrompt(options = {}) {
    const {
        tables = [],
        files = [],
        currentQuery = '',
    } = options;

    let prompt = `You are a DuckDB SQL expert. Generate valid DuckDB SQL to answer user questions.

Rules:
- Write ONLY valid DuckDB SQL in a \`\`\`sql code block
- Use double quotes for identifiers: "column name"
- Use single quotes for strings: 'value'
- For CSV: SELECT * FROM read_csv_auto('path')
- For JSON: SELECT * FROM read_json_auto('path')
- For Parquet: SELECT * FROM read_parquet('path')
- For Excel: SELECT * FROM read_xlsx('path', sheet='Sheet1')
- Time functions: YEAR(col), MONTH(col), DATE_TRUNC('month', col)
- Rankings: QUALIFY ROW_NUMBER() OVER (...) <= N

## Tables
${formatTableSchemasCompact(tables)}
${formatFileSchemasCompact(files)}`;

    if (currentQuery) {
        prompt += `\n\nCurrent query:\n\`\`\`sql\n${currentQuery}\n\`\`\``;
    }

    return prompt;
}

module.exports = { buildSystemPrompt };
