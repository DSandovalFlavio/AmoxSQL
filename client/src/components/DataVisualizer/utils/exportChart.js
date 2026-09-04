/**
 * Chart export utilities — PNG export with resolution scaling.
 */
import { API_BASE } from '../../../api.js';
import html2canvas from 'html2canvas-pro';

/**
 * Export a DOM element as PNG at a specific resolution.
 * @param {HTMLElement} element - The chart container DOM element
 * @param {object} preset - { label, width, height }
 * @param {string} chartType - Chart type name for filename
 * @param {string} [titleHint] - The chart's own title, if set — used for the
 *   filename so it reads as an artifact of the analysis instead of an
 *   opaque timestamp. Falls back to the chart type when there's no title.
 * @returns {Promise<void>}
 */
export const exportChartAsPng = async (element, preset, chartType = 'chart', titleHint = '') => {
    if (!element) return;

    const targetWidth = preset?.width || 1920;
    const targetHeight = preset?.height || 1080;
    const presetLabel = preset?.label || 'custom';

    try {
        const currentWidth = element.offsetWidth || 1;
        const currentHeight = element.offsetHeight || 1;

        const scaleX = targetWidth / currentWidth;
        const scaleY = targetHeight / currentHeight;
        const dynamicScale = Math.max(scaleX, scaleY, 2);

        const bgColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--surface-base').trim() || '#1e1f22';

        const canvas = await html2canvas(element, {
            backgroundColor: bgColor,
            scale: dynamicScale,
            logging: false,
            useCORS: true,
            ignoreElements: (el) => el.tagName === 'BUTTON'
        });

        // Create output canvas at exact target resolution
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = targetWidth;
        outputCanvas.height = targetHeight;
        const ctx = outputCanvas.getContext('2d');

        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Center chart in canvas preserving aspect ratio
        const srcRatio = canvas.width / canvas.height;
        const dstRatio = targetWidth / targetHeight;
        let drawW, drawH, drawX, drawY;

        if (srcRatio > dstRatio) {
            drawW = targetWidth;
            drawH = targetWidth / srcRatio;
            drawX = 0;
            drawY = (targetHeight - drawH) / 2;
        } else {
            drawH = targetHeight;
            drawW = targetHeight * srcRatio;
            drawX = (targetWidth - drawW) / 2;
            drawY = 0;
        }

        ctx.drawImage(canvas, drawX, drawY, drawW, drawH);

        // Download — named after the chart's own title when it has one
        // ("ventas_por_region.png"), falling back to the chart type plus a
        // timestamp only when untitled (so repeated exports don't silently
        // collide before the user gets to the save dialog).
        const pngFile = outputCanvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `${slugTitle(titleHint, chartType)}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();

        return true;
    } catch (err) {
        console.error('Export failed:', err);
        throw err;
    }
};

function slugTitle(titleHint, chartType) {
    const titleSlug = (titleHint || '').trim()
        ? titleHint.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
        : '';
    return titleSlug || `chart_${chartType}_${Date.now()}`;
}

/**
 * Export the chart's own SVG drawing (axes, marks, legend — not the title/
 * takeaway HTML around it) as a standalone, portable .svg file.
 *
 * Recharts renders colors as CSS custom properties (`fill="var(--text-
 * primary)"`) so they repaint live with the app's theme — meaningful only
 * inside this page's stylesheet cascade. A raw var() reference in an
 * extracted file resolves to nothing. Every element's fill/stroke/color is
 * walked and, where it references a variable, replaced with its resolved
 * computed value, so the file renders correctly in Illustrator, Figma, or a
 * plain browser tab with no dependency on AmoxSQL's CSS.
 */
export const exportChartAsSvg = (element, chartType = 'chart', titleHint = '') => {
    if (!element) throw new Error('No chart element to export.');
    const liveSvg = element.querySelector('svg.recharts-surface') || element.querySelector('svg');
    if (!liveSvg) throw new Error('No chart drawing found to export as SVG.');

    const clone = liveSvg.cloneNode(true);
    const originalNodes = liveSvg.querySelectorAll('*');
    const cloneNodes = clone.querySelectorAll('*');
    const VAR_PROPS = ['fill', 'stroke', 'color'];
    originalNodes.forEach((origEl, i) => {
        const cloneEl = cloneNodes[i];
        if (!cloneEl) return;
        const computed = getComputedStyle(origEl);
        VAR_PROPS.forEach((prop) => {
            const attr = origEl.getAttribute(prop);
            if (attr && attr.includes('var(')) {
                const resolved = computed[prop];
                if (resolved) cloneEl.setAttribute(prop, resolved);
            }
        });
    });

    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim() || '#ffffff';
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', bgColor);
    clone.insertBefore(bgRect, clone.firstChild);

    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.download = `${slugTitle(titleHint, chartType)}.svg`;
    downloadLink.href = url;
    downloadLink.click();
    URL.revokeObjectURL(url);
};

/**
 * Export the chart as a single-slide PowerPoint, native and editable where
 * the chart type has a pptxgenjs mapping (double-click in PowerPoint opens
 * its data grid), falling back to a PNG snapshot otherwise.
 */
export const exportChartAsPptx = async (element, config, data, chartType = 'chart', titleHint = '') => {
    const [{ default: PptxGenJS }, { isNativeChartType, buildNativeChartSpec, buildComboChartSpec }] = await Promise.all([
        import('pptxgenjs'),
        import('../../../utils/officeChartMapper'),
    ]);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    const title = titleHint?.trim() || 'AmoxSQL Chart';
    pptx.title = title;
    const slide = pptx.addSlide();
    const box = { x: 0.5, y: 0.5, w: 12.33, h: 6.5 };

    const useNative = isNativeChartType(chartType) && data?.length > 0;
    if (useNative) {
        if (chartType === 'combo') {
            const { multiSpec, sharedOptions } = buildComboChartSpec(config, data, []);
            const typedSpec = multiSpec.map((m) => ({ ...m, type: pptx.ChartType[m.type] }));
            slide.addChart(typedSpec, null, { ...box, ...sharedOptions });
        } else {
            const spec = buildNativeChartSpec(config, data, []);
            slide.addChart(pptx.ChartType[spec.pptxType], spec.data, { ...box, ...spec.options });
        }
    } else if (element) {
        const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim() || '#ffffff';
        const canvas = await html2canvas(element, { backgroundColor: bgColor, scale: 2, logging: false, useCORS: true, ignoreElements: (el) => el.tagName === 'BUTTON' });
        slide.addImage({ data: canvas.toDataURL('image/png'), ...box, sizing: { type: 'contain', w: box.w, h: box.h } });
    }

    await pptx.writeFile({ fileName: `${slugTitle(titleHint, chartType)}.pptx` });
};

/**
 * Copy the chart (full card incl. title/takeaway) to the clipboard as a PNG image.
 */
export const copyChartToClipboard = async (element) => {
    if (!element) throw new Error('No chart element.');
    const bgColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--surface-base').trim() || '#1e1f22';

    const canvas = await html2canvas(element, {
        backgroundColor: bgColor,
        scale: 2,
        logging: false,
        useCORS: true,
        ignoreElements: (el) => el.tagName === 'BUTTON',
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not render image.');
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    return true;
};

/**
 * Save chart configuration as .amoxvis file via API.
 */
export const saveChartConfig = async (filename, config, query = '') => {
    if (!filename.endsWith('.amoxvis')) {
        filename += '.amoxvis';
    }

    const payload = { ...config, query };

    try {
        const response = await fetch(`${API_BASE}/api/file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: filename,
                content: JSON.stringify(payload, null, 2)
            })
        });
        const result = await response.json();
        if (result.error) {
            return { success: false, error: result.error };
        }
        return {
            success: true,
            summary: `Chart successfully saved as '${filename}'! You can now edit it directly from the File Explorer.`
        };
    } catch (err) {
        return { success: false, error: err.message };
    }
};
