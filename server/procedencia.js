/**
 * De dónde salió cada dato (C5, fase 4 del plan de la 5.10).
 *
 * Una tabla cargada desde un archivo guarda su procedencia en su propio
 * comentario (`COMMENT ON TABLE`), como ya hace el cuaderno con sus vistas: el
 * dato y su origen viajan juntos en la base, sin otra tabla que mantener. El
 * comentario tiene dos partes:
 *
 *   AmoxSQL · from ventas_sem38.xlsx (sheet Ventas, A4:E) · read 2026-10-02 07:02 · 6 rows
 *   {"amoxsql":"procedencia","v":1,...}
 *
 * La primera línea es para personas (y para cualquier otra herramienta que
 * enseñe comentarios); la segunda la relee AmoxSQL. Con ella se dice en el
 * explorador de dónde vino una tabla, se le cuenta a la IA, y se avisa si el
 * archivo cambió después de cargarlo (4.4).
 */
const fs = require('fs');
const path = require('path');

const MARCA = '{"amoxsql":"procedencia"';
const MAX_ARCHIVOS = 50;

/** Tamaño y fecha de cada archivo, tal como están ahora. */
function describirArchivos(rutas) {
    return (rutas || []).slice(0, MAX_ARCHIVOS).map(r => {
        const ruta = path.resolve(String(r));
        try {
            const st = fs.statSync(ruta);
            return { ruta, nombre: path.basename(ruta), tamano: st.size, modificada: st.mtime.toISOString() };
        } catch {
            return { ruta, nombre: path.basename(ruta), tamano: null, modificada: null };
        }
    });
}

/** Los archivos de una ruta con comodines (`datos/ventas_*.csv`), o la ruta misma. */
function expandir(ruta) {
    const r = String(ruta || '');
    if (!/[*?]/.test(r)) return [r];
    const dir = path.dirname(r);
    const re = new RegExp(`^${path.basename(r).split('').map(c => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join('')}$`, 'i');
    try {
        return fs.readdirSync(dir).filter(n => re.test(n)).sort().map(n => path.join(dir, n));
    } catch {
        return [];
    }
}

/** La hora de esta máquina, que es la del usuario (el JSON guarda la UTC). */
const fecha = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d)) return '?';
    const dos = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

/** La línea para personas. */
function resumen(p) {
    if (!p) return '';
    const a = p.archivos || [];
    const de = p.fuente
        ? `source ${p.fuente}${a.length === 1 ? ` (${a[0].nombre})` : a.length ? ` (${p.total || a.length} files)` : ''}`
        : a.length === 1 ? a[0].nombre : `${p.total || a.length} files`;
    const como = [];
    if (p.hojas && p.hojas.length > 1) como.push(`sheets ${p.hojas.join(', ')}`);
    else if (p.hoja) como.push(`sheet ${p.hoja}`);
    if (p.rango) como.push(p.rango);
    return [`from ${de}${como.length ? ` (${como.join(', ')})` : ''}`, `read ${fecha(p.leido)}`, p.filas != null ? `${p.filas} rows` : null]
        .filter(Boolean).join(' · ');
}

/** El comentario entero: la línea y el JSON. */
function componer(p) {
    const datos = { amoxsql: 'procedencia', v: 1, ...p };
    return `AmoxSQL · ${resumen(datos)}\n${JSON.stringify(datos)}`;
}

/** La procedencia de un comentario, o null si no la tiene. */
function leer(comentario) {
    const c = String(comentario || '');
    const i = c.indexOf(MARCA);
    if (i < 0) return null;
    try { return JSON.parse(c.slice(i)); } catch { return null; }
}

/** Los archivos que ya no son como cuando se cargaron (o ya no están). */
function cambiados(p) {
    return (p?.archivos || []).filter(a => {
        if (!a.ruta) return false;
        try {
            const st = fs.statSync(a.ruta);
            return st.size !== a.tamano || st.mtime.toISOString() !== a.modificada;
        } catch {
            return true;
        }
    }).map(a => a.nombre);
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Anota la procedencia en una tabla recién cargada. `referencia` es el nombre
 * ya citado (`"ventas"` o `"esquema"."ventas"`). Best-effort: una tabla sin
 * procedencia sigue siendo una tabla.
 */
async function anotar(db, referencia, { origen, archivos = [], fuente = null, hoja = null, hojas = null, rango = null } = {}) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    try {
        let filas = null;
        try { filas = Number((await q(`SELECT count(*) AS n FROM ${referencia}`))?.[0]?.n); } catch { /* sin contar */ }
        const descritos = describirArchivos(archivos);
        const p = {
            origen, leido: new Date().toISOString(), filas,
            ...(fuente ? { fuente } : {}),
            ...(hoja ? { hoja } : {}),
            ...(hojas && hojas.length > 1 ? { hojas } : {}),
            ...(rango ? { rango } : {}),
            archivos: descritos,
            ...(archivos.length > MAX_ARCHIVOS ? { total: archivos.length } : {}),
        };
        await q(`COMMENT ON TABLE ${referencia} IS ${lit(componer(p))}`);
        return p;
    } catch (e) {
        console.warn('[Procedencia] No se pudo anotar:', e?.message || e);
        return null;
    }
}

/**
 * La procedencia de las tablas de una sesión: { 'esquema.tabla': { resumen,
 * cambiados, archivos } }. Lee los comentarios de duckdb_tables().
 */
async function deLasTablas(db) {
    const q = (sql) => (db.systemQuery ? db.systemQuery(sql) : db.query(sql));
    const filas = await q(
        `SELECT schema_name, table_name, comment FROM duckdb_tables()
         WHERE comment LIKE '%"amoxsql":"procedencia"%' AND database_name <> 'fuentes'`
    );
    const r = {};
    for (const f of filas) {
        const p = leer(f.comment);
        if (!p) continue;
        r[`${f.schema_name}.${f.table_name}`] = {
            resumen: resumen(p),
            cambiados: cambiados(p),
            archivos: (p.archivos || []).map(a => a.nombre),
            fuente: p.fuente || null,
            leido: p.leido,
        };
    }
    return r;
}

module.exports = { MARCA, expandir, describirArchivos, resumen, componer, leer, cambiados, anotar, deLasTablas };
