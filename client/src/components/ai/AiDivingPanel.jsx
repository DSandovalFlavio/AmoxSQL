import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuSend, LuTrash2, LuArrowLeft, LuWand, LuSparkles, LuDownload, LuArrowUp, LuCircleHelp, LuTable, LuFile, LuChartColumn, LuDatabase, LuListChecks, LuLightbulb, LuAtSign, LuMessageSquareQuote, LuPaperclip } from 'react-icons/lu';
import { AiModesGuideModal } from './AiModesGuide';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';
import ChatMessage from './ChatMessage';
import DeepDiveTranscript from './DeepDiveTranscript';
import DeepDiveInspector from './DeepDiveInspector';
import { groupIntoTurns, buildSessionArtifacts, buildStepGroups } from './deepDiveTurns';
import ToolCallBlock from './ToolCallBlock';
import ModelDropdown from './ModelDropdown';
import SessionInventory from './SessionInventory';
import AgentPlanPanel from './AgentPlanPanel';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';
import { exportConversationToMarkdown } from './exportConversation';

import { API_BASE as API } from '../../api.js';

// Remembers the transcript scroll position per conversation so switching tabs
// (e.g. opening a chart in Story Flow and coming back) doesn't reset to the top.
const scrollMemory = new Map();

/**
 * AiDivingPanel — Full 3-column Data Diving mode.
 * Replaces the diving branch of AiSidebar.jsx, powered by the useAiChat hook.
 */
const AiDivingPanel = ({
    width,
    onRunSql,
    onExportNotebook,
    onExportAmoxvis,
    onOpenFile,
    availableTables,
    startConversationId,
    onConversationChange,
}) => {
    // First-run Deep Dive tour (rendered by the global OnboardingHost)
    useEffect(() => {
        if (!hasSeenTour('deep-dive')) openTour('deep-dive');
    }, []);

    const {
        // Live-discovered cloud model list
        cloudModelsList,

        // Config state
        status, setStatus: _setStatus,
        provider,
        selectedModel, setSelectedModel,
        customModel, setCustomModel,
        installedModels,
        isModelsLoading,

        // Skills state
        availableSkills,
        activeSkillId, setActiveSkillId,

        // Context state
        contextObjects,
        isDragOver, setIsDragOver,

        // Artifact references ("Ask about this")
        pendingReferences, addReference, removeReference,

        // Chat state
        messages,
        inputText, setInputText,
        isGenerating,
        streamingText,
        streamingId,
        isThinking,
        activeToolCalls,
        errorMsg, setErrorMsg,
        conversationId,

        // Refs
        chatEndRef,
        inputRef,

        // Computed
        modelToUse,

        // Handlers
        handleDrop,
        removeContextObj,
        handleSend,
        handleKeyDown,
        handleClearChat,
        handleNewConversation,
        handleSelectConversation,
        handleCancel,

        // Agentic plan state
        planState,
        planIteration,
        planMaxIterations,
        pendingAskUser, setPendingAskUser,
        pendingContinue,
        handleContinue,
        handleFinalizeNow,
        handleDeclineContinue,
        userSkippedSteps,
        handleSkipPlanStep,
    } = useAiChat({ mode: 'diving' });

    // ─── Session Name ───
    const [sessionName, setSessionName] = useState('');
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });
    const [showModesGuide, setShowModesGuide] = useState(false);
    // Continue banner: optional focus instruction for the resumed analysis.
    const [continueInstr, setContinueInstr] = useState('');
    const [showContinueInput, setShowContinueInput] = useState(false);

    // ─── Turns (transcript) + selected turn (inspector) ───
    // Historical turns derive ONLY from messages: their identity survives both
    // stream flushes and composer keystrokes, so each memoized <TranscriptTurn>
    // bails out and only the live turn re-renders while streaming.
    const historicalTurns = useMemo(() => groupIntoTurns(messages), [messages]);
    const turns = useMemo(() => {
        if (isGenerating && (streamingText || activeToolCalls.length > 0)) {
            // The live turn borrows the id the final message will carry, so when
            // it becomes historical the turn identity (and inspector selection)
            // is continuous — no churn, no re-click.
            const liveId = streamingId || '__live__';
            return [...historicalTurns, {
                id: liveId, type: 'ai', text: streamingText || '', inProgress: true,
                messages: [{ id: liveId, role: 'assistant', content: streamingText || '', toolCalls: activeToolCalls }],
            }];
        }
        return historicalTurns;
    }, [historicalTurns, isGenerating, streamingText, activeToolCalls, streamingId]);

    // handleSend's identity changes on every composer keystroke (depends on
    // inputText). Children must receive a STABLE callback or their memo dies
    // per keystroke — the transcript would re-parse all markdown while typing.
    const handleSendRef = useRef(handleSend);
    useEffect(() => { handleSendRef.current = handleSend; });
    const sendFollowUp = useCallback((text) => handleSendRef.current(text), []);

    // The user's explicit pin (null = auto-follow). Clicking a turn pins it; a
    // new run clears it so the inspector follows the fresh analysis.
    const [pinnedTurnId, setPinnedTurnId] = useState(null);

    // New run → drop the pin so we auto-follow the new turn (edge-triggered).
    const wasGeneratingRef = useRef(false);
    useEffect(() => {
        if (isGenerating && !wasGeneratingRef.current) setPinnedTurnId(null);
        wasGeneratingRef.current = isGenerating;
    }, [isGenerating]);

    // Selection is DERIVED (no lagging effect, so no empty-state flash):
    //  - a live pin wins as long as that turn still exists;
    //  - while generating, follow the live/last turn;
    //  - otherwise the last AI turn that actually has step activity (skip a
    //    trailing prose-only turn), falling back to the last AI turn.
    const selectedTurnId = useMemo(() => {
        if (pinnedTurnId && turns.some(t => t.id === pinnedTurnId)) return pinnedTurnId;
        if (isGenerating && turns.length) return turns[turns.length - 1].id;
        const aiTurns = turns.filter(t => t.type === 'ai');
        if (!aiTurns.length) return null;
        const withActivity = [...aiTurns].reverse().find(t => buildStepGroups(t).length > 0);
        return (withActivity || aiTurns[aiTurns.length - 1]).id;
    }, [pinnedTurnId, turns, isGenerating]);

    const selectedTurn = turns.find(t => t.id === selectedTurnId) || null;

    // ─── Preserve transcript scroll across tab switches / remounts ───
    const messagesElRef = useRef(null);
    const restoredScrollRef = useRef(false);
    const handleMessagesScroll = useCallback((e) => {
        if (conversationId) scrollMemory.set(conversationId, e.currentTarget.scrollTop);
    }, [conversationId]);
    useEffect(() => {
        if (restoredScrollRef.current) return;
        const el = messagesElRef.current;
        if (!el || !conversationId || messages.length === 0) return;
        restoredScrollRef.current = true;
        const saved = scrollMemory.get(conversationId);
        // Restore the saved spot, or land at the bottom (latest) on a fresh open.
        requestAnimationFrame(() => {
            const el = messagesElRef.current;
            if (el) el.scrollTop = saved != null ? saved : el.scrollHeight;
        });
    }, [conversationId, messages.length]);

    // ─── Auto-select escalated conversation on mount ───
    const didSelectStartConvRef = useRef(false);
    useEffect(() => {
        if (startConversationId && !didSelectStartConvRef.current) {
            didSelectStartConvRef.current = true;
            handleSelectConversation(startConversationId);
        }
    }, [startConversationId, handleSelectConversation]);

    // Remember this conversation on its tab (so switching tabs / reopening keeps it,
    // and "New Conversation" never reuses an existing tab's state).
    useEffect(() => {
        if (conversationId) onConversationChange?.(conversationId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    // Reset session name when conversation changes
    useEffect(() => {
        setSessionName('');
        if (!conversationId) return;
        // Load existing session name
        (async () => {
            try {
                const res = await fetch(`${API}/api/ai/conversations/${conversationId}`);
                if (res.ok) {
                    const conv = await res.json();
                    setSessionName(conv.session_name || '');
                }
            } catch (err) {
                console.error('Failed to load session name:', err);
            }
        })();
    }, [conversationId]);

    const handleUpdateSessionName = useCallback(async (name) => {
        setSessionName(name);
        if (!conversationId) return;
        try {
            await fetch(`${API}/api/ai/conversations/${conversationId}/session-name`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionName: name }),
            });
        } catch (err) {
            console.error('Failed to update session name:', err);
        }
    }, [conversationId]);

    // ─── Auto-create artifacts for build_notebook, display_chart, and save_to_vault ───
    // Dedup key per tool call (STABLE across reload: toolCallId is persisted), so a
    // chart/notebook/vault artifact is POSTed exactly once — never duplicated on a
    // reload or an unrelated messages change.
    const ARTIFACT_TOOLS = { build_notebook: 'notebook', display_chart: 'chart', save_to_vault: 'sql' };
    const processedArtifactsRef = useRef(new Set());

    // Seed the processed set on conversation switch so already-persisted artifacts
    // are never re-POSTed (and notebooks aren't re-opened) after a reload.
    useEffect(() => {
        const seen = new Set();
        for (const msg of messages) {
            if (msg.role !== 'assistant' || !msg.toolCalls) continue;
            for (const tc of msg.toolCalls) {
                if (ARTIFACT_TOOLS[tc.toolName] && tc.result && !tc.result.error) {
                    seen.add(`${tc.toolName}:${tc.toolCallId}`);
                }
            }
        }
        processedArtifactsRef.current = seen;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    // Post any new artifacts the agent just produced and tell the inventory panel
    // to refresh (it otherwise only fetches on conversation switch — the reason a
    // freshly-charted analysis showed "0 artifacts" until reopened).
    useEffect(() => {
        if (!conversationId || messages.length === 0) return;
        let anyPosted = false;

        for (const msg of messages) {
            if (msg.role !== 'assistant' || !msg.toolCalls) continue;
            for (const tc of msg.toolCalls) {
                const type = ARTIFACT_TOOLS[tc.toolName];
                if (!type || !tc.result || tc.result.error) continue;
                const key = `${tc.toolName}:${tc.toolCallId}`;
                if (processedArtifactsRef.current.has(key)) continue;
                processedArtifactsRef.current.add(key);
                anyPosted = true;

                const name =
                    tc.toolName === 'build_notebook' ? (tc.result.fileName || tc.result.name || 'Analysis Notebook')
                    : tc.toolName === 'display_chart' ? (tc.result?.chartConfig?.title || tc.args?.title || 'Chart')
                    : (tc.result?.title || 'Vault Entry');

                (async () => {
                    try {
                        await fetch(`${API}/api/ai/sessions/${conversationId}/artifacts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type, name, data: tc.result }),
                        });
                        // Nudge the inventory panel to refetch its artifact list.
                        window.dispatchEvent(new Event('amox_artifacts_changed'));
                    } catch (err) {
                        console.error('Failed to auto-create artifact:', err);
                    }
                })();

                // Notebooks: refresh the file tree and open the file on first creation.
                if (tc.toolName === 'build_notebook') {
                    window.dispatchEvent(new Event('amox_files_changed'));
                    if (onOpenFile && tc.result.path) onOpenFile(tc.result.path);
                }
            }
        }

        // A no-op read of anyPosted keeps the intent explicit for future edits.
        void anyPosted;
    }, [messages, conversationId, onOpenFile]);

    // ─── Empty state (no conversation yet) ───
    const emptyState = (
        <div className="ai-empty-state ai-empty-state--diving">
            <div className="ai-empty-state-icon">
                <LuSparkles size={40} />
            </div>
            <h2 className="ai-empty-state-title">Deep Dive</h2>
            <div className="ai-empty-state-hint">
                Your autonomous analyst — hand it a question and it plans, explores your data, and tells the story.
            </div>
            <div className="ai-quick-actions">
                <button className="ai-quick-action" onClick={() => handleSend('Show me all tables')}>
                    Show all tables
                </button>
                <button className="ai-quick-action" onClick={() => handleSend('Describe the schema')}>
                    Describe schema
                </button>
                <button className="ai-quick-action" onClick={() => handleSend('Show sample data')}>
                    Sample data
                </button>
            </div>
        </div>
    );

    // "Ask about this" → add reference + focus the input so the user types the question
    const handleAskAbout = useCallback((ref) => {
        addReference(ref);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [addReference, inputRef]);

    // ─── Select text/number in a response → floating "Ask about this" ───
    const [selAsk, setSelAsk] = useState(null); // { x, y, text, queryId } | null
    const handleThreadMouseUp = useCallback(() => {
        const sel = window.getSelection();
        const text = sel ? sel.toString().trim() : '';
        if (!sel || sel.isCollapsed || text.length < 2 || text.length > 300) { setSelAsk(null); return; }
        try {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            // Find a queryId from an ancestor that carries one (e.g. a cited value)
            let node = range.startContainer;
            let queryId;
            while (node && node !== document.body) {
                if (node.dataset?.queryId) { queryId = node.dataset.queryId; break; }
                node = node.parentElement;
            }
            setSelAsk({ x: rect.left + rect.width / 2, y: rect.top, text, queryId });
        } catch { setSelAsk(null); }
    }, []);
    const askAboutSelection = useCallback(() => {
        if (!selAsk) return;
        handleAskAbout({
            type: selAsk.queryId ? 'number' : 'text',
            findingText: selAsk.text,
            queryId: selAsk.queryId,
            label: `"${selAsk.text.slice(0, 32)}${selAsk.text.length > 32 ? '…' : ''}"`,
            key: `sel:${selAsk.text.slice(0, 40)}`,
        });
        setSelAsk(null);
        window.getSelection()?.removeAllRanges();
    }, [selAsk, handleAskAbout]);

    // ─── @/# mention autocomplete (reference any session artifact by typing) ───
    const sessionArtifacts = useMemo(() => {
        const base = buildSessionArtifacts(messages, availableTables);
        // Shared conversation context (dropped tables/files) is referenceable too.
        const ctx = contextObjects.map(o => ({
            type: o.type === 'table' ? 'table' : 'file',
            table: o.name,
            label: `${o.type === 'table' ? 'Table' : 'File'}: ${o.name}`,
            key: `ctx:${o.type}:${o.name}`,
        }));
        const seen = new Set();
        return [...ctx, ...base].filter(a => (seen.has(a.key) ? false : (seen.add(a.key), true)));
    }, [messages, availableTables, contextObjects]);
    const [mention, setMention] = useState(null); // { query, start } | null

    const handleInputChange = useCallback((e) => {
        const value = e.target.value;
        const caret = e.target.selectionStart ?? value.length;
        setInputText(value);
        const m = /[@#]([\w-]*)$/.exec(value.slice(0, caret));
        setMention(m ? { query: m[1].toLowerCase(), start: caret - m[0].length } : null);
    }, [setInputText]);

    const mentionMatches = useMemo(() => {
        if (!mention) return [];
        return sessionArtifacts.filter(a => a.label.toLowerCase().includes(mention.query)).slice(0, 8);
    }, [mention, sessionArtifacts]);

    const pickMention = useCallback((ref) => {
        setInputText(prev => {
            if (!mention) return prev;
            const before = prev.slice(0, mention.start);
            const after = prev.slice(mention.start).replace(/^[@#][\w-]*/, '');
            return before + after;
        });
        addReference(ref);
        setMention(null);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [mention, addReference, setInputText, inputRef]);

    const handleComposerKeyDown = useCallback((e) => {
        if (mention && mentionMatches.length > 0) {
            if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pickMention(mentionMatches[0]); return; }
        }
        handleKeyDown(e);
    }, [mention, mentionMatches, pickMention, handleKeyDown]);

    const mentionIcon = (type) => {
        switch (type) {
            case 'chart': return <LuChartColumn size={12} />;
            case 'query': return <LuDatabase size={12} />;
            case 'step': return <LuListChecks size={12} />;
            case 'table': return <LuTable size={12} />;
            case 'file': return <LuFile size={12} />;
            default: return <LuAtSign size={12} />;
        }
    };

    // Canonical quick-actions over the referenced artifact(s) — send with the
    // pending references already attached as turn context.
    const QUICK_ACTIONS = [
        { label: 'Explain', text: 'Explain this in plain terms — what does it show and why does it matter?' },
        { label: 'Redo differently', text: 'Show this a different way — pick a better chart or framing for the same data.' },
        { label: 'Go deeper', text: 'Go deeper on this — break it down further and surface what is driving it.' },
        { label: 'Validate', text: 'Validate this — is it real or noise? Check the numbers and call out caveats.' },
    ];

    // Icon for an artifact reference chip, by type
    const refIcon = (type) => {
        switch (type) {
            case 'chart': return <LuChartColumn size={11} />;
            case 'query': return <LuDatabase size={11} />;
            case 'step': return <LuListChecks size={11} />;
            case 'finding': return <LuLightbulb size={11} />;
            case 'table': return <LuTable size={11} />;
            case 'file': return <LuFile size={11} />;
            default: return <LuAtSign size={11} />;
        }
    };

    // ─── Input composer (with context attach: drop tables/files here) ───
    const inputComposer = (
        <div
            className={`ai-composer${isDragOver ? ' ai-composer--dragover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
        >
            {pendingReferences.length > 0 && (
                <>
                    <div className="ai-composer-context ai-composer-refs">
                        {pendingReferences.map((ref, i) => (
                            <span key={ref.key || i} className="ai-composer-chip ai-composer-chip--ref" title={ref.label}>
                                {refIcon(ref.type)}
                                <span className="ai-composer-chip-name">{ref.label}</span>
                                <button className="ai-composer-chip-x" onClick={() => removeReference(i)} title="Remove reference">
                                    <LuX size={10} />
                                </button>
                            </span>
                        ))}
                    </div>
                    {!inputText.trim() && !isGenerating && (
                        <div className="ai-quick-action-row">
                            {QUICK_ACTIONS.map(qa => (
                                <button
                                    key={qa.label}
                                    className="ai-quick-action-chip"
                                    onClick={() => handleSend(qa.text)}
                                    title={qa.text}
                                >
                                    {qa.label}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
            <div className="ai-mention-wrap">
                {mention && mentionMatches.length > 0 && (
                    <div className="ai-mention-popup">
                        <div className="ai-mention-popup-head">Reference an artifact</div>
                        {mentionMatches.map((a, i) => (
                            <button
                                key={a.key}
                                className={`ai-mention-item${i === 0 ? ' ai-mention-item--first' : ''}`}
                                onMouseDown={(e) => { e.preventDefault(); pickMention(a); }}
                            >
                                {mentionIcon(a.type)}
                                <span className="ai-mention-item-label">{a.label}</span>
                                <span className="ai-mention-item-type">{a.type}</span>
                            </button>
                        ))}
                    </div>
                )}
                <textarea
                    className="ai-textarea"
                    ref={inputRef}
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleComposerKeyDown}
                    onBlur={() => setTimeout(() => setMention(null), 120)}
                    placeholder={isDragOver ? 'Drop tables or files to add as context…' : 'Ask about your data — type @ to reference a chart/query/step…'}
                    rows={1}
                    onInput={(e) => {
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                />
            </div>
            <div className="ai-composer-toolbar">
                <div className="ai-composer-toolbar-left">
                    <ModelDropdown 
                        provider={provider}
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        installedModels={installedModels}
                        cloudModelsList={cloudModelsList}
                        customModel={customModel}
                        setCustomModel={setCustomModel}
                        isModelsLoading={isModelsLoading}
                    />
                </div>
                <div className="ai-composer-toolbar-right">
                    <span className="ai-composer-hint">{'Enter \u21B5'}</span>
                    <button
                        className={`ai-composer-send${isGenerating ? ' cancel' : (inputText.trim() ? ' ready' : ' idle')}`}
                        onClick={isGenerating ? handleCancel : () => handleSend()}
                        disabled={!isGenerating && !inputText.trim()}
                    >
                        {isGenerating ? <LuX size={16} strokeWidth={2.5} /> : <LuArrowUp size={18} strokeWidth={2.5} />}
                    </button>
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════
    // RENDER — 3-column layout
    // ═══════════════════════════════════════════════════════
    return (
        <div className="ai-diving ai-diving--no-list" style={{ width }}>
            {/* Conversations now live in the main left sidebar (Deep Dive section) */}

            {/* ─── Center column: Chat ─── */}
            <div className="ai-diving-center">
                {/* Diving header */}
                <div className="ai-diving-header">
                    <div className="ai-diving-header-left">
                        <LuBot size={16} className="ai-diving-header-icon" />
                        <span className="ai-diving-header-title">Deep Dive</span>
                        {provider === 'gemini' && (
                            <span className="ai-badge-cloud">CLOUD</span>
                        )}
                    </div>
                    <div className="ai-diving-header-right">
                        {messages.length > 0 && (
                            <button
                                className="ai-icon-btn"
                                onClick={() => exportConversationToMarkdown(messages, sessionName || 'Deep Dive')}
                                title="Export conversation to Markdown"
                            >
                                <LuDownload size={14} />
                            </button>
                        )}
                        {messages.length > 0 && (
                            <button className="ai-icon-btn" onClick={handleClearChat} title="Clear chat">
                                <LuTrash2 size={14} />
                            </button>
                        )}
                        <button className="ai-icon-btn" onClick={() => setShowModesGuide(true)} title="About the AI modes">
                            <LuCircleHelp size={14} />
                        </button>
                    </div>
                </div>
                <AiModesGuideModal isOpen={showModesGuide} onClose={() => setShowModesGuide(false)} />

                {status === 'LOADING' && (
                    <div className="ai-loading">
                        <LuLoader size={30} style={{ marginBottom: '15px', animation: 'spin 2s linear infinite', color: 'var(--accent-primary)' }} />
                        <h3>Loading AI Engine...</h3>
                    </div>
                )}

                {status === 'ERROR' && (
                    <div className="ai-error-state">
                        Error loading AI configuration.
                        <button onClick={() => window.location.reload()}>Retry</button>
                    </div>
                )}

                {status === 'READY' && (
                    <div className="ai-diving-split">
                        {/* LEFT: conversation thread + composer */}
                        <div className="ai-diving-thread">
                            <div className="ai-diving-messages" ref={messagesElRef} onScroll={handleMessagesScroll} onMouseUp={handleThreadMouseUp}>
                                <div className="ai-diving-messages-inner">
                                    {turns.length === 0 && !isGenerating ? emptyState : (
                                        <DeepDiveTranscript
                                            turns={turns}
                                            selectedTurnId={selectedTurnId}
                                            onSelect={setPinnedTurnId}
                                            onFollowUp={sendFollowUp}
                                            onAskAbout={handleAskAbout}
                                            isGenerating={isGenerating}
                                        />
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                            </div>

                            {errorMsg && (
                                <div className="ai-error-bar">
                                    <span>{errorMsg}</span>
                                    <button onClick={() => setErrorMsg(null)}>
                                        <LuX size={12} />
                                    </button>
                                </div>
                            )}

                            <div className="ai-diving-composer-wrap">
                                <div className="ai-diving-composer">
                                    {contextObjects.length > 0 && (
                                        <div className="ai-context-bar">
                                            <div className="ai-context-bar-head">
                                                <LuPaperclip size={12} />
                                                <span className="ai-context-bar-title">Context for this conversation</span>
                                                <span className="ai-context-bar-hint">always available · reference with @</span>
                                            </div>
                                            <div className="ai-context-bar-chips">
                                                {contextObjects.map((obj, i) => (
                                                    <span key={i} className="ai-composer-chip ai-context-chip">
                                                        {obj.type === 'table' ? <LuTable size={11} /> : <LuFile size={11} />}
                                                        <span className="ai-composer-chip-name">{obj.name}</span>
                                                        <button className="ai-composer-chip-x" onClick={() => removeContextObj(i)} title="Remove from context">
                                                            <LuX size={10} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {inputComposer}
                                </div>
                            </div>
                        </div>

                        {/* CENTER: step inspector */}
                        <div className="ai-diving-inspector-pane">
                            <DeepDiveInspector
                                turn={selectedTurn}
                                allMessages={messages}
                                onRunSql={onRunSql}
                                onFollowUp={sendFollowUp}
                                onAskAbout={handleAskAbout}
                                onExportNotebook={onExportNotebook}
                                onExportAmoxvis={onExportAmoxvis}
                                onOpenFile={onOpenFile}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Right column: Session Inventory (contains Agent Plan when active) ─── */}
            {status === 'READY' && (
                <SessionInventory
                    contextObjects={contextObjects}
                    isDragOver={isDragOver}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onRemoveContext={removeContextObj}
                    onQuickAction={(text) => handleSend(text)}
                    hasMessages={messages.length > 0}
                    conversationId={conversationId}
                    onOpenFile={onOpenFile}
                    sessionName={sessionName}
                    onUpdateSessionName={handleUpdateSessionName}
                >
                    {/* Agent Plan panel — visible only when a plan is active */}
                    <AgentPlanPanel
                        planState={planState}
                        isGenerating={isGenerating}
                        iteration={planIteration}
                        maxIterations={planMaxIterations}
                        onSkipStep={handleSkipPlanStep}
                        userSkippedSteps={userSkippedSteps}
                    />

                    {/* Ask-user banner — shown when agent pauses for input */}
                    {pendingAskUser && (
                        <div className="ai-ask-user-banner">
                            <p className="ai-ask-user-question">{pendingAskUser.question}</p>
                            {pendingAskUser.options.length > 0 ? (
                                <div className="ai-ask-user-options">
                                    {pendingAskUser.options.map((opt, i) => (
                                        <button
                                            key={i}
                                            className="ai-ask-user-option"
                                            onClick={() => {
                                                setPendingAskUser(null);
                                                handleSend(opt);
                                            }}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="ai-ask-user-hint">Type your answer in the chat input.</p>
                            )}
                        </div>
                    )}

                    {/* Continue banner — loop exhausted without final_answer, or a
                        paused plan was reopened. Offers focus/continue/finish/cancel. */}
                    {pendingContinue && (
                        <div className="ai-ask-user-banner ai-continue-banner">
                            <p className="ai-ask-user-question">
                                {pendingContinue.resumed
                                    ? 'Este análisis quedó pausado sin terminar.'
                                    : 'El análisis necesita más iteraciones para completarse.'}
                                {pendingContinue.pendingSteps > 0 && ` Quedan ${pendingContinue.pendingSteps} paso(s) pendientes.`}
                            </p>

                            {showContinueInput && (
                                <textarea
                                    className="ai-continue-instr"
                                    placeholder="Instrucciones para continuar (opcional): p.ej. «solo termina s6, ignora el resto»"
                                    value={continueInstr}
                                    onChange={e => setContinueInstr(e.target.value)}
                                    rows={2}
                                    autoFocus
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            handleContinue(continueInstr);
                                            setContinueInstr(''); setShowContinueInput(false);
                                        }
                                    }}
                                />
                            )}

                            <div className="ai-ask-user-options">
                                <button
                                    className="ai-ask-user-option ai-continue-btn"
                                    onClick={() => {
                                        handleContinue(showContinueInput ? continueInstr : undefined);
                                        setContinueInstr(''); setShowContinueInput(false);
                                    }}
                                >
                                    {showContinueInput && continueInstr.trim() ? 'Continuar con esto' : 'Continuar'}
                                </button>
                                {!showContinueInput && (
                                    <button
                                        className="ai-ask-user-option ai-continue-btn--ghost"
                                        onClick={() => setShowContinueInput(true)}
                                        title="Dirigir cómo continúa el análisis"
                                    >
                                        Con instrucciones…
                                    </button>
                                )}
                                <button
                                    className="ai-ask-user-option ai-continue-btn--ghost"
                                    onClick={() => { handleFinalizeNow(); setContinueInstr(''); setShowContinueInput(false); }}
                                    title="Sintetiza lo que ya tiene, sin correr más pasos"
                                >
                                    Finalizar con lo que hay
                                </button>
                                <button
                                    className="ai-ask-user-option ai-continue-btn--cancel"
                                    onClick={() => { handleDeclineContinue(); setContinueInstr(''); setShowContinueInput(false); }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </SessionInventory>
            )}

            {selAsk && (
                <button
                    className="ai-sel-ask"
                    style={{ left: selAsk.x, top: selAsk.y }}
                    onMouseDown={(e) => { e.preventDefault(); askAboutSelection(); }}
                >
                    <LuMessageSquareQuote size={12} /> Ask about this
                </button>
            )}

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))}
                title="AmoxSQL AI"
                message={alertData.message}
                type="info"
            />
        </div>
    );
};

export default AiDivingPanel;
