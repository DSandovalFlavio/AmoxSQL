#!/usr/bin/env node
/**
 * Verificador de temas de AmoxSQL.
 *
 * Comprueba los contrastes WCAG 2.x de los pares que sostienen la interfaz y
 * avisa de lo que baja de los pisos canonicos.
 *
 * La lectura de los tokens vive en `lib/themeTokens.cjs`, compartida con el
 * generador de docs/dev/temas.html para que los dos vean los mismos colores.
 *
 * Uso:  node scripts/checkThemeContrast.cjs [--all]
 *   (por defecto: los tres temas claros; --all: los diez)
 */
const {
    CSS, THEME_SELECTORS, LIGHT,
    themes, root, MODE_LIGHT,
    ACCENT_DEFAULT, ACCENTS_LIGHT, ACCENTS_DARK,
    col, shadowColor, over, contrast,
} = require('./lib/themeTokens.cjs');

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
