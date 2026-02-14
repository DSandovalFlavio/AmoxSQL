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
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#1e1f22',
                width: '95%',
                height: '95%',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                border: '1px solid #333',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '10px 15px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: '#141517',
                    height: '40px',
                    flexShrink: 0
                }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '14px' }}>Query Execution Plan</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#aaa',
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
                        borderRight: '1px solid #333',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: '#1e1f22'
                    }}>
                        <div style={{
                            padding: '8px',
                            borderBottom: '1px solid #2a2b2e',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: '#888',
                            backgroundColor: '#252629'
                        }}>
                            SQL Query
                        </div>
                        <div style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '10px',
                            backgroundColor: '#1e1f22'
                        }}>
                            <pre style={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                                fontSize: '12px',
                                color: '#dcdcdc',
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
                            backgroundColor: isDragging ? '#444' : '#2a2b2e',
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
                            backgroundColor: '#333',
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
                        backgroundColor: '#141517'
                    }}>
                        <div style={{
                            padding: '8px',
                            borderBottom: '1px solid #333',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            color: '#888',
                            backgroundColor: '#1a1b1e'
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
