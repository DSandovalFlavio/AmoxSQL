/**
 * AmoxSQL AI — Dynamic System Prompt Composer
 *
 * Public API:
 *   buildSystemPrompt(options) → string   (all providers)
 *   buildSystemParts(options)  → { static, dynamic }  (for Anthropic caching)
 */

'use strict';

const { formatTableSchemas, formatFileSchemas, formatTableSchemasCompact, formatFileSchemasCompact } = require('./schema');
const { buildToolsSection } = require('./tools');
const { buildAssistantModeSection, buildDivingModeSection } = require('./modes');
const {
    buildChartTypesSection,
    buildReferencesSection,
    buildSkillSection,
    buildUserRulesSection,
    buildMemoriesSection,
} = require('./context');
const { buildProjectContextSection } = require('../contextLoader');

// ── Static section (identity + tools + DuckDB rules + chart types) ────────────
// This portion is identical across requests for the same mode+enablePlanner
// combination and is safe to cache via Anthropic's prompt caching API.

function buildStaticSection(enablePlanner, tier, mode) {
    let s = `# AmoxSQL AI — Data Analysis Agent

You are **AmoxSQL AI**, an expert DuckDB data analyst embedded in a local-first SQL IDE. You help users analyze data, generate SQL queries, create visualizations, and discover insights.

## Your Principles
1. **Accuracy First** — Verify table and column names before writing queries. Use \`list_tables\` and \`describe_table\` when unsure.
2. **DuckDB Expert** — Write optimized DuckDB SQL. Use DuckDB-specific features (QUALIFY, EXCLUDE, COLUMNS(*), USING SAMPLE, approx_count_distinct).
3. **Privacy Respecting** — All data stays local. Never suggest sending data to external services.
4. **Concise & Clear** — Use markdown. Be direct. Lead with insight.
5. **Chart-Aware** — For aggregations, trends, or comparisons: always visualize with \`display_chart\`.`;

    s += '\n\n' + buildToolsSection(enablePlanner, tier, mode);

    s += `

## DuckDB SQL Rules
- Double quotes for identifiers: \`"column name"\` — single quotes for strings: \`'value'\`
- Rankings: \`QUALIFY ROW_NUMBER() OVER (...) <= N\`
- Time grouping: \`DATE_TRUNC('month', col)\`, \`YEAR(col)\`, \`MONTH(col)\`
- Sampling large tables: \`SELECT * FROM table USING SAMPLE 10%\`
- Fast distinct count: \`approx_count_distinct(col)\`
- Correlated metrics: \`SELECT CORR(col_a, target) FROM table\``;

    s += buildChartTypesSection(tier, mode);

    return s;
}

// ── Dynamic section (date, schema, mode instructions, memories, skill, rules) ─

function buildDynamicSection(options) {
    const {
        tables = [],
        files = [],
        mode = 'diving',
        userRules = '',
        memories = [],
        currentQuery = '',
        currentResult = null,
        currentChartConfig = null,
        referencedArtifacts = [],
        activeSkill = null,
        enablePlanner = false,
        projectCtx = null,
        filePath = null,
        fileType = null,
        modelProfile = null,
        uiTheme = null,
    } = options;
    const tier = modelProfile?.tier || 'high';

    const now = new Date().toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    let d = `## Current Date & Time\n${now}`;

    // Schema
    d += `\n\n## Data Context\n### Tables\n${formatTableSchemas(tables)}`;
    d += formatFileSchemas(files);

    // Mode section
    if (mode === 'assistant') {
        d += buildAssistantModeSection({ filePath, fileType, currentQuery, currentResult, currentChartConfig });
    } else {
        d += buildDivingModeSection(enablePlanner, tier);
    }

    // Live rendering context — the user's active theme, so chart palettes can
    // harmonize with the accent and read on the current light/dark background.
    if (uiTheme && (mode === 'diving' || mode === 'assistant')) {
        const mode_ = uiTheme.mode === 'light' ? 'LIGHT' : 'DARK';
        const parts = [
            `The app is currently in **${mode_} mode**`,
            uiTheme.theme ? `theme "${uiTheme.theme}"` : null,
            uiTheme.accentColor ? `accent color \`${uiTheme.accentColor}\`` : (uiTheme.accent ? `accent "${uiTheme.accent}"` : null),
        ].filter(Boolean).join(', ');
        d += `\n\n## Rendering context (choose chart colors for THIS canvas)
${parts}.
When you design a chart's palette, make it read on a ${mode_.toLowerCase()} background and sit in harmony with the accent above (a single-hue/ranking chart may lean on the accent itself). Don't pick colors that vanish into a ${mode_.toLowerCase()} background or clash with the accent.`;
    }

    // Extensions
    d += buildReferencesSection(referencedArtifacts);
    d += buildProjectContextSection(projectCtx);
    d += buildSkillSection(activeSkill);
    d += buildUserRulesSection(userRules);
    d += buildMemoriesSection(memories);

    return d;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns { static, dynamic } parts.
 * static  → cacheable (identity, tools, DuckDB rules, chart types)
 * dynamic → changes per request (date, schema, memories, skill, mode context)
 *
 * Used by agenticLoop for Anthropic prompt caching: pass static with
 * cacheControl: ephemeral, then dynamic as a second system block.
 */
function buildSystemParts(options = {}) {
    const { modelProfile = null, enablePlanner = false, mode = 'diving' } = options;
    const tier = modelProfile?.tier || 'high';
    return {
        static: buildStaticSection(enablePlanner, tier, mode),
        dynamic: buildDynamicSection(options),
    };
}

/**
 * Builds the complete system prompt as a single string (all providers).
 */
function buildSystemPrompt(options = {}) {
    const { modelProfile = null } = options;
    const tier = modelProfile?.tier || 'high';

    if (tier === 'low') {
        return buildCompactPrompt(options);
    }

    const { enablePlanner = false, mode = 'diving' } = options;
    return buildStaticSection(enablePlanner, tier, mode) + '\n\n' + buildDynamicSection(options);
}

/**
 * Compact system prompt for low-tier models (~800 tokens).
 */
function buildCompactPrompt(options = {}) {
    const { tables = [], files = [], currentQuery = '' } = options;

    let prompt = `You are a DuckDB SQL expert. Generate valid DuckDB SQL to answer user questions.

Rules:
- Write ONLY valid DuckDB SQL in a \`\`\`sql code block
- Double quotes for identifiers: "column name" — single quotes for strings: 'value'
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

module.exports = { buildSystemPrompt, buildSystemParts };
