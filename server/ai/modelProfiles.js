/**
 * AmoxSQL AI — Model Profiles
 * 
 * Centralizes all model-specific configuration: tier detection,
 * context windows, capability flags, and adaptive parameters.
 * 
 * Tiers:
 *   - low:    1-2B params — prompt-only mode, no tool calling, no charts
 *   - medium: 4-9B params — full tool calling, moderate steps
 *   - high:   20-27B params — full features, aggressive steps
 *   - cloud:  Gemini — unlimited features
 */

/**
 * Known model profiles with context windows and capabilities.
 * Order matters: first match wins.
 */
const MODEL_PATTERNS = [
    // ── Cloud (Gemini) ──
    { pattern: 'gemini-2.5-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-2.5-flash-lite', tier: 'cloud', contextWindow: 100000 },
    { pattern: 'gemini-2.5-flash',    tier: 'cloud',  contextWindow: 500000 },
    { pattern: 'gemini-2.0-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-1.5-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-1.5-flash',    tier: 'cloud',  contextWindow: 500000 },
    { pattern: 'gemini',              tier: 'cloud',  contextWindow: 100000 },

    // ── Low tier (1-2B) ──
    { pattern: 'lfm2.5',             tier: 'low', contextWindow: 32000, supportsThinking: true },
    { pattern: 'qwen3.5:0.8b',       tier: 'low', contextWindow: 32000 },
    { pattern: 'qwen3.5:2b',         tier: 'low', contextWindow: 32000 },
    { pattern: 'qwen3:0.6b',         tier: 'low', contextWindow: 8000 },
    { pattern: 'qwen3:1.7b',         tier: 'low', contextWindow: 8000 },
    { pattern: 'phi:1',              tier: 'low', contextWindow: 8000 },
    { pattern: 'phi3:mini',          tier: 'low', contextWindow: 16000 },

    // ── Medium tier (4-9B) ──
    { pattern: 'qwen3.5:4b',         tier: 'medium', contextWindow: 64000 },
    { pattern: 'qwen3.5:9b',         tier: 'medium', contextWindow: 128000 },
    { pattern: 'qwen3:4b',           tier: 'medium', contextWindow: 32000 },
    { pattern: 'qwen3:8b',           tier: 'medium', contextWindow: 32000 },
    { pattern: 'rnj-1',              tier: 'medium', contextWindow: 32000 },
    { pattern: 'llama3:8b',          tier: 'medium', contextWindow: 32000 },
    { pattern: 'llama3.1:8b',        tier: 'medium', contextWindow: 128000 },
    { pattern: 'mistral:7b',         tier: 'medium', contextWindow: 32000 },
    { pattern: 'codellama:7b',       tier: 'medium', contextWindow: 16000 },
    { pattern: 'deepseek-coder:6.7b', tier: 'medium', contextWindow: 32000 },

    // ── High tier (20-27B+) ──
    { pattern: 'qwen3.5:27b',        tier: 'high', contextWindow: 256000 },
    { pattern: 'qwen3.5:35b',        tier: 'high', contextWindow: 256000 },
    { pattern: 'qwen3:14b',          tier: 'high', contextWindow: 64000 },
    { pattern: 'qwen3:32b',          tier: 'high', contextWindow: 64000 },
    { pattern: 'lfm2:24b',           tier: 'high', contextWindow: 32000 },
    { pattern: 'lfm2',               tier: 'high', contextWindow: 32000 },
    { pattern: 'gpt-oss:20b',        tier: 'high', contextWindow: 128000 },
    { pattern: 'gpt-oss',            tier: 'high', contextWindow: 128000 },
    { pattern: 'llama3:70b',         tier: 'high', contextWindow: 64000 },
    { pattern: 'llama3.1:70b',       tier: 'high', contextWindow: 128000 },
    { pattern: 'deepseek-coder:33b', tier: 'high', contextWindow: 64000 },
    { pattern: 'mistral:22b',        tier: 'high', contextWindow: 32000 },
    { pattern: 'mistral-large',      tier: 'high', contextWindow: 128000 },
];

/**
 * Default capabilities by tier.
 */
const TIER_DEFAULTS = {
    low: {
        maxSteps: 1,            // prompt-only mode, no tool loop
        maxTokens: 2000,
        supportsToolCalling: false,
        supportsStructuredOutput: false,
        supportsThinking: false,
        supportsCharts: false,
        supportsNotebooks: false,
        supportsMemory: false,
        systemPromptBudget: 800,  // tokens
        maxContextRows: 3,        // sample rows in context
        compactionThreshold: 0.6, // compact at 60% of context window
    },
    medium: {
        maxSteps: 5,
        maxTokens: 8000,
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        supportsThinking: false,
        supportsCharts: true,
        supportsNotebooks: true,
        supportsMemory: true,
        systemPromptBudget: 2000,
        maxContextRows: 5,
        compactionThreshold: 0.70,
    },
    high: {
        maxSteps: 10,
        maxTokens: 16000,
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        supportsThinking: false,
        supportsCharts: true,
        supportsNotebooks: true,
        supportsMemory: true,
        systemPromptBudget: 4000,
        maxContextRows: 5,
        compactionThreshold: 0.75,
    },
    cloud: {
        maxSteps: 15,
        maxTokens: 16000,
        supportsToolCalling: true,
        supportsStructuredOutput: true,
        supportsThinking: false,
        supportsCharts: true,
        supportsNotebooks: true,
        supportsMemory: true,
        systemPromptBudget: 8000,
        maxContextRows: 10,
        compactionThreshold: 0.80,
    },
};

/**
 * Returns the full profile for a model by matching its name against known patterns.
 * 
 * @param {string} modelName - The model identifier (e.g. 'qwen3.5:2b', 'gemini-2.5-flash')
 * @param {string} providerName - 'ollama' or 'gemini' (used as fallback)
 * @returns {object} Complete model profile with all capability flags
 */
function getModelProfile(modelName, providerName) {
    const name = String(modelName || '').toLowerCase();

    // If provider is gemini, force cloud tier
    if (providerName === 'gemini') {
        const match = MODEL_PATTERNS.find(p => name.includes(p.pattern));
        const contextWindow = match ? match.contextWindow : 100000;
        return {
            tier: 'cloud',
            contextWindow,
            modelName,
            ...TIER_DEFAULTS.cloud,
        };
    }

    // Find matching pattern
    const match = MODEL_PATTERNS.find(p => name.includes(p.pattern));

    if (match) {
        const tierDefaults = TIER_DEFAULTS[match.tier];
        return {
            tier: match.tier,
            contextWindow: match.contextWindow,
            modelName,
            ...tierDefaults,
            // Override with pattern-specific flags
            supportsThinking: match.supportsThinking || tierDefaults.supportsThinking,
        };
    }

    // Unknown model: estimate tier from param count in name
    const paramMatch = name.match(/(\d+(?:\.\d+)?)b/);
    if (paramMatch) {
        const params = parseFloat(paramMatch[1]);
        if (params <= 3) {
            return { tier: 'low', contextWindow: 8000, modelName, ...TIER_DEFAULTS.low };
        }
        if (params <= 13) {
            return { tier: 'medium', contextWindow: 32000, modelName, ...TIER_DEFAULTS.medium };
        }
        return { tier: 'high', contextWindow: 64000, modelName, ...TIER_DEFAULTS.high };
    }

    // Absolute fallback: assume medium
    return { tier: 'medium', contextWindow: 8000, modelName, ...TIER_DEFAULTS.medium };
}

/**
 * Returns just the tier string for a model.
 * @param {string} modelName
 * @param {string} providerName
 * @returns {'low'|'medium'|'high'|'cloud'}
 */
function getModelTier(modelName, providerName) {
    return getModelProfile(modelName, providerName).tier;
}

/**
 * Returns the context window size for a model.
 * Drop-in replacement for compaction.js getModelContextWindow.
 * @param {string} modelName
 * @param {string} providerName
 * @returns {number}
 */
function getModelContextWindow(modelName, providerName) {
    return getModelProfile(modelName, providerName).contextWindow;
}

module.exports = {
    getModelProfile,
    getModelTier,
    getModelContextWindow,
    TIER_DEFAULTS,
};
