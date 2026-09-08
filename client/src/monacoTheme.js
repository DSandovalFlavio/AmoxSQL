/**
 * Single source of truth for the Monaco editor theme.
 *
 * The old design registered TWO global Monaco themes (duckdb-dark/duckdb-light)
 * for 10 app themes, each populated from a "snapshot" of the CSS variables taken
 * at arbitrary moments (any editor mount + one re-sync effect that lived only in
 * SqlEditor). If the active tab wasn't a .sql editor when the theme changed, or
 * the accent changed, nobody re-read the tokens → the editor kept the previous
 * theme ("stays the same although it changed"), and the "other" slot got poisoned
 * with the current mode's tokens.
 *
 * Now: ONE Monaco theme named `amox`, always rebuilt from the LIVE CSS variables
 * of whatever app theme + accent is active, and re-applied from ONE place —
 * App.jsx, in the same effects that set the body theme/accent classes. Editors
 * just `theme="amox"` and register the monaco instance on mount.
 */
import { isLightTheme } from './theme.js';

/**
 * Last-resort fallback used ONLY if a CSS variable fails to resolve (e.g. the
 * very first paint before styles apply). NOT a source of truth — the real
 * colors always come from index.css via cssVarToHex.
 */
const FALLBACK = {
    dark:  { bg: '141517', raised: '191B1F', overlay: '1F2125', fg: 'EBEBEB', fgMuted: '8F9099', fgDim: '5C5E66', fgDisabled: '333538', accent: '00DDDD', keyword: '9B8FF2', string: 'D4A76A', number: 'E0A86E', fn: '6EC5D4', comment: '5C5F66', type: '4FC1FF', operator: 'C4B99A', variable: 'D1D3D8', constant: '5EC9A0', error: 'E06C75' },
    light: { bg: 'FAFBFC', raised: 'F2F3F5', overlay: 'FFFFFF', fg: '141414', fgMuted: '474747', fgDim: '737373', fgDisabled: 'A6A6A6', accent: '0059FF', keyword: '5E6AD2', string: 'B35E1A', number: 'C46D1A', fn: '1E8A9E', comment: 'A0A3AA', type: '1A8E80', operator: '6B6E76', variable: '3B3D42', constant: '1A8E60', error: 'C13A3A' },
};

/**
 * Resolve a CSS variable to a 6-digit hex color (without #). Usa un elemento
 * sonda persistente para que el navegador resuelva `var()` — Monaco necesita
 * hex pelado y no sabe leer variables CSS ni oklch.
 *
 * OJO con una suposición que era falsa: leer `getComputedStyle(el).color` NO
 * devuelve siempre `rgb()`. Chrome conserva la notación de origen, así que un
 * token declarado en oklch vuelve como `oklch(0.145 0.012 270)`. El regex de
 * abajo solo entendía `rgb()`, de modo que TODO token en oklch caía al valor de
 * respaldo sin avisar. No se notaba porque los respaldos se escribieron a partir
 * de esos mismos colores y quedan casi iguales — hasta que el fondo del editor
 * de Obsidian pasó a resolverse por esta vía y apareció un gris (#141517) que no
 * pegaba con nada. Por eso hay una segunda vía con canvas: pinta el color ya
 * resuelto y lee el píxel, que es lo único que normaliza cualquier notación.
 */
let _cssProbeEl = null;
let _canvasCtx = null;

/** Pinta un color CSS ya resuelto y lee el píxel. Entiende lo que sea. */
function paintToHex(cssColor) {
    if (!_canvasCtx) {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        _canvasCtx = c.getContext('2d', { willReadFrequently: true });
    }
    if (!_canvasCtx) return null;
    _canvasCtx.clearRect(0, 0, 1, 1);
    // Si el color no parsea, fillStyle conserva el anterior; el negro previo
    // hace que un fallo se note en vez de colarse como un color plausible.
    _canvasCtx.fillStyle = '#000000';
    _canvasCtx.fillStyle = cssColor;
    _canvasCtx.fillRect(0, 0, 1, 1);
    const d = _canvasCtx.getImageData(0, 0, 1, 1).data;
    // getImageData da los canales SIN premultiplicar, así que el alfa se ignora
    // igual que en la vía del regex: Monaco quiere un color opaco.
    return [d[0], d[1], d[2]].map(c => c.toString(16).padStart(2, '0')).join('');
}
function cssVarToHex(varName, fallback) {
    return cssExprToHex(`var(${varName})`, fallback);
}
/**
 * Like cssVarToHex but takes a full CSS color expression, so callers can use a
 * `var(--x, var(--y))` fallback CHAIN. Resolving the fallback inside the
 * expression is reliable, whereas defining `--x: var(--y)` in :root and reading
 * `--x` does NOT re-resolve `--y` against the active theme through this probe.
 */
function cssExprToHex(expr, fallback) {
    if (typeof document === 'undefined') return fallback;
    try {
        if (!_cssProbeEl) {
            _cssProbeEl = document.createElement('div');
            _cssProbeEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0';
            document.body.appendChild(_cssProbeEl);
        }
        _cssProbeEl.style.color = expr;
        const resolved = getComputedStyle(_cssProbeEl).color;
        if (!resolved || resolved === 'rgba(0, 0, 0, 0)') return fallback;
        // Vía rápida: rgb()/rgba(), que es como vuelven los tokens en hex y en
        // rgba. Se queda primero para no cambiar en nada lo que ya funcionaba.
        const match = resolved.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const [, r, g, b] = match;
            return [r, g, b].map(c => Number(c).toString(16).padStart(2, '0')).join('');
        }
        // Cualquier otra notación — oklch, color(srgb …), lab… — por canvas.
        return paintToHex(resolved) || fallback;
    } catch {
        return fallback;
    }
}

/** True when the active app theme is a light one (reads the body mode class). */
function currentIsLight() {
    if (typeof document === 'undefined') return false;
    // App applies `mode-light`/`mode-dark` on <body> alongside the theme class.
    return document.body.classList.contains('mode-light');
}

/**
 * Build the `amox` Monaco theme from the LIVE CSS variables of the active app
 * theme + accent. Called on every theme/accent change — cheap (~18 reads of a
 * reused probe element).
 */
export function buildAmoxMonacoTheme() {
    const isDark = !currentIsLight();
    const fb = isDark ? FALLBACK.dark : FALLBACK.light;

    const p = {
        // The editor canvas reads --monaco-editor-bg, falling back to the theme's
        // --surface-base. Hoy NINGÚN tema lo define, así que todos caen al
        // fallback y el editor es del mismo color que el lienzo de la app.
        // El token se mantiene por si un tema quisiera un lienzo distinto del
        // resto de sus superficies; hasta 2026-09 lo usaban Obsidian y Onyx
        // para intercambiarse el fondo del editor, y el efecto era que dentro de
        // cada tema el editor no pegaba con lo que lo rodeaba.
        bg:         cssExprToHex('var(--monaco-editor-bg, var(--surface-base))', fb.bg),
        raised:     cssVarToHex('--surface-raised', fb.raised),
        overlay:    cssVarToHex('--surface-overlay', fb.overlay),
        fg:         cssVarToHex('--text-primary', fb.fg),
        fgMuted:    cssVarToHex('--text-secondary', fb.fgMuted),
        fgDim:      cssVarToHex('--text-tertiary', fb.fgDim),
        fgDisabled: cssVarToHex('--text-disabled', fb.fgDisabled),
        accent:     cssVarToHex('--accent-primary', fb.accent),
        keyword:    cssVarToHex('--syntax-keyword', fb.keyword),
        string:     cssVarToHex('--syntax-string', fb.string),
        number:     cssVarToHex('--syntax-number', fb.number),
        fn:         cssVarToHex('--syntax-function', fb.fn),
        comment:    cssVarToHex('--syntax-comment', fb.comment),
        type:       cssVarToHex('--syntax-type', fb.type),
        operator:   cssVarToHex('--syntax-operator', fb.operator),
        variable:   cssVarToHex('--syntax-variable', fb.variable),
        constant:   cssVarToHex('--syntax-constant', fb.constant),
        error:      cssVarToHex('--feedback-error', fb.error),
    };

    return {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: false,
        rules: [
            { token: '', foreground: p.fg, background: p.bg },
            { token: 'comment', foreground: p.comment, fontStyle: 'italic' },
            { token: 'comment.sql', foreground: p.comment, fontStyle: 'italic' },
            { token: 'keyword', foreground: p.keyword, fontStyle: 'bold' },
            { token: 'keyword.sql', foreground: p.keyword, fontStyle: 'bold' },
            { token: 'operator', foreground: p.operator },
            { token: 'operator.sql', foreground: p.operator },
            { token: 'delimiter', foreground: p.operator },
            { token: 'string', foreground: p.string },
            { token: 'string.sql', foreground: p.string },
            { token: 'number', foreground: p.number },
            { token: 'number.sql', foreground: p.number },
            { token: 'identifier', foreground: p.variable },
            { token: 'identifier.sql', foreground: p.variable },
            { token: 'identifier.quote', foreground: p.variable },
            { token: 'type', foreground: p.type },
            { token: 'type.sql', foreground: p.type },
            { token: 'predefined', foreground: p.fn },
            { token: 'predefined.sql', foreground: p.fn },
            { token: 'tag', foreground: p.keyword },
            { token: 'attribute.name', foreground: p.type },
            { token: 'jinja.block', foreground: p.error, fontStyle: 'bold' },
            { token: 'jinja.tag', foreground: p.constant },
            { token: 'jinja.variable', foreground: p.fn },
            { token: 'jinja.comment', foreground: p.comment, fontStyle: 'italic' },
        ],
        colors: {
            'editor.background':                `#${p.bg}`,
            'editor.foreground':                `#${p.fg}`,
            'editor.lineHighlightBackground':   `#${p.raised}`,
            'editor.lineHighlightBorder':       '#00000000',
            'editorGutter.background':          `#${p.bg}`,
            'editorLineNumber.foreground':      `#${p.fgDisabled}`,
            'editorLineNumber.activeForeground': `#${p.fgDim}`,
            'editorCursor.foreground':          `#${p.accent}`,
            'editor.selectionBackground':       `#${p.keyword}30`,
            'editor.inactiveSelectionBackground': `#${p.keyword}18`,
            'editor.selectionHighlightBackground': `#${p.keyword}15`,
            'editor.findMatchBackground':       `#${p.string}40`,
            'editor.findMatchHighlightBackground': `#${p.string}25`,
            'editorIndentGuide.background':     `#${p.overlay}`,
            'editorIndentGuide.activeBackground': `#${p.overlay}`,
            'editorBracketMatch.background':    `#${p.keyword}20`,
            'editorBracketMatch.border':        `#${p.keyword}80`,
            'editorWidget.background':          `#${p.overlay}`,
            'editorWidget.border':              '#00000000',
            'editorSuggestWidget.background':   `#${p.overlay}`,
            'editorSuggestWidget.border':       '#00000000',
            'editorSuggestWidget.foreground':   `#${p.fg}`,
            'editorSuggestWidget.selectedBackground': `#${p.raised}`,
            'editorSuggestWidget.selectedForeground': `#${p.fg}`,
            'editorSuggestWidget.highlightForeground': `#${p.accent}`,
            'editorSuggestWidget.focusHighlightForeground': `#${p.accent}`,
            'editorHoverWidget.background':     `#${p.overlay}`,
            'editorHoverWidget.border':         '#00000000',
            'scrollbar.shadow':                 '#00000000',
            'scrollbarSlider.background':       isDark ? '#ffffff12' : '#00000010',
            'scrollbarSlider.hoverBackground':  isDark ? '#ffffff20' : '#00000020',
            'scrollbarSlider.activeBackground': isDark ? '#ffffff30' : '#00000030',
            'minimap.background':               `#${p.bg}`,
        }
    };
}

const AMOX_THEME = 'amox';
let monacoRef = null;

/** Define + activate the `amox` theme from the current tokens. */
function applyAmoxTheme() {
    if (!monacoRef) return;
    try {
        monacoRef.editor.defineTheme(AMOX_THEME, buildAmoxMonacoTheme());
        monacoRef.editor.setTheme(AMOX_THEME);
    } catch { /* monaco not ready */ }
}

/**
 * Register the monaco instance (called from every editor's beforeMount). Storing
 * it lets App re-theme all editors at once — setTheme is global, which is now the
 * design (one app theme ⇒ one Monaco theme) instead of a per-instance hazard.
 */
export function registerMonaco(monaco) {
    monacoRef = monaco;
    applyAmoxTheme();
}

/** Re-read tokens and re-apply. Call AFTER the body theme/accent class updates. */
export function syncMonacoTheme() {
    applyAmoxTheme();
}

export const MONACO_THEME_NAME = AMOX_THEME;
export { isLightTheme };
