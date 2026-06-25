/**
 * Deep Dive — turn grouping.
 *
 * A "turn" is delimited by each REAL text message (a user message, or an AI
 * message that contains visible prose). Tool calls (execute_sql, display_chart,
 * create_plan/update_plan…) and reasoning (<think>) are NOT turns — they are the
 * *activity* attached to the AI turn they lead up to.
 *
 * A single user prompt can produce several AI turns (one per prose chunk the
 * model writes). Tool-only / reasoning-only assistant messages accumulate and
 * attach to the next AI prose turn (or form an in-progress turn at the end).
 */

const THINK_RE = /<think>[\s\S]*?<\/think>/gi;

/** Remove <think>…</think> reasoning blocks from a message body. */
export function stripThink(s = '') {
    return String(s || '').replace(THINK_RE, '');
}

/** True when an assistant message has visible prose (text beyond reasoning). */
export function hasProse(msg) {
    return !!(msg && msg.content && stripThink(msg.content).trim());
}

/**
 * Group a flat message list into turns.
 * @returns {Array<{ id, type:'user'|'ai', text, messages, inProgress? }>}
 */
export function groupIntoTurns(messages = []) {
    const turns = [];
    let pending = []; // tool-only / reasoning-only assistant messages awaiting a prose turn

    messages.forEach((msg, i) => {
        if (msg.role === 'user') {
            turns.push({ id: String(msg.id ?? `u-${i}`), type: 'user', text: msg.content || '', messages: [msg] });
            return;
        }
        if (msg.role !== 'assistant') { pending.push(msg); return; }

        if (hasProse(msg)) {
            turns.push({
                id: String(msg.id ?? `a-${i}`),
                type: 'ai',
                text: msg.content || '',
                messages: [...pending, msg],
            });
            pending = [];
        } else {
            pending.push(msg);
        }
    });

    if (pending.length) {
        turns.push({
            id: String(pending[0].id ?? `a-${messages.length}`),
            type: 'ai',
            text: '',
            messages: pending,
            inProgress: true,
        });
    }

    return turns;
}

/** Count the activity inside a turn (for the compact chip in the transcript). */
export function turnActivityStats(turn) {
    let steps = 0, charts = 0, queries = 0, hasReasoning = false;
    for (const m of turn?.messages || []) {
        if (m.content && THINK_RE.test(m.content)) hasReasoning = true;
        THINK_RE.lastIndex = 0; // reset because of the /g flag
        for (const tc of m.toolCalls || []) {
            steps++;
            if (tc.toolName === 'display_chart') charts++;
            else if (tc.toolName === 'execute_sql') queries++;
        }
    }
    return { steps, charts, queries, hasReasoning };
}
