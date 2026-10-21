/**
 * Iceberg de verdad contra AmoxSQL (fase 5, C4).
 *
 *     python scripts/poc510/p08_iceberg_escribir.py <carpeta>
 *     node scripts/poc510/p08_iceberg_real.mjs <carpeta>
 *
 * La tabla la escribe pyiceberg con un catálogo SQLite: como cualquier
 * catálogo, NO deja version-hint.text. AmoxSQL tiene que encontrarla al
 * explorar y leerla apuntando a su carpeta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..', '..');
const ALMACEN = path.join(path.resolve(process.argv[2] || ''), 'almacen');
const TABLA = path.join(ALMACEN, 'tiendas', 'ventas');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-iceberg-prueba-'));
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

let pasadas = 0, fallos = 0;
const anota = (t, ok, d = '') => { ok ? pasadas++ : fallos++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${d}` : ''}`); };

try {
    const P = path.join(TMP, 'p'); fs.mkdirSync(P);
    await post('/api/project/open', { path: P });
    let r = await post('/api/fuentes/explorar', { ubicacion: ALMACEN });
    anota('explorar encuentra la tabla Iceberg', r.tablas?.some(t => t.formato === 'iceberg' && t.nombre === 'ventas'), JSON.stringify(r).slice(0, 300));
    r = await post('/api/fuentes/probar', { definicion: { nombre: 'x', tipo: 'lago', formato: 'iceberg' }, ubicacion: TABLA });
    anota('«probar» la lee apuntando a su carpeta (sin version-hint)', r.filas?.length === 3, JSON.stringify(r).slice(0, 300));
    await post('/api/fuentes', { definicion: { nombre: 'ventas-iceberg', tipo: 'lago', formato: 'iceberg' }, ubicacionAqui: TABLA });
    await get('/api/fuentes');
    r = await post('/api/query', { query: 'SELECT sum(importe)::INTEGER AS t, count(*)::INTEGER AS n FROM fuentes."ventas-iceberg"' });
    anota('fuentes."ventas-iceberg" lee la última instantánea (las dos escrituras)', r.data?.[0]?.t === 60 && r.data[0].n === 3, JSON.stringify(r).slice(0, 300));
} catch (x) {
    fallos++;
    console.log('NO  inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}
console.log(`\n${pasadas}/${pasadas + fallos} como se esperaba`);
process.exit(fallos ? 1 : 0);
