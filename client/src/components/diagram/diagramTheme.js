/**
 * Los colores del lienzo, resueltos a valores concretos.
 *
 * React Flow pinta aristas, minimapa y fondo como SVG, y ahí **no resuelve
 * `var(--token)`**: hay que darle colores ya calculados.
 *
 * Vive en su propio archivo y no junto al lienzo porque un módulo que exporta
 * un componente **y** una función rompe la recarga en caliente: cada cambio
 * recarga la página entera en vez de sustituir el componente. Ya pasó en el
 * Studio del deck con `DeckWriting`.
 */
import { resolveThemeColor } from '../chains/chainUtils';

/**
 * `tema` no se usa dentro, y aun así es un parámetro: los tokens se leen del
 * documento, que ya refleja el tema activo. Pasarlo es lo que le dice a
 * `useMemo` —y a quien lea esto— que estos colores **caducan al cambiar de
 * tema**. Sin él, el lienzo se quedaría con los colores del tema anterior hasta
 * que algo más lo obligara a recalcular.
 */
export function coloresDelTema(tema) {
    void tema;
    return {
        arista: resolveThemeColor('--border-strong', 'oklch(0.45 0.02 270)'),
        puntos: resolveThemeColor('--border-default', 'oklch(0.3 0 0 / 0.3)'),
        mascara: resolveThemeColor('--overlay-bg', 'oklch(0.1 0 0 / 0.7)'),
        caja: resolveThemeColor('--border-strong', 'oklch(0.45 0.02 270)'),
        acento: resolveThemeColor('--accent-primary', 'oklch(0.8 0.15 150)'),
    };
}
