import { useState } from 'react';
import { LuCheck, LuX, LuChevronDown, LuChevronRight, LuFileEdit } from 'react-icons/lu';

/**
 * EditProposalBlock — Shows an AI-proposed file edit with Accept/Reject buttons.
 * Renders a unified diff-style preview between current and proposed content.
 */
const EditProposalBlock = ({ currentContent, proposedContent, description, onAccept, onReject }) => {
    const [showDiff, setShowDiff] = useState(true);

    const currentLines = (currentContent || '').split('\n');
    const proposedLines = (proposedContent || '').split('\n');

    // Simple line-level diff: lines removed vs lines added
    const currentSet = new Set(currentLines);
    const proposedSet = new Set(proposedLines);

    const removedCount = currentLines.filter(l => !proposedSet.has(l)).length;
    const addedCount = proposedLines.filter(l => !currentSet.has(l)).length;

    return (
        <div className="ai-edit-proposal">
            {/* Header */}
            <div className="ai-edit-proposal__header">
                <div className="ai-edit-proposal__title" onClick={() => setShowDiff(v => !v)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    {showDiff ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                    <LuFileEdit size={13} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>AI Edit Proposal</span>
                    {description && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>— {description}</span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-tertiary)', marginRight: 8 }}>
                    <span style={{ color: '#4ade80' }}>+{addedCount}</span>
                    <span style={{ color: '#f87171' }}>-{removedCount}</span>
                </div>
                <div className="ai-edit-proposal__actions">
                    <button
                        className="ai-edit-proposal__btn ai-edit-proposal__btn--reject"
                        onClick={onReject}
                        title="Reject — keep original"
                    >
                        <LuX size={12} /> Reject
                    </button>
                    <button
                        className="ai-edit-proposal__btn ai-edit-proposal__btn--accept"
                        onClick={onAccept}
                        title="Accept — apply to editor"
                    >
                        <LuCheck size={12} /> Accept
                    </button>
                </div>
            </div>

            {/* Diff preview */}
            {showDiff && (
                <div className="ai-edit-proposal__diff">
                    {proposedLines.slice(0, 120).map((line, i) => {
                        const inCurrent = currentSet.has(line);
                        const isAdded = !inCurrent;
                        return (
                            <div
                                key={i}
                                className={`ai-edit-proposal__line${isAdded ? ' ai-edit-proposal__line--added' : ''}`}
                            >
                                <span className="ai-edit-proposal__line-num">{i + 1}</span>
                                <span className="ai-edit-proposal__line-marker">{isAdded ? '+' : ' '}</span>
                                <span className="ai-edit-proposal__line-content">{line || ' '}</span>
                            </div>
                        );
                    })}
                    {proposedLines.length > 120 && (
                        <div className="ai-edit-proposal__line" style={{ color: 'var(--text-tertiary)', fontSize: 11, padding: '4px 8px' }}>
                            ... {proposedLines.length - 120} more lines
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EditProposalBlock;
