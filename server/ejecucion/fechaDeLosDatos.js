/**
 * La fecha de los datos (5.13, F4; Dec-44).
 *
 * Lo que se entrega dice de cuándo son sus datos: la fecha del archivo MÁS NUEVO
 * que leyó la ejecución (una fuente, un archivo o una carpeta importados). Si el
 * cierre de septiembre se corre el 2 de octubre con el Excel que llegó el 30 de
 * septiembre, sus datos son del 30 de septiembre, no del 2 de octubre.
 *
 * Un dato remoto (un bucket, una URL, un lago) no tiene una fecha fiable: no
 * cuenta. Si no hay ninguna fecha, no se escribe nada en vez de inventarla.
 */
const fs = require('fs');
const path = require('path');

const REMOTA = /^[a-z][a-z0-9+.-]*:\/\//i;

/** La fecha de un archivo local, o null. */
function deArchivo(ruta) {
    if (!ruta || REMOTA.test(String(ruta))) return null;
    try { const st = fs.statSync(ruta); return st.isFile() ? st.mtime : null; } catch { return null; }
}

/** La más nueva de unas rutas locales. */
function deArchivos(rutas) {
    let max = null;
    for (const r of rutas || []) { const d = deArchivo(r); if (d && (!max || d > max)) max = d; }
    return max;
}

/** La fecha de lo que lee una fuente con nombre en este proyecto, o null. */
async function deFuente(raiz, nombre) {
    const fuentes = require('../fuentes');
    let l = null;
    try { l = await fuentes.localizar({ raiz }, nombre); } catch { return null; }
    if (!l?.ubicacion || REMOTA.test(l.ubicacion)) return null;
    if (l.def.tipo === 'archivo') return deArchivo(l.ubicacion);
    if (l.def.tipo === 'carpeta') {
        try {
            const archivos = fuentes.archivosDeCarpeta(l.ubicacion, l.def).filter(a => a.quieto);
            const leidos = l.def.criterio === 'todos' ? archivos : archivos.slice(0, 1);
            return deArchivos(leidos.map(a => a.ruta));
        } catch { return null; }
    }
    return null;
}

/** Lo que va leyendo una ejecución: se queda con la fecha más nueva. */
class Lecturas {
    constructor() { this.masNueva = null; }
    registrar(fecha) {
        const d = fecha instanceof Date ? fecha : fecha ? new Date(fecha) : null;
        if (d && !Number.isNaN(d.getTime()) && (!this.masNueva || d > this.masNueva)) this.masNueva = d;
        return d;
    }
}

/** «21 Oct 2026»: el día, sin hora (los datos son de ese día). */
function texto(fecha) {
    if (!fecha) return '';
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** La fecha local como número de serie de Excel (días desde 1899-12-30). */
function serieDeExcel(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

/**
 * La fecha de los datos de una CONSULTA (el pie de Report Flow): la más nueva
 * entre las tablas que nombra (su procedencia guarda la fecha de cada archivo
 * que se cargó) y las fuentes que lee (`fuentes."x"`). null si nada lo dice.
 */
async function deConsulta(db, sql, raiz) {
    const q = (s) => (db.systemQuery ? db.systemQuery(s) : db.query(s));
    const texto = String(sql || '');
    const lecturas = new Lecturas();
    const de = [];
    const { leer } = require('../procedencia');
    let tablas = [];
    try {
        tablas = await q(`SELECT schema_name, table_name, comment FROM duckdb_tables()
            WHERE comment LIKE '%"amoxsql":"procedencia"%' AND database_name <> 'fuentes'`);
    } catch { /* sin tablas */ }
    const escapar = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const t of tablas) {
        const nombre = escapar(t.table_name);
        const nombrada = new RegExp(`(^|[^\\w"])("${nombre}"|${nombre})(?![\\w"])`, 'i').test(texto);
        if (!nombrada) continue;
        const p = leer(t.comment);
        const d = lecturas.registrar((p?.archivos || []).map(a => a.modificada).filter(Boolean).sort().pop() || null);
        if (d) de.push({ tabla: `${t.schema_name}.${t.table_name}`, fecha: d.toISOString() });
    }
    const { fuentesQueLee } = require('../contrato');
    for (const n of fuentesQueLee([{ type: 'sql_inline', config: { query: texto } }])) {
        const d = lecturas.registrar(await deFuente(raiz, n));
        if (d) de.push({ fuente: n, fecha: d.toISOString() });
    }
    return { datosAl: lecturas.masNueva ? lecturas.masNueva.toISOString() : null, de };
}

module.exports = { deArchivo, deArchivos, deFuente, Lecturas, texto, serieDeExcel, deConsulta };
