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
// Split geometry — kept in its OWN key so a schema change here never risks
// the tab-restoration logic in TAB_STORAGE_KEY (that one recovers unsaved
// work; this one is just window-dressing, safe to drop and re-default).
const SPLIT_STORAGE_KEY = 'amoxsql-split-v1';
// Per-file choice for multi-statement .sql files: 'script' | 'notebook'.
// Keyed by file path so "don't ask again for this file" survives reloads.
const SQL_FILE_PREFS_KEY = 'amoxsql-sql-file-prefs';

const readSplitStorage = () => {
    try {
        return JSON.parse(localStorage.getItem(SPLIT_STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
};

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

    // --- Split geometry (Fase 3/4) ---
    // splitRatio: the LEFT pane's share of the horizontal space, 0.2-0.8.
    // resultsRatios: each pane's own results-panel share (height when the
    // editor is horizontal, width when vertical) — used only while UNlinked.
    // linkedResultsRatio: the single shared value both panes use while linked.
    // resultsLinked defaults to true: dragging one pane's results divider
    // moves both, which is what you want the moment you're comparing two
    // queries side by side — that's the whole point of opening a split.
    //
    // Restored via LAZY initializers (read localStorage synchronously on the
    // very first render), not a post-mount effect — an effect-based restore
    // raced against the persist effect: the "restored" flag flipped in the
    // same tick as the setState calls, before React applied them, so the
    // persist effect's THIS-render closure (still holding the OLD defaults)
    // saw the flag already true and immediately overwrote the just-read
    // saved values with those defaults. Lazy initializers have no such
    // window — state is already correct on render 1.
    const [splitRatio, setSplitRatio] = useState(() => {
        const v = readSplitStorage().splitRatio;
        return typeof v === 'number' ? v : 0.5;
    });
    const [resultsLinked, setResultsLinked] = useState(() => {
        const v = readSplitStorage().resultsLinked;
        return typeof v === 'boolean' ? v : true;
    });
    const [resultsRatios, setResultsRatios] = useState(() => {
        const v = readSplitStorage().resultsRatios;
        return { left: 0.35, right: 0.35, ...(v && typeof v === 'object' ? v : {}) };
    });
    const [linkedResultsRatio, setLinkedResultsRatio] = useState(() => {
        const v = readSplitStorage().linkedResultsRatio;
        return typeof v === 'number' ? v : 0.35;
    });

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
    const lmContainerRef = useRef(null);

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
        resultsLinked, resultsRatios, linkedResultsRatio,
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
            // Split geometry — so the tab bar row (rendered in App.jsx, outside
            // this component) can mirror the same width split as the editor
            // panes below it, and so the results-link toggle (also rendered in
            // App.jsx, between the two tab bars) can reflect current state.
            splitRatio,
            resultsLinked,
        };
        const serialized = JSON.stringify(payload);
        if (serialized === lastNotifiedMetaRef.current) return;
        lastNotifiedMetaRef.current = serialized;
        onTabsChange(payload);
    }, [leftTabs, rightTabs, leftActiveId, rightActiveId, splitEnabled, activePane, splitRatio, resultsLinked, onTabsChange]);

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

    // --- Split Geometry Persistence: save on change (restore is the lazy
    // initializers above — nothing to do here on mount). ---
    useEffect(() => {
        try {
            localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify({
                splitRatio, resultsLinked, resultsRatios, linkedResultsRatio,
            }));
        } catch { /* ignore */ }
    }, [splitRatio, resultsLinked, resultsRatios, linkedResultsRatio]);

    // Helpers — stable identities (read current state via stateRef)
    const getActiveTab = useCallback(() => {
        const { activePane, leftTabs, rightTabs, leftActiveId, rightActiveId } = stateRef.current;
        if (activePane === 'left') {
            return leftTabs.find(t => t.id === leftActiveId);
        } else {
            return rightTabs.find(t => t.id === rightActiveId);
        }
    }, []);

    // Which pane actually owns a tab, by id — the source of truth for actions
    // that must land on the pane the tab lives in, NOT whichever pane happens
    // to be active right now (that distinction is the root cause behind most
    // of the "my tab went to the wrong side" reports).
    const findTabPane = useCallback((tabId) => {
        const { leftTabs, rightTabs } = stateRef.current;
        if (leftTabs.some(t => t.id === tabId)) return 'left';
        if (rightTabs.some(t => t.id === tabId)) return 'right';
        return null;
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

    // Bulk close (used by the tab context menu's "Close Others / To the Right /
    // All") — confirms once, listing every unsaved file, before discarding any
    // of them. A single-tab close (handleTabClose above, and the "x" button)
    // stays silent, matching its existing behavior.
    const closeTabsWithConfirm = useCallback(async (pane, tabsToClose) => {
        if (!tabsToClose || tabsToClose.length === 0) return;
        const dirtyOnes = tabsToClose.filter(t => t.dirty);
        if (dirtyOnes.length > 0) {
            const { dialog } = stateRef.current;
            const ok = await dialog.confirmAsync({
                title: dirtyOnes.length === 1 ? 'Cerrar sin guardar' : `Cerrar ${dirtyOnes.length} archivos sin guardar`,
                message: `Se perderán los cambios de: ${dirtyOnes.map(t => t.name).join(', ')}`,
                confirmLabel: 'Cerrar de todos modos',
                destructive: true,
            });
            if (!ok) return;
        }
        const idsToClose = new Set(tabsToClose.map(t => t.id));
        const setTabs = pane === 'left' ? setLeftTabs : setRightTabs;
        const setActiveId = pane === 'left' ? setLeftActiveId : setRightActiveId;
        const currentActiveId = pane === 'left' ? stateRef.current.leftActiveId : stateRef.current.rightActiveId;
        setTabs(prev => {
            const remaining = prev.filter(t => !idsToClose.has(t.id));
            if (idsToClose.has(currentActiveId)) {
                setActiveId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
            }
            return remaining;
        });
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

    // Shared by the global Save trigger (always the active tab) AND the tab
    // context menu's "Guardar" (an EXPLICIT tab, which may not be active).
    // Resolves the pane via findTabPane, not `activePane` — an inactive tab
    // being saved from the context menu can live in either pane.
    const saveTabInternal = useCallback(async (tab, isSilent = false) => {
        const { onRequestSaveAs, toast } = stateRef.current;
        if (!tab || !tab.dirty) return;

        if (!tab.path) {
            if (onRequestSaveAs) {
                onRequestSaveAs(tab.content, tab);
            } else {
                console.warn("Save As function not connected.");
            }
            return;
        }

        const pane = findTabPane(tab.id);
        if (!pane) return;

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
                updateTab(pane, tab.id, { dirty: false });
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
    }, [findTabPane, updateTab]);

    const handleSaveActive = useCallback((isSilent = false) => saveTabInternal(getActiveTab(), isSilent), [getActiveTab, saveTabInternal]);

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

    // Extracted createNew so it can be passed to EditorPanes + exposed via ref.
    // `targetPane` is explicit ('left'|'right') when the caller knows exactly
    // which pane triggered the action (e.g. that pane's own "+" button or its
    // empty-state card) — it must win over `activePane`, which only serves as
    // the fallback for actions with no specific origin (keyboard shortcuts,
    // the command palette, sidebar actions).
    const createNew = useCallback((type, initialContent, targetPane) => {
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
        const pane = targetPane || stateRef.current.activePane;
        if (pane === 'left') {
            setLeftTabs(prev => [...prev, newTab]);
            setLeftActiveId(newTab.id);
        } else {
            setRightTabs(prev => [...prev, newTab]);
            setRightActiveId(newTab.id);
        }
        setActivePane(pane);
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
                // Bound to THIS pane — the "+" button in the left tab bar must
                // always create in the left pane, regardless of which pane is
                // currently active. See createNew's targetPane param.
                onCreateNew: (type, initialContent) => createNew(type, initialContent, targetPane),
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
        // Focus a pane without touching its tabs — used when the user clicks
        // the chrome around a tab bar (not a specific tab) so that pane's
        // actions ("+", empty-state cards) target it correctly.
        focusPane: (pane) => setActivePane(pane),
        // Results-link toggle — rendered in App.jsx (between the two tab bars,
        // not on the pane splitter, see Fase 4 revision) but the state and the
        // logic that decides what happens on toggle live here with the rest of
        // the split geometry.
        toggleResultsLinked: () => toggleResultsLinked(),
        // `tabId` should be the id captured when "Save As…" was first requested
        // (see App.jsx's pendingSaveTab). The save-as modal is async — the user
        // can switch the active pane while it's open — so re-deriving "the
        // active tab" at completion time can silently rewrite the WRONG tab's
        // path. Falls back to the current active tab only for older/other
        // callers that don't pass an id.
        finishSaveAs: (newPath, tabId) => {
            const { leftTabs, rightTabs } = stateRef.current;
            const tab = tabId
                ? (leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId))
                : getActiveTab();
            if (!tab) return;
            const pane = findTabPane(tab.id) || stateRef.current.activePane;
            const updates = {
                path: newPath,
                name: newPath.split(/[/\\]/).pop(),
                dirty: false
            };
            updateTab(pane, tab.id, updates);
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
        handleOpenAmoxvisAsSql: (tab) => openAmoxvisAsSql(tab),

        // ─── Tab context menu operations (Fase 2) ───
        // All of these take an EXPLICIT tabId — never `activePane`/"the active
        // tab" — since the context menu can be opened on any tab, active or not.
        saveTab: (tabId) => {
            const tab = leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId);
            if (tab) saveTabInternal(tab);
        },
        requestSaveAsForTab: (tabId) => {
            const tab = leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId);
            if (tab && onRequestSaveAs) onRequestSaveAs(tab.content, tab);
        },
        renameTab: async (tabId, newName) => {
            const tab = leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId);
            if (!tab) return { success: false, error: 'Tab not found' };
            if (!tab.path) return { success: false, error: 'unsaved' };
            const dir = tab.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
            const newPath = dir ? `${dir}/${newName}` : newName;
            if (newPath === tab.path) return { success: true };
            try {
                const response = await fetch(`${API_BASE}/api/file/rename`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldPath: tab.path, newPath }),
                });
                const data = await response.json();
                if (!response.ok) return { success: false, error: data.error || 'Rename failed' };
                updateTab(findTabPane(tabId), tabId, { path: newPath, name: newName });
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
        },
        moveTabToOtherPane: (tabId) => {
            const pane = findTabPane(tabId);
            if (!pane) return;
            const target = pane === 'left' ? 'right' : 'left';
            setSplitEnabled(true);
            moveTabToPane(tabId, pane, target);
            setActivePane(target);
        },
        // Clones the tab into the OTHER pane as a fresh, unsaved copy — same
        // content, but its own path/dirty state, so editing one to try a SQL
        // variant never silently overwrites the file the other copy still
        // shows. This is the "compare a variant side by side" gesture.
        duplicateTabToOtherPane: (tabId) => {
            const pane = findTabPane(tabId);
            if (!pane) return;
            const tab = (pane === 'left' ? leftTabs : rightTabs).find(t => t.id === tabId);
            if (!tab) return;
            const target = pane === 'left' ? 'right' : 'left';
            const clone = {
                ...tab,
                id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
                path: '',
                dirty: true,
                results: null, resultsQuery: null, resultsError: null, scriptRun: null, errorMarker: null,
            };
            setSplitEnabled(true);
            if (target === 'left') { setLeftTabs(prev => [...prev, clone]); setLeftActiveId(clone.id); }
            else { setRightTabs(prev => [...prev, clone]); setRightActiveId(clone.id); }
            setActivePane(target);
        },
        closeOtherTabs: (tabId) => {
            const pane = findTabPane(tabId);
            if (!pane) return;
            const tabs = pane === 'left' ? leftTabs : rightTabs;
            closeTabsWithConfirm(pane, tabs.filter(t => t.id !== tabId));
        },
        closeTabsToRight: (tabId) => {
            const pane = findTabPane(tabId);
            if (!pane) return;
            const tabs = pane === 'left' ? leftTabs : rightTabs;
            const idx = tabs.findIndex(t => t.id === tabId);
            if (idx === -1) return;
            closeTabsWithConfirm(pane, tabs.slice(idx + 1));
        },
        closeAllTabsInPane: (paneId) => {
            const tabs = paneId === 'left' ? leftTabs : rightTabs;
            closeTabsWithConfirm(paneId, tabs);
        },
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

        // The "Edit with SQL" button lives inside the amoxvis tab itself — the
        // new SQL tab must land in the SAME pane, not whichever pane happens
        // to be active (they can differ once split panes are independently
        // clickable, see the empty-pane focus fix below).
        const pane = findTabPane(tab.id) || stateRef.current.activePane;
        if (pane === 'left') {
            setLeftTabs(prev => [...prev, newTab]);
            setLeftActiveId(newTab.id);
        } else {
            setRightTabs(prev => [...prev, newTab]);
            setRightActiveId(newTab.id);
        }

        executeQuery(newTab.id, query);
    }, [executeQuery, findTabPane]);

    // --- handleQueryFile: Standalone function for DnD + imperative handle ---
    // `targetPane` lets a caller that knows exactly where the drop happened
    // (an OS file dropped onto ONE specific EditorPane) override the default
    // of "whichever pane is currently active".
    const handleQueryFile = useCallback(async (filePath, targetPane) => {
        if (!filePath || typeof filePath !== 'string') {
            console.warn('[handleQueryFile] Called with invalid path:', filePath);
            return;
        }
        const { leftTabs, rightTabs, activePane: currentActivePane } = stateRef.current;
        const activePane = targetPane || currentActivePane;
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
                        if (leftTabs.find(t => t.id === existing.id)) { setLeftActiveId(existing.id); setActivePane('left'); }
                        else { setRightActiveId(existing.id); setActivePane('right'); }
                        return;
                    }
                    const newTab = { id: Date.now().toString(), path: filePath, name: fileName, type, content: data.content, results: null, dirty: false };
                    if (activePane === 'left') { setLeftTabs(prev => [...prev, newTab]); setLeftActiveId(newTab.id); }
                    else { setRightTabs(prev => [...prev, newTab]); setRightActiveId(newTab.id); }
                    setActivePane(activePane);
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
        setActivePane(activePane);

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

        // Measured against THIS container, not window.innerWidth — the file
        // explorer (left) and AI sidebar (right, when open) eat into the
        // window width, so a window-relative edge threshold could fall
        // entirely inside those sidebars and never be reachable by the mouse.
        const rect = lmContainerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const width = rect.width;
        const x = e.clientX - rect.left;
        const edgeThreshold = Math.min(100, width * 0.15);

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

    // Tab Reordering — AND cross-pane move when the drop lands on the OTHER
    // pane's tab bar. Previously this only ever searched for the dragged tab
    // inside `paneId`'s own array, so dropping tab A (from the left pane)
    // onto the right pane's tab bar silently did nothing — the tab bar isn't
    // even inside `.lm-panes`'s DOM subtree, so the left/right-edge drop
    // zones never fire for it either. This was the most commonly attempted
    // gesture ("drag a tab onto the other side's bar") and the one most
    // likely to feel broken.
    const handleReorder = useCallback((dragTabId, targetTabId, paneId) => {
        const { draggedTab, leftTabs, rightTabs, leftActiveId, rightActiveId } = stateRef.current;
        const sourceId = dragTabId || draggedTab?.tabId;
        if (!sourceId) return;
        const sourcePane = draggedTab?.sourcePane
            || (leftTabs.some(t => t.id === sourceId) ? 'left' : (rightTabs.some(t => t.id === sourceId) ? 'right' : null));
        if (!sourcePane) return;

        if (sourcePane !== paneId) {
            const sourceTabs = sourcePane === 'left' ? leftTabs : rightTabs;
            const tabToMove = sourceTabs.find(t => t.id === sourceId);
            if (!tabToMove) return;

            const setSourceTabs = sourcePane === 'left' ? setLeftTabs : setRightTabs;
            const sourceActiveId = sourcePane === 'left' ? leftActiveId : rightActiveId;
            const setSourceActiveId = sourcePane === 'left' ? setLeftActiveId : setRightActiveId;
            const setTargetTabs = paneId === 'left' ? setLeftTabs : setRightTabs;
            const setTargetActiveId = paneId === 'left' ? setLeftActiveId : setRightActiveId;

            const newSource = sourceTabs.filter(t => t.id !== sourceId);
            setSourceTabs(newSource);
            if (sourceActiveId === sourceId) {
                setSourceActiveId(newSource.length > 0 ? newSource[newSource.length - 1].id : null);
            }

            // Insert at the target tab's position, or at the end when dropped
            // on empty bar space (targetTabId null, or a stale id — e.g. the
            // bar had zero tabs).
            setTargetTabs(prev => {
                const targetIdx = targetTabId ? prev.findIndex(t => t.id === targetTabId) : -1;
                const insertAt = targetIdx === -1 ? prev.length : targetIdx;
                const next = [...prev];
                next.splice(insertAt, 0, tabToMove);
                return next;
            });
            setTargetActiveId(sourceId);
            setActivePane(paneId);
            return;
        }

        // Same-pane reorder. A null targetTabId (dropped on empty bar space,
        // past the last tab) means "move to the end".
        if (sourceId === targetTabId) return;
        const setTabs = paneId === 'left' ? setLeftTabs : setRightTabs;
        setTabs(prev => {
            const tabs = [...prev];
            const dragIdx = tabs.findIndex(t => t.id === sourceId);
            if (dragIdx === -1) return prev;
            const targetIdx = targetTabId ? tabs.findIndex(t => t.id === targetTabId) : tabs.length - 1;
            if (targetIdx === -1) return prev;
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

    // A click anywhere in an EMPTY pane must still be able to focus it — with
    // no tab active, `EditorPane`'s onClickCapture (which fires onTabClick)
    // had nothing to call, so an empty pane could never become the active one
    // and every action from it (its own "+" cards included) silently landed
    // in the OTHER pane instead.
    const handleLeftPaneFocus = useCallback(() => setActivePane('left'), []);
    const handleRightPaneFocus = useCallback(() => setActivePane('right'), []);

    // Bound to a specific pane so each pane's "+" / empty-state actions always
    // create there, never wherever `activePane` happens to be.
    const handleLeftCreateNew = useCallback((type, initialContent) => createNew(type, initialContent, 'left'), [createNew]);
    const handleRightCreateNew = useCallback((type, initialContent) => createNew(type, initialContent, 'right'), [createNew]);

    // Same reasoning for an OS file dropped onto one specific pane's drop zone.
    const handleLeftFileDrop = useCallback((path) => handleQueryFile(path, 'left'), [handleQueryFile]);
    const handleRightFileDrop = useCallback((path) => handleQueryFile(path, 'right'), [handleQueryFile]);

    // --- Results ratio (Fase 3/4) ---
    // Called by EditorPane on drag-release with the new ratio (0-1). While
    // linked, BOTH panes write to the same shared value; while unlinked, each
    // pane keeps its own entry in `resultsRatios`.
    const handleResultsRatioChange = useCallback((paneId, ratio) => {
        if (stateRef.current.resultsLinked) {
            setLinkedResultsRatio(ratio);
        } else {
            setResultsRatios(prev => ({ ...prev, [paneId]: ratio }));
        }
    }, []);
    const handleLeftResultsRatioChange = useCallback((ratio) => handleResultsRatioChange('left', ratio), [handleResultsRatioChange]);
    const handleRightResultsRatioChange = useCallback((ratio) => handleResultsRatioChange('right', ratio), [handleResultsRatioChange]);

    const toggleResultsLinked = useCallback(() => {
        setResultsLinked(prev => {
            const next = !prev;
            if (next) {
                // Turning ON: adopt the ACTIVE pane's current ratio as the shared
                // value, so the OTHER pane visibly animates to match it instead of
                // jumping to some unrelated number.
                const { activePane, resultsRatios } = stateRef.current;
                setLinkedResultsRatio(resultsRatios[activePane] ?? 0.35);
            } else {
                // Turning OFF: both panes keep exactly the size they had while
                // linked — nothing should visibly move at the moment of unlinking.
                const shared = stateRef.current.linkedResultsRatio;
                setResultsRatios({ left: shared, right: shared });
            }
            return next;
        });
    }, []);

    // --- Vertical splitter between the two panes ---
    const isResizingSplitRef = useRef(false);
    const splitGhostRef = useRef(null);

    const startSplitResize = useCallback((e) => {
        e.preventDefault();
        isResizingSplitRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const rect = lmContainerRef.current?.getBoundingClientRect();
        if (splitGhostRef.current && rect) {
            splitGhostRef.current.style.display = 'block';
            splitGhostRef.current.style.left = `${e.clientX - rect.left}px`;
        }
    }, []);

    useEffect(() => {
        const onMove = (e) => {
            if (!isResizingSplitRef.current) return;
            const rect = lmContainerRef.current?.getBoundingClientRect();
            if (splitGhostRef.current && rect) {
                splitGhostRef.current.style.left = `${e.clientX - rect.left}px`;
            }
        };
        const onUp = (e) => {
            if (!isResizingSplitRef.current) return;
            isResizingSplitRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (splitGhostRef.current) splitGhostRef.current.style.display = 'none';
            const rect = lmContainerRef.current?.getBoundingClientRect();
            if (!rect || rect.width === 0) return;
            const ratio = (e.clientX - rect.left) / rect.width;
            setSplitRatio(Math.min(0.8, Math.max(0.2, ratio)));
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    return (
        <div
            ref={lmContainerRef}
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
                <div
                    className="lm-pane-slot"
                    style={splitEnabled ? { flex: `0 0 ${splitRatio * 100}%` } : { flex: 1 }}
                >
                    <EditorPane
                        paneId="left"
                        isActive={activePane === 'left'}
                        tabs={leftTabs}
                        activeTabId={leftActiveId}
                        onTabClick={handleLeftTabClick}
                        onPaneFocus={handleLeftPaneFocus}
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
                        onFileDrop={handleLeftFileDrop}
                        onCreateNew={handleLeftCreateNew}
                        onRequestSaveAs={handlePaneRequestSaveAs}
                        showAiSidebar={showAiSidebar}
                        onToggleAi={onToggleAi}
                        onOpenFile={handleLeftFileDrop}
                        availableTables={availableTables}
                        onExportNotebook={onExportNotebook}
                        onExportAmoxvis={onExportAmoxvis}
                        isRunning={!!runningQueryId}
                        onCancelQuery={cancelQuery}
                        onShowHistory={onShowHistorySidebar}
                        onOpenAmoxvisAsSql={openAmoxvisAsSql}
                        onPersistUiState={updateTab}
                        resultsRatio={resultsLinked ? linkedResultsRatio : resultsRatios.left}
                        onResultsRatioChange={handleLeftResultsRatioChange}
                    />
                </div>

                {splitEnabled && (
                    <>
                        {/* Vertical divider between the two panes. The results-link
                            toggle used to live here but made the gap between panes
                            read as too wide — it now lives in App.jsx, between the
                            two tab bars, where it doesn't affect this divider's
                            width at all. */}
                        <div
                            className="lm-splitter"
                            onMouseDown={startSplitResize}
                            onDoubleClick={() => setSplitRatio(0.5)}
                            title="Arrastra para redimensionar · doble clic para 50/50"
                        />
                        <div ref={splitGhostRef} className="lm-splitter-ghost" />

                        <div className="lm-pane-slot" style={{ flex: `0 0 ${(1 - splitRatio) * 100}%` }}>
                            <EditorPane
                                paneId="right"
                                isActive={activePane === 'right'}
                                tabs={rightTabs}
                                activeTabId={rightActiveId}
                                onTabClick={handleRightTabClick}
                                onPaneFocus={handleRightPaneFocus}
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
                                onFileDrop={handleRightFileDrop}
                                onCreateNew={handleRightCreateNew}
                                onRequestSaveAs={handlePaneRequestSaveAs}
                                showAiSidebar={showAiSidebar}
                                onToggleAi={onToggleAi}
                                onOpenFile={handleRightFileDrop}
                                availableTables={availableTables}
                                onExportNotebook={onExportNotebook}
                                onExportAmoxvis={onExportAmoxvis}
                                isRunning={!!runningQueryId}
                                onCancelQuery={cancelQuery}
                                onOpenAmoxvisAsSql={openAmoxvisAsSql}
                                onPersistUiState={updateTab}
                                resultsRatio={resultsLinked ? linkedResultsRatio : resultsRatios.right}
                                onResultsRatioChange={handleRightResultsRatioChange}
                            />
                        </div>
                    </>
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
