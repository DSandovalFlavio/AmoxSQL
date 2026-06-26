import { useState, useEffect, useRef, useCallback } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuTrash2, LuTable, LuFile, LuDatabase, LuBrain, LuSparkles, LuGripVertical, LuHistory, LuMessageSquarePlus, LuDownload, LuArrowUpRight, LuArrowUp, LuCircleHelp, LuChartColumn, LuListChecks, LuLightbulb, LuAtSign } from 'react-icons/lu';
import { AiModesGuideModal } from './AiModesGuide';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';
import ChatMessage from './ChatMessage';
import ToolCallBlock from './ToolCallBlock';
import FileConversationList from './FileConversationList';
import ModelDropdown from './ModelDropdown';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';
import { exportConversationToMarkdown } from './exportConversation';

import { API_BASE as API } from '../../api.js';

/**
 * AiAssistantPanel — File-aware AI assistant sidebar panel.
 * Two views: 'chat' (active conversation) and 'history' (list of all chats).
 */
const AiAssistantPanel = ({
    activeFilePath,
    activeFileType,
    activeFileContent,
    activeResult,
    activeChartConfig,
    onEditFile,
    onUpdateChartConfig,
    onAppendToFile,
    onRunSql,
    onClose,
    availableTables,
    onOpenSettings,
    onResize,
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

        // Pending edits
        pendingEdits,
        acceptEdit,
        rejectEdit,
    } = useAiChat({
        mode: 'assistant',
        filePath: activeFilePath,
        fileType: activeFileType,
        fileContent: activeFileContent,
        fileResult: activeResult,
        fileChartConfig: activeChartConfig,
        onEditFile,
        onUpdateChartConfig,
    });

    // ─── View Mode: 'chat' or 'history' ───
    const [viewMode, setViewMode] = useState('chat');

    // ─── AI modes guide (the "?" modal) ───
    const [showModesGuide, setShowModesGuide] = useState(false);

    // First-run AI modes tour. Rendering + replay are owned by the global
    // OnboardingHost via the tour registry.
    useEffect(() => {
        if (!hasSeenTour('ai-modes')) openTour('ai-modes');
    }, []);

    // ─── Cache: filePath → last conversationId per session ───
    const fileConvCacheRef = useRef({});
    const prevFilePathRef = useRef(null);

    // ─── When activeFilePath changes, auto-load the latest conversation ───
    useEffect(() => {
        if (!activeFilePath) return;
        if (activeFilePath === prevFilePathRef.current) return;
        prevFilePathRef.current = activeFilePath;

        // Always show chat view when switching files
        setViewMode('chat');

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

    // Keep cache updated when conversationId changes
    useEffect(() => {
        if (activeFilePath && conversationId) {
            fileConvCacheRef.current[activeFilePath] = conversationId;
        }
    }, [conversationId, activeFilePath]);

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
        window.addEventListener('amox_activate_skill', handler);
        return () => window.removeEventListener('amox_activate_skill', handler);
    }, [setInputText]); // eslint-disable-line react-hooks/exhaustive-deps

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

        const handleMouseMove = (moveEvent) => {
            if (!isResizing.current) return;
            const delta = startX - moveEvent.clientX;
            const newWidth = Math.min(600, Math.max(300, startWidth + delta));
            onResize?.(newWidth);
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [panelWidth, onResize]);

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
                />
            </div>
        );
    }

    // ═══════════════════════════════════════
    // VIEW: Chat (active conversation)
    // ═══════════════════════════════════════
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
                    {provider === 'gemini' && (
                        <span className="ai-badge-cloud">CLOUD</span>
                    )}
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
                                    Your copilot in the editor — ask about the current query, fix or explain SQL, or build a chart for the active file.
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
                                onRunSql={onRunSql}
                                onApplyToFile={onEditFile}
                                onAppendToFile={onAppendToFile}
                                onApplyChart={onUpdateChartConfig}
                                onFollowUp={(text) => handleSend(text)}
                                pendingEdits={pendingEdits}
                                acceptEdit={acceptEdit}
                                rejectEdit={rejectEdit}
                                currentFileContent={activeFileContent}
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
                                onApplyToFile={onEditFile}
                                onAppendToFile={onAppendToFile}
                            />
                        )}

                        {/* Generating indicator */}
                        {isGenerating && !streamingText && activeToolCalls.length === 0 && (
                            <div className="ai-thinking">
                                <LuLoader size={14} style={{ animation: 'spin 2s linear infinite' }} />
                                Thinking...
                            </div>
                        )}

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
