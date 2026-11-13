/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dbManager        = require('./DatabaseManager');
const baseCentral      = require('./central/BaseCentral');
const secretos         = require('./secretos');
const manifiesto       = require('./manifiesto');
const contextoDeEjecucion = require('./ejecucion/ContextoDeEjecucion');
const workspaces       = require('./workspaces');
const hermanos         = require('./hermanos');
const entregas         = require('./entregas');
const fuentes          = require('./fuentes');
const medidas          = require('./medidas');
const dbtConvivir      = require('./dbtConvivir');
const llegadas         = require('./llegadas');
const procedencia      = require('./procedencia');
const descripciones    = require('./descripciones');
const dbtCorrer        = require('./dbt/correr');
const dbtEjecutar      = require('./dbt/ejecutar');
const dbtFuentes       = require('./dbt/fuentes');

/**
 * Mientras dbt tiene la base del proyecto (fase 2b), lo que la lea no puede
 * correr: se dice por qué en vez de dejar que el motor diga «schema user_db
 * does not exist». Devuelve true si ya respondió.
 */
function baseOcupadaPorDbt(res) {
    const p = dbManager.prestada;
    if (!p) return false;
    const hora = new Date(p.desde).toLocaleTimeString();
    res.status(409).json({
        error: `dbt is using ${path.basename(p.ruta)} (since ${hora}). AmoxSQL released it so dbt can write; queries run again as soon as dbt finishes.`,
        ocupadaPor: p.quien,
    });
    return true;
}
const lineaDeComandos  = require('./ejecucion/lineaDeComandos');
// La apertura de la base de AmoxSQL y del llavero (ver startServer).
let arranque = Promise.resolve();
const scaffolder       = require('./projectScaffolder');
const { applyRowLimit, TOPE_FILAS, TOPE_BYTES } = require('./_sqlUtils');
const { detectResultType } = require('./_sqlClassify');
const { crearVigilante, firmaDe } = require('./vigilanteArchivos');
const amoxvis = require('./amoxvis');
const borradores = require('./borradores');

const planDeEjecucion = require('./planDeEjecucion');
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
    console.error('[Server] Promesa rechazada sin manejar — el servidor sigue en pie:',
        reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Server] Excepcion no capturada — el servidor sigue en pie:',
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

// Track in-flight user queries for cancellation support
const activeQueries = new Map(); // queryId → { interrupt, cancelada, deFondo }

/**
 * Apunta una consulta cancelable y la ata a su respuesta.
 *
 * En `res` y no en `req`: en un POST, `req` se cierra en cuanto se ha leído el
 * cuerpo. Con `req` la consulta se borraba del registro nada más empezar, y Stop
 * respondía 404 sin interrumpir nada: el motor seguía ocupado hasta acabar.
 *
 * `cancelada` la mira quien está esperando su turno o convirtiendo filas, donde
 * interrumpir al motor no serviría de nada.
 */
function registrarConsulta(qid, res, { deFondo = false } = {}) {
    const registro = {
        deFondo,
        cancelada: false,
        interrupt() {
            this.cancelada = true;
            if (dbManager.isRunning('main', qid)) dbManager.interruptQuery('main');
        },
    };
    activeQueries.set(qid, registro);
    res.on('close', () => {
        if (activeQueries.get(qid) === registro && !res.writableFinished) registro.interrupt();
        activeQueries.delete(qid);
    });
    return registro;
}

/**
 * Lo que corre por su cuenta (perfil, totales de un gráfico) cede ante lo que pides.
 * Antes tu consulta esperaba detrás sin explicación: parecía que Run no funcionaba.
 */
function cancelarLoDeFondo() {
    let cuantas = 0;
    for (const r of activeQueries.values()) {
        if (r.deFondo && !r.cancelada) { r.interrupt(); cuantas++; }
    }
    return cuantas;
}

/**
 * El JSON de un resultado, a trozos. `res.json` lo escribía de una vez: el servidor
 * se quedaba sin atender a nadie, y por encima del medio GB, «Invalid string length».
 */
async function responderFilas(res, filas, resto) {
    const POR_TROZO = 5000;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.write('{"data":[');
    for (let i = 0; i < filas.length; i += POR_TROZO) {
        if (res.destroyed) return;
        const trozo = JSON.stringify(filas.slice(i, i + POR_TROZO)).slice(1, -1);
        const sigue = res.write((i > 0 ? ',' : '') + trozo);
        if (!sigue) await new Promise(r => { const fin = () => { res.off('drain', fin); res.off('close', fin); r(); }; res.on('drain', fin); res.on('close', fin); });
        else await new Promise(setImmediate);
    }
    res.end(`],${JSON.stringify(resto).slice(1)}`);
}

/* --- Project Management APIs --- */
app.get('/api/project/path', (req, res) => {
    res.json({ path: ROOT_DIR });
});

// Lo que sigue abierto aquí, para que una ventana recuperada vuelva a la sesión.
app.get('/api/sesion', (req, res) => {
    res.json({
        proyecto: PROYECTO_ABIERTO ? ROOT_DIR : null,
        base: dbManager.getCurrentPath(),
        soloLectura: !!dbManager._readOnly,
    });
});

app.post('/api/project/open', async (req, res) => {
    const { path: newPath } = req.body;
    if (!newPath) return res.status(400).json({ error: 'Path is required' });

    if (!fs.existsSync(newPath)) return res.status(404).json({ error: 'Path does not exist' });
    if (!fs.statSync(newPath).isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });

    try {
        // Abrir una carpeta ya NO toca el motor. En el modelo actual la sesion
        // empieza al elegir la base, y es connect() quien garantiza que arranca
        // limpia (ver DatabaseManager.hasSessionState). Reiniciar tambien aqui
        // era un resto del modelo viejo —workspace = carpeta, y cambiabas de base
        // dentro de la sesion— y costaba ~620 ms en cada apertura.

        // Las bases de trabajo de Data Flow que siguieran abiertas son del
        // proyecto que se deja: se sueltan, para no retener sus archivos.
        if (path.resolve(newPath) !== path.resolve(ROOT_DIR)) {
            contextoDeEjecucion.soltarTrabajos(ROOT_DIR).catch(() => {});
        }
        ROOT_DIR = newPath;
        process.chdir(ROOT_DIR);
        PROYECTO_ABIERTO = true;
        // La base de AmoxSQL anota que se abrió (y la ruta, si la carpeta se
        // movió). Sin esperar: abrir no depende de ella.
        // 5.14 (F5): la apertura ANTERIOR, para «Donde lo dejaste». registrar()
        // devuelve la fila de antes de anotar esta; recién creada, no hay anterior.
        aperturaAnterior = { ruta: ROOT_DIR, cuando: null, lista: false };
        const estaApertura = aperturaAnterior;
        baseCentral.abrir()
            .then(() => workspaces.registrar(ROOT_DIR, { abrir: true }))
            .then((r) => {
                const antes = r?.fila?.ultimo_abierto ? new Date(`${String(r.fila.ultimo_abierto).replace(' ', 'T')}Z`) : null;
                estaApertura.cuando = antes && Date.now() - antes.getTime() > 10000 ? antes : null;
                estaApertura.lista = true;
            })
            .then(() => workspaces.refrescarPolitica(ROOT_DIR))
            .catch(() => {});
        // Las fuentes del proyecto (C1): ya, sin esperar al registro. Lo que se
        // consulte de `fuentes.` mientras tanto espera a que termine.
        remontarFuentes();
        // El vigilante mira UNA raiz: al cambiar de proyecto hay que rearmarlo,
        // o seguiria avisando de los archivos del proyecto anterior.
        rearmarVigilante();
        console.log(`Project root changed to: ${ROOT_DIR}`);
        res.json({ success: true, path: ROOT_DIR });
    } catch (err) {
        console.error("Failed to change directory", err);
        res.status(500).json({ error: 'Failed to change directory', details: err.message });
    }
});

/* ─── Project Scaffolding ─── */

app.get('/api/project/scaffold-status', (req, res) => {
    try {
        const status = scaffolder.getScaffoldStatus(ROOT_DIR);
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/project/scaffold', (req, res) => {
    const { folders = [] } = req.body;
    try {
        const created = scaffolder.createFolders(ROOT_DIR, folders);
        res.json({ success: true, created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/project/config', (req, res) => {
    try {
        const config = scaffolder.getProjectConfig(ROOT_DIR);
        res.json({ config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/project/config', (req, res) => {
    const { updates } = req.body;
    if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'updates object required' });
    }
    try {
        const config = scaffolder.saveProjectConfig(ROOT_DIR, updates);
        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/project/folder-defs', (req, res) => {
    res.json({ folders: scaffolder.getFolderDefs() });
});

/* ─── Git ─── */
const gitManager = require('./git/gitManager');


app.get('/api/project/scan-dbs', (req, res) => {
    try {
        const files = fs.readdirSync(ROOT_DIR, { withFileTypes: true });
        // 6.0 (M1, F1): la última base que se usó en el proyecto va primero; los
        // respaldos de «Upgrade…» (`x.before-6.duckdb`) al final y marcados, para no
        // abrir la copia vieja sin querer. Un `.wal` no es una base: es su diario.
        const ultima = PROYECTO_ABIERTO ? (scaffolder.getProjectConfig(ROOT_DIR)?.ultimaBase || null) : null;
        const esRespaldo = (n) => /\.before-6(-\d+)?\.duckdb$/i.test(n);
        const rango = (f) => (f.name === ultima ? 0 : f.respaldo ? 2 : 1);
        const dbFiles = files
            .filter(file => file.isFile() && (file.name.endsWith('.duckdb') || file.name.endsWith('.db') || file.name.endsWith('.ducklake') || file.name.endsWith('.ducklake.sqlite')))
            .map(file => ({
                name: file.name,
                path: file.name, // Relative path from root is enough for now
                ...(esRespaldo(file.name) ? { respaldo: true } : {}),
                ...(file.name === ultima ? { ultima: true } : {}),
            }))
            .sort((a, b) => rango(a) - rango(b) || a.name.localeCompare(b.name));
        res.json(dbFiles);
    } catch (err) {
        res.status(500).json({ error: 'Failed to scan for databases', details: err.message });
    }
});

app.get('/api/files/list', (req, res) => {
    const relativePath = req.query.path || '';
    const dirPath = path.resolve(ROOT_DIR, relativePath);

    // Security check: Ensure we don't go above ROOT_DIR unless authorized (skipping complex checks for local tool)
    if (!dirPath.startsWith(ROOT_DIR)) {
        // Warning: This simplistic check might block valid sub-paths if ROOT_DIR has symlinks, 
        // but it's a basic safeguard.
    }

    try {
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
            return res.json([]);
        }

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            path: path.relative(ROOT_DIR, path.join(dirPath, entry.name)).replace(/\\/g, '/')
        }));

        // Sort: Directories first, then files
        result.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });

        res.json(result);
    } catch (err) {
        console.error("List files failed:", err);
        res.status(500).json({ error: 'Failed to list files', details: err.message });
    }
});

/* --- Database Management APIs --- */

app.post('/api/db/connect', async (req, res) => {
    const { path: dbPath, readOnly } = req.body;
    try {
        // 6.0: un lago de la 5.x se lee igual, pero la primera escritura lo deja sólo para
        // la 6. La cabecera se lee ANTES de adjuntarlo: abierto para escribir, el motor
        // tiene el archivo bloqueado (Windows).
        let aviso = null;
        if (!readOnly && typeof dbPath === 'string' && /\.ducklake$/i.test(dbPath)) {
            try { aviso = require('./lago').avisoDeFormato(path.isAbsolute(dbPath) ? dbPath : path.join(ROOT_DIR, dbPath)); } catch { /* sin aviso */ }
        }
        // 6.0 (O4): el formato del archivo, también antes de adjuntarlo.
        try {
            const r = typeof dbPath === 'string' && dbPath !== ':memory:' && !/\.ducklake(\.sqlite)?$/i.test(dbPath)
                ? (path.isAbsolute(dbPath) ? dbPath : path.join(ROOT_DIR, dbPath)) : null;
            require('./formatoDeBase').recordarAlAbrir(r && fs.existsSync(r) ? r : null);
        } catch { /* sin formato */ }
        await dbManager.connect(dbPath, ROOT_DIR, { readOnly: !!readOnly });
        // 6.0 (M1, F1): la base que se abre se recuerda en el proyecto: la próxima vez va primero.
        try {
            if (PROYECTO_ABIERTO && typeof dbPath === 'string' && dbPath !== ':memory:') {
                const rel = path.relative(ROOT_DIR, path.resolve(ROOT_DIR, dbPath));
                if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep)
                    && scaffolder.getProjectConfig(ROOT_DIR)?.ultimaBase !== rel) {
                    scaffolder.saveProjectConfig(ROOT_DIR, { ultimaBase: rel });
                }
            }
        } catch { /* recordarla no es crítico */ }

        // Initialize AI persistence schema for this project's database.
        // Skipped for DuckLake: the amoxsql_ai / amoxsql_chains bookkeeping
        // schemas belong to AmoxSQL, not to the user's lakehouse — writing them
        // into a .ducklake would pollute the versioned data lake. In DuckLake
        // mode, AI conversations and chain history simply don't persist across
        // sessions (queries and the AI assistant still work fully).
        if (!readOnly && !dbManager.isDuckLake) {
            try {
                const aiPersistence = require('./ai/persistence');
                await aiPersistence.initSchema(dbManager);
            } catch (aiErr) {
                console.warn('[AI] Schema init warning (non-fatal):', aiErr.message);
            }
            // El historial de Data Flow ya no se crea aquí: desde la 5.9 vive en
            // la base de AmoxSQL (server/ejecucion/historial.js). El que la 5.8
            // dejó en la del proyecto se sigue leyendo, sin tocarlo.
        }

        res.json({ success: true, path: dbManager.getCurrentPath(), ...(aviso ? { aviso } : {}) });

        // Las extensiones se calientan DESPUES de responder: el usuario ya esta
        // entrando al IDE mientras se cargan. Aqui es el unico punto donde de
        // verdad no queda SQL del arranque por delante — los LOAD van por la
        // conexion 'main' y DuckDB serializa sus sentencias, asi que lanzarlas
        // antes solo movia la espera a lo siguiente de la cola.
        dbManager.warmExtensions();
        remontarFuentes();
    } catch (err) {
        console.error("DB Connection Failed:", err);
        res.status(500).json({ error: 'Failed to connect to database', details: err.message });
    }
});

// API: Explicitly Close Database (Reset to Memory)
app.post('/api/db/close', async (req, res) => {
    try {
        await dbManager.close();
        res.json({ success: true, message: 'Database closed, reset to :memory:' });
    } catch (err) {
        console.error("DB Close Failed:", err);
        res.status(500).json({ error: 'Failed to close database', details: err.message });
    }
});

app.get('/api/db/location', (req, res) => {
    res.json({ path: dbManager.getCurrentPath() });
});

app.get('/api/db/version', async (req, res) => {
    try {
        const rows = await dbManager.systemQuery('SELECT version() as version');
        res.json({ version: rows[0]?.version || 'N/A' });
    } catch (e) {
        res.json({ version: 'N/A' });
    }
});

app.get('/api/db/tables', async (req, res) => {
    try {
        // 6.0 (M1, F11): una consulta con JOIN, no una por tabla (con 200 tablas eran 201
        // consultas cada vez que se abría un editor).
        const filas = await dbManager.systemQuery(
            `SELECT t.table_catalog, t.table_schema, t.table_name, t.table_type, c.column_name, c.data_type
             FROM ${esquemas.TABLAS} t
             LEFT JOIN ${esquemas.COLUMNAS} c
                    ON c.table_catalog = t.table_catalog AND c.table_schema = t.table_schema AND c.table_name = t.table_name
             WHERE ${userTablesWhereClause('t.table_schema', 't.table_name')}
             ORDER BY t.table_schema, t.table_name, c.ordinal_position`,
            { lane: 'meta' }
        );
        const porTabla = new Map();
        for (const f of filas) {
            const k = `${f.table_catalog} ${f.table_schema} ${f.table_name}`;
            if (!porTabla.has(k)) porTabla.set(k, { name: f.table_name, schema: f.table_schema, type: f.table_type, columns: [] });
            if (f.column_name) porTabla.get(k).columns.push({ column_name: f.column_name, data_type: f.data_type });
        }
        res.json([...porTabla.values()]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tables', details: err.message });
    }
});

// Schema-aware endpoint: returns hierarchy { schema → tables → columns }
app.get('/api/db/schemas', async (req, res) => {
    try {
        // Single JOIN query instead of N+1 per-table queries
        const rows = await dbManager.systemQuery(
            `SELECT t.table_schema, t.table_name, t.table_type,
                    c.column_name, c.data_type
             FROM ${esquemas.TABLAS} t
             LEFT JOIN ${esquemas.COLUMNAS} c
                    ON c.table_catalog = t.table_catalog AND c.table_schema = t.table_schema AND c.table_name = t.table_name
             WHERE ${userTablesWhereClause('t.table_schema', 't.table_name')}
             ORDER BY t.table_schema, t.table_name, c.ordinal_position`,
            { lane: 'meta' }
        );

        const schemaMap = {};
        for (const row of rows) {
            if (!schemaMap[row.table_schema]) {
                schemaMap[row.table_schema] = { schema: row.table_schema, tables: {} };
            }
            const tables = schemaMap[row.table_schema].tables;
            if (!tables[row.table_name]) {
                tables[row.table_name] = { name: row.table_name, type: row.table_type, columns: [] };
            }
            if (row.column_name) {
                tables[row.table_name].columns.push({ column_name: row.column_name, data_type: row.data_type });
            }
        }

        // 6.0 (O3): los esquemas vacíos también (uno recién creado, o el padre de uno
        // anidado que sólo tiene subesquemas), de la base abierta.
        try {
            const vacios = await dbManager.systemQuery(
                `SELECT schema_name AS table_schema, '' AS table_name FROM ${esquemas.ESQUEMAS} AS s
                 WHERE catalog_name = current_database() AND schema_name <> 'main' AND ${userTablesWhereClause('table_schema', 'table_name').replace(/table_catalog/g, 'catalog_name')}`,
                { lane: 'meta' });
            for (const v of vacios) if (!schemaMap[v.table_schema]) schemaMap[v.table_schema] = { schema: v.table_schema, tables: {} };
        } catch { /* sólo los que tienen tablas */ }

        // De dónde salió cada tabla (C5): su procedencia y si el archivo cambió.
        let origenes = {};
        try { origenes = await procedencia.deLasTablas(dbManager.lane('meta')); } catch { /* sin procedencias */ }
        // 5.12 (I5): lo que dice cada tabla y cada columna (comentarios, o dbt).
        let desc = {};
        try { desc = await descripciones.deLaBase(dbManager, { raiz: PROYECTO_ABIERTO ? ROOT_DIR : null, attachedPath: dbManager.attachedPath }); } catch { /* sin descripciones */ }
        const result = Object.values(schemaMap).map(s => ({
            schema: s.schema,
            tables: Object.values(s.tables).map(t => {
                const k = `${s.schema}.${t.name}`;
                const d = desc[k];
                const conDesc = d ? { ...t, descripcion: d.descripcion || null, descripcionDe: d.de, columns: t.columns.map(c => (d.columnas[c.column_name] ? { ...c, descripcion: d.columnas[c.column_name] } : c)) } : t;
                return origenes[k] ? { ...conDesc, procedencia: origenes[k] } : conDesc;
            }),
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch schemas', details: err.message });
    }
});

// ER Diagram schema — enriched with constraints
app.get('/api/db/er-schema', async (req, res) => {
    try {
        // Optional: restrict the diagram to a single schema
        const { schema } = req.query;
        const schemaFilter = schema ? ` AND t.table_schema = '${String(schema).replace(/'/g, "''")}'` : '';
        // 1. Get tables + columns in a single JOIN query
        const rows = await dbManager.systemQuery(
            `SELECT t.table_schema, t.table_name, t.table_type,
                    c.column_name, c.data_type, c.is_nullable, c.column_default
             FROM ${esquemas.TABLAS} t
             LEFT JOIN ${esquemas.COLUMNAS} c
                    ON c.table_catalog = t.table_catalog AND c.table_schema = t.table_schema AND c.table_name = t.table_name
             WHERE ${userTablesWhereClause('t.table_schema', 't.table_name')}${schemaFilter}
               AND t.table_catalog <> 'temp'   -- las vistas que deja cada celda del cuaderno no son el modelo
             ORDER BY t.table_schema, t.table_name, c.ordinal_position`
        );

        // Build table map from flat rows
        const tableMap = {};
        for (const row of rows) {
            const key = `${row.table_schema}.${row.table_name}`;
            if (!tableMap[key]) {
                tableMap[key] = {
                    name: row.table_name,
                    schema: row.table_schema,
                    type: row.table_type,
                    columns: [],
                };
            }
            if (row.column_name) {
                tableMap[key].columns.push({
                    column_name: row.column_name,
                    data_type: row.data_type,
                    is_nullable: row.is_nullable,
                    column_default: row.column_default,
                });
            }
        }

        // 2. PK/FK de todas las tablas en una consulta. information_schema no trae la
        //    tabla a la que apunta una FK en DuckDB (constraint_column_usage sale vacía),
        //    así que el diagrama nunca dibujaba una relación; duckdb_constraints() sí.
        let todas = [];
        try {
            todas = await dbManager.systemQuery(
                `SELECT schema_name, table_name, constraint_type, constraint_column_names AS cols,
                        referenced_table, referenced_column_names AS ref_cols
                 FROM duckdb_constraints()
                 WHERE constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')`
            );
        } catch (e) { /* sin restricciones: el diagrama sale sin llaves */ }
        const result = [];
        for (const entry of Object.values(tableMap)) {
            const constraints = [];
            // duckdb_constraints() da el último nombre del esquema (sin el padre).
            const hoja = esquemas.partes(entry.schema).pop();
            for (const c of todas.filter(x => x.table_name === entry.name && x.schema_name === hoja)) {
                const cols = Array.isArray(c.cols) ? c.cols : [];
                const refs = Array.isArray(c.ref_cols) ? c.ref_cols : [];
                cols.forEach((col, i) => constraints.push({
                    constraint_type: c.constraint_type, column_name: col,
                    foreign_table_name: c.referenced_table || null, foreign_column_name: refs[i] || refs[0] || null,
                }));
            }

            const pkColumns = new Set(constraints.filter(c => c.constraint_type === 'PRIMARY KEY').map(c => c.column_name));
            const fkMap = {};
            for (const c of constraints.filter(c => c.constraint_type === 'FOREIGN KEY')) {
                fkMap[c.column_name] = { table: c.foreign_table_name, column: c.foreign_column_name };
            }

            result.push({
                name: entry.name,
                schema: entry.schema,
                type: entry.type,
                columns: entry.columns.map(c => ({
                    name: c.column_name,
                    type: c.data_type,
                    nullable: c.is_nullable === 'YES',
                    isPK: pkColumns.has(c.column_name),
                    fk: fkMap[c.column_name] || null,
                })),
            });
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch ER schema', details: err.message });
    }
});

app.get('/api/db/file-schema', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path required' });

        let fullSourcePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
        fullSourcePath = fullSourcePath.replace(/\\/g, '/');

        const describe = await dbManager.systemQuery(`DESCRIBE SELECT * FROM '${fullSourcePath.replace(/'/g, "''")}'`, { lane: 'meta' });
        res.json(describe);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch file schema', details: err.message });
    }
});

app.get('/api/db/history', async (req, res) => {
    try {
        // Deliver any batched-but-unflushed entries so the panel is never stale
        await dbManager.flushQueryHistory?.();
        // Check if history table exists first to avoid error
        const check = await dbManager.systemQuery("SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'amoxsql_ai' AND table_name = 'query_history'");
        if (check[0].cnt == 0) {
            return res.json([]);
        }

        const history = await dbManager.systemQuery("SELECT * FROM amoxsql_ai.query_history ORDER BY executed_at DESC LIMIT 1000");
        res.json(history);
    } catch (err) {
        console.error("Failed to fetch history:", err);
        res.status(500).json({ error: 'Failed to fetch history', details: err.message });
    }
});

// POST /api/db/describe — resolve the OUTPUT columns of an arbitrary SELECT/WITH query
// without executing it. DuckDB's DESCRIBE only binds/plans the query, so this is cheap and
// side-effect-free. The editor uses it to suggest columns of CTEs / subqueries that the
// syntactic (tree-sitter) analyzer cannot compute (e.g. `SELECT a+b AS total`).
app.post('/api/db/describe', async (req, res) => {
    const { sql } = req.body || {};
    if (!sql || typeof sql !== 'string') {
        return res.status(400).json({ columns: [], error: 'sql required' });
    }

    // Read-only guard: a single SELECT / WITH…SELECT probe only. Strip comments, then reject
    // DDL/DML and multi-statement payloads.
    const stripped = sql
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .trim()
        .replace(/;\s*$/, '');
    const head = (stripped.match(/^[a-zA-Z]+/) || [''])[0].toUpperCase();
    if (head !== 'SELECT' && head !== 'WITH') {
        return res.status(400).json({ columns: [], error: 'only SELECT/WITH allowed' });
    }
    if (stripped.includes(';')) {
        return res.status(400).json({ columns: [], error: 'single statement only' });
    }

    // DESCRIBE never hangs in practice, but guard anyway so a pathological probe can't stall
    // the editor's completion request.
    const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error('describe timeout')), ms)),
    ]);

    try {
        // 'meta' lane: keeps editor autocomplete responsive even while a long
        // user query occupies the 'main' connection.
        const rows = await withTimeout(dbManager.systemQuery(`DESCRIBE ${stripped}`, { lane: 'meta' }), 1500);
        const columns = (rows || []).map(c => ({ name: c.column_name, type: c.column_type }));
        res.json({ columns });
    } catch (err) {
        // Invalid / mid-typing query → empty result; the editor falls back to its heuristics.
        res.json({ columns: [], error: err?.message || String(err) });
    }
});

// The plan viewer's shape comes from server/planDeEjecucion.js (Dec-65).
// POST /api/db/explain — query plan for the editor's plan viewer.
//  · mode='explain'  → EXPLAIN (FORMAT json): the ESTIMATED plan, does NOT run the query.
//  · mode='analyze'  → EXPLAIN (ANALYZE, FORMAT json): runs the query and returns REAL per-operator
//    timing + cardinality (returns only the plan, not the result set).
// ANALYZE executes the query, so it is gated to read-only statements; otherwise it falls back to explain.
app.post('/api/db/explain', async (req, res) => {
    const { query, mode = 'analyze' } = req.body || {};
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query required' });
    }

    const headMatch = query
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .trim()
        .match(/^[a-zA-Z]+/);
    const isReadOnly = !!headMatch && /^(SELECT|WITH|TABLE|FROM|VALUES|PIVOT|UNPIVOT|DESCRIBE|SUMMARIZE)$/i.test(headMatch[0]);

    let effectiveMode = mode === 'analyze' ? 'analyze' : 'explain';
    let note = null;
    if (effectiveMode === 'analyze' && !isReadOnly) {
        effectiveMode = 'explain';
        note = 'Analyze runs the query — only available for read-only statements (SELECT/WITH). Showing the estimated plan.';
    }

    const explainSql = effectiveMode === 'analyze'
        ? `EXPLAIN (ANALYZE, FORMAT json) ${query}`
        : `EXPLAIN (FORMAT json) ${query}`;

    try {
        // DuckDB 2 returns the planner phases with every ANALYZE: no profiling_mode (which in 2.0
        // left profiling switched on for the connection).
        const rows = await dbManager.systemQuery(explainSql);
        const { plan, metrics } = planDeEjecucion.normalizar(planDeEjecucion.deFilas(rows), effectiveMode);
        if (!plan) return res.status(400).json({ error: 'Could not parse the execution plan.' });
        res.json({ mode: effectiveMode, plan, metrics, note });
    } catch (err) {
        res.status(400).json({ error: err?.message || String(err) });
    }
});

app.post('/api/db/table-details', async (req, res) => {
    const { tableName, schema, limit = 100, offset = 0 } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Table name required' });

    // Schema-qualified reference — handles tables in non-default schemas (e.g. main_gold)
    const ref = esquemas.referencia(schema, tableName);

    try {
        // 1. Schema & Metadata
        // DuckDB 'DESCRIBE' gives column_name, column_type, null, key, default, extra
        const describe = await dbManager.systemQuery(`DESCRIBE ${ref}`);

        // 2. Row Count (Estimated or Exact)
        const countRes = await dbManager.systemQuery(`SELECT COUNT(1) as count FROM ${ref}`);
        const totalRows = countRes[0].count; // Serialized as string or number

        // 3. Preview Data
        const preview = await dbManager.systemQuery(`SELECT * FROM ${ref} LIMIT ${limit} OFFSET ${offset}`);

        // 4. DDL — reconstructed from the column schema.
        // DuckDB has no `sqlite_master` and no `SHOW CREATE TABLE`, so we rebuild
        // the CREATE statement from the DESCRIBE result we already fetched.
        let ddl = '';
        try {
            const colDefs = describe.map(c => `    "${c.column_name}" ${c.column_type}`).join(',\n');
            ddl = `CREATE TABLE ${ref} (\n${colDefs}\n);`;
        } catch (e) {
            console.warn("DDL reconstruction failed", e);
            ddl = `-- Could not reconstruct DDL for ${tableName}`;
        }

        // 5. Data Profile (SUMMARIZE)
        // DuckDB SUMMARIZE returns: column_name, column_type, min, max, approx_unique, avg, std, q25, q50, q75, count, null_percentage
        let profile = [];
        try {
            profile = await dbManager.systemQuery(`SUMMARIZE ${ref}`);
        } catch (e) {
            console.warn("Profile generation failed", e);
        }

        res.json({
            tableName,
            schema: describe,
            totalRows,
            preview,
            ddl,
            profile // New field
        });

    } catch (err) {
        console.error("Table details fetch failed:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/db/import', async (req, res) => {
    const { filePath, tableName, cleanColumns, schema, comoVariant } = req.body;

    if (!filePath || !tableName) return res.status(400).json({ error: 'File path and table name required' });

    // Optional target schema — create it if needed and qualify the new table
    const target = schema && schema !== 'main' ? esquemas.referencia(schema, tableName) : esquemas.referencia(null, tableName);

    let fullSourcePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    fullSourcePath = fullSourcePath.replace(/\\/g, '/');

    console.log(`[DEBUG] Import Request:`, { filePath, fullSourcePath, hasWildcard: fullSourcePath.includes('*'), exists: fs.existsSync(fullSourcePath) });

    if (!fullSourcePath.includes('*') && !fs.existsSync(fullSourcePath)) {
        return res.status(404).json({ error: `File not found on server: ${fullSourcePath}` });
    }

    try {
        if (schema && schema !== 'main') {
            // Un esquema anidado (`ventas.crudo`) se crea nivel a nivel.
            const niveles = esquemas.partes(schema);
            for (let i = 1; i <= niveles.length; i++) await dbManager.systemQuery(`CREATE SCHEMA IF NOT EXISTS ${esquemas.citarRuta(niveles.slice(0, i).map(n => `"${n.replace(/"/g, '""')}"`).join('.'))}`);
        }
        if (comoVariant) {
            // 6.0 (O5): each record as it is, in one VARIANT column (`datos`): no fixed
            // columns, so records with different fields don't fail or turn into NULL columns.
            const lit = fullSourcePath.replace(/'/g, "''");
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE ${target} AS SELECT json::VARIANT AS datos FROM read_json_objects('${lit}', format = 'auto')`);
        } else if (cleanColumns) {
            const describe = await dbManager.systemQuery(`DESCRIBE SELECT * FROM '${fullSourcePath.replace(/'/g, "''")}'`);
            const selectParts = describe.map(col => {
                const oldName = col.column_name;
                const newName = oldName.trim().replace(/\s+/g, '_');
                return `"${oldName}" AS "${newName}"`;
            }).join(', ');
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE ${target} AS SELECT ${selectParts} FROM '${fullSourcePath.replace(/'/g, "''")}'`);
        } else {
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE ${target} AS SELECT * FROM '${fullSourcePath.replace(/'/g, "''")}'`);
        }
        // De dónde salió (C5): el archivo, su tamaño y su fecha, en el comentario de la tabla.
        await procedencia.anotar(dbManager, target, { origen: 'importar', archivos: procedencia.expandir(fullSourcePath) });

        // Force flush of WAL file to avoid locks
        await dbManager.checkpoint();

        res.json({ success: true, table: tableName, schema: schema || 'main' });
    } catch (err) {
        console.error("Import Error:", err);
        let errorMsg = err.message;
        if (errorMsg.includes('No files found')) {
            errorMsg = "DuckDB could not find any files matching the pattern.";
        }
        res.status(500).json({ error: 'Import failed in DB engine', details: errorMsg });
    }
});

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
        console.warn('[Extensions] Could not persist autoload extension:', e.message);
    }
}
function removeAutoloadExtension(name) {
    try {
        const cfg = aiManager.getConfig();
        const list = Array.isArray(cfg.extensions) ? cfg.extensions : [];
        cfg.extensions = list.filter(n => n !== name);
        aiManager.saveConfig(cfg);
    } catch (e) {
        console.warn('[Extensions] Could not remove autoload extension:', e.message);
    }
}

app.get('/api/db/extensions', async (req, res) => {
    try {
        const extensions = await dbManager.systemQuery('SELECT * FROM duckdb_extensions()');
        res.json(extensions);
    } catch (err) {
        console.error("Failed to fetch extensions:", err);
        res.status(500).json({ error: 'Failed to fetch extensions', details: err.message });
    }
});

// Names of extensions set to auto-load on startup (drives the "Remove from
// startup" affordance in the client).
app.get('/api/db/extensions/autoload', (req, res) => {
    res.json({ names: getAutoloadExtensions() });
});

app.post('/api/db/extensions/install', async (req, res) => {
    const { name, fromCommunity = false } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });

    // Allow alphanumeric, underscores, and hyphens (some community exts use hyphens)
    const safeName = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    // A community-only extension returns "HTTP 404" from the official repo —
    // indistinguishable by message from a genuinely platform-unavailable one.
    // The only way to tell them apart is to actually try the community repo, so
    // do that transparently here (server-side) instead of a client round-trip.
    let triedCommunity = fromCommunity;
    try {
        try {
            await dbManager.systemQuery(`INSTALL ${safeName}${fromCommunity ? ' FROM community' : ''}`);
        } catch (installErr) {
            const looksMissing = /HTTP 404|not found|does not exist|no extension/i.test(installErr.message);
            if (!fromCommunity && looksMissing) {
                triedCommunity = true;
                await dbManager.systemQuery(`INSTALL ${safeName} FROM community`);
            } else {
                throw installErr;
            }
        }
        await dbManager.systemQuery(`LOAD ${safeName}`);
        dbManager.rememberExtension(safeName);
        addAutoloadExtension(safeName);
        anotarExtensionDelProyecto(safeName);
        res.json({
            success: true,
            message: `Extension '${safeName}' installed and loaded.`,
            fromCommunity: triedCommunity,
        });
    } catch (err) {
        console.error(`Failed to install extension '${safeName}':`, err);
        // HTTP 404 after we've already tried community = not compiled for this
        // DuckDB version/platform.
        const isPlatformUnavailable = /HTTP 404/.test(err.message);
        const urlMatch = err.message.match(/(?:community-)?extensions\.duckdb\.org\/([^/]+)\/([^/]+)\//);
        res.status(500).json({
            error: `Failed to install extension '${safeName}'`,
            details: err.message,
            // The server already exhausted the community fallback, so there is
            // nothing left for the client to retry.
            canRetryFromCommunity: false,
            platformUnavailable: isPlatformUnavailable,
            duckdbVersion: urlMatch?.[1] ?? null,
            platform: urlMatch?.[2] ?? null,
        });
    }
});

app.post('/api/db/extensions/load', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });

    const safeName = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    try {
        await dbManager.systemQuery(`LOAD ${safeName}`);
        dbManager.rememberExtension(safeName);
        addAutoloadExtension(safeName);
        anotarExtensionDelProyecto(safeName);
        const rows = await dbManager.systemQuery(
            `SELECT * FROM duckdb_extensions() WHERE extension_name = '${safeName}'`
        );
        res.json({ success: true, extension: rows[0] || null });
    } catch (err) {
        console.error(`Failed to load extension '${safeName}':`, err);
        res.status(500).json({ error: `Failed to load extension '${safeName}'`, details: err.message });
    }
});

// Stop auto-loading an extension on startup. It stays loaded in the current
// session (DuckDB has no clean per-connection UNLOAD); this only removes it from
// the persisted autoload list so it won't come back next launch.
app.post('/api/db/extensions/forget', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Extension name is required' });
    const safeName = String(name).trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) return res.status(400).json({ error: 'Invalid extension name' });

    dbManager.forgetExtension(safeName);
    removeAutoloadExtension(safeName);
    res.json({ success: true, message: `'${safeName}' removed from startup auto-load.` });
});


/* --- Excel Import APIs --- */
const xlsxMeta = require('./xlsxMeta');
const excel = require('./excel');

/** La ruta de un archivo que llega del cliente: absoluta, o relativa al proyecto. */
const rutaDelProyecto = (r) => (path.isAbsolute(String(r)) ? String(r) : path.join(ROOT_DIR, String(r)));

/** Responder un error de Excel: 422 con su código si es de los que se explican. */
function errorDeExcel(res, err) {
    if (err instanceof excel.ErrorDeExcel) return res.status(err.codigo === 'no_existe' ? 404 : 422).json({ error: err.message, codigo: err.codigo });
    return res.status(500).json({ error: String(err?.message || err).split('\n')[0] });
}

app.get('/api/files/inspect-excel', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });
    try {
        // Las hojas salen del directorio central del ZIP (xlsxMeta); lo que no
        // es un libro se reconoce por su firma y dice qué es (C2).
        res.json({ sheets: excel.hojas(rutaDelProyecto(filePath)) });
    } catch (err) {
        errorDeExcel(res, err);
    }
});

// ─── El Excel tal como llega (C2, 5.10) ─────────────────────────────────────

/** Las primeras filas de una hoja, como texto, con letras y números de fila. */
app.get('/api/excel/vista', async (req, res) => {
    try {
        const ruta = rutaDelProyecto(req.query.path || '');
        res.json(await excel.vistaCruda(dbManager.lane('meta'), ruta, { hoja: req.query.hoja || null }));
    } catch (err) {
        errorDeExcel(res, err);
    }
});

/** Leer con unas opciones, sin guardar nada: columnas con su tipo y unas filas. */
app.post('/api/excel/probar', async (req, res) => {
    try {
        const ruta = rutaDelProyecto(req.body?.path || '');
        const opciones = excel.normalizarOpciones(req.body?.opciones);
        res.json(await excel.probar(dbManager.lane('meta'), ruta, opciones));
    } catch (err) {
        errorDeExcel(res, err);
    }
});

/** Lo que hay en una plantilla de Excel (5.11, D3): hojas, y tablas con sus columnas. */
app.get('/api/excel/plantilla', (req, res) => {
    try {
        const ruta = rutaDelProyecto(req.query.path || '');
        if (!fs.existsSync(ruta)) return res.status(404).json({ error: `The template does not exist: ${req.query.path}` });
        res.json(require('./xlsxPlantilla').describirPlantilla(ruta));
    } catch (err) {
        res.status(400).json({ error: `The template could not be read as a workbook: ${err.message}. Save it as .xlsx in Excel.` });
    }
});

/** Cómo se leyó este archivo la última vez en este proyecto (2.5). */
app.get('/api/excel/recordado', (req, res) => {
    if (!PROYECTO_ABIERTO) return res.json({ opciones: null });
    res.json({ opciones: excel.recordado(ROOT_DIR, rutaDelProyecto(req.query.path || '')) });
});

/**
 * GET /api/files/inspect-columns
 * Returns column names and types for any data file (CSV, Parquet, JSON, Excel).
 * For Excel files, also returns sheet names and columns per sheet.
 * Query params: path (required), sheet (optional, for Excel)
 */
app.get('/api/files/inspect-columns', async (req, res) => {
    const filePath = req.query.path;
    const sheet = req.query.sheet; // optional, for Excel
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    fullPath = fullPath.replace(/\\/g, '/');

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    const ext = (fullPath.match(/\.[^.]+$/) || [''])[0].toLowerCase();

    // Metadata runs on the 'meta' lane so it never queues behind a long user
    // query on the 'main' connection. See docs/dev/auditoria_metadata_archivos.md.
    const meta = dbManager.lane ? dbManager.lane('meta') : dbManager;

    try {
        if (ext === '.xlsx' || ext === '.xls') {
            // Serve from cache when the file is unchanged (covers Direct Query →
            // Import → Export-for-AI on the same file paying the cost once).
            const cached = xlsxMeta.getCached(fullPath);
            if (cached && cached.sheetsWithColumns) {
                const target = sheet || cached.sheets[0];
                return res.json({
                    sheets: cached.sheets,
                    columns: cached.sheetsWithColumns[target] || [],
                    sheetsWithColumns: cached.sheetsWithColumns,
                });
            }

            // Sheet names via the zip central directory (no full workbook parse).
            const sheets = excel.hojas(fullPath);

            // DESCRIBE every sheet once (bind is early-stopping, ~ms per sheet).
            // The target sheet is included here — no separate/duplicate describe.
            const sheetsWithColumns = {};
            for (const s of sheets) {
                try {
                    const desc = await meta.systemQuery(
                        `DESCRIBE ${excel.sqlDeLectura(fullPath, { hoja: s })}`
                    );
                    sheetsWithColumns[s] = desc.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
                } catch (e) {
                    console.warn(`[inspect-columns] Failed to describe Excel sheet '${s}':`, e.message);
                    sheetsWithColumns[s] = [];
                }
            }

            const targetSheet = sheet || sheets[0];
            const columns = sheetsWithColumns[targetSheet] || [];

            xlsxMeta.setCached(fullPath, { ...(xlsxMeta.getCached(fullPath) || {}), sheets, sheetsWithColumns });
            res.json({ sheets, columns, sheetsWithColumns });
        } else {
            // CSV, Parquet, JSON — DuckDB DESCRIBE (sniffer samples; already cheap)
            const describe = await meta.systemQuery(`DESCRIBE SELECT * FROM '${fullPath}'`);
            const columns = describe.map(c => ({ name: c.column_name, type: c.column_type || c.data_type }));
            res.json({ columns });
        }
    } catch (err) {
        console.error('[inspect-columns] Error:', err);
        res.status(500).json({ error: 'Failed to inspect columns', details: err.message });
    }
});

app.post('/api/db/import-excel', async (req, res) => {
    // mode: 'MERGE' (una tabla, columna _hoja) | 'INDIVIDUAL' (una tabla por hoja).
    // Las opciones de lectura (rango, encabezado, rellenar, limpiar nombres) son
    // las mismas para todas las hojas elegidas: es lo normal en un libro con una
    // hoja por mes. Ya no hace falta cargar ninguna extensión aparte (prueba 0.2).
    const { filePath, mode, sheets, tableName } = req.body || {};
    if (!filePath || (!req.body?.comoCsv && (!Array.isArray(sheets) || sheets.length === 0))) {
        return res.status(400).json({ error: 'File path and sheets are required' });
    }
    try {
        const ruta = rutaDelProyecto(filePath);
        // Un CSV con extensión .xlsx (pasa: 2 de 25 en el disco del autor). El
        // diálogo lo reconoce y ofrece leerlo como lo que es.
        if (req.body.comoCsv) {
            if (!tableName) return res.status(400).json({ error: 'Table name required' });
            await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${String(tableName).replace(/"/g, '""')}" AS SELECT * FROM read_csv('${ruta.split(path.sep).join('/').replace(/'/g, "''")}', auto_detect = true)`);
            await procedencia.anotar(dbManager, `"${String(tableName).replace(/"/g, '""')}"`, { origen: 'importar', archivos: [ruta] });
            await dbManager.checkpoint();
            return res.json({ success: true, summary: `Read as CSV into "${tableName}"` });
        }
        excel.comprobarLibro(ruta);
        const opciones = excel.normalizarOpciones({ ...(req.body.opciones || {}), normalizar: req.body.opciones?.normalizar ?? req.body.cleanColumns });
        const summary = [];
        if (mode === 'MERGE') {
            if (!tableName) return res.status(400).json({ error: 'Table name required for MERGE mode' });
            const sql = excel.sqlDeLectura(ruta, { ...opciones, hojas: sheets });
            try { await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${String(tableName).replace(/"/g, '""')}" AS ${sql}`); }
            catch (e) { throw excel.explicar(e, ruta); }
            await procedencia.anotar(dbManager, `"${String(tableName).replace(/"/g, '""')}"`, {
                origen: 'importar', archivos: [ruta], hoja: sheets.length === 1 ? sheets[0] : null, hojas: sheets, rango: opciones.rango || null,
            });
            summary.push(sheets.length > 1
                ? `Merged ${sheets.length} sheets into "${tableName}" (the _hoja column says which sheet each row came from)`
                : `Created table "${tableName}" from sheet "${sheets[0]}"`);
        } else {
            for (const sheet of sheets) {
                const nombre = sheet.replace(/[^a-zA-Z0-9_]/g, '_');
                try { await dbManager.systemQuery(`CREATE OR REPLACE TABLE "${nombre}" AS ${excel.sqlDeLectura(ruta, { ...opciones, hoja: sheet })}`); }
                catch (e) { throw excel.explicar(e, ruta); }
                await procedencia.anotar(dbManager, `"${nombre}"`, { origen: 'importar', archivos: [ruta], hoja: sheet, rango: opciones.rango || null });
                summary.push(`Created table "${nombre}" from sheet "${sheet}"`);
            }
        }
        await dbManager.checkpoint();
        // La próxima vez sale ya elegido, y Data Flow lo usa (2.5).
        if (PROYECTO_ABIERTO) {
            try { excel.recordar(ROOT_DIR, ruta, { ...opciones, hojas: sheets.length > 1 ? sheets : undefined, hoja: sheets.length === 1 ? sheets[0] : undefined }); }
            catch (e) { console.warn('[Excel] No se pudo recordar la lectura:', e.message); }
        }
        res.json({ success: true, summary: summary.join('\n') });
    } catch (err) {
        console.error('Excel Import Error:', err?.message || err);
        errorDeExcel(res, err);
    }
});

const aiManager = require('./AiManager');


app.get('/api/settings/config', (req, res) => {
    try {
        const config = aiManager.getConfig();
        // Desde la 5.9 el renderer no recibe ni un secreto: ve SENTINELA donde
        // hay algo guardado (ver server/secretos.js).
        res.json(secretos.configParaElCliente(config));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings/config', async (req, res) => {
    const { geminiApiKey, anthropicApiKey, minimaxApiKey, gcpProject, gcpLocation, provider, defaultModel, s3Config, gcsConfig, experimental, modelTierOverrides, geminiModels,
        ollamaKeepAlive, ollamaNumCtx, memoryExtraction, ollamaThinkOverrides, modelPerMode,
        duckdbDocsUpdate, duckdbDocsIntervalDays } = req.body;
    try {
        const config = aiManager.getConfig();
        // Claves de IA y de la nube: al llavero (o a config en modo texto).
        await secretos.aplicarCambiosDeConfig(config, { geminiApiKey, anthropicApiKey, minimaxApiKey, s3Config, gcsConfig });
        if (gcpProject      !== undefined) config.gcpProject      = gcpProject;
        if (gcpLocation     !== undefined) config.gcpLocation     = gcpLocation || 'us-central1';
        if (provider        !== undefined) config.provider        = provider;
        if (defaultModel    !== undefined) config.defaultModel    = defaultModel;
        if (experimental  !== undefined) {
            config.experimental = { ...config.experimental, ...experimental };
        }
        if (modelTierOverrides !== undefined) {
            config.modelTierOverrides = modelTierOverrides;
            // Sync with modelProfiles module immediately
            const { setUserTierOverrides } = require('./ai/modelProfiles');
            setUserTierOverrides(modelTierOverrides);
        }
        if (geminiModels !== undefined) {
            config.geminiModels = geminiModels;
        }
        // ── AI local performance settings (F1/F4/F5/F6) ──
        let syncRuntime = false;
        if (ollamaKeepAlive     !== undefined) { config.ollamaKeepAlive     = ollamaKeepAlive || '4h'; syncRuntime = true; }
        if (ollamaNumCtx        !== undefined) { config.ollamaNumCtx        = Number(ollamaNumCtx) || 0; syncRuntime = true; }
        if (ollamaThinkOverrides !== undefined) { config.ollamaThinkOverrides = ollamaThinkOverrides || {}; syncRuntime = true; }
        if (memoryExtraction    !== undefined) config.memoryExtraction    = memoryExtraction;
        if (modelPerMode        !== undefined) config.modelPerMode        = { ...config.modelPerMode, ...modelPerMode };
        if (duckdbDocsUpdate       !== undefined) config.duckdbDocsUpdate       = duckdbDocsUpdate;
        if (duckdbDocsIntervalDays !== undefined) config.duckdbDocsIntervalDays = Number(duckdbDocsIntervalDays) || 30;
        if (syncRuntime) {
            const { setOllamaRuntimeConfig } = require('./ai/modelProfiles');
            setOllamaRuntimeConfig({
                keepAlive: config.ollamaKeepAlive,
                numCtx: config.ollamaNumCtx,
                thinkOverrides: config.ollamaThinkOverrides || {},
            });
        }

        await fs.promises.writeFile(aiManager.configPath, JSON.stringify(config, null, 2));
        res.json({ success: true, config: secretos.configParaElCliente(config) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/settings/gemini/models', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const apiKey = secretos.claveDeIA('gemini', config);
        
        // Default hardcoded list for fallback or ADC mode
        const defaultModels = [
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
        ];

        if (!apiKey) {
            return res.json({ models: defaultModels });
        }
        
        // La clave va en cabecera, NO en la URL. Un query string acaba en los
        // logs de acceso, en cualquier proxy que inspeccione el tráfico y en las
        // herramientas de depuración de red; una cabecera, no. Anthropic y
        // MiniMax ya lo hacían así (x-api-key y Authorization) — Gemini era el
        // único que se había quedado con la clave a la vista.
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
            headers: { 'x-goog-api-key': apiKey },
        });
        if (!response.ok) {
            console.error(`Failed to fetch Gemini models: ${response.statusText}`);
            return res.json({ models: defaultModels });
        }
        
        const data = await response.json();
        
        // Filter only models that support 'generateContent' and contain 'gemini' followed by a number in their name
        const validModels = (data.models || [])
            .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
            .filter(m => {
                const nameStr = m.name.toLowerCase();
                const dispStr = m.displayName ? m.displayName.toLowerCase() : '';
                const regex = /gemini[- ]?\d/i;
                return regex.test(nameStr) || regex.test(dispStr);
            })
            .map(m => ({
                id: m.name.replace('models/', ''),
                label: m.displayName || m.name.replace('models/', '')
            }));
            
        res.json({ models: validModels });
    } catch (err) {
        console.error("Error fetching Gemini models:", err);
        // Fallback gracefully so UI doesn't break
        res.json({ models: [
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
        ]});
    }
});

/**
 * Generic cloud model discovery. Queries each provider's live "list models" API
 * so a new release (e.g. MiniMax M3, a new Gemini/Claude) appears automatically
 * with NO code change. Always returns { models: [{id, label}], source } and
 * degrades to a small fallback list when there's no API key or the API is down.
 * New cloud model ids also "just work" at runtime: AiManager.getModel() passes the
 * id straight through, and modelProfiles forces cloud-tier for cloud providers.
 */
async function fetchCloudModels(provider, config) {
    const FALLBACKS = {
        gemini: [
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        ],
        anthropic: [
            { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
            { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' },
            { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
        ],
        minimax: [
            { id: 'MiniMax-M2.7', label: 'MiniMax M2.7' },
            { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
            { id: 'MiniMax-M2-Her', label: 'MiniMax M2 Her' },
        ],
    };
    const fallback = FALLBACKS[provider] || [];

    try {
        if (provider === 'gemini') {
            const key = secretos.claveDeIA('gemini', config);
            if (!key) return { models: fallback, source: 'fallback' };
            // Cabecera, no query string — ver el comentario del endpoint de
            // arriba, que hace esta misma petición.
            const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                headers: { 'x-goog-api-key': key },
            });
            if (!r.ok) return { models: fallback, source: 'fallback' };
            const d = await r.json();
            const re = /gemini[- ]?\d/i;
            const models = (d.models || [])
                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                .filter(m => re.test(m.name || '') || re.test(m.displayName || ''))
                .map(m => ({ id: m.name.replace('models/', ''), label: m.displayName || m.name.replace('models/', '') }));
            return { models: models.length ? models : fallback, source: models.length ? 'api' : 'fallback' };
        }

        if (provider === 'anthropic') {
            const key = secretos.claveDeIA('anthropic', config);
            if (!key) return { models: fallback, source: 'fallback' };
            const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
                headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            });
            if (!r.ok) return { models: fallback, source: 'fallback' };
            const d = await r.json();
            const models = (d.data || []).map(m => ({ id: m.id, label: m.display_name || m.id })).filter(m => m.id);
            return { models: models.length ? models : fallback, source: models.length ? 'api' : 'fallback' };
        }

        if (provider === 'minimax') {
            const key = secretos.claveDeIA('minimax', config);
            if (!key) return { models: fallback, source: 'fallback' };
            // MiniMax is OpenAI-compatible; /v1/models may or may not be exposed.
            const r = await fetch('https://api.minimax.io/v1/models', {
                headers: { Authorization: `Bearer ${key}` },
            });
            if (!r.ok) return { models: fallback, source: 'fallback' };
            const d = await r.json();
            const raw = d.data || d.models || [];
            const models = raw.map(m => ({ id: m.id || m.name, label: m.id || m.name })).filter(m => m.id);
            return { models: models.length ? models : fallback, source: models.length ? 'api' : 'fallback' };
        }
    } catch (err) {
        console.error(`[Models] ${provider} discovery failed:`, err.message);
        return { models: fallback, source: 'fallback', error: err.message };
    }

    return { models: fallback, source: 'fallback' };
}

// Unified endpoint — works for any cloud provider with a list API.
app.get('/api/settings/models/:provider', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const out = await fetchCloudModels(req.params.provider, config);
        res.json(out);
    } catch (err) {
        res.json({ models: [], source: 'error', error: err.message });
    }
});

app.post('/api/settings/cloud/test-adc', async (req, res) => {
    try {
        const { createVertex } = require('@ai-sdk/google-vertex');
        const { generateText } = require('ai');

        const config = aiManager.getConfig();
        const project  = req.body?.gcpProject  || config.gcpProject  || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
        const location = req.body?.gcpLocation || config.gcpLocation || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

        if (!project) {
            return res.json({
                success: false,
                message: 'GCP Project ID is required for ADC. Fill in the "GCP Project ID" field and save before testing.',
            });
        }

        const vertex = createVertex({ project, location });
        const model  = vertex('gemini-2.5-flash');

        const result = await generateText({
            model,
            prompt: 'Say "ADC authentication successful"',
            maxOutputTokens: 10,
        });

        if (result.text) {
            res.json({ success: true, message: `ADC connection successful. (project: ${project}, location: ${location})` });
        } else {
            res.json({ success: false, message: 'Vertex AI responded but returned no text. Check project and location.' });
        }
    } catch (err) {
        // Surface actionable hints for the most common errors
        let message = err.message || 'ADC connection failed.';
        if (message.includes('UNAUTHENTICATED') || message.includes('credentials')) {
            message = `ADC credentials not found. Run: gcloud auth application-default login\n\nDetails: ${message}`;
        } else if (message.includes('PERMISSION_DENIED') || message.includes('403')) {
            message = `Permission denied. Make sure your GCP account has the "Vertex AI User" role on project "${(aiManager.getConfig().gcpProject || '?')}".\n\nDetails: ${message}`;
        } else if (message.includes('PROJECT_NOT_FOUND') || message.includes('project') && message.includes('not found')) {
            message = `Project not found. Verify the GCP Project ID is correct.\n\nDetails: ${message}`;
        }
        res.json({ success: false, message });
    }
});

// ── Cloud Export (S3 / GCS via DuckDB httpfs) ──
app.post('/api/export/cloud', async (req, res) => {
    const { query, destination, format, provider: cloudProvider } = req.body;
    // destination: s3://bucket/path/file.parquet or gs://bucket/path/file.csv
    // format: parquet, csv, json
    // cloudProvider: s3 or gcs
    // Cloud export supports only CSV/JSON/Parquet — NOT xlsx. Validate up front so
    // an unsupported format never silently falls through to a Parquet body written
    // under a mismatched extension.
    const allowedCloudFormats = ['csv', 'parquet', 'json'];
    if (!allowedCloudFormats.includes((format || '').toLowerCase())) {
        return res.status(400).json({
            error: `Formato no soportado para export a la nube: ${format || '(vacío)'}. Usa CSV, JSON o Parquet.`,
        });
    }

    try {
        const config = aiManager.getConfig();

        // Load httpfs extension
        await dbManager.systemQuery('INSTALL httpfs; LOAD httpfs;');

        // Un secreto temporal con nombre, en vez de SET globales: antes el valor
        // iba pegado al SQL y GCS dejaba s3_endpoint apuntando a Google.
        if (cloudProvider === 's3' || cloudProvider === 'gcs') await secretos.prepararNube(dbManager, cloudProvider, config);

        // Build COPY statement
        const formatUpper = (format || 'parquet').toUpperCase();
        const copyOpts = formatUpper === 'CSV' ? "(FORMAT CSV, HEADER)" : formatUpper === 'JSON' ? "(FORMAT JSON, ARRAY true)" : "(FORMAT PARQUET)";
        const copyQuery = `COPY (${query}) TO '${String(destination).replace(/'/g, "''")}' ${copyOpts}`;

        await dbManager.systemQuery(copyQuery);
        res.json({ success: true, message: `Exported to ${destination}` });
    } catch (err) {
        console.error('[Cloud Export] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/export/cloud/test', async (req, res) => {
    const { provider: cloudProvider } = req.body;
    try {
        const config = aiManager.getConfig();
        await dbManager.systemQuery('INSTALL httpfs; LOAD httpfs;');

        if (cloudProvider === 's3') {
            const s3 = await secretos.prepararNube(dbManager, 's3', config);
            // Try to list a bucket
            if (s3.defaultBucket) {
                const result = await dbManager.systemQuery(`SELECT count(*) as cnt FROM glob('s3://${String(s3.defaultBucket).replace(/'/g, "''")}/*')`);
                res.json({ success: true, message: `Connected. Found files in bucket.`, count: result[0]?.cnt });
            } else {
                res.json({ success: true, message: 'Credentials set. No bucket specified for testing.' });
            }
        } else if (cloudProvider === 'gcs') {
            await secretos.prepararNube(dbManager, 'gcs', config);
            res.json({ success: true, message: 'GCS credentials configured.' });
        } else {
            res.json({ success: false, message: 'Unknown provider' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Google Sheets Integration (DuckDB gsheets extension) ──

// Helper: ensure gsheets extension installed and loaded, and secret created
async function ensureGSheetsReady() {
    try {
        // Check if extension is already loaded
        const exts = await dbManager.systemQuery(
            "SELECT installed, loaded FROM duckdb_extensions() WHERE extension_name = 'gsheets'"
        );
        const ext = exts[0];
        if (!ext || !ext.installed) {
            await dbManager.systemQuery("INSTALL gsheets FROM community");
        }
        if (!ext || !ext.loaded) {
            await dbManager.systemQuery("LOAD gsheets");
        }
    } catch (e) {
        // If extension is already loaded, DuckDB may throw — ignore
        if (!e.message.includes('already loaded')) throw e;
    }

    // Create secret from config if not already done
    const config = aiManager.getConfig();
    const gsheets = config.gsheets || {};
    if (gsheets.serviceAccountKeyPath) {
        try {
            // Drop existing secret first to avoid conflicts
            try { await dbManager.systemQuery("DROP SECRET IF EXISTS __amox_gsheet"); } catch {}
            const saPath = gsheets.serviceAccountKeyPath.replace(/\\/g, '/').replace(/'/g, "''");
            await dbManager.systemQuery(
                `CREATE SECRET __amox_gsheet (TYPE gsheet, PROVIDER key_file, FILEPATH '${saPath}')`
            );
        } catch (e) {
            if (!e.message.includes('already exists')) throw e;
        }
    }
}

// POST /api/gsheets/setup — Upload/set SA key path and initialize extension
app.post('/api/gsheets/setup', async (req, res) => {
    const { serviceAccountKeyPath } = req.body;
    if (!serviceAccountKeyPath) return res.status(400).json({ error: 'serviceAccountKeyPath is required' });

    try {
        // Validate the file exists
        if (!fs.existsSync(serviceAccountKeyPath)) {
            return res.status(400).json({ error: 'Service Account key file not found at the specified path.' });
        }

        // Read the SA email from the JSON
        const saData = JSON.parse(fs.readFileSync(serviceAccountKeyPath, 'utf8'));
        const email = saData.client_email || '';

        // Save to config
        const config = aiManager.getConfig();
        if (!config.gsheets) config.gsheets = {};
        config.gsheets.serviceAccountKeyPath = serviceAccountKeyPath;
        config.gsheets.serviceAccountEmail = email;
        if (!config.gsheets.sheets) config.gsheets.sheets = [];
        aiManager.saveConfig(config);

        // Initialize extension and secret
        await ensureGSheetsReady();

        res.json({ success: true, email, message: 'Google Sheets configured successfully.' });
    } catch (err) {
        console.error('[GSheets] Setup failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gsheets/status — Check extension + secret status
app.get('/api/gsheets/status', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const gsheets = config.gsheets || {};
        const isConfigured = !!gsheets.serviceAccountKeyPath;

        let extensionLoaded = false;
        try {
            const exts = await dbManager.systemQuery(
                "SELECT loaded FROM duckdb_extensions() WHERE extension_name = 'gsheets'"
            );
            extensionLoaded = exts[0]?.loaded === true || exts[0]?.loaded === 'true';
        } catch {}

        res.json({
            isConfigured,
            extensionLoaded,
            serviceAccountEmail: gsheets.serviceAccountEmail || '',
            sheetsCount: (gsheets.sheets || []).length,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gsheets/sheets — List registered sheets
app.get('/api/gsheets/sheets', (req, res) => {
    const config = aiManager.getConfig();
    res.json(config.gsheets?.sheets || []);
});

// POST /api/gsheets/sheets — Register a new sheet
app.post('/api/gsheets/sheets', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Sheet URL is required' });

    // Extract spreadsheet ID from URL
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return res.status(400).json({ error: 'Invalid Google Sheets URL. Expected format: https://docs.google.com/spreadsheets/d/{id}/...' });
    const spreadsheetId = idMatch[1];

    try {
        await ensureGSheetsReady();

        // Fetch spreadsheet metadata (title) by reading the first row
        let spreadsheetName = `Sheet ${spreadsheetId.substring(0, 8)}`;
        try {
            // Try to get the title from the Google Sheets API via the SA credentials
            const config = aiManager.getConfig();
            const saPath = config.gsheets?.serviceAccountKeyPath;
            if (saPath) {
                const saData = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                // Generate JWT for Google API
                const jwt = require('jsonwebtoken');
                const now = Math.floor(Date.now() / 1000);
                const token = jwt.sign({
                    iss: saData.client_email,
                    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                    aud: 'https://oauth2.googleapis.com/token',
                    iat: now,
                    exp: now + 3600,
                }, saData.private_key, { algorithm: 'RS256' });

                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`
                });
                const tokenData = await tokenRes.json();

                if (tokenData.access_token) {
                    const metaRes = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
                        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
                    );
                    if (metaRes.ok) {
                        const meta = await metaRes.json();
                        spreadsheetName = meta.properties?.title || spreadsheetName;
                    }
                }
            }
        } catch (e) {
            console.warn('[GSheets] Could not fetch spreadsheet title:', e.message);
        }

        // Validate we can actually read it
        await dbManager.systemQuery(`SELECT * FROM read_gsheet('${spreadsheetId}') LIMIT 1`);

        // Fetch sheet tabs
        let tabs = [];
        try {
            const config = aiManager.getConfig();
            const saPath = config.gsheets?.serviceAccountKeyPath;
            if (saPath) {
                const saData = JSON.parse(fs.readFileSync(saPath, 'utf8'));
                const jwt = require('jsonwebtoken');
                const now = Math.floor(Date.now() / 1000);
                const jwtToken = jwt.sign({
                    iss: saData.client_email,
                    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                    aud: 'https://oauth2.googleapis.com/token',
                    iat: now,
                    exp: now + 3600,
                }, saData.private_key, { algorithm: 'RS256' });
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtToken}`
                });
                const tokenData = await tokenRes.json();
                if (tokenData.access_token) {
                    const metaRes = await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
                        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
                    );
                    if (metaRes.ok) {
                        const meta = await metaRes.json();
                        tabs = (meta.sheets || []).map(s => ({
                            title: s.properties.title,
                            sheetId: s.properties.sheetId,
                            index: s.properties.index,
                        }));
                    }
                }
            }
        } catch {}

        const newSheet = {
            id: `gs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            url,
            spreadsheetId,
            name: spreadsheetName,
            tabs,
            addedAt: new Date().toISOString(),
        };

        const config = aiManager.getConfig();
        if (!config.gsheets) config.gsheets = {};
        if (!config.gsheets.sheets) config.gsheets.sheets = [];

        // Check duplicate
        if (config.gsheets.sheets.some(s => s.spreadsheetId === spreadsheetId)) {
            return res.status(409).json({ error: 'This spreadsheet is already registered.' });
        }

        config.gsheets.sheets.push(newSheet);
        aiManager.saveConfig(config);

        res.json(newSheet);
    } catch (err) {
        console.error('[GSheets] Register failed:', err);
        res.status(500).json({ error: `Failed to connect to Google Sheet: ${err.message}` });
    }
});

// DELETE /api/gsheets/sheets/:id — Remove a registered sheet
app.delete('/api/gsheets/sheets/:id', (req, res) => {
    const config = aiManager.getConfig();
    if (!config.gsheets?.sheets) return res.json({ success: true });
    config.gsheets.sheets = config.gsheets.sheets.filter(s => s.id !== req.params.id);
    aiManager.saveConfig(config);
    res.json({ success: true });
});

// GET /api/gsheets/preview/:id — Preview first 100 rows of a sheet (specific tab)
app.get('/api/gsheets/preview/:id', async (req, res) => {
    const { tab } = req.query;
    try {
        await ensureGSheetsReady();
        const config = aiManager.getConfig();
        const sheet = (config.gsheets?.sheets || []).find(s => s.id === req.params.id);
        if (!sheet) return res.status(404).json({ error: 'Sheet not found' });

        const sheetClause = tab ? `, sheet='${tab.replace(/'/g, "''")}'` : '';
        const rows = await dbManager.query(
            `SELECT * FROM read_gsheet('${sheet.spreadsheetId}'${sheetClause}) LIMIT 100`
        );
        res.json({ rows, sheetName: sheet.name, tab: tab || 'Sheet1' });
    } catch (err) {
        console.error('[GSheets] Preview failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/gsheets/test — Test connection with SA key
app.post('/api/gsheets/test', async (req, res) => {
    try {
        await ensureGSheetsReady();
        res.json({ success: true, message: 'Google Sheets extension loaded and secret configured.' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

app.get('/api/settings/ollama/models', async (req, res) => {
    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const models = await ollamaClient.list();
        res.json(models);
    } catch (err) {
        console.error("Failed to list Ollama models", err);
        // Do not throw full 500 if Ollama isn't running, return empty so UI doesn't break
        res.json({ models: [] });
    }
});

/**
 * GET /api/settings/ollama/models-enriched
 * Returns installed models with capabilities, tier classification, and metadata.
 * Uses Ollama /api/show for capability detection.
 */
app.get('/api/settings/ollama/models-enriched', async (req, res) => {
    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const { getModelProfile: getProfileFn, classifyModelFromCapabilities, fetchOllamaModelInfo } = require('./ai/modelProfiles');
        const listResult = await ollamaClient.list();
        const models = listResult.models || [];
        const config = aiManager.getConfig();
        const overrides = config.modelTierOverrides || {};

        const enriched = [];
        for (const m of models) {
            try {
                const info = await fetchOllamaModelInfo(m.name);
                const profile = getProfileFn(m.name, 'ollama', info);
                enriched.push({
                    name: m.name,
                    size: m.size,
                    parameterSize: info?.parameterSize || m.details?.parameter_size || '',
                    family: info?.family || m.details?.family || '',
                    quantization: info?.quantization || m.details?.quantization_level || '',
                    capabilities: info?.capabilities || [],
                    tier: profile.tier,
                    isUserOverride: !!overrides[m.name.toLowerCase()],
                    autoDetected: !!profile.autoDetected,
                });
            } catch {
                // Fallback without enrichment
                const profile = getProfileFn(m.name, 'ollama');
                enriched.push({
                    name: m.name,
                    size: m.size,
                    parameterSize: m.details?.parameter_size || '',
                    family: m.details?.family || '',
                    quantization: m.details?.quantization_level || '',
                    capabilities: [],
                    tier: profile.tier,
                    isUserOverride: false,
                    autoDetected: false,
                });
            }
        }

        res.json({ models: enriched });
    } catch (err) {
        console.error("Failed to list enriched Ollama models", err);
        res.json({ models: [] });
    }
});

app.post('/api/settings/ollama/pull', async (req, res) => {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: "Model name is required" });

    // Set up Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    req.on('close', () => res.end());

    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const stream = await ollamaClient.pull({ model: model, stream: true });

        for await (const part of stream) {
            res.write(`data: ${JSON.stringify(part)}\n\n`);
        }
        res.write(`data: {"status":"success"}\n\n`);
        res.end();
    } catch (err) {
        console.error("Ollama pull failed", err);
        res.write(`data: {"error": "${err.message}"}\n\n`);
        res.end();
    }
});


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
        console.error('[AI] Failed to build table context:', err);
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


app.get('/api/files', (req, res) => {
    const dirPath = req.query.path || '';
    const fullPath = path.join(ROOT_DIR, dirPath);

    fs.readdir(fullPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read directory', details: err.message });
        }

        const fileList = files.map(file => {
            let sizeBytes = null;
            let mtimeMs = null;
            const itemFullPath = path.join(fullPath, file.name);
            if (!file.isDirectory()) {
                try {
                    const stats = fs.statSync(itemFullPath);
                    sizeBytes = stats.size;
                    // Ya se podia ORDENAR por fecha, pero no se enseñaba: el
                    // dato estaba y no llegaba al cliente.
                    mtimeMs = stats.mtimeMs;
                } catch (e) { /* ignore */ }
            }
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.relative(ROOT_DIR, itemFullPath).replace(/\\/g, '/'),
                fullPath: itemFullPath,
                sizeBytes,
                mtimeMs
            };
        });

        res.json(fileList);
    });
});

app.get('/api/file', (req, res) => {
    const filePath = req.query.path;
    const binary = req.query.binary === '1' || req.query.binary === 'true';
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ROOT_DIR, filePath);
    }

    if (binary) {
        // Base64 reads are confined to the project root — this mode returns raw
        // bytes and must not become an arbitrary-file-read primitive.
        const resolvedRoot = path.resolve(ROOT_DIR);
        const resolvedPath = path.resolve(fullPath);
        if (!resolvedPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
            return res.status(400).json({ error: 'Path must be within the project directory.' });
        }
        return fs.readFile(resolvedPath, (err, data) => {
            if (err) return res.status(500).json({ error: 'Failed to read file', details: err.message });
            res.json({ contentBase64: data.toString('base64') });
        });
    }

    fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read file', details: err.message });
        // La firma viaja con el contenido para que quien lo abra sepa DE QUE
        // version viene. Es lo que permite despues distinguir «cambio por
        // fuera» de «lo guarde yo», y negarse a pisar lo que no se leyo.
        res.json({ content: data, firma: firmaDe(fullPath) });
    });
});

/**
 * GET /api/file/raw?path=...
 * Streams a file's raw bytes with the correct Content-Type (via sendFile), so
 * an <img src> in the Markdown preview can point straight at it. This is what
 * makes relative image references (./assets/foo.png, ./diagram.svg) resolve —
 * SVG and PNG both work; the format was never the issue, the path was.
 * Confined to the project root; must not become an arbitrary-file-read.
 */
/**
 * GET /api/files/watch — el canal de avisos del vigilante.
 *
 * Un flujo de eventos abierto: cada vez que algo cambia en el proyecto sale un
 * `{ ruta, firma, tipo }`. **No se sondea**; el disco avisa y esto lo reenvia.
 *
 * El primer evento dice si la vigilancia esta activa de verdad. Hay sistemas
 * —montajes de red, contenedores— donde no se puede vigilar recursivamente, y
 * el cliente tiene derecho a saber que aqui no van a llegar avisos en vez de
 * suponer que no cambia nada.
 */
app.get('/api/files/watch', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    if (!vigilante) rearmarVigilante();
    const enviar = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    enviar({ tipo: 'hola', activo: !!vigilante?.activo, raiz: ROOT_DIR });

    const quitar = vigilante.suscribir(enviar);

    // Un latido cada medio minuto: sin trafico, los intermediarios cierran la
    // conexion en silencio y el cliente se queda creyendo que sigue vigilado.
    const latido = setInterval(() => res.write(': latido\n\n'), 30000);

    req.on('close', () => {
        clearInterval(latido);
        quitar();
    });
});

app.get('/api/file/raw', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const resolvedRoot = path.resolve(ROOT_DIR);
    const resolvedPath = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath));
    if (!resolvedPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Path must be within the project directory.' });
    }
    res.sendFile(resolvedPath, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
    });
});

app.post('/api/file', (req, res) => {
    const { path: filePath, content, firmaEsperada } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content are required' });

    let fullPath = filePath;
    if (!path.isAbsolute(filePath)) {
        fullPath = path.join(ROOT_DIR, filePath);
    }

    /**
     * **La garantia, no la comodidad.**
     *
     * El aviso en vivo del vigilante puede perderse —un montaje de red, un
     * sistema sin vigilancia recursiva, un cambio llegado mientras la ventana
     * no tenia el foco— y guardar es el ULTIMO momento en el que todavia se
     * puede evitar el daño. Por eso van los dos: el aviso avisa, esto garantiza.
     *
     * Se comprueba solo si quien guarda dice de que version viene. Sin
     * `firmaEsperada` se escribe como siempre: guardar un archivo nuevo, o
     * desde un sitio que no lo leyo, no tiene con que comparar.
     */
    if (firmaEsperada) {
        const actual = firmaDe(fullPath);
        // `actual === null` es un archivo que ya no esta: escribirlo lo crea de
        // nuevo, que es lo que el usuario espera y no destruye nada.
        if (actual !== null && actual !== firmaEsperada) {
            return res.status(409).json({
                error: 'The file changed outside the app since you opened it.',
                conflicto: true,
                firma: actual,
            });
        }
    }

    // Quien guarda un .sql pide lo que había antes: los gráficos vinculados
    // siguen a SU consulta dentro del archivo, y para saber cuál era hace falta
    // la versión anterior (Dec-81).
    let anterior;
    if (req.body.devolverAnterior) {
        try { anterior = fs.readFileSync(fullPath, 'utf8'); } catch { anterior = null; }
    }

    fs.writeFile(fullPath, content, 'utf8', (err) => {
        if (err) return res.status(500).json({ error: 'Failed to write file', details: err.message });
        res.json({ success: true, firma: firmaDe(fullPath), ...(anterior !== undefined ? { anterior } : {}) });
    });
});

app.post('/api/folder', (req, res) => {
    const { path: folderPath } = req.body;
    if (!folderPath) return res.status(400).json({ error: 'Path is required' });

    let fullPath = folderPath;
    if (!path.isAbsolute(folderPath)) {
        fullPath = path.join(ROOT_DIR, folderPath);
    }

    fs.mkdir(fullPath, { recursive: true }, (err) => {
        if (err) return res.status(500).json({ error: 'Failed to create folder', details: err.message });
        res.json({ success: true });
    });
});

/**
 * Lo que va con un archivo cuando se renombra o se mueve (o la carpeta que lo
 * tiene): su borrador de gráfico, y el origen de los `.amoxvis` que lo usan
 * como consulta. Antes, renombrar `ventas.sql` dejaba sus gráficos apuntando a
 * un archivo que ya no existía. Nunca impide el renombre.
 */
function acompanarRenombre(fullOld, fullNew) {
    try { borradores.mover(ROOT_DIR, fullOld, fullNew); } catch (e) { console.warn('[borradores] move:', e.message); }
    const rel = (p) => path.relative(ROOT_DIR, p).replace(/\\/g, '/');
    const viejo = rel(fullOld), nuevo = rel(fullNew);
    if (!viejo || viejo.startsWith('..')) return;
    let esCarpeta = false;
    try { esCarpeta = fs.statSync(fullNew).isDirectory(); } catch { return; }
    if (!esCarpeta && !/\.sql$/i.test(viejo)) return;
    try {
        for (const f of findFilesByExtension(ROOT_DIR, '.amoxvis')) {
            const full = path.join(ROOT_DIR, f.path);
            let textoActual;
            try { textoActual = fs.readFileSync(full, 'utf8'); } catch { continue; }
            const origen = (amoxvis.leer(textoActual).source || '').replace(/\\/g, '/');
            if (!origen) continue;
            let destino = null;
            if (origen === viejo) destino = nuevo;
            else if (esCarpeta && origen.startsWith(`${viejo}/`)) destino = nuevo + origen.slice(viejo.length);
            if (!destino) continue;
            const cambiado = amoxvis.conCambios(textoActual, { origen: destino });
            if (cambiado) fs.writeFileSync(full, cambiado, 'utf8');
        }
    } catch (e) {
        console.warn('[amoxvis] rename follow-up:', e.message);
    }
}

/* --- File Rename & Delete APIs --- */
app.post('/api/file/rename', (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath are required' });

    const fullOld = path.isAbsolute(oldPath) ? oldPath : path.join(ROOT_DIR, oldPath);
    const fullNew = path.isAbsolute(newPath) ? newPath : path.join(ROOT_DIR, newPath);

    if (!fs.existsSync(fullOld)) return res.status(404).json({ error: 'Source file not found' });
    if (fs.existsSync(fullNew)) return res.status(409).json({ error: 'Destination already exists' });

    try {
        fs.renameSync(fullOld, fullNew);
        acompanarRenombre(fullOld, fullNew);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Rename failed', details: err.message });
    }
});

app.post('/api/file/delete', (req, res) => {
    const { path: filePath, isDirectory } = req.body;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);

    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });

    try {
        if (isDirectory) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(fullPath);
            try { borradores.poner(ROOT_DIR, fullPath, null); } catch { /* sin borrador */ }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed', details: err.message });
    }
});

/* --- File Move (also used for drag-and-drop reorder) --- */
app.post('/api/file/move', (req, res) => {
    const { sourcePath, destinationDir } = req.body;
    if (!sourcePath || destinationDir === undefined) {
        return res.status(400).json({ error: 'sourcePath and destinationDir are required' });
    }

    const fullSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(ROOT_DIR, sourcePath);
    const fileName = path.basename(fullSource);
    const destDir = path.isAbsolute(destinationDir) ? destinationDir : path.join(ROOT_DIR, destinationDir);
    const fullDest = path.join(destDir, fileName);

    if (!fs.existsSync(fullSource)) return res.status(404).json({ error: 'Source not found' });
    if (fullSource === fullDest) return res.json({ success: true, noOp: true });
    if (fs.existsSync(fullDest)) return res.status(409).json({ error: `"${fileName}" already exists in the destination folder` });

    try {
        // Ensure destination directory exists
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(fullSource, fullDest);
        acompanarRenombre(fullSource, fullDest);
        res.json({ success: true, newPath: path.relative(ROOT_DIR, fullDest).replace(/\\/g, '/') });
    } catch (err) {
        res.status(500).json({ error: 'Move failed', details: err.message });
    }
});

/* --- File Copy / Duplicate --- */
app.post('/api/file/copy', (req, res) => {
    const { sourcePath, destinationDir } = req.body;
    if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' });

    const fullSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(ROOT_DIR, sourcePath);
    if (!fs.existsSync(fullSource)) return res.status(404).json({ error: 'Source not found' });

    const isDir = fs.statSync(fullSource).isDirectory();
    const baseName = path.basename(fullSource);
    const ext = path.extname(baseName);
    const nameNoExt = ext ? baseName.slice(0, -ext.length) : baseName;

    // Determine destination directory
    const destDirFull = destinationDir
        ? (path.isAbsolute(destinationDir) ? destinationDir : path.join(ROOT_DIR, destinationDir))
        : path.dirname(fullSource);

    // Auto-generate unique name: "file (copy).ext", "file (copy 2).ext", etc.
    let copyName;
    let counter = 0;
    do {
        const suffix = counter === 0 ? ' (copy)' : ` (copy ${counter + 1})`;
        copyName = isDir ? `${baseName}${suffix}` : `${nameNoExt}${suffix}${ext}`;
        counter++;
    } while (fs.existsSync(path.join(destDirFull, copyName)));

    const fullDest = path.join(destDirFull, copyName);

    try {
        if (isDir) {
            fs.cpSync(fullSource, fullDest, { recursive: true });
        } else {
            fs.copyFileSync(fullSource, fullDest);
        }
        res.json({ success: true, newPath: path.relative(ROOT_DIR, fullDest).replace(/\\/g, '/'), newName: copyName });
    } catch (err) {
        res.status(500).json({ error: 'Copy failed', details: err.message });
    }
});


/* --- Reveal in OS File Explorer --- */
app.post('/api/file/reveal', (req, res) => {
    const { filePath: reqPath } = req.body;
    if (!reqPath) return res.status(400).json({ error: 'filePath is required' });

    const fullPath = path.isAbsolute(reqPath) ? reqPath : path.join(ROOT_DIR, reqPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Path not found' });

    const { exec } = require('child_process');
    const isDir = fs.statSync(fullPath).isDirectory();

    let cmd;
    if (process.platform === 'win32') {
        cmd = isDir ? `explorer "${fullPath}"` : `explorer /select,"${fullPath}"`;
    } else if (process.platform === 'darwin') {
        cmd = isDir ? `open "${fullPath}"` : `open -R "${fullPath}"`;
    } else {
        cmd = `xdg-open "${path.dirname(fullPath)}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            console.error('[API] Reveal in explorer failed:', err);
            return res.status(500).json({ error: 'Failed to open file explorer' });
        }
        res.json({ success: true });
    });
});

const getDirectories = (srcPath) => {
    let dirs = [];
    try {
        const items = fs.readdirSync(srcPath, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
                const relativePath = path.relative(ROOT_DIR, path.join(srcPath, item.name)).replace(/\\/g, '/');
                dirs.push({ name: item.name, path: relativePath });
                const subDirs = getDirectories(path.join(srcPath, item.name));
                dirs = dirs.concat(subDirs);
            }
        }
    } catch (err) {
    }
    return dirs;
};

app.get('/api/folders', (req, res) => {
    try {
        const folders = getDirectories(ROOT_DIR);
        folders.unshift({ name: 'Root', path: '' });
        res.json(folders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Recursively collects files under srcPath, same node_modules/.git skip as
 * getDirectories(). With `ext` filters by suffix; sin ext los devuelve todos
 * —que es lo que necesita el indice del omnibox—, para no tener dos
 * caminadores distintos diciendo cada uno que archivos tiene el proyecto.
 */
const findFilesByExtension = (srcPath, ext) => {
    let matches = [];
    let items;
    try {
        items = fs.readdirSync(srcPath, { withFileTypes: true });
    } catch (err) {
        return matches;
    }
    for (const item of items) {
        const itemFullPath = path.join(srcPath, item.name);
        if (item.isDirectory()) {
            if (item.name === 'node_modules' || item.name === '.git') continue;
            matches = matches.concat(findFilesByExtension(itemFullPath, ext));
        } else if (!ext || item.name.toLowerCase().endsWith(ext)) {
            const relativePath = path.relative(ROOT_DIR, itemFullPath).replace(/\\/g, '/');
            matches.push({ name: item.name, path: relativePath });
        }
    }
    return matches;
};

/**
 * GET /api/files/index — todos los archivos del proyecto, en plano.
 *
 * Es el indice que busca el omnibox. Se descartan las carpetas ocultas (las que
 * empiezan por punto): ahi viven la configuracion del proyecto y las cachés, y
 * en una busqueda de archivos son ruido, no resultados.
 *
 * Sin caché a proposito: el disco es local y el recorrido de un proyecto normal
 * es de milisegundos. Guardar una copia solo abriria la puerta a que el omnibox
 * ensenara archivos que ya no existen.
 */
app.get('/api/files/index', (req, res) => {
    try {
        const files = findFilesByExtension(ROOT_DIR, null)
            .filter(f => !f.path.split('/').some(seg => seg.startsWith('.')));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Always walks from ROOT_DIR (no user-supplied path segment), so there is no
// path-traversal surface here — same trust boundary as GET /api/folders.
app.get('/api/files/find-by-extension', (req, res) => {
    const ext = String(req.query.ext || '').toLowerCase();
    if (!/^\.[a-z0-9]+$/.test(ext)) {
        return res.status(400).json({ error: 'ext must look like ".ext" (letters/digits only)' });
    }
    try {
        const files = findFilesByExtension(ROOT_DIR, ext);
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/charts/using-source?path=queries/ventas.sql
 * Fase 3 — procedencia, the reverse lookup: which .amoxvis charts link back
 * to this .sql file (their `source` field). Scans project-relative here
 * (server-side, one directory walk + N small JSON reads) rather than having
 * the client fetch every .amoxvis and check client-side.
 */
app.get('/api/charts/using-source', (req, res) => {
    const sourcePath = req.query.path;
    if (!sourcePath) return res.status(400).json({ error: 'path is required' });
    const normalized = sourcePath.replace(/\\/g, '/');

    try {
        const amoxvisFiles = findFilesByExtension(ROOT_DIR, '.amoxvis');
        const matches = [];
        for (const f of amoxvisFiles) {
            try {
                const fullPath = path.join(ROOT_DIR, f.path);
                const config = amoxvis.leer(fs.readFileSync(fullPath, 'utf8'));
                if ((config.source || '').replace(/\\/g, '/') === normalized) {
                    matches.push({ name: f.name, path: f.path });
                }
            } catch {
                // Skip unreadable/malformed .amoxvis — not this endpoint's job to report that.
            }
        }
        res.json(matches);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// applyRowLimit lives in ./_sqlUtils (shared with ai/tools.js execute_sql).

app.post('/api/query', async (req, res) => {
    const { query, queryId, limit, deFondo } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const topeFilas = limit > 0 ? Math.min(limit, TOPE_FILAS) : TOPE_FILAS;
    const { sql: limitedSql, limited, limit: rowLimit } = applyRowLimit(query, topeFilas);

    const qid = queryId || require('crypto').randomUUID();
    // User cancellation targets ONLY the 'main' lane, and ONLY if THIS query is
    // the one currently executing there. DuckDB's interrupt flag is sticky: an
    // interrupt with nothing running kills the NEXT statement — which is why
    // opening a chart used to fail with "Interrupted!" when a previous fetch
    // had been aborted client-side (e.g. dev double-mount).
    const cedieron = deFondo ? 0 : cancelarLoDeFondo();
    const registro = registrarConsulta(qid, res, { deFondo: !!deFondo });

    // Mientras dbt tiene la base, se dice; lo que sólo lee fuentes o memoria corre.
    if (dbManager.prestada && !/^\s*(SELECT|WITH|FROM|DESCRIBE|SUMMARIZE|PRAGMA)\b[\s\S]*\bfuentes\s*\./i.test(query) && baseOcupadaPorDbt(res)) {
        activeQueries.delete(qid);
        return;
    }
    try {
        // Una consulta a una fuente justo al abrir el proyecto espera al catalogo.
        if (montandoFuentes && /\bfuentes\s*\./i.test(query)) await montandoFuentes;
        // El proyecto depende de las fuentes que nombra aunque esta vez no se
        // puedan leer (sin red, sin credencial): se anotan antes de correr.
        anotarFuentesDelSql(query);
        const start = performance.now();
        // 6.0 (M1, F3): al historial, sólo lo que se ejecuta desde el editor (`historial: true`;
        // las vistas previas, los totales de un gráfico o un deck también pasan por aquí), con el
        // texto del usuario —no el envuelto con el tope— y una vez.
        const opciones = { trackId: qid, cancelada: () => registro.cancelada, maxFilas: topeFilas + 1, maxBytes: TOPE_BYTES, ...(req.body.historial === true && !deFondo ? { historial: query } : {}) };
        let result;
        try {
            result = await dbManager.queryWithMetadata(limitedSql, opciones).catch((err) => {
                delete opciones.historial;          // un reintento no se apunta dos veces
                // Interrumpir lo de fondo justo cuando acababa deja el aviso puesto
                // y se lo lleva la siguiente: la tuya. Se repite una vez.
                if (cedieron && !registro.cancelada && /Interrupted/i.test(err.message)) {
                    return dbManager.queryWithMetadata(limitedSql, opciones);
                }
                throw err;
            });
        } catch (err) {
            // Lo poco que no admite ir de subconsulta se ejecuta tal cual; el tope
            // de filas y de tamaño sigue valiendo.
            if (!limited || /^\s*(SELECT|WITH)\b/i.test(query) || !/Parser Error|syntax error/i.test(err.message)) throw err;
            result = await dbManager.queryWithMetadata(query, opciones);
        }
        const end = performance.now();

        // Detect truncation: we fetched limit+1 rows, if we got them all it means there are more
        let rows = result.rows;
        let truncated = false;
        if (rows.length > topeFilas) {
            rows = rows.slice(0, topeFilas);
            truncated = true;
        }
        if (result.cortadoPor === 'tamano') truncated = true;

        // Invalidate table context cache if query may have changed schema
        const upperQuery = query.toUpperCase().trim();
        if (upperQuery.startsWith('CREATE') || upperQuery.startsWith('DROP') ||
            upperQuery.startsWith('ALTER') || upperQuery.startsWith('INSERT') ||
            upperQuery.startsWith('DELETE') || upperQuery.startsWith('UPDATE')) {
            invalidateTableContextCache();
        }

        // If the user activated an extension straight from the editor (a bare
        // `LOAD name;`), remember it so it survives reconnects and app restarts,
        // exactly like the Extensions panel does. Deliberately conservative:
        // only a lone LOAD of a simple identifier, never a file-path LOAD.
        try {
            const loadMatch = /^\s*LOAD\s+["']?([a-zA-Z0-9_]+)["']?\s*;?\s*$/i.exec(query);
            if (loadMatch) {
                const extName = loadMatch[1];
                if (!dbManager.getLoadedExtensions().includes(extName)) {
                    dbManager.rememberExtension(extName);
                    addAutoloadExtension(extName);
                }
                anotarExtensionDelProyecto(extName);
            }
        } catch { /* non-fatal bookkeeping */ }
        await anotarMaterializacion(query);

        // Classify the statement so the editor can decide how to render it: a
        // tabular result gets the table, a DML/DDL side-effect gets a summary
        // ("Table Created", "5 rows updated", …) instead of an empty grid.
        const { resultType, details: resultDetails } = detectResultType(query);
        let rowsAffected = null;
        if (['rows_inserted', 'rows_updated', 'rows_deleted'].includes(resultType)) {
            // DuckDB returns DML affected-row counts as a single "Count" column.
            const first = rows[0];
            const count = first?.Count ?? first?.count;
            if (count !== undefined && count !== null) rowsAffected = Number(count);
        }

        await responderFilas(res, rows, {
            types: result.types,
            executionTime: (end - start).toFixed(2),
            rowCount: rows.length,
            truncated,
            rowLimit: truncated ? rows.length : (limited ? rowLimit : null),
            topePorTamano: result.cortadoPor === 'tamano',
            queryId: qid,
            resultType,
            resultDetails,
            rowsAffected,
        });
    } catch (err) {
        if (res.headersSent) res.end();
        // 6.0: `$x` sin declarar, en palabras.
        else res.status(500).json({ error: variablesDelProyecto.explicarError(err.message) || err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

/**
 * Ejecuta una celda de cuaderno: deja la vista puesta y devuelve sus filas.
 *
 * ## Por que no basta con /api/query
 *
 * Por el limite de filas. `applyRowLimit` solo recorta un texto que EMPIECE por
 * `SELECT` o `WITH`; si se mandara todo junto empezaria por `CREATE`, pasaria de
 * largo, y la celda se traeria la tabla entera al navegador sin que nadie lo
 * pidiera. Por eso llegan dos piezas: `preparacion` deja la vista y `lector`
 * —que si empieza por SELECT— trae las filas ya recortadas.
 *
 * Van en UNA llamada y no en dos porque la via es una conexion viva: entre dos
 * llamadas cabria una cancelacion, y la celda quedaria con la vista creada y sin
 * filas que ensenar.
 *
 * ## El aviso de nombre tapado
 *
 * Medido contra el motor: una vista temporal llamada `ventas` tapa a la tabla
 * real `ventas` **y tambien a `main.ventas`**; solo se escapa escribiendo el
 * catalogo entero (`memory.main.ventas`). Asi que crear la vista en silencio
 * dejaria la tabla de verdad fuera del alcance de quien escriba `FROM ventas`
 * mas abajo, sin un solo error. Se avisa ANTES de ejecutar y no se ejecuta nada
 * hasta que el aviso se acepta.
 */
app.post('/api/cuaderno/celda', async (req, res) => {
    const { preparacion, lector, vista, deja, limit, queryId, aceptarTapado, historial } = req.body;
    if (!lector) return res.status(400).json({ error: 'The reader query is missing' });
    if (baseOcupadaPorDbt(res)) return;

    /**
     * Cambiar de tipo: relevar lo temporal que estorbe, y SOLO si estorba.
     *
     * `CREATE OR REPLACE` sabe reemplazar una vista por otra vista, pero no una
     * vista por una tabla: responde «Existing object x is of type View, trying
     * to replace with type Table». Eso lo provoca el boton «Materializar», que
     * existe justo para cambiar de tipo.
     *
     * Y NO vale mandar siempre un `DROP` del otro tipo desde el cliente: medido
     * contra el motor, `DROP TABLE IF EXISTS` sobre una VISTA no es inofensivo,
     * falla igual. El `IF EXISTS` perdona que no haya nada, no que haya otra
     * cosa. Asi que hay que mirar QUE hay antes de tirar nada, y eso solo se
     * sabe aqui: los objetos temporales son por conexion y el catalogo vive en
     * el motor, no en el documento.
     *
     * Va calificado a `temp.main` a proposito: sin calificar, el DROP se
     * llevaria por delante la vista PERMANENTE del mismo nombre, que es de
     * quien abrio el proyecto y no vuelve al cerrar.
     */
    if (vista && (deja === 'vista' || deja === 'tabla')) {
        try {
            const nombre = String(vista).replace(/'/g, "''");
            const hay = await dbManager.systemQuery(`
                SELECT 'vista' AS tipo FROM duckdb_views()
                 WHERE temporary AND NOT internal AND lower(view_name) = lower('${nombre}')
                UNION ALL
                SELECT 'tabla' FROM duckdb_tables()
                 WHERE temporary AND lower(table_name) = lower('${nombre}')
                LIMIT 1
            `);
            if (hay.length && hay[0].tipo !== deja) {
                const id = `"${String(vista).replace(/"/g, '""')}"`;
                const que = hay[0].tipo === 'tabla' ? 'TABLE' : 'VIEW';
                await dbManager.systemQuery(`DROP ${que} IF EXISTS temp.main.${id}`);
            }
        } catch (err) {
            // Si no se puede mirar el catalogo se sigue: el CREATE dira lo suyo
            // con un error del motor, que es mejor que negarse a ejecutar.
            console.warn('[cuaderno] no se pudo comprobar el tipo previo:', err.message);
        }
    }

    if (vista && !aceptarTapado) {
        try {
            const choque = await dbManager.systemQuery(`
                SELECT name, tipo FROM (
                    SELECT table_name AS name, 'tabla' AS tipo, temporary FROM duckdb_tables()
                    UNION ALL
                    SELECT view_name, 'vista', temporary FROM duckdb_views() WHERE NOT internal AND database_name <> 'fuentes'
                ) WHERE NOT temporary AND lower(name) = lower('${String(vista).replace(/'/g, "''")}')
                LIMIT 1
            `);
            if (choque.length) {
                return res.json({ tapado: { nombre: choque[0].name, tipo: choque[0].tipo } });
            }
        } catch (err) {
            // Que no se pueda mirar el catalogo no debe impedir trabajar; se
            // sigue sin el aviso, que es lo que pasaba hasta hoy de todos modos.
            console.warn('[cuaderno] no se pudo comprobar el nombre:', err.message);
        }
    }

    const topeFilas = limit > 0 ? Math.min(limit, TOPE_FILAS) : TOPE_FILAS;
    const { sql: lectorLimitado, limited, limit: rowLimit } = applyRowLimit(lector, topeFilas);
    const qid = queryId || require('crypto').randomUUID();
    cancelarLoDeFondo();
    const registro = registrarConsulta(qid, res);

    try {
        const start = performance.now();
        const cancelada = () => registro.cancelada;
        // 6.0 (M1, F3): al historial, el SQL de la celda tal como lo escribió el usuario.
        const apunte = typeof historial === 'string' && historial.trim() ? { historial } : {};
        if (preparacion) await dbManager.queryWithMetadata(preparacion, { trackId: qid, cancelada, ...apunte });
        const result = await dbManager.queryWithMetadata(lectorLimitado, { trackId: qid, cancelada, maxFilas: topeFilas + 1, maxBytes: TOPE_BYTES, ...(preparacion ? {} : apunte) });
        const end = performance.now();

        let rows = result.rows;
        let truncated = false;
        if (rows.length > topeFilas) {
            rows = rows.slice(0, topeFilas);
            truncated = true;
        }
        if (result.cortadoPor === 'tamano') truncated = true;

        // La celda ha podido crear o tapar objetos: el contexto de tablas que
        // alimenta el autocompletado y a la IA deja de valer.
        if (preparacion) invalidateTableContextCache();

        await responderFilas(res, rows, {
            types: result.types,
            executionTime: (end - start).toFixed(2),
            rowCount: rows.length,
            truncated,
            rowLimit: truncated ? rows.length : (limited ? rowLimit : null),
            queryId: qid,
            vista: vista || null,
        });
    } catch (err) {
        if (res.headersSent) res.end();
        // 6.0: `$x` sin declarar, en palabras.
        else res.status(500).json({ error: variablesDelProyecto.explicarError(err.message) || err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

/**
 * Las vistas y tablas temporales vivas de la sesion, con su descripcion.
 *
 * Son el equivalente al dataframe que ya existia y que la interfaz nunca conto.
 * `NOT internal` deja fuera las del propio motor.
 */
app.get('/api/cuaderno/vistas', async (req, res) => {
    try {
        const filas = await dbManager.systemQuery(`
            SELECT view_name AS nombre, 'vista' AS tipo, comment AS descripcion
            FROM duckdb_views() WHERE temporary AND NOT internal
            UNION ALL
            SELECT table_name, 'tabla', comment
            FROM duckdb_tables() WHERE temporary AND NOT internal
            ORDER BY nombre
        `);
        res.json(filas);
    } catch (err) {
        console.warn('[cuaderno] no se pudieron listar las vistas vivas:', err.message);
        res.json([]);
    }
});

app.post('/api/query/cancel/:queryId', (req, res) => {
    const { queryId } = req.params;
    const entry = activeQueries.get(queryId);
    if (!entry) return res.status(404).json({ error: 'Query not found or already completed' });
    try {
        entry.interrupt();
        activeQueries.delete(queryId);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/profile', async (req, res) => {
    const { query, queryId } = req.body;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    // El perfil relee la consulta entera, varias veces. Va de fondo: se cancela al
    // salir de la vista (se cierra la petición) o cuando corres otra consulta.
    const qid = queryId || require('crypto').randomUUID();
    const registro = registrarConsulta(qid, res, { deFondo: true });
    const opciones = { trackId: qid, cancelada: () => registro.cancelada };

    try {
        // Strip trailing semicolons to prevent syntax errors when nesting
        const cleanQuery = query.trim().replace(/;+$/, '');

        // 1. DuckDB SUMMARIZE for core statistics
        const profileQuery = `SUMMARIZE ${cleanQuery}`;
        const start = performance.now();
        const profileData = await dbManager.systemQuery(profileQuery, opciones);

        // 2. Fetch Global Stats
        const globalRowsQuery = `SELECT COUNT(*) as total_rows FROM (${cleanQuery}) as sq`;
        const globalDupesQuery = `SELECT COUNT(*) as duplicate_rows FROM (SELECT * FROM (${cleanQuery}) as sq GROUP BY ALL HAVING COUNT(*) > 1) as sq2`;

        // 3. Build Advanced Summary & Correlation Queries
        let advancedSelects = [];
        let numericCols = [];
        profileData.forEach(col => {
            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
            const colName = col.column_name;
            const safeCol = `"${colName}"`;

            if (isNumeric) {
                numericCols.push(colName);
                advancedSelects.push(`SKEWNESS(${safeCol}) as "${colName}_skewness"`);
                advancedSelects.push(`KURTOSIS(${safeCol}) as "${colName}_kurtosis"`);
                advancedSelects.push(`COUNT(CASE WHEN ${safeCol} = 0 THEN 1 END) as "${colName}_zeros"`);
                advancedSelects.push(`COUNT(CASE WHEN ${safeCol} < 0 THEN 1 END) as "${colName}_negatives"`);
                // Outliers beyond the 1.5·IQR fences (SUMMARIZE quartiles injected as literals).
                const q25n = parseFloat(col.q25);
                const q75n = parseFloat(col.q75);
                if (!Number.isNaN(q25n) && !Number.isNaN(q75n) && q75n > q25n) {
                    const iqr = q75n - q25n;
                    const lo = q25n - 1.5 * iqr;
                    const hi = q75n + 1.5 * iqr;
                    advancedSelects.push(`COUNT(CASE WHEN ${safeCol} < ${lo} OR ${safeCol} > ${hi} THEN 1 END) as "${colName}_outliers"`);
                }
            } else {
                advancedSelects.push(`MAX(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_max_length"`);
                advancedSelects.push(`MIN(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_min_length"`);
                advancedSelects.push(`AVG(LENGTH(CAST(${safeCol} AS VARCHAR))) as "${colName}_avg_length"`);
                // Value-based semantic hint: how many values look like an email address.
                advancedSelects.push(`COUNT(CASE WHEN CAST(${safeCol} AS VARCHAR) LIKE '%_@_%.__%' THEN 1 END) as "${colName}_emaillike"`);
                // Date span + distinct dates → range and gap detection.
                if (/DATE|TIMESTAMP/.test(col.column_type.toUpperCase())) {
                    advancedSelects.push(`DATE_DIFF('day', MIN(${safeCol}), MAX(${safeCol})) as "${colName}_dayspan"`);
                    advancedSelects.push(`COUNT(DISTINCT ${safeCol}) as "${colName}_distinctdates"`);
                }
            }
        });

        // Add correlation matrix if multiple numerics
        let corrSelects = [];
        if (numericCols.length > 1) {
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const c1 = numericCols[i];
                    const c2 = numericCols[j];
                    corrSelects.push(`CORR("${c1}", "${c2}") as "corr_${c1}_${c2}"`);
                }
            }
        }

        let advancedQuery = '';
        if (advancedSelects.length > 0 || corrSelects.length > 0) {
            const allSelects = [...advancedSelects, ...corrSelects].join(',\n');
            advancedQuery = `SELECT \n${allSelects}\nFROM (${cleanQuery}) as subq`;
        }

        // 4. Fetch Visual Data (Histograms for numeric, Top 5 for text)
        const visualQueries = profileData.map(col => {
            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
            const colName = `"${col.column_name}"`;
            // 6.0 (O5): a VARIANT's «top values» are whole objects; its keys go below.
            if (String(col.column_type).toUpperCase() === 'VARIANT') return null;

            if (isNumeric) {
                if (col.min === null || col.max === null || col.min === col.max) return null;
                const min = parseFloat(col.min);
                const max = parseFloat(col.max);
                const range = max - min;
                const binWidth = range / 5;

                return `SELECT 
                    '${col.column_name}' as col_name,
                    COUNT(CASE WHEN ${colName} >= ${min} AND ${colName} < ${min + binWidth} THEN 1 END) as b1,
                    COUNT(CASE WHEN ${colName} >= ${min + binWidth} AND ${colName} < ${min + (binWidth * 2)} THEN 1 END) as b2,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 2)} AND ${colName} < ${min + (binWidth * 3)} THEN 1 END) as b3,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 3)} AND ${colName} < ${min + (binWidth * 4)} THEN 1 END) as b4,
                    COUNT(CASE WHEN ${colName} >= ${min + (binWidth * 4)} AND ${colName} <= ${max} THEN 1 END) as b5
                    FROM (${cleanQuery}) as subq`;
            } else {
                return `SELECT 
                    '${col.column_name}' as col_name,
                    ${colName} as val, 
                    COUNT(*) as count 
                    FROM (${cleanQuery}) as subq 
                    WHERE ${colName} IS NOT NULL 
                    GROUP BY ${colName} 
                    ORDER BY count DESC 
                    LIMIT 5`;
            }
        }).filter(q => q !== null);

        let visuals = {};
        if (visualQueries.length > 0) {
            const visualResults = await Promise.all(visualQueries.map(q => dbManager.systemQuery(q, opciones)));
            visualResults.forEach(res => {
                if (!res || res.length === 0) return;
                const colName = res[0].col_name;
                if ('b1' in res[0]) {
                    const row = res[0];
                    visuals[colName] = { type: 'histogram', data: [Number(row.b1), Number(row.b2), Number(row.b3), Number(row.b4), Number(row.b5)] };
                } else {
                    visuals[colName] = { type: 'top', data: res.map(r => ({ value: String(r.val), count: Number(r.count) })) };
                }
            });
        }

        // 6.0 (O5): a VARIANT column — which keys its objects have, in how many rows, and
        // with which types (variant_extract needs a constant key: a second pass).
        for (const col of profileData.filter(c => String(c.column_type).toUpperCase() === 'VARIANT')) {
            try {
                const c = `"${String(col.column_name).replace(/"/g, '""')}"`;
                const claves = await dbManager.systemQuery(
                    `SELECT k, count(*) AS n FROM (SELECT unnest(variant_keys(${c})) AS k FROM (${cleanQuery}) AS subq WHERE variant_type(${c}) = 'OBJECT') GROUP BY k ORDER BY n DESC, k LIMIT 30`, opciones);
                if (!claves.length) continue;
                const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
                const tiposSql = claves.map((r, i) => `list(DISTINCT variant_type(variant_extract(${c}, ${lit(r.k)}))) FILTER (WHERE variant_type(variant_extract(${c}, ${lit(r.k)})) IS NOT NULL) AS t${i}`).join(', ');
                const tipos = (await dbManager.systemQuery(`SELECT ${tiposSql} FROM (${cleanQuery}) AS subq WHERE variant_type(${c}) = 'OBJECT'`, opciones))[0] || {};
                visuals[col.column_name] = {
                    type: 'keys',
                    data: claves.map((r, i) => ({ value: r.k, count: Number(r.n), tipos: (tipos[`t${i}`] || []).map(String).sort() })),
                };
            } catch { /* sin claves: se queda con lo general */ }
        }

        // 5. Execute Global & Advanced queries in parallel
        const parallelExecutions = [
            dbManager.systemQuery(globalRowsQuery, opciones),
            dbManager.systemQuery(globalDupesQuery, opciones)
        ];
        if (advancedQuery) {
            parallelExecutions.push(dbManager.systemQuery(advancedQuery, opciones));
        }

        const parallelResults = await Promise.all(parallelExecutions);

        const totalRows = parallelResults[0][0]?.total_rows || 0;
        const duplicateRows = parallelResults[1][0]?.duplicate_rows || 0;
        const advancedStats = advancedQuery ? parallelResults[2][0] : {};

        // Candidate composite key: if no single column is unique, test whether the two
        // highest-cardinality columns together form a unique key (one cheap extra query).
        let candidateKey = null;
        try {
            const tr = Number(totalRows);
            const singleKey = profileData.some((c) => tr > 0 && parseInt(c.approx_unique) >= tr * 0.999);
            if (!singleKey && Number(duplicateRows) === 0 && profileData.length >= 2 && tr > 0) {
                const top2 = [...profileData].sort((a, b) => parseInt(b.approx_unique) - parseInt(a.approx_unique)).slice(0, 2);
                const c1 = top2[0].column_name;
                const c2 = top2[1].column_name;
                const r = await dbManager.systemQuery(`SELECT (COUNT(*) = COUNT(DISTINCT (CAST("${c1}" AS VARCHAR), CAST("${c2}" AS VARCHAR)))) as is_key FROM (${cleanQuery}) __amox_ck`, opciones);
                const v = r[0]?.is_key;
                if (v === true || v === 1 || String(v).toLowerCase() === 'true') candidateKey = [c1, c2];
            }
        } catch (e) { /* candidate-key detection is best-effort */ }

        // Process Correlational Matrix
        let correlations = [];
        if (corrSelects.length > 0 && advancedStats) {
            for (let i = 0; i < numericCols.length; i++) {
                for (let j = i + 1; j < numericCols.length; j++) {
                    const c1 = numericCols[i];
                    const c2 = numericCols[j];
                    const key = `corr_${c1}_${c2}`;
                    if (advancedStats[key] !== undefined && advancedStats[key] !== null) {
                        correlations.push({ col1: c1, col2: c2, score: advancedStats[key] });
                    }
                }
            }
        }

        const end = performance.now();

        res.json({
            profile: profileData,
            visuals: visuals,
            advanced: advancedStats,
            global: {
                totalRows: Number(totalRows),
                duplicateRows: Number(duplicateRows)
            },
            candidateKey: candidateKey,
            correlations: correlations,
            executionTime: (end - start).toFixed(2)
        });
    } catch (err) {
        if (registro.cancelada) res.json({ cancelada: true });
        else res.status(500).json({ error: err.message });
    } finally {
        activeQueries.delete(qid);
    }
});

/* --- Data Export API (DuckDB COPY TO) --- */
app.post('/api/export-data', async (req, res) => {
    const { query, format, filename } = req.body;
    if (!query || !format || !filename) {
        return res.status(400).json({ error: 'query, format, and filename are required' });
    }

    const allowedFormats = ['csv', 'parquet', 'xlsx'];
    if (!allowedFormats.includes(format)) {
        return res.status(400).json({ error: `Unsupported format: ${format}. Use: ${allowedFormats.join(', ')}` });
    }

    // Security: ensure the resolved export path stays within the project root.
    // path.join + resolve prevents path traversal (e.g. "../../../etc/passwd").
    const resolvedRoot = path.resolve(ROOT_DIR);
    const fullPath = path.resolve(path.join(ROOT_DIR, filename)).replace(/\\/g, '/');
    if (!fullPath.startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Export path must be within the project directory.' });
    }
    const cleanQuery = query.trim().replace(/;+$/, '');

    try {
        let copyFormat;
        if (format === 'csv') copyFormat = "CSV";
        else if (format === 'parquet') copyFormat = "PARQUET";
        else if (format === 'xlsx') {
            try {
                // 5.11 (D3): the workbook is written by AmoxSQL, formatted from
                // the column types (dates, decimals, bold fixed header, filter,
                // widths). On the user's connection — the query may read a
                // notebook's temp views — and out of the query history.
                const { escribirLibro } = require('./xlsxEscribir');
                const usuario = { query: (sql) => dbManager.systemQuery(sql) };
                const nombre = path.basename(fullPath).replace(/\.xlsx$/i, '');
                const r = await escribirLibro(usuario, fullPath, [{ nombre, consulta: cleanQuery }]);
                return res.json({ success: true, path: filename, rowCount: r.hojas[0].filas });
            } catch (xlsxErr) {
                return res.status(500).json({ error: `Excel export failed: ${xlsxErr.message}` });
            }
        }

        // Count rows first
        const countResult = await dbManager.query(`SELECT COUNT(*) as cnt FROM (${cleanQuery}) t`);
        const rowCount = countResult[0]?.cnt || 0;

        // Execute COPY TO (Parquet doesn't accept HEADER)
        const copyOptions = format === 'csv' ? "(HEADER, DELIMITER ',')" : "(FORMAT PARQUET)";
        await dbManager.query(`COPY (${cleanQuery}) TO '${fullPath}' ${copyOptions}`);

        res.json({ success: true, path: filename, rowCount });
    } catch (err) {
        console.error("Export data failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// (Removed duplicate `/api/db/tables` endpoint from here to avoid conflicts)

/* --- Binary asset write (e.g. pasted images in the Markdown editor) --- */

/**
 * POST /api/files/write-binary
 * Writes a base64-encoded binary file inside the project root.
 * Body: { path, dataBase64 }  → path is project-relative (e.g. "assets/img.png")
 * Returns: { success, path }
 */
app.post('/api/files/write-binary', async (req, res) => {
    const { path: relPath, dataBase64 } = req.body;
    if (!relPath || !dataBase64) {
        return res.status(400).json({ error: 'path and dataBase64 are required' });
    }
    // Confine the resolved path to the project root (prevents path traversal).
    const resolvedRoot = path.resolve(ROOT_DIR);
    const fullPath = path.resolve(path.join(ROOT_DIR, relPath));
    if (!fullPath.replace(/\\/g, '/').startsWith(resolvedRoot.replace(/\\/g, '/'))) {
        return res.status(400).json({ error: 'Path must be within the project directory.' });
    }
    try {
        const b64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, Buffer.from(b64, 'base64'));
        res.json({ success: true, path: relPath.replace(/\\/g, '/') });
    } catch (err) {
        console.error('[write-binary]', err);
        res.status(500).json({ error: err.message });
    }
});


/* --- DuckDB Function Catalog API --- */
const AMOX_DIR = () => path.join(ROOT_DIR, '.amox');
const ensureAmoxDir = () => { if (!fs.existsSync(AMOX_DIR())) fs.mkdirSync(AMOX_DIR(), { recursive: true }); };

// Load curated docs (static, shipped with app)
const CURATED_DOCS_PATH = path.join(__dirname, 'data', 'duckdb-functions-docs.json');
const loadCuratedDocs = () => {
    try {
        if (fs.existsSync(CURATED_DOCS_PATH)) {
            return JSON.parse(fs.readFileSync(CURATED_DOCS_PATH, 'utf8'));
        }
    } catch (e) { console.error('[Functions] Error loading curated docs:', e.message); }
    return { functions: {} };
};

// Load introspection cache (per-project, in .amox/)
const CACHE_FILENAME = 'duckdb-functions-cache.json';
const loadFunctionsCache = () => {
    try {
        const cachePath = path.join(AMOX_DIR(), CACHE_FILENAME);
        if (fs.existsSync(cachePath)) {
            return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        }
    } catch (e) { console.error('[Functions] Error loading cache:', e.message); }
    return null;
};

// Auto-generate snippet from function name + parameters
const autoGenerateSnippet = (fn) => {
    if (!fn.parameters || fn.parameters.length === 0) {
        return `${fn.function_name}()`;
    }
    const params = fn.parameters.map((p, i) => `\${${i + 1}:${p || 'arg' + (i + 1)}}`).join(', ');
    return `${fn.function_name}(${params})`;
};

// Auto-generate doc from description + params/types
const autoGenerateDoc = (fn) => {
    let doc = fn.description || `\`${fn.function_name}\` function.`;
    if (fn.parameters && fn.parameters.length > 0 && fn.parameter_types && fn.parameter_types.length > 0) {
        doc += '\n\n**Parameters:**\n| Name | Type |\n|------|------|\n';
        for (let i = 0; i < fn.parameters.length; i++) {
            const name = fn.parameters[i] || `arg${i + 1}`;
            const type = fn.parameter_types[i] || 'ANY';
            doc += `| \`${name}\` | ${type} |\n`;
        }
    }
    return doc;
};

// POST /api/functions/refresh — Run duckdb_functions() and update cache
app.post('/api/functions/refresh', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT ON(function_name)
            function_name,
            function_type,
            return_type,
            parameters,
            parameter_types,
            description
        FROM duckdb_functions()
        ORDER BY function_name;`;

        const rows = await dbManager.query(sql);

        const cache = {
            _meta: {
                generatedAt: new Date().toISOString(),
                totalFunctions: rows.length
            },
            functions: rows.map(row => ({
                function_name: row.function_name,
                function_type: row.function_type,
                return_type: row.return_type,
                parameters: row.parameters || [],
                parameter_types: row.parameter_types || [],
                description: row.description || ''
            }))
        };

        ensureAmoxDir();
        const cachePath = path.join(AMOX_DIR(), CACHE_FILENAME);
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');

        res.json({ success: true, totalFunctions: cache.functions.length, generatedAt: cache._meta.generatedAt });
    } catch (err) {
        console.error('[Functions] Refresh error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/functions/catalog — Merge cache + curated docs
app.get('/api/functions/catalog', (req, res) => {
    try {
        const curated = loadCuratedDocs();
        const cache = loadFunctionsCache();

        // If no cache yet, return curated-only (with auto-generated base fields)
        if (!cache) {
            const catalog = Object.values(curated.functions || {}).map(fn => ({
                function_name: fn.function_name,
                function_type: fn.function_type || 'scalar',
                return_type: fn.return_type || '',
                parameters: fn.parameters || [],
                parameter_types: fn.parameter_types || [],
                description: fn.description || fn.doc || '',
                category: fn.category || '',
                snippet: fn.snippet || autoGenerateSnippet(fn),
                doc: fn.doc || '',
                examples: fn.examples || [],
                documented: true
            }));
            return res.json({ functions: catalog, source: 'curated-only' });
        }

        // Merge: cache as base, curated extends
        const curatedMap = curated.functions || {};
        const catalog = cache.functions.map(fn => {
            const name = fn.function_name;
            // Case-insensitive lookup: try exact, then lowercase, then uppercase
            const doc = curatedMap[name] || curatedMap[name.toLowerCase()] || curatedMap[name.toUpperCase()];

            if (doc) {
                return {
                    ...fn,
                    category: doc.category || '',
                    snippet: doc.snippet || autoGenerateSnippet(fn),
                    doc: doc.doc || autoGenerateDoc(fn),
                    examples: doc.examples || [],
                    documented: true
                };
            } else {
                return {
                    ...fn,
                    category: '',
                    snippet: autoGenerateSnippet(fn),
                    doc: autoGenerateDoc(fn),
                    examples: [],
                    documented: false
                };
            }
        });

        res.json({
            functions: catalog,
            source: 'merged',
            cacheGeneratedAt: cache._meta?.generatedAt
        });
    } catch (err) {
        console.error('[Functions] Catalog error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/functions/usage — cuánto usas cada función, según tu historial.
 *
 * El panel de funciones ordenaba 965 entradas por orden alfabético, así que
 * encontrar la que usas siempre costaba lo mismo que encontrar una que no has
 * usado nunca. Esto da la señal para arreglarlo.
 *
 * La fuente es amoxsql_ai.query_history: las queries que REALMENTE ejecutaste,
 * no lo que pulsaste en el panel. Vive dentro de la base del proyecto, así que
 * el uso es por proyecto — que es lo correcto: las funciones de un proyecto de
 * series temporales no son las de uno de texto.
 *
 * Se extrae todo lo que parezca una llamada `nombre(` y se cruza con el catálogo
 * real; así `IN (`, `VALUES (` y demás palabras clave se caen solas sin
 * necesidad de una lista negra que mantener.
 */
app.get('/api/functions/usage', async (req, res) => {
    try {
        const check = await dbManager.systemQuery(
            "SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'amoxsql_ai' AND table_name = 'query_history'"
        );
        if (!check[0] || check[0].cnt == 0) {
            return res.json({ counts: {}, recent: [], queriesScanned: 0 });
        }

        // 1000 entradas es el mismo tope que usa el panel de historial. El
        // historial se poda a 30 días, así que esto es "tus hábitos recientes",
        // no un ranking histórico — y para recomendar es lo que interesa.
        const rows = await dbManager.systemQuery(
            'SELECT query, executed_at FROM amoxsql_ai.query_history ORDER BY executed_at DESC LIMIT 1000'
        );

        // Nombres canónicos conocidos, indexados en minúscula para comparar.
        const conocidos = new Map();
        const cache = loadFunctionsCache();
        for (const fn of (cache?.functions || [])) {
            if (fn.function_name) conocidos.set(String(fn.function_name).toLowerCase(), fn.function_name);
        }
        for (const nombre of Object.keys(loadCuratedDocs().functions || {})) {
            if (!conocidos.has(nombre.toLowerCase())) conocidos.set(nombre.toLowerCase(), nombre);
        }

        const counts = {};
        const recent = [];
        const yaVisto = new Set();
        const LLAMADA = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;

        for (const row of rows) {
            const sql = String(row.query || '');
            let m;
            LLAMADA.lastIndex = 0;
            const enEstaQuery = new Set();
            while ((m = LLAMADA.exec(sql)) !== null) {
                const canonico = conocidos.get(m[1].toLowerCase());
                if (!canonico) continue;
                counts[canonico] = (counts[canonico] || 0) + 1;
                enEstaQuery.add(canonico);
            }
            // `rows` viene de la más reciente a la más antigua, así que el primer
            // encuentro de cada nombre ya es su uso más reciente.
            for (const nombre of enEstaQuery) {
                if (yaVisto.has(nombre)) continue;
                yaVisto.add(nombre);
                recent.push(nombre);
            }
        }

        res.json({ counts, recent, queriesScanned: rows.length });
    } catch (err) {
        console.error('[Functions] Usage error:', err);
        // El panel funciona sin esto: se queda sin la parte de "lo tuyo".
        res.json({ counts: {}, recent: [], queriesScanned: 0, degraded: true });
    }
});

// GET /api/functions/coverage — Doc coverage stats
app.get('/api/functions/coverage', (req, res) => {
    try {
        const curated = loadCuratedDocs();
        const cache = loadFunctionsCache();

        if (!cache) {
            return res.json({
                total: 0,
                documented: Object.keys(curated.functions || {}).length,
                cacheExists: false,
                undocumented: []
            });
        }

        const curatedMap = curated.functions || {};
        const total = cache.functions.length;
        const undocumented = [];

        cache.functions.forEach(fn => {
            const name = fn.function_name;
            if (!curatedMap[name] && !curatedMap[name.toLowerCase()] && !curatedMap[name.toUpperCase()]) {
                undocumented.push({
                    function_name: fn.function_name,
                    function_type: fn.function_type,
                    description: fn.description || ''
                });
            }
        });

        res.json({
            total,
            documented: total - undocumented.length,
            cacheExists: true,
            cacheGeneratedAt: cache._meta?.generatedAt,
            undocumented
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- El formato de la base abierta (6.0, O4) --- */

app.get('/api/db/formato', (req, res) => {
    res.json(require('./formatoDeBase').estado(dbManager));
});

app.post('/api/db/formato/actualizar', async (req, res) => {
    const formato = require('./formatoDeBase');
    try {
        const r = await formato.actualizar(dbManager);
        invalidateTableContextCache();
        res.json(r);
    } catch (e) {
        res.status(e instanceof formato.ErrorDeFormato ? 400 : 500).json({ error: e.message });
    }
});

/* --- Las variables del proyecto (6.0, Dec-98) --- */

app.get('/api/variables', (req, res) => {
    const raiz = PROYECTO_ABIERTO ? ROOT_DIR : null;
    const { variables, avisos } = variablesDelProyecto.leer(raiz);
    res.json({ variables, avisos, proyecto: !!raiz, tipos: variablesDelProyecto.TIPOS });
});

app.put('/api/variables', async (req, res) => {
    const raiz = PROYECTO_ABIERTO ? ROOT_DIR : null;
    try {
        variablesDelProyecto.guardar(raiz, req.body?.variables);
        const r = await variablesDelProyecto.montar(dbManager, raiz);
        invalidateTableContextCache();
        res.json({ variables: r.variables, avisos: r.avisos });
    } catch (e) {
        res.status(e instanceof variablesDelProyecto.ErrorDeVariable ? 400 : 500).json({ error: e.message });
    }
});

/* --- SQL Snippets API --- */

app.get('/api/snippets', (req, res) => {
    try {
        const file = path.join(AMOX_DIR(), 'snippets.json');
        if (!fs.existsSync(file)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/snippets', (req, res) => {
    try {
        ensureAmoxDir();
        const file = path.join(AMOX_DIR(), 'snippets.json');
        fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Query Bookmarks API --- */
app.get('/api/bookmarks', (req, res) => {
    try {
        const file = path.join(AMOX_DIR(), 'bookmarks.json');
        if (!fs.existsSync(file)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        res.json(data);
    } catch (err) {
        res.json([]);
    }
});

app.post('/api/bookmarks', (req, res) => {
    try {
        ensureAmoxDir();
        const file = path.join(AMOX_DIR(), 'bookmarks.json');
        fs.writeFileSync(file, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- Project Search API ---
 * Un solo recorrido del proyecto sirve la búsqueda global y el índice de
 * documentos: son la misma lectura. La lógica vive en projectSearch.js, con
 * sus categorías (fuente / datos de texto / binarios), su caché por mtime y
 * los extractores de los formatos propios.
 */
const projectSearch = require('./projectSearch');

app.get('/api/search', (req, res) => {
    const { q, scope, limit } = req.query;
    try {
        res.json(projectSearch.searchProject(ROOT_DIR, {
            q,
            scope: ['fuente', 'datos', 'todo'].includes(scope) ? scope : 'fuente',
            limit: Math.min(1000, parseInt(limit, 10) || 500),
        }));
    } catch (err) {
        console.error('Search failed:', err.message);
        res.status(500).json({ error: 'Search failed', details: err.message });
    }
});

app.get('/api/docs/index', (req, res) => {
    try {
        res.json(projectSearch.docsIndex(ROOT_DIR));
    } catch (err) {
        console.error('Failed to index documents:', err.message);
        res.status(500).json({ error: 'Failed to index documents', details: err.message });
    }
});

/* --- El gráfico de un .sql, recordado con el archivo (Dec-79) --- */
app.get('/api/borrador-grafico', (req, res) => {
    if (!req.query.path) return res.status(400).json({ error: 'Path is required' });
    try { res.json(borradores.leer(ROOT_DIR, req.query.path)); }
    catch (err) { res.json(null); }
});

app.post('/api/borrador-grafico', (req, res) => {
    const { path: ruta, cambios } = req.body || {};
    if (!ruta || cambios === undefined) return res.status(400).json({ error: 'Path and changes are required' });
    try { res.json({ success: true, borrador: borradores.poner(ROOT_DIR, ruta, cambios) }); }
    catch (err) { res.status(500).json({ error: 'Failed to keep the chart', details: err.message }); }
});

/* --- Notebook State Persistence API --- */
app.get('/api/notebook-state', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'Path is required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        if (!fs.existsSync(statePath)) return res.json(null);
        const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        res.json(data);
    } catch (err) {
        console.warn('Failed to read notebook state:', err.message);
        res.json(null);
    }
});

app.post('/api/notebook-state', async (req, res) => {
    const { path: filePath, state } = req.body;
    if (!filePath || !state) return res.status(400).json({ error: 'Path and state are required' });

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT_DIR, filePath);
    const statePath = fullPath + '.state.json';

    try {
        // Async write: sidecar state can carry MBs of cached results
        await fs.promises.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to write notebook state:', err.message);
        res.status(500).json({ error: 'Failed to write state', details: err.message });
    }
});

app.get('/api/schema', async (req, res) => {
    try {
        const tables = await dbManager.systemQuery(
            `SELECT table_schema as schema, table_name as name FROM ${esquemas.TABLAS} AS t WHERE ${userTablesWhereClause()} ORDER BY table_schema, table_name`
        );
        res.json(tables);
    } catch (err) {
        res.json([]);
    }
});


// DuckLake de primera clase (5.12, fase 8; I8, Dec-33).
const lagoRuta = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (e) { res.status(e instanceof require('./lago').ErrorDeLago ? 400 : 500).json({ error: String(e.message || e).split('\n')[0] }); }
};
app.post('/api/lago/crear', lagoRuta(async (req) => {
    if (!PROYECTO_ABIERTO) throw new (require('./lago').ErrorDeLago)('Open a project first: the lake is created in its folder.');
    return require('./lago').crear(ROOT_DIR, req.body || {});
}));
app.get('/api/lago/versiones', lagoRuta(async () => ({ lago: dbManager.isDuckLake, versiones: dbManager.isDuckLake ? await require('./lago').versiones(dbManager) : [] })));
app.post('/api/lago/como-estaba', lagoRuta(async (req) => ({ sql: require('./lago').comoEstaba(dbManager, req.body || {}) })));
app.post('/api/lago/que-cambio', lagoRuta(async (req) => ({ sql: require('./lago').queCambio(dbManager, req.body || {}) })));
app.post('/api/lago/mantenimiento/previsualizar', lagoRuta(async (req) => require('./lago').previsualizar(dbManager, req.body || {})));
app.post('/api/lago/mantenimiento', lagoRuta(async (req) => require('./lago').mantener(dbManager, req.body || {})));


// dbt dentro del editor (5.12, fase 3; I2, Dec-28).
const archivoDelProyecto = (a) => {
    if (!a) throw new Error('Which file?');
    const abs = path.resolve(ROOT_DIR, String(a));
    if (path.relative(ROOT_DIR, abs).startsWith('..')) throw new Error('That file is not in the project.');
    return abs;
};


const historialDeProcesos = require('./ejecucion/historial');
const { ejecutarProceso } = require('./ejecucion/ejecutarProceso');


// ─── Chart Gallery ─────────────────────────────────────────────────────────
const { seedGallery, registerGalleryRoutes } = require('./galleryManager');
seedGallery();
registerGalleryRoutes(app);

// ─── Graceful shutdown endpoint ───────────────────────────────────────────────
// Called by Electron's before-quit handler to close DuckDB connections cleanly
// before the process exits, preventing write corruption on abrupt termination.
// ─── La base de AmoxSQL (A5) ────────────────────────────────────────────────
// Se abre en segundo plano al arrancar. Quien la use la espera con abrir(), que
// no hace nada si ya está abierta; si no se pudo abrir, estado() dice por qué.

app.get('/api/central/estado', async (_req, res) => {
    try { await baseCentral.abrir(); } catch { /* el estado ya lo cuenta */ }
    res.json(baseCentral.estado());
});

/**
 * Los recientes de la 5.8 vivían en el localStorage del renderer. El cliente los
 * manda una vez; la base los convierte en proyectos y anota que ya lo hizo.
 */
app.post('/api/central/recientes', async (req, res) => {
    try {
        await baseCentral.abrir();
        res.json(await baseCentral.importarRecientes(req.body?.rutas));
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

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

app.get('/api/workspaces', conCentral(async (req) => ({
    workspaces: await workspaces.listar({ archivados: req.query.archivados === '1' }),
})));
app.post('/api/workspaces', conCentral(async (req) => workspaces.crear(req.body || {})));
app.get('/api/workspaces/:id', conCentral(async (req) => {
    const w = await workspaces.leer(req.params.id);
    if (!w) throw new Error('It does not exist.');
    return w;
}));
app.put('/api/workspaces/:id', conCentral(async (req) => {
    const w = await workspaces.actualizar(req.params.id, req.body || {});
    if (PROYECTO_ABIERTO) await workspaces.refrescarPolitica(ROOT_DIR);
    return w;
}));
app.post('/api/workspaces/:id/archivar', conCentral(async (req) =>
    workspaces.archivar(req.params.id, req.body?.archivado !== false)));
app.get('/api/workspaces/:id/proyectos', conCentral(async (req) => ({
    proyectos: await workspaces.proyectosDe(req.params.id),
})));

// Su contexto (B2): archivos de texto, editables sin proyecto abierto.
app.get('/api/workspaces/:id/contexto', conCentral(async (req) => ({
    archivos: await workspaces.archivosDeContexto(req.params.id),
})));
app.get('/api/workspaces/:id/contexto/archivo', conCentral(async (req) =>
    workspaces.leerArchivo(req.params.id, req.query.ruta)));
app.put('/api/workspaces/:id/contexto/archivo', conCentral(async (req) =>
    workspaces.escribirArchivo(req.params.id, req.body?.ruta, req.body?.texto)));
app.post('/api/workspaces/:id/contexto/subir-metrica', conCentral(async (req) => {
    if (!PROYECTO_ABIERTO) throw new Error('Open the project that has the metric.');
    return workspaces.subirMetrica(req.params.id, ROOT_DIR, req.body?.nombre);
}));
app.get('/api/project/marca', conCentral(async () => ({
    marca: PROYECTO_ABIERTO ? await workspaces.marcaDelProyecto(ROOT_DIR) : null,
})));
app.get('/api/project/metricas', (_req, res) => {
    res.json({ metricas: PROYECTO_ABIERTO ? workspaces.metricasDelProyecto(ROOT_DIR).map(m => ({ name: m.name, description: m.description })) : [] });
});

// La vista de workspaces (B3) y los proyectos que AmoxSQL conoce.
app.get('/api/inicio', conCentral(async () => workspaces.resumenInicio()));
app.get('/api/proyectos', conCentral(async (req) => ({ proyectos: await workspaces.buscarProyectos(req.query.q) })));
app.put('/api/proyectos/:id', conCentral(async (req) => workspaces.actualizarProyecto(req.params.id, req.body || {})));
app.put('/api/proyectos-enlace', conCentral(async (req) => {
    const r = await workspaces.enlazarRuta(req.body?.ruta, req.body?.workspaceId || null);
    if (PROYECTO_ABIERTO) await workspaces.refrescarPolitica(ROOT_DIR);
    remontarFuentes();
    return r;
}));

// Exportar e importar un workspace (B6): un .amoxworkspace sin credenciales.
app.get('/api/workspaces/:id/exportar', conCentral(async (req) => workspaces.exportar(req.params.id)));
app.post('/api/workspaces-importar/analizar', conCentral(async (req) => workspaces.analizarImportacion(req.body?.contenido)));
app.post('/api/workspaces-importar', conCentral(async (req) => {
    const r = await workspaces.importar(req.body?.contenido, req.body?.opciones || {});
    remontarFuentes();
    return r;
}));

// El enlace de la carpeta abierta: qué es, y cambiarlo.
app.get('/api/project/workspace', conCentral(async () => {
    if (!PROYECTO_ABIERTO) return { estado: 'sin_proyecto', preguntar: false };
    return workspaces.estadoDelEnlace(ROOT_DIR);
}));
app.put('/api/project/workspace', conCentral(async (req) => {
    if (!PROYECTO_ABIERTO) throw new Error('No project is open.');
    const { workspaceId = null, noPreguntar } = req.body || {};
    const r = await workspaces.enlazar(ROOT_DIR, workspaceId, { noPreguntar });
    await workspaces.refrescarPolitica(ROOT_DIR);
    remontarFuentes();
    return r;
}));


// La palabra: null mientras el usuario no la haya elegido (pantalla 1).
app.get('/api/preferencias/etiqueta', conCentral(async () => {
    const elegida = await workspaces.etiquetaElegida();
    const importados = (await baseCentral.preferencia('recientes_importados'))?.importados || 0;
    const [{ n }] = await baseCentral.query(`SELECT count(*)::INTEGER AS n FROM proyectos`);
    return {
        clave: elegida || workspaces.ETIQUETA_POR_DEFECTO,
        elegida: !!elegida,
        opciones: workspaces.ETIQUETAS,
        // Viene de la 5.8 si trajo proyectos de entonces: la pantalla 1 lo explica.
        actualizacion: importados > 0 || n > 0,
    };
}));
app.put('/api/preferencias/etiqueta', conCentral(async (req) => ({
    clave: await workspaces.elegirEtiqueta(req.body?.clave),
    elegida: true,
})));

// ─── El llavero (A1) ─────────────────────────────────────────────────────────
// Nombres, tipos y fechas; nunca valores.

// La purga del texto plano (5.9.0): qué se quitó de config.json, una vez.
app.get('/api/secretos/purga', async (_req, res) => {
    try { res.json({ purga: await secretos.avisoDePurga() }); } catch { res.json({ purga: null }); }
});
app.post('/api/secretos/purga/vista', async (_req, res) => {
    try { await secretos.marcarPurgaAvisada(); res.json({ ok: true }); } catch (err) { res.status(503).json({ error: err.message }); }
});

app.get('/api/secretos', async (_req, res) => {
    try {
        res.json({ modo: secretos.modo(), credenciales: await secretos.listar() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/secretos/:nombre', async (req, res) => {
    try {
        await secretos.borrar(req.params.nombre);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── El manifiesto del proyecto (A2) ────────────────────────────────────────

function anotarExtensionDelProyecto(nombre) {
    if (!PROYECTO_ABIERTO) return;
    try { manifiesto.anotarExtension(ROOT_DIR, nombre); }
    catch (e) { console.warn('[Manifiesto] No se pudo anotar la extensión:', e.message); }
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
                await medidas.montar(dbManager, raiz).catch(e => console.warn('[Medidas] No se pudieron montar:', e?.message || e));
                // 6.0 (Dec-98): las variables del proyecto, en cada carril (`$nombre`).
                await variablesDelProyecto.montar(dbManager, raiz).catch(e => console.warn('[Variables] No se pudieron montar:', e?.message || e));
                ultimoMontaje = { informe, esquemaHomonimo: raiz ? await fuentes.hayEsquemaHomonimo(meta) : false, en: new Date().toISOString() };
                invalidateTableContextCache();
                // C3: vigilar las carpetas de las fuentes de tipo carpeta.
                llegadas.vigilar(
                    informe.filter(i => i.carpeta).map(i => ({ fuente: i.nombre, ...i.carpeta })),
                    alLlegarUnArchivo
                );
            } catch (e) {
                console.warn('[Fuentes] No se pudo montar el catálogo:', e?.message || e);
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
        console.log(`[Fuentes] Llegó ${llegada.archivo} (${llegada.fuentes.join(', ')})`);
        for (const f of oyentesDeLlegadas) { try { f(aviso); } catch { /* un oyente roto no tumba a los demás */ } }
        // D8: lo programado «al llegar un archivo» a estas fuentes.
        if (PROYECTO_ABIERTO) require('./programacion/programador').alLlegar(llegada.fuentes, ROOT_DIR).catch(() => {});
    });
}

app.get('/api/fuentes/llegadas', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const enviar = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    enviar({ tipo: 'hola' });
    oyentesDeLlegadas.add(enviar);
    const latido = setInterval(() => res.write(': latido\n\n'), 30000);
    req.on('close', () => { clearInterval(latido); oyentesDeLlegadas.delete(enviar); });
});

/**
 * `CREATE TABLE x AS … fuentes."y" …` desde el editor: la tabla x guarda que
 * viene de la fuente y, y de qué archivo era entonces (C5, 4.1). Sólo si lee
 * UNA fuente: con varias, o mezclada con tablas, no hay un origen que contar.
 */
const CREA_TABLA = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)\s+AS\b/i;
async function anotarMaterializacion(sql) {
    if (!PROYECTO_ABIERTO) return;
    try {
        const m = CREA_TABLA.exec(String(sql || ''));
        if (!m) return;
        const usadas = fuentes.usadas(sql);
        if (usadas.length !== 1) return;
        const f = (await fuentes.listar({ raiz: ROOT_DIR })).fuentes.find(x => x.nombre === usadas[0]);
        if (!f) return;
        const archivos = f.tipo === 'carpeta'
            ? (f.actual && f.ubicacionAqui ? [path.join(f.ubicacionAqui, f.actual.nombre)] : [])
            : (f.ubicacionAqui && !/^[a-z][a-z0-9+.-]+:\/\//i.test(f.ubicacionAqui) ? [f.ubicacionAqui] : []);
        await procedencia.anotar(dbManager, m[1], {
            origen: 'fuente', fuente: f.nombre, archivos,
            hoja: f.excel?.hoja || null, hojas: f.excel?.hojas || null, rango: f.excel?.rango || null,
        });
    } catch (e) { console.warn('[Procedencia] Materialización sin anotar:', e.message); }
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
    } catch (e) { console.warn('[Manifiesto] No se pudieron anotar las fuentes:', e.message); }
}

/** Dónde vive lo que se pide: en el proyecto abierto, o en un workspace. */
function destinoDeFuente(req) {
    const b = { ...(req.query || {}), ...(req.body || {}) };
    if (b.workspaceId) return { workspaceId: String(b.workspaceId) };
    if (!PROYECTO_ABIERTO) throw new Error('Open a project or choose a workspace first.');
    return { raiz: ROOT_DIR };
}

app.get('/api/fuentes', conCentral(async (req) => {
    if (req.query.workspaceId) return fuentes.listar({ workspaceId: String(req.query.workspaceId) });
    if (!PROYECTO_ABIERTO) return { workspaceId: null, fuentes: [], invalidas: [] };
    if (montandoFuentes) await montandoFuentes;
    const r = await fuentes.listar({ raiz: ROOT_DIR });
    const porNombre = new Map(ultimoMontaje.informe.map(i => [i.nombre, i]));
    return {
        ...r,
        fuentes: r.fuentes.map(f => ({ ...f, error: porNombre.get(f.nombre)?.error || null })),
        esquemaHomonimo: ultimoMontaje.esquemaHomonimo,
    };
}));

app.post('/api/fuentes', conCentral(async (req) => {
    const destino = destinoDeFuente(req);
    const { anterior = null } = req.body || {};
    let { definicion, ubicacionAqui } = req.body || {};
    // Un archivo DENTRO del proyecto, en una fuente del proyecto: la ruta va en
    // la definición, relativa, y vale igual en todas las máquinas. Sin registrar.
    if (destino.raiz && ubicacionAqui && path.isAbsolute(ubicacionAqui)) {
        const rel = path.relative(destino.raiz, ubicacionAqui);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            definicion = { ...definicion, ubicacion: rel.split(path.sep).join('/') };
            ubicacionAqui = null;
        }
    }
    const def = await fuentes.guardar(destino, definicion, { anterior });
    if (ubicacionAqui !== undefined) await fuentes.ubicar(destino, def.nombre, ubicacionAqui || null);
    await remontarFuentes();
    return { fuente: def };
}));

app.delete('/api/fuentes/:nombre', conCentral(async (req) => {
    await fuentes.borrar(destinoDeFuente(req), req.params.nombre);
    await remontarFuentes();
    return { ok: true };
}));

// 5.14 (G2 + G3, Dec-47 y Dec-48): el paquete de un proyecto (.amoxproject).
const paquete = require('./paquete');
const conPaquete = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (err) { res.status(err instanceof paquete.ErrorDePaquete ? 400 : 500).json({ error: err.message }); }
};
app.get('/api/proyecto/paquete', conPaquete(async () => {
    if (!PROYECTO_ABIERTO) throw new paquete.ErrorDePaquete('Open a project first.');
    return paquete.contenido(ROOT_DIR);
}));
app.post('/api/proyecto/exportar', conPaquete(async (req) => {
    if (!PROYECTO_ABIERTO) throw new paquete.ErrorDePaquete('Open a project first.');
    const { destino, incluir = null, plantilla = false } = req.body || {};
    if (!destino || !path.isAbsolute(destino)) throw new paquete.ErrorDePaquete('Choose where to save the package.');
    const ruta = /\.amoxproject$/i.test(destino) ? destino : `${destino}.amoxproject`;
    return paquete.exportar(ROOT_DIR, ruta, { incluir, plantilla });
}));
app.post('/api/paquete/leer', conPaquete(async (req) => paquete.leer(String(req.body?.ruta || ''))));
app.post('/api/proyecto/desde-paquete', conPaquete(async (req) => {
    const { paquete: ruta, carpeta } = req.body || {};
    if (!ruta || !carpeta || !path.isAbsolute(String(carpeta))) throw new paquete.ErrorDePaquete('Choose the package and a new folder for the project.');
    const r = paquete.extraer(String(ruta), String(carpeta));
    // Lo que le falta en esta máquina (A2): credenciales, extensiones y fuentes.
    let comprobado = null;
    try { comprobado = await manifiesto.comprobar(r.raiz, dbManager, aiManager.getConfig()); } catch { /* se verá al abrirlo */ }
    return { ...r, faltan: comprobado?.faltan || null, completo: comprobado ? comprobado.completo : null };
}));

// 5.14 (F5, Dec-46): «Donde lo dejaste», al abrir un proyecto.
let aperturaAnterior = { ruta: null, cuando: null, lista: false };
app.get('/api/proyecto/retomar', conCentral(async () => {
    if (!PROYECTO_ABIERTO) return { hayAlgo: false };
    // El registro de la apertura va sin esperar; si aún no terminó, un momento.
    for (let i = 0; i < 40 && !aperturaAnterior.lista; i++) await new Promise(r => setTimeout(r, 50));
    const desde = aperturaAnterior.ruta && path.resolve(aperturaAnterior.ruta) === path.resolve(ROOT_DIR) ? aperturaAnterior.cuando : null;
    return require('./retomar').resumen({ base: baseCentral, raiz: ROOT_DIR, desde, git: gitManager });
}));

// 5.14 (G1, Dec-49): la biblioteca del workspace del proyecto abierto, en
// `<home>/workspaces/<id>/snippets.json` (viaja con el .amoxworkspace).
function workspaceDelAbierto() {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, '.amoxsql', 'project.json'), 'utf8'))?.workspace || null; } catch { return null; }
}
app.get('/api/snippets/workspace', conCentral(async () => {
    const ws = PROYECTO_ABIERTO ? workspaceDelAbierto() : null;
    if (!ws?.id) return { workspace: null, snippets: [] };
    const { texto } = await workspaces.leerArchivo(ws.id, 'snippets.json');
    let snippets = [];
    try { snippets = texto ? JSON.parse(texto) : []; } catch { snippets = []; }
    return { workspace: { id: ws.id, nombre: ws.nombre || null }, snippets: Array.isArray(snippets) ? snippets : [] };
}));
app.post('/api/snippets/workspace', conCentral(async (req) => {
    const ws = PROYECTO_ABIERTO ? workspaceDelAbierto() : null;
    if (!ws?.id) throw new Error('This project is not in a workspace: its snippets can only be saved in the project.');
    const lista = Array.isArray(req.body) ? req.body : [];
    const limpia = lista.filter(s => s && typeof s.name === 'string' && typeof s.sql === 'string')
        .map(s => ({ name: s.name.slice(0, 120), sql: s.sql, ...(s.description ? { description: String(s.description).slice(0, 300) } : {}) }));
    await workspaces.escribirArchivo(ws.id, 'snippets.json', JSON.stringify(limpia, null, 2));
    return { ok: true, snippets: limpia.length };
}));

// 5.14 (F3, Dec-52): la entrega anterior de un archivo y la comparación.
app.get('/api/entregas', async (req, res) => {
    try {
        const d = entregas.deCopia(req.query.copia);
        let clave = null;
        if (d.actual) { try { clave = await entregas.claveSugerida(dbManager, d.ruta); } catch { /* sin sugerencia */ } }
        res.json({ ...d, clave });
    } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/entregas/comparar', async (req, res) => {
    try {
        const { copia, clave } = req.body || {};
        const d = entregas.deCopia(copia);
        if (!d.actual) throw new Error(`${path.basename(d.ruta)} is no longer there.`);
        res.json(await entregas.comparar(dbManager, { actual: d.ruta, anterior: path.resolve(copia), clave: Array.isArray(clave) ? clave : (clave ? [clave] : []) }));
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// 5.14 (J9, Dec-53): qué cambió en un proceso, en pasos y no en JSON. `antes`:
// HEAD (el último commit) o index (lo preparado); `despues`: index o el disco.
app.get('/api/procesos/cambios', async (req, res) => {
    try {
        const rel = String(req.query.ruta || '');
        const abs = path.resolve(ROOT_DIR, rel);
        // 5.15: también un Canvas, con la misma forma.
        if (!/\.(sqlchain|amoxcanvas)$/i.test(rel) || path.relative(ROOT_DIR, abs).startsWith('..')) throw new Error('Only a process or a canvas of this project can be compared.');
        const relGit = path.relative(ROOT_DIR, abs);
        const antes = await gitManager.getFileAt(ROOT_DIR, relGit, req.query.antes === 'index' ? 'index' : 'HEAD');
        const despues = req.query.despues === 'index'
            ? await gitManager.getFileAt(ROOT_DIR, relGit, 'index')
            : (fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);
        const diffDeProcesos = require('./diffDeProcesos');
        const d = /\.amoxcanvas$/i.test(rel) ? diffDeProcesos.diferenciasDeLienzo(antes, despues) : diffDeProcesos.diferencias(antes, despues);
        res.json({ ...d, lineas: diffDeProcesos.describir(d), nuevo: antes == null, borrado: despues == null });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// 5.14 (J1, Dec-51): mirar otro proyecto del workspace, su base en sólo lectura.
app.get('/api/proyecto/hermanos', conCentral(async () => {
    if (!PROYECTO_ABIERTO) return { workspace: null, proyectos: [] };
    return hermanos.listar(dbManager, { raiz: ROOT_DIR });
}));
app.post('/api/proyecto/hermanos/mirar', conCentral(async (req) => {
    if (!PROYECTO_ABIERTO) throw new Error('Open a project first.');
    return hermanos.mirar(dbManager, { raiz: ROOT_DIR, ruta: String(req.body?.ruta || '') });
}));
app.post('/api/proyecto/hermanos/soltar', conCentral(async (req) => hermanos.soltar(dbManager, String(req.body?.alias || ''))));
app.get('/api/proyecto/hermanos/tablas', conCentral(async (req) => ({ tablas: await hermanos.tablas(dbManager, String(req.query.alias || '')) })));


// 5.13 (E1 reducida, Dec-41): las medidas del workspace y del proyecto, con su
// llamada (`venta_neta(importe, estado)`) o por qué no se pudo crear. Si los
// metrics.yml cambiaron desde la última vez, se vuelven a montar.
app.get('/api/medidas', async (_req, res) => {
    try {
        if (!PROYECTO_ABIERTO) return res.json({ medidas: [] });
        res.json({ medidas: await medidas.actuales(dbManager, ROOT_DIR) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5.13 (E2 + E3): el contrato de una fuente. «Check» lo comprueba ahora mismo;
// «Take today's columns» lo propone con lo que trae hoy (Dec-40).
app.post('/api/fuentes/:nombre/comprobar', conCentral(async (req) => {
    const l = await fuentes.localizar(destinoDeFuente(req), req.params.nombre);
    if (!l) throw new Error(`The source "${req.params.nombre}" does not exist.`);
    // El contrato que se está editando, sin guardar todavía; si no, el guardado.
    const def = req.body?.contrato !== undefined ? { ...l.def, contrato: require('./contrato').normalizar(req.body.contrato) } : l.def;
    if (!def.contrato) return { ok: true, sinContrato: true, fallos: [] };
    const r = await fuentes.comprobarContrato(dbManager.lane('meta'), def, l.ubicacion);
    return { ...r, linea: r.ok ? null : require("./contrato").linea(def.nombre, r) };
}));

app.post('/api/fuentes/:nombre/contrato/de-hoy', conCentral(async (req) => {
    const l = await fuentes.localizar(destinoDeFuente(req), req.params.nombre);
    if (!l) throw new Error(`The source "${req.params.nombre}" does not exist.`);
    return { contrato: await fuentes.contratoDeHoy(dbManager.lane('meta'), l.def, l.ubicacion) };
}));

app.put('/api/fuentes/:nombre/ubicacion', conCentral(async (req) => {
    const ubicacion = await fuentes.ubicar(destinoDeFuente(req), req.params.nombre, req.body?.ubicacion || null);
    await remontarFuentes();
    return { ubicacion };
}));

// ── Lo programado (5.11, D1) ─────────────────────────────────────────────────
// Las programaciones son de esta máquina (Dec-15). Ver server/programacion/.
const programaciones = require('./programacion/programaciones');
const programador = require('./programacion/programador');
const reglasDeProgramacion = require('./programacion/reglas');
const calendarioDeTrabajo = require('./programacion/calendario');

// 5.12 (I10): un comando de dbt («dbt build …») no es una ruta.
const rutaDeProceso = (proceso, proyecto) => (/^dbt\s/.test(String(proceso)) ? String(proceso) : path.isAbsolute(String(proceso)) ? String(proceso) : path.resolve(proyecto, String(proceso)));
const tras = async (r) => { programador.anunciarProxima(); return r; };

app.get('/api/programaciones', conCentral(async (req) => {
    let lista = await programaciones.listar();
    if (req.query.proceso && PROYECTO_ABIERTO) {
        const abs = rutaDeProceso(req.query.proceso, ROOT_DIR);
        lista = lista.filter(p => (/^dbt\s/.test(abs) ? /^dbt\s/.test(p.proceso) && path.resolve(p.proyecto) === path.resolve(ROOT_DIR) : path.resolve(p.proceso) === path.resolve(abs)));
    }
    return {
        programaciones: lista,
        pausaGeneral: await programaciones.pausaGeneral(),
        sistema: { activo: (await baseCentral.preferencia('programador_sistema')) === true, soportado: process.platform === 'win32' },
        alAbrir: programador.alAbrir(),
    };
}));

app.post('/api/programaciones', conCentral(async (req) => {
    const b = req.body || {};
    const proyecto = b.proyecto || (PROYECTO_ABIERTO ? ROOT_DIR : null);
    if (!proyecto) throw new Error('Open the project of the process first.');
    return tras({ programacion: await programaciones.crear({ ...b, proyecto, proceso: rutaDeProceso(b.proceso, proyecto) }) });
}));

app.put('/api/programaciones/pausa', conCentral(async (req) => tras({ pausaGeneral: await programaciones.pausaGeneral(req.body?.hasta || null) })));

app.put('/api/programaciones/sistema', conCentral(async (req) => {
    await baseCentral.guardarPreferencia('programador_sistema', req.body?.activo === true);
    return tras({ activo: req.body?.activo === true, soportado: process.platform === 'win32' });
}));

app.post('/api/programaciones/vista-previa', conCentral(async (req) => {
    const { regla, workspaceId = null } = req.body || {};
    try {
        const ws = workspaceId || (PROYECTO_ABIERTO ? programaciones.workspaceDe(ROOT_DIR) : null);
        const cal = calendarioDeTrabajo.leer(ws);
        return {
            descripcion: reglasDeProgramacion.describir(regla),
            proximas: reglasDeProgramacion.proximas(regla, new Date(), cal, 5).map(d => d.toISOString()),
            calendarioPropio: cal.propio,
        };
    } catch (e) {
        return { error: e.message, proximas: [] };
    }
}));

app.put('/api/programaciones/:id', conCentral(async (req) => tras({ programacion: await programaciones.actualizar(req.params.id, req.body || {}) })));
app.delete('/api/programaciones/:id', conCentral(async (req) => { await programaciones.borrar(req.params.id); return tras({ ok: true }); }));
app.post('/api/programaciones/:id/pausar', conCentral(async (req) => tras({ programacion: await programaciones.pausar(req.params.id, { hasta: req.body?.hasta || undefined, reanudar: !!req.body?.reanudar }) })));

// «Run now»: una ocurrencia a mano, que queda en su historial como las demás.
app.post('/api/programaciones/:id/correr', conCentral(async (req) => {
    const prog = await programaciones.leer(req.params.id);
    if (!prog) throw new Error('That schedule does not exist.');
    return programador.correrOcurrencia(prog, new Date().toISOString(), { origen: 'programada' });
}));

// ── El panel de operación (5.11, D7) ─────────────────────────────────────────
// Todo lo programado, de todos los workspaces, en un sitio: lo de hoy (lo que
// corrió y lo que falta), lo de mañana, las programaciones y la bitácora.
app.get('/api/operacion', conCentral(async (req) => {
    const ahora = new Date();
    const dia = (d, n = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const hoy0 = dia(ahora), manana0 = dia(ahora, 1), pasado0 = dia(ahora, 2);
    const dos = (n) => String(n).padStart(2, '0');
    const localSql = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} 00:00:00`;
    const ws = new Map((await baseCentral.query(`SELECT id, nombre, color FROM workspaces`)).map(w => [w.id, w]));
    const pausa = await programaciones.pausaGeneral();
    const lista = (await programaciones.listar()).map(p => ({
        ...p, workspaceNombre: ws.get(p.workspaceId)?.nombre || null, workspaceColor: ws.get(p.workspaceId)?.color || null,
        proyectoNombre: path.basename(p.proyecto || ''),
    }));
    // Lo que falta hoy y lo de mañana: las ocurrencias de cada una, salvo pausas.
    const pendientes = [];
    for (const p of lista) {
        if (!p.activa || p.regla?.tipo === 'al_llegar') continue;
        const cal = calendarioDeTrabajo.leer(p.workspaceId);
        let occ = [];
        try { occ = reglasDeProgramacion.ocurrencias(p.regla, ahora, new Date(pasado0.getTime() - 1), cal, 200); } catch { continue; }
        for (const t of occ) {
            if (p.pausadaHasta && new Date(p.pausadaHasta) > t) continue;
            pendientes.push({ programacionId: p.id, nombre: p.nombre, workspaceNombre: p.workspaceNombre, workspaceColor: p.workspaceColor, cuando: t.toISOString(), pausadaGeneral: !!(pausa && new Date(pausa) > t), manana: t >= manana0 });
        }
    }
    pendientes.sort((a, b) => a.cuando.localeCompare(b.cuando));
    const resumenDe = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
    const fila = (e) => {
        const p = lista.find(x => x.id === e.programacion_id);
        const r = resumenDe(e.resumen);
        return {
            id: e.id, estado: e.estado, origen: e.origen, inicio: e.inicio, fin: e.fin, error: e.error,
            nombre: p?.nombre || r?.nombre || path.basename(e.proceso || '').replace(/\.sqlchain$/i, ''),
            proyectoNombre: path.basename(e.proyecto || ''), workspaceNombre: ws.get(e.workspace_id)?.nombre || null,
            workspaceColor: ws.get(e.workspace_id)?.color || null, programacionId: e.programacion_id || null,
            prevista: horaUtc(e.prevista), linea: r?.linea || null,
        };
    };
    const hoyCorridas = (await baseCentral.query(
        `SELECT * FROM ejecuciones WHERE programacion_id IS NOT NULL AND inicio >= CAST($1 AS TIMESTAMP) ORDER BY inicio`, [localSql(hoy0)]
    )).map(fila);
    const limite = Math.min(Number(req.query.limite) || 150, 500);
    const bitacora = (await baseCentral.query(`SELECT * FROM ejecuciones ORDER BY inicio DESC LIMIT ${limite}`)).map(fila);
    return {
        ahora: ahora.toISOString(),
        hoy: { corridas: hoyCorridas, pendientes: pendientes.filter(x => !x.manana) },
        manana: { pendientes: pendientes.filter(x => x.manana) },
        programaciones: lista,
        bitacora,
        pausaGeneral: pausa,
        // 5.13 (Dec-45): lo que falló y nadie ha mirado, no sólo lo de hoy.
        atencion: (await atencion.listar(baseCentral).catch(() => [])).length,
        // 5.13 (Dec-42): cuánto puede usar lo de fondo mientras se trabaja.
        limites: { ...(await require('./ejecucion/limites').preferencias()), nucleos: require('os').cpus()?.length || 2, memoriaGb: Math.round(require('os').totalmem() / 1073741824) },
        sistema: { activo: (await baseCentral.preferencia('programador_sistema')) === true, soportado: process.platform === 'win32' },
    };
}));

// 5.13 (Dec-44): de cuándo son los datos de una consulta (el pie de Report Flow).
app.post('/api/fecha-de-los-datos', async (req, res) => {
    try {
        res.json(await require('./ejecucion/fechaDeLosDatos').deConsulta(dbManager.lane('meta'), req.body?.query || '', PROYECTO_ABIERTO ? ROOT_DIR : null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5.13 (Dec-42): los límites de lo que corre de fondo con la aplicación abierta.
app.put('/api/preferencias/limites-fondo', conCentral(async (req) => require('./ejecucion/limites').guardarPreferencias(req.body || {})));

// ── Lo que falló y nadie ha mirado (5.13, Dec-45) ────────────────────────────
// La bienvenida (todas) y la ficha de cada workspace (las suyas). Ver
// server/ejecucion/atencion.js.
const atencion = require('./ejecucion/atencion');

app.get('/api/operacion/atencion', conCentral(async (req) => ({
    atencion: await atencion.listar(baseCentral, { workspaceId: req.query.workspace ? String(req.query.workspace) : null }),
})));

app.post('/api/operacion/atencion/vista', conCentral(async (req) => {
    await atencion.marcarVistas(baseCentral, req.body?.ids || []);
    return { ok: true };
}));

// ── La ficha de una ejecución (5.11, D2) ─────────────────────────────────────
// Lo que pasó en una ejecución, para quien llega desde un aviso, la bitácora o
// el panel de operación: pasos, lo que leyó y dejó, sus parámetros y de dónde vino.
const horaUtc = (t) => (t ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? String(t) : `${String(t).replace(' ', 'T')}Z`).toISOString() : null);

app.get('/api/ejecuciones/:id', conCentral(async (req) => {
    const [e] = await baseCentral.query(`SELECT * FROM ejecuciones WHERE id = $1`, [req.params.id]);
    if (!e) throw new Error('That run does not exist in the history.');
    // 5.12 (Dec-34): una ejecución de dbt; sus pasos son sus modelos y tests.
    if (dbtEjecutar.esDeDbt(e.proceso)) {
        let r = null;
        try { r = e.resumen ? JSON.parse(e.resumen) : null; } catch { /* sin resumen */ }
        let programacion = null;
        if (e.programacion_id) {
            const p = await programaciones.leer(e.programacion_id).catch(() => null);
            programacion = p ? { id: p.id, nombre: p.nombre, descripcion: p.descripcion } : { id: e.programacion_id, borrada: true };
        }
        const OK = new Set(['success', 'pass']);
        return {
            ejecucion: { id: e.id, proceso: e.proceso, proyecto: e.proyecto, origen: e.origen, estado: e.estado, inicio: e.inicio, fin: e.fin, error: e.error, parametros: {}, prevista: horaUtc(e.prevista) },
            programacion, dbt: true, resumen: r, procesoEnProyecto: null,
            pasos: (r?.nodos || []).map(n => ({ nodo: n.nombre, tipo: n.tipo, estado: OK.has(n.estado) ? 'success' : ['error', 'fail'].includes(n.estado) ? 'failed' : n.estado, ms: Math.round((n.segundos || 0) * 1000), filas: null, error: ['error', 'fail', 'warn'].includes(n.estado) ? (n.mensaje || n.estado) : null })),
        };
    }
    const { nodeRuns } = await historialDeProcesos.leer({ base: baseCentral, dbManager, runId: e.id });
    const pasos = [...nodeRuns].sort((a, b) => String(a.started_at || a.finished_at || '').localeCompare(String(b.started_at || b.finished_at || ''))).map(n => {
        let s = {};
        try { s = JSON.parse(n.result_summary || '{}'); } catch { /* sin resumen */ }
        return { nodo: n.node_label || n.node_id, tipo: n.node_type, estado: n.status, ms: n.duration_ms, filas: s.rowCount ?? null, error: n.error_message || null, reintentos: s.reintentos || 0 };
    });
    const resumen = await require('./ejecucion/resumen').resumir({ base: baseCentral, dbManager, runId: e.id, proyecto: e.proyecto }).catch(() => null);
    let programacion = null;
    if (e.programacion_id) {
        const p = await programaciones.leer(e.programacion_id).catch(() => null);
        programacion = p ? { id: p.id, nombre: p.nombre, descripcion: p.descripcion } : { id: e.programacion_id, borrada: true };
    }
    let parametros = {};
    try { parametros = JSON.parse(e.parametros || '{}'); } catch { /* sin parámetros */ }
    // Si es del proyecto abierto, la interfaz puede abrir el proceso.
    let procesoEnProyecto = null;
    if (PROYECTO_ABIERTO && e.proyecto && path.resolve(e.proyecto) === path.resolve(ROOT_DIR) && e.proceso) {
        const rel = path.relative(ROOT_DIR, e.proceso);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) procesoEnProyecto = rel.split(path.sep).join('/');
    }
    return {
        ejecucion: {
            id: e.id, proceso: e.proceso, proyecto: e.proyecto, origen: e.origen, estado: e.estado,
            inicio: e.inicio, fin: e.fin, error: e.error, parametros, prevista: horaUtc(e.prevista),
        },
        programacion, pasos, resumen, procesoEnProyecto,
        // 5.13 (Dec-42): con qué límites corrió de fondo, si los llevó.
        limites: (() => { try { return JSON.parse(e.resumen || 'null')?.limites || null; } catch { return null; } })(),
    };
}));

// «Run again»: el mismo proceso con los mismos valores. Una ocurrencia
// programada se repite como tal (queda en el historial de su programación).
app.post('/api/ejecuciones/:id/repetir', conCentral(async (req) => {
    const [e] = await baseCentral.query(`SELECT * FROM ejecuciones WHERE id = $1`, [req.params.id]);
    if (!e) throw new Error('That run does not exist in the history.');
    if (e.programacion_id) {
        const prog = await programaciones.leer(e.programacion_id);
        if (prog) return programador.correrOcurrencia(prog, horaUtc(e.prevista) || new Date().toISOString(), { origen: 'programada' });
    }
    // 5.12: un comando de dbt se repite tal cual, en su proyecto.
    if (dbtEjecutar.esDeDbt(e.proceso)) {
        const { args } = dbtCorrer.analizarComando(e.proceso);
        const r = await dbtEjecutar.ejecutarDbt({ base: baseCentral, dbManager: e.proyecto && path.resolve(e.proyecto) === path.resolve(ROOT_DIR) ? dbManager : null, raiz: e.proyecto, args, env: await dbtFuentes.variables(e.proyecto).catch(() => ({})), origen: e.origen === 'interfaz' ? 'interfaz' : 'linea_de_comandos' });
        return { runId: r.runId, estado: r.resumen.estado === 'fallo' ? 'fallo' : 'ok', error: r.resumen.estado === 'fallo' ? r.resumen.linea : null };
    }
    if (!e.proceso || !fs.existsSync(e.proceso)) throw new Error(`The process is no longer there: ${e.proceso}`);
    const cadena = JSON.parse(fs.readFileSync(e.proceso, 'utf8'));
    let parametros = {};
    try { parametros = JSON.parse(e.parametros || '{}'); } catch { /* sin parámetros */ }
    const r = await ejecutarProceso({
        dbManager, chainDef: cadena, proyecto: e.proyecto, chainFile: path.relative(e.proyecto, e.proceso),
        variables: { ...(cadena.variables || {}), ...parametros }, origen: e.origen === 'interfaz' ? 'interfaz' : 'linea_de_comandos',
    });
    return { runId: r.runId || null, estado: r.status === 'completed' ? 'ok' : 'fallo', error: r.error || null };
}));

app.get('/api/calendario', conCentral(async (req) => {
    const ws = req.query.workspaceId || (PROYECTO_ABIERTO ? programaciones.workspaceDe(ROOT_DIR) : null);
    return { workspaceId: ws, calendario: calendarioDeTrabajo.leer(ws) };
}));
app.put('/api/calendario', conCentral(async (req) => {
    const ws = req.body?.workspaceId;
    if (!ws) throw new Error('The calendar belongs to a group of projects: choose one.');
    const cal = calendarioDeTrabajo.guardar(ws, req.body?.calendario || {});
    return tras({ workspaceId: ws, calendario: cal });
}));

// ── Destinos de entrega (5.11, D6) ──────────────────────────────────────────
// Las mismas dos mitades que una fuente: la definición viaja, la carpeta de
// esta máquina va a la base de AmoxSQL. Ver server/destinos.js.
const destinosDeEntrega = require('./destinos');

app.get('/api/destinos', conCentral(async (req) => {
    if (req.query.workspaceId) return { destinos: await destinosDeEntrega.listar({ workspaceId: String(req.query.workspaceId) }) };
    if (!PROYECTO_ABIERTO) return { destinos: [] };
    return { destinos: await destinosDeEntrega.listar({ raiz: ROOT_DIR }) };
}));

app.post('/api/destinos', conCentral(async (req) => {
    const donde = destinoDeFuente(req);
    let { definicion, ubicacionAqui } = req.body || {};
    // Una carpeta dentro del proyecto, en un destino del proyecto: relativa y en
    // la definición, como las fuentes.
    if (donde.raiz && ubicacionAqui && path.isAbsolute(ubicacionAqui)) {
        const rel = path.relative(donde.raiz, ubicacionAqui);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            definicion = { ...definicion, ubicacion: rel.split(path.sep).join('/') };
            ubicacionAqui = null;
        }
    }
    const def = await destinosDeEntrega.guardar(donde, definicion);
    if (ubicacionAqui !== undefined) await destinosDeEntrega.ubicar(donde, def.nombre, ubicacionAqui || null);
    return { destino: def };
}));

app.delete('/api/destinos/:nombre', conCentral(async (req) => {
    await destinosDeEntrega.borrar(destinoDeFuente(req), req.params.nombre);
    return { ok: true };
}));

app.put('/api/destinos/:nombre/ubicacion', conCentral(async (req) => {
    return { ubicacion: await destinosDeEntrega.ubicar(destinoDeFuente(req), req.params.nombre, req.body?.ubicacion || null) };
}));

/**
 * Probar una definición sin guardarla: las primeras filas y las columnas. Va en
 * una instancia aparte, en memoria, para no dejar nada en la sesión.
 */
app.post('/api/fuentes/probar', async (req, res) => {
    let inst = null;
    try {
        const def = fuentes.normalizarDefinicion(req.body?.definicion);
        const ubicacion = req.body?.ubicacion || def.ubicacion;
        if (!ubicacion) throw new Error('Choose where the file is first.');
        const { DuckDBInstance } = require('@duckdb/node-api');
        inst = await require('./motor').crearInstancia(':memory:');
        const con = await inst.connect();
        const donde = path.isAbsolute(ubicacion) || /^[a-z0-9]+:\/\//i.test(ubicacion) ? ubicacion : path.resolve(ROOT_DIR, ubicacion);
        // Un bucket o un lago: su credencial (con SCOPE) o su DuckLake, antes de leer (C4).
        try {
            for (const s of await fuentes.preparar(def, donde)) await con.run(s);
        } catch (e) {
            throw new Error(fuentes.explicarNube(e, def, donde));
        }
        const lectura = fuentes.sqlDeLectura(def, await fuentes.ubicacionEfectiva({ query: async (sql) => (await con.run(sql)).getRowObjectsJson() }, def, donde));
        // «Probar la conexión» (5.4): lo que falla en un bucket o un lago se dice
        // con nombre (credencial, permiso, ruta, extensión), no con el error del motor.
        const nube = def.tipo === 'bucket' || def.tipo === 'lago';
        let columnas, filas;
        try {
            columnas = (await (await con.run(`DESCRIBE ${lectura}`)).getRowObjectsJson())
                .map(c => ({ nombre: c.column_name, tipo: c.column_type }));
            filas = await (await con.run(`${lectura} LIMIT 20`)).getRowObjectsJson();
        } catch (e) {
            throw nube ? new Error(fuentes.explicarNube(e, def, donde)) : e;
        }
        con.closeSync();
        res.json({ columnas, filas });
    } catch (err) {
        res.status(400).json({ error: String(err?.message || err).split('\n')[0] });
    } finally {
        try { inst?.closeSync(); } catch { /* ya cerrada */ }
    }
});

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

app.get('/api/fuentes/columnas', async (_req, res) => {
    try {
        res.json({ fuentes: await columnasDeFuentes() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Lo que hay ahora en una carpeta con un patrón (el formulario de una fuente de tipo carpeta). */
app.get('/api/fuentes/carpeta', (req, res) => {
    const dir = String(req.query.dir || '');
    const abs = path.isAbsolute(dir) ? dir : path.resolve(ROOT_DIR, dir);
    try {
        if (!fs.statSync(abs).isDirectory()) return res.status(400).json({ error: 'That is not a folder.' });
    } catch {
        return res.status(404).json({ error: 'That folder is not there.' });
    }
    const todos = fuentes.archivosDeCarpeta(abs, { patron: req.query.patron || '*', subcarpetas: req.query.subcarpetas === '1' });
    res.json({ total: todos.length, archivos: todos.slice(0, 20).map(({ ruta, nombre, modificada, tamano, quieto }) => ({ ruta, nombre, modificada, tamano, quieto })) });
});

/** Una credencial de nube con nombre (C4, 5.1): sólo se escribe; nunca se devuelve su valor. */
app.post('/api/secretos/nube', async (req, res) => {
    try {
        res.json(await secretos.guardarNube(req.body || {}));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

/**
 * Las tablas de un lago (C4, 5.3): carpetas Delta o Iceberg, catálogos DuckLake.
 * En una instancia aparte, con la credencial (si la hay) ya preparada.
 */
app.post('/api/fuentes/explorar', async (req, res) => {
    let inst = null;
    const { ubicacion, credencial = null } = req.body || {};
    try {
        if (!ubicacion) throw new Error('Choose where the lake is first.');
        const donde = path.isAbsolute(ubicacion) || /^[a-z0-9]+:\/\//i.test(ubicacion) ? ubicacion : path.resolve(ROOT_DIR, ubicacion);
        const { DuckDBInstance } = require('@duckdb/node-api');
        inst = await require('./motor').crearInstancia(':memory:');
        const con = await inst.connect();
        const db = { query: async (sql) => (await con.run(sql)).getRowObjectsJson() };
        if (credencial && /^[a-z0-9]+:\/\//i.test(donde)) await con.run(await secretos.sqlDeCredencial(credencial, fuentes.alcanceDe(donde)));
        const tablas = await fuentes.explorar(db, donde);
        con.closeSync();
        res.json({ tablas });
    } catch (err) {
        res.status(400).json({ error: fuentes.explicarNube(err, { credencial, tipo: 'lago' }, ubicacion) });
    } finally {
        try { inst?.closeSync(); } catch { /* ya cerrada */ }
    }
});

/**
 * Lo que lleva dentro el archivo de una fuente publicada (6.5): cuándo se
 * publicó, qué proceso, de qué workspace, cuántas filas y su esquema. Se lee
 * del propio archivo, así que vale en cualquier máquina.
 */
app.get('/api/fuentes/:nombre/publicacion', conCentral(async (req) => {
    const destino = req.query.workspaceId ? { workspaceId: String(req.query.workspaceId) } : (PROYECTO_ABIERTO ? { raiz: ROOT_DIR } : null);
    if (!destino) throw new Error('Open a project or choose a workspace first.');
    const f = (await fuentes.listar(destino)).fuentes.find(x => x.nombre === req.params.nombre);
    if (!f) throw new Error('That source does not exist.');
    if (!f.ubicacionAqui) return { publicacion: null, motivo: 'sin_ubicar' };
    const { leerPublicacion } = require('./publicar');
    try {
        return { publicacion: await leerPublicacion(dbManager.lane('meta'), f.ubicacionAqui) };
    } catch (e) {
        return { publicacion: null, motivo: String(e.message).split('\n')[0] };
    }
}));

app.get('/api/fuentes/sugerir-nombre', (req, res) => {
    res.json({ nombre: fuentes.sugerirNombre(path.basename(String(req.query.de || ''))), formato: fuentes.formatoDe(req.query.de) });
});

app.get('/api/project/requisitos', async (_req, res) => {
    if (!PROYECTO_ABIERTO) return res.json({ requiere: { credenciales: [], extensiones: [], fuentes: [] }, faltan: { credenciales: [], extensiones: [], fuentes: [] }, completo: true });
    try {
        res.json(await manifiesto.comprobar(ROOT_DIR, dbManager, aiManager.getConfig()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shutdown', async (_req, res) => {
    res.json({ ok: true });
    try {
        await dbManager.close();
        console.log('[Server] DuckDB connections closed — shutting down.');
    } catch (err) {
        console.error('[Server] Error closing DB on shutdown:', err.message);
    }
    try { await contextoDeEjecucion.soltarTrabajos(); } catch { /* nada que cerrar */ }
    try {
        await baseCentral.cerrar();
    } catch (err) {
        console.error('[Central] Error al cerrar:', err.message);
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
    APP_DIR, TABLE_CONTEXT_TTL, anotarFuentesDelSql, archivoDelProyecto,
    buildTableContext, remontarFuentes, userTablesWhereClause,
});
Object.defineProperties(compartido, {
    PROYECTO_ABIERTO: { get: () => PROYECTO_ABIERTO, enumerable: true },
    ROOT_DIR: { get: () => ROOT_DIR, enumerable: true },
    _tableNamesCache: { get: () => _tableNamesCache, set: (v) => { _tableNamesCache = v; }, enumerable: true },
    _tableNamesCacheTime: { get: () => _tableNamesCacheTime, set: (v) => { _tableNamesCacheTime = v; }, enumerable: true },
});
app.use(require('./api/git'));
app.use(require('./api/dbt'));
app.use(require('./api/flujos'));
app.use(require('./api/ia'));
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

    console.log(`[Server] Serving static files from: ${clientDistPath}`);
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
            console.log(`Server running at http://localhost:${actualPort}`);
            console.log(`Serving files from: ${ROOT_DIR}`);

            // Initialize AI schema in the background so DataDiving works without a
            // project connected. Fire-and-forget — do NOT await here, so resolve()
            // se llama de inmediato y el proceso principal recibe el 'ready' sin
            // esperas.
            aiPersistence.initSchema(dbManager).catch(err =>
                console.warn('[AI] Startup schema init warning (non-fatal):', err.message)
            );

            // La base de AmoxSQL, igual: en segundo plano. Si no se puede abrir,
            // el servidor sigue; /api/central/estado dice por qué.
            // Detrás de ella, el llavero: migra lo que la 5.8 tenía en claro y
            // descifra las credenciales a memoria (A1).
            arranque = baseCentral.abrir()
                .then(() => secretos.iniciar(aiManager.getConfig()))
                .catch(err => console.warn('[Secretos] Arranque:', err.message));

            // Re-activate extensions the user auto-loads. Fire-and-forget igual;
            // dbManager las vuelve a LOADear en cada reconexion una vez sembradas.
            (async () => {
                try {
                    const names = getAutoloadExtensions();
                    if (names.length === 0) return;
                    names.forEach(n => dbManager.rememberExtension(n));
                    await dbManager.restoreExtensions();
                    console.log(`[Extensions] Auto-loaded ${names.length}: ${names.join(', ')}`);
                } catch (e) {
                    console.warn('[Extensions] Startup autoload warning (non-fatal):', e.message);
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
            console.warn(`[Server] Puerto ${preferredPort} ocupado — se pide uno libre al sistema.`);
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
