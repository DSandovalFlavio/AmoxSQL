/**
 * De dónde salió cada dato (C5), fase 4 del plan de la 5.10.
 *
 *     node scripts/probarProcedencia.mjs
 *
 *   - Cada camino de carga deja su procedencia en el comentario de la tabla:
 *     importar un archivo (también con comodines), importar Excel (hojas y
 *     rango), Import File e Import Folder de Data Flow, y materializar una
 *     fuente desde el editor.
 *   - Una carga de carpeta lleva `_archivo` por fila.
 *   - El explorador la recibe en una línea, y la IA con el esquema.
 *   - Si el archivo cambia (o se va) después de cargarlo, se avisa.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-procedencia-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const procedencia = require(path.join(RAIZ, 'server/procedencia.js'));
const { formatTableSchemas } = require(path.join(RAIZ, 'server/ai/prompt/schema.js'));
const { port } = await startServer(0);
for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
const u = (p) => `http://localhost:${port}${p}`;
const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const get = pedir('GET'), post = pedir('POST');
const consulta = async (sql) => (await post('/api/query', { query: sql })).data;
const tablas = async () => {
    const r = await fetch(u('/api/db/schemas')).then(x => x.json());
    return Object.fromEntries(r.flatMap(s => s.tables.map(t => [t.name, t])));
};

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const escribir = (ruta, texto) => { fs.mkdirSync(path.dirname(ruta), { recursive: true }); fs.writeFileSync(ruta, texto); };

const P = path.join(TMP, 'proyecto');
escribir(path.join(P, 'datos', 'ventas_sem38.csv'), 'tienda,importe\nnorte,10\nsur,20\n');
escribir(path.join(P, 'datos', 'mes', 'enero.csv'), 'tienda,importe\nnorte,1\n');
escribir(path.join(P, 'datos', 'mes', 'febrero.csv'), 'tienda,importe\nsur,2\nnorte,3\n');
fs.copyFileSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel', 'cliente.xlsx'), path.join(P, 'datos', 'cliente.xlsx'));
fs.copyFileSync(path.join(RAIZ, 'scripts', 'fixtures', 'excel', 'varias_hojas.xlsx'), path.join(P, 'datos', 'varias_hojas.xlsx'));

try {
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: 'p.duckdb' });

    console.log('\nimportar un archivo');
    await post('/api/db/import', { filePath: 'datos/ventas_sem38.csv', tableName: 'ventas' });
    let t = (await tablas()).ventas;
    comprobar('la tabla dice de qué archivo viene', /from ventas_sem38\.csv/.test(t?.procedencia?.resumen || ''), JSON.stringify(t?.procedencia));
    comprobar('cuándo se leyó y cuántas filas', /read \d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t.procedencia.resumen) && /2 rows/.test(t.procedencia.resumen), t.procedencia.resumen);
    const [{ comment }] = await consulta(`SELECT comment FROM duckdb_tables() WHERE table_name = 'ventas'`);
    comprobar('el comentario empieza con una línea legible', /^AmoxSQL · from ventas_sem38\.csv/.test(comment), comment.split('\n')[0]);
    const p = procedencia.leer(comment);
    comprobar('y guarda el tamaño y la fecha del archivo', p?.archivos?.[0]?.tamano === fs.statSync(path.join(P, 'datos', 'ventas_sem38.csv')).size && !!p.archivos[0].modificada, JSON.stringify(p));
    await post('/api/db/import', { filePath: 'datos/mes/*.csv', tableName: 'meses' });
    t = (await tablas()).meses;
    comprobar('con comodines: cuántos archivos', /from 2 files/.test(t?.procedencia?.resumen || '') && t.procedencia.archivos.join() === 'enero.csv,febrero.csv', JSON.stringify(t?.procedencia));

    console.log('\nimportar Excel');
    await post('/api/db/import-excel', { filePath: 'datos/cliente.xlsx', mode: 'MERGE', sheets: ['Ventas'], tableName: 'cliente', opciones: { rango: 'A4:E' } });
    t = (await tablas()).cliente;
    comprobar('con la hoja y el rango', /from cliente\.xlsx \(sheet Ventas, A4:E\)/.test(t?.procedencia?.resumen || '') && /6 rows/.test(t.procedencia.resumen), t?.procedencia?.resumen);
    await post('/api/db/import-excel', { filePath: 'datos/varias_hojas.xlsx', mode: 'MERGE', sheets: ['Enero', 'Febrero'], tableName: 'bimestre' });
    t = (await tablas()).bimestre;
    comprobar('uniendo hojas, las nombra', /sheets Enero, Febrero/.test(t?.procedencia?.resumen || ''), t?.procedencia?.resumen);

    console.log('\nData Flow');
    const cadena = {
        version: '1.0', name: 'cargas', config: { base: 'proyecto' },
        nodes: [
            { id: 'a', type: 'import_file', label: 'Archivo', config: { sourcePath: 'datos/ventas_sem38.csv', fileType: 'csv', tableName: 'df_archivo' } },
            { id: 'b', type: 'import_folder', label: 'Carpeta', config: { folderPath: 'datos/mes', filePattern: '*.csv', tableName: 'df_carpeta' } },
        ],
        edges: [], variables: {},
    };
    const run = await post('/api/chains/run', { chainDefinition: cadena, chainFile: 'cargas.sqlchain' });
    comprobar('[preparar] corre', run.status === 'completed', JSON.stringify(run).slice(0, 300));
    const ts = await tablas();
    comprobar('Import File deja su procedencia', /from ventas_sem38\.csv/.test(ts.df_archivo?.procedencia?.resumen || ''), JSON.stringify(ts.df_archivo?.procedencia));
    comprobar('Import Folder, la de cada archivo', ts.df_carpeta?.procedencia?.archivos?.length === 2, JSON.stringify(ts.df_carpeta?.procedencia));
    let filas = await consulta(`SELECT _archivo, count(*)::INTEGER AS n FROM df_carpeta GROUP BY _archivo ORDER BY _archivo`);
    comprobar('y cada fila sabe de qué archivo vino (_archivo)', JSON.stringify(filas) === JSON.stringify([{ _archivo: 'enero.csv', n: 1 }, { _archivo: 'febrero.csv', n: 2 }]), JSON.stringify(filas));
    const exportado = await post('/api/chains/export-sql', { chainDefinition: cadena, chainFile: 'cargas.sqlchain' });
    comprobar('el SQL exportado también lleva _archivo', /AS _archivo/.test(exportado.sql || ''), (exportado.sql || JSON.stringify(exportado)).slice(0, 300));

    console.log('\nmaterializar una fuente');
    await post('/api/fuentes', { definicion: { nombre: 'semana', excel: { rango: 'A4:E' } }, ubicacionAqui: path.join(P, 'datos', 'cliente.xlsx') });
    await get('/api/fuentes');
    await post('/api/query', { query: 'CREATE OR REPLACE TABLE foto_semana AS SELECT * FROM fuentes."semana"' });
    t = (await tablas()).foto_semana;
    comprobar('CREATE TABLE … AS … fuentes."x" dice que viene de la fuente y de qué archivo', /from source semana \(cliente\.xlsx\)/.test(t?.procedencia?.resumen || '') && t.procedencia.fuente === 'semana', JSON.stringify(t?.procedencia));
    await post('/api/query', { query: 'CREATE OR REPLACE TABLE mezcla AS SELECT * FROM ventas' });
    comprobar('una tabla que no sale de una fuente no inventa procedencia', !(await tablas()).mezcla?.procedencia);

    console.log('\nla IA');
    const texto = formatTableSchemas([{ name: 'ventas', rows: 2, columns: [{ name: 'tienda', type: 'VARCHAR' }], procedencia: t.procedencia.resumen }]);
    comprobar('el esquema que recibe dice de dónde salió la tabla', /-- loaded from source semana/.test(texto), texto);

    console.log('\nsi el archivo cambia');
    comprobar('[antes] sin avisos', (await tablas()).ventas.procedencia.cambiados.length === 0);
    await new Promise(r => setTimeout(r, 1100));
    fs.appendFileSync(path.join(P, 'datos', 'ventas_sem38.csv'), 'este,5\n');
    t = (await tablas()).ventas;
    comprobar('cambiar el archivo después de cargarlo se avisa', t.procedencia.cambiados.join() === 'ventas_sem38.csv', JSON.stringify(t.procedencia));
    fs.rmSync(path.join(P, 'datos', 'mes', 'enero.csv'));
    t = (await tablas()).meses;
    comprobar('y que se vaya, también', t.procedencia.cambiados.join() === 'enero.csv', JSON.stringify(t.procedencia));
    await post('/api/db/import', { filePath: 'datos/ventas_sem38.csv', tableName: 'ventas' });
    comprobar('al volver a importarlo, el aviso se va', (await tablas()).ventas.procedencia.cambiados.length === 0);
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { await baseCentral.cerrar(); } catch { /* ya cerrada */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
