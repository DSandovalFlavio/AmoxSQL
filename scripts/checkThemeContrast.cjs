#!/usr/bin/env node
/**
 * Theme contrast checker for AmoxSQL.
 *
 * Parses the theme token blocks in client/src/index.css, converts every color
 * (hex, rgba, oklch) to sRGB, and reports WCAG 2.x contrast ratios for the
 * load-bearing text/surface and border/surface pairs of each theme. Flags
 * anything below the canonical floors (see FLOORS).
 *
 * Usage:  node scripts/checkThemeContrast.cjs [--all]
 *   (default: light themes + islands; --all: every theme)
 */
const fs = require('fs');
const path = require('path');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'client', 'src', 'index.css'), 'utf8');

// ── Color parsing → linear-light sRGB {r,g,b} in [0,1], plus alpha ──────────
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
    return { r: parseInt(hex.slice(0, 2), 16) / 255, g: parseInt(hex.slice(2, 4), 16) / 255, b: parseInt(hex.slice(4, 6), 16) / 255, a: 1 };
}

function parseRGBA(str) {
    const m = str.match(/rgba?\(([^)]+)\)/);
    const parts = m[1].split(',').map(s => s.trim());
    return { r: +parts[0] / 255, g: +parts[1] / 255, b: +parts[2] / 255, a: parts[3] !== undefined ? +parts[3] : 1 };
}

// oklch(L C H) or oklch(L C H / a) → sRGB (gamma-encoded) [0,1]
function oklchToRGB(str) {
    const m = str.match(/oklch\(([^)]+)\)/);
    let body = m[1].replace('/', ' ').split(/\s+/).filter(Boolean);
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
    let R = +4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s;
    let G = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s;
    let B = -0.0041960863 * l - 0.7034186147 * mm + 1.7076147010 * s;
    const enc = c => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
    return { r: enc(R), g: enc(G), b: enc(B), a };
}

function parseColor(str) {
    str = str.trim();
    if (str.startsWith('#')) return hexToRGB(str);
    if (str.startsWith('rgb')) return parseRGBA(str);
    if (str.startsWith('oklch')) return oklchToRGB(str);
    if (str === 'white') return hexToRGB('#ffffff');
    if (str === 'black') return hexToRGB('#000000');
    if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    return null; // var(), color-mix, etc. — skip
}

// Composite a (possibly translucent) fg over an opaque bg (gamma space)
function composite(fg, bg) {
    if (fg.a >= 1) return fg;
    return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}

function luminance(c) {
    return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

function contrast(fg, bg) {
    const f = composite(fg, bg), L1 = luminance(f), L2 = luminance(bg);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
}

// ── Parse theme blocks from index.css ───────────────────────────────────────
const THEME_SELECTORS = {
    obsidian: ':root',
    onyx: '.theme-onyx', carbon: '.theme-carbon', graphite: '.theme-graphite',
    nord: '.theme-nord', islands: '.theme-islands',
    light: '.light-theme', ivory: '.theme-ivory', mist: '.theme-mist', snow: '.theme-snow',
};

function extractBlock(selector) {
    // Match `selector {` (exactly, not `.theme-nord:not(...)`) up to the first closing brace at col 0
    const re = new RegExp('(^|\\n)' + selector.replace(/[.]/g, '\\.') + '\\s*\\{([\\s\\S]*?)\\n\\}', 'm');
    const m = CSS.match(re);
    if (!m) return {};
    const tokens = {};
    for (const line of m[2].split('\n')) {
        const t = line.match(/^\s*(--[\w-]+):\s*([^;]+);/);
        if (t) tokens[t[1]] = t[2].trim();
    }
    return tokens;
}

const themes = {};
for (const [name, sel] of Object.entries(THEME_SELECTORS)) themes[name] = extractBlock(sel);
const root = themes.obsidian;
// Resolve a token for a theme, falling back to :root
function tok(theme, name) { return themes[theme][name] ?? root[name]; }

// ── Floors (from the audit §7.3) ────────────────────────────────────────────
// text-tertiary is mode-aware: light backgrounds need ≥4:1 (the reported "invisible
// letters" bug), while the established, user-approved dark baseline sits at ~3.1 and
// reads fine on dark surfaces (the eye adapts differently). primary/secondary uniform.
const LIGHT = new Set(['light', 'ivory', 'mist', 'snow']);
const floorsFor = (theme) => ({ 'text-primary': 10, 'text-secondary': 5.5, 'text-tertiary': LIGHT.has(theme) ? 4.0 : 3.0 });
// Border contrast targets (border vs surface-base): subtle 1.10–1.22, default 1.25–1.40, strong 1.50–1.80
const BORDER_RANGE = { 'border-subtle': [1.08, 1.30], 'border-default': [1.20, 1.55], 'border-strong': [1.45, 2.10] };

const surfaces = ['--surface-base', '--surface-raised', '--surface-inset'];
const texts = ['text-primary', 'text-secondary', 'text-tertiary'];

const all = process.argv.includes('--all');
const list = all ? Object.keys(themes) : ['light', 'ivory', 'mist', 'snow', 'islands'];

let failures = 0;
for (const theme of list) {
    console.log(`\n\x1b[1m${theme}\x1b[0m`);
    // Text vs surfaces
    for (const tName of texts) {
        const fg = parseColor(tok(theme, '--' + tName));
        if (!fg) { console.log(`  ${tName}: (unresolved)`); continue; }
        const ratios = surfaces.map(s => {
            const bg = parseColor(tok(theme, s));
            return bg ? contrast(fg, bg) : null;
        });
        const floor = floorsFor(theme)[tName];
        const worst = Math.min(...ratios.filter(r => r != null));
        const ok = worst >= floor;
        if (!ok) failures++;
        const cells = ratios.map(r => r == null ? ' n/a ' : r.toFixed(2)).join('  ');
        console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${tName.padEnd(15)} base/raised/inset: ${cells}   (floor ${floor}, worst ${worst.toFixed(2)})`);
    }
    // Borders vs surface-base
    const base = parseColor(tok(theme, '--surface-base'));
    for (const [bName, [lo, hi]] of Object.entries(BORDER_RANGE)) {
        const b = parseColor(tok(theme, '--' + bName));
        if (!b || !base) { console.log(`  ${bName}: (unresolved)`); continue; }
        const r = contrast(b, base);
        const ok = r >= lo && r <= hi;
        if (!ok) failures++;
        console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${bName.padEnd(15)} vs base: ${r.toFixed(2)}   (target ${lo}–${hi})`);
    }
}

console.log(`\n${failures === 0 ? '\x1b[32mAll checks passed.\x1b[0m' : `\x1b[31m${failures} check(s) below target.\x1b[0m`}`);
process.exit(failures === 0 ? 0 : 1);
