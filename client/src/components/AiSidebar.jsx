import { useState, useEffect, useRef, useCallback } from 'react';
import { LuBot, LuX, LuLoader, LuDatabase, LuCpu, LuCloud, LuSparkles, LuTable, LuFile, LuSend, LuTrash2, LuArrowLeft } from 'react-icons/lu';
import ChatMessage from './ai/ChatMessage';
import ToolCallBlock from './ai/ToolCallBlock';
import ConversationList from './ai/ConversationList';
import AlertDialog from './AlertDialog';

const API = 'http://localhost:3001';

const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', size: 'Cloud' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', size: 'Cloud' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

const AiSidebar = ({ width, onClose, availableTables, onOpenSettings, onRunSql, isDiving = false, onExitDiving, onExportNotebook }) => {
    // ─── Config State ───
    const [status, setStatus] = useState('LOADING');
    const [provider, setProvider] = useState('ollama');
    const [selectedModel, setSelectedModel] = useState('qwen3:1.7b');
    const [customModel, setCustomModel] = useState('');
    const [installedModels, setInstalledModels] = useState([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);

    // ─── Context State ───
    const [contextObjects, setContextObjects] = useState([]);
    const [isDragOver, setIsDragOver] = useState(false);

    // ─── Chat State ───
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [activeToolCalls, setActiveToolCalls] = useState([]);
    const [errorMsg, setErrorMsg] = useState(null);
    const [conversationId, setConversationId] = useState(null);
    const [showConversations, setShowConversations] = useState(isDiving);

    // ─── Refs ───
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortControllerRef = useRef(null);
    const activeToolCallsRef = useRef([]);

    // ─── Alert ───
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });

    // ─── Load Config ───
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const res = await fetch(`${API}/api/settings/config`);
                const configData = await res.json();

                const prov = configData.provider || 'ollama';
                setProvider(prov);

                if (prov === 'ollama') {
                    setIsModelsLoading(true);
                    try {
                        const modelsRes = await fetch(`${API}/api/settings/ollama/models`);
                        const modelsData = await modelsRes.json();
                        const models = modelsData.models || [];
                        setInstalledModels(models);

                        if (models.length > 0) {
                            const found = models.find(m => m.name === configData.defaultModel);
                            setSelectedModel(found ? found.name : models[0].name);
                        } else {
                            setSelectedModel('');
                        }
                    } catch (e) {
                        console.error('Failed to load ollama models', e);
                    } finally {
                        setIsModelsLoading(false);
                    }
                } else {
                    const modelFound = GEMINI_MODELS.find(m => m.id === configData.defaultModel);
                    if (modelFound && modelFound.id !== 'custom') {
                        setSelectedModel(configData.defaultModel);
                    } else {
                        setSelectedModel('custom');
                        setCustomModel(configData.defaultModel || '');
                    }
                }
                setStatus('READY');
            } catch (e) {
                console.error("AI Status check failed", e);
                setStatus('ERROR');
            }
        };

        loadConfig();
        window.addEventListener('amox_settings_updated', loadConfig);
        return () => window.removeEventListener('amox_settings_updated', loadConfig);
    }, []);

    // ─── Auto-scroll ───
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText, activeToolCalls]);

    // ─── Drag & Drop ───
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        try {
            const dataStr = e.dataTransfer.getData('application/json');
            if (dataStr) {
                const data = JSON.parse(dataStr);
                if (!contextObjects.some(obj => obj.name === data.name && obj.type === data.type)) {
                    setContextObjects(prev => [...prev, data]);
                }
            }
        } catch (err) { console.error("Drop failed:", err); }
    };

    const removeContextObj = (index) => {
        setContextObjects(prev => prev.filter((_, i) => i !== index));
    };

    // ─── Send Message ───
    const handleSend = useCallback(async (overrideText) => {
        const text = overrideText || inputText.trim();
        if (!text || isGenerating) return;

        setErrorMsg(null);
        const modelToUse = selectedModel === 'custom' ? customModel : selectedModel;
        if (!modelToUse) {
            setErrorMsg("Please select or enter a model name.");
            return;
        }

        // Add user message
        const userMsg = { role: 'user', content: text, toolCalls: [] };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        setIsGenerating(true);
        setStreamingText('');
        setActiveToolCalls([]);
        activeToolCallsRef.current = [];

        // Build context files array for the API
        const contextFiles = contextObjects
            .filter(o => o.type === 'file')
            .map(o => ({ name: o.name, path: o.path }));

        // Build messages array for the API (only role + content)
        const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

        abortControllerRef.current = new AbortController();

        try {
            const res = await fetch(`${API}/api/ai/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    provider,
                    model: modelToUse,
                    mode: 'assistant',
                    contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Stream request failed');
            }

            // Read SSE stream
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let toolResults = [];
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') continue;

                    try {
                        const event = JSON.parse(raw);

                        if (event.type === 'text-delta') {
                            fullText += event.text;
                            setStreamingText(fullText);
                        } else if (event.type === 'tool-call') {
                            const newActiveCall = {
                                toolCallId: event.toolCallId,
                                toolName: event.toolName,
                                args: event.args,
                                isLoading: true,
                            };
                            setActiveToolCalls(prev => [...prev, newActiveCall]);
                            activeToolCallsRef.current.push(newActiveCall);
                        } else if (event.type === 'tool-result') {
                            toolResults.push({
                                toolName: event.toolName,
                                toolCallId: event.toolCallId,
                                args: null, // Will be merged
                                result: event.result,
                            });
                            setActiveToolCalls(prev =>
                                prev.map(tc => tc.toolCallId === event.toolCallId
                                    ? { ...tc, result: event.result, isLoading: false }
                                    : tc)
                            );
                        } else if (event.type === 'step-finish') {
                            // Step finished — text might reset for next step
                        } else if (event.type === 'error') {
                            throw new Error(event.error);
                        }
                    } catch (parseErr) {
                        if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
                    }
                }
            }

            // Merge tool calls using the local active tool states we gathered from the stream
            const mergedToolCalls = activeToolCallsRef.current.map(tc => {
                const resultMatch = toolResults.find(r => r.toolCallId === tc.toolCallId);
                return {
                    toolName: tc.toolName,
                    args: tc.args,
                    result: resultMatch?.result || tc.result,
                };
            });
            
            setActiveToolCalls([]);
            activeToolCallsRef.current = [];

            // Wait a tick for state to settle
            await new Promise(r => setTimeout(r, 50));

            // Add assistant message
            const assistantMsg = {
                role: 'assistant',
                content: fullText,
                toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
            };
            setMessages(prev => [...prev, assistantMsg]);
            setStreamingText('');

            // Save model as default (background)
            fetch(`${API}/api/settings/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultModel: modelToUse }),
            }).catch(() => { });

        } catch (e) {
            if (e.name === 'AbortError') {
                setErrorMsg("Generation cancelled.");
            } else {
                setErrorMsg("Error: " + e.message);
            }
            setStreamingText('');
            setActiveToolCalls([]);
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    }, [inputText, isGenerating, messages, selectedModel, customModel, provider, contextObjects]);

    // ─── Keyboard shortcut ───
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ─── Clear chat ───
    const handleClearChat = () => {
        setMessages([]);
        setStreamingText('');
        setActiveToolCalls([]);
        setConversationId(null);
        setErrorMsg(null);
    };

    // ─── Conversation management (Data Diving) ───
    const handleNewConversation = async () => {
        handleClearChat();
        if (isDiving) {
            try {
                const modelToUse = selectedModel === 'custom' ? customModel : selectedModel;
                const res = await fetch(`${API}/api/ai/conversations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: 'diving', provider, model: modelToUse }),
                });
                if (res.ok) {
                    const conv = await res.json();
                    setConversationId(conv.id);
                }
            } catch (err) { console.error('Failed to create conversation:', err); }
        }
    };

    const handleSelectConversation = async (id) => {
        if (!id) { handleClearChat(); return; }
        try {
            const res = await fetch(`${API}/api/ai/conversations/${id}`);
            if (res.ok) {
                const conv = await res.json();
                setConversationId(conv.id);
                // Rebuild messages from persisted data
                const loadedMessages = (conv.messages || []).map(m => ({
                    role: m.role,
                    content: m.content,
                    toolCalls: m.tool_calls || undefined,
                }));
                setMessages(loadedMessages);
                setStreamingText('');
                setActiveToolCalls([]);
                setErrorMsg(null);
            }
        } catch (err) { console.error('Failed to load conversation:', err); }
    };

    // ─── Cancel ───
    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    // ─── Main chat panel (shared between sidebar and diving) ───
    const chatPanel = (
        <div className={`ai-panel${isDiving ? ' no-border' : ''}`}>
            {/* ─── Header ─── */}
            <div className="ai-header">
                <div className="ai-header-left">
                    {isDiving && onExitDiving && (
                        <button className="ai-icon-btn" onClick={onExitDiving} title="Back to Editor">
                            <LuArrowLeft size={16} />
                        </button>
                    )}
                    <LuBot size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span className="ai-title">
                        {isDiving ? 'Data Diving' : 'AmoxSQL AI'}
                    </span>
                    {provider === 'gemini' && (
                        <span className="ai-badge-cloud">CLOUD</span>
                    )}
                </div>
                <div className="ai-header-right">
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

                    {/* ─── Model Selector (compact) ─── */}
                    <div className="ai-model-selector">
                        <div className="ai-model-provider">
                            {provider === 'ollama' ? <LuCpu size={12} /> : <LuCloud size={12} />}
                            <span>{provider === 'ollama' ? 'Ollama (Local)' : 'Gemini (Cloud)'}</span>
                        </div>

                        {provider === 'ollama' && isModelsLoading ? (
                            <div className="ai-model-loading">
                                <LuLoader size={10} style={{ animation: 'spin 2s linear infinite' }} /> Loading models...
                            </div>
                        ) : provider === 'ollama' && installedModels.length === 0 ? (
                            <button className="ai-install-btn" onClick={() => { if (onOpenSettings) onOpenSettings('ai'); }}>
                                Install Models in Settings
                            </button>
                        ) : (
                            <select
                                className="ai-model-select"
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                            >
                                {provider === 'ollama' ? (
                                    installedModels.map(m => (
                                        <option key={m.name} value={m.name}>{m.name} ({(m.size / 1024 / 1024 / 1024).toFixed(1)}GB)</option>
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
                                className="ai-model-input"
                                type="text" value={customModel}
                                onChange={(e) => setCustomModel(e.target.value)}
                                placeholder="e.g. gemini-1.5-pro"
                            />
                        )}
                    </div>

                    {/* ─── Context (Drag & Drop) ─── */}
                    <div className="ai-context-section">
                        <div className="ai-context-label">
                            <LuDatabase size={10} />
                            <span>Context</span>
                            <span className="count">({contextObjects.length})</span>
                        </div>
                        <div
                            className={`ai-context-drop${contextObjects.length > 0 ? ' has-items' : ''}${isDragOver ? ' drag-over' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                        >
                            {contextObjects.length === 0 ? (
                                <div className="ai-context-empty">
                                    Drop tables or files here...
                                </div>
                            ) : (
                                contextObjects.map((obj, i) => (
                                    <div key={i} className="ai-context-chip">
                                        {obj.type === 'table' ? <LuTable size={10} style={{ color: 'var(--accent-primary)' }} /> : <LuFile size={10} style={{ color: 'var(--syntax-string)' }} />}
                                        <span>{obj.name}</span>
                                        <button onClick={() => removeContextObj(i)}>
                                            <LuX size={10} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ─── Chat Messages ─── */}
                    <div className="ai-messages">
                        {messages.length === 0 && !isGenerating && (
                            <div className="ai-empty-state">
                                <LuSparkles size={28} style={{ color: 'var(--accent-primary)', marginBottom: '12px', opacity: 0.5 }} />
                                <div className="hint">
                                    Ask anything about your data.
                                    <br />
                                    <span>Drop tables/files above for context.</span>
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
                                isDiving={isDiving}
                                isStreaming={false}
                                onRunSql={onRunSql}
                                onFollowUp={(text) => handleSend(text)}
                                onExportNotebook={onExportNotebook}
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
                                    {streamingText && (
                                        <div className="ai-streaming-text">
                                            {streamingText}
                                            <span className="ai-cursor" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Generating indicator (no text yet) */}
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

                    {/* ─── Input Area ─── */}
                    <div className="ai-input-area">
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
                                    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
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
                        <div className="ai-input-hint">
                            Enter to send · Shift+Enter for newline
                        </div>
                    </div>
                </div>
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

    // ─── Main return: wrap with ConversationList when diving ───
    if (isDiving) {
        return (
            <div className="ai-diving-container" style={{ width }}>
                {showConversations && (
                    <ConversationList
                        activeId={conversationId}
                        onSelect={handleSelectConversation}
                        onNew={handleNewConversation}
                        onClose={() => setShowConversations(false)}
                    />
                )}
                {chatPanel}
            </div>
        );
    }

    // Non-diving: just the chat panel at sidebar width
    return chatPanel;
};

export default AiSidebar;
