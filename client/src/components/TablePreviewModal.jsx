import { useState, useEffect } from 'react';
import { LuSearch, LuX } from "react-icons/lu";

const TablePreviewModal = ({ tableName, onClose }) => {
    const [data, setData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Determine quote style based on table name (simple check)
                // usually simple query is fine, backend handles connection
                const query = `SELECT * FROM "${tableName}" LIMIT 50;`;
                const response = await fetch('http://localhost:3001/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Failed to fetch preview');
                }

                const result = await response.json();
                if (result.data && result.data.length > 0) {
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

        if (tableName) {
            fetchData();
        }
    }, [tableName]);

    // Handle Escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(8px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)',
                color: 'var(--text-secondary)',
                width: '90%',
                height: '80%',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-default)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{
                    padding: '15px 20px',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--surface-raised)',
                    borderTopLeftRadius: '12px',
                    borderTopRightRadius: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <LuSearch size={18} />
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '500' }}>
                            Preview: <span style={{ color: 'var(--accent-color-user)', fontFamily: 'monospace' }}>{tableName}</span>
                        </h2>
                        <span style={{ fontSize: '12px', color: '#888', marginLeft: '10px' }}>
                            (First 50 rows)
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ccc',
                            fontSize: '20px',
                            cursor: 'pointer',
                            padding: '0 5px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <LuX size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                    {loading && (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                            Loading preview...
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '20px', color: '#f85149' }}>
                            Error: {error}
                        </div>
                    )}

                    {!loading && !error && data.length === 0 && (
                        <div style={{ padding: '20px', color: '#aaa', fontStyle: 'italic' }}>
                            Table is empty.
                        </div>
                    )}

                    {!loading && !error && data.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'Consolas, Monaco, monospace' }}>
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--header-bg)', zIndex: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                <tr>
                                    {columns.map(col => (
                                        <th key={col} style={{
                                            textAlign: 'left',
                                            padding: '8px 12px',
                                            borderBottom: '1px solid var(--border-color)',
                                            backgroundColor: 'var(--header-bg)',
                                            textTransform: 'uppercase',
                                            color: 'var(--accent-color-user)',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, idx) => (
                                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'var(--panel-bg)' : 'var(--input-bg)' }}>
                                        {columns.map(col => (
                                            <td key={`${idx}-${col}`} style={{
                                                padding: '6px 12px',
                                                borderBottom: '1px solid var(--border-color)',
                                                whiteSpace: 'nowrap',
                                                maxWidth: '300px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                color: row[col] === null ? 'var(--text-muted)' : 'var(--text-color)'
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

export default TablePreviewModal;
