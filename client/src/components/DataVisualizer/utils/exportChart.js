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
/**
 * Espera a que el elemento y su SVG dejen de cambiar de tamaño. Devuelve en
 * cuanto dos fotogramas seguidos coinciden, o al agotar el tiempo — mejor una
 * foto algo temprana que una espera eterna si algo nunca se estabiliza.
 */
async function esperarAsiento(el, maxMs = 1500) {
    let previo = null;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    while (ahora() - t0 < maxMs) {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const svg = el.querySelector('svg');
        const firma = `${el.offsetWidth}x${el.offsetHeight}|${svg ? svg.clientWidth : 0}x${svg ? svg.clientHeight : 0}`;
        if (firma === previo) return;
        previo = firma;
    }
}

export const exportChartAsPng = async (element, preset, chartType = 'chart', titleHint = '') => {
    if (!element) return;

    const targetWidth = preset?.width || 1920;
    const targetHeight = preset?.height || 1080;
    const presetLabel = preset?.label || 'custom';

    /* ── La tarjeta se re-maqueta a la proporción de destino ──
       Sin esto, exportar a 1:1 o a 9:16 daba la tarjeta con forma de panel
       encajada con bandas de fondo: no una tarjeta cuadrada ni vertical.

       El primer intento sizeó el div INTERIOR, que lleva `contain: layout paint`
       y vive dentro de ancestros con `overflow: hidden`. Al pedirle más tamaño
       del que cabía quedaba recortado y html2canvas fallaba sobre eso: dejó de
       descargar. El arreglo no es clonar, es SACAR LA TARJETA DEL FLUJO:
       `position: fixed` fuera de pantalla no lo recorta el overflow de ningún
       ancestro, y al tener medidas propias el ResizeObserver de la figura y el
       ResponsiveContainer de Recharts recalculan de verdad.

       Se espera a que asiente antes de la foto, y se restaura en `finally` pase
       lo que pase: si se sale por una excepción sin restaurar, la tarjeta se
       queda clavada fuera de pantalla y desaparece de la aplicación. */
    const previo = element.getAttribute('style') || '';
    const restaurar = () => element.setAttribute('style', previo);

    /* El marco: la tarjeta no llega al borde de la imagen, respira sobre el
       fondo. Sin esto el filete y las esquinas caían justo en el canto del PNG y
       la tarjeta dejaba de leerse como tarjeta — que es exactamente la pega. */
    const marco = Math.round(Math.min(targetWidth, targetHeight) * 0.035);
    const anchoUtil = targetWidth - marco * 2;
    const altoUtil = targetHeight - marco * 2;

    try {
        // La tarjeta se maqueta con la proporción del HUECO ÚTIL, no la del
        // lienzo entero: si no, al restarle el marco la figura se deformaría.
        const anchoTrabajo = Math.min(anchoUtil, 1400);
        const altoTrabajo = Math.round(anchoTrabajo * (altoUtil / anchoUtil));
        Object.assign(element.style, {
            position: 'fixed',
            left: '-20000px',
            top: '0px',
            width: `${anchoTrabajo}px`,
            height: `${altoTrabajo}px`,
            maxWidth: 'none',
            maxHeight: 'none',
            margin: '0',
            flex: 'none',
        });
        // Dos fotogramas para el reflujo, y un respiro para que Recharts haya
        // vuelto a medir y dibujar en el tamaño nuevo.
        /* Esperar a que asiente, no un tiempo fijo. Al cambiar de tamaño la
           tarjeta, el ResizeObserver de la figura recalcula la escala del texto
           y el ResponsiveContainer de Recharts vuelve a repartir sus márgenes:
           con 120 ms fijos la foto podía caer entre medias y las etiquetas del
           eje X salían cortadas por abajo. Se espera hasta que dos fotogramas
           seguidos midan lo mismo. */
        await esperarAsiento(element);

        const currentWidth = element.offsetWidth || 1;
        const currentHeight = element.offsetHeight || 1;

        const scaleX = targetWidth / currentWidth;
        const scaleY = targetHeight / currentHeight;
        const dynamicScale = Math.max(scaleX, scaleY, 2);

        const bgColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--surface-base').trim() || '#1e1f22';

        const canvas = await html2canvas(element, {
            /* `null` y no el color del tema: la tarjeta tiene esquinas
               redondeadas y es lo ÚLTIMO con contenido que debe verse. Con un
               color de fondo, html2canvas rellena el rectángulo entero y al
               pegar el PNG en una presentación aparece un cuadrado opaco con la
               tarjeta flotando dentro, en vez de la tarjeta recortada. */
            backgroundColor: null,
            scale: dynamicScale,
            logging: false,
            useCORS: true,
            // La barra de botones tampoco: ignorar solo los <button> dejaba su
            // contenedor reservando alto y el PNG salia con una banda vacia.
            ignoreElements: (el) => el.tagName === 'BUTTON' || el.dataset?.exportHide === 'true'
        });

        // Create output canvas at exact target resolution
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = targetWidth;
        outputCanvas.height = targetHeight;
        const ctx = outputCanvas.getContext('2d');

        /* Sin relleno: lo que rodea a la tarjeta queda transparente. El marco
           sigue existiendo —la tarjeta no toca el canto de la imagen— pero es
           aire, no un rectángulo de color. */

        // Centrar dentro del hueco útil, dejando el marco alrededor. Como la
        // tarjeta ya se maquetó con esta proporción, apenas hay que ajustar.
        const srcRatio = canvas.width / canvas.height;
        const dstRatio = anchoUtil / altoUtil;
        let drawW, drawH, drawX, drawY;

        if (srcRatio > dstRatio) {
            drawW = anchoUtil;
            drawH = anchoUtil / srcRatio;
        } else {
            drawH = altoUtil;
            drawW = altoUtil * srcRatio;
        }
        drawX = marco + (anchoUtil - drawW) / 2;
        drawY = marco + (altoUtil - drawH) / 2;

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
    } finally {
        restaurar();
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
export const exportChartAsPptx = async (element, config, data, chartType = 'chart', titleHint = '', colors = []) => {
    const [{ default: PptxGenJS }, { isNativeChartType, buildNativeSlideChartSpec }] = await Promise.all([
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
        const spec = buildNativeSlideChartSpec(config, data, colors);
        if (spec?.multi) {
            const typedSpec = spec.multiSpec.map((m) => ({ ...m, type: pptx.ChartType[m.type] }));
            slide.addChart(typedSpec, null, { ...box, ...spec.sharedOptions });
        } else if (spec) {
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
 * @param {string} [source] - Path to the .sql file this query came from, if
 *   any (Fase 3 — procedencia). Purely additive metadata: a chart without it
 *   behaves exactly as before — self-contained, query embedded, no link back.
 */
export const saveChartConfig = async (filename, config, query = '', source = null) => {
    if (!filename.endsWith('.amoxvis')) {
        filename += '.amoxvis';
    }

    const payload = { ...config, query };
    if (source) payload.source = source;

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
