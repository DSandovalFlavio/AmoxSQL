// @suite rapida: no carga el motor; corre en cada PR (pnpm test:rapidas).
/**
 * Lo que el servidor cuenta de sí mismo, con nivel (6.0, M7): `server/registrador.js`.
 *
 *     node scripts/probarRegistrador.mjs
 *
 * `AMOXSQL_LOG` decide hasta dónde se escribe (error · aviso · info · depurar; info por
 * defecto, que es lo de siempre). Se lee en cada línea. Cada línea lleva hora y nivel,
 * y va por el `console.*` que haya en ese momento (el proceso principal lo calla cuando
 * corre una orden de la línea de comandos).
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const registrador = require(path.join(RAIZ, 'server/registrador.js'));
const original = { log: console.log, warn: console.warn, error: console.error };
const capturar = (fn) => {
    const lineas = [];
    console.log = (...a) => lineas.push(['log', a.join(' ')]);
    console.warn = (...a) => lineas.push(['warn', a.join(' ')]);
    console.error = (...a) => lineas.push(['error', a.join(' ')]);
    try { fn(); } finally { Object.assign(console, original); }
    return lineas;
};
const todas = () => { registrador.error('e'); registrador.aviso('a'); registrador.info('i'); registrador.depurar('d'); };

const casos = [
    [undefined, 'e,a,i'],
    ['', 'e,a,i'],
    ['error', 'e'],
    ['aviso', 'e,a'],
    ['INFO', 'e,a,i'],
    ['depurar', 'e,a,i,d'],
    ['algo raro', 'e,a,i'],
];
for (const [nivel, esperado] of casos) {
    if (nivel === undefined) delete process.env.AMOXSQL_LOG; else process.env.AMOXSQL_LOG = nivel;
    const l = capturar(todas);
    const salio = l.map(([, t]) => t.slice(-1)).join(',');
    comprobar(`AMOXSQL_LOG=${nivel === undefined ? '(sin poner)' : JSON.stringify(nivel)} → ${esperado}`, salio === esperado, salio);
}

delete process.env.AMOXSQL_LOG;
const l = capturar(todas);
comprobar('error va a stderr, aviso a warn, info a stdout', l[0][0] === 'error' && l[1][0] === 'warn' && l[2][0] === 'log', JSON.stringify(l));
comprobar('cada línea lleva hora y nivel', /^\d\d:\d\d:\d\d\.\d{3} ERROR e$/.test(l[0][1]) && /^\d\d:\d\d:\d\d\.\d{3} info  i$/.test(l[2][1]), JSON.stringify(l));
// Callado como lo calla el proceso principal con una orden de la línea de comandos.
console.log = () => {};
let fuera = 0;
const antes = process.stdout.write;
process.stdout.write = (...a) => { fuera++; return antes.apply(process.stdout, a); };
registrador.info('no debe salir');
process.stdout.write = antes;
Object.assign(console, original);
comprobar('respeta un console.log callado después de cargarse', fuera === 0);

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
