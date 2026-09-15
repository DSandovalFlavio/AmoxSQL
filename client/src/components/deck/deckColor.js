/**
 * ¿Se va a leer este acento sobre la lámina?
 *
 * La pregunta 32 de la auditoría —«¿dónde cambio el color de toda la
 * presentación?»— trae una trampa detrás: elegir un acento que no contrasta
 * contra el lienzo del tono elegido. Eso no se descubre en el Studio, donde la
 * lámina mide 400 px y uno ya sabe qué pone; se descubre proyectado en una sala
 * a oscuras, cuando la pastilla de variación de un KPI es una mancha.
 *
 * El acento NO se resuelve de una tabla: se compone en CSS y cambia con el
 * tema, con el modo claro u oscuro y con el tono de la lámina. Así que se
 * pregunta al navegador, aplicando la clase a un elemento de prueba y leyendo
 * lo que sale. Cuesta un reflow por acento y se hace una vez al abrir el panel.
 *
 * El umbral es 4,5:1, que es el mismo piso que usa `scripts/checkThemeContrast`
 * para los acentos de la aplicación. Podría defenderse un 3:1 —el acento pinta
 * filetes y pastillas, que son objetos gráficos y no texto corrido— pero tener
 * dos pisos distintos para la misma pregunta es cómo se acaban colando los
 * colores que no se leen.
 */

export const PISO_CONTRASTE = 4.5;

/** Un color CSS cualquiera a [r, g, b] 0-255. Devuelve null si no se entiende. */
function aRgb(css) {
    if (!css) return null;
    const m = css.trim().match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return p.slice(0, 3);
        return null;
    }
    const h = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (h) {
        const s = h[1].length === 3 ? h[1].split('').map((c) => c + c).join('') : h[1];
        return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
    }
    return null;
}

/** Luminancia relativa, WCAG 2.x. */
function luminancia([r, g, b]) {
    const c = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** La razón de contraste entre dos colores CSS. `null` si alguno no se entiende. */
export function contraste(colorA, colorB) {
    const a = aRgb(colorA);
    const b = aRgb(colorB);
    if (!a || !b) return null;
    const la = luminancia(a);
    const lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Resuelve `--accent-primary` para cada acento **tal y como lo vería la lámina**,
 * y mide su contraste contra el lienzo.
 *
 * `dentroDe` es el elemento sobre el que se monta la prueba: pasando la propia
 * lámina, el cálculo hereda su tono —una lámina invertida tiene el lienzo al
 * revés— y el acento sale medido contra el fondo real y no contra el del tema.
 */
export function medirAcentos(acentos, dentroDe) {
    const anfitrion = dentroDe || document.body;
    if (!anfitrion || typeof getComputedStyle !== 'function') return new Map();

    const sonda = document.createElement('div');
    sonda.setAttribute('aria-hidden', 'true');
    // La marca es para el observador de desborde del diseñador: la sonda entra
    // y sale del lienzo que él vigila, y sin marcarla le hace medir doce veces
    // seguidas para no cambiar nada. Ver la nota de `useDesborde`.
    sonda.setAttribute('data-sonda', '1');
    sonda.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    anfitrion.appendChild(sonda);

    // El lienzo es el fondo que la lámina pinta de verdad. Se lee del anfitrión
    // y no del token, porque una lámina con `tone: dark` lo tiene invertido.
    const fondoLamina = getComputedStyle(anfitrion).backgroundColor;
    const fondo = aRgb(fondoLamina) ? fondoLamina
        : getComputedStyle(document.body).getPropertyValue('--surface-raised').trim();

    const medidas = new Map();
    for (const acento of acentos) {
        sonda.className = `accent-${acento.id}`;
        // `--accent-primary` se compone con var(), así que hay que leer el valor
        // ya resuelto de una propiedad que lo use, no la variable en crudo.
        sonda.style.color = 'var(--accent-primary)';
        const color = getComputedStyle(sonda).color;
        const razon = contraste(color, fondo);
        medidas.set(acento.id, {
            color: aRgb(color) ? color : acento.color,
            razon,
            pasa: razon === null ? true : razon >= PISO_CONTRASTE,
        });
    }

    sonda.remove();
    return medidas;
}
