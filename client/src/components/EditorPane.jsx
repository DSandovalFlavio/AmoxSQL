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
    onFileDrop,       // (filePath) -> handle dropped file
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

    // File Drop State
    const [showDropZone, setShowDropZone] = useState(false);
    const dropCounterRef = useRef(0);

    const [isPoppedOut, setIsPoppedOut] = useState(false);

    // Listen for popout window being closed by the user
    useEffect(() => {
        if (!window.electronAPI?.onPopoutClosed) return;
        const cleanup = window.electronAPI.onPopoutClosed(() => {
            setIsPoppedOut(false);
        });
        return cleanup;
    }, []);

    const activeTab = tabs.find(t => t.id === activeTabId);

    const handlePopout = () => {
        if (!activeTab?.results) return;
        const payload = {
            data: activeTab.results.data,
            types: activeTab.results.types,
            executionTime: activeTab.results.executionTime,
            query: activeTab.resultsQuery || activeTab.content,
            cellTitle: activeTab.name,
        };
        window.electronAPI?.openPopout(payload);
        setIsPoppedOut(true);
    };

    // Auto-update the pop-out window when results change
    useEffect(() => {
        if (!isPoppedOut || !activeTab?.results) return;
        const payload = {
            data: activeTab.results.data,
            types: activeTab.results.types,
            executionTime: activeTab.results.executionTime,
            query: activeTab.resultsQuery || activeTab.content,
            cellTitle: activeTab.name,
        };
        window.electronAPI?.openPopout(payload);
    }, [isPoppedOut, activeTab?.results]);


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
            // Horizontal layout (default): resize height relative to the container, not window
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const newHeight = rect.bottom - e.clientY;
            const maxHeight = rect.height * 0.80; // Never exceed 80% of the container
            if (newHeight >= 50 && newHeight <= maxHeight) {
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
            <div className="ep-container">
                <TabBar tabs={tabs} activeTabId={activeTabId} onTabClick={onTabClick} onTabClose={onTabClose} />
                <div className="ep-empty-message">
                    No file open
                </div>
            </div>
        );
    }

    const isNotebook = activeTab.name.endsWith('.sqlnb');

    // Results panel content (shared between both layouts)
    const resultsContent = (
        <>
            {activeTab.resultsError && <div className="ep-error">Error: {activeTab.resultsError}</div>}

            {activeTab.results && (
                <>
                    {!isPoppedOut && (
                        <ResultsTable
                            data={activeTab.results.data}
                            types={activeTab.results.types}
                            executionTime={activeTab.results.executionTime}
                            query={activeTab.resultsQuery || activeTab.content}
                            currentEditorQuery={activeTab.content}
                            onDbChange={onDbChange}
                            initialChartConfig={activeTab.initialChartConfig}
                            editorSettings={editorSettings}
                            onPopout={handlePopout}
                        />
                    )}

                    {isPoppedOut && (
                        <div className="ep-popout-notice">
                            Results for {activeTab.name} are actively displayed in a detached window.
                            <div>
                                <button onClick={() => setIsPoppedOut(false)}>
                                    Bring Back Here
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {!activeTab.results && !activeTab.resultsError && (
                <div className="ep-no-results">
                    Run query (Ctrl+Enter) to see results.
                </div>
            )}
        </>
    );

    return (
        <div
            className="ep-container"
            onClickCapture={() => onTabClick && activeTabId && onTabClick(activeTabId)}
            onDragEnter={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    dropCounterRef.current++;
                    setShowDropZone(true);
                }
            }}
            onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                }
            }}
            onDragLeave={(e) => {
                dropCounterRef.current--;
                if (dropCounterRef.current <= 0) {
                    dropCounterRef.current = 0;
                    setShowDropZone(false);
                }
            }}
            onDrop={(e) => {
                e.preventDefault();
                dropCounterRef.current = 0;
                setShowDropZone(false);
                const files = e.dataTransfer.files;
                if (files && files.length > 0 && onFileDrop) {
                    for (const file of files) {
                        onFileDrop(file.path || file.name);
                    }
                }
            }}
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

            <div ref={containerRef} className="ep-inner">

                {/* Content Area */}
                {isNotebook ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`}>
                        <SqlNotebook
                            key={activeTab.id}
                            content={activeTab.content}
                            onChange={(val) => onContentChange(activeTab.id, val)}
                            onRunQuery={(q) => onRunQuery(activeTab.id, q)}
                            filePath={activeTab.path || null}
                        />
                    </div>
                ) : (
                    <div className={`ep-editor-area${isVertical ? ' vertical' : ''}`}>
                        {/* Editor Section */}
                        <div className="ep-editor-section">
                            {/* Variables Bar */}
                            <VariablesBar variables={variables || []} onChange={onVariablesChange || (() => { })} />
                            <div className={`ep-editor-wrapper${isActive ? ' active' : ''}`}>
                                <SqlEditor
                                    value={activeTab.content}
                                    language={activeTab.type === 'md' ? 'markdown' : 'sql'}
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
                            className={`ep-resizer${isVertical ? ' vertical' : ''}`}
                            onMouseDown={startResizing}
                        />

                        {/* Results Section */}
                        <div
                            className={`ep-results${isVertical ? ' vertical' : ''}`}
                            style={isVertical ? { width: resultsWidth } : { height: resultsHeight }}
                        >
                            {resultsContent}
                        </div>
                    </div>
                )}

                {/* Ghost Splitter Line */}
                <div ref={ghostRef} className="ep-ghost" />
            </div>

            <DebugResultModal
                isOpen={debugModalOpen}
                onClose={() => setDebugModalOpen(false)}
                cteName={debugCteName}
                result={debugResult}
                query={debugQuery}
            />

            {/* File Drop Overlay */}
            {showDropZone && (
                <div className="ep-drop-overlay">
                    <div className="ep-drop-content">
                        <span className="ep-drop-icon">📁</span>
                        Drop files to import
                        <span className="ep-drop-subtitle">CSV, Parquet, XLSX, JSON, SQL</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditorPane;
