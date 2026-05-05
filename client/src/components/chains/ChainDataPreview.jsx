/**
 * ChainDataPreview — Modal to preview the data produced by a node.
 * Uses the same inline-style modal pattern as TableDetailsModal.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LuX, LuLoader, LuTable2 } from 'react-icons/lu';

const API_BASE = 'http://localhost:3001/api/chains';

const ChainDataPreview = ({ tableName, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!tableName) return;
        setLoading(true);
        setError(null);

        fetch(`${API_BASE}/preview/${encodeURIComponent(tableName)}?limit=50`)
            .then(res => res.json())
            .then(result => {
                if (result.error) { setError(result.error); return; }
                setData(result);
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [tableName]);

    const formatCell = (value) => {
        if (value === null || value === undefined) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 10 }}>null</span>;
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    const modal = (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)',
                zIndex: 2000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(6px)',
            }}
            onClick={onClose}
        >
            <div
                className="modal-panel"
                style={{
                    width: 'min(92vw, 900px)',
                    height: '70vh',
                    backgroundColor: 'var(--surface-overlay)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-default)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-default)',
                    background: 'var(--surface-raised)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <LuTable2 size={15} style={{ color: 'var(--accent-color-user)' }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-active)' }}>{tableName}</span>
                        {data && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {data.rows.length} of {Number(data.totalRows).toLocaleString()} rows
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <LuX size={15} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
                    {loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40, color: 'var(--text-muted)' }}>
                            <LuLoader size={22} className="chain-node-spin" />
                            <span style={{ fontSize: 13 }}>Loading preview...</span>
                        </div>
                    )}

                    {error && (
                        <div style={{ margin: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(224,108,117,0.1)', color: '#e06c75', fontSize: 13 }}>
                            Table "{tableName}" is not available for preview.<br />
                            <small style={{ opacity: 0.7 }}>{error}</small>
                        </div>
                    )}

                    {data && !loading && (
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                            <thead>
                                <tr>
                                    <th style={{ position: 'sticky', top: 0, background: 'var(--surface-raised)', border: '1px solid var(--border-default)', padding: '5px 8px', color: 'var(--text-muted)', width: 40, textAlign: 'center', zIndex: 1 }}>#</th>
                                    {data.columns.map(col => (
                                        <th key={col.name} style={{ position: 'sticky', top: 0, background: 'var(--surface-raised)', border: '1px solid var(--border-default)', padding: '5px 8px', textAlign: 'left', whiteSpace: 'nowrap', zIndex: 1 }}>
                                            <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-active)' }}>{col.name}</span>
                                            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{col.type}</span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map((row, ri) => (
                                    <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                        <td style={{ border: '1px solid var(--border-default)', padding: '4px 8px', color: 'var(--text-muted)', textAlign: 'center', background: 'var(--surface-raised)' }}>{ri + 1}</td>
                                        {data.columns.map(col => (
                                            <td key={col.name} style={{ border: '1px solid var(--border-default)', padding: '4px 8px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {formatCell(row[col.name])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                {data && data.totalRows > data.rows.length && (
                    <div style={{ padding: '6px 14px', borderTop: '1px solid var(--border-default)', background: 'var(--surface-raised)', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                        Showing first {data.rows.length} of {Number(data.totalRows).toLocaleString()} rows
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default ChainDataPreview;
