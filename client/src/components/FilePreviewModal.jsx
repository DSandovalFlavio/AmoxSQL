/**
 * FilePreviewModal — quick 100-row preview for CSV / Parquet / JSON files.
 * Mirrors the style of TablePreviewModal but queries with the file-path syntax
 * that DuckDB supports: SELECT * FROM 'path/to/file.csv' LIMIT 100
 */
import { API_BASE } from '../api.js';
import { useState, useEffect } from 'react';
import { LuEye, LuX, LuFileSpreadsheet } from 'react-icons/lu';

const FilePreviewModal = ({ filePath, onClose }) => {
    const [data, setData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fileName = filePath ? filePath.split(/[/\\]/).pop() : '';
    const normalizedPath = filePath ? filePath.replace(/\\/g, '/') : '';

    useEffect(() => {
        if (!filePath) return;
        const fetchPreview = async () => {
            setLoading(true);
            setError(null);
            try {
                const query = `SELECT * FROM '${normalizedPath}' LIMIT 100`;
                const response = await fetch(`${API_BASE}/api/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query }),
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Preview failed');
                }
                const result = await response.json();
                if (result.data?.length > 0) {
                    setColumns(Object.keys(result.data[0]));
                    setData(result.data);
                } else {
                    setData([]);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchPreview();
    }, [filePath, normalizedPath]);

    // Escape to close
    useEffect(() => {
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            role="dialog" aria-modal="true"
            style={{
                position: 'fixed', inset: 0,
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                zIndex: 1100, backdropFilter: 'blur(8px)',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'var(--surface-overlay)',
                    width: '90%', height: '80%',
                    maxHeight: 'calc(100vh - 80px)',
                    borderRadius: '12px',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-default)',
                    overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: 'var(--surface-raised)',
                    borderTopLeftRadius: '12px', borderTopRightRadius: '12px',
                    flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <LuFileSpreadsheet size={18} color="var(--accent-primary, #00DDDD)" />
                        <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            Preview:{' '}
                            <span style={{ color: 'var(--accent-primary, #00DDDD)', fontFamily: 'monospace' }}>
                                {fileName}
                            </span>
                        </span>
                        {!loading && !error && (
                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {data.length > 0 ? `${data.length} rows (first 100)` : 'Empty file'}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close preview"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
                    >
                        <LuX size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {loading && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', gap: '10px' }}>
                            <LuEye size={20} style={{ opacity: 0.5 }} />
                            Loading preview…
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: '20px', color: 'var(--feedback-error-text, #f87171)' }}>
                            <strong>Preview failed:</strong> {error}
                        </div>
                    )}
                    {!loading && !error && data.length === 0 && (
                        <div style={{ padding: '24px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            File is empty or could not be read.
                        </div>
                    )}
                    {!loading && !error && data.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: "'JetBrains Mono', Consolas, monospace" }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr>
                                    {columns.map(col => (
                                        <th key={col} style={{
                                            textAlign: 'left', padding: '8px 12px',
                                            borderBottom: '1px solid var(--border-subtle)',
                                            backgroundColor: 'var(--surface-raised)',
                                            color: 'var(--accent-primary, #00DDDD)',
                                            fontWeight: 600, whiteSpace: 'nowrap', fontSize: '12px',
                                        }}>
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, idx) => (
                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--surface-raised, rgba(255,255,255,0.02))' }}>
                                        {columns.map(col => (
                                            <td key={`${idx}-${col}`} style={{
                                                padding: '6px 12px',
                                                borderBottom: '1px solid var(--border-subtle)',
                                                whiteSpace: 'nowrap', maxWidth: '320px',
                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                color: row[col] === null ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                                fontStyle: row[col] === null ? 'italic' : 'normal',
                                            }}>
                                                {row[col] === null ? 'NULL' : String(row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FilePreviewModal;
