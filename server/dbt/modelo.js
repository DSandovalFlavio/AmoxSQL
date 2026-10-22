/**
 * dbt dentro del editor (5.12, fase 3; I2, Dec-28).
 *
 * Con un modelo abierto: su SQL compilado, una vista previa al instante, y «ir a la
 * definición» desde `ref('…')` o `source('…', '…')`.
 *
 * Dec-28 — la vista previa NO lanza dbt cada vez: compila el modelo sólo si el
 * archivo cambió desde la última compilación (o si no está en el manifiesto) y corre
 * el compilado en el motor de AmoxSQL, con su límite de filas de siempre. Comprobado
 * en la fase 0: compilar tarda ~5 s y `dbt show` otros ~5 s; el compilado corre tal
 * cual. dbt nombra las tablas por el archivo de la base («"tienda"."main"."x"»):
 *   - si esa base es la que AmoxSQL tiene adjunta, se cambia el catálogo por `user_db`;
 *   - si no, se adjunta en sólo lectura con su nombre (y dbt la suelta y la recupera
 *     como a la principal: dbtConvivir).
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const resultados = require('./resultados');
const dbtProyecto = require('./proyecto');
const dbtConvivir = require('../dbtConvivir');
const { correr } = require('./correr');

const unix = (p) => String(p || '').replace(/\\/g, '/');
const igual = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Las carpetas de modelos, macros, tests, snapshots, seeds y análisis del proyecto. */
function carpetas(raiz) {
    let p = {};
    try { p = yaml.load(fs.readFileSync(path.join(raiz, 'dbt_project.yml'), 'utf8')) || {}; } catch { return null; }
    const lista = (clave, porDefecto) => (Array.isArray(p[clave]) ? p[clave] : porDefecto).map(unix);
    return {
        modelos: lista('model-paths', ['models']), macros: lista('macro-paths', ['macros']),
        tests: lista('test-paths', ['tests']), snapshots: lista('snapshot-paths', ['snapshots']),
        seeds: lista('seed-paths', ['seeds']), analisis: lista('analysis-paths', ['analyses']),
        nombre: p.name || null,
    };
}

/** ¿Qué es este archivo para dbt? null si no es del proyecto dbt. */
function queEs(raiz, archivo) {
    const c = carpetas(raiz);
    if (!c) return null;
    const rel = unix(path.isAbsolute(archivo) ? path.relative(raiz, archivo) : archivo);
    if (rel.startsWith('..')) return null;
    const dentro = (lista) => lista.some(d => rel === d || rel.startsWith(`${d.replace(/\/$/, '')}/`));
    if (dentro(c.modelos)) return { tipo: /\.ya?ml$/i.test(rel) ? 'yaml' : 'modelo', rel };
    if (dentro(c.macros)) return { tipo: /\.ya?ml$/i.test(rel) ? 'yaml' : 'macro', rel };
    if (dentro(c.snapshots)) return { tipo: /\.ya?ml$/i.test(rel) ? 'yaml' : 'snapshot', rel };
    if (dentro(c.tests)) return { tipo: 'test', rel };
    if (dentro(c.analisis)) return { tipo: 'analisis', rel };
    return null;
}

/** El nodo del manifiesto de un archivo de modelo (por su ruta). */
function nodoDe(raiz, rel) {
    const m = resultados.manifiesto(raiz);
    if (!m?.nodes) return null;
    return Object.values(m.nodes).find(n => n.resource_type === 'model' && unix(n.original_file_path) === unix(rel)) || null;
}

/** ¿El manifiesto es más nuevo que el archivo, y tiene su compilado? */
function fresco(raiz, rel, nodo) {
    if (!nodo?.compiled_code) return false;
    try {
        const archivo = fs.statSync(path.join(raiz, rel)).mtimeMs;
        const manifiesto = fs.statSync(path.join(resultados.carpetaTarget(raiz), 'manifest.json')).mtimeMs;
        return manifiesto >= archivo;
    } catch { return false; }
}

/** Lo que el editor enseña de un archivo de dbt. */
function info(raiz, archivo) {
    const q = queEs(raiz, archivo);
    if (!q) return { esDbt: false };
    if (q.tipo !== 'modelo') return { esDbt: true, tipo: q.tipo, rel: q.rel };
    const nodo = nodoDe(raiz, q.rel);
    const nombre = nodo?.name || path.basename(q.rel).replace(/\.(sql|py)$/i, '');
    return {
        esDbt: true, tipo: 'modelo', rel: q.rel, nombre,
        enManifiesto: !!nodo, fresco: fresco(raiz, q.rel, nodo),
        materializado: nodo?.config?.materialized || null,
        relacion: nodo?.relation_name || null,
        descripcion: nodo?.description || null,
        compilado: nodo?.compiled_code || null,
    };
}

/**
 * Compila un modelo con dbt (si hace falta) y devuelve su nodo actualizado.
 * Lanza un Error con las últimas líneas de dbt si no compila.
 */
async function compilar(raiz, archivo, { dbManager = null, forzar = false, env = {} } = {}) {
    const i = info(raiz, archivo);
    if (!i.esDbt || i.tipo !== 'modelo') throw new Error('This file is not a dbt model.');
    if (i.fresco && !forzar) return { ...i, compilo: false };
    const lineas = [];
    const r = await correr({ raiz, args: dbtProyecto.conTarget(raiz, ['compile', '--select', i.nombre]), dbManager, env, alLinea: (l) => lineas.push(l.texto) });
    if (r.codigo !== 0) {
        const motivo = lineas.filter(l => /error|Error|ERROR/.test(l)).slice(-4).join('\n') || r.error || lineas.slice(-4).join('\n');
        throw new Error(`dbt could not compile ${i.nombre}:\n${motivo}`);
    }
    const nuevo = info(raiz, archivo);
    if (!nuevo.compilado) throw new Error(`dbt compiled the project but ${i.nombre} has no compiled SQL (is it disabled?).`);
    return { ...nuevo, compilo: true, ms: r.ms };
}

/** Cambia `"<catalogo>".` por `"<por>".` sólo como nombre de catálogo (entre comillas). */
function cambiarCatalogo(sql, catalogo, por) {
    const q = `"${String(catalogo).replace(/"/g, '""')}".`;
    return String(sql).split(q).join(`"${por}".`);
}

/**
 * El SQL que corre AmoxSQL para la vista previa (Dec-28). Adjunta la base del
 * target en sólo lectura si no es la que AmoxSQL ya tiene.
 */
async function sqlDeVistaPrevia(raiz, archivo, { dbManager, env = {} } = {}) {
    const c = await compilar(raiz, archivo, { dbManager, env });
    const nodo = nodoDe(raiz, c.rel);
    const catalogo = nodo?.database || null;
    const t = dbtProyecto.targets(raiz);
    const p = await paraAmox(raiz, c.compilado, catalogo, { dbManager, queFalta: `Build what ${c.nombre} reads first: «+Upstream».` });
    const sql = p.sql;
    const como = p.como;
    // ¿Está construido lo que lee? Si no, decirlo con qué hacer, en vez del
    // «Table … does not exist» del motor.
    if (dbManager && nodo?.depends_on?.nodes?.length) {
        const m = resultados.manifiesto(raiz);
        const catalogoAqui = como === 'base adjunta' ? (dbManager.alias || 'user_db') : catalogo;
        const faltan = [];
        for (const id of nodo.depends_on.nodes) {
            const d = m?.nodes?.[id];
            if (!d || !['model', 'seed', 'snapshot'].includes(d.resource_type) || d.config?.materialized === 'ephemeral') continue;
            const esquema = String(d.schema || 'main').replace(/'/g, "''");
            const nombre = String(d.alias || d.name).replace(/'/g, "''");
            const hay = await dbManager.systemQuery(
                `SELECT 1 FROM duckdb_tables() WHERE database_name = '${String(catalogoAqui).replace(/'/g, "''")}' AND schema_name = '${esquema}' AND table_name = '${nombre}'
                 UNION ALL SELECT 1 FROM duckdb_views() WHERE database_name = '${String(catalogoAqui).replace(/'/g, "''")}' AND schema_name = '${esquema}' AND view_name = '${nombre}'`,
                { lane: 'meta' },
            ).catch(() => [{}]);
            if (!hay?.length) faltan.push(d.name);
        }
        if (faltan.length) {
            throw new Error(`${c.nombre} reads ${faltan.join(', ')}, which ${faltan.length === 1 ? 'is' : 'are'} not built in «${t.activo}» yet. Build ${faltan.length === 1 ? 'it' : 'them'} first: «+Upstream».`);
        }
    }
    return { sql: sql.trim().replace(/;\s*$/, ''), compilado: c.compilado, nombre: c.nombre, compilo: c.compilo, como, target: t.activo };
}

/**
 * Un SQL de dbt (con el catálogo de la base del target) listo para el motor de
 * AmoxSQL: si esa base es la adjunta, el catálogo pasa a `user_db`; si no, se adjunta
 * en sólo lectura con su nombre (dbtConvivir la suelta cuando dbt la necesita). Lo
 * usan la vista previa (fase 3) y las filas de un test que falla (fase 4).
 */
async function paraAmox(raiz, sql, catalogo, { dbManager, queFalta = 'Run dbt first.' } = {}) {
    const t = dbtProyecto.targets(raiz);
    const base = dbtConvivir.basesDelPerfil(raiz, { target: t.activo })[0] || null;
    if (catalogo && base && dbManager?.attachedPath && igual(dbManager.attachedPath, base)) {
        return { sql: cambiarCatalogo(sql, catalogo, dbManager.alias || 'user_db'), como: 'base adjunta' };
    }
    if (catalogo && base && fs.existsSync(base) && dbManager) {
        const ya = await dbManager.systemQuery(`SELECT 1 FROM duckdb_databases() WHERE database_name = '${String(catalogo).replace(/'/g, "''")}'`, { lane: 'meta' }).catch(() => []);
        if (!ya?.length) await dbManager.query(`ATTACH '${unix(base).replace(/'/g, "''")}' AS "${String(catalogo).replace(/"/g, '""')}" (READ_ONLY)`);
        return { sql, como: 'adjuntada en sólo lectura' };
    }
    if (catalogo && base && !fs.existsSync(base)) {
        throw new Error(`The database of the target «${t.activo}» does not exist yet (${path.basename(base)}). ${queFalta}`);
    }
    return { sql, como: 'tal cual' };
}

/** «Ir a la definición»: el archivo de un ref('x') o de un source('a', 'b'). */
function definicion(raiz, { ref = null, source = null } = {}) {
    const m = resultados.manifiesto(raiz);
    if (ref) {
        const nombre = String(ref).split('.').pop();
        const n = Object.values(m?.nodes || {}).find(x => ['model', 'seed', 'snapshot'].includes(x.resource_type) && x.name === nombre);
        if (n?.original_file_path) return { archivo: unix(n.original_file_path) };
        // Un modelo nuevo que aún no está en el manifiesto: se busca por su nombre de archivo.
        const c = carpetas(raiz);
        for (const d of [...(c?.modelos || []), ...(c?.seeds || []), ...(c?.snapshots || [])]) {
            const encontrado = buscarArchivo(path.join(raiz, d), new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(sql|py|csv)$`, 'i'));
            if (encontrado) return { archivo: unix(path.relative(raiz, encontrado)) };
        }
        return null;
    }
    if (source) {
        const [fuente, tabla] = String(source).split('.');
        const s = Object.values(m?.sources || {}).find(x => x.source_name === fuente && (!tabla || x.name === tabla));
        return s?.original_file_path ? { archivo: unix(s.original_file_path) } : null;
    }
    return null;
}

function buscarArchivo(dir, re, profundidad = 6) {
    if (profundidad < 0 || !fs.existsSync(dir)) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isFile() && re.test(e.name)) return f;
        if (e.isDirectory() && !e.name.startsWith('.')) { const x = buscarArchivo(f, re, profundidad - 1); if (x) return x; }
    }
    return null;
}

module.exports = { carpetas, queEs, info, compilar, sqlDeVistaPrevia, cambiarCatalogo, definicion, paraAmox };
