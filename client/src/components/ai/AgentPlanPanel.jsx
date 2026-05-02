/**
 * AgentPlanPanel — shows the active agent plan in real-time with editable steps.
 * Mounts inside the right column of AiDivingPanel when the planner is active.
 *
 * Users can click "Skip" on any pending step to mark it as skipped in local state.
 * Skipped steps are communicated back to the agent via planStepOverrides on next send.
 */

import React, { useState } from 'react';
import {
    LuCircleCheck, LuCircleX, LuCircleMinus, LuCircle,
    LuLoader, LuChevronDown, LuChevronRight, LuBrain, LuSkipForward,
} from 'react-icons/lu';

const STATUS_ICON = {
    done:    { Icon: LuCircleCheck,  cls: 'ai-plan-step--done'    },
    failed:  { Icon: LuCircleX,      cls: 'ai-plan-step--failed'  },
    skipped: { Icon: LuCircleMinus,  cls: 'ai-plan-step--skipped' },
    pending: { Icon: LuCircle,       cls: 'ai-plan-step--pending' },
    running: { Icon: LuLoader,       cls: 'ai-plan-step--running ai-plan-step-icon--spin' },
};

/**
 * @param {object}   planState         - { goal, steps[], status }
 * @param {boolean}  isGenerating      - Whether the agent is currently running
 * @param {number}   iteration         - Current loop iteration
 * @param {number}   maxIterations     - Max loop iterations
 * @param {Function} onSkipStep        - Callback(stepId) when user clicks Skip
 * @param {Set}      userSkippedSteps  - Set of stepIds the user has locally marked as skip
 */
export default function AgentPlanPanel({
    planState,
    isGenerating,
    iteration,
    maxIterations,
    onSkipStep,
    userSkippedSteps = new Set(),
}) {
    const [collapsed, setCollapsed] = useState(false);

    if (!planState) return null;

    const { goal, steps = [], status } = planState;
    const doneCount = steps.filter(s =>
        s.status === 'done' || s.status === 'skipped' || userSkippedSteps.has(s.id)
    ).length;
    const total = steps.length;
    const pct   = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    // Determine which step is "running" — the first pending (non-user-skipped) one while generating
    const runningIdx = isGenerating
        ? steps.findIndex(s => s.status === 'pending' && !userSkippedSteps.has(s.id))
        : -1;

    const isEditable = !isGenerating && status !== 'completed';

    return (
        <div className="ai-plan-panel">
            {/* Header */}
            <button
                className="ai-plan-header"
                onClick={() => setCollapsed(c => !c)}
            >
                <LuBrain size={13} className="ai-plan-header-icon" />
                <span className="ai-plan-header-title">Agent Plan</span>
                {isEditable && (
                    <span className="ai-plan-editable-badge" title="Click Skip on pending steps to remove them from the plan">
                        editable
                    </span>
                )}
                <span className="ai-plan-badge">
                    {status === 'completed' ? '✓ Done' : `${doneCount}/${total}`}
                </span>

                {collapsed
                    ? <LuChevronRight size={13} className="ai-plan-chevron" />
                    : <LuChevronDown  size={13} className="ai-plan-chevron" />
                }
            </button>

            {!collapsed && (
                <>
                    {/* Progress bar */}
                    <div className="ai-plan-progress-track">
                        <div
                            className={`ai-plan-progress-fill${status === 'completed' ? ' ai-plan-progress-fill--done' : ''}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>

                    {/* Goal */}
                    {goal && (
                        <p className="ai-plan-goal">{goal}</p>
                    )}

                    {/* Edit hint when paused */}
                    {isEditable && onSkipStep && (
                        <p className="ai-plan-edit-hint">
                            You can skip pending steps before the agent continues.
                        </p>
                    )}

                    {/* Steps */}
                    <ul className="ai-plan-steps">
                        {steps.map((step, idx) => {
                            const isUserSkipped = userSkippedSteps.has(step.id);
                            const effectiveStatus = isUserSkipped
                                ? 'skipped'
                                : (idx === runningIdx) ? 'running' : (step.status || 'pending');
                            const { Icon, cls } = STATUS_ICON[effectiveStatus] || STATUS_ICON.pending;
                            const canSkip = isEditable && onSkipStep && step.status === 'pending' && !isUserSkipped;

                            return (
                                <li key={step.id} className={`ai-plan-step ${cls}`}>
                                    <span className="ai-plan-step-icon">
                                        <Icon size={13} />
                                    </span>
                                    <span className="ai-plan-step-body">
                                        <span className="ai-plan-step-id">{step.id}</span>
                                        <span className="ai-plan-step-desc">{step.description}</span>
                                        {(step.note || isUserSkipped) && (
                                            <span className="ai-plan-step-note">
                                                {isUserSkipped ? 'skipped by user' : step.note}
                                            </span>
                                        )}
                                    </span>
                                    {canSkip && (
                                        <button
                                            className="ai-plan-step-skip"
                                            title="Skip this step"
                                            onClick={() => onSkipStep(step.id)}
                                        >
                                            <LuSkipForward size={11} />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {/* Iteration indicator */}
                    {isGenerating && iteration > 0 && (
                        <div className="ai-plan-iter">
                            <LuLoader size={11} className="ai-plan-iter-spinner" />
                            <span>Iteration {iteration}{maxIterations ? `/${maxIterations}` : ''}</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
