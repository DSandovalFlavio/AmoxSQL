import { useEffect } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuSend, LuTrash2, LuTable, LuFile, LuDatabase, LuBrain, LuSparkles } from 'react-icons/lu';
import ChatMessage from './ChatMessage';
import ToolCallBlock from './ToolCallBlock';
import FileConversationList from './FileConversationList';
import AlertDialog from '../AlertDialog';
import useAiChat from './useAiChat';

/**
 * AiAssistantPanel — File-aware AI assistant sidebar panel.
 * Replaces the sidebar mode of AiSidebar.jsx, using the shared useAiChat hook.
 */
const AiAssistantPanel = ({
    activeFilePath,
    activeFileType,
    activeFileContent,
    activeResult,
    activeChartConfig,
    onEditFile,
    onUpdateChartConfig,
    onRunSql,
    onClose,
    availableTables,
    onOpenSettings,
}) => {
    const {
        GEMINI_MODELS,

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

    // ─── When activeFilePath changes, reset conversation ───
    useEffect(() => {
        if (activeFilePath) {
            handleClearChat();
        }
    }, [activeFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── No file open placeholder ───
    if (!activeFilePath) {
        return (
            <div className="ai-panel">
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

    // ─── Alert state (simple local state mirroring original sidebar) ───
    // Using a simple inline approach since AlertDialog needs isOpen/message

    return (
        <div className="ai-panel">
            {/* ─── Header ─── */}
            <div className="ai-header">
                <div className="ai-header-left">
                    <LuBot size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span className="ai-title">AmoxSQL AI</span>
                    {provider === 'gemini' && (
                        <span className="ai-badge-cloud">CLOUD</span>
                    )}
                </div>
                <div className="ai-header-right">
                    <FileConversationList
                        filePath={activeFilePath}
                        activeConversationId={conversationId}
                        onSelect={handleSelectConversation}
                        onNew={handleNewConversation}
                    />
                    {messages.length > 0 && (
                        <button className="ai-icon-btn" onClick={handleClearChat} title="Clear chat">
                            <LuTrash2 size={14} />
                        </button>
                    )}
                    <button className="ai-icon-btn" onClick={onClose}>
                        <LuX size={16} />
                    </button>
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
                                isDiving={false}
                                isStreaming={false}
                                onRunSql={onRunSql}
                                onApplyToFile={onEditFile}
                                onFollowUp={(text) => handleSend(text)}
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
                                                <LuBrain size={12} className="ai-msg-thinking__icon fa-spin" style={{ animation: 'blink 1.5s infinite' }} />
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

                    {/* ─── Composer: context chips + textarea + model ─── */}
                    <div
                        className={`ai-composer${isDragOver ? ' ai-composer--dragover' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                    >
                        {/* Context chips above textarea */}
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

                        {/* Textarea + send */}
                        <div className="ai-input-row">
                            <textarea
                                className="ai-textarea"
                                ref={inputRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={contextObjects.length > 0 ? 'Ask about the attached context...' : 'Ask about your data — drop tables here...'}
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

                        {/* Footer: model + hint */}
                        <div className="ai-input-footer">
                            <div className="ai-input-model">
                                {provider === 'ollama' ? <LuCpu size={11} /> : <LuCloud size={11} />}
                                {provider === 'ollama' && isModelsLoading ? (
                                    <span className="ai-input-model-text">Loading...</span>
                                ) : provider === 'ollama' && installedModels.length === 0 ? (
                                    <button className="ai-input-model-link" onClick={() => onOpenSettings?.('ai')}>
                                        Install models
                                    </button>
                                ) : (
                                    <select
                                        className="ai-input-model-select"
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
                                {selectedModel === 'custom' && provider === 'gemini' && (
                                    <input
                                        className="ai-input-model-custom"
                                        type="text" value={customModel}
                                        onChange={(e) => setCustomModel(e.target.value)}
                                        placeholder="model id..."
                                    />
                                )}
                            </div>
                            <div className="ai-input-hint">
                                Enter ↵
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AiAssistantPanel;
