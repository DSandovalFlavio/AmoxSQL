/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
const registrador = require('./registrador');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dbManager        = require('./DatabaseManager');
const baseCentral      = require('./central/BaseCentral');
const secretos         = require('./secretos');
const manifiesto       = require('./manifiesto');
const contextoDeEjecucion = require('./ejecucion/ContextoDeEjecucion');
const hermanos         = require('./hermanos');
const fuentes          = require('./fuentes');
const medidas          = require('./medidas');
const dbtConvivir      = require('./dbtConvivir');
const llegadas         = require('./llegadas');
const procedencia      = require('./procedencia');
const descripciones    = require('./descripciones');

const lineaDeComandos  = require('./ejecucion/lineaDeComandos');
// La apertura de la base de AmoxSQL y del llavero (ver startServer).
let arranque = Promise.resolve();
const { crearVigilante } = require('./vigilanteArchivos');

const esquemas = require('./esquemas');
const variablesDelProyecto = require('./variables');
const app = express();
const PORT = 3001;

/**
 * Red de ultima instancia del proceso del servidor.
 *
 * El servidor vive en un utilityProcess sin supervisor: electron/main.js escucha
 * su 'exit' pero solo lo escribe en consola — no lo reinicia ni avisa al
 * renderer. Asi que, sin esto, UNA sola promesa rechazada fuera de un try/catch
 * (Node aborta el proceso por defecto desde la v15) deja la ventana abierta y el
 * backend muerto: la app parece viva y todo lo que se toque falla.
 *
 * Por eso aqui se registra y se SIGUE. Es lo contrario del consejo habitual para
 * un servidor con reinicio automatico, y a proposito: aqui morir no es
 * "recuperarse", es perder la sesion del usuario sin decirselo. Lo que se pierde
 * a cambio es la garantia de un estado limpio, de ahi que se vuelque la traza
 * entera — si algo queda inconsistente, el rastro esta.
 */
process.on('unhandledRejection', (reason) => {
    registrador.error('[Server] Promesa rechazada sin manejar — el servidor sigue en pie:',
        reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    registrador.error('[Server] Excepcion no capturada — el servidor sigue en pie:',
        err && err.stack ? err.stack : err);
});

// ─── Internal schemas & tables to ALWAYS hide from the user ───
// Exact internal schemas created by AmoxSQL itself:
const INTERNAL_SCHEMAS = ['information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains'];
const INTERNAL_TABLES_MAIN = ['amox_query_history']; // legacy tables in 'main' (pre-migration)
// Internal schemas matched by PREFIX (catches generated/future names):
//   amoxsql%  → any current/future AmoxSQL internal schema
//   fts\_%    → DuckDB full-text index schemas (fts_main_<table>, fts_amoxsql_ai_messages, …)
const INTERNAL_SCHEMA_PREFIXES = ['amoxsql', 'fts\\_'];

/** Builds a SQL WHERE clause to exclude internal schemas and tables */
function userTablesWhereClause(schemaCol = 'table_schema', nameCol = 'table_name') {
    const schemaList = INTERNAL_SCHEMAS.map(s => `'${s}'`).join(',');
    const tableList = INTERNAL_TABLES_MAIN.map(t => `'${t}'`).join(',');
    const prefixClauses = INTERNAL_SCHEMA_PREFIXES
        .map(p => `${schemaCol} NOT LIKE '${p}%' ESCAPE '\\'`)
        .join(' AND ');
    // Hide Chains intermediate tables (deterministic "__chain_<scope>_*" namespace).
    // Underscores are escaped so LIKE treats them as literals, not wildcards.
    const chainArtifactClause = `${nameCol} NOT LIKE '\\_\\_chain\\_%' ESCAPE '\\'`;
    // Hide DuckLake's metadata catalog ("__ducklake_metadata_<alias>"), which
    // holds ~30 internal bookkeeping tables (ducklake_snapshot, ducklake_data_file…)
    // in its own DuckDB catalog — not the user's logical lakehouse tables.
    const catalogCol = schemaCol.replace(/table_schema$/, 'table_catalog');
    const duckLakeMetaClause = `${catalogCol} NOT LIKE '\\_\\_ducklake\\_metadata\\_%' ESCAPE '\\'`;
    // Las fuentes con nombre (C1) viven en su propio catalogo, `fuentes`, con
    // esquema `main`: sin esto se mezclarian con las tablas del proyecto. El
    // explorador las enseña aparte (/api/fuentes/columnas).
    const fuentesClause = `${catalogCol} <> 'fuentes' AND ${catalogCol} NOT LIKE 'amox\\_lago\\_%' ESCAPE '\\'`;
    // 5.14 (J1): las bases de otros proyectos que se están mirando tienen su sección.
    const otros = hermanos.catalogos();
    const hermanosClause = otros.length ? ` AND ${catalogCol} NOT IN (${otros.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})` : '';
    return `${schemaCol} NOT IN (${schemaList}) AND ${prefixClauses} AND ${chainArtifactClause} AND ${duckLakeMetaClause} AND ${fuentesClause}${hermanosClause} AND NOT (${schemaCol} = 'main' AND ${nameCol} IN (${tableList}))`;
}

// 6.0 (M0, auditoría S1): el servidor es de la ventana de AmoxSQL y de nadie más.
const puerta = require('./puerta');
app.use(puerta.puerta);
app.use(cors(puerta.opcionesCors));
app.use(express.json({ limit: '50mb' }));

// FIX: Handle BigInt serialization for JSON
BigInt.prototype.toJSON = function () {
    return this.toString();
};

let ROOT_DIR = process.cwd();
// ¿Es ROOT_DIR un proyecto que el usuario abrió? Hasta que no, es sólo el cwd
// del proceso —la carpeta de instalación, o el repo— y nada debe escribir en
// ella un project.json (el manifiesto, A2).
let PROYECTO_ABIERTO = false;
const APP_DIR = process.cwd(); // AmoxSQL app directory — never changes, unlike ROOT_DIR

/**
 * El vigilante del disco (ver `vigilanteArchivos.js`).
 *
 * Vive aquí arriba porque mira **una** raíz y ROOT_DIR cambia al abrir otro
 * proyecto: sin rearmarlo seguiría avisando de los archivos del anterior.
 */
let vigilante = null;
function rearmarVigilante() {
    try { vigilante?.parar(); } catch { /* ya estaba parado */ }
    vigilante = crearVigilante(ROOT_DIR);
}


/* --- Extension Management APIs --- */

// Autoload persistence: which extensions to LOAD automatically on startup.
// Stored in ~/.amoxsql/config.json under `extensions` so activations survive an
// app restart (dbManager.loadedExtensions only survives a reconnect within a run).
function getAutoloadExtensions() {
    try {
        const cfg = aiManager.getConfig();
        return Array.isArray(cfg.extensions) ? cfg.extensions : [];
    } catch { return []; }
}
function addAutoloadExtension(name) {
    try {
        const cfg = aiManager.getConfig();
        const list = Array.isArray(cfg.extensions) ? cfg.extensions : [];
        if (!list.includes(name)) {
            list.push(name);
            cfg.extensions = list;
            aiManager.saveConfig(cfg);
        }
    } catch (e) {
        registrador.aviso('[Extensions] Could not persist autoload extension:', e.message);
    }
}


const excel = require('./excel');

/** La ruta de un archivo que llega del cliente: absoluta, o relativa al proyecto. */
const rutaDelProyecto = (r) => (path.isAbsolute(String(r)) ? String(r) : path.join(ROOT_DIR, String(r)));

/** Responder un error de Excel: 422 con su código si es de los que se explican. */
function errorDeExcel(res, err) {
    if (err instanceof excel.ErrorDeExcel) return res.status(err.codigo === 'no_existe' ? 404 : 422).json({ error: err.message, codigo: err.codigo });
    return res.status(500).json({ error: String(err?.message || err).split('\n')[0] });
}


const aiManager = require('./AiManager');


/* --- AI Agent Chat API (Tool Loop) --- */

/**
 * Helper: Build table context from DuckDB for the AI agent.
 */
// Table context cache with 5-minute TTL
let _tableContextCache = null;
let _tableContextCacheTime = 0;
const TABLE_CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

// Lightweight name-only roster (F3): used to bound assistant context — the model
// gets full columns only for referenced tables + a cheap roster of the rest.
let _tableNamesCache = null;
let _tableNamesCacheTime = 0;


/**
 * Finds which real tables a SQL string references, by matching known table names
 * as whole-word tokens (case-insensitive, tolerant of double-quoting). Matching
 * against the ACTUAL name list (not SQL parsing) is robust: a real table name
 * appearing in the query is a strong signal it's used, and unknown tokens are
 * simply ignored. Used to bound assistant context to the active query.
 */
function extractReferencedTables(query, allNames) {
    if (!query || !Array.isArray(allNames) || allNames.length === 0) return [];
    const q = String(query);
    return allNames.filter(name => {
        const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[^A-Za-z0-9_])"?${esc}"?($|[^A-Za-z0-9_])`, 'i');
        return re.test(q);
    });
}

async function buildTableContext(contextTables = null) {
    // If contextTables is explicitly provided but empty, return empty
    if (contextTables && contextTables.length === 0) return [];

    // Skip cache if explicitly requesting certain tables
    const useCache = !contextTables;

    // Return cached result if fresh
    const now = Date.now();
    if (useCache && _tableContextCache && (now - _tableContextCacheTime) < TABLE_CONTEXT_TTL) {
        return _tableContextCache;
    }

    try {
        let query = `
            SELECT table_catalog, table_schema, table_name
            FROM ${esquemas.TABLAS} AS t
            WHERE ${userTablesWhereClause()}
            AND table_type = 'BASE TABLE'
        `;

        // If explicit context tables requested, filter by them
        if (contextTables) {
            const tableNames = contextTables.map(t => `'${t.name.replace(/'/g, "''")}'`).join(',');
            query += `\n            AND table_name IN (${tableNames})`;
        }

        query += `\n            ORDER BY table_schema, table_name`;

        const tables = await dbManager.systemQuery(query, { lane: 'meta' });
        const selected = tables.slice(0, 30);
        if (selected.length === 0) {
            // Un proyecto sin tablas puede tener fuentes: tambien cuentan.
            const soloFuentes = contextTables ? [] : await columnasDeFuentes()
                .then(lista => lista.map(f => ({ name: f.nombre, schema: 'fuentes', ref: `fuentes."${f.nombre}"`, descripcion: f.descripcion, columns: f.columnas.map(c => ({ name: c.nombre, type: c.tipo })) })))
                .catch(() => []);
            _tableContextCache = soloFuentes;
            _tableContextCacheTime = now;
            return soloFuentes;
        }

        // Single pass instead of DESCRIBE + COUNT(*) per table (up to 60 queries
        // before the first stream token): one information_schema.columns scan for
        // all selected tables + duckdb_tables() estimated_size for row counts.
        const esc = (v) => String(v).replace(/'/g, "''");
        const keyList = selected
            .map(t => `'${esc(t.table_schema)}.${esc(t.table_name)}'`)
            .join(',');

        let colRows = [];
        let sizeRows = [];
        try {
            [colRows, sizeRows] = await Promise.all([
                dbManager.systemQuery(
                    `SELECT table_schema, table_name, column_name, data_type
                     FROM ${esquemas.COLUMNAS} AS c
                     WHERE table_schema || '.' || table_name IN (${keyList})
                     ORDER BY table_schema, table_name, ordinal_position`,
                    { lane: 'meta' }
                ),
                dbManager.systemQuery(
                    `SELECT table_schema AS schema_name, table_name, estimated_size
                     FROM ${esquemas.TABLAS} AS t
                     WHERE table_type = 'BASE TABLE' AND table_schema || '.' || table_name IN (${keyList})`,
                    { lane: 'meta' }
                ),
            ]);
        } catch { /* fall through — tables render with empty columns / '?' rows */ }

        const colMap = new Map();   // 'schema.table' → [{name, type}]
        for (const c of colRows) {
            const key = `${c.table_schema}.${c.table_name}`;
            if (!colMap.has(key)) colMap.set(key, []);
            colMap.get(key).push({ name: c.column_name, type: c.data_type });
        }
        const sizeMap = new Map();  // 'schema.table' → estimated row count
        for (const r of sizeRows) {
            const key = `${r.schema_name}.${r.table_name}`;
            if (!sizeMap.has(key)) sizeMap.set(key, r.estimated_size);
        }

        let origenes = {};
        try { origenes = await procedencia.deLasTablas(dbManager.lane('meta')); } catch { /* sin procedencias */ }
        let desc = {};
        try { desc = await descripciones.deLaBase(dbManager, { raiz: PROYECTO_ABIERTO ? ROOT_DIR : null, attachedPath: dbManager.attachedPath }); } catch { /* sin descripciones */ }
        const tableContexts = selected.map(t => {
            const key = `${t.table_schema}.${t.table_name}`;
            const rowsVal = sizeMap.get(key);
            const o = origenes[key];
            const d = desc[key];
            return {
                name: t.table_name,
                schema: t.table_schema,
                // 5.12 (I5): la descripción de la tabla y de cada columna.
                ...(d?.descripcion ? { descripcion: d.descripcion } : {}),
                columns: (colMap.get(key) || []).map(c => (d?.columnas?.[c.name] ? { ...c, descripcion: d.columnas[c.name] } : c)),
                rows: (rowsVal !== undefined && rowsVal !== null) ? rowsVal : '?',
                ...(o ? { procedencia: `${o.resumen}${o.cambiados.length ? ' (the file changed since)' : ''}` } : {}),
            };
        });

        // Las fuentes con nombre (C1) van detras de las tablas, con su forma de
        // citarlas: fuentes."nombre". Sin contar filas: contarlas leeria el archivo.
        if (!contextTables) {
            try {
                for (const f of await columnasDeFuentes()) {
                    tableContexts.push({ name: f.nombre, schema: 'fuentes', ref: `fuentes."${f.nombre}"`, descripcion: f.descripcion, columns: f.columnas.map(c => ({ name: c.nombre, type: c.tipo })) });
                }
            } catch { /* sin fuentes, el contexto sigue */ }
        }

        _tableContextCache = tableContexts;
        _tableContextCacheTime = now;
        return tableContexts;
    } catch (err) {
        registrador.error('[AI] Failed to build table context:', err);
        return [];
    }
}

/**
 * Invalidate the table context cache (call after schema changes).
 */
function invalidateTableContextCache() {
    _tableContextCache = null;
    _tableContextCacheTime = 0;
    _tableNamesCache = null;
    _tableNamesCacheTime = 0;
}


/* --- AI Conversation CRUD APIs --- */
const aiPersistence = require('./ai/persistence');


/* --- DuckDB Function Catalog API --- */
const AMOX_DIR = () => path.join(ROOT_DIR, '.amox');
const ensureAmoxDir = () => { if (!fs.existsSync(AMOX_DIR())) fs.mkdirSync(AMOX_DIR(), { recursive: true }); };


// dbt dentro del editor (5.12, fase 3; I2, Dec-28).
const archivoDelProyecto = (a) => {
    if (!a) throw new Error('Which file?');
    const abs = path.resolve(ROOT_DIR, String(a));
    if (path.relative(ROOT_DIR, abs).startsWith('..')) throw new Error('That file is not in the project.');
    return abs;
};


// ─── Chart Gallery ─────────────────────────────────────────────────────────
const { seedGallery, registerGalleryRoutes } = require('./galleryManager');
seedGallery();
registerGalleryRoutes(app);


// ─── Workspaces (B1) y su palabra (B8) ────────────────────────────────────────
// Un workspace vive en AmoxSQL; las carpetas se le enlazan (server/workspaces.js).

const conCentral = (fn) => async (req, res) => {
    try {
        await baseCentral.abrir();
        res.json(await fn(req, res));
    } catch (err) {
        res.status(/does not exist/.test(err.message) ? 404 : 400).json({ error: err.message });
    }
};


// ─── El manifiesto del proyecto (A2) ────────────────────────────────────────

function anotarExtensionDelProyecto(nombre) {
    if (!PROYECTO_ABIERTO) return;
    try { manifiesto.anotarExtension(ROOT_DIR, nombre); }
    catch (e) { registrador.aviso('[Manifiesto] No se pudo anotar la extensión:', e.message); }
}


// ─── Las fuentes con nombre (C1, 5.10) ──────────────────────────────────────
// Cada fuente es una vista del catálogo en memoria `fuentes` (server/fuentes.js).
// Montarlo lee los archivos para saber sus columnas, así que va por el carril
// 'meta' —no hace esperar a las consultas del usuario— y nunca dos a la vez:
// si se pide mientras corre uno, se repite al terminar con lo último.

let montandoFuentes = null;
let fuentesOtraVez = false;
let ultimoMontaje = { informe: [], esquemaHomonimo: false, en: null };

function remontarFuentes() {
    if (montandoFuentes) { fuentesOtraVez = true; return montandoFuentes; }
    montandoFuentes = (async () => {
        do {
            fuentesOtraVez = false;
            try {
                await baseCentral.abrir().catch(() => {});
                const raiz = PROYECTO_ABIERTO ? ROOT_DIR : null;
                const meta = dbManager.lane('meta');
                const informe = await fuentes.montar(meta, { raiz });
                // 5.13 (Dec-41): las medidas del workspace, como macros en cada carril.
                await medidas.montar(dbManager, raiz).catch(e => registrador.aviso('[Medidas] No se pudieron montar:', e?.message || e));
                // 6.0 (Dec-98): las variables del proyecto, en cada carril (`$nombre`).
                await variablesDelProyecto.montar(dbManager, raiz).catch(e => registrador.aviso('[Variables] No se pudieron montar:', e?.message || e));
                ultimoMontaje = { informe, esquemaHomonimo: raiz ? await fuentes.hayEsquemaHomonimo(meta) : false, en: new Date().toISOString() };
                invalidateTableContextCache();
                // C3: vigilar las carpetas de las fuentes de tipo carpeta.
                llegadas.vigilar(
                    informe.filter(i => i.carpeta).map(i => ({ fuente: i.nombre, ...i.carpeta })),
                    alLlegarUnArchivo
                );
            } catch (e) {
                registrador.aviso('[Fuentes] No se pudo montar el catálogo:', e?.message || e);
            }
        } while (fuentesOtraVez);
    })().finally(() => { montandoFuentes = null; });
    return montandoFuentes;
}
dbManager.alIniciar(() => { remontarFuentes(); });

// ── El archivo que acaba de llegar (C3) ─────────────────────────────────────
// Quien escucha (la interfaz) recibe un aviso por llegada; la vista ya está
// rehecha cuando el aviso sale.
const oyentesDeLlegadas = new Set();
function alLlegarUnArchivo(llegada) {
    remontarFuentes().then(() => {
        const aviso = { tipo: 'llegada', fuentes: llegada.fuentes, archivo: llegada.archivo, modificada: llegada.modificada, tamano: llegada.tamano };
        registrador.info(`[Fuentes] Llegó ${llegada.archivo} (${llegada.fuentes.join(', ')})`);
        for (const f of oyentesDeLlegadas) { try { f(aviso); } catch { /* un oyente roto no tumba a los demás */ } }
        // D8: lo programado «al llegar un archivo» a estas fuentes.
        if (PROYECTO_ABIERTO) require('./programacion/programador').alLlegar(llegada.fuentes, ROOT_DIR).catch(() => {});
    });
}


function anotarFuentesDelSql(sql) {
    if (!PROYECTO_ABIERTO) return;
    try {
        const nombres = fuentes.usadas(sql);
        if (!nombres.length) return;
        const porNombre = new Map(fuentes.definiciones({ raiz: ROOT_DIR }).fuentes.map(f => [f.def.nombre, f.def]));
        for (const n of nombres) {
            const def = porNombre.get(n);
            if (!def) continue;
            manifiesto.anotarFuente(ROOT_DIR, n);
            // Lo que necesita para leerse en otra máquina (C4, 5.5): sus
            // extensiones y el NOMBRE de su credencial.
            for (const e of fuentes.extensionesDe(def, def.ubicacion)) manifiesto.anotarExtension(ROOT_DIR, e);
            if (def.credencial) manifiesto.anotarCredencial(ROOT_DIR, def.credencial, `nube`);
        }
    } catch (e) { registrador.aviso('[Manifiesto] No se pudieron anotar las fuentes:', e.message); }
}

/** Dónde vive lo que se pide: en el proyecto abierto, o en un workspace. */
function destinoDeFuente(req) {
    const b = { ...(req.query || {}), ...(req.body || {}) };
    if (b.workspaceId) return { workspaceId: String(b.workspaceId) };
    if (!PROYECTO_ABIERTO) throw new Error('Open a project or choose a workspace first.');
    return { raiz: ROOT_DIR };
}


/**
 * Las fuentes del catálogo con sus columnas, tal como las ve el motor ahora.
 * Una fuente sin ubicar o ilegible tiene una sola columna, `aviso`: se marca.
 */
async function columnasDeFuentes() {
    if (montandoFuentes) await montandoFuentes;
    const filas = await dbManager.systemQuery(
        `SELECT v.view_name AS nombre, v.comment AS descripcion, c.column_name, c.data_type
         FROM duckdb_views() v
         LEFT JOIN information_schema.columns c
                ON c.table_catalog = v.database_name AND c.table_schema = v.schema_name AND c.table_name = v.view_name
         WHERE v.database_name = 'fuentes' AND NOT v.internal
         ORDER BY v.view_name, c.ordinal_position`,
        { lane: 'meta' }
    );
    const porNombre = new Map();
    for (const f of filas) {
        if (!porNombre.has(f.nombre)) porNombre.set(f.nombre, { nombre: f.nombre, descripcion: f.descripcion || null, columnas: [] });
        if (f.column_name) porNombre.get(f.nombre).columnas.push({ nombre: f.column_name, tipo: f.data_type });
    }
    const estados = new Map(ultimoMontaje.informe.map(i => [i.nombre, i.estado]));
    return [...porNombre.values()].map(f => {
        const estado = estados.get(f.nombre) || 'lista';
        return { ...f, estado, columnas: estado === 'lista' ? f.columnas : [] };
    });
}


app.post('/api/shutdown', async (_req, res) => {
    res.json({ ok: true });
    try {
        await dbManager.close();
        registrador.info('[Server] DuckDB connections closed — shutting down.');
    } catch (err) {
        registrador.error('[Server] Error closing DB on shutdown:', err.message);
    }
    try { await contextoDeEjecucion.soltarTrabajos(); } catch { /* nada que cerrar */ }
    try {
        await baseCentral.cerrar();
    } catch (err) {
        registrador.error('[Central] Error al cerrar:', err.message);
    }
    // Give the response time to flush, then exit.
    setTimeout(() => process.exit(0), 200);
});

// ── Las rutas, por familias (server/api/, 6.0 M7) ──
// Lo que index.js comparte con cada familia de rutas: funciones y valores (fijos)
// y, con getter, el estado que cambia en marcha (el proyecto abierto, sus cachés).
// Se llena ANTES de cargar las rutas, que lo leen al cargarse.
const compartido = require('./api/compartido');
Object.assign(compartido, {
    AMOX_DIR, APP_DIR, TABLE_CONTEXT_TTL, addAutoloadExtension,
    anotarExtensionDelProyecto, anotarFuentesDelSql, archivoDelProyecto,
    buildTableContext, columnasDeFuentes, conCentral, destinoDeFuente, ensureAmoxDir,
    errorDeExcel, getAutoloadExtensions, invalidateTableContextCache, oyentesDeLlegadas,
    rearmarVigilante, remontarFuentes, rutaDelProyecto, userTablesWhereClause,
});
Object.defineProperties(compartido, {
    PROYECTO_ABIERTO: { get: () => PROYECTO_ABIERTO, set: (v) => { PROYECTO_ABIERTO = v; }, enumerable: true },
    ROOT_DIR: { get: () => ROOT_DIR, set: (v) => { ROOT_DIR = v; }, enumerable: true },
    _tableNamesCache: { get: () => _tableNamesCache, set: (v) => { _tableNamesCache = v; }, enumerable: true },
    _tableNamesCacheTime: { get: () => _tableNamesCacheTime, set: (v) => { _tableNamesCacheTime = v; }, enumerable: true },
    montandoFuentes: { get: () => montandoFuentes, enumerable: true },
    ultimoMontaje: { get: () => ultimoMontaje, enumerable: true },
    vigilante: { get: () => vigilante, enumerable: true },
});
app.use(require('./api/git'));
app.use(require('./api/dbt'));
app.use(require('./api/flujos'));
app.use(require('./api/ia'));
app.use(require('./api/consultas'));
app.use(require('./api/base'));
app.use(require('./api/proyecto'));
app.use(require('./api/archivos'));
app.use(require('./api/fuentes'));
app.use(require('./api/operacion'));
app.use(require('./api/workspaces'));
app.use(require('./api/ajustes'));
// ── fin de las rutas por familias ──

// Lo último antes de arrancar: el atrapa-todo de producción responde 404 a
// cualquier /api que no conozca, así que toda ruta registrada DESPUÉS quedaba
// tapada en la aplicación instalada (workspaces, Operations…), no en desarrollo.
// Serve Static Assets in Production (Electron App)
if (process.env.NODE_ENV === 'production') {
    // In Electron packing, __dirname might call inside asar. 
    // We need to point to where 'client/dist' is relative to 'server/index.js'.
    // In win-unpacked: resources/app/server/index.js -> resources/app/client/dist
    const clientDistPath = path.join(__dirname, '../client/dist');

    registrador.info(`[Server] Serving static files from: ${clientDistPath}`);
    app.use(express.static(clientDistPath));

    // Handle React Routing, return all requests to React app
    app.get(/.*/, (req, res) => {
        // Build API safety: Don't return HTML for failed API calls
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ error: `API route not found: ${req.path}` });
        }
        res.sendFile(path.join(clientDistPath, 'index.html'));
    });
}


/**
 * Arranca el servidor, cayendo a un puerto libre si el preferido esta ocupado.
 *
 * OJO con el callback de app.listen(port, cb): Node lo invoca TAMBIEN cuando el
 * listen falla, y ahi server.address() es null. La version anterior leia
 * .port directamente sobre ese null, reventaba dentro de la emision del evento
 * 'error' y abortaba el resto de sus manejadores — justo el que hacia el plan B.
 * La promesa no se resolvia ni se rechazaba, asi que el proceso principal
 * esperaba 30 segundos y mostraba "El servidor interno no respondio". Resultado:
 * el respaldo de puerto no funciono nunca.
 *
 * Por eso aqui se escucha 'listening' de forma explicita en vez de usar el
 * callback de listen, y 'error' se registra ANTES de que pueda dispararse.
 */
const startServer = (preferredPort = 3001) => {
    return new Promise((resolve, reject) => {
        const ready = (server) => {
            const address = server.address();
            if (!address) {
                reject(new Error('El servidor dice estar escuchando pero no tiene direccion.'));
                return;
            }
            const actualPort = address.port;
            registrador.info(`Server running at http://localhost:${actualPort}`);
            registrador.info(`Serving files from: ${ROOT_DIR}`);

            // Initialize AI schema in the background so DataDiving works without a
            // project connected. Fire-and-forget — do NOT await here, so resolve()
            // se llama de inmediato y el proceso principal recibe el 'ready' sin
            // esperas.
            aiPersistence.initSchema(dbManager).catch(err =>
                registrador.aviso('[AI] Startup schema init warning (non-fatal):', err.message)
            );

            // La base de AmoxSQL, igual: en segundo plano. Si no se puede abrir,
            // el servidor sigue; /api/central/estado dice por qué.
            // Detrás de ella, el llavero: migra lo que la 5.8 tenía en claro y
            // descifra las credenciales a memoria (A1).
            arranque = baseCentral.abrir()
                .then(() => secretos.iniciar(aiManager.getConfig()))
                .catch(err => registrador.aviso('[Secretos] Arranque:', err.message));

            // Re-activate extensions the user auto-loads. Fire-and-forget igual;
            // dbManager las vuelve a LOADear en cada reconexion una vez sembradas.
            (async () => {
                try {
                    const names = getAutoloadExtensions();
                    if (names.length === 0) return;
                    names.forEach(n => dbManager.rememberExtension(n));
                    await dbManager.restoreExtensions();
                    registrador.info(`[Extensions] Auto-loaded ${names.length}: ${names.join(', ')}`);
                } catch (e) {
                    registrador.aviso('[Extensions] Startup autoload warning (non-fatal):', e.message);
                }
            })();

            resolve({ server, port: actualPort });
        };

        // Un intento de escucha. 'error' queda enganchado antes que nada, y los
        // dos manejadores se excluyen: el que gane desengancha al otro.
        const attempt = (port, onError) => {
            // Sólo localhost: otra máquina de la red no llega (M0).
            const server = app.listen(port, puerta.DIRECCION);
            const fail = (err) => { server.removeListener('listening', ok); onError(err); };
            const ok = () => { server.removeListener('error', fail); ready(server); };
            server.once('error', fail);
            server.once('listening', ok);
        };

        attempt(preferredPort, (err) => {
            if (err.code !== 'EADDRINUSE') {
                reject(err);
                return;
            }
            // Puerto ocupado (otra instancia, o cualquier otro programa): que el
            // sistema nos de uno libre. El proceso principal se entera del puerto
            // real por el mensaje 'ready', asi que no hay nada mas que ajustar.
            registrador.aviso(`[Server] Puerto ${preferredPort} ocupado — se pide uno libre al sistema.`);
            attempt(0, reject);
        });
    });
};

// Allow standalone execution (node server/index.js)
if (require.main === module) {
    startServer(PORT);
}

/**
 * Una orden de la línea de comandos (A3), que llega del proceso principal por
 * parentPort. Espera a que la base de AmoxSQL y el llavero estén listos: en
 * un arranque sin ventana, la orden llega justo detrás del servidor.
 */
async function atenderOrden(orden) {
    await arranque;
    return lineaDeComandos.atender(orden, { dbManager, config: aiManager.getConfig() });
}

/**
 * Lo programado (5.11, D1): con qué corre, a quién avisa (D2) y, con la
 * aplicación abierta, el reloj de cada minuto. Lo llama el trabajador del
 * servidor tras arrancar; las pruebas lo llaman a mano.
 */
function arrancarProgramador({ reloj = true, avisar, proximaCambio, cadaMs } = {}) {
    const programador = require('./programacion/programador');
    programador.configurar({ dbManager, avisar, proximaCambio });
    if (reloj && !programador.relojEnMarcha()) programador.arrancar({ cadaMs });
    // La primera vez, la tarea del sistema se pone al día con lo que haya.
    Promise.resolve(arranque).then(() => programador.anunciarProxima()).catch(() => {});
}

module.exports = { startServer, atenderOrden, arrancarProgramador };
// Trigger restart for Excel Import features
