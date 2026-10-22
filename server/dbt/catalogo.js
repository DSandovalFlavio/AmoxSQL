/**
 * Lo que el editor sabe de un proyecto dbt para completar (5.12, fase 3b; I12, Dec-35).
 *
 * Todo sale de lo que ya está en disco o en memoria —nunca se lanza dbt—:
 *   - el `manifest.json`: modelos, semillas, snapshots, fuentes, macros (con su firma y
 *     sus argumentos documentados) y las columnas documentadas;
 *   - los archivos de las carpetas de modelos: un modelo nuevo se completa antes de
 *     que dbt lo vea;
 *   - `dbt_project.yml` (las `vars`) y `profiles.yml` (los *targets*);
 *   - el motor de AmoxSQL: las columnas REALES de un modelo ya construido, si su base
 *     es la adjunta (o la que adjuntó la vista previa).
 * Comprobado en la fase 0.8: el manifiesto trae 617 macros, 423 internas de dbt y 77
 * del adaptador; al editor van sólo las del proyecto y sus paquetes.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const resultados = require('./resultados');
const modelo = require('./modelo');
const dbtProyecto = require('./proyecto');
const dbtConvivir = require('../dbtConvivir');
const { crearInstancia } = require('../motor');

const unix = (p) => String(p || '').replace(/\\/g, '/');
const igual = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
// Paquetes que no se ofrecen: los de dbt y del adaptador (sus macros son la maquinaria).
const INTERNOS = new Set(['dbt', 'dbt_duckdb', 'dbt_postgres']);

/** La firma de una macro desde su código: «star(from, relation_alias=False, …)». */
function firmaDe(macroSql, nombre) {
    const m = /\{%-?\s*macro\s+([\w.]+)\s*\(([\s\S]*?)\)\s*-?%\}/.exec(String(macroSql || ''));
    if (!m) return `${nombre}()`;
    return `${nombre}(${m[2].replace(/\s+/g, ' ').trim()})`;
}

function columnasDocumentadas(n) {
    return Object.values(n?.columns || {}).map(c => ({ name: c.name, description: c.description || '', type: c.data_type || null }));
}

/** Los nombres de archivo de una carpeta (recursivo), sin la extensión. */
function archivos(dir, extensiones, profundidad = 6, out = []) {
    if (profundidad < 0 || !fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory() && !e.name.startsWith('.')) archivos(f, extensiones, profundidad - 1, out);
        else if (e.isFile() && extensiones.test(e.name)) out.push(f);
    }
    return out;
}

function varsDe(raiz, nombreProyecto) {
    try {
        const p = yaml.load(fs.readFileSync(path.join(raiz, 'dbt_project.yml'), 'utf8')) || {};
        const v = p.vars || {};
        const planas = Object.entries(v).filter(([, x]) => x === null || typeof x !== 'object').map(([k, x]) => ({ name: k, value: x }));
        // vars por proyecto: { vars: { mi_proyecto: { a: 1 } } }
        const delProyecto = v[nombreProyecto] && typeof v[nombreProyecto] === 'object' ? Object.entries(v[nombreProyecto]).map(([k, x]) => ({ name: k, value: x })) : [];
        return [...planas, ...delProyecto];
    } catch { return []; }
}

const columnasPorArchivo = new Map();   // ruta → { mtime, filas }
async function columnasDeArchivo(base, catalogo) {
    let mtime;
    try { mtime = fs.statSync(base).mtimeMs; } catch { return []; }
    const c = columnasPorArchivo.get(base);
    if (c && c.mtime === mtime) return c.filas;
    let inst = null, con = null;
    try {
        inst = await crearInstancia(':memory:');
        con = await inst.connect();
        await con.run(`ATTACH '${unix(base).replace(/'/g, "''")}' AS "${String(catalogo).replace(/"/g, '""')}" (READ_ONLY)`);
        const filas = await (await con.run(`SELECT database_name AS db, schema_name AS sch, table_name AS tab, column_name AS col, data_type AS tipo FROM duckdb_columns() WHERE database_name = '${String(catalogo).replace(/'/g, "''")}' AND NOT internal ORDER BY column_index`)).getRowObjectsJson();
        columnasPorArchivo.set(base, { mtime, filas });
        return filas;
    } catch { return []; } finally {
        try { con?.closeSync(); inst?.closeSync(); } catch { /* ya cerrada */ }
    }
}

async function catalogo(raiz, { dbManager = null } = {}) {
    const c = modelo.carpetas(raiz);
    if (!c) return { disponible: false };
    const m = resultados.manifiesto(raiz) || {};
    const nodos = Object.values(m.nodes || {});
    const deTipo = (t) => nodos.filter(n => n.resource_type === t);
    const comun = (n) => ({
        name: n.name, schema: n.schema || null, database: n.database || null, alias: n.alias || n.name,
        description: n.description || '', path: unix(n.original_file_path), relation: n.relation_name || null,
        materialized: n.config?.materialized || null, columns: columnasDocumentadas(n),
    });
    const modelos = deTipo('model').map(comun);
    const seeds = deTipo('seed').map(comun);
    const snapshots = deTipo('snapshot').map(comun);

    // Los modelos nuevos que dbt aún no vio (por su archivo).
    const conocidos = new Set([...modelos, ...seeds, ...snapshots].map(x => x.name));
    for (const d of c.modelos) {
        for (const f of archivos(path.join(raiz, d), /\.(sql|py)$/i)) {
            const nombre = path.basename(f).replace(/\.(sql|py)$/i, '');
            if (!conocidos.has(nombre)) { conocidos.add(nombre); modelos.push({ name: nombre, path: unix(path.relative(raiz, f)), nuevo: true, columns: [], description: '' }); }
        }
    }
    for (const d of c.seeds) {
        for (const f of archivos(path.join(raiz, d), /\.csv$/i)) {
            const nombre = path.basename(f).replace(/\.csv$/i, '');
            if (!conocidos.has(nombre)) { conocidos.add(nombre); seeds.push({ name: nombre, path: unix(path.relative(raiz, f)), nuevo: true, columns: [], description: '' }); }
        }
    }

    const porFuente = new Map();
    for (const s of Object.values(m.sources || {})) {
        if (!porFuente.has(s.source_name)) porFuente.set(s.source_name, { name: s.source_name, description: s.source_description || '', path: unix(s.original_file_path), tables: [] });
        porFuente.get(s.source_name).tables.push({ name: s.name, description: s.description || '', columns: columnasDocumentadas(s), relation: s.relation_name || null });
    }

    const macros = Object.values(m.macros || {})
        .filter(x => !INTERNOS.has(x.package_name) && !String(x.name).startsWith('materialization_') && !String(x.name).startsWith('test_'))
        .map(x => ({
            name: x.name, package: x.package_name, propio: x.package_name === c.nombre,
            firma: firmaDe(x.macro_sql, x.name), description: x.description || '',
            arguments: (x.arguments || []).map(a => ({ name: a.name, type: a.type || null, description: a.description || '' })),
        }));

    let targets = [];
    try { targets = dbtProyecto.targets(raiz).targets.map(t => t.nombre); } catch { /* sin perfil */ }

    // Las columnas reales de lo ya construido, desde el motor de AmoxSQL.
    if (dbManager) {
        try {
            const t = dbtProyecto.targets(raiz);
            const base = dbtConvivir.basesDelPerfil(raiz, { target: t.activo })[0] || null;
            const adjunta = !!(base && dbManager.attachedPath && igual(dbManager.attachedPath, base));
            let filas = await dbManager.systemQuery(`SELECT database_name AS db, schema_name AS sch, table_name AS tab, column_name AS col, data_type AS tipo FROM duckdb_columns() WHERE NOT internal ORDER BY column_index`, { lane: 'meta' });
            // La base del target no está adjunta (sesión en memoria, otra base): se
            // leen sus columnas abriéndola un momento en sólo lectura, recordadas por
            // la fecha del archivo. Si dbt la tiene abierta, se queda sin ellas.
            const catalogoDeLaBase = modelos.find(x => x.database)?.database;
            const yaVisible = (filas || []).some(f => f.db === catalogoDeLaBase);
            if (!adjunta && !yaVisible && base && fs.existsSync(base) && catalogoDeLaBase) {
                filas = [...(filas || []), ...(await columnasDeArchivo(base, catalogoDeLaBase))];
            }
            const reales = new Map();
            for (const f of filas || []) {
                const k = `${f.db}\u0000${f.sch}\u0000${f.tab}`.toLowerCase();
                if (!reales.has(k)) reales.set(k, []);
                reales.get(k).push({ name: f.col, type: f.tipo });
            }
            for (const x of [...modelos, ...seeds, ...snapshots]) {
                if (!x.schema) continue;
                const db = adjunta ? (dbManager.alias || 'user_db') : x.database;
                const r = reales.get(`${db}\u0000${x.schema}\u0000${x.alias}`.toLowerCase());
                if (!r) continue;
                const doc = new Map(x.columns.map(col => [col.name.toLowerCase(), col]));
                x.columns = r.map(col => ({ name: col.name, type: col.type, description: doc.get(col.name.toLowerCase())?.description || '' }));
                x.construido = true;
            }
        } catch { /* sin motor: las documentadas */ }
    }

    return { disponible: true, proyecto: c.nombre, modelos, seeds, snapshots, fuentes: [...porFuente.values()], macros, vars: varsDe(raiz, c.nombre), targets };
}

module.exports = { catalogo, firmaDe };
