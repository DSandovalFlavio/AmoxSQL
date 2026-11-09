/**
 * Un lago DuckLake de la 5.x en la 6.0.
 *
 *     node scripts/probarLagoDeLaCinco.mjs
 *
 * Comprobado en la fase 0 de la 6.0: DuckDB 2 abre y lee un lago creado con DuckDB 1.5
 * (versiones, «como estaba») sin cambiarlo; la PRIMERA escritura pasa su catálogo al
 * formato de DuckDB 2 y desde entonces la 5.x ya no lo abre. AmoxSQL:
 *   - lee el formato de la cabecera (`lago.formatoDelArchivo`), sin abrirlo;
 *   - al abrir un lago así lo dice (`/api/db/connect` → `aviso`), en sólo lectura no;
 *   - lo lee, con sus versiones, como antes;
 *   - y después de escribir en él, ya no avisa.
 * El lago de `scripts/fixtures/motor/lago_v15/` lo creó DuckDB 1.5.6 (100 filas, una
 * actualización: 3 versiones).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-lago5-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.cpSync(path.join(RAIZ, 'scripts/fixtures/motor/lago_v15'), P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

try {
    const lago = require(path.join(RAIZ, 'server/lago.js'));
    const archivo = path.join(P, 'lago.ducklake');
    console.log('\nel formato, sin abrirlo');
    comprobar('el lago de la 5.x tiene formato de DuckDB 1', lago.formatoDelArchivo(archivo) < lago.FORMATO_DE_DUCKDB_2, String(lago.formatoDelArchivo(archivo)));
    comprobar('una base creada por DuckDB 2 tiene el suyo', lago.formatoDelArchivo(path.join(RAIZ, 'scripts/fixtures/motor/creada_con_duckdb_2.duckdb')) === lago.FORMATO_DE_DUCKDB_2);
    comprobar('lo que no es una base: null', lago.formatoDelArchivo(path.join(RAIZ, 'package.json')) === null && lago.formatoDelArchivo(path.join(TMP, 'no-existe')) === null);
    comprobar('un lago con catálogo SQLite no avisa (no depende del motor)', lago.avisoDeFormato(path.join(P, 'x.ducklake.sqlite')) === null);

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
    const get = pedir('GET'), post = pedir('POST');
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });

    console.log('\nabrirlo en sólo lectura');
    let h = await post('/api/db/connect', { path: 'lago.ducklake', readOnly: true });
    comprobar('se abre y no avisa (no se va a escribir)', h.success && !h.aviso, JSON.stringify(h));
    let q = await sql('SELECT count(*) AS n, sum(v) AS s FROM ventas');
    comprobar('  y se lee', Number(q.data?.[0]?.n) === 100 && Number(q.data[0].s) === 9810, JSON.stringify(q).slice(0, 200));
    await post('/api/db/close', {});

    console.log('\nabrirlo para trabajar');
    h = await post('/api/db/connect', { path: 'lago.ducklake' });
    comprobar('avisa, en palabras', h.success && /was made with AmoxSQL 5/.test(h.aviso || '') && /the first change you make updates it/.test(h.aviso || ''), JSON.stringify(h));
    const vs = await get('/api/lago/versiones');
    const lista = vs.versiones || vs;
    comprobar('sus versiones se leen como antes', Array.isArray(lista) && lista.length >= 3, JSON.stringify(vs).slice(0, 200));
    comprobar('  y abrirlo no lo cambió', lago.formatoDelArchivo(archivo) < lago.FORMATO_DE_DUCKDB_2, String(lago.formatoDelArchivo(archivo)));

    console.log('\ndespués de escribir');
    q = await sql('INSERT INTO ventas VALUES (1000, 1)');
    comprobar('se escribe', !q.error, JSON.stringify(q).slice(0, 200));
    await post('/api/db/close', {});
    comprobar('el catálogo quedó en el formato de DuckDB 2', lago.formatoDelArchivo(archivo) === lago.FORMATO_DE_DUCKDB_2, String(lago.formatoDelArchivo(archivo)));
    h = await post('/api/db/connect', { path: 'lago.ducklake' });
    comprobar('y ya no avisa', h.success && !h.aviso, JSON.stringify(h));
    q = await sql('SELECT count(*) AS n FROM ventas');
    comprobar('  con la fila nueva', Number(q.data?.[0]?.n) === 101, JSON.stringify(q).slice(0, 200));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
