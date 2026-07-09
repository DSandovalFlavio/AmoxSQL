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
5. **Emphasis & declutter.** One protagonist in color, the rest muted (set \`protagonist\` for series, or \`highlight\` for a single bar). Remove anything that isn't carrying the message. Title states the *conclusion*, not the contents; add a \`takeaway\`.

## Color with intent — never decorative
Color is a variable that MEANS something. Choose the palette by the data's role, and keep ONE palette for the whole analysis (switch only with a semantic reason):
- **One metric, many categories (a ranking)** → ONE color for all bars (\`bar_color_mode="series"\`), then \`highlight\`/\`protagonist\` the hero. A rainbow (one color per bar) is WRONG — it implies the categories are unrelated groups when they're just a sorted list.
- **Comparing distinct series** (regions, segments) → a qualitative palette (\`default\`, \`vivid\`, \`dark2\`), one color per series. This is the only case where multiple hues are correct.
- **Ordered magnitude** (heatmap, or shading by value) → a sequential palette (\`blues\`, \`greens\`) — light = low, dark = high.
- **Deviation around a center** (+/- vs a baseline) → a diverging palette (\`spectral\`).
- **Red is reserved.** Use red (\`reds\`, red overlays, red \`highlight\`) ONLY for something negative — loss, churn, error, below-target. NEVER color neutral revenue/volume red; it falsely signals alarm.
- **\`corporate\` (grays)** is for muting the non-protagonist, not for the whole chart.
- Default when unsure: keep \`default\` with \`bar_color_mode="series"\` and let \`highlight\`/\`protagonist\` do the emphasis.

### Capability reference (what each type CAN do)
\`bar\` compare categories (+\`split_by\`=grouped) · \`bar-stacked\`/\`bar-100\` parts of a whole · \`bar-horizontal\` ranking/long names · \`line\`/\`area\` true time series (≥4–5 pts) · \`donut\` part-of-whole (≤7) · \`scatter\`/\`bubble\` relationships · \`combo\` two metrics at different scales · \`funnel\` stage drop-off · \`heatmap\` 2-D patterns · \`treemap\` hierarchy.

### Hard guardrails
- Trend line: only on a **single-series** time series with **≥5 points**. Never with \`split_by\`/multiple series.
- \`donut\`: ≤7 slices, else use a bar.`;
}

/**
 * Build the "Referenced Artifacts" section — artifacts the user pointed at for
 * this turn ("Ask about this" on a chart/query/step/finding). The server has
 * already rehydrated heavy data (SQL + sample rows) from the query cache.
 * The agent must ANCHOR its answer to these, not re-explore blindly.
 */
function buildReferencesSection(refs) {
    if (!Array.isArray(refs) || refs.length === 0) return '';

    const fmtRows = (columns, rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return '';
        const cols = (columns && columns.length)
            ? columns.map(c => c.name || c)
            : Object.keys(rows[0] || {});
        const sample = rows.slice(0, 10);
        const header = `| ${cols.join(' | ')} |`;
        const sep = `| ${cols.map(() => '---').join(' | ')} |`;
        const body = sample.map(r =>
            `| ${cols.map(c => {
                const v = r[c];
                return v === null || v === undefined ? '' : String(v);
            }).join(' | ')} |`
        ).join('\n');
        const more = rows.length > sample.length ? `\n_(showing ${sample.length} of ${rows.length} rows)_` : '';
        return `\n${header}\n${sep}\n${body}${more}`;
    };

    const blocks = refs.map((ref, i) => {
        const label = ref.label || ref.type || `artifact ${i + 1}`;
        let b = `### ${i + 1}. ${label} (${ref.type || 'artifact'})`;
        if (ref.stepLabel) b += `\n- Plan step: ${ref.stepLabel}`;
        if (ref.insight)   b += `\n- What it showed: ${ref.insight}`;
        if (ref.findingText) b += `\n- Finding: "${ref.findingText}"`;
        if (ref.column)    b += `\n- Cited value column: ${ref.column}`;
        if (ref.table)     b += `\n- Table: ${ref.table}${ref.columnName ? ` · column: ${ref.columnName}` : ''}`;
        if (ref.chartConfig) {
            const cc = ref.chartConfig;
            const axes = [cc.xAxis && `x=${cc.xAxis}`, cc.yAxis && `y=${cc.yAxis}`, cc.split_by && `split=${cc.split_by}`]
                .filter(Boolean).join(', ');
            b += `\n- Chart: type=${cc.chartType || cc.type || '?'}${axes ? ` (${axes})` : ''}`;
        }
        if (ref.sql) b += `\n- SQL:\n\`\`\`sql\n${ref.sql}\n\`\`\``;
        if (ref.sampleRows && ref.sampleRows.length) {
            b += `\n- Data:${fmtRows(ref.columns, ref.sampleRows)}`;
        }
        if (ref.queryId) b += `\n- queryId: \`${ref.queryId}\` (cite as needed; re-run with execute_sql if you transform it)`;
        if (ref.stale)   b += `\n- ⚠️ This artifact's data is no longer cached — re-run its SQL with execute_sql to inspect it.`;
        return b;
    }).join('\n\n');

    return `\n\n## Referenced Artifacts (the user is asking about THESE)
The user pointed at the following artifact(s) from this session. Anchor your answer to them — read the SQL/data/config provided and respond specifically. Do NOT re-explore from scratch. If you need to transform or recompute, use \`execute_sql\` (never invent a queryId).

${blocks}`;
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
    buildReferencesSection,
    buildSkillSection,
    buildUserRulesSection,
    buildMemoriesSection,
};
