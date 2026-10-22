/**
 * DuckLake de primera clase (5.12, fase 8; I8, Dec-33).
 *
 *     node scripts/probarLago.mjs
 *
 * Por el servidor, con lagos de verdad (necesita la extensión ducklake, y sqlite para
 * el catálogo compartido; red la primera vez):
 *   - crear un lago simple y uno con catálogo SQLite, y abrirlos;
 *   - sus versiones, «como estaba» por versión y por fecha, y qué cambió;
 *   - el mantenimiento: lo que borraría, sin borrar; compactar; expirar y limpiar; y
 *     que después la versión vieja ya no se consulta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-lago-'));
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
const espera = (ms) => new Promise(r => setTimeout(r, ms));

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await espera(100);
    const u = (q) => `http://localhost:${port}${q}`;
    const pedir = (m) => (q, b) => fetch(u(q), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });

    console.log('\ncrear');
    let h = await post('/api/lago/crear', { nombre: 'ventas lago', catalogo: 'duckdb' });
    comprobar('un lago simple: <nombre>.ducklake y su carpeta de datos', h.archivo === 'ventas_lago.ducklake' && fs.existsSync(path.join(P, 'ventas_lago.ducklake')), JSON.stringify(h));
    h = await post('/api/lago/crear', { nombre: 'ventas_lago' });
    comprobar('no pisa uno que ya existe', h.status === 400 && /already exists/.test(h.error || ''));
    h = await post('/api/lago/crear', { nombre: 'compartido', catalogo: 'sqlite' });
    comprobar('uno con catálogo SQLite (compartido con dbt)', h.archivo === 'compartido.ducklake.sqlite' && fs.existsSync(path.join(P, 'compartido.ducklake.sqlite')), JSON.stringify(h));
    h = await get('/api/lago/versiones');
    comprobar('sin un lago abierto, no hay versiones', h.lago === false);

    console.log('\nabrir y escribir');
    h = await post('/api/db/connect', { path: 'ventas_lago.ducklake' });
    comprobar('se abre como cualquier base', h.success !== false && !h.error, JSON.stringify(h).slice(0, 200));
    await sql('CREATE TABLE ventas (id INTEGER, tienda VARCHAR, importe DOUBLE)');
    await sql("INSERT INTO ventas SELECT i, 'norte', i FROM range(4000) t(i)");
    const antes = new Date();
    await espera(1100);
    await sql("INSERT INTO ventas SELECT 10000 + i, 'sur', i FROM range(4000) t(i)");
    await sql("INSERT INTO ventas SELECT 20000 + i, 'este', i FROM range(4000) t(i)");
    await sql("INSERT INTO ventas SELECT 30000 + i, 'oeste', i FROM range(4000) t(i)");
    await sql("UPDATE ventas SET importe = -1 WHERE id = 0");
    let v = await get('/api/lago/versiones');
    comprobar('sus versiones, de la más nueva a la más vieja, con lo que cambió', v.lago && v.versiones.length >= 4 && v.versiones[0].version > v.versiones[1].version && /inserted into|deleted from/.test(v.versiones.map(x => x.cambios).join(' ')), JSON.stringify(v.versiones.slice(0, 3)));
    const conInsert = v.versiones.find(x => x.tablas.includes('main.ventas') && /inserted into/.test(x.cambios));
    comprobar('cada versión sabe qué tablas tocó, por su nombre', !!conInsert && v.versiones.every(x => x.tablas.every(t => !/^\d+$/.test(t))), JSON.stringify(v.versiones.map(x => x.tablas)));
    const vPrimera = v.versiones.filter(x => /inserted into/.test(x.cambios)).map(x => x.version).sort((a, b) => a - b)[0];
    h = await post('/api/lago/como-estaba', { tabla: 'ventas', version: vPrimera });
    let q = await sql(h.sql);
    comprobar('«como estaba» en una versión: sólo las primeras 4000', q.data?.length > 0 && (await sql(`SELECT count(*) AS n FROM (${h.sql.split('\n').slice(1).join('\n')})`)).data?.[0]?.n == 4000, h.sql);
    h = await post('/api/lago/como-estaba', { tabla: 'ventas', fecha: antes.toISOString() });
    q = await sql(`SELECT count(*) AS n FROM (${h.sql.split('\n').slice(1).join('\n')})`);
    comprobar('«como estaba» en una fecha', q.data?.[0]?.n == 4000, JSON.stringify(q).slice(0, 200));
    const vUpdate = v.versiones[0].version;
    h = await post('/api/lago/que-cambio', { tabla: 'ventas', desde: vUpdate - 1, hasta: vUpdate });
    q = await sql(h.sql);
    comprobar('qué cambió en una versión (el UPDATE: antes y después)', q.data?.some(r => r.change_type === 'update_preimage') && q.data.some(r => r.change_type === 'update_postimage'), JSON.stringify(q.data?.slice(0, 2)));
    h = await post('/api/lago/como-estaba', { tabla: 'ventas' });
    comprobar('sin versión ni fecha, lo dice', h.status === 400);

    console.log('\nmantenimiento (Dec-33)');
    const datos = path.join(P, 'ventas_lago.ducklake.files');
    const cuenta = () => { let n = 0; const rec = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? rec(path.join(d, e.name)) : n++; }; if (fs.existsSync(datos)) rec(datos); return n; };
    const archivosAntes = cuenta();
    let p = await post('/api/lago/mantenimiento/previsualizar', { dias: 0 });
    comprobar('lo que haría, sin hacerlo: versiones que expiran y desde cuándo se podrá consultar', p.versiones.expiran > 0 && p.versiones.quedan >= 1 && !!p.consultableDesde, JSON.stringify(p));
    comprobar('  y no toca nada', (await get('/api/lago/versiones')).versiones.length === v.versiones.length && cuenta() === archivosAntes);
    h = await post('/api/lago/mantenimiento', { compactar: true });
    comprobar('compactar: junta archivos y no borra versiones', h.compactados >= 2 && (await get('/api/lago/versiones')).versiones.length > v.versiones.length - 1, JSON.stringify(h));
    h = await post('/api/lago/mantenimiento', { compactar: false, expirarDias: 0, limpiar: true });
    comprobar('expirar y limpiar: versiones fuera y archivos borrados', h.expiradas > 0 && h.borrados > 0 && h.bytes > 0, JSON.stringify(h));
    h = await post('/api/lago/como-estaba', { tabla: 'ventas', version: vPrimera });
    q = await sql(h.sql);
    comprobar('después, la versión vieja ya no se consulta', !!q.error && /snapshot/i.test(q.error), JSON.stringify(q).slice(0, 200));
    q = await sql('SELECT count(*) AS n FROM ventas');
    comprobar('y los datos de hoy siguen enteros', q.data?.[0]?.n == 16000);

    console.log('\nel lago compartido (catálogo SQLite)');
    h = await post('/api/db/connect', { path: 'compartido.ducklake.sqlite' });
    comprobar('se abre', !h.error, JSON.stringify(h).slice(0, 200));
    await sql('CREATE TABLE t AS SELECT 1 AS x');
    v = await get('/api/lago/versiones');
    comprobar('y tiene sus versiones', v.lago && v.versiones.length >= 2, JSON.stringify(v).slice(0, 200));

    await post('/api/db/connect', { path: ':memory:' });
    h = await post('/api/lago/mantenimiento', { compactar: true });
    comprobar('mantener sin un lago abierto lo dice', h.status === 400 && /not a lake/.test(h.error || ''));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
