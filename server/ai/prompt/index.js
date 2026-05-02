/**
 * AmoxSQL AI — Dynamic System Prompt Composer
 *
 * Assembles the full system prompt from modular section builders.
 * Public API: buildSystemPrompt(options) — identical to the old systemPrompt.js export.
 */

'use strict';

const { formatTableSchemas, formatFileSchemas, formatTableSchemasCompact, formatFileSchemasCompact } = require('./schema');
const { buildToolsSection } = require('./tools');
const { buildAssistantModeSection, buildDivingModeSection } = require('./modes');
const {
    buildChartTypesSection,
    buildFlockSection,
    buildSkillSection,
    buildUserRulesSection,
    buildMemoriesSection,
} = require('./context');
const { buildProjectContextSection } = require('../contextLoader');

/**
 * Builds the complete system prompt for the AI agent.
 *
 * @param {object} options
 * @param {Array}   options.tables            - Table schemas for context
 * @param {Array}   options.files             - File schemas for context
 * @param {string}  options.mode              - 'assistant' | 'diving'
 * @param {string}  options.userRules         - Content of RULES.md (optional)
 * @param {Array|string} options.memories     - Memories from previous sessions (optional)
 * @param {string}  options.currentQuery      - Current query in editor (assistant mode)
 * @param {object}  options.currentResult     - Current query result (assistant mode)
 * @param {object}  options.currentChartConfig- Current chart config (assistant mode)
 * @param {object}  options.activeSkill       - Active skill object (optional)
 * @param {object}  options.modelProfile      - Model profile from modelProfiles.js (optional)
 * @param {boolean} options.enablePlanner     - Enable planner tools (diving mode)
 * @param {object}  options.flockContext      - Flock extension context (optional)
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
        enablePlanner = false,
        flockContext = null,
        projectCtx = null,
    } = options;

    const tier = modelProfile?.tier || 'high';

    if (tier === 'low') {
        return buildCompactPrompt(options);
    }

    const now = new Date().toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    // ── Core identity & principles ──
    let prompt = `# AmoxSQL AI — Data Analysis Agent

You are **AmoxSQL AI**, an expert DuckDB data analyst embedded in a local-first SQL IDE. You help users analyze data, generate SQL queries, create visualizations, and discover insights.

## Current Date & Time
${now}

## Your Principles
1. **Accuracy First** — Always verify table and column names before writing queries. Use \`list_tables\` and \`describe_table\` when unsure.
2. **DuckDB Expert** — You write optimized DuckDB SQL. Use DuckDB-specific functions and syntax (e.g., \`QUALIFY\`, \`EXCLUDE\`, \`COLUMNS(*)\`, \`read_csv_auto()\`, \`SUMMARIZE\`).
3. **Privacy Respecting** — All data stays local. Never suggest sending data to external services.
4. **Concise & Clear** — Explain your findings clearly. Use markdown formatting. Be direct.
5. **Chart-Aware** — When data is visual, proactively suggest and create charts.`;

    // ── Tools section ──
    prompt += '\n\n' + buildToolsSection(enablePlanner, tier, mode);

    // ── DuckDB SQL Rules ──
    prompt += `

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

    // ── Chart types (medium+ only) ──
    prompt += buildChartTypesSection(tier, mode);

    // ── Data context (tables + files) ──
    prompt += `

## Data Context
### Tables
${formatTableSchemas(tables)}
${formatFileSchemas(files)}`;

    // ── Mode-specific instructions ──
    if (mode === 'assistant') {
        prompt += buildAssistantModeSection(options);
    } else {
        prompt += buildDivingModeSection(enablePlanner);
    }

    // ── Extension sections ──
    prompt += buildProjectContextSection(projectCtx);
    prompt += buildFlockSection(flockContext);
    prompt += buildSkillSection(activeSkill);
    prompt += buildUserRulesSection(userRules);
    prompt += buildMemoriesSection(memories);

    return prompt;
}

/**
 * Compact system prompt for low-tier models (prompt-only mode, ~800 tokens).
 */
function buildCompactPrompt(options = {}) {
    const { tables = [], files = [], currentQuery = '' } = options;

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
