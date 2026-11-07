import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LuBot, LuX, LuLoader, LuHourglass, LuSquarePen, LuSquare, LuPencil, LuSparkles, LuArrowUp, LuCircleHelp, LuTable, LuFile, LuChartColumn, LuDatabase, LuListChecks, LuLightbulb, LuAtSign, LuMessageSquareQuote, LuPaperclip } from 'react-icons/lu';
import DecisionDelAnalista from './DecisionDelAnalista';
import { AiModesGuideModal } from './AiModesGuide';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';
import PoliticaIAChip from '../workspaces/PoliticaIAChip';
import { groupIntoTurns, buildSessionArtifacts } from './deepDiveTurns';
import { armarInforme, seccionDeConsulta } from './informeDeepDive';
import InformeDeepDive from './deepDive/InformeDeepDive';
import IndiceDeepDive from './deepDive/IndiceDeepDive';
import ComoLoObtuve from './deepDive/ComoLoObtuve';
import ModelDropdown from './ModelDropdown';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';
import { exportConversationToMarkdown } from './exportConversation';

import { API_BASE as API } from '../../api.js';

// Remembers the transcript scroll position per conversation so switching tabs
// (e.g. opening a chart in Story Flow and coming back) doesn't reset to the top.
const scrollMemory = new Map();

// Rough parameter count (in billions) parsed from an Ollama model name, for the
// Deep Dive suitability hint. e2b/e4b (Gemma efficient variants) map to ~2/~4.
function estimateParamsB(modelName) {
    const n = String(modelName || '').toLowerCase();
    const eMatch = n.match(/:e(\d+)b/);           // gemma4:e2b → 2
    if (eMatch) return parseFloat(eMatch[1]);
    const bMatch = n.match(/(\d+(?:\.\d+)?)b/);    // qwen3.5:9b → 9, :0.8b → 0.8
    return bMatch ? parseFloat(bMatch[1]) : null;
}

/**
 * F6: a soft, dismissible hint when a small (<15B) local model is used for Deep
 * Dive — which genuinely benefits from a bigger model. Never blocks; it's advice.
 */
function DeepDiveModelHint({ provider, model }) {
    const [dismissed, setDismissed] = useState(false);
    if (provider !== 'ollama' || dismissed) return null;
    const params = estimateParamsB(model);
    if (params == null || params >= 15) return null;
    return (
        <span
            title="Deep Dive runs multi-step analyses that reward a stronger model. This one will work, but a local model ≥25B (e.g. qwen3.5:27b, gemma4:26b) or a cloud model gives noticeably deeper analysis. Smaller models shine in the editor Assistant."
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text-tertiary)', cursor: 'default' }}
        >
            <LuLightbulb size={11} style={{ color: 'var(--warning, #e0a030)' }} />
            <span>small model for Deep Dive</span>
            <LuX size={10} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); setDismissed(true); }} />
        </span>
    );
}

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
    onConversationChange,   // (convId, nombre) — la pestaña recuerda la sesión y se llama como ella
    onEsperaChange,         // (bool) — la sesión espera tu respuesta (la pestaña lo marca)
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
        modelStatus,

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
        interrupcion,
        esperaCuota,
    } = useAiChat({ mode: 'diving' });

    // ─── Session Name ───
    // Dos nombres guardados: `title` (el de la lista de conversaciones, sale de la
    // primera pregunta) y `session_name` (el que el usuario escribe). Se muestra el
    // del usuario si lo hay; al renombrar se escriben los dos para que coincidan.
    const [sessionName, setSessionName] = useState('');
    const [convTitle, setConvTitle] = useState('');
    const displayName = sessionName || convTitle;
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });
    const [showModesGuide, setShowModesGuide] = useState(false);

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

    // ─── The report: questions, answers and plan steps (plan UX, entrega 2) ───
    const episodios = useMemo(
        () => armarInforme(turns, { enCurso: isGenerating, saltados: userSkippedSteps }),
        [turns, isGenerating, userSkippedSteps],
    );
    const ultimoEpisodio = episodios[episodios.length - 1] || null;

    // "How I got this": the process behind one part of the report, on demand.
    // Stored as keys and resolved every render, so it follows the live analysis.
    const [panel, setPanel] = useState(null); // { seccionKey, queryId? } | null
    const seccionDelPanel = useMemo(() => {
        if (!panel) return null;
        for (const e of episodios) {
            for (const s of [e.intro, ...e.secciones]) if (s.key === panel.seccionKey) return { seccion: s, episodio: e };
        }
        return null;
    }, [panel, episodios]);
    useEffect(() => { setPanel(null); }, [conversationId]);

    // ─── Scroll: land on the answer, follow the live analysis ───
    const messagesElRef = useRef(null);
    const restoredScrollRef = useRef(false);
    const handleMessagesScroll = useCallback((e) => {
        if (conversationId) scrollMemory.set(conversationId, e.currentTarget.scrollTop);
    }, [conversationId]);
    const irA = useCallback((id, comportamiento = 'smooth') => {
        const el = document.getElementById(id);
        if (el && messagesElRef.current?.contains(el)) el.scrollIntoView({ behavior: comportamiento, block: 'start' });
    }, []);
    useEffect(() => {
        if (restoredScrollRef.current) return;
        const el = messagesElRef.current;
        if (!el || !conversationId || messages.length === 0) return;
        restoredScrollRef.current = true;
        const saved = scrollMemory.get(conversationId);
        // Back to where you were; on a fresh open, to the latest answer (the
        // report puts it on top of its analysis), or to the end if there is none.
        requestAnimationFrame(() => {
            const el = messagesElRef.current;
            if (!el) return;
            if (saved != null) { el.scrollTop = saved; return; }
            if (ultimoEpisodio?.respuesta) irA(`${ultimoEpisodio.id}-respuesta`, 'auto');
            else el.scrollTop = el.scrollHeight;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, messages.length]);
    // When an analysis concludes, show its answer (it sits above the steps).
    const generabaRef = useRef(false);
    useEffect(() => {
        if (generabaRef.current && !isGenerating && ultimoEpisodio?.respuesta) {
            requestAnimationFrame(() => irA(`${ultimoEpisodio.id}-respuesta`));
        }
        generabaRef.current = isGenerating;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isGenerating]);

    // ─── Room to read: fold the side bar when the report doesn't fit ───
    // (plan UX decision 1). Once per tab; the side bar comes back with its button.
    const raizRef = useRef(null);
    useEffect(() => {
        const ancho = raizRef.current?.getBoundingClientRect().width || 0;
        if (ancho > 0 && ancho < 860) window.dispatchEvent(new Event('amox_plegar_barra_lateral'));
    }, []);

    // ─── Auto-select escalated conversation on mount ───
    const didSelectStartConvRef = useRef(false);
    useEffect(() => {
        if (startConversationId && !didSelectStartConvRef.current) {
            didSelectStartConvRef.current = true;
            handleSelectConversation(startConversationId);
        }
    }, [startConversationId, handleSelectConversation]);

    // Remember this conversation on its tab (so switching tabs / reopening keeps it,
    // and "New Conversation" never reuses an existing tab's state). The tab takes
    // the session's name: with several sessions open they were all «Deep Dive».
    useEffect(() => {
        if (conversationId) onConversationChange?.(conversationId, displayName || null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, displayName]);

    // Reset session name when conversation changes
    useEffect(() => {
        setSessionName('');
        setConvTitle('');
        if (!conversationId) return;
        let vivo = true;
        const cargar = async () => {
            try {
                const res = await fetch(`${API}/api/ai/conversations/${conversationId}`);
                if (res.ok && vivo) {
                    const conv = await res.json();
                    setSessionName(conv.session_name || '');
                    setConvTitle(conv.title && conv.title !== 'New Conversation' ? conv.title : '');
                }
            } catch (err) {
                console.error('Failed to load session name:', err);
            }
        };
        cargar();
        // A brand-new session gets its title from the first question a moment later.
        window.addEventListener('amox_conversation_created', cargar);
        return () => { vivo = false; window.removeEventListener('amox_conversation_created', cargar); };
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
            // The list of conversations shows `title`: keep both names the same.
            await fetch(`${API}/api/ai/conversations/${conversationId}/title`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: name }),
            });
            window.dispatchEvent(new Event('amox_conversation_created'));
        } catch (err) {
            console.error('Failed to update session name:', err);
        }
    }, [conversationId]);

    // ─── The analyst is waiting for you ───
    // A question (ask_user) or "out of iterations": the tab and the list of
    // conversations mark the session, so a paused analysis is visible from anywhere.
    const esperando = !!(pendingAskUser || pendingContinue || interrupcion) && !isGenerating;
    useEffect(() => {
        onEsperaChange?.(esperando);
        if (conversationId) {
            window.dispatchEvent(new CustomEvent('amox_deep_dive_espera', { detail: { conversationId, espera: esperando } }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [esperando, conversationId]);

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
    // The button is placed where the selection WAS: it stayed floating over the
    // report after scrolling or after the selection was gone (seen in a real
    // session). It goes away when the selection does, on scroll, and with Escape.
    useEffect(() => {
        if (!selAsk) return undefined;
        const alCambiar = () => { if (window.getSelection()?.isCollapsed) setSelAsk(null); };
        const alTeclear = (e) => { if (e.key === 'Escape') setSelAsk(null); };
        document.addEventListener('selectionchange', alCambiar);
        window.addEventListener('keydown', alTeclear);
        return () => {
            document.removeEventListener('selectionchange', alCambiar);
            window.removeEventListener('keydown', alTeclear);
        };
    }, [selAsk]);

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
            className={`ai-composer${isDragOver ? ' ai-composer--dragover' : ''}${esperando ? ' ai-composer--atento' : ''}`}
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
                    placeholder={isDragOver
                        ? 'Drop tables or files to add as context…'
                        : pendingAskUser
                            ? 'Answer the analyst…'
                            : pendingContinue
                                ? 'Or tell the analyst how to go on…'
                                : 'Ask about your data. Type @ to point at a chart, query or step'}
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
                        modelStatus={modelStatus}
                    />
                    <DeepDiveModelHint provider={provider} model={selectedModel} />
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

    // ─── What the report's pieces can do (stable: the report re-renders on every flush) ───
    const acciones = useMemo(() => ({
        preguntar: handleAskAbout,
        seguir: sendFollowUp,
        exportarNotebook: onExportNotebook,
        exportarAmoxvis: onExportAmoxvis,
        verSeccion: (seccion, queryId) => setPanel({ seccionKey: seccion.key, queryId: queryId || null }),
        verConsulta: (queryId) => {
            const hallada = seccionDeConsulta(episodiosRef.current, queryId);
            if (hallada) setPanel({ seccionKey: hallada.seccion.key, queryId });
        },
        esperandoCuota: !!esperaCuota,
    }), [handleAskAbout, sendFollowUp, onExportNotebook, onExportAmoxvis, esperaCuota]);
    const episodiosRef = useRef(episodios);
    episodiosRef.current = episodios;

    // What the session leaves behind: its charts (they lead to where they are) and notebooks.
    const entregables = useMemo(() => {
        const graficos = [];
        const notebooks = [];
        for (const e of episodios) {
            for (const s of [e.intro, ...e.secciones]) {
                s.bloques.forEach((b, i) => {
                    if (b.tipo === 'grafico') graficos.push({ id: `${s.key}-g${i}`, titulo: b.tc.result.chartConfig.title || 'Chart' });
                });
            }
        }
        for (const m of messages) {
            for (const tc of m.toolCalls || []) {
                if (tc.toolName === 'build_notebook' && tc.result?.path && !notebooks.some(n => n.ruta === tc.result.path)) {
                    notebooks.push({ ruta: tc.result.path, nombre: tc.result.fileName || tc.result.path.split(/[/\\]/).pop() });
                }
            }
        }
        return { graficos, notebooks };
    }, [episodios, messages]);

    const hayInforme = episodios.length > 0;
    const pasoVivo = isGenerating ? ultimoEpisodio?.indice?.find(p => p.estado === 'in_progress') : null;

    // ═══════════════════════════════════════════════════════
    // RENDER — index · report · "How I got this" (plan UX, entrega 2)
    // ═══════════════════════════════════════════════════════
    return (
        <div className="ai-diving ddr" style={{ width }} ref={raizRef}>
            <header className="ddr-cab">
                <LuBot size={16} className="ai-diving-header-icon" />
                <NombreDeSesion nombre={displayName} editable={!!conversationId} onCambiar={handleUpdateSessionName} />
                {isGenerating && (esperaCuota
                    ? <EsperaDeCuota hasta={esperaCuota.hasta} />
                    : (
                        <span className="ddr-chip ddr-chip--vivo">
                            <LuLoader size={11} className="ddr-gira" />
                            {pasoVivo && ultimoEpisodio?.indice?.length
                                ? `Analyzing · step ${pasoVivo.numero} of ${ultimoEpisodio.indice.length}`
                                : 'Analyzing'}
                        </span>
                    ))}
                {/* Any provider but the local one sends data out: say so for all of them. */}
                {provider && provider !== 'ollama' && (
                    <span className="ai-badge-cloud" title="This model runs in the cloud">CLOUD</span>
                )}
                <PoliticaIAChip />
                <span className="ddr-cab-der">
                    {isGenerating && (
                        <button className="ddr-btn ddr-btn--peligro" onClick={handleCancel} title="Stop the analysis">
                            <LuSquare size={11} /> Stop
                        </button>
                    )}
                    {/* It never deleted anything: it empties the view and starts over.
                        The session stays in the list, where it can be deleted. */}
                    {messages.length > 0 && !isGenerating && (
                        <button className="ai-icon-btn" onClick={handleClearChat} title="New session (this one stays in the list)">
                            <LuSquarePen size={14} />
                        </button>
                    )}
                    <button className="ai-icon-btn" onClick={() => setShowModesGuide(true)} title="About the AI modes">
                        <LuCircleHelp size={14} />
                    </button>
                </span>
            </header>
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
                <div className={`ddr-zonas${hayInforme ? '' : ' ddr-zonas--vacio'}${seccionDelPanel ? ' ddr-zonas--panel' : ''}`}>
                    {hayInforme && (
                        <IndiceDeepDive
                            episodios={episodios}
                            isGenerating={isGenerating}
                            onIr={irA}
                            onSaltar={handleSkipPlanStep}
                            entregables={entregables}
                            onGuardarNotebook={() => sendFollowUp('Save this analysis as a notebook — include the queries, the charts, and a short narrative for each section.')}
                            onExportar={() => exportConversationToMarkdown(messages, displayName || 'Deep Dive')}
                            onAbrirArchivo={onOpenFile}
                        />
                    )}

                    <section className="ddr-informe">
                        <div className="ai-diving-messages ddr-scroll" ref={messagesElRef} onScroll={(e) => { handleMessagesScroll(e); if (selAsk) setSelAsk(null); }} onMouseUp={handleThreadMouseUp}>
                            {hayInforme ? (
                                <InformeDeepDive
                                    episodios={episodios}
                                    allMessages={messages}
                                    acciones={acciones}
                                />
                            ) : emptyState}
                            <div ref={chatEndRef} />
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
                            {/* What the analyst needs from you, right where you type. */}
                            {!isGenerating && (
                                <DecisionDelAnalista
                                    pregunta={pendingAskUser}
                                    continuar={pendingAskUser ? null : pendingContinue}
                                    interrupcion={pendingAskUser ? null : interrupcion}
                                    progreso={ultimoEpisodio
                                        ? {
                                            hechos: (ultimoEpisodio.indice || []).filter(p => p.estado === 'done').length,
                                            total: ultimoEpisodio.indice?.length || 0,
                                            vacio: !ultimoEpisodio.secciones.length && !ultimoEpisodio.intro.bloques.length,
                                        }
                                        : null}
                                    // handleSend clears the question only once the answer is
                                    // really sent: with no model chosen, it used to vanish
                                    // and the answer went nowhere.
                                    onElegir={(op) => handleSend(op)}
                                    onContinuar={(instr) => handleContinue(instr)}
                                    onTerminar={handleFinalizeNow}
                                    onDetener={handleDeclineContinue}
                                />
                            )}
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
                    </section>

                    {seccionDelPanel && (
                        <ComoLoObtuve
                            seccion={seccionDelPanel.seccion}
                            focoQueryId={panel?.queryId}
                            enCurso={seccionDelPanel.episodio.enCurso}
                            onClose={() => setPanel(null)}
                            onRunSql={onRunSql}
                            onAskAbout={handleAskAbout}
                        />
                    )}
                </div>
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

/**
 * F9: the provider's per-minute quota ran out and the server is waiting it out
 * before repeating the step. A countdown, so the pause doesn't look like a hang.
 */
function EsperaDeCuota({ hasta }) {
    const [ahora, setAhora] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 500);
        return () => clearInterval(t);
    }, []);
    const faltan = Math.max(0, Math.ceil((hasta - ahora) / 1000));
    return (
        <span className="ddr-chip ddr-chip--aviso" title="The model's provider allows only so many requests a minute. Your progress is safe; the analysis resumes on its own.">
            <LuHourglass size={11} />
            {faltan > 0 ? `Waiting for the quota · resumes in ${faltan} s` : 'Resuming…'}
        </span>
    );
}

/**
 * The session's name in the header, renamed in place (it used to live at the
 * top of the right column, away from everything else that names the session).
 */
function NombreDeSesion({ nombre, editable, onCambiar }) {
    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState(nombre || '');
    useEffect(() => { setValor(nombre || ''); }, [nombre]);
    const confirmar = () => {
        setEditando(false);
        const t = valor.trim();
        if (t && t !== nombre) onCambiar?.(t); else setValor(nombre || '');
    };
    if (editando) {
        return (
            <input
                className="ddr-nombre-input"
                value={valor}
                autoFocus
                spellCheck={false}
                onChange={(e) => setValor(e.target.value)}
                onBlur={confirmar}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmar();
                    else if (e.key === 'Escape') { e.stopPropagation(); setValor(nombre || ''); setEditando(false); }
                }}
                aria-label="Session name"
            />
        );
    }
    return (
        <button className="ddr-nombre" disabled={!editable} onClick={() => setEditando(true)} title={editable ? 'Rename this session' : undefined}>
            <span>{nombre || 'Deep Dive'}</span>
            {editable && <LuPencil size={11} className="ddr-nombre-lapiz" />}
        </button>
    );
}

export default AiDivingPanel;
