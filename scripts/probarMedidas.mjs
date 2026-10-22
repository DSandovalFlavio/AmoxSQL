/**
 * Las medidas del workspace, usables (5.13, fase 2; E1 reducida, Dec-41).
 *
 *     node scripts/probarMedidas.mjs
 *
 * Por el servidor, con un home temporal:
 *   - las medidas del workspace y del proyecto (gana el proyecto) se vuelven
 *     macros con sus columnas como parámetros: `venta_neta(importe, estado, descuento)`;
 *   - se saltan, diciendo por qué, una con nombre de función del motor, una con un
 *     nombre que no es un identificador y una que no compila; las columnas se
 *     pueden dar a mano;
 *   - funcionan en cada carril, tras abrir otra base y en un proceso de Data Flow;
 *   - cambiar metrics.yml se nota sin reiniciar; una medida que se quita, se va;
 *   - el asistente las recibe con su llamada.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-medidas-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(path.join(P, 'context'), { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};

const yaml = (lista) => `metrics:\n${lista.map(m => `  - name: ${m.name}\n    sql: "${m.sql}"${m.description ? `\n    description: ${m.description}` : ''}${m.columns ? `\n    columns: [${m.columns.join(', ')}]` : ''}\n`).join('')}`;
const METRICAS = path.join(P, 'context', 'metrics.yml');

try {
    const { columnasDe } = require(path.join(RAIZ, 'server/medidas.js'));
    console.log('\nlas columnas de una expresión');
    const reservadas = new Set(['sum', 'filter', 'where', 'count', 'distinct', 'case', 'when', 'then', 'end', 'nullif', 'and', 'or', 'double', 'as', 'cast']);
    comprobar('FILTER, cadenas y funciones fuera', JSON.stringify(columnasDe("SUM(importe) FILTER (WHERE estado = 'pagado') - SUM(descuento)", reservadas)) === '["importe","estado","descuento"]');
    comprobar('un tipo tras :: no es una columna', JSON.stringify(columnasDe("COUNT(*) FILTER (WHERE estado = 'x')::DOUBLE / COUNT(*)", reservadas)) === '["estado"]');
    comprobar('una columna entre comillas dobles, con su espacio', JSON.stringify(columnasDe('SUM("Importe neto")', reservadas)) === '["Importe neto"]');

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { loadProjectContext, buildProjectContextSection } = require(path.join(RAIZ, 'server/ai/contextLoader.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');
    const sql = (query) => post('/api/query', { query });

    // El workspace, con sus medidas; el proyecto, con las suyas (una sobrescribe).
    const ws = await post('/api/workspaces', { nombre: 'Cliente Norte' });
    const wsId = ws.id || ws.workspace?.id;
    const dirWs = path.join(process.env.AMOXSQL_HOME, 'workspaces', wsId, 'contexto');
    fs.mkdirSync(dirWs, { recursive: true });
    fs.writeFileSync(path.join(dirWs, 'metrics.yml'), yaml([
        { name: 'venta_neta', sql: 'SUM(importe)', description: 'La del workspace (el proyecto la cambia)' },
        { name: 'ticket_medio', sql: 'SUM(importe) / NULLIF(COUNT(DISTINCT folio), 0)', description: 'Importe por ticket' },
    ]));
    fs.writeFileSync(METRICAS, yaml([
        { name: 'venta_neta', sql: "SUM(importe) FILTER (WHERE estado = 'pagado') - SUM(descuento)", description: 'Lo cobrado, menos descuentos' },
        { name: 'sum', sql: 'SUM(importe)' },
        { name: 'venta neta', sql: 'SUM(importe)' },
        { name: 'rota', sql: 'SUM(importe) FILTER (WHERE' },
        { name: 'margen_manual', sql: 'SUM(importe - costo) / SUM(importe)', columns: ['importe', 'costo'] },
    ]));
    await post('/api/project/open', { path: P });
    await put('/api/proyectos-enlace', { ruta: P, workspaceId: wsId });
    await post('/api/db/connect', { path: ':memory:' });
    await sql(`CREATE TABLE ventas AS SELECT * FROM (VALUES
        (1, 'norte', 100.0, 'pagado', 5.0, 60.0), (2, 'norte', 50.0, 'devuelto', 0.0, 30.0), (3, 'sur', 80.0, 'pagado', 0.0, 40.0)
    ) t(folio, tienda, importe, estado, descuento, costo)`);

    console.log('\nlo que se monta');
    let m = (await get('/api/medidas')).medidas || [];
    const de = (n) => m.find(x => x.nombre === n);
    comprobar('la del proyecto gana a la del workspace, con su llamada', de('venta_neta')?.estado === 'lista' && de('venta_neta').llamada === 'venta_neta(importe, estado, descuento)' && de('venta_neta').origen === 'proyecto', JSON.stringify(de('venta_neta')));
    comprobar('la del workspace sola, también', de('ticket_medio')?.estado === 'lista' && de('ticket_medio').origen === 'workspace', JSON.stringify(de('ticket_medio')));
    comprobar('«sum» no se crea: ya es una función del motor', de('sum')?.estado === 'saltada' && /already a function/.test(de('sum').motivo), JSON.stringify(de('sum')));
    comprobar('un nombre con espacio, tampoco (se dice por qué)', de('venta neta')?.estado === 'saltada' && /letters, digits/.test(de('venta neta').motivo));
    comprobar('una que no compila se salta con su error', de('rota')?.estado === 'saltada' && !!de('rota').motivo, JSON.stringify(de('rota')));
    comprobar('las columnas dadas a mano', de('margen_manual')?.llamada === 'margen_manual(importe, costo)', JSON.stringify(de('margen_manual')));

    console.log('\nusarlas');
    let q = await sql('SELECT tienda, venta_neta(importe, estado, descuento) AS v FROM ventas GROUP BY ALL ORDER BY 1');
    comprobar('agrupada, en el editor', JSON.stringify(q.data) === JSON.stringify([{ tienda: 'norte', v: 95 }, { tienda: 'sur', v: 80 }]) || JSON.stringify(q.data?.map(r => Number(r.v))) === '[95,80]', JSON.stringify(q));
    q = await sql('SELECT ticket_medio(importe, folio) AS t FROM ventas');
    comprobar('sin agrupar', Math.abs(Number(q.data?.[0]?.t) - 76.6667) < 0.01, JSON.stringify(q));
    q = await sql('SELECT sum(importe) AS s FROM ventas');
    comprobar('sum() sigue siendo la del motor', Number(q.data?.[0]?.s) === 230, JSON.stringify(q));
    let r = await dbManager.lane('ai').query('SELECT venta_neta(importe, estado, descuento) AS v FROM ventas');
    comprobar('en el carril del asistente', Number(r?.[0]?.v) === 175, JSON.stringify(r));
    r = await dbManager.systemQuery('SELECT margen_manual(importe, costo) AS v FROM ventas', { lane: 'meta' });
    comprobar('en el carril de metadatos', Math.abs(Number(r?.[0]?.v) - 0.4348) < 0.01, JSON.stringify(r));

    console.log('\nal abrir otra base');
    await post('/api/db/connect', { path: 'tienda.duckdb' });
    await sql(`CREATE TABLE v2 AS SELECT 10.0 AS importe, 'pagado' AS estado, 1.0 AS descuento`);
    q = await sql('SELECT venta_neta(importe, estado, descuento) AS v FROM v2');
    comprobar('siguen ahí (el motor se reinició)', Number(q.data?.[0]?.v) === 9, JSON.stringify(q));

    console.log('\nen un proceso de Data Flow');
    const proceso = { name: 'Medidas', config: { base: 'memoria' }, edges: [], nodes: [{ id: 'q', type: 'sql_inline', label: 'Ventas', config: { query: "SELECT venta_neta(importe, estado, descuento) AS v FROM (VALUES (20.0, 'pagado', 2.0)) t(importe, estado, descuento)" } }] };
    r = await post('/api/chains/run', { chainDefinition: proceso, chainFile: 'medidas.sqlchain' });
    comprobar('en su contexto aislado, también', r.status === 'completed', JSON.stringify(r));

    console.log('\nal cambiar metrics.yml');
    fs.writeFileSync(METRICAS, yaml([{ name: 'venta_bruta', sql: 'SUM(importe)', description: 'Sin descontar nada' }]));
    m = (await get('/api/medidas')).medidas || [];
    comprobar('se nota sin reiniciar', m.some(x => x.nombre === 'venta_bruta' && x.estado === 'lista'), JSON.stringify(m.map(x => x.nombre)));
    q = await sql('SELECT venta_bruta(importe) AS v FROM v2');
    comprobar('  y la nueva se usa', Number(q.data?.[0]?.v) === 10, JSON.stringify(q));
    q = await sql('SELECT venta_neta(importe) AS v FROM v2');
    comprobar('la que se quitó del proyecto vuelve a ser la del workspace, con SU firma', Number(q.data?.[0]?.v) === 10, JSON.stringify(q));
    q = await sql('SELECT margen_manual(importe, importe) AS v FROM v2');
    comprobar('una que se quitó del todo, se va', !!q.error && /margen_manual/.test(q.error), JSON.stringify(q).slice(0, 200));

    console.log('\nel asistente');
    const ctx = await loadProjectContext(P);
    const texto = buildProjectContextSection(ctx);
    comprobar('recibe la llamada de las que el motor tiene', texto.includes('Use it as the SQL function `venta_bruta(importe)`'), texto.slice(0, 600));

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
