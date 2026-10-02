/**
 * El Excel tal como llega (C2, fase 2 del plan de la 5.10).
 *
 * Un solo sitio compone la lectura de un libro: las fuentes con nombre, el
 * diálogo de importar y el nodo Import File de Data Flow pasan por aquí, así
 * que las reglas que fijó la prueba 0.2 valen en todas partes:
 *
 *   - Siempre `empty_as_varchar = true`: el motor decide el tipo de cada
 *     columna por la primera fila de datos, y una celda vacía ahí se toma por
 *     número y rompe la lectura en cuanto llega texto. Nunca `ignore_errors`,
 *     que «arregla» eso perdiendo el texto en silencio.
 *   - «Desde A4 hasta el final» es `A4:E1048576` con `stop_at_empty`: el rango
 *     abierto `A4:E` devuelve el millón de filas de la hoja.
 *   - Una celda combinada llega llena sólo en su primera fila: se puede
 *     «rellenar hacia abajo» por columnas.
 *   - Lo que no es un libro se reconoce por su firma antes de dárselo al motor,
 *     y recibe un error que dice qué es y qué hacer.
 *
 * Las hojas se listan con el lector propio del ZIP (`xlsxMeta.js`). La librería
 * que hacía de respaldo se retiró (Dec-11).
 */
const fs = require('fs');
const path = require('path');
const xlsxMeta = require('./xlsxMeta');

const ULTIMA_FILA = 1048576;
const FILAS_DE_VISTA = 40;
// La vista cruda no sabe cuántas columnas tiene la hoja (el motor deduce el
// ancho por la primera fila, que en un informe suele ser sólo el título): se
// pide hasta ZZ y se recortan las columnas vacías del final. Cuesta lo mismo.
const ULTIMA_COLUMNA_DE_VISTA = 'ZZ';

class ErrorDeExcel extends Error {
    constructor(codigo, mensaje) {
        super(mensaje);
        this.codigo = codigo;
    }
}

// ── Qué es el archivo ───────────────────────────────────────────────────────

const FIRMA_ZIP = Buffer.from([0x50, 0x4b]);                               // PK
const FIRMA_COMPUESTO = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** 'zip' (un .xlsx), 'compuesto' (un .xls antiguo o un .xlsx cifrado), 'texto', 'vacio' u 'otro'. */
function firma(ruta) {
    const b = Buffer.alloc(512);
    let n = 0;
    const fd = fs.openSync(ruta, 'r');
    try { n = fs.readSync(fd, b, 0, b.length, 0); } finally { fs.closeSync(fd); }
    if (n === 0) return 'vacio';
    if (b.subarray(0, 2).equals(FIRMA_ZIP)) return 'zip';
    if (n >= 8 && b.subarray(0, 8).equals(FIRMA_COMPUESTO)) return 'compuesto';
    // Texto: sin bytes de control salvo tabuladores y saltos de línea.
    const muestra = b.subarray(0, n);
    const raros = [...muestra].filter(c => c < 9 || (c > 13 && c < 32)).length;
    return raros === 0 ? 'texto' : 'otro';
}

/** Lanza un ErrorDeExcel si el archivo no es un libro que se pueda leer. */
function comprobarLibro(ruta) {
    if (!fs.existsSync(ruta)) throw new ErrorDeExcel('no_existe', `The file is not there: ${ruta}`);
    switch (firma(ruta)) {
        case 'zip': return;
        case 'compuesto':
            throw new ErrorDeExcel('antiguo_o_cifrado',
                'This is an old Excel file (.xls) or a password-protected workbook. Open it in Excel and save it as an unprotected .xlsx.');
        case 'texto':
            throw new ErrorDeExcel('csv_disfrazado',
                'This file is text, not an Excel workbook: it looks like a CSV with an .xlsx extension. Read it as CSV.');
        case 'vacio':
            throw new ErrorDeExcel('vacio', 'The file is empty.');
        default:
            throw new ErrorDeExcel('danado', 'The workbook is damaged or is not an Excel file, and cannot be read.');
    }
}

/** Las hojas, en orden, sin la librería de respaldo. */
function hojas(ruta) {
    comprobarLibro(ruta);
    const cache = xlsxMeta.getCached(ruta);
    if (cache && cache.sheets) return cache.sheets;
    try {
        const { sheets } = xlsxMeta.getSheetNames(ruta);
        xlsxMeta.setCached(ruta, { ...(xlsxMeta.getCached(ruta) || {}), sheets });
        return sheets;
    } catch (e) {
        throw new ErrorDeExcel('danado', `The workbook is damaged or incomplete and cannot be read (${e.message}).`);
    }
}

// ── Rangos ──────────────────────────────────────────────────────────────────

const RANGO = /^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d*)$/;

function columnaANumero(letras) {
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n;
}

function numeroAColumna(n) {
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
}

/**
 * Normaliza un rango escrito por una persona: `a4:e` → `A4:E`. Un rango sin
 * fila final es «hasta la primera fila vacía». Lanza si no es un rango.
 */
function normalizarRango(r) {
    const t = String(r || '').trim().toUpperCase().replace(/\$/g, '');
    if (!t) return null;
    const m = RANGO.exec(t);
    if (!m) throw new ErrorDeExcel('rango', `Not a cell range: ${r}. Write it like A4:E (to the first empty row) or A4:E120.`);
    if (columnaANumero(m[3]) < columnaANumero(m[1])) throw new ErrorDeExcel('rango', `The range ${t} ends before it starts.`);
    if (m[4] && Number(m[4]) < Number(m[2])) throw new ErrorDeExcel('rango', `The range ${t} ends before it starts.`);
    return t;
}

// ── El SQL ──────────────────────────────────────────────────────────────────

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const paraMotor = (r) => String(r).split(path.sep).join('/');

/** Las opciones de `read_xlsx` para una lectura. */
function opcionesDeLectura({ hoja = null, rango = null, encabezado = true, normalizar = false } = {}) {
    const op = [];
    if (hoja) op.push(`sheet = ${lit(hoja)}`);
    const r = normalizarRango(rango);
    if (r) {
        const abierto = /^[A-Z]+\d+:[A-Z]+$/.test(r);
        op.push(`range = ${lit(abierto ? `${r}${ULTIMA_FILA}` : r)}`);
        if (abierto) op.push('stop_at_empty = true');
    }
    op.push(`header = ${encabezado === false ? 'false' : 'true'}`);
    op.push('empty_as_varchar = true');
    if (normalizar) op.push('normalize_names = true');
    return op;
}

/**
 * El SELECT que lee una hoja (o varias, unidas por nombre de columna con
 * `_hoja`). `rellenar`: columnas cuyas celdas vacías toman el valor de arriba.
 */
function sqlDeLectura(ruta, opciones = {}) {
    const { hojas: varias = null, rellenar = [] } = opciones;
    const u = lit(paraMotor(ruta));
    let base;
    if (Array.isArray(varias) && varias.length > 1) {
        base = varias
            .map(h => `SELECT *, ${lit(h)} AS _hoja FROM read_xlsx(${u}, ${opcionesDeLectura({ ...opciones, hoja: h }).join(', ')})`)
            .join(' UNION ALL BY NAME ');
        base = `(${base})`;
    } else {
        const hoja = Array.isArray(varias) && varias.length === 1 ? varias[0] : opciones.hoja;
        base = `read_xlsx(${u}, ${opcionesDeLectura({ ...opciones, hoja }).join(', ')})`;
    }
    const cols = (rellenar || []).filter(c => String(c || '').trim());
    if (!cols.length) return `SELECT * FROM ${base}`;
    // El orden de las filas es el del archivo: se numera al leer, y la ventana
    // arrastra el último valor no vacío de cada columna elegida.
    const reemplazos = cols.map(c => `coalesce(${ident(c)}, last_value(${ident(c)} IGNORE NULLS) OVER __amox_w) AS ${ident(c)}`);
    return `SELECT * EXCLUDE (__amox_fila) REPLACE (${reemplazos.join(', ')})
FROM (SELECT *, row_number() OVER () AS __amox_fila FROM ${base})
WINDOW __amox_w AS (ORDER BY __amox_fila ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
ORDER BY __amox_fila`;
}

/** Traduce un error del motor leyendo un libro a algo que diga qué hacer. */
function explicar(e, ruta) {
    const m = String(e?.message || e).split('\n')[0];
    if (e instanceof ErrorDeExcel) return e;
    try { comprobarLibro(ruta); } catch (x) { return x; }
    let mm;
    if ((mm = /Sheet "(.+?)" not found/.exec(m))) return new ErrorDeExcel('hoja', `The workbook has no sheet named "${mm[1]}".`);
    if (/Could not convert/.test(m)) {
        return new ErrorDeExcel('tipos', `${m.replace(/^Invalid Input Error: read_xlsx: /, '')}. Check that the range starts at the header row and that the header option is right.`);
    }
    if (/Binder Error: Invalid range/.test(m)) return new ErrorDeExcel('rango', 'That range is not valid for this sheet.');
    return new ErrorDeExcel('motor', m.replace(/^[A-Za-z ]+ Error: /, ''));
}

/**
 * Lo que hay en la hoja, sin interpretar: las primeras filas como texto, con la
 * letra de cada columna y el número de cada fila, para que el usuario vea dónde
 * empieza la tabla. `db` es cualquier cosa con systemQuery o query.
 */
async function vistaCruda(db, ruta, { hoja = null, filas = FILAS_DE_VISTA } = {}) {
    comprobarLibro(ruta);
    const clave = `cruda:${hoja || ''}:${filas}`;
    const cache = xlsxMeta.getCached(ruta);
    if (cache && cache[clave]) return cache[clave];
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    const op = [`header = false`, `all_varchar = true`, `range = ${lit(`A1:${ULTIMA_COLUMNA_DE_VISTA}${filas}`)}`];
    if (hoja) op.unshift(`sheet = ${lit(hoja)}`);
    let datos;
    try {
        datos = await q(`SELECT * FROM read_xlsx(${lit(paraMotor(ruta))}, ${op.join(', ')})`);
    } catch (e) {
        throw explicar(e, ruta);
    }
    const letras = datos.length ? Object.keys(datos[0]) : [];
    // Recortar las columnas vacías del final y las filas vacías del final.
    let ancho = 0;
    letras.forEach((l, i) => { if (datos.some(f => f[l] !== null && f[l] !== '')) ancho = i + 1; });
    let alto = 0;
    datos.forEach((f, i) => { if (letras.slice(0, ancho).some(l => f[l] !== null && f[l] !== '')) alto = i + 1; });
    const resultado = {
        columnas: letras.slice(0, ancho),
        filas: datos.slice(0, alto).map(f => letras.slice(0, ancho).map(l => f[l])),
        recortada: datos.length >= filas,
    };
    xlsxMeta.setCached(ruta, { ...(xlsxMeta.getCached(ruta) || {}), [clave]: resultado });
    return resultado;
}

/**
 * Leer de verdad, sin guardar nada: columnas con su tipo y las primeras filas.
 * Para la vista previa de lo elegido.
 */
async function probar(db, ruta, opciones = {}, { limite = 20 } = {}) {
    comprobarLibro(ruta);
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    const sql = sqlDeLectura(ruta, opciones);
    try {
        const columnas = (await q(`DESCRIBE ${sql}`)).map(c => ({ nombre: c.column_name, tipo: c.column_type }));
        const filas = await q(`SELECT * FROM (${sql}) LIMIT ${Number(limite) || 20}`);
        return { columnas, filas };
    } catch (e) {
        throw explicar(e, ruta);
    }
}

/**
 * Las opciones de lectura de un Excel, limpias. Las usan las fuentes, lo que
 * recuerda un proyecto (`lecturas`) y los nodos de Data Flow.
 */
function normalizarOpciones(x) {
    const o = x && typeof x === 'object' ? x : {};
    const r = {};
    const t = (v, max) => String(v ?? '').trim().slice(0, max);
    if (t(o.hoja, 200)) r.hoja = t(o.hoja, 200);
    if (Array.isArray(o.hojas)) {
        const hs = o.hojas.map(h => t(h, 200)).filter(Boolean).slice(0, 200);
        if (hs.length) r.hojas = [...new Set(hs)];
    }
    const rango = normalizarRango(o.rango);
    if (rango) r.rango = rango;
    if (o.encabezado === false) r.encabezado = false;
    if (o.normalizar === true) r.normalizar = true;
    if (Array.isArray(o.rellenar)) {
        const cs = o.rellenar.map(c => t(c, 200)).filter(Boolean).slice(0, 100);
        if (cs.length) r.rellenar = [...new Set(cs)];
    }
    return r;
}

// ── Lo que el proyecto recuerda (2.5) ───────────────────────────────────────
// `project.json → lecturas["datos/ventas.xlsx"]`: cómo se leyó cada archivo la
// última vez. La clave es relativa al proyecto si el archivo está dentro (así
// vale en otra máquina), y absoluta si no.

function claveDeLectura(raiz, ruta) {
    const rel = path.relative(path.resolve(raiz), path.resolve(ruta));
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
    return path.resolve(ruta);
}

function recordado(raiz, ruta) {
    const scaffolder = require('./projectScaffolder');
    const pj = scaffolder.getProjectConfig(raiz) || {};
    const l = pj.lecturas && pj.lecturas[claveDeLectura(raiz, ruta)];
    try { return l ? normalizarOpciones(l) : null; } catch { return null; }
}

function recordar(raiz, ruta, opciones) {
    const scaffolder = require('./projectScaffolder');
    const pj = scaffolder.getProjectConfig(raiz) || {};
    const lecturas = { ...(pj.lecturas || {}), [claveDeLectura(raiz, ruta)]: normalizarOpciones(opciones) };
    scaffolder.saveProjectConfig(raiz, { lecturas });
}

module.exports = {
    ErrorDeExcel, ULTIMA_FILA, recordado, recordar, claveDeLectura,
    firma, comprobarLibro, hojas,
    columnaANumero, numeroAColumna, normalizarRango, normalizarOpciones,
    opcionesDeLectura, sqlDeLectura, explicar, vistaCruda, probar,
};
