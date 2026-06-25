import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuUser, LuBot, LuLoader, LuChartColumn, LuDatabase, LuListChecks } from 'react-icons/lu';
import { stripThink, turnActivityStats } from './deepDiveTurns';

/** Display text for an AI turn: its prose, or a final_answer tldr, else empty. */
function aiTurnText(turn) {
    const t = stripThink(turn.text).trim();
    if (t) return t;
    for (const m of turn.messages || []) {
        for (const tc of m.toolCalls || []) {
            if (tc.toolName === 'final_answer' && tc.result?.tldr) return tc.result.tldr;
        }
    }
    return '';
}

/**
 * DeepDiveTranscript — the left conversation thread.
 * One card per turn (user bubble / AI prose card). AI cards are selectable and
 * show a compact activity chip; selecting one drives the center inspector.
 */
const DeepDiveTranscript = memo(({ turns, selectedTurnId, onSelect, isGenerating }) => {
    return (
        <div className="ddt">
            {turns.map((turn) => {
                if (turn.type === 'user') {
                    return (
                        <div key={turn.id} className="ddt-user">
                            <div className="ddt-user-bubble">{turn.text}</div>
                            <span className="ddt-avatar ddt-avatar--user"><LuUser size={12} /></span>
                        </div>
                    );
                }

                const text = aiTurnText(turn);
                const stats = turnActivityStats(turn);
                const isSel = turn.id === selectedTurnId;
                const working = turn.inProgress && isGenerating;

                return (
                    <button
                        key={turn.id}
                        type="button"
                        onClick={() => onSelect(turn.id)}
                        className={`ddt-ai${isSel ? ' ddt-ai--selected' : ''}`}
                    >
                        <span className="ddt-avatar ddt-avatar--ai"><LuBot size={12} /></span>
                        <div className="ddt-ai-body">
                            {text ? (
                                <div className="ddt-ai-prose markdown-body">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripThink(text)}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="ddt-ai-working">
                                    {working ? <><LuLoader size={12} className="ddt-spin" /> Working…</> : 'Step'}
                                </div>
                            )}
                            {(stats.steps > 0 || stats.hasReasoning) && (
                                <div className="ddt-chip">
                                    {stats.queries > 0 && <span className="ddt-chip-item"><LuDatabase size={10} /> {stats.queries}</span>}
                                    {stats.charts > 0 && <span className="ddt-chip-item"><LuChartColumn size={10} /> {stats.charts}</span>}
                                    {stats.steps > 0 && <span className="ddt-chip-item"><LuListChecks size={10} /> {stats.steps} {stats.steps === 1 ? 'step' : 'steps'}</span>}
                                </div>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
});

DeepDiveTranscript.displayName = 'DeepDiveTranscript';
export default DeepDiveTranscript;
