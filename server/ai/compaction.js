const { generateText } = require('ai');

/**
 * Calculates a rough token count for a string (approx 4 chars per token).
 */
function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

/**
 * Ensures the messages array fits within the model's context window.
 * If it's too large, it summarizes the oldest messages and replaces them
 * with a single system message containing the summary, while keeping the
 * most recent messages intact.
 * 
 * @param {object} model - The Vercel AI SDK model instance
 * @param {Array} messages - The full conversation history
 * @param {number} maxTokens - The maximum tokens allowed for history (default 4000)
 * @returns {Promise<Array>} - The compacted messages array ready for the LLM
 */
async function compactContext(model, messages, maxTokens = 6000) {
    if (!messages || messages.length <= 4) return messages;

    // We always want to keep the system prompt and the latest 4 messages pristine
    const latestMessages = messages.slice(-4);
    const olderMessages = messages.slice(0, -4);
    
    // Estimate total tokens of older messages
    const olderTranscript = olderMessages.map(m => {
        let text = `${m.role.toUpperCase()}: ${m.content || ''}`;
        if (m.toolCalls && m.toolCalls.length > 0) {
            text += `\n[Tool Calls]: ${m.toolCalls.map(t => t.toolName).join(', ')}`;
        }
        return text;
    }).join('\n\n');

    const estimatedTokens = estimateTokens(olderTranscript);

    // If it fits comfortably, return as is
    if (estimatedTokens < maxTokens * 0.75) {
        return messages;
    }

    console.log(`[AI Compaction] Context length ${estimatedTokens} tokens exceeds threshold. Compacting...`);

    const summaryPrompt = `You are a conversation summarizer. 
Please summarize the following older portion of a conversation between a User and a Data Assistant.
Retain all technical context, specific database table names mentioned, goals, and facts.
Keep it strictly factual and concise.

TRANSCRIPT:
${olderTranscript}
`;

    try {
        const { text: summary } = await generateText({
            model: model,
            system: 'You are an expert summarizer.',
            messages: [{ role: 'user', content: summaryPrompt }],
            maxTokens: 500
        });

        // Replace older messages with a single system summary
        const compactedMessages = [
            {
                role: 'system',
                content: `[PRIOR CONTEXT SUMMARY]\n${summary}`
            },
            ...latestMessages
        ];

        console.log(`[AI Compaction] Successfully compacted context down to ~${estimateTokens(summary)} tokens.`);
        return compactedMessages;

    } catch (err) {
        console.warn('[AI Compaction] Failed to compact messages:', err.message);
        // Fallback: just truncate if API fails
        return messages.slice(-Math.max(6, messages.length / 2));
    }
}

module.exports = {
    compactContext,
    estimateTokens
};
