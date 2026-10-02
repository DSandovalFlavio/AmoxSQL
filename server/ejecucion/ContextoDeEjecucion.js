/**
 * Dónde corren los pasos de un proceso de Data Flow (A4, fase 3 del plan).
 *
 * Hasta la 5.8 todo corría en la base del proyecto: un proceso que sólo pasaba
 * un Excel a Parquet dejaba ahí sus tablas intermedias y su historial. Desde la
 * 5.9 cada `.sqlchain` dice dónde viven sus pasos intermedios (`config.base`):
 *
 *   memoria   — una base en memoria que muere con la ejecución.
 *   trabajo   — una base propia del proceso, en
 *               `<proyecto>/.amoxsql/trabajo/<proceso>.duckdb`. Sobrevive a la
 *               ejecución: con ella se reanuda desde un punto de control y se
 *               ven los resultados de cada paso. La siguiente ejecución la
 *               reescribe.
 *   proyecto  — la base del proyecto, como siempre.
 *   auto      — la de las cadenas nuevas: `trabajo` si ningún paso lee de la
 *               base del proyecto, `proyecto` si alguno lo hace.
 *
 * Una cadena guardada antes de la 5.9 no tiene la clave y se queda en
 * `proyecto`: lo que funciona hoy no cambia.
 *
 * El contexto aislado tiene la forma que el ejecutor espera de `dbManager`
 * —`query` y `systemQuery`—, así que el ejecutor no sabe la diferencia (Dec-4).
 */
const fs = require('fs');
const path = require('path');
const { DuckDBInstance } = require('@duckdb/node-api');

const BASES = ['auto', 'memoria', 'trabajo', 'proyecto'];

// Pasos que leen la base del proyecto por naturaleza: SQL libre (puede leer
// cualquier tabla), referencias a tablas, y los que dejan algo que se espera
// encontrar luego en ella —una tabla con nombre, o un gráfico o un informe
// cuya consulta se volverá a lanzar contra la base del proyecto—.
const LEEN_LA_BASE = new Set([
    'sql_inline', 'sql_file', 'table_ref', 'create_table', 'rename_table', 'chart', 'report',
]);

// Pasos que sólo leen archivos, la red, o lo que les llega del paso anterior.
const SOLO_ARCHIVOS = new Set([
    'import_file', 'import_folder', 'bucket_read', 'gsheet_read', 'http_fetch', 'export_file', 'fuente',
    'checkpoint', 'join_tables', 'merge_tables', 'filter', 'group_aggregate', 'select_columns',
    'deduplicate', 'add_column', 'sort', 'sample', 'pivot', 'unpivot', 'type_cast',
    'window_functions', 'clean', 'date_ops', 'flatten', 'schema_validation', 'notification',
    'assert', 'ai_enrich',
]);

/**
 * Qué base usa una cadena, y por qué. Pura: la usan el ejecutor y la interfaz.
 * @returns {{ elegida: string|null, resuelta: 'memoria'|'trabajo'|'proyecto', motivo: string, nodo?: string }}
 */
function resolverBase(chainDef) {
    const elegida = chainDef?.config?.base ?? null;
    if (!elegida || !BASES.includes(elegida)) {
        return { elegida: null, resuelta: 'proyecto', motivo: 'anterior' };
    }
    if (elegida !== 'auto') return { elegida, resuelta: elegida, motivo: 'elegida' };

    for (const n of chainDef.nodes || []) {
        if (n.disabled) continue;        // no corre: no lee nada
        const c = n.config || {};
        const etiqueta = n.label || n.id;
        if (LEEN_LA_BASE.has(n.type)) return { elegida, resuelta: 'proyecto', motivo: 'lee-la-base', nodo: etiqueta };
        if (!SOLO_ARCHIVOS.has(n.type)) return { elegida, resuelta: 'proyecto', motivo: 'desconocido', nodo: etiqueta };
        // Una transformación sin paso anterior puede tomar una tabla por nombre.
        if (String(c.sourceTable || '').trim()) return { elegida, resuelta: 'proyecto', motivo: 'lee-la-base', nodo: etiqueta };
        if (n.type === 'assert' && String(c.tableName || '').trim()) return { elegida, resuelta: 'proyecto', motivo: 'lee-la-base', nodo: etiqueta };
    }
    return { elegida, resuelta: 'trabajo', motivo: 'solo-archivos' };
}

/** `informes/ventas.sqlchain` → `<proyecto>/.amoxsql/trabajo/informes__ventas.duckdb` */
function rutaDeTrabajo(proyecto, chainFile) {
    const relativa = chainFile
        ? (path.isAbsolute(chainFile) ? path.relative(proyecto, chainFile) : chainFile)
        : 'sin_nombre';
    const nombre = relativa
        .replace(/\.sqlchain$/i, '')
        .split(/[\\/]+/).filter(Boolean).join('__')
        .replace(/[^A-Za-z0-9_.-]/g, '_') || 'sin_nombre';
    return path.join(proyecto, '.amoxsql', 'trabajo', `${nombre}.duckdb`);
}

// ── Las bases de trabajo abiertas ───────────────────────────────────────────
// Una instancia y UNA conexión por archivo y por proceso de AmoxSQL: DuckDB no
// deja abrir el mismo archivo dos veces, y compartir la conexión hace que la
// ejecución, la siguiente y las vistas previas vean lo mismo, como pasa con la
// base del proyecto. Se quedan abiertas tras la ejecución y se sueltan al
// cambiar de proyecto.
const trabajos = new Map();     // ruta normalizada → Promise<{ instancia, conexion, cola }>

const clave = (ruta) => path.resolve(ruta).toLowerCase();

function instanciaDeTrabajo(ruta) {
    const k = clave(ruta);
    if (!trabajos.has(k)) {
        const carpeta = path.dirname(ruta);
        fs.mkdirSync(carpeta, { recursive: true });
        // No todos los proyectos ignoran *.duckdb: esta carpeta se ignora sola.
        const ignorar = path.join(carpeta, '.gitignore');
        if (!fs.existsSync(ignorar)) {
            try { fs.writeFileSync(ignorar, '# Bases de trabajo de Data Flow: se regeneran al ejecutar.\n*\n'); } catch { /* no es grave */ }
        }
        const p = (async () => {
            const instancia = await DuckDBInstance.create(ruta);
            return { instancia, conexion: await instancia.connect(), cola: { turno: Promise.resolve() } };
        })();
        p.catch(() => trabajos.delete(k));
        trabajos.set(k, p);
    }
    return trabajos.get(k);
}

/** Cierra las bases de trabajo abiertas (todas, o sólo las de un proyecto). */
async function soltarTrabajos(proyecto = null) {
    const prefijo = proyecto ? clave(proyecto) + path.sep : null;
    for (const [k, p] of [...trabajos]) {
        if (prefijo && !k.startsWith(prefijo)) continue;
        trabajos.delete(k);
        try {
            const t = await p;
            await t.cola.turno;
            t.conexion.closeSync();
            t.instancia.closeSync();
        } catch { /* ya estaba cerrada */ }
    }
}

// ── El contexto ─────────────────────────────────────────────────────────────

class ContextoAislado {
    /**
     * `propia`: la instancia y la conexión mueren con el contexto (memoria).
     * Si no, son las compartidas de una base de trabajo, y cerrar el contexto
     * sólo lo da por terminado.
     */
    constructor({ modo, ruta, instancia, conexion, cola, propia }) {
        this.modo = modo;
        this.ruta = ruta;
        // En una base que es sólo del proceso, las vistas intermedias pueden
        // ser normales (ver ChainExecutor.materializeTarget).
        this.vistasPersistentes = modo === 'trabajo';
        this._instancia = instancia;
        this._conexion = conexion;
        this._cola = cola || { turno: Promise.resolve() };
        this._propia = propia;
        this._cerrado = false;
    }

    // Una sentencia a la vez por conexión, como en los carriles de dbManager.
    query(sql) {
        const turno = this._cola.turno.then(async () => {
            if (this._cerrado) throw new Error('La ejecución ya terminó: su base está cerrada.');
            try {
                const r = await this._conexion.run(sql);
                return await r.getRowObjectsJson();
            } catch (err) {
                throw new Error(err?.message || String(err));
            }
        });
        this._cola.turno = turno.then(() => {}, () => {});
        return turno;
    }

    // Aquí no hay historial de consultas que proteger: las dos son lo mismo.
    systemQuery(sql) { return this.query(sql); }

    async cerrar() {
        if (this._cerrado) return;
        await this._cola.turno;
        this._cerrado = true;
        if (this._propia) {
            try { this._conexion?.closeSync(); } catch { /* ya cerrada */ }
            try { this._instancia?.closeSync(); } catch { /* ya cerrada */ }
        }
        this._conexion = null;
        this._instancia = null;
    }
}

/** El contexto «proyecto»: el dbManager de siempre, con un `cerrar` que no cierra nada. */
function contextoDelProyecto(dbManager) {
    return {
        modo: 'proyecto',
        ruta: null,
        query: (sql, o) => dbManager.query(sql, o),
        systemQuery: (sql, o) => dbManager.systemQuery(sql, o),
        getLoadedExtensions: () => dbManager.getLoadedExtensions?.() || [],
        cerrar: async () => {},
    };
}

/** ¿Es la base que tiene abierta dbManager una de este proyecto? */
function dbManagerEsDelProyecto(dbManager, proyecto) {
    const actual = dbManager?.getCurrentPath?.();
    if (!actual || actual === ':memory:' || !proyecto) return false;
    const raiz = path.resolve(proyecto).toLowerCase() + path.sep;
    return path.resolve(actual).toLowerCase().startsWith(raiz);
}

/**
 * La base de un proyecto que no es el abierto: la que dice su project.json
 * (`defaultDb`), o la única .duckdb de su raíz. Si no hay una clara, se dice.
 */
function baseDelProyecto(proyecto) {
    let config = {};
    try { config = JSON.parse(fs.readFileSync(path.join(proyecto, '.amoxsql', 'project.json'), 'utf8')); } catch { /* sin manifiesto */ }
    if (config.defaultDb) {
        const ruta = path.resolve(proyecto, config.defaultDb);
        if (fs.existsSync(ruta)) return ruta;
    }
    let candidatas = [];
    try { candidatas = fs.readdirSync(proyecto).filter(f => /\.duckdb$/i.test(f)); } catch { /* carpeta ilegible */ }
    if (candidatas.length === 1) return path.join(proyecto, candidatas[0]);
    throw new Error(candidatas.length
        ? `This process uses the project database, and the project has ${candidatas.length} of them. Set "defaultDb" in .amoxsql/project.json, or set the process to a work database.`
        : 'This process uses the project database, and the project has none. Set the process to a work database, or create the database first.');
}

async function cargarExtensiones(ctx, dbManager) {
    // Las extensiones son por instancia: la nueva no hereda las del proyecto.
    for (const ext of dbManager?.getLoadedExtensions?.() || []) {
        if (!/^[A-Za-z0-9_]+$/.test(ext)) continue;
        try { await ctx.query(`LOAD ${ext}`); } catch { /* el paso que la necesite lo dirá */ }
    }
}

/**
 * Abre el contexto donde correrá una ejecución.
 * @param {'memoria'|'trabajo'|'proyecto'} modo
 */
async function abrirContexto(modo, { dbManager, proyecto, chainFile, fuera = false }) {
    // `fuera`: la orden no viene de la interfaz (línea de comandos), así que el
    // proyecto puede no ser el que la interfaz tiene abierto. Entonces su base
    // se abre aparte; la de la interfaz no se toca.
    if (modo === 'proyecto' && (!fuera || dbManagerEsDelProyecto(dbManager, proyecto))) {
        return contextoDelProyecto(dbManager);
    }

    let ctx;
    if (modo === 'proyecto') {
        const ruta = baseDelProyecto(proyecto);
        const instancia = await DuckDBInstance.create(ruta);
        ctx = new ContextoAislado({ modo, ruta, instancia, conexion: await instancia.connect(), propia: true });
    } else if (modo === 'memoria') {
        const instancia = await DuckDBInstance.create(':memory:');
        ctx = new ContextoAislado({ modo, ruta: null, instancia, conexion: await instancia.connect(), propia: true });
    } else if (modo === 'trabajo') {
        if (!proyecto) throw new Error('Una base de trabajo necesita un proyecto abierto.');
        const ruta = rutaDeTrabajo(proyecto, chainFile);
        const t = await instanciaDeTrabajo(ruta);
        ctx = new ContextoAislado({ modo, ruta, instancia: t.instancia, conexion: t.conexion, cola: t.cola, propia: false });
    } else {
        throw new Error(`Base desconocida: ${modo}`);
    }
    // Las rutas relativas del SQL se leen desde el proyecto, aunque el proceso
    // de AmoxSQL esté en otra carpeta (una orden de la línea de comandos).
    if (proyecto) {
        try { await ctx.query(`SET file_search_path = '${String(proyecto).replace(/'/g, "''")}'`); } catch { /* no es crítico */ }
    }
    await cargarExtensiones(ctx, dbManager);
    // Las fuentes con nombre (C1): la instancia aislada no ve el catálogo de la
    // interfaz, así que monta el suyo. Si falla, el paso que lea una fuente lo dirá.
    if (proyecto) {
        try { await require('../fuentes').montar(ctx, { raiz: proyecto }); }
        catch (e) { console.warn('[Fuentes] Contexto aislado sin catálogo:', e?.message || e); }
    }
    return ctx;
}

/**
 * Para que la interfaz vea lo que un paso materializó: la base de trabajo de
 * la cadena si es la que usa y ya existe; si no, la del proyecto.
 */
async function abrirParaVer(chainDef, { dbManager, proyecto, chainFile, base = null }) {
    const resuelta = base || resolverBase(chainDef).resuelta;
    if (resuelta === 'trabajo' && proyecto) {
        const ruta = rutaDeTrabajo(proyecto, chainFile);
        if (fs.existsSync(ruta)) return abrirContexto('trabajo', { dbManager, proyecto, chainFile });
    }
    return contextoDelProyecto(dbManager);
}

module.exports = {
    BASES,
    resolverBase,
    rutaDeTrabajo,
    abrirContexto,
    abrirParaVer,
    baseDelProyecto,
    soltarTrabajos,
};
