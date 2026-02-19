import React, { useState, useEffect } from 'react';
import NotebookCell from './NotebookCell';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
        [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
        setCells(updated);
        save(updated);
    };

    const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'report'

    // HTML Export (Print)
    const handleExportHtml = () => {
        window.print();
    };

    // Long PDF Export
    const handleExportLongPdf = async () => {
        const element = document.querySelector('.notebook-container');
        if (!element) return;

        // Visual feedback could be added here (e.g., toast)

        try {
            const canvas = await html2canvas(element, {
                scale: 2, // Retire retina quality
                useCORS: true,
                backgroundColor: '#1E1F22', // Dark background
                logging: false,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight
            });

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            // Create PDF with exact dimensions of the content (px)
            const pdf = new jsPDF({
                orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
                unit: 'px',
                format: [imgWidth, imgHeight]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(`notebook_report_${Date.now()}.pdf`);
        } catch (err) {
            console.error("PDF Export failed:", err);
            alert("Failed to export PDF.");
        }
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                {/* Mode Toggle */}
                <div style={{ display: 'flex', backgroundColor: 'var(--panel-bg)', padding: '4px', borderRadius: '6px' }}>
                    <button
                        onClick={() => setViewMode('edit')}
                        style={{
                            padding: '6px 16px',
                            backgroundColor: viewMode === 'edit' ? 'var(--accent-color-user)' : 'transparent',
                            color: viewMode === 'edit' ? '#fff' : 'var(--text-muted)',
                            border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
                        }}
                    >
                        ✏️ Edit
                    </button>
                    <button
                        onClick={() => setViewMode('report')}
                        style={{
                            padding: '6px 16px',
                            backgroundColor: viewMode === 'report' ? 'var(--accent-color-user)' : 'transparent',
                            color: viewMode === 'report' ? '#fff' : 'var(--text-muted)',
                            border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
                        }}
                    >
                        📄 Report
                    </button>
                </div>

                {viewMode === 'report' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={handleExportHtml}
                            style={{
                                padding: '8px 16px', backgroundColor: '#2F425F', color: '#fff',
                                border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                            }}
                        >
                            🖨 Print
                        </button>
                        <button
                            onClick={handleExportLongPdf}
                            style={{
                                padding: '8px 16px', backgroundColor: 'var(--accent-color-user)', color: '#1e1f22',
                                border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                            }}
                        >
                            📑 Export Long PDF
                        </button>
                    </div>
                )}

                {/* Add Buttons (Hidden in Report Mode) */}
                {viewMode === 'edit' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => addCell('code')} style={addBtnStyle}>+ Code Cell</button>
                        <button onClick={() => addCell('markdown')} style={addBtnStyle}>+ Text Cell</button>
                    </div>
                )}
            </div>

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
                    isReportMode={viewMode === 'report'} // Pass prop
                />
            ))}

            {viewMode === 'edit' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', marginBottom: '50px', justifyContent: 'center', opacity: 0.5 }}>
                    <button onClick={() => addCell('code')} style={addBtnStyle}>+ Code</button>
                    <button onClick={() => addCell('markdown')} style={addBtnStyle}>+ Text</button>
                </div>
            )}
        </div>
    );
};

const addBtnStyle = {
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-active)',
    border: '1px solid var(--border-color)',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
};

export default SqlNotebook;
