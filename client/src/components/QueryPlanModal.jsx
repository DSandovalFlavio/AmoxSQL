import React, { useState, useRef, useEffect } from 'react';
import { LuSparkles } from 'react-icons/lu';
import QueryPlanViewer from './QueryPlanViewer';

const fmtMs = (s) => {
    if (s == null) return '—';
    const ms = s * 1000;
    if (ms < 1) return ms.toFixed(2) + ' ms';
    return (ms < 100 ? ms.toFixed(1) : Math.round(ms).toLocaleString()) + ' ms';
};
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());
const fmtBytes = (b) => {
    if (b == null) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
};

const Metric = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: '13px', color: 'var(--text-active)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{value}</span>
    </div>
);

const planRoot = (plan) => (Array.isArray(plan) ? plan[0] : plan);
function sumTimings(node) {
    if (!node) return 0;
    const self = typeof node.timing === 'number' ? node.timing : 0;
    return (node.children || []).reduce((a, c) => a + sumTimings(c), self);
}

// Where the time went: planning (binding/optimizer/physical), operator execution, and the
// remainder (I/O, CSV sniffing, result collection). Reveals I/O-bound vs compute-bound queries.
const PhaseBar = ({ plan, metrics }) => {
    if (!metrics || !(metrics.latency > 0)) return null;
    const p = metrics.phases || {};
    const planning = (p.planner || 0) + (p.optimizer || 0) + (p.physicalPlanner || 0);
    const execution = sumTimings(planRoot(plan));
    const other = Math.max(0, metrics.latency - planning - execution);
    const segs = [
        { label: 'Planning', v: planning, c: '#7aa2ff' },
        { label: 'Execution', v: execution, c: '#00bbaa' },
        { label: 'I/O & setup', v: other, c: '#9aa0a6' },
    ].filter((s) => s.v > 0);
    const tot = segs.reduce((a, s) => a + s.v, 0) || 1;
    return (
        <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface-base)', flexShrink: 0 }}>
            <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '5px', gap: '1px' }}>
                {segs.map((s, i) => (
                    <div key={i} style={{ width: `${(s.v / tot) * 100}%`, background: s.c }} title={`${s.label}: ${fmtMs(s.v)}`} />
                ))}
            </div>
            <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: 'var(--text-muted)' }}>
                {segs.map((s, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: 8, height: 8, background: s.c, borderRadius: 2 }} />
                        {s.label} <span style={{ color: 'var(--text-color)', fontVariantNumeric: 'tabular-nums' }}>{fmtMs(s.v)}</span>
                    </span>
                ))}
            </div>
        </div>
    );
};

function summarizeTree(node, depth = 0, lines = []) {
    if (!node) return lines;
    const t = typeof node.timing === 'number' ? ` · ${(node.timing * 1000).toFixed(1)}ms` : '';
    const r = typeof node.cardinality === 'number' ? ` · ${node.cardinality} rows`
        : (typeof node.estimated_cardinality === 'number' ? ` · ~${node.estimated_cardinality} rows` : '');
    lines.push(`${'  '.repeat(depth)}- ${node.name}${t}${r}`);
    (node.children || []).forEach((c) => summarizeTree(c, depth + 1, lines));
    return lines;
}

const QueryPlanModal = ({ isOpen, onClose, plan, query, mode = 'analyze', metrics = null, note = null, loading = false, onSetMode }) => {
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

    const askAi = () => {
        const summary = summarizeTree(planRoot(plan)).join('\n');
        const head = (mode === 'analyze' && metrics)
            ? `Total latency: ${fmtMs(metrics.latency)} · rows returned: ${metrics.rowsReturned} · rows scanned: ${metrics.rowsScanned} · peak memory: ${fmtBytes(metrics.peakMemory)}\n`
            : '';
        const prompt = `Optimize this DuckDB SQL query. Below is the query and its ${mode === 'analyze' ? 'actual (EXPLAIN ANALYZE)' : 'estimated'} execution plan.\n\nQuery:\n\`\`\`sql\n${query}\n\`\`\`\n\nExecution plan:\n\`\`\`\n${head}${summary}\n\`\`\`\n\nSuggest concrete optimizations (query rewrites, predicate pushdown / filters, sorting & limits, join order) and briefly explain why each helps.`;
        window.dispatchEvent(new CustomEvent('amox_ai_prompt', { detail: { prompt } }));
        if (onClose) onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--overlay-bg)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,

        }}>
            <div className="modal-panel" style={{
                backgroundColor: 'var(--surface-overlay)',
                width: '90%',
                height: '82%',
                maxHeight: 'calc(100vh - 80px)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-default)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--surface-raised)',
                    flexShrink: 0,
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-active)', fontSize: '14px' }}>Query Execution Plan</h3>
                        <div className="seg">
                            <button
                                className={`seg-item${mode === 'explain' ? ' seg-item--active' : ''}`}
                                onClick={() => mode !== 'explain' && onSetMode && onSetMode('explain')}
                                title="Estimated plan — does not run the query"
                            >
                                Estimated
                            </button>
                            <button
                                className={`seg-item${mode === 'analyze' ? ' seg-item--active' : ''}`}
                                onClick={() => mode !== 'analyze' && onSetMode && onSetMode('analyze')}
                                title="Actual plan — runs the query and measures real time / rows"
                            >
                                Actual
                            </button>
                        </div>
                        {loading && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Analyzing…</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={askAi}
                            title="Send the query and its plan to the AI assistant for optimization tips"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                background: 'var(--accent-subtle, rgba(0,187,170,0.12))',
                                border: '1px solid var(--border-default)', color: 'var(--text-active)',
                                fontSize: '12px', cursor: 'pointer', padding: '4px 9px', borderRadius: 'var(--radius-md, 6px)'
                            }}
                        >
                            <LuSparkles size={13} /> Optimize with AI
                        </button>
                        <button
                            onClick={onClose}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Warning note (e.g. ANALYZE blocked on a non-read-only query) */}
                {note && (
                    <div style={{
                        padding: '6px 14px', fontSize: '11px', flexShrink: 0,
                        color: 'var(--color-warning)',
                        backgroundColor: 'var(--surface-raised)',
                        borderBottom: '1px solid var(--border-subtle)'
                    }}>
                        {note}
                    </div>
                )}

                {/* Real-run metrics strip */}
                {mode === 'analyze' && metrics && (
                    <div style={{
                        display: 'flex', gap: '22px', padding: '8px 14px', flexWrap: 'wrap',
                        borderBottom: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--surface-base)', flexShrink: 0
                    }}>
                        <Metric label="Latency" value={fmtMs(metrics.latency)} />
                        <Metric label="Rows" value={fmtNum(metrics.rowsReturned)} />
                        <Metric label="Rows scanned" value={fmtNum(metrics.rowsScanned)} />
                        <Metric label="CPU" value={fmtMs(metrics.cpuTime)} />
                        <Metric label="Peak memory" value={fmtBytes(metrics.peakMemory)} />
                        <Metric label="Bytes read" value={fmtBytes(metrics.bytesRead)} />
                    </div>
                )}

                {/* Where the time went: planning vs execution vs I/O */}
                {mode === 'analyze' && <PhaseBar plan={plan} metrics={metrics} />}

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
                            {loading ? (
                                <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>Analyzing query…</div>
                            ) : plan ? (
                                <QueryPlanViewer plan={plan} mode={mode} metrics={metrics} />
                            ) : (
                                <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>No plan data.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QueryPlanModal;
