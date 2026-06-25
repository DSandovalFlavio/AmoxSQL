import { memo, useState } from 'react';
import { LuMousePointerClick, LuBrain, LuChevronDown, LuChevronRight } from 'react-icons/lu';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';
import { buildTimeline } from './deepDiveTurns';

/** Collapsible reasoning block (one <think> chunk). */
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
 * DeepDiveInspector — center pane.
 * Shows the selected turn's activity as an ordered timeline that follows the real
 * execution cycle (reason → update_plan → query → reason → chart → …), NOT grouped
 * by tool type. The prose itself stays in the transcript on the left.
 */
const DeepDiveInspector = memo(({ turn, allMessages, isDiving = true, onExportNotebook, onExportAmoxvis }) => {
    if (!turn || turn.type !== 'ai') {
        return (
            <div className="ddi-empty">
                <LuMousePointerClick size={22} />
                <span>Select a step on the left to see what the analyst did — its reasoning, plan updates, queries, tables and charts, in order.</span>
            </div>
        );
    }

    const timeline = buildTimeline(turn, { live: !!turn.inProgress });

    if (timeline.length === 0) {
        return <div className="ddi"><div className="ddi-empty"><span>No activity for this message.</span></div></div>;
    }

    return (
        <div className="ddi">
            {timeline.map((item, i) => {
                if (item.kind === 'reasoning') {
                    return <ReasoningBlock key={`r-${i}`} content={item.content} />;
                }
                const { tc, loading } = item;
                return (
                    <div key={`t-${i}`} className="ddi-step">
                        <ToolCallBlock
                            toolName={tc.toolName}
                            args={tc.args}
                            result={tc.result}
                            isLoading={loading}
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
                );
            })}
        </div>
    );
});

DeepDiveInspector.displayName = 'DeepDiveInspector';
export default DeepDiveInspector;
