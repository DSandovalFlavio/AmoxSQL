/**
 * AgentPlanPanel — shows the active agent plan in real-time with editable steps.
 * Mounts inside the right column of AiDivingPanel when the planner is active.
 *
 * Users can click "Skip" on any pending step to mark it as skipped in local state.
 * Skipped steps are communicated back to the agent via planStepOverrides on next send.
 */

import React, { useState } from 'react';
import {
    LuCircleCheck, LuCircleX, LuCircleMinus, LuCircle, LuCirclePause,
    LuLoader, LuChevronDown, LuChevronRight, LuBrain, LuSkipForward,
} from 'react-icons/lu';

const STATUS_ICON = {
    done:        { Icon: LuCircleCheck,  cls: 'ai-plan-step--done'        },
    failed:      { Icon: LuCircleX,      cls: 'ai-plan-step--failed'      },
    skipped:     { Icon: LuCircleMinus,  cls: 'ai-plan-step--skipped'     },
    interrupted: { Icon: LuCirclePause,  cls: 'ai-plan-step--interrupted' },
    pending:     { Icon: LuCircle,       cls: 'ai-plan-step--pending'     },
    not_done:    { Icon: LuCircleMinus,  cls: 'ai-plan-step--not-done'    },
    running:     { Icon: LuLoader,       cls: 'ai-plan-step--running ai-plan-step-icon--spin' },
};

const STATUS_TEXT = {
    done: 'Done', failed: 'Failed', skipped: 'Skipped', interrupted: 'Interrupted',
    pending: 'Pending', not_done: 'Not done', running: 'In progress',
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
    const isCompleted = status === 'completed';
    // Un plan terminado con pasos que nunca empezaron: esos pasos NO se hicieron.
    // (Las sesiones guardadas antes de este cambio los traen como «pending».)
    const notDone = (s) => s.status === 'not_done' || (isCompleted && s.status === 'pending' && !userSkippedSteps.has(s.id));
    const doneCount = steps.filter(s =>
        s.status === 'done' || s.status === 'skipped' || userSkippedSteps.has(s.id)
        || (isCompleted && s.status === 'in_progress')
    ).length;
    const notDoneCount = steps.filter(notDone).length;
    const total = steps.length;
    const pct   = total > 0 ? Math.round(((doneCount + notDoneCount) / total) * 100) : 0;
    const isPaused = status === 'paused';

    // Determine which step is "running": an explicitly in_progress step takes
    // precedence; otherwise the first pending (non-user-skipped) one while generating.
    const inProgressIdx = steps.findIndex(s => s.status === 'in_progress' && !userSkippedSteps.has(s.id));
    const runningIdx = inProgressIdx !== -1
        ? inProgressIdx
        : (isGenerating ? steps.findIndex(s => s.status === 'pending' && !userSkippedSteps.has(s.id)) : -1);

    const isEditable = !isGenerating && status !== 'completed';

    return (
        <div className="ai-plan-panel">
            {/* Header */}
            <button
                className="ai-plan-header"
                onClick={() => setCollapsed(c => !c)}
            >
                <LuBrain size={13} className="ai-plan-header-icon" />
                <span className="ai-plan-header-title">Plan</span>
                <span className={`ai-plan-badge${isPaused ? ' ai-plan-badge--paused' : ''}`}
                    title={notDoneCount ? `${notDoneCount} of ${total} steps were not done` : undefined}>
                    {isCompleted
                        ? (notDoneCount ? `Finished · ${doneCount} of ${total}` : 'Finished')
                        : isPaused
                            ? `Paused · ${doneCount} of ${total}`
                            : `${doneCount} of ${total}`}
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
                            // A step only spins while the agent is actually generating.
                            // Once stopped, an in_progress step was interrupted (out of
                            // cycles / paused) — show a pause icon, not an eternal spinner.
                            const isRunning = isGenerating && (idx === runningIdx || step.status === 'in_progress');
                            const effectiveStatus = isUserSkipped
                                ? 'skipped'
                                : isRunning
                                    ? 'running'
                                    : notDone(step)
                                        ? 'not_done'
                                        : step.status === 'in_progress'
                                            // The step it was on when it concluded is done (same rule as the server).
                                            ? (isCompleted ? 'done' : 'interrupted')
                                            : (step.status || 'pending');
                            const { Icon, cls } = STATUS_ICON[effectiveStatus] || STATUS_ICON.pending;
                            const canSkip = isEditable && onSkipStep && step.status === 'pending' && !isUserSkipped;

                            return (
                                // key includes the index: plan snapshots from the server can
                                // transiently repeat a step id (plan re-created mid-stream).
                                <li key={`${step.id}-${idx}`} className={`ai-plan-step ${cls}`}>
                                    <span className="ai-plan-step-icon" title={STATUS_TEXT[effectiveStatus]} aria-label={STATUS_TEXT[effectiveStatus]}>
                                        <Icon size={13} />
                                    </span>
                                    <span className="ai-plan-step-body">
                                        {/* El número, no el id interno (s1, s2…). */}
                                        <span className="ai-plan-step-id" title={`Plan step ${step.id}`}>{idx + 1}</span>
                                        <span className="ai-plan-step-desc">{step.description}</span>
                                        {(step.note || isUserSkipped || effectiveStatus === 'not_done') && (
                                            <span className="ai-plan-step-note">
                                                {isUserSkipped
                                                    ? 'You skipped this step'
                                                    : effectiveStatus === 'not_done'
                                                        ? (step.note || 'Not done: the analyst concluded without it')
                                                        : step.note}
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
                    {/* En palabras, no «Iteration 12/50»: el contador queda en el
                        título emergente para quien lo quiera. */}
                    {isGenerating && iteration > 0 && (
                        <div className="ai-plan-iter" title={`Iteration ${iteration}${maxIterations ? ` of ${maxIterations}` : ''}`}>
                            <LuLoader size={11} className="ai-plan-iter-spinner" />
                            <span>{runningIdx >= 0 ? `Working on step ${runningIdx + 1} of ${total}` : 'Working…'}</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
