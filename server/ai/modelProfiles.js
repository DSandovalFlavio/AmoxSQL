/**
 * AmoxSQL AI — Model Profiles
 * 
 * Centralizes all model-specific configuration: tier detection,
 * context windows, capability flags, and adaptive parameters.
 * 
 * Classification pipeline (priority order):
 *   1. User override (from config.modelTierOverrides)
 *   2. Known MODEL_PATTERNS (explicit registry)
 *   3. Cloud provider detection (Gemini)
 *   4. Ollama API capability auto-detection (tools, thinking, vision, audio)
 *   5. Fallback: parameter count regex from model name
 * 
 * Tiers:
 *   - low:    prompt-only mode, no tool calling, no charts
 *   - medium: full tool calling, charts, notebooks, memory
 *   - high:   full features, aggressive steps, planner-ready
 *   - cloud:  Gemini — unlimited features
 */

'use strict';

/**
 * Known model profiles with context windows and capabilities.
 * Order matters: first match wins.
 */
const MODEL_PATTERNS = [
    // ── Cloud (Gemini) ──
    { pattern: 'gemini-3.1-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-3.1-flash',    tier: 'cloud',  contextWindow: 500000 },
    { pattern: 'gemini-3-flash',      tier: 'cloud',  contextWindow: 500000 },
    { pattern: 'gemini-2.5-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-2.5-flash-lite', tier: 'cloud', contextWindow: 100000 },
    { pattern: 'gemini-2.5-flash',    tier: 'cloud',  contextWindow: 500000 },
    { pattern: 'gemini-2.0-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-1.5-pro',      tier: 'cloud',  contextWindow: 1000000 },
    { pattern: 'gemini-1.5-flash',    tier: 'cloud',  contextWindow: 500000 },
    { pattern: 'gemini',              tier: 'cloud',  contextWindow: 100000 },

    // ── Gemma 4 (reclassified by capability, not size) ──
    { pattern: 'gemma4:e2b',  tier: 'medium', contextWindow: 128000 },
    { pattern: 'gemma4:e4b',  tier: 'medium', contextWindow: 128000 },
    { pattern: 'gemma4:26b',  tier: 'high',   contextWindow: 256000 },
    { pattern: 'gemma4:31b',  tier: 'high',   contextWindow: 256000 },
    { pattern: 'gemma4',      tier: 'medium', contextWindow: 128000 },

    // ── Phi-4 ──
    { pattern: 'phi4:mini',   tier: 'medium', contextWindow: 128000 },
    { pattern: 'phi4',        tier: 'medium', contextWindow: 128000 },

    // ── Low tier (models without reliable tool calling) ──
    { pattern: 'phi:1',              tier: 'low', contextWindow: 8000 },
    { pattern: 'phi3:mini',          tier: 'low', contextWindow: 16000 },
    { pattern: 'gemma3:1b',          tier: 'low', contextWindow: 8000 },
    { pattern: 'gemma3:270m',        tier: 'low', contextWindow: 8000 },
    { pattern: 'gemma2:2b',          tier: 'low', contextWindow: 8000 },

    // ── Medium tier ──
    { pattern: 'lfm2.5',             tier: 'medium', contextWindow: 32000 },
    { pattern: 'qwen3.5:0.8b',       tier: 'medium', contextWindow: 32000 },
    { pattern: 'qwen3.5:2b',         tier: 'medium', contextWindow: 32000 },
    { pattern: 'qwen3.5:4b',         tier: 'medium', contextWindow: 64000 },
    { pattern: 'qwen3.5:9b',         tier: 'medium', contextWindow: 128000 },
    { pattern: 'qwen3:0.6b',         tier: 'medium', contextWindow: 8000 },
    { pattern: 'qwen3:1.7b',         tier: 'medium', contextWindow: 8000 },
    { pattern: 'qwen3:4b',           tier: 'medium', contextWindow: 32000 },
    { pattern: 'qwen3:8b',           tier: 'medium', contextWindow: 32000 },
    { pattern: 'rnj-1',              tier: 'medium', contextWindow: 32000 },
    { pattern: 'llama3:8b',          tier: 'medium', contextWindow: 32000 },
    { pattern: 'llama3.1:8b',        tier: 'medium', contextWindow: 128000 },
    { pattern: 'llama3.2:3b',        tier: 'medium', contextWindow: 32000 },
    { pattern: 'mistral:7b',         tier: 'medium', contextWindow: 32000 },
    { pattern: 'codellama:7b',       tier: 'medium', contextWindow: 16000 },
    { pattern: 'deepseek-coder:6.7b', tier: 'medium', contextWindow: 32000 },

    // ── High tier (20B+) ──
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
 * Classify an unknown model based on Ollama API capabilities and parameter size.
 * Used when a model is NOT in MODEL_PATTERNS and has no user override.
 * 
 * @param {string[]} capabilities - Array from Ollama /api/show (e.g. ['completion','tools','thinking'])
 * @param {string} parameterSize  - String from Ollama (e.g. '5.1B', '873.44M')
 * @returns {{ tier: string, contextWindow: number, detectedCaps: object }}
 */
function classifyModelFromCapabilities(capabilities = [], parameterSize = '') {
    const caps = Array.isArray(capabilities) ? capabilities : [];
    const hasTools    = caps.includes('tools');
    const hasThinking = caps.includes('thinking');
    const hasVision   = caps.includes('vision');
    const hasAudio    = caps.includes('audio');

    // Parse parameter size to a numeric value in billions
    const paramStr = String(parameterSize).toUpperCase();
    let paramBillions = 0;
    const bMatch = paramStr.match(/([\d.]+)\s*B/);
    const mMatch = paramStr.match(/([\d.]+)\s*M/);
    if (bMatch) paramBillions = parseFloat(bMatch[1]);
    else if (mMatch) paramBillions = parseFloat(mMatch[1]) / 1000;

    const detectedCaps = { hasTools, hasThinking, hasVision, hasAudio, paramBillions };

    // Classification logic based on capabilities (not just size)
    if (hasTools) {
        // Models with tool calling belong in medium at minimum
        if (paramBillions > 13) {
            return { tier: 'high', contextWindow: 64000, detectedCaps };
        }
        return { tier: 'medium', contextWindow: 32000, detectedCaps };
    }

    // No tool calling — classify by size
    if (paramBillions > 13) {
        return { tier: 'high', contextWindow: 64000, detectedCaps };
    }
    if (paramBillions > 3) {
        return { tier: 'medium', contextWindow: 32000, detectedCaps };
    }

    return { tier: 'low', contextWindow: 8000, detectedCaps };
}


// ── Ollama capabilities cache ───────────────────────────────────────────
// We cache /api/show results so we don't hit the API on every call.
// The cache is keyed by model name and is valid for 10 minutes.
const _ollamaCapabilitiesCache = new Map();
const CAPABILITIES_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch model capabilities from Ollama's /api/show endpoint.
 * Returns null if Ollama is not available or the model is not found.
 * 
 * @param {string} modelName 
 * @returns {Promise<{capabilities: string[], parameterSize: string, family: string}|null>}
 */
async function fetchOllamaModelInfo(modelName) {
    const cached = _ollamaCapabilitiesCache.get(modelName);
    if (cached && (Date.now() - cached.time) < CAPABILITIES_CACHE_TTL) {
        return cached.data;
    }

    try {
        const resp = await fetch('http://localhost:11434/api/show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelName }),
            signal: AbortSignal.timeout(3000), // 3s timeout
        });
        if (!resp.ok) return null;
        const json = await resp.json();

        const data = {
            capabilities: json.capabilities || [],
            parameterSize: json.details?.parameter_size || '',
            family: json.details?.family || '',
            quantization: json.details?.quantization_level || '',
        };

        _ollamaCapabilitiesCache.set(modelName, { data, time: Date.now() });
        return data;
    } catch {
        return null;
    }
}

/**
 * Invalidate the capabilities cache for a specific model or all models.
 * @param {string} [modelName] - If omitted, clears entire cache.
 */
function invalidateCapabilitiesCache(modelName) {
    if (modelName) {
        _ollamaCapabilitiesCache.delete(modelName);
    } else {
        _ollamaCapabilitiesCache.clear();
    }
}


// ── User tier overrides ──────────────────────────────────────────────────
// Loaded lazily from config. The main app can set this via setUserTierOverrides().
let _userTierOverrides = null;

/**
 * Set user tier overrides. Called by the main app after reading config.
 * @param {Object<string, string>} overrides - Map of modelName → tier string
 */
function setUserTierOverrides(overrides) {
    _userTierOverrides = overrides || {};
}

/**
 * Get the current user tier overrides.
 * @returns {Object<string, string>}
 */
function getUserTierOverrides() {
    return _userTierOverrides || {};
}


/**
 * Returns the full profile for a model by matching its name against known patterns.
 * 
 * Priority: user override → MODEL_PATTERNS → cloud detection → Ollama API → param regex fallback
 * 
 * @param {string} modelName - The model identifier (e.g. 'gemma4:e2b', 'gemini-2.5-flash')
 * @param {string} providerName - 'ollama' or 'gemini' (used as fallback)
 * @param {object} [ollamaInfo] - Pre-fetched Ollama model info (optional, avoids re-fetching)
 * @returns {object} Complete model profile with all capability flags
 */
function getModelProfile(modelName, providerName, ollamaInfo) {
    const name = String(modelName || '').toLowerCase();

    // ── 1. Check user overrides ──
    if (_userTierOverrides && _userTierOverrides[name]) {
        const overrideTier = _userTierOverrides[name];
        const tierDefaults = TIER_DEFAULTS[overrideTier] || TIER_DEFAULTS.medium;
        // Still try to find contextWindow from patterns
        const match = MODEL_PATTERNS.find(p => name.includes(p.pattern));
        const contextWindow = match ? match.contextWindow : 32000;
        return {
            tier: overrideTier,
            contextWindow,
            modelName,
            isUserOverride: true,
            ...tierDefaults,
        };
    }

    // ── 2. If provider is gemini, force cloud tier ──
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

    // ── 3. Find matching pattern in known models ──
    const match = MODEL_PATTERNS.find(p => name.includes(p.pattern));

    if (match) {
        const tierDefaults = TIER_DEFAULTS[match.tier];
        return {
            tier: match.tier,
            contextWindow: match.contextWindow,
            modelName,
            ...tierDefaults,
        };
    }

    // ── 4. Auto-detect from Ollama API capabilities (if info was pre-fetched) ──
    if (ollamaInfo && ollamaInfo.capabilities) {
        const { tier, contextWindow, detectedCaps } = classifyModelFromCapabilities(
            ollamaInfo.capabilities,
            ollamaInfo.parameterSize
        );
        const tierDefaults = TIER_DEFAULTS[tier];
        return {
            tier,
            contextWindow,
            modelName,
            autoDetected: true,
            detectedCaps,
            ...tierDefaults,
            // Override thinking flag from actual capabilities
            supportsThinking: detectedCaps.hasThinking,
        };
    }

    // ── 5. Fallback: estimate tier from param count in name ──
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
    classifyModelFromCapabilities,
    fetchOllamaModelInfo,
    invalidateCapabilitiesCache,
    setUserTierOverrides,
    getUserTierOverrides,
    TIER_DEFAULTS,
    MODEL_PATTERNS,
};
