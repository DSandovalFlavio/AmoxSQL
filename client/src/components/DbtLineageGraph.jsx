import { useState, useEffect, useRef, useCallback } from 'react';
import { LuRefreshCw, LuLoader, LuCircleAlert, LuZoomIn, LuZoomOut, LuMaximize2 } from 'react-icons/lu';

const API = 'http://localhost:3001/api';

const NODE_W = 180;
const NODE_H = 56;
const GAP_X = 80;
const GAP_Y = 28;

const TYPE_COLORS = {
    source: { bg: '#1a3a2a', border: '#22c55e', text: '#4ade80' },
    seed: { bg: '#2a2a1a', border: '#eab308', text: '#facc15' },
    model: { bg: '#1a2a3a', border: '#3b82f6', text: '#60a5fa' },
    snapshot: { bg: '#2a1a3a', border: '#a855f7', text: '#c084fc' },
    test: { bg: '#3a2a1a', border: '#f97316', text: '#fb923c' },
    exposure: { bg: '#3a1a2a', border: '#ec4899', text: '#f472b6' },
    analysis: { bg: '#1a2a2a', border: '#14b8a6', text: '#2dd4bf' },
};

// Simple topological layering (Sugiyama-like)
function computeLayout(nodes, edges) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const childrenOf = new Map();
    const parentsOf = new Map();

    for (const e of edges) {
        if (!childrenOf.has(e.from)) childrenOf.set(e.from, []);
        childrenOf.get(e.from).push(e.to);
        if (!parentsOf.has(e.to)) parentsOf.set(e.to, []);
        parentsOf.get(e.to).push(e.from);
    }

    // Assign layers via BFS from roots
    const layers = new Map();
    const roots = nodes.filter(n => !parentsOf.has(n.id) || parentsOf.get(n.id).length === 0);

    // If no roots found, just put everything in layer 0
    if (roots.length === 0) {
        nodes.forEach(n => layers.set(n.id, 0));
    } else {
        const queue = roots.map(r => ({ id: r.id, layer: 0 }));
        const visited = new Set();
        while (queue.length > 0) {
            const { id, layer } = queue.shift();
            if (visited.has(id)) {
                layers.set(id, Math.max(layers.get(id) || 0, layer));
                continue; // don't re-process children
            }
            visited.add(id);
            layers.set(id, Math.max(layers.get(id) || 0, layer));
            for (const child of (childrenOf.get(id) || [])) {
                queue.push({ id: child, layer: layer + 1 });
            }
        }
        // Handle orphans
        nodes.forEach(n => { if (!layers.has(n.id)) layers.set(n.id, 0); });
    }

    // Group by layer
    const layerGroups = {};
    for (const [id, layer] of layers.entries()) {
        if (!layerGroups[layer]) layerGroups[layer] = [];
        layerGroups[layer].push(id);
    }

    // Assign x,y positions
    const positions = new Map();
    const sortedLayers = Object.keys(layerGroups).map(Number).sort((a, b) => a - b);
    for (const layer of sortedLayers) {
        const group = layerGroups[layer];
        group.forEach((id, idx) => {
            positions.set(id, {
                x: layer * (NODE_W + GAP_X) + 40,
                y: idx * (NODE_H + GAP_Y) + 40,
            });
        });
    }

    return positions;
}

const DbtLineageGraph = ({ onFileOpen }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const svgRef = useRef(null);

    const fetchManifest = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API}/dbt/manifest`);
            const json = await res.json();
            if (json.exists === false) {
                setError(json.hint || 'No manifest found. Run "dbt compile" first.');
                setData(null);
            } else if (json.error) {
                setError(json.error);
                setData(null);
            } else {
                // Filter out tests for cleaner graph
                const filteredNodes = json.nodes.filter(n => n.resourceType !== 'test');
                const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
                const filteredEdges = json.edges.filter(e => filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to));
                setData({ nodes: filteredNodes, edges: filteredEdges });
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchManifest(); }, [fetchManifest]);

    const handleMouseDown = (e) => {
        if (e.target.closest('.dag-node')) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };
    const handleMouseMove = (e) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    };
    const handleMouseUp = () => setIsPanning(false);

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom(z => Math.max(0.2, Math.min(3, z + delta)));
    };

    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

    if (loading) {
        return (
            <div className="dbt-loading" style={{ padding: '40px', textAlign: 'center' }}>
                <LuLoader size={20} className="dbt-spin" /> Loading lineage...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <LuCircleAlert size={24} style={{ marginBottom: '8px', color: 'var(--warning)' }} />
                <p style={{ fontSize: '12px', marginBottom: '12px' }}>{error}</p>
                <button className="dbt-btn dbt-btn--ghost" onClick={fetchManifest}>
                    <LuRefreshCw size={13} /> Retry
                </button>
            </div>
        );
    }

    if (!data || data.nodes.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <p style={{ fontSize: '12px' }}>No models found in manifest.</p>
                <button className="dbt-btn dbt-btn--ghost" onClick={fetchManifest}>
                    <LuRefreshCw size={13} /> Refresh
                </button>
            </div>
        );
    }

    const positions = computeLayout(data.nodes, data.edges);

    // Compute SVG dimensions
    let maxX = 0, maxY = 0;
    for (const pos of positions.values()) {
        maxX = Math.max(maxX, pos.x + NODE_W + 40);
        maxY = Math.max(maxY, pos.y + NODE_H + 40);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: '6px', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <button className="dbt-icon-btn" onClick={() => setZoom(z => Math.min(3, z + 0.15))} title="Zoom In"><LuZoomIn size={14} /></button>
                <button className="dbt-icon-btn" onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} title="Zoom Out"><LuZoomOut size={14} /></button>
                <button className="dbt-icon-btn" onClick={resetView} title="Reset View"><LuMaximize2 size={14} /></button>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {data.nodes.length} nodes · {data.edges.length} edges · {Math.round(zoom * 100)}%
                </span>
                <button className="dbt-icon-btn" onClick={fetchManifest} title="Refresh"><LuRefreshCw size={13} /></button>
            </div>

            {/* SVG Canvas */}
            <div
                ref={svgRef}
                style={{ flex: 1, overflow: 'hidden', cursor: isPanning ? 'grabbing' : 'grab', position: 'relative' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <svg
                    width="100%"
                    height="100%"
                    style={{ display: 'block' }}
                >
                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                        {/* Edges */}
                        {data.edges.map((edge, i) => {
                            const from = positions.get(edge.from);
                            const to = positions.get(edge.to);
                            if (!from || !to) return null;

                            const x1 = from.x + NODE_W;
                            const y1 = from.y + NODE_H / 2;
                            const x2 = to.x;
                            const y2 = to.y + NODE_H / 2;
                            const midX = (x1 + x2) / 2;

                            const isHighlighted = hoveredNode === edge.from || hoveredNode === edge.to;

                            return (
                                <path
                                    key={i}
                                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                                    fill="none"
                                    stroke={isHighlighted ? 'var(--accent-primary)' : 'var(--border-default)'}
                                    strokeWidth={isHighlighted ? 2 : 1}
                                    strokeOpacity={hoveredNode && !isHighlighted ? 0.15 : 0.6}
                                    markerEnd="url(#arrowhead)"
                                    style={{ transition: 'all 150ms ease' }}
                                />
                            );
                        })}

                        {/* Arrowhead marker */}
                        <defs>
                            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                                <polygon points="0 0, 8 3, 0 6" fill="var(--text-tertiary)" />
                            </marker>
                        </defs>

                        {/* Nodes */}
                        {data.nodes.map(node => {
                            const pos = positions.get(node.id);
                            if (!pos) return null;
                            const colors = TYPE_COLORS[node.resourceType] || TYPE_COLORS.model;
                            const isHovered = hoveredNode === node.id;
                            const dimmed = hoveredNode && !isHovered &&
                                !data.edges.some(e => (e.from === hoveredNode && e.to === node.id) || (e.to === hoveredNode && e.from === node.id));

                            return (
                                <g
                                    key={node.id}
                                    className="dag-node"
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onMouseEnter={() => setHoveredNode(node.id)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    onClick={() => node.path && onFileOpen && onFileOpen(node.path)}
                                    style={{ cursor: node.path ? 'pointer' : 'default', transition: 'opacity 150ms ease' }}
                                    opacity={dimmed ? 0.25 : 1}
                                >
                                    <rect
                                        x={0} y={0} width={NODE_W} height={NODE_H}
                                        rx={8} ry={8}
                                        fill={colors.bg}
                                        stroke={isHovered ? 'var(--accent-primary)' : colors.border}
                                        strokeWidth={isHovered ? 2 : 1}
                                    />
                                    {/* Resource type badge */}
                                    <rect
                                        x={6} y={6} width={48} height={16}
                                        rx={3} fill={colors.border + '30'}
                                    />
                                    <text x={30} y={17} textAnchor="middle"
                                        fill={colors.text} fontSize={8} fontWeight="600" fontFamily="'JetBrains Mono', monospace"
                                    >
                                        {node.resourceType.toUpperCase().slice(0, 6)}
                                    </text>
                                    {/* Materialization badge */}
                                    {node.materialized && (
                                        <>
                                            <rect x={58} y={6} width={38} height={16} rx={3} fill="rgba(255,255,255,0.06)" />
                                            <text x={77} y={17} textAnchor="middle"
                                                fill="var(--text-tertiary)" fontSize={7} fontFamily="'JetBrains Mono', monospace"
                                            >
                                                {node.materialized.slice(0, 5)}
                                            </text>
                                        </>
                                    )}
                                    {/* Name */}
                                    <text x={10} y={42} fill={isHovered ? '#fff' : 'var(--text-primary)'}
                                        fontSize={11} fontWeight="500" fontFamily="'Inter', sans-serif"
                                    >
                                        {node.name.length > 22 ? node.name.slice(0, 20) + '…' : node.name}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {/* Hover tooltip */}
                {hoveredNode && (() => {
                    const node = data.nodes.find(n => n.id === hoveredNode);
                    if (!node) return null;
                    return (
                        <div style={{
                            position: 'absolute', bottom: '12px', left: '12px',
                            background: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                            borderRadius: '8px', padding: '10px 14px', fontSize: '11px',
                            color: 'var(--text-primary)', backdropFilter: 'blur(12px)',
                            boxShadow: 'var(--shadow-lg)', maxWidth: '300px', zIndex: 10,
                            pointerEvents: 'none',
                        }}>
                            <div style={{ fontWeight: '600', marginBottom: '4px' }}>{node.name}</div>
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                                {node.resourceType}{node.materialized ? ` · ${node.materialized}` : ''}
                                {node.schema ? ` · ${node.schema}` : ''}
                            </div>
                            {node.description && (
                                <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '10px' }}>
                                    {node.description.slice(0, 120)}
                                </div>
                            )}
                            {node.path && (
                                <div style={{ marginTop: '4px', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--accent-primary)' }}>
                                    {node.path}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Legend */}
                <div style={{
                    position: 'absolute', top: '8px', right: '8px',
                    display: 'flex', gap: '8px', flexWrap: 'wrap',
                    fontSize: '9px', color: 'var(--text-tertiary)',
                }}>
                    {Object.entries(TYPE_COLORS).map(([type, colors]) => (
                        <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: colors.border }} />
                            {type}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DbtLineageGraph;
