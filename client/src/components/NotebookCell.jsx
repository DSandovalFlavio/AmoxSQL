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
        const currentVal = environment && environment[varName] !== undefined ? environment[varName] : localContent;

        return (
            <div className="nb-input-block">
                <div className="nb-input-group nb-input-group--var">
                    <label className="nb-input-label">Variable Name</label>
                    <div className="nb-input-var-wrap">
                        <span className="nb-input-var-bracket nb-input-var-bracket--left">{'{{'}</span>
                        <input
                            type="text"
                            placeholder="my_var"
                            value={varName}
                            onChange={(e) => {
                                const newName = e.target.value;
                                setLocalMetadata({ ...localMetadata, varName: newName });
                                onUpdate(id, localContent, { ...localMetadata, varName: newName });
                            }}
                            className="nb-input-field"
                        />
                        <span className="nb-input-var-bracket nb-input-var-bracket--right">{'}}'}</span>
                    </div>
                </div>
                <div className="nb-input-group nb-input-group--val">
                    <div className="nb-input-val-header">
                        <label className="nb-input-label">Value</label>
                        <select
                            value={inputType}
                            onChange={(e) => {
                                const newType = e.target.value;
                                setLocalMetadata({ ...localMetadata, inputType: newType });
                                onUpdate(id, localContent, { ...localMetadata, inputType: newType });
                            }}
                            className="nb-input-type-select"
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
                        className="nb-input-value"
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

    // Build cell className
    const cellClasses = [
        'nb-cell',
        isReportMode && 'report-mode',
        isDragging && 'dragging',
        isEmptyInReport && 'empty-report',
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cellClasses}
            draggable={!isReportMode}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
        >
            {/* Left accent indicator */}
            {!isReportMode && (
                <div className={`nb-accent nb-accent--${type === 'code' ? 'code' : type === 'input' ? 'input' : 'text'}`} />
            )}

            {/* Block Action Toolbar — visible on hover via CSS */}
            {!isReportMode && (
                <div className="nb-toolbar">
                    <div className="nb-toolbar-left">
                        <span className={`nb-type-badge nb-type-badge--${type === 'code' ? 'code' : type === 'input' ? 'input' : 'text'}`}>
                            {type === 'code' && <><LuCode size={12} /> SQL</>}
                            {type === 'input' && <><LuSettings2 size={12} /> Input</>}
                            {type === 'markdown' && <><LuType size={12} /> Text</>}
                        </span>

                        {type === 'code' && (
                            <button onClick={() => onRun(id)} className="nb-btn--run" title="Run Cell (Ctrl+Enter)">
                                <LuPlay size={12} fill="currentColor" /> Run
                            </button>
                        )}
                        {/* Status Indicator */}
                        {type === 'code' && result && (
                            <span className="nb-status">
                                {result.loading && <><span className="nb-spinner" /> <span className="nb-status--running">Running...</span></>}
                                {!result.loading && result.error && <span className="nb-status--error">● Failed</span>}
                                {!result.loading && !result.error && result.data && <span className="nb-status--success">● Success ({result.executionTime}ms)</span>}
                            </span>
                        )}
                    </div>

                    <div className="nb-toolbar-right">
                        {type === 'code' && onRunAbove && (
                            <button onClick={() => onRunAbove(id)} className="nb-btn" title="Run This & Above" disabled={isRunningBatch}><LuChevronsUp size={14} /></button>
                        )}
                        {type === 'code' && onRunBelow && (
                            <button onClick={() => onRunBelow(id)} className="nb-btn" title="Run This & Below" disabled={isRunningBatch}><LuChevronsDown size={14} /></button>
                        )}
                        {type === 'code' && (onRunAbove || onRunBelow) && <div className="nb-separator" />}
                        <button onClick={() => { onUpdate(id, localContent, localMetadata); onMoveUp(id); }} className="nb-btn" title="Move Up"><LuArrowUp size={14} /></button>
                        <button onClick={() => { onUpdate(id, localContent, localMetadata); onMoveDown(id); }} className="nb-btn" title="Move Down"><LuArrowDown size={14} /></button>
                        <div className="nb-separator" />
                        <button onClick={() => onDelete(id)} className="nb-btn nb-btn--danger" title="Delete"><LuTrash2 size={13} /></button>
                    </div>
                </div>
            )}

            {/* Cell Content */}
            <div className={
                type === 'markdown' && !isEditingMarkdown && !isReportMode ? 'nb-content--md' :
                isReportMode && type === 'markdown' ? 'nb-content--md-report' : 'nb-content'
            }>

                {/* Markdown Block */}
                {type === 'markdown' && (
                    isEditingMarkdown && !isReportMode ? (
                        <textarea
                            value={localContent}
                            onChange={(e) => setLocalContent(e.target.value)}
                            onBlur={handleBlur}
                            autoFocus
                            className="nb-md-edit"
                            placeholder="Type markdown here... (Click outside to preview)"
                        />
                    ) : (
                        <div
                            onDoubleClick={() => !isReportMode && setIsEditingMarkdown(true)}
                            className={`nb-md-preview ${isReportMode ? 'report-mode' : ''}`}
                            title={isReportMode ? "" : "Double click to edit"}
                        >
                            {localContent && localContent.trim() ? (
                                <div className="markdown-body nb-md-body">
                                    <ReactMarkdown>{localContent}</ReactMarkdown>
                                </div>
                            ) : (
                                !isReportMode && <div className="nb-md-empty">Empty Markdown Cell (Double click to edit)</div>
                            )}
                        </div>
                    )
                )}

                {/* Input Block */}
                {type === 'input' && !isReportMode && (
                    <div className="nb-input-wrap">
                        {renderInputBlock()}
                    </div>
                )}
                {type === 'input' && isReportMode && null}

                {/* Code Block */}
                {type === 'code' && (
                    <div className="nb-code-content">
                        {/* Editor Area */}
                        {!(isReportMode && hideCodeInReport) && (
                            <div className="nb-code-editor-wrap">
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
                            <div data-cell-id={id} className={`nb-results ${isReportMode ? 'nb-results--report' : ''}`}>
                                {result.loading && !isReportMode && <div className="nb-loading-bar" />}

                                {result.error && <div className={`nb-error-msg ${isReportMode ? 'report-mode' : ''}`}>Error: {result.error}</div>}

                                {result.data && !result.error && (
                                    <>
                                        {!isPoppedOut && (
                                            <div
                                                className={isReportMode ? 'nb-results-height--report' : 'nb-results-height'}
                                                style={!isReportMode ? { height: `${resultHeight}px` } : undefined}
                                            >
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
                                            <div className="nb-popout-placeholder">
                                                Results are actively displayed in a detached window.
                                                <div className="nb-popout-actions">
                                                    <button onClick={() => setIsPoppedOut(false)} className="nb-popout-btn">
                                                        Bring Back Here
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Resize Handle */}
                                        {!isReportMode && !isPoppedOut && (
                                            <div onMouseDown={handleResizeMouseDown} className="nb-resize-handle" title="Drag to resize results">
                                                <LuGripHorizontal size={14} />
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
        </div>
    );
};

export default NotebookCell;
