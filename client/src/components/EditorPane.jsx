import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { LuPlay, LuActivity, LuSave, LuChevronDown, LuBot, LuX, LuCode, LuFilePlus, LuFolder, LuSquare, LuHistory } from 'react-icons/lu';
import DebugResultModal from './DebugResultModal';
import SqlEditor from './SqlEditor';
import SqlNotebook from './SqlNotebook';
import ResultsTable from './ResultsTable';
import { VariablesToggle, VariablesPanel } from './VariablesBar';
import ErDiagram from './ErDiagram';
import AmoxvisPane from './AmoxvisPane';
import MarkdownEditor from './MarkdownEditor';

const ChainEditor = lazy(() => import('./chains/ChainEditor'));
import AiDivingPanel from './ai/AiDivingPanel';

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
    onCreateNew,      // (type) -> create new file from TabBar
    onRequestSaveAs,  // () -> open save-as modal
    showAiSidebar,    // boolean — AI sidebar visible?
    onToggleAi,       // () -> toggle AI sidebar
    onOpenFile,       // (filePath) -> open a file in a new tab (used by ChainEditor)
    availableTables,  // Data Diving only
    onExportNotebook, // Data Diving only
    onExportAmoxvis, // Data Diving chart export
    isRunning,        // boolean — a query is currently executing
    onCancelQuery,    // () -> cancel the running query
    onShowHistory,    // () -> navigate left sidebar to 'history' tab
    onOpenAmoxvisAsSql, // (tab) -> switch amoxvis tab to SQL editor mode
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

    // Action bar state (must be before any early return)
    const [showSaveMenu, setShowSaveMenu] = useState(false);
    const saveMenuRef = useRef(null);
    const [lastEditTime, setLastEditTime] = useState(null);
    const [lastRunTime, setLastRunTime] = useState(null);
    const [varsExpanded, setVarsExpanded] = useState(false);

    // Close save dropdown on outside click
    useEffect(() => {
        if (!showSaveMenu) return;
        const handler = (e) => {
            if (saveMenuRef.current && !saveMenuRef.current.contains(e.target)) setShowSaveMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showSaveMenu]);

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
                <div className="ep-empty-state">
                    <p className="ep-empty-subtitle">Create a new file to get started</p>
                    <div className="ep-empty-cards">
                        <button className="ep-empty-card" onClick={() => onCreateNew && onCreateNew('sql')}>
                            <LuCode size={24} />
                            <span className="ep-empty-card-title">SQL Query</span>
                            <span className="ep-empty-card-desc">Write and execute SQL</span>
                        </button>
                        <button className="ep-empty-card" onClick={() => onCreateNew && onCreateNew('notebook')}>
                            <LuFilePlus size={24} />
                            <span className="ep-empty-card-title">SQL Notebook</span>
                            <span className="ep-empty-card-desc">Cells with code & markdown</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isNotebook = activeTab.name.endsWith('.sqlnb') || activeTab.type === 'sqlnb';
    const isChain = activeTab.name.endsWith('.sqlchain') || activeTab.type === 'sqlchain';
    const isErDiagram = activeTab.type === 'er-diagram';
    const isDataDiving = activeTab.type === 'datadiving';
    const isAmoxvis = activeTab.type === 'amoxvis';
    const isMarkdown = activeTab.type === 'md' || activeTab.name?.endsWith('.md');

    // Track last edit time on content change
    const handleContentChangeWithTimestamp = (tabId, newContent) => {
        setLastEditTime(new Date());
        onContentChange(tabId, newContent);
    };

    // Track last run time
    const handleRunWithTimestamp = async (tabId, query) => {
        setLastRunTime(new Date());
        return onRunQuery(tabId, query);
    };

    const formatTimeAgo = (date) => {
        if (!date) return '—';
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 5) return 'just now';
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

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
                            truncated={activeTab.results.truncated}
                            rowLimit={activeTab.results.rowLimit}
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
            <div ref={containerRef} className="ep-inner">

                {/* Content Area */}
                {isAmoxvis ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`} style={{ backgroundColor: 'var(--surface-primary)' }}>
                        <AmoxvisPane
                            tab={activeTab}
                            onRunQuery={onRunQuery}
                            onSave={onSave}
                            onOpenAsSql={(tab) => onOpenAmoxvisAsSql && onOpenAmoxvisAsSql(tab)}
                            onConfigChange={(config) => onContentChange(activeTab.id, JSON.stringify(config, null, 2))}
                        />
                    </div>
                ) : isDataDiving ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`} style={{ backgroundColor: 'var(--surface-primary)' }}>
                        <AiDivingPanel
                            width="100%"
                            onRunSql={(sql) => onCreateNew && onCreateNew('sql', sql)}
                            onExportNotebook={onExportNotebook}
                            onExportAmoxvis={onExportAmoxvis}
                            onOpenFile={onOpenFile}
                            availableTables={availableTables}
                            startConversationId={activeTab?.content || null}
                        />
                    </div>
                ) : isErDiagram ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`} style={{ backgroundColor: 'var(--surface-default)' }}>
                        <ErDiagram onCreateTab={(ddl) => onCreateNew('sql', ddl)} />
                    </div>
                ) : isChain ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`}>
                        <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Loading chain editor...</div>}>
                            <ChainEditor
                                key={activeTab.id}
                                content={activeTab.content}
                                onChange={(val) => onContentChange(activeTab.id, val)}
                                filePath={activeTab.path || null}
                                onOpenFile={onOpenFile}
                                onSave={onSave}
                            />
                        </Suspense>
                    </div>
                ) : isMarkdown ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`}>
                        <MarkdownEditor
                            key={activeTab.id}
                            content={activeTab.content}
                            onChange={(val) => handleContentChangeWithTimestamp(activeTab.id, val)}
                            onSave={onSave}
                            onRequestSaveAs={onRequestSaveAs}
                            theme={theme}
                            editorSettings={editorSettings}
                            onToggleAi={onToggleAi}
                            showAiSidebar={showAiSidebar}
                            isActive={isActive}
                        />
                    </div>
                ) : isNotebook ? (
                    <div className={`ep-notebook-wrapper${isActive ? ' active' : ''}`}>
                        <SqlNotebook
                            key={activeTab.id}
                            content={activeTab.content}
                            onChange={(val) => onContentChange(activeTab.id, val)}
                            onRunQuery={(q) => onRunQuery(activeTab.id, q)}
                            onSave={() => onSave && onSave()}
                            filePath={activeTab.path || null}
                            onToggleAi={onToggleAi}
                            showAiSidebar={showAiSidebar}
                        />
                    </div>
                ) : (
                    <div className={`ep-editor-area${isVertical ? ' vertical' : ''}`}>
                        {/* Editor Card — "message box" style with rounded borders */}
                        <div className="ep-editor-card">
                            {/* Action Bar — header of the card */}
                            <div className="ep-action-bar">
                                <div className="ep-action-left">
                                    {/* Run + Analyze group */}
                                    <div className="ep-action-group">
                                        {isRunning ? (
                                            <button
                                                className="ep-action-run sql-btn-stop"
                                                onClick={onCancelQuery}
                                                title="Cancel (Esc)"
                                                aria-label="Cancel running query"
                                            >
                                                <LuSquare size={13} fill="currentColor" /> Stop
                                            </button>
                                        ) : (
                                            <button
                                                className="ep-action-run"
                                                onClick={() => handleRunWithTimestamp(activeTab.id, activeTab.content)}
                                                title="Run (Ctrl+Enter)"
                                                aria-label="Run query"
                                            >
                                                <LuPlay size={13} fill="currentColor" /> Run
                                            </button>
                                        )}
                                        <button
                                            className="ep-action-btn"
                                            onClick={() => onAnalyze && onAnalyze()}
                                            title="Analyze Query Plan (Ctrl+Shift+A)"
                                            aria-label="Analyze query plan"
                                        >
                                            <LuActivity size={13} />
                                        </button>
                                    </div>

                                    {/* Save group */}
                                    <div className="ep-action-group" ref={saveMenuRef}>
                                        <button
                                            className="ep-action-btn"
                                            onClick={() => onSave && onSave()}
                                            title="Save (Ctrl+S)"
                                            aria-label="Save file"
                                        >
                                            <LuSave size={13} /> Save
                                        </button>
                                        <button
                                            className="ep-action-chevron"
                                            onClick={() => setShowSaveMenu(v => !v)}
                                            title="Save Options"
                                            aria-label="Save options"
                                        >
                                            <LuChevronDown size={10} />
                                        </button>
                                        {showSaveMenu && (
                                            <div className="ep-action-dropdown">
                                                <div className="ep-action-dropdown-item" onClick={() => { onSave && onSave(); setShowSaveMenu(false); }}>
                                                    Save
                                                </div>
                                                <div className="ep-action-dropdown-item" onClick={() => { onRequestSaveAs && onRequestSaveAs(); setShowSaveMenu(false); }}>
                                                    Save As…
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* History button — opens the History tab in the left sidebar */}
                                    <div className="ep-action-group">
                                        <button
                                            className="ep-action-btn"
                                            onClick={() => onShowHistory && onShowHistory()}
                                            title="Query History (Ctrl+Shift+H)"
                                            aria-label="Query History"
                                        >
                                            <LuHistory size={13} />
                                        </button>
                                    </div>

                                    {/* Variables toggle */}
                                    <VariablesToggle
                                        count={(variables || []).length}
                                        isExpanded={varsExpanded}
                                        onToggle={() => setVarsExpanded(v => !v)}
                                        onAdd={() => {
                                            const vars = variables || [];
                                            const name = `var_${vars.length + 1}`;
                                            onVariablesChange && onVariablesChange([...vars, { name, value: '', type: 'text' }]);
                                            if (!varsExpanded) setVarsExpanded(true);
                                        }}
                                    />
                                </div>

                                <div className="ep-action-right">
                                    <span className="ep-action-timestamps">
                                        Edited {formatTimeAgo(lastEditTime)} · Ran {formatTimeAgo(lastRunTime)}
                                    </span>

                                    {/* AI Toggle per editor */}
                                    {onToggleAi && (
                                        <button
                                            className={`ep-action-ai${showAiSidebar ? ' active' : ''}`}
                                            onClick={onToggleAi}
                                            title="Toggle AI Assistant"
                                        >
                                            {showAiSidebar ? <LuX size={13} /> : <LuBot size={13} />}
                                            <span>{showAiSidebar ? 'Close AI' : 'AI'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Variables panel — expandable row below action bar */}
                            {varsExpanded && (variables || []).length > 0 && (
                                <VariablesPanel variables={variables || []} onChange={onVariablesChange || (() => { })} />
                            )}

                            {/* Editor Section — body of the card */}
                            <div className="ep-editor-section">
                                <div className={`ep-editor-wrapper${isActive ? ' active' : ''}`}>
                                    <SqlEditor
                                        value={activeTab.content}
                                        language={activeTab.type === 'md' ? 'markdown' : 'sql'}
                                        onChange={(val) => handleContentChangeWithTimestamp(activeTab.id, val)}
                                        onDebugCte={(cteName) => handleDebugCte(cteName, activeTab.content)}
                                        onRunQuery={(overrideQuery) => handleRunWithTimestamp(activeTab.id, overrideQuery || activeTab.content)}
                                        onSave={() => onSave && onSave()}
                                        onAnalyze={() => onAnalyze && onAnalyze()}
                                        onShowHistory={() => onShowHistory && onShowHistory()}
                                        theme={theme}
                                        errorMarker={activeTab.errorMarker}
                                        editorSettings={editorSettings}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Resizer Handle — pill-style drag indicator */}
                        <div
                            className={`ep-resizer${isVertical ? ' vertical' : ''}`}
                            onMouseDown={startResizing}
                        />

                        {/* Results Card — rounded container for results */}
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

            {/* Query History is in the left sidebar — use the History button to navigate there */}

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
                        <span className="ep-drop-icon"><LuFolder size={48} /></span>
                        Drop files to import
                        <span className="ep-drop-subtitle">CSV, Parquet, XLSX, JSON, SQL</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditorPane;
