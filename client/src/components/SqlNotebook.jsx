import { API_BASE } from '../api.js';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import NotebookCell from './NotebookCell';
import DeleteConfirmModal from './DeleteConfirmModal';
import AlertDialog from './AlertDialog';
import { LuPenLine, LuFileText, LuPrinter, LuPlus, LuEyeOff, LuEye, LuFileCode, LuMaximize2, LuMinimize2, LuSettings2, LuCirclePlay, LuSquare, LuSave, LuBot, LuX } from "react-icons/lu";
import { generateHtmlReport } from '../utils/generateHtmlReport';
import { parseNotebookContent, parseNotebookEnvironment, serializeNotebookContent } from '../utils/notebookParser';
import { openTour, hasSeenTour } from './onboarding/tourRegistry';

const SqlNotebook = ({ content, onChange, onRunQuery, onSave, filePath = null, onToggleAi, showAiSidebar }) => {
    const [cells, setCells] = useState([]);
    const [results, setResults] = useState({});

    // Global environment variables (e.g. from input blocks)
    const [environment, setEnvironment] = useState({});

    // Cell-level persisted state keyed by cell.id (chartConfig, viewMode, resultHeight)
    const [cellStates, setCellStates] = useState({});

    // View modes
    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'report'
    const [hideCodeInReport, setHideCodeInReport] = useState(false);
    const [isFullView, setIsFullView] = useState(false);

    // First-run Notebooks tour (rendered by the global OnboardingHost)
    useEffect(() => {
        if (!hasSeenTour('notebooks')) openTour('notebooks');
    }, []);

    // Delete confirmation modal
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [cellToDelete, setCellToDelete] = useState(null);

    // Drag & drop state
    const [draggedCellId, setDraggedCellId] = useState(null);
    const [dropTargetIndex, setDropTargetIndex] = useState(null);

    // Alert dialog
    const [alertOpen, setAlertOpen] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');

    // Batch execution state
    const [isRunningBatch, setIsRunningBatch] = useState(false);
    const [batchProgress, setBatchProgress] = useState(null); // { current, total }
    const abortBatchRef = useRef(false);

    // Refs for accessing current state in save without stale closures
    const cellStatesRef = useRef({});
    const resultsRef = useRef({});
    const cellsRef = useRef([]);
    const saveStateTimer = useRef(null);

    // Keep refs in sync
    useEffect(() => { cellStatesRef.current = cellStates; }, [cellStates]);
    useEffect(() => { resultsRef.current = results; }, [results]);
    useEffect(() => { cellsRef.current = cells; }, [cells]);

    // 1. Initial Parse — extract cells, environment, and embedded state from v3.0
    useEffect(() => {
        const parsedCells = parseNotebookContent(content);
        const env = parseNotebookEnvironment(content);
        setCells(parsedCells);
        setEnvironment(env);

        // Extract embedded state from v3.0 cells
        const restoredStates = {};
        const restoredResults = {};
        parsedCells.forEach(cell => {
            if (cell.state) {
                const { result, ...visualState } = cell.state;
                if (Object.keys(visualState).length > 0) {
                    restoredStates[cell.id] = visualState;
                }
                if (result && result.data) {
                    restoredResults[cell.id] = result;
                }
            }
        });

        if (Object.keys(restoredStates).length > 0) {
            setCellStates(restoredStates);
        }
        if (Object.keys(restoredResults).length > 0) {
            setResults(restoredResults);
        }

        // One-time migration: if a sidecar .state.json exists, load and merge it
        if (filePath) {
            migrateSidecarState(filePath, parsedCells);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // One-time sidecar migration (v2.0 → v3.0)
    const migrateSidecarState = async (path, currentCells) => {
        try {
            const res = await fetch(`${API_BASE}/api/notebook-state?path=${encodeURIComponent(path)}`);
            const state = await res.json();
            if (!state || !state.cells) return;

            // Map index-based sidecar state to id-based
            const migratedStates = {};
            const migratedResults = {};
            currentCells.forEach((cell, idx) => {
                const idxStr = String(idx);
                const sidecarState = state.cells[idxStr];
                if (!sidecarState) return;

                const { result, ...visualState } = sidecarState;
                if (Object.keys(visualState).length > 0) {
                    migratedStates[cell.id] = visualState;
                }
                if (result && result.data) {
                    migratedResults[cell.id] = result;
                }
            });

            if (Object.keys(migratedStates).length > 0) {
                setCellStates(prev => {
                    // Only merge if current state is empty (v3.0 state takes priority)
                    if (Object.keys(prev).length > 0) return prev;
                    return migratedStates;
                });
            }
            if (Object.keys(migratedResults).length > 0) {
                setResults(prev => {
                    if (Object.keys(prev).length > 0) return prev;
                    return migratedResults;
                });
            }
        } catch (err) {
            // Sidecar doesn't exist or can't be read — that's fine
        }
    };

    // 2. Serialize and save to file — merges cell state into cells before writing
    const save = useCallback((updatedCells, updatedEnvironment = undefined) => {
        const env = updatedEnvironment !== undefined ? updatedEnvironment : environment;
        const cellsWithState = updatedCells.map(cell => {
            const stateData = cellStatesRef.current[cell.id] || {};
            const resultData = resultsRef.current[cell.id];
            const hasResult = resultData && resultData.data && !resultData.loading && !resultData.error;

            const state = {
                ...stateData,
                ...(hasResult ? { result: resultData } : {})
            };

            if (Object.keys(state).length === 0) return cell;
            // Strip any existing state from cell before merging fresh
            const { state: _existingState, ...cellWithoutState } = cell;
            return { ...cellWithoutState, state };
        });

        const fileContent = serializeNotebookContent(cellsWithState, env);
        onChange(fileContent);
    }, [onChange, environment]);

    // Debounced save for state-only changes (chart config, view mode, result height)
    const saveStateOnly = useCallback(() => {
        if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
        saveStateTimer.current = setTimeout(() => {
            save(cellsRef.current);
        }, 1000);
    }, [save]);

    // Debounced save for content edits (typing in editor or renaming cells)
    const contentSaveTimer = useRef(null);
    const saveDebouncedContent = useCallback((updatedCells) => {
        if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
        contentSaveTimer.current = setTimeout(() => {
            save(updatedCells);
        }, 500);
    }, [save]);

    // Cell Handlers
    const updateCell = (id, newContent, newMetadata = {}) => {
        const updated = cells.map(c => c.id === id ? { ...c, content: newContent, ...newMetadata } : c);
        setCells(updated);
        saveDebouncedContent(updated);
    };

    const addCell = (type) => {
        const newCell = { id: (Date.now() + Math.random()).toString(), type, content: '' };
        const updated = [...cells, newCell];
        setCells(updated);
        save(updated);
    };

    const deleteCell = (id) => {
        setCellToDelete(id);
        setDeleteModalOpen(true);
    };

    const confirmDeleteCell = async () => {
        if (!cellToDelete) return;
        const updated = cells.filter(c => c.id !== cellToDelete);
        setCells(updated);
        // Clean up state for deleted cell
        setCellStates(prev => {
            const next = { ...prev };
            delete next[cellToDelete];
            return next;
        });
        setResults(prev => {
            const next = { ...prev };
            delete next[cellToDelete];
            return next;
        });
        save(updated);
        setCellToDelete(null);
    };

    const moveCell = (id, direction) => {
        const index = cells.findIndex(c => c.id === id);
        if (index < 0) return;
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= cells.length) return;

        const updated = [...cells];
        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
        setCells(updated);
        save(updated);
    };

    // Drag & Drop handlers
    const handleCellDragStart = useCallback((cellId) => {
        setDraggedCellId(cellId);
    }, []);

    const handleCellDragEnd = useCallback(() => {
        setDraggedCellId(null);
        setDropTargetIndex(null);
    }, []);

    const handleCellDragOver = useCallback((targetIndex) => {
        setDropTargetIndex(targetIndex);
    }, []);

    const handleCellDrop = useCallback(() => {
        if (draggedCellId == null || dropTargetIndex == null) return;

        const fromIndex = cells.findIndex(c => c.id === draggedCellId);
        if (fromIndex < 0) return;

        // Calculate the effective insertion index
        let toIndex = dropTargetIndex;
        if (toIndex > fromIndex) toIndex -= 1; // Adjust because removing shifts indices

        if (fromIndex === toIndex) {
            setDraggedCellId(null);
            setDropTargetIndex(null);
            return;
        }

        const updated = [...cells];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);

        setCells(updated);
        save(updated);
        setDraggedCellId(null);
        setDropTargetIndex(null);
    }, [draggedCellId, dropTargetIndex, cells, save]);

    // Evaluate input variables in query (simple string replacement for now)
    const injectEnvironmentVariables = useCallback((query, env) => {
        let injectedQuery = query;
        Object.entries(env).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
            const formattedValue = typeof value === 'string' ? `'${value}'` : value;
            injectedQuery = injectedQuery.replace(regex, formattedValue);
        });
        return injectedQuery;
    }, []);

    const handleRun = useCallback(async (cellId, cellContent = null, currentEnv = environment) => {
        // Use ref for latest cells to avoid stale closure issues
        const currentCells = cellsRef.current;

        // If no content passed, read from the latest cells ref
        const resolvedContent = cellContent || currentCells.find(c => c.id === cellId)?.content || '';

        setResults(prev => ({ ...prev, [cellId]: { loading: true } }));

        let queryToRun = injectEnvironmentVariables(resolvedContent, currentEnv);

        // Execute the query
        const result = await onRunQuery(queryToRun);

        setResults(prev => {
            const nextResults = { ...prev, [cellId]: { ...result, executedQuery: queryToRun } };
            return nextResults;
        });

        // Debounced save to persist the new result
        saveStateOnly();
    }, [environment, injectEnvironmentVariables, onRunQuery, saveStateOnly]);

    // Batch execution engine
    const runCellsSequentially = useCallback(async (cellIds) => {
        const codeCells = cellIds.filter(cid => {
            const cell = cells.find(c => c.id === cid);
            return cell && cell.type === 'code' && cell.content?.trim();
        });

        if (codeCells.length === 0) return;

        setIsRunningBatch(true);
        abortBatchRef.current = false;

        for (let i = 0; i < codeCells.length; i++) {
            if (abortBatchRef.current) break;

            setBatchProgress({ current: i + 1, total: codeCells.length });
            const cell = cells.find(c => c.id === codeCells[i]);
            if (!cell) continue;

            await handleRun(cell.id);

            // Check for errors — stop on error
            const result = resultsRef.current[cell.id];
            if (result?.error) break;
        }

        setIsRunningBatch(false);
        setBatchProgress(null);
        abortBatchRef.current = false;
    }, [cells, handleRun]);

    const runAll = useCallback(() => {
        runCellsSequentially(cells.map(c => c.id));
    }, [cells, runCellsSequentially]);

    const runAbove = useCallback((cellId) => {
        const index = cells.findIndex(c => c.id === cellId);
        if (index < 0) return;
        runCellsSequentially(cells.slice(0, index + 1).map(c => c.id));
    }, [cells, runCellsSequentially]);

    const runBelow = useCallback((cellId) => {
        const index = cells.findIndex(c => c.id === cellId);
        if (index < 0) return;
        runCellsSequentially(cells.slice(index).map(c => c.id));
    }, [cells, runCellsSequentially]);

    const stopBatch = useCallback(() => {
        abortBatchRef.current = true;
    }, []);

    const handlePrint = () => {
        window.print();
    };

    const handleEnvironmentChange = (key, value) => {
        const newEnv = { ...environment, [key]: value };
        setEnvironment(newEnv);

        // Reactive Execution (DAG): Auto-run dependent cells
        cells.forEach(cell => {
            if (cell.type === 'code' && typeof cell.content === 'string') {
                const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
                if (regex.test(cell.content)) {
                    handleRun(cell.id, null, newEnv);
                }
            }
        });

        save(cells, newEnv);
    };

    const handleCellStateChange = useCallback((cellId, stateUpdate) => {
        setCellStates(prev => {
            const currentState = prev[cellId] || {};

            // Prevent infinite loop by checking if state actually changed
            let hasChanges = false;
            for (const key in stateUpdate) {
                if (currentState[key] !== stateUpdate[key]) {
                    hasChanges = true;
                    break;
                }
            }

            if (!hasChanges) return prev;

            const next = { ...prev, [cellId]: { ...currentState, ...stateUpdate } };
            return next;
        });
        saveStateOnly();
    }, [saveStateOnly]);

    useEffect(() => {
        if (!isFullView) return;
        const handleEsc = (e) => {
            if (e.key === 'Escape') setIsFullView(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isFullView]);

    const toolbarContent = (
        <div className="snb-toolbar">
            {/* Left: Mode switcher + primary actions */}
            <div className="snb-toolbar-left">
                {/* Mode switcher pill */}
                <div className="snb-mode-switcher">
                    <button
                        onClick={() => setViewMode('edit')}
                        className={`snb-mode-btn ${viewMode === 'edit' ? 'snb-mode-btn--active' : ''}`}
                    >
                        <LuPenLine size={13} /> Edit
                    </button>
                    <button
                        onClick={() => setViewMode('report')}
                        className={`snb-mode-btn ${viewMode === 'report' ? 'snb-mode-btn--active' : ''}`}
                    >
                        <LuFileText size={13} /> Report
                    </button>
                </div>

                {/* Separator */}
                <div className="snb-separator" />

                {/* Run All / Stop */}
                {!isRunningBatch ? (
                    <button onClick={runAll} className="snb-btn snb-btn--run" title="Run All Cells (Ctrl+Shift+Enter)">
                        <LuCirclePlay size={14} /> Run All
                    </button>
                ) : (
                    <button onClick={stopBatch} className="snb-btn snb-btn--stop" title="Stop Execution">
                        <LuSquare size={12} fill="currentColor" /> Stop {batchProgress ? `(${batchProgress.current}/${batchProgress.total})` : ''}
                    </button>
                )}

                {/* Save */}
                {onSave && (
                    <button onClick={onSave} className="snb-btn snb-btn--ghost" title="Save (Ctrl+S)">
                        <LuSave size={13} /> Save
                    </button>
                )}

                {/* AI Assistant */}
                {onToggleAi && (
                    <>
                        <div className="snb-separator" />
                        <button
                            onClick={onToggleAi}
                            className={`snb-btn ${showAiSidebar ? 'snb-btn--active' : 'snb-btn--accent-outline'}`}
                            title={showAiSidebar ? 'Close Assist' : 'Open Assist'}
                        >
                            {showAiSidebar ? <LuX size={13} /> : <LuBot size={13} />}
                            {showAiSidebar ? 'Close Assist' : 'Assist'}
                        </button>
                    </>
                )}
            </div>

            {/* Right: Context-dependent actions */}
            <div className="snb-toolbar-right">
                {/* Report/Present mode: toggle code + export actions */}
                {(viewMode === 'report' || isFullView) && (
                    <>
                        <button
                            onClick={() => setHideCodeInReport(!hideCodeInReport)}
                            className={`snb-btn snb-btn--ghost ${hideCodeInReport ? 'snb-btn--toggled' : ''}`}
                        >
                            {hideCodeInReport ? <LuEyeOff size={13} /> : <LuEye size={13} />}
                            {hideCodeInReport ? 'Code Hidden' : 'Show Code'}
                        </button>
                        <button onClick={handlePrint} className="snb-btn snb-btn--ghost" title="Print">
                            <LuPrinter size={13} /> Print
                        </button>
                        <button
                            onClick={() => generateHtmlReport(cells, results, hideCodeInReport)}
                            className="snb-btn snb-btn--accent"
                            title="Export as HTML Report"
                        >
                            <LuFileCode size={13} /> Export HTML
                        </button>
                    </>
                )}

                {/* Present toggle (always visible) */}
                <button
                    onClick={() => setIsFullView(!isFullView)}
                    className={`snb-btn ${isFullView ? 'snb-btn--active' : 'snb-btn--ghost'}`}
                    title={isFullView ? "Exit Full View (Esc)" : "Presentation Mode"}
                >
                    {isFullView ? <LuMinimize2 size={13} /> : <LuMaximize2 size={13} />}
                    {isFullView ? 'Exit' : 'Present'}
                </button>

                {/* Edit mode: add cell buttons */}
                {viewMode === 'edit' && !isFullView && (
                    <>
                        <div className="snb-separator" />
                        <button onClick={() => addCell('code')} className="snb-btn snb-btn--ghost"><LuPlus size={13} /> SQL</button>
                        <button onClick={() => addCell('markdown')} className="snb-btn snb-btn--ghost"><LuPlus size={13} /> Text</button>
                        <button onClick={() => addCell('input')} className="snb-btn snb-btn--accent-outline"><LuSettings2 size={13} /> Input</button>
                    </>
                )}
            </div>
        </div>
    );

    const isReportActive = viewMode === 'report' || isFullView;

    const notebookContent = (
        <div className={`notebook-container ${isReportActive ? 'report-mode-container' : ''}`} style={{ padding: '20px', height: '100%', overflowY: 'auto', backgroundColor: isFullView ? 'var(--surface-base)' : 'var(--surface-inset)' }}>

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
                    <React.Fragment key={cell.id}>
                        {/* Drop indicator before cell */}
                        {draggedCellId && dropTargetIndex === index && draggedCellId !== cell.id && (
                            <div style={{ height: '3px', background: 'var(--accent-color-user)', borderRadius: '2px', margin: '4px 0', transition: 'opacity 0.15s ease', boxShadow: '0 0 8px var(--accent-color-user)' }} />
                        )}
                        <NotebookCell
                            {...cell}
                            result={results[cell.id]}
                            environment={environment}
                            onUpdate={updateCell}
                            onRun={(id) => handleRun(id)}
                            onDelete={deleteCell}
                            onMoveUp={() => moveCell(cell.id, -1)}
                            onMoveDown={() => moveCell(cell.id, 1)}
                            onEnvironmentChange={handleEnvironmentChange}
                            isReportMode={isReportActive}
                            hideCodeInReport={hideCodeInReport}
                            cellIndex={index}
                            onStateChange={handleCellStateChange}
                            initialCellState={cellStates[cell.id] || null}
                            onDragStart={handleCellDragStart}
                            onDragEnd={handleCellDragEnd}
                            onDragOver={handleCellDragOver}
                            onDrop={handleCellDrop}
                            isDragging={draggedCellId === cell.id}
                            onRunAbove={runAbove}
                            onRunBelow={runBelow}
                            isRunningBatch={isRunningBatch}
                        />
                    </React.Fragment>
                ))}
                {/* Drop indicator at the end */}
                {draggedCellId && dropTargetIndex === cells.length && (
                    <div style={{ height: '3px', background: 'var(--accent-color-user)', borderRadius: '2px', margin: '4px 0', boxShadow: '0 0 8px var(--accent-color-user)' }} />
                )}

                {viewMode === 'edit' && !isFullView && (
                    <div className="snb-bottom-add">
                        <button onClick={() => addCell('code')} className="snb-btn snb-btn--ghost snb-btn--lg"><LuPlus size={15} /> Add SQL</button>
                        <button onClick={() => addCell('markdown')} className="snb-btn snb-btn--ghost snb-btn--lg"><LuPlus size={15} /> Add Text</button>
                        <button onClick={() => addCell('input')} className="snb-btn snb-btn--accent-outline snb-btn--lg"><LuSettings2 size={15} /> Add Input</button>
                    </div>
                )}
            </div>
        </div>
    );

    const getCellDeleteLabel = () => {
        if (!cellToDelete) return '';
        const cell = cells.find(c => c.id === cellToDelete);
        if (!cell) return '';
        if (cell.type === 'code') {
            const firstLine = (cell.content || '').split('\n')[0] || 'Empty SQL cell';
            return firstLine.length > 50 ? firstLine.slice(0, 50) + '...' : firstLine;
        }
        if (cell.type === 'input') return `Input: {{${cell.metadata?.varName || 'unnamed'}}}`;
        const snippet = (cell.content || '').split('\n')[0] || 'Empty text cell';
        return snippet.length > 50 ? snippet.slice(0, 50) + '...' : snippet;
    };

    const deleteModal = (
        <DeleteConfirmModal
            isOpen={deleteModalOpen}
            onClose={() => { setDeleteModalOpen(false); setCellToDelete(null); }}
            onConfirm={confirmDeleteCell}
            itemName={getCellDeleteLabel()}
            itemType="Cell"
        />
    );

    const alertModal = (
        <AlertDialog
            isOpen={alertOpen}
            onClose={() => setAlertOpen(false)}
            title="Dependency Error"
            message={alertMessage}
            type="error"
        />
    );

    if (isFullView) {
        return ReactDOM.createPortal(
            <div className="notebook-fullview-overlay" style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                backgroundColor: 'var(--surface-base)',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {notebookContent}
                {deleteModal}
                {alertModal}
            </div>,
            document.body
        );
    }

    return <>{notebookContent}{deleteModal}{alertModal}</>;
};


export default SqlNotebook;
