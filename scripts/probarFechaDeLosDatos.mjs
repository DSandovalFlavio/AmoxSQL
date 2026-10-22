/**
 * La fecha de los datos (5.13, fase 4; F4, Dec-44).
 *
 *     node scripts/probarFechaDeLosDatos.mjs
 *
 * Con un home temporal y archivos con fechas puestas a mano:
 *   - es la del archivo MÁS NUEVO que leyó la ejecución (una fuente, un archivo
 *     importado), no la del día en que corre;
 *   - el libro de Excel la lleva en sus propiedades siempre, y en una línea bajo
 *     cada tabla si el nodo lo pide (sin mover la cabecera ni el filtro);
 *   - en una plantilla, la celda con el nombre `datos_al` la recibe (como fecha si
 *     tiene formato de fecha; como texto si no);
 *   - lo publicado la lleva en sus metadatos (`amoxsql.datos_al`);
 *   - el resumen y el aviso la dicen; sin archivos leídos, no se inventa;
 *   - el pie de Report Flow: la fecha de las tablas y fuentes que lee una consulta.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { libro } from './ayudas/libroMinimo.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-fechadatos-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });
const P = path.join(TMP, 'proyecto');
fs.mkdirSync(path.join(P, 'datos'), { recursive: true });

const require = createRequire(import.meta.url);
let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + String(detalle).slice(0, 400) : ''}`); }
};

// Los archivos, con su fecha: el Excel de la fuente llegó el 30 de septiembre;
// el CSV que se importa es más viejo, del 15.
const SEP30 = new Date(2026, 8, 30, 18, 5, 0);
const SEP15 = new Date(2026, 8, 15, 9, 0, 0);
const XLSX = path.join(P, 'datos', 'ventas.xlsx');
libro(XLSX, ['Tienda', 'Importe'], [['norte', 100], ['sur', 50]]);
fs.utimesSync(XLSX, SEP30, SEP30);
const CSV = path.join(P, 'datos', 'metas.csv');
fs.writeFileSync(CSV, 'Tienda,Meta\nnorte,90\nsur,60\n');
fs.utimesSync(CSV, SEP15, SEP15);

try {
    const fecha = require(path.join(RAIZ, 'server/ejecucion/fechaDeLosDatos.js'));
    console.log('\nlo básico');
    const l = new fecha.Lecturas();
    l.registrar(SEP15); l.registrar(null); l.registrar(SEP30); l.registrar(SEP15);
    comprobar('se queda con la más nueva', l.masNueva?.getTime() === SEP30.getTime());
    comprobar('el número de serie de Excel del día', fecha.serieDeExcel(SEP30) === 46295, fecha.serieDeExcel(SEP30));
    comprobar('un archivo remoto no tiene fecha', fecha.deArchivo('https://x/y.csv') === null && fecha.deArchivo(path.join(P, 'no.csv')) === null);

    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const zip = require(path.join(RAIZ, 'server/zip.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(r => setTimeout(r, 100));
    const pedir = (m) => (q, b) => fetch(`http://localhost:${port}${q}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    await post('/api/project/open', { path: P });
    await post('/api/db/connect', { path: ':memory:' });
    await post('/api/fuentes', { definicion: { nombre: 'ventas', tipo: 'archivo', ubicacion: 'datos/ventas.xlsx' } });

    const correr = async (nodos, edges = []) => {
        const r = await post('/api/chains/run', { chainFile: 'cierre.sqlchain', chainDefinition: { name: 'Cierre', config: { base: 'memoria' }, nodes: nodos, edges } });
        const res = await get(`/api/chains/run/${r.runId}/resumen`);
        return { r, res };
    };
    const entradaDe = (archivo, nombre) => { const z = zip.abrir(archivo); try { return z.leer(nombre)?.toString('utf8') || null; } finally { z.cerrar(); } };

    console.log('\nun libro nuevo');
    const SALIDA = path.join(P, 'salida', 'cierre.xlsx');
    let { r, res } = await correr([
        { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
        { id: 'm', type: 'import_file', label: 'Metas', config: { sourcePath: 'datos/metas.csv', tableName: 'metas' } },
        { id: 'x', type: 'excel', label: 'Excel', config: { outputPath: SALIDA, lineaDeFecha: true } },
    ], [{ id: 'e1', source: 'f', target: 'x' }, { id: 'e2', source: 'm', target: 'x' }]);
    comprobar('corre', r.status === 'completed', JSON.stringify(r));
    comprobar('la fecha es la del archivo más nuevo que leyó (el 30), no la de hoy', res.datosAl && new Date(res.datosAl).getTime() === SEP30.getTime(), res.datosAl);
    comprobar('el resumen (y el aviso) la dicen', res.linea.includes(`data as of ${fecha.texto(SEP30)}`), res.linea);
    const custom = entradaDe(SALIDA, 'docProps/custom.xml');
    // En UTC, como pide el formato (Excel la enseña en hora local): el 30 a las 18:05 aquí.
    comprobar('el libro la lleva en sus propiedades (en UTC)', (custom || '').includes(`name="Data as of"><vt:filetime>${SEP30.toISOString().replace(/\.\d+Z$/, 'Z')}</vt:filetime>`) && /AmoxSQL · cierre\.sqlchain/.test(custom), custom);
    comprobar('  registrada en el paquete', /custom-properties/.test(entradaDe(SALIDA, '[Content_Types].xml')) && /custom\.xml/.test(entradaDe(SALIDA, '_rels/.rels')));
    const hoja1 = entradaDe(SALIDA, 'xl/worksheets/sheet1.xml');
    comprobar('la línea bajo la tabla, con una fila en blanco', new RegExp(`<row r="5"><c r="A5" t="inlineStr"><is><t xml:space="preserve">Data as of ${fecha.texto(SEP30)}</t>`).test(hoja1), hoja1.slice(-400));
    comprobar('  sin mover la cabecera ni el filtro', /<row r="1">/.test(hoja1) && /<autoFilter ref="A1:B3"\/>/.test(hoja1), (/<autoFilter[^>]*>/.exec(hoja1) || [])[0]);

    ({ r, res } = await correr([
        { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
        { id: 'x', type: 'excel', label: 'Excel', config: { outputPath: SALIDA } },
    ], [{ id: 'e1', source: 'f', target: 'x' }]));
    comprobar('sin pedir la línea: sólo las propiedades', !/Data as of/.test(entradaDe(SALIDA, 'xl/worksheets/sheet1.xml')) && /Data as of/.test(entradaDe(SALIDA, 'docProps/custom.xml')));
    ({ r, res } = await correr([
        { id: 'q', type: 'sql_inline', label: 'Datos', config: { query: "SELECT 1 AS x" } },
        { id: 'x', type: 'excel', label: 'Excel', config: { outputPath: SALIDA, lineaDeFecha: true } },
    ], [{ id: 'e1', source: 'q', target: 'x' }]));
    comprobar('sin archivos leídos, no se inventa', r.status === 'completed' && !res.datosAl && !/Data as of/.test(entradaDe(SALIDA, 'xl/worksheets/sheet1.xml')) && !/Data as of/.test(entradaDe(SALIDA, 'docProps/custom.xml') || ''), JSON.stringify(res.datosAl));
    ({ r, res } = await correr([
        { id: 'q', type: 'sql_inline', label: 'SQL', config: { query: 'SELECT * FROM fuentes."ventas"' } },
        { id: 'x', type: 'excel', label: 'Excel', config: { outputPath: SALIDA } },
    ], [{ id: 'e1', source: 'q', target: 'x' }]));
    comprobar('una fuente que sólo nombra un SQL también cuenta', res.datosAl && new Date(res.datosAl).getTime() === SEP30.getTime(), res.datosAl);

    console.log('\nla plantilla del cliente');
    const PLANTILLA = path.join(P, 'plantilla.xlsx');
    const conPlantilla = (nombres, celdas) => {
        libro(PLANTILLA, ['Tienda', 'Importe'], [], { otrasHojas: [{ nombre: 'Resumen', celdas }], nombres });
        return correr([
            { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
            { id: 'x', type: 'excel', label: 'Excel', config: { modo: 'plantilla', plantilla: 'plantilla.xlsx', outputPath: SALIDA, destinos: [{ desde: 'f', hoja: 'Ventas', celda: 'A2' }] } },
        ], [{ id: 'e1', source: 'f', target: 'x' }]);
    };
    ({ r } = await conPlantilla({ datos_al: 'Resumen!$B$2' }, [{ ref: 'A2', v: 'Data as of' }, { ref: 'B2', v: null, s: 1 }]));
    let resumen = entradaDe(SALIDA, 'xl/worksheets/sheet2.xml');
    comprobar('la celda «datos_al» con formato de fecha recibe la fecha de Excel', r.status === 'completed' && /<c r="B2" s="1"><v>46295<\/v><\/c>/.test(resumen), `${r.status} ${r.error || ''} · ${resumen}`);
    ({ r } = await conPlantilla({ datos_al: "'Resumen'!$C$4" }, [{ ref: 'A1', v: 'x' }]));
    resumen = entradaDe(SALIDA, 'xl/worksheets/sheet2.xml');
    comprobar('sin formato, como texto (y con el nombre de la hoja entre comillas)', new RegExp(`<c r="C4" t="inlineStr"><is><t>${fecha.texto(SEP30)}</t>`).test(resumen), resumen);
    ({ r } = await conPlantilla({}, [{ ref: 'A1', v: 'x' }]));
    comprobar('sin el nombre, la plantilla queda como estaba', r.status === 'completed' && !/2026/.test(entradaDe(SALIDA, 'xl/worksheets/sheet2.xml')));

    console.log('\npublicar');
    const PUB = path.join(TMP, 'publicado');
    fs.mkdirSync(PUB);
    ({ r } = await correr([
        { id: 'f', type: 'fuente', label: 'Ventas', config: { fuente: 'ventas' } },
        { id: 'p', type: 'publicar', label: 'Publicar', config: { fuente: 'ventas-limpias', carpeta: PUB, formato: 'parquet' } },
    ], [{ id: 'e1', source: 'f', target: 'p' }]));
    const kv = await post('/api/query', { query: `SELECT decode(value) AS v FROM parquet_kv_metadata('${path.join(PUB, 'ventas-limpias.parquet').replace(/\\/g, '/')}') WHERE decode(key) = 'amoxsql.datos_al'` });
    comprobar('lo publicado la lleva en sus metadatos', r.status === 'completed' && String(kv.data?.[0]?.v || '') === SEP30.toISOString(), JSON.stringify(kv).slice(0, 300));

    console.log('\nel pie de Report Flow');
    await post('/api/query', { query: `CREATE TABLE metas AS SELECT * FROM read_csv('${CSV.replace(/\\/g, '/')}')` });
    await require(path.join(RAIZ, 'server/procedencia.js')).anotar(require(path.join(RAIZ, 'server/DatabaseManager.js')), '"metas"', { origen: 'importar', archivos: [CSV] });
    let h = await post('/api/fecha-de-los-datos', { query: 'SELECT Tienda, sum(Meta) FROM metas GROUP BY ALL' });
    comprobar('una tabla con procedencia: la fecha de su archivo', h.datosAl && new Date(h.datosAl).getTime() === SEP15.getTime(), JSON.stringify(h));
    h = await post('/api/fecha-de-los-datos', { query: 'SELECT * FROM metas m JOIN fuentes."ventas" v USING (Tienda)' });
    comprobar('una tabla y una fuente: la más nueva', h.datosAl && new Date(h.datosAl).getTime() === SEP30.getTime() && h.de.length === 2, JSON.stringify(h));
    h = await post('/api/fecha-de-los-datos', { query: 'SELECT 42' });
    comprobar('sin nada que la diga, null', h.datosAl === null);
    h = await post('/api/fecha-de-los-datos', { query: 'SELECT * FROM metas_viejas' });
    comprobar('un nombre que sólo se parece no cuenta', h.datosAl === null, JSON.stringify(h));

    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
