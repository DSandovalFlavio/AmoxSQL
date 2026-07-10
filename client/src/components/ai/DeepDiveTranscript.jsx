import { memo, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuUser, LuBot, LuLoader, LuChartColumn, LuDatabase, LuListChecks } from 'react-icons/lu';
import { stripThink, turnActivityStats, turnFinalAnswer } from './deepDiveTurns';
import { NarrativeCard, QueryAuditModal, makeMdComponents, citeUrlTransform } from './ChatMessage';
import StreamingMarkdown from './StreamingMarkdown';

/** AI turn prose (without reasoning). The final synthesis renders as a card instead. */
function aiTurnText(turn) {
    return stripThink(turn.text).trim();
}

/**
 * One transcript entry, memoized. Historical turns keep their object identity
 * across stream flushes and composer keystrokes (they derive from `messages`
 * only), so during streaming ONLY the live turn re-renders — the rest of the
 * conversation never re-parses its markdown.
 */
const TranscriptTurn = memo(({ turn, isSelected, onSelect, onFollowUp, onAskAbout, isGenerating }) => {
    if (turn.type === 'user') {
        return (
            <div className="ddt-user">
                <div className="ddt-user-bubble">{turn.text}</div>
                <span className="ddt-avatar ddt-avatar--user"><LuUser size={12} /></span>
            </div>
        );
    }

    const text = aiTurnText(turn);
    const stats = turnActivityStats(turn);
    const finalAnswer = turnFinalAnswer(turn);
    const working = turn.inProgress && isGenerating;
    const hasActivity = stats.steps > 0 || stats.hasReasoning;

    // Inline citations ([value](cite:queryId)) open the source query here instead
    // of navigating the Electron window to a "cite:" URL (which reset the app).
    const [citeQueryId, setCiteQueryId] = useState(null);
    const mdComponents = useMemo(() => makeMdComponents(setCiteQueryId), []);

    return (
        <div className={`ddt-ai${isSelected ? ' ddt-ai--selected' : ''}`}>
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
                            {turn.inProgress ? (
                                <StreamingMarkdown content={text} components={mdComponents} urlTransform={citeUrlTransform} />
                            ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents} urlTransform={citeUrlTransform}>{text}</ReactMarkdown>
                            )}
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
                            {isSelected ? <span className="ddt-chip-inspecting">inspecting →</span> : <span className="ddt-chip-hint">view steps →</span>}
                        </div>
                    )}
                </div>

                {/* Final synthesis lives in the chat, not the inspector */}
                {finalAnswer && <NarrativeCard result={finalAnswer} onFollowUp={onFollowUp} onAskAbout={onAskAbout} />}
            </div>

            {citeQueryId && (
                <QueryAuditModal queryId={citeQueryId} onClose={() => setCiteQueryId(null)} />
            )}
        </div>
    );
});
TranscriptTurn.displayName = 'TranscriptTurn';

/**
 * DeepDiveTranscript — the left conversation thread.
 * One entry per turn. The AI turn shows its prose + a compact activity chip
 * (clickable → drives the inspector), and — when the turn produced a final_answer —
 * the synthesis itself as a NarrativeCard right here in the chat.
 */
const DeepDiveTranscript = memo(({ turns, selectedTurnId, onSelect, onFollowUp, onAskAbout, isGenerating }) => {
    return (
        <div className="ddt">
            {turns.map((turn) => (
                <TranscriptTurn
                    key={turn.id}
                    turn={turn}
                    isSelected={turn.id === selectedTurnId}
                    onSelect={onSelect}
                    onFollowUp={onFollowUp}
                    onAskAbout={onAskAbout}
                    isGenerating={isGenerating}
                />
            ))}
        </div>
    );
});

DeepDiveTranscript.displayName = 'DeepDiveTranscript';
export default DeepDiveTranscript;
