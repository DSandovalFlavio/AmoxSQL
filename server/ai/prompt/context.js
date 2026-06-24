/**
 * Context section builders: charts table, skills, memories, user rules.
 */

function buildChartTypesSection(tier, mode) {
    if (tier === 'medium' && mode !== 'diving') return '';
    return `
## Chart Selection — reason, don't look up
Do NOT map a column type to a chart type (the trap: "has a date → line"). Reason in this order:
1. **Message first.** What is the ONE sentence the reader must leave with? The chart exists to make THAT obvious.
2. **Classify the intent**, not the data: comparison · change-over-time · part-of-whole · relationship · distribution · **ranking change**.
3. **Check the data shape** — it overrides intent:
   - **Few time periods (2–3)** → this is a *comparison*, not a trend. Use \`bar\` grouped by \`split_by\` (before/after per category), not a line. A line needs ≥4–5 points to be honest.
   - **Ranking flips between 2 periods** (e.g. a category goes from last to first) → grouped \`bar\`, or a 2-point \`line\` per series WITHOUT a trend (a slope view).
   - Many categories / long names → \`bar-horizontal\`. >7 part-of-whole slices → \`bar\`/\`bar-horizontal\`, not \`donut\`.
4. **5-second test.** If a reader can't get the message in 5 seconds, change the chart, don't decorate it.
5. **Emphasis & declutter.** One protagonist series in color, the rest muted (use \`highlight\` or \`color_theme\`). Remove anything that isn't carrying the message. Title states the *conclusion*, not the contents.

### Capability reference (what each type CAN do)
\`bar\` compare categories (+\`split_by\`=grouped) · \`bar-stacked\`/\`bar-100\` parts of a whole · \`bar-horizontal\` ranking/long names · \`line\`/\`area\` true time series (≥4–5 pts) · \`donut\` part-of-whole (≤7) · \`scatter\`/\`bubble\` relationships · \`combo\` two metrics at different scales · \`funnel\` stage drop-off · \`heatmap\` 2-D patterns · \`treemap\` hierarchy.

### Hard guardrails
- Trend line: only on a **single-series** time series with **≥5 points**. Never with \`split_by\`/multiple series.
- \`donut\`: ≤7 slices, else use a bar.`;
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
