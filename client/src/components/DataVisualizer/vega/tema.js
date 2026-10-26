/**
 * La capa AmoxSQL sobre Vega-Lite: un `config` hecho con los tokens de la
 * interfaz (Dec-69). Es lo único que hace que la figura «se vea nuestra», y por
 * eso NO se guarda en el archivo: se calcula al dibujar, así la misma figura
 * sigue al tema claro u oscuro, y fuera de AmoxSQL se ve como un Vega-Lite normal.
 *
 * Lo que el usuario fije a mano en el `config` del spec gana sobre esto.
 */

/** Lee un token CSS ya resuelto en el elemento (los `var()` vienen sustituidos). */
function token(el, nombre, porDefecto) {
    if (!el || typeof getComputedStyle === 'undefined') return porDefecto;
    const v = getComputedStyle(el).getPropertyValue(nombre).trim();
    return v || porDefecto;
}

/**
 * @param {Element} el          El contenedor de la figura: los tokens se leen ahí.
 * @param {object}  op
 * @param {string}  op.fuente   La familia tipográfica de la tarjeta.
 * @param {number}  op.escala   La escala del texto de la tarjeta (zoom y tamaño).
 * @param {string[]} op.colores La paleta activa.
 * @param {object}  op.c        El estado de Story Flow (tamaños y opacidad de etiquetas).
 */
export function temaVega(el, { fuente, escala = 1, colores, c = {}, tokens = null } = {}) {
    // `tokens` fija los colores a mano (al exportar, para un fondo claro fuera de AmoxSQL).
    const leer = (n, d) => (tokens && tokens[n]) || token(el, n, d);
    const texto = leer('--text-primary', '#e6e6e6');
    const textoSuave = leer('--text-secondary', '#9aa0aa');
    const borde = leer('--border-color', '#3a3f4b');
    const rejilla = leer('--grid-color', borde);
    const tam = (n) => Math.round(n * escala * 10) / 10;
    const etiqueta = tam(Number(c.axisLabelSize) || 11);
    const opacidad = Number(c.axisLabelOpacity ?? 0.8);

    return {
        background: null,
        font: fuente,
        padding: 2,
        customFormatTypes: true,
        view: { stroke: null },
        axis: {
            labelColor: texto, labelOpacity: opacidad, labelFontSize: etiqueta, labelFont: fuente,
            labelPadding: Number(c.axisLabelGap ?? 5),
            titleColor: texto, titleOpacity: opacidad, titleFontSize: tam(12), titleFont: fuente, titleFontWeight: 500,
            domainColor: borde, tickColor: borde, ticks: false,
            gridColor: rejilla, gridOpacity: 0.5, gridDash: [2, 6],
        },
        axisBand: { grid: false },
        legend: {
            labelColor: texto, labelOpacity: opacidad, labelFontSize: etiqueta, labelFont: fuente,
            titleColor: texto, titleFontSize: etiqueta, symbolType: 'circle', symbolSize: 70,
        },
        header: { labelColor: texto, titleColor: texto, labelFont: fuente, titleFont: fuente },
        title: { color: texto, subtitleColor: textoSuave, font: fuente, subtitleFont: fuente, anchor: 'start' },
        text: { color: texto, font: fuente, fontSize: tam(Number(c.dataLabelSize) || 11) },
        range: { category: colores },
        line: { strokeWidth: 2 },
        point: { filled: true },
        bar: { continuousBandSize: 6 },
        rect: { stroke: null },
        arc: { stroke: null },
        style: { 'guide-label': { fill: texto }, 'guide-title': { fill: texto } },
    };
}

/** El aspecto de AmoxSQL sobre un fondo claro: lo que viaja al exportar con «aspecto». */
export const TOKENS_CLAROS = { '--text-primary': '#1f2228', '--text-secondary': '#5f6570', '--border-color': '#c9ccd2', '--grid-color': '#e2e4e8' };

/** Une dos `config`: lo del spec gana, objeto a objeto (un nivel basta en `config`). */
export function unirConfig(tema, propio) {
    if (!propio) return tema;
    const r = { ...tema };
    for (const [k, v] of Object.entries(propio)) {
        r[k] = v && typeof v === 'object' && !Array.isArray(v) && tema[k] && typeof tema[k] === 'object'
            ? { ...tema[k], ...v } : v;
    }
    return r;
}
