/**
 * AmoxSQL — Export to Word (.docx)
 * Converts a notebook's report view (markdown text, SQL result tables, charts)
 * into a native, editable Word document. Charts are embedded as PNG images
 * (captured the same way as the HTML export); text and tables are fully
 * editable native Word content, produced from a real markdown AST (remark),
 * not a regex approximation.
 */
import { API_BASE } from '../api.js';
import html2canvas from 'html2canvas-pro';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    ImageRun, ExternalHyperlink, HeadingLevel, AlignmentType, BorderStyle,
    WidthType, LevelFormat, ShadingType,
} from 'docx';

const MONO_FONT = 'JetBrains Mono, Consolas, monospace';
const MAX_IMG_WIDTH = 600; // px — fits within a Letter/A4 content width at 1" margins
const NUMBERING_REF = 'amoxsql-ordered-list';

const remarkProcessor = unified().use(remarkParse).use(remarkGfm);

// ── Theme / chart capture (mirrors generateHtmlReport.js) ──────────────────

// Same theme-class list App.jsx toggles on document.body when the user
// switches themes (see App.jsx's "Apply Theme & Accent Classes" effect).
const THEME_CLASSES = ['light-theme', 'theme-onyx', 'theme-amoxdark', 'theme-ayu', 'theme-nord', 'theme-islands', 'theme-ivory', 'theme-mist', 'theme-amoxlight'];

// Charts render axis/grid/text colors via `var(--css-custom-property)` set
// directly as SVG attribute values, so they repaint live when the body's
// theme class changes — no React re-render needed. Word documents are meant
// to be read on a white page, so charts are always captured in light theme
// regardless of the app's current theme, then the original theme is restored.
function forceLightTheme() {
    const previous = [...document.body.classList].filter((c) => THEME_CLASSES.includes(c));
    THEME_CLASSES.forEach((c) => document.body.classList.remove(c));
    document.body.classList.add('light-theme');
    return () => {
        document.body.classList.remove('light-theme');
        previous.forEach((c) => document.body.classList.add(c));
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_RESULT_HEIGHT = 400; // matches NotebookCell's own drag-resize default

// Report mode renders the chart inside `.nb-results-height--report`, which is
// `height: auto; min-height: 300px` in CSS — it ignores the height the user
// dragged the cell to in edit mode (`resultHeight`), so an export captured
// as-is comes out at a generic, often much smaller, size. We temporarily pin
// this container to the user's actual resultHeight before capturing, wait for
// Recharts' ResponsiveContainer (which debounces resize by 120ms) to redraw
// at the new size, capture, then restore the report-mode default.
async function captureCellChart(cellId, desiredHeight = DEFAULT_RESULT_HEIGHT) {
    const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cellEl) return null;

    const wrapper = cellEl.querySelector('.recharts-wrapper');
    if (!wrapper) return null;

    const chartContainer = cellEl.querySelector('.nb-results-height--report')
        || wrapper.closest('[style*="flex"]')
        || wrapper.parentElement?.parentElement
        || wrapper.parentElement;

    const restoreTheme = forceLightTheme();
    const previousHeight = chartContainer.style.height;
    const previousMinHeight = chartContainer.style.minHeight;
    chartContainer.style.height = `${desiredHeight}px`;
    chartContainer.style.minHeight = `${desiredHeight}px`;

    try {
        // Covers both the CSS var() theme repaint and ResponsiveContainer's
        // 120ms resize debounce, so Recharts redraws at the new height first.
        await sleep(200);
        const canvas = await html2canvas(chartContainer, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            ignoreElements: (el) => el.tagName === 'BUTTON' || el.tagName === 'INPUT',
        });
        return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
    } catch (err) {
        console.error('Chart capture failed for Word export:', cellId, err);
        return null;
    } finally {
        chartContainer.style.height = previousHeight;
        chartContainer.style.minHeight = previousMinHeight;
        restoreTheme();
    }
}

function detectCellViewMode(cellId) {
    const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cellEl) return 'table';
    return cellEl.querySelector('.recharts-wrapper') ? 'chart' : 'table';
}

function captureChartAnnotations(cellId) {
    const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cellEl) return { title: '', subtitle: '', footnote: '' };
    const title = cellEl.querySelector('h2')?.textContent || '';
    const subtitle = cellEl.querySelector('h3')?.textContent || '';
    const footnoteEl = cellEl.querySelector('[style*="font-style: italic"]');
    const footnote = footnoteEl?.textContent || '';
    return { title, subtitle, footnote };
}

// ── Image helpers ────────────────────────────────────────────────────────

function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function fitDimensions(width, height, maxWidth = MAX_IMG_WIDTH) {
    if (!width || !height) return { width: maxWidth, height: Math.round(maxWidth * 0.6) };
    if (width <= maxWidth) return { width, height };
    const ratio = maxWidth / width;
    return { width: maxWidth, height: Math.round(height * ratio) };
}

// Resolves an inline markdown image (![alt](src)) to docx ImageRun input.
// Supports http(s) URLs, data: URIs, and project-relative paths (via the
// binary file endpoint). Returns null if the image can't be resolved —
// callers fall back to a text placeholder rather than failing the export.
async function resolveInlineImage(src) {
    if (!src) return null;
    try {
        const ext = (src.split('.').pop() || '').split(/[?#]/)[0].toLowerCase();
        const type = ext === 'jpeg' ? 'jpg' : ext;
        if (!['png', 'jpg', 'gif', 'bmp'].includes(type) && !src.startsWith('data:')) return null;

        let bytes;
        if (src.startsWith('data:')) {
            bytes = dataUrlToUint8Array(src);
        } else if (/^https?:/i.test(src)) {
            const res = await fetch(src);
            if (!res.ok) return null;
            bytes = new Uint8Array(await res.arrayBuffer());
        } else {
            const relPath = src.replace(/^(\.\/|\/)/, '');
            const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(relPath)}&binary=1`);
            const data = await res.json();
            if (data.error || !data.contentBase64) return null;
            bytes = base64ToUint8Array(data.contentBase64);
        }

        const resolvedType = src.startsWith('data:')
            ? (src.match(/^data:image\/(png|jpe?g|gif|bmp)/)?.[1] || 'png').replace('jpeg', 'jpg')
            : type;
        if (!['png', 'jpg', 'gif', 'bmp'].includes(resolvedType)) return null;

        const dims = await new Promise((resolve) => {
            const blob = new Blob([bytes], { type: `image/${resolvedType}` });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
            img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
            img.src = url;
        });

        return { data: bytes, type: resolvedType, ...fitDimensions(dims.width, dims.height) };
    } catch (e) {
        console.error('Failed to resolve image for Word export:', src, e);
        return null;
    }
}

// ── Cell value formatting (mirrors generateHtmlReport.js's formatVal) ──────

function formatCellValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') {
        return Number.isInteger(val) ? val.toLocaleString() : val.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    if (typeof val === 'object') return JSON.stringify(val);
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z?$/.test(s)) return s.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s.replace('T', ' ').replace(/(\.\d{3})?Z$/, '');
    return s;
}

// ── Result table → native docx Table ────────────────────────────────────────

// Word's default "Normal Table" style has no visible gridlines and lets column
// widths collapse if cells don't carry an explicit width — without both of
// these a table can render as a near-invisible sliver. Every Table we build
// gets this border set, and every TableCell gets an explicit even-split width.
const TABLE_BORDER_LINE = { style: BorderStyle.SINGLE, size: 4, color: 'D0D5DA' };
const TABLE_BORDERS = {
    top: TABLE_BORDER_LINE, bottom: TABLE_BORDER_LINE, left: TABLE_BORDER_LINE, right: TABLE_BORDER_LINE,
    insideHorizontal: TABLE_BORDER_LINE, insideVertical: TABLE_BORDER_LINE,
};
function cellWidth(numColumns) {
    return { size: Math.floor(100 / numColumns), type: WidthType.PERCENTAGE };
}

function buildResultTable(data, maxRows = 200) {
    if (!data || data.length === 0) return null;
    const columns = Object.keys(data[0]);
    const width = cellWidth(columns.length);

    const headerRow = new TableRow({
        children: columns.map((col) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: col, bold: true })] })],
            shading: { type: ShadingType.CLEAR, fill: 'F1F3F5' },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            width,
        })),
    });

    const bodyRows = data.slice(0, maxRows).map((row) => new TableRow({
        children: columns.map((col) => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: formatCellValue(row[col]) })] })],
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            width,
        })),
    }));

    const nodes = [new Table({ rows: [headerRow, ...bodyRows], width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS })];

    if (data.length > maxRows) {
        nodes.push(new Paragraph({
            children: [new TextRun({ text: `Showing first ${maxRows.toLocaleString()} of ${data.length.toLocaleString()} rows`, italics: true, color: '888888', size: 18 })],
            spacing: { before: 80, after: 160 },
        }));
    } else {
        nodes.push(new Paragraph({ text: '', spacing: { after: 160 } }));
    }

    return nodes;
}

// ── Markdown AST → docx (real conversion, not regex) ────────────────────────

const HEADING_MAP = {
    1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6,
};
const ALIGN_MAP = { left: AlignmentType.START, right: AlignmentType.END, center: AlignmentType.CENTER };

// Inline nodes (text, strong, emphasis, links, images, ...) → ParagraphChild[]
async function inlineToRuns(nodes, style = {}) {
    const runs = [];
    for (const node of nodes || []) {
        switch (node.type) {
            case 'text':
                runs.push(new TextRun({ text: node.value, ...style }));
                break;
            case 'strong':
                runs.push(...(await inlineToRuns(node.children, { ...style, bold: true })));
                break;
            case 'emphasis':
                runs.push(...(await inlineToRuns(node.children, { ...style, italics: true })));
                break;
            case 'delete':
                runs.push(...(await inlineToRuns(node.children, { ...style, strike: true })));
                break;
            case 'inlineCode':
                runs.push(new TextRun({
                    text: node.value, font: MONO_FONT,
                    shading: { type: ShadingType.CLEAR, fill: 'F1F3F5' }, ...style,
                }));
                break;
            case 'break':
                runs.push(new TextRun({ text: '', break: 1 }));
                break;
            case 'link': {
                const inner = await inlineToRuns(node.children, { ...style, color: '2563EB', underline: {} });
                runs.push(new ExternalHyperlink({ link: node.url, children: inner }));
                break;
            }
            case 'image': {
                const img = await resolveInlineImage(node.url);
                if (img) {
                    runs.push(new ImageRun({ type: img.type, data: img.data, transformation: { width: img.width, height: img.height } }));
                } else {
                    runs.push(new TextRun({ text: `[image: ${node.alt || node.url}]`, italics: true, color: '888888', ...style }));
                }
                break;
            }
            default:
                if (node.children) runs.push(...(await inlineToRuns(node.children, style)));
                else if (typeof node.value === 'string') runs.push(new TextRun({ text: node.value, ...style }));
        }
    }
    return runs;
}

// Ordered/unordered/task lists (with nesting) → Paragraph[]
async function listToDocxNodes(node, extra, level = 0) {
    const out = [];
    const ordered = !!node.ordered;

    for (const item of node.children) {
        const checked = item.checked; // true | false | null (GFM task list)
        for (const child of item.children) {
            if (child.type === 'list') {
                out.push(...(await listToDocxNodes(child, extra, level + 1)));
                continue;
            }
            if (child.type === 'paragraph') {
                const runs = await inlineToRuns(child.children, extra.runStyle);
                if (checked === true) runs.unshift(new TextRun({ text: '☑ ' }));
                else if (checked === false) runs.unshift(new TextRun({ text: '☐ ' }));

                const paraOpts = { children: runs, spacing: { after: 40 } };
                if (extra.indent) paraOpts.indent = extra.indent;
                if (ordered) paraOpts.numbering = { reference: NUMBERING_REF, level };
                else paraOpts.bullet = { level };
                out.push(new Paragraph(paraOpts));
            } else {
                out.push(...(await blockToDocxNodes(child, extra)));
            }
        }
    }
    return out;
}

// Block-level mdast node → docx FileChild[] (Paragraph | Table)
async function blockToDocxNodes(node, extra = {}) {
    switch (node.type) {
        case 'heading': {
            const children = await inlineToRuns(node.children);
            return [new Paragraph({ heading: HEADING_MAP[node.depth] || HeadingLevel.HEADING_6, children, spacing: { before: 240, after: 120 } })];
        }
        case 'paragraph': {
            const children = await inlineToRuns(node.children, extra.runStyle);
            const opts = { children, spacing: { after: 160 } };
            if (extra.indent) opts.indent = extra.indent;
            if (extra.border) opts.border = extra.border;
            if (extra.shading) opts.shading = extra.shading;
            return [new Paragraph(opts)];
        }
        case 'thematicBreak':
            return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } }, spacing: { before: 120, after: 240 } })];
        case 'blockquote': {
            const bqExtra = {
                ...extra,
                border: { left: { style: BorderStyle.SINGLE, size: 18, color: '888888' } },
                indent: { left: 360 },
                shading: { type: ShadingType.CLEAR, fill: 'F4F4F4' },
                runStyle: { ...(extra.runStyle || {}), color: '555555' },
            };
            const out = [];
            for (const child of node.children) out.push(...(await blockToDocxNodes(child, bqExtra)));
            return out;
        }
        case 'code': {
            const lines = (node.value || '').split('\n');
            return lines.map((line, i) => new Paragraph({
                children: [new TextRun({ text: line || ' ', font: MONO_FONT, size: 18, color: '333333' })],
                shading: { type: ShadingType.CLEAR, fill: 'F8F9FA' },
                spacing: { before: 0, after: i === lines.length - 1 ? 120 : 0 },
            }));
        }
        case 'list':
            return listToDocxNodes(node, extra, extra.level || 0);
        case 'table': {
            const align = node.align || [];
            const numCols = node.children[0]?.children?.length || 1;
            const width = cellWidth(numCols);
            const resolvedRows = [];
            for (let r = 0; r < node.children.length; r++) {
                const rowNode = node.children[r];
                const cells = [];
                for (let c = 0; c < rowNode.children.length; c++) {
                    const cellNode = rowNode.children[c];
                    const runs = await inlineToRuns(cellNode.children, r === 0 ? { bold: true } : {});
                    cells.push(new TableCell({
                        children: [new Paragraph({ children: runs, alignment: ALIGN_MAP[align[c]] })],
                        shading: r === 0 ? { type: ShadingType.CLEAR, fill: 'F1F3F5' } : undefined,
                        margins: { top: 80, bottom: 80, left: 100, right: 100 },
                        width,
                    }));
                }
                resolvedRows.push(new TableRow({ children: cells }));
            }
            return [new Table({ rows: resolvedRows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS })];
        }
        case 'html':
            return [];
        default:
            if (node.children) {
                const out = [];
                for (const child of node.children) out.push(...(await blockToDocxNodes(child, extra)));
                return out;
            }
            return [];
    }
}

async function markdownToDocxNodes(markdown) {
    const tree = remarkProcessor.parse(markdown);
    const out = [];
    for (const node of tree.children) out.push(...(await blockToDocxNodes(node, {})));
    return out;
}

// ── Main export function — called from SqlNotebook ─────────────────────────

/**
 * @param {Array} cells - Array of { id, type, content }
 * @param {Object} results - Map of cellId → { data, executionTime, error }
 * @param {boolean} hideCode - Whether SQL code blocks should be hidden
 * @param {Object} cellStates - Map of cellId → { resultHeight, ... } (the height the user drag-resized the cell to)
 */
export async function generateWordReport(cells, results, hideCode = false, cellStates = {}, baseName = '') {
    const docChildren = [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'AmoxSQL Report' })], spacing: { after: 80 } }),
        new Paragraph({ children: [new TextRun({ text: `Generated on ${new Date().toLocaleString()}`, color: '888888', size: 18 })], spacing: { after: 320 } }),
    ];

    for (const cell of cells) {
        if (cell.type === 'markdown') {
            if (!cell.content?.trim()) continue;
            docChildren.push(...(await markdownToDocxNodes(cell.content)));
        } else if (cell.type === 'code') {
            const result = results[cell.id];

            if (!hideCode && cell.content?.trim()) {
                const lines = cell.content.split('\n');
                lines.forEach((line, i) => {
                    docChildren.push(new Paragraph({
                        children: [new TextRun({ text: line || ' ', font: MONO_FONT, size: 18, color: '333333' })],
                        shading: { type: ShadingType.CLEAR, fill: 'F8F9FA' },
                        spacing: { after: i === lines.length - 1 ? 120 : 0 },
                    }));
                });
            }

            if (result?.data?.length > 0) {
                const activeView = detectCellViewMode(cell.id);
                if (activeView === 'chart') {
                    const desiredHeight = cellStates?.[cell.id]?.resultHeight || DEFAULT_RESULT_HEIGHT;
                    const captured = await captureCellChart(cell.id, desiredHeight);
                    if (captured) {
                        const { width, height } = fitDimensions(captured.width, captured.height);
                        const annotations = captureChartAnnotations(cell.id);
                        if (annotations.title) {
                            docChildren.push(new Paragraph({
                                children: [new TextRun({ text: annotations.title, bold: true, size: 24 })],
                                alignment: AlignmentType.CENTER, spacing: { before: 160 },
                            }));
                        }
                        if (annotations.subtitle) {
                            docChildren.push(new Paragraph({
                                children: [new TextRun({ text: annotations.subtitle, color: '888888' })],
                                alignment: AlignmentType.CENTER,
                            }));
                        }
                        docChildren.push(new Paragraph({
                            children: [new ImageRun({ type: 'png', data: dataUrlToUint8Array(captured.dataUrl), transformation: { width, height } })],
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 80, after: annotations.footnote ? 40 : 200 },
                        }));
                        if (annotations.footnote) {
                            docChildren.push(new Paragraph({
                                children: [new TextRun({ text: annotations.footnote, italics: true, color: '888888', size: 18 })],
                                alignment: AlignmentType.CENTER, spacing: { after: 200 },
                            }));
                        }
                    } else {
                        docChildren.push(...(buildResultTable(result.data) || []));
                    }
                } else {
                    docChildren.push(...(buildResultTable(result.data) || []));
                }
            }

            if (result?.error) {
                docChildren.push(new Paragraph({
                    children: [new TextRun({ text: `Error: ${result.error}`, color: 'C0392B', font: MONO_FONT, size: 18 })],
                    shading: { type: ShadingType.CLEAR, fill: 'FDEDEC' },
                    spacing: { before: 80, after: 160 },
                }));
            }
        }
    }

    const doc = new Document({
        numbering: {
            config: [{
                reference: NUMBERING_REF,
                levels: [0, 1, 2].map((level) => ({
                    level,
                    format: LevelFormat.DECIMAL,
                    text: `%${level + 1}.`,
                    alignment: AlignmentType.START,
                    style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 260 } } },
                })),
            }],
        },
        sections: [{ children: docChildren }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName || 'amoxsql_report_' + new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
