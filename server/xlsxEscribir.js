/**
 * xlsxEscribir.js — un libro de Excel con formato, escrito por AmoxSQL
 * (5.11, D3; Dec-20 del plan).
 *
 * Antes la salida a Excel era `COPY … (FORMAT GDAL, DRIVER 'xlsx')`: una hoja
 * plana, sin formato, y cargando una extensión pesada. Aquí:
 *
 *   - varias hojas, una por consulta;
 *   - encabezado en negrita, fijo al desplazar y con filtro;
 *   - cada columna con el ancho de su contenido (lo mide el motor, no una muestra);
 *   - el formato sale del TIPO de la columna, no del texto: una fecha es una
 *     fecha de Excel, un DECIMAL(18,2) lleva dos decimales, un entero no lleva
 *     separador de miles (años, códigos), y un identificador de 64 bits que
 *     Excel no puede guardar sin perder dígitos va como texto;
 *   - se puede forzar el formato de una columna (moneda, porcentaje…).
 *
 * Las filas se leen del motor por tandas y la hoja se comprime en flujo: un
 * millón de filas no está nunca entero en memoria. Se escribe aparte y se
 * renombra (Dec-13), como al publicar.
 */
const fs = require('fs');
const path = require('path');
const { EscritorZip } = require('./zip');

const MAX_FILAS = 1048576;          // de Excel, con el encabezado
const MAX_COLUMNAS = 16384;
const MAX_TEXTO = 32767;            // caracteres por celda
const TANDA = 20000;

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ── Texto ───────────────────────────────────────────────────────────────────

const PROHIBIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const esc = (s) => String(s).replace(PROHIBIDOS, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A1 → la letra de la columna n (0 → A). */
function letra(n) {
    let s = '';
    for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
}

/** Un nombre de hoja que Excel acepta: ≤ 31, sin []:*?/\ , único y no vacío. */
function nombreDeHoja(nombre, usados) {
    let n = String(nombre || '').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Sheet';
    if (n.toLowerCase() === 'history') n = 'History 1';
    n = n.slice(0, 31);
    let final = n, k = 2;
    while (usados.has(final.toLowerCase())) {
        const sufijo = ` (${k++})`;
        final = n.slice(0, 31 - sufijo.length) + sufijo;
    }
    usados.add(final.toLowerCase());
    return final;
}

// ── Fechas: número de serie de Excel (días desde 1899-12-30) ────────────────

const DIA_MS = 86400000;
const BASE = Date.UTC(1899, 11, 30);
const MIN_FECHA = Date.UTC(1900, 2, 1);   // antes de marzo de 1900 Excel cuenta mal (el 29-feb-1900 que no existió)

function serieDeFecha(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?$/.exec(String(texto));
    if (!m) return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? Math.round(+`0.${m[7]}` * 1000) : 0);
    if (ms < MIN_FECHA || +m[1] > 9999) return null;
    return (ms - BASE) / DIA_MS;
}

function serieDeHora(texto) {
    const m = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(String(texto));
    if (!m) return null;
    return ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +`0.${m[4]}` : 0)) / 86400;
}

// ── Tipos del motor → tipos de celda ────────────────────────────────────────

const ENTEROS = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|INT\d*)$/i;
const REALES = /^(FLOAT|DOUBLE|REAL|FLOAT4|FLOAT8)$/i;

/** Qué es cada columna para Excel, a partir de su tipo en el motor. */
function claseDe(tipo) {
    const t = String(tipo).toUpperCase();
    if (ENTEROS.test(t)) return { clase: 'entero' };
    const d = /^DECIMAL\((\d+),\s*(\d+)\)$/.exec(t);
    if (d) return { clase: 'decimal', decimales: Math.min(+d[2], 10) };
    if (REALES.test(t)) return { clase: 'real' };
    if (t === 'DATE') return { clase: 'fecha' };
    if (/^TIMESTAMP/.test(t)) return { clase: 'fechaHora' };
    if (/^TIME( WITH TIME ZONE)?$/.test(t) || t === 'TIMETZ') return { clase: 'hora' };
    if (t === 'BOOLEAN') return { clase: 'logico' };
    return { clase: 'texto' };
}

/** Lo que se le pide al motor por columna: lo que no es número, fecha ni lógico, como texto. */
function proyeccion(columnas) {
    return columnas.map((c, i) => {
        const id = `"${String(c.nombre).replace(/"/g, '""')}"`;
        const t = String(c.tipo).toUpperCase();
        let e = id;
        if (t === 'TIMESTAMP WITH TIME ZONE' || t === 'TIMESTAMPTZ') e = `CAST(${id} AS TIMESTAMP)`;   // la hora de esta máquina
        else if (c.clase === 'texto' && t !== 'VARCHAR') e = `CAST(${id} AS VARCHAR)`;
        return `${e} AS c${i}`;
    }).join(', ');
}

// ── Formatos ────────────────────────────────────────────────────────────────

/**
 * Los formatos que se pueden forzar por columna (`formatos: { columna: 'moneda' }`),
 * o un código de formato de Excel tal cual.
 */
const CON_NOMBRE = {
    entero: '#,##0',
    decimal: '#,##0.00',
    moneda: '"$"#,##0.00',
    porcentaje: '0.0%',
    fecha: 'yyyy-mm-dd',
    fechaHora: 'yyyy-mm-dd hh:mm:ss',
    hora: 'hh:mm:ss',
    texto: '@',
    general: 'General',
};

function codigoDeFormato(col, forzado) {
    if (forzado) return CON_NOMBRE[forzado] || String(forzado);
    switch (col.clase) {
        case 'decimal': return col.decimales ? `#,##0.${'0'.repeat(col.decimales)}` : '#,##0';
        case 'real': return col.todosEnteros ? '#,##0' : '#,##0.00';
        case 'fecha': return 'yyyy-mm-dd';
        case 'fechaHora': return 'yyyy-mm-dd hh:mm:ss';
        case 'hora': return 'hh:mm:ss';
        default: return 'General';
    }
}

/** El registro de estilos del libro: cada formato distinto, un `xf`. */
class Estilos {
    constructor() {
        this.formatos = new Map();     // código → numFmtId
        this.xfs = [{ numFmtId: 0 }, { numFmtId: 0, encabezado: true }];   // 0 normal, 1 encabezado
        this.porCodigo = new Map();
    }
    xfDe(codigo) {
        if (codigo === 'General') return 0;
        if (this.porCodigo.has(codigo)) return this.porCodigo.get(codigo);
        const integrados = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '@': 49 };
        let id = integrados[codigo];
        if (id == null) {
            if (!this.formatos.has(codigo)) this.formatos.set(codigo, 164 + this.formatos.size);
            id = this.formatos.get(codigo);
        }
        this.xfs.push({ numFmtId: id });
        const xf = this.xfs.length - 1;
        this.porCodigo.set(codigo, xf);
        return xf;
    }
    xml() {
        const numFmts = [...this.formatos].map(([c, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(c)}"/>`).join('');
        const xfs = this.xfs.map(x => x.encabezado
            ? '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
            : `<xf numFmtId="${x.numFmtId}" fontId="0" fillId="0" borderId="0" xfId="0"${x.numFmtId ? ' applyNumberFormat="1"' : ''}/>`).join('');
        return XML + `<styleSheet xmlns="${NS}">` +
            (this.formatos.size ? `<numFmts count="${this.formatos.size}">${numFmts}</numFmts>` : '') +
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
            '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
            '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
            '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
            '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
            '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            `<cellXfs count="${this.xfs.length}">${xfs}</cellXfs>` +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
            '</styleSheet>';
    }
}

// ── Una celda ───────────────────────────────────────────────────────────────

/**
 * El XML de una celda a partir del valor que devuelve el motor (JSON):
 * números, textos, lógicos, o texto para lo que no cabe en un número de Excel.
 */
function celda(ref, valor, col, xf) {
    if (valor === null || valor === undefined) return '';
    const s = xf ? ` s="${xf}"` : '';
    const texto = (t) => {
        let v = String(t);
        if (v.length > MAX_TEXTO) { v = v.slice(0, MAX_TEXTO - 1) + '…'; col.recortadas = (col.recortadas || 0) + 1; }
        return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    };
    switch (col.clase) {
        case 'entero': {
            const n = Number(valor);
            // Un BIGINT de más de 15 dígitos pierde los últimos en Excel: como texto.
            return Number.isSafeInteger(n) && Math.abs(n) < 1e15 ? `<c r="${ref}"${s}><v>${n}</v></c>` : texto(valor);
        }
        case 'decimal':
        case 'real': {
            const n = typeof valor === 'number' ? valor : Number(valor);
            return Number.isFinite(n) ? `<c r="${ref}"${s}><v>${n}</v></c>` : texto(valor);
        }
        case 'fecha':
        case 'fechaHora': {
            const n = serieDeFecha(valor);
            return n == null ? texto(valor) : `<c r="${ref}"${s}><v>${n}</v></c>`;
        }
        case 'hora': {
            const n = serieDeHora(String(valor).replace(/[+-]\d{2}(:\d{2})?$/, ''));
            return n == null ? texto(valor) : `<c r="${ref}"${s}><v>${n}</v></c>`;
        }
        case 'logico':
            return `<c r="${ref}" t="b"${s}><v>${valor === true || valor === 'true' ? 1 : 0}</v></c>`;
        default:
            if (typeof valor === 'object') return texto(JSON.stringify(valor));
            return texto(valor);
    }
}

// ── Del motor a una hoja ────────────────────────────────────────────────────

let contador = 0;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

/**
 * Prepara una consulta para escribirla: la materializa en una tabla temporal
 * (las tandas leen siempre lo mismo y los nombres repetidos ya vienen
 * desambiguados), mira sus tipos, cuenta y mide los anchos.
 *
 * @param db  { query(sql) } — la conexión del paso (o la de la interfaz)
 * @returns { columnas, filas, tabla, soltar() }
 */
async function prepararConsulta(db, consulta) {
    const tabla = `__amox_xlsx_${process.pid}_${++contador}`;
    await db.query(`CREATE OR REPLACE TEMP TABLE ${ident(tabla)} AS SELECT * FROM (${consulta})`);
    const soltar = async () => { try { await db.query(`DROP TABLE IF EXISTS ${ident(tabla)}`); } catch { /* ya no está */ } };
    try {
        const columnas = (await db.query(`DESCRIBE ${ident(tabla)}`)).map(c => ({ nombre: c.column_name, tipo: c.column_type, ...claseDe(c.column_type) }));
        if (columnas.length > MAX_COLUMNAS) throw new Error(`Excel holds at most ${MAX_COLUMNAS} columns; this result has ${columnas.length}.`);
        // Una sola pasada: filas, el texto más largo de cada columna y si un real es entero.
        const medidas = columnas.map((c, i) => {
            const id = ident(c.nombre);
            const largo = `max(length(CAST(${id} AS VARCHAR))) AS l${i}`;
            return c.clase === 'real' ? `${largo}, bool_and(${id} = round(${id})) AS e${i}` : largo;
        });
        const [m] = await db.query(`SELECT count(*) AS n${medidas.length ? ', ' + medidas.join(', ') : ''} FROM ${ident(tabla)}`);
        const filas = Number(m.n);
        if (filas + 1 > MAX_FILAS) {
            throw new Error(`Excel holds at most ${(MAX_FILAS - 1).toLocaleString('en-US')} rows per sheet; this result has ${filas.toLocaleString('en-US')}. Filter it, or split it into several sheets.`);
        }
        columnas.forEach((c, i) => {
            c.largo = Number(m[`l${i}`] || 0);
            if (c.clase === 'real') c.todosEnteros = m[`e${i}`] === true;
        });
        return { columnas, filas, tabla, soltar };
    } catch (e) {
        await soltar();
        throw e;
    }
}

/** El ancho de una columna, en caracteres: lo que ocupa su contenido formateado. */
function anchoDe(col, codigo) {
    let n = col.largo || 0;
    if (col.clase === 'fecha') n = 10;
    else if (col.clase === 'fechaHora') n = 19;
    else if (col.clase === 'hora') n = 8;
    else if (col.clase === 'decimal' || col.clase === 'real' || (col.clase === 'entero' && codigo !== 'General')) n += Math.floor(n / 3) + 1;  // separadores
    if (/%/.test(codigo)) n += 2;
    if (/\$/.test(codigo)) n += 2;
    const encabezado = String(col.nombre).length + 3;     // con sitio para la flecha del filtro
    return Math.min(60, Math.max(6, n, encabezado) + 1.5);
}

/** Las filas de la tabla temporal, por tandas y en orden. */
async function* tandas(db, preparada) {
    const lista = proyeccion(preparada.columnas);
    for (let desde = 0; desde < preparada.filas; desde += TANDA) {
        const filas = await db.query(`SELECT ${lista} FROM ${ident(preparada.tabla)} WHERE rowid >= ${desde} AND rowid < ${desde + TANDA} ORDER BY rowid`);
        yield filas;
    }
}

/** El XML de una hoja, a trozos. */
async function* xmlDeHoja(db, preparada, { estilos, formatos = {}, encabezado = true }) {
    const { columnas, filas } = preparada;
    const codigos = columnas.map(c => codigoDeFormato(c, formatos[c.nombre]));
    const xfs = codigos.map(c => estilos.xfDe(c));
    const ultima = letra(Math.max(0, columnas.length - 1));
    const filaFinal = filas + (encabezado ? 1 : 0);

    let x = XML + `<worksheet xmlns="${NS}" xmlns:r="${NS_R}">`;
    x += `<dimension ref="A1:${ultima}${Math.max(1, filaFinal)}"/>`;
    x += '<sheetViews><sheetView workbookViewId="0"' + (encabezado ? '' : ' tabSelected="0"') + '>';
    if (encabezado && columnas.length) x += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
    x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    if (columnas.length) {
        x += '<cols>' + columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${anchoDe(c, codigos[i]).toFixed(2)}" customWidth="1"${xfs[i] ? ` style="${xfs[i]}"` : ''}/>`).join('') + '</cols>';
    }
    x += '<sheetData>';
    if (encabezado && columnas.length) {
        x += '<row r="1">' + columnas.map((c, i) => `<c r="${letra(i)}1" t="inlineStr" s="1"><is><t xml:space="preserve">${esc(c.nombre)}</t></is></c>`).join('') + '</row>';
    }
    yield x;

    let r = encabezado ? 1 : 0;
    const letras = columnas.map((_, i) => letra(i));
    for await (const tanda of tandas(db, preparada)) {
        let trozo = '';
        for (const f of tanda) {
            r++;
            let fila = `<row r="${r}">`;
            for (let i = 0; i < columnas.length; i++) fila += celda(`${letras[i]}${r}`, f[`c${i}`], columnas[i], xfs[i]);
            trozo += fila + '</row>';
        }
        yield trozo;
    }
    let fin = '</sheetData>';
    if (encabezado && columnas.length) fin += `<autoFilter ref="A1:${ultima}${Math.max(1, filaFinal)}"/>`;
    fin += '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    yield fin;
}

// ── El libro ────────────────────────────────────────────────────────────────

function partesFijas(hojas, estilos) {
    const ct = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>';
    const rels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        '</Relationships>';
    const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:creator>AmoxSQL</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified></cp:coreProperties>`;
    const app = XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AmoxSQL</Application></Properties>';
    const libro = XML + `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><bookViews><workbookView/></bookViews><sheets>` +
        hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
        (hojas.some(h => h.filtro) ? '<definedNames>' + hojas.map((h, i) => h.filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(`'${h.nombre.replace(/'/g, "''")}'!${h.filtro}`)}</definedName>` : '').join('') + '</definedNames>' : '') +
        '<calcPr calcId="191029"/></workbook>';
    const librorels = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>';
    return { ct, rels, core, app, libro, librorels };
}

/**
 * Escribe un libro con una hoja por consulta.
 *
 * @param db       { query(sql) } — la conexión donde se corren las consultas
 * @param destino  ruta del .xlsx
 * @param hojas    [{ nombre, consulta, formatos?: { columna: 'moneda' | 'porcentaje' | … | código } }]
 * @returns { ruta, hojas: [{ nombre, filas, columnas, recortadas }], bytes }
 */
async function escribirLibro(db, destino, hojas) {
    if (!hojas?.length) throw new Error('The workbook needs at least one sheet.');
    const usados = new Set();
    const preparadas = [];
    try {
        for (const h of hojas) {
            const p = await prepararConsulta(db, h.consulta);
            const nombre = nombreDeHoja(h.nombre, usados);
            const ultima = letra(Math.max(0, p.columnas.length - 1));
            preparadas.push({ ...p, nombre, formatos: h.formatos || {}, filtro: p.columnas.length ? `$A$1:$${ultima}$${p.filas + 1}` : null });
        }

        const dir = path.dirname(destino);
        fs.mkdirSync(dir, { recursive: true });
        const temporal = path.join(dir, `.${path.basename(destino)}.amoxtmp`);
        const zip = new EscritorZip(temporal);
        const estilos = new Estilos();
        try {
            for (let i = 0; i < preparadas.length; i++) {
                await zip.agregarFlujo(`xl/worksheets/sheet${i + 1}.xml`, xmlDeHoja(db, preparadas[i], { estilos, formatos: preparadas[i].formatos }));
            }
            const f = partesFijas(preparadas, estilos);
            zip.agregar('[Content_Types].xml', f.ct);
            zip.agregar('_rels/.rels', f.rels);
            zip.agregar('docProps/core.xml', f.core);
            zip.agregar('docProps/app.xml', f.app);
            zip.agregar('xl/workbook.xml', f.libro);
            zip.agregar('xl/_rels/workbook.xml.rels', f.librorels);
            zip.agregar('xl/styles.xml', estilos.xml());
            zip.cerrar();
        } catch (e) {
            zip.abandonar();
            try { fs.rmSync(temporal, { force: true }); } catch { /* ya no está */ }
            throw e;
        }
        const { renombrarConReintentos } = require('./publicar');
        const reintentos = await renombrarConReintentos(temporal, destino);
        return {
            ruta: destino,
            bytes: fs.statSync(destino).size,
            reintentos,
            hojas: preparadas.map(p => ({
                nombre: p.nombre, filas: p.filas, columnas: p.columnas.length,
                recortadas: p.columnas.reduce((s, c) => s + (c.recortadas || 0), 0),
            })),
        };
    } finally {
        for (const p of preparadas) await p.soltar();
    }
}

module.exports = {
    escribirLibro, prepararConsulta, xmlDeHoja, celda, claseDe, codigoDeFormato, nombreDeHoja,
    serieDeFecha, serieDeHora, letra, esc, Estilos, CON_NOMBRE, MAX_FILAS, XML, NS,
};
