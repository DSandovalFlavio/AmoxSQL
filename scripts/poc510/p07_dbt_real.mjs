/**
 * dbt real contra AmoxSQL (fase 2b, I1, comprobada con un dbt de verdad).
 *
 *     node scripts/poc510/p07_dbt_real.mjs --dbt <carpeta con dbt.exe y python.exe>
 *
 * Con el servidor de AmoxSQL y un home TEMPORAL:
 *   1. `dbt run` con la base adjunta en AmoxSQL: la suelta, dbt escribe, vuelve;
 *      las vistas temporales y las fuentes siguen ahí. Un modelo lee una tabla
 *      que se creó desde AmoxSQL.
 *   2. `dbt test` y un modelo que falla: la base vuelve igual.
 *   3. Un DuckLake con catálogo SQLite: dbt escribe en el lago mientras AmoxSQL
 *      lo tiene abierto como fuente, sin soltar nada. ¿Se entienden las dos
 *      versiones del motor?
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const i = process.argv.indexOf('--dbt');
if (i < 0) { console.error('Falta --dbt <carpeta de dbt.exe>'); process.exit(2); }
process.env.PATH = path.resolve(process.argv[i + 1]) + path.delimiter + process.env.PATH;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtreal-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const fwd = (p) => p.split(path.sep).join('/');

async function dbt(comando) {
    const r = await fetch(u('/api/dbt/execute'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: comando }) });
    const eventos = (await r.text()).split('\n\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
    // Las líneas de préstamo (suelta / vuelve); el aviso de versiones va aparte.
    const amox = eventos.filter(e => e.type === 'amox').map(e => e.text);
    return { salida: eventos.find(e => e.type === 'exit')?.code, amox: amox.filter(t => !/^dbt runs DuckDB/.test(t)), aviso: amox.find(t => /^dbt runs DuckDB/.test(t)), texto: eventos.map(e => e.text).filter(Boolean).join('\n') };
}

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };
const escribir = (ruta, texto) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); };

const P = path.join(TMP, 'tienda');
escribir(path.join(P, 'dbt_project.yml'), 'name: tienda\nversion: "1.0"\nprofile: tienda\nmodel-paths: ["models"]\n');
escribir(path.join(P, 'profiles.yml'), [
    'tienda:',
    '  target: dev',
    '  outputs:',
    '    dev:',
    '      type: duckdb',
    '      path: tienda.duckdb',
    '      threads: 1',
    '    lago:',
    '      type: duckdb',
    '      path: ":memory:"',
    '      extensions: [ducklake, sqlite]',
    '      attach:',
    `        - path: "ducklake:sqlite:${fwd(path.join(P, 'lago', 'catalogo.sqlite'))}"`,
    '          alias: lago',
    '          options:',
    `            data_path: "${fwd(path.join(P, 'lago', 'datos'))}/"`,
    '      database: lago',
    '      schema: main',
    '      threads: 1',
    '',
].join('\n'));
escribir(path.join(P, 'models', 'resumen.sql'), "{{ config(materialized='table') }}\nselect count(*) as filas, 42 as respuesta from main.ventas\n");
escribir(path.join(P, 'models', 'resumen.yml'), 'version: 2\nmodels:\n  - name: resumen\n    columns:\n      - name: respuesta\n        tests: [not_null]\n');
escribir(path.join(P, 'datos', 'metas.csv'), 'tienda,meta\nnorte,10\n');
fs.mkdirSync(path.join(P, 'lago', 'datos'), { recursive: true });   // SQLite no crea la carpeta de su catálogo

try {
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'tienda.duckdb' });
    await post('/api/query', { query: "CREATE TABLE ventas AS SELECT * FROM (VALUES ('norte', 10), ('sur', 20)) v(tienda, importe)" });
    await post('/api/query', { query: 'CREATE TEMP VIEW celda_1 AS SELECT count(*) AS n FROM ventas' });
    await post('/api/fuentes', { definicion: { nombre: 'metas' }, ubicacionAqui: path.join(P, 'datos', 'metas.csv') });

    console.log('\n1. dbt run con la base adjunta');
    let r = await dbt('dbt run --profiles-dir .');
    anota('dbt run termina bien', r.salida === 0, r.texto.slice(-600));
    anota('AmoxSQL soltó la base y la recuperó', /released tienda\.duckdb/.test(r.amox[0] || '') && r.amox.some(t => /has the database again/.test(t)), JSON.stringify(r.amox));
    let q = await post('/api/query', { query: 'SELECT filas::INTEGER AS filas, respuesta FROM resumen' });
    anota('AmoxSQL ve el modelo que leyó su tabla', q.data?.[0]?.filas === 2 && q.data[0].respuesta === 42, JSON.stringify(q).slice(0, 200));
    q = await post('/api/query', { query: 'SELECT n::INTEGER AS n FROM celda_1' });
    anota('la vista temporal del cuaderno sigue', q.data?.[0]?.n === 2, JSON.stringify(q).slice(0, 200));
    q = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM fuentes."metas"' });
    anota('las fuentes siguen', q.data?.[0]?.n === 1);

    console.log('\n2. dbt test, y un modelo que falla');
    r = await dbt('dbt test --profiles-dir .');
    anota('dbt test termina bien (también abre la base)', r.salida === 0 && r.amox.length === 2, r.texto.slice(-300));
    escribir(path.join(P, 'models', 'roto.sql'), 'select * from tabla_que_no_existe\n');
    r = await dbt('dbt run --profiles-dir .');
    q = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM ventas' });
    anota('un modelo roto: dbt falla y la base vuelve igual', r.salida !== 0 && q.data?.[0]?.n === 2, `${r.salida} · ${JSON.stringify(q).slice(0, 120)}`);
    fs.rmSync(path.join(P, 'models', 'roto.sql'));

    console.log('\n3. DuckLake con catálogo SQLite: los dos a la vez');
    // dbt crea el lago y escribe en él.
    escribir(path.join(P, 'models', 'resumen.sql'), "{{ config(materialized='table') }}\nselect 7 as v\n");
    fs.rmSync(path.join(P, 'models', 'resumen.yml'));
    r = await dbt('dbt run --profiles-dir . --target lago');
    anota('dbt escribe en el lago (catálogo SQLite)', r.salida === 0 && r.amox.length === 0, r.texto.slice(-500));
    await post('/api/fuentes', { definicion: { nombre: 'resumen-lago', tipo: 'lago', formato: 'ducklake', tabla: 'resumen', ubicacion: `sqlite:${fwd(path.join(P, 'lago', 'catalogo.sqlite'))}` } });
    anota('AmoxSQL avisa de que dbt usa otra versión del motor', !!r.aviso, r.aviso || '');
    const lista = await get('/api/fuentes');
    const estado = (lista.fuentes || lista.informe || []).find?.(f => f.nombre === 'resumen-lago')?.error
        ?? JSON.stringify(lista).slice(0, 600);
    if (estado) console.log(`    la fuente dice: ${estado}`);
    q = await post('/api/query', { query: 'SELECT v FROM fuentes."resumen-lago"' });
    anota('AmoxSQL (otra versión del motor) lee el lago que escribió dbt', q.data?.[0]?.v === 7, JSON.stringify(q).slice(0, 300));
    escribir(path.join(P, 'models', 'resumen.sql'), "{{ config(materialized='table') }}\nselect 8 as v\n");
    r = await dbt('dbt run --profiles-dir . --target lago');
    q = await post('/api/query', { query: 'SELECT v FROM fuentes."resumen-lago"' });
    anota('con el lago abierto en AmoxSQL, dbt vuelve a escribir sin soltar nada', r.salida === 0 && q.data?.[0]?.v === 8, `${r.salida} · ${JSON.stringify(q).slice(0, 200)}`);
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}
console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba`);
process.exit(fallos ? 1 : 0);
