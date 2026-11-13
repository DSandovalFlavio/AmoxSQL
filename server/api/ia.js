/**
 * The Assistant and Deep Dive: chat, conversations, memories, vault, skills, configuration.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `compartido.X`.
 */

const registrador = require('../registrador');
const express = require('express');
const fs = require('fs');
const path = require('path');
const dbManager        = require('../DatabaseManager');
const amoxvis = require('../amoxvis');
const esquemas = require('../esquemas');
const aiManager = require('../AiManager');
const aiPersistence = require('../ai/persistence');

const compartido = require('./compartido');
const {
    APP_DIR, TABLE_CONTEXT_TTL, archivoDelProyecto, buildTableContext,
    userTablesWhereClause,
} = compartido;

const rutas = express.Router();

const dbtModelo        = require('../dbt/modelo');

/* ─── AI Context folder status & setup ─── */
rutas.get('/api/ai/context-status', async (req, res) => {
    const contextDir = path.join(compartido.ROOT_DIR, 'context');
    const exists = fs.existsSync(contextDir);
    if (!exists) return res.json({ exists: false });

    const files = {
        metrics:   fs.existsSync(path.join(contextDir, 'metrics.yml')),
        joins:     fs.existsSync(path.join(contextDir, 'joins.yml')),
        glossary:  fs.existsSync(path.join(contextDir, 'glossary.md')),
        examples:  [],
    };

    const examplesDir = path.join(contextDir, 'examples');
    if (fs.existsSync(examplesDir)) {
        files.examples = fs.readdirSync(examplesDir).filter(f => f.endsWith('.sql'));
    }

    res.json({ exists: true, path: contextDir, files });
});

rutas.post('/api/ai/context-setup', async (req, res) => {
    const { files = ['metrics', 'joins', 'glossary', 'examples'] } = req.body;
    const contextDir  = path.join(compartido.ROOT_DIR, 'context');
    const examplesDir = path.join(contextDir, 'examples');

    try {
        if (!fs.existsSync(contextDir))  fs.mkdirSync(contextDir,  { recursive: true });
        if (!fs.existsSync(examplesDir)) fs.mkdirSync(examplesDir, { recursive: true });

        const created = [];

        if (files.includes('metrics') && !fs.existsSync(path.join(contextDir, 'metrics.yml'))) {
            fs.writeFileSync(path.join(contextDir, 'metrics.yml'), `# Business Metric Definitions
# The AI uses these when you mention terms like "revenue" or "churn".
# Format: name, sql (DuckDB expression), description, grain, table

metrics:
  - name: revenue
    sql: "SUM(amount) FILTER (WHERE status = 'paid')"
    description: Total paid revenue, excludes pending and refunded orders
    grain: order
    table: orders

  - name: monthly_active_users
    sql: "COUNT(DISTINCT user_id)"
    description: Unique users with at least one event in the period
    grain: day
    table: events
`, 'utf8');
            created.push('metrics.yml');
        }

        if (files.includes('joins') && !fs.existsSync(path.join(contextDir, 'joins.yml'))) {
            fs.writeFileSync(path.join(contextDir, 'joins.yml'), `# Canonical Join Relationships
# The AI uses these to write correct JOIN clauses without guessing column names.

joins:
  - from: orders
    to: customers
    on: "orders.customer_id = customers.id"
    type: LEFT

  - from: orders
    to: products
    on: "orders.product_id = products.id"
    type: LEFT
`, 'utf8');
            created.push('joins.yml');
        }

        if (files.includes('glossary') && !fs.existsSync(path.join(contextDir, 'glossary.md'))) {
            fs.writeFileSync(path.join(contextDir, 'glossary.md'), `# Domain Glossary

**Revenue**: Paid order amounts only (\`status = 'paid'\`). Never include pending or refunded orders.

**Active User**: Any user who triggered at least one event in the analysis period.

**Churn**: A user who has not returned in the last 30 days.

**Conversion**: A trial user who upgraded to a paid plan within 14 days.
`, 'utf8');
            created.push('glossary.md');
        }

        if (files.includes('examples')) {
            const ex1 = path.join(examplesDir, 'monthly_revenue_trend.sql');
            if (!fs.existsSync(ex1)) {
                fs.writeFileSync(ex1, `-- What is the monthly revenue trend for the last 12 months?
SELECT
    DATE_TRUNC('month', created_at)                         AS month,
    SUM(amount) FILTER (WHERE status = 'paid')              AS revenue,
    COUNT(*) FILTER (WHERE status = 'paid')                 AS orders
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL 12 MONTHS
GROUP BY 1
ORDER BY 1;
`, 'utf8');
                created.push('examples/monthly_revenue_trend.sql');
            }
            const ex2 = path.join(examplesDir, 'cohort_retention.sql');
            if (!fs.existsSync(ex2)) {
                fs.writeFileSync(ex2, `-- How do I calculate cohort retention by signup month?
WITH cohorts AS (
    SELECT user_id,
           DATE_TRUNC('month', created_at) AS cohort_month
    FROM users
),
activity AS (
    SELECT DISTINCT user_id,
           DATE_TRUNC('month', event_date) AS active_month
    FROM events
)
SELECT
    c.cohort_month,
    DATEDIFF('month', c.cohort_month, a.active_month) AS months_since_signup,
    COUNT(DISTINCT c.user_id)                          AS retained_users
FROM cohorts c
JOIN activity a USING (user_id)
GROUP BY 1, 2
ORDER BY 1, 2;
`, 'utf8');
                created.push('examples/cohort_retention.sql');
            }
        }

        res.json({ success: true, created, path: contextDir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* --- AI / LLM APIs --- */

rutas.get('/api/ai/status', (req, res) => {
    res.json(aiManager.getStatus());
});

/**
 * POST /api/ai/warmup — Preload a local Ollama model into memory (F4).
 * Fire-and-forget from the client on model select / sidebar open so weights
 * load while the user types. Uses the SAME num_ctx/keep_alive as real chat
 * requests (getOllamaRuntime) — a different num_ctx would force a second
 * load on the first real message.
 * Body: { model }
 */
rutas.post('/api/ai/warmup', async (req, res) => {
    const { model } = req.body || {};
    if (!model) return res.status(400).json({ error: 'Model name is required' });
    try {
        const { getOllamaRuntime } = require('../ai/modelProfiles');
        const rt = getOllamaRuntime(model);
        // Empty-message chat load: Ollama returns immediately with the model
        // resident. We don't await generation — just the load.
        const resp = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [],
                keep_alive: rt.keepAlive,
                options: { num_ctx: rt.numCtx, ...rt.sampling },
            }),
            signal: AbortSignal.timeout(120000), // model load can be slow on cold disk
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            return res.status(502).json({ error: `Ollama warmup failed: ${resp.status} ${text}`.trim() });
        }
        const json = await resp.json().catch(() => ({}));
        registrador.info(`[AI Warmup] ${model} | num_ctx=${rt.numCtx} | loaded (${json.done_reason || 'load'})`);
        res.json({ success: true, model, numCtx: rt.numCtx });
    } catch (err) {
        // Warmup is best-effort; report but don't treat as fatal client-side.
        registrador.aviso(`[AI Warmup] ${model} failed:`, err.message);
        res.status(502).json({ error: err.message });
    }
});

/**
 * GET /api/ai/model-status — Which Ollama models are resident right now (F4).
 * Proxies /api/ps and flags CPU offload (size_vram < size) so the UI can show
 * a truthful ● hot / ◐ partial-on-CPU / ○ cold indicator.
 */
rutas.get('/api/ai/model-status', async (req, res) => {
    try {
        const resp = await fetch('http://localhost:11434/api/ps', {
            signal: AbortSignal.timeout(3000),
        });
        if (!resp.ok) return res.json({ models: [] });
        const json = await resp.json();
        const models = (json.models || []).map(m => ({
            name: m.name,
            model: m.model,
            sizeVram: m.size_vram ?? 0,
            size: m.size ?? 0,
            onCpu: (m.size_vram ?? 0) < (m.size ?? 0),   // partly/fully on CPU → slower
            fullyLoaded: (m.size_vram ?? 0) > 0 && (m.size_vram ?? 0) >= (m.size ?? 0),
            expiresAt: m.expires_at || null,
        }));
        res.json({ models });
    } catch {
        // Ollama not running / no models loaded — empty, not an error.
        res.json({ models: [] });
    }
});

/**
 * POST /api/ai/query-objects — describe the objects (tables + files) a query
 * references in FROM/JOIN, for the assistant's context pills. No LLM; just
 * DESCRIBE (schema only, no row scan). Called (debounced) as the user edits.
 * Body: { query }
 */
rutas.post('/api/ai/query-objects', async (req, res) => {
    const { query } = req.body || {};
    if (!query || typeof query !== 'string') return res.json({ objects: [] });
    try {
        const { resolveQueryObjects } = require('../ai/queryObjects');
        const allNames = await listAllTableNames();
        const objects = await resolveQueryObjects(query, dbManager, allNames);
        res.json({ objects });
    } catch (err) {
        registrador.aviso('[AI Query Objects]', err.message);
        res.json({ objects: [] });
    }
});

rutas.post('/api/ai/init', async (req, res) => {
    try {
        await aiManager.initialize();
        res.json({ success: true, message: "Initialization complete" });
    } catch (err) {
        registrador.error("[API] AI Init failed", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/duckdb-docs/status — snapshot status for the Settings UI.
 * Returns extractedAt (last update), file count, source (bundled/user) and mode.
 */
rutas.get('/api/ai/duckdb-docs/status', (req, res) => {
    try {
        const duckdbDocs = require('../ai/duckdbDocs');
        const cfg = aiManager.getConfig();
        res.json({
            ...duckdbDocs.getStatus(),
            updateMode: cfg.duckdbDocsUpdate || 'auto',
            intervalDays: cfg.duckdbDocsIntervalDays || 30,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guard: a single in-flight refresh at a time.
let _duckdbDocsRefreshing = false;

/**
 * POST /api/ai/duckdb-docs/refresh — manually re-download the DuckDB docs
 * snapshot from GitHub into the user dir. Returns the new status.
 */
rutas.post('/api/ai/duckdb-docs/refresh', async (req, res) => {
    if (_duckdbDocsRefreshing) return res.status(409).json({ error: 'A refresh is already in progress.' });
    _duckdbDocsRefreshing = true;
    try {
        const duckdbDocs = require('../ai/duckdbDocs');
        const status = await duckdbDocs.refresh(msg => registrador.info('[DuckDB Docs]', msg));
        res.json({ success: true, ...status });
    } catch (err) {
        registrador.error('[DuckDB Docs] Manual refresh failed:', err.message);
        res.status(502).json({ error: `No se pudo actualizar: ${err.message}` });
    } finally {
        _duckdbDocsRefreshing = false;
    }
});

rutas.post('/api/ai/generate', async (req, res) => {
    const { schema, question, provider, model } = req.body;
    if (!schema || !question) return res.status(400).json({ error: "Missing schema or question" });

    try {
        const sql = await aiManager.generateQuery(schema, question, provider, model);
        res.json({ sql });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Returns all user base-table names (cheap, cached). */
async function listAllTableNames() {
    const now = Date.now();
    if (compartido._tableNamesCache && (now - compartido._tableNamesCacheTime) < TABLE_CONTEXT_TTL) return compartido._tableNamesCache;
    try {
        const rows = await dbManager.systemQuery(
            `SELECT table_name FROM ${esquemas.TABLAS} AS t
             WHERE ${userTablesWhereClause()} AND table_type = 'BASE TABLE'
             ORDER BY table_name`,
            { lane: 'meta' }
        );
        compartido._tableNamesCache = rows.map(r => r.table_name);
        compartido._tableNamesCacheTime = now;
        return compartido._tableNamesCache;
    } catch {
        return [];
    }
}

/**
 * Helper: Build file context from file paths for the AI agent.
 */
async function buildFileContext(contextFiles) {
    if (!contextFiles || contextFiles.length === 0) return [];

    const fileContexts = [];
    for (const file of contextFiles) {
        try {
            let fullPath = path.isAbsolute(file.path) ? file.path : path.join(compartido.ROOT_DIR, file.path);
            fullPath = fullPath.replace(/\\/g, '/');
            
            // Get proper read function based on extension
            const ext = (fullPath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
            let readFn = 'read_csv_auto';
            if (ext === '.parquet') readFn = 'read_parquet';
            else if (ext === '.json' || ext === '.jsonl') readFn = 'read_json_auto';
            else if (ext === '.xlsx' || ext === '.xls') readFn = 'read_xlsx';
            
            const queryRef = `${readFn}('${fullPath}')`;
            registrador.info(`[AI File Context] Loading schema for: ${queryRef}`);
            
            const cols = await dbManager.systemQuery(`DESCRIBE SELECT * FROM ${queryRef}`);

            // Fetch sample rows (3) for data format context
            let sampleRows = [];
            let rowCount = null;
            try {
                sampleRows = await dbManager.systemQuery(`SELECT * FROM ${queryRef} LIMIT 3`);
            } catch { /* ignore sample read errors */ }

            // Approximate row count
            try {
                const countRes = await dbManager.systemQuery(`SELECT COUNT(*) as cnt FROM ${queryRef}`);
                rowCount = countRes[0]?.cnt || null;
            } catch { /* ignore count errors */ }

            fileContexts.push({
                name: file.name,
                path: fullPath,
                columns: cols.map(c => ({ name: c.column_name, type: c.column_type || c.data_type })),
                sampleRows,
                rowCount,
            });
        } catch (err) {
            registrador.aviso(`[AI File Context] 🛑 Failed to load schema for ${file.name}:`, err.message);
            fileContexts.push({ name: file.name, path: file.path, columns: [], sampleRows: [], rowCount: null });
        }
    }
    return fileContexts;
}

/**
 * Assistant context resolver: from the active query, describe every object it
 * references in FROM/JOIN — DB tables AND file reads (CSV/JSON/Parquet/Excel) —
 * so the assistant sees their columns+types instead of asking "what's your
 * table?". Reactive by nature: called per message from the live query, so a
 * newly-added object in an edited query shows up on the next turn.
 * Returns { tables, files, roster } in the prompt's context shapes.
 */
const { resolveQueryObjects } = require('../ai/queryObjects');

/**
 * Lo que el Assistant necesita saber de un modelo dbt (S3), o null si el archivo
 * no lo es. Lee el manifiesto que ya existe: nunca lanza dbt.
 */
function dbtDelArchivo(filePath, fileType) {
    if (!filePath || require('../ai/archivoActivo').tipoDe(filePath, fileType) !== 'sql') return null;
    try {
        const i = dbtModelo.info(compartido.ROOT_DIR, archivoDelProyecto(filePath));
        if (!i?.esDbt || i.tipo !== 'modelo') return null;
        return {
            nombre: i.nombre, materializado: i.materializado, descripcion: i.descripcion,
            columnas: (i.columnas || []).slice(0, 80),
            compilado: i.compilado ? String(i.compilado).slice(0, 8000) : null,
            fresco: !!i.fresco,
        };
    } catch { return null; }
}

/**
 * Lo que muestra cada gráfico de un deck (plan del Assistant, E4, R3): para
 * escribir el titular de una lámina el modelo necesita saber qué gráfico es y
 * de qué consulta sale, no solo su ruta. Lee los `.amoxvis` del proyecto; nunca
 * los ejecuta (para sus cifras, el modelo corre la consulta con execute_sql).
 * Deja el resumen dentro de `foco.deck.graficos`.
 */
function conGraficosDelDeck(foco) {
    const deck = foco && foco.deck;
    if (!deck || !Array.isArray(deck.laminas) || !compartido.ROOT_DIR) return foco;
    const raiz = path.resolve(compartido.ROOT_DIR);
    const srcs = [...new Set(deck.laminas.flatMap(l => (Array.isArray(l.graficos) ? l.graficos : [])))].slice(0, 24);
    const graficos = {};
    for (const src of srcs) {
        const limpio = String(src).replace(/^(\.\/|\/)/, '');
        const completo = path.resolve(raiz, limpio);
        if (!completo.startsWith(raiz + path.sep)) { graficos[src] = { falta: true }; continue; }
        try {
            const c = amoxvis.leer(fs.readFileSync(completo, 'utf8'));
            graficos[src] = {
                tipo: c.chartType || null, titulo: c.chartTitle || null, takeaway: c.takeaway || null,
                x: c.xAxisKey || null, y: Array.isArray(c.yAxisKeys) ? c.yAxisKeys : [],
                consulta: c.query ? String(c.query).slice(0, 1500) : null,
            };
        } catch { graficos[src] = { falta: true }; }
    }
    return { ...foco, deck: { ...deck, graficos } };
}

async function buildAssistantQueryContext(currentQuery, filePath = null, fileType = null) {
    const allNames = await listAllTableNames();
    let objs = [];
    // Solo un archivo SQL es una consulta: buscar tablas en un deck o en un JSON
    // daba chips vacíos o con ruido (plan del Assistant, X5).
    const esSql = require('../ai/archivoActivo').tipoDe(filePath, fileType) === 'sql';
    try {
        if (esSql) objs = await resolveQueryObjects(currentQuery, dbManager, allNames);
    } catch (e) {
        registrador.aviso('[AI Assistant Ctx] resolveQueryObjects failed:', e.message);
    }
    const tables = objs.filter(o => o.kind === 'table')
        .map(o => ({ name: o.label, columns: o.columns, rows: '?' }));
    const files = objs.filter(o => o.kind === 'file')
        .map(o => ({ name: o.label, path: o.ref, columns: o.columns, sampleRows: [], rowCount: null }));
    return { tables, files, roster: allNames };
}

/**
 * Make the user's ON-SCREEN result referenceable by the AI (session-awareness).
 * A manual editor run (`/api/query`) returns a queryId but never persists its
 * rows, so `display_chart` could never resolve it — the model was forced to
 * re-run execute_sql or (worse) beg for a queryId that doesn't exist. Here we
 * register the live result into the SAME `amoxsql_ai.query_cache` that
 * display_chart falls back to, so the assistant can chart/cite exactly what the
 * user is looking at with zero re-execution. Idempotent: the id is a stable
 * client UUID, so we skip if already cached (PRIMARY KEY would otherwise clash).
 */
async function registerLiveResultCache(currentResult, conversationId) {
    try {
        if (!aiPersistence || !currentResult) return;
        const qid = currentResult.queryId;
        const data = currentResult.data;
        if (!qid || !Array.isArray(data) || data.length === 0) return;
        const existing = await aiPersistence.getQueryCache(dbManager, qid);
        if (existing) return;
        const columns = Array.isArray(currentResult.columns) && currentResult.columns.length
            ? currentResult.columns
            : (data[0] ? Object.keys(data[0]).map(name => ({ name })) : []);
        await aiPersistence.saveQueryCache(dbManager, {
            queryId: qid,
            conversationId: conversationId || null,
            sqlQuery: currentResult.resultsQuery || '',
            columns,
            data,
            rowCount: currentResult.rowCount ?? data.length,
            execMs: Math.round(Number(currentResult.executionTime) || 0),
        });
        if (conversationId) {
            aiPersistence.pruneQueryCache(dbManager, conversationId, 100).catch(() => {});
        }
    } catch (e) {
        registrador.aviso('[AI] live result cache failed:', e.message);
    }
}

/**
 * POST /api/ai/chat — Non-streaming tool loop chat
 * Body: { messages, provider?, model?, mode?, contextFiles?, currentQuery?, currentResult?, currentChartConfig? }
 */
rutas.post('/api/ai/chat', async (req, res) => {
    const { messages, provider, model, mode, contextFiles, contextTables, currentQuery, currentResult, currentChartConfig, currentView, conversationId } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
    }

    try {
        // If the user provides explicit context items, we only load those.
        // If NO explicit context items are provided: diving loads the whole DB
        // schema; assistant loads only the tables referenced in the active query
        // + a name roster of the rest (F3, bounded context).
        const hasExplicitContext = (contextFiles && contextFiles.length > 0) || (contextTables && contextTables.length > 0);
        let tablesToLoad = hasExplicitContext ? (contextTables || []) : null;
        let tableRoster = null;
        let tables, files;
        if ((mode || 'diving') === 'assistant' && !hasExplicitContext) {
            // Describe every object the active query references (tables + files),
            // and make the user's on-screen result chartable by its own id.
            const [ctx] = await Promise.all([
                buildAssistantQueryContext(currentQuery),
                registerLiveResultCache(currentResult, conversationId),
            ]);
            tables = ctx.tables;
            files = ctx.files;
            tableRoster = ctx.roster;
        } else {
            [tables, files] = await Promise.all([
                buildTableContext(tablesToLoad),
                buildFileContext(contextFiles),
            ]);
        }

        const result = await aiManager.chat({
            messages,
            dbManager,
            providerOverride: provider,
            modelOverride: model,
            mode: mode || 'diving',
            tables,
            files,
            currentQuery,
            currentResult,
            currentChartConfig,
            currentView,
            tableRoster,
        });

        res.json(result);
    } catch (err) {
        registrador.error('[API] AI Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/chat/stream — SSE streaming tool loop chat
 * Body: same as /api/ai/chat
 * Response: Server-Sent Events stream
 * 
 * Automatically selects prompt-only mode for low-tier models.
 */
const { getModelProfile: getModelProfileForRoute, fetchOllamaModelInfo: fetchOllamaInfoForRoute } = require('../ai/modelProfiles');

// ── Chart Story — on-demand story generation for the UI button ───────────────
rutas.post('/api/ai/chart-story', async (req, res) => {
    try {
        const { data, xKey, yKey, chartType, titleHint, truncated } = req.body;
        if (!data || !Array.isArray(data) || !xKey || !yKey) {
            return res.status(400).json({ error: 'data (array), xKey, and yKey are required.' });
        }
        const { generateChartStory } = require('../ai/chartStory');
        // `truncated` lo manda el cliente cuando recorta el resultado: sin eso el
        // subtitulo presentaria el rango del recorte como si fuera el del total.
        const story = generateChartStory(data, { xKey, yKey, chartType, titleHint, truncated });
        if (story.error) return res.status(422).json({ error: story.error });
        return res.json(story);
    } catch (err) {
        registrador.error('[chart-story]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

/**
 * Expand lightweight artifact references ("Ask about this") into prompt-ready
 * objects: rehydrate SQL + sample rows from the persistent query cache by
 * queryId so the agent can answer anchored to the actual artifact. Refs whose
 * data is no longer cached are flagged `stale` (the agent re-runs their SQL).
 */
async function expandReferencedArtifacts(refs) {
    if (!Array.isArray(refs) || refs.length === 0) return [];
    const persistence = require('../ai/persistence');
    const out = [];
    for (const ref of refs) {
        if (!ref || typeof ref !== 'object') continue;
        const enriched = { ...ref };
        if (ref.queryId) {
            try {
                const cached = await persistence.getQueryCache(dbManager, ref.queryId);
                if (cached) {
                    enriched.sql = cached.sql_query || ref.sql || null;
                    enriched.columns = cached.columns_info || null;
                    enriched.sampleRows = Array.isArray(cached.data) ? cached.data.slice(0, 20) : null;
                } else {
                    enriched.stale = true;
                }
            } catch {
                enriched.stale = true;
            }
        }
        out.push(enriched);
    }
    return out;
}

rutas.post('/api/ai/chat/stream', async (req, res) => {
    const { messages, provider, model, mode, contextFiles, contextTables, currentQuery, currentResult, currentChartConfig, currentView, activeSkillId, filePath, fileType, conversationId, planStepOverrides, continueMode, continueBudget, referencedArtifacts, uiTheme, foco, resultsError } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
    }

    // Log assistant context for debugging
    if (mode === 'assistant') {
        registrador.info(`[AI Assistant Context] filePath=${filePath || 'none'} | fileType=${fileType || 'none'} | hasQuery=${!!currentQuery} | hasResult=${!!currentResult} | hasChart=${!!currentChartConfig}`);
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // Ship headers immediately (context building below can take a while) and
    // disable Nagle so small SSE frames aren't batched by the TCP stack.
    res.flushHeaders();
    res.socket?.setNoDelay?.(true);

    try {
        const hasExplicitContext = (contextFiles && contextFiles.length > 0) || (contextTables && contextTables.length > 0);
        let tablesToLoad = hasExplicitContext ? (contextTables || []) : null;

        // ── Bounded context for assistant mode (F3, fixes H9) ──
        // Deep Dive genuinely needs the whole DB; the editor assistant does not.
        // When the user hasn't dragged explicit context, describe every object the
        // active query references in FROM/JOIN — DB tables AND file reads (CSV/
        // JSON/Parquet/Excel) — so the assistant sees columns+types instead of
        // asking "what's your table?". Reactive: resolved per message from the
        // live query, so an edited query with a new object shows up next turn.
        let tableRoster = null;
        let tables, files, expandedReferences;
        // Un modelo dbt (S3): su nombre, su YAML y el SQL compilado que dejó dbt
        // en el manifiesto —sin lanzar dbt—. Con el compilado se resuelven las
        // tablas que lee, que en Jinja (`ref('x')`) no se ven.
        const dbt = (mode || 'diving') === 'assistant' ? dbtDelArchivo(filePath, fileType) : null;
        if ((mode || 'diving') === 'assistant' && !hasExplicitContext) {
            const [ctx, refs] = await Promise.all([
                buildAssistantQueryContext(dbt?.compilado || currentQuery, filePath, fileType),
                expandReferencedArtifacts(referencedArtifacts),
                // Make what the user is looking at chartable by its own id.
                registerLiveResultCache(currentResult, conversationId),
            ]);
            tables = ctx.tables;
            files = ctx.files;
            tableRoster = ctx.roster;
            expandedReferences = refs;
        } else {
            [tables, files, expandedReferences] = await Promise.all([
                buildTableContext(tablesToLoad),
                buildFileContext(contextFiles),
                expandReferencedArtifacts(referencedArtifacts),
            ]);
        }

        const chatOptions = {
            messages,
            dbManager,
            providerOverride: provider,
            modelOverride: model,
            mode: mode || 'diving',
            tables,
            files,
            currentQuery,
            currentResult,
            currentChartConfig,
            currentView,
            referencedArtifacts: expandedReferences,
            activeSkillId,
            filePath,
            fileType,
            foco: (mode || 'diving') === 'assistant' ? conGraficosDelDeck(foco || null) : (foco || null),
            resultsError: resultsError || null,
            dbt,
            tableRoster,
            memoryExtraction: aiManager.getConfig().memoryExtraction || 'cloud-only',
            uiTheme: uiTheme || null,
            conversationId: conversationId || null,
            planStepOverrides: Array.isArray(planStepOverrides) ? planStepOverrides : [],
            // continueMode: user clicked "Continue" after loop exhaustion — grant extra
            // iterations AND resume the persisted plan (the client sends content-only
            // messages, so the loop can't reconstruct the plan from history).
            // continueBudget lets the client request a smaller fresh budget — e.g.
            // "Finish now" sends 1 so the wrap-up turn forces synthesis immediately.
            continueMode: !!continueMode,
            maxIterations: continueMode
                ? Math.max(1, Math.min(50, Number(continueBudget) || 30))
                : undefined,
        };

        // Detect model tier to choose between tool-loop and prompt-only
        const resolvedModel    = model    || aiManager.modelName;
        const resolvedProvider = provider || aiManager.provider;
        
        // Fetch Ollama model info for capability-based classification (cached)
        let ollamaInfo = null;
        if (resolvedProvider !== 'gemini') {
            ollamaInfo = await fetchOllamaInfoForRoute(resolvedModel).catch(() => null);
        }
        const profile = getModelProfileForRoute(resolvedModel, resolvedProvider, ollamaInfo);

        // Check experimental planner flag
        const appConfig     = aiManager.getConfig();
        const plannerActive = !!(appConfig.experimental?.planner) &&
                              (mode || 'diving') === 'diving' &&
                              profile.tier !== 'low';

        if (profile.tier === 'low') {
            // ── Prompt-Only Mode for low-tier models ──
            registrador.info(`[API] Using prompt-only mode for ${resolvedModel} (tier: low)`);

            for await (const event of aiManager.promptOnlyStreamChat(chatOptions)) {
                if (res.closed) break;
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            }

            res.write(`data: [DONE]\n\n`);
            res.end();

        } else if (plannerActive) {
            // ── Agentic Loop (experimental.planner=true, diving mode) ──
            registrador.info(`[API] Using agentic loop for ${resolvedModel} (tier: ${profile.tier})`);

            // Stop on the client closes the request; a quota wait inside the loop
            // must end then too (F9), not keep the run alive in the background.
            const corte = new AbortController();
            res.on('close', () => corte.abort());
            for await (const event of aiManager.streamChatAgentic({ ...chatOptions, abortSignal: corte.signal })) {
                if (res.closed) {
                    registrador.info('[AI AgenticLoop] Client disconnected, stopping.');
                    break;
                }
                res.write(`data: ${JSON.stringify(event)}\n\n`);
            }

            res.write(`data: [DONE]\n\n`);
            res.end();

        } else {
            // ── Standard Tool-Loop Mode for medium+ tiers ──
            const result = await aiManager.streamChat(chatOptions);

            for await (const part of result.fullStream) {
                if (res.closed) {
                    registrador.info('[AI FULLSTREAM] Client disconnected, stopping stream.');
                    break;
                }

                if (part.type === 'text-delta') {
                    res.write(`data: ${JSON.stringify({ type: 'text-delta', text: part.textDelta || part.text })}\n\n`);
                } else if (part.type === 'reasoning-start') {
                    // Native reasoning (think:true) arrives on a separate channel;
                    // wrap it as <think>…</think> in the text stream so the client's
                    // existing thinking-block parser renders it live.
                    res.write(`data: ${JSON.stringify({ type: 'text-delta', text: '<think>' })}\n\n`);
                } else if (part.type === 'reasoning-delta') {
                    res.write(`data: ${JSON.stringify({ type: 'text-delta', text: part.text ?? part.textDelta ?? '' })}\n\n`);
                } else if (part.type === 'reasoning-end') {
                    res.write(`data: ${JSON.stringify({ type: 'text-delta', text: '</think>' })}\n\n`);
                } else if (part.type === 'tool-call') {
                    const toolArgs = part.input ?? part.args ?? {};
                    res.write(`data: ${JSON.stringify({ type: 'tool-call', toolName: part.toolName, args: toolArgs, toolCallId: part.toolCallId })}\n\n`);
                } else if (part.type === 'tool-result') {
                    const toolResult = part.output ?? part.result ?? { error: 'Tool returned no result' };
                    const toolArgs   = part.input  ?? part.args  ?? {};
                    if (toolResult.error) {
                        registrador.error(`[AI Tool Error] ${part.toolName}:`, toolResult.error);
                    }
                    res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId, result: toolResult, args: toolArgs })}\n\n`);
                } else if (part.type === 'tool-error') {
                    const errorMsg = part.error?.message || String(part.error || 'Unknown tool error');
                    const toolArgs = part.input ?? part.args ?? {};
                    registrador.error(`[AI Tool Error] ${part.toolName}: ${errorMsg}`);
                    res.write(`data: ${JSON.stringify({ type: 'tool-result', toolName: part.toolName, toolCallId: part.toolCallId, result: { error: errorMsg }, args: toolArgs })}\n\n`);
                } else if (part.type === 'step-finish') {
                    res.write(`data: ${JSON.stringify({ type: 'step-finish' })}\n\n`);
                } else if (part.type === 'finish') {
                    // No queryResults here: the payload can be huge and the client
                    // rehydrates rows on demand via /api/ai/query-cache/:queryId.
                    res.write(`data: ${JSON.stringify({ type: 'finish', usage: part.usage })}\n\n`);
                } else if (part.type === 'error') {
                    res.write(`data: ${JSON.stringify({ type: 'error', error: part.error?.message || String(part.error) })}\n\n`);
                }
            }

            res.write(`data: [DONE]\n\n`);
            res.end();
        }
    } catch (err) {
        registrador.error('[API] AI Stream error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        }
    }

});

const aiSkills = require('../ai/skills');

const aiTestRunner = require('../ai/testRunner');

/**
 * GET /api/ai/conversations — List conversations (newest first)
 * Query: ?search=text&limit=50
 */
rutas.get('/api/ai/conversations', async (req, res) => {
    try {
        const { search, limit, offset, mode } = req.query;
        const conversations = await aiPersistence.getConversations(dbManager, {
            search,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
            mode,
        });
        res.json(conversations);
    } catch (err) {
        registrador.error('[API] List conversations error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/conversations/by-file — Get conversations for a specific file
 * Query: ?path=relative/path/to/file.sql
 * NOTE: Must be registered BEFORE /api/ai/conversations/:id to avoid route conflict
 */
rutas.get('/api/ai/conversations/by-file', async (req, res) => {
    try {
        const { path: filePath } = req.query;
        if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
        const conversations = await aiPersistence.getConversationsByFile(dbManager, filePath);
        res.json(conversations);
    } catch (err) {
        registrador.error('[API] Get conversations by file error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/conversations/:id — Get a conversation with all messages/results
 */
rutas.get('/api/ai/conversations/:id', async (req, res) => {
    try {
        const conversation = await aiPersistence.getConversation(dbManager, req.params.id);
        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }
        res.json(conversation);
    } catch (err) {
        registrador.error('[API] Get conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations — Create a new conversation
 * Body: { mode?, provider?, model?, title? }
 */
rutas.post('/api/ai/conversations', async (req, res) => {
    try {
        const conversation = await aiPersistence.createConversation(dbManager, req.body);
        res.json(conversation);
    } catch (err) {
        registrador.error('[API] Create conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/conversations/:id — Delete a conversation and all its data
 */
rutas.delete('/api/ai/conversations/:id', async (req, res) => {
    try {
        const result = await aiPersistence.deleteConversation(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Delete conversation error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/star — Toggle starred status
 */
rutas.put('/api/ai/conversations/:id/star', async (req, res) => {
    try {
        const result = await aiPersistence.toggleStar(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Toggle star error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/title — Update conversation title
 * Body: { title }
 */
rutas.put('/api/ai/conversations/:id/title', async (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const result = await aiPersistence.updateTitle(dbManager, req.params.id, title);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Update title error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/preguntas-sugeridas — Questions to start a Deep Dive (plan UX, F5),
 * built without a model from the project's metrics, glossary and columns.
 */
rutas.get('/api/ai/preguntas-sugeridas', async (req, res) => {
    try {
        const { loadProjectContext } = require('../ai/contextLoader');
        const { preguntasSugeridas } = require('../ai/preguntasSugeridas');
        const ctx = await loadProjectContext(compartido.ROOT_DIR).catch(() => null);
        let columnas = [];
        try {
            const filas = await dbManager.systemQuery(
                `SELECT table_name, column_name, data_type FROM ${esquemas.COLUMNAS} AS c WHERE ${userTablesWhereClause()} ORDER BY table_name, ordinal_position`,
                { lane: 'meta' },
            );
            columnas = filas.map(f => ({ tabla: f.table_name, columna: f.column_name, tipo: String(f.data_type || '') }));
        } catch { /* sin base conectada: solo métricas y glosario */ }
        res.json(preguntasSugeridas({ metricas: ctx?.metrics || [], glosario: ctx?.glossary || '', columnas }));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/en-vuelo — Talk to a Deep Dive analysis while it
 * runs (plan UX, F6): `{ saltar: stepId }`, `{ indicacion: texto }` or
 * `{ pausar: true }`. The agentic loop picks it up at its next iteration.
 */
rutas.post('/api/ai/conversations/:id/en-vuelo', (req, res) => {
    const { saltar, indicacion, pausar } = req.body || {};
    const ok = require('../ai/controlEnVuelo').anotar(req.params.id, { saltar, indicacion, pausar });
    res.json({ ok });
});

/**
 * POST /api/ai/conversations/:id/messages — Add a message to a conversation
 * Body: { role, content, toolCalls?, tokenCount? }
 */
rutas.post('/api/ai/conversations/:id/messages', async (req, res) => {
    const { role, content, toolCalls, tokenCount } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required' });

    try {
        const message = await aiPersistence.addMessage(dbManager, {
            conversationId: req.params.id,
            role,
            content: content || '',
            toolCalls,
            tokenCount,
        });
        res.json(message);
    } catch (err) {
        registrador.error('[API] Add message error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/propuestas/:toolCallId — what the user decided
 * about a proposal of the Assistant. Body: { estado: 'aplicada' | 'rechazada' }.
 * `guardada: false` means the message isn't saved yet; the client then keeps
 * the state in the message it saves.
 */
rutas.post('/api/ai/conversations/:id/propuestas/:toolCallId', async (req, res) => {
    const estado = req.body?.estado;
    if (!['propuesta', 'aplicada', 'rechazada'].includes(estado)) {
        return res.status(400).json({ error: 'estado must be propuesta, aplicada or rechazada' });
    }
    try {
        const guardada = await aiPersistence.setEstadoPropuesta(dbManager, req.params.id, req.params.toolCallId, estado);
        res.json({ guardada });
    } catch (err) {
        registrador.error('[API] Proposal state error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/propuestas/crear-archivo — creates the file the Assistant proposed
 * with propose_file, once the user clicks Create. Body: { path, content }.
 * It never overwrites: an existing file answers 409, and the path has to stay
 * inside the project.
 */
rutas.post('/api/ai/propuestas/crear-archivo', async (req, res) => {
    const { path: relativa, content } = req.body || {};
    if (typeof relativa !== 'string' || typeof content !== 'string') {
        return res.status(400).json({ error: 'path and content are required' });
    }
    const normalizada = path.normalize(relativa.trim());
    if (!normalizada || normalizada === '.' || normalizada.startsWith('..') || path.isAbsolute(normalizada)) {
        return res.status(400).json({ error: 'Use a relative path inside the project.' });
    }
    const destino = path.resolve(compartido.ROOT_DIR, normalizada);
    if (!destino.startsWith(path.resolve(compartido.ROOT_DIR) + path.sep)) {
        return res.status(400).json({ error: 'The path is outside the project.' });
    }
    try {
        await fs.promises.mkdir(path.dirname(destino), { recursive: true });
        // 'wx': falla si ya existe, también si apareció entre la propuesta y el clic.
        await fs.promises.writeFile(destino, content, { encoding: 'utf8', flag: 'wx' });
        res.json({ success: true, path: normalizada.split(path.sep).join('/') });
    } catch (err) {
        if (err.code === 'EEXIST') {
            return res.status(409).json({ error: `${normalizada.split(path.sep).join('/')} already exists. Nothing was written.`, existe: true });
        }
        registrador.error('[API] Create proposed file error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/query-results — Save a query result
 * Body: { messageId, sqlQuery, columns, data, rowCount, executionTime, error }
 */
rutas.post('/api/ai/conversations/:id/query-results', async (req, res) => {
    const { messageId, sqlQuery, columns, data, rowCount, executionTime, error } = req.body;
    if (!messageId || !sqlQuery) return res.status(400).json({ error: 'messageId and sqlQuery are required' });

    try {
        const result = await aiPersistence.saveQueryResult(dbManager, {
            messageId, sqlQuery, columns, data, rowCount, executionTime, error,
        });
        res.json(result);
    } catch (err) {
        registrador.error('[API] Save query result error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/conversations/:id/chart-configs — Save a chart config
 * Body: { queryResultId, chartType, config }
 */
rutas.post('/api/ai/conversations/:id/chart-configs', async (req, res) => {
    const { queryResultId, chartType, config } = req.body;
    if (!queryResultId) return res.status(400).json({ error: 'queryResultId is required' });

    try {
        const result = await aiPersistence.saveChartConfig(dbManager, {
            queryResultId, chartType, config,
        });
        res.json(result);
    } catch (err) {
        registrador.error('[API] Save chart config error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/title/auto — Auto-generate title from first message
 * Body: { firstMessage }
 */
rutas.put('/api/ai/conversations/:id/title/auto', async (req, res) => {
    const { firstMessage } = req.body;
    if (!firstMessage) return res.status(400).json({ error: 'firstMessage is required' });

    try {
        const title = firstMessage.length > 60 ? firstMessage.substring(0, 57) + '...' : firstMessage;
        const result = await aiPersistence.updateTitle(dbManager, req.params.id, title);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Auto title error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Skills APIs --- */

/**
 * GET /api/ai/skills — List available skills for the current project
 */
rutas.get('/api/ai/skills', async (req, res) => {
    try {
        const scope = (req.query.scope || '').toLowerCase();
        let skills = await aiSkills.loadSkills(APP_DIR);
        if (scope) skills = skills.filter(s => (s.scope || 'analysis') === scope);
        res.json(skills.map(s => ({ id: s.id, name: s.name, description: s.description, scope: s.scope || 'analysis', keywords: s.keywords || [], fileName: s.fileName || '' })));
    } catch (err) {
        registrador.error('[API] Load skills error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/skills/:id — Get a single skill's full content
 */
rutas.get('/api/ai/skills/:id', async (req, res) => {
    try {
        const skill = await aiSkills.getSkill(APP_DIR, req.params.id);
        if (!skill) return res.status(404).json({ error: 'Skill not found' });
        res.json(skill);
    } catch (err) {
        registrador.error('[API] Get skill error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI File-Conversation & Session APIs --- */

/**
 * PUT /api/ai/conversations/:id/session-name — Update session name
 * Body: { sessionName }
 */
rutas.put('/api/ai/conversations/:id/session-name', async (req, res) => {
    try {
        const { sessionName } = req.body;
        if (!sessionName) return res.status(400).json({ error: 'sessionName is required' });
        const result = await aiPersistence.updateSessionName(dbManager, req.params.id, sessionName);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Update session name error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/conversations/:id/context-objects — Persist drag-drop context objects
 * Body: { contextObjects: [{type, name, path?}] }
 */
rutas.put('/api/ai/conversations/:id/context-objects', async (req, res) => {
    try {
        const { contextObjects } = req.body;
        if (!Array.isArray(contextObjects)) return res.status(400).json({ error: 'contextObjects must be an array' });
        const result = await aiPersistence.updateContextObjects(dbManager, req.params.id, contextObjects);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Update context objects error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Diving Session APIs --- */

/**
 * GET /api/ai/sessions — List diving sessions with artifact counts
 * Query: ?search=text&limit=50&offset=0
 */
rutas.get('/api/ai/sessions', async (req, res) => {
    try {
        const { search, limit, offset } = req.query;
        const sessions = await aiPersistence.getDivingSessions(dbManager, {
            search,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
        });
        res.json(sessions);
    } catch (err) {
        registrador.error('[API] List diving sessions error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/ai/sessions/:id/artifacts — Get artifacts for a session
 */
rutas.get('/api/ai/sessions/:id/artifacts', async (req, res) => {
    try {
        const artifacts = await aiPersistence.getArtifacts(dbManager, req.params.id);
        res.json(artifacts);
    } catch (err) {
        registrador.error('[API] Get session artifacts error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/sessions/:id/artifacts — Add an artifact to a session
 * Body: { artifactType, filePath, fileName, createdBy?, sqlSnapshot?, metadata?, saveLocation? }
 */
rutas.post('/api/ai/sessions/:id/artifacts', async (req, res) => {
    try {
        // Accept both legacy field names and the client's shorthand (type/name/data)
        const { type, name, data, artifactType, filePath, fileName, ...rest } = req.body;
        const artifact = await aiPersistence.createArtifact(dbManager, {
            conversationId: req.params.id,
            artifactType:   artifactType || type,
            fileName:       fileName     || name,
            filePath:       filePath     || data?.path  || null,
            metadata:       rest.metadata || data || null,
            ...rest,
        });
        res.json(artifact);
    } catch (err) {
        registrador.error('[API] Create artifact error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/sessions/:id/artifacts/:artifactId — Delete an artifact
 */
rutas.delete('/api/ai/sessions/:id/artifacts/:artifactId', async (req, res) => {
    try {
        const result = await aiPersistence.deleteArtifact(dbManager, req.params.artifactId);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Delete artifact error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Memories CRUD APIs --- */

/**
 * GET /api/ai/memories — List all active memories (superseded_by IS NULL)
 */
rutas.get('/api/ai/memories', async (req, res) => {
    try {
        const memories = await aiPersistence.getMemories(dbManager);
        res.json(memories);
    } catch (err) {
        registrador.error('[API] Get memories error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/memories/:id — Delete a memory
 */
rutas.delete('/api/ai/memories/:id', async (req, res) => {
    try {
        const result = await aiPersistence.deleteMemory(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Delete memory error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/memories/:id — Update memory content/category
 * Body: { content, category }
 */
rutas.put('/api/ai/memories/:id', async (req, res) => {
    try {
        const { content, category } = req.body;
        if (!content) return res.status(400).json({ error: 'content is required' });
        const result = await aiPersistence.updateMemory(dbManager, req.params.id, { content, category });
        res.json(result);
    } catch (err) {
        registrador.error('[API] Update memory error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- Analysis Vault APIs --- */

/**
 * GET /api/ai/vault — List vault entries
 * Query: ?search=text&tags=tag1&limit=50&offset=0
 */
rutas.get('/api/ai/vault', async (req, res) => {
    try {
        const { search, tags, limit, offset } = req.query;
        const entries = await aiPersistence.getVaultEntries(dbManager, {
            search,
            tags,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
        });
        res.json(entries);
    } catch (err) {
        registrador.error('[API] List vault entries error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/vault — Save an analysis to the vault
 * Body: { title, description?, sqlContent?, resultSnapshot?, chartConfig?, tags?, sourceFile?, conversationId? }
 */
rutas.post('/api/ai/vault', async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) return res.status(400).json({ error: 'title is required' });
        const entry = await aiPersistence.saveToVault(dbManager, req.body);
        res.json(entry);
    } catch (err) {
        registrador.error('[API] Save to vault error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/ai/vault/:id — Update a vault entry
 * Body: { title?, description?, tags? }
 */
rutas.put('/api/ai/vault/:id', async (req, res) => {
    try {
        const result = await aiPersistence.updateVaultEntry(dbManager, req.params.id, req.body);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Update vault entry error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/ai/vault/:id — Delete a vault entry
 */
rutas.delete('/api/ai/vault/:id', async (req, res) => {
    try {
        const result = await aiPersistence.deleteVaultEntry(dbManager, req.params.id);
        res.json(result);
    } catch (err) {
        registrador.error('[API] Delete vault entry error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Query Cache API --- */

/**
 * GET /api/ai/query-cache/:queryId — Retrieve a cached query result by queryId.
 * Used by the NarrativeCard "view query" audit button.
 */
rutas.get('/api/ai/query-cache/:queryId', async (req, res) => {
    try {
        const cached = await aiPersistence.getQueryCache(dbManager, req.params.queryId);
        if (!cached) return res.status(404).json({ error: 'Query not found' });
        res.json({
            queryId:       cached.id,
            sqlQuery:      cached.sql_query,
            columns:       cached.columns_info || [],
            data:          cached.data         || [],
            rowCount:      cached.row_count,
            execMs:        cached.exec_ms,
            createdAt:     cached.created_at,
        });
    } catch (err) {
        registrador.error('[API] query-cache fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Agent Test APIs --- */

/**
 * GET /api/ai/tests — List available test cases
 */
rutas.get('/api/ai/tests', async (req, res) => {
    try {
        const tests = await aiTestRunner.loadTests(compartido.ROOT_DIR);
        res.json(tests);
    } catch (err) {
        registrador.error('[API] Load tests error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/ai/tests/run — Run all tests or a specific test
 * Body: { testId? } — if testId provided, runs only that test
 */
rutas.post('/api/ai/tests/run', async (req, res) => {
    const { testId } = req.body || {};

    try {
        if (testId) {
            const tests = await aiTestRunner.loadTests(compartido.ROOT_DIR);
            const test = tests.find(t => t.id === testId);
            if (!test) return res.status(404).json({ error: 'Test not found' });

            const result = await aiTestRunner.runTest(test, aiManager, dbManager);
            res.json({ total: 1, passed: result.pass ? 1 : 0, failed: result.pass ? 0 : 1, results: [result] });
        } else {
            const summary = await aiTestRunner.runAllTests(compartido.ROOT_DIR, aiManager, dbManager);
            res.json(summary);
        }
    } catch (err) {
        registrador.error('[API] Run tests error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* --- AI Context Export --- */

/**
 * POST /api/ai/export-context
 * Generates an AI-ready context document (Markdown) from a DuckDB query result.
 * Body: { query, sampleRows?, includeProfile? }
 * Returns: { markdown, rowCount, columnCount, estimatedBytes }
 */
rutas.post('/api/ai/export-context', async (req, res) => {
    const { query, sampleRows = 20, includeProfile = false } = req.body;
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
    }

    const cleanQuery = query.trim().replace(/;+$/, '');
    const clampedRows = Math.min(Math.max(Number(sampleRows) || 20, 1), 500);

    try {
        // 1. Schema via DESCRIBE
        const descRows = await dbManager.systemQuery(`DESCRIBE (${cleanQuery})`);
        const columns = descRows.map(r => ({ name: r.column_name, type: r.column_type }));

        // 2. Row count
        const countResult = await dbManager.systemQuery(
            `SELECT COUNT(*) AS cnt FROM (${cleanQuery}) t`
        );
        const rowCount = Number(countResult[0]?.cnt ?? 0);

        // 3. Sample rows
        const sampleResult = await dbManager.query(
            `SELECT * FROM (${cleanQuery}) LIMIT ${clampedRows}`
        );

        // 4. Optional rich profile
        let profileSection = '';
        if (includeProfile) {
            const { profileTable } = require('../ai/profiling');
            const profile = await profileTable(dbManager, `(${cleanQuery})`);
            const profileLines = profile.columns.map(col => {
                const parts = [`  - **${col.name}** (${col.type})`];
                if (col.nulls_pct !== null) parts.push(`nulls ${col.nulls_pct}%`);
                if (col.unique_approx !== null) parts.push(`~${col.unique_approx} únicos`);
                if (col.min !== undefined && col.min !== null) parts.push(`min ${col.min}`);
                if (col.max !== undefined && col.max !== null) parts.push(`max ${col.max}`);
                if (col.avg !== undefined && col.avg !== null) parts.push(`avg ${col.avg}`);
                if (col.top_values && col.top_values.length > 0) {
                    const tops = col.top_values.map(v => `"${v.val}"(${v.count})`).join(', ');
                    parts.push(`top: [${tops}]`);
                }
                return parts.join(' — ');
            });
            profileSection = `\n## Perfil estadístico\n${profileLines.join('\n')}\n`;
        }

        // 5. Build Markdown
        const schemaLines = columns.map(c => `- \`${c.name}\` : ${c.type}`).join('\n');

        // Build sample table
        const colNames = columns.map(c => c.name);
        const tableHeader = '| ' + colNames.join(' | ') + ' |';
        const tableSep = '| ' + colNames.map(() => '---').join(' | ') + ' |';
        const tableRows = sampleResult.slice(0, clampedRows).map(row => {
            const cells = colNames.map(c => {
                const v = row[c];
                if (v === null || v === undefined) return '';
                const s = String(v);
                return s.length > 80 ? s.slice(0, 77) + '...' : s;
            });
            return '| ' + cells.join(' | ') + ' |';
        });
        const sampleTable = [tableHeader, tableSep, ...tableRows].join('\n');

        const markdown = `# Contexto de datos — AmoxSQL Data Skill

**Motor:** DuckDB (sintaxis SQL DuckDB). Los datos son locales.
**Filas totales:** ${rowCount.toLocaleString()}
**Columnas:** ${columns.length}

**Query de origen:**
\`\`\`sql
${cleanQuery}
\`\`\`

## Schema

${schemaLines}
${profileSection}
## Muestra (${sampleResult.length} de ${rowCount.toLocaleString()} filas)

${sampleTable}

---
> Utiliza esta información para responder preguntas sobre los datos.
> Devuelve SQL ejecutable en DuckDB (bloques \`\`\`sql\`\`\`) y/o JSON de configuración de gráfico (bloques \`\`\`json\`\`\`).
> Usa exactamente los nombres de columna del schema anterior.
`;

        const estimatedBytes = Buffer.byteLength(markdown, 'utf8');
        res.json({ markdown, rowCount, columnCount: columns.length, estimatedBytes });

    } catch (err) {
        registrador.error('[export-context]', err);
        res.status(500).json({ error: err.message });
    }
});

// La política de IA que rige ahora (B4): la interfaz la enseña en el asistente.
rutas.get('/api/ai/politica', (_req, res) => {
    const p = require('../ai/politica').actual();
    res.json({ ...p, restringe: require('../ai/politica').restringe(p) });
});

module.exports = rutas;
