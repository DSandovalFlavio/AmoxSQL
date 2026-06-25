/**
 * AmoxSQL AI — Planner Tools (create_plan, update_plan)
 *
 * Loaded conditionally by tools.js only when the 'analysis-planning' skill is active.
 * Provides structured multi-step plan tracking with UI progress visibility.
 */
const { z } = require('zod');
const { tool } = require('ai');

/**
 * @param {object} options
 * @param {object} options.activePlan - Shared mutable plan ref (same object as in agenticLoop)
 * @param {object} options.aiPersistence - Persistence layer
 * @param {object} options.dbManager - DuckDB connection
 * @param {string} options.conversationId - Active conversation ID
 * @returns {{ create_plan: Tool, update_plan: Tool }}
 */
function createPlannerTools({ activePlan, aiPersistence, dbManager, conversationId }) {
    return {

        create_plan: tool({
            description: 'Create an analysis plan for multi-step work (3+ steps). Call this FIRST when the user requests a complex analysis. Declare all steps upfront so the user can track progress. Then execute each step in order, call update_plan after each, and finish with final_answer.',
            inputSchema: z.object({
                goal: z.string().describe('Main objective in one clear sentence.'),
                steps: z.array(z.object({
                    id: z.string().describe('Short step id: "s1", "s2", etc.'),
                    description: z.string().describe('What this step does, in plain language.'),
                    tool_hint: z.enum([
                        'list_tables', 'describe_table', 'execute_sql', 'display_chart',
                        'attach_file', 'profile_data', 'build_notebook',
                        'read_file', 'validate_sql', 'ask_user', 'final_answer', 'other',
                    ]).optional().describe('Which tool will likely be used in this step.'),
                })).min(2).max(15).describe('Ordered steps to complete the analysis.'),
            }),
            execute: async ({ goal, steps }) => {
                const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

                activePlan.id = planId;
                activePlan.goal = goal;
                activePlan.steps = steps.map(s => ({ ...s, status: 'pending' }));
                // Dynamic iteration budget: 3 iterations per step, clamped to [15, 50].
                // Capa 4 will enforce an absolute hardcap of 20 in the loop itself.
                activePlan.dynamicMaxIterations = Math.min(50, Math.max(15, activePlan.steps.length * 3));

                if (aiPersistence && conversationId) {
                    aiPersistence.savePlan(dbManager, {
                        id: planId, conversationId, goal, steps: activePlan.steps,
                    }).catch(e => console.warn('[Planner] create_plan persist:', e.message));
                }

                return {
                    planId,
                    goal,
                    steps: activePlan.steps,
                    status: 'created',
                    maxIterations: activePlan.dynamicMaxIterations,
                };
            },
        }),

        update_plan: tool({
            description: 'Update a plan step\'s status so the plan panel stays current and the user sees progress. Mark it "in_progress" when you START a step, then "done" / "failed" / "skipped" when it ends.',
            inputSchema: z.object({
                step_id: z.string().describe('The step id to update (e.g. "s1").'),
                status: z.enum(['in_progress', 'done', 'failed', 'skipped', 'pending']).describe('New status: in_progress when starting the step; done/failed/skipped when it ends.'),
                note: z.string().optional().describe('Brief note on what was found or why a step was skipped/failed.'),
            }),
            execute: async ({ step_id, status, note }) => {
                const step = activePlan.steps?.find(s => s.id === step_id);
                if (step) {
                    step.status = status;
                    if (note) step.note = note;
                }

                if (aiPersistence && activePlan.id) {
                    aiPersistence.updatePlan(dbManager, activePlan.id, {
                        steps: activePlan.steps,
                    }).catch(e => console.warn('[Planner] update_plan persist:', e.message));
                }

                const remaining = activePlan.steps?.filter(s => s.status === 'pending').length ?? 0;
                return { step_id, status, note: note || null, remaining_steps: remaining };
            },
        }),
    };
}

module.exports = { createPlannerTools };
