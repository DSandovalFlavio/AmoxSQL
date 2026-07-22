/**
 * One-shot generator for legend-text twins (Sterling idea, MIT © La Matemaga).
 * For each palette color, produce a hue-matched twin that reads as TEXT:
 *   - light surface: darken (raise contrast) until >= target ratio
 *   - dark surface:  lighten until >= target ratio
 * Keeps hue, nudges chroma up slightly so darkened tones don't go muddy.
 * Output is hardcoded into constants.js (no runtime dep).
 */

// ---- sRGB <-> OKLab/OKLCH ----
const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const linToSrgb = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

function rgbToOklab([r, g, b]) {
  const lr = srgbToLin(r), lg = srgbToLin(g), lb = srgbToLin(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    linToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
function rgbToOklch(rgb) { const [L, a, b] = rgbToOklab(rgb); return [L, Math.hypot(a, b), Math.atan2(b, a)]; }
function oklchToRgb([L, C, h]) { return oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)]); }

// ---- WCAG contrast ----
function relLum([r, g, b]) { const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b); return 0.2126 * R + 0.7152 * G + 0.0722 * B; }
function contrast(rgb1, rgb2) { const l1 = relLum(rgb1), l2 = relLum(rgb2); const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); }

// Representative chart surfaces across AmoxSQL's themes.
const LIGHT_SURF = hexToRgb('#f6f3fb'); // lavender-ish light paper (Sterling/Amox light)
const DARK_SURF = hexToRgb('#101319');  // representative dark chart bg
const TARGET = 4.5;

// Find a twin by walking OKLCH lightness toward the needed direction, keeping
// hue, gently boosting chroma so darkened colors stay saturated (not muddy).
function makeTwin(hex, surf, dir) {
  const [L0, C0, h] = rgbToOklch(hexToRgb(hex));
  let best = hexToRgb(hex);
  let bestC = contrast(best, surf);
  for (let step = 0; step <= 60; step++) {
    const L = Math.max(0.12, Math.min(0.95, L0 + dir * step * 0.012));
    const C = Math.min(C0 * 1.12, 0.37); // slight chroma bump, capped
    const rgb = oklchToRgb([L, C, h]);
    const clamped = rgb.map(v => Math.max(0, Math.min(255, v)));
    const cr = contrast(clamped, surf);
    if (cr >= TARGET) return rgbToHex(...clamped);
    if (cr > bestC) { best = clamped; bestC = cr; }
  }
  return rgbToHex(...best); // best effort if target unreachable (e.g. mid-grey)
}

const PALETTES = {
  default: ['#9b87f5', '#f87171', '#60a5fa', '#fbbf24', '#34d399', '#f472b6', '#a78bfa', '#fb923c'],
  vivid: ['#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#3B3EAC', '#0099C6', '#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11', '#6633CC', '#E67300', '#8B0707', '#329262', '#5574A6'],
  set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'],
  set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
  pastel: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
  dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
  blues: ['#084594', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7', '#f7fbff'],
  greens: ['#005a32', '#238b45', '#41ab5d', '#74c476', '#a1d99b', '#c7e9c0', '#e5f5e0', '#f7fcf5'],
  reds: ['#99000d', '#cb181d', '#ef3b2c', '#fb6a4a', '#fc9272', '#fcbba1', '#fee0d2', '#fff5f0'],
  purples: ['#3f007d', '#54278f', '#6a51a3', '#807dba', '#9e9ac8', '#bcbddc', '#dadaeb', '#f2f0f7'],
  ylorbr: ['#8c2d04', '#cc4c02', '#ec7014', '#fe9929', '#fec44f', '#fee391', '#fff7bc', '#ffffe5'],
  spectral: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
  rdylbu: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4'],
  rdylgn: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'],
  piyg: ['#c51b7d', '#e9a3c9', '#fde0ef', '#e6f5d0', '#a1d76a', '#4d9221'],
  ocean: ['#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8'],
  sunset: ['#ff6b6b', '#ee5a24', '#f0932b', '#f9ca24', '#6ab04c', '#22a6b3'],
  corporate: ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#ecf0f1'],
  neon: ['#ff00ff', '#00ffff', '#ff6600', '#00ff00', '#ff3366', '#6633ff'],
};

const out = {};
for (const [name, colors] of Object.entries(PALETTES)) {
  out[name] = {
    light: colors.map(c => makeTwin(c, LIGHT_SURF, -1)),
    dark: colors.map(c => makeTwin(c, DARK_SURF, +1)),
  };
}

// Report worst-case contrasts so we can eyeball problem palettes.
let report = [];
for (const [name, colors] of Object.entries(PALETTES)) {
  const lc = out[name].light.map(h => contrast(hexToRgb(h), LIGHT_SURF));
  const dc = out[name].dark.map(h => contrast(hexToRgb(h), DARK_SURF));
  report.push(`${name.padEnd(10)} light min ${Math.min(...lc).toFixed(2)}  dark min ${Math.min(...dc).toFixed(2)}`);
}

// Emit JS ready to paste.
let js = '';
for (const [name, pair] of Object.entries(out)) {
  js += `    ${name}: {\n`;
  js += `        light: [${pair.light.map(c => `'${c}'`).join(', ')}],\n`;
  js += `        dark:  [${pair.dark.map(c => `'${c}'`).join(', ')}],\n`;
  js += `    },\n`;
}
console.log('// ---- contrast report ----');
console.log(report.join('\n'));
console.log('\n// ---- LEGEND_PAIRS entries ----');
console.log(js);
