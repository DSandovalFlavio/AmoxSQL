import { useState, useEffect, useCallback } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuSend, LuTrash2, LuArrowLeft, LuWand, LuSparkles } from 'react-icons/lu';
import ChatMessage from './ChatMessage';
import ToolCallBlock from './ToolCallBlock';
import ConversationList from './ConversationList';
import SessionInventory from './SessionInventory';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';

const API = 'http://localhost:3001';

/**
 * AiDivingPanel — Full 3-column Data Diving mode.
 * Replaces the diving branch of AiSidebar.jsx, powered by the useAiChat hook.
 */
const AiDivingPanel = ({
    width,
    onRunSql,
    onExportNotebook,
    onOpenFile,
    availableTables,
}) => {
    const {
        // Constants
        GEMINI_MODELS,

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
    } = useAiChat({ mode: 'diving' });

    // ─── Session Name ───
    const [sessionName, setSessionName] = useState('');
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });

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

    // ─── Auto-create artifact on build_notebook tool result ───
    useEffect(() => {
        if (!conversationId || messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant' || !lastMsg.toolCalls) return;

        for (const tc of lastMsg.toolCalls) {
            if (tc.toolName === 'build_notebook' && tc.result && !tc.result.error) {
                (async () => {
                    try {
                        await fetch(`${API}/api/ai/sessions/${conversationId}/artifacts`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                type: 'notebook',
                                name: tc.result.name || 'Analysis Notebook',
                                data: tc.result,
                            }),
                        });
                    } catch (err) {
                        console.error('Failed to auto-create artifact:', err);
                    }
                })();
            }
        }
    }, [messages, conversationId]);

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
                    key={i}
                    role={msg.role}
                    content={msg.content}
                    toolCalls={msg.toolCalls}
                    allMessages={messages}
                    isDiving={true}
                    isStreaming={false}
                    onRunSql={onRunSql}
                    onFollowUp={(text) => handleSend(text)}
                    onExportNotebook={onExportNotebook}
                    onOpenFile={onOpenFile}
                />
            ))}

            {/* Streaming assistant message */}
            {isGenerating && (streamingText || activeToolCalls.length > 0) && (
                <div className="ai-streaming-msg">
                    <div className="ai-avatar">
                        <LuBot size={13} />
                    </div>
                    <div className="ai-streaming-body">
                        <div className="ai-streaming-label">AmoxSQL AI</div>
                        {activeToolCalls.map((tc, i) => (
                            <ToolCallBlock
                                key={tc.toolCallId || i}
                                toolName={tc.toolName}
                                args={tc.args}
                                result={tc.result}
                                isLoading={tc.isLoading}
                            />
                        ))}

                        {isThinking && (
                            <div className="ai-msg-thinking" style={{ marginTop: 8, marginBottom: 8, borderColor: 'transparent', backgroundColor: 'transparent' }}>
                                <div className="ai-msg-thinking__toggle" style={{ cursor: 'default' }}>
                                    <LuLoader size={12} className="ai-msg-thinking__icon" style={{ animation: 'blink 1.5s infinite' }} />
                                    <span>Reasoning...</span>
                                </div>
                            </div>
                        )}
                        {streamingText && (
                            <div className="ai-streaming-text">
                                {streamingText}
                                <span className="ai-cursor" />
                            </div>
                        )}
                    </div>
                </div>
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
        <div className="ai-input-area ai-input-area--diving">
            <div className="ai-input-row">
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
                <button
                    className={`ai-send-btn${isGenerating ? ' cancel' : (inputText.trim() ? ' ready' : ' idle')}`}
                    onClick={isGenerating ? handleCancel : () => handleSend()}
                    disabled={!isGenerating && !inputText.trim()}
                >
                    {isGenerating ? <LuX size={16} /> : <LuSend size={15} />}
                </button>
            </div>
            <div className="ai-input-footer">
                <div className="ai-diving-model">
                    {provider === 'ollama' ? <LuCpu size={11} /> : <LuCloud size={11} />}
                    {provider === 'ollama' && isModelsLoading ? (
                        <span className="ai-diving-model-text">Loading...</span>
                    ) : (
                        <select
                            className="ai-diving-model-select"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                        >
                            {provider === 'ollama' ? (
                                installedModels.map(m => (
                                    <option key={m.name} value={m.name}>{m.name}</option>
                                ))
                            ) : (
                                GEMINI_MODELS.map(m => (
                                    <option key={m.id} value={m.id}>{m.label}</option>
                                ))
                            )}
                        </select>
                    )}
                </div>
                <div className="ai-input-hint">
                    Enter to send · Shift+Enter for newline
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

            {/* ─── Right column: Session Inventory ─── */}
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
                />
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
