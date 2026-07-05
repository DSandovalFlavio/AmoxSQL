import { API_BASE } from '../api.js';
import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect, memo } from 'react';
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

const TAB_STORAGE_KEY = 'amoxsql-layout-v1';

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

    // --- Tab Persistence: Save to sessionStorage ---
    useEffect(() => {
        const tabMeta = {
            leftTabs: leftTabs.map(t => ({ path: t.path, name: t.name, type: t.type })),
            rightTabs: rightTabs.map(t => ({ path: t.path, name: t.name, type: t.type })),
            leftActiveId,
            rightActiveId,
            splitEnabled
        };
        try {
            localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabMeta));
        } catch { /* ignore */ }

        // Notify parent of tab changes for rendering in WindowTitleBar
        if (onTabsChange) {
            onTabsChange({
                // Active pane data (backward compat)
                tabs: activePane === 'left' ? leftTabs : rightTabs,
                activeTabId: activePane === 'left' ? leftActiveId : rightActiveId,
                paneId: activePane,
                // Split-view data
                splitEnabled,
                left: { tabs: leftTabs, activeTabId: leftActiveId },
                right: { tabs: rightTabs, activeTabId: rightActiveId },
            });
        }
    }, [leftTabs, rightTabs, leftActiveId, rightActiveId, splitEnabled, activePane]);

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
        restoreTabs();
    }, []); // Only on mount

    // Helpers
    const getActiveTab = () => {
        if (activePane === 'left') {
            return leftTabs.find(t => t.id === leftActiveId);
        } else {
            return rightTabs.find(t => t.id === rightActiveId);
        }
    };

    const updateTab = (pane, tabId, updates) => {
        if (pane === 'left') {
            setLeftTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
        } else {
            setRightTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
        }
    };

    // Actions
    const handleContentChange = (tabId, newContent) => {
        // Need to find which pane has this tab
        const tab = leftTabs.find(t => t.id === tabId) || rightTabs.find(t => t.id === tabId);
        if (leftTabs.find(t => t.id === tabId)) {
            updateTab('left', tabId, { content: newContent, dirty: true });
        } else {
            updateTab('right', tabId, { content: newContent, dirty: true });
        }
        // Auto-save draft to localStorage for crash recovery
        if (tab?.path) {
            saveDraft(tab.path, newContent);
        }
    };

    // A Deep Dive tab remembers its conversation in `content` (used as
    // startConversationId). Update it WITHOUT marking the tab dirty.
    const handleConversationChange = (tabId, convId) => {
        if (!convId) return;
        if (leftTabs.find(t => t.id === tabId)) updateTab('left', tabId, { content: convId });
        else if (rightTabs.find(t => t.id === tabId)) updateTab('right', tabId, { content: convId });
    };

    const handleTabClose = (tabId) => {
        if (leftTabs.find(t => t.id === tabId)) {
            const index = leftTabs.findIndex(t => t.id === tabId);
            const newTabs = leftTabs.filter(t => t.id !== tabId);
            setLeftTabs(newTabs);
            if (leftActiveId === tabId) {
                if (newTabs.length > 0) {
                    const newIdx = Math.max(0, index - 1);
                    setLeftActiveId(newTabs[newIdx].id);
                } else {
                    setLeftActiveId(null);
                }
            }
        } else {
            const index = rightTabs.findIndex(t => t.id === tabId);
            const newTabs = rightTabs.filter(t => t.id !== tabId);
            setRightTabs(newTabs);
            if (rightActiveId === tabId) {
                if (newTabs.length > 0) {
                    const newIdx = Math.max(0, index - 1);
                    setRightActiveId(newTabs[newIdx].id);
                } else {
                    setRightActiveId(null);
                }
            }
        }
    };

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

    const cancelQuery = async () => {
        if (!runningQueryId) return;
        // Abort the in-flight fetch immediately so the UI unblocks
        queryAbortControllerRef.current?.abort();
        // Also tell the server to interrupt the DuckDB query
        try {
            await fetch(`${API_BASE}/api/query/cancel/${runningQueryId}`, { method: 'POST' });
        } catch {}
        setRunningQueryId(null);
    };

    const executeQuery = async (tabId, query) => {
        const pane = leftTabs.find(t => t.id === tabId) ? 'left' : 'right';
        // Resolve variables before execution
        const resolvedQuery = resolveVariables(query, queryVariables);

        const stripped = resolvedQuery.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
        
        if (statements.length > 1) {
            const createNotebook = await dialog.confirmAsync({
                title: 'Múltiples consultas detectadas',
                message: 'AmoxSQL ejecuta una sola consulta por archivo o bloque. Se detectaron múltiples consultas en este script separadas por ";".\n\nDado que el resultado se tabula, visualizar y procesar múltiples consultas simultáneamente no está soportado en este modo y puede generar errores.\n\nTe recomendamos convertir este script en un "SQL Notebook", donde cada consulta se ejecutará en su propia celda de forma aislada.',
                confirmLabel: 'Convertir a SQL Notebook',
                cancelLabel: 'Cancelar',
            });
            
            if (createNotebook) {
                const notebookContent = statements.map((s) => `-- !CELL:CODE!\n${s};`).join('\n\n');
                createNew('notebook', notebookContent);
            }
            return { cancelled: true };
        }

        const qid = crypto.randomUUID();
        const controller = new AbortController();
        queryAbortControllerRef.current = controller;
        setRunningQueryId(qid);
        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: resolvedQuery, queryId: qid, limit: editorSettings?.queryResultLimit ?? 10000 }),
                signal: controller.signal,
            });
            const data = await response.json();

            if (response.ok) {
                updateTab(pane, tabId, { results: data, resultsQuery: resolvedQuery, resultsError: null, errorMarker: null });

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

                return { data: data.data, executionTime: data.executionTime };
            } else {
                const marker = parseDuckDBError(data.error);
                updateTab(pane, tabId, { results: null, resultsError: data.error, errorMarker: marker });
                return { error: data.error };
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // User cancelled — clear state silently, no error shown
                updateTab(pane, tabId, { results: null, resultsError: null, errorMarker: null });
                return { cancelled: true };
            }
            const marker = parseDuckDBError(err.message);
            updateTab(pane, tabId, { results: null, resultsError: err.message, errorMarker: marker });
            return { error: err.message };
        } finally {
            setRunningQueryId(null);
            queryAbortControllerRef.current = null;
        }
    };

    const handleRunActive = async () => {
        const tab = getActiveTab();
        if (!tab) return;
        if (tab.type === 'sql') {
            await executeQuery(tab.id, tab.content);
        }
    };

    const handleSaveActive = async (isSilent = false) => {
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
    };

    const handleAnalyzeActive = async (mode) => {
        const tab = getActiveTab();
        if (!tab || tab.type !== 'sql') {
            console.warn("Please select a SQL file to analyze.");
            return;
        }

        const query = tab.content;
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
    };

    // Extracted createNew so it can be passed to EditorPanes + exposed via ref
    const createNew = (type, initialContent) => {
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
        if (activePane === 'left') {
            setLeftTabs(prev => [...prev, newTab]);
            setLeftActiveId(newTab.id);
        } else {
            setRightTabs(prev => [...prev, newTab]);
            setRightActiveId(newTab.id);
        }
    };

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
    const openAmoxvisAsSql = (tab) => {
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

        const pane = activePane;
        if (pane === 'left') {
            setLeftTabs(prev => [...prev, newTab]);
            setLeftActiveId(newTab.id);
        } else {
            setRightTabs(prev => [...prev, newTab]);
            setRightActiveId(newTab.id);
        }

        executeQuery(newTab.id, query);
    };

    // --- handleQueryFile: Standalone function for DnD + imperative handle ---
    const handleQueryFile = async (filePath) => {
        if (!filePath || typeof filePath !== 'string') {
            console.warn('[handleQueryFile] Called with invalid path:', filePath);
            return;
        }
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

        if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
            try {
                const res = await fetch(`${API_BASE}/api/files/inspect-columns?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                const sheets = data.sheets || ['Sheet1'];
                const sheetsWithColumns = data.sheetsWithColumns || {};

                // Build column comments per sheet
                const sheetDetails = sheets.map(s => {
                    const cols = sheetsWithColumns[s] || [];
                    const colList = cols.length > 0
                        ? cols.map(c => `${c.name} (${c.type})`).join(', ')
                        : 'Unable to read columns';
                    return `-- Sheet: "${s}"\n--   Columns: ${colList}`;
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
                    const colList = data.columns.map(c => `${c.name} (${c.type})`).join(', ');
                    columnComment = `\n * Columns: ${colList}`;
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
    };

    // Drag & Drop State
    const [draggedTab, setDraggedTab] = useState(null); // { tabId, sourcePane }
    const [dragOverZone, setDragOverZone] = useState(null); // 'left-edge', 'right-edge', 'left-pane', 'right-pane'

    const handleDragStart = (e, tabId, paneId) => {
        setDraggedTab({ tabId, sourcePane: paneId });
        e.dataTransfer.effectAllowed = 'move';
        // Create a ghost image if needed, or default
    };

    const handleDragEnd = () => {
        setDraggedTab(null);
        setDragOverZone(null);
    };

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
    const handleReorder = (dragTabId, targetTabId, paneId) => {
        const sourceId = dragTabId || draggedTab?.tabId;
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
    };

    /* const toggleSplit = ... REMOVED (Toolbar removed) */

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
                    onTabClick={(id) => { setLeftActiveId(id); setActivePane('left'); }}
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
                    onRequestSaveAs={() => onRequestSaveAs && onRequestSaveAs('', getActiveTab())}
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
                />

                {splitEnabled && (
                    <EditorPane
                        paneId="right"
                        isActive={activePane === 'right'}
                        tabs={rightTabs}
                        activeTabId={rightActiveId}
                        onTabClick={(id) => { setRightActiveId(id); setActivePane('right'); }}
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
                        onRequestSaveAs={() => onRequestSaveAs && onRequestSaveAs('', getActiveTab())}
                        showAiSidebar={showAiSidebar}
                        onToggleAi={onToggleAi}
                        onOpenFile={handleQueryFile}
                        availableTables={availableTables}
                        onExportNotebook={onExportNotebook}
                        onExportAmoxvis={onExportAmoxvis}
                        isRunning={!!runningQueryId}
                        onCancelQuery={cancelQuery}
                        onOpenAmoxvisAsSql={openAmoxvisAsSql}
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
