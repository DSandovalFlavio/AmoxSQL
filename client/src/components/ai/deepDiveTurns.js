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
const OPEN_THINK_RE = /<think>[\s\S]*$/i; // unclosed (streaming / malformed) reasoning tail

/** Remove <think>…</think> reasoning blocks (and any unclosed trailing one) from a body. */
export function stripThink(s = '') {
    return String(s || '').replace(THINK_RE, '').replace(OPEN_THINK_RE, '');
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

/** Extract reasoning chunks (<think>…</think>) from a message body, in order. */
export function extractReasoning(content = '') {
    const out = [];
    const re = /<think>([\s\S]*?)<\/think>/gi;
    let m;
    while ((m = re.exec(String(content || '')))) {
        const t = (m[1] || '').trim();
        if (t) out.push(t);
    }
    return out;
}

/**
 * Flatten a turn into an ordered activity timeline that preserves the real
 * execution cycle (reason → update_plan → query → reason → chart → …), instead
 * of grouping by tool type. Per message: its reasoning first, then its tool
 * calls in call order.
 * @returns {Array<{kind:'reasoning', content} | {kind:'tool', tc, loading}>}
 */
export function buildTimeline(turn, { live = false } = {}) {
    const items = [];
    for (const msg of turn?.messages || []) {
        for (const r of extractReasoning(msg.content)) items.push({ kind: 'reasoning', content: r });
        for (const tc of msg.toolCalls || []) {
            items.push({ kind: 'tool', tc, loading: live && !tc.result });
        }
    }
    return items;
}

/** All reasoning chunks across a turn (shown collapsed; can't be mapped to steps). */
export function turnReasoning(turn) {
    const out = [];
    for (const m of turn?.messages || []) out.push(...extractReasoning(m.content));
    return out;
}

const PLAN_TOOLS = new Set(['create_plan', 'update_plan']);
// Not "work" — these belong in the chat thread, not the step inspector.
const NON_ACTIVITY_TOOLS = new Set(['final_answer', 'suggest_followups']);

/** The final_answer result for a turn (rendered as the narrative card in the chat). */
export function turnFinalAnswer(turn) {
    for (const m of turn?.messages || []) {
        for (const tc of m.toolCalls || []) {
            if (tc.toolName === 'final_answer' && tc.result) return tc.result;
        }
    }
    return null;
}

/**
 * Group a turn's activity by AGENT-PLAN STEP, following the real execution flow
 * instead of bundling by tool type.
 *
 * Walks the tool calls in order; `create_plan` opens a "Plan" section and each
 * `update_plan` (a step transition) opens/labels a step section. Real work tools
 * (execute_sql, display_chart, profile_data, …) attach, in order, to the current
 * step. Returns sections [{ key, stepId, label, status, tools[] }].
 */
export function buildStepGroups(turn) {
    const toolStream = [];
    for (const m of turn?.messages || []) for (const tc of m.toolCalls || []) toolStream.push(tc);

    // step id -> description, from create_plan
    const planDesc = {};
    for (const tc of toolStream) {
        if (tc.toolName === 'create_plan') {
            for (const s of tc.args?.steps || tc.result?.steps || []) planDesc[s.id] = s.description;
        }
    }

    const sections = [];
    let current = null;
    const open = (key, label, stepId) => { current = { key, label, stepId, status: null, tools: [] }; sections.push(current); };

    toolStream.forEach((tc, i) => {
        if (tc.toolName === 'create_plan') {
            open('plan', 'Plan', null);
            const n = (tc.args?.steps || []).length;
            current.note = n ? `${n}-step plan created` : 'Plan created';
            return;
        }
        if (tc.toolName === 'update_plan') {
            const sid = tc.args?.step_id;
            const status = tc.args?.status;
            // Start a new section when a step begins, or when the step id changes.
            if (status === 'in_progress' || !current || current.stepId !== sid) {
                const label = sid ? (planDesc[sid] ? `${sid} · ${planDesc[sid]}` : sid) : 'Step';
                open(sid || `u-${i}`, label, sid || null);
            }
            current.status = status || current.status;
            // The note on a closing update_plan is the step's conclusion / what it learned.
            if (tc.args?.note) current.insight = tc.args.note;
            return;
        }
        if (NON_ACTIVITY_TOOLS.has(tc.toolName)) return; // final_answer / followups → chat thread
        if (!current) open('setup', 'Setup', null);
        current.tools.push(tc);
    });

    // Keep sections that did real work, carry a conclusion, or are the plan header.
    return sections.filter(s => s.tools.length > 0 || s.insight || s.note);
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
