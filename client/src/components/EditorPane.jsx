import React, { useState, useRef, useEffect } from 'react';
import DebugResultModal from './DebugResultModal';
import TabBar from './TabBar';
import SqlEditor from './SqlEditor';
import SqlNotebook from './SqlNotebook';
import ResultsTable from './ResultsTable';
import VariablesBar from './VariablesBar';

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
    theme,
    editorLayout,
    editorSettings,
    variables,
    onVariablesChange,
}) => {
    const isVertical = editorLayout === 'vertical';

    const [resultsHeight, setResultsHeight] = useState(300);
    const [resultsWidth, setResultsWidth] = useState(500);
    const isResizing = useRef(false);
    const containerRef = useRef(null);
    const ghostRef = useRef(null);

    // CTE Debug State
    const [debugModalOpen, setDebugModalOpen] = useState(false);
    const [debugCteName, setDebugCteName] = useState(null);
    const [debugResult, setDebugResult] = useState(null);
    const [debugQuery, setDebugQuery] = useState('');

    const activeTab = tabs.find(t => t.id === activeTabId);

    // Resizing Logic specific to this pane
    const startResizing = (e) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';

        if (ghostRef.current && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            ghostRef.current.style.display = 'block';
            if (isVertical) {
                ghostRef.current.style.left = `${e.clientX - rect.left}px`;
                ghostRef.current.style.top = '0px';
                ghostRef.current.style.width = '4px';
                ghostRef.current.style.height = '100%';
            } else {
                ghostRef.current.style.top = `${e.clientY - rect.top}px`;
                ghostRef.current.style.left = '0px';
                ghostRef.current.style.height = '4px';
                ghostRef.current.style.width = '100%';
            }
        }
    };

    const stopResizing = (e) => {
        if (!isResizing.current) return;
        isResizing.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (ghostRef.current) {
            ghostRef.current.style.display = 'none';
        }

        if (isVertical) {
            // Vertical layout: resize width from the right
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const newWidth = rect.right - e.clientX;
            if (newWidth >= 200 && newWidth <= rect.width - 200) {
                setResultsWidth(newWidth);
            }
        } else {
            // Horizontal layout (default): resize height from the bottom
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight >= 50 && newHeight <= 800) {
                setResultsHeight(newHeight);
            }
        }
    };

    const resize = (e) => {
        if (!isResizing.current) return;
        if (ghostRef.current && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            if (isVertical) {
                ghostRef.current.style.left = `${e.clientX - rect.left}px`;
            } else {
                ghostRef.current.style.top = `${e.clientY - rect.top}px`;
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
    }, [isVertical]);

    const handleDebugCte = async (cteName, content) => {
        // Reuse logic from NotebookCell? Ideally this logic should be a shared utility.
        // For now, duplicate logic (simplified)

        let query = content || activeTab.content;

        setDebugCteName(cteName);
        setDebugModalOpen(true);
        setDebugResult(null);

        try {
            console.log("Debugging CTE:", cteName);

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

            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: debugQ }),
            });
            const data = await response.json();

            if (response.ok) {
                setDebugResult({ data: data.data, types: data.types, executionTime: data.executionTime });
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

    // Results panel content (shared between both layouts)
    const resultsContent = (
        <>
            {activeTab.resultsError && <div style={{ color: 'red', padding: '10px' }}>Error: {activeTab.resultsError}</div>}

            {activeTab.results && (
                <ResultsTable
                    data={activeTab.results.data}
                    types={activeTab.results.types}
                    executionTime={activeTab.results.executionTime}
                    query={activeTab.resultsQuery || activeTab.content}
                    currentEditorQuery={activeTab.content}
                    onDbChange={onDbChange}
                    initialChartConfig={activeTab.initialChartConfig}
                    editorSettings={editorSettings}
                />
            )}

            {!activeTab.results && !activeTab.resultsError && (
                <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    Run query (Ctrl+Enter) to see results.
                </div>
            )}
        </>
    );

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

            <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

                {/* Content Area */}
                {isNotebook ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: isActive ? '1px solid var(--accent-color-user)' : 'none', zIndex: isActive ? 1 : 0 }}>
                        <SqlNotebook
                            key={activeTab.id}
                            content={activeTab.content}
                            onChange={(val) => onContentChange(activeTab.id, val)}
                            onRunQuery={(q) => onRunQuery(activeTab.id, q)}
                            filePath={activeTab.path || null}
                        />
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: isVertical ? 'row' : 'column', overflow: 'hidden' }}>
                        {/* Editor Section */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
                            {/* Variables Bar */}
                            <VariablesBar variables={variables || []} onChange={onVariablesChange || (() => { })} />
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
                                    errorMarker={activeTab.errorMarker}
                                    editorSettings={editorSettings}
                                />
                            </div>
                        </div>

                        {/* Resizer Handle */}
                        <div
                            className="resizer-handle"
                            onMouseDown={startResizing}
                            style={isVertical ? {
                                width: '5px', height: '100%', cursor: 'col-resize',
                                background: 'var(--border-color)', zIndex: 10, flexShrink: 0
                            } : {
                                height: '5px', width: '100%', cursor: 'row-resize',
                                background: 'var(--border-color)', zIndex: 10, flexShrink: 0
                            }}
                        ></div>

                        {/* Results Section */}
                        <div className="results-container" style={isVertical ? {
                            width: resultsWidth, minWidth: 200, height: '100%',
                            display: 'flex', flexDirection: 'column', overflow: 'auto'
                        } : {
                            height: resultsHeight,
                            display: 'flex', flexDirection: 'column', overflow: 'hidden'
                        }}>
                            {resultsContent}
                        </div>
                    </div>
                )}

                {/* Ghost Splitter Line */}
                <div
                    ref={ghostRef}
                    style={{
                        position: 'absolute',
                        display: 'none',
                        backgroundColor: 'var(--accent-color-user)',
                        zIndex: 9999,
                        pointerEvents: 'none',
                        opacity: 0.8
                    }}
                />
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
