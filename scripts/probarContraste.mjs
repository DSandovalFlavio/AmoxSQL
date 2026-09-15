/**
 * Ejercita `client/src/utils/contraste.js`.
 *
 *     node scripts/probarContraste.mjs
 *
 * Esto existe porque la versión anterior de este cálculo —la que vivía dentro
 * de `ChartRenderer`— era incorrecta y **nadie podía verlo**: producía un color
 * plausible para cualquier entrada, y el único síntoma era una etiqueta de
 * treemap que costaba leer entre nueve que se leían bien. Los casos de abajo
 * incluyen los tres colores de la paleta editorial donde fallaba, con la razón
 * de contraste comprobada contra los valores que publica WCAG.
 */
import {
    aRgb, luminancia, contraste, mejorTintaSobre, TINTA_OSCURA, TINTA_CLARA,
} from '../client/src/utils/contraste.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};
const cerca = (nombre, a, b, tol = 0.02) => {
    const pasa = a !== null && Math.abs(a - b) <= tol;
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ~${b}\n    obtenido: ${a}`); }
};

// ── leer colores ────────────────────────────────────────────────────────────
eq('hex largo', aRgb('#25A08D'), [37, 160, 141]);
eq('hex corto se expande', aRgb('#fff'), [255, 255, 255]);
eq('hex en minúsculas', aRgb('#e4a43a'), [228, 164, 58]);
eq('con espacios alrededor', aRgb('  #000000  '), [0, 0, 0]);
eq('rgb()', aRgb('rgb(37,160,141)'), [37, 160, 141]);
eq('rgb() con espacios', aRgb('rgb(37, 160, 141)'), [37, 160, 141]);
eq('rgba() ignora el alfa', aRgb('rgba(37, 160, 141, 0.5)'), [37, 160, 141]);
eq('rgb() moderno con barra', aRgb('rgb(37 160 141 / 50%)'), [37, 160, 141]);
eq('vacío', aRgb(''), null);
eq('nulo', aRgb(null), null);
eq('un nombre CSS no se resuelve', aRgb('rebeccapurple'), null);
eq('una variable sin resolver', aRgb('var(--accent-primary)'), null);
eq('hex de cuatro dígitos no vale', aRgb('#abcd'), null);
// oklch() es lo que devuelve `getComputedStyle` en esta aplicación para algunos
// tokens. No se entiende, y eso está bien: quien llama recibe `null` y decide.
eq('oklch()', aRgb('oklch(0.195 0.014 270)'), null);

// ── luminancia ──────────────────────────────────────────────────────────────
cerca('negro', luminancia([0, 0, 0]), 0, 0.0001);
cerca('blanco', luminancia([255, 255, 255]), 1, 0.0001);
// El gris medio de sRGB está en 0.216, no en 0.5: es justo la diferencia entre
// linearizar y no hacerlo, y la razón de que la fórmula vieja fallara.
cerca('el gris 50% no es luminancia 0,5', luminancia([128, 128, 128]), 0.2159, 0.001);

// ── razón de contraste ──────────────────────────────────────────────────────
cerca('negro sobre blanco es 21:1', contraste('#000000', '#ffffff'), 21, 0.001);
cerca('un color consigo mismo es 1:1', contraste('#25A08D', '#25A08D'), 1, 0.001);
eq('es simétrica', contraste('#000', '#fff') === contraste('#fff', '#000'), true);
eq('si no se entiende, null', contraste('oklch(0.2 0 0)', '#fff'), null);

// ── la decisión: los ocho de la paleta editorial ────────────────────────────
// Los tres marcados abajo son los que la fórmula YIQ resolvía en blanco.
const PALETA = [
    ['#25A08D', TINTA_OSCURA],  // antes: blanco (3,23 contra 5,27)
    ['#D45AC7', TINTA_OSCURA],  // antes: blanco (3,45 contra 4,94)
    ['#5A83D7', TINTA_OSCURA],  // antes: blanco (3,71 contra 4,60)
    ['#9A79E7', TINTA_OSCURA],
    ['#E4A43A', TINTA_OSCURA],
    ['#96AB51', TINTA_OSCURA],
    ['#E87864', TINTA_OSCURA],
    ['#536B78', TINTA_CLARA],   // el único de la paleta que pide blanco
];
for (const [fondo, esperada] of PALETA) {
    eq(`tinta sobre ${fondo}`, mejorTintaSobre(fondo), esperada);
    // Y la propiedad que de verdad importa, sea cual sea la respuesta: la
    // elegida contrasta al menos tanto como la otra.
    const otra = mejorTintaSobre(fondo) === TINTA_OSCURA ? TINTA_CLARA : TINTA_OSCURA;
    eq(`  y es la mayor de las dos (${fondo})`,
        contraste(mejorTintaSobre(fondo), fondo) >= contraste(otra, fondo), true);
}

// ── los extremos ────────────────────────────────────────────────────────────
eq('sobre blanco, tinta oscura', mejorTintaSobre('#ffffff'), TINTA_OSCURA);
eq('sobre negro, tinta clara', mejorTintaSobre('#000000'), TINTA_CLARA);
eq('sobre rgb(), también decide', mejorTintaSobre('rgb(228,164,58)'), TINTA_OSCURA);
eq('si no se entiende el fondo, la clara', mejorTintaSobre('oklch(0.5 0 0)'), TINTA_CLARA);
eq('sin fondo, la clara', mejorTintaSobre(undefined), TINTA_CLARA);
// El mapa de calor pasa su propia tinta oscura.
eq('tintas a medida', mejorTintaSobre('#ffffff', '#1a1a1a'), '#1a1a1a');

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
