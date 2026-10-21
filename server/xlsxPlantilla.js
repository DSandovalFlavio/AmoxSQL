/**
 * xlsxPlantilla.js — rellenar la plantilla de un cliente (5.11, D3; Dec-20).
 *
 * El libro del cliente ya tiene sus fórmulas, sus gráficos y su formato; lo que
 * le falta son los datos de esta semana. AmoxSQL copia la plantilla y sólo toca
 * las celdas de datos que se le indican:
 *
 *   - una TABLA de Excel (`{ tabla: 'Ventas' }`): sus columnas se llenan por
 *     nombre (o por posición), la tabla crece o encoge, sus columnas calculadas
 *     se rellenan con su fórmula y la fila de totales baja con ella;
 *   - una HOJA y una CELDA de inicio (`{ hoja: 'Reporte', celda: 'B5' }`): los
 *     datos de la semana anterior se limpian, y una columna de al lado con una
 *     fórmula en cada fila se arrastra hasta la última fila nueva.
 *
 * Lo que apuntaba a los datos viejos apunta a los nuevos: rangos de gráficos,
 * nombres definidos, formato condicional, validaciones, el origen de una tabla
 * dinámica (que además se refresca al abrir). El libro pide recalcular al
 * abrirse. Todo lo demás —otras hojas, estilos, imágenes, macros de un .xlsm—
 * se copia byte a byte. Si los datos nuevos fueran a pisar algo que no es
 * suyo (un pie de página debajo), se para y lo dice.
 */
const fs = require('fs');
const path = require('path');
const zip = require('./zip');
const { decodeXmlEntities } = require('./xlsxMeta');
const { prepararConsulta, celda, letra, esc, MAX_FILAS } = require('./xlsxEscribir');

class ErrorDePlantilla extends Error {}

// ── Referencias A1 ──────────────────────────────────────────────────────────

function numeroDeColumna(letras) {
    let n = 0;
    for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
}

function celdaA1(ref) {
    const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(ref).trim());
    if (!m) return null;
    return { col: numeroDeColumna(m[1]), fila: +m[2] };
}

function rangoA1(ref) {
    const [a, b] = String(ref).split(':');
    const x = celdaA1(a), y = b ? celdaA1(b) : x;
    if (!x || !y) return null;
    return { c0: Math.min(x.col, y.col), c1: Math.max(x.col, y.col), f0: Math.min(x.fila, y.fila), f1: Math.max(x.fila, y.fila) };
}

const textoDeRango = (r) => `${letra(r.c0)}${r.f0}:${letra(r.c1)}${r.f1}`;

/**
 * Alarga los rangos que cubrían exactamente los datos viejos de una región
 * para que cubran los nuevos. `regla`: { hoja, c0, c1, f0 (primera fila de
 * datos), finVieja, finNueva }. Un rango cuenta si sus columnas caen dentro de
 * las de la región, empieza en la primera fila de datos (o en el encabezado,
 * justo encima) y acaba en la última fila vieja. `conHoja`: sólo los que
 * nombran la hoja (gráficos, nombres definidos); si no, los que no la nombran
 * (dentro de la misma hoja: sqref, fórmulas).
 */
function extenderRangos(texto, regla, { conHoja }) {
    if (regla.finVieja === regla.finNueva) return texto;
    const hoja = String(regla.hoja);
    const re = /((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Z]{1,3}\$?\d+):(\$?[A-Z]{1,3}\$?\d+)/g;
    return texto.replace(re, (todo, prefijo, a, b, pos, entero) => {
        // Dentro de una cadena entre comillas dobles (texto de una fórmula), no.
        const antes = entero.slice(0, pos);
        if ((antes.match(/"/g) || []).length % 2 === 1) return todo;
        if (conHoja) {
            if (!prefijo) return todo;
            const nombre = prefijo.slice(0, -1).replace(/^'|'$/g, '').replace(/''/g, "'");
            if (nombre !== hoja) return todo;
        } else if (prefijo) {
            return todo;
        }
        const x = celdaA1(a), y = celdaA1(b);
        if (!x || !y) return todo;
        const c0 = Math.min(x.col, y.col), c1 = Math.max(x.col, y.col);
        if (c0 < regla.c0 || c1 > regla.c1) return todo;
        if (y.fila !== regla.finVieja) return todo;
        if (x.fila !== regla.f0 && x.fila !== regla.f0 - 1) return todo;
        const fin = Math.max(x.fila, regla.finNueva);
        const absoluta = /\$\d/.test(b);
        const nuevoB = b.replace(/\d+$/, String(fin));
        return `${prefijo || ''}${a}:${absoluta ? nuevoB : nuevoB}`;
    });
}

/**
 * Mueve las referencias relativas de fila de una fórmula `delta` filas (lo que
 * hace Excel al arrastrar). Las absolutas (`$5`), los textos entre comillas y
 * los nombres de hoja o tabla se dejan como están.
 */
function moverFormula(formula, delta) {
    if (!delta) return formula;
    let dentro = false, out = '', i = 0;
    while (i < formula.length) {
        const ch = formula[i];
        if (ch === '"') { dentro = !dentro; out += ch; i++; continue; }
        if (dentro) { out += ch; i++; continue; }
        const m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/.exec(formula.slice(i));
        const previo = out[out.length - 1] || '';
        if (m && !/[A-Za-z0-9_.[]/.test(previo)) {
            const fila = m[3] ? m[4] : String(Math.max(1, +m[4] + delta));
            out += `${m[1]}${m[2]}${m[3]}${fila}`;
            i += m[0].length;
            continue;
        }
        out += ch; i++;
    }
    return out;
}

// ── El libro: hojas, relaciones, tablas ─────────────────────────────────────

function atributo(xml, nombre) {
    const m = new RegExp(`\\b${nombre}="([^"]*)"`).exec(xml);
    return m ? decodeXmlEntities(m[1]) : null;
}

/** El destino de una relación, como nombre de entrada del ZIP. */
function resolverDestino(origen, target) {
    if (target.startsWith('/')) return target.slice(1);
    const dir = path.posix.dirname(origen.replace(/_rels\/[^/]+\.rels$/, '').replace(/\/$/, '') + '/x');
    return path.posix.normalize(path.posix.join(dir, target));
}

function relacionesDe(libro, entrada) {
    const ruta = `${path.posix.dirname(entrada)}/_rels/${path.posix.basename(entrada)}.rels`;
    const xml = libro.texto(ruta);
    if (!xml) return [];
    const rels = [];
    for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
        const target = atributo(m[0], 'Target');
        rels.push({ id: atributo(m[0], 'Id'), tipo: atributo(m[0], 'Type') || '', destino: atributo(m[0], 'TargetMode') === 'External' ? null : resolverDestino(ruta, target) });
    }
    return rels;
}

function hojasDelLibro(libro) {
    const wb = libro.texto('xl/workbook.xml');
    if (!wb) throw new ErrorDePlantilla('The template is not an Excel workbook (xl/workbook.xml is missing).');
    const rels = new Map(relacionesDe(libro, 'xl/workbook.xml').map(r => [r.id, r]));
    const hojas = [];
    for (const m of wb.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
        const id = atributo(m[0], 'r:id') || atributo(m[0], 'id');
        hojas.push({ nombre: atributo(m[0], 'name'), entrada: rels.get(id)?.destino });
    }
    return hojas;
}

function tablasDelLibro(libro, hojas) {
    const tablas = [];
    for (const h of hojas) {
        if (!h.entrada) continue;
        for (const r of relacionesDe(libro, h.entrada)) {
            if (!/\/table$/.test(r.tipo) || !r.destino) continue;
            const xml = libro.texto(r.destino);
            if (!xml) continue;
            const cab = /<table\b[^>]*>/.exec(xml)[0];
            const columnas = [...xml.matchAll(/<tableColumn\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tableColumn>)/g)].map(m => ({
                nombre: atributo(m[1], 'name'),
                formula: m[2] ? (/<calculatedColumnFormula[^>]*>([\s\S]*?)<\/calculatedColumnFormula>/.exec(m[2])?.[1] ?? null) : null,
            }));
            tablas.push({
                nombre: atributo(cab, 'displayName') || atributo(cab, 'name'),
                entrada: r.destino, hoja: h, xml,
                rango: rangoA1(atributo(cab, 'ref')),
                encabezado: atributo(cab, 'headerRowCount') === '0' ? 0 : 1,
                totales: +(atributo(cab, 'totalsRowCount') || 0),
                columnas: columnas.map(c => ({ ...c, formula: c.formula == null ? null : decodeXmlEntities(c.formula) })),
            });
        }
    }
    return tablas;
}

// ── Una hoja, en memoria ────────────────────────────────────────────────────

/**
 * Parte el XML de una hoja en cabeza, filas y cola. Cada fila: sus atributos y
 * sus celdas por columna, con el XML original de cada una (lo que no se toca
 * se vuelve a escribir tal cual).
 */
function leerHoja(xml) {
    const ini = xml.search(/<sheetData\b/);
    if (ini < 0) throw new ErrorDePlantilla('A sheet of the template has no data section.');
    const abre = xml.indexOf('>', ini);
    const vacia = xml[abre - 1] === '/';
    const finDatos = vacia ? abre + 1 : xml.indexOf('</sheetData>', abre);
    const cuerpo = vacia ? '' : xml.slice(abre + 1, finDatos);
    const filas = new Map();
    let r = 0;
    for (const m of cuerpo.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const rAttr = atributo(m[1], 'r');
        r = rAttr ? +rAttr : r + 1;
        const fila = { attrs: m[1].replace(/\s*\br="[^"]*"/, '').replace(/\s*\bspans="[^"]*"/, ''), celdas: new Map() };
        let c = -1;
        for (const k of (m[2] || '').matchAll(/<c\b(?=[\s/>])([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const ref = atributo(k[1], 'r');
            c = ref ? celdaA1(ref).col : c + 1;
            const dentro = k[2] || '';
            fila.celdas.set(c, {
                xml: ref ? k[0] : k[0].replace(/^<c\b/, `<c r="${letra(c)}${r}"`),
                s: atributo(k[1], 's'),
                formula: /<f\b/.test(dentro) ? (/<f\b[^>]*>([\s\S]*?)<\/f>/.exec(dentro)?.[1] ?? '') : null,
                compartida: /<f\b[^>]*t="shared"/.test(dentro),
                valor: /<v>[^<]|<is>|<f\b/.test(dentro),
            });
        }
        filas.set(r, fila);
    }
    return {
        cabeza: vacia ? xml.slice(0, ini) + '<sheetData>' : xml.slice(0, abre + 1),
        cola: vacia ? '</sheetData>' + xml.slice(abre + 1) : xml.slice(finDatos),
        filas,
    };
}

function escribirHoja(h) {
    const orden = [...h.filas.keys()].sort((a, b) => a - b);
    let maxCol = 0, maxFila = 1;
    let out = '';
    for (const r of orden) {
        const f = h.filas.get(r);
        const cols = [...f.celdas.keys()].sort((a, b) => a - b);
        if (cols.length) { maxCol = Math.max(maxCol, cols[cols.length - 1]); maxFila = Math.max(maxFila, r); }
        if (!cols.length && !f.attrs.trim()) continue;
        out += `<row r="${r}"${f.attrs ? ' ' + f.attrs.trim() : ''}>` + cols.map(c => f.celdas.get(c).xml).join('') + '</row>';
    }
    const cabeza = h.cabeza.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:${letra(maxCol)}${maxFila}"/>`);
    return cabeza + out + h.cola;
}

const fila = (h, r) => {
    if (!h.filas.has(r)) h.filas.set(r, { attrs: '', celdas: new Map() });
    return h.filas.get(r);
};

/** ¿Hay algo en estas columnas y filas? (para no pisar lo que no es nuestro) */
function primeraOcupada(h, c0, c1, desde, hasta) {
    for (let r = desde; r <= hasta; r++) {
        const f = h.filas.get(r);
        if (!f) continue;
        for (let c = c0; c <= c1; c++) if (f.celdas.get(c)?.valor) return { fila: r, col: c };
    }
    return null;
}

/** Reescribe una celda en otra fila (la fila de totales que baja). */
function moverCelda(cel, c, filaNueva, delta) {
    let xml = cel.xml.replace(/\br="[A-Z]+\d+"/, `r="${letra(c)}${filaNueva}"`);
    if (cel.formula && !cel.compartida) {
        xml = xml.replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/, (_, a, f, b) => a + moverFormula(f, delta) + b);
    }
    return { ...cel, xml };
}

// ── Estilos: una fecha sin formato de fecha se vería como número ────────────

class EstilosDePlantilla {
    constructor(xml) { this.xml = xml; this.cambiado = false; this.cache = new Map(); }
    _xfs() {
        const m = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(this.xml);
        return m ? [...m[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(x => x[0]) : [];
    }
    /** El estilo `s` (o el normal) con un formato de fecha si no lo tiene. */
    conFormato(s, numFmtId) {
        const clave = `${s}|${numFmtId}`;
        if (this.cache.has(clave)) return this.cache.get(clave);
        const xfs = this._xfs();
        const base = xfs[+(s || 0)] || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
        const actual = +(atributo(base, 'numFmtId') || 0);
        // Ya tiene formato propio (fecha, número, lo que puso el cliente): se respeta.
        if (actual !== 0) { this.cache.set(clave, s); return s; }
        let nuevo = base.replace(/\bnumFmtId="\d+"/, `numFmtId="${numFmtId}"`);
        if (!/numFmtId=/.test(nuevo)) nuevo = nuevo.replace(/^<xf\b/, `<xf numFmtId="${numFmtId}"`);
        nuevo = /applyNumberFormat=/.test(nuevo) ? nuevo.replace(/applyNumberFormat="\d"/, 'applyNumberFormat="1"') : nuevo.replace(/^<xf\b/, '<xf applyNumberFormat="1"');
        const indice = xfs.length;
        this.xml = this.xml.replace(/(<cellXfs\b[^>]*>)([\s\S]*?)(<\/cellXfs>)/, (_, a, b, c) => a.replace(/count="\d+"/, `count="${indice + 1}"`) + b + nuevo + c);
        this.cambiado = true;
        this.cache.set(clave, String(indice));
        return String(indice);
    }
}

const FORMATO_INTEGRADO = { fecha: 14, fechaHora: 22, hora: 21 };

// ── Rellenar ────────────────────────────────────────────────────────────────

/** Lee todas las filas de una consulta preparada (para una plantilla, cabe en memoria). */
async function todasLasFilas(db, p) {
    const lista = p.columnas.map((c, i) => {
        const id = `"${String(c.nombre).replace(/"/g, '""')}"`;
        const t = String(c.tipo).toUpperCase();
        if (t === 'TIMESTAMP WITH TIME ZONE' || t === 'TIMESTAMPTZ') return `CAST(${id} AS TIMESTAMP) AS c${i}`;
        if (c.clase === 'texto' && t !== 'VARCHAR') return `CAST(${id} AS VARCHAR) AS c${i}`;
        return `${id} AS c${i}`;
    }).join(', ');
    return db.query(`SELECT ${lista} FROM "${p.tabla}" ORDER BY rowid`);
}

const normal = (s) => String(s || '').trim().toLowerCase();

/** Qué columna de la consulta va en cada columna de datos de la tabla. */
function emparejar(columnasTabla, columnasConsulta, nombreTabla) {
    const datos = columnasTabla.map((c, i) => ({ ...c, i })).filter(c => c.formula == null);
    const porNombre = new Map(columnasConsulta.map((c, i) => [normal(c.nombre), i]));
    if (datos.every(c => porNombre.has(normal(c.nombre)))) return datos.map(c => ({ tabla: c.i, consulta: porNombre.get(normal(c.nombre)) }));
    if (datos.length === columnasConsulta.length) return datos.map((c, k) => ({ tabla: c.i, consulta: k }));
    const faltan = datos.filter(c => !porNombre.has(normal(c.nombre))).map(c => c.nombre);
    throw new ErrorDePlantilla(`The table "${nombreTabla}" expects the columns ${datos.map(c => c.nombre).join(', ')}; the data has ${columnasConsulta.map(c => c.nombre).join(', ')}. Missing: ${faltan.join(', ')}. Rename them in the query, or give the same number of columns in the same order.`);
}

/**
 * Rellena `plantilla` y deja el resultado en `destino`.
 *
 * @param db        { query(sql) }
 * @param destinos  [{ consulta, tabla } | { consulta, hoja, celda, encabezado? }]
 * @returns { ruta, regiones: [{ hoja, tabla?, rango, filas }], avisos }
 */
async function rellenarPlantilla(db, plantilla, destino, destinos) {
    if (!fs.existsSync(plantilla)) throw new ErrorDePlantilla(`The template does not exist: ${plantilla}`);
    if (!destinos?.length) throw new ErrorDePlantilla('Say where the data goes in the template (a table, or a sheet and a cell).');
    let lector;
    try { lector = zip.abrir(plantilla); } catch (e) {
        throw new ErrorDePlantilla(`The template could not be opened as a workbook: ${e.message}. Save it as .xlsx in Excel.`);
    }
    const textos = new Map();     // entrada → texto modificado
    const libro = {
        texto: (n) => textos.has(n) ? textos.get(n) : (lector.tiene(n) ? lector.leer(n).toString('utf8') : null),
    };
    const preparadas = [];
    const avisos = [];
    const regiones = [];
    try {
        const hojas = hojasDelLibro(libro);
        const tablas = tablasDelLibro(libro, hojas);
        const hojasLeidas = new Map();     // entrada → hoja en memoria
        const leida = (h) => {
            if (!hojasLeidas.has(h.entrada)) hojasLeidas.set(h.entrada, leerHoja(libro.texto(h.entrada)));
            return hojasLeidas.get(h.entrada);
        };
        const stylesEntrada = 'xl/styles.xml';
        const estilos = new EstilosDePlantilla(libro.texto(stylesEntrada) || '');
        const reglas = [];          // para alargar rangos en gráficos, nombres, sqref…

        for (const d of destinos) {
            const p = await prepararConsulta(db, d.consulta);
            preparadas.push(p);
            if (p.filas + 1 > MAX_FILAS) throw new ErrorDePlantilla(`Too many rows for Excel: ${p.filas}.`);
            const filas = await todasLasFilas(db, p);
            const n = filas.length;

            if (d.tabla) {
                const t = tablas.find(x => normal(x.nombre) === normal(d.tabla));
                if (!t) throw new ErrorDePlantilla(`The template has no table "${d.tabla}"${tablas.length ? `; it has ${tablas.map(x => x.nombre).join(', ')}` : ''}.`);
                const h = leida(t.hoja);
                const { c0, c1 } = t.rango;
                const f0 = t.rango.f0 + t.encabezado;
                const finVieja = t.rango.f1 - t.totales;
                const finNueva = f0 + Math.max(1, n) - 1;      // una tabla de Excel tiene al menos una fila
                const parejas = emparejar(t.columnas, p.columnas, t.nombre);
                // Estilo de cada columna: el de la primera fila de datos de la plantilla.
                // Se copian ANTES de limpiar: la fila de muestra se borra enseguida.
                const muestra = new Map([...(h.filas.get(f0)?.celdas || new Map())].map(([c, x]) => [c, { s: x.s }]));
                const estiloDe = (c) => muestra.get(c)?.s ?? null;
                // La fila de totales, aparte, para bajarla (o subirla).
                const totales = [];
                for (let k = 0; k < t.totales; k++) {
                    const r = finVieja + 1 + k;
                    const f = h.filas.get(r);
                    const celdas = new Map();
                    if (f) for (let c = c0; c <= c1; c++) if (f.celdas.has(c)) { celdas.set(c, f.celdas.get(c)); f.celdas.delete(c); }
                    totales.push(celdas);
                }
                // Lo que hay debajo de la tabla y quedaría dentro: no se pisa.
                const nuevoFinal = finNueva + t.totales;
                if (nuevoFinal > t.rango.f1) {
                    const choca = primeraOcupada(h, c0, c1, t.rango.f1 + 1, nuevoFinal);
                    if (choca) throw new ErrorDePlantilla(`The table "${t.nombre}" would grow over ${letra(choca.col)}${choca.fila}, which has content. Leave room below the table in the template.`);
                }
                // Limpiar las filas viejas de datos en las columnas de la tabla.
                for (let r = f0; r <= Math.max(finVieja, finNueva); r++) {
                    const f = h.filas.get(r);
                    if (f) for (let c = c0; c <= c1; c++) f.celdas.delete(c);
                }
                // Los datos, y las columnas calculadas con su fórmula.
                for (let k = 0; k < Math.max(1, n); k++) {
                    const r = f0 + k;
                    const fr = fila(h, r);
                    for (const par of parejas) {
                        const c = c0 + par.tabla;
                        const col = p.columnas[par.consulta];
                        let s = estiloDe(c);
                        if (FORMATO_INTEGRADO[col.clase]) s = estilos.conFormato(s, FORMATO_INTEGRADO[col.clase]);
                        const x = k < n ? celda(`${letra(c)}${r}`, filas[k][`c${par.consulta}`], col, s) : '';
                        if (x) fr.celdas.set(c, { xml: x, s, valor: true });
                    }
                    t.columnas.forEach((tc, i) => {
                        if (tc.formula == null) return;
                        const c = c0 + i;
                        const s = estiloDe(c);
                        fr.celdas.set(c, { xml: `<c r="${letra(c)}${r}"${s ? ` s="${s}"` : ''}><f>${esc(tc.formula)}</f></c>`, s, formula: tc.formula, valor: true });
                    });
                }
                // La fila de totales, debajo de los datos nuevos.
                totales.forEach((celdas, k) => {
                    const r = finNueva + 1 + k;
                    const delta = r - (finVieja + 1 + k);
                    const fr = fila(h, r);
                    for (const [c, cel] of celdas) {
                        const movida = moverCelda(cel, c, r, delta);
                        if (movida.formula && !cel.compartida) {
                            movida.xml = movida.xml.replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/, (_, a, f, b) => a + extenderRangos(f, { hoja: t.hoja.nombre, c0, c1, f0, finVieja, finNueva }, { conHoja: false }) + b);
                        }
                        fr.celdas.set(c, movida);
                    }
                });
                // La tabla: su rango y su filtro (el filtro no incluye los totales).
                const ref = textoDeRango({ c0, c1, f0: t.rango.f0, f1: nuevoFinal });
                const filtro = textoDeRango({ c0, c1, f0: t.rango.f0, f1: finNueva });
                textos.set(t.entrada, t.xml
                    .replace(/(<table\b[^>]*\bref=")[^"]*(")/, `$1${ref}$2`)
                    .replace(/(<autoFilter\b[^>]*\bref=")[^"]*(")/, `$1${filtro}$2`));
                reglas.push({ hoja: t.hoja.nombre, entrada: t.hoja.entrada, c0, c1, f0, finVieja, finNueva });
                regiones.push({ hoja: t.hoja.nombre, tabla: t.nombre, rango: textoDeRango({ c0, c1, f0, f1: finNueva }), filas: n });
                if (!n) avisos.push(`The table "${t.nombre}" got no rows: it keeps one empty row, as Excel needs.`);
            } else {
                const h0 = hojas.find(x => normal(x.nombre) === normal(d.hoja));
                if (!h0) throw new ErrorDePlantilla(`The template has no sheet "${d.hoja}"; it has ${hojas.map(x => x.nombre).join(', ')}.`);
                const inicio = celdaA1(d.celda || 'A1');
                if (!inicio) throw new ErrorDePlantilla(`"${d.celda}" is not a cell (for example: B5).`);
                const h = leida(h0);
                const c0 = inicio.col, c1 = inicio.col + p.columnas.length - 1;
                let f0 = inicio.fila;
                if (d.encabezado) {
                    const fr = fila(h, f0);
                    p.columnas.forEach((col, i) => {
                        const c = c0 + i;
                        const s = fr.celdas.get(c)?.s ?? null;
                        fr.celdas.set(c, { xml: `<c r="${letra(c)}${f0}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(col.nombre)}</t></is></c>`, s, valor: true });
                    });
                    f0++;
                }
                // Los datos viejos: el bloque seguido desde la primera fila de datos.
                let finVieja = f0 - 1;
                while (primeraOcupada(h, c0, c1, finVieja + 1, finVieja + 1)) finVieja++;
                const finNueva = f0 + n - 1;
                if (finNueva > finVieja) {
                    const choca = primeraOcupada(h, c0, c1, finVieja + 1, finNueva);
                    if (choca) throw new ErrorDePlantilla(`The data would overwrite ${letra(choca.col)}${choca.fila} on "${h0.nombre}", which has content. Leave room below ${d.celda} in the template.`);
                }
                // Se copian ANTES de limpiar: la fila de muestra se borra enseguida.
                const muestra = new Map([...(h.filas.get(f0)?.celdas || new Map())].map(([c, x]) => [c, { s: x.s }]));
                const estiloDe = (c) => muestra.get(c)?.s ?? null;
                // Columnas de al lado con una fórmula en todas las filas viejas: se arrastran.
                const arrastrar = [];
                if (finVieja >= f0) {
                    const cols = new Set();
                    for (let r = f0; r <= finVieja; r++) for (const c of (h.filas.get(r)?.celdas.keys() || [])) if (c < c0 || c > c1) cols.add(c);
                    for (const c of cols) {
                        let todas = true;
                        for (let r = f0; r <= finVieja && todas; r++) { const cel = h.filas.get(r)?.celdas.get(c); todas = !!cel?.formula && !cel.compartida; }
                        if (todas) arrastrar.push({ c, formula: h.filas.get(f0).celdas.get(c).formula, s: h.filas.get(f0).celdas.get(c).s });
                    }
                }
                for (let r = f0; r <= Math.max(finVieja, finNueva); r++) {
                    const f = h.filas.get(r);
                    if (!f) continue;
                    for (let c = c0; c <= c1; c++) f.celdas.delete(c);
                    for (const a of arrastrar) f.celdas.delete(a.c);
                }
                for (let k = 0; k < n; k++) {
                    const r = f0 + k;
                    const fr = fila(h, r);
                    p.columnas.forEach((col, i) => {
                        const c = c0 + i;
                        let s = estiloDe(c);
                        if (FORMATO_INTEGRADO[col.clase]) s = estilos.conFormato(s, FORMATO_INTEGRADO[col.clase]);
                        const x = celda(`${letra(c)}${r}`, filas[k][`c${i}`], col, s);
                        if (x) fr.celdas.set(c, { xml: x, s, valor: true });
                    });
                    for (const a of arrastrar) {
                        const f = moverFormula(a.formula, k);
                        fr.celdas.set(a.c, { xml: `<c r="${letra(a.c)}${r}"${a.s ? ` s="${a.s}"` : ''}><f>${f}</f></c>`, s: a.s, formula: f, valor: true });
                    }
                }
                const ultimaCol = Math.max(c1, ...arrastrar.map(a => a.c));
                reglas.push({ hoja: h0.nombre, entrada: h0.entrada, c0: Math.min(c0, ...arrastrar.map(a => a.c)), c1: ultimaCol, f0, finVieja: Math.max(finVieja, f0), finNueva: Math.max(finNueva, f0) });
                regiones.push({ hoja: h0.nombre, rango: n ? textoDeRango({ c0, c1, f0, f1: finNueva }) : null, filas: n });
                if (arrastrar.length) avisos.push(`Formulas in ${arrastrar.map(a => letra(a.c)).join(', ')} were filled down to row ${finNueva}.`);
            }
        }

        // ── Lo que apuntaba a los datos viejos ──────────────────────────────
        for (const [entrada, h] of hojasLeidas) {
            for (const regla of reglas.filter(x => x.entrada === entrada)) {
                // Formato condicional, validaciones y fórmulas de la misma hoja.
                h.cola = h.cola.replace(/(\bsqref=")([^"]*)(")/g, (_, a, b, c) => a + extenderRangos(b, regla, { conHoja: false }) + c);
                for (const [, f] of h.filas) {
                    for (const [c, cel] of f.celdas) {
                        if (!cel.formula || cel.compartida) continue;
                        const nueva = extenderRangos(cel.formula, regla, { conHoja: false });
                        if (nueva !== cel.formula) f.celdas.set(c, { ...cel, formula: nueva, xml: cel.xml.replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/, (_, a, x, b) => a + nueva + b) });
                    }
                }
            }
            textos.set(entrada, escribirHoja(h));
        }
        // Fórmulas en OTRAS hojas, gráficos, nombres definidos y tablas dinámicas.
        for (const e of lector.entradas) {
            const n = e.nombre;
            const esHoja = /^xl\/worksheets\/[^/]+\.xml$/.test(n) && !hojasLeidas.has(n);
            const esGrafico = /^xl\/charts\/chart[^/]*\.xml$/.test(n);
            const esPivote = /^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/.test(n);
            if (!esHoja && !esGrafico && !esPivote && n !== 'xl/workbook.xml') continue;
            let x = libro.texto(n);
            const antes = x;
            for (const regla of reglas) {
                if (esGrafico || n === 'xl/workbook.xml' || esHoja) {
                    x = x.replace(/(<(?:\w+:)?f\b[^>]*>)([^<]*)(<\/(?:\w+:)?f>)/g, (_, a, b, c) => a + extenderRangos(b, regla, { conHoja: true }) + c);
                }
                if (n === 'xl/workbook.xml') {
                    x = x.replace(/(<definedName\b[^>]*>)([^<]*)(<\/definedName>)/g, (_, a, b, c) => a + extenderRangos(b, regla, { conHoja: true }) + c);
                }
                if (esPivote) {
                    x = x.replace(/(<worksheetSource\b[^>]*\bref=")([^"]*)("[^>]*\bsheet=")([^"]*)(")/g, (todo, a, ref, b, hoja, c) =>
                        hoja === regla.hoja ? a + extenderRangos(`'${hoja}'!${ref}`, regla, { conHoja: true }).replace(/^'[^']*'!/, '') + b + hoja + c : todo);
                }
            }
            if (esGrafico && x !== antes) x = x.replace(/<(\w+:)?(numCache|strCache)\b[\s\S]*?<\/\1?\2>/g, '');    // Excel los rehace
            if (esPivote) x = /refreshOnLoad=/.test(x) ? x.replace(/refreshOnLoad="\w+"/, 'refreshOnLoad="1"') : x.replace(/<pivotCacheDefinition\b/, '<pivotCacheDefinition refreshOnLoad="1"');
            if (x !== antes) textos.set(n, x);
        }

        // ── El libro recalcula al abrir; la cadena de cálculo vieja sobra ──
        let wb = libro.texto('xl/workbook.xml');
        if (/<calcPr\b/.test(wb)) {
            wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (_, a, b) => `<calcPr${a.replace(/\s*\bfullCalcOnLoad="\w+"/, '')} fullCalcOnLoad="1"${b}>`);
        } else {
            wb = wb.replace(/(<(?:oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>)/, '<calcPr fullCalcOnLoad="1"/>$1');
        }
        textos.set('xl/workbook.xml', wb);
        const sinCadena = new Set();
        if (lector.tiene('xl/calcChain.xml')) {
            sinCadena.add('xl/calcChain.xml');
            textos.set('xl/_rels/workbook.xml.rels', libro.texto('xl/_rels/workbook.xml.rels').replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''));
            textos.set('[Content_Types].xml', libro.texto('[Content_Types].xml').replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
        }
        if (estilos.cambiado) textos.set(stylesEntrada, estilos.xml);
        // Una plantilla de Excel (.xltx/.xltm) guardada como libro.
        if (/\.xls[xm]$/i.test(destino)) {
            const ct = libro.texto('[Content_Types].xml');
            if (/template\.main\+xml/.test(ct)) {
                textos.set('[Content_Types].xml', ct.replace(/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.template\.main\+xml/, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')
                    .replace(/application\/vnd\.ms-excel\.template\.macroEnabled\.main\+xml/, 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'));
            }
        }

        // ── Escribir: lo tocado, nuevo; lo demás, byte a byte ───────────────
        const dir = path.dirname(destino);
        fs.mkdirSync(dir, { recursive: true });
        const temporal = path.join(dir, `.${path.basename(destino)}.amoxtmp`);
        const escritor = new zip.EscritorZip(temporal);
        try {
            for (const e of lector.entradas) {
                if (sinCadena.has(e.nombre)) continue;
                if (textos.has(e.nombre)) escritor.agregar(e.nombre, textos.get(e.nombre));
                else escritor.copiar(lector, e);
            }
            escritor.cerrar();
        } catch (e) {
            escritor.abandonar();
            try { fs.rmSync(temporal, { force: true }); } catch { /* ya no está */ }
            throw e;
        }
        lector.cerrar();
        lector = null;
        const { renombrarConReintentos } = require('./publicar');
        const reintentos = await renombrarConReintentos(temporal, destino);
        return { ruta: destino, bytes: fs.statSync(destino).size, regiones, avisos, reintentos };
    } finally {
        if (lector) lector.cerrar();
        for (const p of preparadas) await p.soltar();
    }
}

/** Lo que hay en una plantilla, para elegir en la interfaz: hojas y tablas con sus columnas. */
function describirPlantilla(ruta) {
    const lector = zip.abrir(ruta);
    try {
        const libro = { texto: (n) => (lector.tiene(n) ? lector.leer(n).toString('utf8') : null) };
        const hojas = hojasDelLibro(libro);
        const tablas = tablasDelLibro(libro, hojas).map(t => ({
            nombre: t.nombre, hoja: t.hoja.nombre, rango: textoDeRango(t.rango),
            columnas: t.columnas.map(c => ({ nombre: c.nombre, calculada: c.formula != null })),
        }));
        return { hojas: hojas.map(h => h.nombre), tablas };
    } finally {
        lector.cerrar();
    }
}

module.exports = { rellenarPlantilla, describirPlantilla, ErrorDePlantilla, extenderRangos, moverFormula, celdaA1, rangoA1 };
