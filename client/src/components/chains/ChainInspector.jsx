/**
 * ChainInspector — the permanent right-hand panel (Fase 2 of
 * docs/dev/auditoria_dataflow_ux.md). Unlike the old config drawer, this is
 * ALWAYS visible — selecting a node just changes what it shows — so the
 * user never has to run the chain, or even open anything, to see a node's
 * data, its input/output schema, the SQL it compiles to, or its last log
 * lines. Everything here rides Fase 0's live-compile endpoints, so most of
 * it works before the chain has ever been run.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { LuPin, LuPinOff, LuExternalLink, LuInfo } from 'react-icons/lu';
import { NODE_TYPES } from './chainNodeTypes';
import { API_BASE as _API } from '../../api.js';

const API_BASE = `${_API}/api/chains`;
const HEADERS = { 'Content-Type': 'application/json' };

const SOURCE_LABEL = {
    live: { text: 'Live — not run', cls: 'chain-inspector-chip-live' },
    materialized: { text: 'From last run', cls: 'chain-inspector-chip-mat' },
};

const formatCell = (v) => {
    if (v === null || v === undefined) return <span className="chain-inspector-null">null</span>;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

const ChainInspector = ({
    node, chainDefinition, chainFile, logs = [],
    pinned, onTogglePin, activeTab, onTabChange,
    onOpenFullPreview,
}) => {
    const [schemaCols, setSchemaCols] = useState([]);
    const [previewData, setPreviewData] = useState(null);
    const [sqlInfo, setSqlInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [width, setWidth] = useState(() => {
        const v = Number(localStorage.getItem('amoxsql-chain-inspector-width'));
        return v >= 320 ? v : 380;
    });
    const resizeCleanupRef = useRef(null);

    useEffect(() => {
        localStorage.setItem('amoxsql-chain-inspector-width', String(width));
    }, [width]);
    useEffect(() => () => { resizeCleanupRef.current?.(); }, []);

    const startResize = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = width;
        const onMove = (ev) => setWidth(Math.min(720, Math.max(320, startW + (startX - ev.clientX))));
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            resizeCleanupRef.current = null;
        };
        resizeCleanupRef.current = onUp;
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const nodeId = node?.id;
    const edgesSig = JSON.stringify((chainDefinition && chainDefinition.edges) || []);
    // Includes `disabled` — toggling it changes what this node compiles to
    // (a passthrough of its parent, server-side) without touching config.
    const configSig = JSON.stringify({ config: node?.data?.config || {}, disabled: !!node?.data?.disabled });

    useEffect(() => {
        if (!nodeId || !chainDefinition) { setSchemaCols([]); setPreviewData(null); setSqlInfo(null); return; }
        let cancelled = false;
        setLoading(true);
        const t = setTimeout(() => {
            const payload = { nodeId, chainDefinition, chainFile: chainFile || '' };
            Promise.all([
                fetch(`${API_BASE}/schema/infer`, { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) })
                    .then(r => r.json()).catch(() => ({ columns: [] })),
                fetch(`${API_BASE}/preview-node`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ ...payload, limit: 100 }) })
                    .then(r => r.json()).catch((err) => ({ available: false, error: err.message })),
                fetch(`${API_BASE}/node-sql`, { method: 'POST', headers: HEADERS, body: JSON.stringify(payload) })
                    .then(r => r.json()).catch(() => ({ sql: null })),
            ]).then(([schemaRes, previewRes, sqlRes]) => {
                if (cancelled) return;
                setSchemaCols(Array.isArray(schemaRes?.columns) ? schemaRes.columns : []);
                setPreviewData(previewRes);
                setSqlInfo(sqlRes);
            }).finally(() => { if (!cancelled) setLoading(false); });
        }, 350);
        return () => { cancelled = true; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId, chainFile, edgesSig, configSig]);

    const nodeLogs = useMemo(
        () => nodeId ? logs.filter(l => l.nodeId === nodeId) : [],
        [logs, nodeId]
    );

    const handleCopySql = () => {
        if (!sqlInfo?.sql) return;
        navigator.clipboard.writeText(sqlInfo.sql);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const resizeHandle = (
        <div className="chain-inspector-resize" onMouseDown={startResize} title="Drag to resize" />
    );

    if (!node) {
        return (
            <div className="chain-inspector" style={{ width, minWidth: width }}>
                {resizeHandle}
                <div className="chain-inspector-empty">
                    <LuInfo size={20} />
                    <p>Select a node to see its data, schema, SQL and log.</p>
                </div>
            </div>
        );
    }

    const nodeType = NODE_TYPES[node.data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;
    const source = SOURCE_LABEL[previewData?.source];

    return (
        <div className="chain-inspector" style={{ width, minWidth: width }}>
            {resizeHandle}
            <div className="chain-inspector-head">
                <Icon size={13} style={{ color: nodeType.color.accent }} />
                <span className="chain-inspector-title">{node.data.label || nodeType.label}</span>
                {pinned && <span className="chain-inspector-pinned-tag">pinned</span>}
                <button
                    className="chain-inspector-pin"
                    onClick={onTogglePin}
                    title={pinned ? 'Unpin — follow selection again' : 'Pin — keep showing this node while you select others'}
                >
                    {pinned ? <LuPinOff size={13} /> : <LuPin size={13} />}
                </button>
            </div>

            <div className="seg" style={{ margin: '7px 10px 0' }}>
                {['data', 'schema', 'sql', 'log'].map(t => (
                    <button
                        key={t}
                        onClick={() => onTabChange(t)}
                        className={`seg-item${activeTab === t ? ' seg-item--active' : ''}`}
                        style={{ textTransform: 'capitalize' }}
                    >
                        {t === 'data' ? 'Data' : t === 'schema' ? 'Schema' : t === 'sql' ? 'SQL' : 'Log'}
                    </button>
                ))}
            </div>

            <div className="chain-inspector-body">
                {activeTab === 'data' && (
                    <>
                        <div className="chain-inspector-subbar">
                            {loading ? <span className="chain-inspector-hint">Loading…</span> : (
                                <>
                                    {source && <span className={`chain-inspector-chip ${source.cls}`}>{source.text}</span>}
                                    {previewData?.available && (
                                        <span className="chain-inspector-hint" style={{ marginLeft: 'auto' }}>
                                            {Number(previewData.totalRows || 0).toLocaleString()} rows
                                        </span>
                                    )}
                                    {previewData?.table && (
                                        <button className="chain-inspector-openfull" onClick={() => onOpenFullPreview?.(previewData.table)} title="Open full-screen">
                                            <LuExternalLink size={12} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                        {!loading && !previewData?.available && (
                            <p className="chain-inspector-hint" style={{ padding: '10px 12px' }}>
                                {previewData?.reason || previewData?.error || 'No data available yet — connect an upstream source.'}
                            </p>
                        )}
                        {!loading && previewData?.available && (previewData.rows || []).length === 0 && (
                            <p className="chain-inspector-hint" style={{ padding: '10px 12px' }}>Output is empty (0 rows).</p>
                        )}
                        {!loading && previewData?.available && (previewData.rows || []).length > 0 && (
                            <div className="chain-inspector-table-wrap">
                                <table className="chain-inspector-table">
                                    <thead>
                                        <tr>
                                            {previewData.columns.map(c => <th key={c.name}>{c.name}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.rows.map((row, ri) => (
                                            <tr key={ri}>
                                                {previewData.columns.map(c => <td key={c.name}>{formatCell(row[c.name])}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'schema' && (
                    <div className="chain-inspector-schema">
                        <div className="chain-inspector-schema-section">
                            <label>Input columns</label>
                            {schemaCols.length === 0 ? (
                                <p className="chain-inspector-hint">No upstream columns yet — connect a source.</p>
                            ) : schemaCols.map((c, i) => (
                                <div key={`${c.name}-${i}`} className="chain-inspector-schema-row">
                                    <span>{c.name}</span><span className="chain-inspector-schema-type">{c.type}</span>
                                </div>
                            ))}
                        </div>
                        <div className="chain-inspector-schema-section">
                            <label>Output columns</label>
                            {!previewData?.available || (previewData.columns || []).length === 0 ? (
                                <p className="chain-inspector-hint">Not available yet.</p>
                            ) : previewData.columns.map((c, i) => (
                                <div key={`${c.name}-${i}`} className="chain-inspector-schema-row">
                                    <span>{c.name}</span><span className="chain-inspector-schema-type">{c.type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'sql' && (
                    <>
                        <div className="chain-inspector-subbar">
                            {sqlInfo?.sql && <span className={`chain-inspector-chip ${sqlInfo.source === 'live' ? 'chain-inspector-chip-live' : 'chain-inspector-chip-mat'}`}>{sqlInfo.source === 'live' ? 'Compiled live' : 'From last run'}</span>}
                            {sqlInfo?.sql && (
                                <button className="chain-inspector-openfull" style={{ marginLeft: 'auto' }} onClick={handleCopySql}>
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            )}
                        </div>
                        {!sqlInfo?.sql ? (
                            <p className="chain-inspector-hint" style={{ padding: '10px 12px' }}>{sqlInfo?.reason || 'No SQL available yet.'}</p>
                        ) : (
                            <pre className="chain-inspector-sql">{sqlInfo.sql}</pre>
                        )}
                    </>
                )}

                {activeTab === 'log' && (
                    <div className="chain-inspector-log">
                        {nodeLogs.length === 0 ? (
                            <p className="chain-inspector-hint" style={{ padding: '10px 12px' }}>No log lines for this node yet — run the chain (or from/to this node).</p>
                        ) : nodeLogs.map((l) => (
                            <div key={l.id} className={`chain-inspector-log-line chain-inspector-log-${l.type}`}>
                                <span className="chain-inspector-log-time">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : ''}</span>
                                <span>{l.message}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChainInspector;
