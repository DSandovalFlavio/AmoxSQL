/**
 * Settings: AI providers and models, credentials (never their values), preferences, AmoxSQL's own database.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const registrador = require('../registrador');
const express = require('express');
const fs = require('fs');
const baseCentral      = require('../central/BaseCentral');
const secretos         = require('../secretos');
const aiManager = require('../AiManager');

const ctx = require('./compartido');
const {
    conCentral,
} = ctx;

const rutas = express.Router();

const workspaces       = require('../workspaces');

rutas.get('/api/settings/config', (req, res) => {
    try {
        const config = aiManager.getConfig();
        // Desde la 5.9 el renderer no recibe ni un secreto: ve SENTINELA donde
        // hay algo guardado (ver server/secretos.js).
        res.json(secretos.configParaElCliente(config));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.post('/api/settings/config', async (req, res) => {
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
            const { setUserTierOverrides } = require('../ai/modelProfiles');
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
            const { setOllamaRuntimeConfig } = require('../ai/modelProfiles');
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

rutas.get('/api/settings/gemini/models', async (req, res) => {
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
            registrador.error(`Failed to fetch Gemini models: ${response.statusText}`);
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
        registrador.error("Error fetching Gemini models:", err);
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
        registrador.error(`[Models] ${provider} discovery failed:`, err.message);
        return { models: fallback, source: 'fallback', error: err.message };
    }

    return { models: fallback, source: 'fallback' };
}

// Unified endpoint — works for any cloud provider with a list API.
rutas.get('/api/settings/models/:provider', async (req, res) => {
    try {
        const config = aiManager.getConfig();
        const out = await fetchCloudModels(req.params.provider, config);
        res.json(out);
    } catch (err) {
        res.json({ models: [], source: 'error', error: err.message });
    }
});

rutas.post('/api/settings/cloud/test-adc', async (req, res) => {
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

rutas.get('/api/settings/ollama/models', async (req, res) => {
    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const models = await ollamaClient.list();
        res.json(models);
    } catch (err) {
        registrador.error("Failed to list Ollama models", err);
        // Do not throw full 500 if Ollama isn't running, return empty so UI doesn't break
        res.json({ models: [] });
    }
});

/**
 * GET /api/settings/ollama/models-enriched
 * Returns installed models with capabilities, tier classification, and metadata.
 * Uses Ollama /api/show for capability detection.
 */
rutas.get('/api/settings/ollama/models-enriched', async (req, res) => {
    try {
        const ollamaClient = require('ollama').default || require('ollama');
        const { getModelProfile: getProfileFn, classifyModelFromCapabilities, fetchOllamaModelInfo } = require('../ai/modelProfiles');
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
        registrador.error("Failed to list enriched Ollama models", err);
        res.json({ models: [] });
    }
});

rutas.post('/api/settings/ollama/pull', async (req, res) => {
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
        registrador.error("Ollama pull failed", err);
        res.write(`data: {"error": "${err.message}"}\n\n`);
        res.end();
    }
});

// ─── Graceful shutdown endpoint ───────────────────────────────────────────────
// Called by Electron's before-quit handler to close DuckDB connections cleanly
// before the process exits, preventing write corruption on abrupt termination.
// ─── La base de AmoxSQL (A5) ────────────────────────────────────────────────
// Se abre en segundo plano al arrancar. Quien la use la espera con abrir(), que
// no hace nada si ya está abierta; si no se pudo abrir, estado() dice por qué.

rutas.get('/api/central/estado', async (_req, res) => {
    try { await baseCentral.abrir(); } catch { /* el estado ya lo cuenta */ }
    res.json(baseCentral.estado());
});

/**
 * Los recientes de la 5.8 vivían en el localStorage del renderer. El cliente los
 * manda una vez; la base los convierte en proyectos y anota que ya lo hizo.
 */
rutas.post('/api/central/recientes', async (req, res) => {
    try {
        await baseCentral.abrir();
        res.json(await baseCentral.importarRecientes(req.body?.rutas));
    } catch (err) {
        res.status(503).json({ error: err.message });
    }
});

// La palabra: null mientras el usuario no la haya elegido (pantalla 1).
rutas.get('/api/preferencias/etiqueta', conCentral(async () => {
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

rutas.put('/api/preferencias/etiqueta', conCentral(async (req) => ({
    clave: await workspaces.elegirEtiqueta(req.body?.clave),
    elegida: true,
})));

// ─── El llavero (A1) ─────────────────────────────────────────────────────────
// Nombres, tipos y fechas; nunca valores.

// La purga del texto plano (5.9.0): qué se quitó de config.json, una vez.
rutas.get('/api/secretos/purga', async (_req, res) => {
    try { res.json({ purga: await secretos.avisoDePurga() }); } catch { res.json({ purga: null }); }
});

rutas.post('/api/secretos/purga/vista', async (_req, res) => {
    try { await secretos.marcarPurgaAvisada(); res.json({ ok: true }); } catch (err) { res.status(503).json({ error: err.message }); }
});

rutas.get('/api/secretos', async (_req, res) => {
    try {
        res.json({ modo: secretos.modo(), credenciales: await secretos.listar() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

rutas.delete('/api/secretos/:nombre', async (req, res) => {
    try {
        await secretos.borrar(req.params.nombre);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 5.13 (Dec-42): los límites de lo que corre de fondo con la aplicación abierta.
rutas.put('/api/preferencias/limites-fondo', conCentral(async (req) => require('../ejecucion/limites').guardarPreferencias(req.body || {})));

/** Una credencial de nube con nombre (C4, 5.1): sólo se escribe; nunca se devuelve su valor. */
rutas.post('/api/secretos/nube', async (req, res) => {
    try {
        res.json(await secretos.guardarNube(req.body || {}));
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = rutas;
