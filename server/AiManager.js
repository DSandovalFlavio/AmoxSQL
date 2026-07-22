/**
 * AmoxSQL AI — AI Manager
 * 
 * Manages LLM providers (Ollama local, Gemini cloud) and provides
 * both the legacy generateQuery() method and the new tool-loop chat().
 * 
 * Uses Vercel AI SDK for the new agent chat functionality.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { generateText, streamText, stepCountIs } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { createOpenAI } = require('@ai-sdk/openai');
const { createOllama } = require('ai-sdk-ollama');
const ollama = createOllama();

// ── Ollama model instance cache (F1 del plan de performance local) ──
// One instance per (model, runtime-options) combination. Reusing the instance
// guarantees every request carries IDENTICAL options — critical because a
// num_ctx change between requests forces Ollama to unload+reload the model.
const _ollamaModelCache = new Map();
const { createTools } = require('./ai/tools');
const { buildSystemPrompt } = require('./ai/systemPrompt');
const { loadUserRules } = require('./ai/userRules');
const { compactContext } = require('./ai/compaction');
const { loadMemoriesText, extractMemories, memoryExtractionAllowed } = require('./ai/memory');
const { getSkill } = require('./ai/skills');
const { getModelProfile, setUserTierOverrides, fetchOllamaModelInfo, getOllamaRuntime, setOllamaRuntimeConfig } = require('./ai/modelProfiles');
const { buildVirtualMapping, extractSqlBlocks, interceptTableNames, formatResultForContext } = require('./ai/promptOnlyMode');
const { applyRowLimit } = require('./_sqlUtils');
const { agenticLoop } = require('./ai/agenticLoop');
const { logOllamaPerf } = require('./ai/perfLog');

class AiManager {
    constructor() {
        this.status = "READY";
        this.provider = "ollama";
        this.modelName = "gemma4:e2b";

        // Ensure config exists in home directory for secure storage
        this.configPath = path.join(os.homedir(), '.amoxsql', 'config.json');
        this.ensureConfig();
    }

    // ─── Config Methods (unchanged) ───

    ensureConfig() {
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.configPath)) {
            const initialConfig = {
                geminiApiKey: "",
                anthropicApiKey: "",
                minimaxApiKey: "",
                gcpProject: "",
                gcpLocation: "us-central1",
                provider: "ollama",
                defaultModel: "gemma4:e2b",
                usageDate: new Date().toISOString().split('T')[0],
                usage: { flashLite: 0, flash: 0, pro: 0, tokens: 0 },
                experimental: { planner: true },
                modelTierOverrides: {},
                // Ollama local runtime (F1): keep_alive largo para evitar cold
                // starts; numCtx 0 = auto por tier (8k low / 16k medium+).
                ollamaKeepAlive: '4h',
                ollamaNumCtx: 0,
                // Extracción de memorias en background (F4): 'cloud-only' evita el
                // LLM extra por turno en modelos locales (compite por el slot y
                // rompe el KV cache). Opciones: 'cloud-only' | 'always' | 'off'.
                memoryExtraction: 'cloud-only',
                // Overrides de thinking por modelo (F5): { '<model>': 'on'|'off'|'auto' }
                ollamaThinkOverrides: {},
                // Modelo por modo (F6): { assistant, diving } — vacío = usa defaultModel.
                modelPerMode: {},
                geminiModels: [
                    { id: 'gemini-2.5-flash-lite', category: 'flash-lite', dailyLimit: 1000, contextWindow: 100000, costPerMInput: 0.10 },
                    { id: 'gemini-2.5-flash', category: 'flash', dailyLimit: 250, contextWindow: 500000, costPerMInput: 0.30 },
                    { id: 'gemini-2.5-pro', category: 'pro', dailyLimit: 0, contextWindow: 1000000, costPerMInput: 1.25 },
                ],
            };
            fs.writeFileSync(this.configPath, JSON.stringify(initialConfig, null, 2));
        }
    }

    getConfig() {
        this.ensureConfig();
        const data = fs.readFileSync(this.configPath, 'utf8');
        try {
            let config = JSON.parse(data);

            // Check usage date for daily reset
            const today = new Date().toISOString().split('T')[0];
            if (config.usageDate !== today) {
                config.usageDate = today;
                config.usage = { flashLite: 0, flash: 0, pro: 0, tokens: 0 };
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }
            if (!config.usage) {
                config.usageDate = today;
                config.usage = { flashLite: 0, flash: 0, pro: 0, tokens: 0 };
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }

            // Migrate: ensure GCP Vertex AI fields exist for ADC support
            let needsWrite = false;
            if (config.gcpProject === undefined) { config.gcpProject = ''; needsWrite = true; }
            if (config.gcpLocation === undefined) { config.gcpLocation = 'us-central1'; needsWrite = true; }
            if (needsWrite) fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

            // Migrate: ensure experimental flags exist for older config files
            if (!config.experimental) {
                config.experimental = { planner: true };
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }

            // Migrate: ensure modelTierOverrides exists
            if (!config.modelTierOverrides) {
                config.modelTierOverrides = {};
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }

            // Migrate: ensure geminiModels exists
            if (!config.geminiModels) {
                config.geminiModels = [
                    { id: 'gemini-2.5-flash-lite', category: 'flash-lite', dailyLimit: 1000, contextWindow: 100000, costPerMInput: 0.10 },
                    { id: 'gemini-2.5-flash', category: 'flash', dailyLimit: 250, contextWindow: 500000, costPerMInput: 0.30 },
                    { id: 'gemini-2.5-pro', category: 'pro', dailyLimit: 0, contextWindow: 1000000, costPerMInput: 1.25 },
                ];
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }

            // Migrate: ensure Ollama runtime fields exist
            if (config.ollamaKeepAlive === undefined) { config.ollamaKeepAlive = '4h'; needsWrite = true; }
            if (config.ollamaNumCtx === undefined) { config.ollamaNumCtx = 0; needsWrite = true; }
            if (config.memoryExtraction === undefined) { config.memoryExtraction = 'cloud-only'; needsWrite = true; }
            if (config.ollamaThinkOverrides === undefined) { config.ollamaThinkOverrides = {}; needsWrite = true; }
            if (config.modelPerMode === undefined) { config.modelPerMode = {}; needsWrite = true; }
            if (needsWrite) fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

            // Sync tier overrides with modelProfiles module
            setUserTierOverrides(config.modelTierOverrides || {});

            // Sync Ollama runtime config (keep_alive / num_ctx / think overrides)
            setOllamaRuntimeConfig({
                keepAlive: config.ollamaKeepAlive,
                numCtx: config.ollamaNumCtx,
                thinkOverrides: config.ollamaThinkOverrides || {},
            });

            return config;
        } catch (e) {
            return {
                geminiApiKey: "", anthropicApiKey: "", minimaxApiKey: "", provider: "ollama", defaultModel: "gemma4:e2b",
                usageDate: new Date().toISOString().split('T')[0],
                usage: { flashLite: 0, flash: 0, pro: 0, tokens: 0 },
                experimental: { planner: true },
                modelTierOverrides: {},
                geminiModels: [],
            };
        }
    }

    saveConfig(config) {
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    }

    getStatus() {
        return { status: "READY", progress: 100 };
    }

    async initialize() {
        const config = this.getConfig();
        this.provider = config.provider || "ollama";
        this.modelName = config.defaultModel || "gemma4:e2b";
        this.status = "READY";

        // Sync user tier overrides on initialization
        setUserTierOverrides(config.modelTierOverrides || {});
        console.log(`[AI] Initialized with Provider: ${this.provider}, Model: ${this.modelName}`);
    }

    // ─── Vercel AI SDK Provider Resolution ───

    /**
     * Returns a Vercel AI SDK model instance based on provider and model name.
     * @param {string} providerName - 'ollama' or 'gemini'
     * @param {string} modelName - The model identifier
     * @returns {object} Vercel AI SDK model instance
     */
    getModel(providerName, modelName) {
        const config = this.getConfig();

        if (providerName === 'gemini') {
            const apiKey = config.geminiApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

            if (apiKey) {
                // API Key mode — uses Gemini Developer API (generativelanguage.googleapis.com)
                const google = createGoogleGenerativeAI({ apiKey });
                return google(modelName || 'gemini-2.5-flash');
            }

            // ADC mode — uses Vertex AI (aiplatform.googleapis.com) with Application Default Credentials.
            // Requires gcpProject and gcpLocation to be configured.
            // Run: gcloud auth application-default login  before starting the app.
            const project  = config.gcpProject  || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
            const location = config.gcpLocation || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

            if (!project) {
                throw new Error(
                    'ADC mode requires a GCP Project ID. ' +
                    'Go to Settings → AI Assistant and fill in the "GCP Project ID" field, ' +
                    'or set the GOOGLE_CLOUD_PROJECT environment variable.'
                );
            }

            // Lazy-require: @ai-sdk/google-vertex is an optional dep — only needed
            // for this code path. A missing install produces a clear error message
            // rather than crashing the entire server on startup.
            let createVertex;
            try {
                ({ createVertex } = require('@ai-sdk/google-vertex'));
            } catch {
                throw new Error(
                    'El proveedor Vertex AI requiere el paquete @ai-sdk/google-vertex. ' +
                    'Ejecuta `npm install @ai-sdk/google-vertex` y reinicia la aplicación.'
                );
            }
            const vertex = createVertex({ project, location });
            // Vertex AI model IDs use the same names as Gemini Developer API
            return vertex(modelName || 'gemini-2.5-flash');
        } else if (providerName === 'anthropic') {
            if (!config.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
                throw new Error("Anthropic API Key is not configured. Please add it in Settings > AI Assistant.");
            }
            const anthropic = createAnthropic({
                apiKey: config.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
            });
            return anthropic(modelName || 'claude-3-7-sonnet-latest');
        } else if (providerName === 'minimax') {
            if (!config.minimaxApiKey && !process.env.MINIMAX_API_KEY) {
                throw new Error("MiniMax API Key is not configured. Please add it in Settings > AI Assistant.");
            }
            const minimax = createOpenAI({
                apiKey: config.minimaxApiKey || process.env.MINIMAX_API_KEY,
                baseURL: 'https://api.minimax.io/v1',
                compatibility: 'compatible',
                // MiniMax M-series advanced reasoning, ALWAYS ON. On the
                // OpenAI-compatible endpoint thinking.type ∈ {adaptive, disabled}
                // ("enabled" only exists on their Anthropic endpoint); "adaptive"
                // explicitly keeps thinking on. reasoning_split is left unset so the
                // reasoning streams inside content as <think>…</think>, which the chat
                // rendering already parses (transcript strips it; inspector shows it).
                fetch: async (url, options) => {
                    if (options?.body) {
                        try {
                            const body = JSON.parse(options.body);
                            if (!body.thinking) body.thinking = { type: 'adaptive' };
                            options = { ...options, body: JSON.stringify(body) };
                        } catch { /* non-JSON body — send unchanged */ }
                    }
                    return fetch(url, options);
                },
            });
            return minimax.chat(modelName || 'MiniMax-M2.7');
        } else {
            // Ollama — local model with explicit runtime options (F1):
            //   keep_alive  → model stays resident (default '4h', configurable)
            //   num_ctx     → real context size, identical on EVERY request
            //   sampling    → per-family recommended params
            //   think:false → disable invisible CoT for qwen3.5/qwen3/ornith
            return this.getOllamaModel(modelName || 'qwen3:1.7b');
        }
    }

    /**
     * Builds (and caches) an ai-sdk-ollama model instance with the full local
     * runtime. The cache key includes the resolved options so a config change
     * (e.g. num_ctx in Settings) naturally produces a fresh instance.
     * @param {string} modelName
     * @returns {object} Vercel AI SDK model instance
     */
    getOllamaModel(modelName) {
        const rt = getOllamaRuntime(modelName);
        const key = `${modelName}|ctx:${rt.numCtx}|ka:${rt.keepAlive}|think:${rt.think}|${JSON.stringify(rt.sampling)}`;

        let instance = _ollamaModelCache.get(key);
        if (!instance) {
            instance = ollama(modelName, {
                keep_alive: rt.keepAlive,
                // Native think param only when defined (qwen3.5/qwen3/ornith).
                ...(typeof rt.think === 'boolean' ? { think: rt.think } : {}),
                options: {
                    num_ctx: rt.numCtx,
                    ...rt.sampling,
                },
            });
            _ollamaModelCache.set(key, instance);
            console.log(`[AI] Ollama model configured: ${modelName} | num_ctx=${rt.numCtx} | keep_alive=${rt.keepAlive}${rt.think === false ? ' | think=off' : ''}`);
        }
        return instance;
    }

    /**
     * Track usage for Gemini models.
     * @param {string} modelName 
     * @param {object} usage - Token usage from Vercel AI SDK response
     */
    trackUsage(modelName, usage) {
        try {
            const config = this.getConfig();
            if (usage) {
                config.usage.tokens += (usage.totalTokens || 0);
            }
            if (modelName.includes('flash-lite')) {
                config.usage.flashLite += 1;
            } else if (modelName.includes('pro')) {
                config.usage.pro += 1;
            } else {
                config.usage.flash += 1;
            }
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error("[AI] Failed to track usage:", e);
        }
    }

    // ─── New: Tool Loop Chat (Vercel AI SDK) ───

    /**
     * Runs a full agent chat with tool loop.
     * 
     * @param {object} options
     * @param {Array} options.messages - Conversation messages [{role, content}]
     * @param {object} options.dbManager - DatabaseManager instance for DuckDB queries
     * @param {string} options.providerOverride - 'ollama' or 'gemini'
     * @param {string} options.modelOverride - Model name override
     * @param {string} options.mode - 'assistant' or 'diving'
     * @param {Array} options.tables - Table schemas for context
     * @param {Array} options.files - File schemas for context
     * @param {string} options.currentQuery - Current editor query (assistant mode)
     * @param {object} options.currentResult - Current result (assistant mode)
     * @param {object} options.currentChartConfig - Current chart config (assistant mode)
     * @returns {object} Complete response with text, tool calls, and usage
     */
    async chat(options) {
        const {
            messages,
            dbManager,
            providerOverride,
            modelOverride,
            mode = 'diving',
            tables = [],
            files = [],
            currentQuery = '',
            currentResult = null,
            currentChartConfig = null,
            referencedArtifacts = [],
            activeSkillId = null,
            filePath = null,
            fileType = null,
            tableRoster = null,
            conversationId = null,
        } = options;

        const provider = providerOverride || this.provider;
        const model = modelOverride || this.modelName;
        const projectPath = process.cwd();

        // Load dynamic human context
        const userRules = await loadUserRules(projectPath);
        const memories = await loadMemoriesText(dbManager);
        const activeSkill = activeSkillId ? await getSkill(projectPath, activeSkillId) : null;

        // Get model profile for adaptive parameters
        const profile = getModelProfile(model, provider);

        // gemma4 thinking token (F5) — empty unless the model uses the gemma
        // mechanism AND thinking is turned on for it.
        const thinkTokenPrefix = provider === 'ollama' ? getOllamaRuntime(model).gemmaTokenPrefix : '';

        // Build dynamic system prompt (tier-adaptive)
        const systemPrompt = buildSystemPrompt({
            tables, files, mode,
            userRules, memories,
            currentQuery, currentResult, currentChartConfig,
            referencedArtifacts,
            activeSkill, modelProfile: profile,
            filePath, fileType, tableRoster, thinkTokenPrefix,
        });

        // Create tool context (mode-aware for tool filtering)
        const queryResults = new Map();
        const aiPersistenceMod = require('./ai/persistence');
        const tools = createTools({ dbManager, queryResults, projectPath, mode, conversationId, aiPersistence: aiPersistenceMod });

        console.log(`[AI Chat] Starting tool loop | Provider: ${provider} | Model: ${model} | Mode: ${mode} | Tier: ${profile.tier}`);

        try {
            const llmModel = this.getModel(provider, model);
            
            // Compact context if necessary to avoid token overflow
            const compactedMessages = await compactContext(llmModel, messages, null, model);

            const result = await generateText({
                model: llmModel,
                system: systemPrompt,
                messages: compactedMessages,
                tools: profile.supportsToolCalling ? tools : undefined,
                stopWhen: stepCountIs(profile.maxSteps),
                maxOutputTokens: profile.maxTokens,
            });

            // Perf instrumentation (F0)
            logOllamaPerf('chat', { model, usage: result.usage, providerMetadata: result.providerMetadata });

            // Run memory extraction in the background (skip for low-tier models,
            // and — per policy — for local models to keep the Ollama slot free).
            if (profile.supportsMemory && memoryExtractionAllowed(provider, this.getConfig().memoryExtraction)) {
                extractMemories(llmModel, messages, dbManager).catch(e => console.error('[AI Memory Background]', e));
            }

            // Track Gemini usage
            if (provider === 'gemini' && result.usage) {
                this.trackUsage(model, result.usage);
            }

            console.log(`[AI Chat] Complete | Steps: ${result.steps?.length || 1} | Tokens: ${result.usage?.totalTokens || '?'} | Tier: ${profile.tier}`);

            // Collect all tool results from steps
            const toolResults = [];
            if (result.steps) {
                for (const step of result.steps) {
                    if (step.toolCalls) {
                        for (const tc of step.toolCalls) {
                            toolResults.push({
                                toolName: tc.toolName,
                                args: tc.input ?? tc.args,
                                // AI SDK v6 uses `output` instead of `result`
                                result: (() => {
                                    const tr = step.toolResults?.find(tr => tr.toolCallId === tc.toolCallId);
                                    return tr?.output ?? tr?.result;
                                })(),
                            });
                        }
                    }
                }
            }

            return {
                text: result.text,
                toolResults,
                queryResults: Object.fromEntries(queryResults),
                usage: result.usage,
                steps: result.steps?.length || 1,
            };
        } catch (err) {
            console.error(`[AI Chat] Error:`, err);

            // Provide helpful error messages
            if (err.message && err.message.includes('fetch failed')) {
                throw new Error(`Could not connect to ${provider === 'ollama' ? 'Ollama. Please ensure the Ollama app is running.' : 'Gemini API. Check your internet connection and API key.'}`);
            }
            if (err.message && err.message.includes('not found')) {
                throw new Error(`Model '${model}' not found. ${provider === 'ollama' ? `Ensure you pulled it using: ollama pull ${model}` : 'Check the model name.'}`);
            }
            throw err;
        }
    }

    /**
     * Runs a streaming agent chat with tool loop.
     * Returns a ReadableStream for SSE consumption.
     * 
     * @param {object} options - Same as chat()
     * @returns {object} Vercel AI SDK streaming result
     */
    async streamChat(options) {
        const {
            messages,
            dbManager,
            providerOverride,
            modelOverride,
            mode = 'diving',
            tables = [],
            files = [],
            currentQuery = '',
            currentResult = null,
            currentChartConfig = null,
            referencedArtifacts = [],
            activeSkillId = null,
            filePath = null,
            fileType = null,
            tableRoster = null,
            conversationId = null,
        } = options;

        const provider = providerOverride || this.provider;
        const model = modelOverride || this.modelName;
        const projectPath = process.cwd();

        // Load dynamic human context
        const userRules = await loadUserRules(projectPath);
        const memories = await loadMemoriesText(dbManager);
        const activeSkill = activeSkillId ? await getSkill(projectPath, activeSkillId) : null;

        // Get model profile for adaptive parameters
        const profile = getModelProfile(model, provider);

        // gemma4 thinking token (F5) — empty unless the model uses the gemma
        // mechanism AND thinking is turned on for it.
        const thinkTokenPrefix = provider === 'ollama' ? getOllamaRuntime(model).gemmaTokenPrefix : '';

        const systemPrompt = buildSystemPrompt({
            tables, files, mode,
            userRules, memories,
            currentQuery, currentResult, currentChartConfig,
            referencedArtifacts,
            activeSkill, modelProfile: profile,
            filePath, fileType, tableRoster, thinkTokenPrefix,
        });

        const queryResults = new Map();
        const aiPersistence = require('./ai/persistence');
        const tools = createTools({ dbManager, queryResults, projectPath, mode, conversationId, aiPersistence });

        console.log(`[AI Stream] Starting | Provider: ${provider} | Model: ${model} | Mode: ${mode} | Tier: ${profile.tier}`);

        const llmModel = this.getModel(provider, model);

        // Compact context if necessary to avoid token overflow
        const compactedMessages = await compactContext(llmModel, messages, null, model);

        const result = streamText({
            model: llmModel,
            system: systemPrompt,
            messages: compactedMessages,
            tools: profile.supportsToolCalling ? tools : undefined,
            stopWhen: stepCountIs(profile.maxSteps),
            maxOutputTokens: profile.maxTokens,
            onFinish: async (event) => {
                const { usage } = event;
                // Perf instrumentation (F0): readable per-request line for Ollama
                logOllamaPerf('stream', { model, usage, providerMetadata: event.providerMetadata });
                // Run memory extraction in the background (skip for low-tier models,
                // and — per policy — for local models to keep the Ollama slot free).
                if (profile.supportsMemory && memoryExtractionAllowed(provider, this.getConfig().memoryExtraction)) {
                    extractMemories(llmModel, messages, dbManager).catch(e => console.error('[AI Memory Background]', e));
                }
                if (provider === 'gemini' && usage) {
                    this.trackUsage(model, usage);
                }
                console.log(`[AI Stream] Complete | Tokens: ${usage?.totalTokens || '?'} | Tier: ${profile.tier}`);
            },
        });

        // Attach queryResults for downstream use
        result._queryResults = queryResults;

        return result;
    }

    // ─── Agentic Loop Stream (experimental.planner=true, diving mode) ───

    /**
     * Returns an async generator that runs the Planner-Executor loop.
     * Each yielded value is an SSE-compatible event object.
     *
     * @param {object} options - Same shape as streamChat options
     * @returns {AsyncGenerator}
     */
    streamChatAgentic(options) {
        return agenticLoop(options, this.getModel.bind(this));
    }

    // ─── Prompt-Only Stream Chat (Low-Tier Models) ───

    /**
     * Handles chat for low-tier models that don't support tool calling.
     * Uses a 2-pass approach:
     *   Pass 1: LLM generates SQL referencing virtual table names
     *   Pass 2: Server extracts SQL, corrects table names, executes, 
     *           and optionally asks LLM to summarize results
     * 
     * Returns an async generator that yields SSE-compatible events.
     * 
     * @param {object} options - Same as streamChat()
     * @returns {AsyncGenerator} Yields SSE event objects
     */
    async *promptOnlyStreamChat(options) {
        const {
            messages,
            dbManager,
            providerOverride,
            modelOverride,
            mode = 'diving',
            tables = [],
            files = [],
            currentQuery = '',
        } = options;

        const provider = providerOverride || this.provider;
        const model = modelOverride || this.modelName;
        const profile = getModelProfile(model, provider);

        console.log(`[AI PromptOnly] Starting | Provider: ${provider} | Model: ${model} | Tier: ${profile.tier}`);

        // Build virtual table mapping
        const { virtualMap, schemaText } = buildVirtualMapping(files, tables);

        // Build compact system prompt with virtual schema
        const systemPrompt = `You are a DuckDB SQL expert. Generate valid DuckDB SQL to answer user questions.

Rules:
- Write your SQL inside a \`\`\`sql code block
- CRITICAL: Use ONLY the exact table names provided in the schema below. NEVER invent table names (e.g. do not use 'web_sales' unless it is listed below).
- Use double quotes for identifiers with spaces: "column name"
- Use single quotes for string literals: 'value'
- Time functions: YEAR(col), MONTH(col), DATE_TRUNC('month', col)
- If unsure about column names, use SELECT * FROM table_name LIMIT 5 first

${schemaText}`;

        const llmModel = this.getModel(provider, model);

        // Compact messages for small context
        let currentMessages = await compactContext(llmModel, messages, null, model);

        let queryResults = [];
        let finalAssistantText = '';
        const maxRetries = 1;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            // ── Pass 1: Generate text with SQL ──
            const pass1 = streamText({
                model: llmModel,
                system: systemPrompt,
                messages: currentMessages,
                maxOutputTokens: profile.maxTokens,
            });

            let fullText = '';
            if (attempt > 0) {
                yield { type: 'text-delta', text: '\n\n*Auto-correcting query...*\n\n' };
            }

            for await (const part of pass1.fullStream) {
                if (part.type === 'text-delta') {
                    fullText += part.textDelta || part.text || '';
                    yield { type: 'text-delta', text: part.textDelta || part.text || '' };
                } else if (part.type === 'reasoning-start') {
                    // Show native reasoning as a <think> block, but keep it OUT of
                    // fullText so it doesn't interfere with SQL block extraction.
                    yield { type: 'text-delta', text: '<think>' };
                } else if (part.type === 'reasoning-delta') {
                    yield { type: 'text-delta', text: part.text ?? part.textDelta ?? '' };
                } else if (part.type === 'reasoning-end') {
                    yield { type: 'text-delta', text: '</think>' };
                }
            }

            finalAssistantText = fullText;

            // ── Extract and execute SQL blocks ──
            const sqlBlocks = extractSqlBlocks(fullText);

            if (sqlBlocks.length > 0) {
                queryResults = [];
                let hasErrors = false;
                let lastErrorMsg = '';

                for (let i = 0; i < sqlBlocks.length; i++) {
                    const originalSql = sqlBlocks[i];
                    const correctedSql = interceptTableNames(originalSql, virtualMap);

                    // Emit synthetic tool-call event
                    const toolCallId = `pom_${Date.now()}_${attempt}_${i}`;
                    yield {
                        type: 'tool-call',
                        toolName: 'execute_sql',
                        toolCallId,
                        args: { query: correctedSql },
                    };

                    // Execute the corrected SQL (same guards as the tool-loop
                    // execute_sql: DB-side row cap + interrupting timeout on the
                    // dedicated 'ai' lane so a runaway query neither floods JS
                    // memory nor stays running as a zombie).
                    try {
                        const SQL_TIMEOUT = 30000;
                        const POM_ROW_LIMIT = 500;
                        const { sql: limitedSql, limited } = applyRowLimit(correctedSql, POM_ROW_LIMIT);
                        const pomTrackId = `pom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        const resultPromise = dbManager.queryWithMetadata(limitedSql, { lane: 'ai', trackId: pomTrackId });
                        resultPromise.catch(() => {}); // handled: may reject after a timeout interrupt
                        let pomTimer = null;
                        let result;
                        try {
                            result = await Promise.race([
                                resultPromise,
                                new Promise((_, reject) => {
                                    pomTimer = setTimeout(() => {
                                        // Interrupt only if OUR query still runs on 'ai'
                                        // (the sticky flag would kill the next statement)
                                        try {
                                            if (!dbManager.isRunning || dbManager.isRunning('ai', pomTrackId)) dbManager.interruptQuery('ai');
                                        } catch { /* best-effort */ }
                                        reject(new Error('Query timeout (30s)'));
                                    }, SQL_TIMEOUT);
                                }),
                            ]);
                        } finally {
                            if (pomTimer) clearTimeout(pomTimer);
                        }

                        let pomRows = result.rows;
                        if (limited && pomRows.length > POM_ROW_LIMIT) {
                            pomRows = pomRows.slice(0, POM_ROW_LIMIT);
                        }

                        const MAX_ROWS = 200;
                        const data = pomRows.length > MAX_ROWS
                            ? pomRows.slice(0, MAX_ROWS)
                            : pomRows;

                        const queryId = `qr_${Date.now()}_${attempt}_${i}`;
                        const toolResult = {
                            queryId,
                            query: correctedSql,
                            columns: result.types
                                ? Object.entries(result.types).map(([name, type]) => ({ name, type }))
                                : [],
                            data,
                            rowCount: pomRows.length,
                            executionTime: 0,
                            truncated: pomRows.length > MAX_ROWS,
                        };

                        queryResults.push({ sql: correctedSql, result: toolResult });

                        yield {
                            type: 'tool-result',
                            toolName: 'execute_sql',
                            toolCallId,
                            result: toolResult,
                            args: { query: correctedSql },
                        };
                    } catch (err) {
                        hasErrors = true;
                        lastErrorMsg = err.message;
                        queryResults.push({ sql: correctedSql, result: { error: err.message } });
                        yield {
                            type: 'tool-result',
                            toolName: 'execute_sql',
                            toolCallId,
                            result: { error: err.message },
                            args: { query: correctedSql },
                        };
                    }
                }

                // If query failed and retries remain, loop to re-prompt the LLM
                if (hasErrors && attempt < maxRetries) {
                    currentMessages = [
                        ...currentMessages,
                        { role: 'assistant', content: fullText },
                        {
                            role: 'user',
                            content: `Your SQL query failed with this error:\n\n${lastErrorMsg}\n\nWARNING: You MUST use the exact table names and column names provided in the schema context. Do not invent table names that are not in the schema. Please fix the query.`
                        }
                    ];
                    continue;
                }
            }

            break; // Success or out of retries
        }

        // ── Pass 2: Ask LLM to summarize the results ──
        if (queryResults.length > 0) {
            const resultsContext = queryResults.map((qr, i) => {
                if (qr.result.error) {
                    return `Query ${i + 1} failed: ${qr.result.error}`;
                }
                return `Query ${i + 1}: ${qr.sql}\n${formatResultForContext(qr.result.data, 15)}`;
            }).join('\n\n');

            yield { type: 'step-finish' };

            try {
                const summaryMessages = [
                    ...currentMessages,
                    { role: 'assistant', content: finalAssistantText },
                    {
                        role: 'user',
                        content: `Here are the query results:\n\n${resultsContext}\n\nPlease provide a clear, concise summary of these results. Use markdown formatting.`,
                    },
                ];

                const pass2 = streamText({
                    model: llmModel,
                    system: 'You are a data analyst. Summarize the query results concisely in markdown. Highlight key insights.',
                    messages: summaryMessages,
                    maxOutputTokens: profile.maxTokens,
                });

                yield { type: 'text-delta', text: '\n\n---\n\n' };

                for await (const part of pass2.fullStream) {
                    if (part.type === 'text-delta') {
                        yield { type: 'text-delta', text: part.textDelta || part.text || '' };
                    }
                }
            } catch (err) {
                console.warn('[AI PromptOnly] Pass 2 summary failed:', err.message);
            }
        }

        yield { type: 'step-finish' };
        yield { type: 'finish', usage: {} };
    }


    // ─── Legacy: Simple SQL Generation (backward compatible) ───

    async generateQuery(schema, question, providerOverride, modelOverride) {
        const provider = providerOverride || this.provider;
        const model = modelOverride || this.modelName;

        const systemPrompt = `You are a DuckDB SQL Expert.
Your goal is to generate the most efficient query for the User's Request.

### PRINCIPLES:
1. **Analyze Intent:**
   - If the user asks for a RANKING ("Top", "Best", "Highest"), use the window function:
     "QUALIFY ROW_NUMBER() OVER (PARTITION BY [dims] ORDER BY [metric] DESC) <= N"
   - If the user asks for a REPORT ("Total sales", "By category", "List of"), simply use "GROUP BY". Do NOT use "QUALIFY".

2. **Time Intelligence:**
   - Detect the requested granularity (Year, Month, Day) and apply DuckDB functions: "YEAR(col)", "MONTH(col)".
   - Always include the time column in the SELECT and GROUP BY clauses if usage is implied.

3. **Output Format:**
   - Write ONLY valid SQL.
   - Start directly with "SELECT".
   - No markdown blocks.

### SCHEMA:
${schema}`;

        const userPrompt = `### Question\n${question}\n\nReview the schema carefully and return only the valid DuckDB SQL query starting with SELECT.`;

        try {
            const llmModel = this.getModel(provider, model);

            const result = await generateText({
                model: llmModel,
                system: systemPrompt,
                messages: [{ role: 'user', content: userPrompt }],
                maxOutputTokens: 4000,
            });

            // Track Gemini usage
            if (provider === 'gemini' && result.usage) {
                this.trackUsage(model, result.usage);
            }

            return this.cleanSql(result.text);
        } catch (err) {
            if (err.message && (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))) {
                throw new Error(`Could not connect to ${provider === 'ollama' ? 'Ollama. Please ensure the Ollama app is running.' : 'Gemini API.'}`);
            }
            if (err.message && err.message.includes('not found')) {
                throw new Error(`Model '${model}' not found. ${provider === 'ollama' ? `Ensure you pulled it using: ollama pull ${model}` : ''}`);
            }
            throw err;
        }
    }

    cleanSql(text) {
        let sql = text.trim();
        sql = sql.replace(/```sql/ig, '').replace(/```/g, '').trim();
        return sql;
    }
}

module.exports = new AiManager();
