/**
 * VARIANT para JSON (6.0, fase 3; O5).
 *
 *     node scripts/probarVariant.mjs
 *
 * Un JSON cuyos registros no comparten forma (uno trae `cliente`, otro `extra`, un
 * `total` que a veces es texto) se importa como UNA columna VARIANT (`datos`) sin
 * definir nada; se lee con `datos.cliente.nombre`; la tabla de resultados lo recibe
 * como objeto (el árbol del cliente); y el perfil dice qué claves hay, en qué
 * porcentaje de filas y con qué tipos. Importar sin la opción sigue como siempre.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-variant-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });
const REGISTROS = [
    { id: 1, cliente: { nombre: 'Ana', ciudad: 'CDMX' }, tags: ['a', 'b'], total: 10.5 },
    { id: 2, cliente: { nombre: 'Beto' }, extra: true, total: 'n/a' },
    { id: 3, tags: [], total: null },
    { id: 4, cliente: { nombre: "O'Neil", ciudad: 'GDL' }, total: 7 },
];
fs.writeFileSync(path.join(P, 'pedidos.json'), JSON.stringify(REGISTROS));
fs.writeFileSync(path.join(P, 'pedidos.jsonl'), REGISTROS.map(r => JSON.stringify(r)).join('\n'));

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 300) : ''}`); }
};

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const post = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'variant.duckdb' });

    console.log('\nimportar');
    let r = await post('/api/db/import', { filePath: 'pedidos.json', tableName: 'pedidos', comoVariant: true });
    comprobar('un JSON como una columna VARIANT', r.success, JSON.stringify(r));
    let q = await sql("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pedidos'");
    comprobar('  una sola columna, datos, de tipo VARIANT', q.data?.length === 1 && q.data[0].column_name === 'datos' && q.data[0].data_type === 'VARIANT', JSON.stringify(q.data));
    r = await post('/api/db/import', { filePath: 'pedidos.jsonl', tableName: 'pedidos_l', comoVariant: true });
    q = await sql('SELECT count(*) AS n FROM pedidos_l');
    comprobar('  también JSON por líneas', r.success && Number(q.data?.[0]?.n) === 4, JSON.stringify(r) + JSON.stringify(q));
    r = await post('/api/db/import', { filePath: 'pedidos.json', tableName: 'pedidos_cols' });
    q = await sql("SELECT count(*) AS n FROM information_schema.columns WHERE table_name = 'pedidos_cols'");
    comprobar('sin la opción, columnas como siempre', r.success && Number(q.data?.[0]?.n) >= 4, JSON.stringify(q));

    console.log('\nleerlo');
    q = await sql("SELECT datos.id AS id, datos.cliente.nombre AS nombre, variant_type(datos.total) AS t FROM pedidos ORDER BY datos.id::INTEGER");
    comprobar('con datos.campo.campo, y el tipo de cada valor', JSON.stringify(q.data?.map(x => [x.nombre, x.t])) === JSON.stringify([['Ana', 'DOUBLE'], ['Beto', 'VARCHAR'], [null, null], ["O'Neil", 'UINT64']]), JSON.stringify(q.data));
    q = await sql('SELECT datos FROM pedidos ORDER BY datos.id::INTEGER LIMIT 1');
    const v = q.data?.[0]?.datos;
    comprobar('la tabla de resultados recibe un objeto (para su árbol)', v && typeof v === 'object' && v.cliente?.ciudad === 'CDMX' && Array.isArray(v.tags), JSON.stringify(v));

    console.log('\nel perfil');
    const p = await post('/api/profile', { query: 'SELECT * FROM pedidos' });
    const claves = p.visuals?.datos;
    comprobar('dice sus claves', claves?.type === 'keys' && claves.data.map(k => k.value).sort().join() === 'cliente,extra,id,tags,total', JSON.stringify(claves));
    const de = (k) => claves?.data.find(x => x.value === k);
    comprobar('  en cuántas filas', de('id')?.count === 4 && de('cliente')?.count === 3 && de('extra')?.count === 1, JSON.stringify(claves?.data));
    comprobar('  y con qué tipos (total: número y texto)', JSON.stringify(de('total')?.tipos) === JSON.stringify(['DOUBLE', 'UINT64', 'VARCHAR']) && JSON.stringify(de('cliente')?.tipos) === JSON.stringify(['OBJECT']), JSON.stringify(de('total')));
    comprobar('el resto del perfil sigue', p.profile?.length === 1 && Number(p.global?.totalRows ?? p.totalRows ?? 4) === 4, JSON.stringify(p).slice(0, 300));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
