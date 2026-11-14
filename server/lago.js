/**
 * DuckLake de primera clase (5.12, fase 8; I8, Dec-33).
 *
 * Comprobado en la fase 0.5 con el motor 1.5.6, con catálogo DuckDB y SQLite:
 * `<lago>.snapshots()` (id, fecha, cambios), `AT (VERSION => n)`, `AT (TIMESTAMP => …)`,
 * `ducklake_table_changes`, `ducklake_merge_adjacent_files`, y
 * `ducklake_expire_snapshots` / `ducklake_cleanup_old_files` con `dry_run => true`, que
 * LISTAN lo que se iría. Expirar y limpiar borran datos de verdad (no hay papelera): el
 * diálogo enseña antes cuántas versiones y archivos se van y desde qué fecha deja de
 * poderse consultar «como estaba» (Dec-33). Compactar no borra versiones.
 *
 * Los nombres siguen la convención que AmoxSQL ya usaba al abrir un lago:
 * `<nombre>.ducklake` (catálogo en un archivo DuckDB) o `<nombre>.ducklake.sqlite`
 * (catálogo SQLite: dbt puede escribir mientras AmoxSQL lo tiene abierto, 5.10 p07),
 * con los datos en `<catálogo>.files/`.
 */
const fs = require('fs');
const path = require('path');
const { crearInstancia } = require('./motor');

class ErrorDeLago extends Error {}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const unix = (p) => String(p || '').replace(/\\/g, '/');

/** ¿Esta ruta es un lago? 'duckdb' | 'sqlite' | null */
function tipoDeLago(ruta) {
    const r = String(ruta || '').toLowerCase();
    if (r.endsWith('.ducklake.sqlite')) return 'sqlite';
    if (r.endsWith('.ducklake')) return 'duckdb';
    return null;
}

// ── El formato del catálogo (6.0) ─────────────────────────────────────────────
//
// Comprobado en la fase 0 de la 6.0: un lago de la 5.x (DuckDB 1.x) se abre y se lee
// con DuckDB 2 sin cambiarlo, pero la PRIMERA escritura de 2 pasa su catálogo al
// formato 2 y desde entonces no lo abren ni la 5.x ni un dbt con DuckDB 1.x. No hay
// opción de ATTACH que lo evite, así que se avisa al abrirlo.
//
// El formato está en la cabecera del archivo: dos cabeceras de base (bytes 4096 y
// 8192), la válida es la de mayor iteración, y su octavo campo (uint64) es la versión
// de serialización: 1–7 en las bases de DuckDB 1.x, 69 en las de DuckDB 2.0.
const FORMATO_DE_DUCKDB_2 = 69;

/** La versión de serialización de un archivo de DuckDB, o null si no lo es. */
function formatoDelArchivo(ruta) {
    let fd = null;
    try {
        fd = fs.openSync(ruta, 'r');
        const firma = Buffer.alloc(4);
        fs.readSync(fd, firma, 0, 4, 8);
        if (firma.toString('latin1') !== 'DUCK') return null;
        let mejor = null;
        for (const desde of [4096, 8192]) {
            const b = Buffer.alloc(64);
            if (fs.readSync(fd, b, 0, 64, desde) < 64) continue;
            const iteracion = b.readBigUInt64LE(8);
            const version = Number(b.readBigUInt64LE(56));
            if (!mejor || iteracion > mejor.iteracion) mejor = { iteracion, version };
        }
        return mejor ? mejor.version : null;
    } catch { return null; }
    finally { if (fd !== null) try { fs.closeSync(fd); } catch { /* ya cerrado */ } }
}

/** Si el catálogo de este lago es de la 5.x, lo que hay que decir al abrirlo; si no, null. */
function avisoDeFormato(ruta) {
    if (tipoDeLago(ruta) !== 'duckdb') return null;          // SQLite: no depende del motor
    const v = formatoDelArchivo(ruta);
    if (v === null || v >= FORMATO_DE_DUCKDB_2) return null;
    return `${path.basename(ruta)} was made with AmoxSQL 5 (DuckDB 1). Reading it changes nothing; the first change you make updates it for AmoxSQL 6, and then AmoxSQL 5 and dbt with DuckDB 1 can no longer open it.`;
}

/** Crea un lago vacío en la carpeta del proyecto. */
async function crear(raiz, { nombre, catalogo = 'duckdb' } = {}) {
    const n = String(nombre || '').trim().replace(/[^\w.-]+/g, '_').replace(/\.ducklake(\.sqlite)?$/i, '');
    if (!n) throw new ErrorDeLago('The lake needs a name.');
    const archivo = path.join(raiz, `${n}.ducklake${catalogo === 'sqlite' ? '.sqlite' : ''}`);
    if (fs.existsSync(archivo)) throw new ErrorDeLago(`${path.basename(archivo)} already exists.`);
    const datos = `${archivo}.files`;
    let inst = null, con = null;
    try {
        inst = await crearInstancia(':memory:');
        con = await inst.connect();
        await con.run('INSTALL ducklake; LOAD ducklake');
        if (catalogo === 'sqlite') await con.run('INSTALL sqlite; LOAD sqlite');
        await con.run(`ATTACH ${lit(`ducklake:${catalogo === 'sqlite' ? 'sqlite:' : ''}${unix(archivo)}`)} AS nuevo_lago (DATA_PATH ${lit(`${unix(datos)}/`)})`);
        await con.run('DETACH nuevo_lago');
    } catch (e) {
        const m = String(e.message || e);
        throw new ErrorDeLago(/download|HTTP|extension/i.test(m) ? 'The lake extension has to be downloaded once: check the internet connection and try again.' : m.split('\n')[0]);
    } finally {
        try { con?.closeSync(); inst?.closeSync(); } catch { /* ya cerrada */ }
    }
    return { archivo: path.basename(archivo), ruta: archivo, datos: path.basename(datos), catalogo };
}

function lagoAbierto(dbManager) {
    if (!dbManager?.isDuckLake) throw new ErrorDeLago('The open database is not a lake. Open a .ducklake first.');
    return dbManager.alias || 'user_db';
}

/** Un mapa de cambios de DuckLake a texto: «tables inserted into: main.ventas». */
function cambiosATexto(c) {
    if (!c) return '';
    const pares = Array.isArray(c) ? c.map(x => [x.key, x.value]) : Object.entries(c);
    return pares.map(([k, v]) => `${String(k).replace(/_/g, ' ')}: ${(Array.isArray(v) ? v : [v]).join(', ')}`).join(' · ');
}

/** Las versiones del lago abierto, de la más nueva a la más vieja. */
async function versiones(dbManager, { limite = 200 } = {}) {
    const L = lagoAbierto(dbManager);
    const filas = await dbManager.systemQuery(
        `SELECT snapshot_id, snapshot_time::VARCHAR AS fecha, changes, author, commit_message FROM ${ident(L)}.snapshots() ORDER BY snapshot_id DESC LIMIT ${Number(limite) || 200}`,
        { lane: 'meta' },
    );
    // DuckLake anota las escrituras con el id de la tabla («tables_inserted_into: 1»):
    // se traduce a «esquema.tabla» con su catálogo de metadatos.
    const nombres = new Map();
    try {
        const M = ident(`__ducklake_metadata_${L}`);
        const t = await dbManager.systemQuery(`SELECT t.table_id, s.schema_name || '.' || t.table_name AS nombre FROM ${M}.ducklake_table t JOIN ${M}.ducklake_schema s USING (schema_id) ORDER BY t.begin_snapshot`, { lane: 'meta' });
        for (const x of t) nombres.set(String(x.table_id), x.nombre);
    } catch { /* sin catálogo legible: los ids */ }
    const nombre = (x) => nombres.get(String(x)) || String(x);
    const pares = (c) => (Array.isArray(c) ? c : Object.entries(c || {}).map(([key, value]) => ({ key, value })));
    return filas.map(f => {
        const cambios = pares(f.changes).map(x => ({ key: x.key, value: (Array.isArray(x.value) ? x.value : [x.value]).map(v => (/^tables?_(inserted_into|deleted_from|altered)|inlined/.test(x.key) ? nombre(v) : String(v))) }));
        return {
            version: Number(f.snapshot_id), fecha: f.fecha, cambios: cambiosATexto(cambios),
            tablas: [...new Set(cambios.filter(x => /tables?_(inserted_into|deleted_from|created|altered)|inlined/.test(x.key)).flatMap(x => x.value))],
            autor: f.author || null, mensaje: f.commit_message || null,
        };
    });
}

/** El SQL de una tabla «como estaba» en una versión o en una fecha. */
function comoEstaba(dbManager, { schema = 'main', tabla, version = null, fecha = null }) {
    const L = lagoAbierto(dbManager);
    if (!tabla) throw new ErrorDeLago('Which table?');
    const en = version != null && version !== '' ? `VERSION => ${Number(version)}` : fecha ? `TIMESTAMP => ${lit(fecha)}::TIMESTAMPTZ` : null;
    if (!en || (version != null && version !== '' && !Number.isFinite(Number(version)))) throw new ErrorDeLago('Choose a version or a date.');
    return `-- ${tabla} as it was ${version != null && version !== '' ? `in version ${Number(version)}` : `on ${fecha}`}\nSELECT * FROM ${ident(L)}.${ident(schema)}.${ident(tabla)} AT (${en})`;
}

/** El SQL de qué cambió en una tabla entre dos versiones. */
function queCambio(dbManager, { schema = 'main', tabla, desde, hasta }) {
    const L = lagoAbierto(dbManager);
    if (!tabla || !Number.isFinite(Number(desde)) || !Number.isFinite(Number(hasta))) throw new ErrorDeLago('Which table and which versions?');
    return `-- What changed in ${tabla} between versions ${Number(desde)} and ${Number(hasta)}\nSELECT * FROM ducklake_table_changes(${lit(L)}, ${lit(schema)}, ${lit(tabla)}, ${Number(desde)}, ${Number(hasta)}) ORDER BY snapshot_id, rowid`;
}

const tamano = (rutas) => rutas.reduce((s, r) => { try { return s + fs.statSync(r).size; } catch { return s; } }, 0);

/**
 * Lo que haría el mantenimiento, sin hacerlo (dry_run): versiones que expiran,
 * archivos que se borran (y cuánto ocupan) y la fecha más vieja que se podrá consultar.
 */
async function previsualizar(dbManager, { dias = 30 } = {}) {
    const L = lagoAbierto(dbManager);
    const d = Math.max(0, Number(dias) || 0);
    const q = (sql) => dbManager.systemQuery(sql, { lane: 'meta' });
    const expiran = await q(`CALL ducklake_expire_snapshots(${lit(L)}, dry_run => true, older_than => now() - INTERVAL ${d} DAY)`);
    const viejos = await q(`CALL ducklake_cleanup_old_files(${lit(L)}, dry_run => true, cleanup_all => true)`);
    const todas = await versiones(dbManager);
    const quedan = todas.filter(v => !expiran.some(e => Number(e.snapshot_id) === v.version));
    const rutas = viejos.map(f => f.path);
    return {
        dias: d,
        versiones: { total: todas.length, expiran: expiran.length, quedan: quedan.length },
        // Tras expirar, los archivos de esas versiones también quedan para limpiar;
        // lo que se limpia ahora es lo que YA no usa ninguna versión.
        archivos: { cuantos: rutas.length, bytes: tamano(rutas) },
        consultableDesde: quedan.length ? quedan[quedan.length - 1].fecha : null,
    };
}

/** Compactar, expirar y limpiar. Lo que borra, sólo si se pide (Dec-33). */
async function mantener(dbManager, { compactar = true, expirarDias = null, limpiar = false } = {}) {
    const L = lagoAbierto(dbManager);
    if (dbManager._readOnly) throw new ErrorDeLago('The lake is open read-only: open it for writing to maintain it.');
    const q = (sql) => dbManager.query(sql);
    const r = { compactados: 0, expiradas: 0, borrados: 0, bytes: 0 };
    if (compactar) {
        const c = await q(`CALL ducklake_merge_adjacent_files(${lit(L)})`);
        r.compactados = (c || []).reduce((s, x) => s + Number(x.files_processed || 0), 0);
    }
    if (expirarDias != null) {
        const e = await q(`CALL ducklake_expire_snapshots(${lit(L)}, older_than => now() - INTERVAL ${Math.max(0, Number(expirarDias) || 0)} DAY)`);
        r.expiradas = (e || []).length;
    }
    if (limpiar) {
        const antes = await q(`CALL ducklake_cleanup_old_files(${lit(L)}, dry_run => true, cleanup_all => true)`);
        r.bytes = tamano((antes || []).map(f => f.path));
        const b = await q(`CALL ducklake_cleanup_old_files(${lit(L)}, cleanup_all => true)`);
        r.borrados = (b || []).length;
    }
    return r;
}

module.exports = { ErrorDeLago, tipoDeLago, formatoDelArchivo, avisoDeFormato, FORMATO_DE_DUCKDB_2, crear, versiones, comoEstaba, queCambio, previsualizar, mantener, cambiosATexto };
