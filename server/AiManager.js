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
const { generateText, streamText } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createOllama } = require('ai-sdk-ollama');
const ollama = createOllama();
const { createTools } = require('./ai/tools');
const { buildSystemPrompt } = require('./ai/systemPrompt');
const { loadUserRules } = require('./ai/userRules');
const { compactContext } = require('./ai/compaction');
const { loadMemoriesText, extractMemories } = require('./ai/memory');
const { getSkill } = require('./ai/skills');
const { getModelProfile } = require('./ai/modelProfiles');
const { buildVirtualMapping, extractSqlBlocks, interceptTableNames, formatResultForContext } = require('./ai/promptOnlyMode');

class AiManager {
    constructor() {
        this.status = "READY";
        this.provider = "ollama";
        this.modelName = "qwen3:1.7b";

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
                provider: "ollama",
                defaultModel: "qwen3:1.7b",
                usageDate: new Date().toISOString().split('T')[0],
                usage: { flashLite: 0, flash: 0, pro: 0, tokens: 0 }
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

            return config;
        } catch (e) {
            return {
                geminiApiKey: "", provider: "ollama", defaultModel: "qwen3:1.7b",
                usageDate: new Date().toISOString().split('T')[0],
                usage: { flashLite: 0, flash: 0, pro: 0, tokens: 0 }
            };
        }
    }

    getStatus() {
        return { status: "READY", progress: 100 };
    }

    async initialize() {
        const config = this.getConfig();
        this.provider = config.provider || "ollama";
        this.modelName = config.defaultModel || "qwen3:1.7b";
        this.status = "READY";
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
            if (!config.geminiApiKey) {
                throw new Error("Gemini API Key is not configured. Please add it in Settings > AI Assistant.");
            }
            // Create Google AI provider with user's API key
            const google = createGoogleGenerativeAI({
                apiKey: config.geminiApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
            });
            return google(modelName || 'gemini-2.5-flash');
        } else {
            // Ollama — local model
            return ollama(modelName || 'qwen3:1.7b');
        }
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
            activeSkillId = null,
            filePath = null,
            fileType = null,
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

        // Build dynamic system prompt (tier-adaptive)
        const systemPrompt = buildSystemPrompt({
            tables, files, mode,
            userRules, memories,
            currentQuery, currentResult, currentChartConfig,
            activeSkill, modelProfile: profile,
            filePath, fileType,
        });

        // Create tool context (mode-aware for tool filtering)
        const queryResults = new Map();
        const tools = createTools({ dbManager, queryResults, projectPath, mode });

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
                maxSteps: profile.maxSteps,
                maxTokens: profile.maxTokens,
            });

            // Run memory extraction in the background (skip for low-tier models)
            if (profile.supportsMemory) {
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
            activeSkillId = null,
            filePath = null,
            fileType = null,
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

        const systemPrompt = buildSystemPrompt({
            tables, files, mode,
            userRules, memories,
            currentQuery, currentResult, currentChartConfig,
            activeSkill, modelProfile: profile,
            filePath, fileType,
        });

        const queryResults = new Map();
        const tools = createTools({ dbManager, queryResults, projectPath, mode });

        console.log(`[AI Stream] Starting | Provider: ${provider} | Model: ${model} | Mode: ${mode} | Tier: ${profile.tier}`);

        const llmModel = this.getModel(provider, model);

        // Compact context if necessary to avoid token overflow
        const compactedMessages = await compactContext(llmModel, messages, null, model);

        const result = streamText({
            model: llmModel,
            system: systemPrompt,
            messages: compactedMessages,
            tools: profile.supportsToolCalling ? tools : undefined,
            maxSteps: profile.maxSteps,
            maxTokens: profile.maxTokens,
            onFinish: async ({ usage }) => {
                // Run memory extraction in the background (skip for low-tier models)
                if (profile.supportsMemory) {
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
        console.log(`\n[AI Schema Context Generated]:\n${schemaText}\n-------------------------\n`);

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
                maxTokens: profile.maxTokens,
            });

            let fullText = '';
            if (attempt > 0) {
                yield { type: 'text-delta', text: '\n\n*Auto-correcting query...*\n\n' };
            }

            for await (const part of pass1.fullStream) {
                if (part.type === 'text-delta') {
                    fullText += part.textDelta || part.text || '';
                    yield { type: 'text-delta', text: part.textDelta || part.text || '' };
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

                    // Execute the corrected SQL
                    try {
                        const SQL_TIMEOUT = 30000;
                        const resultPromise = dbManager.queryWithMetadata(correctedSql);
                        const result = await Promise.race([
                            resultPromise,
                            new Promise((_, reject) =>
                                setTimeout(() => reject(new Error('Query timeout (30s)')), SQL_TIMEOUT)
                            ),
                        ]);

                        const MAX_ROWS = 200;
                        const data = result.rows.length > MAX_ROWS
                            ? result.rows.slice(0, MAX_ROWS)
                            : result.rows;

                        const queryId = `qr_${Date.now()}_${attempt}_${i}`;
                        const toolResult = {
                            queryId,
                            query: correctedSql,
                            columns: result.types
                                ? Object.entries(result.types).map(([name, type]) => ({ name, type }))
                                : [],
                            data,
                            rowCount: result.rows.length,
                            executionTime: 0,
                            truncated: result.rows.length > MAX_ROWS,
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
                    maxTokens: profile.maxTokens,
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
                maxTokens: 4000,
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
