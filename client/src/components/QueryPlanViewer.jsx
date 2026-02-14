import React, { useState } from 'react';

const QueryPlanNode = ({ node, depth = 0, isLast = true }) => {
    const [expanded, setExpanded] = useState(true);

    if (!node) return null;

    const hasChildren = node.children && node.children.length > 0;
    const timing = node.timing ? `${(node.timing * 1000).toFixed(2)}ms` : '';
    const rows = node.cardinality !== undefined ? `${node.cardinality} rows` : '';

    // Color coding based on timing (if available and significant)
    // For now, simple logic. 
    const isHeavy = node.timing > 0.1; // Example threshold

    return (
        <div style={{ marginLeft: depth > 0 ? '20px' : '0', position: 'relative' }}>
            {/* Connection Line */}
            {depth > 0 && (
                <div style={{
                    position: 'absolute',
                    left: '-12px',
                    top: '0',
                    bottom: isLast ? '50%' : '-10px',
                    borderLeft: '1px solid #444',
                    width: '1px'
                }} />
            )}
            {depth > 0 && (
                <div style={{
                    position: 'absolute',
                    left: '-12px',
                    top: '50%',
                    width: '10px',
                    borderTop: '1px solid #444'
                }} />
            )}

            <div style={{
                marginBottom: '8px',
                backgroundColor: isHeavy ? '#2a1a1a' : '#1e1f22',
                border: `1px solid ${isHeavy ? '#632' : '#333'}`,
                borderRadius: '4px',
                padding: '8px',
                display: 'inline-block',
                minWidth: '300px'
            }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', cursor: hasChildren ? 'pointer' : 'default' }}
                    onClick={() => hasChildren && setExpanded(!expanded)}
                >
                    {hasChildren && (
                        <span style={{ marginRight: '5px', fontSize: '10px', color: '#888' }}>
                            {expanded ? '▼' : '▶'}
                        </span>
                    )}
                    <span style={{ fontWeight: 'bold', color: '#ddd', marginRight: '10px' }}>{node.name}</span>

                    <div style={{ flex: 1 }}></div>

                    {timing && <span style={{ fontSize: '11px', color: '#f0a0a0', marginRight: '10px' }}>{timing}</span>}
                    {rows && <span style={{ fontSize: '11px', color: '#a0f0a0' }}>{rows}</span>}
                </div>

                {/* Extra Info */}
                {node.extra_info && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>
                        {typeof node.extra_info === 'string' ? (
                            <div style={{ whiteSpace: 'pre-wrap' }}>{node.extra_info.trim()}</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {Object.entries(node.extra_info).map(([key, val]) => (
                                    <div key={key} style={{ display: 'flex' }}>
                                        <span style={{ color: '#aaa', minWidth: '80px' }}>{key}:</span>
                                        <span style={{ color: '#ccc', wordBreak: 'break-all' }}>
                                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Children */}
            {hasChildren && expanded && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {node.children.map((child, index) => (
                        <QueryPlanNode
                            key={index}
                            node={child}
                            depth={depth + 1}
                            isLast={index === node.children.length - 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const QueryPlanViewer = ({ plan }) => {
    if (!plan) return <div style={{ color: '#666', padding: '20px' }}>No plan data available</div>;

    // DuckDB JSON might wrap the root in an array or object
    const root = Array.isArray(plan) ? plan[0] : plan;

    return (
        <div style={{
            padding: '20px',
            overflow: 'auto',
            height: '100%',
            backgroundColor: '#141517',
            borderRadius: '4px',
            fontFamily: 'Inter, sans-serif'
        }}>
            <h3 style={{ marginTop: 0, color: '#fff', fontSize: '14px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                Query Execution Plan
            </h3>
            <div style={{ marginTop: '15px' }}>
                <QueryPlanNode node={root} />
            </div>
        </div>
    );
};

export default QueryPlanViewer;
