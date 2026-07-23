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
const { buildAssistantModeSection, buildDivingModeSection, buildLiveEditorState } = require('./modes');
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
- Correlated metrics: \`SELECT CORR(col_a, target) FROM table\`

### DuckDB syntax gotchas (get these exactly right — do NOT guess)
- **Exclude/keep columns BY NAME with a pattern** → the star pattern operator goes right after \`*\`, filtering COLUMN NAMES:
  - Drop columns whose name CONTAINS "plan": \`SELECT * NOT ILIKE '%plan%' FROM t\` (\`%\` = any chars, so \`%plan%\` = contains; \`'plan%'\` = starts-with only).
  - Keep only columns starting with "sales_": \`SELECT * LIKE 'sales_%' FROM t\`. Also \`* GLOB\` / \`* SIMILAR TO\`.
  - This is NOT a \`WHERE\` clause — \`WHERE col NOT ILIKE ...\` filters ROWS, not columns. Never use \`WHERE\` to drop columns.
- **\`EXCLUDE\` / \`REPLACE\` take exact names, NOT patterns**: \`SELECT * EXCLUDE (col1, col2)\`. \`EXCLUDE (like '...')\` is **invalid syntax** — never write it.
- **\`COLUMNS('regex')\`** uses RE2 — **no lookahead/lookbehind** (\`(?!...)\` fails). To negate a name pattern, use \`* NOT ILIKE\` instead.
- When unsure, call \`lookup_duckdb_docs\`; for a function's signature call \`lookup_duckdb_function\`; validate with \`validate_sql\` before showing SQL.`;

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
        tableRoster = null,
    } = options;
    const tier = modelProfile?.tier || 'high';

    // ── Schema (semi-stable — kept near the TOP so its token prefix stays
    // cache-hot; the volatile date + live editor state go at the very END) ──
    let d = `## Data Context\n### Tables\n${formatTableSchemas(tables)}`;
    d += formatFileSchemas(files);

    // Bounded-context roster (F3): when assistant loaded only the referenced
    // tables, list the OTHER table names cheaply so the model knows they exist
    // and can pull columns on demand via describe_table.
    if (Array.isArray(tableRoster) && tableRoster.length) {
        const shown = new Set((tables || []).map(t => t.name));
        const others = tableRoster.filter(n => !shown.has(n));
        if (others.length) {
            d += `\n\n_Other tables in this database (call \`describe_table\` for columns): ${others.join(', ')}_`;
        }
    }

    // Mode section (instructions — stable per mode)
    if (mode === 'assistant') {
        d += buildAssistantModeSection({ filePath, fileType });
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

    // ── VOLATILE TAIL (kept LAST so everything above stays cache-hot) ──
    // The live editor state changes on every keystroke; the date changes daily.
    // Placing them at the end means an edit or a new day only invalidates these
    // trailing tokens, not the whole schema+instructions prefix (F3 / H5).
    if (mode === 'assistant') {
        d += buildLiveEditorState({ currentQuery, currentResult, currentChartConfig });
    }
    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    d += `\n\n## Current Date\n${today}`;

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
    const { modelProfile = null, thinkTokenPrefix = '' } = options;
    const tier = modelProfile?.tier || 'high';

    // gemma4 thinking is enabled by a <|think|> token at the very START of the
    // system prompt (F5). Empty for every other model / when thinking is off.
    const prefix = thinkTokenPrefix ? thinkTokenPrefix + '\n\n' : '';

    if (tier === 'low') {
        return prefix + buildCompactPrompt(options);
    }

    const { enablePlanner = false, mode = 'diving' } = options;
    return prefix + buildStaticSection(enablePlanner, tier, mode) + '\n\n' + buildDynamicSection(options);
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
