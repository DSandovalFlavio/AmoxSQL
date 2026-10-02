/**
 * dbt sin bloqueos (I1, fase 2b del plan de la 5.10).
 *
 *     node scripts/probarDbtSinBloqueos.mjs
 *
 * Con un `dbt` falso en el PATH —un proceso de Node que abre la base en
 * escritura, como hace dbt-duckdb— y la base adjunta en AmoxSQL:
 *   - el comando termina bien: AmoxSQL suelta la base y la recupera;
 *   - al volver siguen las vistas temporales, las fuentes y las extensiones;
 *   - mientras dbt la tiene, una consulta dice por qué no corre (y una que
 *     sólo lee fuentes, corre);
 *   - lo que no abre la base, o un perfil que apunta a otra, no suelta nada;
 *   - si dbt falla o se cancela, la base vuelve igual;
 *   - un dbt que no arranca lo dice.
 * Y las rutas del perfil: env_var, attach, DuckLake con SQLite (nada que soltar).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbt-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);

// ── El dbt falso ────────────────────────────────────────────────────────────
const BIN = path.join(TMP, 'bin');
fs.mkdirSync(BIN, { recursive: true });
const CONTROL = path.join(BIN, 'control.json');
fs.writeFileSync(path.join(BIN, 'dbt_falso.cjs'), `
const fs = require('fs');
const { DuckDBInstance } = require(${JSON.stringify(require.resolve('@duckdb/node-api', { paths: [RAIZ] }))});
const c = JSON.parse(fs.readFileSync(${JSON.stringify(CONTROL)}, 'utf8'));
(async () => {
  if (c.modo === 'no_arranca') {
    console.error('Traceback (most recent call last):');
    console.error('  File "dbt/cli/main.py", line 1, in <module>');
    console.error("ModuleNotFoundError: No module named 'algo'");
    process.exit(1);
  }
  console.log('Running with dbt=1.10.0');
  const accion = process.argv[2];
  if (['deps', 'clean', 'parse'].includes(accion)) { console.log('Done.'); return; }
  try {
    const i = await DuckDBInstance.create(c.base);
    const con = await i.connect();
    await con.run('CREATE OR REPLACE TABLE modelo AS SELECT 42 AS respuesta');
    await new Promise(r => setTimeout(r, c.esperaMs || 0));
    con.closeSync(); i.closeSync();
  } catch (e) {
    console.error('Runtime Error: ' + String(e.message).split('\\n')[0]);
    process.exit(2);
  }
  if (c.modo === 'falla') { console.error('Database Error in model x'); process.exit(1); }
  console.log('Completed successfully');
})();
`);
fs.writeFileSync(path.join(BIN, 'dbt.cmd'), `@node "%~dp0dbt_falso.cjs" %*\r\n`);
fs.writeFileSync(path.join(BIN, 'dbt'), `#!/bin/sh\nexec node "$(dirname "$0")/dbt_falso.cjs" "$@"\n`, { mode: 0o755 });
process.env.PATH = BIN + path.delimiter + process.env.PATH;
const control = (o) => fs.writeFileSync(CONTROL, JSON.stringify(o));

const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const dbtConvivir = require(path.join(RAIZ, 'server/dbtConvivir.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');

/** Lanza un comando de dbt y lee todo lo que manda. */
async function dbt(comando, { senal } = {}) {
    const r = await fetch(u('/api/dbt/execute'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: comando }), signal: senal,
    });
    const texto = await r.text();
    const eventos = texto.split('\n\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
    return { eventos, salida: eventos.find(e => e.type === 'exit')?.code, amox: eventos.filter(e => e.type === 'amox').map(e => e.text) };
}

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const escribir = (ruta, texto) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); };

const P = path.join(TMP, 'tienda');
const BASE = path.join(P, 'tienda.duckdb');
escribir(path.join(P, 'dbt_project.yml'), 'name: tienda\nprofile: tienda\n');
escribir(path.join(P, 'profiles.yml'), 'tienda:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: tienda.duckdb\n    otra:\n      type: duckdb\n      path: otra.duckdb\n');
escribir(path.join(P, 'datos', 'metas.csv'), 'tienda,meta\nnorte,10\n');

try {
    console.log('\nlas rutas del perfil');
    comprobar('la path del target, relativa al proyecto', JSON.stringify(dbtConvivir.basesDelPerfil(P)) === JSON.stringify([BASE]));
    comprobar('otro target, otra base', dbtConvivir.basesDelPerfil(P, { target: 'otra' })[0] === path.join(P, 'otra.duckdb'));
    const P2 = path.join(TMP, 'perfiles');
    escribir(path.join(P2, 'dbt_project.yml'), 'profile: p\n');
    process.env.AMOX_PRUEBA_BASE = 'desde_env.duckdb';
    escribir(path.join(P2, 'profiles.yml'), "p:\n  target: a\n  outputs:\n    a:\n      type: duckdb\n      path: \"{{ env_var('AMOX_PRUEBA_BASE') }}\"\n      attach:\n        - path: extra.duckdb\n        - path: s3://cubo/x.duckdb\n    lago:\n      type: duckdb\n      path: 'ducklake:sqlite:catalogo.sqlite'\n    lago2:\n      type: duckdb\n      path: 'ducklake:catalogo.ducklake'\n");
    comprobar('env_var y attach (lo remoto no cuenta)', JSON.stringify(dbtConvivir.basesDelPerfil(P2)) === JSON.stringify([path.join(P2, 'desde_env.duckdb'), path.join(P2, 'extra.duckdb')]), JSON.stringify(dbtConvivir.basesDelPerfil(P2)));
    comprobar('un DuckLake con catálogo SQLite no se suelta (admite varios procesos)', dbtConvivir.basesDelPerfil(P2, { target: 'lago' }).length === 0);
    comprobar('uno con catálogo en un archivo, sí', dbtConvivir.basesDelPerfil(P2, { target: 'lago2' })[0] === path.join(P2, 'catalogo.ducklake'));
    comprobar('deps, clean y parse no abren la base', ['deps', 'clean', 'parse'].every(a => !dbtConvivir.abreLaBase(a)) && dbtConvivir.abreLaBase('run') && dbtConvivir.abreLaBase('compile'));

    // La sesión de AmoxSQL: base adjunta, una vista temporal, una fuente, una extensión.
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'tienda.duckdb' });
    await post('/api/query', { query: 'CREATE TABLE ventas AS SELECT 1 AS id' });
    await post('/api/query', { query: 'CREATE TEMP VIEW celda_1 AS SELECT count(*) AS n FROM ventas' });
    await post('/api/fuentes', { definicion: { nombre: 'metas' }, ubicacionAqui: path.join(P, 'datos', 'metas.csv') });
    await post('/api/query', { query: 'LOAD excel' });

    console.log('\ndbt run con la base adjunta');
    control({ modo: 'ok', base: BASE, esperaMs: 1500 });
    const corriendo = dbt('dbt run --profiles-dir .');
    await new Promise(r => setTimeout(r, 700));
    let r = await get('/api/dbt/base');
    comprobar('mientras corre, AmoxSQL dice que dbt tiene la base', r.prestada === true && r.archivo === 'tienda.duckdb', JSON.stringify(r));
    r = await post('/api/query', { query: 'SELECT * FROM ventas' });
    comprobar('una consulta a la base dice por qué no corre', r.status === 409 && /dbt is using tienda\.duckdb/.test(r.error || ''), JSON.stringify(r).slice(0, 200));
    r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM fuentes."metas"' });
    comprobar('una que sólo lee una fuente, corre', r.status === 200 && r.data?.[0]?.n === 1, JSON.stringify(r).slice(0, 200));
    const fin = await corriendo;
    comprobar('dbt termina bien', fin.salida === 0, JSON.stringify(fin.eventos).slice(0, 400));
    comprobar('la salida dice que AmoxSQL soltó la base y la recuperó', /released tienda\.duckdb/.test(fin.amox[0] || '') && fin.amox.some(t => /has the database again/.test(t)), JSON.stringify(fin.amox));
    r = await post('/api/query', { query: 'SELECT respuesta FROM modelo' });
    comprobar('al volver, AmoxSQL ve lo que escribió dbt', r.data?.[0]?.respuesta === 42, JSON.stringify(r).slice(0, 200));
    r = await post('/api/query', { query: 'SELECT n::INTEGER AS n FROM celda_1' });
    comprobar('la vista temporal del cuaderno sigue ahí', r.data?.[0]?.n === 1, JSON.stringify(r).slice(0, 200));
    r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM fuentes."metas"' });
    comprobar('las fuentes siguen ahí', r.data?.[0]?.n === 1);
    r = await post('/api/query', { query: "SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'excel'" });
    comprobar('y la extensión cargada', r.data?.[0]?.loaded === true);
    comprobar('/api/dbt/base vuelve a decir que no', (await get('/api/dbt/base')).prestada === false);

    console.log('\nlo que no hace falta soltar');
    control({ modo: 'ok', base: BASE });
    let x = await dbt('dbt deps --profiles-dir .');
    comprobar('dbt deps no suelta nada', x.salida === 0 && x.amox.length === 0, JSON.stringify(x.amox));
    control({ modo: 'ok', base: path.join(P, 'otra.duckdb') });
    x = await dbt('dbt run --profiles-dir . --target otra');
    comprobar('un target que apunta a otra base no suelta la de AmoxSQL', x.salida === 0 && x.amox.length === 0, JSON.stringify(x.eventos).slice(0, 300));

    console.log('\nsi dbt falla o se cancela');
    control({ modo: 'falla', base: BASE });
    x = await dbt('dbt build --profiles-dir .');
    comprobar('un modelo que falla: sale con 1', x.salida === 1);
    r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM ventas' });
    comprobar('...y la base vuelve igual', r.data?.[0]?.n === 1, JSON.stringify(r).slice(0, 200));
    control({ modo: 'ok', base: BASE, esperaMs: 4000 });
    const ac = new AbortController();
    const cancelado = dbt('dbt run --profiles-dir .', { senal: ac.signal }).catch(() => null);
    await new Promise(r => setTimeout(r, 800));
    comprobar('[cancelar] la base estaba prestada', (await get('/api/dbt/base')).prestada === true);
    ac.abort();
    await cancelado;
    let vuelta = false;
    for (let i = 0; i < 50 && !vuelta; i++) {
        await new Promise(r => setTimeout(r, 200));
        vuelta = (await get('/api/dbt/base')).prestada === false;
    }
    r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM ventas' });
    comprobar('cancelado: la base vuelve', vuelta && r.data?.[0]?.n === 1, JSON.stringify(r).slice(0, 200));

    console.log('\nun dbt que no arranca');
    control({ modo: 'no_arranca' });
    x = await dbt('dbt run --profiles-dir .');
    comprobar('lo dice, en vez de dejar sólo el error de su entorno', x.salida === 1 && x.amox.some(t => /dbt did not start/.test(t)), JSON.stringify(x.amox));
    r = await post('/api/query', { query: 'SELECT count(*)::INTEGER AS n FROM ventas' });
    comprobar('y la base sigue adjunta', r.data?.[0]?.n === 1);
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
