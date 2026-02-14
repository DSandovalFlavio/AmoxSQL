const path = require('path');
const fs = require('fs');

class AiManager {
    constructor() {
        this.llama = null;
        this.model = null;
        this.context = null;
        this.completion = null;

        this.modelName = "Qwen3-1.7B-Q5_K_M.gguf";
        // Using "custom" directory or node-llama-cpp default?
        // Let's store in server/models/ for portability
        this.modelsDir = path.join(__dirname, 'models');
        this.modelPath = path.join(this.modelsDir, this.modelName);

        this.status = "IDLE"; // IDLE, DOWNLOADING, LOADING, READY, ERROR
        this.downloadProgress = 0;

        // HF Direct Link for Qwen/Qwen3-0.6B-GGUF
        this.hfRepo = "gaianet/Qwen3-1.7B-GGUF";
        this.hfFile = "Qwen3-1.7B-Q5_K_M.gguf";
    }

    getStatus() {
        return { status: this.status, progress: this.downloadProgress };
    }

    async initialize() {
        if (this.status === "READY") return;
        if (this.status === "DOWNLOADING") return;
        if (this.status === "LOADING") return;

        try {
            // Ensure models dir exists
            if (!fs.existsSync(this.modelsDir)) {
                fs.mkdirSync(this.modelsDir, { recursive: true });
            }

            console.log(`[AI] Checking for model at: ${this.modelPath}`);

            if (!fs.existsSync(this.modelPath)) {
                console.log("[AI] Model not found. Starting download...");
                await this.downloadModel();
            } else {
                console.log("[AI] Model found.");
            }

            this.status = "LOADING";
            await this.loadModel();
        } catch (err) {
            console.error("[AI] Init failed:", err);
            this.status = "ERROR";
            throw err;
        }
    }

    async downloadModel() {
        this.status = "DOWNLOADING";
        this.downloadProgress = 0;

        // Use node-fetch (need to ensure it's available or use global fetch in Node 18+)
        // Assuming Node 18+ (bundled fetch)
        const url = `https://huggingface.co/${this.hfRepo}/resolve/main/${this.hfFile}?download=true`;

        console.log(`[AI] Downloading from: ${url}`);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch model: ${response.statusText}`);

        const totalSize = parseInt(response.headers.get('content-length'), 10);
        const fileStream = fs.createWriteStream(this.modelPath);

        let downloaded = 0;

        // ReadableStream iteration
        const reader = response.body.getReader();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            fileStream.write(value);
            downloaded += value.length;

            if (totalSize) {
                const pct = Math.round((downloaded / totalSize) * 100);
                if (pct > this.downloadProgress) {
                    this.downloadProgress = pct;
                    // console.log(`[AI] Download: ${pct}%`);
                }
            }
        }

        fileStream.end();
        console.log("[AI] Download complete.");
    }

    async loadModel() {
        console.log("[AI] Loading Llama Engine (Dynamic Import)...");
        const { getLlama, LlamaCompletion } = await import("node-llama-cpp");

        this.llama = await getLlama();

        console.log("[AI] Loading Model into memory...");
        this.model = await this.llama.loadModel({
            modelPath: this.modelPath
        });

        console.log("[AI] Creating Context...");
        this.context = await this.model.createContext();
        const sequence = this.context.getSequence();

        console.log("[AI] Creating Completion Engine...");
        this.completion = new LlamaCompletion({
            contextSequence: sequence
        });

        this.status = "READY";
        console.log("[AI] System Ready.");
    }

    async generateQuery(schema, question) {
        if (this.status !== "READY") {
            throw new Error("AI Engine not ready (Model missing or loading)");
        }

        // System Prompt (defined by User logic)
        const systemPrompt = `<|im_start|>system
You are a DuckDB SQL Expert.
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

### EXAMPLES:
User: "Sales by category and year"
SQL: SELECT Category, YEAR(Order_Date) as Yr, SUM(Amount) FROM data GROUP BY Category, Yr;

User: "Top 3 products each month"
SQL: SELECT MONTH(Order_Date) as Mth, Product, SUM(Amount) FROM data GROUP BY Mth, Product QUALIFY ROW_NUMBER() OVER (PARTITION BY Mth ORDER BY SUM(Amount) DESC) <= 3;
<|im_end|>`;

        // User Prompt Construction
        const fullPrompt = `${systemPrompt}
<|im_start|>user ### Schema
${schema}

### Question
${question}

<|im_end|>
<|im_start|>assistant
SELECT`;

        console.log("[AI] Prompting (Completion Mode)...");
        const response = await this.completion.generateCompletion(fullPrompt, {
            maxTokens: 512,
            temperature: 0.1,
            stopOnAbortSignal: true
        });

        // Cleanup response (remove backticks if any)
        // Since we prepended 'SELECT', we should prepend it back if the model continues
        // But usually completion generates the rest.
        // Let's assume response is the continuation.
        let sql = "SELECT " + response.trim();
        sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();

        return sql;
    }
}

module.exports = new AiManager();
