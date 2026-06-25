import { memo, useState } from 'react';
import { LuMousePointerClick, LuBrain, LuChevronDown, LuChevronRight, LuListChecks } from 'react-icons/lu';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';
import { buildStepGroups, turnReasoning } from './deepDiveTurns';

const STATUS_LABEL = { in_progress: 'in progress', done: 'done', failed: 'failed', skipped: 'skipped', pending: 'pending' };

/** Collapsible block — used for reasoning groups. */
function Collapsible({ icon, title, count, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className={`ddi-reasoning${open ? ' ddi-reasoning--open' : ''}`}>
            <button className="ddi-reasoning-head" onClick={() => setOpen(o => !o)}>
                {icon}
                <span>{title}{count != null ? ` · ${count}` : ''}</span>
                {open ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
            </button>
            {open && <div className="ddi-reasoning-body">{children}</div>}
        </div>
    );
}

/**
 * DeepDiveInspector — center pane.
 * Shows the selected turn's activity grouped by AGENT-PLAN STEP, in execution
 * order (not grouped by tool type). Reasoning is shown collapsed at the top
 * (the data can't map a reasoning chunk to a specific step). The prose lives in
 * the transcript on the left.
 */
const DeepDiveInspector = memo(({ turn, allMessages, isDiving = true, onExportNotebook, onExportAmoxvis }) => {
    if (!turn || turn.type !== 'ai') {
        return (
            <div className="ddi-empty">
                <LuMousePointerClick size={22} />
                <span>Select a step on the left to see what the analyst did — grouped by plan step, in order.</span>
            </div>
        );
    }

    const reasoning = turnReasoning(turn);
    const sections = buildStepGroups(turn);
    const hasAnything = reasoning.length > 0 || sections.length > 0;

    if (!hasAnything) {
        return <div className="ddi"><div className="ddi-empty"><span>No activity for this message.</span></div></div>;
    }

    return (
        <div className="ddi">
            {reasoning.length > 0 && (
                <Collapsible icon={<LuBrain size={12} />} title="Reasoning" count={reasoning.length}>
                    {reasoning.map((r, i) => (
                        <div key={i} className="ddi-reasoning-chunk">{r}</div>
                    ))}
                </Collapsible>
            )}

            {sections.map((sec) => (
                <section key={sec.key} className="ddi-stepgroup">
                    <header className="ddi-stepgroup-head">
                        <LuListChecks size={12} />
                        <span className="ddi-stepgroup-label">{sec.label}</span>
                        {sec.status && <span className={`ddi-stepgroup-status ddi-status--${sec.status}`}>{STATUS_LABEL[sec.status] || sec.status}</span>}
                        {sec.note && <span className="ddi-stepgroup-note">{sec.note}</span>}
                    </header>

                    {sec.tools.length === 0 ? (
                        <div className="ddi-stepgroup-empty">—</div>
                    ) : (
                        sec.tools.map((tc, i) => (
                            <div key={i} className="ddi-step">
                                <ToolCallBlock
                                    toolName={tc.toolName}
                                    args={tc.args}
                                    result={tc.result}
                                    isLoading={!!turn.inProgress && !tc.result}
                                />
                                {tc.toolName === 'display_chart' && tc.result?.chartConfig && (
                                    <ChatResultsBlock
                                        chartConfig={tc.result.chartConfig}
                                        allMessages={allMessages}
                                        isDiving={isDiving}
                                        onExportNotebook={onExportNotebook}
                                        onExportAmoxvis={onExportAmoxvis}
                                    />
                                )}
                            </div>
                        ))
                    )}
                </section>
            ))}
        </div>
    );
});

DeepDiveInspector.displayName = 'DeepDiveInspector';
export default DeepDiveInspector;
