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
const { buildSystemPrompt } = require('./systemPrompt');
const { loadUserRules } = require('./userRules');
const { compactContext } = require('./compaction');
const { loadMemoriesText, extractMemories } = require('./memory');
const { getSkill } = require('./skills');
const { getModelProfile } = require('./modelProfiles');
const { getFlockStatus, getModels, getPrompts } = require('../flockManager');

const MAX_LOOP_ITERATIONS = 15;
// Per-iteration maxSteps: high enough that most plans finish in 1-2 outer iterations.
const ITER_MAX_STEPS = 15;
// Max times we retry an iteration that produced no tool calls (idle recovery)
const MAX_IDLE_RETRIES = 2;

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a concise plan-continuation message injected as the "user" turn
 * at the start of each new iteration. Gives the LLM a clear picture of
 * what's done and what's left.
 */
function buildContinuationPrompt(activePlan, iteration, maxIterations) {
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
        ? `Continue with step "${nextStep.id}: ${nextStep.description}". Call \`update_plan\` after it finishes.`
        : 'All steps are done. Call `final_answer` with your summary now.';

    // Add urgency when approaching the iteration limit
    const itersLeft = maxIterations - iteration;
    const urgency = itersLeft <= 3
        ? `\n\n⚡ **URGENT: Only ${itersLeft} iteration(s) left. Skip any remaining optional steps and call \`final_answer\` NOW with the results you already have.**`
        : '';

    return `[AGENT LOOP — Continue execution]
Goal: ${activePlan.goal}

Plan status:
${lines.join('\n')}

${directive}${urgency}`;
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
        activeSkillId = null,
        filePath = null,
        fileType = null,
        conversationId = null,
        maxIterations = MAX_LOOP_ITERATIONS,
    } = options;

    const provider = providerOverride;
    const model    = modelOverride;
    const projectPath = process.cwd();
    const aiPersistence = require('./persistence');

    // ── Load shared context once ──
    const [userRules, memories, activeSkill, flockStatus] = await Promise.all([
        loadUserRules(projectPath),
        loadMemoriesText(dbManager),
        activeSkillId ? getSkill(projectPath, activeSkillId) : Promise.resolve(null),
        getFlockStatus(dbManager).catch(() => ({ loaded: false })),
    ]);

    // Build Flock context for the system prompt (only if loaded)
    let flockContext = null;
    if (flockStatus.loaded) {
        const [flockModels, flockPrompts] = await Promise.all([
            getModels(dbManager).catch(() => []),
            getPrompts(dbManager).catch(() => []),
        ]);
        flockContext = { loaded: true, models: flockModels, prompts: flockPrompts };
    }

    const profile = getModelProfile(model, provider);

    const systemPrompt = buildSystemPrompt({
        tables, files, mode,
        userRules, memories,
        currentQuery, currentResult, currentChartConfig,
        activeSkill, modelProfile: profile,
        filePath, fileType,
        enablePlanner: true,
        flockContext,
    });

    const llmModel = getModelFn(provider, model);

    // ── Shared state across iterations ──
    const queryResults = new Map();
    const activePlan   = { id: null, goal: '', steps: [] };

    let iterMessages         = messages;
    let iteration            = 0;
    let loopDone             = false;
    let idleRetries          = 0;   // consecutive iterations with zero tool calls
    let anyIterationHadText  = false; // tracks if any prior iter produced text (for fallback message)
    let totalUsage           = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    console.log(`[AgenticLoop] Starting | Provider: ${provider} | Model: ${model} | maxIter: ${maxIterations}`);

    while (iteration < maxIterations && !loopDone) {
        iteration++;
        console.log(`[AgenticLoop] Iteration ${iteration}/${maxIterations} | Plan: ${activePlan.id || 'none'}`);

        yield { type: 'step-start', iteration, maxIterations };

        // ── Compact before each iteration ──
        const compactedMessages = await compactContext(llmModel, iterMessages, null, model);

        // ── Build tools with shared state ──
        const tools = createTools({
            dbManager, queryResults, projectPath, mode,
            conversationId, aiPersistence,
            activePlan, enablePlanner: true,
        });

        const iterStart = Date.now();
        let iterHasFinalAnswer = false;
        let iterHasAskUser     = false;
        let iterText           = '';
        let iterToolResults    = [];
        let iterResult         = null;   // holds the streamText handle for response.messages

        try {
            const result = iterResult = streamText({
                model:     llmModel,
                system:    systemPrompt,
                messages:  compactedMessages,
                tools:     profile.supportsToolCalling ? tools : undefined,
                maxSteps:  Math.min(profile.maxSteps, ITER_MAX_STEPS),
                maxTokens: profile.maxTokens,
            });

            for await (const part of result.fullStream) {

                if (part.type === 'text-delta') {
                    const textChunk = part.textDelta ?? part.text ?? '';
                    iterText += textChunk;
                    yield { type: 'text-delta', text: textChunk };

                } else if (part.type === 'tool-call') {
                    const args = part.input ?? part.args ?? {};
                    yield { type: 'tool-call', toolName: part.toolName, args, toolCallId: part.toolCallId };

                } else if (part.type === 'tool-result') {
                    const toolResult = part.output ?? part.result ?? {};
                    const toolArgs   = part.input  ?? part.args  ?? {};
                    iterToolResults.push({ toolName: part.toolName, toolCallId: part.toolCallId, result: toolResult });

                    // ── Detect planner signal tools ──
                    if (part.toolName === 'create_plan') {
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
                        // Only emit the tool's summary as text if the model did NOT already stream
                        // a meaningful text response this iteration. Otherwise we double-render
                        // (model's natural text + tool summary = duplicated answer).
                        const modelAlreadyWroteSummary = iterText.trim().length > 80;
                        if (toolResult.summary && !modelAlreadyWroteSummary) {
                            const summaryText = toolResult.summary +
                                (toolResult.followup_questions?.length
                                    ? '\n\n**Preguntas de seguimiento:**\n' +
                                      toolResult.followup_questions.map(q => `- ${q}`).join('\n')
                                    : '');
                            yield { type: 'text-delta', text: summaryText };
                            iterText += summaryText;
                        } else if (modelAlreadyWroteSummary && toolResult.followup_questions?.length) {
                            // Model already wrote the summary — only append follow-ups if not already present
                            const followupsBlock = '\n\n**Preguntas de seguimiento:**\n' +
                                toolResult.followup_questions.map(q => `- ${q}`).join('\n');
                            if (!iterText.includes('Preguntas de seguimiento')) {
                                yield { type: 'text-delta', text: followupsBlock };
                                iterText += followupsBlock;
                            }
                        }
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

        } catch (err) {
            console.error(`[AgenticLoop] Iteration ${iteration} error:`, err.message);
            yield { type: 'error', error: err.message || String(err) };
            loopDone = true;
            break;
        }

        // ── Decide whether to continue ──
        if (!loopDone) {
            const hadToolProgress = iterToolResults.length > 0;
            const hadText         = iterText.trim().length > 0;
            if (hadText) anyIterationHadText = true;

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

                    const continuationPrompt = buildContinuationPrompt(activePlan, iteration, maxIterations);
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
                    ? buildContinuationPrompt(activePlan, iteration, maxIterations) +
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

    // Max iterations reached without final_answer — emit a soft warning
    if (!loopDone && iteration >= maxIterations) {
        yield {
            type: 'text-delta',
            text: '\n\n> ⚠️ *Maximum analysis iterations reached. Review the partial results above.*',
        };
    }

    // Background memory extraction
    if (profile.supportsMemory) {
        const llm = llmModel;
        extractMemories(llm, messages, dbManager).catch(e =>
            console.error('[AgenticLoop] Memory extraction error:', e)
        );
    }

    // Final finish event with accumulated usage and queryResults
    yield {
        type:         'finish',
        usage:        totalUsage,
        queryResults: Object.fromEntries(queryResults),
    };
}

module.exports = { agenticLoop };
