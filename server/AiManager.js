const path = require('path');
const fs = require('fs');
const os = require('os');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AiManager {
    constructor() {
        this.status = "READY";
        this.provider = "ollama"; // 'ollama' or 'gemini'
        this.modelName = "qwen3:1.7b";

        // Ensure config exists in home directory for secure storage
        this.configPath = path.join(os.homedir(), '.amoxsql', 'config.json');
        this.ensureConfig();
    }

    // Config methods
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
            // Ensure schema backwards compatibility
            if (!config.usage) {
                config.usageDate = today;
                config.usage = { flashLite: 0, flash: 0, pro: 0, tokens: 0 };
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            }

            return config;
        } catch (e) {
            return { geminiApiKey: "", provider: "ollama", defaultModel: "qwen3:1.7b", usageDate: new Date().toISOString().split('T')[0], usage: { flashLite: 0, flash: 0, pro: 0, tokens: 0 } };
        }
    }

    getStatus() {
        // Native local model management is handled by Ollama, so the state is always READY.
        return { status: "READY", progress: 100 };
    }

    async initialize() {
        // Load config on init
        const config = this.getConfig();
        this.provider = config.provider || "ollama";
        this.modelName = config.defaultModel || "qwen3:1.7b";
        this.status = "READY";
        console.log(`[AI] Initialized with Provider: ${this.provider}, Model: ${this.modelName}`);
    }

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

        if (provider === "gemini") {
            const config = this.getConfig();
            if (!config.geminiApiKey) {
                throw new Error("Gemini API Key is not configured. Please add it in settings.");
            }
            const genAI = new GoogleGenerativeAI(config.geminiApiKey);
            const geminiModel = genAI.getGenerativeModel({
                model: model || "gemini-2.5-flash",
                systemInstruction: systemPrompt
            });

            console.log(`[AI] Prompting Gemini (${model})...`);
            const result = await geminiModel.generateContent(userPrompt);

            // Track Usage
            try {
                if (result.response.usageMetadata) {
                    config.usage.tokens += result.response.usageMetadata.totalTokenCount || 0;
                }
                if (model.includes('flash-lite')) {
                    config.usage.flashLite += 1;
                } else if (model.includes('pro')) {
                    config.usage.pro += 1;
                } else {
                    config.usage.flash += 1;
                }
                fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            } catch (e) {
                console.error("Failed to track Gemini usage:", e);
            }

            return this.cleanSql(result.response.text());

        } else {
            // Ollama
            const ollamaClient = require('ollama').default || require('ollama');

            console.log(`[AI] Prompting Ollama (${model})...`);
            try {
                const response = await ollamaClient.chat({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                });
                return this.cleanSql(response.message.content);
            } catch (err) {
                if (err.message && err.message.includes('not found')) {
                    throw new Error(`Model '${model}' not found. Ensure you pulled it using: ollama pull ${model}`);
                } else if (err.code === 'ECONNREFUSED' || (err.cause && err.cause.code === 'ECONNREFUSED') || (err.message && err.message.includes('fetch failed'))) {
                    throw new Error("Could not connect to Ollama. Please ensure the Ollama app is running on your machine.");
                }
                throw err;
            }
        }
    }

    cleanSql(text) {
        let sql = text.trim();
        sql = sql.replace(/```sql/ig, '').replace(/```/g, '').trim();
        return sql;
    }
}

module.exports = new AiManager();
