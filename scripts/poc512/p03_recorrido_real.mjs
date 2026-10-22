/**
 * El recorrido real de la 5.12 (fase 9): un proyecto dbt de punta a punta, con el dbt
 * de verdad, por el servidor de AmoxSQL y con un home TEMPORAL.
 *
 *     node scripts/poc512/p03_recorrido_real.mjs --dbt <carpeta de un entorno de Python con dbt-duckdb>
 *
 *   crear el proyecto (prod) → elegir el entorno → dbt build → el linaje con resultados
 *   → la vista previa de un modelo → las descripciones en el explorador → una fuente de
 *   AmoxSQL en dbt y promover una consulta → crear dev y la confirmación de producción
 *   → programar «dbt build» y que el reloj lo corra → un lago con versiones.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--dbt');
if (i < 0) { console.error('Falta --dbt <carpeta del entorno>'); process.exit(2); }
const ENTORNO = path.resolve(process.argv[i + 1]);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-512real-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'tienda');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${String(d).slice(0, process.env.DEPURAR ? 4000 : 260)}` : ''}`);
const t0 = Date.now();

const { startServer, arrancarProgramador } = require(path.join(RAIZ, "server/index.js"));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const programador = require(path.join(RAIZ, 'server/programacion/programador.js'));
const { port } = await startServer(0);
for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
const u = (q) => `http://localhost:${port}${q}`;
const pedir = (m) => (q, b) => fetch(u(q), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
const dbt = async (command, extra = {}) => {
    const r = await fetch(u('/api/dbt/execute'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, ...extra }) });
    if (!String(r.headers.get('content-type')).includes('event-stream')) return { status: r.status, ...(await r.json()) };
    const ev = (await r.text()).split('\n\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
    return { resumen: ev.find(x => x.type === 'resumen')?.resumen, salida: ev };
};

try {
    await post('/api/project/open', { path: P });
    let h = await post('/api/dbt/init', { projectName: 'tienda' });
    anota('crear el proyecto: capas con ejemplos, en prod', h.success, h.createdFiles?.join(', '));
    h = await put('/api/dbt/proyecto', { entorno: { tipo: 'python', ruta: ENTORNO } });
    anota('elegir el entorno de dbt del proyecto', h.dbt?.entorno?.ruta === ENTORNO);

    let r = await dbt('dbt build');
    anota('dbt build, con su resumen', r.resumen?.estado === 'ok', r.resumen?.linea);
    h = await get('/api/dbt/linaje/resultados');
    const fct = Object.entries(h.nodos || {}).find(([id]) => id.endsWith('fct_revenue_monthly'))?.[1];
    anota('el linaje: estado, tiempo y filas de cada modelo', fct?.estado === 'success' && fct.filas > 0, JSON.stringify(fct));

    await post('/api/db/connect', { path: 'tienda.duckdb' });
    h = await post('/api/dbt/modelo/vista-previa', { archivo: 'models/marts/fct_revenue_monthly.sql' });
    const q = h.sql ? await post("/api/query", { query: h.sql }) : {};
    anota("la vista previa de un modelo, en el motor de AmoxSQL", (q.data || q.rows)?.length > 0, `${h.como} · ${JSON.stringify(q).slice(0, 200)} · ${(h.sql || "").slice(0, 150)}`);
    const esquemas = await get('/api/db/schemas');
    const lista = Object.values(esquemas).filter(x => x?.tables);
    const tabla = lista.flatMap(s => s.tables || []).find(t => t.name === 'fct_revenue_monthly');
    anota("las descripciones de dbt en el explorador (persist_docs)", tabla?.descripcion === "Revenue per store and month.", JSON.stringify(tabla || lista.map(s => s.schema)).slice(0, 400));

    fs.mkdirSync(path.join(P, 'datos'));
    fs.writeFileSync(path.join(P, 'datos', 'metas.csv'), 'store,goal\nnorth,20\nsouth,10\neast,15\n');
    await post('/api/fuentes', { definicion: { nombre: 'metas', tipo: 'archivo', ubicacion: 'datos/metas.csv', descripcion: 'Monthly goals' } });
    h = await post('/api/dbt/promover', { sql: 'select m.store, sum(m.revenue) as revenue, g.goal from fct_revenue_monthly m join fuentes."metas" g on g.store = m.store group by all', nombre: 'revenue_vs_goal', capa: 'marts' });
    anota('promover una consulta: ref() y source() de AmoxSQL', h.cambios?.length === 2 && h.fuentesNuevas?.includes('metas'), JSON.stringify(h.cambios));
    r = await dbt('dbt build --select revenue_vs_goal');
    anota('dbt construye el modelo promovido, leyendo la fuente de AmoxSQL', r.resumen?.estado === 'ok', r.resumen?.linea);

    h = await post('/api/dbt/targets/dev', {});
    await put('/api/dbt/proyecto', { target: 'prod' });
    r = await dbt('dbt run');
    anota('con dev al lado, escribir en prod pide confirmación', r.status === 409 && r.target === 'prod');
    r = await dbt('dbt run --select stg_orders', { confirmarProduccion: 'prod' });
    anota('  y con el nombre escrito, corre', r.resumen?.estado === 'ok', r.resumen?.linea);

    arrancarProgramador({ reloj: false, avisar: () => {} });
    const prog = await post('/api/programaciones', { proceso: 'dbt build --select stg_orders', regla: { tipo: 'diaria', hora: '02:00' } });
    const manana = new Date(); manana.setDate(manana.getDate() + 1); manana.setHours(2, 1, 0, 0);
    const t = await programador.tick(manana);
    const corrida = t.corridas.find(x => x.programacionId === prog.programacion?.id);
    anota('programar «dbt build» y que el reloj lo corra', corrida?.estado === 'ok', JSON.stringify(corrida?.resumen).slice(0, 1500));

    h = await post('/api/lago/crear', { nombre: 'historico' });
    await post('/api/db/connect', { path: h.archivo });
    await post('/api/query', { query: 'CREATE TABLE ventas AS SELECT 1 AS id' });
    await post('/api/query', { query: 'INSERT INTO ventas VALUES (2)' });
    const v = await get('/api/lago/versiones');
    const ce = await post('/api/lago/como-estaba', { tabla: 'ventas', version: v.versiones.find(x => /tables created/.test(x.cambios))?.version + 1 });
    anota('un lago con versiones y «como estaba»', v.versiones.length >= 3 && !!ce.sql, v.versiones.map(x => `v${x.version} ${x.cambios}`).join(' | '));
} catch (e) {
    anota('inesperado', false, e.stack || e.message);
} finally {
    await baseCentral.cerrar().catch(() => {});
}
console.log(`\n${Math.round((Date.now() - t0) / 1000)} s · ${TMP}`);
process.exit(0);
