import { memo } from 'react';
import { LuMousePointerClick } from 'react-icons/lu';
import ChatMessage from './ChatMessage';

/**
 * DeepDiveInspector — the center pane.
 * Shows the full activity of the selected turn (reasoning, plan updates, queries,
 * tables, charts) — everything except the prose, which lives in the transcript.
 */
const DeepDiveInspector = memo(({ turn, allMessages, onRunSql, onFollowUp, onExportNotebook, onExportAmoxvis, onOpenFile }) => {
    if (!turn || turn.type !== 'ai') {
        return (
            <div className="ddi-empty">
                <LuMousePointerClick size={22} />
                <span>Select a step on the left to see what the analyst did — its reasoning, queries, tables and charts.</span>
            </div>
        );
    }

    const hasActivity = (turn.messages || []).some(
        m => (m.toolCalls && m.toolCalls.length) || (m.content && /<think>/i.test(m.content))
    );

    return (
        <div className="ddi">
            {!hasActivity ? (
                <div className="ddi-empty"><span>No tool activity for this message.</span></div>
            ) : (
                turn.messages.map((msg, i) => (
                    <ChatMessage
                        key={msg.id || i}
                        role={msg.role}
                        content={msg.content}
                        toolCalls={msg.toolCalls}
                        allMessages={allMessages}
                        isDiving={true}
                        isStreaming={!!turn.inProgress}
                        activityOnly={true}
                        onRunSql={onRunSql}
                        onFollowUp={onFollowUp}
                        onExportNotebook={onExportNotebook}
                        onExportAmoxvis={onExportAmoxvis}
                        onOpenFile={onOpenFile}
                    />
                ))
            )}
        </div>
    );
});

DeepDiveInspector.displayName = 'DeepDiveInspector';
export default DeepDiveInspector;
