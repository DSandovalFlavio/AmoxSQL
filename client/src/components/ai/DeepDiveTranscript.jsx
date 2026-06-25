import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuUser, LuBot, LuLoader, LuChartColumn, LuDatabase, LuListChecks } from 'react-icons/lu';
import { stripThink, turnActivityStats, turnFinalAnswer } from './deepDiveTurns';
import { NarrativeCard } from './ChatMessage';

/** AI turn prose (without reasoning). The final synthesis renders as a card instead. */
function aiTurnText(turn) {
    return stripThink(turn.text).trim();
}

/**
 * DeepDiveTranscript — the left conversation thread.
 * One entry per turn. The AI turn shows its prose + a compact activity chip
 * (clickable → drives the inspector), and — when the turn produced a final_answer —
 * the synthesis itself as a NarrativeCard right here in the chat.
 */
const DeepDiveTranscript = memo(({ turns, selectedTurnId, onSelect, onFollowUp, isGenerating }) => {
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
                const finalAnswer = turnFinalAnswer(turn);
                const isSel = turn.id === selectedTurnId;
                const working = turn.inProgress && isGenerating;
                const hasActivity = stats.steps > 0 || stats.hasReasoning;

                return (
                    <div key={turn.id} className={`ddt-ai${isSel ? ' ddt-ai--selected' : ''}`}>
                        <span className="ddt-avatar ddt-avatar--ai"><LuBot size={12} /></span>
                        <div className="ddt-ai-body">
                            {/* Clickable region — selects the turn to inspect its steps */}
                            <div
                                className="ddt-ai-select"
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelect(turn.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(turn.id); } }}
                                title={hasActivity ? 'Click to inspect this step' : undefined}
                            >
                                {text ? (
                                    <div className="ddt-ai-prose markdown-body">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                                    </div>
                                ) : !finalAnswer ? (
                                    <div className="ddt-ai-working">
                                        {working ? <><LuLoader size={12} className="ddt-spin" /> Working…</> : 'Step'}
                                    </div>
                                ) : null}
                                {hasActivity && (
                                    <div className="ddt-chip">
                                        {stats.queries > 0 && <span className="ddt-chip-item"><LuDatabase size={10} /> {stats.queries}</span>}
                                        {stats.charts > 0 && <span className="ddt-chip-item"><LuChartColumn size={10} /> {stats.charts}</span>}
                                        {stats.steps > 0 && <span className="ddt-chip-item"><LuListChecks size={10} /> {stats.steps} {stats.steps === 1 ? 'step' : 'steps'}</span>}
                                        {isSel ? <span className="ddt-chip-inspecting">inspecting →</span> : <span className="ddt-chip-hint">view steps →</span>}
                                    </div>
                                )}
                            </div>

                            {/* Final synthesis lives in the chat, not the inspector */}
                            {finalAnswer && <NarrativeCard result={finalAnswer} onFollowUp={onFollowUp} />}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

DeepDiveTranscript.displayName = 'DeepDiveTranscript';
export default DeepDiveTranscript;
