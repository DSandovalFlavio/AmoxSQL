/**
 * Ejecuciones aisladas (A4), fase 3 del plan de la 5.9.
 *
 *     node scripts/probarContextoEjecucion.mjs
 *
 * Todo en un AMOXSQL_HOME y un proyecto temporales, por el servidor HTTP de
 * verdad. Lo que se comprueba:
 *
 *   - Una cadena de archivo a archivo en una base de trabajo deja la base del
 *     proyecto idéntica byte a byte, y produce su salida.
 *   - En modo proyecto se comporta como en la 5.8 (la tabla queda en la base
 *     del proyecto); su historial, en cambio, ya va a la base de AmoxSQL.
 *   - Si falla a propósito en el paso 3, se reanuda desde ahí, incluso después
 *     de soltar la base de trabajo (como si la aplicación se hubiera cerrado).
 *   - El historial que la 5.8 dejó en el proyecto se ve, y no se puede borrar.
 *   - La tabla de casos del modo auto.
 *
 * Es CSV a Parquet y no Excel a Parquet: leer Excel pide una extensión que la
 * primera vez se descarga, y una prueba no debe depender de la red. El camino
 * del ejecutor es el mismo.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-contexto-'));
const HOME = path.join(TMP, 'home');
const PROYECTO = path.join(TMP, 'proyecto');
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(path.join(PROYECTO, 'datos'), { recursive: true });
fs.mkdirSync(path.join(PROYECTO, 'flujos'), { recursive: true });
process.env.AMOXSQL_HOME = HOME;                 // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

fs.writeFileSync(path.join(PROYECTO, 'datos', 'ventas.csv'),
    'id,region,importe\n1,norte,10\n2,sur,20\n3,norte,30\n4,este,40\n5,norte,50\n');

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
const chainPersistence = require(path.join(RAIZ, 'server/ChainPersistence.js'));
const contexto = require(path.join(RAIZ, 'server/ejecucion/ContextoDeEjecucion.js'));
const { DuckDBInstance } = require('@duckdb/node-api');

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
// Windows bloquea el archivo de una base abierta: no se puede leer para sacarle
// un hash mientras el proyecto está conectado, que es justo lo que importa
// (la interfaz lo tiene abierto). Lo que sí se lee es su tamaño y su fecha de
// modificación al nanosegundo, de la base y de su WAL: cualquier escritura
// mueve alguno de los dos.
const huella = (...archivos) => {
    const h = crypto.createHash('sha256');
    for (const f of archivos) {
        const st = fs.existsSync(f) ? fs.statSync(f, { bigint: true }) : null;
        h.update(st ? `${path.basename(f)}:${st.size}:${st.mtimeNs}` : `(no existe ${path.basename(f)})`);
    }
    return h.digest('hex');
};
async function leerAparte(sql) {
    const inst = await DuckDBInstance.create(':memory:');
    const con = await inst.connect();
    try { return await (await con.run(sql)).getRowObjectsJson(); }
    finally { con.closeSync(); inst.closeSync(); }
}

// ── Las cadenas ─────────────────────────────────────────────────────────────
const nodo = (id, type, label, config) => ({ id, type, label, config, position: { x: 0, y: 0 } });
const arista = (a, b) => ({ id: `${a}-${b}`, source: a, target: b });

const deArchivoAArchivo = (base, salida, extra = {}) => ({
    version: '1.0', name: 'Ventas del norte', config: { base },
    nodes: [
        nodo('leer', 'import_file', 'Leer ventas', { sourcePath: 'datos/ventas.csv', tableName: 'ventas_crudas' }),
        nodo('filtrar', 'filter', 'Solo norte', { conditions: [{ column: 'region', operator: '=', value: 'norte' }] }),
        ...(extra.comprobar ? [nodo('comprobar', 'assert', 'Hay bastantes', { assertType: 'row_count_gt', threshold: extra.comprobar })] : []),
        nodo('guardar', 'export_file', 'A Parquet', { outputPath: salida, format: 'parquet' }),
    ],
    edges: extra.comprobar
        ? [arista('leer', 'filtrar'), arista('filtrar', 'comprobar'), arista('comprobar', 'guardar')]
        : [arista('leer', 'filtrar'), arista('filtrar', 'guardar')],
    variables: {},
});

const deLaBase = {                                   // sin `config`: guardada por la 5.8
    version: '1.0', name: 'Resumen',
    nodes: [nodo('sql', 'sql_inline', 'Resumen', { query: `CREATE OR REPLACE TABLE resumen AS SELECT region, sum(importe) AS total FROM read_csv('datos/ventas.csv') GROUP BY region` })],
    edges: [], variables: {},
};

// ── La tabla del modo auto (pura) ───────────────────────────────────────────
console.log('\nel modo auto');
{
    const r = contexto.resolverBase;
    const conAuto = (nodes) => ({ config: { base: 'auto' }, nodes });
    const casos = [
        ['una cadena de la 5.8 (sin la clave) se queda en el proyecto', { nodes: [nodo('a', 'import_file', 'a', {})] }, 'proyecto', 'anterior'],
        ['una base que no existe, también', { config: { base: 'nube' }, nodes: [] }, 'proyecto', 'anterior'],
        ['elegir memoria es memoria', { config: { base: 'memoria' }, nodes: [nodo('a', 'sql_inline', 'a', {})] }, 'memoria', 'elegida'],
        ['elegir proyecto es proyecto', { config: { base: 'proyecto' }, nodes: [] }, 'proyecto', 'elegida'],
        ['archivo → filtro → archivo va a una base de trabajo', deArchivoAArchivo('auto', 'x.parquet'), 'trabajo', 'solo-archivos'],
        ['una cadena vacía, también', conAuto([]), 'trabajo', 'solo-archivos'],
        ['SQL libre puede leer cualquier tabla: proyecto', conAuto([nodo('a', 'import_file', 'a', {}), nodo('b', 'sql_inline', 'Mi SQL', {})]), 'proyecto', 'lee-la-base'],
        ['una referencia a una tabla: proyecto', conAuto([nodo('a', 'table_ref', 'a', { tableName: 't' })]), 'proyecto', 'lee-la-base'],
        ['un filtro que toma una tabla por nombre: proyecto', conAuto([nodo('a', 'filter', 'a', { sourceTable: 'clientes' })]), 'proyecto', 'lee-la-base'],
        ['una comprobación sobre una tabla con nombre: proyecto', conAuto([nodo('a', 'assert', 'a', { tableName: 'clientes' })]), 'proyecto', 'lee-la-base'],
        ['un gráfico se refresca contra la base: proyecto', conAuto([nodo('a', 'import_file', 'a', {}), nodo('b', 'chart', 'b', {})]), 'proyecto', 'lee-la-base'],
        ['crear una tabla con nombre: proyecto', conAuto([nodo('a', 'create_table', 'a', {})]), 'proyecto', 'lee-la-base'],
        ['un tipo de paso que no conoce: proyecto, por si acaso', conAuto([nodo('a', 'paso_del_futuro', 'a', {})]), 'proyecto', 'desconocido'],
        ['un paso desactivado no corre, así que no cuenta', conAuto([nodo('a', 'import_file', 'a', {}), { ...nodo('b', 'table_ref', 'b', {}), disabled: true }]), 'trabajo', 'solo-archivos'],
    ];
    for (const [titulo, cadena, resuelta, motivo] of casos) {
        const x = r(cadena);
        comprobar(titulo, x.resuelta === resuelta && x.motivo === motivo, JSON.stringify(x));
    }
    comprobar('y dice qué paso la ata al proyecto', r(conAuto([nodo('b', 'sql_inline', 'Mi SQL', {})])).nodo === 'Mi SQL');
    const ruta = contexto.rutaDeTrabajo(PROYECTO, 'flujos/ventas.sqlchain');
    comprobar('la base de trabajo de flujos/ventas.sqlchain', ruta === path.join(PROYECTO, '.amoxsql', 'trabajo', 'flujos__ventas.duckdb'), ruta);
    comprobar('da la misma con la ruta absoluta', contexto.rutaDeTrabajo(PROYECTO, path.join(PROYECTO, 'flujos', 'ventas.sqlchain')) === ruta);
    comprobar('y una cadena sin guardar tiene la suya', /sin_nombre\.duckdb$/.test(contexto.rutaDeTrabajo(PROYECTO, '')));
}

const BASE_PROYECTO = path.join(PROYECTO, 'principal.duckdb');
try {
    const { port } = await startServer(0);
    const u = (p) => `http://localhost:${port}${p}`;
    const get = (p) => fetch(u(p)).then(r => r.json());
    const post = (p, b) => fetch(u(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    const correr = (chainDefinition, chainFile, extra = {}) => post('/api/chains/run', { chainDefinition, chainFile, variables: chainDefinition.variables, ...extra });

    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await dormir(100);
    await post('/api/project/open', { path: PROYECTO });
    const con = await post('/api/db/connect', { path: BASE_PROYECTO });
    comprobar('\n  [preparar] el proyecto y su base', con.success === true, JSON.stringify(con));

    // El historial que la 5.8 dejó en la base del proyecto.
    await chainPersistence.initSchema(dbManager);
    const viejo = await chainPersistence.createRun(dbManager, { chainFile: 'flujos/ventas.sqlchain', chainName: 'Ventas', runMode: 'full', totalNodes: 3 });
    await chainPersistence.updateRunStatus(dbManager, viejo, { status: 'completed', completedNodes: 3 });

    // ── 1. de archivo a archivo, en una base de trabajo ──────────────────────
    console.log('\nde archivo a archivo, en una base de trabajo');
    const CADENA = 'flujos/ventas.sqlchain';
    const A = deArchivoAArchivo('auto', 'salida/norte.parquet');
    const b = await post('/api/chains/base', { chainDefinition: A, chainFile: CADENA });
    comprobar('la interfaz sabe dónde irá', b.resuelta === 'trabajo' && b.ruta === path.join('.amoxsql', 'trabajo', 'flujos__ventas.duckdb'), JSON.stringify(b));

    await dbManager.systemQuery('CHECKPOINT');
    await dormir(1500);                                     // que se vacíe el historial de consultas
    await dbManager.systemQuery('CHECKPOINT');
    const antes = huella(BASE_PROYECTO, BASE_PROYECTO + '.wal');

    const r1 = await correr(A, CADENA);
    comprobar('termina', r1.status === 'completed' && r1.base === 'trabajo', JSON.stringify(r1));
    const salida = path.join(PROYECTO, 'salida', 'norte.parquet').replace(/\\/g, '/');
    const filas = fs.existsSync(salida) ? await leerAparte(`SELECT count(*)::INTEGER AS n, sum(importe)::INTEGER AS s FROM '${salida}'`) : [];
    comprobar('y deja su Parquet, con lo que tiene que tener', filas[0]?.n === 3 && filas[0]?.s === 90, JSON.stringify(filas));
    await dormir(1500);
    comprobar('la base del proyecto no recibe ni una escritura', huella(BASE_PROYECTO, BASE_PROYECTO + '.wal') === antes);
    const tablas = (await dbManager.systemQuery(`SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '%ventas%' OR table_name LIKE '__chain_%'`)).map(t => t.table_name);
    comprobar('ni sus tablas intermedias ni las importadas están en ella', tablas.length === 0, tablas.join(', '));
    const rutaTrabajo = path.join(PROYECTO, '.amoxsql', 'trabajo', 'flujos__ventas.duckdb');
    comprobar('están en su base de trabajo', fs.existsSync(rutaTrabajo));
    comprobar('que git ignora sola', fs.readFileSync(path.join(PROYECTO, '.amoxsql', 'trabajo', '.gitignore'), 'utf8').includes('*'));

    console.log('\nla interfaz ve los pasos en la base donde corrieron');
    const vistaNodo = await post('/api/chains/preview-node', { nodeId: 'filtrar', chainDefinition: A, chainFile: CADENA });
    comprobar('la vista previa de un paso', vistaNodo.available && Number(vistaNodo.totalRows) === 3, JSON.stringify(vistaNodo).slice(0, 200));
    const vistaTabla = await get(`/api/chains/preview/ventas_crudas?chainFile=${encodeURIComponent(CADENA)}&base=trabajo`);
    comprobar('la tabla que importó', Number(vistaTabla.totalRows) === 5, JSON.stringify(vistaTabla).slice(0, 200));
    const esquema = await post('/api/chains/schema/infer', { nodeId: 'guardar', chainDefinition: A, chainFile: CADENA });
    comprobar('las columnas que le llegan a un paso', (esquema.columns || []).map(c => c.name).join() === 'id,region,importe', JSON.stringify(esquema));

    console.log('\nel historial, en la base de AmoxSQL');
    const [ej] = await baseCentral.query(`SELECT * FROM ejecuciones WHERE id = $1`, [r1.runId]);
    comprobar('la ejecución, resumida', ej && ej.estado === 'ok' && ej.origen === 'interfaz' && ej.proyecto === PROYECTO && !!ej.fin, JSON.stringify(ej));
    comprobar('con el proceso por su ruta absoluta', ej?.proceso === path.join(PROYECTO, 'flujos', 'ventas.sqlchain'), ej?.proceso);
    const pasos = await baseCentral.query(`SELECT node_id, status FROM amoxsql_chains.node_runs WHERE run_id = $1 ORDER BY node_id`, [r1.runId]);
    comprobar('y paso a paso', pasos.map(p => `${p.node_id}:${p.status}`).join() === 'filtrar:success,guardar:success,leer:success', JSON.stringify(pasos));
    const estado = await get(`/api/chains/run/${r1.runId}/status`);
    comprobar('el estado se lee de ahí', estado.run?.status === 'completed' && estado.nodeRuns?.length === 3);
    const hist = await get(`/api/chains/history?chainFile=${encodeURIComponent(CADENA)}`);
    const nueva = hist.runs.find(r => r.id === r1.runId), anterior = hist.runs.find(r => r.id === viejo);
    comprobar('la lista trae la nueva, con la ruta como la conoce la interfaz', nueva && nueva.chain_file === CADENA && !nueva.anterior, JSON.stringify(nueva));
    comprobar('y la que la 5.8 dejó en el proyecto, marcada como anterior', anterior && anterior.anterior === true);
    const borrarVieja = await fetch(u(`/api/chains/history/${viejo}`), { method: 'DELETE' });
    comprobar('la anterior no se puede borrar', borrarVieja.status === 409);
    comprobar('la nueva sí', (await fetch(u(`/api/chains/history/${r1.runId}`), { method: 'DELETE' })).ok
        && (await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE id = $1`, [r1.runId]))[0].n === 0);

    // ── 2. en memoria ────────────────────────────────────────────────────────
    console.log('\nen memoria');
    const M = deArchivoAArchivo('memoria', 'salida/memoria.parquet');
    const r2 = await correr(M, 'flujos/memoria.sqlchain');
    comprobar('termina y deja su salida', r2.status === 'completed' && r2.base === 'memoria' && fs.existsSync(path.join(PROYECTO, 'salida', 'memoria.parquet')), JSON.stringify(r2));
    comprobar('sin dejar ninguna base', !fs.existsSync(path.join(PROYECTO, '.amoxsql', 'trabajo', 'flujos__memoria.duckdb')));
    comprobar('y sin tocar la del proyecto', huella(BASE_PROYECTO, BASE_PROYECTO + '.wal') === antes);

    // ── 3. falla en el paso 3 y se reanuda ───────────────────────────────────
    console.log('\nfalla en el paso 3 y se reanuda desde ahí');
    const RE = 'flujos/reanudar.sqlchain';
    const F = deArchivoAArchivo('auto', 'salida/reanudada.parquet', { comprobar: 100 });
    const r3 = await correr(F, RE);
    comprobar('falla donde tiene que fallar', r3.status === 'failed' && r3.failedNodeId === 'comprobar', JSON.stringify(r3));
    const [ejF] = await baseCentral.query(`SELECT estado, error FROM ejecuciones WHERE id = $1`, [r3.runId]);
    comprobar('y el resumen dice por qué', ejF?.estado === 'fallo' && /Assertion failed/.test(ejF?.error || ''), JSON.stringify(ejF));
    comprobar('no ha escrito la salida', !fs.existsSync(path.join(PROYECTO, 'salida', 'reanudada.parquet')));
    await contexto.soltarTrabajos();                       // como si se hubiera cerrado la aplicación
    F.nodes.find(n => n.id === 'comprobar').config.threshold = 2;
    const r4 = await post(`/api/chains/run/${r3.runId}/resume`, { chainDefinition: F, chainFile: RE, startNodeId: 'comprobar', variables: {} });
    comprobar('se reanuda desde el paso 3, con lo que los anteriores dejaron', r4.status === 'completed', JSON.stringify(r4));
    const pasosR = await baseCentral.query(`SELECT node_id FROM amoxsql_chains.node_runs WHERE run_id = $1 ORDER BY node_id`, [r4.runId]);
    comprobar('sin repetir los pasos 1 y 2', pasosR.map(p => p.node_id).join() === 'comprobar,guardar', JSON.stringify(pasosR));
    const filasR = await leerAparte(`SELECT count(*)::INTEGER AS n FROM '${path.join(PROYECTO, 'salida', 'reanudada.parquet').replace(/\\/g, '/')}'`);
    comprobar('y deja la salida', filasR[0]?.n === 3, JSON.stringify(filasR));
    comprobar('la base del proyecto, intacta en todo esto', huella(BASE_PROYECTO, BASE_PROYECTO + '.wal') === antes);

    // ── 4. en la base del proyecto, como en la 5.8 ───────────────────────────
    console.log('\nen la base del proyecto, como en la 5.8');
    const r5 = await correr(deLaBase, 'flujos/resumen.sqlchain');
    comprobar('termina, en la base del proyecto', r5.status === 'completed' && r5.base === 'proyecto', JSON.stringify(r5));
    const resumen = await dbManager.systemQuery(`SELECT region, total::INTEGER AS total FROM resumen ORDER BY region`);
    comprobar('y la tabla queda en ella', resumen.map(x => `${x.region}=${x.total}`).join() === 'este=40,norte=90,sur=20', JSON.stringify(resumen));
    const enProyecto = await dbManager.systemQuery(`SELECT count(*)::INTEGER AS n FROM amoxsql_chains.runs WHERE id = '${r5.runId}'`);
    comprobar('pero su historial no: va a la base de AmoxSQL', enProyecto[0].n === 0
        && (await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM amoxsql_chains.runs WHERE id = $1`, [r5.runId]))[0].n === 1);
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    // NO /api/shutdown: termina el proceso (ver probarSecretos.mjs).
    await contexto.soltarTrabajos().catch(() => {});
    await dbManager.close().catch(() => {});
    await baseCentral.cerrar().catch(() => {});
}

await dormir(300);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
