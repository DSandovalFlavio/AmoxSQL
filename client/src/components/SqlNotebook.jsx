import React, { useState, useEffect, useRef, useCallback } from 'react';
import NotebookCell from './NotebookCell';
import { LuPenLine, LuFileText, LuPrinter, LuPlus, LuEyeOff, LuEye, LuFileCode, LuMaximize2, LuMinimize2 } from "react-icons/lu";
import { generateHtmlReport } from '../utils/generateHtmlReport';

const CELL_MARKER_CODE = '-- !CELL:CODE!';
const CELL_MARKER_MARKDOWN = '-- !CELL:MARKDOWN!';

const SqlNotebook = ({ content, onChange, onRunQuery, filePath = null }) => {
    const [cells, setCells] = useState([]);
    const [results, setResults] = useState({});

    // Cell-level persisted state (chartConfig, viewMode, resultHeight per cell index)
    const [cellStates, setCellStates] = useState({});

    // View modes
    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'report'
    const [hideCodeInReport, setHideCodeInReport] = useState(false);
    const [isFullView, setIsFullView] = useState(false);

    // State persistence refs
    const saveStateTimer = useRef(null);
    const stateLoaded = useRef(false);

    // 1. Initial Parse
    useEffect(() => {
        if (!content || !content.trim()) {
            setCells([{ id: Date.now(), type: 'code', content: '' }]);
            return;
        }

        const lines = content.split('\n');
        const parsedCells = [];
        let currentCell = { id: Date.now(), type: 'code', content: [] };

        if (!content.includes(CELL_MARKER_CODE) && !content.includes(CELL_MARKER_MARKDOWN)) {
            setCells([{ id: Date.now(), type: 'code', content: content }]);
            return;
        }

        let isFirst = true;

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (trimmed === CELL_MARKER_CODE) {
                if (!isFirst) {
                    currentCell.content = currentCell.content.join('\n');
                    parsedCells.push(currentCell);
                }
                currentCell = { id: Date.now() + Math.random(), type: 'code', content: [] };
                isFirst = false;
            } else if (trimmed === CELL_MARKER_MARKDOWN) {
                if (!isFirst) {
                    currentCell.content = currentCell.content.join('\n');
                    parsedCells.push(currentCell);
                }
                currentCell = { id: Date.now() + Math.random(), type: 'markdown', content: [] };
                isFirst = false;
            } else {
                if (isFirst && currentCell.type === 'code' && parsedCells.length === 0) {
                    // collecting content before the first marker
                }

                let lineContent = line;
                if (currentCell.type === 'markdown') {
                    if (line.trim().startsWith('-- ')) {
                        lineContent = line.trim().substring(3);
                    } else if (line.trim().startsWith('--')) {
                        lineContent = line.trim().substring(2);
                    }
                }

                currentCell.content.push(lineContent);
            }
        });

        currentCell.content = currentCell.content.join('\n');
        parsedCells.push(currentCell);

        setCells(parsedCells);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // 2. Load State from Sidecar File
    useEffect(() => {
        if (!filePath || stateLoaded.current) return;
        stateLoaded.current = true;

        const loadState = async () => {
            try {
                const res = await fetch(`http://localhost:3001/api/notebook-state?path=${encodeURIComponent(filePath)}`);
                const state = await res.json();
                if (!state || !state.cells) return;

                // Restore cell states
                setCellStates(state.cells);

                // Restore cached results
                const restoredResults = {};
                Object.entries(state.cells).forEach(([idx, cellState]) => {
                    if (cellState.result) {
                        // We'll map by cell index — need to match with actual cell IDs after parse
                        restoredResults[idx] = cellState.result;
                    }
                });

                // Wait for cells to be parsed, then map index-based results to cell IDs
                // Use a small timeout to ensure cells are set
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

    // 3. Save State to Sidecar File (debounced)
    const persistState = useCallback((updatedCellStates, updatedResults, currentCells) => {
        if (!filePath) return;

        if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
        saveStateTimer.current = setTimeout(() => {
            // Build state object using cell indices
            const stateObj = { version: 1, cells: {} };

            currentCells.forEach((cell, idx) => {
                const idxStr = String(idx);
                const existingState = updatedCellStates[idxStr] || {};
                const cellResult = updatedResults[cell.id];

                // Only cache successful results (not errors or loading states)
                // Cap at 500 rows to keep state file size reasonable
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

    // 4. Serialize Back to File
    const save = (updatedCells) => {
        const fileContent = updatedCells.map(cell => {
            if (cell.type === 'code') {
                return `${CELL_MARKER_CODE}\n${cell.content}`;
            } else {
                const commentedContent = cell.content.split('\n').map(l => `-- ${l}`).join('\n');
                return `${CELL_MARKER_MARKDOWN}\n${commentedContent}`;
            }
        }).join('\n\n');

        onChange(fileContent);
    };

    // Cell Handlers
    const updateCell = (id, newContent) => {
        const updated = cells.map(c => c.id === id ? { ...c, content: newContent } : c);
        setCells(updated);
        save(updated);
    };

    const addCell = (type) => {
        const newCell = { id: Date.now() + Math.random(), type, content: '' };
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

        const originOldId = updated[index].id;
        const targetOldId = updated[targetIndex].id;
        const originNewId = Date.now() + Math.random();
        const targetNewId = Date.now() + Math.random() + 1;

        updated[index] = { ...updated[index], id: originNewId };
        updated[targetIndex] = { ...updated[targetIndex], id: targetNewId };

        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];

        setCells(updated);

        // Migrate results to new IDs
        setResults(prev => {
            const nextResults = { ...prev };
            if (nextResults[originOldId]) {
                nextResults[originNewId] = nextResults[originOldId];
                delete nextResults[originOldId];
            }
            if (nextResults[targetOldId]) {
                nextResults[targetNewId] = nextResults[targetOldId];
                delete nextResults[targetOldId];
            }
            return nextResults;
        });

        // Swap cell states too
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

    // Native Browser Print (PDF Export)
    const handlePrint = () => {
        window.print();
    };

    const handleRun = async (cellId, cellContent) => {
        setResults(prev => ({ ...prev, [cellId]: { loading: true } }));

        const result = await onRunQuery(cellContent);

        setResults(prev => {
            const nextResults = { ...prev, [cellId]: { ...result, executedQuery: cellContent } };
            // Persist state after query execution
            persistState(cellStates, nextResults, cells);
            return nextResults;
        });
    };

    // Handle cell state change from NotebookCell (chartConfig, viewMode, resultHeight)
    const handleCellStateChange = useCallback((cellIndex, stateUpdate) => {
        setCellStates(prev => {
            const idxStr = String(cellIndex);
            const next = { ...prev, [idxStr]: { ...(prev[idxStr] || {}), ...stateUpdate } };
            // Persist after update
            persistState(next, results, cells);
            return next;
        });
    }, [persistState, results, cells]);

    // Full View: Escape key handler
    useEffect(() => {
        if (!isFullView) return;
        const handleEsc = (e) => {
            if (e.key === 'Escape') setIsFullView(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isFullView]);

    // --- RENDER ---

    const toolbarContent = (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isFullView ? '16px' : '24px', position: 'sticky', top: 0, zIndex: 10, backgroundColor: isFullView ? '#0d0f11' : 'var(--editor-bg)', paddingBottom: '10px', paddingTop: '10px' }}>
            {/* Mode Toggle */}
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

                {/* Full View Toggle */}
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
                        title="Toggle SQL Code Visibility"
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
                        <LuPrinter size={14} /> Print / Save PDF
                    </button>
                    <button
                        onClick={() => generateHtmlReport(cells, results, hideCodeInReport)}
                        style={{
                            padding: '8px 16px', backgroundColor: 'var(--panel-bg)', color: 'var(--accent-color-user)',
                            border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
                        }}
                    >
                        <LuFileCode size={14} /> Export HTML
                    </button>
                </div>
            )}

            {/* Add Buttons (Hidden in Report/FullView Mode) */}
            {viewMode === 'edit' && !isFullView && (
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => addCell('code')} style={addBtnStyle}><LuPlus size={14} /> Code Cell</button>
                    <button onClick={() => addCell('markdown')} style={addBtnStyle}><LuPlus size={14} /> Text Cell</button>
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
                gap: isReportActive ? '32px' : '16px',
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
                        onUpdate={updateCell}
                        onRun={(id) => handleRun(id, cell.content)}
                        onDelete={deleteCell}
                        onMoveUp={() => moveCell(cell.id, -1)}
                        onMoveDown={() => moveCell(cell.id, 1)}
                        isReportMode={isReportActive}
                        hideCodeInReport={hideCodeInReport}
                        cellIndex={index}
                        onStateChange={handleCellStateChange}
                        initialCellState={cellStates[String(index)] || null}
                    />
                ))}

                {viewMode === 'edit' && !isFullView && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '30px', marginBottom: '80px', justifyContent: 'center' }}>
                        <button onClick={() => addCell('code')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent' }}><LuPlus size={16} /> Add Code</button>
                        <button onClick={() => addCell('markdown')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent' }}><LuPlus size={16} /> Add Text</button>
                    </div>
                )}
            </div>
        </div>
    );

    // Full View renders as a fixed overlay
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
