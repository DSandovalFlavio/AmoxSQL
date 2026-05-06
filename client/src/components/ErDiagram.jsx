import { useState, useEffect, useRef, useCallback } from 'react';
import {
    LuRefreshCw, LuLoader, LuCircleAlert, LuZoomIn, LuZoomOut,
    LuMaximize2, LuKey, LuLink, LuCopy, LuCheck, LuDatabase, LuEye, LuTable
} from 'react-icons/lu';

import { API_BASE as _API } from '../api.js';
const API = `${_API}/api`;

const TABLE_W = 230;
const HEADER_H = 36;
const ROW_H = 24;
const GAP = 50;

const ErDiagram = ({ onCreateTab }) => {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [hoveredTable, setHoveredTable] = useState(null);
    const [selectedTable, setSelectedTable] = useState(null);
    const [copied, setCopied] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const positions = useRef(new Map());

    const fetchSchema = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API}/db/er-schema`);
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setTables(data);
                // Auto-layout in grid
                computePositions(data);
            }
        } catch (err) {
            setError(err.message);
        }
        setLoading(false);
    }, []);

    const computePositions = (tables) => {
        const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
        const newPositions = new Map();
        tables.forEach((table, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const tableHeight = HEADER_H + table.columns.length * ROW_H + 8;
            newPositions.set(table.name, {
                x: col * (TABLE_W + GAP) + 40,
                y: row * (Math.max(...tables.map(t => HEADER_H + t.columns.length * ROW_H + 8)) + GAP) + 40,
            });
        });
        positions.current = newPositions;
    };

    useEffect(() => { fetchSchema(); }, [fetchSchema]);

    // Dragging individual tables
    const [dragging, setDragging] = useState(null);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleTableMouseDown = (e, tableName) => {
        e.stopPropagation();
        const pos = positions.current.get(tableName);
        if (!pos) return;
        dragOffset.current = { x: e.clientX / zoom - pos.x, y: e.clientY / zoom - pos.y };
        setDragging(tableName);
    };

    const handleMouseDown = (e) => {
        if (dragging || e.target.closest('.er-table')) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    };

    const handleMouseMove = (e) => {
        if (dragging) {
            const newPos = {
                x: e.clientX / zoom - dragOffset.current.x,
                y: e.clientY / zoom - dragOffset.current.y,
            };
            positions.current.set(dragging, newPos);
            // Force re-render
            setTables(t => [...t]);
            return;
        }
        if (isPanning) {
            setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
        }
    };

    const handleMouseUp = () => {
        setDragging(null);
        setIsPanning(false);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setZoom(z => Math.max(0.15, Math.min(3, z + delta)));
    };

    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); computePositions(tables); };

    // Generate DDL for a table
    const generateDDL = (table) => {
        let ddl = `CREATE TABLE "${table.name}" (\n`;
        const colDefs = table.columns.map(c => {
            let def = `    "${c.name}" ${c.type}`;
            if (!c.nullable) def += ' NOT NULL';
            if (c.isPK) def += ' PRIMARY KEY';
            return def;
        });
        ddl += colDefs.join(',\n');

        // FK constraints
        const fks = table.columns.filter(c => c.fk);
        for (const c of fks) {
            ddl += `,\n    FOREIGN KEY ("${c.name}") REFERENCES "${c.fk.table}" ("${c.fk.column}")`;
        }

        ddl += '\n);';
        return ddl;
    };

    const handleCopyDDL = () => {
        if (!selectedTable) return;
        const table = tables.find(t => t.name === selectedTable);
        if (!table) return;
        navigator.clipboard.writeText(generateDDL(table));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleOpenDDL = () => {
        if (!selectedTable || !onCreateTab) return;
        const table = tables.find(t => t.name === selectedTable);
        if (!table) return;
        onCreateTab(generateDDL(table));
    };

    // Compute FK edges
    const fkEdges = [];
    for (const table of tables) {
        for (const col of table.columns) {
            if (col.fk) {
                const fromPos = positions.current.get(table.name);
                const toPos = positions.current.get(col.fk.table);
                if (fromPos && toPos) {
                    const fromColIdx = table.columns.indexOf(col);
                    const targetTable = tables.find(t => t.name === col.fk.table);
                    const toColIdx = targetTable ? targetTable.columns.findIndex(c => c.name === col.fk.column) : 0;

                    fkEdges.push({
                        from: { x: fromPos.x + TABLE_W, y: fromPos.y + HEADER_H + fromColIdx * ROW_H + ROW_H / 2 },
                        to: { x: toPos.x, y: toPos.y + HEADER_H + Math.max(0, toColIdx) * ROW_H + ROW_H / 2 },
                        fromTable: table.name,
                        toTable: col.fk.table,
                    });
                }
            }
        }
    }

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <LuLoader size={20} className="dbt-spin" /> Loading schema...
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <LuCircleAlert size={24} style={{ marginBottom: '8px', color: 'var(--warning)' }} />
                <p style={{ fontSize: '12px', marginBottom: '12px' }}>{error}</p>
                <button className="dbt-btn dbt-btn--ghost" onClick={fetchSchema}>
                    <LuRefreshCw size={13} /> Retry
                </button>
            </div>
        );
    }

    if (tables.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                <LuDatabase size={28} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '12px' }}>No tables found in the current database.</p>
                <p style={{ fontSize: '10px', marginTop: '4px' }}>Create some tables first, then refresh.</p>
                <button className="dbt-btn dbt-btn--ghost" onClick={fetchSchema} style={{ marginTop: '8px' }}>
                    <LuRefreshCw size={13} /> Refresh
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', gap: '6px', padding: '6px 10px',
                borderBottom: '1px solid var(--border-subtle)', alignItems: 'center',
                flexShrink: 0,
            }}>
                <button className="dbt-icon-btn" onClick={() => setZoom(z => Math.min(3, z + 0.15))} title="Zoom In"><LuZoomIn size={14} /></button>
                <button className="dbt-icon-btn" onClick={() => setZoom(z => Math.max(0.15, z - 0.15))} title="Zoom Out"><LuZoomOut size={14} /></button>
                <button className="dbt-icon-btn" onClick={resetView} title="Reset View"><LuMaximize2 size={14} /></button>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {tables.length} tables · {fkEdges.length} relations · {Math.round(zoom * 100)}%
                </span>
                {selectedTable && (
                    <>
                        <button className="dbt-icon-btn" onClick={handleCopyDDL} title="Copy DDL">
                            {copied ? <LuCheck size={13} style={{ color: 'var(--success)' }} /> : <LuCopy size={13} />}
                        </button>
                        {onCreateTab && (
                            <button className="dbt-icon-btn" onClick={handleOpenDDL} title="Open DDL in Editor">
                                <LuDatabase size={13} />
                            </button>
                        )}
                    </>
                )}
                <button className="dbt-icon-btn" onClick={fetchSchema} title="Refresh"><LuRefreshCw size={13} /></button>
            </div>

            {/* Canvas */}
            <div
                style={{
                    flex: 1, overflow: 'hidden', position: 'relative',
                    cursor: isPanning ? 'grabbing' : dragging ? 'move' : 'grab',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <svg width="100%" height="100%" style={{ display: 'block' }}>
                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                        {/* FK edges */}
                        <defs>
                            <marker id="er-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                                <polygon points="0 0, 8 3, 0 6" fill="var(--accent-primary)" fillOpacity="0.7" />
                            </marker>
                        </defs>
                        {fkEdges.map((edge, i) => {
                            const midX = (edge.from.x + edge.to.x) / 2;
                            const isHighlighted = hoveredTable === edge.fromTable || hoveredTable === edge.toTable;
                            return (
                                <path
                                    key={i}
                                    d={`M ${edge.from.x} ${edge.from.y} C ${midX} ${edge.from.y}, ${midX} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`}
                                    fill="none"
                                    stroke={isHighlighted ? 'var(--accent-primary)' : 'var(--border-default)'}
                                    strokeWidth={isHighlighted ? 2 : 1}
                                    strokeOpacity={hoveredTable && !isHighlighted ? 0.15 : 0.5}
                                    markerEnd="url(#er-arrow)"
                                    strokeDasharray={isHighlighted ? 'none' : '4 2'}
                                    style={{ transition: 'all 150ms ease' }}
                                />
                            );
                        })}

                        {/* Tables */}
                        {tables.map(table => {
                            const pos = positions.current.get(table.name);
                            if (!pos) return null;
                            const tableH = HEADER_H + table.columns.length * ROW_H + 8;
                            const isSelected = selectedTable === table.name;
                            const isHovered = hoveredTable === table.name;
                            const dimmed = hoveredTable && !isHovered &&
                                !fkEdges.some(e => (e.fromTable === hoveredTable && e.toTable === table.name) ||
                                                   (e.toTable === hoveredTable && e.fromTable === table.name));

                            return (
                                <g
                                    key={table.name}
                                    className="er-table"
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onMouseDown={(e) => handleTableMouseDown(e, table.name)}
                                    onMouseEnter={() => setHoveredTable(table.name)}
                                    onMouseLeave={() => setHoveredTable(null)}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTable(selectedTable === table.name ? null : table.name);
                                    }}
                                    style={{ cursor: 'move', transition: 'opacity 150ms' }}
                                    opacity={dimmed ? 0.2 : 1}
                                >
                                    {/* Shadow */}
                                    <rect x={2} y={2} width={TABLE_W} height={tableH} rx={8}
                                        fill="rgba(0,0,0,0.3)" />

                                    {/* Card body */}
                                    <rect x={0} y={0} width={TABLE_W} height={tableH} rx={8}
                                        fill="var(--surface-elevated)"
                                        stroke={isSelected ? 'var(--accent-primary)' : isHovered ? 'var(--border-hover)' : 'var(--border-subtle)'}
                                        strokeWidth={isSelected ? 2 : 1} />

                                    {/* Header */}
                                    <rect x={0} y={0} width={TABLE_W} height={HEADER_H} rx={8}
                                        fill={isSelected ? 'var(--accent-primary)' : 'var(--surface-overlay)'} />
                                    <rect x={0} y={HEADER_H - 8} width={TABLE_W} height={8}
                                        fill={isSelected ? 'var(--accent-primary)' : 'var(--surface-overlay)'} />

                                    {/* Table icon + name */}
                                    <foreignObject x={8} y={11} width={14} height={14}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                                            {table.type === 'VIEW' ? <LuEye size={12} color={isSelected ? '#fff' : 'var(--text-primary)'} /> : <LuTable size={12} color={isSelected ? '#fff' : 'var(--text-primary)'} />}
                                        </div>
                                    </foreignObject>
                                    <text x={26} y={23} fill={isSelected ? '#fff' : 'var(--text-primary)'}
                                        fontSize={12} fontWeight="600" fontFamily="'Inter', sans-serif">
                                        {table.name.length > 22 ? table.name.slice(0, 20) + '…' : table.name}
                                    </text>

                                    {/* Column count badge */}
                                    <text x={TABLE_W - 12} y={23} textAnchor="end"
                                        fill={isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)'}
                                        fontSize={9} fontFamily="'JetBrains Mono', monospace">
                                        {table.columns.length} cols
                                    </text>

                                    {/* Columns */}
                                    {table.columns.map((col, ci) => {
                                        const y = HEADER_H + ci * ROW_H;
                                        return (
                                            <g key={col.name}>
                                                {/* Hover row bg */}
                                                <rect x={1} y={y} width={TABLE_W - 2} height={ROW_H}
                                                    fill="transparent" />

                                                {/* PK icon */}
                                                {col.isPK && (
                                                    <foreignObject x={8} y={y + 5} width={12} height={12}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                                                            <LuKey size={10} color="#eab308" />
                                                        </div>
                                                    </foreignObject>
                                                )}
                                                {/* FK icon */}
                                                {col.fk && !col.isPK && (
                                                    <foreignObject x={8} y={y + 5} width={12} height={12}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                                                            <LuLink size={10} color="var(--accent-primary)" />
                                                        </div>
                                                    </foreignObject>
                                                )}

                                                {/* Column name */}
                                                <text x={col.isPK || col.fk ? 24 : 12} y={y + 16}
                                                    fill={col.isPK ? '#eab308' : col.fk ? 'var(--accent-primary)' : 'var(--text-secondary)'}
                                                    fontSize={10.5} fontFamily="'JetBrains Mono', monospace"
                                                    fontWeight={col.isPK ? '600' : '400'}>
                                                    {col.name.length > 18 ? col.name.slice(0, 16) + '…' : col.name}
                                                </text>

                                                {/* Type */}
                                                <text x={TABLE_W - 8} y={y + 16} textAnchor="end"
                                                    fill="var(--text-tertiary)" fontSize={9}
                                                    fontFamily="'JetBrains Mono', monospace">
                                                    {col.type.toLowerCase().slice(0, 12)}
                                                </text>
                                            </g>
                                        );
                                    })}
                                </g>
                            );
                        })}
                    </g>
                </svg>

                {/* Selected table info panel */}
                {selectedTable && (() => {
                    const table = tables.find(t => t.name === selectedTable);
                    if (!table) return null;
                    return (
                        <div style={{
                            position: 'absolute', bottom: '12px', left: '12px',
                            background: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                            borderRadius: '8px', padding: '12px 16px', fontSize: '11px',
                            color: 'var(--text-primary)', backdropFilter: 'blur(12px)',
                            boxShadow: 'var(--shadow-lg)', maxWidth: '350px', zIndex: 10,
                        }}>
                            <div style={{ fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {table.type === 'VIEW' ? <LuEye size={12} /> : <LuTable size={12} />} {table.name}
                                <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: '400' }}>
                                    ({table.type})
                                </span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                                {table.columns.length} columns
                                {table.columns.some(c => c.isPK) && ` · ${table.columns.filter(c => c.isPK).length} PK`}
                                {table.columns.some(c => c.fk) && ` · ${table.columns.filter(c => c.fk).length} FK`}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button className="dbt-btn dbt-btn--ghost" onClick={handleCopyDDL} style={{ fontSize: '10px', padding: '3px 8px' }}>
                                    {copied ? <LuCheck size={10} /> : <LuCopy size={10} />} Copy DDL
                                </button>
                                {onCreateTab && (
                                    <button className="dbt-btn dbt-btn--ghost" onClick={handleOpenDDL} style={{ fontSize: '10px', padding: '3px 8px' }}>
                                        <LuDatabase size={10} /> Open in Editor
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default ErDiagram;
