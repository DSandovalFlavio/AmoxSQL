import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { LuColumns2, LuMaximize2 } from "react-icons/lu";
import EditorPane from './EditorPane';
import QueryPlanModal from './QueryPlanModal';
import { useToast } from './ToastProvider';
import { resolveVariables } from './VariablesBar';
import AlertDialog from './AlertDialog';

const TAB_STORAGE_KEY = 'amoxsql-open-tabs';

const LayoutManager = forwardRef(({ projectPath, theme, editorLayout, editorSettings, onDbChange, onRequestSaveAs, onQueryResult, showAiSidebar, onToggleAi, onTabsChange }, ref) => {
    const toast = useToast();
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

    // Variables State (shared across session)
    const [queryVariables, setQueryVariables] = useState([]);

    // Alert Modal State
    const [alertData, setAlertData] = useState({ isOpen: false, message: '', title: 'Error', type: 'error' });

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
            sessionStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabMeta));
        } catch { /* ignore */ }

        // Notify parent of tab changes for rendering in WindowTitleBar
        if (onTabsChange) {
            const tabs = activePane === 'left' ? leftTabs : rightTabs;
            const activeTabId = activePane === 'left' ? leftActiveId : rightActiveId;
            onTabsChange({ tabs, activeTabId, paneId: activePane });
        }
    }, [leftTabs, rightTabs, leftActiveId, rightActiveId, splitEnabled, activePane]);

    // --- Tab Persistence: Restore on mount ---
    useEffect(() => {
        const restoreTabs = async () => {
            try {
                const saved = sessionStorage.getItem(TAB_STORAGE_KEY);
                if (!saved) return;
                const meta = JSON.parse(saved);
                if (!meta.leftTabs?.length && !meta.rightTabs?.length) return;

                const loadTab = async (t) => {
                    if (!t.path) return null; // Skip unsaved tabs
                    try {
                        const res = await fetch(`http://localhost:3001/api/file?path=${encodeURIComponent(t.path)}`);
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
        if (leftTabs.find(t => t.id === tabId)) {
            updateTab('left', tabId, { content: newContent, dirty: true });
        } else {
            updateTab('right', tabId, { content: newContent, dirty: true });
        }
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

    const executeQuery = async (tabId, query) => {
        const pane = leftTabs.find(t => t.id === tabId) ? 'left' : 'right';
        // Resolve variables before execution
        const resolvedQuery = resolveVariables(query, queryVariables);
        try {
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: resolvedQuery }),
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
                    if (onDbChange) onDbChange();
                }

                return { data: data.data, executionTime: data.executionTime };
            } else {
                const marker = parseDuckDBError(data.error);
                updateTab(pane, tabId, { results: null, resultsError: data.error, errorMarker: marker });
                return { error: data.error };
            }
        } catch (err) {
            const marker = parseDuckDBError(err.message);
            updateTab(pane, tabId, { results: null, resultsError: err.message, errorMarker: marker });
            return { error: err.message };
        }
    };

    const handleRunActive = async () => {
        const tab = getActiveTab();
        if (!tab) return;
        if (tab.type === 'sql') {
            await executeQuery(tab.id, tab.content);
        }
    };

    const handleSaveActive = async () => {
        const tab = getActiveTab();
        if (!tab) return;

        if (!tab.path) {
            if (onRequestSaveAs) {
                onRequestSaveAs(tab.content, tab);
            } else {
                console.warn("Save As function not connected.");
            }
            return;
        }

        try {
            const response = await fetch('http://localhost:3001/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.path, content: tab.content })
            });

            if (response.ok) {
                updateTab(activePane, tab.id, { dirty: false });
                toast.success("Saved!");
            } else {
                console.error("Save failed");
                toast.error("Save failed!");
            }
        } catch (e) {
            console.error("Error saving: " + e.message);
            toast.error("Error saving: " + e.message);
        }
    };

    const handleAnalyzeActive = async () => {
        const tab = getActiveTab();
        if (!tab || tab.type !== 'sql') {
            console.warn("Please select a SQL file to analyze.");
            return;
        }

        const query = tab.content;
        // DuckDB specific syntax
        const explainQuery = `EXPLAIN (FORMAT JSON) ${query}`;

        try {
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: explainQuery }),
            });
            const data = await response.json();

            if (response.ok && data.data && data.data.length > 0) {
                // DuckDB returns the JSON in the explain_value column
                const firstRow = data.data[0];

                // Be robust: Check explain_value first, fallback to first value if not object
                let planString = firstRow.explain_value;

                if (!planString) {
                    // Fallback logic: Find the value that looks like JSON array/object
                    const values = Object.values(firstRow);
                    planString = values.find(v => typeof v === 'string' && (v.trim().startsWith('[') || v.trim().startsWith('{')));

                    if (!planString && values.length > 0) {
                        planString = values[0]; // Desperate default
                    }
                }

                let parsedPlan = null;
                try {
                    parsedPlan = typeof planString === 'string' ? JSON.parse(planString) : planString;
                } catch (e) {
                    console.error("Failed to parse JSON plan:", e);
                    const snippet = String(planString).substring(0, 100);
                    console.error(`Failed to parse execution plan.\nError: ${e.message}\nValue: ${snippet}...`);
                    return;
                }

                setPlanData(parsedPlan);
                setPlanQuery(query);
                setShowPlanModal(true);
            } else {
                console.error("Analysis failed: " + (data.error || "No data returned"));
            }
        } catch (err) {
            console.error("Analysis error: " + err.message);
        }
    };

    // Extracted createNew so it can be passed to EditorPanes + exposed via ref
    const createNew = (type, initialContent) => {
        const normalizedType = (type === 'notebook' || type === 'sqlnb') ? 'sqlnb' : type;
        const newTab = {
            id: Date.now().toString(),
            path: '',
            name: normalizedType === 'sqlnb' ? 'Untitled.sqlnb' : normalizedType === 'md' ? 'Untitled.md' : normalizedType === 'er-diagram' ? 'ER Diagram' : 'Untitled.sql',
            type: normalizedType,
            content: initialContent || (normalizedType === 'sqlnb'
                ? '-- !CELL:MARKDOWN!\n-- # New Notebook\n\n-- !CELL:CODE!\nSELECT 1;'
                : normalizedType === 'md' ? '# New Markdown File\n\nWrite your notes here...' : normalizedType === 'er-diagram' ? '' : 'SELECT 1;'),
            results: null,
            dirty: normalizedType !== 'er-diagram'
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
        getTabBarProps: () => ({
            tabs: activePane === 'left' ? leftTabs : rightTabs,
            activeTabId: activePane === 'left' ? leftActiveId : rightActiveId,
            onTabClick: (id) => {
                if (activePane === 'left') setLeftActiveId(id);
                else setRightActiveId(id);
            },
            onTabClose: handleTabClose,
            onDragStart: handleDragStart,
            onReorder: handleReorder,
            onCreateNew: createNew,
            paneId: activePane,
        }),
        openFile: async (path, content, type) => {
            const pane = activePane === 'left' ? leftTabs : rightTabs;
            const existing = pane.find(t => t.path === path);

            if (existing) {
                if (activePane === 'left') setLeftActiveId(existing.id);
                else setRightActiveId(existing.id);
            } else {
                const newTab = {
                    id: Date.now().toString(),
                    path: path,
                    name: path.split(/[/\\]/).pop(),
                    type: type || (path.endsWith('.sqlnb') ? 'sqlnb' : path.endsWith('.md') ? 'md' : 'sql'),
                    content: content,
                    results: null,
                    dirty: false
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
        handleTriggerRun: () => handleRunActive(),
        handleTriggerSave: () => handleSaveActive(),
        handleTriggerAnalyze: () => handleAnalyzeActive(),
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
                // Fetch the config
                const response = await fetch(`http://localhost:3001/api/file?path=${encodeURIComponent(filePath)}`);
                const data = await response.json();
                if (data.error) throw new Error(data.error);

                const config = JSON.parse(data.content);
                const query = config.query || 'SELECT * FROM ... LIMIT 100;';

                const newTab = {
                    id: Date.now().toString(),
                    path: '',
                    name: `Edit: ${filePath.split(/[/\\]/).pop()}`,
                    type: 'sql',
                    content: query,
                    results: null,
                    dirty: true,
                    initialChartConfig: config // Bundle the chart preset
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
        }
    }));

    // --- handleQueryFile: Standalone function for DnD + imperative handle ---
    const handleQueryFile = async (filePath) => {
        const fileName = filePath.split(/[/\\]/).pop();
        const normalizedPath = filePath.replace(/\\/g, '/');
        const lowerName = fileName.toLowerCase();

        // SQL and Markdown files: open directly
        if (lowerName.endsWith('.sql') || lowerName.endsWith('.sqlnb') || lowerName.endsWith('.md')) {
            try {
                const res = await fetch(`http://localhost:3001/api/file?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                if (!data.error) {
                    const type = lowerName.endsWith('.sqlnb') ? 'sqlnb' : lowerName.endsWith('.md') ? 'md' : 'sql';
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
                const res = await fetch(`http://localhost:3001/api/files/inspect-excel?path=${encodeURIComponent(filePath)}`);
                const data = await res.json();
                const sheets = data.sheets || ['Sheet1'];
                const sheetComments = sheets.map(s => `-- SELECT * FROM read_xlsx('${normalizedPath}', sheet='${s}') LIMIT 100;`).join('\n');
                content = `/* \n * Direct Query on ${fileName}\n * Available sheets: ${sheets.join(', ')}\n */\n\n${sheetComments}\n\nSELECT * FROM read_xlsx('${normalizedPath}', sheet='${sheets[0]}') LIMIT 100;`;
            } catch (err) {
                content = `/* \n * Direct Query on ${fileName}\n * Error fetching sheets: ${err.message}\n */\n\nSELECT * FROM read_xlsx('${normalizedPath}', sheet='Sheet1') LIMIT 100;`;
            }
        } else {
            content = `/* \n * Direct Query on ${fileName} \n */\n\nSELECT * FROM '${normalizedPath}' LIMIT 100;`;
        }

        const newTab = { id: Date.now().toString(), path: '', name: `${fileName}.sql`, type: 'sql', content, results: null, dirty: true };
        if (activePane === 'left') { setLeftTabs(prev => [...prev, newTab]); setLeftActiveId(newTab.id); }
        else { setRightTabs(prev => [...prev, newTab]); setRightActiveId(newTab.id); }
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
                    />
                )}
            </div>

            <QueryPlanModal
                isOpen={showPlanModal}
                onClose={() => setShowPlanModal(false)}
                plan={planData}
                query={planQuery}
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

export default LayoutManager;
