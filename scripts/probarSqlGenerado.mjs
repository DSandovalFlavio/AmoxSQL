/**
 * El SQL que escribe AmoxSQL, contra el motor de la app (6.0, Dec-66).
 *
 *     node scripts/probarSqlGenerado.mjs
 *
 * DuckDB 2.0 dejó de aceptar cosas que 1.x aceptaba (lambdas `x -> …`, `NULL` sin tipo
 * que crea una columna de tipo "NULL", `//` y `%` entre cero lanzan error, `~` busca
 * coincidencia parcial). Esta guarda junta lo que generan los constructores de SQL de
 * AmoxSQL, lo EJECUTA con el motor y además lo revisa con una lista de construcciones
 * prohibidas:
 *   1. Data Flow: cada paso de transformación con una configuración típica, por los dos
 *      caminos (el «SQL equivalente» de cada nodo y la ejecución real del proceso).
 *   2. El tope de filas (`applyRowLimit`) sobre cada forma de sentencia que devuelve filas.
 *   3. Los totales de un gráfico en DuckDB (`sqlDeAgregado`).
 *   4. El Canvas: el SQL autónomo de una tarjeta con sus padres como CTE.
 *   5. El cuaderno: la vista implícita de una celda.
 *   6. Los parámetros de Data Flow (`SET VARIABLE` + `getvariable`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire, register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-sqlgen-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');      // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(P, { recursive: true });

const require = createRequire(import.meta.url);
// El código del cliente importa sin extensión (lo resuelve Vite) y sus paquetes viven en
// client/node_modules: el mismo gancho de resolución que probarGraficos.
const CLIENTE = path.join(RAIZ, 'client');
register('data:text/javascript,' + encodeURIComponent(`
    const CLIENTE = ${JSON.stringify(pathToFileURL(CLIENTE + '/package.json').href)};
    export async function resolve(esp, ctx, sig) {
        if (/^\\.\\.?\\//.test(esp) && !/\\.[cm]?jsx?$/.test(esp)) {
            try { return await sig(esp + '.js', ctx); } catch { /* sigue */ }
        }
        if (!/^(node:|data:|file:|\\.|\\/)/.test(esp)) {
            try { return await sig(esp, ctx); } catch { return sig(esp, { ...ctx, parentURL: CLIENTE }); }
        }
        return sig(esp, ctx);
    }
`));
const importar = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

// Lo que 2.0 rompe, en el texto. Se quitan antes los literales y los comentarios.
const sinLiterales = (s) => String(s).replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const PROHIBIDO = [
    // `j -> 'clave'` y `j ->> 'clave'` (JSON) siguen valiendo: la lambda va seguida de una expresión.
    { nombre: 'lambda con flecha (x -> …)', re: /\b[a-z_]\w*\s*->(?!>)(?!\s*['"\d$])/i },
    { nombre: 'lambda con flecha ((x, y) -> …)', re: /\(\s*[a-z_]\w*\s*(,\s*[a-z_]\w*\s*)+\)\s*->(?!>)/i },
    { nombre: 'NULL sin tipo como columna', re: /SELECT\s+NULL\b(?!\s*::)(?!\s+WHERE)/i },
    { nombre: 'división entera // sin TRY', re: /\/\// },
];
function revisar(titulo, sql) {
    const t = sinLiterales(sql);
    const malas = PROHIBIDO.filter(p => p.re.test(t)).map(p => p.nombre);
    if (malas.length) comprobar(`${titulo}: sin construcciones que 2.0 rompe`, false, `${malas.join(', ')} · ${sql.slice(0, 160)}`);
    return !malas.length;
}

try {
    const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
    const motor = await crearInstancia(':memory:');
    const con = await motor.connect();
    const correr = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson();
    const version = (await correr('SELECT version() AS v'))[0].v;
    console.log(`motor ${version}`);
    await con.run(`CREATE TABLE ventas AS SELECT range AS id, ['norte', 'sur', 'este'][range % 3 + 1] AS region,
        DATE '2024-01-01' + (range % 365)::INTEGER AS fecha, (range * 37 % 1000)::DECIMAL(10,2) AS importe,
        CASE WHEN range % 10 = 0 THEN NULL ELSE 'cliente ' || (range % 40) END AS cliente,
        '{"a": ' || range || ', "b": [1, 2]}' AS datos, (range % 4)::VARCHAR AS texto_num
        FROM range(2000)`);
    await con.run(`CREATE TABLE regiones AS SELECT * FROM (VALUES ('norte', 'N'), ('sur', 'S'), ('este', 'E')) t(region, clave)`);

    // ── 1. Data Flow ─────────────────────────────────────────────────────────────
    console.log('\nData Flow: cada paso');
    const ChainExecutor = require(path.join(RAIZ, 'server/ChainExecutor.js'));
    const ex = ChainExecutor.buildNodeSql ? ChainExecutor : (ChainExecutor.default || ChainExecutor);
    const PASOS = {
        filter: { conditions: [{ column: 'importe', operator: '>', value: '100' }, { column: 'cliente', operator: 'IS NOT NULL' }, { column: 'region', operator: 'IN', value: 'norte, sur' }, { column: 'fecha', operator: 'BETWEEN', value: '2024-02-01', value2: '2024-06-30' }, { column: 'cliente', operator: 'LIKE', value: "cliente 1%" }] },
        group_aggregate: { groupColumns: ['region'], aggregations: [{ column: 'importe', func: 'SUM', alias: 'total' }, { column: 'id', func: 'COUNT', alias: 'n' }, { column: 'importe', func: 'AVG', alias: 'media' }, { column: 'cliente', func: 'COUNT_DISTINCT', alias: 'clientes' }] },
        select_columns: { columns: [{ name: 'id' }, { name: 'importe', alias: 'monto' }] },
        deduplicate: { keyColumns: ['cliente'], keep: 'last' },
        add_column: { newColumns: [{ name: 'doble', expression: 'importe * 2' }, { name: 'mes', expression: "date_trunc('month', fecha)::DATE" }] },
        sort: { sortColumns: [{ column: 'importe', direction: 'DESC' }, { column: 'id' }] },
        sample: { sampleType: 'stratified', strataColumn: 'region', sampleValue: '5' },
        pivot: { groupColumn: 'region', pivotColumn: 'texto_num', valueColumn: 'importe', aggFunc: 'SUM' },
        unpivot: { valueColumns: ['importe', 'id'], nameColumn: 'campo', valueColumn: 'valor' },
        type_cast: { casts: [{ column: 'texto_num', targetType: 'INTEGER' }] },
        window_functions: { windows: [{ func: 'ROW_NUMBER', partitionBy: ['region'], orderBy: ['importe'], alias: 'puesto' }, { func: 'SUM', column: 'importe', partitionBy: ['region'], alias: 'acumulado' }, { func: 'LAG', column: 'importe', orderBy: ['id'], alias: 'anterior' }] },
        date_ops: { operations: [{ column: 'fecha', operation: 'extract', part: 'month', alias: 'mes' }, { column: 'fecha', operation: 'trunc', part: 'week', alias: 'semana' }] },
        flatten: { column: 'datos', mode: 'json' },
        clean: { operations: [{ column: 'cliente', operation: 'trim' }, { column: 'cliente', operation: 'fill_null', value: 'sin cliente' }] },
    };
    const fuenteSql = 'SELECT * FROM ventas';
    for (const [tipo, config] of Object.entries(PASOS)) {
        let sql = null;
        try { sql = ex.buildNodeSql({ id: `n_${tipo}`, type: tipo, config }, [fuenteSql], 'guarda.sqlchain', {}, P); }
        catch (e) { comprobar(`${tipo}: el SQL equivalente se construye`, false, e.message); continue; }
        if (!sql || /^\s*--/.test(sql)) { console.log(`        (${tipo}: sin SQL equivalente en línea)`); continue; }
        if (!revisar(tipo, sql)) continue;
        try { await con.run(sql); comprobar(`${tipo}: el SQL equivalente corre`, true); }
        catch (e) { comprobar(`${tipo}: el SQL equivalente corre`, false, `${e.message.split('\n')[0]} · ${sql.slice(0, 200)}`); }
    }
    // Sin nodo de entrada: el relleno lleva tipo (un NULL sin tipo hace una columna "NULL").
    const solo = ex.buildNodeSql({ id: 'suelto', type: 'filter', config: PASOS.filter }, [], 'guarda.sqlchain', {}, P);
    comprobar('un paso sin entrada no usa NULL sin tipo', revisar('paso sin entrada', solo) && /NULL::VARCHAR/.test(solo), solo);
    const crear = ex.buildNodeSql({ id: 'c', type: 'create_table', config: { tableName: 'vacia' } }, [], 'guarda.sqlchain', {}, P);
    await con.run(crear);
    const tipoVacia = await correr("SELECT data_type FROM information_schema.columns WHERE table_name = 'vacia'");
    comprobar('  y la tabla que deja tiene una columna con tipo', tipoVacia.length === 1 && tipoVacia[0].data_type === 'VARCHAR', JSON.stringify(tipoVacia));
    {
        const d = ex.buildNodeSql({ id: 'd', type: 'deduplicate', config: { keyColumns: ['region'], keep: 'first' } }, [fuenteSql], 'guarda.sqlchain', {}, P);
        const f = await correr(d.replace(/^CREATE OR REPLACE TABLE "[^"]+" AS /, '') + ' ORDER BY id');
        comprobar('deduplicate deja la PRIMERA fila de cada clave y no añade columnas', f.length === 3 && f.map(x => Number(x.id)).join() === '0,1,2' && !('_rn' in f[0]) && !('_orden' in f[0]), JSON.stringify(f[0]));
        const m = ex.buildNodeSql({ id: 's', type: 'sample', config: PASOS.sample }, [fuenteSql], 'guarda.sqlchain', {}, P);
        const g = await correr(`SELECT region, count(*) AS n FROM (${m.replace(/^CREATE OR REPLACE TABLE "[^"]+" AS /, '')}) GROUP BY ALL`);
        comprobar('la muestra estratificada deja 5 por región y no añade columnas', g.length === 3 && g.every(x => Number(x.n) === 5), JSON.stringify(g));
        const u = ex.buildNodeSql({ id: 'u', type: 'unpivot', config: PASOS.unpivot }, ['SELECT id, importe FROM ventas'], 'guarda.sqlchain', {}, P);
        const h = await correr(`SELECT campo, count(*) AS n FROM (${u.replace(/^CREATE OR REPLACE TABLE "[^"]+" AS /, '')}) GROUP BY ALL ORDER BY 1`);
        comprobar('unpivot de dos columnas da dos nombres', h.map(x => x.campo).join() === 'id,importe', JSON.stringify(h));
    }
    const unir = ex.buildNodeSql({ id: 'j', type: 'join_tables', config: { joinType: 'LEFT', keys: [{ left: 'region', right: 'region' }] } }, [fuenteSql, 'SELECT * FROM regiones'], 'guarda.sqlchain', {}, P);
    if (revisar('join_tables', unir)) { try { await con.run(unir); comprobar('join_tables: el SQL equivalente corre', true); } catch (e) { comprobar('join_tables: el SQL equivalente corre', false, e.message.split('\n')[0]); } }
    const juntar = ex.buildNodeSql({ id: 'm', type: 'merge_tables', config: { mergeMode: 'union_all' } }, [fuenteSql, fuenteSql], 'guarda.sqlchain', {}, P);
    if (revisar('merge_tables', juntar)) { try { await con.run(juntar); comprobar('merge_tables: el SQL equivalente corre', true); } catch (e) { comprobar('merge_tables: el SQL equivalente corre', false, e.message.split('\n')[0]); } }

    // 6.0 (M7): cada paso de server/flujos/pasos.js se define una vez. Lo que se ejecuta
    // y el SQL equivalente son el mismo SELECT (con otro prefijo si el paso es una vista).
    {
        const { PASOS: definidos } = require(path.join(RAIZ, 'server/flujos/pasos.js'));
        const cuerpo = (s) => String(s || '').replace(/^CREATE OR REPLACE (?:TEMP )?(?:TABLE|VIEW) "[^"]+" AS /, '');
        const distintos = [];
        for (const tipo of Object.keys(definidos)) {
            const config = PASOS[tipo];
            if (!config) { distintos.push(`${tipo} (sin configuración en la guarda)`); continue; }
            const nodo = { id: `u_${tipo}`, type: tipo, config };
            const exportado = ex.buildNodeSql(nodo, [ex.outputToQuery({ table: 'ventas' })], 'guarda.sqlchain', {}, P);
            const corrido = [];
            const falso = { query: async (q) => { corrido.push(q); return [{ cnt: 0 }]; } };
            await ex.executeNode(nodo, falso, P, [{ table: 'ventas' }], { chainFile: 'guarda.sqlchain' });
            const principal = corrido.find(q => /^CREATE OR REPLACE/.test(q));
            if (cuerpo(principal) !== cuerpo(exportado)) distintos.push(tipo);
        }
        comprobar(`los ${Object.keys(definidos).length} pasos definidos una vez: lo que corre = lo que se exporta`, !distintos.length, distintos.join(', '));
        // Antes divergían: un operador desconocido era «=» al correr y quedaba tal cual al exportar.
        const raro = ex.buildNodeSql({ id: 'r', type: 'filter', config: { conditions: [{ column: 'region', operator: '<>', value: 'sur' }] } }, [fuenteSql], 'guarda.sqlchain', {}, P);
        comprobar('  un operador desconocido del filtro se exporta como se ejecuta', /"region" = 'sur'/.test(raro), raro);
    }

    console.log('\nData Flow: el proceso de verdad, con el motor de la app');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
    const { ejecutarProceso } = require(path.join(RAIZ, 'server/ejecucion/ejecutarProceso.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const post = (q, b) => fetch(`http://localhost:${port}${q}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'guarda.duckdb' });
    await post('/api/query', { query: `CREATE OR REPLACE TABLE ventas AS SELECT range AS id, ['norte', 'sur', 'este'][range % 3 + 1] AS region, DATE '2024-01-01' + (range % 365)::INTEGER AS fecha, (range * 37 % 1000)::DECIMAL(10,2) AS importe, CASE WHEN range % 10 = 0 THEN NULL ELSE 'cliente ' || (range % 40) END AS cliente, '{"a": ' || range || ', "b": [1, 2]}' AS datos, (range % 4)::VARCHAR AS texto_num FROM range(2000)` });
    await post('/api/query', { query: `CREATE OR REPLACE TABLE regiones AS SELECT * FROM (VALUES ('norte', 'N'), ('sur', 'S'), ('este', 'E')) t(region, clave)` });

    for (const [tipo, config] of Object.entries(PASOS)) {
        const chainDef = {
            config: { base: 'proyecto' },
            nodes: [
                { id: 'origen', type: 'sql_inline', config: { query: 'SELECT * FROM ventas' }, position: { x: 0, y: 0 } },
                { id: 'paso', type: tipo, config, position: { x: 300, y: 0 } },
            ],
            edges: [{ id: 'e1', source: 'origen', target: 'paso' }],
        };
        const r = await ejecutarProceso({ dbManager, chainDef, proyecto: P, chainFile: `guarda_${tipo}.sqlchain`, origen: 'interfaz' });
        comprobar(`${tipo}: corre en un proceso`, r.status === 'completed', `${r.status} · ${r.error || ''}`.slice(0, 300));
    }
    {
        const chainDef = {
            config: { base: 'proyecto' },
            variables: { minimo: '100', region: "nor'te" },
            parametros: [{ nombre: 'minimo', tipo: 'numero' }, { nombre: 'region', tipo: 'texto' }],
            nodes: [
                { id: 'a', type: 'sql_inline', config: { query: 'SELECT * FROM ventas WHERE importe > ${minimo}' }, position: { x: 0, y: 0 } },
                { id: 'b', type: 'sql_inline', config: { query: 'SELECT * FROM regiones' }, position: { x: 0, y: 200 } },
                { id: 'j', type: 'join_tables', config: { joinType: 'LEFT', keys: [{ left: 'region', right: 'region' }] }, position: { x: 300, y: 0 } },
                { id: 'm', type: 'merge_tables', config: { mergeMode: 'union_all' }, position: { x: 300, y: 300 } },
                { id: 'f', type: 'filter', config: { conditions: [{ column: 'region', operator: '!=', value: '${region}' }] }, position: { x: 600, y: 0 } },
                { id: 't', type: 'create_table', config: { tableName: 'resultado_guarda' }, position: { x: 900, y: 0 } },
            ],
            edges: [
                { id: 'e1', source: 'a', target: 'j' }, { id: 'e2', source: 'b', target: 'j' },
                { id: 'e3', source: 'a', target: 'm' }, { id: 'e4', source: 'a', target: 'm' },
                { id: 'e5', source: 'j', target: 'f' }, { id: 'e6', source: 'f', target: 't' },
            ],
        };
        let r = await ejecutarProceso({ dbManager, chainDef, proyecto: P, chainFile: 'guarda_varios.sqlchain', origen: 'interfaz', deFuera: { minimo: '500', region: 'sur' } });
        comprobar('unir, juntar, filtrar con parámetros de fuera y crear tabla', r.status === 'completed', `${r.status} · ${r.error || ''}`.slice(0, 300));
        const q = await post('/api/query', { query: "SELECT count(*) AS n, min(importe) AS m, count(*) FILTER (region = 'sur') AS sur FROM resultado_guarda" });
        comprobar('  los dos parámetros filtran con su tipo', q.data?.[0]?.n > 0 && Number(q.data[0].m) > 500 && Number(q.data[0].sur) === 0, JSON.stringify(q).slice(0, 200));
        r = await ejecutarProceso({ dbManager, chainDef, proyecto: P, chainFile: 'guarda_varios.sqlchain', origen: 'interfaz', deFuera: { minimo: '500', region: "x'; DROP TABLE ventas; --" } });
        comprobar('  un valor de fuera que intenta cambiar la consulta se rechaza', r.status === 'failed' && /cannot contain quotes/.test(r.error || ''), `${r.status} · ${r.error || ''}`.slice(0, 200));
        const sigue = await post('/api/query', { query: 'SELECT count(*) AS n FROM ventas' });
        comprobar('  la tabla de origen sigue ahí', sigue.data?.[0]?.n == 2000);
    }

    // ── 2. El tope de filas ─────────────────────────────────────────────────────
    console.log('\nel tope de filas');
    const { applyRowLimit } = require(path.join(RAIZ, 'server/_sqlUtils.js'));
    const FORMAS = {
        'SELECT': 'SELECT * FROM ventas',
        'WITH': 'WITH x AS (SELECT * FROM ventas) SELECT region, count(*) FROM x GROUP BY ALL',
        'FROM primero': 'FROM ventas SELECT id',
        'FROM a secas': 'FROM ventas',
        'VALUES': "VALUES (1, 'a'), (2, 'b')",
        'TABLE': 'TABLE ventas',
        'PIVOT': 'PIVOT ventas ON region USING sum(importe)',
        'UNPIVOT': 'UNPIVOT (SELECT id, importe, id AS otro FROM ventas) ON importe, otro INTO NAME k VALUE v',
        'paréntesis': '(SELECT 1 AS x) UNION ALL (SELECT 2)',
        'con ; y comentario': '-- arriba\nSELECT id FROM ventas; ',
        'FETCH FIRST': 'SELECT id FROM ventas ORDER BY id FETCH FIRST 3 ROWS ONLY',
        'lambda nueva': 'SELECT list_transform([1, 2, 3], lambda x: x + 1) AS l',
        'QUALIFY': 'SELECT * FROM ventas QUALIFY row_number() OVER (PARTITION BY region ORDER BY importe DESC) = 1',
    };
    for (const [n, q] of Object.entries(FORMAS)) {
        const r = applyRowLimit(q, 10);
        try {
            const filas = await correr(r.sql);
            comprobar(`${n}: envuelto, corre y no pasa de 11`, r.limited && filas.length <= 11, r.sql.slice(0, 120));
        } catch (e) { comprobar(`${n}: envuelto, corre y no pasa de 11`, false, `${e.message.split('\n')[0]} · ${r.sql.slice(0, 160)}`); }
    }
    for (const q of ['CREATE TABLE z AS SELECT 1', 'INSERT INTO ventas SELECT * FROM ventas LIMIT 0', "SET VARIABLE x = 1", 'DESCRIBE ventas']) {
        comprobar(`no se envuelve: ${q.split(' ').slice(0, 2).join(' ')}`, applyRowLimit(q, 10).limited === false);
    }

    // ── 3. Totales de un gráfico ────────────────────────────────────────────────
    console.log('\nlos totales de un gráfico');
    const { sqlDeAgregado } = await importar('client/src/components/DataVisualizer/vega/agregar.js');
    const CONSULTA = 'SELECT region, fecha, importe, cliente FROM ventas';
    const graficos = {
        'barras por texto': [{ chartType: 'bar', xAxisKey: 'region', yAxisKeys: ['importe'] }, {}],
        'líneas por mes': [{ chartType: 'line', xAxisKey: 'fecha', yAxisKeys: ['importe'], dateAggregation: 'month' }, { xEsFecha: true }],
        'área por semana y serie': [{ chartType: 'area', xAxisKey: 'fecha', yAxisKeys: ['importe'], splitByKey: 'region', dateAggregation: 'week' }, { xEsFecha: true }],
    };
    for (const [n, [config, op]] of Object.entries(graficos)) {
        const sql = sqlDeAgregado(config, CONSULTA, op);
        if (!sql) { comprobar(`${n}: se arma`, false, 'null'); continue; }
        if (!revisar(n, sql)) continue;
        try { const f = await correr(sql); comprobar(`${n}: corre`, f.length > 0, `${f.length} filas`); }
        catch (e) { comprobar(`${n}: corre`, false, `${e.message.split('\n')[0]} · ${sql}`); }
    }

    // ── 4. El Canvas ────────────────────────────────────────────────────────────
    console.log('\nel Canvas');
    const { sqlAutonomo } = await importar('client/src/components/lienzo/salidas.js');
    const lienzo = {
        version: 1,
        tarjetas: [
            { id: 'ventas_src', tipo: 'source', x: 0, y: 0, origen: { tipo: 'tabla', nombre: 'ventas' } },
            { id: 'por_region', tipo: 'query', x: 300, y: 0, sql: 'SELECT region, sum(importe) AS total FROM ventas_src GROUP BY region' },
            { id: 'arriba', tipo: 'query', x: 600, y: 0, sql: 'SELECT * FROM por_region WHERE total > (SELECT avg(total) FROM por_region)' },
        ],
    };
    try {
        const sql = sqlAutonomo(lienzo, 'arriba');
        if (revisar('Canvas', sql || '')) {
            const f = await correr(sql);
            comprobar('el SQL autónomo de una tarjeta (sus padres como CTE) corre', /WITH/i.test(sql) && f.length >= 1, sql.slice(0, 160));
        }
    } catch (e) { comprobar('el SQL autónomo de una tarjeta corre', false, e.message.split('\n')[0]); }

    // ── 5. El cuaderno ──────────────────────────────────────────────────────────
    console.log('\nel cuaderno');
    const { componerCelda } = await importar('client/src/utils/vistaDeCelda.js');
    const { analizarCelda } = await importar('client/src/utils/celdaSql.js');
    for (const [nombre, sql, materializar] of [
        ['por_mes', "SELECT date_trunc('month', fecha) AS mes, sum(importe) AS total FROM ventas GROUP BY 1", false],
        ['con_cte', 'WITH x AS (SELECT * FROM ventas) SELECT region, count(*) AS n FROM x GROUP BY ALL', true],
        ['lambda', 'SELECT list_transform([1, 2], lambda v: v * 10) AS l', false],
    ]) {
        try {
            const c = componerCelda({ sql, analisis: analizarCelda(sql), nombre, descripcion: "La celda «x»: 'citada'", materializar });
            if (!revisar(`celda ${nombre}`, `${c.preparacion}\n${c.lector}`)) continue;
            await con.run(c.preparacion);
            const f = await correr(c.lector);
            comprobar(`celda ${nombre}: deja ${c.deja} y se lee`, c.vista === nombre && f.length >= 1, c.preparacion.slice(0, 160));
        } catch (e) { comprobar(`celda ${nombre}: su vista se crea y se lee`, false, e.message.split('\n')[0]); }
    }

    // ── 6. Parámetros de Data Flow ──────────────────────────────────────────────
    console.log('\nlos parámetros');
    const par = require(path.join(RAIZ, 'server/parametros.js'));
    const defs = [{ nombre: 'desde', tipo: 'fecha' }, { nombre: 'n', tipo: 'numero' }, { nombre: 't', tipo: 'texto' }, { nombre: 'lista', tipo: 'lista', opciones: ['norte', 'sur'] }, { nombre: 'si', tipo: 'logico' }];
    try {
        const r = par.resolver({ parametros: defs, variables: {} }, { desde: '2024-03-01', n: '3', t: "o'brien", lista: 'sur', si: 'true' });
        const set = par.sentenciasSet(r);
        for (const s of set) { revisar('SET VARIABLE', s); await con.run(s); }
        const f = await correr("SELECT getvariable('desde') AS d, getvariable('n') AS n, getvariable('t') AS t, getvariable('si') AS si");
        comprobar('SET VARIABLE de cada tipo corre y se lee', set.length === 5 && f[0].t === "o'brien" && String(f[0].d).startsWith('2024-03-01') && Number(f[0].n) === 3, JSON.stringify(f));
        const g = await correr("SELECT count(*) AS n FROM ventas WHERE fecha >= getvariable('desde') AND region = getvariable('lista')");
        comprobar('  y getvariable filtra con su tipo', Number(g[0].n) > 0, JSON.stringify(g));
    } catch (e) { comprobar('SET VARIABLE de cada tipo corre y se lee', false, e.message.split('\n')[0]); }

    // ── La lista de lo prohibido, probada ───────────────────────────────────────
    console.log('\nla propia guarda');
    const atrapa = (s) => PROHIBIDO.some(p => p.re.test(sinLiterales(s)));
    comprobar('atrapa las tres cosas', atrapa('SELECT list_transform(l, x -> x + 1)') && atrapa('SELECT NULL FROM t') && atrapa('SELECT 7 // 2'));
    comprobar('y no lo que está bien', !atrapa("SELECT list_transform(l, lambda x: x + 1), j->>'a', j->'b', '//' AS s, NULL::INT FROM t") && !atrapa('SELECT NULL WHERE false'));
} catch (e) {
    fallos++;
    console.log('  FALLA excepción:', e?.stack || e);
}
console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
