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

const lineaDeComandos  = require('./ejecucion/lineaDeComandos');
// La apertura de la base de AmoxSQL y del llavero (ver startServer).
let arranque = Promise.resolve();
const { crearVigilante, firmaDe } = require('./vigilanteArchivos');

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


/* ─── Git ─── */
const gitManager = require('./git/gitManager');


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


const excel = require('./excel');

/** La ruta de un archivo que llega del cliente: absoluta, o relativa al proyecto. */
const rutaDelProyecto = (r) => (path.isAbsolute(String(r)) ? String(r) : path.join(ROOT_DIR, String(r)));

/** Responder un error de Excel: 422 con su código si es de los que se explican. */
function errorDeExcel(res, err) {
    if (err instanceof excel.ErrorDeExcel) return res.status(err.codigo === 'no_existe' ? 404 : 422).json({ error: err.message, codigo: err.codigo });
    return res.status(500).json({ error: String(err?.message || err).split('\n')[0] });
}


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


// Exportar e importar un workspace (B6): un .amoxworkspace sin credenciales.
app.get('/api/workspaces/:id/exportar', conCentral(async (req) => workspaces.exportar(req.params.id)));
app.post('/api/workspaces-importar/analizar', conCentral(async (req) => workspaces.analizarImportacion(req.body?.contenido)));
app.post('/api/workspaces-importar', conCentral(async (req) => {
    const r = await workspaces.importar(req.body?.contenido, req.body?.opciones || {});
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


/** Una credencial de nube con nombre (C4, 5.1): sólo se escribe; nunca se devuelve su valor. */
app.post('/api/secretos/nube', async (req, res) => {
    try {
        res.json(await secretos.guardarNube(req.body || {}));
    } catch (err) {
        res.status(400).json({ error: err.message });
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
