/**
 * El catálogo que nombran las vistas (5.12, fase 9).
 *
 *     node scripts/probarCatalogoPorArchivo.mjs
 *
 * El motor nombra el catálogo de un archivo por su nombre (`tienda.duckdb` → `tienda`)
 * y dbt guarda así sus vistas: `… FROM "tienda"."main"."stg_orders"`. Adjunta como
 * `user_db`, esas vistas no encontraban su catálogo. Ahora:
 *   - una base con vistas así se adjunta con su nombre, y las vistas se leen;
 *   - una base sin ellas sigue siendo `user_db`;
 *   - tras prestarla (dbt) y recuperarla, si dbt dejó vistas así, también.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-catalogo-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const unix = (p) => p.replace(/\\/g, '/');

/** Una base escrita como la deja quien la abre directo: el catálogo es el nombre del archivo. */
async function escribir(nombre, sqls) {
    const inst = await crearInstancia(':memory:');
    const con = await inst.connect();
    await con.run(`ATTACH '${unix(path.join(P, `${nombre}.duckdb`))}' AS ${nombre}`);
    for (const s of sqls) await con.run(s);
    await con.run(`DETACH ${nombre}`);
    con.closeSync(); inst.closeSync();
}

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const post = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });

    await escribir('tienda', [
        'CREATE TABLE tienda.main.pedidos AS SELECT 1 AS id, 10 AS importe',
        'CREATE VIEW tienda.main.stg AS SELECT * FROM "tienda"."main"."pedidos"',
        'CREATE VIEW tienda.main.mart AS SELECT sum(importe) AS total FROM tienda.main.stg',
    ]);
    await escribir('plana', ['CREATE TABLE plana.main.t AS SELECT 1 AS x', 'CREATE VIEW plana.main.v AS SELECT * FROM t']);

    console.log('\nal abrir');
    let h = await post('/api/db/connect', { path: 'tienda.duckdb' });
    comprobar('se abre', !h.error, JSON.stringify(h).slice(0, 200));
    let q = await sql('SELECT total FROM mart');
    comprobar('sus vistas, que nombran «tienda», se leen', q.data?.[0]?.total == 10, JSON.stringify(q).slice(0, 200));
    q = await sql('SELECT current_database() AS c');
    comprobar('  porque se adjuntó como «tienda»', q.data?.[0]?.c === 'tienda', JSON.stringify(q.data));
    q = await sql('SELECT count(*) AS n FROM pedidos');
    comprobar('  y los nombres sin catálogo siguen funcionando', q.data?.[0]?.n == 1);

    h = await post('/api/db/connect', { path: 'plana.duckdb' });
    q = await sql('SELECT current_database() AS c, (SELECT count(*) FROM v) AS n');
    comprobar('una base sin vistas así sigue siendo user_db', q.data?.[0]?.c === 'user_db' && q.data[0].n == 1, JSON.stringify(q));

    console.log('\ntras dbt');
    await escribir('tarde', ['CREATE TABLE tarde.main.t AS SELECT 7 AS x']);
    await post('/api/db/connect', { path: 'tarde.duckdb' });
    q = await sql('SELECT current_database() AS c');
    comprobar('sin vistas todavía: user_db', q.data?.[0]?.c === 'user_db');
    await dbManager.prestar('prueba');
    await escribir('tarde', ['CREATE VIEW tarde.main.v AS SELECT x FROM "tarde"."main"."t"']);
    await dbManager.recuperar();
    q = await sql('SELECT x FROM v');
    comprobar('dbt dejó una vista que nombra «tarde»: al recuperar, se lee', q.data?.[0]?.x == 7, JSON.stringify(q).slice(0, 200));

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
