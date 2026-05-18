/**
 * Context section builders: charts table, flock, skills, memories, user rules.
 */

function buildChartTypesSection(tier, mode) {
    if (tier === 'medium' && mode !== 'diving') return '';
    return `
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

function buildFlockSection(flockContext) {
    if (!flockContext || !flockContext.loaded) return '';
    const modelList = (flockContext.models || []).map(m => `\`${m.model_name || m.name}\``).join(', ') || '_none registered yet_';
    const promptList = (flockContext.prompts || []).map(p => `\`${p.prompt_name || p.name}\``).join(', ') || '_none_';
    return `

## Flock — SQL-native LLM Functions (ACTIVE)
The **Flock** DuckDB extension is loaded on this connection. You can call LLM functions directly inside SQL queries:

### Available Functions
| Function | Returns | Best used for |
|---|---|---|
| \`llm_complete(model_cfg, prompt_cfg)\` | JSON | Text generation per row |
| \`llm_filter(model_cfg, prompt_cfg)\` | BOOLEAN | Semantic WHERE predicates |
| \`llm_embedding(model_cfg, ctx_cfg)\` | FLOAT[] | Embeddings + similarity search |
| \`llm_reduce(model_cfg, prompt_cfg)\` | JSON | Aggregate: summarize groups |
| \`llm_rerank(model_cfg, prompt_cfg)\` | JSON[] | Aggregate: rerank by relevance |
| \`fusion_rrf(rank1, rank2, ...)\` | DOUBLE | Hybrid search (BM25 + embeddings) |

### Registered Models
${modelList}

### Registered Prompts
${promptList}

### Flock Usage Rules
1. **Prefer \`llm_filter\` in WHERE** over reading every row yourself when the user asks to find/classify rows semantically (e.g. "find negative reviews", "filter complaints").
2. **Always add a LIMIT** when using \`llm_complete\`, \`llm_filter\`, or \`llm_embedding\` on large tables — each row calls the LLM.
3. **Use registered model aliases** from the list above. Never invent a model name.
4. **For semantic search**, combine \`llm_embedding\` + \`array_cosine_similarity\` + \`fusion_rrf\` with BM25 from the \`fts\` extension.
5. **Warn before running on large tables**: if the table has > 10 000 rows and no WHERE filter, note the cost/latency implications.`;
}

function buildSkillSection(activeSkill) {
    if (!activeSkill || !activeSkill.content) return '';
    return `\n\n## Active Skill: ${activeSkill.name || 'Custom'}
You are currently operating with the following specialized instructions. Follow them precisely:
${activeSkill.content}`;
}

function buildUserRulesSection(userRules) {
    if (!userRules || typeof userRules !== 'string' || !userRules.trim()) return '';
    return `\n\n## User Rules\nThe user has defined these rules for this project. Follow them strictly:\n${userRules}`;
}

function buildMemoriesSection(memories) {
    if (!memories) return '';
    const WARNING = '> Past state only — do not assume files/tables here are available now.';
    if (typeof memories === 'string' && memories.trim()) {
        // Truncate long string memories at 600 chars total
        const trimmed = memories.length > 600 ? memories.substring(0, 597) + '...' : memories;
        return `\n\n## Past Session Context\n${WARNING}\n\n${trimmed}`;
    }
    if (Array.isArray(memories) && memories.length > 0) {
        // Top 3 most recent, max 200 chars each
        const top3 = memories.slice(-3).map(m => {
            const s = String(m);
            return s.length > 200 ? s.substring(0, 197) + '...' : s;
        });
        return `\n\n## Past Session Context\n${WARNING}\n${top3.map(m => `- ${m}`).join('\n')}`;
    }
    return '';
}

module.exports = {
    buildChartTypesSection,
    buildFlockSection,
    buildSkillSection,
    buildUserRulesSection,
    buildMemoriesSection,
};
