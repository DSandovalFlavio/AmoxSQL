/**
 * dbt inside AmoxSQL: the environment, targets, models, runs, lineage, the bridge to sources.
 *
 * Rutas movidas de `server/index.js` (6.0, M7) sin cambiar ninguna URL. Lo que
 * comparten con el resto llega por `./compartido` (index.js lo llena antes de
 * cargar este archivo); el estado que cambia en marcha se lee como `ctx.X`.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const dbManager        = require('../DatabaseManager');
const baseCentral      = require('../central/BaseCentral');
const dbtCorrer        = require('../dbt/correr');
const dbtEjecutar      = require('../dbt/ejecutar');
const dbtFuentes       = require('../dbt/fuentes');
const dbtModelo        = require('../dbt/modelo');
const scaffolder       = require('../projectScaffolder');

const ctx = require('./compartido');
const {
    archivoDelProyecto,
} = ctx;

const rutas = express.Router();

const { exec } = require('child_process');

const dbtEntorno       = require('../dbt/entorno');

const dbtProyecto      = require('../dbt/proyecto');

/* --- dbt Integration API --- */

// GET /api/dbt/manifest — Read target/manifest.json from project root
// Returns both the "panel" shape (available/models/sources) consumed by SqlEditor
// and the "lineage" shape (exists/nodes/edges) consumed by DbtLineageGraph.
rutas.get('/api/dbt/manifest', (req, res) => {
    try {
        const manifestPath = path.join(ctx.ROOT_DIR, 'target', 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            return res.json({
                available: false,
                exists: false,
                hint: 'Run "dbt compile" or "dbt run" first to generate the manifest.',
                models: [],
                sources: [],
                nodes: [],
                edges: [],
            });
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

        // Panel shape: simplified models/sources for SqlEditor autocomplete
        const models = Object.values(manifest.nodes || {})
            .filter(n => n.resource_type === 'model')
            .map(n => ({
                name: n.name,
                schema: n.schema || '',
                description: n.description || ''
            }));

        const sourcesMap = {};
        Object.values(manifest.sources || {}).forEach(s => {
            const srcName = s.source_name;
            if (!sourcesMap[srcName]) {
                sourcesMap[srcName] = { name: srcName, schema: s.source_description || '', tables: [] };
            }
            sourcesMap[srcName].tables.push({
                name: s.name,
                description: s.description || ''
            });
        });
        const sources = Object.values(sourcesMap);

        // Lineage shape: full DAG for DbtLineageGraph
        const nodes = [];
        const edges = [];

        for (const [key, node] of Object.entries(manifest.nodes || {})) {
            nodes.push({
                id: key,
                name: node.name,
                resourceType: node.resource_type,
                schema: node.schema,
                materialized: node.config?.materialized || null,
                path: node.original_file_path || node.path || null,
                description: node.description || '',
                tags: node.tags || [],
            });
            for (const dep of (node.depends_on?.nodes || [])) {
                edges.push({ from: dep, to: key });
            }
        }

        for (const [key, source] of Object.entries(manifest.sources || {})) {
            nodes.push({
                id: key,
                name: `${source.source_name}.${source.name}`,
                resourceType: 'source',
                schema: source.schema,
                materialized: null,
                path: source.original_file_path || null,
                description: source.description || '',
                tags: source.tags || [],
            });
        }

        for (const [key, exposure] of Object.entries(manifest.exposures || {})) {
            nodes.push({
                id: key,
                name: exposure.name,
                resourceType: 'exposure',
                schema: null,
                materialized: null,
                path: exposure.original_file_path || null,
                description: exposure.description || '',
                tags: exposure.tags || [],
            });
            for (const dep of (exposure.depends_on?.nodes || [])) {
                edges.push({ from: dep, to: key });
            }
        }

        res.json({ available: true, exists: true, models, sources, nodes, edges });
    } catch (err) {
        console.error('[dbt] Error reading manifest:', err);
        res.status(500).json({ available: false, exists: true, error: err.message });
    }
});

/* --- DBT Management APIs --- */

// Validate environment: check Python, DBT, and Conda/Mamba availability (ASYNC — non-blocking)
rutas.get('/api/dbt/validate-env', async (req, res) => {
    const result = {
        python: false, pythonVersion: null,
        dbt: false, dbtVersion: null,
        conda: false, condaVersion: null, condaPath: null,
        mamba: false, mambaVersion: null,
        activeCondaEnv: null,
    };

    const execAsync = (cmd, timeout = 5000) => new Promise((resolve) => {
        exec(cmd, { encoding: 'utf8', timeout, maxBuffer: 1024 * 512 }, (err, stdout) => {
            if (err) resolve({ ok: false, output: '' });
            else resolve({ ok: true, output: (stdout || '').trim() });
        });
    });

    // Run all independent checks concurrently (non-blocking)
    const [pythonRes, python3Res, dbtRes, condaRes, mambaRes] = await Promise.all([
        execAsync('python --version'),
        execAsync('python3 --version'),
        execAsync('dbt --version', 10000),
        execAsync('conda --version'),
        execAsync('mamba --version'),
    ]);

    // Python
    if (pythonRes.ok) {
        result.python = true;
        result.pythonVersion = pythonRes.output.replace('Python ', '');
    } else if (python3Res.ok) {
        result.python = true;
        result.pythonVersion = python3Res.output.replace('Python ', '');
    }

    // DBT
    if (dbtRes.ok) {
        result.dbt = true;
        const match = dbtRes.output.match(/installed:\s*([\d.]+)/);
        result.dbtVersion = match ? match[1] : dbtRes.output.split('\n')[0];
    }

    // Conda — PATH first
    if (condaRes.ok) {
        result.conda = true;
        result.condaVersion = condaRes.output.replace('conda ', '');
        result.condaPath = 'conda';
    } else {
        // Not in PATH — scan common install locations (sequential fs checks are fast)
        const home = process.env.USERPROFILE || process.env.HOME || '';
        const localAppData = process.env.LOCALAPPDATA || '';
        const programData = process.env.ProgramData || 'C:\\ProgramData';
        const candidateDirs = [
            path.join(home, 'anaconda3'), path.join(home, 'Anaconda3'),
            path.join(home, 'miniconda3'), path.join(home, 'Miniconda3'),
            path.join(home, 'miniforge3'), path.join(home, 'mambaforge'),
            path.join(localAppData, 'anaconda3'), path.join(localAppData, 'Anaconda3'),
            path.join(localAppData, 'miniconda3'), path.join(localAppData, 'Miniconda3'),
            path.join(localAppData, 'miniforge3'),
            path.join(programData, 'anaconda3'), path.join(programData, 'Anaconda3'),
            path.join(programData, 'miniconda3'), path.join(programData, 'Miniconda3'),
            'C:\\anaconda3', 'C:\\miniconda3', 'C:\\Anaconda3', 'C:\\Miniconda3',
            path.join(home, 'opt', 'anaconda3'), path.join(home, 'opt', 'miniconda3'),
            '/opt/anaconda3', '/opt/miniconda3', '/opt/homebrew/anaconda3',
        ].filter(d => d && !d.startsWith(path.join('', '')));

        for (const dir of candidateDirs) {
            if (result.conda) break;
            const exePaths = [
                path.join(dir, 'condabin', 'conda.bat'),
                path.join(dir, 'Scripts', 'conda.exe'),
                path.join(dir, 'conda.exe'),
                path.join(dir, 'condabin', 'conda'),
                path.join(dir, 'bin', 'conda'),
            ];
            for (const condaExe of exePaths) {
                if (fs.existsSync(condaExe)) {
                    const scanRes = await execAsync(`"${condaExe}" --version`);
                    if (scanRes.ok) {
                        result.conda = true;
                        result.condaVersion = scanRes.output.replace('conda ', '');
                        result.condaPath = condaExe;
                        break;
                    }
                }
            }
        }
    }

    // Mamba
    if (mambaRes.ok) {
        result.mamba = true;
        const match = mambaRes.output.match(/mamba\s+([\d.]+)/);
        result.mambaVersion = match ? match[1] : mambaRes.output.split('\n')[0];
    }

    // Check active conda env
    if (process.env.CONDA_DEFAULT_ENV) {
        result.activeCondaEnv = process.env.CONDA_DEFAULT_ENV;
    }

    res.json(result);
});

// List conda environments and check for dbt in each
rutas.get('/api/dbt/conda-envs', async (req, res) => {
    const condaCmd = req.query.condaPath || 'conda';
    try {
        // exec async: execSync here froze the WHOLE server (including the AI
        // SSE stream) for up to 10s whenever the DBT panel opened.
        const output = await new Promise((resolve, reject) => {
            exec(`"${condaCmd}" env list --json`, { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout || '');
            });
        });
        const parsed = JSON.parse(output);
        const envPaths = parsed.envs || [];

        const envs = envPaths.map(envPath => {
            const name = path.basename(envPath);
            const isBase = envPath === (parsed.root_prefix || envPath);
            const envName = isBase ? 'base' : name;

            // Fast filesystem check for dbt executable (no process spawn)
            let hasDbt = false;
            const dbtCandidates = [
                path.join(envPath, 'Scripts', 'dbt.exe'),   // Windows
                path.join(envPath, 'bin', 'dbt'),            // macOS/Linux
                path.join(envPath, 'Scripts', 'dbt'),        // Windows alt
            ];
            for (const dbtExe of dbtCandidates) {
                if (fs.existsSync(dbtExe)) {
                    hasDbt = true;
                    break;
                }
            }

            return { name: envName, path: envPath, hasDbt, dbtVersion: null };
        });

        res.json({ success: true, envs });
    } catch (err) {
        // Conda not available or failed
        res.json({ success: false, envs: [], error: err.message });
    }
});

// Check dbt version in a specific conda env (ASYNC — non-blocking)
rutas.get('/api/dbt/check-env-dbt', async (req, res) => {
    const { envName, condaPath: cp } = req.query;
    if (!envName) return res.status(400).json({ error: 'envName is required' });

    const condaCmd = cp || 'conda';
    try {
        const output = await new Promise((resolve, reject) => {
            exec(`"${condaCmd}" run --no-capture-output -n ${envName} pip show dbt-core`, {
                encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 512
            }, (err, stdout) => {
                if (err) reject(err);
                else resolve((stdout || '').trim());
            });
        });
        const match = output.match(/Version:\s*([\d.]+)/i);
        if (match) {
            res.json({ found: true, version: match[1] });
        } else {
            res.json({ found: false, version: null });
        }
    } catch (e) {
        res.json({ found: false, version: null });
    }
});

// Detect existing DBT project
rutas.get('/api/dbt/detect', (req, res) => {
    const projectFile = path.join(ctx.ROOT_DIR, 'dbt_project.yml');
    if (!fs.existsSync(projectFile)) {
        return res.json({ exists: false });
    }

    try {
        const content = yaml.load(fs.readFileSync(projectFile, 'utf8'));
        res.json({
            exists: true,
            projectName: content.name || 'unknown',
            version: content.version || '1.0.0',
            profile: content.profile || content.name,
            modelPaths: content['model-paths'] || content['source-paths'] || ['models'],
        });
    } catch (err) {
        res.json({ exists: true, error: err.message });
    }
});

// Initialize a new DBT project
rutas.post('/api/dbt/init', (req, res) => {
    // 5.12 (I11, Dec-29): capas con un ejemplo que corre a la primera, y un solo
    // target, prod, marcado como producción.
    const { projectName = 'amox_dbt_project', profileName } = req.body || {};
    try {
        const r = dbtProyecto.crear(ctx.ROOT_DIR, { nombre: projectName, perfil: profileName });
        res.json({ success: true, message: `DBT project "${r.nombre}" initialized with an example in each layer.`, createdFiles: r.creados });
    } catch (err) {
        console.error('DBT Init Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Los targets del perfil, cuál está activo y cuáles son producción (I4, Dec-29).
rutas.get('/api/dbt/targets', (_req, res) => {
    try { res.json(dbtProyecto.targets(ctx.ROOT_DIR)); } catch (e) { res.status(500).json({ error: e.message }); }
});

rutas.post('/api/dbt/targets/dev', (req, res) => {
    try {
        const t = dbtProyecto.crearDev(ctx.ROOT_DIR, { desde: req.body?.desde || null, nombre: req.body?.nombre || 'dev' });
        const cfg = scaffolder.getProjectConfig(ctx.ROOT_DIR)?.dbt || {};
        scaffolder.saveProjectConfig(ctx.ROOT_DIR, { dbt: { ...cfg, target: t.nombre } });
        res.json({ creado: t, ...dbtProyecto.targets(ctx.ROOT_DIR) });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

rutas.get('/api/dbt/explicaciones', (_req, res) => res.json(dbtProyecto.EXPLICACIONES));

// El puente: las fuentes de AmoxSQL en dbt y promover una consulta (5.12, fase 6; I7, I6).
rutas.get('/api/dbt/fuentes', (_req, res) => {
    try { res.json(require('../dbt/puente').estado(ctx.ROOT_DIR)); } catch (e) { res.status(500).json({ error: e.message }); }
});

rutas.put('/api/dbt/fuentes', (req, res) => {
    try { res.json(require('../dbt/puente').escribir(ctx.ROOT_DIR, Array.isArray(req.body?.nombres) ? req.body.nombres.map(String) : [])); } catch (e) { res.status(400).json({ error: e.message }); }
});

rutas.post('/api/dbt/promover', (req, res) => {
    try { res.json(require('../dbt/puente').promover(ctx.ROOT_DIR, req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
});

// Resultados en el linaje (5.12, fase 4; I3).
rutas.get('/api/dbt/linaje/resultados', async (_req, res) => {
    try { res.json(await require('../dbt/linaje').paraElLinaje(ctx.ROOT_DIR, { dbManager })); } catch (e) { res.status(500).json({ error: e.message }); }
});

rutas.post('/api/dbt/linaje/filas-de-test', async (req, res) => {
    try { res.json(await require('../dbt/linaje').filasDeTest(ctx.ROOT_DIR, String(req.body?.test || ''), { dbManager })); } catch (e) { res.status(400).json({ error: e.message }); }
});

// Lo que el editor sabe de dbt para completar (5.12, fase 3b; I12, Dec-35).
rutas.get('/api/dbt/catalogo', async (_req, res) => {
    try { res.json(await require('../dbt/catalogo').catalogo(ctx.ROOT_DIR, { dbManager })); } catch (e) { res.status(500).json({ error: e.message }); }
});

rutas.get('/api/dbt/modelo', (req, res) => {
    try { res.json(dbtModelo.info(ctx.ROOT_DIR, archivoDelProyecto(req.query.archivo))); } catch (e) { res.status(400).json({ error: e.message }); }
});

rutas.post('/api/dbt/modelo/compilar', async (req, res) => {
    try {
        const r = await dbtModelo.compilar(ctx.ROOT_DIR, archivoDelProyecto(req.body?.archivo), { dbManager, forzar: !!req.body?.forzar, env: await dbtFuentes.variables(ctx.ROOT_DIR).catch(() => ({})) });
        res.json(r);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

rutas.post('/api/dbt/modelo/vista-previa', async (req, res) => {
    try {
        const r = await dbtModelo.sqlDeVistaPrevia(ctx.ROOT_DIR, archivoDelProyecto(req.body?.archivo), { dbManager, env: await dbtFuentes.variables(ctx.ROOT_DIR).catch(() => ({})) });
        res.json(r);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

rutas.get('/api/dbt/definicion', (req, res) => {
    const r = dbtModelo.definicion(ctx.ROOT_DIR, { ref: req.query.ref || null, source: req.query.source || null });
    if (!r) return res.status(404).json({ error: req.query.ref ? `No model, seed or snapshot named «${req.query.ref}».` : `No source named «${req.query.source}».` });
    res.json(r);
});

rutas.post('/api/dbt/template/snapshot', (req, res) => {
    try {
        const p = dbtProyecto.plantillaSnapshot(req.body || {});
        const f = path.join(ctx.ROOT_DIR, p.archivo);
        if (fs.existsSync(f)) return res.status(409).json({ error: `${p.archivo} already exists.` });
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, p.texto, 'utf8');
        res.json({ success: true, path: p.archivo, content: p.texto });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// Read profiles.yml
rutas.get('/api/dbt/profiles', (req, res) => {
    const profilesPath = path.join(ctx.ROOT_DIR, 'profiles.yml');
    if (!fs.existsSync(profilesPath)) {
        return res.json({ exists: false });
    }

    try {
        const content = yaml.load(fs.readFileSync(profilesPath, 'utf8'));
        res.json({ exists: true, profiles: content });
    } catch (err) {
        res.status(500).json({ error: 'Failed to parse profiles.yml', details: err.message });
    }
});

// Write profiles.yml
rutas.post('/api/dbt/profiles', (req, res) => {
    const { profiles } = req.body;
    if (!profiles) return res.status(400).json({ error: 'Profiles data is required' });

    try {
        const profilesPath = path.join(ctx.ROOT_DIR, 'profiles.yml');
        fs.writeFileSync(profilesPath, yaml.dump(profiles, { lineWidth: 120 }), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write profiles.yml', details: err.message });
    }
});

// Read dbt_project.yml
rutas.get('/api/dbt/project-config', (req, res) => {
    const projectPath = path.join(ctx.ROOT_DIR, 'dbt_project.yml');
    if (!fs.existsSync(projectPath)) {
        return res.json({ exists: false });
    }

    try {
        const content = yaml.load(fs.readFileSync(projectPath, 'utf8'));
        res.json({ exists: true, config: content });
    } catch (err) {
        res.status(500).json({ error: 'Failed to parse dbt_project.yml', details: err.message });
    }
});

// Write dbt_project.yml
rutas.post('/api/dbt/project-config', (req, res) => {
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'Config data is required' });

    try {
        const projectPath = path.join(ctx.ROOT_DIR, 'dbt_project.yml');
        fs.writeFileSync(projectPath, yaml.dump(config, { lineWidth: 120, quotingType: "'", forceQuotes: false }), 'utf8');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to write dbt_project.yml', details: err.message });
    }
});

// Generate model template
rutas.post('/api/dbt/template/model', (req, res) => {
    const { name, materialization = 'view', schema, description, tags, path: modelPath = 'models/staging', template = 'basic' } = req.body;
    if (!name) return res.status(400).json({ error: 'Model name is required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');

    // Template variations
    const templates = {
        basic: `{{
  config(
    materialized='${materialization}'${schema ? `,\n    schema='${schema}'` : ''}${tags ? `,\n    tags=${JSON.stringify(tags.split(',').map(t => t.trim()))}` : ''}
  )
}}

${description ? `{# ${description} #}\n\n` : ''}SELECT
    *
FROM {{ source('source_name', 'table_name') }}
`,
        staging: `{{
  config(
    materialized='view'${schema ? `,\n    schema='${schema}'` : ''}
  )
}}

WITH source AS (
    SELECT * FROM {{ source('source_name', 'table_name') }}
),

renamed AS (
    SELECT
        -- ids
        id,

        -- dimensions
        name,
        category,

        -- timestamps
        created_at,
        updated_at

    FROM source
)

SELECT * FROM renamed
`,
        intermediate: `{{
  config(
    materialized='view'${schema ? `,\n    schema='${schema}'` : ''}
  )
}}

WITH model_a AS (
    SELECT * FROM {{ ref('stg_model_a') }}
),

model_b AS (
    SELECT * FROM {{ ref('stg_model_b') }}
),

joined AS (
    SELECT
        a.id,
        a.name,
        b.metric_value
    FROM model_a a
    LEFT JOIN model_b b ON a.id = b.foreign_id
)

SELECT * FROM joined
`,
        mart: `{{
  config(
    materialized='table'${schema ? `,\n    schema='${schema}'` : ''}${tags ? `,\n    tags=${JSON.stringify(tags.split(',').map(t => t.trim()))}` : ''}
  )
}}

WITH final AS (
    SELECT
        -- primary key
        id,

        -- dimensions
        category,
        status,

        -- measures
        total_amount,
        item_count,

        -- timestamps
        created_at,
        updated_at

    FROM {{ ref('int_model_name') }}
)

SELECT * FROM final
`,
        incremental: `{{
  config(
    materialized='incremental',
    unique_key='id'${schema ? `,\n    schema='${schema}'` : ''}
  )
}}

SELECT
    id,
    status,
    amount,
    updated_at

FROM {{ source('source_name', 'table_name') }}

{% if is_incremental() %}
    WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }})
{% endif %}
`,
    };

    const content = templates[template] || templates.basic;

    try {
        const dirPath = path.join(ctx.ROOT_DIR, modelPath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const filePath = path.join(dirPath, `${safeName}.sql`);
        if (fs.existsSync(filePath)) {
            return res.status(409).json({ error: `Model file already exists: ${safeName}.sql` });
        }

        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ctx.ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate source YAML
rutas.post('/api/dbt/template/source', (req, res) => {
    const { sourceName, database, sourceSchema, tables, targetPath = 'models/staging' } = req.body;
    if (!sourceName || !tables || tables.length === 0) {
        return res.status(400).json({ error: 'Source name and at least one table are required' });
    }

    const sourceConfig = {
        version: 2,
        sources: [{
            name: sourceName,
            ...(database ? { database } : {}),
            ...(sourceSchema ? { schema: sourceSchema } : {}),
            tables: tables.map(t => ({
                name: t.name,
                ...(t.description ? { description: t.description } : {}),
                ...(t.columns && t.columns.length > 0 ? {
                    columns: t.columns.map(c => ({
                        name: c.name,
                        ...(c.description ? { description: c.description } : {}),
                        ...(c.tests && c.tests.length > 0 ? { tests: c.tests } : {}),
                    }))
                } : {}),
            })),
        }],
    };

    try {
        const dirPath = path.join(ctx.ROOT_DIR, targetPath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        const fileName = `_${sourceName}__sources.yml`;
        const filePath = path.join(dirPath, fileName);
        const content = yaml.dump(sourceConfig, { lineWidth: 120, quotingType: "'", forceQuotes: false });

        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ctx.ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate test template
rutas.post('/api/dbt/template/test', (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Test name is required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const content = `-- ${description || 'Custom data test'}
-- This query should return zero rows to pass

SELECT
    *
FROM {{ ref('model_name') }}
WHERE 1 = 0  -- Replace with your test condition
`;

    try {
        const dirPath = path.join(ctx.ROOT_DIR, 'tests');
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const filePath = path.join(dirPath, `${safeName}.sql`);
        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ctx.ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Generate macro template
rutas.post('/api/dbt/template/macro', (req, res) => {
    const { name, description, args = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'Macro name is required' });

    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
    const content = `{# ${description || safeName + ' macro'} #}

{% macro ${safeName}(${args}) %}

    -- Your macro logic here

{% endmacro %}
`;

    try {
        const dirPath = path.join(ctx.ROOT_DIR, 'macros');
        if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

        const filePath = path.join(dirPath, `${safeName}.sql`);
        fs.writeFileSync(filePath, content, 'utf8');
        const relativePath = path.relative(ctx.ROOT_DIR, filePath).replace(/\\/g, '/');
        res.json({ success: true, path: relativePath, content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Build command string
rutas.post('/api/dbt/command', (req, res) => {
    const { action = 'run', select, exclude, fullRefresh, vars, profilesDir, target } = req.body;
    const validActions = ['run', 'build', 'compile', 'test', 'seed', 'snapshot', 'debug', 'clean', 'deps', 'parse'];

    if (!validActions.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Valid: ${validActions.join(', ')}` });
    }

    let cmd = `dbt ${action}`;

    if (select) cmd += ` --select ${select}`;
    if (exclude) cmd += ` --exclude ${exclude}`;
    if (fullRefresh && ['run', 'build'].includes(action)) cmd += ' --full-refresh';
    if (vars) cmd += ` --vars '${typeof vars === 'string' ? vars : JSON.stringify(vars)}'`;
    if (profilesDir !== undefined) cmd += ` --profiles-dir ${profilesDir || '.'}`;
    else cmd += ' --profiles-dir .';
    if (target) cmd += ` --target ${target}`;

    res.json({ command: cmd });
});

// Execute a DBT command (5.12, fase 1): el corredor de dbt, sin shell ni tope de
// tiempo (Dec-26), con el entorno del proyecto (Dec-27) y su fila en el historial
// (Dec-34). Lo que manda la interfaz sigue siendo un texto: se analiza a una lista
// de argumentos y se rechaza si trae algo de shell.
rutas.post('/api/dbt/execute', async (req, res) => {
    const { command, condaEnv, condaPath } = req.body || {};
    if (!command) return res.status(400).json({ error: 'Command is required' });
    let orden;
    try { orden = dbtCorrer.analizarComando(command); } catch (e) { return res.status(400).json({ error: e.message }); }
    // Dec-29: escribir en producción, con otro target posible, pide escribir su nombre.
    const confirmar = dbtProyecto.confirmacionNecesaria(ctx.ROOT_DIR, dbtProyecto.conTarget(ctx.ROOT_DIR, orden.args));
    if (confirmar && req.body?.confirmarProduccion !== confirmar.target) {
        return res.status(409).json({ necesitaConfirmar: true, ...confirmar });
    }

    // El entorno: el del proyecto; si aún no lo guardó, el que manda la interfaz.
    let entorno = dbtCorrer.entornoDelProyecto(ctx.ROOT_DIR);
    if (!entorno) {
        if (condaEnv && condaEnv !== 'none') {
            if (!/^[\w.-]+$/.test(condaEnv)) return res.status(400).json({ error: 'Invalid condaEnv value. Only alphanumeric characters, hyphens, underscores, and dots are allowed.' });
            entorno = { tipo: 'conda', nombre: condaEnv, conda: condaPath || null };
        } else entorno = { tipo: 'sistema' };
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const enviar = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`); } catch { /* el cliente se fue */ } };
    // Cancelar: cuando el cliente cierra la respuesta (no `req.on('close')`, que
    // salta al leer el cuerpo del POST).
    const corte = new AbortController();
    res.on('close', () => { if (!res.writableEnded) corte.abort(); });

    const r = await dbtEjecutar.ejecutarDbt({
        base: baseCentral, dbManager, raiz: ctx.ROOT_DIR, args: orden.args, entorno,
        env: await dbtFuentes.variables(ctx.ROOT_DIR).catch(() => ({})),
        origen: 'interfaz', senal: corte.signal,
        alLinea: ({ tipo, texto }) => enviar({ type: tipo, text: texto }),
    });
    enviar({ type: 'resumen', resumen: r.resumen });
    enviar({ type: 'exit', code: r.cancelado ? 130 : r.codigo });
    try { res.end(); } catch { /* ya cerrado */ }
});

// El entorno, el target y producción del proyecto dbt (Dec-27, Dec-29).
rutas.get('/api/dbt/proyecto', (_req, res) => {
    const cfg = scaffolder.getProjectConfig(ctx.ROOT_DIR) || {};
    res.json({ dbt: cfg.dbt || {}, entornoPropio: dbtEntorno.estado() });
});

rutas.put('/api/dbt/proyecto', (req, res) => {
    const cfg = scaffolder.getProjectConfig(ctx.ROOT_DIR) || {};
    const b = req.body || {};
    const dbt = { ...(cfg.dbt || {}) };
    if (b.entorno !== undefined) {
        const e = b.entorno;
        if (e && !['amoxsql', 'conda', 'python', 'sistema'].includes(e.tipo)) return res.status(400).json({ error: 'Unknown environment type.' });
        if (e?.tipo === 'conda' && e.nombre && !/^[\w.-]+$/.test(e.nombre)) return res.status(400).json({ error: 'Invalid conda environment name.' });
        dbt.entorno = e ? { tipo: e.tipo, ...(e.nombre ? { nombre: e.nombre } : {}), ...(e.ruta ? { ruta: e.ruta } : {}), ...(e.conda ? { conda: e.conda } : {}) } : undefined;
    }
    if (b.target !== undefined) dbt.target = b.target || undefined;
    if (b.produccion !== undefined) dbt.produccion = Array.isArray(b.produccion) ? b.produccion.filter(x => typeof x === 'string' && x) : [];
    const guardado = scaffolder.saveProjectConfig(ctx.ROOT_DIR, { dbt });
    res.json({ dbt: guardado.dbt });
});

// «Set up dbt…» (Dec-36): el entorno de AmoxSQL, con el mismo motor.
rutas.get('/api/dbt/entorno-propio', async (_req, res) => {
    try { res.json({ ...dbtEntorno.estado(), pythons: await dbtEntorno.buscarPythons() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

rutas.post('/api/dbt/entorno-propio', async (req, res) => {
    const python = req.body?.python;
    if (!python) return res.status(400).json({ error: 'Choose a Python.' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    const enviar = (o) => { try { res.write(`data: ${JSON.stringify(o)}\n\n`); } catch { /* el cliente se fue */ } };
    const corte = new AbortController();
    res.on('close', () => { if (!res.writableEnded) corte.abort(); });
    try {
        const r = await dbtEntorno.crear({ python, senal: corte.signal, alProgreso: (p) => enviar({ type: 'progreso', ...p }) });
        enviar({ type: 'listo', entorno: r });
    } catch (e) {
        enviar({ type: 'error', text: e.message });
    }
    try { res.end(); } catch { /* ya cerrado */ }
});

/** ¿Tiene dbt ahora la base del proyecto? Para el aviso de la interfaz. */
rutas.get('/api/dbt/base', (_req, res) => {
    const p = dbManager.prestada;
    res.json(p ? { prestada: true, quien: p.quien, desde: p.desde, archivo: path.basename(p.ruta) } : { prestada: false });
});

module.exports = rutas;
