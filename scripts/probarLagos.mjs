/**
 * Lagos y buckets (C4), fase 5 del plan de la 5.10.
 *
 *     node scripts/probarLagos.mjs
 *
 * Sin red: lo que en producción está en un bucket o un lago, aquí está en una
 * carpeta local (las mismas funciones del motor lo leen), y la nube «de mentira»
 * es un endpoint que no responde.
 *   - Credenciales de nube con nombre: se guardan cifradas, nunca vuelven, y dos
 *     conviven gracias al SCOPE de cada secreto (`which_secret`).
 *   - Bucket de Parquet con particiones hive; lago Delta (hecho a mano: sólo el
 *     log y un Parquet); DuckLake adjunto en sólo lectura y fuera del explorador.
 *   - Explorar un lago encuentra sus tablas.
 *   - Lo que falla se dice con nombre: credencial que no está, endpoint que no
 *     responde, ruta vacía, extensión sin descargar.
 *   - El manifiesto anota las extensiones y la credencial que usa.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-lagos-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const fuentes = require(path.join(RAIZ, 'server/fuentes.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const consulta = async (sql) => {
    await get('/api/fuentes');
    const r = await post('/api/query', { query: sql });
    return r.data || { error: r.error };
};
const fwd = (p) => p.split(path.sep).join('/');

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

// ── Preparar el «lago» local ───────────────────────────────────────────────
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });
const LAGO = path.join(TMP, 'lago');
const HIVE = path.join(LAGO, 'ventas_hive');
const DELTA = path.join(LAGO, 'crm', 'clientes');
const DUCKLAKE = path.join(TMP, 'almacen', 'tiendas.ducklake');
{
    fs.mkdirSync(LAGO, { recursive: true });
    const i = await DuckDBInstance.create(':memory:');
    const c = await i.connect();
    await c.run(`COPY (SELECT * FROM (VALUES (2025,'norte',10),(2025,'sur',20),(2026,'norte',30)) v(anio,tienda,importe)) TO '${fwd(HIVE)}' (FORMAT parquet, PARTITION_BY (anio))`);
    fs.mkdirSync(path.join(DELTA, '_delta_log'), { recursive: true });
    await c.run(`COPY (SELECT * FROM (VALUES (1,'Ana'),(2,'Luis')) v(id,nombre)) TO '${fwd(path.join(DELTA, 'part-0000.parquet'))}' (FORMAT parquet)`);
    const esquema = JSON.stringify({ type: 'struct', fields: [{ name: 'id', type: 'integer', nullable: true, metadata: {} }, { name: 'nombre', type: 'string', nullable: true, metadata: {} }] });
    fs.writeFileSync(path.join(DELTA, '_delta_log', '00000000000000000000.json'), [
        { protocol: { minReaderVersion: 1, minWriterVersion: 2 } },
        { metaData: { id: '7f2c3b9e-1111-4a5b-9c1d-000000000001', format: { provider: 'parquet', options: {} }, schemaString: esquema, partitionColumns: [], configuration: {}, createdTime: Date.now() } },
        { add: { path: 'part-0000.parquet', partitionValues: {}, size: fs.statSync(path.join(DELTA, 'part-0000.parquet')).size, modificationTime: Date.now(), dataChange: true } },
    ].map(o => JSON.stringify(o)).join('\n') + '\n');
    fs.mkdirSync(path.dirname(DUCKLAKE), { recursive: true });
    await c.run(`ATTACH 'ducklake:${fwd(DUCKLAKE)}' AS l (DATA_PATH '${fwd(DUCKLAKE)}.files/')`);
    await c.run(`CREATE TABLE l.inventario AS SELECT * FROM (VALUES ('norte', 7), ('sur', 3)) v(tienda, piezas)`);
    await c.run('DETACH l');
    c.closeSync(); i.closeSync();
}

try {
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'p.duckdb' });

    console.log('\ncredenciales de nube con nombre');
    let r = await post('/api/secretos/nube', { nombre: 'cubo-a', proveedor: 's3', accessKeyId: 'AKIA-PRUEBA-A', secretKey: 'SECRETO-LAGOS-A-91', region: 'us-east-1', endpoint: '127.0.0.1:9', urlStyle: 'path' });
    comprobar('se guarda una credencial S3 con nombre', r.status === 200 && r.nombre === 'cubo-a', JSON.stringify(r));
    await post('/api/secretos/nube', { nombre: 'cubo-b', proveedor: 's3', accessKeyId: 'AKIA-PRUEBA-B', secretKey: 'SECRETO-LAGOS-B-92', endpoint: '127.0.0.1:9', urlStyle: 'path' });
    r = await post('/api/secretos/nube', { nombre: 'nube-x', proveedor: 's3', accessKeyId: 'a', secretKey: 'b' });
    comprobar('los nombres de AmoxSQL (nube-, ia-) no se pueden usar', r.status === 400);
    const lista = await get('/api/secretos');
    const texto = JSON.stringify(lista);
    comprobar('la lista las enseña por nombre y tipo', ['cubo-a', 'cubo-b'].every(n => lista.credenciales?.some(c => c.nombre === n && c.tipo === 'nube-s3')), texto.slice(0, 300));
    comprobar('y nunca su valor', !texto.includes('SECRETO-LAGOS') && !texto.includes('AKIA-PRUEBA'));

    console.log('\ndos buckets con claves distintas conviven (SCOPE)');
    await post('/api/fuentes', { definicion: { nombre: 'ventas-cubo-a', tipo: 'bucket', ubicacion: 's3://cubo-a/ventas/', credencial: 'cubo-a' } });
    await post('/api/fuentes', { definicion: { nombre: 'ventas-cubo-b', tipo: 'bucket', ubicacion: 's3://cubo-b/ventas/', credencial: 'cubo-b' } });
    const wa = await consulta(`SELECT name FROM which_secret('s3://cubo-a/ventas/2026/x.parquet', 's3')`);
    const wb = await consulta(`SELECT name FROM which_secret('s3://cubo-b/ventas/2026/x.parquet', 's3')`);
    const wc = await consulta(`SELECT name FROM which_secret('s3://otro-cubo/x.parquet', 's3')`);
    comprobar('cada prefijo usa su secreto', wa?.[0]?.name && wb?.[0]?.name && wa[0].name !== wb[0].name, JSON.stringify({ wa, wb }));
    comprobar('y otro bucket no usa ninguno', Array.isArray(wc) && wc.length === 0, JSON.stringify(wc));
    const secretosDelMotor = await consulta(`SELECT name, persistent FROM duckdb_secrets() WHERE name LIKE 'amox_f_%'`);
    comprobar('son temporales (nunca en disco)', Array.isArray(secretosDelMotor) && secretosDelMotor.length >= 2 && secretosDelMotor.every(s => s.persistent === false || s.persistent === 'false' || s.persistent === 'TEMPORARY'), JSON.stringify(secretosDelMotor));
    let estado = (await get('/api/fuentes')).fuentes.find(f => f.nombre === 'ventas-cubo-a');
    r = await post('/api/query', { query: 'SELECT * FROM fuentes."ventas-cubo-a"' });
    comprobar('un endpoint que no responde se dice con nombre', /Cannot reach s3:\/\/cubo-a\/ventas\//.test(r.error || '') || /Nothing found/.test(r.error || ''), r.error);
    comprobar('la lista lo marca como remota', estado?.estado === 'remota', JSON.stringify(estado));
    await post('/api/fuentes', { definicion: { nombre: 'sin-credencial', tipo: 'bucket', ubicacion: 's3://cubo-c/x/', credencial: 'no-existe' } });
    r = await post('/api/query', { query: 'SELECT * FROM fuentes."sin-credencial"' });
    comprobar('una credencial que no está en esta máquina lo dice', /credential "no-existe" is not on this machine/.test(r.error || ''), r.error);

    console.log('\nun bucket con particiones hive');
    await post('/api/fuentes', { definicion: { nombre: 'ventas-hive', tipo: 'bucket', formato: 'parquet', hive: true }, ubicacionAqui: HIVE });
    let filas = await consulta('SELECT anio::INTEGER AS anio, sum(importe)::INTEGER AS s FROM fuentes."ventas-hive" GROUP BY anio ORDER BY anio');
    comprobar('lee todas las particiones, con la columna de la partición', JSON.stringify(filas) === JSON.stringify([{ anio: 2025, s: 30 }, { anio: 2026, s: 30 }]), JSON.stringify(filas));
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', tipo: 'bucket', formato: 'parquet', hive: true }, ubicacion: HIVE });
    comprobar('«probar» la lee sin guardar nada', r.columnas?.some(c => c.nombre === 'anio') && r.filas?.length === 3, JSON.stringify(r).slice(0, 200));
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', tipo: 'bucket', formato: 'parquet' }, ubicacion: path.join(TMP, 'vacio') });
    comprobar('una ruta vacía se explica', r.status === 400 && /Nothing found at/.test(r.error || ''), r.error);

    console.log('\nun lago Delta');
    r = await post('/api/fuentes/explorar', { ubicacion: LAGO });
    comprobar('explorar encuentra sus tablas', r.tablas?.some(t => t.formato === 'delta' && t.nombre === 'clientes'), JSON.stringify(r));
    await post('/api/fuentes', { definicion: { nombre: 'clientes', tipo: 'lago', formato: 'delta' }, ubicacionAqui: DELTA });
    filas = await consulta('SELECT count(*)::INTEGER AS n FROM fuentes."clientes"');
    comprobar('fuentes."clientes" lee la tabla Delta', filas?.[0]?.n === 2, JSON.stringify(filas));
    r = await post('/api/fuentes', { definicion: { nombre: 'mal', tipo: 'lago', formato: 'hudi' }, ubicacionAqui: DELTA });
    comprobar('un formato de lago que no existe se rechaza', r.status === 400 && /Delta, Iceberg or DuckLake/.test(r.error || ''), JSON.stringify(r));

    console.log('\nun DuckLake');
    r = await post('/api/fuentes/explorar', { ubicacion: path.dirname(DUCKLAKE) });
    comprobar('explorar encuentra el catálogo', r.tablas?.some(t => t.formato === 'ducklake'), JSON.stringify(r));
    await post('/api/fuentes', { definicion: { nombre: 'inventario', tipo: 'lago', formato: 'ducklake', tabla: 'inventario' }, ubicacionAqui: DUCKLAKE });
    filas = await consulta('SELECT sum(piezas)::INTEGER AS s FROM fuentes."inventario"');
    comprobar('fuentes."inventario" lee la tabla del lago', filas?.[0]?.s === 10, JSON.stringify(filas));
    r = await post('/api/query', { query: 'CREATE TABLE amox_lago_inventario.otra AS SELECT 1' });
    comprobar('el lago se adjunta en sólo lectura', !!r.error, JSON.stringify(r).slice(0, 200));
    const esquemas = await fetch(u('/api/db/schemas')).then(x => x.json());
    comprobar('y no se mezcla con las tablas del proyecto en el explorador', !JSON.stringify(esquemas).includes('inventario'), JSON.stringify(esquemas).slice(0, 300));

    console.log('\nel manifiesto');
    await consulta('SELECT * FROM fuentes."clientes" JOIN fuentes."ventas-hive" ON true LIMIT 1');
    await post('/api/query', { query: 'SELECT * FROM fuentes."ventas-cubo-a"' });
    const pj = JSON.parse(fs.readFileSync(path.join(P, '.amoxsql', 'project.json'), 'utf8'));
    comprobar('anota las extensiones que hacen falta', ['delta', 'httpfs'].every(e => pj.requiere?.extensiones?.includes(e)), JSON.stringify(pj.requiere));
    comprobar('y el NOMBRE de la credencial (nunca su valor)', pj.requiere?.credenciales?.some(c => c.nombre === 'cubo-a') && !JSON.stringify(pj).includes('SECRETO-LAGOS'), JSON.stringify(pj.requiere));

    console.log('\nlos mensajes');
    const def = { tipo: 'lago', formato: 'iceberg', credencial: null };
    comprobar('una extensión sin descargar', /needs the iceberg extension.*internet/.test(fuentes.explicarNube(new Error('IO Error: Failed to download extension "iceberg" at URL …'), def, 's3://x')));
    comprobar('un permiso que falta', /has no permission/.test(fuentes.explicarNube(new Error('HTTP Error: HTTP GET error … (HTTP 403 Forbidden)'), { ...def, credencial: 'cubo-a' }, 's3://x')));
    comprobar('un Iceberg sin version-hint', /metadata file/.test(fuentes.explicarNube(new Error('Invalid Configuration Error: … no version-hint could be found …'), def, '/x')));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
