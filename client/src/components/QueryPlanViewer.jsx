import React, { useState } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { LuTreePine, LuMap } from 'react-icons/lu';

// ─── Tree View ───────────────────────────────────────────────────────────────

const QueryPlanNode = ({ node, depth = 0, isLast = true }) => {
    const [expanded, setExpanded] = useState(true);

    if (!node) return null;

    const hasChildren = node.children && node.children.length > 0;
    const timing = node.timing ? `${(node.timing * 1000).toFixed(2)}ms` : '';
    const rows = node.cardinality !== undefined ? `${node.cardinality} rows` : '';
    const isHeavy = node.timing > 0.1;

    return (
        <div style={{ marginLeft: depth > 0 ? '20px' : '0', position: 'relative' }}>
            {depth > 0 && (
                <div style={{
                    position: 'absolute', left: '-12px', top: '0',
                    bottom: isLast ? '50%' : '-10px',
                    borderLeft: '1px solid var(--border-color)', width: '1px'
                }} />
            )}
            {depth > 0 && (
                <div style={{
                    position: 'absolute', left: '-12px', top: '50%',
                    width: '10px', borderTop: '1px solid var(--border-color)'
                }} />
            )}

            <div style={{
                marginBottom: '8px',
                backgroundColor: isHeavy ? 'rgba(255, 100, 100, 0.1)' : 'var(--panel-bg)',
                border: `1px solid ${isHeavy ? 'red' : 'var(--border-color)'}`,
                borderRadius: '4px', padding: '8px',
                display: 'inline-block', minWidth: '300px'
            }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', cursor: hasChildren ? 'pointer' : 'default' }}
                    onClick={() => hasChildren && setExpanded(!expanded)}
                >
                    {hasChildren && (
                        <span style={{ marginRight: '5px', fontSize: '10px', color: 'var(--text-muted)' }}>
                            {expanded ? '▼' : '▶'}
                        </span>
                    )}
                    <span style={{ fontWeight: 'bold', color: 'var(--text-active)', marginRight: '10px' }}>{node.name}</span>
                    <div style={{ flex: 1 }} />
                    {timing && <span style={{ fontSize: '11px', color: 'var(--accent-color-user)', marginRight: '10px' }}>{timing}</span>}
                    {rows && <span style={{ fontSize: '11px', color: 'var(--text-color)' }}>{rows}</span>}
                </div>

                {node.extra_info && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
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

// ─── Treemap View ─────────────────────────────────────────────────────────────

const COLORS = ['#00DDDD', '#0088AA', '#006688', '#004466', '#00BBAA', '#009988'];

const CustomTreemapContent = ({ x, y, width, height, name, depth }) => {
    if (width < 20 || height < 20) return null;
    const color = COLORS[depth % COLORS.length];
    return (
        <g>
            <rect
                x={x} y={y} width={width} height={height}
                style={{ fill: color, stroke: 'var(--surface-base)', strokeWidth: 2, fillOpacity: 0.8 }}
            />
            {width > 40 && height > 20 && (
                <text
                    x={x + width / 2} y={y + height / 2}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: Math.min(12, width / 8), fill: '#fff', fontWeight: 600 }}
                >
                    {name?.length > width / 8 ? name.slice(0, Math.floor(width / 8)) + '…' : name}
                </text>
            )}
        </g>
    );
};

function convertToTreemap(node) {
    if (!node) return null;
    const size = Math.max(1, node.estimated_cardinality || node.cardinality || 1);
    const children = (node.children || []).map(convertToTreemap).filter(Boolean);
    return children.length > 0
        ? { name: node.name || node.node_type || 'Node', size, children }
        : { name: node.name || node.node_type || 'Node', size };
}

// ─── Main Component ───────────────────────────────────────────────────────────

const QueryPlanViewer = ({ plan }) => {
    const [viewMode, setViewMode] = useState('tree');

    if (!plan) return <div style={{ color: 'var(--text-muted)', padding: '20px' }}>No plan data available</div>;

    const root = Array.isArray(plan) ? plan[0] : plan;
    const treemapData = [convertToTreemap(root)].filter(Boolean);

    return (
        <div style={{
            padding: '20px', overflow: 'auto', height: '100%',
            backgroundColor: 'var(--editor-bg)', borderRadius: '4px', fontFamily: 'var(--font-sans)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-active)', fontSize: '14px' }}>
                    Query Execution Plan
                </h3>
                <div className="seg">
                    <button
                        onClick={() => setViewMode('tree')}
                        className={`seg-item${viewMode === 'tree' ? ' seg-item--active' : ''}`}
                    >
                        <LuTreePine size={13} /> Tree
                    </button>
                    <button
                        onClick={() => setViewMode('map')}
                        className={`seg-item${viewMode === 'map' ? ' seg-item--active' : ''}`}
                    >
                        <LuMap size={13} /> Map
                    </button>
                </div>
            </div>

            {viewMode === 'tree' && (
                <div style={{ marginTop: '15px' }}>
                    <QueryPlanNode node={root} />
                </div>
            )}

            {viewMode === 'map' && (
                <div style={{ marginTop: '15px' }}>
                    <ResponsiveContainer width="100%" height={400}>
                        <Treemap
                            data={treemapData}
                            dataKey="size"
                            aspectRatio={4 / 3}
                            stroke="var(--border-default)"
                            fill="var(--accent-primary, #00DDDD)"
                            content={<CustomTreemapContent />}
                        >
                            <Tooltip
                                formatter={(value, name) => [value + ' est. rows', name]}
                                contentStyle={{
                                    background: 'var(--surface-overlay)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: '6px',
                                    fontSize: '12px'
                                }}
                            />
                        </Treemap>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

export default QueryPlanViewer;
