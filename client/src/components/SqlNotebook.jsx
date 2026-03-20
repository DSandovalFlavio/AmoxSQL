import React, { useState, useEffect, useRef, useCallback } from 'react';
import NotebookCell from './NotebookCell';
import { LuPenLine, LuFileText, LuPrinter, LuPlus, LuEyeOff, LuEye, LuFileCode, LuMaximize2, LuMinimize2, LuSettings2 } from "react-icons/lu";
import { generateHtmlReport } from '../utils/generateHtmlReport';
import { parseNotebookContent, serializeNotebookContent } from '../utils/notebookParser';

const SqlNotebook = ({ content, onChange, onRunQuery, filePath = null }) => {
    const [cells, setCells] = useState([]);
    const [results, setResults] = useState({});
    
    // Global environment variables (e.g. from input blocks)
    const [environment, setEnvironment] = useState({});

    // Cell-level persisted state (chartConfig, viewMode, resultHeight)
    const [cellStates, setCellStates] = useState({});

    // View modes
    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'report'
    const [hideCodeInReport, setHideCodeInReport] = useState(false);
    const [isFullView, setIsFullView] = useState(false);

    // State persistence refs
    const saveStateTimer = useRef(null);
    const stateLoaded = useRef(false);

    // 1. Initial Parse (using structured JSON / Parser)
    useEffect(() => {
        const parsedCells = parseNotebookContent(content);
        setCells(parsedCells);
        // Extract environment variables if it's the new format
        try {
            const parsed = JSON.parse(content);
            if (parsed && parsed.environment) {
                setEnvironment(parsed.environment);
            }
        } catch(e) { } // Ignore if not JSON
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // 2. Load Visual State from Sidecar File
    useEffect(() => {
        if (!filePath || stateLoaded.current) return;
        stateLoaded.current = true;

        const loadState = async () => {
            try {
                const res = await fetch(`http://localhost:3001/api/notebook-state?path=${encodeURIComponent(filePath)}`);
                const state = await res.json();
                if (!state || !state.cells) return;

                setCellStates(state.cells);

                const restoredResults = {};
                Object.entries(state.cells).forEach(([idx, cellState]) => {
                    if (cellState.result) {
                        restoredResults[idx] = cellState.result;
                    }
                });

                setTimeout(() => {
                    setCells(currentCells => {
                        const mappedResults = {};
                        currentCells.forEach((cell, idx) => {
                            const idxStr = String(idx);
                            if (restoredResults[idxStr]) {
                                mappedResults[cell.id] = restoredResults[idxStr];
                            }
                        });
                        if (Object.keys(mappedResults).length > 0) {
                            setResults(mappedResults);
                        }
                        return currentCells;
                    });
                }, 100);

            } catch (err) {
                console.warn('Failed to load notebook state:', err);
            }
        };

        loadState();
    }, [filePath]);

    // 3. Save Visual State to Sidecar File (debounced)
    const persistState = useCallback((updatedCellStates, updatedResults, currentCells) => {
        if (!filePath) return;

        if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
        saveStateTimer.current = setTimeout(() => {
            const stateObj = { version: 1, cells: {} };

            currentCells.forEach((cell, idx) => {
                const idxStr = String(idx);
                const existingState = updatedCellStates[idxStr] || {};
                const cellResult = updatedResults[cell.id];

                const MAX_CACHED_ROWS = 500;
                const cachedResult = (cellResult && cellResult.data && !cellResult.error && !cellResult.loading)
                    ? {
                        data: cellResult.data.length > MAX_CACHED_ROWS
                            ? cellResult.data.slice(0, MAX_CACHED_ROWS)
                            : cellResult.data,
                        executionTime: cellResult.executionTime,
                        totalRows: cellResult.data.length,
                        truncated: cellResult.data.length > MAX_CACHED_ROWS
                    }
                    : null;

                if (cachedResult || existingState.chartConfig || existingState.viewMode || existingState.resultHeight) {
                    stateObj.cells[idxStr] = {
                        ...existingState,
                        ...(cachedResult ? { result: cachedResult } : {})
                    };
                }
            });

            fetch('http://localhost:3001/api/notebook-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, state: stateObj })
            }).catch(err => console.warn('Failed to save notebook state:', err));
        }, 1000);
    }, [filePath]);

    // 4. Serialize Back to File using new structured format
    const save = (updatedCells, updatedEnvironment = environment) => {
        const fileContent = serializeNotebookContent(updatedCells);
        // We only pass changes to the parent
        onChange(fileContent);
    };

    // Cell Handlers
    const updateCell = (id, newContent, newMetadata = {}) => {
        const updated = cells.map(c => c.id === id ? { ...c, content: newContent, ...newMetadata } : c);
        setCells(updated);
        save(updated);
    };

    const addCell = (type) => {
        const newCell = { id: (Date.now() + Math.random()).toString(), type, content: '' };
        const updated = [...cells, newCell];
        setCells(updated);
        save(updated);
    };

    const deleteCell = (id) => {
        if (confirm('Delete this cell?')) {
            const updated = cells.filter(c => c.id !== id);
            setCells(updated);
            save(updated);
        }
    };

    const moveCell = (id, direction) => {
        const index = cells.findIndex(c => c.id === id);
        if (index < 0) return;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= cells.length) return;

        const updated = [...cells];
        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];

        setCells(updated);

        // Swap visual states
        setCellStates(prev => {
            const next = { ...prev };
            const originState = next[String(index)];
            const targetState = next[String(targetIndex)];
            next[String(index)] = targetState || {};
            next[String(targetIndex)] = originState || {};
            return next;
        });

        save(updated);
    };

    const handlePrint = () => {
        window.print();
    };

    // Evaluate input variables in query (simple string replacement for now)
    const injectEnvironmentVariables = (query, env) => {
        let injectedQuery = query;
        Object.entries(env).forEach(([key, value]) => {
            // Replace {{variable}} with its value
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
            // If it's a string, we might need to wrap in quotes, but for simplicity let's assume raw replacement
            // Or we try to be smart: if value is string, wrap in ''; if number, leave as is.
            const formattedValue = typeof value === 'string' ? `'${value}'` : value;
            injectedQuery = injectedQuery.replace(regex, formattedValue);
        });
        return injectedQuery;
    };

    const handleRun = async (cellId, cellContent, currentEnv = environment) => {
        setResults(prev => ({ ...prev, [cellId]: { loading: true } }));

        const queryToRun = injectEnvironmentVariables(cellContent, currentEnv);
        const result = await onRunQuery(queryToRun);

        setResults(prev => {
            const nextResults = { ...prev, [cellId]: { ...result, executedQuery: queryToRun } };
            persistState(cellStates, nextResults, cells);
            return nextResults;
        });
    };

    const handleEnvironmentChange = (key, value) => {
        const newEnv = { ...environment, [key]: value };
        setEnvironment(newEnv);
        
        // Reactive Execution (DAG): Auto-run dependent cells
        cells.forEach(cell => {
            if (cell.type === 'code' && typeof cell.content === 'string') {
                const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
                if (regex.test(cell.content)) {
                    // Re-run this cell because it depends on the changed variable
                    handleRun(cell.id, cell.content, newEnv);
                }
            }
        });
        
        // Save notebook with updated environment
        try {
            const parsed = JSON.parse(content || '{}');
            parsed.environment = newEnv;
            parsed.cells = cells;
            onChange(JSON.stringify(parsed, null, 2));
        } catch(e) {
            // New format only
            save(cells, newEnv);
        }
    };

    const handleCellStateChange = useCallback((cellIndex, stateUpdate) => {
        setCellStates(prev => {
            const idxStr = String(cellIndex);
            const currentState = prev[idxStr] || {};
            
            // Prevent infinite loop by checking if state actually changed
            let hasChanges = false;
            for (const key in stateUpdate) {
                if (currentState[key] !== stateUpdate[key]) {
                    hasChanges = true;
                    break;
                }
            }
            
            if (!hasChanges) return prev;

            const next = { ...prev, [idxStr]: { ...currentState, ...stateUpdate } };
            persistState(next, results, cells);
            return next;
        });
    }, [persistState, results, cells]);

    useEffect(() => {
        if (!isFullView) return;
        const handleEsc = (e) => {
            if (e.key === 'Escape') setIsFullView(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isFullView]);

    const toolbarContent = (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isFullView ? '16px' : '24px', position: 'sticky', top: 0, zIndex: 10, backgroundColor: isFullView ? '#0d0f11' : 'var(--editor-bg)', paddingBottom: '10px', paddingTop: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', backgroundColor: 'var(--panel-bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <button
                        onClick={() => setViewMode('edit')}
                        style={{
                            padding: '6px 16px',
                            backgroundColor: viewMode === 'edit' ? 'var(--accent-color-user)' : 'transparent',
                            color: viewMode === 'edit' ? 'var(--button-text-color)' : 'var(--text-muted)',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px',
                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease'
                        }}
                    >
                        <LuPenLine size={14} /> Edit
                    </button>
                    <button
                        onClick={() => setViewMode('report')}
                        style={{
                            padding: '6px 16px',
                            backgroundColor: viewMode === 'report' ? 'var(--accent-color-user)' : 'transparent',
                            color: viewMode === 'report' ? 'var(--button-text-color)' : 'var(--text-muted)',
                            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px',
                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s ease'
                        }}
                    >
                        <LuFileText size={14} /> Report
                    </button>
                </div>

                <button
                    onClick={() => setIsFullView(!isFullView)}
                    style={{
                        padding: '6px 14px', backgroundColor: isFullView ? 'var(--accent-color-user)' : 'var(--panel-bg)',
                        color: isFullView ? 'var(--button-text-color)' : 'var(--text-active)',
                        border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
                        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', transition: 'all 0.2s ease'
                    }}
                    title={isFullView ? "Exit Full View (Esc)" : "Full View - Presentation Mode"}
                >
                    {isFullView ? <LuMinimize2 size={14} /> : <LuMaximize2 size={14} />}
                    {isFullView ? 'Exit' : 'Present'}
                </button>
            </div>

            {(viewMode === 'report' || isFullView) && (
                <div className="report-toolbar-actions" style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => setHideCodeInReport(!hideCodeInReport)}
                        style={{
                            padding: '8px 16px', backgroundColor: 'var(--panel-bg)', color: 'var(--text-active)',
                            border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px',
                            opacity: hideCodeInReport ? 1 : 0.7
                        }}
                    >
                        {hideCodeInReport ? <LuEyeOff size={14} /> : <LuEye size={14} />} {hideCodeInReport ? 'Code Hidden' : 'Code Visible'}
                    </button>
                    <button
                        onClick={handlePrint}
                        style={{
                            padding: '8px 16px', backgroundColor: 'var(--panel-bg)', color: 'var(--text-active)',
                            border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
                        }}
                    >
                        <LuPrinter size={14} /> Print
                    </button>
                    <button
                        onClick={() => generateHtmlReport(cells, results, hideCodeInReport)}
                        style={{
                            padding: '8px 16px', backgroundColor: 'var(--panel-bg)', color: 'var(--accent-color-user)',
                            border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
                        }}
                    >
                        <LuFileCode size={14} /> HTML
                    </button>
                </div>
            )}

            {viewMode === 'edit' && !isFullView && (
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => addCell('code')} style={addBtnStyle}><LuPlus size={14} /> SQL</button>
                    <button onClick={() => addCell('markdown')} style={addBtnStyle}><LuPlus size={14} /> Text</button>
                    <button onClick={() => addCell('input')} style={{...addBtnStyle, color: 'var(--accent-color-user)', borderColor: 'var(--accent-color-user)'}}><LuSettings2 size={14} /> Input</button>
                </div>
            )}
        </div>
    );

    const isReportActive = viewMode === 'report' || isFullView;

    const notebookContent = (
        <div className={`notebook-container ${isReportActive ? 'report-mode-container' : ''}`} style={{ padding: '20px', height: '100%', overflowY: 'auto', backgroundColor: isFullView ? '#0d0f11' : 'var(--editor-bg)' }}>

            {toolbarContent}

            <div className="notebook-content-wrapper" style={{
                maxWidth: isReportActive ? '900px' : '1400px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: isReportActive ? '32px' : '24px',
                padding: isReportActive ? '48px 56px' : '0',
                backgroundColor: isReportActive ? 'var(--surface-raised)' : 'transparent',
                borderRadius: isReportActive ? '12px' : '0',
                boxShadow: isReportActive ? 'var(--shadow-md)' : 'none',
                border: isReportActive ? '1px solid var(--border-subtle)' : 'none',
                minHeight: isReportActive ? '297mm' : 'auto'
            }}>
                {cells.map((cell, index) => (
                    <NotebookCell
                        key={cell.id}
                        {...cell}
                        result={results[cell.id]}
                        environment={environment}
                        onUpdate={updateCell}
                        onRun={(id) => handleRun(id, cell.content)}
                        onDelete={deleteCell}
                        onMoveUp={() => moveCell(cell.id, -1)}
                        onMoveDown={() => moveCell(cell.id, 1)}
                        onEnvironmentChange={handleEnvironmentChange}
                        isReportMode={isReportActive}
                        hideCodeInReport={hideCodeInReport}
                        cellIndex={index}
                        onStateChange={handleCellStateChange}
                        initialCellState={cellStates[String(index)] || null}
                    />
                ))}

                {viewMode === 'edit' && !isFullView && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '30px', marginBottom: '80px', justifyContent: 'center' }}>
                        <button onClick={() => addCell('code')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent' }}><LuPlus size={16} /> Add SQL</button>
                        <button onClick={() => addCell('markdown')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent' }}><LuPlus size={16} /> Add Text</button>
                        <button onClick={() => addCell('input')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent', color: 'var(--accent-color-user)', borderColor: 'var(--accent-color-user)' }}><LuSettings2 size={16} /> Add Input</button>
                    </div>
                )}
            </div>
        </div>
    );

    if (isFullView) {
        return (
            <div className="notebook-fullview-overlay" style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                backgroundColor: '#0d0f11',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {notebookContent}
            </div>
        );
    }

    return notebookContent;
};

const addBtnStyle = {
    backgroundColor: 'var(--panel-bg)',
    color: 'var(--text-active)',
    border: '1px solid var(--border-color)',
    padding: '6px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'background-color 0.2s ease, border-color 0.2s ease'
};

export default SqlNotebook;
