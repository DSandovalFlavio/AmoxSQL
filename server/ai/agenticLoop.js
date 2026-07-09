/**
 * AmoxSQL AI — Agentic Loop (Fase 1: Planner-Executor)
 *
 * Wraps streamText in an outer iteration loop that:
 *  1. Runs streamText with planner tools (create_plan, update_plan, final_answer, ask_user)
 *  2. Forwards all stream events to the caller as SSE-compatible objects
 *  3. Detects termination signals: final_answer (done) and ask_user (paused)
 *  4. Injects plan status into continuation messages for the next iteration
 *  5. Repeats until final_answer, ask_user, or maxIterations reached
 *
 * Returns an async generator that yields SSE-event objects. The caller
 * (server/index.js) serialises each event and writes it to the SSE stream.
 */

'use strict';

const { streamText } = require('ai');
const { createTools } = require('./tools');
const { buildSystemPrompt, buildSystemParts } = require('./systemPrompt');
const { loadUserRules } = require('./userRules');
const { compactContext, needsCompaction } = require('./compaction');
const { loadMemoriesText, extractMemories } = require('./memory');
const { getSkill } = require('./skills');
const { getModelProfile } = require('./modelProfiles');
const { loadProjectContext, buildProjectContextSection } = require('./contextLoader');
const { verifyFindings } = require('./findingsLinter');

// Absolute hard ceiling — the working budget (effectiveMaxIterations) plus the
// reserved wrap-up turn never exceeds this.
const MAX_LOOP_ITERATIONS = 50;
// Default working budget before a plan sizes it (conversational / no-plan turns
// end early via the decision tree, so this only bounds runaway plan-less loops).
const DEFAULT_LOOP_ITERATIONS = 25;
// One iteration is held back as a guaranteed synthesis turn: when the working
// budget is exhausted without final_answer, the model gets one last forced turn
// to synthesize what it found instead of being cut off mid-analysis.
const WRAP_UP_RESERVE = 1;
// Per-iteration tool steps
const ITER_MAX_STEPS = 10;
// Max times we retry an iteration that produced no tool calls (idle recovery)
const MAX_IDLE_RETRIES = 2;
// Max times we inject a SQL correction directive before giving up
const MAX_SQL_CORRECTION_RETRIES = 3;
// If a single iteration's stream produces no event for this long, treat it as a
// stalled model (e.g. a frozen provider stream) and abort that iteration so the
// loop can recover instead of hanging forever.
const ITER_STALL_TIMEOUT_MS = 90_000;
// Max consecutive stalled iterations before giving up on the analysis
const MAX_STALL_RETRIES = 2;

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Strip <think>…</think> reasoning (and any unclosed trailing one) — mirrors the
 *  client's deepDiveTurns.stripThink so server-side prose measurements match what
 *  the user actually sees. */
function stripThinkText(s = '') {
    return String(s || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/i, '');
}

/**
 * Builds a SQL correction directive when execute_sql returned an error.
 * Injected as a forced-retry user message so the LLM fixes the query immediately.
 */
function buildSqlCorrectionPrompt(sqlErrors) {
    const lastError = sqlErrors[sqlErrors.length - 1];
    const errorBlock = sqlErrors.map((e, i) =>
        `Error ${i + 1}:\n  SQL: ${e.query.substring(0, 300)}\n  Error: ${e.error}\n  Hint: ${e.hint || 'Check table and column names.'}`
    ).join('\n\n');

    return `[SQL CORRECTION REQUIRED]

Your previous execute_sql call(s) failed. You MUST fix and retry the query before doing anything else.

${errorBlock}

Steps to fix:
1. Call \`list_tables\` or \`describe_table\` to verify exact table/column names if unsure.
2. Fix the SQL — correct identifiers, syntax, or join conditions.
3. Call \`execute_sql\` with the corrected query.
4. Do NOT call final_answer or give up — fix the query now.`;
}

/**
 * Builds a concise plan-continuation message injected as the "user" turn
 * at the start of each new iteration. Gives the LLM a clear picture of
 * what's done and what's left.
 */
function buildContinuationPrompt(activePlan, iteration, maxIter) {
    if (!activePlan.id || !activePlan.steps?.length) return '';

    const lines = activePlan.steps.map(step => {
        const icon =
            step.status === 'done'    ? '✓' :
            step.status === 'failed'  ? '✗' :
            step.status === 'skipped' ? '⊘' : '○';
        const note = step.note ? ` (${step.note})` : '';
        return `  ${icon} ${step.id}: ${step.description}${note}`;
    });

    const pending  = activePlan.steps.filter(s => s.status === 'pending');
    const nextStep = pending[0];
    const directive = pending.length > 0
        ? `The plan already exists — do NOT call create_plan again. Continue with step "${nextStep.id}: ${nextStep.description}": mark it \`update_plan(..., "in_progress")\`, do the work (re-run any queries you need — results from earlier turns are not cached), then \`update_plan(..., "done")\`.`
        : 'All steps are done. Call `final_answer` with your summary now.';

    // Graduated budget awareness: tell the model where it stands, and escalate
    // as the ceiling approaches so it converges instead of running out cold.
    const itersLeft = Math.max(0, maxIter - iteration);
    const budgetLine = `Iteration ${iteration}/${maxIter} — ${itersLeft} left.`;
    let urgency = '';
    if (itersLeft <= 3) {
        urgency = `\n\n⚡ **URGENT: Only ${itersLeft} iteration(s) left. Skip any remaining optional steps and call \`final_answer\` NOW with the results you already have.**`;
    } else if (itersLeft <= Math.ceil(maxIter * 0.25)) {
        urgency = `\n\n⏳ **You are in the last quarter of your budget (${itersLeft} iterations left). Prioritize the essential remaining steps and prepare to wrap up soon.**`;
    } else if (itersLeft <= Math.ceil(maxIter * 0.5)) {
        urgency = `\n\n⏱️ **Half your iteration budget is used (${itersLeft} left). Keep steps focused — one iteration should complete one plan step.**`;
    }

    return `[AGENT LOOP — Continue execution]
Goal: ${activePlan.goal}
${budgetLine}

Plan status:
${lines.join('\n')}

${directive}${urgency}`;
}

/**
 * Builds the forced-synthesis directive for the reserved wrap-up turn. The
 * working budget is spent; this is the model's last turn, so it must finalize
 * rather than start new work.
 */
function buildWrapUpPrompt(activePlan) {
    const unfinished = (activePlan.steps || []).filter(
        s => s.status === 'pending' || s.status === 'in_progress' || s.status === 'running'
    );
    const list = unfinished.length
        ? unfinished.map(s => `  ○ ${s.id}: ${s.description}`).join('\n')
        : '  (all steps finished)';

    return `[FINAL TURN — iteration budget exhausted]
This is your LAST turn. You have no iterations left to run more queries.

You MUST now:
1. Briefly synthesize what you found across the completed steps (2-4 sentences of prose).
2. Call \`final_answer\` with tldr + findings, and list any step you could not finish under \`caveats\`.

Steps still unfinished (mention them in caveats):
${list}

Do NOT call create_plan, execute_sql, describe_table, or any other tool. Synthesize what you already have and call final_answer NOW.`;
}

/**
 * Server-side fallback synthesis: used only when even the wrap-up turn produced
 * no prose and no final_answer. Guarantees the chat is never left empty. Built
 * from the plan goal and per-step notes the agent recorded via update_plan.
 */
function buildFallbackSummary(activePlan) {
    if (!activePlan?.id) return '';
    const done = (activePlan.steps || []).filter(s => s.status === 'done');
    const notes = done.filter(s => s.note).map(s => `- ${s.description}: ${s.note}`);
    const pending = (activePlan.steps || []).filter(
        s => s.status === 'pending' || s.status === 'in_progress' || s.status === 'interrupted'
    );

    let out = `**Análisis parcial** — se alcanzó el límite de iteraciones antes de terminar.\n\n`;
    if (activePlan.goal) out += `Objetivo: ${activePlan.goal}\n\n`;
    if (notes.length)   out += `Lo que alcancé a completar:\n${notes.join('\n')}\n\n`;
    if (pending.length) out += `Quedó pendiente: ${pending.map(s => s.description).join('; ')}.\n\n`;
    out += `Pulsa **Continuar** para que termine el análisis.`;
    return out;
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Agentic streaming loop for Data Diving mode.
 *
 * @param {object} options        - Same shape as AiManager.streamChat options
 * @param {Function} getModelFn   - AiManager.getModel bound to the instance
 * @returns {AsyncGenerator}      - Yields SSE-event objects
 */
async function* agenticLoop(options, getModelFn) {
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
        referencedArtifacts = [],
        activeSkillId = null,
        filePath = null,
        fileType = null,
        conversationId = null,
        maxIterations = DEFAULT_LOOP_ITERATIONS,
        planStepOverrides = [],
        continueMode = false,
    } = options;

    const provider = providerOverride;
    const model    = modelOverride;
    const projectPath = process.cwd();
    const aiPersistence = require('./persistence');

    // ── Load shared context once ──
    const [userRules, memories, activeSkill, projectCtx] = await Promise.all([
        loadUserRules(projectPath),
        loadMemoriesText(dbManager),
        activeSkillId ? getSkill(projectPath, activeSkillId) : Promise.resolve(null),
        loadProjectContext(projectPath).catch(() => null),
    ]);

    const profile = getModelProfile(model, provider);

    const promptOptions = {
        tables, files, mode,
        userRules, memories,
        currentQuery, currentResult, currentChartConfig,
        referencedArtifacts,
        activeSkill, modelProfile: profile,
        filePath, fileType,
        enablePlanner: mode === 'diving',
        projectCtx,
    };

    // For Anthropic: split into static (cached) + dynamic blocks.
    // For all others: single string system prompt.
    const useStructuredSystem = provider === 'anthropic';
    let systemPrompt = null;
    let systemParts  = null;
    if (useStructuredSystem) {
        systemParts = buildSystemParts(promptOptions);
    } else {
        systemPrompt = buildSystemPrompt(promptOptions);
    }

    const llmModel = getModelFn(provider, model);

    // ── Shared state across iterations ──
    const queryResults = new Map();
    
    // Reconstruct active plan from previous messages if the loop is resuming
    const activePlan = { id: null, goal: '', steps: [] };
    for (const msg of messages) {
        if (msg.role !== 'assistant') continue;
        const toolCalls = msg.toolInvocations || msg.tool_calls || [];
        for (const tc of toolCalls) {
            const toolName = tc.toolName || tc.function?.name;
            const args = tc.args || tc.function?.arguments;
            if (!args) continue;
            
            let parsedArgs = args;
            if (typeof args === 'string') {
                try { parsedArgs = JSON.parse(args); } catch(e) {}
            }
            
            if (toolName === 'create_plan') {
                activePlan.id = parsedArgs.plan_id;
                activePlan.goal = parsedArgs.goal;
                activePlan.steps = (parsedArgs.steps || []).map(s => ({
                    id: s.step_id,
                    description: s.description,
                    status: s.status || 'pending',
                    note: null
                }));
            } else if (toolName === 'update_plan' && activePlan.id) {
                const step = activePlan.steps.find(s => s.id === parsedArgs.step_id);
                if (step) {
                    step.status = parsedArgs.status;
                    step.note = parsedArgs.note || null;
                }
            } else if (toolName === 'final_answer') {
                activePlan.id = null;
                activePlan.goal = '';
                activePlan.steps = [];
            }
        }
    }

    // The client sends content-only messages, so the reconstruction above finds no
    // tool calls on a continuation. Rehydrate the live plan from persistence so the
    // agent resumes with full plan context (pending steps, statuses) instead of
    // re-planning or stalling.
    if (continueMode && !activePlan.id && conversationId) {
        try {
            const saved = await aiPersistence.getActivePlan(dbManager, conversationId);
            if (saved && Array.isArray(saved.steps) && saved.steps.length) {
                activePlan.id = saved.id;
                activePlan.goal = saved.goal || '';
                activePlan.steps = saved.steps.map(s => ({
                    id: s.id, description: s.description,
                    status: s.status || 'pending', note: s.note || null,
                }));
            }
        } catch { /* plan rehydration is best-effort */ }
    }

    // On a continuation, inject the (rehydrated) plan status into the first iteration
    // so the agent resumes immediately instead of relying on content-only history.
    let iterMessages = messages;
    if (continueMode && activePlan.id) {
        const resumePrompt = buildContinuationPrompt(activePlan, 0, maxIterations);
        if (resumePrompt) iterMessages = [...messages, { role: 'user', content: resumePrompt }];
    }
    let iteration               = 0;
    let loopDone                = false;
    // Working iteration budget. Starts at the requested/default budget and is
    // resized to the plan's dynamic budget when create_plan runs (see the
    // create_plan handler below). Always kept under MAX_LOOP_ITERATIONS minus the
    // reserved wrap-up turn, so working + wrap-up never exceeds the hard ceiling.
    let effectiveMaxIterations  = Math.min(MAX_LOOP_ITERATIONS - WRAP_UP_RESERVE, maxIterations);
    let idleRetries          = 0;   // consecutive iterations with zero tool calls
    let sqlCorrectionRetries = 0;   // consecutive iterations that ended with unresolved SQL errors
    let stallRetries         = 0;   // consecutive iterations aborted by the stall watchdog
    let anyIterationHadText  = false; // tracks if any prior iter produced text (for fallback message)
    let fullRunText          = '';    // all narrated text across the run (for the prose-first safety net)
    let totalUsage           = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    console.log(`[AgenticLoop] Starting | Provider: ${provider} | Model: ${model} | maxIter: ${maxIterations}`);

    // The loop runs the working budget PLUS one reserved wrap-up turn.
    while (iteration < effectiveMaxIterations + WRAP_UP_RESERVE && !loopDone) {
        iteration++;
        // The reserved final turn: working budget spent, plan still unfinished.
        // Force a synthesis instead of running more work.
        const isWrapUp = iteration > effectiveMaxIterations && !!activePlan.id;
        if (isWrapUp) {
            console.log(`[AgenticLoop] Wrap-up turn — forcing synthesis (plan ${activePlan.id})`);
            iterMessages = [...iterMessages, { role: 'user', content: buildWrapUpPrompt(activePlan) }];
        }
        console.log(`[AgenticLoop] Iteration ${iteration}/${effectiveMaxIterations}${isWrapUp ? ' (wrap-up)' : ''} | Plan: ${activePlan.id || 'none'}`);

        // Report iteration capped at the working budget so the UI never shows "26/25".
        yield {
            type: 'step-start',
            iteration: Math.min(iteration, effectiveMaxIterations),
            maxIterations: effectiveMaxIterations,
            wrapUp: isWrapUp,
        };

        // ── Compact before each iteration ──
        // Compaction can involve a full LLM summarization call that emits no
        // stream events; warn the client first so the UI knows we're alive.
        // (Unknown event types are ignored by older clients.)
        if (needsCompaction(iterMessages, model)) {
            yield { type: 'status', phase: 'compacting' };
        }
        const compactedMessages = await compactContext(llmModel, iterMessages, null, model);

        // ── Build tools with shared state ──
        const tools = createTools({
            dbManager, queryResults, projectPath, mode,
            conversationId, aiPersistence,
            activePlan, enablePlanner: mode === 'diving',
        });

        const iterStart = Date.now();
        let iterHasFinalAnswer = false;
        let iterHasAskUser     = false;
        let iterText           = '';
        let iterToolResults    = [];
        let iterSqlErrors      = [];  // execute_sql errors this iteration (for correction loop)
        let iterSqlSuccesses   = 0;   // successful execute_sql calls this iteration
        let iterResult         = null;   // holds the streamText handle for response.messages

        // Stall watchdog (declared out here so the catch block can inspect it):
        // abort this iteration if the provider stream goes silent for too long.
        const iterAbort = new AbortController();
        let iterStalled = false;
        let stallTimer  = null;
        const armStall = () => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => { iterStalled = true; try { iterAbort.abort(); } catch { /* noop */ } }, ITER_STALL_TIMEOUT_MS);
        };

        try {
            // Build system argument: array of content blocks for Anthropic (enables
            // prompt caching on the stable static section), plain string for others.
            const systemArg = useStructuredSystem
                ? [
                    {
                        type: 'text',
                        text: systemParts.static,
                        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
                    },
                    { type: 'text', text: systemParts.dynamic },
                  ]
                : systemPrompt;

            const result = iterResult = streamText({
                model:       llmModel,
                system:      systemArg,
                messages:    compactedMessages,
                tools:       profile.supportsToolCalling ? tools : undefined,
                maxSteps:    Math.min(profile.maxSteps, ITER_MAX_STEPS),
                maxTokens:   profile.maxTokens,
                abortSignal: iterAbort.signal,
            });

            armStall();
            for await (const part of result.fullStream) {
                armStall(); // reset the silence timer on every event

                if (part.type === 'text-delta') {
                    const textChunk = part.textDelta ?? part.text ?? '';
                    iterText += textChunk;
                    fullRunText += textChunk;
                    yield { type: 'text-delta', text: textChunk };

                } else if (part.type === 'tool-call') {
                    const args = part.input ?? part.args ?? {};
                    yield { type: 'tool-call', toolName: part.toolName, args, toolCallId: part.toolCallId };

                } else if (part.type === 'tool-result') {
                    const toolResult = part.output ?? part.result ?? {};
                    const toolArgs   = part.input  ?? part.args  ?? {};
                    iterToolResults.push({ toolName: part.toolName, toolCallId: part.toolCallId, result: toolResult });

                    // ── Track execute_sql errors for self-correction loop ──
                    if (part.toolName === 'execute_sql') {
                        if (toolResult.error) {
                            iterSqlErrors.push({
                                query: toolArgs.query || '',
                                error: toolResult.error,
                                hint:  toolResult.hint || null,
                            });
                        } else {
                            // Successful query after errors resets the error window
                            iterSqlSuccesses++;
                            iterSqlErrors = [];
                        }
                    }

                    // ── Detect planner signal tools ──
                    if (part.toolName === 'create_plan') {
                        // Apply any user step overrides (steps the user marked to skip before this turn)
                        if (planStepOverrides.length > 0) {
                            // Normalize: overrides can be strings or { stepId } objects
                            const overrideSet = new Set(
                                planStepOverrides.map(o => (typeof o === 'string' ? o : o?.stepId)).filter(Boolean)
                            );
                            for (const step of activePlan.steps) {
                                if (overrideSet.has(step.id) && step.status === 'pending') {
                                    step.status = 'skipped';
                                    step.note   = 'Skipped by user before execution';
                                }
                            }
                        }
                        // Resize the working budget to the plan's dynamic budget
                        // (~5 iters/step, clamped [25,50]), capped under the hard
                        // ceiling so the reserved wrap-up turn always fits.
                        if (activePlan.dynamicMaxIterations) {
                            const scaled = Math.min(
                                MAX_LOOP_ITERATIONS - WRAP_UP_RESERVE,
                                activePlan.dynamicMaxIterations,
                            );
                            if (scaled !== effectiveMaxIterations) {
                                console.log(`[AgenticLoop] Plan budget: ${effectiveMaxIterations} → ${scaled} (${activePlan.steps.length} steps)`);
                                effectiveMaxIterations = scaled;
                            }
                        }
                        yield {
                            type:  'plan-created',
                            plan:  toolResult,            // { planId, goal, steps[] }
                        };
                    } else if (part.toolName === 'update_plan') {
                        yield {
                            type:           'plan-progress',
                            stepId:         toolArgs.step_id,
                            status:         toolArgs.status,
                            note:           toolArgs.note || null,
                            steps:          activePlan.steps,  // full snapshot with updated statuses
                            remainingSteps: toolResult.remaining_steps,
                        };
                    } else if (part.toolName === 'final_answer') {
                        iterHasFinalAnswer = true;
                        loopDone = true;

                        // Verify that numeric findings are backed by real query results.
                        // Appends an automatic caveat for any unverified numbers (non-blocking).
                        if (toolResult.findings?.length) {
                            const { caveat } = verifyFindings(toolResult.findings, queryResults);
                            if (caveat) {
                                toolResult.caveats = [
                                    ...(toolResult.caveats || []),
                                    caveat,
                                ];
                            }
                        }

                        // Structured output (tldr + findings) is rendered by NarrativeCard in the UI.
                        // Normally we suppress streaming the summary to avoid duplicating the card.
                        // BUT if the model barely narrated across the whole run (prose-first
                        // contract broken), the chat reply would be an empty shell + a card —
                        // so we surface the recap as prose too. (Whole-run text, think stripped.)
                        const hasStructuredOutput = !!(toolResult.tldr || toolResult.findings?.length);
                        const visibleProse = stripThinkText(fullRunText).trim();
                        const proseThin = visibleProse.length < 220;
                        const modelAlreadyWroteSummary = iterText.trim().length > 80;
                        if (!hasStructuredOutput && toolResult.summary && !modelAlreadyWroteSummary) {
                            // Legacy: stream summary as text when no structured fields
                            const summaryText = toolResult.summary +
                                (toolResult.followup_questions?.length
                                    ? '\n\n**Preguntas de seguimiento:**\n' +
                                      toolResult.followup_questions.map(q => `- ${q}`).join('\n')
                                    : '');
                            yield { type: 'text-delta', text: summaryText };
                            iterText += summaryText;
                        } else if (!hasStructuredOutput && modelAlreadyWroteSummary && toolResult.followup_questions?.length) {
                            // Legacy: model wrote text, only append follow-ups if not already present
                            const followupsBlock = '\n\n**Preguntas de seguimiento:**\n' +
                                toolResult.followup_questions.map(q => `- ${q}`).join('\n');
                            if (!iterText.includes('Preguntas de seguimiento')) {
                                yield { type: 'text-delta', text: followupsBlock };
                                iterText += followupsBlock;
                            }
                        } else if (hasStructuredOutput && proseThin && toolResult.summary) {
                            // Safety net: the model dumped into the card without narrating.
                            // Surface the recap as prose so the reply isn't just a bare card.
                            yield { type: 'text-delta', text: (visibleProse ? '\n\n' : '') + toolResult.summary };
                            iterText += toolResult.summary;
                        }
                        // Structured (rich prose case): NarrativeCard handles tldr/findings/followups visually
                        yield {
                            type:     'plan-completed',
                            summary:  toolResult.summary,
                            followups: toolResult.followup_questions || [],
                            planId:   toolResult.plan_id,
                        };
                    } else if (part.toolName === 'ask_user') {
                        iterHasAskUser = true;
                        loopDone = true;
                        yield {
                            type:     'ask-user',
                            question: toolResult.question,
                            options:  toolResult.options || [],
                            context:  toolResult.context || '',
                        };
                    }

                    yield {
                        type: 'tool-result',
                        toolName:   part.toolName,
                        toolCallId: part.toolCallId,
                        result:     toolResult,
                        args:       toolArgs,
                    };

                } else if (part.type === 'tool-error') {
                    const errMsg = part.error?.message || String(part.error || 'Tool error');
                    const toolArgs = part.input ?? part.args ?? {};
                    console.error(`[AgenticLoop] Tool error: ${part.toolName}: ${errMsg}`);
                    yield {
                        type:       'tool-result',
                        toolName:   part.toolName,
                        toolCallId: part.toolCallId,
                        result:     { error: errMsg },
                        args:       toolArgs,
                    };

                } else if (part.type === 'step-finish') {
                    yield { type: 'step-finish' };

                } else if (part.type === 'finish') {
                    const iterMs = Date.now() - iterStart;
                    // Accumulate token usage across iterations
                    if (part.usage) {
                        totalUsage.promptTokens     += part.usage.promptTokens     || 0;
                        totalUsage.completionTokens += part.usage.completionTokens || 0;
                        totalUsage.totalTokens      += part.usage.totalTokens      || 0;
                    }

                    yield { type: 'step-end', iteration, latencyMs: iterMs };

                    // Persist metrics for this iteration (fire-and-forget)
                    if (conversationId) {
                        aiPersistence.saveMetrics(dbManager, {
                            conversationId,
                            turnIdx:           iteration,
                            promptTokens:      part.usage?.promptTokens     || 0,
                            completionTokens:  part.usage?.completionTokens || 0,
                            toolCalls:         iterToolResults.map(t => t.toolName),
                            latencyMs:         iterMs,
                        }).catch(() => {});
                    }

                } else if (part.type === 'error') {
                    const errMsg = part.error?.message || String(part.error);
                    yield { type: 'error', error: errMsg };
                    loopDone = true;
                }
            }
            if (stallTimer) clearTimeout(stallTimer);

        } catch (err) {
            if (stallTimer) clearTimeout(stallTimer);

            // Stall watchdog fired: the iteration was aborted because the model
            // stream went silent. Recover instead of killing the whole analysis.
            if (iterStalled) {
                console.warn(`[AgenticLoop] Iteration ${iteration} stalled (no stream activity for ${ITER_STALL_TIMEOUT_MS}ms) — aborting iteration`);
                yield { type: 'step-end', iteration, latencyMs: Date.now() - iterStart };
                stallRetries++;
                if (stallRetries <= MAX_STALL_RETRIES && activePlan.id) {
                    const resume = buildContinuationPrompt(activePlan, iteration, effectiveMaxIterations);
                    iterMessages = [
                        ...compactedMessages,
                        { role: 'user', content: '[The previous step stalled and was interrupted before finishing. Resume from where the plan stands — do NOT call create_plan again.]\n\n' + resume },
                    ];
                    continue; // retry the loop
                }
                // Out of stall retries — stop cleanly so the UI isn't left spinning.
                if (!anyIterationHadText) {
                    yield { type: 'text-delta', text: 'El modelo dejó de responder a mitad del análisis. Intenta de nuevo o usa un modelo distinto.' };
                }
                loopDone = true;
                break;
            }

            console.error(`[AgenticLoop] Iteration ${iteration} error:`, err.message);
            yield { type: 'error', error: err.message || String(err) };
            loopDone = true;
            break;
        }

        // A clean (non-stalled) iteration resets the stall counter.
        stallRetries = 0;

        // ── Decide whether to continue ──
        if (!loopDone) {
            const hadToolProgress = iterToolResults.length > 0;
            const hadText         = iterText.trim().length > 0;
            if (hadText) anyIterationHadText = true;

            // ── SQL Self-Correction Loop ──
            // If this iteration ended with unresolved SQL errors (errors with no successful retry after),
            // inject a mandatory correction directive instead of the normal continuation.
            const hasUnresolvedSqlErrors = iterSqlErrors.length > 0 && iterSqlSuccesses === 0;
            if (hasUnresolvedSqlErrors && sqlCorrectionRetries < MAX_SQL_CORRECTION_RETRIES) {
                sqlCorrectionRetries++;
                console.log(`[AgenticLoop] SQL correction ${sqlCorrectionRetries}/${MAX_SQL_CORRECTION_RETRIES} — ${iterSqlErrors.length} unresolved error(s)`);
                yield {
                    type: 'sql-correction',
                    attempt: sqlCorrectionRetries,
                    errors: iterSqlErrors.map(e => ({ query: e.query.substring(0, 100), error: e.error })),
                };

                let iterResponseMessages = [];
                try {
                    const response = await iterResult.response;
                    if (Array.isArray(response?.messages) && response.messages.length > 0) {
                        iterResponseMessages = response.messages;
                    }
                } catch (_) {
                    iterResponseMessages = hadText ? [{ role: 'assistant', content: iterText }] : [];
                }

                iterMessages = [
                    ...compactedMessages,
                    ...iterResponseMessages,
                    { role: 'user', content: buildSqlCorrectionPrompt(iterSqlErrors) },
                ];
                continue; // Skip the rest of the decision tree — go straight to next iteration
            }
            // Reset correction counter once we have a clean iteration
            if (!hasUnresolvedSqlErrors) sqlCorrectionRetries = 0;

            if (hadToolProgress) {
                // ── Normal progress: tools were called ──
                idleRetries = 0;

                if (activePlan.id) {
                    // Fetch the full assistant + tool-result messages from this iteration
                    // so the next iteration sees what tools were already called.
                    let iterResponseMessages = [];
                    try {
                        const response = await iterResult.response;
                        if (Array.isArray(response?.messages) && response.messages.length > 0) {
                            iterResponseMessages = response.messages;
                        }
                    } catch (_) {
                        iterResponseMessages = [{ role: 'assistant', content: iterText || '...' }];
                    }

                    const continuationPrompt = buildContinuationPrompt(activePlan, iteration, effectiveMaxIterations);
                    iterMessages = [
                        ...compactedMessages,
                        ...iterResponseMessages,
                        { role: 'user', content: continuationPrompt },
                    ];
                } else {
                    // Tool calls without a plan — single-turn analysis, end loop.
                    loopDone = true;
                }

            } else if (!activePlan.id && hadText) {
                // ── Conversational response: text with no tools and no active plan ──
                // This is a valid response (greeting, explanation, etc.) — don't retry.
                loopDone = true;

            } else if (idleRetries < MAX_IDLE_RETRIES) {
                // ── Idle recovery: no tool calls this iteration ──
                idleRetries++;
                console.log(`[AgenticLoop] Idle iter ${iteration} (retry ${idleRetries}/${MAX_IDLE_RETRIES}) — forcing tools`);

                const directive = activePlan.id
                    ? buildContinuationPrompt(activePlan, iteration, effectiveMaxIterations) +
                      '\n\n⚡ **You MUST call at least one tool right now.** Do not respond with text only.'
                    : 'You MUST use tools to complete this task. Call `create_plan` immediately to start, then execute each step. Do NOT just describe what you will do — act now.';

                // Preserve any text the model generated so it is not lost from the stream
                const priorAssistant = hadText
                    ? [{ role: 'assistant', content: iterText }]
                    : [];

                iterMessages = [
                    ...compactedMessages,
                    ...priorAssistant,
                    { role: 'user', content: directive },
                ];

            } else {
                // ── Too many idle retries — give up ──
                // Only emit error message if no text was generated in any iteration
                if (!anyIterationHadText) {
                    yield { type: 'text-delta', text: 'Lo siento, no pude iniciar el análisis. Por favor intenta de nuevo con una pregunta más específica.' };
                }
                loopDone = true;
            }
        }
    }

    // Budget (including the reserved wrap-up turn) exhausted without final_answer —
    // close out truthfully and pause so the user can continue.
    if (!loopDone && iteration >= effectiveMaxIterations) {
        // Re-status the steps the agent left open so the plan panel stops lying:
        // an in_progress/running step at this point was interrupted, not running.
        let snapshotChanged = false;
        for (const step of activePlan.steps || []) {
            if (step.status === 'in_progress' || step.status === 'running') {
                step.status = 'interrupted';
                step.note = step.note || 'Interrumpido — se agotaron las iteraciones';
                snapshotChanged = true;
            }
        }
        if (snapshotChanged && activePlan.steps) {
            // Emit a final truthful snapshot so the client updates step icons.
            yield { type: 'plan-progress', steps: activePlan.steps };
        }

        // Guarantee a synthesis: if not even the wrap-up turn produced prose,
        // emit a concise server-built summary so the chat is never left empty.
        if (!anyIterationHadText) {
            const fallback = buildFallbackSummary(activePlan);
            if (fallback) yield { type: 'text-delta', text: fallback };
        }

        const pendingCount = activePlan.steps?.filter(
            s => s.status === 'pending' || s.status === 'interrupted'
        ).length || 0;
        yield {
            type: 'ask-continue',
            planGoal:      activePlan.goal || '',
            pendingSteps:  pendingCount,
            completedSteps: activePlan.steps?.filter(s => s.status === 'done').length || 0,
            planId:        activePlan.id || null,
        };
        // Persist plan as paused so the status is visible in future loads
        if (conversationId && activePlan.id) {
            aiPersistence.updatePlan(dbManager, activePlan.id, {
                status: 'paused', steps: activePlan.steps,
            }).catch(() => {});
        }
    }

    // Background memory extraction
    if (profile.supportsMemory) {
        const llm = llmModel;
        extractMemories(llm, messages, dbManager).catch(e =>
            console.error('[AgenticLoop] Memory extraction error:', e)
        );
    }

    // Final finish event with accumulated usage. Query results are deliberately
    // NOT included: they can be arbitrarily large (freezes both event loops
    // serializing/parsing one giant SSE line) and the client never consumed
    // them — rows are rehydrated on demand via /api/ai/query-cache/:queryId.
    yield {
        type:  'finish',
        usage: totalUsage,
    };
}

module.exports = { agenticLoop };
