import { API_BASE } from '../api.js';
import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect, useCallback, memo } from 'react';
import { LuColumns2, LuMaximize2 } from "react-icons/lu";
import EditorPane from './EditorPane';
import QueryPlanModal from './QueryPlanModal';
import { useToast } from './ToastProvider';
import { resolveVariables } from './VariablesBar';
import AlertDialog from './AlertDialog';
import { useDialog } from './dialogs/DialogProvider';
import { saveDraft, getDraft, clearDraft } from '../utils/draftSaver';
import { DECK_STARTER_TEMPLATE } from '../utils/deckParser';
import { invalidateSchema } from '../state/sidebarCache';
import { splitSqlStatements } from '../utils/sqlSplitter';

const TAB_STORAGE_KEY = 'amoxsql-layout-v1';
// Per-file choice for multi-statement .sql files: 'script' | 'notebook'.
// Keyed by file path so "don't ask again for this file" survives reloads.
const SQL_FILE_PREFS_KEY = 'amoxsql-sql-file-prefs';

const getSqlFilePref = (path) => {
    if (!path) return null;
    try {
        const prefs = JSON.parse(localStorage.getItem(SQL_FILE_PREFS_KEY) || '{}');
        return prefs[path] || null;
    } catch { return null; }
};
const setSqlFilePref = (path, pref) => {
    if (!path) return;
    try {
        const prefs = JSON.parse(localStorage.getItem(SQL_FILE_PREFS_KEY) || '{}');
        prefs[path] = pref;
        localStorage.setItem(SQL_FILE_PREFS_KEY, JSON.stringify(prefs));
    } catch { /* non-fatal */ }
};

const LayoutManager = forwardRef(({ projectPath, theme, editorLayout, editorSettings, onDbChange, onRequestSaveAs, onQueryResult, showAiSidebar, onToggleAi, onTabsChange, availableTables, onExportNotebook, onExportAmoxvis, onShowHistorySidebar }, ref) => {
    const toast = useToast();
    const dialog = useDialog();
    // Layout State
    const [splitEnabled, setSplitEnabled] = useState(false);
    const [activePane, setActivePane] = useState('left'); // 'left' or 'right'

    // Tabs State
    const [leftTabs, setLeftTabs] = useState([]);
    const [rightTabs, setRightTabs] = useState([]);
    const [leftActiveId, setLeftActiveId] = useState(null);
    const [rightActiveId, setRightActiveId] = useState(null);

    // Query Plan State
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [planData, setPlanData] = useState(null);
    const [planQuery, setPlanQuery] = useState('');
    const [planMetrics, setPlanMetrics] = useState(null);
    const [planMode, setPlanMode] = useState('analyze');
    const [planNote, setPlanNote] = useState(null);
    const [planLoading, setPlanLoading] = useState(false);

    // Variables State (shared across session)
    const [queryVariables, setQueryVariables] = useState([]);

    // Alert Modal State
    const [alertData, setAlertData] = useState({ isOpen: false, message: '', title: 'Error', type: 'error' });

    // Query Cancellation State
    const [runningQueryId, setRunningQueryId] = useState(null);
    const queryAbortControllerRef = useRef(null);

    // Drag & Drop State (declared here so stateRef below can reference it)
    const [draggedTab, setDraggedTab] = useState(null); // { tabId, sourcePane }
    const [dragOverZone, setDragOverZone] = useState(null); // 'left-edge', 'right-edge', 'left-pane', 'right-pane'

    // --- Latest-state ref (G4): stable useCallback([]) handlers read the current
    // state/props here at call time, so their identity never changes and the
    // memoized EditorPanes can bail out when the *other* pane changes. ---
    const stateRef = useRef({});
    stateRef.current = {
        leftTabs, rightTabs, leftActiveId, rightActiveId, activePane, splitEnabled,
        queryVariables, draggedTab, runningQueryId,
        editorSettings, onRequestSaveAs, onQueryResult, onDbChange,
        toast, dialog,
    };

    // --- Tab Persistence (G1): debounced write to localStorage instead of a
    // synchronous setItem per keystroke. Flushed on beforeunload/unmount. ---
    const persistTabsRef = useRef(null);
    const restoreAttemptedRef = useRef(false);
    useEffect(() => {
        const tabMeta = {
            leftTabs: leftTabs.map(t => ({ path: t.path, name: t.name, type: t.type })),
            rightTabs: rightTabs.map(t => ({ path: t.path, name: t.name, type: t.type })),
            leftActiveId,
            rightActiveId,
            splitEnabled
        };
        persistTabsRef.current = tabMeta;
        // Never persist before the restore attempt finishes: the initial empty
        // state would clobber the previously saved tabs.
        if (!restoreAttemptedRef.current) return;
        const timer = setTimeout(() => {
            try {
                localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabMeta));
            } catch { /* ignore */ }
        }, 600);
        return () => clearTimeout(timer);
    }, [leftTabs, rightTabs, leftActiveId, rightActiveId, splitEnabled]);

    useEffect(() => {
        const flush = () => {
            if (!restoreAttemptedRef.current || !persistTabsRef.current) return;
            try {
                localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(persistTabsRef.current));
            } catch { /* ignore */ }
        };
        window.addEventListener('beforeunload', flush);
        return () => {
            window.removeEventListener('beforeunload', flush);
            flush();
        };
    }, []);

    // --- Parent notification (G1): only lightweight tab METADATA (no content,
    // no results), and only when that metadata actually changes. Typing flips
    // `dirty` once; the following keystrokes produce identical metadata and are
    // skipped, so App no longer re-renders per key. ---
    const lastNotifiedMetaRef = useRef('');
    useEffect(() => {
        if (!onTabsChange) return;
        const metaOf = (t) => ({ id: t.id, name: t.name, dirty: !!t.dirty, path: t.path || '', type: t.type });
        const leftMeta = leftTabs.map(metaOf);
        const rightMeta = rightTabs.map(metaOf);
        const payload = {
            // Active pane data (backward compat)
            tabs: activePane === 'left' ? leftMeta : rightMeta,
            activeTabId: activePane === 'left' ? leftActiveId : rightActiveId,
            paneId: activePane,
            // Split-view data
            splitEnabled,
            left: { tabs: leftMeta, activeTabId: leftActiveId },
            right: { tabs: rightMeta, activeTabId: rightActiveId },
        };
        const serialized = JSON.stringify(payload);
        if (serialized === lastNotifiedMetaRef.current) return;
        lastNotifiedMetaRef.current = serialized;
        onTabsChange(payload);
    }, [leftTabs, rightTabs, leftActiveId, rightActiveId, splitEnabled, activePane, onTabsChange]);

    // --- Tab Persistence: Restore on mount ---
    useEffect(() => {
        const restoreTabs = async () => {
            try {
                const saved = localStorage.getItem(TAB_STORAGE_KEY);
                if (!saved) return;
                const meta = JSON.parse(saved);
                if (!meta.leftTabs?.length && !meta.rightTabs?.length) return;

                const loadTab = async (t) => {
                    if (!t.path) return null; // Skip unsaved tabs
                    try {
                        const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(t.path)}`);
                        const data = await res.json();
                        if (data.error) return null;
                        return {
                            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                            path: t.path,
                            name: t.name,
                            type: t.type || 'sql',
                            content: data.content,
                            results: null,
                            dirty: false
                        };
                    } catch { return null; }
                };

                const restoredLeft = (await Promise.all(meta.leftTabs.map(loadTab))).filter(Boolean);
                const restoredRight = (await Promise.all((meta.rightTabs || []).map(loadTab))).filter(Boolean);

                if (restoredLeft.length > 0) {
                    setLeftTabs(restoredLeft);
                    setLeftActiveId(restoredLeft[restoredLeft.length - 1].id);
                }
                if (restoredRight.length > 0) {
                    setRightTabs(restoredRight);
                    setRightActiveId(restoredRight[restoredRight.length - 1].id);
                    setSplitEnabled(true);
                }
            } catch (e) {
                console.warn('[TabPersistence] Restore failed:', e);
            }
        };
        restoreTabs().finally(() => {
            // Persisting is allowed only after the restore attempt so the initial
            // empty tab state never overwrites the saved layout.
            restoreAttemptedRef.current = true;
        });
    }, []); // Only on mount

    // Helpers — stable identities (read current state via stateRef)
    const getActiveTab = useCallback(() => {
        const { activePane, leftTabs, rightTabs, leftActiveId, rightActiveId } = stateRef.current;
        if (activePane === 'left') {
            return leftTabs.find(t => t.id === leftActiveId);
        } else {
            return rightTabs.find(t => t.id === rightActiveId);
        }
    }, []);

    const updateTab = useCallback((pane, tabId, updates) => {
        if (pane === 'left') {
            setLeftTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
        } else {
            setRightTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
        }
    }, []);

    // Actions
    const handleContentChange = useCallback((tabId, newContent) => {
        // Need to find which pane has this tab
        const { leftTabs, rightTabs } = stateRef.current;
        const inLeft = leftTabs.some(t => t.id === tabId);
        const tab = leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId);
        // Editors (Story Flow, notebook, chains) re-emit their serialized
        // content on mount/config normalization even when NOTHING changed.
        // Marking dirty unconditionally made freshly opened (or just-saved)
        // tabs show the ● forever. Identical content → no-op.
        if (tab && tab.content === newContent) return;
        updateTab(inLeft ? 'left' : 'right', tabId, { content: newContent, dirty: true });
        // Auto-save draft to localStorage for crash recovery
        if (tab?.path) {
            saveDraft(tab.path, newContent);
        }
    }, [updateTab]);

    // A Deep Dive tab remembers its conversation in `content` (used as
    // startConversationId). Update it WITHOUT marking the tab dirty.
    const handleConversationChange = useCallback((tabId, convId) => {
        if (!convId) return;
        const { leftTabs, rightTabs } = stateRef.current;
        if (leftTabs.find(t => t.id === tabId)) updateTab('left', tabId, { content: convId });
        else if (rightTabs.find(t => t.id === tabId)) updateTab('right', tabId, { content: convId });
    }, [updateTab]);

    const handleTabClose = useCallback((tabId) => {
        const { leftTabs, rightTabs, leftActiveId, rightActiveId } = stateRef.current;
        const inLeft = leftTabs.some(t => t.id === tabId);
        const tabs = inLeft ? leftTabs : rightTabs;
        const activeId = inLeft ? leftActiveId : rightActiveId;
        const setTabs = inLeft ? setLeftTabs : setRightTabs;
        const setActiveId = inLeft ? setLeftActiveId : setRightActiveId;

        const index = tabs.findIndex(t => t.id === tabId);
        const newTabs = tabs.filter(t => t.id !== tabId);
        setTabs(newTabs);
        if (activeId === tabId) {
            if (newTabs.length > 0) {
                const newIdx = Math.max(0, index - 1);
                setActiveId(newTabs[newIdx].id);
            } else {
                setActiveId(null);
            }
        }
    }, []);

    // Parse DuckDB error messages to extract line/column for inline highlighting
    const parseDuckDBError = (errorMsg) => {
        if (!errorMsg || typeof errorMsg !== 'string') return null;

        let line = null;
        let column = null;
        const message = errorMsg;

        // Pattern 1: "LINE N:" (most common DuckDB pattern)
        const lineMatch = errorMsg.match(/LINE\s+(\d+):/i);
        if (lineMatch) {
            line = parseInt(lineMatch[1], 10);
        }

        // Pattern 2: "line N:C" or "at line N, column C"
        const lineColMatch = errorMsg.match(/(?:at\s+)?line\s+(\d+)(?:[:,]\s*(?:col(?:umn)?\s*)?(\d+))?/i);
        if (lineColMatch) {
            line = parseInt(lineColMatch[1], 10);
            if (lineColMatch[2]) column = parseInt(lineColMatch[2], 10);
        }

        // Pattern 3: Position indicator with caret "^" — count position
        const caretMatch = errorMsg.match(/\n(\s*)\^/);
        if (caretMatch && !column) {
            column = caretMatch[1].length + 1;
        }

        // If no line found, default to line 1
        if (!line) line = 1;

        return { line, column: column || 1, message };
    };

    const cancelQuery = useCallback(async () => {
        const { runningQueryId } = stateRef.current;
        if (!runningQueryId) return;
        // Abort the in-flight fetch immediately so the UI unblocks
        queryAbortControllerRef.current?.abort();
        // Also tell the server to interrupt the DuckDB query
        try {
            await fetch(`${API_BASE}/api/query/cancel/${runningQueryId}`, { method: 'POST' });
        } catch {}
        setRunningQueryId(null);
    }, []);

    // Run a multi-statement script sequentially, stopping at the first error.
    // Produces a `scriptRun` log (one step per statement) rather than N tables;
    // the last statement that yields rows still shows its table, preserving the
    // "one query → one table" model for the tabular part.
    const runAsScript = useCallback(async (pane, tabId, statements, rowLimit) => {
        const { onQueryResult, onDbChange } = stateRef.current;
        const controller = new AbortController();
        queryAbortControllerRef.current = controller;

        const steps = [];
        let finalTable = null;        // last statement's tabular data
        let finalTableQuery = null;
        let errorMarker = null;
        let schemaChanged = false;
        let cancelled = false;
        const scriptStart = performance.now();

        try {
            for (let idx = 0; idx < statements.length; idx++) {
                const stmt = statements[idx];
                const stepStart = performance.now();
                const qid = crypto.randomUUID();
                setRunningQueryId(qid); // so cancelQuery targets the running statement
                const step = {
                    index: idx,
                    sqlPreview: stmt.code.replace(/\s+/g, ' ').slice(0, 120),
                    startLine: stmt.startLine,
                    status: 'running',
                };
                steps.push(step);
                // Live snapshot so the summary fills in as it runs.
                updateTab(pane, tabId, {
                    scriptRun: { steps: steps.map(s => ({ ...s })), running: true, total: statements.length },
                    results: finalTable, resultsQuery: finalTableQuery, resultsError: null,
                });

                let data;
                try {
                    const response = await fetch(`${API_BASE}/api/query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: stmt.raw, queryId: qid, limit: rowLimit }),
                        signal: controller.signal,
                    });
                    data = await response.json();
                    if (!response.ok) {
                        step.status = 'error';
                        step.error = data.error;
                        step.ms = (performance.now() - stepStart).toFixed(0);
                        const m = parseDuckDBError(data.error);
                        if (m) errorMarker = { ...m, line: m.line + stmt.startLine - 1 };
                        break; // stop-on-error
                    }
                } catch (err) {
                    step.ms = (performance.now() - stepStart).toFixed(0);
                    if (err.name === 'AbortError') { step.status = 'cancelled'; cancelled = true; break; }
                    step.status = 'error';
                    step.error = err.message;
                    const m = parseDuckDBError(err.message);
                    if (m) errorMarker = { ...m, line: m.line + stmt.startLine - 1 };
                    break;
                }

                step.status = 'ok';
                step.ms = (performance.now() - stepStart).toFixed(0);
                step.resultType = data.resultType;
                step.rowsAffected = data.rowsAffected;
                step.rowCount = data.rowCount;
                step.truncated = data.truncated;
                step.details = data.resultDetails;

                const upper = stmt.code.toUpperCase();
                if (upper.match(/^(CREATE|DROP|ALTER|UPDATE|INSERT|DELETE|ATTACH|DETACH|COPY)/) || upper.includes('INTO')) {
                    schemaChanged = true;
                }
                // Keep the tabular result from the last statement that produced one.
                if (data.resultType === 'query_result' && Array.isArray(data.data)) {
                    finalTable = data;
                    finalTableQuery = stmt.raw;
                }
            }
        } finally {
            setRunningQueryId(null);
            queryAbortControllerRef.current = null;
        }

        const totalMs = (performance.now() - scriptStart).toFixed(0);
        const failCount = steps.filter(s => s.status === 'error').length;
        const okCount = steps.filter(s => s.status === 'ok').length;
        updateTab(pane, tabId, {
            scriptRun: {
                steps, totalMs, okCount, failCount, cancelled,
                stoppedAtError: failCount > 0,
                total: statements.length,
                running: false,
            },
            results: finalTable,             // null when no statement produced a table
            resultsQuery: finalTableQuery,
            resultsError: null,              // script errors live inside scriptRun
            errorMarker,
        });

        if (schemaChanged) { invalidateSchema(); if (onDbChange) onDbChange(); }
        if (onQueryResult) onQueryResult({ executionTime: totalMs, rowCount: finalTable?.data?.length ?? null });

        return { script: true, okCount, failCount, cancelled };
    }, [updateTab]);

    const executeQuery = useCallback(async (tabId, query) => {
        const { leftTabs, rightTabs, queryVariables, editorSettings, dialog, onQueryResult, onDbChange } = stateRef.current;
        const tab = leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId);
        const pane = leftTabs.find(t => t.id === tabId) ? 'left' : 'right';
        // Resolve variables before execution
        const resolvedQuery = resolveVariables(query, queryVariables);
        const rowLimit = editorSettings?.queryResultLimit ?? 10000;

        const statements = splitSqlStatements(resolvedQuery);

        // ── Multi-statement: run as script, or split into a notebook ────────
        if (statements.length > 1) {
            let mode = getSqlFilePref(tab?.path); // 'script' | 'notebook' | null
            if (!mode) {
                const choice = await dialog.chooseAsync({
                    title: 'Se detectaron múltiples consultas',
                    message: `Este archivo tiene ${statements.length} sentencias SQL. ¿Cómo quieres ejecutarlo?`,
                    options: [
                        {
                            value: 'script',
                            label: 'Ejecutar como script',
                            primary: true,
                            description: 'Corre cada sentencia en orden y muestra un resumen (filas afectadas, tablas creadas). Si la última es un SELECT, muestra su tabla.',
                        },
                        {
                            value: 'notebook',
                            label: 'Convertir a SQL Notebook',
                            description: 'Separa cada sentencia en su propia celda para análisis iterativo.',
                        },
                    ],
                    checkboxLabel: tab?.path ? 'Recordar mi elección para este archivo' : null,
                    cancelLabel: 'Cancelar',
                });
                if (!choice || !choice.value) return { cancelled: true };
                mode = choice.value;
                if (choice.remember && tab?.path) setSqlFilePref(tab.path, mode);
            }

            if (mode === 'notebook') {
                // Preserve comments: each cell keeps the statement's raw text.
                const notebookContent = statements
                    .map((s) => `-- !CELL:CODE!\n${s.raw}${s.raw.endsWith(';') ? '' : ';'}`)
                    .join('\n\n');
                createNew('notebook', notebookContent);
                return { cancelled: true };
            }

            return await runAsScript(pane, tabId, statements, rowLimit);
        }

        // ── Single statement (original behavior) ────────────────────────────
        const qid = crypto.randomUUID();
        const controller = new AbortController();
        queryAbortControllerRef.current = controller;
        setRunningQueryId(qid);
        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: resolvedQuery, queryId: qid, limit: rowLimit }),
                signal: controller.signal,
            });
            const data = await response.json();

            if (response.ok) {
                updateTab(pane, tabId, { results: data, resultsQuery: resolvedQuery, resultsError: null, errorMarker: null, scriptRun: null });

                // Notify parent of query result for status bar
                if (onQueryResult) {
                    onQueryResult({
                        executionTime: data.executionTime,
                        rowCount: data.data?.length ?? null,
                    });
                }

                // Only refresh DB schema if query might have changed it
                const upperQuery = resolvedQuery.trim().toUpperCase();
                if (upperQuery.match(/^(CREATE|DROP|ALTER|UPDATE|INSERT|DELETE|ATTACH|DETACH|COPY)/) || upperQuery.includes('INTO')) {
                    // Invalidate schema cache so DatabaseExplorer refetches fresh data
                    invalidateSchema();
                    if (onDbChange) onDbChange();
                }

                return {
                    data: data.data,
                    types: data.types,
                    executionTime: data.executionTime,
                    resultType: data.resultType,
                    resultDetails: data.resultDetails,
                    details: data.resultDetails,
                    rowsAffected: data.rowsAffected,
                    rowCount: data.rowCount,
                    truncated: data.truncated,
                };
            } else {
                const marker = parseDuckDBError(data.error);
                updateTab(pane, tabId, { results: null, resultsError: data.error, errorMarker: marker, scriptRun: null });
                return { error: data.error };
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // User cancelled — clear state silently, no error shown
                updateTab(pane, tabId, { results: null, resultsError: null, errorMarker: null, scriptRun: null });
                return { cancelled: true };
            }
            const marker = parseDuckDBError(err.message);
            updateTab(pane, tabId, { results: null, resultsError: err.message, errorMarker: marker, scriptRun: null });
            return { error: err.message };
        } finally {
            setRunningQueryId(null);
            queryAbortControllerRef.current = null;
        }
    }, [updateTab, runAsScript]); // reads the rest via stateRef; createNew (stable) resolved by closure

    const handleRunActive = useCallback(async () => {
        const tab = getActiveTab();
        if (!tab) return;
        if (tab.type === 'sql') {
            await executeQuery(tab.id, tab.content);
        }
    }, [getActiveTab, executeQuery]);

    const handleSaveActive = useCallback(async (isSilent = false) => {
        const { onRequestSaveAs, activePane, toast } = stateRef.current;
        const tab = getActiveTab();
        if (!tab || !tab.dirty) return;

        if (!tab.path) {
            if (onRequestSaveAs) {
                onRequestSaveAs(tab.content, tab);
            } else {
                console.warn("Save As function not connected.");
            }
            return;
        }

        try {
            let saveContent = tab.content;
            if (tab.path && tab.path.endsWith('.amoxvis') && tab.type === 'sql') {
                const config = tab.chartConfig || tab.initialChartConfig || {};
                const newConfig = { ...config, query: tab.content };
                saveContent = JSON.stringify(newConfig, null, 2);
            }

            const response = await fetch(`${API_BASE}/api/file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.path, content: saveContent })
            });

            if (response.ok) {
                updateTab(activePane, tab.id, { dirty: false });
                if (tab.path) clearDraft(tab.path);
                if (!isSilent) toast.success("Saved!");
            } else {
                console.error("Save failed");
                if (!isSilent) toast.error("Save failed!");
            }
        } catch (e) {
            console.error("Error saving: " + e.message);
            if (!isSilent) toast.error("Error saving: " + e.message);
        }
    }, [getActiveTab, updateTab]);

    const handleAnalyzeActive = useCallback(async (mode) => {
        const tab = getActiveTab();
        if (!tab || tab.type !== 'sql') {
            console.warn("Please select a SQL file to analyze.");
            return;
        }

        // Resolve ${variables} before EXPLAIN — Run and Export already do, and raw
        // ${var} placeholders would make DuckDB's EXPLAIN fail on parameterized queries.
        const { queryVariables } = stateRef.current;
        const query = resolveVariables(tab.content, queryVariables);
        // Default mode: ANALYZE (real timing) for read-only queries; otherwise EXPLAIN (estimated),
        // since ANALYZE executes the query. The backend also guards this. The modal can switch modes.
        const isReadOnly = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*(?:SELECT|WITH)\b/i.test(query);
        // `mode` may be the click event when invoked from a button — only honor explicit strings.
        const requestedMode = (mode === 'explain' || mode === 'analyze') ? mode : undefined;
        const effectiveMode = requestedMode || (isReadOnly ? 'analyze' : 'explain');

        setPlanQuery(query);
        setShowPlanModal(true);
        setPlanLoading(true);
        setPlanNote(null);

        try {
            const response = await fetch(`${API_BASE}/api/db/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, mode: effectiveMode }),
            });
            const data = await response.json();

            if (response.ok && data.plan) {
                setPlanData(data.plan);
                setPlanMetrics(data.metrics || null);
                setPlanMode(data.mode || effectiveMode);
                setPlanNote(data.note || null);
            } else {
                setPlanData(null);
                setPlanMetrics(null);
                setPlanNote(data.error || 'Could not generate the execution plan.');
            }
        } catch (err) {
            setPlanData(null);
            setPlanMetrics(null);
            setPlanNote('Analyze error: ' + err.message);
        } finally {
            setPlanLoading(false);
        }
    }, [getActiveTab]);

    // Extracted createNew so it can be passed to EditorPanes + exposed via ref
    const createNew = useCallback((type, initialContent) => {
        const normalizedType = (type === 'notebook' || type === 'sqlnb') ? 'sqlnb'
            : (type === 'chain' || type === 'sqlchain') ? 'sqlchain'
            : type;
        const newTab = {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            path: '',
            name: normalizedType === 'sqlnb' ? 'Untitled.sqlnb'
                : normalizedType === 'sqlchain' ? 'Untitled.sqlchain'
                : normalizedType === 'md' ? 'Untitled.md'
                : normalizedType === 'amoxdeck' ? 'Untitled.amoxdeck'
                : normalizedType === 'er-diagram' ? (initialContent ? `ER · ${initialContent}` : 'ER Diagram')
                : normalizedType === 'datadiving' ? 'Deep Dive'
                : normalizedType === 'dbt-lineage' ? 'DBT Lineage'
                : 'Untitled.sql',
            type: normalizedType,
            content: initialContent || (normalizedType === 'sqlnb'
                ? '-- !CELL:MARKDOWN!\n-- # New Notebook\n\n-- !CELL:CODE!\nSELECT 1;'
                : normalizedType === 'sqlchain'
                ? JSON.stringify({ version: '1.0', name: 'New Chain', description: '', nodes: [], edges: [], variables: {} }, null, 2)
                : normalizedType === 'md' ? '# New Markdown File\n\nWrite your notes here...'
                : normalizedType === 'amoxdeck' ? DECK_STARTER_TEMPLATE
                : normalizedType === 'er-diagram' ? ''
                : normalizedType === 'datadiving' ? ''
                : normalizedType === 'dbt-lineage' ? ''
                : 'SELECT 1;'),
            results: null,
            dirty: normalizedType !== 'er-diagram' && normalizedType !== 'datadiving' && normalizedType !== 'dbt-lineage'
        };
        if (stateRef.current.activePane === 'left') {
            setLeftTabs(prev => [...prev, newTab]);
            setLeftActiveId(newTab.id);
        } else {
            setRightTabs(prev => [...prev, newTab]);
            setRightActiveId(newTab.id);
        }
    }, []);

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
        // Expose tab state for rendering TabBar in WindowTitleBar
        getTabBarProps: (pane) => {
            // If a specific pane is requested, return that pane's props
            const targetPane = pane || activePane;
            return {
                tabs: targetPane === 'left' ? leftTabs : rightTabs,
                activeTabId: targetPane === 'left' ? leftActiveId : rightActiveId,
                onTabClick: (id) => {
                    if (targetPane === 'left') { setLeftActiveId(id); setActivePane('left'); }
                    else { setRightActiveId(id); setActivePane('right'); }
                },
                onTabClose: handleTabClose,
                onDragStart: handleDragStart,
                onReorder: handleReorder,
                onCreateNew: createNew,
                paneId: targetPane,
            };
        },
        openFile: async (path, content, type, options = {}) => {
            const pane = activePane === 'left' ? leftTabs : rightTabs;
            const existing = pane.find(t => t.path === path);

            if (existing) {
                if (activePane === 'left') setLeftActiveId(existing.id);
                else setRightActiveId(existing.id);
            } else {
                // Check for an unsaved draft and offer recovery
                const draft = getDraft(path);
                let finalContent = content;
                if (draft && draft.content !== content) {
                    const fileName = path.split(/[/\\]/).pop();
                    toast.info(
                        `Unsaved draft found for ${fileName}`,
                        {
                            action: {
                                label: 'Recover',
                                onClick: () => {
                                    // Update content in the tab after it's created
                                    const allTabs = [...leftTabs, ...rightTabs];
                                    const t = allTabs.find(tb => tb.path === path);
                                    if (t) {
                                        const p = leftTabs.find(tb => tb.id === t.id) ? 'left' : 'right';
                                        updateTab(p, t.id, { content: draft.content, dirty: true });
                                    }
                                    clearDraft(path);
                                }
                            }
                        }
                    );
                }
                let initialChartConfig = null;
                if (type === 'amoxvis' || path.endsWith('.amoxvis')) {
                    try {
                        initialChartConfig = JSON.parse(finalContent);
                    } catch (e) {
                        console.warn('Failed to parse amoxvis content:', e);
                    }
                }

                const newTab = {
                    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                    path: path,
                    name: path.split(/[/\\]/).pop(),
                    type: type || (path.endsWith('.sqlnb') ? 'sqlnb' : path.endsWith('.sqlchain') ? 'sqlchain' : path.endsWith('.md') ? 'md' : path.endsWith('.amoxvis') ? 'amoxvis' : 'sql'),
                    content: finalContent,
                    results: null,
                    dirty: false,
                    readOnly: options.readOnly || false,
                    initialChartConfig: initialChartConfig,
                };
                if (activePane === 'left') {
                    setLeftTabs(prev => [...prev, newTab]);
                    setLeftActiveId(newTab.id);
                } else {
                    setRightTabs(prev => [...prev, newTab]);
                    setRightActiveId(newTab.id);
                }
            }
        },
        createNew,
        // Open a Deep Dive conversation in a tab: focus an existing tab bound to
        // this conversation if one is open, otherwise create a new one. A null
        // convId always opens a fresh (empty) Deep Dive conversation.
        openDataDiving: (convId = null) => {
            if (convId) {
                const inLeft = leftTabs.find(t => t.type === 'datadiving' && t.content === convId);
                if (inLeft) { setActivePane('left'); setLeftActiveId(inLeft.id); return; }
                const inRight = rightTabs.find(t => t.type === 'datadiving' && t.content === convId);
                if (inRight) { setActivePane('right'); setRightActiveId(inRight.id); return; }
            }
            createNew('datadiving', convId || '');
        },
        handleTriggerRun: () => handleRunActive(),
        handleTriggerSave: (isSilent = false) => handleSaveActive(isSilent),
        handleTriggerAnalyze: () => handleAnalyzeActive(),
        handleTriggerSaveAs: () => {
            const tab = getActiveTab();
            if (tab && onRequestSaveAs) {
                onRequestSaveAs(tab.content, tab);
            }
        },
        closeActiveTab: () => {
            const tabId = activePane === 'left' ? leftActiveId : rightActiveId;
            if (tabId) handleTabClose(tabId);
        },
        navigateTab: (direction) => {
            const tabs = activePane === 'left' ? leftTabs : rightTabs;
            const currentId = activePane === 'left' ? leftActiveId : rightActiveId;
            if (tabs.length < 2) return;
            const idx = tabs.findIndex(t => t.id === currentId);
            const nextIdx = (idx + direction + tabs.length) % tabs.length;
            if (activePane === 'left') setLeftActiveId(tabs[nextIdx].id);
            else setRightActiveId(tabs[nextIdx].id);
        },
        toggleSplit: () => setSplitEnabled(v => !v),
        finishSaveAs: (newPath) => {
            // Update the active tab's path
            const tab = getActiveTab();
            if (tab) {
                const updates = {
                    path: newPath,
                    name: newPath.split(/[/\\]/).pop(),
                    dirty: false
                };
                updateTab(activePane, tab.id, updates);
            }
        },

        // --- Standalone handleQueryFile function (used by imperative handle + DnD) ---
        handleQueryFile: (filePath) => handleQueryFile(filePath),
        // ─── AI Integration: update active tab content (for edit_file tool) ───
        updateActiveContent: (content) => {
            const tab = getActiveTab();
            if (tab) {
                updateTab(activePane, tab.id, { content, dirty: true });
                toast.info('AI updated the file — review changes before saving');
            }
        },

        // ─── AI Integration: append SQL to current file content ───
        appendToActiveContent: (sql) => {
            const tab = getActiveTab();
            if (tab) {
                const current = tab.content || '';
                const separator = current.trim().length > 0 ? '\n\n' : '';
                updateTab(activePane, tab.id, { content: current + separator + sql, dirty: true });
            }
        },

        // ─── AI Integration: merge chart config changes (for update_chart_config tool) ───
        updateActiveChartConfig: (changes) => {
            const tab = getActiveTab();
            if (tab) {
                const current = tab.chartConfig || tab.initialChartConfig || {};
                updateTab(activePane, tab.id, {
                    chartConfig: { ...current, ...changes },
                    initialChartConfig: { ...current, ...changes },
                });
                // Dispatch event so any mounted DataVisualizer (sql or sqlnb) merges
                // changes into its current state immediately via setFields — this
                // preserves auto-detected axes and avoids the LOAD_CONFIG defaults reset.
                window.dispatchEvent(new CustomEvent('amox_update_chart_config', { detail: { changes } }));
                toast.info('AI updated the chart configuration');
            }
        },

        // ─── AI Integration: get info about the active tab ───
        getActiveTabInfo: () => {
            const tab = getActiveTab();
            if (!tab) return null;
            return {
                path: tab.path,
                name: tab.name,
                type: tab.type,
                content: tab.content,
                results: tab.results,
                resultsQuery: tab.resultsQuery,
                chartConfig: tab.chartConfig || tab.initialChartConfig || null,
                activeView: tab.viewMode || null,
                dirty: tab.dirty,
            };
        },

        handleEditChart: async (filePath) => {
            try {
                // Check if already open
                const existing = [...leftTabs, ...rightTabs].find(t => t.path === filePath && t.type === 'amoxvis');
                if (existing) {
                    if (leftTabs.find(t => t.id === existing.id)) setLeftActiveId(existing.id);
                    else setRightActiveId(existing.id);
                    return;
                }

                // Fetch the config
                const response = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
                const data = await response.json();
                if (data.error) throw new Error(data.error);

                const config = JSON.parse(data.content);

                const newTab = {
                    id: Date.now().toString(),
                    path: filePath,
                    name: filePath.split(/[/\\]/).pop(),
                    type: 'amoxvis',
                    content: data.content,
                    results: null,
                    dirty: false,
                    initialChartConfig: config
                };

                const pane = activePane;
                if (pane === 'left') {
                    setLeftTabs(prev => [...prev, newTab]);
                    setLeftActiveId(newTab.id);
                } else {
                    setRightTabs(prev => [...prev, newTab]);
                    setRightActiveId(newTab.id);
                }

            } catch (err) {
                setAlertData({ isOpen: true, message: `Failed to open chart configuration: ${err.message}`, title: 'Chart Error', type: 'error' });
            }
        },

        // Open .amoxvis in legacy SQL editor mode (Edit with SQL)
        handleEditChartWithSql: async (filePath) => {
            try {
                const response = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
                const data = await response.json();
                if (data.error) throw new Error(data.error);

                const config = JSON.parse(data.content);
                const query = config.query || 'SELECT * FROM ... LIMIT 100;';

                const newTab = {
                    id: Date.now().toString(),
                    path: filePath,
                    name: `Edit: ${filePath.split(/[/\\]/).pop()}`,
                    type: 'sql',
                    content: query,
                    results: null,
                    dirty: false,
                    initialChartConfig: config
                };

                const pane = activePane;
                if (pane === 'left') {
                    setLeftTabs(prev => [...prev, newTab]);
                    setLeftActiveId(newTab.id);
                } else {
                    setRightTabs(prev => [...prev, newTab]);
                    setRightActiveId(newTab.id);
                }

                // Trigger auto-execution
                executeQuery(newTab.id, query);

            } catch (err) {
                setAlertData({ isOpen: true, message: `Failed to open chart configuration: ${err.message}`, title: 'Chart Error', type: 'error' });
            }
        },

        // Switch an amoxvis tab to SQL editor mode
        handleOpenAmoxvisAsSql: (tab) => openAmoxvisAsSql(tab)
    }));

    // Standalone helper: open an amoxvis tab in SQL editor mode
    const openAmoxvisAsSql = useCallback((tab) => {
        const config = tab.chartConfig || tab.initialChartConfig || {};
        const query = config.query || 'SELECT * FROM ... LIMIT 100;';

        const newTab = {
            id: Date.now().toString(),
            path: tab.path,
            name: tab.name.startsWith('Edit: ') ? tab.name : `Edit: ${tab.name}`,
            type: 'sql',
            content: query,
            results: null,
            dirty: false,
            initialChartConfig: config
        };

        const pane = stateRef.current.activePane;
        if (pane === 'left') {
            setLeftTabs(prev => [...prev, newTab]);
            setLeftActiveId(newTab.id);
        } else {
            setRightTabs(prev => [...prev, newTab]);
            setRightActiveId(newTab.id);
        }

        executeQuery(newTab.id, query);
    }, [executeQuery]);

    // --- handleQueryFile: Standalone function for DnD + imperative handle ---
    const handleQueryFile = useCallback(async (filePath) => {
        if (!filePath || typeof filePath !== 'string') {
            console.warn('[handleQueryFile] Called with invalid path:', filePath);
            return;
        }
        const { leftTabs, rightTabs, activePane } = stateRef.current;
        const fileName = filePath.split(/[/\\]/).pop();
        const normalizedPath = filePath.replace(/\\/g, '/');
        const lowerName = fileName.toLowerCase();

        // SQL and Markdown files: open directly
        if (lowerName.endsWith('.sql') || lowerName.endsWith('.sqlnb') || lowerName.endsWith('.sqlchain') || lowerName.endsWith('.md')) {
            try {
                const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                if (!data.error) {
                    const type = lowerName.endsWith('.sqlnb') ? 'sqlnb' : lowerName.endsWith('.sqlchain') ? 'sqlchain' : lowerName.endsWith('.md') ? 'md' : 'sql';
                    const existing = [...leftTabs, ...rightTabs].find(t => t.path === filePath);
                    if (existing) {
                        if (leftTabs.find(t => t.id === existing.id)) setLeftActiveId(existing.id);
                        else setRightActiveId(existing.id);
                        return;
                    }
                    const newTab = { id: Date.now().toString(), path: filePath, name: fileName, type, content: data.content, results: null, dirty: false };
                    if (activePane === 'left') { setLeftTabs(prev => [...prev, newTab]); setLeftActiveId(newTab.id); }
                    else { setRightTabs(prev => [...prev, newTab]); setRightActiveId(newTab.id); }
                }
            } catch (e) { console.error('[DnD] Failed to open SQL file:', e); }
            return;
        }

        let content = '';

        // Cap the column list in the scaffold comment so wide files (50+ cols)
        // don't drown the query in metadata. Show the first 20, note the rest.
        const MAX_COLS_IN_COMMENT = 20;
        const formatColList = (cols) => {
            if (!cols || cols.length === 0) return 'Unable to read columns';
            const shown = cols.slice(0, MAX_COLS_IN_COMMENT).map(c => `${c.name} (${c.type})`).join(', ');
            const extra = cols.length - MAX_COLS_IN_COMMENT;
            return extra > 0 ? `${shown}, … (+${extra} columnas más, no mostradas)` : shown;
        };

        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
            try {
                const res = await fetch(`${API_BASE}/api/files/inspect-columns?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                const sheets = data.sheets || ['Sheet1'];
                const sheetsWithColumns = data.sheetsWithColumns || {};

                // Build column comments per sheet
                const sheetDetails = sheets.map(s => {
                    const cols = sheetsWithColumns[s] || [];
                    return `-- Sheet: "${s}"\n--   Columns: ${formatColList(cols)}`;
                }).join('\n');

                const sheetComments = sheets.map(s => `-- SELECT * FROM read_xlsx('${normalizedPath}', sheet='${s}') LIMIT 100;`).join('\n');
                content = `/* \n * Direct Query on ${fileName}\n * Available sheets: ${sheets.join(', ')}\n */\n\n${sheetDetails}\n\n${sheetComments}\n\nSELECT * FROM read_xlsx('${normalizedPath}', sheet='${sheets[0]}') LIMIT 100;`;
            } catch (err) {
                content = `/* \n * Direct Query on ${fileName}\n * Error fetching metadata: ${err.message}\n */\n\nSELECT * FROM read_xlsx('${normalizedPath}', sheet='Sheet1') LIMIT 100;`;
            }
        } else {
            // CSV, Parquet, JSON — fetch columns via inspect-columns API
            let columnComment = '';
            try {
                const res = await fetch(`${API_BASE}/api/files/inspect-columns?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                if (data.columns && data.columns.length > 0) {
                    columnComment = `\n * Columns: ${formatColList(data.columns)}`;
                }
            } catch {
                // Silently ignore column fetch errors
            }
            content = `/* \n * Direct Query on ${fileName}${columnComment} \n */\n\nSELECT * FROM '${normalizedPath}' LIMIT 100;`;
        }

        const newTab = { id: Date.now().toString(), path: '', name: `${fileName}.sql`, type: 'sql', content, results: null, dirty: true };
        if (activePane === 'left') { setLeftTabs(prev => [...prev, newTab]); setLeftActiveId(newTab.id); }
        else { setRightTabs(prev => [...prev, newTab]); setRightActiveId(newTab.id); }

        // Auto-execute preview for CSV/Parquet files
        if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
            const previewQuery = `SELECT * FROM '${normalizedPath}' LIMIT 100`;
            setTimeout(() => {
                executeQuery(newTab.id, previewQuery);
            }, 100);
        }
    }, [executeQuery]);

    // Drag & Drop handlers (state declared at the top so stateRef can see it)
    const handleDragStart = useCallback((e, tabId, paneId) => {
        setDraggedTab({ tabId, sourcePane: paneId });
        e.dataTransfer.effectAllowed = 'move';
        // Create a ghost image if needed, or default
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedTab(null);
        setDragOverZone(null);
    }, []);

    // Auto-merge split if right pane becomes empty
    useEffect(() => {
        if (splitEnabled && rightTabs.length === 0) {
            setSplitEnabled(false);
            setActivePane('left');
        }
    }, [rightTabs, splitEnabled]);

    const handleGlobalDragOver = (e) => {
        e.preventDefault();
        if (!draggedTab) return;

        const width = window.innerWidth;
        const x = e.clientX;
        const edgeThreshold = 100; // px

        // ... (rest of logic is fine)
        // Global Edge Detection (Priority)
        if (x > width - edgeThreshold) {
            setDragOverZone('right-edge');
            return;
        }
        if (x < edgeThreshold) {
            setDragOverZone('left-edge');
            return;
        }

        if (splitEnabled) {
            if (x < width / 2) setDragOverZone('left-pane');
            else setDragOverZone('right-pane');
        } else {
            setDragOverZone('center');
        }
    };

    const handleGlobalDrop = (e) => {
        e.preventDefault();
        // If the event was already handled (e.g., by TabBar reorder), draggedTab might be null if we cleared it?
        // Actually, we use stopPropagation in TabBar, so this shouldn't fire.

        if (!draggedTab || !dragOverZone) {
            handleDragEnd();
            return;
        }

        const { tabId, sourcePane } = draggedTab;
        const targetZone = dragOverZone;

        // ... logic ...
        // Logic based on Zone
        if (targetZone === 'right-edge') {
            moveTabToPane(tabId, sourcePane, 'right');
            setSplitEnabled(true);
            setActivePane('right');
            setRightActiveId(tabId);
        } else if (targetZone === 'left-edge') {
            moveTabToPane(tabId, sourcePane, 'left');
            setActivePane('left');
            setLeftActiveId(tabId);
        } else if (targetZone === 'right-pane' && sourcePane === 'left') {
            moveTabToPane(tabId, 'left', 'right');
            setActivePane('right');
            setRightActiveId(tabId);
        } else if (targetZone === 'left-pane' && sourcePane === 'right') {
            moveTabToPane(tabId, 'right', 'left');
            setActivePane('left');
            setLeftActiveId(tabId);
        }

        handleDragEnd();
    };

    const moveTabToPane = (tabId, fromPane, toPane) => {
        if (fromPane === toPane) return;

        let tabToMove = null;
        if (fromPane === 'left') {
            tabToMove = leftTabs.find(t => t.id === tabId);
            const newLeft = leftTabs.filter(t => t.id !== tabId);
            setLeftTabs(newLeft);
            // Fix active ID if needed
            if (leftActiveId === tabId) {
                setLeftActiveId(newLeft.length > 0 ? newLeft[newLeft.length - 1].id : null);
            }
        } else {
            tabToMove = rightTabs.find(t => t.id === tabId);
            const newRight = rightTabs.filter(t => t.id !== tabId);
            setRightTabs(newRight);
            if (rightActiveId === tabId) {
                setRightActiveId(newRight.length > 0 ? newRight[newRight.length - 1].id : null);
            }
        }

        if (tabToMove) {
            if (toPane === 'left') {
                setLeftTabs(prev => [...prev, tabToMove]);
                setLeftActiveId(tabId); // Auto-focus moved tab
            } else {
                setRightTabs(prev => [...prev, tabToMove]);
                setRightActiveId(tabId);
            }
        }
    };

    // Tab Reordering (Intra-pane)
    const handleReorder = useCallback((dragTabId, targetTabId, paneId) => {
        const sourceId = dragTabId || stateRef.current.draggedTab?.tabId;
        if (!sourceId || sourceId === targetTabId) return;

        const setTabs = paneId === 'left' ? setLeftTabs : setRightTabs;

        setTabs(prev => {
            const tabs = [...prev];
            const dragIdx = tabs.findIndex(t => t.id === sourceId);
            const targetIdx = tabs.findIndex(t => t.id === targetTabId);

            if (dragIdx === -1 || targetIdx === -1) return prev;

            const [removed] = tabs.splice(dragIdx, 1);
            tabs.splice(targetIdx, 0, removed);
            return tabs;
        });
    }, []);

    /* const toggleSplit = ... REMOVED (Toolbar removed) */

    // Stable per-pane callbacks (G4): keep EditorPane props referentially equal
    // across renders so memo(EditorPane) can bail out.
    const handleLeftTabClick = useCallback((id) => { setLeftActiveId(id); setActivePane('left'); }, []);
    const handleRightTabClick = useCallback((id) => { setRightActiveId(id); setActivePane('right'); }, []);
    const handlePaneRequestSaveAs = useCallback(() => {
        const { onRequestSaveAs } = stateRef.current;
        if (onRequestSaveAs) onRequestSaveAs('', getActiveTab());
    }, [getActiveTab]);

    return (
        <div
            className="lm-container"
            onDragOver={handleGlobalDragOver}
            onDrop={handleGlobalDrop}
            onDragEnd={handleDragEnd}
        >
            {/* Visual Overlays for Drop Zones */}
            {dragOverZone === 'left-edge' && (
                <div className="lm-drop-zone left" />
            )}
            {dragOverZone === 'right-edge' && (
                <div className="lm-drop-zone right" />
            )}

            <div className="lm-panes">
                <EditorPane
                    paneId="left"
                    isActive={activePane === 'left'}
                    tabs={leftTabs}
                    activeTabId={leftActiveId}
                    onTabClick={handleLeftTabClick}
                    onTabClose={handleTabClose}
                    onContentChange={handleContentChange}
                    onConversationChange={handleConversationChange}
                    onRunQuery={executeQuery}
                    onSave={handleSaveActive}
                    onAnalyze={handleAnalyzeActive}
                    onDbChange={onDbChange}
                    theme={theme}
                    editorLayout={editorLayout}
                    editorSettings={editorSettings}
                    variables={queryVariables}
                    onVariablesChange={setQueryVariables}
                    onDragStart={handleDragStart}
                    onReorder={handleReorder}
                    onFileDrop={handleQueryFile}
                    onCreateNew={createNew}
                    onRequestSaveAs={handlePaneRequestSaveAs}
                    showAiSidebar={showAiSidebar}
                    onToggleAi={onToggleAi}
                    onOpenFile={handleQueryFile}
                    availableTables={availableTables}
                    onExportNotebook={onExportNotebook}
                    onExportAmoxvis={onExportAmoxvis}
                    isRunning={!!runningQueryId}
                    onCancelQuery={cancelQuery}
                    onShowHistory={onShowHistorySidebar}
                    onOpenAmoxvisAsSql={openAmoxvisAsSql}
                    onPersistUiState={updateTab}
                />

                {splitEnabled && (
                    <EditorPane
                        paneId="right"
                        isActive={activePane === 'right'}
                        tabs={rightTabs}
                        activeTabId={rightActiveId}
                        onTabClick={handleRightTabClick}
                        onTabClose={handleTabClose}
                        onContentChange={handleContentChange}
                    onConversationChange={handleConversationChange}
                        onRunQuery={executeQuery}
                        onSave={handleSaveActive}
                        onAnalyze={handleAnalyzeActive}
                        onDbChange={onDbChange}
                        theme={theme}
                        editorLayout={editorLayout}
                        editorSettings={editorSettings}
                        variables={queryVariables}
                        onVariablesChange={setQueryVariables}
                        onDragStart={handleDragStart}
                        onReorder={handleReorder}
                        onFileDrop={handleQueryFile}
                        onCreateNew={createNew}
                        onRequestSaveAs={handlePaneRequestSaveAs}
                        showAiSidebar={showAiSidebar}
                        onToggleAi={onToggleAi}
                        onOpenFile={handleQueryFile}
                        availableTables={availableTables}
                        onExportNotebook={onExportNotebook}
                        onExportAmoxvis={onExportAmoxvis}
                        isRunning={!!runningQueryId}
                        onCancelQuery={cancelQuery}
                        onOpenAmoxvisAsSql={openAmoxvisAsSql}
                        onPersistUiState={updateTab}
                    />
                )}
            </div>

            <QueryPlanModal
                isOpen={showPlanModal}
                onClose={() => setShowPlanModal(false)}
                plan={planData}
                query={planQuery}
                mode={planMode}
                metrics={planMetrics}
                note={planNote}
                loading={planLoading}
                onSetMode={(m) => handleAnalyzeActive(m)}
            />

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))}
                title={alertData.title}
                message={alertData.message}
                type={alertData.type}
            />
        </div >
    );
});

export default memo(LayoutManager);
