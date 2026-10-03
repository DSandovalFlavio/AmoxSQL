/**
 * Un bucket público de verdad contra AmoxSQL (fase 5, C4). Necesita internet.
 *
 *     node scripts/poc510/p09_bucket_publico.mjs
 *
 * Sin credencial: lo que es público se lee tal cual.
 *   - Un Parquet por HTTPS como fuente de un archivo.
 *   - Un bucket S3 abierto (los datos climáticos de NOAA, con particiones hive
 *     YEAR=/ELEMENT=) como fuente de tipo bucket: las columnas de la partición
 *     aparecen, y un filtro por ellas no baja el resto.
 *   - Lo que falla se dice con nombre: una ruta que no existe, un bucket que no
 *     es público.
 *   - El manifiesto anota la extensión que hace falta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-bucket-publico-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const HTTPS = 'https://blobs.duckdb.org/train_services.parquet';
const NOAA = 's3://noaa-ghcn-pds/parquet/by_year/YEAR=2024/';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const consulta = async (sql) => { const t0 = Date.now(); const r = await post('/api/query', { query: sql }); return { ...r, ms: Date.now() - t0 }; };

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };

try {
    const P = path.join(TMP, 'clima'); fs.mkdirSync(P);
    await post('/api/project/open', { path: P });

    console.log('\nun Parquet por HTTPS');
    await post('/api/fuentes', { definicion: { nombre: 'trenes', ubicacion: HTTPS } });
    let r = await consulta('SELECT count(*)::INTEGER AS n FROM fuentes."trenes"');
    anota('se lee como fuente, sin credencial', r.data?.[0]?.n > 100000, `${r.ms} ms · ${JSON.stringify(r.data || r.error).slice(0, 200)}`);

    console.log('\nun bucket S3 público con particiones hive');
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', tipo: 'bucket', patron: 'ELEMENT=PRCP/*.parquet', hive: true }, ubicacion: NOAA });
    anota('«probar» enseña filas y las columnas de la partición', r.status === 200 && r.columnas?.some(c => c.nombre === 'ELEMENT') && r.columnas?.some(c => c.nombre === 'YEAR'),
        `${r.status} · ${JSON.stringify(r.columnas?.map(c => c.nombre) || r.error).slice(0, 300)}`);
    await post('/api/fuentes', { definicion: { nombre: 'lluvia-2024', tipo: 'bucket', hive: true, ubicacion: NOAA } });
    r = await consulta(`SELECT count(*)::BIGINT AS n FROM fuentes."lluvia-2024" WHERE ELEMENT = 'PRCP'`);
    anota('fuentes."lluvia-2024" filtra por la partición', Number(r.data?.[0]?.n) > 1000000, `${r.ms} ms · ${JSON.stringify(r.data || r.error).slice(0, 200)}`);
    r = await consulta(`SELECT ID, DATE, DATA_VALUE FROM fuentes."lluvia-2024" WHERE ELEMENT = 'PRCP' AND ID = 'MXM00076680' ORDER BY DATE LIMIT 3`);
    anota('y se consulta (una estación de la Ciudad de México)', Array.isArray(r.data), `${r.ms} ms · ${JSON.stringify(r.data || r.error).slice(0, 300)}`);

    console.log('\nlo que falla');
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', tipo: 'bucket' }, ubicacion: 's3://noaa-ghcn-pds/no-existe-esta-carpeta/' });
    anota('una ruta que no existe se dice', r.status >= 400 && /Nothing found/i.test(r.error || ''), `${r.status} · ${r.error}`);
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', tipo: 'bucket' }, ubicacion: 's3://duckdb-blobs/' });
    anota('un bucket que no es público pide credencial', r.status >= 400 && /needs a credential/i.test(r.error || ''), `${r.status} · ${r.error}`);

    console.log('\nel manifiesto');
    const pj = JSON.parse(fs.readFileSync(path.join(P, '.amoxsql', 'project.json'), 'utf8'));
    anota('anota httpfs', pj.requiere?.extensiones?.includes('httpfs'), JSON.stringify(pj.requiere));
    const lista = await get('/api/fuentes');
    // «remota»: no hay archivo local que mirar; lo que importa es que no hay error.
    anota('las dos fuentes quedan «remota», sin error', ['trenes', 'lluvia-2024'].every(n => { const f = lista.fuentes?.find(x => x.nombre === n); return f?.estado === 'remota' && !f.error; }),
        JSON.stringify(lista.fuentes?.map(f => [f.nombre, f.estado, f.error])));
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}
console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba`);
process.exit(fallos ? 1 : 0);
