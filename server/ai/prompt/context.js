/**
 * Context section builders: charts table, skills, memories, user rules.
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
    buildSkillSection,
    buildUserRulesSection,
    buildMemoriesSection,
};
