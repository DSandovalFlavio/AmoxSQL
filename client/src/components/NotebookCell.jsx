import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import SqlEditor from './SqlEditor';
import ResultsTable from './ResultsTable';
import DebugResultModal from './DebugResultModal';
import { LuPlay, LuArrowUp, LuArrowDown, LuTrash2, LuGripHorizontal, LuCode, LuType, LuSettings2, LuExternalLink, LuChevronsUp, LuChevronsDown } from "react-icons/lu";

const NotebookCell = ({
    id,
    type,
    content,
    metadata = {},
    result,
    environment,
    onUpdate,
    onRun,
    onDelete,
    onMoveUp,
    onMoveDown,
    onEnvironmentChange,
    isReportMode = false,
    hideCodeInReport = true,
    cellIndex = 0,
    onStateChange = null,
    initialCellState = null,
    // Drag & drop props
    onDragStart = null,
    onDragEnd = null,
    onDragOver = null,
    onDrop = null,
    isDragging = false,
    // Batch execution props
    onRunAbove = null,
    onRunBelow = null,
    isRunningBatch = false,
}) => {
    const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
    const [localContent, setLocalContent] = useState(content);
    const [localMetadata, setLocalMetadata] = useState(metadata || {});
    const [isHovered, setIsHovered] = useState(false);

    // Debug State
    const [debugModalOpen, setDebugModalOpen] = useState(false);
    const [debugCteName, setDebugCteName] = useState(null);
    const [debugResult, setDebugResult] = useState(null);
    const [debugQuery, setDebugQuery] = useState('');

    const [isPoppedOut, setIsPoppedOut] = useState(false);

    // Listen for popout window being closed by the user
    useEffect(() => {
        if (!window.electronAPI?.onPopoutClosed) return;
        const cleanup = window.electronAPI.onPopoutClosed(() => {
            setIsPoppedOut(false);
        });
        return cleanup;
    }, []);

    const handlePopout = () => {
        if (!result?.data) return;
        const payload = {
            data: result.data,
            types: result.types,
            executionTime: result.executionTime,
            query: result.executedQuery || localContent,
            cellTitle: `Cell ${cellIndex + 1}`,
        };
        window.electronAPI?.openPopout(payload);
        setIsPoppedOut(true);
    };

    // Auto-update the pop-out window when results change
    useEffect(() => {
        if (!isPoppedOut || !result?.data) return;
        const payload = {
            data: result.data,
            types: result.types,
            executionTime: result.executionTime,
            query: result.executedQuery || localContent,
            cellTitle: `Cell ${cellIndex + 1}`,
        };
        window.electronAPI?.openPopout(payload);
    }, [isPoppedOut, result]);

    const metadataStr = JSON.stringify(metadata || {});
    useEffect(() => {
        setLocalContent(content);
        setLocalMetadata(metadata || {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content, metadataStr]);

    // Resizable result height
    const [resultHeight, setResultHeight] = useState(initialCellState?.resultHeight || 400);
    const isResizingResult = useRef(false);
    const resizeStartY = useRef(0);
    const resizeStartHeight = useRef(0);

    const handleResizeMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizingResult.current = true;
        resizeStartY.current = e.clientY;
        resizeStartHeight.current = resultHeight;

        const handleMouseMove = (ev) => {
            if (!isResizingResult.current) return;
            const delta = ev.clientY - resizeStartY.current;
            const newHeight = Math.max(150, Math.min(1200, resizeStartHeight.current + delta));
            setResultHeight(newHeight);
        };

        const handleMouseUp = (ev) => {
            if (isResizingResult.current) {
                isResizingResult.current = false;
                const delta = ev.clientY - resizeStartY.current;
                const finalHeight = Math.max(150, Math.min(1200, resizeStartHeight.current + delta));
                setResultHeight(finalHeight);
                if (onStateChange) onStateChange(id, { resultHeight: finalHeight });
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [resultHeight, onStateChange, id]);

    const handleChartConfigChange = useCallback((config) => {
        if (onStateChange) onStateChange(id, { chartConfig: config });
    }, [onStateChange, id]);

    const handleViewModeChange = useCallback((mode) => {
        if (onStateChange) onStateChange(id, { viewMode: mode });
    }, [onStateChange, id]);

    const handleBlur = () => {
        onUpdate(id, localContent, localMetadata);
        if (type === 'markdown') {
            setIsEditingMarkdown(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.ctrlKey && type === 'code') {
            onRun(id);
        }
    };

    const handleDebugCte = async (cteName) => {
        setDebugCteName(cteName);
        setDebugModalOpen(true);
        setDebugResult(null);

        try {
            const cteStartRegex = new RegExp(`\\b${cteName}\\s+AS\\s*\\(`, 'i');
            const match = cteStartRegex.exec(localContent);
            if (!match) throw new Error("Could not find CTE definition.");

            let parenCount = 0;
            let foundStart = false;
            let cutIndex = -1;

            for (let i = match.index; i < localContent.length; i++) {
                if (localContent[i] === '(') {
                    parenCount++;
                    foundStart = true;
                } else if (localContent[i] === ')') {
                    parenCount--;
                    if (foundStart && parenCount === 0) {
                        cutIndex = i + 1;
                        break;
                    }
                }
            }

            if (cutIndex === -1) throw new Error("Could not parse CTE bounds.");

            const partialQuery = localContent.substring(0, cutIndex);
            const debugQ = `${partialQuery} SELECT * FROM ${cteName} LIMIT 100`;

            // Need to inject variables here too for debugging
            let injectedDebugQ = debugQ;
            if (environment) {
                Object.entries(environment).forEach(([key, value]) => {
                    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
                    const formattedValue = typeof value === 'string' ? `'${value}'` : value;
                    injectedDebugQ = injectedDebugQ.replace(regex, formattedValue);
                });
            }

            setDebugQuery(injectedDebugQ);

            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: injectedDebugQ }),
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

    const isEmptyInReport = isReportMode && type === 'code' && hideCodeInReport && !result;

    const renderInputBlock = () => {
        const varName = localMetadata.varName || '';
        const inputType = localMetadata.inputType || 'text';
        // Fallback value is what's in the environment if previously saved, else local content
        const currentVal = environment && environment[varName] !== undefined ? environment[varName] : localContent;

        return (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '16px', backgroundColor: 'var(--editor-bg)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Variable Name</label>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel-bg)', borderRadius: '6px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                        <span style={{ padding: '8px 10px', color: 'var(--text-muted)', backgroundColor: 'var(--header-bg)', borderRight: '1px solid var(--border-color)', fontSize: '14px', fontFamily: 'monospace' }}>{'{{'}</span>
                        <input
                            type="text"
                            placeholder="my_var"
                            value={varName}
                            onChange={(e) => {
                                const newName = e.target.value;
                                setLocalMetadata({ ...localMetadata, varName: newName });
                                onUpdate(id, localContent, { ...localMetadata, varName: newName });
                            }}
                            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-color)', padding: '8px 12px', fontSize: '14px', outline: 'none', fontFamily: 'monospace' }}
                        />
                        <span style={{ padding: '8px 10px', color: 'var(--text-muted)', backgroundColor: 'var(--header-bg)', borderLeft: '1px solid var(--border-color)', fontSize: '14px', fontFamily: 'monospace' }}>{'}}'}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Value</label>
                        <select
                            value={inputType}
                            onChange={(e) => {
                                const newType = e.target.value;
                                setLocalMetadata({ ...localMetadata, inputType: newType });
                                onUpdate(id, localContent, { ...localMetadata, inputType: newType });
                            }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="text">Text / String</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                        </select>
                    </div>
                    <input
                        type={inputType}
                        placeholder="Expected value..."
                        value={currentVal || ''}
                        onChange={(e) => {
                            let val = e.target.value;
                            if (inputType === 'number') val = Number(val);
                            setLocalContent(val);
                            if (varName && onEnvironmentChange) {
                                onEnvironmentChange(varName, val);
                            }
                        }}
                        onBlur={() => onUpdate(id, localContent, localMetadata)}
                        style={{ width: '100%', padding: '8px 12px', background: 'var(--panel-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }}
                    />
                </div>
            </div>
        );
    };

    // Drag & drop handlers
    const handleDragStart = (e) => {
        if (isReportMode || !onDragStart) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        onDragStart(id);
    };

    const handleDragOver = (e) => {
        if (isReportMode || !onDragOver) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // Determine if mouse is in top or bottom half
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const targetIdx = e.clientY < midY ? cellIndex : cellIndex + 1;
        onDragOver(targetIdx);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onDrop) onDrop();
    };

    const handleDragEnd = () => {
        if (onDragEnd) onDragEnd();
    };

    // Card styling mimics modern block editors
    const cardStyle = {
        marginBottom: isReportMode ? '0px' : '16px',
        border: isReportMode ? 'none' : (isHovered ? '1px solid var(--border-active)' : '1px solid var(--border-color)'),
        borderRadius: '8px',
        backgroundColor: isReportMode ? 'transparent' : 'var(--panel-bg)',
        overflow: 'hidden',
        display: isEmptyInReport ? 'none' : 'flex',
        flexDirection: 'column',
        boxShadow: isReportMode ? 'none' : (isHovered ? '0 4px 12px rgba(0,0,0,0.06)' : '0 1px 3px rgba(0,0,0,0.03)'),
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        cursor: isReportMode ? 'default' : undefined
    };

    return (
        <div
            className={`notebook-cell ${isReportMode ? 'report-card' : ''}`}
            style={cardStyle}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            draggable={!isReportMode}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
        >
            {/* Left accent border to indicate block type */}
            {!isReportMode && (
                <div style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0, width: '4px',
                    backgroundColor: type === 'code' ? 'var(--accent-color-user)' : type === 'input' ? '#4ade80' : 'var(--border-color)',
                    opacity: isHovered ? 1 : 0.4,
                    transition: 'opacity 0.2s ease',
                    borderTopLeftRadius: '8px',
                    borderBottomLeftRadius: '8px',
                    zIndex: 2
                }} />
            )}

            {/* Block Action Header - Only visible on hover in edit mode, or always for code to show run button */}
            {!isReportMode && (isHovered || type === 'code') && (
                <div style={{
                    padding: '6px 16px 6px 20px',
                    backgroundColor: 'var(--header-bg)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '11px',
                    color: 'var(--text-muted)'
                }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', color: type === 'code' ? 'var(--accent-color-user)' : type === 'input' ? '#4ade80' : 'var(--text-active)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {type === 'code' && <><LuCode size={12} /> SQL</>}
                            {type === 'input' && <><LuSettings2 size={12} /> Input</>}
                            {type === 'markdown' && <><LuType size={12} /> Text</>}
                        </span>

                        {type === 'code' && (
                            <button
                                onClick={() => onRun(id)}
                                style={{
                                    ...btnStyle,
                                    color: 'var(--accent-color-user)',
                                    opacity: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontWeight: '600',
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    marginLeft: '8px',
                                    transition: 'background-color 0.2s'
                                }}
                                title="Run Cell (Ctrl+Enter)"
                            >
                                <LuPlay size={12} fill="currentColor" /> Run
                            </button>
                        )}
                        {/* Status Indicator */}
                        {type === 'code' && result && (
                            <span style={{ marginLeft: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {result.loading && <><span className="spinner-small" style={{ width: '10px', height: '10px', border: '2px solid var(--border-color)', borderTop: '2px solid var(--accent-color-user)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> <span style={{ color: 'var(--accent-color-user)' }}>Running...</span></>}
                                {!result.loading && result.error && <span style={{ color: '#ff6b6b' }}>● Failed</span>}
                                {!result.loading && !result.error && result.data && <span style={{ color: '#20c997' }}>● Success ({result.executionTime}ms)</span>}
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', opacity: isHovered ? 1 : 0, transition: 'opacity 0.2s' }}>
                        {type === 'code' && onRunAbove && (
                            <button onClick={() => onRunAbove(id)} style={btnStyle} title="Run This & Above" disabled={isRunningBatch}><LuChevronsUp size={14} /></button>
                        )}
                        {type === 'code' && onRunBelow && (
                            <button onClick={() => onRunBelow(id)} style={btnStyle} title="Run This & Below" disabled={isRunningBatch}><LuChevronsDown size={14} /></button>
                        )}
                        {type === 'code' && (onRunAbove || onRunBelow) && (
                            <div style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-color)', margin: '0 2px' }} />
                        )}
                        <button onClick={() => { onUpdate(id, localContent, localMetadata); onMoveUp(id); }} style={btnStyle} title="Move Up"><LuArrowUp size={14} /></button>
                        <button onClick={() => { onUpdate(id, localContent, localMetadata); onMoveDown(id); }} style={btnStyle} title="Move Down"><LuArrowDown size={14} /></button>
                        <div style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-color)', margin: '0 2px' }} />
                        <button onClick={() => onDelete(id)} style={{ ...btnStyle, color: '#ff6b6b' }} title="Delete"><LuTrash2 size={13} /></button>
                    </div>
                </div>
            )}

            {/* Cell Content */}
            <div style={{ padding: type === 'markdown' && !isEditingMarkdown && !isReportMode ? '16px 20px' : (isReportMode && type === 'markdown' ? '8px 0' : '0 0 0 4px') }}>

                {/* Markdown Block */}
                {type === 'markdown' && (
                    isEditingMarkdown && !isReportMode ? (
                        <textarea
                            value={localContent}
                            onChange={(e) => setLocalContent(e.target.value)}
                            onBlur={handleBlur}
                            autoFocus
                            style={{ width: '100%', minHeight: '80px', backgroundColor: 'transparent', color: 'var(--text-color)', border: 'none', padding: '16px', fontFamily: 'monospace', resize: 'vertical', fontSize: '14px', outline: 'none' }}
                            placeholder="Type markdown here... (Click outside to preview)"
                        />
                    ) : (
                        <div
                            onDoubleClick={() => !isReportMode && setIsEditingMarkdown(true)}
                            style={{ minHeight: '24px', cursor: isReportMode ? 'default' : 'text' }}
                            title={isReportMode ? "" : "Double click to edit"}
                        >
                            {localContent && localContent.trim() ? (
                                <div className="markdown-body" style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.7' }}>
                                    <ReactMarkdown>{localContent}</ReactMarkdown>
                                </div>
                            ) : (
                                !isReportMode && <div style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Empty Markdown Cell (Double click to edit)</div>
                            )}
                        </div>
                    )
                )}

                {/* Input Block */}
                {type === 'input' && !isReportMode && (
                    <div style={{ padding: '0px 16px 16px 16px' }}>
                        {renderInputBlock()}
                    </div>
                )}
                {/* Input blocks are completely hidden in report mode for now because they are for parametrization */}
                {type === 'input' && isReportMode && null}

                {/* Code Block */}
                {type === 'code' && (
                    <div className="notebook-code-cell-content" style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Editor Area */}
                        {!(isReportMode && hideCodeInReport) && (
                            <div style={{ height: 'auto', minHeight: '80px' }}>
                                <div style={{ height: `${Math.max(80, Math.min(400, ((localContent?.toString().split('\n').length) || 3) * 20 + 20))}px` }} onKeyDown={handleKeyDown}>
                                    <SqlEditor
                                        value={typeof localContent === 'string' ? localContent : ''}
                                        onChange={(val) => {
                                            setLocalContent(val);
                                            onUpdate(id, val, localMetadata);
                                        }}
                                        onDebugCte={handleDebugCte}
                                    />
                                </div>
                            </div>
                        )}
                        {/* Results Area */}
                        {result && (
                            <div data-cell-id={id} style={{
                                borderTop: !isReportMode ? '1px solid var(--border-color)' : 'none',
                                borderBottom: isReportMode ? '1px solid var(--border-subtle)' : 'none',
                                backgroundColor: isReportMode ? 'transparent' : 'var(--editor-bg)',
                                display: 'flex',
                                flexDirection: 'column',
                                paddingTop: isReportMode ? '16px' : '0',
                                paddingBottom: isReportMode ? '8px' : '0'
                            }}>
                                {result.loading && !isReportMode && <div style={{ height: '2px', width: '100%', background: 'linear-gradient(90deg, transparent, var(--accent-color-user), transparent)', animation: 'slide 1.5s infinite linear' }} />}

                                {result.error && <div style={{ padding: '12px 16px', color: '#ff6b6b', backgroundColor: 'rgba(255, 107, 107, 0.05)', borderLeft: '3px solid #ff6b6b', fontFamily: 'monospace', fontSize: '13px', margin: isReportMode ? '0' : '16px' }}>Error: {result.error}</div>}

                                {result.data && !result.error && (
                                    <>
                                        {!isPoppedOut && (
                                            <div style={
                                                !isReportMode ? { height: `${resultHeight}px`, overflow: 'hidden' } : { height: 'auto', minHeight: '300px' }
                                            }>
                                                <ResultsTable
                                                    data={result.data}
                                                    types={result.types}
                                                    executionTime={result.executionTime}
                                                    query={result.executedQuery || localContent}
                                                    currentEditorQuery={localContent}
                                                    onDbChange={() => { }}
                                                    isReportMode={isReportMode}
                                                    initialChartConfig={initialCellState?.chartConfig || null}
                                                    initialViewMode={initialCellState?.viewMode || null}
                                                    onConfigChange={handleChartConfigChange}
                                                    onViewModeChange={handleViewModeChange}
                                                    onPopout={handlePopout}
                                                />
                                            </div>
                                        )}

                                        {isPoppedOut && (
                                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', backgroundColor: 'var(--panel-bg)', borderRadius: '6px' }}>
                                                Results are actively displayed in a detached window.
                                                <div style={{ marginTop: '12px' }}>
                                                    <button
                                                        onClick={() => setIsPoppedOut(false)}
                                                        style={{ padding: '6px 12px', backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-active)' }}
                                                    >
                                                        Bring Back Here
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Resize Handle */}
                                        {!isReportMode && !isPoppedOut && (
                                            <div
                                                onMouseDown={handleResizeMouseDown}
                                                style={{
                                                    height: '8px',
                                                    cursor: 'row-resize',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    backgroundColor: 'var(--panel-bg)',
                                                    borderTop: '1px solid var(--border-color)',
                                                    transition: 'background-color 0.2s',
                                                }}
                                                onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--border-color)'}
                                                onMouseOut={e => e.currentTarget.style.backgroundColor = 'var(--panel-bg)'}
                                                title="Drag to resize results"
                                            >
                                                <LuGripHorizontal size={14} style={{ color: 'var(--text-muted)' }} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <DebugResultModal
                isOpen={debugModalOpen}
                onClose={() => setDebugModalOpen(false)}
                cteName={debugCteName}
                result={debugResult}
                query={debugQuery}
            />

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes slide {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes spin {
                    100% { transform: rotate(360deg); }
                }
            `}} />
        </div >
    );
};

const btnStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s'
};

export default NotebookCell;
