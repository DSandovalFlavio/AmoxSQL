import { useState, useEffect } from 'react';
import { LuTable, LuX } from "react-icons/lu";

const TableDetailsModal = ({ isOpen, onClose, tableName }) => {
    const [activeTab, setActiveTab] = useState('schema'); // schema, details, preview, ddl
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Pagination for Preview
    const [page, setPage] = useState(1);
    const pageSize = 100;

    useEffect(() => {
        if (isOpen && tableName) {
            fetchDetails();
        } else {
            // Reset state on close
            setData(null);
            setActiveTab('schema');
            setPage(1);
        }
    }, [isOpen, tableName]);

    // Re-fetch preview when page changes if we implement server-side pagination per page
    // For now, let's fetch first 200 rows as requested (user said "preview of 200 rows with 100 per page")
    // So we can fetch 200 once, and client-side page.

    const fetchDetails = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('http://localhost:3001/api/db/table-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tableName, limit: 200, offset: 0 })
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            setData(json);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    // Render Helpers
    const renderSchema = () => {
        if (!data) return null;
        return (
            <div style={{ padding: '0', height: '100%', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#1A1B1E', zIndex: 1, borderBottom: '1px solid #333' }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '10px' }}>Field name</th>
                            <th style={{ textAlign: 'left', padding: '10px' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '10px' }}>Null</th>
                            <th style={{ textAlign: 'left', padding: '10px' }}>Key</th>
                            <th style={{ textAlign: 'left', padding: '10px' }}>Default</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.schema.map((col, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #2C2E33' }}>
                                <td style={{ padding: '10px', color: '#fff' }}>{col.column_name}</td>
                                <td style={{ padding: '10px', color: '#9cdcfe' }}>{col.column_type}</td>
                                <td style={{ padding: '10px', color: '#888' }}>{col.null}</td>
                                <td style={{ padding: '10px', color: '#888' }}>{col.key}</td>
                                <td style={{ padding: '10px', color: '#888' }}>{col.default}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderDetails = () => {
        if (!data) return null;
        return (
            <div style={{ padding: '20px', color: '#d4d4d4' }}>
                <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '20px' }}>Table Metadata</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '15px', fontSize: '13px' }}>
                    <div style={{ color: '#888' }}>Table Name</div>
                    <div>{data.tableName}</div>

                    <div style={{ color: '#888' }}>Row Count</div>
                    <div>{data.totalRows}</div>

                    <div style={{ color: '#888' }}>Format</div>
                    <div>DuckDB Table</div>

                    {/* We could add generic info time here if avail */}
                </div>
            </div>
        );
    };

    const renderPreview = () => {
        if (!data || !data.preview) return null;

        const totalPreviewRows = data.preview.length;
        const startIdx = (page - 1) * pageSize;
        const currentRows = data.preview.slice(startIdx, startIdx + pageSize);

        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1A1B1E', zIndex: 1, borderBottom: '1px solid #333' }}>
                            <tr>
                                <th style={{ padding: '8px', width: '50px', color: '#666', borderRight: '1px solid #333' }}>#</th>
                                {data.schema.map((col, idx) => (
                                    <th key={idx} style={{ padding: '8px', borderRight: '1px solid #333', textAlign: 'left', color: '#ccc' }}>
                                        {col.column_name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {currentRows.map((row, rIdx) => (
                                <tr key={rIdx} style={{ borderBottom: '1px solid #252525' }}>
                                    <td style={{ padding: '6px', color: '#666', borderRight: '1px solid #333', textAlign: 'right' }}>
                                        {startIdx + rIdx + 1}
                                    </td>
                                    {data.schema.map((col, cIdx) => (
                                        <td key={cIdx} style={{ padding: '6px', borderRight: '1px solid #333', color: '#ddd' }}>
                                            {row[col.column_name]?.toString()}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                <div style={{
                    padding: '10px', borderTop: '1px solid #333',
                    display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center',
                    background: '#141517'
                }}>
                    <span style={{ fontSize: '12px', color: '#888' }}>
                        Showing {startIdx + 1}-{Math.min(startIdx + pageSize, totalPreviewRows)} of {totalPreviewRows}
                    </span>
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        style={{ padding: '4px 10px', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
                    >Previous</button>
                    <button
                        disabled={startIdx + pageSize >= totalPreviewRows}
                        onClick={() => setPage(p => p + 1)}
                        style={{ padding: '4px 10px', cursor: (startIdx + pageSize >= totalPreviewRows) ? 'default' : 'pointer', opacity: (startIdx + pageSize >= totalPreviewRows) ? 0.5 : 1 }}
                    >Next</button>
                </div>
            </div>
        );
    };

    const renderProfile = () => {
        if (!data || !data.profile) return (
            <div style={{ padding: '20px', color: '#888' }}>No profile data available.</div>
        );

        return (
            <div style={{ height: '100%', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#1A1B1E', zIndex: 1, borderBottom: '1px solid #333' }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '10px', color: '#ccc' }}>Column</th>
                            <th style={{ textAlign: 'left', padding: '10px', color: '#ccc' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '10px', color: '#ccc' }}>Nulls %</th>
                            <th style={{ textAlign: 'left', padding: '10px', color: '#ccc' }}>Unique</th>
                            <th style={{ textAlign: 'left', padding: '10px', color: '#ccc' }}>Min</th>
                            <th style={{ textAlign: 'left', padding: '10px', color: '#ccc' }}>Max</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.profile.map((col, idx) => {
                            // Normalize DuckDB summarize output which can be '50%' string or 50 number
                            let nullPct = typeof col.null_percentage === 'string' ? parseFloat(col.null_percentage) : col.null_percentage;
                            if (isNaN(nullPct)) nullPct = 0;

                            return (
                                <tr key={idx} style={{ borderBottom: '1px solid #2C2E33' }}>
                                    <td style={{ padding: '8px 10px', color: '#fff' }}>{col.column_name}</td>
                                    <td style={{ padding: '8px 10px', color: '#9cdcfe' }}>{col.column_type}</td>

                                    {/* Sparkline-ish Null Bar */}
                                    <td style={{ padding: '8px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '60px', height: '4px', background: '#333', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ width: `${Math.min(nullPct, 100)}%`, height: '100%', background: nullPct > 0 ? '#ff6b6b' : '#333' }}></div>
                                            </div>
                                            <span style={{ color: nullPct > 0 ? '#ff6b6b' : '#888' }}>{nullPct.toFixed(1)}%</span>
                                        </div>
                                    </td>

                                    <td style={{ padding: '8px 10px', color: '#dcdcaa' }}>{col.approx_unique}</td>
                                    <td style={{ padding: '8px 10px', color: '#888' }}>{col.min || '-'}</td>
                                    <td style={{ padding: '8px 10px', color: '#888' }}>{col.max || '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderDDL = () => {
        if (!data) return null;
        return (
            <div style={{ padding: '20px', height: '100%', boxSizing: 'border-box' }}>
                <textarea
                    readOnly
                    value={data.ddl || '-- DDL not available'}
                    style={{
                        width: '100%', height: '100%',
                        background: '#141517', color: '#d4d4d4',
                        border: '1px solid #333', padding: '15px',
                        fontFamily: 'monospace', fontSize: '13px',
                        resize: 'none'
                    }}
                />
            </div>
        );
    }


    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                width: '90%', height: '90%',
                backgroundColor: '#1E1F22',
                borderRadius: '8px',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                border: '1px solid #333'
            }}>
                {/* Header */}
                <div style={{
                    padding: '15px 20px', borderBottom: '1px solid #333', background: '#141517',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <LuTable size={20} color="#00ffff" />
                        {tableName}
                    </h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    ><LuX size={24} /></button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #333', background: '#1A1B1E' }}>
                    {['Schema', 'Profile', 'Details', 'Preview', 'DDL'].map(tab => {
                        const key = tab.toLowerCase();
                        const isActive = activeTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => { setActiveTab(key); setPage(1); }}
                                style={{
                                    padding: '10px 20px',
                                    background: isActive ? '#1E1F22' : 'transparent',
                                    color: isActive ? '#00ffff' : '#888',
                                    border: 'none',
                                    borderBottom: isActive ? '2px solid #00ffff' : '2px solid transparent',
                                    cursor: 'pointer',
                                    fontWeight: isActive ? '600' : 'normal',
                                    fontSize: '13px'
                                }}
                            >
                                {tab}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    {loading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30,31,34,0.8)', zIndex: 10 }}>
                            Loading details...
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: '20px', color: '#ff6b6b' }}>Error: {error}</div>
                    )}

                    {!loading && !error && (
                        <>
                            {activeTab === 'schema' && renderSchema()}
                            {activeTab === 'profile' && renderProfile()}
                            {activeTab === 'details' && renderDetails()}
                            {activeTab === 'preview' && renderPreview()}
                            {activeTab === 'ddl' && renderDDL()}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TableDetailsModal;
