/**
 * El Assistant cuida el costo (6.0, fase 3; O6).
 *
 *     node scripts/probarCostoAsistente.mjs
 *
 * `execute_sql` mira el plan ESTIMADO antes de correr: una consulta que movería más de
 * 50 millones de filas vuelve con `needs_confirmation` (sin correr: no tarda) y la
 * estimación; con `confirmed: true` corre. Lo pequeño corre como siempre, y lo que no se
 * puede estimar (un CREATE, un error) no se frena.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-costo-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 300) : ''}`); }
};

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const post = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'costo.duckdb' });
    await post('/api/query', { query: 'CREATE OR REPLACE TABLE pedidos AS SELECT range AS id, range % 1000 AS cliente FROM range(300000)' });

    const { createTools } = require(path.join(RAIZ, 'server/ai/tools.js'));
    const tools = createTools({ dbManager, queryResults: new Map(), projectPath: P });
    const correr = (args) => tools.execute_sql.execute(args);

    console.log('\nlo grande, antes de correr');
    const t0 = Date.now();
    let r = await correr({ query: 'SELECT count(*) AS n FROM range(200000000)' });
    comprobar('200 millones de filas: pregunta, sin correr', r.needs_confirmation === true && r.estimated_rows_read >= 200000000 && Date.now() - t0 < 3000, JSON.stringify(r));
    comprobar('  dice de dónde y qué hacer', /ask whether to run it/.test(r.message) && /confirmed: true/.test(r.message) && r.biggest_sources?.length >= 1, r.message);
    r = await correr({ query: 'SELECT a.id FROM pedidos a JOIN pedidos b ON a.cliente = b.cliente' });
    comprobar('un join que se multiplica (300 mil × 300) también', r.needs_confirmation === true && r.estimated_largest_step > 50000000, JSON.stringify(r).slice(0, 300));
    r = await correr({ query: 'SELECT count(*) AS n FROM range(200000000)', confirmed: true });
    comprobar('con confirmed: true, corre', !r.error && !r.needs_confirmation && Number(r.data?.[0]?.n ?? r.rows?.[0]?.n) === 200000000, JSON.stringify(r).slice(0, 300));
    r = await correr({ query: 'SELECT count(*) AS n FROM range(200000000)', confirmed: 'true' });
    comprobar('  también si un modelo pequeño manda "true" como texto', !r.needs_confirmation && !r.error, JSON.stringify(r).slice(0, 200));

    console.log('\nlo normal, como siempre');
    r = await correr({ query: 'SELECT cliente, count(*) AS n FROM pedidos GROUP BY cliente ORDER BY n DESC LIMIT 5' });
    comprobar('una consulta de 300 mil filas corre sin preguntar', !r.error && !r.needs_confirmation, JSON.stringify(r).slice(0, 200));
    r = await correr({ query: 'CREATE OR REPLACE TABLE x AS SELECT 1 AS a' });
    comprobar('lo que no es una consulta no se estima', !r.needs_confirmation, JSON.stringify(r).slice(0, 200));
    r = await correr({ query: 'SELECT * FROM no_existe' });
    comprobar('una consulta con error da su error, no una estimación', !r.needs_confirmation && /no_existe/.test(r.error || ''), JSON.stringify(r).slice(0, 200));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
