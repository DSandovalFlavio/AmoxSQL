/**
 * El Excel tal como llega (C2), fase 2 del plan de la 5.10.
 *
 *     node scripts/probarExcel.mjs
 *
 * Sobre los archivos de scripts/fixtures/excel/ (se rehacen con generar.py):
 *   - Las hojas sin la librería retirada, también en un ZIP64; nombres con &,
 *     acentos y comillas.
 *   - Lo que no es un libro dice qué es: .xls, cifrado, dañado, CSV disfrazado
 *     (y este se puede importar como CSV).
 *   - La hoja cruda, con letras y filas, para marcar el rango.
 *   - El Excel de cliente: encabezados en la fila 4, columna vacía arriba,
 *     celda combinada (rellenar hacia abajo), notas al pie, nombres limpios.
 *   - Importar: unir tres hojas con _hoja, o una tabla por hoja; lo elegido
 *     se recuerda en project.json y Data Flow lo usa.
 *   - Una fuente que une hojas y rellena.
 *   - Nada carga spatial; la dependencia ya no está.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-excel-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const consulta = async (sql) => {
    const r = await post('/api/query', { query: sql });
    return r.data || r.error;
};

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};

const P = path.join(TMP, 'proyecto');
const DATOS = path.join(P, 'datos');
fs.mkdirSync(DATOS, { recursive: true });
for (const f of fs.readdirSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel'))) {
    if (!f.endsWith('.py')) fs.copyFileSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel', f), path.join(DATOS, f));
}
const q = (o) => new URLSearchParams(o).toString();

try {
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'proyecto.duckdb' });

    console.log('\nlas hojas, sin la librería');
    let r = await get(`/api/files/inspect-excel?${q({ path: 'datos/varias_hojas.xlsx' })}`);
    comprobar('en orden, con &, acentos y comillas', JSON.stringify(r.sheets) === JSON.stringify(['Enero', 'Febrero', 'Marzo & Año', 'Notas "internas"']), JSON.stringify(r));
    r = await get(`/api/files/inspect-excel?${q({ path: 'datos/zip64.xlsx' })}`);
    comprobar('también de un libro ZIP64 (los muy grandes)', JSON.stringify(r.sheets) === '["Ventas"]', JSON.stringify(r));
    // En package.json y en el lockfile (resolverla con require miraría también
    // las carpetas de arriba, que en un worktree son las del checkout principal).
    const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
    const lock = fs.readFileSync(path.join(RAIZ, 'pnpm-lock.yaml'), 'utf8');
    comprobar('la dependencia retirada ya no está', !pkg.dependencies?.xlsx && !/\bxlsx@0\./.test(lock));

    console.log('\nlo que no es un libro dice qué es');
    for (const [f, codigo, texto] of [
        ['antiguo.xls', 'antiguo_o_cifrado', /old Excel file/],
        ['cifrado.xlsx', 'antiguo_o_cifrado', /password-protected/],
        ['danado.xlsx', 'danado', /damaged/],
        ['csv_disfrazado.xlsx', 'csv_disfrazado', /CSV with an \.xlsx extension/],
    ]) {
        r = await get(`/api/files/inspect-excel?${q({ path: `datos/${f}` })}`);
        comprobar(`${f}: ${codigo}`, r.status === 422 && r.codigo === codigo && texto.test(r.error || ''), JSON.stringify(r));
    }
    r = await post('/api/db/import-excel', { filePath: 'datos/csv_disfrazado.xlsx', tableName: 'disfrazado', comoCsv: true });
    comprobar('el CSV disfrazado se importa como CSV', r.success === true);
    comprobar('...y tiene sus filas', (await consulta('SELECT count(*)::INTEGER AS n FROM disfrazado'))?.[0]?.n === 2);

    console.log('\nla hoja cruda');
    r = await get(`/api/excel/vista?${q({ path: 'datos/cliente.xlsx' })}`);
    comprobar('con las letras de todas sus columnas (aunque la fila 1 sólo tenga el título)', JSON.stringify(r.columnas) === '["A","B","C","D","E"]', JSON.stringify(r.columnas));
    comprobar('y la fila 4 con los encabezados donde está', JSON.stringify(r.filas?.[3]) === '["Tienda","Fecha","Importe","Unidades","Notas"]', JSON.stringify(r.filas?.[3]));
    r = await get(`/api/excel/vista?${q({ path: 'datos/cliente.xlsx', hoja: 'No existe' })}`);
    comprobar('una hoja que no existe lo dice', r.status === 422 && /no sheet named "No existe"/.test(r.error || ''), JSON.stringify(r));

    console.log('\nel Excel de cliente');
    r = await post('/api/excel/probar', { path: 'datos/cliente.xlsx', opciones: { rango: 'a4:e' } });
    comprobar('A4:E: seis filas, sin el pie', r.filas?.length === 6, JSON.stringify(r).slice(0, 200));
    comprobar('el texto de una columna vacía arriba no se pierde', r.filas?.[1]?.Notas === 'Cierre anticipado');
    comprobar('las fechas son fechas', r.columnas?.find(c => c.nombre === 'Fecha')?.tipo === 'DATE', JSON.stringify(r.columnas));
    comprobar('la celda combinada llega vacía en su segunda fila', r.filas?.[1]?.Tienda === null);
    r = await post('/api/excel/probar', { path: 'datos/cliente.xlsx', opciones: { rango: 'A4:E', rellenar: ['Tienda'] } });
    comprobar('rellenar hacia abajo la completa', r.filas?.[1]?.Tienda === 'Norte' && r.filas?.[2]?.Tienda === 'Centro', JSON.stringify(r.filas?.slice(0, 3)));
    r = await post('/api/excel/probar', { path: 'datos/cliente.xlsx', opciones: { rango: 'A4:E', normalizar: true } });
    comprobar('limpiar nombres', r.columnas?.map(c => c.nombre).join() === 'tienda,fecha,importe,unidades,notas', JSON.stringify(r.columnas));
    r = await post('/api/excel/probar', { path: 'datos/cliente.xlsx', opciones: { rango: 'A4:Z9:X' } });
    comprobar('un rango mal escrito se explica', r.status === 422 && /Not a cell range/.test(r.error || ''), JSON.stringify(r));

    console.log('\nimportar');
    r = await post('/api/db/import-excel', {
        filePath: 'datos/cliente.xlsx', mode: 'MERGE', sheets: ['Ventas'], tableName: 'ventas_cliente',
        opciones: { rango: 'A4:E', rellenar: ['Tienda'] },
    });
    comprobar('con rango y relleno', r.success === true, JSON.stringify(r));
    let filas = await consulta(`SELECT count(*)::INTEGER AS n, count(Tienda)::INTEGER AS con_tienda FROM ventas_cliente`);
    comprobar('la tabla tiene las seis filas, todas con tienda', filas?.[0]?.n === 6 && filas[0].con_tienda === 6, JSON.stringify(filas));
    r = await post('/api/db/import-excel', {
        filePath: 'datos/varias_hojas.xlsx', mode: 'MERGE', sheets: ['Enero', 'Febrero', 'Marzo & Año'], tableName: 'trimestre',
    });
    filas = await consulta(`SELECT _hoja, sum(importe)::INTEGER AS total FROM trimestre GROUP BY _hoja ORDER BY _hoja`);
    comprobar('unir tres hojas: una tabla con _hoja', JSON.stringify(filas) === JSON.stringify([{ _hoja: 'Enero', total: 203 }, { _hoja: 'Febrero', total: 403 }, { _hoja: 'Marzo & Año', total: 603 }]), JSON.stringify(filas));
    r = await post('/api/db/import-excel', { filePath: 'datos/varias_hojas.xlsx', mode: 'INDIVIDUAL', sheets: ['Enero', 'Febrero'] });
    filas = await consulta(`SELECT (SELECT count(*) FROM Enero)::INTEGER AS e, (SELECT count(*) FROM Febrero)::INTEGER AS f`);
    comprobar('o una tabla por hoja', filas?.[0]?.e === 2 && filas[0].f === 2, JSON.stringify(filas));
    r = await post('/api/db/import-excel', { filePath: 'datos/antiguo.xls', mode: 'MERGE', sheets: ['x'], tableName: 'nada' });
    comprobar('importar un .xls se niega diciendo qué es', r.status === 422 && r.codigo === 'antiguo_o_cifrado', JSON.stringify(r));

    console.log('\nlo elegido se recuerda');
    const pj = JSON.parse(fs.readFileSync(path.join(P, '.amoxsql', 'project.json'), 'utf8'));
    comprobar('en project.json, por ruta relativa', JSON.stringify(pj.lecturas?.['datos/cliente.xlsx']) === JSON.stringify({ hoja: 'Ventas', rango: 'A4:E', rellenar: ['Tienda'] }), JSON.stringify(pj.lecturas));
    r = await get(`/api/excel/recordado?${q({ path: 'datos/cliente.xlsx' })}`);
    comprobar('el diálogo lo recibe la próxima vez', r.opciones?.rango === 'A4:E');
    const cadena = {
        version: '1.0', name: 'cliente', config: { base: 'memoria' },
        nodes: [
            { id: 'a', type: 'import_file', label: 'Leer', config: { sourcePath: 'datos/cliente.xlsx', fileType: 'xlsx', tableName: 'leido' } },
            { id: 'b', type: 'export_file', label: 'Salida', config: { outputPath: 'salida/cliente.parquet', format: 'parquet' } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }], variables: {},
    };
    r = await post('/api/chains/run', { chainDefinition: cadena, chainFile: 'cliente.sqlchain' });
    comprobar('Data Flow lee el archivo como se recordó', r.status === 'completed', JSON.stringify(r).slice(0, 300));
    filas = await consulta(`SELECT count(*)::INTEGER AS n, count(Tienda)::INTEGER AS con_tienda FROM read_parquet('${path.join(P, 'salida', 'cliente.parquet').split(path.sep).join('/')}')`);
    comprobar('...con el rango y el relleno', filas?.[0]?.n === 6 && filas[0].con_tienda === 6, JSON.stringify(filas));
    cadena.nodes[0].config = { sourcePath: 'datos/varias_hojas.xlsx', fileType: 'xlsx', tableName: 'leido', excelSheets: ['Enero', 'Marzo & Año'], excelCleanNames: true };
    cadena.nodes[1].config.outputPath = 'salida/dos.parquet';
    r = await post('/api/chains/run', { chainDefinition: cadena, chainFile: 'cliente.sqlchain' });
    filas = await consulta(`SELECT count(*)::INTEGER AS n, count(DISTINCT _hoja)::INTEGER AS h FROM read_parquet('${path.join(P, 'salida', 'dos.parquet').split(path.sep).join('/')}')`);
    comprobar('un nodo puede unir hojas', r.status === 'completed' && filas?.[0]?.n === 4 && filas[0].h === 2, JSON.stringify(filas));
    r = await post('/api/chains/export-sql', { chainDefinition: cadena, chainFile: 'cliente.sqlchain' });
    const sqlExportado = r.sql || JSON.stringify(r);
    comprobar('el SQL exportado lleva la misma lectura', /UNION ALL BY NAME/.test(sqlExportado) && /empty_as_varchar = true/.test(sqlExportado), sqlExportado.slice(0, 300));

    console.log('\nuna fuente que une hojas y rellena');
    r = await post('/api/fuentes', { definicion: { nombre: 'meses', excel: { hojas: ['Enero', 'Febrero'] } }, ubicacionAqui: path.join(DATOS, 'varias_hojas.xlsx') });
    filas = await consulta(`SELECT count(DISTINCT _hoja)::INTEGER AS h FROM fuentes."meses"`);
    comprobar('fuentes."meses" une dos hojas', filas?.[0]?.h === 2, JSON.stringify(filas));
    r = await post('/api/fuentes', { definicion: { nombre: 'reporte', excel: { rango: 'A4:E', rellenar: ['Tienda'] } }, ubicacionAqui: path.join(DATOS, 'cliente.xlsx') });
    filas = await consulta(`SELECT count(Tienda)::INTEGER AS n FROM fuentes."reporte"`);
    comprobar('fuentes."reporte" rellena hacia abajo', filas?.[0]?.n === 6, JSON.stringify(filas));
    r = await post('/api/fuentes', { definicion: { nombre: 'disfrazada' }, ubicacionAqui: path.join(DATOS, 'csv_disfrazado.xlsx') });
    filas = await post('/api/query', { query: `SELECT * FROM fuentes."disfrazada"` });
    comprobar('una fuente que apunta a un CSV disfrazado dice qué es', /CSV with an \.xlsx extension/.test(filas.error || ''), JSON.stringify(filas).slice(0, 200));

    console.log('\nspatial');
    filas = await consulta(`SELECT count(*)::INTEGER AS n FROM duckdb_extensions() WHERE loaded AND extension_name = 'spatial'`);
    comprobar('leer Excel no ha cargado spatial', filas?.[0]?.n === 0, JSON.stringify(filas));
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
