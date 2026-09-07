/**
 * Degradado del logo derivado del acento.
 *
 * El par original de la marca es #00ECFF (cian) y #0068FF (azul). Medidos en
 * oklch son (0.861 0.147 205) y (0.567 0.239 260), y lo revelador es que ambos
 * están JUSTO en el límite del gamut sRGB para su luminosidad y tono: 0.147 es
 * el croma máximo alcanzable a L 0.861 en el tono 205, y 0.239 lo es a L 0.567
 * en el 260. El degradado brilla porque los dos extremos son lo más vivo que
 * sRGB permite, no por sus valores concretos.
 *
 * De ahí las tres reglas que generalizan el diseño a cualquier acento:
 *
 *   1. Luminosidad ANCLADA. En oscuro los dos stops conservan la L del original
 *      (0.861 y 0.567). Es la rampa luminosa lo que da el carácter; si se usara
 *      la L del acento, un acento oscuro produciría un logo apagado. En claro se
 *      usan anclas propias y más bajas (0.640 y 0.380): sobre una superficie
 *      clara, una L de 0.861 es practicamente invisible.
 *
 *   2. Croma AL LÍMITE DEL GAMUT, no sumado. Sumar croma a ciegas se sale del
 *      gamut en los tonos cálidos —donde el techo es mucho más bajo— y el
 *      navegador lo recorta hasta dejarlo sucio. Buscando el máximo alcanzable
 *      se obtiene el equivalente exacto del original en cada tono.
 *
 *   3. Rotación de tono HACIA EL AZUL, acotada. El original rota +55.4 grados,
 *      de 205 a 260, y eso no es casual: en sRGB el azul (~264) es la zona más
 *      oscura del círculo, así que rotar hacia allí es lo que hace que el
 *      extremo inferior se lea como "más profundo". Aplicar +55.4 fijo a
 *      cualquier tono rompe la idea (un ámbar en 75 acabaría en verde); lo que
 *      se conserva es la INTENCIÓN: acercarse al azul, sin pasarse de largo.
 *      La rotación es min(55.4, distancia angular al azul) por el camino corto.
 */

const BLUE_HUE = 264;      // el tono más oscuro que alcanza sRGB
const MAX_ROTATION = 55.4; // la del par original (205 -> 260)
// Anclas de luminosidad. Las de oscuro son las del par original. En claro NO
// sirven: una L de 0.861 sobre una superficie clara es practicamente invisible,
// asi que el modo claro usa su propio par, mas bajo, conservando la misma caida
// relativa entre los dos stops.
const L_ANCHORS = {
    dark:  { top: 0.861, bottom: 0.567 },
    light: { top: 0.640, bottom: 0.380 },
};

// ── Conversiones ──────────────────────────────────────────────────────────
const oklchToLinearSrgb = (L, C, H) => {
    const h = (H * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
};

const srgbToOklch = (r255, g255, b255) => {
    const [r, g, b] = [r255, g255, b255].map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    let H = (Math.atan2(B, A) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L, C: Math.hypot(A, B), H };
};

const inGamut = (L, C, H) =>
    oklchToLinearSrgb(L, C, H).every((v) => v >= -0.0005 && v <= 1.0005);

/** Croma máximo que sRGB admite para esa L y ese tono (búsqueda binaria). */
export const maxChroma = (L, H) => {
    let lo = 0;
    let hi = 0.4;
    for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (inGamut(L, mid, H)) lo = mid; else hi = mid;
    }
    return lo;
};

/** Rotación hacia el azul por el camino corto, sin pasarse de largo. */
export const rotateTowardBlue = (H) => {
    let delta = BLUE_HUE - H;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const applied = Math.sign(delta) * Math.min(MAX_ROTATION, Math.abs(delta));
    return (H + applied + 360) % 360;
};

/**
 * Lee un color ya calculado por el navegador. Chrome devuelve `rgb(...)` para
 * colores sRGB y conserva `oklch(...)` cuando se declaró así, de modo que hay
 * que aceptar ambos.
 */
export const parseComputedColor = (css) => {
    if (!css) return null;
    const oklch = css.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i);
    if (oklch) {
        const L = oklch[1].endsWith('%') ? parseFloat(oklch[1]) / 100 : parseFloat(oklch[1]);
        return { L, C: parseFloat(oklch[2]), H: parseFloat(oklch[3]) };
    }
    const rgb = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (rgb) return srgbToOklch(+rgb[1], +rgb[2], +rgb[3]);
    return null;
};

/**
 * Los dos stops del logo para un acento dado.
 * @param {string} accentCss color ya calculado del acento
 * @returns {{a: string, b: string} | null}
 */
export const deriveLogoStops = (accentCss, mode = 'dark') => {
    const accent = parseComputedColor(accentCss);
    if (!accent || !Number.isFinite(accent.H)) return null;

    const { top, bottom } = L_ANCHORS[mode] || L_ANCHORS.dark;
    const hTop = accent.H;
    const hBottom = rotateTowardBlue(hTop);
    const f = (n) => Math.round(n * 1000) / 1000;

    return {
        a: `oklch(${f(top)} ${f(maxChroma(top, hTop))} ${f(hTop)})`,
        b: `oklch(${f(bottom)} ${f(maxChroma(bottom, hBottom))} ${f(hBottom)})`,
    };
};
