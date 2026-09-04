/**
 * AmoxSQL — Report Flow deck → PowerPoint (.pptx) export.
 *
 * Charts are re-fetched and re-queried fresh (same `.amoxvis` → {{var}} →
 * /api/query pipeline as "Refresh all"), independent of what's on screen —
 * so an export always reflects current data, not a stale render. Chart
 * types with a native pptxgenjs mapping (bar/line/area/pie/donut/combo)
 * become real, editable PowerPoint charts; everything else (and anything
 * when the caller passes chartMode:'image') falls back to a PNG snapshot of
 * the already-mounted chart in the deck's Present view — which is why
 * export requires Present view: it's where every slide's chart is actually
 * rendered in the DOM to capture.
 *
 * Text is flattened to native pptx text runs (headings/bold/italic/bullets);
 * GFM tables become native pptx tables. Full markdown fidelity (code blocks,
 * images, KaTeX, Mermaid) isn't attempted here — same honest scope as the
 * Word exporter.
 */
import { API_BASE } from '../api.js';
import html2canvas from 'html2canvas-pro';
import PptxGenJS from 'pptxgenjs';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { injectEnvironmentVariables } from './injectEnvironmentVariables';
import { parseAmoxChartBlock } from './deckParser';
import { isNativeChartType, buildNativeChartSpec, buildComboChartSpec } from './officeChartMapper';

const remarkProcessor = unified().use(remarkParse).use(remarkGfm);

const AMOXCHART_FENCE_RE = /```amoxchart\n([\s\S]*?)```/;
// Speaker notes (Fase 5 — el slide como lienzo): same fenced-block convention
// as deckTemplates.js's NOTES_FENCE_RE, kept as a local copy here rather than
// importing — same "each export module is self-contained" pattern already
// used for AMOXCHART_FENCE_RE above.
const NOTES_FENCE_RE = /```notes\n([\s\S]*?)```/;

const SLIDE_W = 13.333; // LAYOUT_WIDE (16:9 widescreen), inches
const SLIDE_H = 7.5;
const MARGIN = 0.5;
const COL_GAP = 0.4;

// ── Markdown → native pptx text runs ────────────────────────────────────────
// PowerPoint text boxes render a flat run list, not arbitrary markdown — this
// covers the common subset (headings, paragraphs, bold/italic, bullets,
// blockquotes). Tables are handled separately (see markdownTables); code
// blocks/images/math/Mermaid inside slide text are not flattened here.
function walkInlineToRuns(nodes, style, runs) {
    for (const node of nodes || []) {
        switch (node.type) {
            case 'text':
                if (node.value) runs.push({ text: node.value, options: { ...style } });
                break;
            case 'strong':
                walkInlineToRuns(node.children, { ...style, bold: true }, runs);
                break;
            case 'emphasis':
                walkInlineToRuns(node.children, { ...style, italic: true }, runs);
                break;
            case 'inlineCode':
                if (node.value) runs.push({ text: node.value, options: { ...style, fontFace: 'Consolas' } });
                break;
            case 'break':
                runs.push({ text: '', options: { ...style, breakLine: true } });
                break;
            default:
                if (node.children) walkInlineToRuns(node.children, style, runs);
        }
    }
}

export function markdownToTextRuns(markdown) {
    const tree = remarkProcessor.parse(markdown || '');
    const runs = [];
    for (const node of tree.children || []) {
        switch (node.type) {
            case 'heading': {
                const size = node.depth === 1 ? 28 : node.depth === 2 ? 22 : 18;
                const start = runs.length;
                walkInlineToRuns(node.children, { bold: true, fontSize: size }, runs);
                if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                break;
            }
            case 'paragraph': {
                const start = runs.length;
                walkInlineToRuns(node.children, {}, runs);
                if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                break;
            }
            case 'list': {
                for (const item of node.children) {
                    for (const child of item.children) {
                        if (child.type !== 'paragraph') continue;
                        const start = runs.length;
                        walkInlineToRuns(child.children, { bullet: true }, runs);
                        if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                    }
                }
                break;
            }
            case 'blockquote': {
                for (const child of node.children) {
                    if (child.type !== 'paragraph') continue;
                    const start = runs.length;
                    walkInlineToRuns(child.children, { italic: true, color: '666666' }, runs);
                    if (runs.length > start) runs[runs.length - 1].options.breakLine = true;
                }
                break;
            }
            default:
                break; // tables/code/images/thematicBreak — not flattened into text runs
        }
    }
    return runs;
}

// ── GFM tables → pptxgenjs rows (first table in the slide's text only) ─────
function firstMarkdownTable(markdown) {
    const tree = remarkProcessor.parse(markdown || '');
    const tableNode = (tree.children || []).find((n) => n.type === 'table');
    if (!tableNode) return null;
    return tableNode.children.map((rowNode, r) => rowNode.children.map((cellNode) => ({
        text: cellNode.children.map((c) => c.value || '').join(''),
        options: r === 0 ? { bold: true, fill: { color: 'F1F3F5' } } : {},
    })));
}

// ── Live chart data — re-fetch + re-run, independent of the DOM ────────────
async function loadChartData(src, variables) {
    const cleanPath = (src || '').replace(/^(\.\/|\/)/, '');
    const fileRes = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(cleanPath)}`);
    const fileData = await fileRes.json();
    if (fileData.error) throw new Error(fileData.error);

    const config = JSON.parse(fileData.content);
    const query = injectEnvironmentVariables(config.query || '', variables);
    if (!query.trim()) throw new Error('No stored query');

    const queryRes = await fetch(`${API_BASE}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    const queryData = await queryRes.json();
    if (!queryRes.ok) throw new Error(queryData.error || 'Query failed');
    return { data: queryData.data, config };
}

// ── Image fallback — capture the already-mounted chart from Present view ──
async function captureChartImage(el) {
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, logging: false, useCORS: true });
    return canvas.toDataURL('image/png');
}

// ── Layout → slide region coordinates (inches) ─────────────────────────────
// Exported: also used by generateNotebookPptxReport.js, which reuses the
// exact same slide geometry so a notebook export and a deck export of an
// equivalent chart+text pairing come out sized the same way.
export function layoutBoxes(layout) {
    const full = { x: MARGIN, y: MARGIN, w: SLIDE_W - MARGIN * 2, h: SLIDE_H - MARGIN * 2 };
    if (layout === 'content-chart' || layout === 'two-col') {
        const colW = (SLIDE_W - MARGIN * 2 - COL_GAP) / 2;
        return {
            text: { x: MARGIN, y: MARGIN, w: colW, h: SLIDE_H - MARGIN * 2 },
            chart: { x: MARGIN + colW + COL_GAP, y: MARGIN, w: colW, h: SLIDE_H - MARGIN * 2 },
        };
    }
    return { full };
}

/**
 * @param {{frontMatter, slides}} deck - result of deckParser.parseDeck()
 * @param {Object} opts
 * @param {'native'|'image'} [opts.chartMode] - default chart rendering mode
 * @param {Map<string,HTMLElement>} [opts.slideCardEls] - slideId → mounted
 *   `.deck-slide-card` element (from Present view), used for the image
 *   fallback path only.
 */
export async function generatePptxReport(deck, { chartMode = 'native', slideCardEls = new Map() } = {}) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    if (deck.frontMatter?.title) pptx.title = deck.frontMatter.title;

    const variables = deck.frontMatter?.variables || {};

    for (const slideDef of deck.slides) {
        const slide = pptx.addSlide();
        const boxes = layoutBoxes(slideDef.layout);
        const chartMatch = slideDef.markdown.match(AMOXCHART_FENCE_RE);

        let textMarkdown = slideDef.markdown;
        let chartSrc = null;
        if (chartMatch) {
            chartSrc = parseAmoxChartBlock(chartMatch[1]).src;
            textMarkdown = (
                slideDef.markdown.slice(0, chartMatch.index) +
                slideDef.markdown.slice(chartMatch.index + chartMatch[0].length)
            ).trim();
        }

        // Strip the notes fence out of the visible text too — it belongs in
        // the PowerPoint's Notes pane, not on the slide itself.
        let speakerNotes = '';
        const notesMatch = textMarkdown.match(NOTES_FENCE_RE);
        if (notesMatch) {
            speakerNotes = notesMatch[1].replace(/\n$/, '');
            textMarkdown = (
                textMarkdown.slice(0, notesMatch.index) +
                textMarkdown.slice(notesMatch.index + notesMatch[0].length)
            ).trim();
        }
        if (speakerNotes.trim()) slide.addNotes(speakerNotes);

        const textBox = boxes.text || boxes.full;
        const table = firstMarkdownTable(textMarkdown);
        // With a table present, split the text box: prose on top, table below.
        const proseBox = table ? { ...textBox, h: textBox.h * 0.4 } : textBox;

        const runs = markdownToTextRuns(textMarkdown);
        if (runs.length) {
            slide.addText(runs, { ...proseBox, fontSize: 14, color: '333333', valign: 'top', align: slideDef.layout === 'title' ? 'center' : 'left' });
        }
        if (table) {
            slide.addTable(table, {
                x: textBox.x, y: textBox.y + textBox.h * 0.45, w: textBox.w, h: textBox.h * 0.5,
                fontSize: 10, border: { type: 'solid', color: 'D0D5DA', pt: 0.5 },
            });
        }

        if (chartSrc) {
            const chartBox = boxes.chart || boxes.full;
            try {
                const { data, config } = await loadChartData(chartSrc, variables);
                const useNative = chartMode === 'native' && isNativeChartType(config.chartType) && data.length > 0;

                if (useNative) {
                    if (config.chartType === 'combo') {
                        const { multiSpec, sharedOptions } = buildComboChartSpec(config, data, []);
                        const typedSpec = multiSpec.map((m) => ({ ...m, type: pptx.ChartType[m.type] }));
                        slide.addChart(typedSpec, null, { ...chartBox, ...sharedOptions });
                    } else {
                        const spec = buildNativeChartSpec(config, data, []);
                        slide.addChart(pptx.ChartType[spec.pptxType], spec.data, { ...chartBox, ...spec.options });
                    }
                } else {
                    const cardEl = slideCardEls.get(slideDef.id);
                    const chartEl = cardEl?.querySelector('.amoxchart-embed');
                    if (chartEl) {
                        const dataUrl = await captureChartImage(chartEl);
                        slide.addImage({ data: dataUrl, ...chartBox, sizing: { type: 'contain', w: chartBox.w, h: chartBox.h } });
                    } else {
                        slide.addText(`[Chart not available for image export: ${chartSrc} — open Present view first]`, { ...chartBox, fontSize: 12, color: '999999', align: 'center', valign: 'middle' });
                    }
                }
            } catch (err) {
                slide.addText(`[Chart failed to load: ${chartSrc} — ${err.message}]`, { ...chartBox, fontSize: 11, color: 'C0392B', align: 'center', valign: 'middle' });
            }
        }
    }

    const filename = `${(deck.frontMatter?.title || 'amoxsql-deck').replace(/[^\w-]+/g, '_')}.pptx`;
    await pptx.writeFile({ fileName: filename });
}
