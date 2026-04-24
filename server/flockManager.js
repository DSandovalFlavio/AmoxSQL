/**
 * FlockManager — thin helpers for Flock DuckDB extension operations.
 * All queries run via DatabaseManager.systemQuery so they execute in the
 * same session as the user's DuckDB connection.
 *
 * Flock docs: https://dais-polymtl.github.io/flock/docs/what-is-flock
 */

'use strict';

const FLOCK_FUNCTIONS = [
    { name: 'llm_complete',   sig: "llm_complete({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})",   ret: 'JSON',      cat: 'Scalar',    doc: 'Text completion per row. Returns JSON.' },
    { name: 'llm_filter',     sig: "llm_filter({'model_name': 'name'}, {'prompt': 'Is this...?', 'context_columns': [{'data': col}]})", ret: 'BOOLEAN',   cat: 'Scalar',    doc: 'Semantic boolean predicate. Perfect in WHERE clauses.' },
    { name: 'llm_embedding',  sig: "llm_embedding({'model_name': 'name'}, {'context_columns': [{'data': col}]})",                    ret: 'FLOAT[]',   cat: 'Scalar',    doc: 'Returns a semantic embedding vector as FLOAT[].' },
    { name: 'llm_reduce',     sig: "llm_reduce({'model_name': 'name'}, {'prompt': 'Summarize...', 'context_columns': [{'data': col}]})", ret: 'JSON',   cat: 'Aggregate', doc: 'Collapses a GROUP BY into one LLM-generated summary.' },
    { name: 'llm_rerank',     sig: "llm_rerank({'model_name': 'name'}, {'prompt': 'Rank by...', 'context_columns': [{'data': col}]})",   ret: 'JSON[]',  cat: 'Aggregate', doc: 'Reranks rows in a group by relevance.' },
    { name: 'llm_first',      sig: "llm_first({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})",        ret: 'JSON',      cat: 'Aggregate', doc: 'Returns the top-ranked row after llm_rerank.' },
    { name: 'llm_last',       sig: "llm_last({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})",         ret: 'JSON',      cat: 'Aggregate', doc: 'Returns the bottom-ranked row after llm_rerank.' },
    { name: 'fusion_rrf',     sig: 'fusion_rrf(rank1, rank2, ...)',      ret: 'DOUBLE',    cat: 'Fusion',    doc: 'Reciprocal Rank Fusion — combines rankings from multiple retrievers.' },
    { name: 'fusion_combsum', sig: 'fusion_combsum(score1, score2, ...)', ret: 'DOUBLE',   cat: 'Fusion',    doc: 'Sum of normalized scores.' },
    { name: 'fusion_combmnz', sig: 'fusion_combmnz(score1, score2, ...)', ret: 'DOUBLE',   cat: 'Fusion',    doc: 'Sum × count of non-zero hits. Boosts docs matched by multiple retrievers.' },
    { name: 'fusion_combmed', sig: 'fusion_combmed(score1, score2, ...)', ret: 'DOUBLE',   cat: 'Fusion',    doc: 'Median of normalized scores. Robust to outlier scorers.' },
    { name: 'fusion_combanz', sig: 'fusion_combanz(score1, score2, ...)', ret: 'DOUBLE',   cat: 'Fusion',    doc: 'Average of non-zero normalized scores.' },
];

// Regex to detect Flock function calls in SQL queries
const FLOCK_CALL_RE = /\bllm_(?:complete|filter|embedding|reduce|rerank|first|last)\s*\(/i;
const CLOUD_PROVIDERS = ['openai', 'anthropic', 'azure'];

/**
 * Check whether the flock extension is currently loaded in this DuckDB session.
 */
async function getFlockStatus(dbManager) {
    try {
        const rows = await dbManager.systemQuery(
            "SELECT installed, loaded FROM duckdb_extensions() WHERE extension_name = 'flock'"
        );
        const ext = rows[0] || { installed: false, loaded: false };
        if (!ext.loaded) return { loaded: false, installed: ext.installed };

        // Detect which models are registered
        let models = [];
        try {
            models = await dbManager.systemQuery('GET MODELS') || [];
        } catch (_) { /* flock loaded but no models yet */ }

        return { loaded: true, installed: true, modelCount: models.length };
    } catch {
        return { loaded: false, installed: false };
    }
}

/**
 * Validate DuckDB version is >= required (semver-ish: major.minor.patch).
 */
async function checkDuckDBVersion(dbManager, required = '1.1.1') {
    try {
        const rows = await dbManager.systemQuery("SELECT current_setting('duckdb_version') AS v");
        const version = (rows[0]?.v || '').replace(/^v/, '');
        const [rmaj, rmin, rpatch] = required.split('.').map(Number);
        const [maj, min, patch] = version.split('.').map(Number);
        const ok = maj > rmaj || (maj === rmaj && min > rmin) || (maj === rmaj && min === rmin && patch >= rpatch);
        return { ok, version, required };
    } catch {
        return { ok: null, version: null, required }; // can't determine
    }
}

// ─── Models ───

async function getModels(dbManager) {
    const rows = await dbManager.systemQuery('GET MODELS');
    return Array.isArray(rows) ? rows : [];
}

async function createModel(dbManager, { name, modelId, provider, tupleFormat = 'json', batchSize = 16, temperature = 0.2, secretName }) {
    const params = { tuple_format: tupleFormat, batch_size: batchSize, model_parameters: { temperature } };
    if (secretName) params.secret_name = secretName;
    const paramsJson = JSON.stringify(params).replace(/'/g, "''");
    await dbManager.systemQuery(
        `CREATE MODEL('${name}', '${modelId}', '${provider}', '${paramsJson}'::JSON)`
    );
}

async function updateModel(dbManager, { name, modelId, provider, tupleFormat = 'json', batchSize = 16, temperature = 0.2, secretName }) {
    const params = { tuple_format: tupleFormat, batch_size: batchSize, model_parameters: { temperature } };
    if (secretName) params.secret_name = secretName;
    const paramsJson = JSON.stringify(params).replace(/'/g, "''");
    await dbManager.systemQuery(
        `UPDATE MODEL('${name}', '${modelId}', '${provider}', '${paramsJson}'::JSON)`
    );
}

async function deleteModel(dbManager, name) {
    await dbManager.systemQuery(`DELETE MODEL '${name}'`);
}

async function testModel(dbManager, modelName) {
    const rows = await dbManager.systemQuery(
        `SELECT llm_complete({'model_name': '${modelName}'}, {'prompt': 'Reply with exactly: OK'}) AS result`
    );
    return rows[0]?.result ?? null;
}

// ─── Prompts ───

async function getPrompts(dbManager) {
    const rows = await dbManager.systemQuery('GET PROMPTS');
    return Array.isArray(rows) ? rows : [];
}

async function createPrompt(dbManager, { name, text, global = false }) {
    const safeText = text.replace(/'/g, "''");
    const globalKw = global ? 'GLOBAL ' : '';
    await dbManager.systemQuery(`CREATE ${globalKw}PROMPT('${name}', '${safeText}')`);
}

async function updatePrompt(dbManager, { name, text }) {
    const safeText = text.replace(/'/g, "''");
    await dbManager.systemQuery(`UPDATE PROMPT('${name}', '${safeText}')`);
}

async function deletePrompt(dbManager, name) {
    await dbManager.systemQuery(`DELETE PROMPT '${name}'`);
}

// ─── Secrets ───

async function getSecrets(dbManager) {
    try {
        const rows = await dbManager.systemQuery('FROM duckdb_secrets()');
        // Mask secret values
        return (rows || []).map(s => ({ ...s, secret: '***', value: undefined }));
    } catch {
        return [];
    }
}

async function createOllamaSecret(dbManager, { apiUrl = '127.0.0.1:11434', name = 'amoxsql_ollama', persistent = true }) {
    const type = persistent ? 'PERSISTENT SECRET' : 'SECRET';
    const namePart = name ? ` ${name}` : '';
    await dbManager.systemQuery(`CREATE ${type}${namePart} (TYPE OLLAMA, API_URL '${apiUrl}')`);
}

async function createOpenAISecret(dbManager, { apiKey, name = 'amoxsql_openai', persistent = true }) {
    const type = persistent ? 'PERSISTENT SECRET' : 'SECRET';
    const namePart = name ? ` ${name}` : '';
    await dbManager.systemQuery(`CREATE ${type}${namePart} (TYPE OPENAI, API_KEY '${apiKey}')`);
}

async function createAnthropicSecret(dbManager, { apiKey, name = 'amoxsql_anthropic', persistent = true }) {
    const type = persistent ? 'PERSISTENT SECRET' : 'SECRET';
    const namePart = name ? ` ${name}` : '';
    await dbManager.systemQuery(`CREATE ${type}${namePart} (TYPE ANTHROPIC, API_KEY '${apiKey}')`);
}

/**
 * Auto-bootstrap Flock from existing AmoxSQL Ollama config.
 * Steps: create secret → create models for each selected Ollama model.
 */
async function bootstrapFromOllamaConfig(dbManager, { ollamaUrl, models = [] }) {
    const results = { secret: null, models: [], errors: [] };

    // Step 1 — Secret
    try {
        await createOllamaSecret(dbManager, { apiUrl: ollamaUrl });
        results.secret = 'ok';
    } catch (err) {
        if (/already exists/i.test(err.message)) {
            results.secret = 'exists';
        } else {
            results.errors.push(`Secret: ${err.message}`);
            results.secret = 'error';
        }
    }

    // Step 2 — Models
    for (const m of models) {
        try {
            await createModel(dbManager, {
                name: m.alias,
                modelId: m.id,
                provider: 'ollama',
                tupleFormat: 'json',
                batchSize: 16,
                temperature: 0.2,
            });
            results.models.push({ alias: m.alias, status: 'ok' });
        } catch (err) {
            if (/already exists/i.test(err.message)) {
                results.models.push({ alias: m.alias, status: 'exists' });
            } else {
                results.models.push({ alias: m.alias, status: 'error', error: err.message });
                results.errors.push(`Model ${m.alias}: ${err.message}`);
            }
        }
    }

    return results;
}

/**
 * Detect whether a SQL query uses Flock functions and, if so,
 * whether it touches cloud providers (via secrets introspection).
 * Used for pre-execution guardrails.
 */
function analyzeQueryForFlock(sql) {
    if (!FLOCK_CALL_RE.test(sql)) return null;
    return { hasFlock: true };
}

/**
 * Get the Flock function catalog for Monaco autocomplete / Reference panel.
 */
function getFlockFunctions() {
    return FLOCK_FUNCTIONS;
}

module.exports = {
    getFlockStatus,
    checkDuckDBVersion,
    getModels,
    createModel,
    updateModel,
    deleteModel,
    testModel,
    getPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    getSecrets,
    createOllamaSecret,
    createOpenAISecret,
    createAnthropicSecret,
    bootstrapFromOllamaConfig,
    analyzeQueryForFlock,
    getFlockFunctions,
    CLOUD_PROVIDERS,
    FLOCK_CALL_RE,
};
