import { useState, useEffect, useRef, useCallback } from 'react';
import { LuRefreshCw, LuLoader, LuCircleAlert, LuZoomIn, LuZoomOut, LuMaximize2 } from 'react-icons/lu';
import { API_BASE as _API } from '../api.js';
import useCorrerDbt from './dbt/useCorrerDbt';
import { LuPlay, LuChevronsLeft, LuFileCode, LuTable, LuX, LuCheck, LuTriangleAlert } from 'react-icons/lu';
const API = `${_API}/api`;

const NODE_W = 180;
const NODE_H = 70;   // 5.12 (I3): una línea más, con el resultado
const GAP_X = 80;
const GAP_Y = 28;

const TYPE_COLORS = {
    source:   { bg: 'var(--node-source-bg)',  border: 'var(--node-source-border)',  text: 'var(--node-source-text)' },
    seed:     { bg: 'var(--node-staging-bg)', border: 'var(--node-staging-border)', text: 'var(--node-staging-text)' },
    model:    { bg: 'var(--node-mart-bg)',    border: 'var(--node-mart-border)',    text: 'var(--node-mart-text)' },
    snapshot: { bg: 'var(--node-other-bg)',   border: 'var(--node-other-border)',   text: 'var(--node-other-text)' },
    test:     { bg: 'var(--node-other-bg)',   border: 'var(--node-other-border)',   text: 'var(--node-other-text)' },
    exposure: { bg: 'var(--node-other-bg)',   border: 'var(--node-other-border)',   text: 'var(--node-other-text)' },
    analysis: { bg: 'var(--node-other-bg)',   border: 'var(--node-other-border)',   text: 'var(--node-other-text)' },
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
    // 5.12 (I3): el último resultado de cada nodo, y el nodo elegido.
    const [res, setRes] = useState(null);
    const [elegido, setElegido] = useState(null);
    const [texto, setTexto] = useState('');
    const cargarResultados = useCallback(() => {
        fetch(`${API}/dbt/linaje/resultados`).then(r => (r.ok ? r.json() : null)).then(setRes).catch(() => setRes(null));
    }, []);
    const dbt = useCorrerDbt();
    useEffect(() => {
        cargarResultados();
        const alCambiar = () => { fetchManifestRef.current?.(); cargarResultados(); };
        window.addEventListener('amox_dbt_cambio', alCambiar);
        return () => window.removeEventListener('amox_dbt_cambio', alCambiar);
    }, [cargarResultados]);
    const fetchManifestRef = useRef(null);
    const verFilasDeTest = async (id) => {
        try {
            const r = await fetch(`${API}/dbt/linaje/filas-de-test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: id }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            window.dispatchEvent(new CustomEvent('amox_nueva_consulta', { detail: { sql: `-- Rows that fail ${d.nombre}\n${d.sql}`, ejecutar: true } }));
        } catch (e) { alert(e.message); }
    };

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
    useEffect(() => { fetchManifestRef.current = fetchManifest; }, [fetchManifest]);

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
                <LuCircleAlert size={24} style={{ marginBottom: '8px', color: 'var(--color-warning)' }} />
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
                            const isHovered = hoveredNode === node.id || elegido === node.id;
                            const r = res?.nodos?.[node.id];
                            const tt = res?.tests?.[node.id];
                            const color = !r ? null : ['error', 'fail'].includes(r.estado) ? 'var(--color-error)' : r.estado === 'skipped' ? 'var(--text-tertiary)' : (tt?.fallan ? 'var(--color-error)' : tt?.avisan ? 'var(--color-warning)' : 'var(--color-success)');
                            const lento = res?.lentos?.includes(node.id);
                            const meta = r ? [r.estado === 'skipped' ? 'skipped' : `${r.segundos < 10 ? r.segundos.toFixed(1) : Math.round(r.segundos)} s`, r.filas != null ? `${Number(r.filas).toLocaleString()} rows` : null].filter(Boolean).join(' · ') : 'not run yet';
                            const pruebas = tt ? (tt.fallan ? `${tt.fallan} failing` : tt.avisan ? `${tt.avisan} warning${tt.avisan === 1 ? '' : 's'}` : `${tt.total} test${tt.total === 1 ? '' : 's'}`) : null;
                            const dimmed = hoveredNode && !isHovered &&
                                !data.edges.some(e => (e.from === hoveredNode && e.to === node.id) || (e.to === hoveredNode && e.from === node.id));

                            return (
                                <g
                                    key={node.id}
                                    className="dag-node"
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onMouseEnter={() => setHoveredNode(node.id)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    onClick={() => setElegido(e => (e === node.id ? null : node.id))}
                                    onDoubleClick={() => node.path && onFileOpen && onFileOpen(node.path)}
                                    style={{ cursor: 'pointer', transition: 'opacity 150ms ease' }}
                                    opacity={dimmed ? 0.25 : 1}
                                >
                                    <rect
                                        x={0} y={0} width={NODE_W} height={NODE_H}
                                        rx={8} ry={8}
                                        fill={colors.bg}
                                        stroke={isHovered ? 'var(--accent-primary)' : (color || colors.border)}
                                        strokeWidth={isHovered || (color && color !== 'var(--color-success)') ? 2 : 1}
                                    />
                                    {/* 5.12 (I3): cómo le fue la última vez */}
                                    {color && <circle cx={NODE_W - 12} cy={14} r={4} fill={color} />}
                                    {lento && (
                                        <text x={NODE_W - 22} y={17} textAnchor="end" fill="var(--color-warning)" fontSize={8} fontWeight="600" fontFamily="'JetBrains Mono', monospace">SLOW</text>
                                    )}
                                    <text x={10} y={60} fill="var(--text-tertiary)" fontSize={9} fontFamily="'JetBrains Mono', monospace">{meta}</text>
                                    {pruebas && (
                                        <text x={NODE_W - 10} y={60} textAnchor="end" fill={tt.fallan ? 'var(--color-error)' : tt.avisan ? 'var(--color-warning)' : 'var(--text-tertiary)'} fontSize={9} fontFamily="'JetBrains Mono', monospace">{pruebas}</text>
                                    )}
                                    {/* Resource type badge */}
                                    <rect
                                        x={6} y={6} width={48} height={16}
                                        rx={3} fill={colors.border} fillOpacity={0.19}
                                    />
                                    <text x={30} y={17} textAnchor="middle"
                                        fill={colors.text} fontSize={8} fontWeight="600" fontFamily="'JetBrains Mono', monospace"
                                    >
                                        {node.resourceType.toUpperCase().slice(0, 6)}
                                    </text>
                                    {/* Materialization badge */}
                                    {node.materialized && (
                                        <>
                                            <rect x={58} y={6} width={38} height={16} rx={3} fill="var(--hover-bg)" />
                                            <text x={77} y={17} textAnchor="middle"
                                                fill="var(--text-tertiary)" fontSize={7} fontFamily="'JetBrains Mono', monospace"
                                            >
                                                {node.materialized.slice(0, 5)}
                                            </text>
                                        </>
                                    )}
                                    {/* Name */}
                                    <text x={10} y={42} fill={isHovered ? 'var(--text-active)' : 'var(--text-primary)'}
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
                {hoveredNode && !elegido && (() => {
                    const node = data.nodes.find(n => n.id === hoveredNode);
                    if (!node) return null;
                    return (
                        <div style={{
                            position: 'absolute', bottom: '12px', left: '12px',
                            background: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                            borderRadius: '8px', padding: '10px 14px', fontSize: '11px',
                            color: 'var(--text-primary)',
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

                {/* 5.12 (I3): el nodo elegido — su resultado, sus tests y qué correr */}
                {elegido && (() => {
                    const node = data.nodes.find(n => n.id === elegido);
                    if (!node) return null;
                    const r = res?.nodos?.[node.id];
                    const tt = res?.tests?.[node.id];
                    const sel = node.resourceType === 'source' ? `source:${node.name}` : node.name;
                    return (
                        <div className="lin-panel">
                            <div className="lin-panel-cab">
                                <b>{node.name}</b>
                                <span>{node.resourceType}{node.materialized ? ` · ${node.materialized}` : ''}</span>
                                <button type="button" onClick={() => setElegido(null)} title="Close"><LuX size={12} /></button>
                            </div>
                            <div className="lin-panel-estado">
                                {!r ? 'It has not run yet.' : (
                                    <>
                                        {['error', 'fail'].includes(r.estado) ? <LuCircleAlert size={12} className="lin-mal" /> : <LuCheck size={12} className="lin-bien" />}
                                        {` ${r.estado} · ${r.segundos} s${r.filas != null ? ` · ${Number(r.filas).toLocaleString()} rows` : ''} · ${new Date(r.cuando).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                                    </>
                                )}
                            </div>
                            {r?.mensaje && <pre className="lin-panel-error">{r.mensaje}</pre>}
                            {tt && (
                                <ul className="lin-panel-tests">
                                    {tt.lista.map(x => (
                                        <li key={x.id} className={`lin-test--${x.estado}`}>
                                            {['fail', 'error'].includes(x.estado) ? <LuCircleAlert size={11} /> : x.estado === 'warn' ? <LuTriangleAlert size={11} /> : <LuCheck size={11} />}
                                            <span title={x.nombre}>{x.nombre}</span>
                                            {x.fallos ? <em>{x.fallos} rows</em> : null}
                                            {x.filas && <button type="button" onClick={() => verFilasDeTest(x.id)} title="Open the rows that fail it"><LuTable size={11} /> See rows</button>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {node.resourceType !== 'exposure' && (
                                <div className="lin-panel-acciones">
                                    {node.path && <button type="button" onClick={() => onFileOpen && onFileOpen(node.path)}><LuFileCode size={12} /> Open</button>}
                                    <button type="button" disabled={!!dbt.ocupado} onClick={() => dbt.correr(`dbt build --select ${sel}+`)} title={`This and what depends on it: dbt build --select ${sel}+`}>
                                        {dbt.ocupado ? <LuLoader size={12} className="dbt-spin" /> : <LuPlay size={12} />} Run from here
                                    </button>
                                    <button type="button" disabled={!!dbt.ocupado} onClick={() => dbt.correr(`dbt build --select +${sel}`)} title={`This and everything it needs: dbt build --select +${sel}`}>
                                        <LuChevronsLeft size={12} /> Build up to here
                                    </button>
                                    {dbt.ocupado && <button type="button" onClick={dbt.parar}><LuX size={12} /> Stop</button>}
                                </div>
                            )}
                            {dbt.confirmar && (
                                <div className="lin-panel-confirmar">
                                    <span>{dbt.confirmar.motivo} Type <b>{dbt.confirmar.target}</b>:</span>
                                    <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={dbt.confirmar.target} aria-label="Target name" autoFocus
                                        onKeyDown={e => { if (e.key === 'Enter' && texto === dbt.confirmar.target) { dbt.confirmarCon(texto); setTexto(''); } }} />
                                    <button type="button" disabled={texto !== dbt.confirmar.target} onClick={() => { dbt.confirmarCon(texto); setTexto(''); }}>Run in {dbt.confirmar.target}</button>
                                    <button type="button" onClick={dbt.cancelarConfirmacion}>Cancel</button>
                                </div>
                            )}
                            {dbt.error && <div className="lin-panel-error">{dbt.error}</div>}
                            {dbt.resumen && (
                                <div className={`lin-panel-resumen lin-panel-resumen--${dbt.resumen.estado}`}>
                                    <span>{dbt.resumen.linea}</span>
                                    {dbt.resumen.runId && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('amox_abrir_ejecucion', { detail: { runId: dbt.resumen.runId } }))}>Details</button>}
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
