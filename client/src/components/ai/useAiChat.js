import { useState, useEffect, useRef, useCallback } from 'react';

const API = 'http://localhost:3001';

const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', size: 'Cloud' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', size: 'Cloud' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

/**
 * useAiChat — Core shared hook for AI chat logic.
 * Used by both AiAssistantPanel and AiDivingPanel.
 *
 * @param {Object} options
 * @param {'diving'|'assistant'} options.mode - Chat mode
 * @param {string|null} options.filePath - Active file path (for assistant mode context)
 * @param {string|null} options.fileType - Active file type (e.g. 'sql', 'sqlnb')
 * @param {string|null} options.fileContent - Current file content (for assistant mode context)
 * @param {object|null} options.fileResult - Current query result (for assistant mode context)
 * @param {object|null} options.fileChartConfig - Current chart config (for assistant mode context)
 * @param {Function|null} options.onEditFile - Callback when AI produces an edit_file action
 * @param {Function|null} options.onUpdateChartConfig - Callback when AI produces an update_chart_config action
 */
export default function useAiChat({
    mode = 'diving',
    filePath = null,
    fileType = null,
    fileContent = null,
    fileResult = null,
    fileChartConfig = null,
    onEditFile = null,
    onUpdateChartConfig = null,
} = {}) {
    // ─── Config State ───
    const [status, setStatus] = useState('LOADING');
    const [provider, setProvider] = useState('ollama');
    const [selectedModel, setSelectedModel] = useState('qwen3:1.7b');
    const [customModel, setCustomModel] = useState('');
    const [installedModels, setInstalledModels] = useState([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);

    // ─── Skills State ───
    const [availableSkills, setAvailableSkills] = useState([]);
    const [activeSkillId, setActiveSkillId] = useState(null);

    // ─── Context State ───
    const [contextObjects, setContextObjects] = useState([]);
    const [isDragOver, setIsDragOver] = useState(false);
    // Tracks if context objects were loaded from DB (to avoid saving on first load)
    const contextLoadedForConvRef = useRef(null);

    // ─── Chat State ───
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [activeToolCalls, setActiveToolCalls] = useState([]);
    const [errorMsg, setErrorMsg] = useState(null);
    const [conversationId, setConversationId] = useState(null);
    // pending edits: Map of toolCallId → edit result (waiting for user accept/reject)
    const [pendingEdits, setPendingEdits] = useState({});

    // ─── Agentic Plan State (Fase 1) ───
    // planState: { planId, goal, steps[], status } | null
    const [planState, setPlanState] = useState(null);
    const [planIteration, setPlanIteration] = useState(0);
    const [planMaxIterations, setPlanMaxIterations] = useState(0);
    // ask_user: { question, options[], context } | null
    const [pendingAskUser, setPendingAskUser] = useState(null);

    // ─── Refs ───
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);
    const abortControllerRef = useRef(null);
    const activeToolCallsRef = useRef([]);

    // ─── Computed ───
    const modelToUse = selectedModel === 'custom' ? customModel : selectedModel;

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
                console.error('AI Status check failed', e);
                setStatus('ERROR');
            }
        };

        loadConfig();
        window.addEventListener('amox_settings_updated', loadConfig);
        return () => window.removeEventListener('amox_settings_updated', loadConfig);
    }, []);

    // ─── Load Skills (conditional) ───
    useEffect(() => {
        if (mode !== 'diving') return;
        const loadSkills = async () => {
            try {
                const res = await fetch(`${API}/api/ai/skills`);
                if (res.ok) {
                    const skills = await res.json();
                    setAvailableSkills(skills);
                }
            } catch (err) {
                console.error('Failed to load skills:', err);
            }
        };
        loadSkills();
    }, [mode]);

    // ─── Auto-scroll ───
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText, activeToolCalls]);

    // ─── Drag & Drop ───
    const handleDrop = useCallback((e) => {
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
        } catch (err) {
            console.error('Drop failed:', err);
        }
    }, [contextObjects]);

    const removeContextObj = useCallback((index) => {
        setContextObjects(prev => prev.filter((_, i) => i !== index));
    }, []);

    // ─── Persist context objects to DB (diving mode only) ───
    useEffect(() => {
        if (mode !== 'diving') return;
        if (!conversationId) return;
        // Skip on initial load (when we just restored from DB)
        if (contextLoadedForConvRef.current === conversationId) {
            contextLoadedForConvRef.current = null;
            return;
        }
        fetch(`${API}/api/ai/conversations/${conversationId}/context-objects`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contextObjects }),
        }).catch(err => console.error('Failed to persist context objects:', err));
    }, [contextObjects, conversationId, mode]);

    // ─── Persistence helpers ───
    const ensureConversation = useCallback(async (model, { mode: convMode, filePath: convFilePath } = {}) => {
        if (conversationId) return conversationId;

        const effectiveMode = convMode || mode;
        try {
            const body = {
                mode: effectiveMode,
                provider,
                model,
            };
            if (convFilePath) {
                body.file_path = convFilePath;
            }
            const res = await fetch(`${API}/api/ai/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const conv = await res.json();
                setConversationId(conv.id);
                return conv.id;
            }
        } catch (err) {
            console.error('Failed to create conversation:', err);
        }
        return null;
    }, [conversationId, provider, mode]);

    const persistMessage = useCallback(async (convId, role, content, toolCalls) => {
        if (!convId) return null;
        try {
            const res = await fetch(`${API}/api/ai/conversations/${convId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, content, toolCalls }),
            });
            if (res.ok) return await res.json();
        } catch (err) {
            console.error('Failed to persist message:', err);
        }
        return null;
    }, []);

    const persistQueryResult = useCallback(async (convId, messageId, toolResult, sqlQuery) => {
        if (!convId || !messageId) return null;
        try {
            const res = await fetch(`${API}/api/ai/conversations/${convId}/query-results`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId,
                    sqlQuery: sqlQuery || toolResult.query || '',
                    columns: toolResult.columns,
                    data: toolResult.data,
                    rowCount: toolResult.rowCount,
                    executionTime: toolResult.executionTime,
                    error: toolResult.error,
                }),
            });
            if (res.ok) return await res.json();
        } catch (err) {
            console.error('Failed to persist query result:', err);
        }
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
        } catch (err) {
            console.error('Failed to persist chart config:', err);
        }
    }, []);

    const autoTitle = useCallback(async (convId, firstMessage) => {
        if (!convId) return;
        try {
            await fetch(`${API}/api/ai/conversations/${convId}/title/auto`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstMessage }),
            });
        } catch (err) {
            console.error('Failed to auto-title:', err);
        }
    }, []);

    // ─── Send Message ───
    const handleSend = useCallback(async (overrideText) => {
        const text = overrideText || inputText.trim();
        if (!text || isGenerating) return;

        setErrorMsg(null);
        const currentModel = selectedModel === 'custom' ? customModel : selectedModel;
        if (!currentModel) {
            setErrorMsg('Please select or enter a model name.');
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
        setPlanState(null);
        setPlanIteration(0);
        setPendingAskUser(null);

        // Build context arrays for the API
        const contextFiles = contextObjects
            .filter(o => o.type === 'file')
            .map(o => ({ name: o.name, path: o.path }));
        const contextTables = contextObjects
            .filter(o => o.type === 'table')
            .map(o => ({ name: o.name }));

        // Build API messages (only role + content)
        const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

        abortControllerRef.current = new AbortController();

        // Persistence: ensure conversation exists and persist user message
        let activeConvId = null;
        const isFirstMessage = messages.length === 0;

        activeConvId = await ensureConversation(currentModel, { mode, filePath });
        if (activeConvId) {
            persistMessage(activeConvId, 'user', text).catch(() => {});
            if (isFirstMessage) {
                autoTitle(activeConvId, text).catch(() => {});
            }
        }

        try {
            const requestBody = {
                messages: apiMessages,
                provider,
                model: currentModel,
                mode,
                contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                contextTables: contextTables.length > 0 ? contextTables : undefined,
                activeSkillId: mode === 'diving' && activeSkillId ? activeSkillId : undefined,
                conversationId: activeConvId || undefined,
            };
            if (filePath) requestBody.filePath = filePath;
            if (fileType) requestBody.fileType = fileType;
            if (fileContent) requestBody.currentQuery = fileContent;
            // Send a lightweight summary of the result (not the full data)
            if (fileResult) {
                requestBody.currentResult = {
                    rowCount: fileResult.rowCount ?? fileResult.data?.length ?? 0,
                    columns: fileResult.columns || (fileResult.data?.[0] ? Object.keys(fileResult.data[0]).map(n => ({ name: n })) : []),
                };
            }
            if (fileChartConfig) requestBody.currentChartConfig = fileChartConfig;

            const res = await fetch(`${API}/api/ai/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
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

                            // Detect if we are inside a <think> block
                            const openCount = (fullText.match(/<think>/g) || []).length;
                            const closeCount = (fullText.match(/<\/think>/g) || []).length;
                            setIsThinking(openCount > closeCount);

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

                            // edit_file: store as pending — user must accept/reject from the chat UI
                            if (event.result?.action === 'edit_file') {
                                setPendingEdits(prev => ({
                                    ...prev,
                                    [event.toolCallId]: event.result,
                                }));
                            }
                            // update_chart_config: apply immediately (non-destructive)
                            if (event.result?.action === 'update_chart_config' && onUpdateChartConfig) {
                                onUpdateChartConfig(event.result);
                            }

                        } else if (event.type === 'step-finish') {
                            // Step finished — no-op
                        } else if (event.type === 'finish') {
                            // finish event carries usage and queryResults — handled after stream ends
                        } else if (event.type === 'plan-created') {
                            const p = event.plan || {};
                            setPlanState({
                                planId: p.planId,
                                goal:   p.goal,
                                steps:  p.steps || [],
                                status: 'pending',
                            });
                        } else if (event.type === 'plan-progress') {
                            // event.steps is a full snapshot of activePlan.steps with updated statuses
                            setPlanState(prev => prev
                                ? { ...prev, steps: event.steps || prev.steps }
                                : prev
                            );
                        } else if (event.type === 'plan-completed') {
                            setPlanState(prev => prev ? { ...prev, status: 'completed' } : prev);
                        } else if (event.type === 'plan-paused') {
                            setPlanState(prev => prev ? { ...prev, status: 'paused' } : prev);
                        } else if (event.type === 'ask-user') {
                            setPendingAskUser({
                                question: event.question,
                                options:  event.options || [],
                                context:  event.context || '',
                            });
                        } else if (event.type === 'step-start') {
                            setPlanIteration(event.iteration || 0);
                            if (event.maxIterations) setPlanMaxIterations(event.maxIterations);
                        } else if (event.type === 'step-end') {
                            // no-op
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
                    toolCallId: tc.toolCallId,
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

            // Persistence: save assistant message and tool results
            if (activeConvId) {
                (async () => {
                    try {
                        const savedMsg = await persistMessage(activeConvId, 'assistant', fullText, mergedToolCalls);
                        if (!savedMsg) return;

                        // Persist query results and chart configs from tool calls
                        const queryResultIdMap = new Map();
                        for (const tc of mergedToolCalls) {
                            if (tc.toolName === 'execute_sql' && tc.result && !tc.result.error) {
                                const persisted = await persistQueryResult(activeConvId, savedMsg.id, tc.result, tc.args?.query);
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
                    } catch (err) {
                        console.error('Failed to persist assistant data:', err);
                    }
                })();
            }

            // Save model as default and notify other AI panels to sync
            fetch(`${API}/api/settings/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultModel: currentModel }),
            }).then(() => {
                window.dispatchEvent(new Event('amox_settings_updated'));
            }).catch(() => {});

        } catch (e) {
            if (e.name === 'AbortError') {
                setErrorMsg('Generation cancelled.');
            } else {
                setErrorMsg('Error: ' + e.message);
            }
            setStreamingText('');
            setActiveToolCalls([]);
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    }, [
        inputText, isGenerating, messages, selectedModel, customModel, provider,
        contextObjects, mode, filePath, fileType, fileContent, fileResult, fileChartConfig, activeSkillId,
        ensureConversation, persistMessage, persistQueryResult, persistChartConfig, autoTitle,
        onEditFile, onUpdateChartConfig,
    ]);

    // ─── Keyboard shortcut ───
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    // ─── Clear chat ───
    const handleClearChat = useCallback(() => {
        setMessages([]);
        setStreamingText('');
        setActiveToolCalls([]);
        setConversationId(null);
        setErrorMsg(null);
        setPlanState(null);
        setPlanIteration(0);
        setPendingAskUser(null);
        if (mode === 'diving') setContextObjects([]);
    }, [mode]);

    // ─── Conversation management ───
    const handleNewConversation = useCallback(() => {
        handleClearChat();
        // Conversation will be created lazily on first message via ensureConversation
    }, [handleClearChat]);

    const handleSelectConversation = useCallback(async (id) => {
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
                                        queryId: tc.result?.queryId || qr.id,
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
                                                queryId: tc.result?.queryId || tc.args?.query_id || qr.id,
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

                // Reconstruct plan state from tool calls
                let reconstructedPlan = null;
                for (const m of loadedMessages) {
                    if (m.toolCalls) {
                        for (const tc of m.toolCalls) {
                            if (tc.toolName === 'create_plan' && tc.result && !tc.result.error) {
                                reconstructedPlan = {
                                    planId: tc.result.planId || tc.result.plan_id,
                                    goal: tc.result.goal,
                                    steps: tc.result.steps || [],
                                    status: 'pending',
                                };
                            } else if (tc.toolName === 'update_plan' && tc.result && !tc.result.error && reconstructedPlan) {
                                const stepId = tc.args?.step_id;
                                const status = tc.args?.status;
                                if (stepId && status) {
                                    reconstructedPlan.steps = reconstructedPlan.steps.map(s => 
                                        s.id === stepId ? { ...s, status, note: tc.args.note || s.note } : s
                                    );
                                }
                            } else if (tc.toolName === 'final_answer' && reconstructedPlan) {
                                reconstructedPlan.status = 'completed';
                            }
                        }
                    }
                }
                setPlanState(reconstructedPlan);

                // Restore persisted context objects (diving mode)
                if (mode === 'diving' && Array.isArray(conv.context_objects) && conv.context_objects.length > 0) {
                    contextLoadedForConvRef.current = conv.id;
                    setContextObjects(conv.context_objects);
                } else if (mode === 'diving') {
                    setContextObjects([]);
                }
            }
        } catch (err) {
            console.error('Failed to load conversation:', err);
        }
    }, [handleClearChat, mode]);

    // ─── Cancel ───
    const handleCancel = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    // ─── Pending Edit: Accept / Reject ───
    const acceptEdit = useCallback((toolCallId) => {
        const editResult = pendingEdits[toolCallId];
        if (editResult && onEditFile) {
            onEditFile(editResult);
        }
        setPendingEdits(prev => {
            const next = { ...prev };
            delete next[toolCallId];
            return next;
        });
    }, [pendingEdits, onEditFile]);

    const rejectEdit = useCallback((toolCallId) => {
        setPendingEdits(prev => {
            const next = { ...prev };
            delete next[toolCallId];
            return next;
        });
    }, []);

    // ─── Return ───
    return {
        // Constants
        GEMINI_MODELS,

        // Config state
        status,
        provider, setProvider,
        selectedModel, setSelectedModel,
        customModel, setCustomModel,
        installedModels,
        isModelsLoading,

        // Skills state
        availableSkills,
        activeSkillId, setActiveSkillId,

        // Context state
        contextObjects, setContextObjects,
        isDragOver, setIsDragOver,

        // Chat state
        messages, setMessages,
        inputText, setInputText,
        isGenerating,
        streamingText,
        isThinking,
        activeToolCalls,
        errorMsg, setErrorMsg,
        conversationId, setConversationId,

        // Refs
        chatEndRef,
        inputRef,
        abortControllerRef,
        activeToolCallsRef,

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

        // Pending edits (edit_file proposals waiting for user accept/reject)
        pendingEdits,
        acceptEdit,
        rejectEdit,

        // Agentic plan state (Fase 1 — populated only in diving mode with planner active)
        planState,
        planIteration,
        planMaxIterations,
        pendingAskUser, setPendingAskUser,

        // Persistence helpers (exposed for advanced use)
        ensureConversation,
        persistMessage,
        persistQueryResult,
        persistChartConfig,
        autoTitle,
    };
}
