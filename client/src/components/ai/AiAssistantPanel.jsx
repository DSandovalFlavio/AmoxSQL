import { useState, useEffect, useRef, useCallback } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuTrash2, LuTable, LuFile, LuDatabase, LuBrain, LuSparkles, LuGripVertical, LuHistory, LuMessageSquarePlus, LuDownload, LuArrowUpRight, LuArrowUp, LuCircleHelp, LuChartColumn, LuListChecks, LuLightbulb, LuAtSign, LuTextSelect } from 'react-icons/lu';
import { AiModesGuideModal } from './AiModesGuide';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';
import ChatMessage from './ChatMessage';
import ToolCallBlock from './ToolCallBlock';
import FileConversationList from './FileConversationList';
import ModelDropdown from './ModelDropdown';
import PoliticaIAChip from '../workspaces/PoliticaIAChip';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';
import { exportConversationToMarkdown } from './exportConversation';
import { inicioDe, tipoDePestana } from './archivos/index.js';
import { esDeRango } from './archivos/rango.js';
import { esDeCelda } from './archivos/cuaderno.js';
import { esDeLamina } from './archivos/deck.js';
import { esDeGrafico } from './archivos/grafico.js';
import { esDePasos } from './archivos/flujo.js';
import { esDeTarjeta } from './archivos/lienzo.js';
import { esDeDiagrama } from './archivos/diagrama.js';
import { publicarPropuestas, pedirRevision } from './propuestasEnEditor.js';

import { API_BASE as API } from '../../api.js';

/**
 * AiAssistantPanel — File-aware AI assistant sidebar panel.
 * Two views: 'chat' (active conversation) and 'history' (list of all chats).
 */
const AiAssistantPanel = ({
    activeFilePath,
    activeFileType,
    // Stable getter — returns { path, name, type, content, results, chartConfig, ... }
    // for the active tab, read on demand (at send time) instead of via reactive
    // props, so typing in the editor never re-renders this panel (G8).
    getActiveTabInfo,
    onEditFile,
    // «Apply to chart» and «Insert at cursor» only make sense in a .sql: a
    // notebook or a deck has no one chart, and its editor is not Monaco's.
    onUpdateChartConfig,
    onInsertarEnEditor,
    onOpenFile,
    onRunSql,
    onClose,
    availableTables,
    onOpenSettings,
    onResize,
    onResizePreview,
    panelWidth,
    onOpenDataDiving,
}) => {
    const {
        cloudModelsList,

        // Config
        status, setStatus,
        provider,
        selectedModel, setSelectedModel,
        customModel, setCustomModel,
        installedModels,
        isModelsLoading,
        modelStatus,

        // Context
        contextObjects,
        isDragOver, setIsDragOver,
        handleDrop,
        removeContextObj,

        // Artifact references ("Ask about this")
        pendingReferences, removeReference,

        // Chat
        messages,
        inputText, setInputText,
        isGenerating,
        streamingText,
        isThinking,
        activeToolCalls,
        errorMsg, setErrorMsg,
        conversationId,

        // Refs
        chatEndRef,
        inputRef,

        // Handlers
        handleSend,
        handleKeyDown,
        handleClearChat,
        handleNewConversation,
        handleSelectConversation,
        handleCancel,

        // Proposals
        acceptEdit,
        rejectEdit,
    } = useAiChat({
        mode: 'assistant',
        filePath: activeFilePath,
        fileType: activeFileType,
        getFileContext: getActiveTabInfo,
        onEditFile,
        onOpenFile,
    });

    const esSql = activeFileType === 'sql';

    // «Propose again»: a proposal made on an older version of the file, or in a
    // session before proposals kept their state, is asked for again instead of
    // being applied over what changed since (A1).
    const proponerDeNuevo = useCallback((tc) => {
        const r = tc?.result || {};
        rejectEdit(tc);
        handleSend(r.action === 'propose_file'
            ? `Propose the file ${r.path} again.`
            : 'The file changed after your last proposal. Propose that change again on the current version of the file.');
    }, [rejectEdit, handleSend]);

    // ─── E2: proposals reviewed in the editor ───
    // The pending line proposals of this file go to its editor, which draws them
    // as a diff with Accept / Reject. The actions go through a ref so the editor
    // always calls the current ones.
    const accionesRef = useRef({ aceptar: acceptEdit, rechazar: rejectEdit });
    accionesRef.current = { aceptar: acceptEdit, rechazar: rejectEdit };
    const accionesEstables = useRef({
        aceptar: (tc) => accionesRef.current.aceptar(tc),
        rechazar: (tc) => accionesRef.current.rechazar(tc),
    }).current;
    const rutaPublicada = useRef(null);
    useEffect(() => {
        if (rutaPublicada.current && rutaPublicada.current !== activeFilePath) {
            publicarPropuestas(rutaPublicada.current, [], null);
        }
        rutaPublicada.current = activeFilePath;
        if (!activeFilePath) return;
        // Only the conversation of THIS file: while another file's chat is still on
        // screen (the switch is loading), its proposals must not reach this editor.
        const deEsteArchivo = conversationId && fileConvCacheRef.current[activeFilePath] === conversationId;
        const pendientes = [];
        for (const m of deEsteArchivo ? messages : []) {
            for (const tc of m.toolCalls || []) {
                if (tc.estado === 'propuesta' && (esDeRango(tc.result) || esDeCelda(tc.result) || esDeLamina(tc.result) || esDeGrafico(tc.result)
                    || esDePasos(tc.result) || esDeTarjeta(tc.result) || esDeDiagrama(tc.result))) pendientes.push(tc);
            }
        }
        publicarPropuestas(activeFilePath, pendientes, accionesEstables);
    }, [messages, activeFilePath, accionesEstables, conversationId]);

    // ─── E2: the doors in the editor (selection bar, error, results) ───
    // They open the panel (App) and arrive here as a question, sent at once; «Ask…»
    // only focuses the box, with the selection shown as its reference.
    useEffect(() => {
        const PREGUNTAS = {
            explicar: (t) => (t === 'sql' ? 'Explain the selected SQL.' : 'Explain the selected text.'),
            arreglar: () => 'Fix the selected SQL.',
            optimizar: () => 'Optimize the selected SQL without changing its result.',
            mejorar: () => 'Improve the selected text.',
            arreglar_error: () => 'Fix the error of the last run.',
            explicar_resultado: () => 'Explain this result: what stands out?',
            graficar: () => 'Chart this result.',
            // E3: the notebook's cells and the Markdown selection.
            explicar_celda: () => 'Explain this cell.',
            arreglar_celda: () => 'Fix the error in this cell.',
            graficar_celda: () => 'Chart the result of this cell.',
            mejorar_celda: () => 'Improve this text cell so it reads better, keeping what it says and its numbers.',
            escribir_texto: () => 'Write this text cell from the result of the SQL cell above it: what it shows, with its numbers, in two or three sentences.',
            reescribir: () => 'Rewrite the selected text so it reads better, keeping what it says.',
            acortar: () => 'Make the selected text shorter, keeping what it says.',
            continuar: () => 'Continue the text after the selection, in the same voice.',
            // E4: a deck's slide and a chart's Story Flow stage.
            lamina_ajustar: () => 'Tighten the text of this slide: one clear point, fewer words. Keep its layout and charts.',
            lamina_titular: () => 'Write the headline of this slide from what its chart shows, with the number that carries it.',
            lamina_notas: () => 'Write speaker notes for this slide: what to say while it is on screen, in three or four short lines.',
            lamina_despues: () => 'Add a slide after this one that the story is missing. Ask me what it should say if it is not clear.',
            grafico_type: () => 'Which chart type tells this data best? Propose it.',
            grafico_data: () => 'Which columns should go on each axis of this chart? Propose them.',
            grafico_format: () => 'Format this chart so its numbers and labels read at a glance.',
            grafico_style: () => 'Make this chart readable in a slide: colors, labels and legend.',
            grafico_story: () => 'Write the title and the takeaway of this chart from what the data shows.',
            grafico_export: () => 'Is this chart ready to share? What would you fix first?',
            grafico_explicar: () => 'Explain what this chart shows.',
            // E5: a Data Flow step, a Canvas card, a diagram box.
            paso_explicar: () => 'Explain what this step does.',
            paso_arreglar: () => 'Fix the error in this step.',
            paso_sql: () => 'Write the SQL for this step: propose a sql_inline step that does the same, or the query this step needs.',
            tarjeta_preguntar: () => 'What does this card show, and what stands out?',
            tarjeta_cifra: () => 'Explain this number: how it is computed and what it means.',
            diagrama_expandir: () => 'Expand this box into the steps it is made of.',
        };
        const alAsistir = (e) => {
            const { accion } = e.detail || {};
            if (accion === 'preguntar') {
                setTimeout(() => inputRef.current?.focus(), 80);
                return;
            }
            const info = getActiveTabInfo ? getActiveTabInfo() : null;
            // E5: a door can bring its own words (the Data Flow bar, "Ask a question → cards").
            const pregunta = e.detail?.pregunta ? String(e.detail.pregunta) : PREGUNTAS[accion]?.(tipoDePestana(info?.type, info?.path));
            if (!pregunta) return;
            if (isGenerating) { setInputText(pregunta); return; }
            handleSend(pregunta);
        };
        window.addEventListener('amox_asistir', alAsistir);
        return () => window.removeEventListener('amox_asistir', alAsistir);
    }, [getActiveTabInfo, handleSend, isGenerating, setInputText, inputRef]);

    // The selection the next question is about, shown in the box (E2).
    const [seleccion, setSeleccion] = useState(null);
    useEffect(() => {
        const leer = () => {
            const info = getActiveTabInfo ? getActiveTabInfo() : null;
            setSeleccion(info?.foco?.seleccion ? { desde: info.foco.seleccion.desde, hasta: info.foco.seleccion.hasta } : null);
        };
        leer();
        const alFoco = (e) => {
            const info = getActiveTabInfo ? getActiveTabInfo() : null;
            if (info && e.detail?.tabId === info.id) setSeleccion(e.detail.seleccion);
        };
        window.addEventListener('amox_foco', alFoco);
        return () => window.removeEventListener('amox_foco', alFoco);
    }, [getActiveTabInfo, activeFilePath]);

    // ─── View Mode: 'chat' or 'history' ───
    const [viewMode, setViewMode] = useState('chat');

    // ─── AI modes guide (the "?" modal) ───
    const [showModesGuide, setShowModesGuide] = useState(false);

    // ─── Context pills: objects (tables/files) the active query references ───
    // Reactive: polls the live editor query; when it changes, re-describes the
    // FROM/JOIN objects so the pills (and the model) always match the query.
    const [queryObjects, setQueryObjects] = useState([]);
    const [expandedObj, setExpandedObj] = useState(null);
    useEffect(() => {
        if (!getActiveTabInfo) return;
        let lastQ = null;
        let timer = null;
        const check = () => {
            const info = getActiveTabInfo();
            const q = info?.type === 'sql' ? (info.content || '') : '';
            if (q === lastQ) return;
            lastQ = q;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                if (!q.trim()) { setQueryObjects([]); return; }
                fetch(`${API}/api/ai/query-objects`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: q }),
                }).then(r => r.json()).then(d => setQueryObjects(d.objects || [])).catch(() => {});
            }, 500);
        };
        check();
        const iv = setInterval(check, 1500);
        return () => { clearInterval(iv); if (timer) clearTimeout(timer); };
    }, [getActiveTabInfo]);

    // First-run AI modes tour. Rendering + replay are owned by the global
    // OnboardingHost via the tour registry.
    useEffect(() => {
        if (!hasSeenTour('ai-modes')) openTour('ai-modes');
    }, []);

    // ─── Cache: filePath → last conversationId per session ───
    const fileConvCacheRef = useRef({});
    const prevFilePathRef = useRef(null);
    // The file the conversation on screen belongs to. Set when a file's conversation
    // starts loading, so the cache never pairs the NEW path with the OLD conversation:
    // it used to, and coming back to a file opened another file's chat.
    const rutaDeLaConversacion = useRef(null);

    // ─── When activeFilePath changes, auto-load the latest conversation ───
    useEffect(() => {
        if (!activeFilePath) return;
        if (activeFilePath === prevFilePathRef.current) return;
        prevFilePathRef.current = activeFilePath;

        // Always show chat view when switching files
        setViewMode('chat');

        rutaDeLaConversacion.current = activeFilePath;
        const loadLastConversation = async () => {
            // Check cache first
            const cachedId = fileConvCacheRef.current[activeFilePath];
            if (cachedId) {
                handleSelectConversation(cachedId);
                return;
            }

            // Fetch from API
            try {
                const params = new URLSearchParams({ path: activeFilePath });
                const res = await fetch(`${API}/api/ai/conversations/by-file?${params}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.length > 0) {
                        fileConvCacheRef.current[activeFilePath] = data[0].id;
                        handleSelectConversation(data[0].id);
                        return;
                    }
                }
            } catch (err) {
                console.error('Failed to load file conversations:', err);
            }

            // No conversations found — start fresh
            handleClearChat();
        };

        loadLastConversation();
    }, [activeFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

    // Keep cache updated when conversationId changes — only for the file it belongs
    // to (a path change alone must not pair the new file with the old conversation).
    useEffect(() => {
        if (conversationId && rutaDeLaConversacion.current) {
            fileConvCacheRef.current[rutaDeLaConversacion.current] = conversationId;
        }
    }, [conversationId]);

    // E6/A9: a conversation of another file, from the history: its file opens and
    // the panel shows that conversation (the switch reads it from the cache).
    const abrirConversacionDeOtro = useCallback((conv) => {
        if (!conv?.file_path) return;
        fileConvCacheRef.current[conv.file_path] = conv.id;
        setViewMode('chat');
        onOpenFile?.(conv.file_path);
    }, [onOpenFile]);

    // ─── Skill activation from Command Palette ───
    useEffect(() => {
        const SKILL_MESSAGES = {
            'eda-initial':         'Analyze the current table: run a full exploratory data analysis — profile the data, find distributions, outliers, and key patterns.',
            'data-quality':        'Check data quality: find null rates, duplicates, outliers, and flag any data integrity issues.',
            'metric-investigation': 'Investigate what is driving changes in the key metric — break it down by dimension to find the top contributors.',
            'data-storytelling':   'Create a data story from the current chart or analysis results.',
            'time-series':         'Analyze trends over time: detect seasonality, growth rate, and anomalies.',
            'cohort-comparison':   'Run a cohort analysis to measure retention and behavior over time.',
            'sql-optimization':    'Optimize the current query for better performance.',
            'analysis-planning':   'Plan and execute a detailed multi-step analysis with progress tracking.',
        };
        const handler = (e) => {
            const { skillId } = e.detail || {};
            if (!skillId) return;
            const msg = SKILL_MESSAGES[skillId];
            if (msg) {
                setInputText(msg);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        };
        // Prefill the composer with a prompt sent from elsewhere (e.g. "Optimize with AI"
        // from the query plan). The user reviews and sends it — we don't auto-send.
        const promptHandler = (e) => {
            const p = e.detail?.prompt;
            if (p) {
                setInputText(p);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        };
        window.addEventListener('amox_activate_skill', handler);
        window.addEventListener('amox_ai_prompt', promptHandler);
        return () => {
            window.removeEventListener('amox_activate_skill', handler);
            window.removeEventListener('amox_ai_prompt', promptHandler);
        };
    }, [setInputText]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-grow the composer to fit its content — covers both typing and programmatic
    // prefills (Narrate / skills), where the textarea's onInput doesn't fire.
    useEffect(() => {
        const ta = inputRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
    }, [inputText]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Escalate current chat to Data Diving ───
    const handleEscalateToDataDiving = useCallback(async () => {
        if (!messages.length || !onOpenDataDiving) return;
        // Create a new diving conversation pre-seeded with the current messages
        try {
            const res = await fetch(`${API}/api/ai/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'diving',
                    provider,
                    model: selectedModel,
                    title: activeFilePath ? `From: ${activeFilePath.split(/[\\/]/).pop()}` : 'Escalated from Assistant',
                }),
            });
            if (res.ok) {
                const conv = await res.json();
                // Copy all messages to the new conversation
                for (const msg of messages) {
                    await fetch(`${API}/api/ai/conversations/${conv.id}/messages`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role: msg.role, content: msg.content }),
                    });
                }
                onOpenDataDiving(conv.id);
            }
        } catch (err) {
            console.error('Failed to escalate to Data Diving:', err);
        }
    }, [messages, onOpenDataDiving, provider, selectedModel, activeFilePath]);

    // ─── Resize handle logic ───
    const isResizing = useRef(false);

    const handleResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const startX = e.clientX;
        const startWidth = panelWidth;

        let lastWidth = startWidth;
        const handleMouseMove = (moveEvent) => {
            if (!isResizing.current) return;
            const delta = startX - moveEvent.clientX;
            lastWidth = Math.min(600, Math.max(300, startWidth + delta));
            // Live preview via direct DOM mutation (no App re-render per pixel);
            // falls back to committing state if the host didn't pass a preview.
            if (onResizePreview) onResizePreview(lastWidth);
            else onResize?.(lastWidth);
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            onResize?.(lastWidth); // single state commit
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [panelWidth, onResize, onResizePreview]);

    // ─── No file open placeholder ───
    if (!activeFilePath) {
        return (
            <div className="ai-panel">
                <div className="ai-resize-handle" onMouseDown={handleResizeMouseDown}>
                    <LuGripVertical size={10} />
                </div>
                <div className="ai-header">
                    <div className="ai-header-left">
                        <LuBot size={16} style={{ color: 'var(--accent-primary)' }} />
                        <span className="ai-title">AmoxSQL AI</span>
                    </div>
                    <div className="ai-header-right">
                        <button className="ai-icon-btn" onClick={onClose}>
                            <LuX size={16} />
                        </button>
                    </div>
                </div>
                <div className="ai-empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="ai-empty-state-icon">
                        <LuFile size={28} />
                    </div>
                    <div className="ai-empty-state-hint">
                        Open a file to start chatting.
                    </div>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════
    // VIEW: History (full-panel conversation list)
    // ═══════════════════════════════════════
    if (viewMode === 'history') {
        return (
            <div className="ai-panel">
                <div className="ai-resize-handle" onMouseDown={handleResizeMouseDown}>
                    <LuGripVertical size={10} />
                </div>
                <FileConversationList
                    filePath={activeFilePath}
                    activeConversationId={conversationId}
                    onSelect={handleSelectConversation}
                    onNew={handleNewConversation}
                    onBack={() => setViewMode('chat')}
                    onAbrirOtra={onOpenFile ? abrirConversacionDeOtro : undefined}
                />
            </div>
        );
    }

    // ═══════════════════════════════════════
    // VIEW: Chat (active conversation)
    // ═══════════════════════════════════════
    // Sampled once per panel render (used for edit-proposal diffs). Fresh enough:
    // any pending edit arriving re-renders the panel and re-reads it.
    const currentFileContent = getActiveTabInfo ? (getActiveTabInfo()?.content ?? null) : null;
    return (
        <div className="ai-panel">
            {/* ─── Resize Handle (left edge) ─── */}
            <div className="ai-resize-handle" onMouseDown={handleResizeMouseDown}>
                <LuGripVertical size={10} />
            </div>

            {/* ─── Header: Title + History toggle + Actions ─── */}
            <div className="ai-header">
                <div className="ai-header-left">
                    <LuBot size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span className="ai-title">AmoxSQL AI</span>
                    {/* Any provider but the local one sends data out: say so for all of them. */}
                    {provider && provider !== 'ollama' && (
                        <span className="ai-badge-cloud" title="This model runs in the cloud">CLOUD</span>
                    )}
                    <PoliticaIAChip />
                </div>
                <div className="ai-header-right">
                    <button
                        className="ai-icon-btn"
                        onClick={() => setViewMode('history')}
                        title="Chat history"
                    >
                        <LuHistory size={14} />
                    </button>
                    <button
                        className="ai-icon-btn"
                        onClick={() => { handleNewConversation(); }}
                        title="New chat"
                    >
                        <LuMessageSquarePlus size={14} />
                    </button>
                    {messages.length > 0 && (
                        <button
                            className="ai-icon-btn"
                            onClick={() => exportConversationToMarkdown(messages, activeFilePath ? activeFilePath.split(/[\\/]/).pop() : 'Assistant Chat')}
                            title="Export conversation to Markdown"
                        >
                            <LuDownload size={14} />
                        </button>
                    )}
                    {messages.length > 0 && onOpenDataDiving && (
                        <button
                            className="ai-icon-btn"
                            onClick={handleEscalateToDataDiving}
                            title="Continue in Deep Dive"
                        >
                            <LuArrowUpRight size={14} />
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
                    <button className="ai-icon-btn" onClick={onClose}>
                        <LuX size={16} />
                    </button>
                </div>
            </div>

            <AiModesGuideModal isOpen={showModesGuide} onClose={() => setShowModesGuide(false)} />

            {/* E6/A9: the file this conversation is about; it changes with the tab, and now says so. */}
            {activeFilePath && (
                <button type="button" className="ai-archivo-barra" onClick={() => setViewMode('history')}
                    title={`${activeFilePath} — this conversation is linked to this file. Click to see its other chats.`}>
                    <LuFile size={12} />
                    <span className="ai-archivo-barra-nombre">{activeFilePath.split(/[\\/]/).pop()}</span>
                    <span className="ai-archivo-barra-nota">this file's chat</span>
                    <LuHistory size={11} className="ai-archivo-barra-icono" />
                </button>
            )}

            {status === 'LOADING' && (
                <div className="ai-loading">
                    <LuLoader size={30} style={{ marginBottom: '15px', animation: 'spin 2s linear infinite', color: 'var(--accent-primary)' }} />
                    <h3>Loading AI Engine...</h3>
                </div>
            )}

            {status === 'ERROR' && (
                <div className="ai-error-state">
                    Error loading AI configuration.
                    <button onClick={() => setStatus('READY')}>Retry</button>
                </div>
            )}

            {status === 'READY' && (
                <div className="ai-ready">
                    {/* ─── Chat Messages ─── */}
                    <div className="ai-messages">
                        {messages.length === 0 && !isGenerating && (
                            <div className="ai-empty-state">
                                <div className="ai-empty-state-icon">
                                    <LuSparkles size={28} />
                                </div>
                                <h2 className="ai-empty-state-title">Assist</h2>
                                <div className="ai-empty-state-hint">
                                    Ask about this file, or select part of it in the editor and ask about just that.
                                </div>
                                {/* A6: what makes sense for THIS file, in the state it is in. */}
                                <div className="ai-quick-actions">
                                    {inicioDe(getActiveTabInfo ? getActiveTabInfo() : null).map(op => (
                                        <button key={op.etiqueta} className={`ai-quick-action${op.aviso ? ' ai-quick-action--aviso' : ''}`} onClick={() => handleSend(op.pregunta)}>
                                            {op.etiqueta}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <ChatMessage
                                key={i}
                                role={msg.role}
                                content={msg.content}
                                toolCalls={msg.toolCalls}
                                allMessages={messages}
                                isDiving={false}
                                isStreaming={false}
                                thinkingMs={msg.thinkingMs}
                                onRunSql={onRunSql}
                                onInsertar={esSql ? onInsertarEnEditor : undefined}
                                onApplyChart={esSql ? onUpdateChartConfig : undefined}
                                destinoGrafico={esSql && activeFilePath ? `${activeFilePath.split(/[\\/]/).pop()}` : null}
                                onFollowUp={(text) => handleSend(text)}
                                acceptEdit={acceptEdit}
                                rejectEdit={rejectEdit}
                                onProponerDeNuevo={proponerDeNuevo}
                                onRevisar={pedirRevision}
                                currentFileContent={currentFileContent}
                            />
                        ))}

                        {/* Streaming assistant message */}
                        {isGenerating && (streamingText || activeToolCalls.length > 0) && (
                            <ChatMessage
                                role="assistant"
                                content={streamingText}
                                toolCalls={activeToolCalls}
                                isStreaming={true}
                                onRunSql={onRunSql}
                            />
                        )}

                        {/* Generating indicator — distinguishes model warm-up
                            (cold model still loading into memory) from the normal
                            pre-token wait, using the live model-status snapshot. */}
                        {isGenerating && !streamingText && activeToolCalls.length === 0 && (() => {
                            const modelWarming = provider === 'ollama' && selectedModel &&
                                !modelStatus.some(m => m.name === selectedModel || m.model === selectedModel);
                            return (
                                <div className="ai-thinking">
                                    <LuLoader size={14} style={{ animation: 'spin 2s linear infinite' }} />
                                    {modelWarming ? 'Loading the model…' : 'Thinking…'}
                                </div>
                            );
                        })()}

                        <div ref={chatEndRef} />
                    </div>

                    {/* ─── Error ─── */}
                    {errorMsg && (
                        <div className="ai-error-bar">
                            <span>{errorMsg}</span>
                            <button onClick={() => setErrorMsg(null)}>
                                <LuX size={12} />
                            </button>
                        </div>
                    )}

                    {/* ─── Composer: unified floating input ─── */}
                    <div
                        className={`ai-composer${isDragOver ? ' ai-composer--dragover' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                    >
                        {/* Auto-detected objects the active query references — the
                            model sees their columns+types; click to inspect. */}
                        {queryObjects.length > 0 && (
                            <div className="ai-composer-ctx ai-qobjects" title="Assist knows the columns of these objects your query reads">
                                {queryObjects.map((o, i) => (
                                    <div key={i} className="ai-composer-chip ai-qobject-chip" style={{ position: 'relative' }}>
                                        {o.kind === 'file' ? <LuFile size={10} /> : <LuTable size={10} />}
                                        <span
                                            style={{ cursor: 'pointer' }}
                                            onClick={() => setExpandedObj(expandedObj === i ? null : i)}
                                        >{o.label} · {o.columns.length} col</span>
                                        {expandedObj === i && (
                                            <div className="ai-qobject-pop" onMouseLeave={() => setExpandedObj(null)}>
                                                <div className="ai-qobject-pop-title">
                                                    {o.label}{o.format ? ` · ${o.format}` : ''}
                                                </div>
                                                {o.columns.map((c, ci) => (
                                                    <div key={ci} className="ai-qobject-col">
                                                        <span className="ai-qobject-col-name">{c.name}</span>
                                                        <span className="ai-qobject-col-type">{c.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Artifact reference chips ("Ask about this") */}
                        {pendingReferences.length > 0 && (
                            <div className="ai-composer-ctx ai-composer-refs">
                                {pendingReferences.map((ref, i) => (
                                    <div key={ref.key || i} className="ai-composer-chip ai-composer-chip--ref" title={ref.label}>
                                        {ref.type === 'chart' ? <LuChartColumn size={10} />
                                            : ref.type === 'query' ? <LuDatabase size={10} />
                                            : ref.type === 'step' ? <LuListChecks size={10} />
                                            : ref.type === 'finding' ? <LuLightbulb size={10} />
                                            : ref.type === 'table' ? <LuTable size={10} />
                                            : <LuAtSign size={10} />}
                                        <span>{ref.label}</span>
                                        <button onClick={() => removeReference(i)} className="ai-composer-chip-x">
                                            <LuX size={9} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* The selection in the editor: what "this" means in the next question (E2). */}
                        {seleccion && (
                            <div className="ai-composer-ctx">
                                <div className="ai-composer-chip ai-composer-chip--ref" title="Assist works on the text selected in the editor">
                                    <LuTextSelect size={10} />
                                    <span>Selection · {seleccion.desde === seleccion.hasta ? `line ${seleccion.desde}` : `lines ${seleccion.desde}–${seleccion.hasta}`}</span>
                                </div>
                            </div>
                        )}

                        {/* Context chips inside the box */}
                        {contextObjects.length > 0 && (
                            <div className="ai-composer-ctx">
                                {contextObjects.map((obj, i) => (
                                    <div key={i} className="ai-composer-chip">
                                        {obj.type === 'table'
                                            ? <LuTable size={10} />
                                            : <LuFile size={10} />
                                        }
                                        <span>{obj.name}</span>
                                        <button onClick={() => removeContextObj(i)} className="ai-composer-chip-x">
                                            <LuX size={9} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Borderless textarea */}
                        <textarea
                            className="ai-textarea"
                            ref={inputRef}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={contextObjects.length > 0 ? 'Ask about the attached context...' : 'Ask about your data \u2014 drop tables here...'}
                            rows={1}
                            onInput={(e) => {
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                            }}
                        />

                        {/* Bottom toolbar */}
                        <div className="ai-composer-toolbar">
                            <div className="ai-composer-toolbar-left">
                                {provider === 'ollama' && installedModels.length === 0 ? (
                                    <div className="ai-composer-model">
                                        <LuCpu size={12} />
                                        <button className="ai-composer-model-link" onClick={() => onOpenSettings?.('ai')}>
                                            Install models
                                        </button>
                                    </div>
                                ) : (
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
                                )}
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
                </div>
            )}
        </div>
    );
};

export default AiAssistantPanel;
