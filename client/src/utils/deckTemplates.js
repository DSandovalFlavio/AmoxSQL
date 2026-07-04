/**
 * AmoxSQL — Report Flow deck templates & snippet builders.
 *
 * Starter markdown for each deck layout (inserted from the Studio's Layouts
 * panel) plus small helpers to build a chart block or a whole new slide chunk,
 * and to split/rebuild a single slide (prose vs. chart) so the visual Design
 * editor can edit one slide at a time and re-serialize losslessly. The
 * markdown stays the single source of truth — the user never edits the raw
 * `.amoxdeck` directly (same relationship Story Flow has with its `.amoxvis`
 * JSON).
 */
import { parseAmoxChartBlock } from './deckParser';

const CHART_PLACEHOLDER = 'charts/example.amoxvis';
const AMOXCHART_FENCE_RE = /```amoxchart\n([\s\S]*?)```/;

/** Body markdown (WITHOUT the layout directive) seeded for each layout. */
export const DECK_LAYOUT_TEMPLATES = {
    title: `# Slide title

## Subtitle goes here`,

    content: `## Section heading

Write your point here.

- First point
- Second point
- Third point`,

    'content-chart': `## Narrative + chart

Explain what the chart shows. The query re-runs on **Refresh all**, so it
stays current without redoing the analysis.

\`\`\`amoxchart
src: ${CHART_PLACEHOLDER}
\`\`\``,

    'chart-full': `## Full-width chart

\`\`\`amoxchart
src: ${CHART_PLACEHOLDER}
\`\`\``,

    'two-col': `## Left column

- Point A
- Point B

<!-- col -->

## Right column

- Point C
- Point D`,
};

/** A fenced amoxchart block referencing a `.amoxvis` file by project path. */
export function buildChartBlock(src) {
    return '```amoxchart\nsrc: ' + (src || CHART_PLACEHOLDER) + '\n```';
}

/**
 * A complete slide chunk (layout directive + starter body) ready to be
 * inserted as a new slide. `content` is emitted without a directive since it
 * is the parser default.
 */
export function buildSlideSnippet(layout) {
    const body = DECK_LAYOUT_TEMPLATES[layout] || DECK_LAYOUT_TEMPLATES.content;
    const directive = layout && layout !== 'content' ? `<!-- layout: ${layout} -->\n` : '';
    return `${directive}${body}`;
}

/**
 * Splits a slide's body markdown (layout directive already stripped by the
 * parser) into its editable prose and its single chart reference. In this
 * visual model a slide holds at most one chart; extra amoxchart blocks (if a
 * user hand-authored them in Source view) are left inside `prose` untouched.
 */
export function splitSlideContent(markdown) {
    const m = (markdown || '').match(AMOXCHART_FENCE_RE);
    if (!m) return { prose: (markdown || '').trim(), chartSrc: null };
    const chartSrc = parseAmoxChartBlock(m[1]).src || null;
    const prose = (markdown.slice(0, m.index) + markdown.slice(m.index + m[0].length)).trim();
    return { prose, chartSrc };
}

/**
 * Rebuilds a slide's raw chunk (directive + prose + optional chart block) from
 * its parts — the write-side counterpart to splitSlideContent. `content` emits
 * no directive since it's the parser default.
 */
export function buildSlideRaw({ layout, prose, chartSrc }) {
    const directive = layout && layout !== 'content' ? `<!-- layout: ${layout} -->\n` : '';
    const parts = [];
    const trimmedProse = (prose || '').trim();
    if (trimmedProse) parts.push(trimmedProse);
    if (chartSrc) parts.push(buildChartBlock(chartSrc));
    return `${directive}${parts.join('\n\n')}`.trim();
}
