#!/usr/bin/env node
/**
 * Genera `docs/dev/temas.html`: la referencia visual de los temas y las paletas.
 *
 * Se GENERA, no se escribe a mano, y esa es toda la gracia. Una referencia de
 * color escrita a mano empieza siendo verdad y deja de serlo en la primera
 * calibración que nadie se acuerda de copiar; a partir de ahí es peor que no
 * tenerla, porque alguien la usa para decidir. Esta lee `client/src/index.css` y
 * `DataVisualizer/constants.js` con el MISMO resolvedor que el verificador de
 * contraste (lib/themeTokens.cjs), así que los dos hablan de los mismos colores.
 *
 * Uso:  node scripts/genThemeReference.cjs
 */
const fs = require('fs');
const path = require('path');
const T = require('./lib/themeTokens.cjs');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'docs', 'dev', 'temas.html');

// ── Datos ───────────────────────────────────────────────────────────────────

const ETIQUETAS = {
    amoxdark: 'Amox Dark', obsidian: 'Obsidian', onyx: 'Onyx', nord: 'Nord Dark',
    islands: 'Dark Islands', ayu: 'Ayu Dark', sterlingdeep: 'Sterling Deep',
    amoxlight: 'Amox Light', sterlinglight: 'Sterling Light', mist: 'Mist',
};
const ORDEN = ['amoxdark', 'obsidian', 'onyx', 'nord', 'islands', 'ayu', 'sterlingdeep',
               'amoxlight', 'sterlinglight', 'mist'];

const SUPERFICIES = ['base', 'raised', 'overlay', 'inset'];
const TEXTOS = ['primary', 'secondary', 'tertiary', 'disabled'];
const BORDES = ['subtle', 'default', 'strong'];
const SINTAXIS = ['keyword', 'string', 'number', 'function', 'type', 'operator', 'variable', 'constant', 'comment'];
const TIPOS = ['integer', 'float', 'text', 'datetime', 'boolean', 'default'];
const FEEDBACK = ['success', 'error', 'warning', 'info'];
const ICONOS = ['folder', 'sql', 'notebook', 'csv', 'json', 'md', 'parquet', 'excel'];

/** Lee los arrays de paletas de constants.js sin ejecutar el módulo (es ESM). */
function leerPaletas() {
    const src = fs.readFileSync(
        path.join(RAIZ, 'client', 'src', 'components', 'DataVisualizer', 'constants.js'), 'utf8');
    const bloque = (nombre) => {
        const m = src.match(new RegExp(`export const ${nombre} = \\{([\\s\\S]*?)\\n\\};`));
        return m ? m[1] : '';
    };
    const paletas = {};
    for (const m of bloque('COLOR_PALETTES').matchAll(/^\s{4}(\w+):\s*(\[[\s\S]*?\])/gm)) {
        paletas[m[1]] = [...m[2].matchAll(/#[0-9a-fA-F]{6}/g)].map(x => x[0]);
    }
    const pares = {};
    for (const m of bloque('LEGEND_PAIRS').matchAll(/^\s{4}(\w+):\s*\{([\s\S]*?)\n\s{4}\}/gm)) {
        const luz = m[2].match(/light:\s*(\[[\s\S]*?\])/);
        const osc = m[2].match(/dark:\s*(\[[\s\S]*?\])/);
        pares[m[1]] = {
            light: luz ? [...luz[1].matchAll(/#[0-9a-fA-F]{6}/g)].map(x => x[0]) : [],
            dark:  osc ? [...osc[1].matchAll(/#[0-9a-fA-F]{6}/g)].map(x => x[0]) : [],
        };
    }
    return { paletas, pares };
}

// ── Ayudas ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (t, tok, acc) => T.toHex(T.col(t, tok, acc));
const ratio = (a, b) => (a && b) ? T.contrast(a, b).toFixed(2) : '—';

/** Una muestra: cuadro de color + nombre + hex, y opcionalmente el contraste. */
function muestra(nombre, color, extra = '') {
    if (!color) return '';
    return `<div class="sw">
      <div class="sw-chip" style="background:${color}"></div>
      <div class="sw-meta"><b>${esc(nombre)}</b><code>${esc(color)}</code>${extra}</div>
    </div>`;
}

/** Una muestra de TEXTO pintada sobre la superficie real del tema. */
function muestraTexto(nombre, color, fondo, piso) {
    if (!color || !fondo) return '';
    const r = T.contrast(T.hexToRGB(color), T.hexToRGB(fondo));
    const mal = piso != null && r < piso;
    return `<div class="sw">
      <div class="sw-chip sw-chip--txt" style="background:${fondo};color:${color}">Aa</div>
      <div class="sw-meta"><b>${esc(nombre)}</b><code>${esc(color)}</code>
        <span class="ratio${mal ? ' ratio--mal' : ''}">${r.toFixed(2)}:1</span></div>
    </div>`;
}

// ── Secciones ───────────────────────────────────────────────────────────────

function seccionTema(t) {
    const claro = T.LIGHT.has(t);
    const s = Object.fromEntries(SUPERFICIES.map(k => [k, hex(t, `--surface-${k}`)]));
    const editor = hex(t, '--monaco-editor-bg') || s.base;
    const acento = T.ACCENT_DEFAULT[t] ? T.toHex(T.parseColor(T.ACCENT_DEFAULT[t], t)) : hex(t, '--accent-primary');
    const pisoTerc = claro ? 4.5 : 3.0;
    const pisoComent = claro ? 3.0 : 2.4;

    // El bloque entero se pinta sobre el lienzo del tema: un color solo se juzga
    // en su sitio, y una tira de muestras sobre fondo blanco engaña.
    return `
<section class="tema" id="tema-${t}" style="--t-base:${s.base};--t-raised:${s.raised};--t-ink:${hex(t, '--text-primary')};--t-ink2:${hex(t, '--text-secondary')};--t-line:${s.inset}">
  <header class="tema-head">
    <h3>${esc(ETIQUETAS[t])}</h3>
    <span class="pill pill--${claro ? 'claro' : 'oscuro'}">${claro ? 'claro' : 'oscuro'}</span>
    <code class="tema-id">${t === 'obsidian' ? '(sin clase de tema)' : '.theme-' + t}</code>
  </header>

  <div class="grid">
    <div class="grupo">
      <h4>Superficies</h4>
      <div class="sws">
        ${SUPERFICIES.map(k => muestra(k, s[k],
            k === 'base' ? '' : `<span class="ratio">×${T.contrast(T.hexToRGB(s.base), T.hexToRGB(s[k])).toFixed(3)}</span>`)).join('')}
        ${editor !== s.base ? muestra('editor', editor) : ''}
      </div>
      <p class="nota">El escalón <code>base→raised</code> es lo que separa el panel del lienzo. Mínimo 1.02.</p>
    </div>

    <div class="grupo">
      <h4>Texto</h4>
      <div class="sws">
        ${muestraTexto('primary', hex(t, '--text-primary'), s.raised, 10)}
        ${muestraTexto('secondary', hex(t, '--text-secondary'), s.raised, 5.5)}
        ${muestraTexto('tertiary', hex(t, '--text-tertiary'), s.raised, pisoTerc)}
        ${muestraTexto('disabled', hex(t, '--text-disabled'), s.raised, claro ? 3.0 : null)}
      </div>
      <p class="nota">Contraste contra <code>raised</code>. En oscuro el terciario baja a 3.0 y el deshabilitado no se mide: decisión asumida.</p>
    </div>

    <div class="grupo">
      <h4>Bordes y estados</h4>
      <div class="sws">
        ${BORDES.map(k => {
            const c = T.col(t, `--border-${k}`);
            const sobre = c ? T.toHex(T.over(c, T.hexToRGB(s.base))) : null;
            return muestra(k, sobre, `<span class="ratio">${ratio(c, T.hexToRGB(s.base))}</span>`);
        }).join('')}
        ${['hover-bg', 'active-bg'].map(k => {
            const c = T.col(t, `--${k}`);
            const sobre = c ? T.toHex(T.over(c, T.hexToRGB(s.raised))) : null;
            return muestra(k.replace('-bg', ''), sobre, `<span class="ratio">${ratio(c, T.hexToRGB(s.raised))}</span>`);
        }).join('')}
      </div>
    </div>

    <div class="grupo">
      <h4>Acento por defecto</h4>
      <div class="sws">
        ${muestra('accent-primary', acento)}
        ${muestraTexto('como texto', acento, s.base, claro ? 4.5 : null)}
        ${(() => {
            const bt = hex(t, '--button-text-color');
            return bt ? muestraTexto('texto en botón', bt, acento, claro ? 4.5 : null) : '';
        })()}
      </div>
      <p class="nota">El acento se usa de dos maneras. En claro las dos exigencias se cumplen a la vez solo en L 0.47–0.52.</p>
    </div>

    <div class="grupo grupo--ancho">
      <h4>Sintaxis <span class="sub">sobre el lienzo del editor</span></h4>
      <div class="sws">
        ${SINTAXIS.map(k => muestraTexto(k, hex(t, `--syntax-${k}`), editor, k === 'comment' ? pisoComent : 4.5)).join('')}
      </div>
    </div>

    <div class="grupo">
      <h4>Tipos de dato</h4>
      <div class="sws">
        ${TIPOS.map(k => muestraTexto(k, hex(t, `--type-${k}`), s.raised, 4.5)).join('')}
      </div>
    </div>

    <div class="grupo">
      <h4>Feedback</h4>
      <div class="sws">
        ${FEEDBACK.map(k => muestraTexto(k, hex(t, `--feedback-${k}-text`), s.raised, 4.5)).join('')}
      </div>
    </div>

    <div class="grupo grupo--ancho">
      <h4>Iconos de archivo</h4>
      <div class="sws">
        ${ICONOS.map(k => muestraTexto(k, hex(t, `--icon-${k}`), s.raised, 3.0)).join('')}
      </div>
    </div>
  </div>
</section>`;
}

function seccionAcentos() {
    const nombres = [...new Set([...Object.keys(T.ACCENTS_DARK), ...Object.keys(T.ACCENTS_LIGHT)])];
    const fondoOsc = hex('obsidian', '--surface-base');
    const fondoClaro = hex('amoxlight', '--surface-base');
    const filas = nombres.map(n => {
        const osc = T.toHex(T.col('obsidian', '--accent-primary', T.ACCENTS_DARK[n]));
        const clr = T.toHex(T.col('amoxlight', '--accent-primary', T.ACCENTS_LIGHT[n] || T.ACCENTS_DARK[n]));
        if (!osc || !clr) return '';
        const rOsc = T.contrast(T.hexToRGB(osc), T.hexToRGB(fondoOsc));
        const rClr = T.contrast(T.hexToRGB(clr), T.hexToRGB(fondoClaro));
        return `<tr>
          <td><code>${esc(n)}</code></td>
          <td><span class="dot" style="background:${osc}"></span><code>${osc}</code></td>
          <td class="${rOsc < 4.5 ? 'mal' : ''}">${rOsc.toFixed(2)}</td>
          <td><span class="dot" style="background:${clr}"></span><code>${clr}</code></td>
          <td class="${rClr < 4.5 ? 'mal' : ''}">${rClr.toFixed(2)}</td>
        </tr>`;
    }).join('');
    return `
<table class="tabla">
  <thead><tr><th>preset</th><th colspan="2">oscuro <span class="sub">sobre #080a0f</span></th><th colspan="2">claro <span class="sub">sobre #f1f4f7</span></th></tr></thead>
  <tbody>${filas}</tbody>
</table>`;
}

function seccionPaletas({ paletas, pares }) {
    const grupos = {
        'Categóricas': ['default', 'vivid', 'set1', 'set2', 'pastel', 'dark2', 'sterling', 'sterlingDark'],
        'Secuenciales': ['blues', 'greens', 'reds', 'purples', 'ylorbr', 'sterlingSequential'],
        'Divergentes': ['spectral', 'rdylbu', 'rdylgn', 'piyg', 'sterlingDiverging', 'sterlingHeat'],
        'De marca': ['ocean', 'sunset', 'corporate', 'neon'],
    };
    return Object.entries(grupos).map(([titulo, claves]) => `
      <h4>${esc(titulo)}</h4>
      ${claves.filter(k => paletas[k]).map(k => `
        <div class="paleta">
          <div class="paleta-nom"><code>${esc(k)}</code><span class="sub">${paletas[k].length}</span></div>
          <div class="rampa">${paletas[k].map(c => `<i style="background:${c}" title="${c}"></i>`).join('')}</div>
          ${pares[k] ? `<div class="gemelos">
            <div class="gemelo"><span class="sub">leyenda sobre claro</span><div class="rampa rampa--txt" style="background:#f6f3fb">${pares[k].light.map((c, i) => `<b style="color:${c}" title="${c}">Aa</b>`).join('')}</div></div>
            <div class="gemelo"><span class="sub">leyenda sobre oscuro</span><div class="rampa rampa--txt" style="background:#101319">${pares[k].dark.map(c => `<b style="color:${c}" title="${c}">Aa</b>`).join('')}</div></div>
          </div>` : ''}
        </div>`).join('')}`).join('');
}

// ── Página ──────────────────────────────────────────────────────────────────

function pagina() {
    const { paletas, pares } = leerPaletas();
    const fecha = new Date().toISOString().slice(0, 10);

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Temas y paletas de AmoxSQL</title>
<style>
  :root {
    --pg-bg: #ffffff; --pg-surf: #f7f7f9; --pg-ink: #16181d; --pg-ink2: #5a606b;
    --pg-line: #e3e5ea; --pg-acc: #0a6b78; --pg-mal: #b3261e;
    --mono: ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
    --sans: "Manrope", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --pg-bg: #0e1015; --pg-surf: #161920; --pg-ink: #e8eaee; --pg-ink2: #9aa2b0;
      --pg-line: #262a33; --pg-acc: #4cc9d8; --pg-mal: #ff8a80;
    }
  }
  :root[data-theme="dark"] {
    --pg-bg: #0e1015; --pg-surf: #161920; --pg-ink: #e8eaee; --pg-ink2: #9aa2b0;
    --pg-line: #262a33; --pg-acc: #4cc9d8; --pg-mal: #ff8a80;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--pg-bg); color: var(--pg-ink);
         font: 15px/1.6 var(--sans); }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 48px 24px 96px; }
  code { font-family: var(--mono); font-size: 0.86em; }
  a { color: var(--pg-acc); }

  h1 { font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 8px; text-wrap: balance; }
  h2 { font-size: 1.3rem; letter-spacing: -0.01em; margin: 56px 0 4px;
       padding-bottom: 8px; border-bottom: 1px solid var(--pg-line); }
  h3 { font-size: 1.05rem; margin: 0; }
  h4 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.09em;
       color: var(--pg-ink2); margin: 0 0 10px; font-weight: 600; }
  p  { max-width: 68ch; color: var(--pg-ink2); }
  p.lede { color: var(--pg-ink); font-size: 1.05rem; }
  .sub { color: var(--pg-ink2); font-weight: 400; font-size: 0.78em; }

  .meta { font-family: var(--mono); font-size: 0.76rem; color: var(--pg-ink2);
          border: 1px solid var(--pg-line); border-radius: 8px;
          padding: 10px 14px; margin: 24px 0 0; background: var(--pg-surf); }

  .reglas { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 20px; }
  .regla { border: 1px solid var(--pg-line); border-left: 3px solid var(--pg-acc);
           border-radius: 8px; padding: 14px 16px; background: var(--pg-surf); }
  .regla b { display: block; margin-bottom: 4px; }
  .regla p { margin: 0; font-size: 0.88rem; }

  nav.indice { display: flex; flex-wrap: wrap; gap: 6px; margin: 20px 0 0; }
  nav.indice a { font-size: 0.8rem; text-decoration: none; padding: 4px 10px;
                 border: 1px solid var(--pg-line); border-radius: 999px; color: var(--pg-ink2); }
  nav.indice a:hover { border-color: var(--pg-acc); color: var(--pg-acc); }

  /* Cada tema se pinta sobre SU lienzo: un color solo se juzga en su sitio. */
  .tema { background: var(--t-base); color: var(--t-ink);
          border: 1px solid var(--t-line); border-radius: 12px;
          padding: 20px 22px 24px; margin: 22px 0; }
  .tema-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .tema-id { color: var(--t-ink2); margin-left: auto; font-size: 0.75rem; }
  .pill { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em;
          padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor;
          color: var(--t-ink2); }

  .grid { display: grid; gap: 22px 26px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .grupo--ancho { grid-column: 1 / -1; }
  .grupo h4 { color: var(--t-ink2); }
  .nota { font-size: 0.78rem; color: var(--t-ink2); margin: 10px 0 0; max-width: 46ch; }

  .sws { display: flex; flex-wrap: wrap; gap: 8px 14px; }
  .sw { display: flex; align-items: center; gap: 8px; min-width: 132px; }
  .sw-chip { width: 26px; height: 26px; border-radius: 6px; flex: none;
             border: 1px solid rgba(128,128,128,0.35); }
  .sw-chip--txt { display: grid; place-items: center; font: 600 12px var(--mono); }
  .sw-meta { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; }
  .sw-meta b { font-size: 0.74rem; font-weight: 600; }
  .sw-meta code { font-size: 0.68rem; color: var(--t-ink2); }
  .ratio { font: 500 0.66rem var(--mono); color: var(--t-ink2); }
  .ratio--mal { color: #ff6b6b; font-weight: 700; }

  .tabla { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 0.84rem; }
  .tabla th { text-align: left; font-size: 0.7rem; text-transform: uppercase;
              letter-spacing: 0.08em; color: var(--pg-ink2); font-weight: 600;
              padding: 8px 10px; border-bottom: 1px solid var(--pg-line); }
  .tabla td { padding: 7px 10px; border-bottom: 1px solid var(--pg-line);
              font-variant-numeric: tabular-nums; }
  .tabla td.mal { color: var(--pg-mal); font-weight: 600; }
  .dot { display: inline-block; width: 13px; height: 13px; border-radius: 4px;
         vertical-align: -2px; margin-right: 6px;
         border: 1px solid rgba(128,128,128,0.35); }

  .paleta { margin: 0 0 16px; }
  .paleta-nom { display: flex; gap: 8px; align-items: baseline; margin-bottom: 5px; }
  .rampa { display: flex; border-radius: 6px; overflow: hidden;
           border: 1px solid var(--pg-line); height: 30px; }
  .rampa i { flex: 1; min-width: 12px; }
  .rampa--txt { height: auto; padding: 5px 8px; gap: 10px; align-items: center; }
  .rampa--txt b { font: 700 12px var(--mono); }
  .gemelos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
  .gemelo { display: flex; flex-direction: column; gap: 3px; }
  .gemelo .sub { font-size: 0.68rem; }

  .scroll-x { overflow-x: auto; }
  @media (max-width: 640px) { .gemelos { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">

<h1>Temas y paletas de AmoxSQL</h1>
<p class="lede">Todos los colores que usa la aplicación, leídos del código y medidos. Diez temas,
veinte acentos y veinticuatro paletas de gráficos.</p>

<div class="meta">
  Generado el ${fecha} desde <code>client/src/index.css</code> y
  <code>client/src/components/DataVisualizer/constants.js</code>.<br>
  Para regenerar: <code>node scripts/genThemeReference.cjs</code> —
  no edites este HTML a mano, se sobrescribe.
</div>

<h2>Cómo está montado</h2>
<p>Los tokens se aplican en cinco capas, y el orden importa. <code>App.jsx</code> pone dos
clases en <code>&lt;body&gt;</code>: la del modo (<code>mode-light</code> / <code>mode-dark</code>)
y la del tema (<code>theme-mist</code>…; el oscuro por defecto no lleva ninguna).</p>

<div class="reglas">
  <div class="regla"><b>1 · <code>:root</code></b><p>El contrato de tokens con los valores oscuros por defecto. Solo literales.</p></div>
  <div class="regla"><b>2 · <code>body</code></b><p>Todo lo derivado: el acento compuesto, los alias <code>--color-*</code> y los alias legacy.</p></div>
  <div class="regla"><b>3 · <code>.mode-light</code></b><p>Lo que solo depende de claro-vs-oscuro: velo, sombras, estados, iconos, rampa de acentos clara.</p></div>
  <div class="regla"><b>4 · <code>.theme-*</code></b><p>Superficies, texto, bordes y, si tiene paleta propia, sintaxis y feedback.</p></div>
  <div class="regla"><b>5 · <code>.accent-*</code></b><p>Solo <code>--accent-primary</code>. Los lavados se derivan solos.</p></div>
</div>

<h2>Las dos reglas que cuestan caro</h2>
<div class="reglas">
  <div class="regla">
    <b>Nada de <code>var()</code> dentro de <code>:root</code></b>
    <p>Una propiedad con <code>var()</code> resuelve en el elemento donde se declara.
    <code>:root</code> es <code>&lt;html&gt;</code> y las clases de tema van en <code>&lt;body&gt;</code>,
    así que lo que se declare arriba se congela en los valores por defecto. Ha mordido cuatro veces.
    El verificador lo comprueba.</p>
  </div>
  <div class="regla">
    <b>El claro no es el oscuro más flojo</b>
    <p>Sobre fondo oscuro un efecto funciona añadiendo luz y sobra margen. Sobre papel ese margen no
    existe: copiar la receta con el valor bajado no da sutileza, da nada. Sombras, velo y estados
    necesitan ir hacia arriba, no hacia abajo.</p>
  </div>
</div>

<h2>Los diez temas</h2>
<nav class="indice">${ORDEN.map(t => `<a href="#tema-${t}">${esc(ETIQUETAS[t])}</a>`).join('')}</nav>
<p>Cada bloque se pinta sobre el lienzo de su propio tema, porque un color solo se puede juzgar en su
sitio. Los números son contraste WCAG 2.x; en rojo, lo que baja del piso.</p>
${ORDEN.map(seccionTema).join('')}

<h2>La rampa de acentos</h2>
<p>Los mismos tonos en los dos modos, pero no la misma luminosidad. En claro está clavada en
L 0.47–0.52 porque <code>--accent-primary</code> se usa a la vez como texto (146 sitios) y como
relleno con texto blanco encima (100), y esas dos exigencias solo se cumplen juntas en esa banda.
El precio es que en claro la rampa deja de ser de luminosidad y pasa a ser de <b>tono</b>: los
cuatro pasos turquesa quedan casi idénticos.</p>
<p>En oscuro, el extremo profundo (<code>linear</code>, <code>amox-9</code>, <code>amox-10</code>)
queda por debajo de 4.5 usado como texto. Está medido y sin decidir: subirlo cambiaría el aspecto de
los siete temas oscuros a la vez.</p>
<div class="scroll-x">${seccionAcentos()}</div>

<h2>Paletas de gráficos</h2>
<p>Las de <code>DataVisualizer/constants.js</code>. Las que tienen <b>gemelos de leyenda</b> llevan
un segundo juego de colores solo para el TEXTO que etiqueta cada serie: el tono que funciona como
mancha de área no funciona como letra, así que cada categórica tiene su versión oscurecida para
papel y aclarada para fondo oscuro.</p>
${seccionPaletas({ paletas, pares })}

<h2>Pisos de contraste</h2>
<p>Lo que comprueba <code>node scripts/checkThemeContrast.cjs --all</code>.</p>
<table class="tabla">
  <thead><tr><th>familia</th><th>piso</th></tr></thead>
  <tbody>
    <tr><td>text-primary / secondary</td><td>≥10:1 / ≥5.5:1</td></tr>
    <tr><td>text-tertiary</td><td>≥4.5:1 en claro, ≥3:1 en oscuro</td></tr>
    <tr><td>text-disabled</td><td>≥3:1 (solo se mide en claro)</td></tr>
    <tr><td>bordes subtle / default / strong</td><td>1.08–1.30 / 1.20–1.55 / 1.45–2.10</td></tr>
    <tr><td>escalón base→raised</td><td>≥1.02</td></tr>
    <tr><td>sintaxis sobre el editor</td><td>≥4.5:1 (<code>comment</code> ≥3.0 claro, ≥2.4 oscuro)</td></tr>
    <tr><td>tipos de dato, textos de feedback</td><td>≥4.5:1</td></tr>
    <tr><td>iconos de archivo</td><td>≥3:1</td></tr>
    <tr><td>acento, como texto y con su texto encima</td><td>≥4.5:1 — fallo en claro, aviso en oscuro</td></tr>
    <tr><td>hover / active vs raised</td><td>1.09–1.22 / 1.18–1.40</td></tr>
    <tr><td>velo del diálogo (solo claro)</td><td>diálogo ≥2.5:1 sobre el lienzo velado</td></tr>
  </tbody>
</table>

<h2>Para seguir</h2>
<p><code>docs/dev/guia_estilos.md</code> — cómo escribir CSS en este proyecto.<br>
<code>docs/dev/auditoria_temas_2026-09.md</code> — el estado medido y el plan por fases.<br>
<code>docs/dev/aprendizajes_temas_claros.md</code> — por qué el claro no es el oscuro con menos.</p>

</div>
</body>
</html>
`;
}

fs.writeFileSync(SALIDA, pagina(), 'utf8');
console.log('escrito ' + path.relative(RAIZ, SALIDA));
