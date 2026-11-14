/**
 * Data Flow: processes (.sqlchain), their runs, history and preview.
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
const baseCentral      = require('../central/BaseCentral');
const manifiesto       = require('../manifiesto');
const contextoDeEjecucion = require('../ejecucion/ContextoDeEjecucion');
const esquemas = require('../esquemas');
const aiManager = require('../AiManager');
const aiSkills = require('../ai/skills');
const historialDeProcesos = require('../ejecucion/historial');
const { ejecutarProceso } = require('../ejecucion/ejecutarProceso');

const ctx = require('./compartido');
const {
    APP_DIR, anotarFuentesDelSql, buildTableContext, remontarFuentes,
} = ctx;

const rutas = express.Router();

const yaml = require('js-yaml');

const parametros = require('../parametros');

/* ============================================================
 * Execution Chain APIs
 * ============================================================ */
const chainExecutor = require('../ChainExecutor');

// Dónde viven los pasos intermedios de una cadena, y por qué (fase 3).
rutas.post('/api/chains/base', (req, res) => {
    const { chainDefinition, chainFile } = req.body || {};
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    const r = contextoDeEjecucion.resolverBase(chainDefinition);
    const ruta = r.resuelta === 'trabajo' && ctx.PROYECTO_ABIERTO
        ? path.relative(ctx.ROOT_DIR, contextoDeEjecucion.rutaDeTrabajo(ctx.ROOT_DIR, chainFile || ''))
        : null;
    res.json({ ...r, ruta });
});

// Run a chain
rutas.post('/api/chains/run', async (req, res) => {
    const { chainDefinition, chainFile, mode, startNodeId, variables, deFuera } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition is required' });

    try {
        // Validate first
        const validation = chainExecutor.validate(chainDefinition, ctx.ROOT_DIR);
        if (!validation.valid) {
            return res.status(400).json({ error: 'Validation failed', details: validation.errors });
        }
        anotarCredencialesDeCadena(chainDefinition);

        const result = await ejecutarProceso({
            dbManager,
            chainDef: chainDefinition,
            proyecto: ctx.ROOT_DIR,
            chainFile: chainFile || '',
            mode: mode || 'full',
            startNodeId,
            variables: variables || undefined,
            // 5.11 (D4/D5): valores que no escribió el autor (el formulario).
            deFuera: deFuera || {},
            origen: deFuera && Object.keys(deFuera).length ? 'formulario' : 'interfaz',
        });
        // Un nodo Publish deja (o pone al día) una fuente: que se vea ya (C6).
        if ((chainDefinition.nodes || []).some(n => n?.type === 'publicar')) await remontarFuentes();

        res.json(result);
    } catch (err) {
        if (err instanceof parametros.ErrorDeParametro) return res.status(400).json({ error: err.message, parametro: err.nombre });
        registrador.error('[Chains] Run error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Correr un proceso una vez por cada juego de valores (5.11, D4): «Run for
 * each…». Una ejecución detrás de otra; sigue aunque una falle. Se cuenta por
 * SSE: inicio y fin de cada una, y el resumen.
 */
rutas.post('/api/chains/lote', async (req, res) => {
    const { chainDefinition, chainFile, variables, lote } = req.body || {};
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition is required' });
    if (!Array.isArray(lote) || !lote.length) return res.status(400).json({ error: 'Give at least one set of values.' });
    if (lote.length > 500) return res.status(400).json({ error: 'At most 500 runs at once.' });
    const cadena = { ...chainDefinition, variables: { ...(chainDefinition.variables || {}), ...(variables || {}) } };
    try {
        for (const p of lote) parametros.resolver(cadena, p);
    } catch (err) {
        if (err instanceof parametros.ErrorDeParametro) return res.status(400).json({ error: err.message, parametro: err.nombre });
        throw err;
    }
    const validation = chainExecutor.validate(cadena, ctx.ROOT_DIR);
    if (!validation.valid) return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    anotarCredencialesDeCadena(cadena);

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const enviar = (d) => { try { res.write(`data: ${JSON.stringify(d)}\n\n`); } catch { /* se fue */ } };
    let cortado = false;
    // El cliente se fue (cerró la pestaña o pulsó Stop). `req` cierra en cuanto
    // se lee el cuerpo; quien dice que ya no hay nadie es la respuesta.
    res.on('close', () => { if (!res.writableEnded) cortado = true; });
    let bien = 0;
    for (let i = 0; i < lote.length; i++) {
        if (cortado) break;
        enviar({ tipo: 'inicio', i, total: lote.length, parametros: lote[i] });
        try {
            const r = await ejecutarProceso({
                dbManager, chainDef: cadena, proyecto: ctx.ROOT_DIR, chainFile: chainFile || '',
                variables: cadena.variables, deFuera: lote[i], origen: 'lote',
            });
            if (r.status === 'completed') bien++;
            enviar({ tipo: 'fin', i, estado: r.status, runId: r.runId || null, error: r.error || null });
        } catch (err) {
            enviar({ tipo: 'fin', i, estado: 'failed', error: err.message });
        }
    }
    if ((cadena.nodes || []).some(n => n?.type === 'publicar')) await remontarFuentes().catch(() => {});
    enviar({ tipo: 'resumen', bien, total: lote.length, cortado });
    res.end();
});

// Get run status (for polling)
rutas.get('/api/chains/run/:runId/status', async (req, res) => {
    try {
        const { run, nodeRuns } = await historialDeProcesos.leer({ base: baseCentral, dbManager, runId: req.params.runId });
        res.json({ run, nodeRuns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lo que dejó una ejecución, para quien no miró el proceso (5.11, D5/D2).
rutas.get('/api/chains/run/:runId/resumen', async (req, res) => {
    try {
        const r = await require('../ejecucion/resumen').resumir({ base: baseCentral, dbManager, runId: req.params.runId, proyecto: ctx.ROOT_DIR });
        if (!r) return res.status(404).json({ error: 'That run is not in the history.' });
        res.json(r);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cancel a running chain
rutas.post('/api/chains/run/:runId/cancel', (req, res) => {
    chainExecutor.cancelRun(req.params.runId);
    res.json({ success: true });
});

// Resume from checkpoint (re-run from a specific node)
rutas.post('/api/chains/run/:runId/resume', async (req, res) => {
    const { chainDefinition, chainFile, startNodeId, variables } = req.body;
    if (!chainDefinition || !startNodeId) {
        return res.status(400).json({ error: 'chainDefinition and startNodeId required' });
    }
    try {
        const result = await ejecutarProceso({
            dbManager,
            chainDef: chainDefinition,
            proyecto: ctx.ROOT_DIR,
            chainFile: chainFile || '',
            mode: 'from_node',
            startNodeId,
            variables: variables || undefined,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Validate a chain definition
rutas.post('/api/chains/validate', (req, res) => {
    const { chainDefinition } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    const result = chainExecutor.validate(chainDefinition, ctx.ROOT_DIR);
    res.json(result);
});

// List recent runs (history)
rutas.get('/api/chains/history', async (req, res) => {
    const { chainFile, limit } = req.query;
    try {
        const runs = await historialDeProcesos.listar({
            base: baseCentral, dbManager, proyecto: ctx.ROOT_DIR,
            chainFile, limit: parseInt(limit) || 20,
        });
        res.json({ runs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get detailed run
rutas.get('/api/chains/history/:runId', async (req, res) => {
    try {
        const { run, nodeRuns } = await historialDeProcesos.leer({ base: baseCentral, dbManager, runId: req.params.runId });
        res.json({ run, nodeRuns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a run
rutas.delete('/api/chains/history/:runId', async (req, res) => {
    try {
        const borrada = await historialDeProcesos.borrar({ base: baseCentral, runId: req.params.runId });
        // Lo anterior a la 5.9 está en la base del proyecto y es de sólo lectura.
        if (!borrada) return res.status(409).json({ error: 'Runs from before 5.9 are read-only.' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export chain as YAML
rutas.post('/api/chains/export-yaml', (req, res) => {
    const { chainDefinition } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    try {
        const { version, name, description, nodes, edges, variables } = chainDefinition;
        const yamlObj = {
            version,
            name,
            description: description || undefined,
            nodes: (nodes || []).map(n => ({
                id: n.id,
                type: n.type,
                label: n.label,
                description: n.description || undefined,
                config: n.config,
            })),
            edges: (edges || []).map(e => ({
                source: e.source,
                target: e.target,
            })),
            variables: variables && Object.keys(variables).length > 0 ? variables : undefined,
        };
        const yamlStr = yaml.dump(yamlObj, { indent: 2, lineWidth: 120, noRefs: true });
        res.json({ yaml: yamlStr });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Import YAML to chain definition
rutas.post('/api/chains/import-yaml', (req, res) => {
    const { yamlContent } = req.body;
    if (!yamlContent) return res.status(400).json({ error: 'yamlContent required' });
    try {
        const parsed = yaml.load(yamlContent);
        res.json({ chainDefinition: parsed });
    } catch (err) {
        res.status(400).json({ error: `Invalid YAML: ${err.message}` });
    }
});

// Create a new SQL file from the chain canvas
rutas.post('/api/chains/create-sql-file', (req, res) => {
    const { filePath, template } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });

    const fullPath = path.resolve(ctx.ROOT_DIR, filePath);

    // Security: ensure path is within project
    if (!fullPath.startsWith(ctx.ROOT_DIR)) {
        return res.status(403).json({ error: 'Path outside project directory' });
    }

    // Create parent directories if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
        return res.status(409).json({ error: 'File already exists' });
    }

    const content = template || `-- ${path.basename(filePath)}\n-- Created from Execution Chain\n\n`;
    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ success: true, path: filePath });
});

// Scan folder for files matching a pattern
rutas.get('/api/chains/scan-folder', (req, res) => {
    const { folder, pattern } = req.query;
    if (!folder) return res.status(400).json({ error: 'folder required' });

    const fullPath = path.resolve(ctx.ROOT_DIR, folder);
    if (!fullPath.startsWith(ctx.ROOT_DIR)) {
        return res.status(403).json({ error: 'Path outside project directory' });
    }

    if (!fs.existsSync(fullPath)) {
        return res.json({ files: [], count: 0 });
    }

    try {
        const allFiles = fs.readdirSync(fullPath);
        const ext = pattern ? pattern.replace('*', '') : '';
        const filtered = ext ? allFiles.filter(f => f.endsWith(ext)) : allFiles;
        res.json({ files: filtered, count: filtered.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detect result type from SQL
rutas.post('/api/chains/detect-result-type', (req, res) => {
    const { sql } = req.body;
    if (!sql) return res.status(400).json({ error: 'sql required' });
    const result = chainExecutor.detectResultType(sql);
    res.json(result);
});

// SSE stream for real-time execution logs
rutas.get('/api/chains/run/:runId/stream', (req, res) => {
    const { runId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 15000);

    chainExecutor.subscribeSSE(runId, res);

    req.on('close', () => {
        clearInterval(heartbeat);
        chainExecutor.unsubscribeSSE(runId, res);
    });
});

// Preview data from a table
rutas.get('/api/chains/preview/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    // La interfaz dice en qué base corrió la cadena; sin eso, la del proyecto.
    const db = await contextoDeEjecucion.abrirParaVer(null, {
        dbManager, proyecto: ctx.ROOT_DIR, chainFile: req.query.chainFile || '',
        base: req.query.base === 'trabajo' ? 'trabajo' : 'proyecto',
    });
    try {
        let schema = req.query.schema || null;
        let bare = tableName.replace(/[^a-zA-Z0-9_\-.]/g, '');
        if (!schema && bare.includes('.')) {
            const dot = bare.indexOf('.');
            schema = bare.slice(0, dot);
            bare = bare.slice(dot + 1);
        }
        if (!schema) {
            const found = await db.query(
                `SELECT table_schema FROM ${esquemas.TABLAS} AS t WHERE table_name = '${bare.replace(/'/g, "''")}' ORDER BY (table_schema = 'main') DESC LIMIT 1`
            );
            schema = found[0]?.table_schema || 'main';
        }
        const qref = esquemas.referencia(schema, bare);
        const rows = await db.query(`SELECT * FROM ${qref} LIMIT ${limit}`);
        const countResult = await db.query(`SELECT COUNT(*) as cnt FROM ${qref}`);
        const totalRows = countResult[0]?.cnt || 0;
        const columns = rows.length > 0 ? Object.keys(rows[0]).map(k => ({
            name: k,
            type: typeof rows[0][k] === 'number' ? 'number' : 'string',
        })) : [];
        res.json({ columns, rows, totalRows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await db.cerrar();
    }
});

// Preview a node's OWN output. Fase 0 (docs/dev/auditoria_dataflow_ux.md) — tries a
// live compile first (CTEs over the node's ancestors, nothing materialized, no run
// required), falling back to whatever the node last materialized when it — or an
// ancestor it depends on — isn't SELECT-shaped (a sink, a network/LLM source, `clean`).
rutas.post('/api/chains/preview-node', async (req, res) => {
    const { nodeId, chainDefinition, chainFile } = req.body;
    const limit = Math.min(parseInt(req.body.limit) || 50, 200);
    if (!nodeId || !chainDefinition) return res.status(400).json({ error: 'nodeId and chainDefinition required' });
    try {
        const node = (chainDefinition.nodes || []).find(n => n.id === nodeId);
        if (!node) return res.json({ available: false });

        const compiled = chainExecutor.compileNodeQuery(chainDefinition, nodeId, {
            chainFile: chainFile || '', projectPath: ctx.ROOT_DIR,
        });
        if (!compiled.sql) return res.json({ available: false, reason: compiled.reason });

        // Lo que un paso materializó está en la base donde corrió la cadena.
        const db = await contextoDeEjecucion.abrirParaVer(chainDefinition, { dbManager, proyecto: ctx.ROOT_DIR, chainFile: chainFile || '' });
        try {

            const wrapped = `SELECT * FROM (${compiled.sql}) AS _amox_preview`;
            const rows = await db.query(`${wrapped} LIMIT ${limit}`);
            const countResult = await db.query(`SELECT COUNT(*) AS cnt FROM (${compiled.sql}) AS _amox_count`);
            const columns = rows.length > 0
                ? Object.keys(rows[0]).map(k => ({ name: k, type: typeof rows[0][k] === 'number' ? 'number' : 'string' }))
                : (await db.query(`DESCRIBE ${compiled.sql}`)).map(r => ({ name: r.column_name || r.name, type: r.column_type || r.type }));
            res.json({
                available: true,
                source: compiled.inlinable ? 'live' : 'materialized',
                table: compiled.materialized ? (chainExecutor.staticOutputRef(node, chainFile || '')?.table || null) : null,
                columns, rows, totalRows: countResult[0]?.cnt || 0,
            });
        } finally {
            await db.cerrar();
        }
    } catch (err) {
        res.json({ available: false, error: err.message });
    }
});

// Infer the columns available to a node from its upstream parent(s). Fase 0 — compiles
// each parent's own query (CTEs, not a materialized table lookup) and DESCRIBEs it, so
// columns show up as soon as a source is connected, at any depth, without running the
// chain. Falls back to a parent's last materialized table when it isn't SELECT-shaped.
// Checks every parent edge (not just the first), so join_tables/merge_tables now surface
// both/all sides' columns instead of only the first upstream node's.
rutas.post('/api/chains/schema/infer', async (req, res) => {
    const { nodeId, chainDefinition, chainFile } = req.body;
    if (!nodeId || !chainDefinition) return res.status(400).json({ error: 'nodeId and chainDefinition required' });
    try {
        const { nodes = [], edges = [] } = chainDefinition;
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return res.status(404).json({ error: 'Node not found' });

        const parentIds = edges.filter(e => e.target === nodeId).map(e => e.source);
        if (parentIds.length === 0) return res.json({ columns: [] });

        const seen = new Set();
        const columns = [];
        const db = await contextoDeEjecucion.abrirParaVer(chainDefinition, { dbManager, proyecto: ctx.ROOT_DIR, chainFile: chainFile || '' });
        try {
            for (const parentId of parentIds) {
                const compiled = chainExecutor.compileNodeQuery(chainDefinition, parentId, {
                    chainFile: chainFile || '', projectPath: ctx.ROOT_DIR,
                });
                if (!compiled.sql) continue;
                try {
                    const result = await db.query(`DESCRIBE ${compiled.sql}`);
                    for (const r of (result || [])) {
                        const name = r.column_name || r.name;
                        if (!name || seen.has(name)) continue;
                        seen.add(name);
                        columns.push({ name, type: r.column_type || r.type });
                    }
                } catch {}
            }
        } finally {
            await db.cerrar();
        }

        res.json({ columns });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// The SQL compiled for one node's own output — a live CTE chain when possible, or the
// SELECT over its last materialized table. Fase 0's third leg: "ver el SQL de este nodo"
// without exporting the whole chain to a file.
rutas.post('/api/chains/node-sql', (req, res) => {
    const { nodeId, chainDefinition, chainFile } = req.body;
    if (!nodeId || !chainDefinition) return res.status(400).json({ error: 'nodeId and chainDefinition required' });
    try {
        const node = (chainDefinition.nodes || []).find(n => n.id === nodeId);
        if (!node) return res.status(404).json({ error: 'Node not found' });
        const compiled = chainExecutor.compileNodeQuery(chainDefinition, nodeId, {
            chainFile: chainFile || '', projectPath: ctx.ROOT_DIR,
        });
        res.json({
            sql: compiled.sql,
            source: compiled.inlinable ? 'live' : (compiled.materialized ? 'materialized' : 'none'),
            reason: compiled.reason || null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export chain as a (mostly) runnable SQL script
rutas.post('/api/chains/export-sql', (req, res) => {
    const { chainDefinition, chainFile, variables } = req.body;
    if (!chainDefinition) return res.status(400).json({ error: 'chainDefinition required' });
    try {
        const sql = chainExecutor.compileToSql(chainDefinition, ctx.ROOT_DIR, chainFile || '', variables || {});
        res.json({ sql });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate a chain DAG from a natural-language description (embedded canvas AI)
rutas.post('/api/chains/ai/generate', async (req, res) => {
    const { prompt, chainDefinition, provider, model } = req.body;
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'prompt is required' });
    try {
        const { generateChain } = require('../ai/chainGenerator');

        // Engineering skills as guidance (bias toward good pipeline patterns).
        let skillsText = '';
        try {
            const skills = (await aiSkills.loadSkills(APP_DIR)).filter(s => (s.scope || 'analysis') === 'engineering');
            skillsText = skills.map(s => `## ${s.name}\n${s.content}`).join('\n\n').slice(0, 8000);
        } catch { /* skills optional */ }

        // Available tables for grounding.
        let tables = [];
        try { tables = await buildTableContext(); } catch { /* db optional */ }

        const cfg = aiManager.getConfig();
        const result = await generateChain({
            getModel: aiManager.getModel.bind(aiManager),
            provider: provider || cfg.provider || 'ollama',
            model: model || cfg.defaultModel,
            prompt: String(prompt).trim(),
            currentChain: chainDefinition || null,
            tables,
            skillsText,
            validateGraph: (chain) => {
                try { chainExecutor.computeLayers(chain.nodes, chain.edges); return true; }
                catch (e) { return e.message; }
            },
        });
        res.json(result);
    } catch (err) {
        registrador.error('[Chains AI] generate error:', err);
        res.status(500).json({ error: err.message });
    }
});

function anotarCredencialesDeCadena(definicion) {
    if (!ctx.PROYECTO_ABIERTO) return;
    try { manifiesto.anotarDesdeCadena(ctx.ROOT_DIR, definicion); }
    catch (e) { registrador.aviso('[Manifiesto] No se pudieron anotar las credenciales:', e.message); }
    // Y las fuentes con nombre que usa: por sus nodos Source y por su SQL.
    for (const n of definicion?.nodes || []) {
        if (n?.type === 'fuente' && n.config?.fuente) anotarFuentesDelSql(`fuentes."${n.config.fuente}"`);
        else if (n?.config) anotarFuentesDelSql(JSON.stringify(n.config).replace(/\\"/g, '"'));
    }
}

module.exports = rutas;
