// @suite rapida
/**
 * Los eventos de ventana están en client/src/eventos.js (6.0, M8 · E6).
 *
 *   - todo `amox_*` que el cliente emite o escucha está en el catálogo;
 *   - todo lo del catálogo lo usa alguien todavía;
 *   - `emitir` / `escuchar` llevan el detalle de un lado a otro y se pueden soltar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(RAIZ, 'client', 'src');
let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

const { EVENTOS, emitir, escuchar } = await import(pathToFileURL(path.join(SRC, 'eventos.js')).href);

const archivos = [];
(function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if (/\.(jsx?|mjs)$/.test(e.name) && p !== path.join(SRC, 'eventos.js')) archivos.push(p);
    }
})(SRC);

// Nombres que el código emite o escucha: literales en dispatch/listen/emitir/escuchar,
// y constantes `export const X = 'amox_…'` (ATAJO_DE_EDITOR) o `legacyReplayEvent: 'amox_…'`.
const usados = new Map();
const anotar = (n, f) => { if (!usados.has(n)) usados.set(n, new Set()); usados.get(n).add(path.relative(SRC, f)); };
const PATRONES = [
    /new (?:Custom)?Event\(\s*['"`](amox_\w+)['"`]/g,
    /(?:add|remove)EventListener\(\s*['"`](amox_\w+)['"`]/g,
    /\b(?:emitir|escuchar)\(\s*['"`](amox_\w+)['"`]/g,
    /legacyReplayEvent:\s*['"`](amox_\w+)['"`]/g,
    /export const [A-Z_]+ = ['"`](amox_\w+)['"`]/g,
];
for (const f of archivos) {
    const t = fs.readFileSync(f, 'utf8');
    for (const re of PATRONES) for (const m of t.matchAll(re)) anotar(m[1], f);
}

console.log('— el catálogo');
const fuera = [...usados.keys()].filter(n => !(n in EVENTOS));
bien('todo evento que se usa está en eventos.js', !fuera.length, fuera.map(n => `${n} (${[...usados.get(n)].join(', ')})`));
const sinUso = Object.keys(EVENTOS).filter(n => !usados.has(n));
bien('todo lo de eventos.js lo usa alguien', !sinUso.length, sinUso);
bien('cada entrada dice qué lleva, quién emite y quién escucha',
    Object.values(EVENTOS).every(e => e.detalle && e.emite && e.escucha), Object.entries(EVENTOS).filter(([, e]) => !(e.detalle && e.emite && e.escucha)).map(([n]) => n));

console.log('— emitir y escuchar');
const oyentes = new Map();
globalThis.window = {
    addEventListener: (n, h) => { if (!oyentes.has(n)) oyentes.set(n, new Set()); oyentes.get(n).add(h); },
    removeEventListener: (n, h) => oyentes.get(n)?.delete(h),
    dispatchEvent: (e) => { for (const h of oyentes.get(e.type) || []) h(e); return true; },
};
const recibidos = [];
const soltar = escuchar('amox_abrir_ayuda', (detalle, e) => recibidos.push([detalle, e.type]));
emitir('amox_abrir_ayuda', 'storyflow');
bien('el detalle llega tal cual', recibidos.length === 1 && recibidos[0][0] === 'storyflow' && recibidos[0][1] === 'amox_abrir_ayuda', recibidos);
soltar();
emitir('amox_abrir_ayuda', 'dataflow');
bien('después de soltar, no llega', recibidos.length === 1, recibidos);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
