/**
 * Fases 0.2 y 0.3 de la 5.13 (Dec-37, Dec-38, Dec-39): el contrato de una fuente Excel.
 *
 *     node scripts/poc513/p01_contrato.mjs
 *
 * 0.2 · Cuánto cuesta comprobarlo en un libro de 50.000 filas: DESCRIBE para las
 *       columnas y UNA consulta para todas las reglas.
 * 0.3 · Si la «familia» de tipo de cada columna aguanta lo que hace un cliente de una
 *       semana a otra: enteros que pasan a decimales, la primera celda vacía, un
 *       «N/A» en medio, fechas escritas como texto, una columna renombrada o de más.
 *
 * Los libros se escriben celda a celda (no con el escritor de AmoxSQL, que da a cada
 * columna un solo tipo): así se pueden mezclar un texto y números en una columna,
 * como pasa en los Excel de verdad. Se leen como los lee una fuente (`excel.js`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { crearInstancia } = require(path.join(RAIZ, 'server/motor.js'));
const excel = require(path.join(RAIZ, 'server/excel.js'));
const { EscritorZip } = require(path.join(RAIZ, 'server/zip.js'));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-poc513-contrato-'));
const anota = (t, ok, d = '') => console.log(`${ok ? 'SI ' : 'NO '} ${t}${d ? `  — ${String(d).slice(0, 300)}` : ''}`);
const dato = (t, d) => console.log(`··  ${t}: ${d}`);

// ── Un libro mínimo, celda a celda ──────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const letra = (i) => String.fromCharCode(65 + i);
const serie = (d) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);
function celda(v, ref) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return `<c r="${ref}" s="1"><v>${serie(v)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
}
function libro(ruta, encabezado, filas) {
    const xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
    [encabezado, ...filas].forEach((f, i) => {
        xml.push(`<row r="${i + 1}">${f.map((v, j) => celda(v, `${letra(j)}${i + 1}`)).join('')}</row>`);
    });
    xml.push('</sheetData></worksheet>');
    const z = new EscritorZip(ruta);
    z.agregar('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    z.agregar('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    z.agregar('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ventas" sheetId="1" r:id="rId1"/></sheets></workbook>');
    z.agregar('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    z.agregar('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>');
    z.agregar('xl/worksheets/sheet1.xml', xml.join(''));
    z.cerrar();
    return ruta;
}

// ── La familia de un tipo del motor (Dec-37) ────────────────────────────────
function familia(tipo) {
    const t = String(tipo).toUpperCase();
    if (/^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|DECIMAL)/.test(t)) return 'numero';
    if (/^(DATE|TIMESTAMP|TIME)/.test(t)) return 'fecha';
    if (t === 'BOOLEAN') return 'logico';
    return 'texto';
}

const inst = await crearInstancia(':memory:');
const con = await inst.connect();
const q = async (sql) => (await con.runAndReadAll(sql)).getRowObjectsJson();
await q('INSTALL excel; LOAD excel');
const columnas = async (ruta) => (await q(`DESCRIBE ${excel.sqlDeLectura(ruta, {})}`)).map(c => ({ nombre: c.column_name, tipo: c.column_type, familia: familia(c.column_type) }));
const medir = async (fn) => { const t = performance.now(); const r = await fn(); return { r, ms: Math.round(performance.now() - t) }; };

// ── 0.2 · El coste, en 50.000 filas ─────────────────────────────────────────
console.log('\n0.2 · el coste');
const tiendas = ['norte', 'sur', 'este', 'oeste'];
const grande = [];
for (let i = 0; i < 50000; i++) grande.push([i + 1, tiendas[i % 4], Math.round(Math.random() * 100000) / 100, new Date(Date.UTC(2026, 9, 1 + (i % 28))), i % 97 ? 'pagado' : 'devuelto']);
let m = await medir(async () => libro(path.join(T, 'grande.xlsx'), ['Folio', 'Tienda', 'Importe', 'Fecha', 'Estado'], grande));
dato('escribir el libro de prueba', `${m.ms} ms, ${(fs.statSync(path.join(T, 'grande.xlsx')).size / 1048576).toFixed(1)} MB`);
const G = path.join(T, 'grande.xlsx');
await q(`CREATE VIEW ventas AS ${excel.sqlDeLectura(G, {})}`);
m = await medir(() => q('SELECT count(*) AS n FROM ventas'));
dato('leer el libro entero (count)', `${m.ms} ms · ${m.r[0].n} filas`);
const base = m.ms;
m = await medir(() => q('DESCRIBE ventas'));
anota('DESCRIBE: las columnas y sus tipos', m.r.length === 5, `${m.ms} ms · ${m.r.map(c => `${c.column_name} ${c.column_type}`).join(', ')}`);
const reglas = `SELECT
    count(*) AS filas,
    count(*) FILTER (WHERE "Importe" IS NULL) AS r_no_nulos,
    count(*) - count(DISTINCT "Folio") AS r_unico,
    count(*) FILTER (WHERE "Importe" < 0) AS r_rango,
    count(*) FILTER (WHERE "Tienda" NOT IN ('norte', 'sur', 'este', 'oeste')) AS r_valores,
    count(*) FILTER (WHERE "Fecha" IS NULL) AS r_fecha
FROM ventas`;
m = await medir(() => q(reglas));
anota('cinco reglas en UNA consulta', m.r[0].r_unico == 0, `${m.ms} ms (leer: ${base} ms) · ${JSON.stringify(m.r[0])}`);
dato('coste del contrato frente a leer el archivo', `${(m.ms / Math.max(base, 1)).toFixed(2)}×`);

// ── 0.3 · ¿Aguantan las familias lo que cambia de una semana a otra? ─────────
console.log('\n0.3 · lo que cambia de una semana a otra');
const enc = ['Folio', 'Tienda', 'Importe', 'Fecha'];
const filas = (f) => Array.from({ length: 200 }, (_, i) => f(i));
const d = (i) => new Date(Date.UTC(2026, 9, 1 + (i % 28)));
const casos = [
    ['base: enteros y fechas', enc, filas(i => [i + 1, 'norte', 100 + i, d(i)])],
    ['los importes pasan a decimales', enc, filas(i => [i + 1, 'norte', 100.5 + i, d(i)])],
    ['la primera celda de Importe, vacía', enc, filas(i => [i + 1, 'norte', i === 0 ? null : 100 + i, d(i)])],
    ['un «N/A» en medio de Importe', enc, filas(i => [i + 1, 'norte', i === 100 ? 'N/A' : 100 + i, d(i)])],
    ['un «N/A» en la primera fila de Importe', enc, filas(i => [i + 1, 'norte', i === 0 ? 'N/A' : 100 + i, d(i)])],
    ['las fechas escritas como texto', enc, filas(i => [i + 1, 'norte', 100 + i, `${String(1 + (i % 28)).padStart(2, '0')}/10/2026`])],
    ['la primera fecha vacía', enc, filas(i => [i + 1, 'norte', 100 + i, i === 0 ? null : d(i)])],
    ['«Importe» renombrada a «Monto»', ['Folio', 'Tienda', 'Monto', 'Fecha'], filas(i => [i + 1, 'norte', 100 + i, d(i)])],
    ['una columna de más', [...enc, 'Notas'], filas(i => [i + 1, 'norte', 100 + i, d(i), 'x'])],
];
const contrato = (await columnas(libro(path.join(T, 'c0.xlsx'), casos[0][1], casos[0][2]))).map(c => ({ nombre: c.nombre, familia: c.familia }));
dato('contrato tomado de la base', contrato.map(c => `${c.nombre}:${c.familia}`).join(', '));

/** El prototipo de Dec-39: qué cambió, en palabras. */
function comparar(contrato, hoy, { estricto = false } = {}) {
    const fallos = [];
    const porNombre = new Map(hoy.map(c => [c.nombre, c]));
    const faltan = contrato.filter(c => !porNombre.has(c.nombre));
    const nuevas = hoy.filter(c => !contrato.some(x => x.nombre === c.nombre));
    for (const c of faltan) {
        const parecida = nuevas.find(n => n.familia === c.familia);
        fallos.push(`the column "${c.nombre}" is missing${parecida ? ` — "${parecida.nombre}" is new: was it renamed?` : ''}`);
    }
    for (const c of contrato) {
        const h = porNombre.get(c.nombre);
        if (h && h.familia !== c.familia) fallos.push(`"${c.nombre}" was ${c.familia === 'numero' ? 'a number' : c.familia === 'fecha' ? 'a date' : c.familia} and now is ${h.familia === 'texto' ? 'text' : h.familia} (${h.tipo})`);
    }
    if (estricto) for (const n of nuevas) fallos.push(`unexpected column "${n.nombre}"`);
    return fallos;
}

const resultado = [];
for (const [i, [titulo, e, f]] of casos.entries()) {
    const hoy = await columnas(libro(path.join(T, `c${i}.xlsx`), e, f));
    const fallos = comparar(contrato, hoy);
    resultado.push({ titulo, tipos: hoy.map(c => `${c.nombre}:${c.tipo}`).join(', '), fallos });
    console.log(`··  ${titulo}\n      tipos: ${hoy.map(c => `${c.nombre} ${c.tipo}`).join(', ')}\n      contrato: ${fallos.length ? fallos.join(' · ') : 'OK'}`);
}
const r = Object.fromEntries(resultado.map(x => [x.titulo, x.fallos]));
anota('enteros → decimales no rompe el contrato (misma familia)', r['los importes pasan a decimales'].length === 0);
anota('una columna renombrada se dice, con la sugerencia', /was it renamed/.test(r['«Importe» renombrada a «Monto»'].join()), r['«Importe» renombrada a «Monto»'].join());
anota('una columna de más no rompe un contrato no estricto', r['una columna de más'].length === 0);
dato('la primera celda vacía', r['la primera celda de Importe, vacía'].join() || 'OK');
dato('un N/A en medio', r['un «N/A» en medio de Importe'].join() || 'OK');
dato('un N/A en la primera fila', r['un «N/A» en la primera fila de Importe'].join() || 'OK');
dato('fechas como texto', r['las fechas escritas como texto'].join() || 'OK');
dato('primera fecha vacía', r['la primera fecha vacía'].join() || 'OK');

// ── 0.3b · Con contrato: leer como texto y convertir a la familia ────────────
// Lo de arriba deja dos trampas: una celda vacía arriba vuelve texto a toda la
// columna (falso fallo), y un «N/A» en medio pasa el DESCRIBE como número pero la
// lectura revienta en esa celda. Leyendo como texto (`all_varchar`) y convirtiendo
// cada columna a su familia, las dos desaparecen y lo que no convierte se cuenta.
console.log('\n0.3b · con contrato: leer como texto y convertir');
const comoTexto = (ruta) => `read_xlsx(${"'" + ruta.replace(/\\/g, '/') + "'"}, all_varchar = true)`;
const aNumero = (c) => `TRY_CAST("${c}" AS DOUBLE)`;
const aFecha = (c) => `coalesce(try_strptime("${c}", ['%Y-%m-%d', '%d/%m/%Y'])::DATE, DATE '1899-12-30' + TRY_CAST(TRY_CAST("${c}" AS DOUBLE) AS INTEGER))`;
let tipada = await q(`SELECT count(*) AS n FROM (${excel.sqlDeLectura(path.join(T, 'c3.xlsx'), {})})`).catch(e => e.message.split('\n')[0]);
anota('leída con tipos, el «N/A» en medio rompe la lectura', typeof tipada === 'string', tipada);
let x = await q(`SELECT count(*) FILTER (WHERE "Importe" IS NOT NULL AND ${aNumero('Importe')} IS NULL) AS no_numero, list("Importe") FILTER (WHERE "Importe" IS NOT NULL AND ${aNumero('Importe')} IS NULL) AS cuales FROM ${comoTexto(path.join(T, 'c3.xlsx'))}`);
anota('como texto: lee, y cuenta y nombra lo que no es un número', x[0].no_numero == 1, JSON.stringify(x[0]));
for (const [n, t] of [['c2', 'primera celda de Importe vacía'], ['c5', 'fechas escritas como texto'], ['c6', 'primera fecha vacía'], ['c0', 'fechas de verdad (llegan como número de serie)']]) {
    x = await q(`SELECT count(*) FILTER (WHERE "Importe" IS NOT NULL AND ${aNumero('Importe')} IS NULL) AS mal_importe, count(*) FILTER (WHERE "Fecha" IS NOT NULL AND ${aFecha('Fecha')} IS NULL) AS mal_fecha, min(${aFecha('Fecha')}) AS primera FROM ${comoTexto(path.join(T, `${n}.xlsx`))}`);
    anota(`como texto y convertida: ${t}, sin falso fallo`, x[0].mal_importe == 0 && x[0].mal_fecha == 0 && x[0].primera === '2026-10-01', JSON.stringify(x[0]));
}
m = await medir(() => q(`SELECT count(*) FILTER (WHERE "Importe" IS NOT NULL AND ${aNumero('Importe')} IS NULL) a, count(*) FILTER (WHERE ${aFecha('Fecha')} IS NULL) b, count(*) - count(DISTINCT ${aNumero('Folio')}) u FROM ${comoTexto(G)}`));
dato('50.000 filas como texto, convertidas y con reglas', `${m.ms} ms (leer con tipos: ${base} ms) → ${(m.ms / Math.max(base, 1)).toFixed(2)}×`);

console.log(`\n${T}`);
process.exit(0);
