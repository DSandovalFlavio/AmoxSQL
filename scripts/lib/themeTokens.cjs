/**
 * Lectura de los tokens de tema de AmoxSQL, en un solo sitio.
 *
 * Lo usan dos scripts: `checkThemeContrast.cjs` (comprueba pisos de contraste) y
 * `genThemeReference.cjs` (genera docs/dev/temas.html). Vive aparte para que los
 * dos vean EXACTAMENTE los mismos colores: si la referencia y el verificador
 * resolvieran la cascada cada uno por su cuenta, tarde o temprano dirian cosas
 * distintas del mismo tema, y documentacion que miente es peor que ninguna.
 *
 * Resuelve `var()` recorriendo la misma cadena que la cascada real y entiende
 * `color-mix(..., transparent)`, que es la unica forma de color-mix del archivo.
 */
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'index.css'), 'utf8');

function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    return { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255, a: 1 };
}

function parseRGBA(str) {
    const m = str.match(/rgba?\(([^)]+)\)/);
    const parts = m[1].split(/[,\s/]+/).map(s => s.trim()).filter(Boolean);
    return { r: +parts[0] / 255, g: +parts[1] / 255, b: +parts[2] / 255, a: parts[3] !== undefined ? +parts[3] : 1 };
}

// oklch(L C H) u oklch(L C H / a) → sRGB con gamma [0,1]
function oklchToRGB(str) {
    const m = str.match(/oklch\(([^)]+)\)/);
    const body = m[1].replace('/', ' ').split(/\s+/).filter(Boolean);
    const L = parseFloat(body[0]);
    const C = parseFloat(body[1]);
    const H = parseFloat(body[2]) || 0;
    const a = body[3] !== undefined ? parseFloat(body[3]) : 1;
    const hr = H * Math.PI / 180;
    const oa = C * Math.cos(hr), ob = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * oa + 0.2158037573 * ob;
    const m_ = L - 0.1055613458 * oa - 0.0638541728 * ob;
    const s_ = L - 0.0894841775 * oa - 1.2914855480 * ob;
    const l = l_ ** 3, mm = m_ ** 3, s = s_ ** 3;
    const R = +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
    const G = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
    const B = -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s;
    const enc = c => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
    return { r: enc(R), g: enc(G), b: enc(B), a };
}

/**
 * color-mix(in <espacio>, <color> <p>%, transparent)
 *
 * TODAS las mezclas del archivo son contra `transparent`, y ese caso no depende
 * del espacio: con alfa premultiplicada el RGB se conserva tal cual y solo baja
 * el alfa al p %. Por eso no hace falta implementar la interpolación en oklch.
 * Si algún día aparece una mezcla entre dos colores reales, esto devuelve null
 * y el token sale como "(sin resolver)" en vez de mentir con un valor a medias.
 */
function parseColorMix(str, resolver) {
    const m = str.match(/color-mix\(\s*in\s+[a-z-]+\s*,\s*(.+)\s*\)\s*$/i);
    if (!m) return null;
    const partes = splitTop(m[1]);
    if (partes.length !== 2) return null;
    const [primera, segunda] = partes.map(s => s.trim());
    if (segunda !== 'transparent') return null;
    const pm = primera.match(/^(.*?)\s+([\d.]+)%$/);
    if (!pm) return null;
    const base = resolver(pm[1].trim());
    if (!base) return null;
    return { ...base, a: base.a * (parseFloat(pm[2]) / 100) };
}

// Parte por comas de primer nivel (sin romper dentro de paréntesis)
function splitTop(str) {
    const out = []; let depth = 0, cur = '';
    for (const ch of str) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur);
    return out;
}

// ── Bloques de index.css ────────────────────────────────────────────────────
const THEME_SELECTORS = {
    obsidian: ':root',
    onyx: '.theme-onyx', amoxdark: '.theme-amoxdark', ayu: '.theme-ayu',
    nord: '.theme-nord', islands: '.theme-islands', sterlingdeep: '.theme-sterlingdeep',
    mist: '.theme-mist', amoxlight: '.theme-amoxlight', sterlinglight: '.theme-sterlinglight',
};

function tokensOf(cuerpo) {
    const tokens = {};
    for (const line of cuerpo.split(/\r?\n/)) {
        const t = line.match(/^\s*(--[\w-]+):\s*([^;]+);/);
        if (t) tokens[t[1]] = t[2].trim();
    }
    return tokens;
}

// `selector {` exacto (no `.theme-nord:not(...)`) hasta la llave de cierre en col 0
function extractBlock(selector, ultimo = false) {
    const re = new RegExp(String.raw`(^|\n)` + selector.replace(/[.]/g, String.raw`\.`) + String.raw`\s*\{([\s\S]*?)\n\}`, ultimo ? 'gm' : 'm');
    if (!ultimo) { const m = CSS.match(re); return m ? tokensOf(m[2]) : {}; }
    let m, last = null;
    while ((m = re.exec(CSS)) !== null) last = m;
    return last ? tokensOf(last[2]) : {};
}

// Reglas de una línea o de bloque cuyo selector no es un selector "limpio"
function extractRule(selectorRe) {
    const re = new RegExp(selectorRe + String.raw`\s*\{([^}]*)\}`, 'm');
    const m = CSS.match(re);
    return m ? tokensOf(m[1].replace(/;\s*/g, ';\n  ')) : {};
}

const themes = {};
for (const [name, sel] of Object.entries(THEME_SELECTORS)) themes[name] = extractBlock(sel);
const root = themes.obsidian;

// `.mode-light` sale dos veces: primero los ajustes del resplandor, después la
// capa de tokens de modo. Interesa la última.
const MODE_LIGHT = extractBlock('.mode-light', true);
// `body` es donde viven los derivados del acento y los alias --color-*.
const BODY = extractBlock('body');

const LIGHT = new Set(['mist', 'amoxlight', 'sterlinglight']);

// Acento por defecto de cada tema: vive en `.theme-X:not([class*="accent-"])`,
// que extractBlock ignora a propósito.
const ACCENT_DEFAULT = {};
for (const [name, sel] of Object.entries(THEME_SELECTORS)) {
    if (sel === ':root') continue;
    const t = extractRule(sel.replace(/[.]/g, String.raw`\.`) + String.raw`:not\(\[class\*="accent-"\]\)`);
    if (t['--accent-primary']) ACCENT_DEFAULT[name] = t['--accent-primary'];
}

// Presets de acento. En claro cada uno fija --accent-primary ya compuesto; en
// oscuro fijan los tres componentes y `body` los compone.
function accentPresets(modoClaro) {
    const out = {};
    const re = modoClaro
        ? /\.mode-light\.accent-([\w-]+)\s*\{([^}]*)\}/g
        : /(?:^|\n)\.accent-([\w-]+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(CSS)) !== null) out[m[1]] = tokensOf(m[2].replace(/;\s*/g, ';\n  '));
    return out;
}
const ACCENTS_LIGHT = accentPresets(true);
const ACCENTS_DARK = accentPresets(false);

/**
 * Cadena de resolución, en el mismo orden que la cascada real de <body>:
 *   preset de acento  →  tema  →  capa de modo (solo claros)  →  body  →  :root
 *
 * El tema va DELANTE de la capa de modo porque los bloques de tema están más
 * abajo en el archivo y, a igual especificidad (0-1-0), gana el último.
 */
function rawTok(theme, name, accentTokens) {
    if (accentTokens && accentTokens[name] !== undefined) return accentTokens[name];
    if (themes[theme][name] !== undefined) return themes[theme][name];
    if (LIGHT.has(theme) && MODE_LIGHT[name] !== undefined) return MODE_LIGHT[name];
    if (BODY[name] !== undefined) return BODY[name];
    return root[name];
}

// Expande var(--x) y var(--x, respaldo) sobre esa cadena.
function expand(theme, valor, accentTokens, depth = 0) {
    if (valor === undefined || depth > 12) return valor;
    return valor.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+?))?\)/g, (_, nombre, respaldo) => {
        const v = rawTok(theme, nombre, accentTokens);
        if (v !== undefined) return expand(theme, v, accentTokens, depth + 1);
        return respaldo !== undefined ? expand(theme, respaldo.trim(), accentTokens, depth + 1) : 'transparent';
    });
}

function parseColor(str, theme, accentTokens) {
    if (str === undefined || str === null) return null;
    str = expand(theme, String(str), accentTokens).trim();
    if (str.startsWith('#')) return hexToRGB(str);
    if (str.startsWith('rgb')) return parseRGBA(str);
    if (str.startsWith('oklch')) return oklchToRGB(str);
    if (str.startsWith('color-mix')) return parseColorMix(str, s => parseColor(s, theme, accentTokens));
    if (str === 'white') return hexToRGB('#ffffff');
    if (str === 'black') return hexToRGB('#000000');
    if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return null;
}

const col = (theme, name, accentTokens) => parseColor(rawTok(theme, name, accentTokens), theme, accentTokens);

// El color de una sombra es lo último de la cadena `0 4px 12px <color>`
function shadowColor(theme, name) {
    const v = rawTok(theme, name);
    if (!v) return null;
    const m = String(v).match(/(color-mix\(.*\)|rgba?\([^)]*\)|oklch\([^)]*\)|#[0-9a-fA-F]{3,8})\s*$/);
    return m ? parseColor(m[1], theme) : null;
}

// ── Contraste ───────────────────────────────────────────────────────────────
function over(fg, bg) {
    if (fg.a >= 1) return fg;
    return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}
function luminance(c) { return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b); }
function contrast(fg, bg) {
    const f = over(fg, bg), L1 = luminance(f), L2 = luminance(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

const toHex = (c) => c ? '#' + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : null;

module.exports = {
    CSS,
    THEME_SELECTORS, LIGHT,
    themes, root, MODE_LIGHT, BODY,
    ACCENT_DEFAULT, ACCENTS_LIGHT, ACCENTS_DARK,
    rawTok, expand, parseColor, col, shadowColor,
    over, luminance, contrast, hexToRGB, srgbToLinear, toHex,
};
