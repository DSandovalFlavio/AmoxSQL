/**
 * dbt dentro del editor (5.12, fase 3): I2 y Dec-28.
 *
 *     node scripts/probarDbtModelo.mjs
 *
 *   - qué es cada archivo para dbt (modelo, macro, yaml…) por sus carpetas;
 *   - compilar sólo si el archivo cambió (el manifiesto manda);
 *   - la vista previa: con la base del target adjunta, el catálogo pasa a `user_db`;
 *     sin ella, se adjunta en sólo lectura… y dbt la puede abrir igual (se suelta y
 *     vuelve, como la principal);
 *   - «ir a la definición» de ref() y source().
 * Con un dbt FALSO que escribe el manifiesto como el de verdad.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtmodelo-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });

const require = createRequire(import.meta.url);
const modelo = require(path.join(RAIZ, 'server/dbt/modelo.js'));
const { crearEntornoFalso } = require(path.join(RAIZ, 'scripts/ayudas/dbtFalso.cjs'));
const { DuckDBInstance } = require(require.resolve('@duckdb/node-api', { paths: [RAIZ] }));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const espera = (ms) => new Promise(r => setTimeout(r, ms));

// ── El proyecto y su base (escrita como la dejaría dbt) ─────────────────────
const P = path.join(TMP, 'tienda');
const escribir = (rel, t) => { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
escribir('dbt_project.yml', "name: tienda\nprofile: tienda\nmodel-paths: ['models']\nmacro-paths: ['macros']\n");
escribir('profiles.yml', 'tienda:\n  target: prod\n  outputs:\n    prod: { type: duckdb, path: tienda.duckdb }\n');
escribir('models/staging/stg_ventas.sql', "select id, tienda from {{ ref('ventas') }}\n");
escribir('models/staging/_staging.yml', 'models:\n  - name: stg_ventas\n');
escribir('models/marts/fct.sql', "select tienda, count(*) n from {{ ref('stg_ventas') }} group by 1\n");
escribir('macros/m.sql', '{% macro m() %}1{% endmacro %}\n');
escribir('seeds/ventas.csv', 'id,tienda\n1,norte\n');
{
    const i = await DuckDBInstance.create(path.join(P, 'tienda.duckdb'));
    const c = await i.connect();
    await c.run("CREATE TABLE ventas AS SELECT * FROM (VALUES (1,'norte'),(2,'sur'),(3,'norte')) t(id, tienda)");
    c.closeSync(); i.closeSync();
}
// El dbt falso: «compile» escribe el manifiesto con el compilado; «run» abre la base
// (como el de verdad: para escribir) y crea una tabla.
const compilado = (n) => n === 'stg_ventas' ? 'select id, tienda from "tienda"."main"."ventas"' : 'select tienda, count(*) n from "tienda"."main"."stg_ventas" group by 1';
const FALSO = crearEntornoFalso(TMP, `
const fs = require('fs'), path = require('path');
const sel = args[args.indexOf('--select') + 1];
if (args[0] === 'compile') {
  if (sel === 'roto') { console.log('Compilation Error in model roto'); process.exit(1); }
  const nodos = {};
  for (const [n, f] of [['stg_ventas', 'models/staging/stg_ventas.sql'], ['fct', 'models/marts/fct.sql']]) {
    nodos['model.tienda.' + n] = { name: n, resource_type: 'model', database: 'tienda', schema: 'main', original_file_path: f, relation_name: '"tienda"."main"."' + n + '"', depends_on: { nodes: n === 'fct' ? ['model.tienda.stg_ventas'] : ['seed.tienda.ventas'] }, compiled_code: n === 'stg_ventas' ? ${JSON.stringify(compilado('stg_ventas'))} : ${JSON.stringify(compilado('fct'))}, config: { materialized: 'view' }, description: n === 'stg_ventas' ? 'Las ventas' : '' };
  }
  nodos['seed.tienda.ventas'] = { name: 'ventas', resource_type: 'seed', schema: 'main', original_file_path: 'seeds/ventas.csv' };
  fs.mkdirSync('target', { recursive: true });
  fs.writeFileSync('target/manifest.json', JSON.stringify({ nodes: nodos, sources: { 'source.tienda.crudo.pedidos': { source_name: 'crudo', name: 'pedidos', original_file_path: 'models/staging/_staging.yml' } }, macros: {} }));
  fs.appendFileSync('compilaciones.txt', 'x');
  console.log('Running with dbt=1.12.6'); console.log('Done.');
} else {
  const { DuckDBInstance } = require(${JSON.stringify(require.resolve('@duckdb/node-api', { paths: [RAIZ] }))});
  (async () => {
    try {
      const i = await DuckDBInstance.create(path.join(process.cwd(), 'tienda.duckdb'));
      const c = await i.connect();
      await c.run('CREATE OR REPLACE TABLE escrita_por_dbt AS SELECT 1 AS x');
      c.closeSync(); i.closeSync();
      console.log('Running with dbt=1.12.6'); console.log('Completed successfully');
    } catch (e) { console.error('Runtime Error: ' + String(e.message).split('\\n')[0]); process.exit(2); }
  })();
}
`);
escribir('.amoxsql/project.json', JSON.stringify({ dbt: { entorno: { tipo: 'python', ruta: FALSO.carpeta } } }));
const compilaciones = () => (fs.existsSync(path.join(P, 'compilaciones.txt')) ? fs.readFileSync(path.join(P, 'compilaciones.txt'), 'utf8').length : 0);

try {
    console.log('\nqué es cada archivo');
    comprobar('un modelo', modelo.queEs(P, 'models/staging/stg_ventas.sql')?.tipo === 'modelo');
    comprobar('su YAML', modelo.queEs(P, path.join(P, 'models/staging/_staging.yml'))?.tipo === 'yaml');
    comprobar('una macro', modelo.queEs(P, 'macros/m.sql')?.tipo === 'macro');
    comprobar('un .sql fuera de las carpetas de dbt no es de dbt', modelo.queEs(P, 'consultas/x.sql') === null && modelo.info(P, 'consultas/x.sql').esDbt === false);
    comprobar('sin dbt_project.yml, nada', modelo.queEs(TMP, 'models/a.sql') === null);
    let i = modelo.info(P, 'models/staging/stg_ventas.sql');
    comprobar('un modelo que aún no está en el manifiesto: su nombre por el archivo', i.nombre === 'stg_ventas' && !i.enManifiesto && !i.fresco, JSON.stringify(i));

    console.log('\ncompilar (Dec-28)');
    let c = await modelo.compilar(P, 'models/staging/stg_ventas.sql');
    comprobar('compila con dbt y trae el compilado', c.compilo && c.compilado === compilado('stg_ventas') && c.descripcion === 'Las ventas', JSON.stringify(c).slice(0, 200));
    c = await modelo.compilar(P, 'models/staging/stg_ventas.sql');
    comprobar('sin cambios en el archivo, no vuelve a lanzar dbt', !c.compilo && compilaciones() === 1, `${compilaciones()} compilaciones`);
    await espera(30);
    fs.writeFileSync(path.join(P, 'models/staging/stg_ventas.sql'), "select id, tienda from {{ ref('ventas') }} -- cambio\n");
    c = await modelo.compilar(P, 'models/staging/stg_ventas.sql');
    comprobar('si el archivo cambió, compila otra vez', c.compilo && compilaciones() === 2);
    let e = await modelo.compilar(P, 'macros/m.sql').catch(x => x);
    comprobar('una macro no se compila como modelo', /not a dbt model/.test(e?.message || ''));
    comprobar('cambiar el catálogo, sólo como catálogo entre comillas', modelo.cambiarCatalogo('select "tienda" from "tienda"."main"."x" join "tienda"."main"."y"', 'tienda', 'user_db') === 'select "tienda" from "user_db"."main"."x" join "user_db"."main"."y"');

    console.log('\nla vista previa, por el servidor');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await espera(100);
    const u = (p) => `http://localhost:${port}${p}`;
    const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    await post('/api/project/open', { path: P });

    // 1. La base del target es la que AmoxSQL tiene adjunta.
    await post('/api/db/connect', { path: 'tienda.duckdb' });
    let h = await post('/api/dbt/modelo/vista-previa', { archivo: 'models/staging/stg_ventas.sql' });
    comprobar('con la base adjunta: el catálogo pasa a user_db', h.como === 'base adjunta' && h.sql === 'select id, tienda from "user_db"."main"."ventas"', JSON.stringify(h));
    let q = await post('/api/query', { query: h.sql });
    comprobar('  y corre en AmoxSQL', q.data?.length === 3, JSON.stringify(q).slice(0, 200));

    // 2. AmoxSQL en memoria: la base del target se adjunta en sólo lectura.
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: ':memory:' });
    h = await post('/api/dbt/modelo/vista-previa', { archivo: 'models/staging/stg_ventas.sql' });
    comprobar('sin la base adjunta: se adjunta en sólo lectura con su nombre', h.como === 'adjuntada en sólo lectura' && h.sql === compilado('stg_ventas'), JSON.stringify(h));
    q = await post('/api/query', { query: h.sql });
    comprobar('  y corre en AmoxSQL', q.data?.length === 3, JSON.stringify(q).slice(0, 200));
    const sse = await fetch(u('/api/dbt/execute'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'dbt run --select stg_ventas' }) }).then(x => x.text());
    comprobar('dbt escribe en esa base aunque la vista previa la tuviera (se suelta y vuelve)', /Completed successfully/.test(sse) && !/Runtime Error/.test(sse), sse.split('\n').filter(l => /Runtime|Completed|amox/.test(l)).join(' | ').slice(0, 300));
    q = await post('/api/query', { query: 'SELECT x FROM "tienda".main.escrita_por_dbt' });
    comprobar('  y al volver, la vista previa ve lo que escribió dbt', q.data?.[0]?.x === 1, JSON.stringify(q).slice(0, 200));
    const ro = await post('/api/query', { query: "SELECT readonly FROM duckdb_databases() WHERE database_name = 'tienda'" });
    comprobar('  y sigue en sólo lectura', ro.data?.[0]?.readonly === true, JSON.stringify(ro.data));

    h = await post('/api/dbt/modelo/vista-previa', { archivo: 'models/marts/fct.sql' });
    comprobar('un modelo que lee algo aún no construido lo dice, con qué hacer', h.status === 400 && /fct reads stg_ventas, which is not built in «prod» yet/.test(h.error || '') && /\+Upstream/.test(h.error || ''), h.error);
    h = await post('/api/dbt/modelo/vista-previa', { archivo: 'macros/m.sql' });
    comprobar('la vista previa de algo que no es un modelo lo dice', h.status === 400 && /not a dbt model/.test(h.error || ''));
    h = await get(`/api/dbt/modelo?archivo=${encodeURIComponent('models/marts/fct.sql')}`);
    comprobar('/api/dbt/modelo: nombre, materialización, relación', h.esDbt && h.nombre === 'fct' && h.materializado === 'view' && h.relacion === '"tienda"."main"."fct"', JSON.stringify(h).slice(0, 200));
    h = await get(`/api/dbt/modelo?archivo=${encodeURIComponent('../fuera.sql')}`);
    comprobar('un archivo fuera del proyecto se rechaza', h.status === 400);

    console.log('\nir a la definición');
    h = await get('/api/dbt/definicion?ref=stg_ventas');
    comprobar('ref() de un modelo', h.archivo === 'models/staging/stg_ventas.sql', JSON.stringify(h));
    h = await get('/api/dbt/definicion?ref=ventas');
    comprobar('ref() de una semilla', h.archivo === 'seeds/ventas.csv', JSON.stringify(h));
    h = await get('/api/dbt/definicion?source=crudo.pedidos');
    comprobar('source() lleva a su YAML', h.archivo === 'models/staging/_staging.yml', JSON.stringify(h));
    escribir('models/marts/nuevo.sql', 'select 1');
    h = await get('/api/dbt/definicion?ref=nuevo');
    comprobar('un modelo nuevo que aún no está en el manifiesto, por su archivo', h.archivo === 'models/marts/nuevo.sql', JSON.stringify(h));
    h = await get('/api/dbt/definicion?ref=no_existe');
    comprobar('uno que no existe', h.status === 404);
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
