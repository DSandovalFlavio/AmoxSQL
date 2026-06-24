import { useState, useEffect, useRef, useCallback } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuSend, LuTrash2, LuArrowLeft, LuWand, LuSparkles, LuDownload, LuArrowUp } from 'react-icons/lu';
import ChatMessage from './ChatMessage';
import ToolCallBlock from './ToolCallBlock';
import ConversationList from './ConversationList';
import ModelDropdown from './ModelDropdown';
import SessionInventory from './SessionInventory';
import AgentPlanPanel from './AgentPlanPanel';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';
import { exportConversationToMarkdown } from './exportConversation';

import { API_BASE as API } from '../../api.js';

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
}) => {
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

        // Chat state
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
        handleDeclineContinue,
        userSkippedSteps,
        handleSkipPlanStep,
    } = useAiChat({ mode: 'diving' });

    // ─── Session Name ───
    const [sessionName, setSessionName] = useState('');
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });

    // ─── Auto-select escalated conversation on mount ───
    const didSelectStartConvRef = useRef(false);
    useEffect(() => {
        if (startConversationId && !didSelectStartConvRef.current) {
            didSelectStartConvRef.current = true;
            handleSelectConversation(startConversationId);
        }
    }, [startConversationId, handleSelectConversation]);

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
    // Track processed tool calls so we don't re-open files on every messages update
    const processedArtifactsRef = useRef(new Set());

    // Pre-populate on mount/conversation switch so remount doesn't re-open existing notebooks
    useEffect(() => {
        if (messages.length === 0) return;
        for (const msg of messages) {
            if (msg.role !== 'assistant' || !msg.toolCalls) continue;
            for (const tc of msg.toolCalls) {
                if (tc.toolName === 'build_notebook' && tc.result && !tc.result.error) {
                    processedArtifactsRef.current.add(`notebook:${tc.result.path || tc.result.fileName}`);
                }
            }
        }
    }, [conversationId]);

    useEffect(() => {
        if (!conversationId || messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant' || !lastMsg.toolCalls) return;

        for (const tc of lastMsg.toolCalls) {
            if (tc.toolName === 'build_notebook' && tc.result && !tc.result.error) {
                const artifactKey = `notebook:${tc.result.path || tc.result.fileName}`;
                const isNew = !processedArtifactsRef.current.has(artifactKey);
                processedArtifactsRef.current.add(artifactKey);

                if (isNew) {
                    (async () => {
                        try {
                            await fetch(`${API}/api/ai/sessions/${conversationId}/artifacts`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    type: 'notebook',
                                    name: tc.result.fileName || tc.result.name || 'Analysis Notebook',
                                    data: tc.result,
                                }),
                            });
                        } catch (err) {
                            console.error('Failed to auto-create notebook artifact:', err);
                        }
                    })();
                    // Refresh FileExplorer and auto-open only on first detection
                    window.dispatchEvent(new Event('amox_files_changed'));
                    if (onOpenFile && tc.result.path) {
                        onOpenFile(tc.result.path);
                    }
                }
            }

            if (tc.toolName === 'display_chart' && tc.result && !tc.result.error) {
                (async () => {
                    try {
                        await fetch(`${API}/api/ai/sessions/${conversationId}/artifacts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'chart',
                                name: tc.result?.chartConfig?.title || tc.args?.title || 'Chart',
                                data: tc.result,
                            }),
                        });
                    } catch (err) {
                        console.error('Failed to auto-create chart artifact:', err);
                    }
                })();
            }

            if (tc.toolName === 'save_to_vault' && tc.result && !tc.result.error) {
                (async () => {
                    try {
                        await fetch(`${API}/api/ai/sessions/${conversationId}/artifacts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'sql',
                                name: tc.result?.title || 'Vault Entry',
                                data: tc.result,
                            }),
                        });
                    } catch (err) {
                        console.error('Failed to auto-create vault artifact:', err);
                    }
                })();
            }
        }
    }, [messages, conversationId, onOpenFile]);

    // ─── Chat messages area ───
    const chatMessages = (
        <>
            {messages.length === 0 && !isGenerating && (
                <div className="ai-empty-state ai-empty-state--diving">
                    <div className="ai-empty-state-icon">
                        <LuSparkles size={40} />
                    </div>
                    <h2 className="ai-empty-state-title">Data Diving</h2>
                    <div className="ai-empty-state-hint">
                        Ask anything about your data.
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
                    key={msg.id || i}
                    role={msg.role}
                    content={msg.content}
                    toolCalls={msg.toolCalls}
                    allMessages={messages}
                    isDiving={true}
                    isStreaming={false}
                    onRunSql={onRunSql}
                    onFollowUp={handleSend}
                    onExportNotebook={onExportNotebook}
                    onExportAmoxvis={onExportAmoxvis}
                    onOpenFile={onOpenFile}
                />
            ))}

            {/* Streaming assistant message */}
            {isGenerating && (streamingText || activeToolCalls.length > 0) && (
                <ChatMessage
                    role="assistant"
                    content={streamingText}
                    toolCalls={activeToolCalls}
                    isStreaming={true}
                    isDiving={true}
                    onRunSql={onRunSql}
                    onFollowUp={handleSend}
                    onExportNotebook={onExportNotebook}
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
        </>
    );

    // ─── Input composer ───
    const inputComposer = (
        <div className="ai-composer">
            <textarea
                className="ai-textarea"
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your data..."
                rows={1}
                onInput={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
            />
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
        <div className="ai-diving" style={{ width }}>
            {/* ─── Left column: Conversations ─── */}
            <ConversationList
                activeId={conversationId}
                onSelect={handleSelectConversation}
                onNew={handleNewConversation}
                mode="diving"
            />

            {/* ─── Center column: Chat ─── */}
            <div className="ai-diving-center">
                {/* Diving header */}
                <div className="ai-diving-header">
                    <div className="ai-diving-header-left">
                        <LuBot size={16} className="ai-diving-header-icon" />
                        <span className="ai-diving-header-title">Data Diving</span>
                        {provider === 'gemini' && (
                            <span className="ai-badge-cloud">CLOUD</span>
                        )}
                    </div>
                    <div className="ai-diving-header-right">
                        {messages.length > 0 && (
                            <button
                                className="ai-icon-btn"
                                onClick={() => exportConversationToMarkdown(messages, sessionName || 'Data Diving')}
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
                    </div>
                </div>

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
                    <div className="ai-diving-chat">
                        {/* Scrollable message area with centered content */}
                        <div className="ai-diving-messages">
                            <div className="ai-diving-messages-inner">
                                {chatMessages}
                            </div>
                        </div>

                        {/* Error */}
                        {errorMsg && (
                            <div className="ai-error-bar">
                                <span>{errorMsg}</span>
                                <button onClick={() => setErrorMsg(null)}>
                                    <LuX size={12} />
                                </button>
                            </div>
                        )}

                        {/* Floating composer */}
                        <div className="ai-diving-composer-wrap">
                            <div className="ai-diving-composer">
                                {inputComposer}
                            </div>
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

                    {/* Continue banner — shown when loop exhausts without final_answer */}
                    {pendingContinue && (
                        <div className="ai-ask-user-banner ai-continue-banner">
                            <p className="ai-ask-user-question">
                                El análisis necesita más iteraciones para completarse.
                                {pendingContinue.pendingSteps > 0 && ` Quedan ${pendingContinue.pendingSteps} paso(s) pendientes.`}
                            </p>
                            <div className="ai-ask-user-options">
                                <button
                                    className="ai-ask-user-option ai-continue-btn"
                                    onClick={handleContinue}
                                >
                                    Continuar
                                </button>
                                <button
                                    className="ai-ask-user-option ai-continue-btn--cancel"
                                    onClick={handleDeclineContinue}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </SessionInventory>
            )}

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))}
                title="AI Assistant Info"
                message={alertData.message}
                type="info"
            />
        </div>
    );
};

export default AiDivingPanel;
