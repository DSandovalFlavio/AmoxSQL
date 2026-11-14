/**
 * Las lambdas con flecha → `lambda x: …` (6.0, Dec-67).
 *
 *     node scripts/probarLambdas.mjs
 *
 * `client/src/utils/lambdas.js` reescribe lo que DuckDB 2 ya no acepta y no toca el
 * JSON, los textos, los identificadores entre comillas ni los comentarios. Cada caso se
 * ejecuta con el motor: antes falla con «Deprecated lambda arrow», después corre y da
 * lo mismo que la versión escrita a mano.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { reescribirLambdas, esErrorDeFlecha } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/lambdas.js')).href);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const CASOS = [
    ['una', 'SELECT list_transform([1, 2, 3], x -> x + 1) AS l', 'SELECT list_transform([1, 2, 3], lambda x: x + 1) AS l'],
    ['dos parámetros', 'SELECT list_transform([10, 20], (x, i) -> x * i) AS l', 'SELECT list_transform([10, 20], lambda x, i: x * i) AS l'],
    ['anidadas', 'SELECT list_transform(list_filter([1, 2, 3, 4], x -> x % 2 = 0), y -> y * y) AS l', 'SELECT list_transform(list_filter([1, 2, 3, 4], lambda x: x % 2 = 0), lambda y: y * y) AS l'],
    ['sin espacios', 'SELECT list_filter([1,2,3],x->x>1) AS l', 'SELECT list_filter([1,2,3],lambda x:x>1) AS l'],
    ['reduce', 'SELECT list_reduce([1, 2, 3], (a, b) -> a + b) AS s', 'SELECT list_reduce([1, 2, 3], lambda a, b: a + b) AS s'],
    ['en varias líneas', 'SELECT list_transform(\n    [1, 2],\n    x ->\n        x * 10\n) AS l', 'SELECT list_transform(\n    [1, 2],\n    lambda x:\n        x * 10\n) AS l'],
];
const QUIETOS = [
    ['JSON con clave', `SELECT '{"a": {"b": 1}}'::JSON -> 'a' -> 'b' AS j`],
    ['JSON ->>', `SELECT '{"a": 1}'::JSON ->> 'a' AS j`],
    ['JSON por índice', `SELECT '[5, 6]'::JSON -> 0 AS j`],
    ['JSON con ruta', `SELECT '{"a": 1}'::JSON -> '$.a' AS j`],
    ['en un texto', `SELECT 'x -> x + 1' AS t`],
    ['en un comentario', `SELECT 1 AS n -- x -> x + 1\n/* (a, b) -> a */`],
    ['entre comillas dobles', `SELECT 1 AS "x -> y"`],
    ['ya nueva', 'SELECT list_transform([1], lambda x: x + 1) AS l'],
];

try {
    const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
    const con = await (await crearInstancia(':memory:')).connect();
    const correr = async (q) => JSON.stringify((await con.runAndReadAll(q)).getRowObjectsJson());

    console.log('\nlas que se reescriben');
    for (const [n, viejo, esperado] of CASOS) {
        const r = reescribirLambdas(viejo);
        comprobar(`${n}: el texto`, r.sql === esperado && r.cambios >= 1, JSON.stringify(r.sql));
        let antes = null;
        try { await correr(viejo); } catch (e) { antes = e.message; }
        comprobar(`${n}: antes, el error de la flecha`, esErrorDeFlecha(antes), antes);
        try { comprobar(`${n}: después corre y da lo mismo`, await correr(r.sql) === await correr(esperado)); }
        catch (e) { comprobar(`${n}: después corre`, false, e.message.split('\n')[0]); }
    }
    comprobar('cuenta las que cambió', reescribirLambdas(CASOS[2][1]).cambios === 2);

    console.log('\nlo que no se toca');
    for (const [n, q] of QUIETOS) {
        const r = reescribirLambdas(q);
        comprobar(`${n}: igual`, r.sql === q && r.cambios === 0, JSON.stringify(r.sql));
        try { await correr(q); comprobar(`${n}: y corre`, true); } catch (e) { comprobar(`${n}: y corre`, false, e.message.split('\n')[0]); }
    }
    comprobar('una mezcla: sólo la lambda', reescribirLambdas(`SELECT j -> 'a', list_transform(l, x -> x) FROM t`).sql === `SELECT j -> 'a', list_transform(l, lambda x: x) FROM t`);
    comprobar('el error de otra cosa no ofrece reescribir', !esErrorDeFlecha('Binder Error: column x not found'));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
