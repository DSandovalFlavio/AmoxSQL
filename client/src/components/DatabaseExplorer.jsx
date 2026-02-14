import { useState, useEffect, useRef } from 'react';
import TablePreviewModal from './TablePreviewModal'; // Legacy Preview? Can enable this one or use new one
import TableDetailsModal from './TableDetailsModal';

const DatabaseExplorer = ({ currentDb, onRefresh, onTablesLoaded }) => {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedTable, setSelectedTable] = useState(null);
    const [previewTable, setPreviewTable] = useState(null); // Simple preview
    const [detailsTable, setDetailsTable] = useState(null); // Full Details Modal

    // Resizing State
    const [tableListHeight, setTableListHeight] = useState(200);
    const isResizingDb = useRef(false);
    const lastY = useRef(0); // Track Y position

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, tableName }

    useEffect(() => {
        const handleClickOutside = () => setContextMenu(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        fetchTables();
    }, [currentDb]);

    useEffect(() => {
        if (onRefresh) fetchTables();
    }, [onRefresh]);

    // Resize Handlers
    const startResizing = (e) => {
        e.preventDefault();
        isResizingDb.current = true;
        lastY.current = e.clientY; // Capture start Y
        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResizing);
    };

    const stopResizing = () => {
        isResizingDb.current = false;
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResizing);
    };

    const resize = (e) => {
        if (isResizingDb.current) {
            const deltaY = e.clientY - lastY.current;
            lastY.current = e.clientY; // Update last Y for next frame

            setTableListHeight(prev => {
                let newHeight = prev + deltaY;
                if (isNaN(newHeight)) newHeight = 200; // Safety fallback
                // Constraints
                if (newHeight < 100) return 100;
                if (newHeight > 600) return 600;
                return newHeight;
            });
        }
    };

    const fetchTables = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/db/tables');
            if (response.ok) {
                const data = await response.json();
                setTables(data);
                if (onTablesLoaded) onTablesLoaded(data);
            }
        } catch (err) {
            console.error("Failed to fetch tables", err);
        } finally {
            setLoading(false);
        }
    };

    // Helper: Map SQL Types to Icons/Colors
    // 123 (Int), # (Float), T (Text), 📅 (Date), ☑ (Bool)
    const getTypeMeta = (type) => {
        const t = type.toUpperCase();
        if (t.includes('INT')) return { icon: '123', color: '#9cdcfe', label: 'Integer' };
        if (t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL')) return { icon: '#', color: '#b5cea8', label: 'Number' };
        if (t.includes('CHAR') || t.includes('TEXT') || t.includes('STRING')) return { icon: 'T', color: '#ce9178', label: 'Text' };
        if (t.includes('DATE') || t.includes('TIME')) return { icon: '📅', color: '#569cd6', label: 'Date/Time' };
        if (t.includes('BOOL')) return { icon: '☑', color: '#c586c0', label: 'Boolean' };
        return { icon: '{}', color: '#dcdcaa', label: type };
    };

    const handleCopy = (e, text) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        // Optional: toast feedback
    };

    const fetchRowCount = async (tableName) => {
        try {
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `SELECT COUNT(*) as count FROM "${tableName}"` }),
            });
            const data = await response.json();
            if (data && data.data && data.data[0]) {
                // Neo might return { count: 123 } or { count: 123n } (BigInt)
                // We handled BigInt serialization in backend, so it should be number or string
                return data.data[0].count;
            }
        } catch (e) {
            console.warn("Row count fetch failed", e);
        }
        return '?';
    };

    const handleTableClick = async (table) => {
        // Optimistic UI
        setSelectedTable({ ...table, rowCount: '...' });

        // Fetch real count
        const count = await fetchRowCount(table.name);
        setSelectedTable(prev => {
            if (prev && prev.name === table.name) {
                return { ...prev, rowCount: count };
            }
            return prev;
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid #2C2E33' }}>
            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: '#00ffff' }}>Database Schema</span>
                <button onClick={fetchTables} title="Refresh" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#909296', fontSize: '14px' }}>
                    ↻
                </button>
            </div>

            {/* Content Container - Split View */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* TOP: Table List (Resizable Height) */}
                <div style={{ height: tableListHeight, overflowY: 'auto', flexShrink: 0 }}>
                    {loading && <div style={{ padding: '10px', color: '#888', fontSize: '12px' }}>Loading...</div>}
                    {!loading && tables.length === 0 && (
                        <div style={{ padding: '10px', color: '#888', fontStyle: 'italic', fontSize: '12px' }}>No tables found</div>
                    )}

                    {tables.map(table => (
                        <div
                            key={table.name}
                            onClick={() => handleTableClick(table)}
                            className="file-item"
                            style={{
                                padding: '4px 20px', // Match standard padding
                                cursor: 'pointer',
                                backgroundColor: selectedTable?.name === table.name ? '#25262B' : 'transparent',
                                color: selectedTable?.name === table.name ? '#fff' : '#ccc',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                position: 'relative' // For absolute positioning if needed
                            }}
                            title="Right click for options"
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    tableName: table.name
                                });
                            }}
                        >
                            <span>🗃️</span>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.name}</span>

                            {/* Copy Button (on hover or always visible to start) */}
                            <span
                                onClick={(e) => { handleCopy(e, table.name); alert("Copied!"); }}
                                title="Copy Table Name"
                                style={{ fontSize: '10px', color: '#666', opacity: 0.6 }}
                            >
                                📋
                            </span>
                        </div>
                    ))}
                </div>

                {/* RESIZER HANDLE */}
                <div
                    onMouseDown={startResizing}
                    style={{
                        height: '4px',
                        cursor: 'row-resize',
                        backgroundColor: '#1A1B1E',
                        borderTop: '1px solid #2C2E33',
                        borderBottom: '1px solid #2C2E33',
                        transition: 'background 0.2s',
                        zIndex: 10
                    }}
                    onMouseOver={(e) => e.target.style.background = '#00ffff'}
                    onMouseOut={(e) => e.target.style.background = '#1A1B1E'}
                />

                {/* BOTTOM: Details Panel (Takes remaining space) */}
                <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#141517' }}>
                    {selectedTable ? (
                        <div>
                            {/* Details Header */}
                            <div style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid #2C2E33',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                position: 'sticky',
                                top: 0,
                                backgroundColor: '#141517', // Keep sticky header opaque matching theme
                                zIndex: 1
                            }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#00ffff', fontSize: '11px' }}>
                                        {selectedTable.name}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#888' }}>
                                        {selectedTable.rowCount ? `${selectedTable.rowCount} rows` : ''} • {selectedTable.columns.length} cols
                                    </div>
                                </div>

                                {/* Preview Button */}
                                <button
                                    onClick={() => setPreviewTable(selectedTable.name)}
                                    title="Preview Table (First 50 rows)"
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #444',
                                        borderRadius: '3px',
                                        color: '#d4d4d4',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        padding: '2px 6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                    onMouseOver={(e) => e.target.style.backgroundColor = '#37373d'}
                                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                                >
                                    <span style={{ fontSize: '14px' }}>🔎</span>
                                </button>
                            </div>

                            {/* Column Grid */}
                            <div style={{ padding: '0' }}>
                                {selectedTable.columns.map(col => {
                                    const meta = getTypeMeta(col.data_type);
                                    return (
                                        <div key={col.column_name} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '4px 10px',
                                            borderBottom: '1px solid #2C2E33',
                                            fontSize: '12px',
                                            gap: '10px' // spacing between Left and Right groups
                                        }}>
                                            {/* Left: Icon + Name */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                                                <div title={meta.label} style={{
                                                    width: '18px',
                                                    textAlign: 'center',
                                                    color: meta.color,
                                                    fontWeight: 'bold',
                                                    fontSize: '10px'
                                                }}>
                                                    {meta.icon}
                                                </div>
                                                <span title={col.column_name} style={{
                                                    color: '#d4d4d4',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {col.column_name}
                                                </span>
                                            </div>

                                            {/* Right: Type Label + Copy */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ color: '#666', fontSize: '10px' }}>
                                                    {col.data_type.toLowerCase()}
                                                </div>
                                                <span
                                                    onClick={(e) => handleCopy(e, col.column_name)}
                                                    title="Copy Column Name"
                                                    className="copy-icon"
                                                    style={{ cursor: 'pointer', opacity: 0.5, fontSize: '12px' }}
                                                >
                                                    📋
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                            <div style={{ fontSize: '24px', marginBottom: '5px' }}>🔍</div>
                            <div style={{ fontSize: '12px' }}>Select a table</div>
                            <div style={{ fontSize: '12px' }}>to view details</div>
                        </div>
                    )}
                </div>

            </div>

            {/* Preview Modal (Simple) */}
            {previewTable && (
                <TablePreviewModal
                    tableName={previewTable}
                    onClose={() => setPreviewTable(null)}
                />
            )}

            {/* Full Details Modal */}
            <TableDetailsModal
                isOpen={!!detailsTable}
                tableName={detailsTable}
                onClose={() => setDetailsTable(null)}
            />

            {/* Custom Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: '#25262B',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    zIndex: 9999,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px 0'
                }}>
                    <div
                        style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '12px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#37373d'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                            navigator.clipboard.writeText(contextMenu.tableName);
                            setContextMenu(null);
                        }}
                    >
                        <span>📋</span> Copy Name
                    </div>
                    <div
                        style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '12px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#37373d'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                            setDetailsTable(contextMenu.tableName);
                            setContextMenu(null);
                        }}
                    >
                        <span>ℹ️</span> View Details
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseExplorer;
