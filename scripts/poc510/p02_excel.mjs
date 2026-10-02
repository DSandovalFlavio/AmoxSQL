/**
 * Prueba de concepto 0.2 de la 5.10 (Dec-11, fase 2 · C2).
 *
 * ¿El motor lee un Excel «de cliente» (titulo arriba, encabezados en la fila 4,
 * notas al pie) con `range` y `header`? ¿Que hace con celdas combinadas y
 * fechas? ¿Que extension da `read_xlsx`: hace falta `spatial`? ¿El lector
 * propio de hojas (`xlsxMeta.js`) basta sin la libreria, y falla con un error
 * claro con un .xls, uno cifrado o uno dañado?
 *
 *   node scripts/poc510/p02_excel.mjs
 *
 * Usa los archivos de scripts/fixtures/excel/ (se rehacen con generar.py).
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');
const { readWorkbookXml, parseSheetNames } = require('../../server/xlsxMeta.js');

const aqui = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => path.join(aqui, '..', 'fixtures', 'excel', n).split(path.sep).join('/');

const resultados = [];
const anota = (pregunta, ok, detalle = '') => {
    resultados.push({ pregunta, ok });
    console.log(`${ok ? 'SI ' : 'NO '} ${pregunta}${detalle ? `  — ${detalle}` : ''}`);
};

const inst = await DuckDBInstance.create(':memory:');
const c = await inst.connect();
const filas = async (sql) => (await c.runAndReadAll(sql)).getRowObjectsJson();
const intenta = async (sql) => {
    try { return { ok: true, filas: await filas(sql) }; }
    catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0] }; }
};

// --- La extension: sin cargar nada, ¿read_xlsx se autocarga desde `excel`?
{
    const r = await intenta(`SELECT count(*)::INT AS n FROM read_xlsx('${fx('varias_hojas.xlsx')}', sheet = 'Enero')`);
    anota('read_xlsx funciona sin LOAD explicito (autocarga)', r.ok && r.filas[0].n === 2, r.error);
    const ext = await filas(`SELECT extension_name, loaded FROM duckdb_extensions() WHERE loaded AND extension_name IN ('excel', 'spatial')`);
    anota('la da la extension excel, sin spatial', ext.some(e => e.extension_name === 'excel') && !ext.some(e => e.extension_name === 'spatial'),
        JSON.stringify(ext));
}

// --- El Excel de cliente
{
    // Sin pistas: el motor toma la fila 1 (titulo) como encabezado
    let r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}') LIMIT 2`);
    anota('sin range, el titulo se cuela como encabezado (motivo de C2)', r.ok && !('Tienda' in (r.filas[0] || {})),
        r.ok ? Object.keys(r.filas[0] || {}).join(', ') : r.error);

    // Con range desde la fila de encabezados hasta el ultimo dato. El motor
    // decide el tipo de cada columna por la PRIMERA fila de datos: «Notas» esta
    // vacia en la fila 5 y la toma por numero; en la 6 llega texto y falla.
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E10', header = true)`);
    anota('sin empty_as_varchar, una columna vacia en la primera fila rompe la lectura',
        !r.ok && /Could not convert/.test(r.error), r.error);

    // ignore_errors «arregla» perdiendo el dato: la nota desaparece sin aviso
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E10', header = true, ignore_errors = true)`);
    anota('ignore_errors pierde el texto en silencio (no se usa nunca)',
        r.ok && r.filas.every(f => f.Notas === null), r.ok ? `Notas de la fila 2: ${r.filas[1].Notas}` : r.error);

    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E10', header = true, empty_as_varchar = true)`);
    anota('range A4:E10 + header lee los encabezados reales', r.ok && 'Tienda' in r.filas[0] && r.filas.length === 6,
        r.ok ? `${r.filas.length} filas; ${Object.keys(r.filas[0]).join(', ')}` : r.error);

    if (r.ok) {
        anota('empty_as_varchar conserva el texto', r.filas[1].Notas === 'Cierre anticipado', r.filas[1].Notas);
        const tipos = await filas(`DESCRIBE SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E10', header = true, empty_as_varchar = true)`);
        const t = Object.fromEntries(tipos.map(x => [x.column_name, x.column_type]));
        anota('las fechas llegan como DATE/TIMESTAMP', /DATE|TIMESTAMP/.test(t.Fecha), JSON.stringify(t));
        anota('los importes llegan como numero', /DOUBLE|DECIMAL|BIGINT/.test(t.Importe), t.Importe);
        // Celda combinada A5:A6: el valor esta solo en la primera celda
        anota('celda combinada: la segunda fila llega vacia (hay que rellenar hacia abajo)',
            r.filas[1].Tienda === null, `fila 2: ${JSON.stringify(r.filas[1].Tienda)}`);
    }

    // Rango abierto por abajo: A4:E se acepta, pero devuelve las 1 048 572 filas
    // de la hoja (vacias incluidas). Nunca se usa sin stop_at_empty.
    r = await intenta(`SELECT count(*)::INT AS n FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E', header = true, empty_as_varchar = true)`);
    anota('el rango abierto A4:E devuelve la hoja entera, vacias incluidas', r.ok && r.filas[0].n > 1000000, r.ok ? `${r.filas[0].n} filas` : r.error);
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4', header = true)`);
    anota('una sola celda no es un rango (hay que dar la columna final)', !r.ok, r.error);
    const t0 = performance.now();
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E1048576', header = true, empty_as_varchar = true, stop_at_empty = true)`);
    const ms = performance.now() - t0;
    anota('«desde A4 hasta el final» = A4:E1048576 + stop_at_empty: rapido y sin el pie',
        r.ok && r.filas.length === 6 && ms < 500, r.ok ? `${r.filas.length} filas en ${ms.toFixed(0)} ms` : r.error);

    // Las notas al pie: sin rango cerrado, entran como filas
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E100', header = true, all_varchar = true)`);
    anota('con rango holgado y all_varchar, el pie llega como filas que hay que cortar',
        r.ok && r.filas.some(f => String(f.Tienda || '').startsWith('*')),
        r.ok ? `${r.filas.length} filas` : r.error);

    // stop_at_empty: parar en la primera fila vacia
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A4:E100', header = true, stop_at_empty = true, empty_as_varchar = true)`);
    anota('stop_at_empty corta antes del pie', r.ok && r.filas.length === 6, r.ok ? `${r.filas.length} filas` : r.error);

    // Las formulas del pie: ¿el motor lee el valor calculado o la formula?
    r = await intenta(`SELECT * FROM read_xlsx('${fx('cliente.xlsx')}', range = 'A12:D12', header = false, all_varchar = true)`);
    anota('una formula sin valor guardado (archivo que no paso por Excel) se lee vacia o como formula',
        r.ok, r.ok ? JSON.stringify(r.filas[0]) : r.error);
}

// --- Varias hojas, nombres con caracteres especiales
{
    const xml = readWorkbookXml(fx('varias_hojas.xlsx').split('/').join(path.sep));
    const hojas = parseSheetNames(xml);
    anota('el lector propio lista las hojas en orden, con & y comillas',
        JSON.stringify(hojas) === JSON.stringify(['Enero', 'Febrero', 'Marzo & Año', 'Notas "internas"']), JSON.stringify(hojas));

    const r = await intenta(`SELECT * FROM read_xlsx('${fx('varias_hojas.xlsx')}', sheet = 'Marzo & Año')`);
    anota('read_xlsx abre una hoja con & y acento', r.ok && r.filas.length === 2, r.error);

    // Unir hojas (modo MERGE del dialogo) con la columna _hoja
    const union = ['Enero', 'Febrero', 'Marzo & Año']
        .map(h => `SELECT *, '${h}' AS _hoja FROM read_xlsx('${fx('varias_hojas.xlsx')}', sheet = '${h}')`)
        .join(' UNION ALL BY NAME ');
    const u = await intenta(`SELECT count(*)::INT AS n, count(DISTINCT _hoja)::INT AS h FROM (${union})`);
    anota('UNION ALL BY NAME de tres hojas con _hoja', u.ok && u.filas[0].n === 6 && u.filas[0].h === 3, u.error);
}

// --- Lo que no es un libro: el lector propio y el motor
for (const n of ['antiguo.xls', 'cifrado.xlsx', 'danado.xlsx']) {
    let propio;
    try { readWorkbookXml(fx(n).split('/').join(path.sep)); propio = 'lo leyo'; }
    catch (e) { propio = e.message; }
    anota(`${n}: el lector propio lo rechaza`, propio !== 'lo leyo', propio);
    const r = await intenta(`SELECT * FROM read_xlsx('${fx(n)}')`);
    anota(`${n}: el motor tambien lo rechaza`, !r.ok, r.error);
}

// --- Escritura: el motor tambien escribe xlsx (para D3, salida a Excel)
{
    const os = await import('os');
    const fs = await import('fs');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc02-'));
    const destino = path.join(dir, 'salida.xlsx').split(path.sep).join('/');
    let r = await intenta(`COPY (SELECT * FROM read_xlsx('${fx('varias_hojas.xlsx')}', sheet = 'Enero')) TO '${destino}' (FORMAT xlsx, HEADER true)`);
    r = r.ok ? await intenta(`SELECT count(*)::INT AS n FROM read_xlsx('${destino}')`) : r;
    anota('COPY … (FORMAT xlsx) escribe un libro que se vuelve a leer', r.ok && r.filas[0].n === 2, r.error);
    let hojas;
    try { hojas = parseSheetNames(readWorkbookXml(destino.split('/').join(path.sep))); } catch (e) { hojas = e.message; }
    anota('el lector propio lista las hojas de un xlsx escrito por el motor', Array.isArray(hojas) && hojas.length === 1, JSON.stringify(hojas));
    fs.rmSync(dir, { recursive: true, force: true });
}

const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} como se esperaba`);
process.exit(fallos ? 1 : 0);
