import React, { useState, useEffect } from 'react';
import NotebookCell from './NotebookCell';
import { LuPenLine, LuFileText, LuPrinter, LuPlus, LuEyeOff, LuEye } from "react-icons/lu";

const CELL_MARKER_CODE = '-- !CELL:CODE!';
const CELL_MARKER_MARKDOWN = '-- !CELL:MARKDOWN!';

const SqlNotebook = ({ content, onChange, onRunQuery }) => {
    const [cells, setCells] = useState([]);
    const [results, setResults] = useState({});

    // 1. Initial Parse
    useEffect(() => {
        // If content is empty/new, start with one code cell
        if (!content || !content.trim()) {
            setCells([{ id: Date.now(), type: 'code', content: '' }]);
            return;
        }

        const lines = content.split('\n');
        const parsedCells = [];
        let currentCell = { id: Date.now(), type: 'code', content: [] };

        // Naive parser: Look for markers.
        // If file doesn't start with a marker, assume first block is code or implicit.
        // Let's assume standard format. If no markers found, treat whole file as one code block.

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
                    // We are collecting content before the first marker.
                    // technically valid.
                }

                // For markdown, we want to strip the leading "-- " comment syntax if it exists
                // so it looks clean in the box

                let lineContent = line;
                if (currentCell.type === 'markdown') {
                    if (line.trim().startsWith('-- ')) {
                        lineContent = line.trim().substring(3); // Remove "-- "
                    } else if (line.trim().startsWith('--')) {
                        lineContent = line.trim().substring(2); // Remove "--"
                    }
                }

                currentCell.content.push(lineContent);
            }
        });

        // Push last cell
        currentCell.content = currentCell.content.join('\n');
        parsedCells.push(currentCell);

        setCells(parsedCells);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount (key change triggers remount)

    // 2. Serialize Back to File
    const save = (updatedCells) => {
        const fileContent = updatedCells.map(cell => {
            if (cell.type === 'code') {
                return `${CELL_MARKER_CODE}\n${cell.content}`;
            } else {
                // Comment out markdown lines
                const commentedContent = cell.content.split('\n').map(l => `-- ${l}`).join('\n');
                return `${CELL_MARKER_MARKDOWN}\n${commentedContent}`;
            }
        }).join('\n\n');

        onChange(fileContent);
    };

    // Cell Handlers
    const updateCell = (id, newContent) => {
        const updated = cells.map(c => c.id === id ? { ...c, content: newContent } : c);
        setCells(updated); // Optimistic UI
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

        // Generate new IDs so React fully unmounts & remounts Monaco Editor,
        // avoiding "InstantiationService disposed" crashes during DOM rearrangement.
        const originOldId = updated[index].id;
        const targetOldId = updated[targetIndex].id;
        const originNewId = Date.now() + Math.random();
        const targetNewId = Date.now() + Math.random() + 1;

        updated[index] = { ...updated[index], id: originNewId };
        updated[targetIndex] = { ...updated[targetIndex], id: targetNewId };

        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];

        setCells(updated);

        // Migrate results to new IDs so we don't lose data tables
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

        save(updated);
    };

    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'report'
    const [hideCodeInReport, setHideCodeInReport] = useState(false); // Global toggle for story mode

    // Native Browser Print (PDF Export)
    const handlePrint = () => {
        window.print();
    };

    const handleRun = async (cellId, cellContent) => {
        // Clear previous error/result for this cell?
        // Or keep it?
        setResults(prev => ({ ...prev, [cellId]: { loading: true } }));

        const result = await onRunQuery(cellContent);

        setResults(prev => ({
            ...prev,
            [cellId]: result // { data, executionTime } or { error }
        }));
    };

    return (
        <div className={`notebook-container ${viewMode === 'report' ? 'report-mode-container' : ''}`} style={{ padding: '20px', height: '100%', overflowY: 'auto', backgroundColor: 'var(--editor-bg)' }}>

            {/* In Report mode, we can add a bit of max-width for better reading aesthetics if desired, but we keep fluid for now */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--editor-bg)', paddingBottom: '10px', paddingTop: '10px' }}>
                {/* Mode Toggle */}
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

                {viewMode === 'report' && (
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
                                padding: '8px 16px', backgroundColor: '#eef2ff', color: '#3730a3',
                                border: '1px solid #c7d2fe', borderRadius: '6px', cursor: 'pointer', fontWeight: '600',
                                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px'
                            }}
                        >
                            <LuPrinter size={14} /> Print / Save PDF
                        </button>
                    </div>
                )}

                {/* Add Buttons (Hidden in Report Mode) */}
                {viewMode === 'edit' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => addCell('code')} style={addBtnStyle}><LuPlus size={14} /> Code Cell</button>
                        <button onClick={() => addCell('markdown')} style={addBtnStyle}><LuPlus size={14} /> Text Cell</button>
                    </div>
                )}
            </div>

            <div className="notebook-content-wrapper" style={{
                maxWidth: viewMode === 'report' ? '900px' : '1400px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: viewMode === 'report' ? '32px' : '16px',
                padding: viewMode === 'report' ? '40px' : '0',
                backgroundColor: viewMode === 'report' ? '#ffffff' : 'transparent',
                borderRadius: viewMode === 'report' ? '8px' : '0',
                boxShadow: viewMode === 'report' ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                minHeight: viewMode === 'report' ? '297mm' : 'auto' // A4 approx height as min for visual
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
                        isReportMode={viewMode === 'report'}
                        hideCodeInReport={hideCodeInReport} // Pass new prop
                    />
                ))}

                {viewMode === 'edit' && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '30px', marginBottom: '80px', justifyContent: 'center' }}>
                        <button onClick={() => addCell('code')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent' }}><LuPlus size={16} /> Add Code</button>
                        <button onClick={() => addCell('markdown')} style={{ ...addBtnStyle, padding: '10px 24px', borderStyle: 'solid', backgroundColor: 'transparent' }}><LuPlus size={16} /> Add Text</button>
                    </div>
                )}
            </div>
        </div>
    );
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
