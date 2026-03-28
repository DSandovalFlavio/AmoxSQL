const { generateObject } = require('ai');
const { z } = require('zod');
const aiPersistence = require('./persistence');

/**
 * Extracts potential memories (facts or rules) from a conversation using a lightweight LLM call.
 * 
 * @param {object} model - The Vercel AI SDK model instance to use for extraction
 * @param {Array} messages - The conversation messages
 * @param {object} dbManager - DatabaseManager instance for saving extracted memories
 */
async function extractMemories(model, messages, dbManager) {
    if (!messages || messages.length < 2) return;

    // Only process if the user said something in the last few messages
    // to avoid unnecessary API calls when just tool results are added
    const recentMessages = messages.slice(-4);
    const hasUserMessage = recentMessages.some(m => m.role === 'user');
    if (!hasUserMessage) return;

    // Convert messages to a text transcript for the LLM
    const transcript = messages.map(m => {
        if (m.role === 'user') return `User: ${m.content}`;
        if (m.role === 'assistant' && m.content) return `Assistant: ${m.content}`;
        return null;
    }).filter(Boolean).join('\n');

    if (!transcript) return;

    const systemPrompt = `You are a background memory-extraction assistant.
Analyze the following conversation transcript and identify any explicit or implicit facts, preferences, or rules the User has stated about themselves, their data, or how they want the Assistant to behave.

Categories:
- "global_rule": Instructions on how the Assistant should format output, behave, or write code.
- "personal_fact": Facts about the User, their company, their database schema nuances, or their goals.

Only extract statements that are likely to be useful in future, unrelated conversations.
If there are no facts or rules to extract, return empty arrays. DO NOT make things up.`;

    try {
        const result = await generateObject({
            model: model,
            system: systemPrompt,
            messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
            schema: z.object({
                global_rules: z.array(z.string()).describe('List of rules or formatting preferences stated by the user.'),
                personal_facts: z.array(z.string()).describe('List of facts about the user or their data.')
            })
        });

        await saveMemories(result.object, dbManager);

    } catch (err) {
        console.warn(`[AI Memory] generateObject failed (${err.message}). Attempting fallback with generateText...`);
        
        // Fallback for models without reliable structured output
        try {
            const fallbackPrompt = `${systemPrompt}
            
Respond EXCLUSIVELY with valid JSON matching this schema:
{
  "global_rules": ["rule 1", "rule 2"],
  "personal_facts": ["fact 1"]
}`;
            
            const { generateText } = require('ai');
            const fallbackResult = await generateText({
                model,
                system: fallbackPrompt,
                messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
                maxTokens: 500
            });
            
            // Extract JSON from potential markdown blocks
            let jsonText = fallbackResult.text.trim();
            jsonText = jsonText.replace(/```json/ig, '').replace(/```/g, '').trim();
            
            const memories = JSON.parse(jsonText);
            await saveMemories(memories, dbManager);
            
        } catch (fallbackErr) {
            console.warn('[AI Memory] Fallback also failed:', fallbackErr.message);
        }
    }
}

async function saveMemories(memories, dbManager) {
    if (!memories) return;
    
    let savedCount = 0;
    if (memories.global_rules && Array.isArray(memories.global_rules)) {
        for (const rule of memories.global_rules) {
            if (rule.trim()) {
                await aiPersistence.addMemory(dbManager, { category: 'global_rule', content: rule.trim() });
                savedCount++;
            }
        }
    }

    if (memories.personal_facts && Array.isArray(memories.personal_facts)) {
        for (const fact of memories.personal_facts) {
            if (fact.trim()) {
                await aiPersistence.addMemory(dbManager, { category: 'personal_fact', content: fact.trim() });
                savedCount++;
            }
        }
    }

    if (savedCount > 0) {
        console.log(`[AI Memory] Saved ${savedCount} explicit memories.`);
    }
}

/**
 * Formats saved memories into a string block for the system prompt.
 * 
 * @param {object} dbManager - DatabaseManager instance
 * @returns {Promise<string>} - Formatted markdown string of memories
 */
async function loadMemoriesText(dbManager) {
    if (!dbManager) return '';

    const memories = await aiPersistence.getMemories(dbManager);
    if (!memories || memories.length === 0) return '';

    const rules = memories.filter(m => m.category === 'global_rule');
    const facts = memories.filter(m => m.category === 'personal_fact');

    let text = '## User Memories & Preferences\n';
    text += 'The following facts and rules were extracted from previous interactions with this user. You must respect them:\n\n';
    
    if (rules.length > 0) {
        text += '### User Rules & Preferences:\n';
        rules.forEach(r => text += `- ${r.content}\n`);
        text += '\n';
    }
    
    if (facts.length > 0) {
        text += '### Facts About the User / Data:\n';
        facts.forEach(f => text += `- ${f.content}\n`);
    }

    return text.trim();
}

module.exports = {
    extractMemories,
    loadMemoriesText
};
