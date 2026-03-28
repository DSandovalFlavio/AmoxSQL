const { generateText } = require('ai');
const { getModelProfile, getModelContextWindow } = require('./modelProfiles');

/**
 * Calculates a rough token count for a string.
 * Uses ~3.5 chars per token for better accuracy with JSON/code content.
 */
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
}

/**
 * Cleans up large tool result data in older messages to save tokens.
 * Truncates data arrays to keep only a summary.
 */
function cleanToolResults(messages) {
    return messages.map(m => {
        if (!m.toolCalls || !Array.isArray(m.toolCalls)) return m;

        const cleanedToolCalls = m.toolCalls.map(tc => {
            if (!tc.result) return tc;

            // Truncate execute_sql data arrays to 10 rows for older messages
            if (tc.toolName === 'execute_sql' && tc.result.data && Array.isArray(tc.result.data)) {
                return {
                    ...tc,
                    result: {
                        ...tc.result,
                        data: tc.result.data.slice(0, 10),
                        truncatedForContext: tc.result.data.length > 10,
                    },
                };
            }

            // Remove full chart config from display_chart results
            if (tc.toolName === 'display_chart' && tc.result.chartConfig) {
                return {
                    ...tc,
                    result: {
                        success: tc.result.success,
                        chartType: tc.result.chartConfig?.chartType || tc.result.chartType,
                        title: tc.result.chartConfig?.title,
                    },
                };
            }

            return tc;
        });

        return { ...m, toolCalls: cleanedToolCalls };
    });
}

/**
 * Ensures the messages array fits within the model's context window.
 * If it's too large, it first cleans up tool results, then summarizes
 * the oldest messages and replaces them with a summary.
 *
 * @param {object} model - The Vercel AI SDK model instance
 * @param {Array} messages - The full conversation history
 * @param {number} maxTokensOverride - Override max tokens (optional, auto-detected from model)
 * @param {string} modelName - Model name for context window detection
 * @returns {Promise<Array>} - The compacted messages array ready for the LLM
 */
async function compactContext(model, messages, maxTokensOverride, modelName) {
    if (!messages || messages.length <= 4) return messages;

    // Determine context window limit
    const contextWindow = maxTokensOverride || getModelContextWindow(modelName);
    const threshold = Math.floor(contextWindow * 0.75);

    // We always keep the latest 4 messages pristine
    const latestMessages = messages.slice(-4);
    const olderMessages = messages.slice(0, -4);

    // Estimate total tokens of older messages
    const olderTranscript = olderMessages.map(m => {
        let text = `${m.role.toUpperCase()}: ${m.content || ''}`;
        if (m.toolCalls && m.toolCalls.length > 0) {
            text += `\n[Tool Calls]: ${JSON.stringify(m.toolCalls).substring(0, 500)}`;
        }
        return text;
    }).join('\n\n');

    const estimatedTokens = estimateTokens(olderTranscript);

    // If it fits comfortably, return as is
    if (estimatedTokens < threshold) {
        return messages;
    }

    console.log(`[AI Compaction] Context ~${estimatedTokens} tokens exceeds threshold ${threshold}. Model context: ${contextWindow}. Compacting...`);

    // Step 1: Clean up tool results in older messages
    const cleanedOlder = cleanToolResults(olderMessages);
    const cleanedTranscript = cleanedOlder.map(m => {
        let text = `${m.role.toUpperCase()}: ${m.content || ''}`;
        if (m.toolCalls && m.toolCalls.length > 0) {
            text += `\n[Tool Calls]: ${m.toolCalls.map(t => t.toolName).join(', ')}`;
        }
        return text;
    }).join('\n\n');

    const cleanedTokens = estimateTokens(cleanedTranscript);

    // If cleaning was enough, return cleaned version
    if (cleanedTokens < threshold) {
        console.log(`[AI Compaction] Tool result cleanup sufficient. Reduced to ~${cleanedTokens} tokens.`);
        return [...cleanedOlder, ...latestMessages];
    }

    // Step 2: Summarize older messages
    const summaryPrompt = `You are a conversation summarizer.
Please summarize the following older portion of a conversation between a User and a Data Assistant.
Retain all technical context, specific database table names mentioned, goals, and facts.
Keep it strictly factual and concise.

TRANSCRIPT:
${cleanedTranscript}
`;

    try {
        const { text: summary } = await generateText({
            model: model,
            system: 'You are an expert summarizer.',
            messages: [{ role: 'user', content: summaryPrompt }],
            maxTokens: 800,
        });

        const compactedMessages = [
            {
                role: 'system',
                content: `[PRIOR CONTEXT SUMMARY]\n${summary}`,
            },
            ...latestMessages,
        ];

        console.log(`[AI Compaction] Compacted to ~${estimateTokens(summary)} tokens summary.`);
        return compactedMessages;

    } catch (err) {
        console.warn('[AI Compaction] Failed to compact messages:', err.message);
        // Fallback: truncate to last half
        return messages.slice(-Math.max(6, Math.floor(messages.length / 2)));
    }
}

module.exports = {
    compactContext,
    estimateTokens,
    getModelContextWindow,
};
