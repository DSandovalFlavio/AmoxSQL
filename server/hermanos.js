/**
 * Mirar otro proyecto (5.14, J1; Dec-51).
 *
 * Cruzar con los datos de un proyecto hermano —del mismo workspace— sin cerrar
 * el tuyo: su base se adjunta **en sólo lectura** con el nombre del proyecto, y
 * se consulta `"cierre_norte".main.ventas`. Dura lo que la sesión y nunca se
 * escribe en ella.
 *
 * Sólo se adjunta la base de un proyecto que está en la lista (nunca una ruta
 * cualquiera que llegue de fuera). Si dbt de ese proyecto la necesita, se suelta
 * como cualquier otra base adjunta (`dbtConvivir`, 5.12).
 */
const fs = require('fs');
const path = require('path');
const workspaces = require('./workspaces');
const { baseDelProyecto } = require('./ejecucion/ContextoDeEjecucion');

/** Los alias adjuntados aquí, para dejarlos fuera del árbol de la base propia. */
const adjuntados = new Set();

const comillas = (s) => `"${String(s).replace(/"/g, '""')}"`;
const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;
const mismaRuta = (a, b) => !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** El nombre con el que se consulta: el del proyecto, en minúsculas y sin signos. */
function aliasDe(nombre) {
    const a = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!a) return 'otro_proyecto';
    return /^[0-9]/.test(a) ? `p_${a}` : a;
}

function workspaceDe(raiz) {
    try { return JSON.parse(fs.readFileSync(path.join(raiz, '.amoxsql', 'project.json'), 'utf8'))?.workspace || null; } catch { return null; }
}

/** Las bases adjuntas ahora mismo: nombre y archivo. */
async function bases(dbManager) {
    const filas = await dbManager.query('SELECT database_name AS nombre, path AS ruta FROM duckdb_databases()');
    return filas.map(f => ({ nombre: f.nombre, ruta: f.ruta || null }));
}

/**
 * Los proyectos hermanos del abierto: los de su workspace, menos él, con la base
 * que se adjuntaría (o por qué no hay una) y si ya está adjunta.
 */
async function listar(dbManager, { raiz }) {
    const ws = workspaceDe(raiz);
    if (!ws?.id) return { workspace: null, proyectos: [] };
    const adjuntas = await bases(dbManager).catch(() => []);
    const proyectos = [];
    for (const p of await workspaces.proyectosDe(ws.id)) {
        if (!p.existe || mismaRuta(p.ruta, raiz)) continue;
        const nombre = p.nombre || path.basename(p.ruta);
        let base = null;
        let motivo = null;
        try { base = baseDelProyecto(p.ruta); } catch (e) { motivo = /has none/.test(e.message) ? 'It has no database' : 'It has more than one database and none is the default'; }
        const yaAdjunta = base ? adjuntas.find(b => mismaRuta(b.ruta, base)) : null;
        proyectos.push({
            id: p.id, nombre, ruta: p.ruta, estado: p.estado || null,
            base: base ? path.basename(base) : null, motivo,
            alias: yaAdjunta ? yaAdjunta.nombre : aliasDe(nombre),
            adjunto: !!yaAdjunta && adjuntados.has(yaAdjunta.nombre),
            esLaAbierta: !!base && mismaRuta(base, dbManager.attachedPath),
        });
    }
    // Lo que se soltó por otro lado (cambiar de base suelta todas) deja de contar.
    for (const a of [...adjuntados]) if (!adjuntas.some(b => b.nombre === a)) adjuntados.delete(a);
    return { workspace: { id: ws.id, nombre: ws.nombre || null }, proyectos };
}

/** Adjunta la base de un hermano en sólo lectura. Devuelve `{ alias, tablas }`. */
async function mirar(dbManager, { raiz, ruta }) {
    const { proyectos } = await listar(dbManager, { raiz });
    const p = proyectos.find(x => mismaRuta(x.ruta, ruta));
    if (!p) throw new Error('That project is not in this workspace.');
    if (!p.base) throw new Error(`${p.nombre}: ${p.motivo || 'it has no database'}.`);
    if (p.esLaAbierta) throw new Error(`${p.nombre} uses the same database you have open.`);
    if (p.adjunto) return { alias: p.alias, tablas: await tablas(dbManager, p.alias) };

    const archivo = baseDelProyecto(p.ruta);
    const usados = new Set((await bases(dbManager)).map(b => b.nombre.toLowerCase()));
    let alias = aliasDe(p.nombre);
    for (let i = 2; usados.has(alias.toLowerCase()); i++) alias = `${aliasDe(p.nombre)}_${i}`;
    try {
        await dbManager.query(`ATTACH ${literal(archivo)} AS ${comillas(alias)} (READ_ONLY)`);
    } catch (e) {
        if (/lock|being used|another process/i.test(e.message)) {
            throw new Error(`${p.nombre}'s database is in use by another program (dbt, or another tool writing to it). Try again when it finishes.`);
        }
        throw e;
    }
    adjuntados.add(alias);
    return { alias, tablas: await tablas(dbManager, alias) };
}

async function soltar(dbManager, alias) {
    if (!adjuntados.has(alias)) throw new Error(`"${alias}" is not a project you are looking at.`);
    await dbManager.query(`DETACH ${comillas(alias)}`).catch((e) => { if (!/not found|does not exist/i.test(e.message)) throw e; });
    adjuntados.delete(alias);
    return { ok: true };
}

/** Sus tablas y vistas con sus columnas, como el árbol de la base propia. */
async function tablas(dbManager, alias) {
    const filas = await dbManager.query(
        `SELECT t.table_schema AS esquema, t.table_name AS nombre, t.table_type AS tipo, c.column_name AS columna, c.data_type AS dato
         FROM information_schema.tables t
         LEFT JOIN information_schema.columns c
           ON c.table_catalog = t.table_catalog AND c.table_schema = t.table_schema AND c.table_name = t.table_name
         WHERE t.table_catalog = ${literal(alias)} AND t.table_schema NOT IN ('information_schema', 'pg_catalog')
           AND t.table_schema NOT LIKE 'amoxsql%' AND t.table_name NOT LIKE 'amox\\_%' ESCAPE '\\'
         ORDER BY t.table_schema, t.table_name, c.ordinal_position`
    );
    const mapa = new Map();
    for (const f of filas) {
        const k = `${f.esquema}.${f.nombre}`;
        if (!mapa.has(k)) mapa.set(k, { esquema: f.esquema, nombre: f.nombre, tipo: f.tipo, columnas: [] });
        if (f.columna) mapa.get(k).columnas.push({ nombre: f.columna, tipo: f.dato });
    }
    return [...mapa.values()];
}

/** Para el árbol propio: los catálogos de los hermanos no son de este proyecto. */
const catalogos = () => [...adjuntados];

module.exports = { listar, mirar, soltar, tablas, catalogos, aliasDe };
