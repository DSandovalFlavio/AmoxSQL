/**
 * Salida a Excel de verdad (D3), fase 1 del plan de la 5.11.
 *
 *     node scripts/probarExcelSalida.mjs
 *
 * Sin dependencias: el libro se vuelve a abrir con el lector ZIP de AmoxSQL
 * (para mirar su XML) y con el motor (`read_xlsx`, para mirar los valores).
 *   - Un libro nuevo: varias hojas, formatos por tipo, fechas como fechas,
 *     identificadores largos como texto, encabezado fijo con filtro, anchos,
 *     nombres de hoja que Excel acepta, y el límite de filas con un error claro.
 *   - La plantilla del cliente (scripts/fixtures/excel/plantilla_*.xlsx): la
 *     tabla crece con su columna calculada y su fila de totales; el gráfico,
 *     el nombre definido, el formato condicional y la validación la siguen;
 *     el formato del cliente se conserva; las demás hojas, byte a byte. Desde
 *     una celda: se limpian los datos viejos, la fórmula de al lado se arrastra,
 *     y si se pisaría algo que no es suyo, se para.
 *   - El nodo Excel de Data Flow y la exportación de la interfaz.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-excel-salida-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const { escribirLibro } = require(path.join(RAIZ, 'server/xlsxEscribir.js'));
const { rellenarPlantilla, describirPlantilla, moverFormula, extenderRangos } = require(path.join(RAIZ, 'server/xlsxPlantilla.js'));
const zip = require(path.join(RAIZ, 'server/zip.js'));
const FIX = path.join(RAIZ, 'scripts', 'fixtures', 'excel');

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const fwd = (p) => p.split(path.sep).join('/');
const xmlDe = (ruta, entrada) => { const z = zip.abrir(ruta); try { return z.leer(entrada)?.toString('utf8') ?? null; } finally { z.cerrar(); } };
const entradas = (ruta) => { const z = zip.abrir(ruta); try { return z.entradas.map(e => e.nombre); } finally { z.cerrar(); } };

const inst = await crearInstancia(':memory:');
const con = await inst.connect();
const db = { query: async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson() };
const leerHoja = async (ruta, hoja, extra = '') => db.query(`SELECT * FROM read_xlsx('${fwd(ruta)}', sheet='${hoja}'${extra})`);

try {
    console.log('\nun libro nuevo');
    const L = path.join(TMP, 'salidas', 'cierre.xlsx');
    let r = await escribirLibro(db, L, [
        {
            nombre: 'Resumen',
            consulta: `SELECT * FROM (VALUES ('norte', 1234.5::DECIMAL(12,2), 0.125, DATE '2026-10-05', TIMESTAMP '2026-10-05 07:30:00', true, 2026, 9007199254740993::BIGINT),
                                             ('sur', 99.99::DECIMAL(12,2), 0.3, DATE '2026-10-06', NULL, false, 2025, 7::BIGINT))
                       v(tienda, importe, margen, fecha, corte, activa, anio, id_largo)`,
            formatos: { margen: 'porcentaje' },
        },
        { nombre: 'Detalle: mes/1', consulta: `SELECT range AS n, range * 1.5 AS doble, DATE '2026-01-01' + range::INTEGER AS dia FROM range(50000)` },
        { nombre: 'Resumen', consulta: `SELECT 'otra' AS x` },
    ]);
    comprobar('escribe el libro, sin temporal al lado', fs.existsSync(L) && !fs.readdirSync(path.dirname(L)).some(n => n.endsWith('.amoxtmp')));
    comprobar('nombres de hoja que Excel acepta, sin repetir', r.hojas.map(h => h.nombre).join('|') === 'Resumen|Detalle  mes 1|Resumen (2)', r.hojas.map(h => h.nombre).join('|'));
    const resumen = await leerHoja(L, 'Resumen');
    comprobar('el motor lo lee: fechas como fechas, números como números', resumen[0]?.fecha === '2026-10-05' && Number(resumen[0]?.importe) === 1234.5 && resumen[0]?.activa === true, JSON.stringify(resumen[0]));
    comprobar('un BIGINT que Excel no guarda entero va como texto', resumen[0]?.id_largo === '9007199254740993', JSON.stringify(resumen[0]?.id_largo));
    const detalle = await leerHoja(L, 'Detalle  mes 1');
    const [esperado] = await db.query(`SELECT CAST(DATE '2026-01-01' + 49999 AS VARCHAR) AS d`);
    comprobar('50 000 filas, completas y en orden', detalle.length === 50000 && Number(detalle[49999].n) === 49999 && detalle[49999].dia === esperado.d, `${JSON.stringify(detalle[49999])} / ${esperado.d}`);
    const estilos = xmlDe(L, 'xl/styles.xml');
    const hoja1 = xmlDe(L, 'xl/worksheets/sheet1.xml');
    comprobar('DECIMAL(12,2) con dos decimales, porcentaje forzado, fecha y fecha-hora', ['#,##0.00', '0.0%', 'yyyy-mm-dd', 'yyyy-mm-dd hh:mm:ss'].every(f => estilos.includes(`formatCode="${f}"`) || (f === '#,##0.00' && /numFmtId="4"/.test(estilos))), estilos.slice(0, 400));
    comprobar('encabezado en negrita, fijo y con filtro', /<b\/>/.test(estilos) && /state="frozen"/.test(hoja1) && /<autoFilter ref="A1:H3"\/>/.test(hoja1));
    comprobar('ancho de columna según el contenido', /<col min="1" max="1" width="[\d.]+" customWidth="1"/.test(hoja1));
    comprobar('un entero (año) sin separador de miles', /<c r="G2"><v>2026<\/v><\/c>/.test(hoja1), (hoja1.match(/<c r="G2"[^]*?<\/c>/) || [''])[0]);
    comprobar('el libro dice quién lo escribió', /AmoxSQL/.test(xmlDe(L, 'docProps/app.xml') || ''));

    let e = null;
    try { await escribirLibro(db, path.join(TMP, 'salidas', 'grande.xlsx'), [{ nombre: 'x', consulta: 'SELECT range FROM range(1048576)' }]); } catch (x) { e = x; }
    comprobar('más filas de las que caben en Excel: error claro y nada escrito', /at most 1,048,575 rows/.test(e?.message || '') && !fs.existsSync(path.join(TMP, 'salidas', 'grande.xlsx')), e?.message);
    const tablasTemp = await db.query(`SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE table_name LIKE '__amox_xlsx_%'`);
    comprobar('no deja tablas temporales en la sesión', tablasTemp[0].n === 0);

    console.log('\nla plantilla del cliente: una tabla');
    const P = path.join(FIX, 'plantilla_tabla.xlsx');
    const d = describirPlantilla(P);
    comprobar('describe hojas y tablas, con la columna calculada', d.hojas.join() === 'Portada,Datos,Resumen,Notas' && d.tablas[0]?.nombre === 'Ventas' && d.tablas[0].columnas.find(c => c.nombre === 'IVA')?.calculada === true, JSON.stringify(d));
    const T = path.join(TMP, 'salidas', 'cliente.xlsx');
    const ventas = `SELECT * FROM (VALUES ('norte', 1500.5, DATE '2026-09-01'), ('sur', 800.25, DATE '2026-09-02'), ('centro', 99.0, DATE '2026-09-03'), ('este', 2100.0, DATE '2026-09-04'), ('oeste', 50.0, DATE '2026-09-05')) v(tienda, importe, fecha)`;
    r = await rellenarPlantilla(db, P, T, [{ consulta: ventas, tabla: 'ventas' }]);
    const tabla = xmlDe(T, 'xl/tables/table1.xml');
    comprobar('la tabla crece a 5 filas, con su fila de totales debajo', /ref="A1:D7"/.test(tabla) && /<autoFilter ref="A1:D6"\/>/.test(tabla), tabla.slice(0, 200));
    const datos = xmlDe(T, 'xl/worksheets/sheet2.xml');
    comprobar('la columna calculada se rellena con su fórmula', (datos.match(/<f>Ventas\[\[#This Row\],\[Importe\]\]\*0\.16<\/f>/g) || []).length === 5);
    comprobar('los totales bajan a la fila 7', /<c r="B7"[^>]*><f>SUBTOTAL\(109,Ventas\[Importe\]\)<\/f>/.test(datos) && /<c r="A7"/.test(datos), (datos.match(/<row r="7"[^]*?<\/row>/) || [''])[0]);
    comprobar('el formato del cliente se conserva (moneda y fecha)', /<c r="B6" s="2"><v>50<\/v>/.test(datos) && /<c r="C6" s="3">/.test(datos));
    comprobar('formato condicional y validación siguen a los datos', /conditionalFormatting sqref="B2:B6"/.test(datos) && /dataValidation sqref="B2:B6"/.test(datos));
    const grafico = xmlDe(T, 'xl/charts/chart1.xml');
    comprobar('el gráfico apunta a las filas nuevas', grafico.includes("'Datos'!$B$2:$B$6") && grafico.includes("'Datos'!$A$2:$A$6"), (grafico.match(/<f>[^<]*<\/f>/g) || []).join(' '));
    const libro = xmlDe(T, 'xl/workbook.xml');
    comprobar('el nombre definido también, y el libro recalcula al abrir', libro.includes('Datos!$B$2:$B$6') && /fullCalcOnLoad="1"/.test(libro));
    const z0 = zip.abrir(P), z1 = zip.abrir(T);
    const iguales = ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet4.xml', 'xl/theme/theme1.xml', 'xl/drawings/drawing1.xml']
        .every(n => z0.crudo(z0.entradas.find(x => x.nombre === n)).equals(z1.crudo(z1.entradas.find(x => x.nombre === n))));
    z0.cerrar(); z1.cerrar();
    comprobar('las demás hojas, el tema y el dibujo, byte a byte', iguales);
    comprobar('las mismas entradas que la plantilla', entradas(P).join() === entradas(T).join());
    const leidas = await leerHoja(T, 'Datos', `, range='A1:C6'`);
    comprobar('el motor lee los datos nuevos', leidas.length === 5 && leidas[4].Tienda === 'oeste' && leidas[0].Fecha === '2026-09-01', JSON.stringify(leidas[4]));

    r = await rellenarPlantilla(db, P, path.join(TMP, 'salidas', 'una.xlsx'), [{ consulta: `SELECT 'solo' AS tienda, 1.0 AS importe, DATE '2026-01-01' AS fecha`, tabla: 'Ventas' }]);
    const una = xmlDe(path.join(TMP, 'salidas', 'una.xlsx'), 'xl/tables/table1.xml');
    comprobar('también encoge (1 fila) y los totales suben', /ref="A1:D3"/.test(una), una.slice(0, 160));
    r = await rellenarPlantilla(db, P, path.join(TMP, 'salidas', 'posicion.xlsx'), [{ consulta: `SELECT 'x' AS a, 2.0 AS b, DATE '2026-01-01' AS c`, tabla: 'Ventas' }]);
    comprobar('con otros nombres pero las mismas columnas, por posición', r.regiones[0].filas === 1);
    e = null;
    try { await rellenarPlantilla(db, P, path.join(TMP, 'salidas', 'mal.xlsx'), [{ consulta: 'SELECT 1 AS a', tabla: 'Ventas' }]); } catch (x) { e = x; }
    comprobar('columnas que no casan: dice cuáles espera', /expects the columns Tienda, Importe, Fecha/.test(e?.message || ''), e?.message);
    e = null;
    try { await rellenarPlantilla(db, P, path.join(TMP, 'salidas', 'mal.xlsx'), [{ consulta: ventas, tabla: 'Gastos' }]); } catch (x) { e = x; }
    comprobar('una tabla que no existe: dice cuáles hay', /no table "Gastos"; it has Ventas/.test(e?.message || ''), e?.message);

    console.log('\nla plantilla del cliente: desde una celda');
    const PC = path.join(FIX, 'plantilla_celda.xlsx');
    const C1 = path.join(TMP, 'salidas', 'semana.xlsx');
    r = await rellenarPlantilla(db, PC, C1, [{ consulta: `SELECT 'a' t, 5 u, 12.5 imp UNION ALL SELECT 'b', 6, 13.5`, hoja: 'Reporte', celda: 'B5' }]);
    let hoja = xmlDe(C1, 'xl/worksheets/sheet1.xml');
    comprobar('con menos filas, los datos viejos se limpian', !/vieja-3/.test(hoja) && !/<c r="B7"/.test(hoja) && !/<c r="E7"/.test(hoja));
    comprobar('la fórmula de al lado queda en cada fila', /<c r="E6"[^>]*><f>D6\*1\.16<\/f>/.test(hoja));
    comprobar('lo que no es suyo se queda (encabezados, nota, pie)', /Nota fija a la derecha/.test(hoja) && /Pie del reporte/.test(hoja) && /<c r="B4"/.test(hoja));
    r = await rellenarPlantilla(db, PC, C1, [{ consulta: `SELECT 'tienda-' || range AS t, range AS u, range * 10.0 AS imp FROM range(1, 7)`, hoja: 'Reporte', celda: 'B5' }]);
    hoja = xmlDe(C1, 'xl/worksheets/sheet1.xml');
    comprobar('con más filas, la fórmula se arrastra hasta la última', /<c r="E10"[^>]*><f>D10\*1\.16<\/f>/.test(hoja) && r.avisos.some(a => /filled down to row 10/.test(a)), r.avisos.join(' | '));
    e = null;
    try { await rellenarPlantilla(db, PC, path.join(TMP, 'salidas', 'choca.xlsx'), [{ consulta: `SELECT 'x' t, range u, 1.0 imp FROM range(20)`, hoja: 'Reporte', celda: 'B5' }]); } catch (x) { e = x; }
    comprobar('si pisaría el pie, se para y dice dónde', /overwrite B20/.test(e?.message || '') && !fs.existsSync(path.join(TMP, 'salidas', 'choca.xlsx')), e?.message);
    r = await rellenarPlantilla(db, PC, path.join(TMP, 'salidas', 'encabezado.xlsx'), [{ consulta: `SELECT 'z' AS "Tienda nueva"`, hoja: 'Reporte', celda: 'B12', encabezado: true }]);
    comprobar('puede escribir también los nombres de columna', /Tienda nueva/.test(xmlDe(path.join(TMP, 'salidas', 'encabezado.xlsx'), 'xl/worksheets/sheet1.xml')));

    console.log('\nfórmulas');
    comprobar('mover una fórmula respeta $, textos y nombres de hoja', moverFormula(`D5*1.16+$B$2+Hoja1!C5&"A5"+SUM(C5:C6)`, 2) === `D7*1.16+$B$2+Hoja1!C7&"A5"+SUM(C7:C8)`, moverFormula(`D5*1.16+$B$2+Hoja1!C5&"A5"+SUM(C5:C6)`, 2));
    comprobar('alargar rangos sólo si cubrían los datos viejos', extenderRangos('SUM(B2:B3)+SUM(B2:B9)+SUM(C2:C3)', { hoja: 'X', c0: 1, c1: 1, f0: 2, finVieja: 3, finNueva: 6 }, { conHoja: false }) === 'SUM(B2:B6)+SUM(B2:B9)+SUM(C2:C3)');

    console.log('\nel nodo Excel de Data Flow y la exportación de la interfaz');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(res => setTimeout(res, 100));
    const post = (p, b) => fetch(`http://localhost:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = (p) => fetch(`http://localhost:${port}${p}`).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const PR = path.join(TMP, 'tiendas');
    fs.mkdirSync(path.join(PR, 'plantillas'), { recursive: true });
    fs.copyFileSync(P, path.join(PR, 'plantillas', 'cliente.xlsx'));
    await post('/api/project/open', { path: PR });
    const cadena = (excel) => ({
        version: '1.0', name: 'cierre', config: { base: 'memoria' },
        nodes: [
            { id: 'v', type: 'sql_inline', label: 'Ventas', config: { query: ventas } },
            { id: 'r', type: 'sql_inline', label: 'Por tienda', config: { query: `SELECT tienda, sum(importe) AS total FROM (${ventas}) GROUP BY ALL ORDER BY 1` } },
            { id: 'x', type: 'excel', label: 'Cierre', config: excel },
        ],
        edges: [{ id: 'e1', source: 'v', target: 'x' }, { id: 'e2', source: 'r', target: 'x' }], variables: { mes: '2026-09' },
    });
    r = await post('/api/chains/run', { chainDefinition: cadena({ modo: 'libro', outputPath: 'salidas/cierre_${mes}.xlsx', hojas: [{ desde: 'r', nombre: 'Resumen' }] }), chainFile: 'cierre.sqlchain' });
    const N = path.join(PR, 'salidas', 'cierre_2026-09.xlsx');
    comprobar('el nodo deja el libro (con el parámetro en el nombre)', r.status === 'completed' && fs.existsSync(N), JSON.stringify(r).slice(0, 400));
    const libroN = xmlDe(N, 'xl/workbook.xml') || '';
    comprobar('las hojas en el orden del nodo; las que no nombra, con el nombre de su nodo', /name="Resumen" sheetId="1"/.test(libroN) && /name="Ventas" sheetId="2"/.test(libroN), libroN.match(/<sheets>.*<\/sheets>/)?.[0]);
    r = await post('/api/chains/run', { chainDefinition: cadena({ modo: 'plantilla', plantilla: 'plantillas/cliente.xlsx', outputPath: 'salidas/cliente_${mes}.xlsx', destinos: [{ desde: 'v', tabla: 'Ventas' }, { desde: 'r', hoja: 'Notas', celda: 'A3', encabezado: true }] }), chainFile: 'cierre.sqlchain' });
    const M = path.join(PR, 'salidas', 'cliente_2026-09.xlsx');
    comprobar('rellena la plantilla desde el nodo: la tabla y una hoja', r.status === 'completed' && /ref="A1:D7"/.test(xmlDe(M, 'xl/tables/table1.xml') || '') && /centro/.test(xmlDe(M, 'xl/worksheets/sheet4.xml') || ''), JSON.stringify(r).slice(0, 400));
    const sinDestino = cadena({ modo: 'plantilla', plantilla: 'plantillas/cliente.xlsx', outputPath: 'salidas/x.xlsx', destinos: [{ desde: 'nadie', tabla: 'Ventas' }] });
    r = await post('/api/chains/run', { chainDefinition: sinDestino, chainFile: 'cierre.sqlchain' });
    comprobar('un destino de un nodo que no está conectado: falla con nombre', r.status === 'failed' && /not connected/.test(JSON.stringify(r)), JSON.stringify(r).slice(0, 300));
    const plantillaApi = await get(`/api/excel/plantilla?path=${encodeURIComponent('plantillas/cliente.xlsx')}`);
    comprobar('la interfaz pregunta qué hay en la plantilla', plantillaApi.tablas?.[0]?.nombre === 'Ventas', JSON.stringify(plantillaApi).slice(0, 200));
    await post('/api/db/connect', { path: 'tiendas.duckdb' });
    r = await post('/api/export-data', { query: ventas, format: 'xlsx', filename: 'exportado.xlsx' });
    comprobar('exportar desde la interfaz: libro con formato', r.success && r.rowCount === 5 && /formatCode|numFmtId="4"/.test(xmlDe(path.join(PR, 'exportado.xlsx'), 'xl/styles.xml') || ''), JSON.stringify(r));
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
