/**
 * Las variables del proyecto (6.0, fase 2; O1, Dec-98).
 *
 *     node scripts/probarVariables.mjs
 *
 *   - Se declaran con tipo (texto, número, fecha, lógico, lista) y descripción en
 *     `.amoxsql/variables.json`; lo que no es válido no se guarda y se dice por qué.
 *   - Se leen con `$nombre` en cualquier consulta, en TODOS los carriles (también los
 *     totales de un gráfico y el plan), en una celda del cuaderno y en un proceso de
 *     Data Flow (contexto aislado).
 *   - Ningún valor cambia la consulta (un texto con comillas y punto y coma es un texto).
 *   - Cambiar una se ve en la siguiente consulta; quitarla la quita; al abrir el proyecto
 *     de nuevo ya están.
 *   - Una sin declarar da un error en palabras.
 *   - El Assistant las ve.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-variables-'));
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
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    const sql = (query) => post('/api/query', { query });
    const abrir = async () => {
        await post('/api/project/open', { path: P });
        await post('/api/db/connect', { path: 'datos.duckdb' });
        await get('/api/fuentes/estado').catch(() => null);
        for (let k = 0; k < 50; k++) { const r = await sql('SELECT 1 AS uno'); if (!r.error) break; await new Promise(x => setTimeout(x, 100)); }
    };
    await abrir();
    await sql(`CREATE OR REPLACE TABLE ventas AS SELECT range AS id, ['norte', 'sur', 'este'][range % 3 + 1] AS region,
        DATE '2024-01-01' + (range % 365)::INTEGER AS fecha, (range % 100)::DOUBLE AS importe FROM range(3000)`);

    console.log('\ndeclararlas');
    let r = await get('/api/variables');
    comprobar('un proyecto sin variables: lista vacía', Array.isArray(r.variables) && r.variables.length === 0 && r.proyecto === true, JSON.stringify(r));
    const LISTA = [
        { nombre: 'region', tipo: 'texto', valor: 'sur', descripcion: 'La región del informe' },
        { nombre: 'minimo', tipo: 'numero', valor: '50' },
        { nombre: 'desde', tipo: 'fecha', valor: '2024-07-01' },
        { nombre: 'solo_activos', tipo: 'logico', valor: true },
        { nombre: 'regiones', tipo: 'lista', valor: ['norte', 'sur'] },
    ];
    r = await put('/api/variables', { variables: LISTA });
    comprobar('se guardan con su tipo', r.status === 200 && r.variables?.length === 5 && r.variables[1].valor === 50, JSON.stringify(r));
    const enDisco = JSON.parse(fs.readFileSync(path.join(P, '.amoxsql', 'variables.json'), 'utf8'));
    comprobar('  en .amoxsql/variables.json, con la descripción', enDisco.version === 1 && enDisco.variables[0].descripcion === 'La región del informe');
    r = await put('/api/variables', { variables: [...LISTA, { nombre: 'mal', tipo: 'numero', valor: '1; DROP TABLE ventas' }] });
    comprobar('un número que no es número no se guarda, y se dice', r.status === 400 && /is a number/.test(r.error || ''), JSON.stringify(r));
    r = await put('/api/variables', { variables: [...LISTA, { nombre: 'Region', tipo: 'texto', valor: 'x' }] });
    comprobar('un nombre repetido no se guarda', r.status === 400 && /declared twice/.test(r.error || ''), JSON.stringify(r));
    comprobar('  y lo guardado sigue igual', JSON.parse(fs.readFileSync(path.join(P, '.amoxsql', 'variables.json'), 'utf8')).variables.length === 5);

    console.log('\nusarlas con $nombre');
    r = await sql('SELECT count(*) AS n FROM ventas WHERE region = $region AND importe >= $minimo AND fecha >= $desde');
    const esperado = await sql("SELECT count(*) AS n FROM ventas WHERE region = 'sur' AND importe >= 50 AND fecha >= DATE '2024-07-01'");
    comprobar('texto, número y fecha, sin comillas a mano', !r.error && r.data?.[0]?.n === esperado.data?.[0]?.n && Number(r.data[0].n) > 0, JSON.stringify(r).slice(0, 200));
    r = await sql('SELECT count(*) AS n FROM ventas WHERE list_contains($regiones, region) AND $solo_activos');
    comprobar('lista y lógico', !r.error && Number(r.data?.[0]?.n) === 2000, JSON.stringify(r).slice(0, 200));
    r = await sql('SELECT id FROM ventas ORDER BY id LIMIT $minimo');
    comprobar('también en LIMIT', !r.error && r.data?.length === 50, JSON.stringify(r).slice(0, 200));
    r = await sql('SELECT typeof($minimo) AS a, typeof($desde) AS b, typeof($regiones) AS c');
    comprobar('cada una con su tipo del motor', r.data?.[0]?.a === 'BIGINT' && r.data[0].b === 'DATE' && r.data[0].c === 'VARCHAR[]', JSON.stringify(r.data));

    console.log('\nen todos los carriles');
    const carriles = [];
    for (const lane of ['main', 'meta', 'ai']) {
        try { carriles.push((await dbManager.systemQuery('SELECT $region AS r', { lane }))[0]?.r); } catch (e) { carriles.push('ERR ' + e.message.split('\n')[0]); }
    }
    comprobar('main, meta y ai (los tres carriles) ven $region', carriles.every(x => x === 'sur'), JSON.stringify(carriles));
    const plan = await post('/api/db/explain', { query: 'SELECT count(*) FROM ventas WHERE region = $region', mode: 'analyze' });
    comprobar('el plan de ejecución de una consulta con $region', !plan.error && plan.metrics?.rowsReturned === 1, JSON.stringify(plan).slice(0, 200));
    const celda = await post('/api/cuaderno/celda', { nombre: 'del_sur', preparacion: 'CREATE OR REPLACE TEMP VIEW del_sur AS (SELECT * FROM ventas WHERE region = $region);', lector: 'SELECT count(*) AS n FROM del_sur' });
    comprobar('una celda del cuaderno con $region', !celda.error && Number(celda.data?.[0]?.n) === 1000, JSON.stringify(celda).slice(0, 200));

    console.log('\nningún valor cambia la consulta');
    await put('/api/variables', { variables: [{ nombre: 'region', tipo: 'texto', valor: "x'; DROP TABLE ventas; --" }] });
    r = await sql('SELECT count(*) AS n, $region AS v FROM ventas WHERE region = $region');
    comprobar('un texto con comillas, ; y -- es sólo un texto', !r.error && Number(r.data?.[0]?.n) === 0 && r.data[0].v === "x'; DROP TABLE ventas; --", JSON.stringify(r).slice(0, 200));
    comprobar('  y la tabla sigue ahí', Number((await sql('SELECT count(*) AS n FROM ventas')).data?.[0]?.n) === 3000);

    console.log('\ncambiar, quitar, volver a abrir');
    await put('/api/variables', { variables: LISTA.map(v => v.nombre === 'region' ? { ...v, valor: 'este' } : v) });
    r = await sql('SELECT $region AS r');
    comprobar('cambiar una se ve en la consulta siguiente', r.data?.[0]?.r === 'este', JSON.stringify(r));
    await put('/api/variables', { variables: LISTA.filter(v => v.nombre !== 'minimo') });
    r = await sql('SELECT $minimo AS m');
    comprobar('quitar una la quita, y el error lo dice en palabras', /\$minimo is not a project variable/.test(r.error || '') && /Library › Snippets › Variables/.test(r.error || ''), JSON.stringify(r));
    await post('/api/db/close', {});
    await abrir();
    r = await sql('SELECT $region AS r, $desde AS d');
    comprobar('al abrir el proyecto otra vez ya están', !r.error && r.data?.[0]?.r === 'sur' && String(r.data[0].d).startsWith('2024-07-01'), JSON.stringify(r).slice(0, 200));

    console.log('\nData Flow');
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    for (const base of ['memoria', 'proyecto']) {
        const p = await ejecutarProceso({
            dbManager, proyecto: P, chainFile: `con_variables_${base}.sqlchain`, origen: base === 'memoria' ? 'programada' : 'interfaz',
            chainDef: { config: { base }, nodes: [
                { id: 'a', type: 'sql_inline', config: { query: 'SELECT $region AS r, $desde AS d, list_contains($regiones, \'sur\') AS l' }, position: { x: 0, y: 0 } },
                { id: 't', type: 'create_table', config: { tableName: `salida_${base}` }, position: { x: 300, y: 0 } },
            ], edges: [{ id: 'e', source: 'a', target: 't' }] },
        });
        comprobar(`un proceso con $variables (base ${base}${base === 'memoria' ? ', programado: contexto aislado' : ''})`, p.status === 'completed', `${p.status} · ${p.error || ''}`);
    }

    console.log('\nel Assistant');
    const { buildProjectContextSection, loadProjectContext } = require(path.join(RAIZ, 'server/ai/contextLoader.js'));
    const ctx = await loadProjectContext(P).catch(() => null);
    const seccion = buildProjectContextSection(ctx || { metrics: [], joins: [], glossary: '', examples: [] });
    comprobar('las ve, con su tipo, valor y descripción', /\$region \(texto\) = sur — La región del informe/.test(seccion) && /\$regiones \(lista\) = \[norte, sur\]/.test(seccion), seccion.slice(0, 400));

    console.log('\nsin proyecto');
    const V = require(path.join(RAIZ, 'server/variables.js'));
    comprobar('leer sin proyecto: nada', V.leer(null).variables.length === 0);
    let err = null; try { V.guardar(null, []); } catch (e) { err = e.message; }
    comprobar('guardar sin proyecto: lo dice', /Open a project/.test(err || ''), err);
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
