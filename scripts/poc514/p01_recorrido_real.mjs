/**
 * El recorrido real de la 5.14 (fase 5): el día a día de una analista con dos
 * proyectos del mismo cliente, por el servidor de AmoxSQL y con un home TEMPORAL.
 *
 *     node scripts/poc514/p01_recorrido_real.mjs
 *
 *   «cierre-norte» tiene un proceso programado que anoche falló → al abrirlo, la
 *   tarjeta «Where you left off» lo dice → lo exporta como plantilla (sin datos)
 *   → crea «cierre-sur» desde el paquete y ve lo que le falta en esta máquina →
 *   guarda un snippet en el workspace y lo ve en los dos → un cuaderno con un
 *   borrador que no sale al exportar → desde «cierre-sur» mira la base de
 *   «cierre-norte» en sólo lectura → la entrega de «cierre-norte» cambia y se
 *   compara con la anterior → cambia un filtro y el diff del proceso lo dice.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-514real-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const NORTE = path.join(TMP, 'cierre-norte');
const SUR = path.join(TMP, 'cierre-sur');
const PAQUETE = path.join(TMP, 'cierre-plantilla.amoxproject');
fs.mkdirSync(NORTE, { recursive: true });

const require = createRequire(import.meta.url);
let si = 0, no = 0;
const anota = (t, ok, d = '') => { ok ? si++ : no++; console.log(`${ok ? 'SI ' : 'NO '} ${t}${!ok && d ? `  — ${String(d).slice(0, 400)}` : ''}`); };
const t0 = Date.now();

try {
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async x => { const j = await x.json().catch(() => ({})); return Array.isArray(j) ? Object.assign(j, { http: x.status }) : { http: x.status, ...j }; });
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    const sql = (query) => post('/api/query', { query });
    const git = (...a) => execFileSync('git', ['-C', NORTE, ...a], { stdio: 'pipe' }).toString();

    // ── El proyecto de siempre ──
    const ws = await post('/api/workspaces', { nombre: 'Cliente Norte' });
    await post('/api/project/open', { path: NORTE });
    await put('/api/project/workspace', { workspaceId: ws.id });
    await post('/api/db/connect', { path: path.join(NORTE, 'cierre.duckdb') });
    await sql("CREATE OR REPLACE TABLE ventas AS SELECT * FROM (VALUES (1, 'norte', 100.0), (2, 'norte', 80.0), (3, 'sur', 55.0)) t(folio, tienda, importe)");
    const proceso = (filtro, query = 'SELECT * FROM ventas') => ({
        version: '1.0', name: 'Cierre semanal', config: { base: 'proyecto' },
        nodes: [
            { id: 'v', type: 'sql_inline', label: 'Ventas', position: { x: 0, y: 0 }, config: { query } },
            { id: 'f', type: 'filter', label: 'Tiendas', position: { x: 200, y: 0 }, config: { conditions: [{ column: 'tienda', operator: filtro.op, value: filtro.valor }] } },
            { id: 'x', type: 'excel', label: 'Libro del cliente', position: { x: 400, y: 0 }, config: { outputPath: 'entregas/cierre.xlsx' } },
        ],
        edges: [{ id: 'e1', source: 'v', target: 'f' }, { id: 'e2', source: 'f', target: 'x' }],
    });
    const v1 = proceso({ op: '=', valor: 'norte' });
    fs.writeFileSync(path.join(NORTE, 'cierre.sqlchain'), JSON.stringify(v1, null, 2));
    git('init', '-q'); git('config', 'user.email', 'ana@example.com'); git('config', 'user.name', 'Ana');
    git('add', 'cierre.sqlchain'); git('commit', '-q', '-m', 'el cierre');

    // El lunes corrió bien; anoche, programado, falló (una tabla que alguien borró).
    const lunes = await ejecutarProceso({ dbManager, chainDef: v1, proyecto: NORTE, chainFile: 'cierre.sqlchain', origen: 'programada' });
    const roto = proceso({ op: '=', valor: 'norte' }, 'SELECT * FROM ventas_borradas');
    const anoche = await ejecutarProceso({ dbManager, chainDef: roto, proyecto: NORTE, chainFile: 'cierre.sqlchain', origen: 'programada' });
    anota('el lunes el proceso dejó su Excel', lunes.status === 'completed' && fs.existsSync(path.join(NORTE, 'entregas', 'cierre.xlsx')), JSON.stringify(lunes).slice(0, 200));
    anota('anoche falló sin nadie delante', anoche.status === 'failed');

    // «La última vez» fue ayer.
    const [fila] = (await baseCentral.query('SELECT id, ruta FROM proyectos')).filter(p => path.resolve(p.ruta).toLowerCase() === NORTE.toLowerCase());
    await baseCentral.query('UPDATE proyectos SET ultimo_abierto = CAST($2 AS TIMESTAMP) WHERE id = $1', [fila.id, new Date(Date.now() - 86400000).toISOString().replace('T', ' ').replace('Z', '')]);

    console.log('\n── por la mañana ──');
    await post('/api/project/open', { path: TMP });
    await post('/api/project/open', { path: NORTE });
    await post('/api/db/connect', { path: path.join(NORTE, 'cierre.duckdb') });
    let r = await get('/api/proyecto/retomar');
    anota('«Where you left off» dice lo que falló anoche, y por qué', r.hayAlgo && r.atencion?.some(a => a.id === anoche.runId && /ventas_borradas/.test(a.razon || a.error || JSON.stringify(a))), JSON.stringify(r.atencion));
    anota('y la última ejecución del proceso', r.procesos?.some(p => p.nombre === 'Cierre semanal' && p.estado === 'fallo'), JSON.stringify(r.procesos));

    // Arregla y vuelve a correr desde la interfaz.
    await ejecutarProceso({ dbManager, chainDef: v1, proyecto: NORTE, chainFile: 'cierre.sqlchain', origen: 'interfaz' });

    console.log('\n── el siguiente cliente, desde una plantilla ──');
    fs.mkdirSync(path.join(NORTE, '.amoxsql'), { recursive: true });
    const pj = JSON.parse(fs.readFileSync(path.join(NORTE, '.amoxsql', 'project.json'), 'utf8'));
    pj.requiere = { ...(pj.requiere || {}), credenciales: [{ nombre: 'erp-cliente', tipo: 'postgres' }] };
    fs.writeFileSync(path.join(NORTE, '.amoxsql', 'project.json'), JSON.stringify(pj, null, 2));
    fs.writeFileSync(path.join(NORTE, '.env'), 'ERP_PASSWORD=no-debe-viajar\n');
    r = await post('/api/proyecto/exportar', { destino: PAQUETE, plantilla: true });
    anota('exporta la plantilla, sin datos', r.http === 200 && fs.existsSync(PAQUETE) && !(r.datos || []).length, JSON.stringify(r));
    anota('el paquete no lleva el .env ni la base', !fs.readFileSync(PAQUETE).includes(Buffer.from('no-debe-viajar')) && !fs.readFileSync(PAQUETE).includes(Buffer.from('cierre.duckdb')));
    r = await post('/api/proyecto/desde-paquete', { paquete: PAQUETE, carpeta: SUR });
    anota('crea «cierre-sur» desde el paquete', r.http === 200 && fs.existsSync(path.join(SUR, 'cierre.sqlchain')), JSON.stringify(r));
    anota('y dice lo que le falta en esta máquina', r.faltan?.credenciales?.some(c => c.nombre === 'erp-cliente'), JSON.stringify(r.faltan));

    console.log('\n── la biblioteca del workspace ──');
    await post('/api/project/open', { path: NORTE });
    r = await post('/api/snippets/workspace', [{ name: 'Ventas por tienda', sql: 'SELECT tienda, sum(importe) FROM ventas GROUP BY 1' }]);
    anota('guarda un snippet en el workspace', r.ok === true, JSON.stringify(r));
    await post('/api/project/open', { path: SUR });
    await put('/api/project/workspace', { workspaceId: ws.id });
    r = await get('/api/snippets/workspace');
    anota('y lo ve en el otro proyecto', r.snippets?.[0]?.name === 'Ventas por tienda', JSON.stringify(r));

    console.log('\n── un cuaderno con un borrador ──');
    const cf = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/cuadernoFile.js')).href);
    const ex = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/cuaderno/exportar.js')).href);
    const nb = ['# Cierre', '', 'Lo que se entrega.', '', '<!-- celda: totales -->', '```sql', 'SELECT 1', '```', '', '<!-- celda: prueba borrador -->', '```sql', 'SELECT 42', '```', '', '<!-- texto borrador -->', 'Notas mías.', ''].join('\n');
    fs.writeFileSync(path.join(SUR, 'analisis.sqlnb'), nb);
    const doc = cf.leerCuaderno(fs.readFileSync(path.join(SUR, 'analisis.sqlnb'), 'utf8'));
    const salen = ex.celdasParaExportar(doc.celdas);
    anota('el borrador corre pero no sale en Word', salen.length === 2 && !salen.some(c => /42|Notas/.test(c.content)) && ex.borradores(doc.celdas) === 2, JSON.stringify(salen));
    anota('y el archivo se escribe igual que se leyó', cf.escribirCuaderno(doc) === nb);

    console.log('\n── mirar «cierre-norte» desde «cierre-sur» ──');
    await post('/api/db/connect', { path: path.join(SUR, 'sur.duckdb') });
    await sql("CREATE OR REPLACE TABLE metas AS SELECT 'norte' AS tienda, 150 AS meta");
    r = await get('/api/proyecto/hermanos');
    anota('el hermano sale, con su base', r.proyectos?.some(p => p.nombre === 'cierre-norte' && p.base === 'cierre.duckdb'), JSON.stringify(r.proyectos));
    r = await post('/api/proyecto/hermanos/mirar', { ruta: NORTE });
    anota('se adjunta en sólo lectura con su nombre', r.alias === 'cierre_norte' && r.tablas?.some(t => t.nombre === 'ventas'), JSON.stringify(r));
    r = await sql('SELECT m.meta, sum(v.importe) AS real FROM metas m JOIN "cierre_norte".main.ventas v USING (tienda) GROUP BY m.meta');
    anota('y se cruza con lo propio', Number(r.data?.[0]?.real) === 180, JSON.stringify(r));
    await post('/api/proyecto/hermanos/soltar', { alias: 'cierre_norte' });

    console.log('\n── la entrega cambia ──');
    await post('/api/project/open', { path: NORTE });
    await post('/api/db/connect', { path: path.join(NORTE, 'cierre.duckdb') });
    await sql("UPDATE ventas SET importe = 95 WHERE folio = 2");
    await sql("INSERT INTO ventas VALUES (4, 'norte', 70)");
    const martes = await ejecutarProceso({ dbManager, chainDef: v1, proyecto: NORTE, chainFile: 'cierre.sqlchain', origen: 'interfaz' });
    r = await get(`/api/chains/run/${martes.runId}/resumen`);
    const ant = r.guardados?.[0]?.anterior;
    anota('la ficha ofrece «Compare with the previous one»', !!ant?.ruta, JSON.stringify(r.guardados));
    r = ant ? await get(`/api/entregas?copia=${encodeURIComponent(ant.ruta)}`) : {};
    anota('con la clave sugerida', r.clave === 'folio', JSON.stringify(r));
    r = ant ? await post('/api/entregas/comparar', { copia: ant.ruta, clave: ['folio'] }) : {};
    anota('una fila nueva y una que cambió (80 → 95)', r.aparecen?.n === 1 && r.cambian?.n === 1 && String(r.cambian.muestra[0]['importe (before)']) === '80' && String(r.cambian.muestra[0].importe) === '95', JSON.stringify(r));
    anota('la copia vive fuera de git', !git('status', '--porcelain').includes('.amoxsql/entregas'));

    console.log('\n── el filtro cambia ──');
    fs.writeFileSync(path.join(NORTE, 'cierre.sqlchain'), JSON.stringify(proceso({ op: 'in', valor: "'norte', 'sur'" }), null, 2));
    r = await get('/api/procesos/cambios?ruta=cierre.sqlchain');
    anota('el diff del proceso lo dice en palabras', r.lineas?.some(l => l === 'Tiendas · conditions 1 · operator: `=` → `in`'), JSON.stringify(r.lineas));

    await baseCentral.cerrar();
} catch (e) {
    no++;
    console.log('NO  inesperado:', e.stack || e.message);
}

console.log(`\n${si} sí, ${no} no · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(no ? 1 : 0);
