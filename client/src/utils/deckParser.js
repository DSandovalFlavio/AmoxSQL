/**
 * AmoxSQL — Report Flow deck parser (.amoxdeck)
 *
 * A deck is plain markdown with:
 *   - An optional YAML front-matter block (title, theme, aspect, variables).
 *   - Slides separated by a line containing exactly `---` (same convention
 *     as Marp/reveal-md — a horizontal-rule line is reserved as the slide
 *     separator; it is never treated as a "real" thematic break inside a
 *     slide).
 *   - An optional `<!-- layout: NAME -->` directive as the first line of a
 *     slide, choosing one of DECK_LAYOUTS (defaults to "content").
 *   - Charts embedded as fenced ```amoxchart blocks referencing a `.amoxvis`
 *     file by path (`src: charts/foo.amoxvis`), rendered inline by
 *     MarkdownPreview via its `renderChartBlock` hook.
 */
import yaml from 'js-yaml';

export const DECK_LAYOUTS = ['title', 'content', 'content-chart', 'chart-full', 'two-col'];
const DEFAULT_LAYOUT = 'content';
const LAYOUT_DIRECTIVE_RE = /^\s*<!--\s*layout:\s*([\w-]+)\s*-->\s*\n?/;

/**
 * Splits a `---`-delimited YAML front-matter block off the top of the content.
 * Returns the parsed object, the original front-matter TEXT (for lossless
 * re-serialization), the remaining body, and how many lines the front-matter
 * consumed (so slide line numbers can be made absolute for cursor jumps).
 */
export function parseDeckFrontMatter(content) {
    const match = (content || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (!match) return { frontMatter: {}, frontMatterText: '', body: content || '', bodyOffsetLines: 0 };

    let frontMatter = {};
    try {
        frontMatter = yaml.load(match[1]) || {};
    } catch (e) {
        console.error('Failed to parse deck front matter:', e);
    }
    // Number of source lines the front-matter block occupies (the body's
    // first line sits at this 0-based index in the full document).
    const bodyOffsetLines = match[0].split('\n').length - 1;
    return { frontMatter, frontMatterText: match[0], body: content.slice(match[0].length), bodyOffsetLines };
}

/**
 * Parses a full .amoxdeck document into { frontMatter, frontMatterText, slides }.
 * Each slide is { id, layout, markdown, raw, startLine } where:
 *  - `markdown` is the slide body WITHOUT the `<!-- layout: X -->` directive,
 *  - `raw` is the trimmed chunk WITH the directive (used for lossless
 *    reorder/delete round-trips via serializeDeck),
 *  - `startLine` is the 1-based line number of the slide in the full document
 *    (used to move the editor cursor to a slide from the outline panel).
 */
export function parseDeck(content) {
    const { frontMatter, frontMatterText, body, bodyOffsetLines } = parseDeckFrontMatter(content);

    // Split into slides on a lone `---` line, skipping separators that
    // appear inside fenced code blocks (```...``` or ~~~...~~~). Track the
    // body-relative start line of each chunk for absolute cursor positioning.
    const lines = body.split('\n');
    const chunks = [];
    let current = [];
    let currentStart = 0;
    let inFence = false;
    let fenceMarker = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fenceMatch = line.match(/^\s*(```|~~~)/);
        if (fenceMatch) {
            if (!inFence) { inFence = true; fenceMarker = fenceMatch[1]; }
            else if (line.trim().startsWith(fenceMarker)) inFence = false;
            current.push(line);
            continue;
        }
        if (!inFence && line.trim() === '---') {
            chunks.push({ text: current.join('\n'), startLine: currentStart });
            current = [];
            currentStart = i + 1;
            continue;
        }
        current.push(line);
    }
    if (current.length) chunks.push({ text: current.join('\n'), startLine: currentStart });

    const slides = chunks
        .map((chunk) => ({ raw: chunk.text.trim(), startLine: chunk.startLine }))
        .filter((chunk) => chunk.raw.length > 0)
        .map((chunk, index) => {
            let layout = DEFAULT_LAYOUT;
            let markdown = chunk.raw;
            const m = chunk.raw.match(LAYOUT_DIRECTIVE_RE);
            if (m) {
                const declared = m[1].toLowerCase();
                if (DECK_LAYOUTS.includes(declared)) layout = declared;
                markdown = chunk.raw.slice(m[0].length);
            }
            return {
                id: `slide-${index}`,
                layout,
                markdown: markdown.trim(),
                raw: chunk.raw,
                // +1 → 1-based line numbers (Monaco convention).
                startLine: bodyOffsetLines + chunk.startLine + 1,
            };
        });

    return { frontMatter, frontMatterText, slides };
}

/**
 * Re-serializes a deck from its front-matter text + slides array. Lossless for
 * reorder/delete because each slide keeps its original `raw` chunk (directive
 * included); we only permute/drop whole chunks and rejoin with the canonical
 * `---` separator. Slides may also be plain `{ raw }` objects (or strings).
 */
export function serializeDeck(frontMatterText, slides) {
    const fm = frontMatterText ? `${frontMatterText.replace(/\s*$/, '')}\n\n` : '';
    const body = (slides || [])
        .map((s) => (typeof s === 'string' ? s : s.raw || ''))
        .map((raw) => raw.trim())
        .filter((raw) => raw.length > 0)
        .join('\n\n---\n\n');
    return `${fm}${body}\n`;
}

/** Parses the body of a fenced ```amoxchart block (YAML: `src`, optional overrides). */
export function parseAmoxChartBlock(raw) {
    try {
        const parsed = yaml.load(raw) || {};
        return { src: parsed.src || '', ...parsed };
    } catch (e) {
        return { src: '', error: e.message };
    }
}

export const DECK_STARTER_TEMPLATE = `---
title: New Deck
theme: dark
aspect: "16:9"
variables:
  region: "US"
---

<!-- layout: title -->
# New Deck

## Subtitle goes here

---

<!-- layout: content-chart -->
## A slide with a chart

Write your narrative here. Reference a chart saved from Story Flow —
the query re-runs each time you click **Refresh all**, so the chart
stays current without redoing the analysis.

\`\`\`amoxchart
src: charts/example.amoxvis
\`\`\`

---

<!-- layout: content -->
## Key takeaways

- First point
- Second point
- Third point
`;
