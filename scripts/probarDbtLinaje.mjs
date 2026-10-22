/**
 * Resultados en el linaje (5.12, fase 4; I3).
 *
 *     node scripts/probarDbtLinaje.mjs
 *
 *   - cada ejecución acumula el último estado de cada nodo (un «run --select x» no
 *     borra lo que se sabía de los demás);
 *   - el linaje: estado, tiempo, filas (de las tablas, no de las vistas), los tests de
 *     cada modelo y los más lentos;
 *   - las filas que rompen un test (store_failures), como consulta para AmoxSQL;
 *   - por el servidor, con un dbt falso.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtlinaje-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });

const require = createRequire(import.meta.url);
const linaje = require(path.join(RAIZ, 'server/dbt/linaje.js'));
const { crearEntornoFalso } = require(path.join(RAIZ, 'scripts/ayudas/dbtFalso.cjs'));
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const P = path.join(TMP, 'tienda');
const esc = (rel, t) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
esc('dbt_project.yml', 'name: tienda\nprofile: tienda\n');
esc('profiles.yml', 'tienda:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: tienda.duckdb }\n');
const MANIFIESTO = {
    nodes: {
        'seed.tienda.ventas': { name: 'ventas', resource_type: 'seed', schema: 'main', database: 'tienda', original_file_path: 'seeds/ventas.csv', config: {} },
        'model.tienda.stg': { name: 'stg', resource_type: 'model', schema: 'main', database: 'tienda', original_file_path: 'models/stg.sql', config: { materialized: 'view' } },
        'model.tienda.fct': { name: 'fct', resource_type: 'model', schema: 'main', database: 'tienda', original_file_path: 'models/fct.sql', config: { materialized: 'table' } },
        'test.tienda.unique_stg_id.a1': { name: 'unique_stg_id', resource_type: 'test', attached_node: 'model.tienda.stg', depends_on: { nodes: ['model.tienda.stg'] }, database: 'tienda', relation_name: '"tienda"."main_dbt_test__audit"."unique_stg_id"' },
        'test.tienda.not_null_stg_id.b2': { name: 'not_null_stg_id', resource_type: 'test', depends_on: { nodes: ['model.tienda.stg'] }, database: 'tienda' },
        'test.tienda.accepted_fct.c3': { name: 'accepted_fct', resource_type: 'test', attached_node: 'model.tienda.fct', database: 'tienda', relation_name: '"tienda"."main_dbt_test__audit"."accepted_fct"' },
    },
    sources: {}, macros: {},
};
esc('target/manifest.json', JSON.stringify(MANIFIESTO));
{
    const i = await DuckDBInstance.create(path.join(P, 'tienda.duckdb'));
    const c = await i.connect();
    await c.run("CREATE TABLE ventas AS SELECT * FROM range(5) t(id)");
    await c.run('CREATE VIEW stg AS SELECT * FROM ventas');
    await c.run('CREATE TABLE fct AS SELECT * FROM range(3) t(x)');
    await c.run('CREATE SCHEMA main_dbt_test__audit');
    await c.run('CREATE TABLE main_dbt_test__audit.unique_stg_id AS SELECT 1 AS id, 2 AS n_records');
    c.closeSync(); i.closeSync();
}
const nodo = (id, estado, segundos, extra = {}) => ({ id, estado, segundos, fallos: null, mensaje: null, ...extra });

try {
    console.log('\nacumular');
    linaje.acumular(P, { nodos: [nodo('seed.tienda.ventas', 'success', 0.2), nodo('model.tienda.stg', 'success', 0.3), nodo('model.tienda.fct', 'error', 2.5, { mensaje: 'Binder Error: no column x' }), nodo('test.tienda.unique_stg_id.a1', 'fail', 0.1, { fallos: 2 }), nodo('test.tienda.not_null_stg_id.b2', 'pass', 0.1)] }, { comando: 'dbt build' });
    linaje.acumular(P, { nodos: [nodo('model.tienda.fct', 'success', 1.4), nodo('test.tienda.accepted_fct.c3', 'warn', 0.1, { fallos: 1 })] }, { comando: 'dbt build --select fct' });
    const u = linaje.ultimos(P);
    comprobar('la segunda ejecución actualiza fct sin borrar a los demás', u.nodos['model.tienda.fct'].estado === 'success' && u.nodos['model.tienda.stg'].estado === 'success' && u.nodos['model.tienda.fct'].comando === 'dbt build --select fct');

    console.log('\nlo que pinta el linaje');
    let l = await linaje.paraElLinaje(P);
    comprobar('estado y tiempo por nodo', l.nodos['model.tienda.fct'].estado === 'success' && l.nodos['model.tienda.fct'].segundos === 1.4);
    comprobar('las filas de las tablas (y de la semilla), sin la base adjunta', l.nodos['model.tienda.fct'].filas === 3 && l.nodos['seed.tienda.ventas'].filas === 5, JSON.stringify(l.nodos));
    comprobar('una vista no se cuenta (sería correrla)', l.nodos['model.tienda.stg'].filas === undefined);
    comprobar('los tests de stg: 2, uno falla; su tabla de fallos se puede ver', l.tests['model.tienda.stg'].total === 2 && l.tests['model.tienda.stg'].fallan === 1 && l.tests['model.tienda.stg'].lista.find(x => x.nombre === 'unique_stg_id').filas === true && l.tests['model.tienda.stg'].lista.find(x => x.nombre === 'not_null_stg_id').filas === false, JSON.stringify(l.tests['model.tienda.stg']));
    comprobar('el de fct, en warn', l.tests['model.tienda.fct'].avisan === 1);
    comprobar('los lentos (más de 1 s)', JSON.stringify(l.lentos) === '["model.tienda.fct"]', JSON.stringify(l.lentos));
    const w = await DuckDBInstance.create(path.join(P, 'tienda.duckdb'));
    w.closeSync();
    comprobar('contar no deja la base abierta (dbt la puede escribir)', true);

    console.log('\npor el servidor');
    const FALSO = crearEntornoFalso(TMP, `
const fs = require('fs');
fs.mkdirSync('target', { recursive: true });
fs.writeFileSync('target/run_results.json', JSON.stringify({ metadata: { generated_at: new Date().toISOString() }, results: [{ unique_id: 'model.tienda.stg', status: 'error', execution_time: 0.4, message: 'Parser Error en stg' }] }));
console.log('Running with dbt=1.12.6'); process.exit(1);
`);
    esc('.amoxsql/project.json', JSON.stringify({ dbt: { entorno: { tipo: 'python', ruta: FALSO.carpeta } } }));
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const u2 = (p) => `http://localhost:${port}${p}`;
    const post = (p, b) => fetch(u2(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = (p) => fetch(u2(p)).then(r => r.json());
    await post('/api/project/open', { path: P });
    await fetch(u2('/api/dbt/execute'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'dbt run --select stg' }) }).then(r => r.text());
    l = await get('/api/dbt/linaje/resultados');
    comprobar('una ejecución desde AmoxSQL se acumula: stg en error, con su mensaje; fct sigue como estaba', l.nodos['model.tienda.stg'].estado === 'error' && /Parser Error en stg/.test(l.nodos['model.tienda.stg'].mensaje) && l.nodos['model.tienda.fct'].estado === 'success', JSON.stringify(l.nodos));
    let h = await post('/api/dbt/linaje/filas-de-test', { test: 'test.tienda.unique_stg_id.a1' });
    comprobar('las filas de un test que falla: la consulta, con la base adjunta en sólo lectura', h.sql === 'select * from "tienda"."main_dbt_test__audit"."unique_stg_id"', JSON.stringify(h));
    const q = await post('/api/query', { query: h.sql });
    comprobar('  y corre en AmoxSQL', q.data?.[0]?.n_records === 2, JSON.stringify(q).slice(0, 200));
    await post('/api/db/connect', { path: 'tienda.duckdb' });
    h = await post('/api/dbt/linaje/filas-de-test', { test: 'test.tienda.unique_stg_id.a1' });
    comprobar('con la base del proyecto adjunta: por user_db', h.sql === 'select * from "user_db"."main_dbt_test__audit"."unique_stg_id"', h.sql);
    l = await get('/api/dbt/linaje/resultados');
    comprobar('y las filas se cuentan desde la base adjunta', l.nodos['model.tienda.fct'].filas === 3);
    h = await post('/api/dbt/linaje/filas-de-test', { test: 'test.tienda.not_null_stg_id.b2' });
    comprobar('un test sin store_failures dice cómo activarlo', h.status === 400 && /store_failures/.test(h.error || ''));
    h = await post('/api/dbt/linaje/filas-de-test', { test: 'no.existe' });
    comprobar('uno que no existe', h.status === 400);
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
