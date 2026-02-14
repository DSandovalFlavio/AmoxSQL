import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
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
                if (onDbChange) onDbChange();
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
                alert("Save As function not connected.");
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
                alert("Saved!");
            } else {
                alert("Save failed");
            }
        } catch (e) {
            alert("Error saving: " + e.message);
        }
    };

    const handleAnalyzeActive = async () => {
        const tab = getActiveTab();
        if (!tab || tab.type !== 'sql') {
            alert("Please select a SQL file to analyze.");
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
                    alert(`Failed to parse execution plan.\nError: ${e.message}\nValue: ${snippet}...`);
                    return;
                }

                setPlanData(parsedPlan);
                setPlanQuery(query);
                setShowPlanModal(true);
            } else {
                alert("Analysis failed: " + (data.error || "No data returned"));
            }
        } catch (err) {
            alert("Analysis error: " + err.message);
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
        createNew: (type) => {
            const newTab = {
                id: Date.now().toString(),
                path: '',
                name: type === 'sqlnb' ? 'Untitled.sqlnb' : 'Untitled.sql',
                type: type,
                content: type === 'sqlnb'
                    ? '-- !CELL:MARKDOWN!\n-- # New Notebook\n\n-- !CELL:CODE!\nSELECT 1;'
                    : 'SELECT 1;',
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

    const toggleSplit = () => {
        if (splitEnabled) {
            setLeftTabs(prev => [...prev, ...rightTabs]);
            setRightTabs([]);
            setSplitEnabled(false);
            setActivePane('left');
        } else {
            setSplitEnabled(true);
            setRightTabs([]);
            setActivePane('right');
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="toolbar" style={{ borderBottom: '1px solid #333', background: '#141517', padding: '5px 10px', display: 'flex', justifyContent: 'space-between' }}>
                <div className="toolbar-left">
                    <span style={{ fontSize: '11px', color: '#666', marginRight: '10px' }}>
                        {getActiveTab() ? getActiveTab().name : 'No File'}
                    </span>
                </div>
                <div>
                    <button onClick={toggleSplit} title="Split Editor" style={{ background: 'transparent', border: 'none', color: '#ccc', cursor: 'pointer' }}>
                        {splitEnabled ? '🔲 Merge' : '📖 Split'}
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <EditorPane
                    paneId="left"
                    tabs={leftTabs}
                    activeTabId={leftActiveId}
                    onTabClick={(id) => { setLeftActiveId(id); setActivePane('left'); }}
                    onTabClose={handleTabClose}
                    onContentChange={handleContentChange}
                    onRunQuery={executeQuery}
                    onDbChange={onDbChange}
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
                        onDbChange={onDbChange}
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
