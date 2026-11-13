// @suite rapida
/**
 * Los acentos (6.0, M9 · D2): los ocho «Vibrant» recorren el círculo cromático.
 *
 *   - cada acento del selector (accents.js) tiene su clase en oscuro y en claro;
 *   - cada id de antes de la 6.0 se traduce (theme.js → migrateAccent) a uno
 *     que existe, y uno vigente se queda como está;
 *   - los ocho «Vibrant» están a más de 25° de tono unos de otros.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { CSS } = require('./lib/themeTokens.cjs');
const { VIBRANT_ACCENTS, SOBER_ACCENTS, ACCENTS } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'accents.js')).href);
const { migrateAccent } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'theme.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

console.log('— cada acento tiene su clase');
const oscuro = (id) => id === 'cyan' || new RegExp(String.raw`(^|\n)\.accent-${id}\s*\{`).test(CSS);
const claro = (id) => id === 'cyan' || new RegExp(String.raw`\.mode-light\.accent-${id}\s*\{`).test(CSS);
bien('en oscuro', ACCENTS.every(a => oscuro(a.id)), ACCENTS.filter(a => !oscuro(a.id)).map(a => a.id));
bien('en claro', ACCENTS.every(a => claro(a.id)), ACCENTS.filter(a => !claro(a.id)).map(a => a.id));
bien('ocho vivos y seis sobrios', VIBRANT_ACCENTS.length === 8 && SOBER_ACCENTS.length === 6);

console.log('— los ids de antes');
const viejos = ['amox-2', 'amox-3', 'amox-4', 'amox-5', 'amox-6', 'amox-7', 'amox-8', 'amox-9', 'amox-10', 'linear', 'islands'];
const ids = new Set(ACCENTS.map(a => a.id));
const sinDestino = viejos.filter(v => !ids.has(migrateAccent(v)));
bien('cada id viejo va a uno que existe', !sinDestino.length, sinDestino);
bien('un id vigente no cambia', ACCENTS.every(a => migrateAccent(a.id) === a.id));
bien('sin nada guardado, cian', migrateAccent(null) === 'cyan' && migrateAccent('') === 'cyan');
const conClaseVieja = viejos.filter(v => new RegExp(String.raw`\.accent-${v}\s*\{`).test(CSS));
bien('las clases viejas ya no están en el CSS', !conClaseVieja.length, conClaseVieja);

console.log('— el círculo cromático');
const tono = (id) => { const m = CSS.match(new RegExp(String.raw`(^|\n)\.accent-${id}\s*\{[^}]*--acc-h:\s*([\d.]+)`)); return m ? +m[2] : (id === 'cyan' ? 195 : null); };
const tonos = VIBRANT_ACCENTS.map(a => tono(a.id)).sort((a, b) => a - b);
const huecos = tonos.map((t, i) => (i ? t - tonos[i - 1] : t + 360 - tonos[tonos.length - 1]));
bien('los ocho a más de 25° unos de otros', tonos.every(t => t != null) && Math.min(...huecos) > 25, { tonos, huecos });

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
