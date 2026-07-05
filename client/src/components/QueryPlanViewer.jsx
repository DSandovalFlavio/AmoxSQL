import React, { useState } from 'react';
import { LuTreePine, LuGauge, LuTriangleAlert, LuWorkflow, LuLightbulb } from 'react-icons/lu';

// ─── Operator → human-friendly label ──────────────────────────────────────────
const OP_INFO = {
    READ_CSV_AUTO: 'Read CSV',
    READ_CSV: 'Read CSV',
    READ_PARQUET: 'Read Parquet',
    PARQUET_SCAN: 'Read Parquet',
    READ_JSON: 'Read JSON',
    READ_JSON_AUTO: 'Read JSON',
    SEQ_SCAN: 'Scan table',
    TABLE_SCAN: 'Scan table',
    INDEX_SCAN: 'Index scan',
    HASH_GROUP_BY: 'Group & aggregate',
    PERFECT_HASH_GROUP_BY: 'Group & aggregate',
    UNGROUPED_AGGREGATE: 'Aggregate',
    PROJECTION: 'Select columns',
    ORDER_BY: 'Sort',
    TOP_N: 'Top N (sort + limit)',
    FILTER: 'Filter rows',
    LIMIT: 'Limit',
    STREAMING_LIMIT: 'Limit',
    HASH_JOIN: 'Join (hash)',
    PIECEWISE_MERGE_JOIN: 'Join (merge)',
    NESTED_LOOP_JOIN: 'Join (nested loop)',
    CROSS_PRODUCT: 'Cross product',
    DELIM_JOIN: 'Join (delim)',
    UNION: 'Union',
    WINDOW: 'Window functions',
    DISTINCT: 'Distinct',
    COLUMN_DATA_SCAN: 'Read data',
    CTE_SCAN: 'Read CTE',
    RECURSIVE_CTE: 'Recursive CTE',
};
const friendly = (name) => OP_INFO[name] || (name || 'Operator');

// Wrapper nodes that aren't real operators — unwrap so the tree starts at the actual root.
const WRAPPERS = new Set(['EXPLAIN_ANALYZE', 'EXPLAIN', 'RESULT_COLLECTOR', 'QUERY_ROOT']);
function realRoot(node) {
    let n = node;
    while (n && WRAPPERS.has(n.name) && n.children && n.children.length === 1) n = n.children[0];
    return n;
}

const fmtMs = (s) => `${(s * 1000).toFixed(s * 1000 < 100 ? 2 : 0)} ms`;
const fmtRows = (n) => Number(n).toLocaleString();

function sumTimings(node) {
    if (!node) return 0;
    const self = typeof node.timing === 'number' ? node.timing : 0;
    return (node.children || []).reduce((a, c) => a + sumTimings(c), self);
}
function flattenOps(node, acc = []) {
    if (!node) return acc;
    if (typeof node.timing === 'number') acc.push(node);
    (node.children || []).forEach((c) => flattenOps(c, acc));
    return acc;
}
function allNodes(node, acc = []) {
    if (!node) return acc;
    acc.push(node);
    (node.children || []).forEach((c) => allNodes(c, acc));
    return acc;
}

// ─── Optimization hints: rule-based diagnostics from the plan ──────────────────
function buildHints(root, metrics, mode) {
    const hints = [];
    const nodes = allNodes(root);
    const total = sumTimings(root);
    const isScan = (n) => /SCAN|READ_CSV|READ_PARQUET|READ_JSON/.test(n.name || '');

    // Far-off cardinality estimate → stale stats / bad join orders.
    const offEst = nodes.find((n) => typeof n.cardinality === 'number' && typeof n.estimated_cardinality === 'number'
        && n.estimated_cardinality > 0 && n.cardinality > 0
        && Math.max(n.cardinality, n.estimated_cardinality) / Math.min(n.cardinality, n.estimated_cardinality) >= 10
        && Math.abs(n.cardinality - n.estimated_cardinality) >= 1000);
    if (offEst) hints.push({ severity: 'mid', text: `Cardinality estimate was far off at ${friendly(offEst.name)} (expected ~${fmtRows(offEst.estimated_cardinality)}, got ${fmtRows(offEst.cardinality)}). Stale statistics can cause poor join orders — re-run ANALYZE on the sources or simplify the predicate.` });

    // Filter discards most rows after a big scan → push the predicate down.
    const filterAfterScan = nodes.find((n) => /FILTER/.test(n.name || '') && n.children && n.children[0] && isScan(n.children[0])
        && typeof n.cardinality === 'number' && typeof n.children[0].cardinality === 'number'
        && n.children[0].cardinality >= 10000 && n.cardinality / n.children[0].cardinality < 0.2);
    if (filterAfterScan) hints.push({ severity: 'mid', text: `A filter drops most rows after scanning ${fmtRows(filterAfterScan.children[0].cardinality)}. Pushing the condition into the source (a WHERE on the table/file) reads far less data.` });

    // Full scan with no filter anywhere.
    const hasFilter = nodes.some((n) => /FILTER/.test(n.name || ''));
    const bigScan = nodes.find((n) => isScan(n) && (n.cardinality || n.estimated_cardinality || 0) >= 100000);
    if (bigScan && !hasFilter) hints.push({ severity: 'info', text: `${friendly(bigScan.name)} reads the full source (${fmtRows(bigScan.cardinality || bigScan.estimated_cardinality)} rows) with no filter. If you don't need every row, add a WHERE to read less.` });

    // Expensive sort that isn't a Top-N.
    const sort = nodes.find((n) => n.name === 'ORDER_BY' && typeof n.timing === 'number');
    if (sort && total > 0 && sort.timing / total >= 0.3) hints.push({ severity: 'mid', text: `Sorting is ${((sort.timing / total) * 100).toFixed(0)}% of the run. If you only need the top rows, add ORDER BY … LIMIT so the engine uses a cheaper Top-N.` });

    // Cross product / nested-loop join → missing equality key.
    const cross = nodes.find((n) => /CROSS_PRODUCT|NESTED_LOOP/.test(n.name || ''));
    if (cross) hints.push({ severity: 'high', text: `A ${friendly(cross.name)} was used — usually a missing or non-equality join condition. Add an equality join key to avoid comparing every row pair.` });

    // Spilled to disk.
    if (metrics && metrics.tempDirSize > 0) hints.push({ severity: 'high', text: `The query spilled to disk (used temporary storage) — it needed more memory than available. Reduce the data scanned or raise memory_limit.` });

    // I/O-bound: operators ran in a small fraction of total latency.
    if (mode === 'analyze' && metrics && metrics.latency > 0.02) {
        const exec = sumTimings(root);
        if (exec / metrics.latency < 0.2) hints.push({ severity: 'info', text: `Most of the time is I/O / setup, not computation (operators ran in ${fmtMs(exec)} of ${fmtMs(metrics.latency)}). For files, converting CSV → Parquet or caching into a table can cut read time substantially.` });
    }

    return hints;
}

// ─── Build a Mermaid flowchart from the plan tree ──────────────────────────────
function buildMermaid(root) {
    let i = 0;
    const lines = ['flowchart TD'];
    const walk = (n) => {
        const id = `n${i++}`;
        const t = typeof n.timing === 'number' ? `<br/>${(n.timing * 1000).toFixed(0)} ms` : '';
        const r = typeof n.cardinality === 'number' ? `<br/>${fmtRows(n.cardinality)} rows`
            : (typeof n.estimated_cardinality === 'number' ? `<br/>~${fmtRows(n.estimated_cardinality)} rows` : '');
        const label = `${friendly(n.name)}${t}${r}`.replace(/["[\]{}|]/g, ' ');
        lines.push(`${id}["${label}"]`);
        (n.children || []).forEach((c) => { const cid = walk(c); lines.push(`${id} --> ${cid}`); });
        return id;
    };
    walk(root);
    return lines.join('\n');
}

const GraphView = ({ root }) => {
    const [svg, setSvg] = useState('');
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const mermaid = (await import('mermaid')).default;
                mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', flowchart: { htmlLabels: true, curve: 'basis' } });
                const id = `qpgraph-${Math.random().toString(36).slice(2, 9)}`;
                const { svg: out } = await mermaid.render(id, buildMermaid(root));
                if (alive) setSvg(out);
            } catch (e) {
                if (alive) setSvg('<div style="color:var(--text-muted);font-size:12px;padding:10px">Could not render the graph.</div>');
            }
        })();
        return () => { alive = false; };
    }, [root]);
    return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ display: 'flex', justifyContent: 'center', padding: '10px', overflow: 'auto' }} />;
};

// ─── Tree node ─────────────────────────────────────────────────────────────────
const QueryPlanNode = ({ node, depth = 0, isLast = true, total = 0, slowest = null }) => {
    const [expanded, setExpanded] = useState(true);
    if (!node) return null;

    const hasChildren = node.children && node.children.length > 0;
    const hasTiming = typeof node.timing === 'number';
    const pct = hasTiming && total > 0 ? node.timing / total : 0;
    const pctLabel = hasTiming && total > 0 ? ` · ${(pct * 100).toFixed(0)}%` : '';
    const isBottleneck = slowest && node === slowest && node.timing > 0;

    const realRows = typeof node.cardinality === 'number' ? node.cardinality : undefined;
    const estRows = typeof node.estimated_cardinality === 'number' ? node.estimated_cardinality : undefined;
    const rowsLabel = realRows !== undefined ? `${fmtRows(realRows)} rows`
        : (estRows !== undefined ? `~${fmtRows(estRows)} rows` : '');
    // Flag a wildly-off estimate (≥10× and a meaningful absolute gap).
    const badEstimate = realRows !== undefined && estRows !== undefined && estRows > 0 && realRows > 0
        && (estRows / Math.max(realRows, 1) >= 10 || realRows / Math.max(estRows, 1) >= 10)
        && Math.abs(estRows - realRows) >= 1000;

    const heat = pct >= 0.4 ? 'high' : pct >= 0.15 ? 'mid' : 'none';
    const heatBg = heat === 'high' ? 'rgba(255,90,90,0.13)' : heat === 'mid' ? 'rgba(245,170,70,0.11)' : 'var(--panel-bg)';
    const heatBorder = heat === 'high' ? 'rgba(255,90,90,0.65)' : heat === 'mid' ? 'rgba(245,170,70,0.55)' : 'var(--border-color)';

    // Clean extra_info: drop keys we surface elsewhere; keep the informative ones.
    const SKIP = new Set(['function', 'estimated cardinality', '__timing', '__cardinality']);
    const extraEntries = node.extra_info && typeof node.extra_info === 'object'
        ? Object.entries(node.extra_info).filter(([k, v]) => v != null && String(v).trim() !== '' && !SKIP.has(String(k).toLowerCase()))
        : null;

    return (
        <div style={{ marginLeft: depth > 0 ? '20px' : '0', position: 'relative' }}>
            {depth > 0 && (
                <div style={{ position: 'absolute', left: '-12px', top: '0', bottom: isLast ? '50%' : '-10px', borderLeft: '1px solid var(--border-color)', width: '1px' }} />
            )}
            {depth > 0 && (
                <div style={{ position: 'absolute', left: '-12px', top: '50%', width: '10px', borderTop: '1px solid var(--border-color)' }} />
            )}

            <div style={{
                marginBottom: '8px', backgroundColor: heatBg,
                border: `1px solid ${heatBorder}`, borderRadius: '6px', padding: '8px 10px',
                display: 'inline-block', minWidth: '320px', maxWidth: '560px'
            }}>
                <div
                    style={{ display: 'flex', alignItems: 'center', cursor: hasChildren ? 'pointer' : 'default', gap: '8px' }}
                    onClick={() => hasChildren && setExpanded(!expanded)}
                >
                    {hasChildren && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{expanded ? '▼' : '▶'}</span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-active)', fontSize: '13px' }}>{friendly(node.name)}</span>
                        {friendly(node.name) !== node.name && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>{node.name}</span>
                        )}
                    </div>
                    {isBottleneck && (
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#ff7a7a', border: '1px solid rgba(255,90,90,0.5)', borderRadius: '4px', padding: '1px 5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            slowest
                        </span>
                    )}
                    <div style={{ flex: 1 }} />
                    {hasTiming && (
                        <span style={{ fontSize: '11px', color: heat === 'high' ? '#ff7a7a' : 'var(--accent-color-user)', fontVariantNumeric: 'tabular-nums', fontWeight: heat !== 'none' ? 600 : 400, whiteSpace: 'nowrap' }}>
                            {fmtMs(node.timing)}{pctLabel}
                        </span>
                    )}
                    {rowsLabel && (
                        <span style={{ fontSize: '11px', color: 'var(--text-color)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rowsLabel}</span>
                    )}
                </div>

                {badEstimate && (
                    <div style={{ marginTop: '5px', fontSize: '10px', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <LuTriangleAlert size={11} />
                        Off estimate: the optimizer expected ~{fmtRows(estRows)} rows, got {fmtRows(realRows)}.
                    </div>
                )}

                {extraEntries && extraEntries.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {extraEntries.map(([key, val]) => (
                            <div key={key} style={{ display: 'flex', gap: '6px' }}>
                                <span style={{ color: 'var(--text-muted)', minWidth: '90px', flexShrink: 0 }}>{key}:</span>
                                <span style={{ color: 'var(--text-color)', wordBreak: 'break-all' }}>
                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {hasChildren && expanded && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {node.children.map((child, i) => (
                        <QueryPlanNode key={i} node={child} depth={depth + 1} isLast={i === node.children.length - 1} total={total} slowest={slowest} />
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Cost view: horizontal time bars, sorted by self-time ──────────────────────
const CostView = ({ root, total }) => {
    const ops = flattenOps(root).filter((o) => o.timing > 0).sort((a, b) => b.timing - a.timing);
    if (ops.length === 0) {
        return <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '10px' }}>No operator timings — switch to Actual mode to measure.</div>;
    }
    const max = ops[0].timing || 1;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
            {ops.map((op, i) => {
                const pct = total > 0 ? (op.timing / total) * 100 : 0;
                const w = Math.max(2, (op.timing / max) * 100);
                const strong = i === 0;
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '160px', flexShrink: 0, textAlign: 'right', fontSize: '12px', color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={op.name}>
                            {friendly(op.name)}
                        </div>
                        <div style={{ flex: 1, background: 'var(--surface-inset, rgba(255,255,255,0.04))', borderRadius: '4px', height: '20px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ width: `${w}%`, height: '100%', background: strong ? 'rgba(255,90,90,0.55)' : 'var(--accent-primary, #00bbaa)', opacity: strong ? 1 : 0.65, borderRadius: '4px' }} />
                        </div>
                        <div style={{ width: '120px', flexShrink: 0, fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {fmtMs(op.timing)} · {pct.toFixed(0)}%
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ─── Main ──────────────────────────────────────────────────────────────────────
const SEV_COLOR = { high: '#ff7a7a', mid: '#d2a106', info: 'var(--accent-color-user, #00bbaa)' };

const QueryPlanViewer = ({ plan, mode = 'analyze', metrics = null }) => {
    const [viewMode, setViewMode] = useState('tree');

    if (!plan) return <div style={{ color: 'var(--text-muted)', padding: '20px' }}>No plan data available</div>;

    const root = realRoot(Array.isArray(plan) ? plan[0] : plan);
    const total = sumTimings(root);
    const ops = flattenOps(root).filter((o) => o.timing > 0);
    const slowest = ops.length ? ops.reduce((a, b) => (b.timing > a.timing ? b : a)) : null;
    const hints = buildHints(root, metrics, mode);

    return (
        <div style={{ padding: '20px', overflow: 'auto', height: '100%', backgroundColor: 'var(--editor-bg)', borderRadius: '4px', fontFamily: 'var(--font-sans)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-active)', fontSize: '14px' }}>Query Execution Plan</h3>
                <div className="seg">
                    <button onClick={() => setViewMode('tree')} className={`seg-item${viewMode === 'tree' ? ' seg-item--active' : ''}`}>
                        <LuTreePine size={13} /> Tree
                    </button>
                    <button onClick={() => setViewMode('cost')} className={`seg-item${viewMode === 'cost' ? ' seg-item--active' : ''}`}>
                        <LuGauge size={13} /> Cost
                    </button>
                    <button onClick={() => setViewMode('graph')} className={`seg-item${viewMode === 'graph' ? ' seg-item--active' : ''}`}>
                        <LuWorkflow size={13} /> Graph
                    </button>
                </div>
            </div>

            {/* Optimization hints */}
            {hints.length > 0 && (
                <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {hints.map((h, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', color: 'var(--text-color)', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderLeft: `3px solid ${SEV_COLOR[h.severity] || SEV_COLOR.info}`, borderRadius: '6px', padding: '8px 10px' }}>
                            <LuLightbulb size={14} style={{ color: SEV_COLOR[h.severity] || SEV_COLOR.info, flexShrink: 0, marginTop: '1px' }} />
                            <span>{h.text}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Bottleneck banner (analyze only) */}
            {mode === 'analyze' && slowest && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-color)', backgroundColor: 'rgba(255,90,90,0.08)', border: '1px solid rgba(255,90,90,0.3)', borderRadius: '6px', padding: '7px 10px', marginBottom: '14px' }}>
                    <LuGauge size={14} style={{ color: '#ff7a7a' }} />
                    <span>Slowest step: <strong>{friendly(slowest.name)}</strong> — {fmtMs(slowest.timing)}{total > 0 ? ` (${((slowest.timing / total) * 100).toFixed(0)}% of operator time)` : ''}</span>
                </div>
            )}

            {viewMode === 'tree' && (
                <QueryPlanNode node={root} total={total} slowest={slowest} />
            )}
            {viewMode === 'cost' && (
                <CostView root={root} total={total} />
            )}
            {viewMode === 'graph' && (
                <GraphView root={root} />
            )}
        </div>
    );
};

export default QueryPlanViewer;
