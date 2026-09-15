/**
 * Contraste de color, en un solo sitio.
 *
 * Existía por triplicado y mal: `scripts/checkThemeContrast.cjs` lo hace bien
 * para los temas, `deck/deckColor.js` lo rehízo para los acentos del deck, y
 * `ChartRenderer` tenía una tercera versión que **decía ser WCAG y no lo era**.
 *
 * El fallo concreto de aquélla, por si vuelve a aparecer en otro sitio: usaba
 * los coeficientes 0.299 / 0.587 / 0.114 sobre los canales sRGB **en crudo**.
 * Eso es la fórmula YIQ de brillo percibido, de la televisión analógica, no la
 * luminancia relativa de WCAG — que exige linearizar cada canal antes de
 * ponderarlo, y usa 0.2126 / 0.7152 / 0.0722. Con un umbral de 0.55 encima, la
 * diferencia no era académica: de los ocho colores de la paleta editorial,
 * tres recibían tinta blanca donde la oscura contrasta casi el doble. Se veía
 * en el treemap — unas etiquetas legibles y otras no, sin patrón aparente.
 *
 * Y la moraleja del umbral: no hace falta. Teniendo las dos candidatas se
 * calculan las dos razones y gana la mayor. Es exacto y no hay número mágico
 * que afinar.
 */

/** Un color CSS a [r, g, b] 0-255. `null` si no se entiende. */
export function aRgb(css) {
    if (!css) return null;
    const t = String(css).trim();

    const m = t.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return p.slice(0, 3);
        return null;
    }

    const h = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (h) {
        const s = h[1].length === 3 ? h[1].split('').map((c) => c + c).join('') : h[1];
        return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
    }
    return null;
}

/** Luminancia relativa WCAG 2.x: canales linearizados y ponderados. */
export function luminancia([r, g, b]) {
    const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** La razón de contraste entre dos colores. `null` si alguno no se entiende. */
export function contraste(colorA, colorB) {
    const a = aRgb(colorA);
    const b = aRgb(colorB);
    if (!a || !b) return null;
    const la = luminancia(a);
    const lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Tintas por defecto para texto sobre un color: casi negro y blanco. */
export const TINTA_OSCURA = '#1a1a2e';
export const TINTA_CLARA = '#ffffff';

/**
 * De dos tintas, la que más contrasta sobre ese fondo.
 *
 * Sin umbrales: se miden las dos y gana la mayor. Si el fondo no se entiende
 * devuelve la clara, que es la apuesta segura sobre un lienzo oscuro — que es
 * donde vive esta aplicación.
 */
export function mejorTintaSobre(fondo, oscura = TINTA_OSCURA, clara = TINTA_CLARA) {
    const conOscura = contraste(oscura, fondo);
    const conClara = contraste(clara, fondo);
    if (conOscura === null || conClara === null) return clara;
    return conOscura >= conClara ? oscura : clara;
}
