import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { LuColumns2, LuMaximize2 } from "react-icons/lu";
import EditorPane from './EditorPane';
import QueryPlanModal from './QueryPlanModal';

const LayoutManager = forwardRef(({ onDbChange, projectPath, onRequestSaveAs }, ref) => {
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

    const executeQuery = async (tabId, query) => {
        const pane = leftTabs.find(t => t.id === tabId) ? 'left' : 'right';
        try {
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
            });
            const data = await response.json();

            if (response.ok) {
                updateTab(pane, tabId, { results: data, resultsError: null });

                // Only refresh DB schema if query might have changed it
                const upperQuery = query.trim().toUpperCase();
                if (upperQuery.match(/^(CREATE|DROP|ALTER|UPDATE|INSERT|DELETE|ATTACH|DETACH|COPY)/) || upperQuery.includes('INTO')) {
                    if (onDbChange) onDbChange();
                }

                return { data: data.data, executionTime: data.executionTime };
            } else {
                updateTab(pane, tabId, { results: null, resultsError: data.error });
                return { error: data.error };
            }
        } catch (err) {
            updateTab(pane, tabId, { results: null, resultsError: err.message });
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
                onRequestSaveAs(tab.content);
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
                console.log("Saved!");
            } else {
                console.error("Save failed");
            }
        } catch (e) {
            console.error("Error saving: " + e.message);
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

    // Expose methods to parent
    useImperativeHandle(ref, () => ({
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
                    type: type || (path.endsWith('.sqlnb') ? 'sqlnb' : 'sql'),
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
        createNew: (type, initialContent) => {
            const newTab = {
                id: Date.now().toString(),
                path: '',
                name: type === 'sqlnb' ? 'Untitled.sqlnb' : 'Untitled.sql',
                type: type,
                content: initialContent || (type === 'sqlnb'
                    ? '-- !CELL:MARKDOWN!\n-- # New Notebook\n\n-- !CELL:CODE!\nSELECT 1;'
                    : 'SELECT 1;'),
                results: null,
                dirty: true
            };
            if (activePane === 'left') {
                setLeftTabs(prev => [...prev, newTab]);
                setLeftActiveId(newTab.id);
            } else {
                setRightTabs(prev => [...prev, newTab]);
                setRightActiveId(newTab.id);
            }
        },
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
        handleQueryFile: (filePath) => {
            const fileName = filePath.split(/[/\\]/).pop();
            const newTab = {
                id: Date.now().toString(),
                path: '',
                name: `${fileName}.sql`,
                type: 'sql',
                content: `/* \n * Direct Query on ${fileName} \n */\n\nSELECT * FROM '${filePath.replace(/\\/g, '/')}' LIMIT 100;`,
                results: null,
                dirty: true
            };

            if (activePane === 'left') {
                setLeftTabs(prev => [...prev, newTab]);
                setLeftActiveId(newTab.id);
            } else {
                setRightTabs(prev => [...prev, newTab]);
                setRightActiveId(newTab.id);
            }
        }
    }));

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

    const handleGlobalDragOver = (e) => {
        e.preventDefault();
        if (!draggedTab) return;

        const width = window.innerWidth;
        const x = e.clientX;
        const edgeThreshold = 100; // px

        // Global Edge Detection (Priority)
        if (x > width - edgeThreshold) {
            setDragOverZone('right-edge');
            return;
        }
        if (x < edgeThreshold) {
            setDragOverZone('left-edge');
            return;
        }

        // If not on edge, check which pane we are over (if split)
        // Simple heuristic: which side of screen center?
        if (splitEnabled) {
            if (x < width / 2) setDragOverZone('left-pane');
            else setDragOverZone('right-pane');
        } else {
            setDragOverZone('center'); // Just reordering in current pane effectively
        }
    };

    const handleGlobalDrop = (e) => {
        e.preventDefault();
        if (!draggedTab || !dragOverZone) {
            handleDragEnd();
            return;
        }

        const { tabId, sourcePane } = draggedTab;
        const targetZone = dragOverZone;

        // Logic based on Zone
        if (targetZone === 'right-edge') {
            // 1. Enable Split (if not already)
            // 2. Move tab to Right Pane
            moveTabToPane(tabId, sourcePane, 'right');
            setSplitEnabled(true);
            setActivePane('right');
            setRightActiveId(tabId);
        } else if (targetZone === 'left-edge') {
            // Move to Left Pane
            moveTabToPane(tabId, sourcePane, 'left');
            // If we were split, we stay split unless we want to auto-merge?
            // User didn't ask for auto-merge, but standard behavior is usually keep split.
            // If moving to left edge, usually implies "Dock Left".
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
            style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}
            onDragOver={handleGlobalDragOver}
            onDrop={handleGlobalDrop}
            onDragEnd={handleDragEnd}
        >
            {/* Visual Overlays for Drop Zones */}
            {dragOverZone === 'left-edge' && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '100%', background: 'rgba(0, 255, 255, 0.1)', borderRight: '2px solid #00ffff', zIndex: 9999, pointerEvents: 'none' }} />
            )}
            {dragOverZone === 'right-edge' && (
                <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', background: 'rgba(0, 255, 255, 0.1)', borderLeft: '2px solid #00ffff', zIndex: 9999, pointerEvents: 'none' }} />
            )}

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <EditorPane
                    paneId="left"
                    tabs={leftTabs}
                    activeTabId={leftActiveId}
                    onTabClick={(id) => { setLeftActiveId(id); setActivePane('left'); }}
                    onTabClose={handleTabClose}
                    onContentChange={handleContentChange}
                    onRunQuery={executeQuery}
                    onSave={handleSaveActive}
                    onAnalyze={handleAnalyzeActive}
                    onDbChange={onDbChange}
                    // DnD Props
                    onDragStart={handleDragStart}
                    onReorder={handleReorder}
                />

                {splitEnabled && (
                    <EditorPane
                        paneId="right"
                        tabs={rightTabs}
                        activeTabId={rightActiveId}
                        onTabClick={(id) => { setRightActiveId(id); setActivePane('right'); }}
                        onTabClose={handleTabClose}
                        onContentChange={handleContentChange}
                        onRunQuery={executeQuery}
                        onSave={handleSaveActive}
                        onAnalyze={handleAnalyzeActive}
                        onDbChange={onDbChange}
                        // DnD Props
                        onDragStart={handleDragStart}
                        onReorder={handleReorder}
                    />
                )}
            </div>

            <QueryPlanModal
                isOpen={showPlanModal}
                onClose={() => setShowPlanModal(false)}
                plan={planData}
                query={planQuery}
            />
        </div >
    );
});

export default LayoutManager;
