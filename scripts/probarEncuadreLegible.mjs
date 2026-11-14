// @suite rapida
/**
 * El encuadre inicial de un lienzo se puede leer (6.0, M10 · T1/T6/T9).
 * client/src/utils/encuadreLegible.js, la usan Data Flow, el diagrama y el Canvas.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { encuadreLegible, ZOOM_LEGIBLE } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'utils', 'encuadreLegible.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };
const cerca = (a, b) => Math.abs(a - b) < 1e-6;

console.log('— cabe a un zoom legible: se encuadra todo, centrado');
let v = encuadreLegible({ x: 0, y: 0, width: 400, height: 200 }, 800, 600, { relleno: 0 });
bien('zoom 1 (el máximo) y centrado', v.zoom === 1 && !v.anclado && cerca(v.x, 200) && cerca(v.y, 200), v);

console.log('— no cabe: zoom legible y anclado al principio');
// El flujo de ejemplo: ~2 040 × 300 en un lienzo de 675 × 680 → «que quepa» daba 0,33
const flujo = { x: 100, y: 50, width: 2040, height: 300 };
v = encuadreLegible(flujo, 675, 680, { relleno: 0.2 });
bien(`zoom ${ZOOM_LEGIBLE}, no 0,33`, v.zoom === ZOOM_LEGIBLE && v.anclado, v);
bien('el primer paso queda a 32 px del borde izquierdo', cerca(flujo.x * v.zoom + v.x, 32), v);
bien('cabe de alto: centrado en vertical', cerca(flujo.y * v.zoom + v.y + (flujo.height * v.zoom) / 2, 340), v);

v = encuadreLegible({ x: 0, y: 0, width: 3000, height: 3000 }, 800, 600);
bien('no cabe de alto: anclado arriba', v.anclado && cerca(v.y, 32), v);

console.log('— lo que tapa una paleta a la izquierda se descuenta');
v = encuadreLegible({ x: 0, y: 0, width: 3000, height: 200 }, 800, 600, { izquierda: 64 });
bien('el documento empieza después de la paleta', cerca(v.x, 64 + 32), v);
v = encuadreLegible({ x: 0, y: 0, width: 300, height: 200 }, 800, 600, { izquierda: 64, relleno: 0 });
bien('centrado en lo que queda libre', cerca(v.x + 150 * v.zoom, 64 + (800 - 64) / 2), v);

console.log('— sin nada que encuadrar');
bien('caja vacía → null', encuadreLegible({ x: 0, y: 0, width: 0, height: 0 }, 800, 600) === null);
bien('lienzo sin medir → null', encuadreLegible({ x: 0, y: 0, width: 10, height: 10 }, 0, 600) === null);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
