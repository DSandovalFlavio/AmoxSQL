#!/usr/bin/env node
/**
 * Verificador de temas de AmoxSQL.
 *
 * Lee los bloques de tokens de client/src/index.css, resuelve cada color a sRGB
 * y comprueba los contrastes WCAG 2.x de los pares que sostienen la interfaz.
 *
 * Resuelve `var()` recorriendo la MISMA cadena que la cascada real y entiende
 * `color-mix(... , transparent)`, que es la única forma de color-mix que usa el
 * archivo. Sin eso, la mitad de los tokens salían "(unresolved)" y el informe
 * decía que todo estaba bien porque no estaba mirando.
 *
 * Uso:  node scripts/checkThemeContrast.cjs [--all]
 *   (por defecto: los tres temas claros; --all: los diez)
 */
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'index.css'), 'utf8');

// ── Color → sRGB con alfa ───────────────────────────────────────────────────
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

// ── Pisos y rangos ──────────────────────────────────────────────────────────
// text-tertiary en claro va a 4.5 (AA de texto normal). En oscuro se queda en
// 3.0: es una decisión asumida — sobre fondo oscuro el ojo se adapta distinto.
// text-disabled SOLO se mide en claro; en oscuro va en 1.7–2.4 a propósito.
const floorsFor = (theme) => ({
    'text-primary': 10,
    'text-secondary': 5.5,
    'text-tertiary': LIGHT.has(theme) ? 4.5 : 3.0,
    'text-disabled': 3.0,
});
const textsFor = (theme) => LIGHT.has(theme)
    ? ['text-primary', 'text-secondary', 'text-tertiary', 'text-disabled']
    : ['text-primary', 'text-secondary', 'text-tertiary'];

const BORDER_RANGE = { 'border-subtle': [1.08, 1.30], 'border-default': [1.20, 1.55], 'border-strong': [1.45, 2.10] };

const AA = 4.5;
const SYNTAX = ['keyword', 'string', 'number', 'function', 'type', 'operator', 'variable', 'constant'];
const TYPES = ['integer', 'float', 'text', 'datetime', 'boolean', 'default'];
const FEEDBACK = ['success', 'error', 'warning', 'info'];
const ICONS = ['folder', 'sql', 'notebook', 'csv', 'json', 'md', 'parquet', 'excel'];

const surfaces = ['--surface-base', '--surface-raised', '--surface-inset'];
const surfacesAll = ['--surface-base', '--surface-raised', '--surface-overlay', '--surface-inset'];

// Estados y profundidad. Los valores del oscuro son la referencia aprobada.
const HOVER_RANGE = [1.09, 1.22];
const ACTIVE_RANGE = [1.18, 1.40];
const SHADOW_ALPHA_LIGHT = { '--shadow-sm': [0.08, 0.16], '--shadow-md': [0.12, 0.24], '--shadow-lg': [0.16, 0.32] };
const VEIL_MIN = 2.5;   // el diálogo contra el lienzo velado (solo claro)
const STEP_MIN = 1.02;  // escalón mínimo entre superficies contiguas

// ── Informe ─────────────────────────────────────────────────────────────────
const all = process.argv.includes('--all');
const list = all ? Object.keys(themes) : [...LIGHT];
const V = '\x1b[32m✓\x1b[0m', X = '\x1b[31m✗\x1b[0m', W = '\x1b[33m!\x1b[0m';
let failures = 0, avisos = 0;

function fila(ok, etiqueta, detalle) {
    if (!ok) failures++;
    console.log(`  ${ok ? V : X} ${etiqueta.padEnd(24)} ${detalle}`);
}
// Solo se imprime si falla: si no, el informe de diez temas es ilegible.
function filaSiFalla(ok, etiqueta, detalle) {
    if (ok) return;
    failures++;
    console.log(`  ${X} ${etiqueta.padEnd(24)} ${detalle}`);
}
/**
 * Aviso: se mide y se imprime, pero no tumba la ejecución.
 *
 * Es para lo que está medido y es cierto, pero cuya corrección es una DECISIÓN
 * de diseño que nadie ha tomado — arreglarlo cambiaría el aspecto de varios
 * temas a la vez. Un aviso obliga a mirarlo cada vez sin bloquear el trabajo de
 * al lado; lo que no puede pasar es que se quede sin medir.
 */
function aviso(ok, etiqueta, detalle) {
    if (ok) return;
    avisos++;
    console.log(`  ${W} ${etiqueta.padEnd(24)} ${detalle}`);
}

for (const theme of list) {
    console.log(`\n\x1b[1m${theme}\x1b[0m`);
    const esClaro = LIGHT.has(theme);
    const base = col(theme, '--surface-base');
    const raised = col(theme, '--surface-raised');
    const overlay = col(theme, '--surface-overlay');
    const inset = col(theme, '--surface-inset');
    const editor = col(theme, '--monaco-editor-bg') || base;   // el lienzo del editor
    const todas = surfacesAll.map(s => col(theme, s)).filter(Boolean);

    // ── Texto sobre superficies ──
    for (const tName of textsFor(theme)) {
        const fg = col(theme, '--' + tName);
        if (!fg) { console.log(`  ${tName}: (sin resolver)`); continue; }
        const ratios = surfaces.map(s => { const bg = col(theme, s); return bg ? contrast(fg, bg) : null; });
        const floor = floorsFor(theme)[tName];
        const worst = Math.min(...ratios.filter(r => r != null));
        fila(worst >= floor, tName, `base/raised/inset: ${ratios.map(r => r == null ? ' n/a ' : r.toFixed(2)).join('  ')}   (piso ${floor}, peor ${worst.toFixed(2)})`);
    }

    // ── Bordes contra el lienzo ──
    for (const [bName, [lo, hi]] of Object.entries(BORDER_RANGE)) {
        const b = col(theme, '--' + bName);
        if (!b || !base) { console.log(`  ${bName}: (sin resolver)`); continue; }
        const r = contrast(b, base);
        fila(r >= lo && r <= hi, bName, `vs base: ${r.toFixed(2)}   (objetivo ${lo}–${hi})`);
    }

    // ── Escalón de elevación ──
    // Solo base→raised: es el que separa el panel del lienzo, o sea el síntoma
    // de "esto se ve plano". Los otros dos (overlay, inset) dependen de cuánto
    // margen le quede al tema por arriba o por abajo, y en un near-black no hay.
    if (base && raised) {
        filaSiFalla(contrast(base, raised) >= STEP_MIN, 'escalon base→raised', `${contrast(base, raised).toFixed(3)}   (mínimo ${STEP_MIN})`);
    }

    // ── Sintaxis contra el lienzo del editor ──
    for (const k of SYNTAX) {
        const c = col(theme, '--syntax-' + k);
        if (!c || !editor) { console.log(`  syntax-${k}: (sin resolver)`); continue; }
        filaSiFalla(contrast(c, editor) >= AA, 'syntax-' + k, `vs editor: ${contrast(c, editor).toFixed(2)}   (piso ${AA})`);
    }
    // El comentario tiene que RETROCEDER, así que su piso no es 4.5. Y va por
    // modo, con el mismo argumento que --text-tertiary: sobre fondo oscuro el
    // ojo se adapta distinto, y el suelo aprobado del proyecto es más bajo.
    {
        const c = col(theme, '--syntax-comment');
        const piso = esClaro ? 3.0 : 2.4;
        if (c && editor) filaSiFalla(contrast(c, editor) >= piso, 'syntax-comment', `vs editor: ${contrast(c, editor).toFixed(2)}   (piso ${piso})`);
    }

    // ── Tipos de dato: cabecera de resultados y explorador de esquema ──
    for (const k of TYPES) {
        const c = col(theme, '--type-' + k);
        if (!c) continue;
        const peor = Math.min(contrast(c, raised), contrast(c, editor));
        filaSiFalla(peor >= AA, 'type-' + k, `vs panel/editor: ${peor.toFixed(2)}   (piso ${AA})`);
    }

    // ── Textos de feedback ──
    for (const k of FEEDBACK) {
        const c = col(theme, `--feedback-${k}-text`);
        if (!c) continue;
        const peor = Math.min(...todas.map(s => contrast(c, s)));
        filaSiFalla(peor >= AA, `feedback-${k}-text`, `peor superficie: ${peor.toFixed(2)}   (piso ${AA})`);
    }

    // ── Iconos de archivo: no son texto, piso 3.0 ──
    for (const k of ICONS) {
        const c = col(theme, '--icon-' + k);
        if (!c) continue;
        const peor = Math.min(contrast(c, raised), contrast(c, editor));
        filaSiFalla(peor >= 3.0, 'icon-' + k, `vs panel/editor: ${peor.toFixed(2)}   (piso 3.0)`);
    }

    // ── Estados ──
    for (const [nombre, [lo, hi]] of [['hover-bg', HOVER_RANGE], ['active-bg', ACTIVE_RANGE]]) {
        const c = col(theme, '--' + nombre);
        if (!c || !raised) continue;
        const r = contrast(c, raised);
        filaSiFalla(r >= lo && r <= hi, nombre, `vs raised: ${r.toFixed(3)}   (objetivo ${lo}–${hi})`);
    }

    // ── Acento: como TEXTO sobre el papel y como RELLENO con su texto encima ──
    // Se prueban todos los presets, no solo el que trae el tema: el usuario los
    // puede cambiar, y era ahí donde fallaba (cuatro botones ilegibles en claro).
    const presets = { '(por defecto)': ACCENT_DEFAULT[theme] ? { '--accent-primary': ACCENT_DEFAULT[theme] } : null,
                      ...(esClaro ? ACCENTS_LIGHT : ACCENTS_DARK) };
    for (const [nombre, tokensAcc] of Object.entries(presets)) {
        const acc = col(theme, '--accent-primary', tokensAcc);
        if (!acc) continue;
        const comoTexto = Math.min(...todas.map(s => contrast(acc, s)));
        const btnTxt = col(theme, '--button-text-color', tokensAcc);
        const enBoton = btnTxt ? contrast(btnTxt, acc) : null;
        // En oscuro el acento es claro: como relleno lleva texto OSCURO y el par
        // funciona solo. El caso duro es el claro, donde ambos usos tiran en
        // direcciones opuestas.
        const okTexto = comoTexto >= AA;
        const okBoton = enBoton == null || enBoton >= AA;
        const detalle = `texto ${comoTexto.toFixed(2)}${enBoton != null ? ` / en botón ${enBoton.toFixed(2)}` : ''}   (piso ${AA})`;
        // En claro es FALLO: la rampa se calibró entera para que los 20 pasen.
        // En oscuro es AVISO. El extremo profundo de la rampa (linear, amox-9,
        // amox-10) nace con L 0.53–0.61, y sobre un near-black eso da 2.5–4.0
        // como texto. Subirlo cambiaría el aspecto de los siete temas oscuros a
        // la vez: es una decisión de diseño, no un arreglo. Queda medido.
        (esClaro ? filaSiFalla : aviso)(okTexto && okBoton, 'acento ' + nombre, detalle);
    }

    // ── Velo de los diálogos: solo en claro ──
    if (esClaro) {
        const velo = col(theme, '--overlay-bg');
        if (velo && base && overlay) {
            const lienzoVelado = over(velo, base);
            const r = contrast(overlay, lienzoVelado);
            filaSiFalla(r >= VEIL_MIN, 'velo del diálogo', `diálogo sobre el velo: ${r.toFixed(2)}   (mínimo ${VEIL_MIN})`);
        }
        // Las sombras son la única pista de profundidad que queda sobre papel.
        for (const [nombre, [lo, hi]] of Object.entries(SHADOW_ALPHA_LIGHT)) {
            const c = shadowColor(theme, nombre);
            if (!c) continue;
            filaSiFalla(c.a >= lo && c.a <= hi, nombre, `alfa ${c.a.toFixed(3)}   (objetivo ${lo}–${hi})`);
        }
    }
}

/**
 * Regla estructural: ninguna custom property declarada en `:root` puede contener
 * `var()`.
 *
 * Una property cuyo valor lleva var() resuelve en el elemento donde SE DECLARA.
 * `:root` es <html>, y las clases de tema y de acento van en <body>: lo que se
 * declare arriba se congela en los valores por defecto y deja de seguir al tema.
 * Esta trampa ya mordió tres veces — el acento (PR #70), el resplandor y los
 * alias --color-* (11 de 13 temas, 275 usos) — y las tres veces el comentario
 * que avisaba ya estaba escrito ahí al lado. Por eso ahora se comprueba.
 */
console.log('\n\x1b[1mregla: nada de var() dentro de :root\x1b[0m');
{
    // Solo cuenta si el var() apunta a un token que ALGÚN tema redefine: eso es
    // lo que hace que se congele. `--transition-fast: var(--duration-fast)`
    // lleva var() y no es un bug — las duraciones son globales, no dependen del
    // tema, y congelarlas no cambia nada.
    const dependeDelTema = new Set();
    for (const [name, sel] of Object.entries(THEME_SELECTORS)) {
        if (sel === ':root') continue;
        for (const k of Object.keys(themes[name])) dependeDelTema.add(k);
    }
    for (const k of Object.keys(MODE_LIGHT)) dependeDelTema.add(k);

    const m = CSS.match(/(^|\n):root\s*\{([\s\S]*?)\n\}/);
    const culpables = [];
    for (const line of (m ? m[2] : '').split(/\r?\n/)) {
        const t = line.match(/^\s*(--[\w-]+):\s*([^;]+);/);
        if (!t) continue;
        const refs = [...t[2].matchAll(/var\(\s*(--[\w-]+)/g)].map(x => x[1]);
        if (refs.some(r => dependeDelTema.has(r))) culpables.push(`${t[1]} = ${t[2].trim()}`);
    }
    if (culpables.length) {
        failures += culpables.length;
        console.log(`  ${X} ${culpables.length} property(s) con var() en :root — se congelan en el tema por defecto:`);
        for (const c of culpables) console.log(`      ${c}`);
        console.log('      Muévelas al bloque `body`, que es quien lleva la clase del tema.');
    } else {
        console.log(`  ${V} ninguna`);
    }
}

const cola = avisos ? `  \x1b[33m(${avisos} aviso(s): medidos, sin decidir)\x1b[0m` : '';
console.log(`\n${failures === 0 ? '\x1b[32mTodo pasa.\x1b[0m' : `\x1b[31m${failures} comprobación(es) por debajo del objetivo.\x1b[0m`}${cola}`);
process.exit(failures === 0 ? 0 : 1);
