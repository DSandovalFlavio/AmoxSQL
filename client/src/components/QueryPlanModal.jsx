import React, { useState, useRef, useEffect } from 'react';
import QueryPlanViewer from './QueryPlanViewer';

const QueryPlanModal = ({ isOpen, onClose, plan, query }) => {
    const [queryWidth, setQueryWidth] = useState(300); // Initial width for query pane
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef(null);

    // Resizer logic
    const startResizing = (e) => {
        setIsDragging(true);
        e.preventDefault();
    };

    const stopResizing = () => {
        setIsDragging(false);
    };

    const resize = (e) => {
        if (isDragging && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            let newWidth = e.clientX - containerRect.left;

            // Constraints
            if (newWidth < 100) newWidth = 100;
            if (newWidth > containerRect.width - 200) newWidth = containerRect.width - 200;

            setQueryWidth(newWidth);
        }
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isDragging]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)',
                width: '95%',
                height: '95%',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-default)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '10px 15px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--surface-raised)',
                    height: '40px',
                    flexShrink: 0
                }}>
                    <h3 style={{ margin: 0, color: 'var(--text-active)', fontSize: '14px' }}>Query Execution Plan</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Split Container */}
                <div
                    ref={containerRef}
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'row',
                        overflow: 'hidden',
                        position: 'relative'
                    }}
                >
                    {/* Left Pane: Query */}
                    <div style={{
                        width: queryWidth,
                        borderRight: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--panel-bg)'
                    }}>
                        <div style={{
                            padding: '8px',
                            borderBottom: '1px solid var(--border-color)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--header-bg)'
                        }}>
                            SQL Query
                        </div>
                        <div style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '10px',
                            backgroundColor: 'var(--input-bg)'
                        }}>
                            <pre style={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                                fontSize: '12px',
                                color: 'var(--text-color)',
                                lineHeight: '1.5'
                            }}>
                                {query}
                            </pre>
                        </div>
                    </div>

                    {/* Resizer Handle */}
                    <div
                        onMouseDown={startResizing}
                        style={{
                            width: '8px', // Wider hit area
                            cursor: 'col-resize',
                            backgroundColor: isDragging ? 'var(--text-muted)' : 'var(--border-color)',
                            zIndex: 10,
                            flexShrink: 0,
                            transition: 'background-color 0.2s',
                            marginLeft: '-4px', // Center the handle visually if needed, or overlap
                            marginRight: '-4px',
                            position: 'relative'
                        }}
                    >
                        {/* Visual line in center */}
                        <div style={{
                            width: '1px',
                            height: '100%',
                            backgroundColor: 'var(--border-color)',
                            margin: '0 auto'
                        }} />
                    </div>

                    {/* Drag Overlay to capture events even if mouse leaves modal */}
                    {isDragging && (
                        <div
                            style={{
                                position: 'fixed',
                                top: 0, left: 0, right: 0, bottom: 0,
                                zIndex: 9999,
                                cursor: 'col-resize'
                            }}
                            onMouseMove={resize}
                            onMouseUp={stopResizing}
                        />
                    )}

                    {/* Right Pane: Plan Viewer */}
                    <div style={{
                        flex: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--surface-base)'
                    }}>
                        <div style={{
                            padding: '8px',
                            borderBottom: '1px solid var(--border-color)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--header-bg)'
                        }}>
                            Execution Tree
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', padding: '0' }}>
                            <QueryPlanViewer plan={plan} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QueryPlanModal;
