/**
 * Esquemas anidados de DuckDB 2 (6.0, fase 1).
 *
 *     node scripts/probarEsquemasAnidados.mjs
 *
 * `CREATE SCHEMA ventas.crudo` crea un esquema dentro de otro. `information_schema`
 * da sólo «crudo», y `crudo.tabla` no resuelve; dos padres pueden tener un «crudo» cada
 * uno. AmoxSQL los enseña con su ruta (`ventas.crudo`) en el explorador, el ER, la
 * vista de una tabla, las descripciones, la herramienta del asistente y Data Flow, y
 * los esquemas de siempre siguen igual.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-anidados-'));
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

try {
    const esq = require(path.join(RAIZ, 'server/esquemas.js'));
    console.log('\nlas rutas');
    comprobar('partes de una ruta', JSON.stringify(esq.partes('ventas.crudo')) === '["ventas","crudo"]' && JSON.stringify(esq.partes('"a.b".c')) === '["a.b","c"]' && JSON.stringify(esq.partes('main')) === '["main"]');
    comprobar('citar una ruta', esq.citarRuta('ventas.crudo') === '"ventas"."crudo"' && esq.citarRuta('"x""y".z') === '"x""y"."z"');
    comprobar('la referencia a una tabla', esq.referencia('ventas.crudo', 'pedidos') === '"ventas"."crudo"."pedidos"' && esq.referencia(null, 't') === '"t"' && esq.referencia('main', 't', 'user_db') === '"user_db"."main"."t"');

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
    const get = pedir('GET'), post = pedir('POST');
    const sql = (query) => post('/api/query', { query });
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'anidados.duckdb' });
    for (const s of [
        'CREATE TABLE plana AS SELECT 1 AS x',
        'CREATE SCHEMA ventas', 'CREATE SCHEMA ventas.crudo', 'CREATE SCHEMA ventas.crudo.hondo',
        'CREATE SCHEMA compras', 'CREATE SCHEMA compras.crudo',
        'CREATE TABLE ventas.crudo.pedidos (id INTEGER PRIMARY KEY, importe DOUBLE)',
        'INSERT INTO ventas.crudo.pedidos VALUES (1, 10), (2, 20)',
        'CREATE TABLE ventas.crudo.lineas (id INTEGER, pedido INTEGER REFERENCES ventas.crudo.pedidos (id))',
        'CREATE TABLE compras.crudo.pedidos AS SELECT 7 AS otro',
        'CREATE TABLE ventas.crudo.hondo.x AS SELECT 3 AS id',
        'CREATE VIEW ventas.crudo.v AS SELECT * FROM ventas.crudo.pedidos',
        "COMMENT ON TABLE ventas.crudo.pedidos IS 'Los pedidos crudos'",
        "COMMENT ON COLUMN ventas.crudo.pedidos.importe IS 'En pesos'",
    ]) {
        const r = await sql(s);
        if (r.error) comprobar(`preparar: ${s}`, false, r.error);
    }

    console.log('\nel explorador');
    const arbol = await get('/api/db/schemas');
    const nombres = arbol.map(s => s.schema);
    comprobar('cada esquema con su ruta', ['main', 'ventas.crudo', 'compras.crudo', 'ventas.crudo.hondo'].every(n => nombres.includes(n)) && !nombres.includes('crudo'), JSON.stringify(nombres));
    const vc = arbol.find(s => s.schema === 'ventas.crudo');
    const cc = arbol.find(s => s.schema === 'compras.crudo');
    comprobar('los dos «crudo» no se mezclan', vc?.tables.map(t => t.name).sort().join() === 'lineas,pedidos,v' && cc?.tables.map(t => t.name).join() === 'pedidos', `${vc?.tables.map(t => t.name)} · ${cc?.tables.map(t => t.name)}`);
    const ped = vc?.tables.find(t => t.name === 'pedidos');
    comprobar('las columnas de cada uno, sin las del otro', ped?.columns.map(c => c.column_name).join() === 'id,importe', JSON.stringify(ped?.columns));
    comprobar('la descripción de la tabla y de la columna', ped?.descripcion === 'Los pedidos crudos' && ped.columns.find(c => c.column_name === 'importe')?.descripcion === 'En pesos', JSON.stringify(ped));
    comprobar('lo de siempre igual: main con su tabla', arbol.find(s => s.schema === 'main')?.tables.some(t => t.name === 'plana'));

    await sql('CREATE SCHEMA ventas.vacio');
    const conVacio = (await get('/api/db/schemas')).map(s => s.schema);
    comprobar('un esquema vacío (recién creado) también sale', conVacio.includes('ventas.vacio') && conVacio.includes('ventas'), JSON.stringify(conVacio));
    comprobar('  y main vacío no se inventa, ni los internos', conVacio.filter(x => x === 'main').length === 1 && !conVacio.some(x => /^amoxsql/.test(x)), JSON.stringify(conVacio));
    const tablas = await get('/api/db/tables');
    const t2 = tablas.find(t => t.schema === 'compras.crudo' && t.name === 'pedidos');
    comprobar('/api/db/tables: ruta y columnas propias', t2 && t2.columns.map(c => c.column_name).join() === 'otro', JSON.stringify(t2));

    console.log('\nver una tabla');
    let d = await post('/api/db/table-details', { tableName: 'pedidos', schema: 'ventas.crudo' });
    comprobar('table-details con la ruta del esquema', !d.error && JSON.stringify(d).includes('importe'), JSON.stringify(d).slice(0, 200));
    d = await post('/api/db/table-details', { tableName: 'x', schema: 'ventas.crudo.hondo' });
    comprobar('  también tres niveles', !d.error, JSON.stringify(d).slice(0, 200));

    console.log('\nel diagrama');
    const er = await get('/api/db/er-schema');
    const lst = Array.isArray(er) ? er : (er.tables || []);
    const lineas = lst.find(t => t.schema === 'ventas.crudo' && t.name === 'lineas');
    const pedidosEr = lst.find(t => t.schema === 'ventas.crudo' && t.name === 'pedidos');
    comprobar('el ER los trae con su ruta', !!lineas && !!pedidosEr, JSON.stringify(lst.map(t => `${t.schema}.${t.name}`)));
    comprobar('  con su llave primaria y su llave foránea', (pedidosEr?.columns || []).some(c => c.name === 'id' && c.isPK) && (lineas?.columns || []).some(c => c.fk?.table === 'pedidos'), JSON.stringify(lineas).slice(0, 300));
    const soloUno = await get(`/api/db/er-schema?schema=${encodeURIComponent('compras.crudo')}`);
    const l2 = Array.isArray(soloUno) ? soloUno : (soloUno.tables || []);
    comprobar('  filtrado a un esquema anidado', l2.length === 1 && l2[0].schema === 'compras.crudo', JSON.stringify(l2.map(t => t.schema)));

    console.log('\nel asistente');
    const { createTools } = require(path.join(RAIZ, 'server/ai/tools.js'));
    const fabrica = createTools || require(path.join(RAIZ, 'server/ai/tools.js')).crearHerramientas || require(path.join(RAIZ, 'server/ai/tools.js')).default;
    if (typeof fabrica === 'function') {
        const tools = fabrica({ db: dbManager, dbManager, projectPath: P });
        const lt = await tools.list_tables.execute({});
        const nombresIa = (lt.tables || []).map(t => `${t.schema}.${t.name}`);
        comprobar('list_tables da la ruta y cuenta las filas', nombresIa.includes('ventas.crudo.pedidos') && nombresIa.includes('compras.crudo.pedidos') && lt.tables.find(t => t.schema === 'ventas.crudo' && t.name === 'pedidos')?.rows == 2, JSON.stringify(lt).slice(0, 300));
        const dt = await tools.describe_table.execute({ table_name: 'ventas.crudo.pedidos' });
        comprobar('describe_table con la ruta entera', !dt.error && dt.columns?.map(c => c.name).join() === 'id,importe' && dt.description === 'Los pedidos crudos', JSON.stringify(dt).slice(0, 300));
        const dt2 = await tools.describe_table.execute({ table_name: 'plana' });
        comprobar('  y una tabla de main sin esquema', !dt2.error && dt2.columns?.[0]?.name === 'x', JSON.stringify(dt2).slice(0, 200));
    } else comprobar('las herramientas del asistente se cargan', false, Object.keys(require(path.join(RAIZ, 'server/ai/tools.js'))).join());

    console.log('\nData Flow');
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const r = await ejecutarProceso({
        dbManager, proyecto: P, chainFile: 'anidados.sqlchain', origen: 'interfaz',
        chainDef: { config: { base: 'proyecto' }, nodes: [
            { id: 't', type: 'table_ref', config: { tableName: 'ventas.crudo.pedidos' }, position: { x: 0, y: 0 } },
            { id: 'c', type: 'create_table', config: { tableName: 'copia' }, position: { x: 300, y: 0 } },
        ], edges: [{ id: 'e', source: 't', target: 'c' }] },
    });
    comprobar('una tabla de un esquema anidado como entrada', r.status === 'completed', `${r.status} · ${r.error || ''}`);
    const q = await sql('SELECT sum(importe) AS s FROM copia');
    comprobar('  y lo que deja tiene sus filas', Number(q.data?.[0]?.s) === 30, JSON.stringify(q).slice(0, 200));

    console.log('\nimportar a un esquema anidado');
    const csv = path.join(P, 'datos.csv');
    fs.writeFileSync(csv, 'a,b\n1,2\n3,4\n');
    const imp = await post('/api/db/import', { filePath: 'datos.csv', tableName: 'importada', schema: 'carga.dia' });
    const q2 = await sql('SELECT count(*) AS n FROM carga.dia.importada');
    comprobar('crea los dos niveles y deja la tabla', !imp.error && Number(q2.data?.[0]?.n) === 2, JSON.stringify(imp).slice(0, 200) + ' · ' + JSON.stringify(q2).slice(0, 200));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
