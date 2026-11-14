/**
 * Named sources and reading data: sources and their contracts, Excel, Google Sheets, DuckLake, the data date.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const registrador = require('../registrador');
const express = require('express');
const fs = require('fs');
const path = require('path');
const dbManager        = require('../DatabaseManager');
const secretos         = require('../secretos');
const fuentes          = require('../fuentes');
const excel = require('../excel');
const aiManager = require('../AiManager');

const ctx = require('./compartido');
const {
    columnasDeFuentes, conCentral, destinoDeFuente, errorDeExcel, oyentesDeLlegadas,
    remontarFuentes, rutaDelProyecto,
} = ctx;

const rutas = express.Router();

// ─── El Excel tal como llega (C2, 5.10) ─────────────────────────────────────

/** Las primeras filas de una hoja, como texto, con letras y números de fila. */
rutas.get('/api/excel/vista', async (req, res) => {
    try {
        const ruta = rutaDelProyecto(req.query.path || '');
        res.json(await excel.vistaCruda(dbManager.lane('meta'), ruta, { hoja: req.query.hoja || null }));
    } catch (err) {
        errorDeExcel(res, err);
    }
});

/** Leer con unas opciones, sin guardar nada: columnas con su tipo y unas filas. */
rutas.post('/api/excel/probar', async (req, res) => {
    try {
        const ruta = rutaDelProyecto(req.body?.path || '');
        const opciones = excel.normalizarOpciones(req.body?.opciones);
        res.json(await excel.probar(dbManager.lane('meta'), ruta, opciones));
    } catch (err) {
        errorDeExcel(res, err);
    }
});

/** Lo que hay en una plantilla de Excel (5.11, D3): hojas, y tablas con sus columnas. */
rutas.get('/api/excel/plantilla', (req, res) => {
    try {
        const ruta = rutaDelProyecto(req.query.path || '');
        if (!fs.existsSync(ruta)) return res.status(404).json({ error: `The template does not exist: ${req.query.path}` });
        res.json(require('../xlsxPlantilla').describirPlantilla(ruta));
    } catch (err) {
        res.status(400).json({ error: `The template could not be read as a workbook: ${err.message}. Save it as .xlsx in Excel.` });
    }
});

/** Cómo se leyó este archivo la última vez en este proyecto (2.5). */
rutas.get('/api/excel/recordado', (req, res) => {
    if (!ctx.PROYECTO_ABIERTO) return res.json({ opciones: null });
    res.json({ opciones: excel.recordado(ctx.ROOT_DIR, rutaDelProyecto(req.query.path || '')) });
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
rutas.post('/api/gsheets/setup', async (req, res) => {
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
        registrador.error('[GSheets] Setup failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gsheets/status — Check extension + secret status
rutas.get('/api/gsheets/status', async (req, res) => {
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
rutas.get('/api/gsheets/sheets', (req, res) => {
    const config = aiManager.getConfig();
    res.json(config.gsheets?.sheets || []);
});

// POST /api/gsheets/sheets — Register a new sheet
rutas.post('/api/gsheets/sheets', async (req, res) => {
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
            registrador.aviso('[GSheets] Could not fetch spreadsheet title:', e.message);
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
        registrador.error('[GSheets] Register failed:', err);
        res.status(500).json({ error: `Failed to connect to Google Sheet: ${err.message}` });
    }
});

// DELETE /api/gsheets/sheets/:id — Remove a registered sheet
rutas.delete('/api/gsheets/sheets/:id', (req, res) => {
    const config = aiManager.getConfig();
    if (!config.gsheets?.sheets) return res.json({ success: true });
    config.gsheets.sheets = config.gsheets.sheets.filter(s => s.id !== req.params.id);
    aiManager.saveConfig(config);
    res.json({ success: true });
});

// GET /api/gsheets/preview/:id — Preview first 100 rows of a sheet (specific tab)
rutas.get('/api/gsheets/preview/:id', async (req, res) => {
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
        registrador.error('[GSheets] Preview failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/gsheets/test — Test connection with SA key
rutas.post('/api/gsheets/test', async (req, res) => {
    try {
        await ensureGSheetsReady();
        res.json({ success: true, message: 'Google Sheets extension loaded and secret configured.' });
    } catch (err) {
        res.json({ success: false, message: err.message });
    }
});

// DuckLake de primera clase (5.12, fase 8; I8, Dec-33).
const lagoRuta = (fn) => async (req, res) => {
    try { res.json(await fn(req)); } catch (e) { res.status(e instanceof require('../lago').ErrorDeLago ? 400 : 500).json({ error: String(e.message || e).split('\n')[0] }); }
};

rutas.post('/api/lago/crear', lagoRuta(async (req) => {
    if (!ctx.PROYECTO_ABIERTO) throw new (require('../lago').ErrorDeLago)('Open a project first: the lake is created in its folder.');
    return require('../lago').crear(ctx.ROOT_DIR, req.body || {});
}));

rutas.get('/api/lago/versiones', lagoRuta(async () => ({ lago: dbManager.isDuckLake, versiones: dbManager.isDuckLake ? await require('../lago').versiones(dbManager) : [] })));

rutas.post('/api/lago/como-estaba', lagoRuta(async (req) => ({ sql: require('../lago').comoEstaba(dbManager, req.body || {}) })));

rutas.post('/api/lago/que-cambio', lagoRuta(async (req) => ({ sql: require('../lago').queCambio(dbManager, req.body || {}) })));

rutas.post('/api/lago/mantenimiento/previsualizar', lagoRuta(async (req) => require('../lago').previsualizar(dbManager, req.body || {})));

rutas.post('/api/lago/mantenimiento', lagoRuta(async (req) => require('../lago').mantener(dbManager, req.body || {})));

rutas.get('/api/fuentes/llegadas', (req, res) => {
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

rutas.get('/api/fuentes', conCentral(async (req) => {
    if (req.query.workspaceId) return fuentes.listar({ workspaceId: String(req.query.workspaceId) });
    if (!ctx.PROYECTO_ABIERTO) return { workspaceId: null, fuentes: [], invalidas: [] };
    if (ctx.montandoFuentes) await ctx.montandoFuentes;
    const r = await fuentes.listar({ raiz: ctx.ROOT_DIR });
    const porNombre = new Map(ctx.ultimoMontaje.informe.map(i => [i.nombre, i]));
    return {
        ...r,
        fuentes: r.fuentes.map(f => ({ ...f, error: porNombre.get(f.nombre)?.error || null })),
        esquemaHomonimo: ctx.ultimoMontaje.esquemaHomonimo,
    };
}));

rutas.post('/api/fuentes', conCentral(async (req) => {
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

rutas.delete('/api/fuentes/:nombre', conCentral(async (req) => {
    await fuentes.borrar(destinoDeFuente(req), req.params.nombre);
    await remontarFuentes();
    return { ok: true };
}));

// 5.13 (E2 + E3): el contrato de una fuente. «Check» lo comprueba ahora mismo;
// «Take today's columns» lo propone con lo que trae hoy (Dec-40).
rutas.post('/api/fuentes/:nombre/comprobar', conCentral(async (req) => {
    const l = await fuentes.localizar(destinoDeFuente(req), req.params.nombre);
    if (!l) throw new Error(`The source "${req.params.nombre}" does not exist.`);
    // El contrato que se está editando, sin guardar todavía; si no, el guardado.
    const def = req.body?.contrato !== undefined ? { ...l.def, contrato: require('../contrato').normalizar(req.body.contrato) } : l.def;
    if (!def.contrato) return { ok: true, sinContrato: true, fallos: [] };
    const r = await fuentes.comprobarContrato(dbManager.lane('meta'), def, l.ubicacion);
    return { ...r, linea: r.ok ? null : require("../contrato").linea(def.nombre, r) };
}));

rutas.post('/api/fuentes/:nombre/contrato/de-hoy', conCentral(async (req) => {
    const l = await fuentes.localizar(destinoDeFuente(req), req.params.nombre);
    if (!l) throw new Error(`The source "${req.params.nombre}" does not exist.`);
    return { contrato: await fuentes.contratoDeHoy(dbManager.lane('meta'), l.def, l.ubicacion) };
}));

rutas.put('/api/fuentes/:nombre/ubicacion', conCentral(async (req) => {
    const ubicacion = await fuentes.ubicar(destinoDeFuente(req), req.params.nombre, req.body?.ubicacion || null);
    await remontarFuentes();
    return { ubicacion };
}));

// 5.13 (Dec-44): de cuándo son los datos de una consulta (el pie de Report Flow).
rutas.post('/api/fecha-de-los-datos', async (req, res) => {
    try {
        res.json(await require('../ejecucion/fechaDeLosDatos').deConsulta(dbManager.lane('meta'), req.body?.query || '', ctx.PROYECTO_ABIERTO ? ctx.ROOT_DIR : null));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Probar una definición sin guardarla: las primeras filas y las columnas. Va en
 * una instancia aparte, en memoria, para no dejar nada en la sesión.
 */
rutas.post('/api/fuentes/probar', async (req, res) => {
    let inst = null;
    try {
        const def = fuentes.normalizarDefinicion(req.body?.definicion);
        const ubicacion = req.body?.ubicacion || def.ubicacion;
        if (!ubicacion) throw new Error('Choose where the file is first.');
        const { DuckDBInstance } = require('@duckdb/node-api');
        inst = await require('../motor').crearInstancia(':memory:');
        const con = await inst.connect();
        const donde = path.isAbsolute(ubicacion) || /^[a-z0-9]+:\/\//i.test(ubicacion) ? ubicacion : path.resolve(ctx.ROOT_DIR, ubicacion);
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

rutas.get('/api/fuentes/columnas', async (_req, res) => {
    try {
        res.json({ fuentes: await columnasDeFuentes() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Lo que hay ahora en una carpeta con un patrón (el formulario de una fuente de tipo carpeta). */
rutas.get('/api/fuentes/carpeta', (req, res) => {
    const dir = String(req.query.dir || '');
    const abs = path.isAbsolute(dir) ? dir : path.resolve(ctx.ROOT_DIR, dir);
    try {
        if (!fs.statSync(abs).isDirectory()) return res.status(400).json({ error: 'That is not a folder.' });
    } catch {
        return res.status(404).json({ error: 'That folder is not there.' });
    }
    const todos = fuentes.archivosDeCarpeta(abs, { patron: req.query.patron || '*', subcarpetas: req.query.subcarpetas === '1' });
    res.json({ total: todos.length, archivos: todos.slice(0, 20).map(({ ruta, nombre, modificada, tamano, quieto }) => ({ ruta, nombre, modificada, tamano, quieto })) });
});

/**
 * Las tablas de un lago (C4, 5.3): carpetas Delta o Iceberg, catálogos DuckLake.
 * En una instancia aparte, con la credencial (si la hay) ya preparada.
 */
rutas.post('/api/fuentes/explorar', async (req, res) => {
    let inst = null;
    const { ubicacion, credencial = null } = req.body || {};
    try {
        if (!ubicacion) throw new Error('Choose where the lake is first.');
        const donde = path.isAbsolute(ubicacion) || /^[a-z0-9]+:\/\//i.test(ubicacion) ? ubicacion : path.resolve(ctx.ROOT_DIR, ubicacion);
        const { DuckDBInstance } = require('@duckdb/node-api');
        inst = await require('../motor').crearInstancia(':memory:');
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
rutas.get('/api/fuentes/:nombre/publicacion', conCentral(async (req) => {
    const destino = req.query.workspaceId ? { workspaceId: String(req.query.workspaceId) } : (ctx.PROYECTO_ABIERTO ? { raiz: ctx.ROOT_DIR } : null);
    if (!destino) throw new Error('Open a project or choose a workspace first.');
    const f = (await fuentes.listar(destino)).fuentes.find(x => x.nombre === req.params.nombre);
    if (!f) throw new Error('That source does not exist.');
    if (!f.ubicacionAqui) return { publicacion: null, motivo: 'sin_ubicar' };
    const { leerPublicacion } = require('../publicar');
    try {
        return { publicacion: await leerPublicacion(dbManager.lane('meta'), f.ubicacionAqui) };
    } catch (e) {
        return { publicacion: null, motivo: String(e.message).split('\n')[0] };
    }
}));

rutas.get('/api/fuentes/sugerir-nombre', (req, res) => {
    res.json({ nombre: fuentes.sugerirNombre(path.basename(String(req.query.de || ''))), formato: fuentes.formatoDe(req.query.de) });
});

module.exports = rutas;
