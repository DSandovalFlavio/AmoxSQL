import { LEGEND_PAIRS } from '../constants';

/**
 * Legend text twins — an idea adopted from Sterling (MIT) © La Matemaga
 * (https://github.com/LaMatemaga/sterling): the color that MARKS a series and
 * the color that LABELS it are not the same. Each categorical hue has a
 * hue-matched twin — darkened for light surfaces, lightened for dark ones —
 * so legend labels stay readable as text instead of inheriting a mark color
 * that was tuned for area, not for type.
 *
 * Returns the twin array for the active palette and UI mode, or null when the
 * palette has no registered pair (callers fall back to the default text color).
 */
export function getLegendTextColors(colorTheme) {
    const pair = LEGEND_PAIRS[colorTheme];
    if (!pair) return null;
    const isLight = typeof document !== 'undefined' && document.body.classList.contains('mode-light');
    return isLight ? pair.light : pair.dark;
}

/**
 * Resolve the label color for one series: its twin when the palette has one
 * (matched by the series' mark color position in the active palette), else null.
 */
export function legendTextColorFor(markColor, activeColors, twins) {
    if (!twins || !Array.isArray(activeColors)) return null;
    const idx = activeColors.indexOf(markColor);
    if (idx === -1) return null;
    return twins[idx % twins.length] || null;
}
