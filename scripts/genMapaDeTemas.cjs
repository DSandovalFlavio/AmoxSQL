#!/usr/bin/env node
/**
 * Genera `docs/dev/mapa_temas.html`: dónde cae cada tema en el espacio de color.
 *
 * `temas.html` enseña CADA tema por dentro —sus tokens, uno a uno— y sirve para
 * trabajar dentro de un tema. Esto es la otra pregunta: **cómo se reparten los
 * temas entre ellos**, qué zonas están cubiertas dos veces y cuáles no lo está
 * ninguna. Es el mapa, no el plano de la casa.
 *
 * Se GENERA por el mismo motivo que el otro: lee `client/src/index.css` con el
 * resolvedor compartido (lib/themeTokens.cjs), así que no puede desfasarse de lo
 * que la aplicación pinta de verdad. Un mapa de color escrito a mano miente en
 * la primera calibración que nadie copia.
 *
 * Uso:  node scripts/genMapaDeTemas.cjs
 */
const fs = require('fs');
const path = require('path');
const T = require('./lib/themeTokens.cjs');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'docs', 'dev', 'mapa_temas.html');

const ETIQUETAS = {
    deepdark: 'Deep Dark', amoxdark: 'Amox Dark', obsidian: 'Obsidian',
    nord: 'Nord Dark', islands: 'Dark Islands', ember: 'Ember',
    sterlingdeep: 'Sterling Deep', amoxlight: 'Amox Light',
    sterlinglight: 'Sterling Light', mist: 'Mist',
};
const OSCUROS = ['deepdark', 'amoxdark', 'obsidian', 'nord', 'islands', 'ember', 'sterlingdeep'];
const CLAROS = ['amoxlight', 'sterlinglight', 'mist'];

// ── Color ───────────────────────────────────────────────────────────────────
// OKLCH es el espacio en el que este proyecto ya piensa el color: los acentos se
// declaran con `--acc-l/c/h`. Usarlo aquí también evita comparar peras con
// manzanas — en OKLCH, «igual de claro» quiere decir igual de claro para el ojo.

function rgbToOklch({ r, g, b }) {
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const R = lin(r); const G = lin(g); const B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const C = Math.sqrt(A * A + Bb * Bb);
    let H = (Math.atan2(Bb, A) * 180) / Math.PI;
    if (H < 0) H += 360;
    return { L, C, H };
}

/**
 * La familia de tinte, y **los cortes van en los huecos**.
 *
 * Ordenados por croma, los oscuros no se reparten liso: se agrupan solos.
 *
 *     0,0000  0,0027  0,0066 │ 0,0120  0,0145 0,0148 0,0154 │ 0,0241
 *     ───────sin tinte───────┤ ────────────azules───────────┤ violeta
 *
 * Los dos saltos grandes —de 0,0066 a 0,0120 y de 0,0154 a 0,0241— son donde el
 * ojo también ve el cambio. Los umbrales se ponen AHÍ, en el vacío, y no en un
 * número redondo: la primera versión cortaba en 0,012 y Obsidian mide 0,01199,
 * así que su categoría la decidía el quinto decimal. Eso no es una familia, es
 * un accidente — y se notaba, porque Obsidian se ve azul (8/10/15: casi el doble
 * de azul que de rojo, y cuatro veces el croma de Onyx).
 *
 * El croma decide si hay tinte; el TONO decide cuál. Las dos cosas hacen falta:
 * una versión anterior agrupaba sólo por croma —cuando todos los temas cabían en
 * 36° de tono y daba igual— y en cuanto entró un tema cálido lo metió con los
 * azules por tener un croma parecido. El croma dice «cuánto», no «qué».
 */
function familia({ C, H }) {
    if (C < 0.010) return { id: 'neutro', nombre: 'Sin tinte', orden: 0 };
    if (H >= 20 && H < 100) return { id: 'calido', nombre: 'Cálidos', orden: 1 };
    if (H >= 100 && H < 200) return { id: 'verde', nombre: 'Verdes', orden: 2 };
    if (H >= 200 && H < 275) return { id: 'azul', nombre: 'Azules', orden: 3 };
    if (H >= 275 && H < 330) return { id: 'violeta', nombre: 'Violetas', orden: 4 };
    return { id: 'rojo', nombre: 'Rojos y magentas', orden: 5 };
}

const hex = (t, tok) => T.toHex(T.col(t, tok));

function medir(t) {
    const base = T.col(t, '--surface-base');
    const ok = rgbToOklch(base);
    return {
        id: t,
        nombre: ETIQUETAS[t] || t,
        base: T.toHex(base),
        inset: hex(t, '--surface-inset'),
        raised: hex(t, '--surface-raised'),
        overlay: hex(t, '--surface-overlay'),
        texto: hex(t, '--text-primary'),
        textoSec: hex(t, '--text-secondary'),
        L: ok.L, C: ok.C, H: ok.H,
        familia: familia(ok),
        contraste: T.contrast(T.col(t, '--text-primary'), base),
        // Cuánto sube el panel sobre el fondo, en luminancia WCAG. Negativo
        // significa que el cromo se retira hacia abajo, como en Mist.
        salto: (T.luminance(T.col(t, '--surface-raised')) - T.luminance(base)) * 100,
    };
}

const oscuros = OSCUROS.map(medir).sort((a, b) => a.L - b.L);
const claros = CLAROS.map(medir).sort((a, b) => a.L - b.L);

// ── Pintar ──────────────────────────────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const n2 = (x) => x.toFixed(2);
const n3 = (x) => x.toFixed(3);
const n4 = (x) => x.toFixed(4);

function columna(t) {
    const capas = [
        ['overlay', t.overlay], ['raised', t.raised], ['base', t.base], ['inset', t.inset],
    ];
    return `
      <div class="col">
        <div class="col-cab">
          <div class="col-nom">${esc(t.nombre)}</div>
          <div class="col-num"><b>L ${n3(t.L)}</b> · C ${n3(t.C)} · H ${Math.round(t.H)}°</div>
        </div>
        <div class="rampa">
          ${capas.map(([nom, c]) => `
            <div class="capa" style="background:${c}">
              <span class="capa-n">${nom}</span>
              <span class="capa-h">${c}</span>
            </div>`).join('')}
        </div>
        <div class="muestra" style="background:${t.base}">
          <div style="color:${t.texto}">Texto principal</div>
          <div style="color:${t.textoSec}">y el secundario</div>
        </div>
        <div class="col-pie">
          contraste ${n2(t.contraste)} · panel ${t.salto >= 0 ? '+' : ''}${n2(t.salto)}
        </div>
      </div>`;
}

function banda(titulo, nota, temas) {
    if (!temas.length) return '';
    return `
    <section class="banda">
      <h3>${esc(titulo)} <span class="cuantos">${temas.length}</span></h3>
      ${nota ? `<p class="nota">${nota}</p>` : ''}
      <div class="cols">${temas.map(columna).join('')}</div>
    </section>`;
}

/** Un eje cualquiera, con los huecos a la vista. */
function regla(temas, min, max, valor) {
    const pos = (v) => ((v - min) / (max - min)) * 100;
    return `
    <div class="regla">
      ${temas.map((t) => `
        <div class="marca" style="left:${pos(valor(t)).toFixed(1)}%">
          <div class="punto" style="background:${t.base}"></div>
          <div class="marca-n">${esc(t.nombre)}</div>
          <div class="marca-l">${valor(t) < 0.1 ? n4(valor(t)) : n3(valor(t))}</div>
        </div>`).join('')}
    </div>`;
}

const familiasDe = (temas) => {
    const m = new Map();
    for (const t of temas) {
        if (!m.has(t.familia.id)) m.set(t.familia.id, { ...t.familia, temas: [] });
        m.get(t.familia.id).temas.push(t);
    }
    return [...m.values()].sort((a, b) => a.orden - b.orden);
};

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mapa de temas de AmoxSQL</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 28px 64px;
    background: #0b0c0e; color: #e7e9ee;
    font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -.02em; }
  h2 { font-size: 17px; margin: 40px 0 6px; letter-spacing: -.01em; }
  h3 { font-size: 14px; margin: 26px 0 4px; font-weight: 650; }
  .sub { color: #8f94a3; margin: 0 0 24px; max-width: 78ch; }
  .nota { color: #8f94a3; margin: 0 0 12px; font-size: 12.5px; max-width: 80ch; }
  .cuantos {
    font-size: 11px; color: #8f94a3; font-weight: 500;
    border: 1px solid #23262e; border-radius: 999px; padding: 1px 7px; margin-left: 4px;
  }
  .cols { display: flex; gap: 10px; flex-wrap: wrap; }
  .col { width: 168px; border: 1px solid #23262e; border-radius: 10px; overflow: hidden; background: #101216; }
  .col-cab { padding: 9px 10px 8px; border-bottom: 1px solid #23262e; }
  .col-nom { font-weight: 650; font-size: 13px; }
  .col-num { font-size: 10.5px; color: #8f94a3; font-family: ui-monospace, monospace; margin-top: 2px; }
  .rampa { display: flex; flex-direction: column; }
  .capa {
    height: 44px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 9px; font-family: ui-monospace, monospace; font-size: 10px;
  }
  .capa-n { color: rgba(255,255,255,.42); }
  .capa-h { color: rgba(255,255,255,.34); }
  .muestra { padding: 10px; font-size: 12px; line-height: 1.5; }
  .col-pie {
    padding: 7px 10px; border-top: 1px solid #23262e;
    font-size: 10.5px; color: #8f94a3; font-family: ui-monospace, monospace;
  }
  .regla {
    position: relative; height: 92px; margin: 18px 0 8px;
    border-top: 1px solid #23262e;
  }
  .marca { position: absolute; top: 0; transform: translateX(-50%); text-align: center; width: 92px; }
  .punto {
    width: 24px; height: 24px; border-radius: 50%; margin: 10px auto 5px;
    border: 1px solid rgba(255,255,255,.22);
  }
  .marca-n { font-size: 10.5px; line-height: 1.25; }
  .marca-l { font-size: 10px; color: #8f94a3; font-family: ui-monospace, monospace; }
  .banda { margin-bottom: 12px; }
  footer { margin-top: 48px; color: #6a6f7d; font-size: 12px; border-top: 1px solid #23262e; padding-top: 14px; }
  code { font-family: ui-monospace, monospace; background: #171a20; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>

<h1>Mapa de temas</h1>
<p class="sub">
  Dónde cae cada tema en el espacio de color, para poder ver qué zonas están
  cubiertas dos veces y cuáles no lo está ninguna. <b>L</b> es la claridad en
  OKLCH —el mismo espacio en el que este proyecto declara los acentos—, <b>C</b>
  el croma (0 = gris perfecto) y <b>H</b> el tono. Generado desde
  <code>client/src/index.css</code>; si cambia un token, cambia esto.
</p>

<h2>El eje de intensidad — los oscuros</h2>
<p class="nota">De más oscuro a menos. Los huecos entre puntos son huecos de verdad: zonas donde no hay ningún tema. Los ocho caben en <b>0,12 de claridad</b>.</p>
${regla(oscuros, Math.min(...oscuros.map((t) => t.L)), Math.max(...oscuros.map((t) => t.L)), (t) => t.L)}

<h2>El eje de tinte — cuánto color tiene el fondo</h2>
<p class="nota">
  Croma 0 es gris perfecto. Aquí los temas no se reparten liso: <b>se agrupan solos</b>,
  con dos saltos claros. Por eso los cortes de familia van en esos dos vacíos y no
  en un número redondo.
</p>
${regla([...oscuros].sort((a, b) => a.C - b.C), 0, Math.max(...oscuros.map((t) => t.C)), (t) => t.C)}

<h2>Por familia de tinte, y dentro de cada una por intensidad</h2>
${familiasDe(oscuros).map((f) => banda(
    f.nombre,
    f.id === 'neutro'
        ? 'Los tres canales casi iguales. Es la familia donde lo único con color en pantalla son los datos.'
        : f.id === 'calido'
            ? 'El otro lado del círculo. Durante diez temas aquí no hubo nada: toda la aplicación era fría.'
            : f.id === 'violeta'
                ? 'Más croma que los azules y un tono que no comparte con nadie: no es «un azul más oscuro», es otro color.'
                : null,
    f.temas,
)).join('')}

<h2>Los claros</h2>
<p class="nota">Van aparte porque la pregunta es otra: aquí no compiten por oscuridad, compiten por temperatura.</p>
${familiasDe(claros).map((f) => banda(f.nombre, null, f.temas)).join('')}

<footer>
  Generado por <code>scripts/genMapaDeTemas.cjs</code> · ${new Date().toISOString().slice(0, 10)}
</footer>

</body>
</html>`;

fs.writeFileSync(SALIDA, html, 'utf8');
console.log('escrito', path.relative(RAIZ, SALIDA));
