import { memo, useMemo, useState } from 'react';
import { LuMousePointerClick, LuBrain, LuChevronDown, LuChevronRight, LuListChecks, LuLightbulb, LuMessageSquareQuote } from 'react-icons/lu';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';
import SqlActivityBlock from './SqlActivityBlock';
import { buildStepGroups, planSteps, turnReasoning } from './deepDiveTurns';

const STATUS_LABEL = { in_progress: 'in progress', done: 'done', failed: 'failed', skipped: 'skipped', pending: 'pending', interrupted: 'interrupted' };

/**
 * El razonamiento del turno, una vez y plegado.
 *
 * Antes se repartía por orden entre los pasos del turno, pero el mensaje guarda el
 * razonamiento y las herramientas en listas separadas: el reparto podía poner un
 * razonamiento bajo el paso equivocado. Mejor uno solo, cierto, que varios dudosos.
 */
function ReasoningBlock({ chunks }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`ddi-reasoning${open ? ' ddi-reasoning--open' : ''}`}>
            <button className="ddi-reasoning-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                <LuBrain size={12} />
                <span>How the analyst reasoned</span>
                {open ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
            </button>
            {open && chunks.map((c, i) => <div key={i} className="ddi-reasoning-body">{c}</div>)}
        </div>
    );
}

/**
 * DeepDiveInspector — center pane. Activity grouped by AGENT-PLAN STEP, in order.
 * Each step card shows what it concluded, the SQL + result table, and charts
 * inline; the turn's reasoning sits above them.
 */
const DeepDiveInspector = memo(({ turn, allMessages, isDiving = true, onRunSql, onAskAbout, onExportNotebook, onExportAmoxvis }) => {
    // Los nombres de los pasos salen del plan, que puede estar en otro turno.
    const pasos = useMemo(() => planSteps(allMessages || []), [allMessages]);

    if (!turn || turn.type !== 'ai') {
        return (
            <div className="ddi-empty">
                <LuMousePointerClick size={22} />
                <span>Click a reply on the left to see how the analyst got there: its queries, results and charts, step by step.</span>
            </div>
        );
    }

    const reasoning = turnReasoning(turn);
    const sections = buildStepGroups(turn, pasos);

    if (reasoning.length === 0 && sections.length === 0) {
        return <div className="ddi"><div className="ddi-empty"><span>This reply has no queries or charts behind it.</span></div></div>;
    }

    // A step left "in progress" in a turn that is no longer running: if the analysis
    // concluded, it was done (same rule as the plan); if not, it was interrupted.
    // Saying "in progress" next to a finished plan contradicted it.
    const concluyo = (allMessages || []).some(m => (m.toolCalls || []).some(tc => tc.toolName === 'final_answer' && tc.result));
    const estadoDe = (s) => (s === 'in_progress' && !turn.inProgress ? (concluyo ? 'done' : 'interrupted') : s);

    return (
        <div className="ddi">
            {reasoning.length > 0 && <ReasoningBlock chunks={reasoning} />}
            {sections.map((sec) => {
                const estado = estadoDe(sec.status);
                return (
                <section key={sec.key} className="ddi-stepgroup">
                    <header className="ddi-stepgroup-head">
                        {sec.numero ? <span className="ddi-stepgroup-num">{sec.numero}</span> : <LuListChecks size={12} />}
                        <span className="ddi-stepgroup-label" title={sec.stepId ? `Plan step ${sec.stepId}` : undefined}>{sec.label}</span>
                        {estado && <span className={`ddi-stepgroup-status ddi-status--${estado}`}>{STATUS_LABEL[estado] || estado}</span>}
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
                );
            })}
        </div>
    );
});

DeepDiveInspector.displayName = 'DeepDiveInspector';
export default DeepDiveInspector;
