/**
 * Chart export utilities — PNG export with resolution scaling.
 */
import html2canvas from 'html2canvas';

/**
 * Export a DOM element as PNG at a specific resolution.
 * @param {HTMLElement} element - The chart container DOM element
 * @param {object} preset - { label, width, height }
 * @param {string} chartType - Chart type name for filename
 * @returns {Promise<void>}
 */
export const exportChartAsPng = async (element, preset, chartType = 'chart') => {
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

        // Download
        const pngFile = outputCanvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        const safeName = presetLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        downloadLink.download = `chart_${chartType}_${safeName}_${Date.now()}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();

        return true;
    } catch (err) {
        console.error('Export failed:', err);
        throw err;
    }
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
        const response = await fetch('http://localhost:3001/api/file', {
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
