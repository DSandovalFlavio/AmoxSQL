import { memo, useState } from 'react';
import { LuMousePointerClick, LuBrain, LuChevronDown, LuChevronRight, LuListChecks, LuLightbulb, LuMessageSquareQuote } from 'react-icons/lu';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';
import SqlActivityBlock from './SqlActivityBlock';
import { buildStepGroups, turnReasoning } from './deepDiveTurns';

const STATUS_LABEL = { in_progress: 'in progress', done: 'done', failed: 'failed', skipped: 'skipped', pending: 'pending' };

/** Collapsible reasoning chunk. */
function ReasoningBlock({ content }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`ddi-reasoning${open ? ' ddi-reasoning--open' : ''}`}>
            <button className="ddi-reasoning-head" onClick={() => setOpen(o => !o)}>
                <LuBrain size={12} />
                <span>Reasoning</span>
                {open ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
            </button>
            {open && <div className="ddi-reasoning-body">{content}</div>}
        </div>
    );
}

/**
 * Distribute ordered reasoning chunks across N step sections, front-loaded by
 * order. The stored message keeps reasoning (content) and tools (toolCalls) in
 * separate arrays, so exact per-step mapping isn't recoverable — this spreads the
 * chunks through the phases in order instead of dumping them all in one block.
 */
function distributeReasoning(reasoning, n) {
    const buckets = Array.from({ length: Math.max(n, 0) }, () => []);
    if (n <= 0) return buckets;
    let ri = 0;
    for (let idx = 0; idx < n; idx++) {
        const remaining = n - idx;
        const take = Math.max(0, Math.ceil((reasoning.length - ri) / remaining));
        buckets[idx] = reasoning.slice(ri, ri + take);
        ri += take;
    }
    return buckets;
}

/**
 * DeepDiveInspector — center pane. Activity grouped by AGENT-PLAN STEP, in order.
 * Each phase card shows its reasoning (un-grouped), what it concluded, the SQL +
 * result table, and charts inline.
 */
const DeepDiveInspector = memo(({ turn, allMessages, isDiving = true, onRunSql, onAskAbout, onExportNotebook, onExportAmoxvis }) => {
    if (!turn || turn.type !== 'ai') {
        return (
            <div className="ddi-empty">
                <LuMousePointerClick size={22} />
                <span>Select a step on the left to see what the analyst did — grouped by plan step, with its reasoning, queries, results, charts and conclusion.</span>
            </div>
        );
    }

    const reasoning = turnReasoning(turn);
    const sections = buildStepGroups(turn);

    if (reasoning.length === 0 && sections.length === 0) {
        return <div className="ddi"><div className="ddi-empty"><span>No activity for this message.</span></div></div>;
    }

    // No plan steps (e.g. a quick follow-up): show reasoning chunks inline at top.
    if (sections.length === 0) {
        return <div className="ddi">{reasoning.map((r, i) => <ReasoningBlock key={i} content={r} />)}</div>;
    }

    const buckets = distributeReasoning(reasoning, sections.length);

    return (
        <div className="ddi">
            {sections.map((sec, si) => (
                <section key={sec.key} className="ddi-stepgroup">
                    <header className="ddi-stepgroup-head">
                        <LuListChecks size={12} />
                        <span className="ddi-stepgroup-label">{sec.label}</span>
                        {sec.status && <span className={`ddi-stepgroup-status ddi-status--${sec.status}`}>{STATUS_LABEL[sec.status] || sec.status}</span>}
                        {onAskAbout && (
                            <button
                                className="ddi-ask-btn"
                                title="Ask the agent about this step"
                                onClick={() => onAskAbout({
                                    type: 'step',
                                    stepId: sec.stepId || sec.key,
                                    stepLabel: sec.label,
                                    insight: sec.insight || sec.note || '',
                                    label: `Step: ${sec.label}`,
                                    key: `step:${sec.stepId || sec.key}`,
                                })}
                            >
                                <LuMessageSquareQuote size={12} />
                            </button>
                        )}
                    </header>

                    {(sec.insight || sec.note) && (
                        <div className="ddi-insight">
                            <LuLightbulb size={13} className="ddi-insight-icon" />
                            <span>{sec.insight || sec.note}</span>
                        </div>
                    )}

                    {/* Reasoning for this phase (distributed in order) */}
                    {buckets[si]?.length > 0 && (
                        <div className="ddi-stepgroup-reasoning">
                            {buckets[si].map((r, i) => <ReasoningBlock key={i} content={r} />)}
                        </div>
                    )}

                    {sec.tools.map((tc, i) => (
                        <div key={i} className="ddi-step">
                            {tc.toolName === 'execute_sql' ? (
                                <SqlActivityBlock tc={tc} onRunSql={onRunSql} onAskAbout={onAskAbout} />
                            ) : (
                                <>
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
                                            onAskAbout={onAskAbout}
                                            onExportNotebook={onExportNotebook}
                                            onExportAmoxvis={onExportAmoxvis}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
});

DeepDiveInspector.displayName = 'DeepDiveInspector';
export default DeepDiveInspector;
