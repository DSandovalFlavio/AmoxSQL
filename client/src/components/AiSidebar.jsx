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
        <div style={{
            flex: 1, height: '100%',
            backgroundColor: 'var(--sidebar-bg)', borderLeft: isDiving ? 'none' : '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', color: 'var(--text-color)', fontFamily: 'system-ui, sans-serif',
            minWidth: 0,
        }}>
            {/* ─── Header ─── */}
            <div style={{
                height: '40px', padding: '0 16px', boxSizing: 'border-box',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isDiving && onExitDiving && (
                        <button onClick={onExitDiving} title="Back to Editor" style={{
                            background: 'none', border: 'none', padding: '4px',
                            color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                        }}>
                            <LuArrowLeft size={16} />
                        </button>
                    )}
                    <LuBot size={16} style={{ color: 'var(--accent-color-user)' }} />
                    <span style={{ fontWeight: '500', color: 'var(--text-active)', fontSize: '13px' }}>
                        {isDiving ? 'Data Diving' : 'AmoxSQL AI'}
                    </span>
                    {provider === 'gemini' && (
                        <span style={{
                            fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                            backgroundColor: 'var(--feedback-warning-bg)', color: 'var(--feedback-warning-text)',
                            fontWeight: '600', letterSpacing: '0.5px',
                        }}>CLOUD</span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {messages.length > 0 && (
                        <button onClick={handleClearChat} title="Clear chat" style={{
                            padding: '4px', background: 'none', border: 'none',
                            color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                        }}>
                            <LuTrash2 size={14} />
                        </button>
                    )}
                    <button onClick={onClose} style={{
                        padding: '4px', background: 'none', border: 'none',
                        color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                    }}>
                        <LuX size={16} />
                    </button>
                </div>
            </div>

            {status === 'LOADING' && (
                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <LuLoader size={30} style={{ marginBottom: '15px', animation: 'spin 2s linear infinite', color: 'var(--accent-color-user)' }} />
                    <h3 style={{ color: 'var(--text-active)', margin: '0', fontSize: '14px' }}>Loading AI Engine...</h3>
                </div>
            )}

            {status === 'ERROR' && (
                <div style={{ padding: '20px', color: 'var(--feedback-error-text)', textAlign: 'center', fontSize: '13px' }}>
                    Error loading AI configuration.
                    <button onClick={() => setStatus('READY')} style={{ display: 'block', margin: '15px auto', padding: '5px 10px', backgroundColor: 'var(--feedback-error-text)', color: 'var(--button-text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Retry</button>
                </div>
            )}

            {status === 'READY' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* ─── Model Selector (compact) ─── */}
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            {provider === 'ollama' ? <LuCpu size={12} color="var(--text-muted)" /> : <LuCloud size={12} color="var(--text-muted)" />}
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                                {provider === 'ollama' ? 'Ollama (Local)' : 'Gemini (Cloud)'}
                            </span>
                        </div>

                        {provider === 'ollama' && isModelsLoading ? (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <LuLoader size={10} style={{ animation: 'spin 2s linear infinite' }} /> Loading models...
                            </div>
                        ) : provider === 'ollama' && installedModels.length === 0 ? (
                            <button onClick={() => { if (onOpenSettings) onOpenSettings('ai'); }} style={{
                                width: '100%', padding: '6px', fontSize: '11px',
                                backgroundColor: 'var(--feedback-warning-bg)', color: 'var(--feedback-warning-text)',
                                border: '1px solid var(--feedback-warning-border)', borderRadius: '4px', cursor: 'pointer',
                            }}>Install Models in Settings</button>
                        ) : (
                            <select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                style={{
                                    width: '100%', padding: '5px 8px', fontSize: '11px',
                                    backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                    border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none', cursor: 'pointer',
                                }}
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
                                type="text" value={customModel}
                                onChange={(e) => setCustomModel(e.target.value)}
                                placeholder="e.g. gemini-1.5-pro"
                                style={{
                                    width: '100%', padding: '5px 8px', fontSize: '11px', marginTop: '6px',
                                    backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                    border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box', outline: 'none',
                                }}
                            />
                        )}
                    </div>

                    {/* ─── Context (Drag & Drop — collapsible) ─── */}
                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            <LuDatabase size={10} />
                            <span>Context</span>
                            <span style={{ fontWeight: '400' }}>({contextObjects.length})</span>
                        </div>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            style={{
                                minHeight: contextObjects.length > 0 ? 'auto' : '40px',
                                maxHeight: '90px', overflowY: 'auto',
                                border: isDragOver ? '1px dashed var(--accent-color-user)' : '1px dashed var(--border-color)',
                                backgroundColor: isDragOver ? 'var(--accent-color-user-transparent)' : 'transparent',
                                borderRadius: '4px', padding: '6px', transition: 'all 0.2s',
                                display: 'flex', flexWrap: 'wrap', gap: '4px', alignContent: 'flex-start',
                            }}
                        >
                            {contextObjects.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '10px', margin: 'auto' }}>
                                    Drop tables or files here...
                                </div>
                            ) : (
                                contextObjects.map((obj, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        backgroundColor: 'var(--sidebar-item-active-bg)',
                                        padding: '3px 8px', borderRadius: '3px',
                                        border: '1px solid var(--border-color)', fontSize: '11px',
                                    }}>
                                        {obj.type === 'table' ? <LuTable size={10} color="var(--accent-color-user)" /> : <LuFile size={10} color="#CE9178" />}
                                        <span style={{ color: 'var(--text-active)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obj.name}</span>
                                        <button onClick={() => removeContextObj(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0', display: 'flex', marginLeft: '2px' }}>
                                            <LuX size={10} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ─── Chat Messages ─── */}
                    <div style={{
                        flex: 1, overflowY: 'auto', overflowX: 'hidden',
                    }}>
                        {messages.length === 0 && !isGenerating && (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                height: '100%', padding: '20px', textAlign: 'center',
                            }}>
                                <LuSparkles size={28} style={{ color: 'var(--accent-color-user)', marginBottom: '12px', opacity: 0.5 }} />
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                    Ask anything about your data.
                                    <br />
                                    <span style={{ fontSize: '11px' }}>Drop tables/files above for context.</span>
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
                            <div style={{
                                padding: '12px 16px',
                                backgroundColor: 'var(--sidebar-item-active-bg)',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex', gap: '10px',
                            }}>
                                <div style={{
                                    width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: 'var(--border-color)', color: 'var(--accent-color-user)',
                                }}>
                                    <LuBot size={13} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--accent-color-user)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        AmoxSQL AI
                                    </div>
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
                                        <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-active)', wordBreak: 'break-word' }}>
                                            {streamingText}
                                            <span style={{
                                                display: 'inline-block', width: '6px', height: '14px',
                                                backgroundColor: 'var(--accent-color-user)',
                                                marginLeft: '2px', animation: 'blink 1s step-end infinite',
                                                verticalAlign: 'text-bottom',
                                            }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Generating indicator (no text yet) */}
                        {isGenerating && !streamingText && activeToolCalls.length === 0 && (
                            <div style={{
                                padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '8px', fontSize: '12px', color: 'var(--text-muted)',
                            }}>
                                <LuLoader size={14} style={{ animation: 'spin 2s linear infinite' }} />
                                Thinking...
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>

                    {/* ─── Error ─── */}
                    {errorMsg && (
                        <div style={{
                            padding: '6px 16px', backgroundColor: 'var(--feedback-error-bg)',
                            borderTop: '1px solid var(--feedback-error-border)',
                            fontSize: '11px', color: 'var(--feedback-error-text)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ flex: 1 }}>{errorMsg}</span>
                            <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--feedback-error-text)', cursor: 'pointer', padding: '2px' }}>
                                <LuX size={12} />
                            </button>
                        </div>
                    )}

                    {/* ─── Input Area ─── */}
                    <div style={{
                        padding: '10px 16px', borderTop: '1px solid var(--border-color)',
                        backgroundColor: 'var(--sidebar-bg)', flexShrink: 0,
                    }}>
                        <div style={{
                            display: 'flex', gap: '8px', alignItems: 'flex-end',
                        }}>
                            <textarea
                                ref={inputRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about your data..."
                                rows={1}
                                style={{
                                    flex: 1, minHeight: '36px', maxHeight: '100px', boxSizing: 'border-box',
                                    backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '8px 12px',
                                    color: 'var(--text-active)', fontSize: '13px',
                                    resize: 'none', outline: 'none', fontFamily: 'inherit',
                                    lineHeight: '1.4',
                                }}
                                onInput={(e) => {
                                    e.target.style.height = 'auto';
                                    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                                }}
                            />
                            <button
                                onClick={isGenerating ? handleCancel : () => handleSend()}
                                disabled={!isGenerating && !inputText.trim()}
                                style={{
                                    width: '36px', height: '36px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: isGenerating
                                        ? 'var(--feedback-error-bg)'
                                        : (inputText.trim() ? 'var(--accent-color-user)' : 'var(--border-color)'),
                                    color: isGenerating ? 'var(--feedback-error-text)' : 'var(--button-text-color)',
                                    border: 'none', borderRadius: '8px',
                                    cursor: (!isGenerating && !inputText.trim()) ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {isGenerating ? <LuX size={16} /> : <LuSend size={15} />}
                            </button>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>
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

            {/* Blink animation for streaming cursor */}
            <style>{`
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );

    // ─── Main return: wrap with ConversationList when diving ───
    if (isDiving) {
        return (
            <div style={{
                width, height: '100%',
                display: 'flex',
                flexDirection: 'row',
                backgroundColor: 'var(--sidebar-bg)',
            }}>
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
