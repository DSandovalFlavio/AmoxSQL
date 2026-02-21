import React, { useState, useRef, useEffect } from 'react';
import DebugResultModal from './DebugResultModal';
import TabBar from './TabBar';
import SqlEditor from './SqlEditor';
import SqlNotebook from './SqlNotebook';
import ResultsTable from './ResultsTable';

const EditorPane = ({
    paneId,
    tabs,
    activeTabId,
    onTabClick,
    onTabClose,
    onContentChange, // (tabId, newContent)
    onRunQuery,      // (tabId, queryToRun) -> returns Promise<Result>
    onSave,           // Trigger save needed? Actually App handles save button. This is just for internal updates.
    onAnalyze,
    onDbChange,
    onDragStart,
    onReorder,
    isActive,
    theme
}) => {
    const [resultsHeight, setResultsHeight] = useState(300);
    const isResizing = useRef(false);

    // CTE Debug State
    const [debugModalOpen, setDebugModalOpen] = useState(false);
    const [debugCteName, setDebugCteName] = useState(null);
    const [debugResult, setDebugResult] = useState(null);
    const [debugQuery, setDebugQuery] = useState('');

    const activeTab = tabs.find(t => t.id === activeTabId);

    // Resizing Logic specific to this pane
    const startResizing = (e) => { isResizing.current = true; };
    const stopResizing = () => { isResizing.current = false; };
    const resize = (e) => {
        if (isResizing.current) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight >= 50 && newHeight <= 800) {
                setResultsHeight(newHeight);
            }
        }
    };

    useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, []);

    const handleDebugCte = async (cteName, content) => {
        // Reuse logic from NotebookCell? Ideally this logic should be a shared utility.
        // For now, duplicate logic (simplified)

        let query = content || activeTab.content;

        setDebugCteName(cteName);
        setDebugModalOpen(true);
        setDebugResult(null);

        try {
            console.log("Debugging CTE:", cteName);
            // console.log("Query Content Length:", query.length);
            // console.log("Query Snippet:", query.substring(0, 500)); // First 500 chars

            // Escape special regex chars just in case user uses them in identifiers (though \w usually handles it)
            // But we trust cteName is simple for now.
            const cteStartRegex = new RegExp(`\\b${cteName}\\s+AS\\s*\\(`, 'i');
            const match = cteStartRegex.exec(query);

            console.log("Regex:", cteStartRegex);
            console.log("Match Result:", match);

            if (!match) {
                console.error("Match failed. Content slice searching for:", cteName);
                throw new Error("Could not find CTE definition.");
            }

            let parenCount = 0;
            let foundStart = false;
            let cutIndex = -1;

            for (let i = match.index; i < query.length; i++) {
                if (query[i] === '(') {
                    parenCount++;
                    foundStart = true;
                } else if (query[i] === ')') {
                    parenCount--;
                    if (foundStart && parenCount === 0) {
                        cutIndex = i + 1;
                        break;
                    }
                }
            }

            if (cutIndex === -1) throw new Error("Could not parse CTE bounds.");

            const partialQuery = query.substring(0, cutIndex);
            const debugQ = `${partialQuery} SELECT * FROM ${cteName} LIMIT 100`;
            setDebugQuery(debugQ);

            // Fetch not passed in props... use fetch directly or onRunQuery?
            // onRunQuery might update the tab results, which we DON'T want.
            // So we fetch directly here.
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: debugQ }),
            });
            const data = await response.json();

            if (response.ok) {
                setDebugResult({ data: data.data, executionTime: data.executionTime });
            } else {
                setDebugResult({ error: data.error });
            }

        } catch (e) {
            setDebugResult({ error: e.message });
        }
    };

    if (!activeTab) {
        return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--editor-bg)', borderLeft: '1px solid var(--border-color)' }}>
                <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={onTabClick} onTabClose={onTabClose} />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                    No file open
                </div>
            </div>
        );
    }

    const isNotebook = activeTab.name.endsWith('.sqlnb');

    return (
        <div
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--editor-bg)',
                borderLeft: '1px solid var(--border-color)',
                overflow: 'hidden'
            }}
            onClickCapture={() => onTabClick && activeTabId && onTabClick(activeTabId)}
        >
            <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabClick={onTabClick}
                onTabClose={onTabClose}
                paneId={paneId}
                onDragStart={onDragStart}
                onReorder={onReorder}
            />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

                {/* Content Area */}
                {isNotebook ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: isActive ? '1px solid var(--accent-color-user)' : 'none', zIndex: isActive ? 1 : 0 }}>
                        <SqlNotebook
                            key={activeTab.id}
                            content={activeTab.content}
                            onChange={(val) => onContentChange(activeTab.id, val)}
                            onRunQuery={(q) => onRunQuery(activeTab.id, q)}
                        />
                    </div>
                ) : (
                    <>
                        <div style={{
                            flex: 1,
                            overflow: 'hidden',
                            outline: isActive ? '1px solid var(--accent-color-user)' : 'none',
                            zIndex: isActive ? 10 : 0
                        }}>
                            <SqlEditor
                                value={activeTab.content}
                                onChange={(val) => onContentChange(activeTab.id, val)}
                                onDebugCte={(cteName) => handleDebugCte(cteName, activeTab.content)}
                                onRunQuery={(overrideQuery) => onRunQuery(activeTab.id, overrideQuery || activeTab.content)}
                                onSave={() => onSave && onSave()}
                                onAnalyze={() => onAnalyze && onAnalyze()}
                                theme={theme}
                            />
                        </div>

                        {/* Results for SQL File */}
                        {/* ... Resizer and Results ... */}
                        <div
                            className="resizer-handle"
                            onMouseDown={startResizing}
                            style={{
                                height: '5px', background: 'var(--border-color)', cursor: 'row-resize', width: '100%', zIndex: 10
                            }}
                        ></div>
                        <div className="results-container" style={{ height: resultsHeight, display: 'flex', flexDirection: 'column' }}>
                            {activeTab.resultsError && <div style={{ color: 'red', padding: '10px' }}>Error: {activeTab.resultsError}</div>}

                            {activeTab.results && (
                                <ResultsTable
                                    data={activeTab.results.data}
                                    executionTime={activeTab.results.executionTime}
                                    query={activeTab.content}
                                    onDbChange={onDbChange}
                                    initialChartConfig={activeTab.initialChartConfig}
                                />
                            )}

                            {!activeTab.results && !activeTab.resultsError && (
                                <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                    Run query (Ctrl+Enter) to see results.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <DebugResultModal
                isOpen={debugModalOpen}
                onClose={() => setDebugModalOpen(false)}
                cteName={debugCteName}
                result={debugResult}
                query={debugQuery}
            />
        </div>
    );
};

export default EditorPane;
