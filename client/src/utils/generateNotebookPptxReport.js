/**
 * AmoxSQL — Notebook → PowerPoint (.pptx) export.
 *
 * One slide per markdown cell (text) and per SQL cell (chart or data table).
 * Reuses the same slide geometry and markdown-to-runs logic as the Report
 * Flow deck exporter (generatePptxReport.js) so a notebook export and a deck
 * export of an equivalent chart+text pairing come out sized the same way —
 * but sources chart data straight from the notebook's own in-memory state
 * (results + cellStates) instead of re-fetching a `.amoxvis` file, since a
 * notebook cell's chart config only ever lives in the sidecar, never as a
 * standalone file.
 *
 * Chart types with a native pptxgenjs mapping become real, editable
 * PowerPoint charts; everything else falls back to a PNG snapshot of the
 * cell's own live Recharts render (same DOM capture technique as the Word
 * exporter — see captureCellChart in generateWordReport.js). A SQL cell
 * showing its table view (not a chart) becomes a native pptx table instead
 * of being dropped — the Report Flow deck has no table layout of its own,
 * but a notebook's results are tabular by default, so leaving them out
 * would lose most of what a notebook actually contains.
 */
import PptxGenJS from 'pptxgenjs';
import html2canvas from 'html2canvas-pro';
import { isNativeChartType, buildNativeChartSpec, buildComboChartSpec } from './officeChartMapper';
import { markdownToTextRuns, layoutBoxes } from './generatePptxReport';

const MAX_TABLE_ROWS = 30;

// Charts render CSS-var-driven colors that repaint live with the app theme;
// a slide is meant to be read on a white background regardless of the
// editor's current theme, so capture is always forced to light — mirrors
// generateWordReport.js's forceLightTheme.
const THEME_CLASSES = ['light-theme', 'theme-onyx', 'theme-amoxdark', 'theme-ayu', 'theme-nord', 'theme-islands', 'theme-ivory', 'theme-mist', 'theme-amoxlight'];
function forceLightTheme() {
    const previous = [...document.body.classList].filter((c) => THEME_CLASSES.includes(c));
    THEME_CLASSES.forEach((c) => document.body.classList.remove(c));
    document.body.classList.add('light-theme');
    return () => {
        document.body.classList.remove('light-theme');
        previous.forEach((c) => document.body.classList.add(c));
    };
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function detectCellViewMode(cellId) {
    const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
    if (!cellEl) return 'table';
    return cellEl.querySelector('.recharts-wrapper') ? 'chart' : 'table';
}

// Captures the cell's already-mounted chart, pinned to its user-resized
// height first (same reasoning as captureCellChart in generateWordReport.js:
// a generic capture height would come out much smaller than what's on screen).
async function captureCellChartImage(cellId, desiredHeight) {
    const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
    const wrapper = cellEl?.querySelector('.recharts-wrapper');
    if (!wrapper) return null;

    const chartContainer = cellEl.querySelector('.nb-results-height--report')
        || wrapper.closest('[style*="flex"]')
        || wrapper.parentElement?.parentElement
        || wrapper.parentElement;

    const restoreTheme = forceLightTheme();
    const previousHeight = chartContainer.style.height;
    const previousMinHeight = chartContainer.style.minHeight;
    if (desiredHeight) {
        chartContainer.style.height = `${desiredHeight}px`;
        chartContainer.style.minHeight = `${desiredHeight}px`;
    }
    try {
        await sleep(200); // theme repaint + Recharts ResponsiveContainer's 120ms resize debounce
        const canvas = await html2canvas(chartContainer, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            useCORS: true,
            ignoreElements: (el) => el.tagName === 'BUTTON' || el.tagName === 'INPUT',
        });
        return canvas.toDataURL('image/png');
    } catch (err) {
        console.error('Chart capture failed for PowerPoint export:', cellId, err);
        return null;
    } finally {
        chartContainer.style.height = previousHeight;
        chartContainer.style.minHeight = previousMinHeight;
        restoreTheme();
    }
}

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

function addDataTableSlide(slide, box, data) {
    const cols = Object.keys(data[0]);
    const headerRow = cols.map((c) => ({ text: c, options: { bold: true, fill: { color: 'F1F3F5' } } }));
    const bodyRows = data.slice(0, MAX_TABLE_ROWS).map((row) => cols.map((c) => ({ text: formatCellValue(row[c]) })));
    slide.addTable([headerRow, ...bodyRows], {
        x: box.x, y: box.y, w: box.w, h: box.h,
        fontSize: 9, border: { type: 'solid', color: 'D0D5DA', pt: 0.5}, autoPage: false,
    });
    if (data.length > MAX_TABLE_ROWS) {
        slide.addText(`Showing ${MAX_TABLE_ROWS} of ${data.length.toLocaleString()} rows.`, {
            x: box.x, y: box.y + box.h - 0.3, w: box.w, h: 0.3, fontSize: 9, italic: true, color: '888888',
        });
    }
}

/**
 * @param {Array} cells - [{ id, type, content }]
 * @param {Object} results - cellId → { data, error, executionTime }
 * @param {boolean} hideCode - whether SQL text is included alongside charts/tables
 * @param {Object} cellStates - cellId → { chartConfig, resultHeight, ... }
 * @param {string} [baseName] - the source notebook's filename, used as the
 *   title slide heading and the exported file's name
 */
export async function generateNotebookPptxReport(cells, results, hideCode = false, cellStates = {}, baseName = '') {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    const title = baseName || 'AmoxSQL Report';
    pptx.title = title;

    const titleSlide = pptx.addSlide();
    const full = layoutBoxes('title').full;
    titleSlide.addText(title, { x: full.x, y: full.h * 0.4, w: full.w, h: 1, fontSize: 36, bold: true, align: 'center', color: '1A1A1A' });
    titleSlide.addText(`Generated on ${new Date().toLocaleString()}`, { x: full.x, y: full.h * 0.4 + 1.1, w: full.w, h: 0.5, fontSize: 14, align: 'center', color: '888888' });

    for (const cell of cells) {
        if (cell.type === 'markdown') {
            if (!cell.content?.trim()) continue;
            const slide = pptx.addSlide();
            const box = layoutBoxes('content').full;
            const runs = markdownToTextRuns(cell.content);
            if (runs.length) slide.addText(runs, { ...box, fontSize: 14, color: '333333', valign: 'top' });
            continue;
        }
        if (cell.type !== 'code') continue;

        const result = results[cell.id];
        if (!result) continue;

        const hasChart = detectCellViewMode(cell.id) === 'chart' && !!cellStates?.[cell.id]?.chartConfig && result.data?.length > 0;
        const hasTable = !hasChart && result.data?.length > 0;
        if (!hasChart && !hasTable && !result.error) continue; // nothing to show for this cell

        const slide = pptx.addSlide();
        const showCode = !hideCode && cell.content?.trim();
        // A code caption only makes room for it when there's a chart to sit
        // beside — a table already reads as the full slide, same as the deck
        // model's own chart-full/content-chart split.
        const boxes = hasChart
            ? (showCode ? layoutBoxes('content-chart') : layoutBoxes('chart-full'))
            : layoutBoxes('content');

        if (showCode && hasChart) {
            slide.addText(cell.content.trim(), {
                ...(boxes.text || boxes.full), fontSize: 11, fontFace: 'Consolas', color: '555555', valign: 'top', fill: { color: 'F8F9FA' },
            });
        }

        if (hasChart) {
            const config = cellStates[cell.id].chartConfig;
            const data = result.data;
            const chartBox = boxes.chart || boxes.full;
            const useNative = isNativeChartType(config.chartType);
            try {
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
                    const dataUrl = await captureCellChartImage(cell.id, cellStates?.[cell.id]?.resultHeight);
                    if (dataUrl) {
                        slide.addImage({ data: dataUrl, ...chartBox, sizing: { type: 'contain', w: chartBox.w, h: chartBox.h } });
                    } else {
                        slide.addText('[Chart could not be captured]', { ...chartBox, fontSize: 12, color: '999999', align: 'center', valign: 'middle' });
                    }
                }
            } catch (err) {
                slide.addText(`[Chart failed: ${err.message}]`, { ...chartBox, fontSize: 11, color: 'C0392B', align: 'center', valign: 'middle' });
            }
        } else if (hasTable) {
            if (showCode) {
                slide.addText(cell.content.trim(), {
                    x: boxes.full.x, y: boxes.full.y, w: boxes.full.w, h: boxes.full.h * 0.18,
                    fontSize: 11, fontFace: 'Consolas', color: '555555', valign: 'top', fill: { color: 'F8F9FA' },
                });
            }
            const tableBox = showCode
                ? { x: boxes.full.x, y: boxes.full.y + boxes.full.h * 0.2, w: boxes.full.w, h: boxes.full.h * 0.8 }
                : boxes.full;
            addDataTableSlide(slide, tableBox, result.data);
        }

        if (result.error) {
            slide.addText(`Error: ${result.error}`, { ...boxes.full, fontSize: 12, color: 'C0392B', align: 'center', valign: 'middle' });
        }
    }

    const filename = `${title.replace(/[^\w-]+/g, '_')}.pptx`;
    await pptx.writeFile({ fileName: filename });
}
