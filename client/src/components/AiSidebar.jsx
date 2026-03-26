import { useState, useEffect, useRef, useCallback } from 'react';
import { LuBot, LuX, LuLoader, LuCpu, LuCloud, LuSparkles, LuTable, LuFile, LuSend, LuTrash2, LuArrowLeft, LuDatabase, LuWand } from 'react-icons/lu';
import ChatMessage from './ai/ChatMessage';
import ToolCallBlock from './ai/ToolCallBlock';
import ConversationList from './ai/ConversationList';
import AiContextPanel from './ai/AiContextPanel';
import AlertDialog from './AlertDialog';

const API = 'http://localhost:3001';

const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', size: 'Cloud' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', size: 'Cloud' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

const AiSidebar = ({ width, onClose, availableTables, onOpenSettings, onRunSql, isDiving = false, onExitDiving, onExportNotebook, onOpenFile }) => {
    // ─── Config State ───
    const [status, setStatus] = useState('LOADING');
    const [provider, setProvider] = useState('ollama');
    const [selectedModel, setSelectedModel] = useState('qwen3:1.7b');
    const [customModel, setCustomModel] = useState('');
    const [installedModels, setInstalledModels] = useState([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);

    // ─── Skills State (Data Diving only) ───
    const [availableSkills, setAvailableSkills] = useState([]);
    const [activeSkillId, setActiveSkillId] = useState(null);

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

    // ─── Load Skills (Data Diving) ───
    useEffect(() => {
        if (!isDiving) return;
        const loadSkills = async () => {
            try {
                const res = await fetch(`${API}/api/ai/skills`);
                if (res.ok) {
                    const skills = await res.json();
                    setAvailableSkills(skills);
                }
            } catch (err) { console.error('Failed to load skills:', err); }
        };
        loadSkills();
    }, [isDiving]);

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

    // ─── Persistence helpers (Data Diving only) ───
    const ensureConversation = useCallback(async (modelToUse) => {
        if (!isDiving) return null;
        if (conversationId) return conversationId;

        try {
            const res = await fetch(`${API}/api/ai/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'diving', provider, model: modelToUse }),
            });
            if (res.ok) {
                const conv = await res.json();
                setConversationId(conv.id);
                return conv.id;
            }
        } catch (err) { console.error('Failed to create conversation:', err); }
        return null;
    }, [isDiving, conversationId, provider]);

    const persistMessage = useCallback(async (convId, role, content, toolCalls) => {
        if (!convId) return null;
        try {
            const res = await fetch(`${API}/api/ai/conversations/${convId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, content, toolCalls }),
            });
            if (res.ok) return await res.json();
        } catch (err) { console.error('Failed to persist message:', err); }
        return null;
    }, []);

    const persistQueryResult = useCallback(async (convId, messageId, toolResult) => {
        if (!convId || !messageId) return null;
        try {
            const res = await fetch(`${API}/api/ai/conversations/${convId}/query-results`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId,
                    sqlQuery: toolResult.query || toolResult.sql || '',
                    columns: toolResult.columns,
                    data: toolResult.data,
                    rowCount: toolResult.rowCount,
                    executionTime: toolResult.executionTime,
                    error: toolResult.error,
                }),
            });
            if (res.ok) return await res.json();
        } catch (err) { console.error('Failed to persist query result:', err); }
        return null;
    }, []);

    const persistChartConfig = useCallback(async (convId, queryResultId, chartType, config) => {
        if (!convId || !queryResultId) return;
        try {
            await fetch(`${API}/api/ai/conversations/${convId}/chart-configs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryResultId, chartType, config }),
            });
        } catch (err) { console.error('Failed to persist chart config:', err); }
    }, []);

    const autoTitle = useCallback(async (convId, firstMessage) => {
        if (!convId) return;
        try {
            await fetch(`${API}/api/ai/conversations/${convId}/title/auto`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstMessage }),
            });
        } catch (err) { console.error('Failed to auto-title:', err); }
    }, []);

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

        // Persistence: ensure conversation exists and persist user message (diving only)
        let activeConvId = null;
        const isFirstMessage = messages.length === 0;
        if (isDiving) {
            activeConvId = await ensureConversation(modelToUse);
            if (activeConvId) {
                persistMessage(activeConvId, 'user', text).catch(() => {});
                if (isFirstMessage) {
                    autoTitle(activeConvId, text).catch(() => {});
                }
            }
        }

        try {
            const res = await fetch(`${API}/api/ai/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    provider,
                    model: modelToUse,
                    mode: isDiving ? 'diving' : 'assistant',
                    contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                    activeSkillId: isDiving && activeSkillId ? activeSkillId : undefined,
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
                buffer = lines.pop();

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
                                args: event.args || null,
                                result: event.result,
                            });
                            setActiveToolCalls(prev =>
                                prev.map(tc => tc.toolCallId === event.toolCallId
                                    ? { ...tc, result: event.result, isLoading: false }
                                    : tc)
                            );
                        } else if (event.type === 'step-finish') {
                            // Step finished
                        } else if (event.type === 'error') {
                            throw new Error(event.error);
                        }
                    } catch (parseErr) {
                        if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
                    }
                }
            }

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

            await new Promise(r => setTimeout(r, 50));

            const assistantMsg = {
                role: 'assistant',
                content: fullText,
                toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
            };
            setMessages(prev => [...prev, assistantMsg]);
            setStreamingText('');

            // Persistence: save assistant message and tool results (diving only)
            if (isDiving && activeConvId) {
                (async () => {
                    try {
                        const savedMsg = await persistMessage(activeConvId, 'assistant', fullText, mergedToolCalls);
                        if (!savedMsg) return;

                        // Persist query results and chart configs from tool calls
                        const queryResultIdMap = new Map(); // queryId -> persisted DB id
                        for (const tc of mergedToolCalls) {
                            if (tc.toolName === 'execute_sql' && tc.result && !tc.result.error) {
                                const persisted = await persistQueryResult(activeConvId, savedMsg.id, tc.result);
                                if (persisted && tc.result.queryId) {
                                    queryResultIdMap.set(tc.result.queryId, persisted.id);
                                }
                            }
                            if (tc.toolName === 'display_chart' && tc.result && !tc.result.error) {
                                const qrDbId = queryResultIdMap.get(tc.args?.query_id);
                                if (qrDbId) {
                                    await persistChartConfig(activeConvId, qrDbId, tc.result.chartType || tc.args?.chart_type, tc.result);
                                }
                            }
                        }
                    } catch (err) { console.error('Failed to persist assistant data:', err); }
                })();
            }

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
    }, [inputText, isGenerating, messages, selectedModel, customModel, provider, contextObjects, isDiving, activeSkillId, ensureConversation, persistMessage, persistQueryResult, persistChartConfig, autoTitle]);

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
    const handleNewConversation = () => {
        handleClearChat();
        // Conversation will be created lazily on first message via ensureConversation
    };

    const handleSelectConversation = async (id) => {
        if (!id) { handleClearChat(); return; }
        try {
            const res = await fetch(`${API}/api/ai/conversations/${id}`);
            if (res.ok) {
                const conv = await res.json();
                setConversationId(conv.id);
                // Build lookup maps for query results and chart configs
                const queryResultsByMsgId = {};
                for (const qr of (conv.queryResults || [])) {
                    if (!queryResultsByMsgId[qr.message_id]) queryResultsByMsgId[qr.message_id] = [];
                    queryResultsByMsgId[qr.message_id].push(qr);
                }
                const chartConfigsByQrId = {};
                for (const cc of (conv.chartConfigs || [])) {
                    chartConfigsByQrId[cc.query_result_id] = cc;
                }

                // Rebuild messages with enriched tool calls
                const loadedMessages = (conv.messages || []).map(m => {
                    let toolCalls = m.tool_calls || undefined;

                    // Enrich tool calls with persisted query results and chart configs
                    if (toolCalls && Array.isArray(toolCalls) && queryResultsByMsgId[m.id]) {
                        const qResults = queryResultsByMsgId[m.id];
                        let qrIndex = 0;
                        toolCalls = toolCalls.map(tc => {
                            if (tc.toolName === 'execute_sql' && qrIndex < qResults.length) {
                                const qr = qResults[qrIndex++];
                                return {
                                    ...tc,
                                    result: {
                                        ...tc.result,
                                        queryId: qr.id,
                                        query: qr.sql_query,
                                        columns: qr.columns_info || tc.result?.columns,
                                        data: qr.data || tc.result?.data,
                                        rowCount: qr.row_count ?? tc.result?.rowCount,
                                        executionTime: qr.execution_time ?? tc.result?.executionTime,
                                    },
                                };
                            }
                            if (tc.toolName === 'display_chart') {
                                // Find matching chart config via query result
                                for (const qr of qResults) {
                                    const cc = chartConfigsByQrId[qr.id];
                                    if (cc) {
                                        return {
                                            ...tc,
                                            result: {
                                                ...tc.result,
                                                ...(cc.config || {}),
                                                queryId: qr.id,
                                            },
                                        };
                                    }
                                }
                            }
                            return tc;
                        });
                    }

                    return {
                        role: m.role,
                        content: m.content,
                        toolCalls,
                    };
                });

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

    const modelToUse = selectedModel === 'custom' ? customModel : selectedModel;

    // ─── Chat messages area (shared between sidebar and diving) ───
    const chatMessages = (
        <>
            {messages.length === 0 && !isGenerating && (
                <div className={`ai-empty-state${isDiving ? ' ai-empty-state--diving' : ''}`}>
                    <div className="ai-empty-state-icon">
                        <LuSparkles size={isDiving ? 40 : 28} />
                    </div>
                    {isDiving && (
                        <h2 className="ai-empty-state-title">Data Diving</h2>
                    )}
                    <div className="ai-empty-state-hint">
                        Ask anything about your data.
                        {!isDiving && <><br /><span>Drop tables/files above for context.</span></>}
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
                    isDiving={isDiving}
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
        <div className={`ai-input-area${isDiving ? ' ai-input-area--diving' : ''}`}>
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
            {isDiving && (
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
            )}
            {!isDiving && (
                <div className="ai-input-hint">
                    Enter to send · Shift+Enter for newline
                </div>
            )}
        </div>
    );

    // ═══════════════════════════════════════════════════════
    // DATA DIVING MODE — 3-column layout
    // ═══════════════════════════════════════════════════════
    if (isDiving) {
        return (
            <div className="ai-diving" style={{ width }}>
                {/* ─── Left column: Conversations ─── */}
                <ConversationList
                    activeId={conversationId}
                    onSelect={handleSelectConversation}
                    onNew={handleNewConversation}
                />

                {/* ─── Center column: Chat ─── */}
                <div className="ai-diving-center">
                    {/* Diving header */}
                    <div className="ai-diving-header">
                        <div className="ai-diving-header-left">
                            {onExitDiving && (
                                <button className="ai-icon-btn" onClick={onExitDiving} title="Back to Editor">
                                    <LuArrowLeft size={16} />
                                </button>
                            )}
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

                {/* ─── Right column: Context Panel ─── */}
                {status === 'READY' && (
                    <AiContextPanel
                        contextObjects={contextObjects}
                        isDragOver={isDragOver}
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                        onRemoveContext={removeContextObj}
                        onQuickAction={(text) => handleSend(text)}
                        hasMessages={messages.length > 0}
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
    }

    // ═══════════════════════════════════════════════════════
    // SIDEBAR MODE — Original compact layout
    // ═══════════════════════════════════════════════════════
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

                    {/* ─── Skill Selector (Data Diving only) ─── */}
                    {isDiving && availableSkills.length > 0 && (
                        <div className="ai-skill-selector">
                            <div className="ai-skill-label">
                                <LuWand size={10} />
                                <span>Skill</span>
                            </div>
                            <select
                                className="ai-skill-select"
                                value={activeSkillId || ''}
                                onChange={(e) => setActiveSkillId(e.target.value || null)}
                            >
                                <option value="">General (no skill)</option>
                                {availableSkills.map(s => (
                                    <option key={s.id} value={s.id} title={s.description}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

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
                        {chatMessages}
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
                    {inputComposer}
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
};

export default AiSidebar;
