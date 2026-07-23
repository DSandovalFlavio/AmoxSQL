import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE as API } from '../../api.js';

/** Stable client-side message id (survives the streaming→historical handoff). */
function genId() {
    try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* noop */ }
    return `m-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export const DEFAULT_GEMINI_MODELS = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', size: 'Cloud' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', size: 'Cloud' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

export const fetchGeminiModels = async () => {
    try {
        const res = await fetch(`${API}/api/settings/gemini/models`);
        if (!res.ok) return DEFAULT_GEMINI_MODELS;
        const data = await res.json();
        return data.models || DEFAULT_GEMINI_MODELS;
    } catch (e) {
        return DEFAULT_GEMINI_MODELS;
    }
};

export const ANTHROPIC_MODELS = [
    { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', size: 'Cloud' },
    { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', size: 'Cloud' },
    { id: 'claude-3-opus', label: 'Claude 3 Opus', size: 'Cloud' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

export const MINIMAX_MODELS = [
    { id: 'MiniMax-M2.7', label: 'MiniMax M2.7', size: 'Cloud' },
    { id: 'MiniMax-M2.5', label: 'MiniMax M2.5', size: 'Cloud' },
    { id: 'MiniMax-M2-Her', label: 'MiniMax M2 Her', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

// Hardcoded lists are now only FALLBACKS. The real list is discovered live per
// provider so new models (MiniMax M3, new Gemini/Claude) show up without edits.
const CLOUD_FALLBACKS = {
    gemini: DEFAULT_GEMINI_MODELS,
    anthropic: ANTHROPIC_MODELS,
    minimax: MINIMAX_MODELS,
};

/**
 * Discover available models for a cloud provider from the backend, which queries
 * the provider's live "list models" API. Falls back to the static list on error,
 * and always appends a "Custom Model..." escape hatch so any brand-new id can be
 * typed in even if the provider's listing lags.
 */
export const fetchCloudModels = async (provider) => {
    const fallback = CLOUD_FALLBACKS[provider] || [];
    try {
        const res = await fetch(`${API}/api/settings/models/${provider}`);
        if (!res.ok) return fallback;
        const data = await res.json();
        const models = (data.models || []).map(m => ({ id: m.id, label: m.label || m.id, size: 'Cloud' }));
        if (!models.length) return fallback;
        return [...models, { id: 'custom', label: 'Custom Model...', size: 'Cloud' }];
    } catch {
        return fallback;
    }
};

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
 * @param {Function|null} options.getFileContext - Stable getter returning { content, results, chartConfig }
 *        for the active file, read at SEND time. When provided it takes precedence over
 *        fileContent/fileResult/fileChartConfig, decoupling the chat from per-keystroke props.
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
    getFileContext = null,
    onEditFile = null,
    onUpdateChartConfig = null,
} = {}) {
    // ─── Config State ───
    const [status, setStatus] = useState('LOADING');
    const [provider, setProvider] = useState('ollama');
    const [selectedModel, setSelectedModel] = useState('qwen3:1.7b');
    const [customModel, setCustomModel] = useState('');
    const [installedModels, setInstalledModels] = useState([]);
    // Unified list of models for the active CLOUD provider (gemini/anthropic/minimax),
    // discovered live from the backend.
    const [cloudModelsList, setCloudModelsList] = useState([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);
    // F4: which Ollama models are resident right now (from /api/ai/model-status),
    // so the model picker can show a ● hot / ◐ on-CPU / ○ cold indicator.
    const [modelStatus, setModelStatus] = useState([]);

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
    // Artifacts the user referenced for the next turn ("Ask about this": chart/query/step/finding)
    const [pendingReferences, setPendingReferences] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [activeToolCalls, setActiveToolCalls] = useState([]);
    // Stable id for the in-flight assistant turn. The live turn AND the message
    // appended at run-end share this id, so the inspector selection survives the
    // live→historical handoff without a churn (no empty-state flash, no re-click).
    const [streamingId, setStreamingId] = useState(null);
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
    // ask-continue: loop exhausted mid-plan, waiting for user to continue or cancel
    const [pendingContinue, setPendingContinue] = useState(null);
    // userSkippedSteps: Set<stepId> — steps the user marked to skip before the agent continues
    const [userSkippedSteps, setUserSkippedSteps] = useState(new Set());

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
                            // F6: prefer this mode's own model, then the global default.
                            const preferred = configData.modelPerMode?.[mode] || configData.defaultModel;
                            const found = models.find(m => m.name === preferred);
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
                    // Cloud provider — discover models live (gemini/anthropic/minimax)
                    setIsModelsLoading(true);
                    const availableModels = await fetchCloudModels(prov);
                    setCloudModelsList(availableModels);
                    setIsModelsLoading(false);

                    const preferred = configData.modelPerMode?.[mode] || configData.defaultModel;
                    const modelFound = availableModels.find(m => m.id === preferred);
                    if (modelFound && modelFound.id !== 'custom') {
                        setSelectedModel(preferred);
                    } else {
                        setSelectedModel('custom');
                        setCustomModel(preferred || '');
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

    // ─── F4: Warm the selected model + track its residency ───
    // When the user picks a local model (or one resolves on open), preload it in
    // the background so weights are in memory by the time they hit send. Then
    // poll /api/ai/model-status so the picker shows a truthful hot/cold dot.
    useEffect(() => {
        if (provider !== 'ollama' || !modelToUse || modelToUse === 'custom') return;
        let cancelled = false;

        const refreshStatus = async () => {
            try {
                const res = await fetch(`${API}/api/ai/model-status`);
                const data = await res.json();
                if (!cancelled) setModelStatus(data.models || []);
            } catch { /* Ollama not running — leave status empty */ }
        };

        // Fire-and-forget warmup (don't block; the model loads while the user types).
        fetch(`${API}/api/ai/warmup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse }),
        }).then(() => { if (!cancelled) refreshStatus(); }).catch(() => {});

        refreshStatus();
        const iv = setInterval(refreshStatus, 20000); // keep the dot fresh
        return () => { cancelled = true; clearInterval(iv); };
    }, [provider, modelToUse]);

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
    // Only follow the bottom while actively generating; on plain load the panel
    // restores its remembered scroll position instead (see AiDivingPanel).
    useEffect(() => {
        if (!isGenerating && !streamingText) return;
        // While streaming, a smooth scroll animation restarts on every flush and
        // competes with renders — jump instantly; animate only on the final settle.
        chatEndRef.current?.scrollIntoView({ behavior: isGenerating ? 'auto' : 'smooth' });
    }, [messages, streamingText, activeToolCalls, isGenerating]);

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
                window.dispatchEvent(new CustomEvent('amox_conversation_created', { detail: { id: conv.id } }));
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
        const userMsg = { id: genId(), role: 'user', content: text, toolCalls: [] };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInputText('');
        // Mint the assistant turn id up-front so the live turn and the final
        // appended message share identity (stable inspector selection).
        const assistantId = genId();
        setStreamingId(assistantId);
        const isContinuation = !!pendingContinue;
        setIsGenerating(true);
        setStreamingText('');
        setActiveToolCalls([]);
        activeToolCallsRef.current = [];
        if (!isContinuation) setPlanState(null);
        setPlanIteration(0);
        setPendingAskUser(null);
        setPendingContinue(null);
        const currentSkippedSteps = userSkippedSteps;
        setUserSkippedSteps(new Set());

        // Build context arrays for the API
        const contextFiles = contextObjects
            .filter(o => o.type === 'file')
            .map(o => ({ name: o.name, path: o.path }));
        const contextTables = contextObjects
            .filter(o => o.type === 'table')
            .map(o => ({ name: o.name }));

        // Artifacts the user referenced for this turn (consumed once)
        const refs = pendingReferences;
        if (refs.length > 0) setPendingReferences([]);

        // Build API messages (only role + content)
        const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

        abortControllerRef.current = new AbortController();

        // Persistence: ensure conversation exists and persist user message
        let activeConvId = null;
        const isFirstMessage = messages.length === 0;
        let cancelStreamFlush = () => {};

        activeConvId = await ensureConversation(currentModel, { mode, filePath });
        if (activeConvId) {
            persistMessage(activeConvId, 'user', text).catch(() => {});
            if (isFirstMessage) {
                autoTitle(activeConvId, text).catch(() => {});
            }
        }

        try {
            // File context is resolved NOW (at send time): with a getter we read the
            // live content/result/chart config on demand instead of receiving them as
            // reactive props that would tie the panel to the editor's keystroke cycle.
            const liveCtx = getFileContext ? (getFileContext() || {}) : null;
            const ctxContent = liveCtx ? (liveCtx.content ?? null) : fileContent;
            const ctxResult = liveCtx ? (liveCtx.results ?? null) : fileResult;
            const ctxChartConfig = liveCtx ? (liveCtx.chartConfig ?? null) : fileChartConfig;
            const ctxResultsQuery = liveCtx ? (liveCtx.resultsQuery ?? null) : null;
            const ctxView = liveCtx ? (liveCtx.activeView ?? null) : null;

            const requestBody = {
                messages: apiMessages,
                provider,
                model: currentModel,
                mode,
                contextFiles: contextFiles.length > 0 ? contextFiles : undefined,
                contextTables: contextTables.length > 0 ? contextTables : undefined,
                activeSkillId: mode === 'diving' && activeSkillId ? activeSkillId : undefined,
                conversationId: activeConvId || undefined,
                referencedArtifacts: refs.length > 0 ? refs : undefined,
            };
            if (filePath) requestBody.filePath = filePath;
            if (fileType) requestBody.fileType = fileType;
            if (ctxContent) requestBody.currentQuery = ctxContent;
            // Rendering context: let the agent choose chart palettes that harmonize
            // with the user's active theme and read on the current light/dark mode.
            try {
                const cs = getComputedStyle(document.body);
                requestBody.uiTheme = {
                    mode: document.body.classList.contains('mode-light') ? 'light' : 'dark',
                    theme: localStorage.getItem('amoxsql-theme') || 'dark',
                    accent: localStorage.getItem('amoxsql-accent') || 'default',
                    accentColor: cs.getPropertyValue('--accent-primary').trim() || null,
                };
            } catch { /* no DOM (SSR/test) — skip */ }
            if (currentSkippedSteps.size > 0) {
                requestBody.planStepOverrides = Array.from(currentSkippedSteps).map(id => ({ stepId: id, status: 'skipped', note: 'skipped by user' }));
            }
            if (isContinuation) {
                requestBody.continueMode = true;
                const opts = continueOptsRef.current || {};
                // Finalize-now → budget of 1 so the wrap-up turn forces synthesis fast.
                if (opts.finalize) requestBody.continueBudget = 1;
                continueOptsRef.current = null;
            }
            // Live result the user is LOOKING AT. We send the id + the rows so the
            // server can register them in the AI query-cache (display_chart then
            // resolves THIS result with no re-execution), plus a tiny sample so the
            // model can reason on real values. Local DB over localhost → cheap.
            if (ctxResult && ((ctxResult.data?.length ?? 0) > 0 || ctxResult.rowCount)) {
                const rows = Array.isArray(ctxResult.data) ? ctxResult.data : [];
                // Columns WITH types when available (from /api/query `types` map).
                const columns = ctxResult.types
                    ? Object.entries(ctxResult.types).map(([name, type]) => ({ name, type }))
                    : (ctxResult.columns || (rows[0] ? Object.keys(rows[0]).map(n => ({ name: n })) : []));
                requestBody.currentResult = {
                    queryId: ctxResult.queryId ?? null,
                    resultsQuery: ctxResultsQuery,
                    rowCount: ctxResult.rowCount ?? rows.length,
                    columns,
                    truncated: !!ctxResult.truncated,
                    executionTime: ctxResult.executionTime ?? null,
                    data: rows.slice(0, 500),   // for server-side cache registration
                    sample: rows.slice(0, 5),   // for the prompt (real values)
                };
            }
            if (ctxChartConfig) requestBody.currentChartConfig = ctxChartConfig;
            // Which surface the user is focused on: 'table' | 'chart' | 'profile'.
            if (ctxView) requestBody.currentView = ctxView;

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
            // Reasoning timing (for the "Pensó durante Xs" chip): mark when the
            // first <think> opens and when it closes.
            let thinkStart = null;
            let thinkingMs = null;

            // Text deltas arrive one per token; rendering the transcript once per
            // token saturates the main thread. Accumulate in fullText and flush to
            // React at most every STREAM_FLUSH_MS.
            const STREAM_FLUSH_MS = 80;
            let streamFlushTimer = null;
            let lastStreamFlush = 0;
            const flushStream = () => {
                streamFlushTimer = null;
                lastStreamFlush = performance.now();
                setStreamingText(fullText);
                const openCount = (fullText.match(/<think>/g) || []).length;
                const closeCount = (fullText.match(/<\/think>/g) || []).length;
                setIsThinking(openCount > closeCount);
            };
            const scheduleStreamFlush = () => {
                if (streamFlushTimer !== null) return;
                const wait = Math.max(0, STREAM_FLUSH_MS - (performance.now() - lastStreamFlush));
                streamFlushTimer = setTimeout(flushStream, wait);
            };
            cancelStreamFlush = () => {
                if (streamFlushTimer !== null) {
                    clearTimeout(streamFlushTimer);
                    streamFlushTimer = null;
                }
            };

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
                            // Time the reasoning span (first <think> → its </think>).
                            if (thinkStart === null && fullText.includes('<think>')) {
                                thinkStart = performance.now();
                            }
                            if (thinkingMs === null && thinkStart !== null && fullText.includes('</think>')) {
                                thinkingMs = performance.now() - thinkStart;
                            }
                            scheduleStreamFlush();

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
                            // finish carries usage only; query rows are rehydrated
                            // on demand via /api/ai/query-cache/:queryId
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
                        } else if (event.type === 'ask-continue') {
                            setPendingContinue({
                                planGoal:       event.planGoal || '',
                                pendingSteps:   event.pendingSteps || 0,
                                completedSteps: event.completedSteps || 0,
                                planId:         event.planId || null,
                            });
                            setPlanState(prev => prev ? { ...prev, status: 'paused' } : prev);
                        } else if (event.type === 'step-start') {
                            setPlanIteration(event.iteration || 0);
                            if (event.maxIterations) setPlanMaxIterations(event.maxIterations);
                        } else if (event.type === 'step-end') {
                            // no-op
                        } else if (event.type === 'sql-correction') {
                            // SQL self-correction loop — agent is retrying a failed query
                            console.log(`[AI] SQL correction attempt ${event.attempt}`, event.errors);
                        } else if (event.type === 'error') {
                            throw new Error(event.error);
                        }
                    } catch (parseErr) {
                        if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
                    }
                }
            }

            cancelStreamFlush();
            flushStream();

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
                id: assistantId,
                role: 'assistant',
                content: fullText,
                toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
                thinkingMs: thinkingMs || undefined,
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

            // Remember this mode's model (F6: assistant and diving keep separate
            // models — the server merges modelPerMode) and keep defaultModel as a
            // sensible fallback. Notify other AI panels to re-sync.
            fetch(`${API}/api/settings/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultModel: currentModel, modelPerMode: { [mode]: currentModel } }),
            }).then(() => {
                window.dispatchEvent(new Event('amox_settings_updated'));
            }).catch(() => {});

        } catch (e) {
            cancelStreamFlush();
            if (e.name === 'AbortError') {
                setErrorMsg('Generation cancelled.');
            } else {
                setErrorMsg('Error: ' + e.message);
            }
            setStreamingText('');
            setActiveToolCalls([]);
        } finally {
            setIsGenerating(false);
            setStreamingId(null);
            abortControllerRef.current = null;
        }
    }, [
        inputText, isGenerating, messages, selectedModel, customModel, provider,
        contextObjects, mode, filePath, fileType, fileContent, fileResult, fileChartConfig, getFileContext, activeSkillId,
        pendingContinue,
        ensureConversation, persistMessage, persistQueryResult, persistChartConfig, autoTitle,
        onEditFile, onUpdateChartConfig,
    ]);

    // ─── Continue after loop exhaustion ───
    // continueOptsRef threads per-continue options (budget/finalize) into the very
    // next handleSend without adding them to its dependency array.
    const continueOptsRef = useRef(null);

    // Continue the paused plan. An optional instruction (from the "Continue with
    // instructions…" input) is sent as the user turn so the agent can focus the
    // remaining work ("only finish s6, skip s7").
    const handleContinue = useCallback((instruction) => {
        continueOptsRef.current = { finalize: false };
        const text = (typeof instruction === 'string' && instruction.trim())
            ? instruction.trim()
            : 'Continúa con el plan donde lo dejaste.';
        handleSend(text);
    }, [handleSend]);

    // Finish now with whatever the agent already has — no more queries. Grants a
    // budget of 1 so the wrap-up turn forces a synthesis immediately.
    const handleFinalizeNow = useCallback(() => {
        continueOptsRef.current = { finalize: true };
        handleSend('Finaliza el análisis AHORA con lo que ya tienes: no corras más queries ni pasos nuevos. Llama final_answer con un resumen de los hallazgos hasta ahora y marca lo que quedó pendiente en caveats.');
    }, [handleSend]);

    const handleDeclineContinue = useCallback(() => {
        setPendingContinue(null);
        setPlanState(prev => prev ? { ...prev, status: 'cancelled' } : prev);
    }, []);

    // ─── Skip plan step (user-initiated) ───
    const handleSkipPlanStep = useCallback((stepId) => {
        setUserSkippedSteps(prev => new Set([...prev, stepId]));
        // Also update planState locally so the UI reflects the skip immediately
        setPlanState(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                steps: prev.steps.map(s => s.id === stepId ? { ...s, status: 'skipped', note: 'skipped by user' } : s),
            };
        });
    }, []);

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
        setPendingContinue(null);
        setUserSkippedSteps(new Set());
        setPendingReferences([]);
        if (mode === 'diving') setContextObjects([]);
    }, [mode]);

    // ─── Artifact references ("Ask about this") ───
    const addReference = useCallback((ref) => {
        if (!ref) return;
        setPendingReferences(prev => (prev.some(r => r.key === ref.key) ? prev : [...prev, ref]));
    }, []);
    const removeReference = useCallback((i) => {
        setPendingReferences(prev => prev.filter((_, idx) => idx !== i));
    }, []);

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

                    // Enrich tool calls with persisted query results and chart configs.
                    // Two-pass strategy: execute_sql calls build a clientQueryId→dbQrId map
                    // so display_chart calls can find their exact chart config instead of the first one.
                    if (toolCalls && Array.isArray(toolCalls) && queryResultsByMsgId[m.id]) {
                        const qResults = queryResultsByMsgId[m.id];
                        const clientIdToDbQrId = new Map(); // queryId (client) → qr.id (DB)

                        // Pair each execute_sql with ITS OWN persisted result by SQL
                        // text. The old index pairing mis-assigned data whenever a query
                        // errored or wasn't persisted — the offset handed a chart the
                        // wrong query's rows, so on reload the x-axis column was absent
                        // and the chart rendered "No data to display". Falls back to the
                        // message's own persisted result data (which is correct) if a
                        // query has no cache match.
                        const norm = (str) => String(str || '').replace(/\s+/g, ' ').trim();
                        const byQuery = new Map();
                        for (const qr of qResults) {
                            const k = norm(qr.sql_query);
                            if (!byQuery.has(k)) byQuery.set(k, []);
                            byQuery.get(k).push(qr);
                        }

                        toolCalls = toolCalls.map(tc => {
                            if (tc.toolName === 'execute_sql') {
                                const bucket = byQuery.get(norm(tc.args?.query));
                                const qr = (bucket && bucket.length) ? bucket.shift() : null;
                                const clientQueryId = tc.result?.queryId;
                                if (!qr) return tc; // keep the message's own (correct) data
                                if (clientQueryId) clientIdToDbQrId.set(clientQueryId, qr.id);
                                return {
                                    ...tc,
                                    result: {
                                        ...tc.result,
                                        queryId: clientQueryId || qr.id,
                                        query: qr.sql_query,
                                        columns: qr.columns_info || tc.result?.columns,
                                        data: qr.data || tc.result?.data,
                                        rowCount: qr.row_count ?? tc.result?.rowCount,
                                        executionTime: qr.execution_time ?? tc.result?.executionTime,
                                    },
                                };
                            }
                            if (tc.toolName === 'display_chart') {
                                // Match this chart to its exact query result using the queryId the agent used
                                const clientQueryId = tc.args?.query_id || tc.result?.queryId;
                                const dbQrId = clientQueryId ? clientIdToDbQrId.get(clientQueryId) : undefined;
                                const cc = dbQrId
                                    ? chartConfigsByQrId[dbQrId]
                                    : null;
                                if (cc) {
                                    return {
                                        ...tc,
                                        result: {
                                            ...tc.result,
                                            ...(cc.config || {}),
                                            queryId: clientQueryId || dbQrId,
                                        },
                                    };
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
                // A plan reconstructed without a final_answer, still holding
                // unfinished steps, was left paused (cycles exhausted / interrupted).
                // Mark it paused, surface interrupted steps, and offer to continue.
                if (reconstructedPlan && reconstructedPlan.status !== 'completed') {
                    const unfinished = reconstructedPlan.steps.filter(
                        s => s.status === 'pending' || s.status === 'in_progress'
                    );
                    if (unfinished.length > 0) {
                        reconstructedPlan.steps = reconstructedPlan.steps.map(s =>
                            s.status === 'in_progress' ? { ...s, status: 'interrupted' } : s
                        );
                        reconstructedPlan.status = 'paused';
                        setPendingContinue({
                            planGoal:       reconstructedPlan.goal || '',
                            pendingSteps:   unfinished.length,
                            completedSteps: reconstructedPlan.steps.filter(s => s.status === 'done').length,
                            planId:         reconstructedPlan.planId || null,
                            resumed:        true, // came from a reload, not a live exhaustion
                        });
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
        // Live-discovered model list for the active cloud provider
        cloudModelsList,

        // Artifact references ("Ask about this")
        pendingReferences, addReference, removeReference,

        // Config state
        status,
        provider, setProvider,
        selectedModel, setSelectedModel,
        customModel, setCustomModel,
        installedModels,
        isModelsLoading,
        modelStatus,

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
        streamingId,
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
        pendingContinue, setPendingContinue,
        handleContinue,
        handleFinalizeNow,
        handleDeclineContinue,
        userSkippedSteps,
        handleSkipPlanStep,

        // Persistence helpers (exposed for advanced use)
        ensureConversation,
        persistMessage,
        persistQueryResult,
        persistChartConfig,
        autoTitle,
    };
}
