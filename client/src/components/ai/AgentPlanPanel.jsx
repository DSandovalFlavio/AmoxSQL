/**
 * AgentPlanPanel — shows the active agent plan in real-time.
 * Mounts inside the right column of AiDivingPanel when the planner is active.
 */

import React, { useState } from 'react';
import {
    LuCircleCheck, LuCircleX, LuCircleMinus, LuCircle,
    LuLoader, LuChevronDown, LuChevronRight, LuBrain,
} from 'react-icons/lu';

const STATUS_ICON = {
    done:    { Icon: LuCircleCheck,  cls: 'ai-plan-step--done'    },
    failed:  { Icon: LuCircleX,      cls: 'ai-plan-step--failed'  },
    skipped: { Icon: LuCircleMinus,  cls: 'ai-plan-step--skipped' },
    pending: { Icon: LuCircle,       cls: 'ai-plan-step--pending' },
    running: { Icon: LuLoader,       cls: 'ai-plan-step--running ai-plan-step-icon--spin' },
};

export default function AgentPlanPanel({ planState, isGenerating, iteration, maxIterations }) {
    const [collapsed, setCollapsed] = useState(false);

    if (!planState) return null;

    const { goal, steps = [], status } = planState;
    const doneCount = steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
    const total     = steps.length;
    const pct       = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    // Determine which step is "running" — the first pending one while generating
    const runningIdx = isGenerating
        ? steps.findIndex(s => s.status === 'pending')
        : -1;

    return (
        <div className="ai-plan-panel">
            {/* Header */}
            <button
                className="ai-plan-header"
                onClick={() => setCollapsed(c => !c)}
            >
                <LuBrain size={13} className="ai-plan-header-icon" />
                <span className="ai-plan-header-title">Agent Plan</span>

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

                    {/* Steps */}
                    <ul className="ai-plan-steps">
                        {steps.map((step, idx) => {
                            const effectiveStatus = (idx === runningIdx) ? 'running' : (step.status || 'pending');
                            const { Icon, cls } = STATUS_ICON[effectiveStatus] || STATUS_ICON.pending;

                            return (
                                <li key={step.id} className={`ai-plan-step ${cls}`}>
                                    <span className="ai-plan-step-icon">
                                        <Icon size={13} />
                                    </span>
                                    <span className="ai-plan-step-body">
                                        <span className="ai-plan-step-id">{step.id}</span>
                                        <span className="ai-plan-step-desc">{step.description}</span>
                                        {step.note && (
                                            <span className="ai-plan-step-note">{step.note}</span>
                                        )}
                                    </span>
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
