/**
 * El plan de ejecución con DuckDB 2 (6.0, Dec-65).
 *
 *     node scripts/probarPlanDeEjecucion.mjs
 *
 * 1. El adaptador puro (`server/planDeEjecucion.js`) con salidas reales guardadas de los
 *    dos motores (`scripts/fixtures/planDeEjecucion/v2.0` y `v1.5`): el árbol, las
 *    filas, los tiempos, las fases, la E/S y los grupos de filas.
 * 2. `/api/db/explain` de verdad, con el motor de la app: Analyze y Explain dan un árbol
 *    con su primer operador real, Analyze da sus métricas, y después de abrir el plan el
 *    perfilado NO queda encendido en la conexión (lo que hacía `profiling_mode` en 2.0).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-plan-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
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
const { normalizar, deFilas, raizReal } = require(path.join(RAIZ, 'server/planDeEjecucion.js'));
const fixture = (v, n) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts/fixtures/planDeEjecucion', v, `${n}.json`), 'utf8'));
const nodos = (n, acc = []) => { if (n) { acc.push(n); (n.children || []).forEach(c => nodos(c, acc)); } return acc; };

try {
    for (const v of ['v2.0', 'v1.5']) {
        console.log(`\nel adaptador, salidas de ${v}`);
        for (const n of ['agregacion', 'join_ventana', 'filtro']) {
            const f = fixture(v, n);
            const a = normalizar(deFilas(f.analyze), 'analyze');
            const real = raizReal(a.plan);
            const todos = nodos(a.plan);
            comprobar(`${n}: Analyze da un árbol con nombres de operador`, real && !/^(Operator|RESULT_COLLECTOR|EXPLAIN_ANALYZE)$/.test(real.name) && todos.every(x => typeof x.name === 'string' && x.name !== 'Operator'), real?.name);
            comprobar(`${n}: cada operador trae su tiempo y sus filas`, todos.filter(x => !/EXPLAIN|RESULT|QUERY_ROOT/.test(x.name)).every(x => typeof x.timing === 'number' && typeof x.cardinality === 'number'));
            const m = a.metrics;
            comprobar(`${n}: métricas (latencia, filas devueltas, filas leídas)`, m && m.latency > 0 && typeof m.rowsReturned === 'number' && m.rowsScanned > 0, JSON.stringify(m));
            if (v === 'v2.0') {
                comprobar(`${n}: las fases del planificador sin profiling_mode`, m.phases.planner > 0 && m.phases.optimizer > 0 && m.phases.physicalPlanner > 0 && m.phases.parser > 0, JSON.stringify(m.phases));
                comprobar(`${n}: los grupos de filas leídos de los totales`, m.rowGroupsToScan > 0 && m.rowGroupsScanned <= m.rowGroupsToScan, `${m.rowGroupsScanned}/${m.rowGroupsToScan}`);
            }
            const e = normalizar(deFilas(f.estimado), 'explain');
            comprobar(`${n}: Explain da el árbol estimado y ninguna métrica`, e.plan && e.plan.name !== 'Operator' && e.metrics === null && nodos(e.plan).some(x => x.estimated_cardinality != null), e.plan?.name);
        }
        const f = fixture(v, 'filtro');
        const scan = nodos(normalizar(deFilas(f.analyze), 'analyze').plan).find(x => /SCAN/.test(x.name));
        comprobar('el scan lleva su filtro y su estimación como número', scan && /linea/.test(String(scan.extra_info?.Filters)) && typeof scan.estimated_cardinality === 'number', JSON.stringify(scan?.extra_info));
    }
    comprobar('nada o basura: sin plan, sin romperse', normalizar(null).plan === null && deFilas([]) === null);

    console.log('\nel endpoint, con el motor de la app');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const post = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'plan.duckdb' });
    await post('/api/query', { query: 'CREATE OR REPLACE TABLE ventas AS SELECT range AS id, range % 7 AS tienda, (range * 3) % 101 AS importe FROM range(300000)' });
    const consulta = 'SELECT tienda, sum(importe) AS s FROM ventas WHERE importe > 10 GROUP BY tienda ORDER BY s DESC';

    let r = await post('/api/db/explain', { query: consulta, mode: 'analyze' });
    const real = raizReal(r.plan);
    comprobar('Analyze: árbol desde el primer operador real', !r.error && real && !/EXPLAIN|RESULT_COLLECTOR|QUERY_ROOT/.test(real.name) && nodos(real).some(x => /ORDER|TOP_N|SORT/.test(x.name)), r.error || real?.name);
    comprobar('Analyze: latencia, filas devueltas (7), filas leídas', r.metrics?.latency > 0 && r.metrics.rowsReturned === 7 && r.metrics.rowsScanned >= 300000, JSON.stringify(r.metrics));
    comprobar('Analyze: las fases llegan', r.metrics?.phases?.planner > 0 && r.metrics.phases.optimizer > 0, JSON.stringify(r.metrics?.phases));
    comprobar('Analyze: grupos de filas', r.metrics?.rowGroupsToScan >= 1, JSON.stringify(r.metrics));

    const ajustes = await dbManager.systemQuery("SELECT name, value FROM duckdb_settings() WHERE name IN ('enable_profiling', 'profiling_output', 'profiling_coverage')");
    const encendido = ajustes.find(a => a.name === 'enable_profiling');
    comprobar('después del plan el perfilado no queda encendido', !encendido || encendido.value == null || encendido.value === '' || /^(none|false|no_output)?$/i.test(String(encendido.value)), JSON.stringify(ajustes));

    r = await post('/api/db/explain', { query: consulta, mode: 'explain' });
    comprobar('Explain: árbol estimado, sin métricas', !r.error && r.mode === 'explain' && r.metrics === null && nodos(r.plan).some(x => x.estimated_cardinality != null), r.error || JSON.stringify(r).slice(0, 200));

    // 6.0 (O2): la poda. Una tabla guardada en orden se salta bloques con un filtro por esa
    // columna; la misma en desorden no puede.
    await post('/api/query', { query: 'CREATE OR REPLACE TABLE ordenada AS SELECT range AS id, range % 97 AS v FROM range(1000000) ORDER BY id' });
    await post('/api/query', { query: 'CREATE OR REPLACE TABLE revuelta AS SELECT * FROM ordenada ORDER BY hash(id)' });
    const poda = await post('/api/db/explain', { query: 'SELECT sum(v) FROM ordenada WHERE id < 1000', mode: 'analyze' });
    comprobar('ordenada: lee menos bloques de los que hay', poda.metrics?.rowGroupsToScan >= 4 && poda.metrics.rowGroupsScanned < poda.metrics.rowGroupsToScan, JSON.stringify(poda.metrics));
    const sinPoda = await post('/api/db/explain', { query: 'SELECT sum(v) FROM revuelta WHERE id < 1000', mode: 'analyze' });
    comprobar('revuelta: los lee todos', sinPoda.metrics?.rowGroupsToScan >= 4 && sinPoda.metrics.rowGroupsScanned === sinPoda.metrics.rowGroupsToScan, JSON.stringify(sinPoda.metrics));

    r = await post('/api/db/explain', { query: 'CREATE TABLE x AS SELECT 1', mode: 'analyze' });
    comprobar('Analyze de algo que escribe: cae a Explain y lo dice', r.mode === 'explain' && /read-only/.test(r.note || ''), JSON.stringify(r).slice(0, 200));

    r = await post('/api/db/explain', { query: 'SELECT * FROM no_existe', mode: 'analyze' });
    comprobar('una consulta que falla: el error del motor', /no_existe/.test(r.error || ''), JSON.stringify(r).slice(0, 200));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
