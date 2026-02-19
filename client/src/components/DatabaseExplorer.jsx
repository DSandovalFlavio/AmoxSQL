import { useState, useEffect, useRef } from 'react';
import TablePreviewModal from './TablePreviewModal';
import TableDetailsModal from './TableDetailsModal';
import QueryHistoryModal from './QueryHistoryModal';
import {
    LuRefreshCw, LuEllipsisVertical, LuHistory, LuTable,
    LuHash, LuType, LuCalendar, LuSquareCheck, LuCode,
    LuClipboard, LuInfo, LuSearch
} from "react-icons/lu";

const DatabaseExplorer = ({ currentDb, onRefresh, onTablesLoaded, onSelectQuery }) => {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedTable, setSelectedTable] = useState(null);
    const [previewTable, setPreviewTable] = useState(null); // Simple preview
    const [detailsTable, setDetailsTable] = useState(null); // Full Details Modal

    // History Modal State
    const [showHistory, setShowHistory] = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);

    // Resizing State
    const [tableListHeight, setTableListHeight] = useState(200);
    const isResizingDb = useRef(false);
    const lastY = useRef(0); // Track Y position

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, tableName }

    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
            setShowHeaderMenu(false);
        };
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
        if (t.includes('INT')) return { icon: <LuHash size={12} />, color: '#9cdcfe', label: 'Integer' };
        if (t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL')) return { icon: <LuHash size={12} />, color: '#b5cea8', label: 'Number' };
        if (t.includes('CHAR') || t.includes('TEXT') || t.includes('STRING')) return { icon: <LuType size={12} />, color: '#ce9178', label: 'Text' };
        if (t.includes('DATE') || t.includes('TIME')) return { icon: <LuCalendar size={12} />, color: '#569cd6', label: 'Date/Time' };
        if (t.includes('BOOL')) return { icon: <LuSquareCheck size={12} />, color: '#c586c0', label: 'Boolean' };
        return { icon: <LuCode size={12} />, color: '#dcdcaa', label: type };
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid var(--border-color)' }}>
            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', position: 'relative' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: 'var(--accent-color-user)' }}>Database Schema</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={fetchTables} title="Refresh" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex', alignItems: 'center' }}>
                        <LuRefreshCw size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(!showHeaderMenu); }}
                        title="Options"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color)', display: 'flex', alignItems: 'center' }}
                    >
                        <LuEllipsisVertical size={14} />
                    </button>

                    {/* Header Menu */}
                    {showHeaderMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '30px',
                            right: '10px',
                            background: 'var(--modal-bg)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            zIndex: 9999,
                            boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '4px 0',
                            minWidth: '120px'
                        }}>
                            <div
                                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'var(--hover-color)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                onClick={() => {
                                    setShowHistory(true);
                                    setShowHeaderMenu(false);
                                }}
                            >
                                <LuHistory size={14} /> <span>Query History</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Container - Split View */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* TOP: Table List (Resizable Height) */}
                <div style={{ height: tableListHeight, overflowY: 'auto', flexShrink: 0 }}>
                    {loading && <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div>}
                    {!loading && tables.length === 0 && (
                        <div style={{ padding: '10px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px' }}>No tables found</div>
                    )}

                    {tables.map(table => (
                        <div
                            key={table.name}
                            onClick={() => handleTableClick(table)}
                            className="file-item"
                            style={{
                                padding: '4px 20px', // Match standard padding
                                cursor: 'pointer',
                                backgroundColor: selectedTable?.name === table.name ? 'var(--sidebar-item-active-bg)' : 'transparent',
                                color: selectedTable?.name === table.name ? 'var(--text-active)' : 'var(--text-color)',
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
                            <LuTable size={14} color="var(--accent-color-user)" />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.name}</span>

                            {/* Copy Button (on hover or always visible to start) */}
                            <span
                                onClick={(e) => { handleCopy(e, table.name); }}
                                title="Copy Table Name"
                                style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.6, marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
                            >
                                <LuClipboard size={12} />
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
                        backgroundColor: 'var(--sidebar-bg)',
                        borderTop: '1px solid var(--border-color)',
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background 0.2s',
                        zIndex: 10
                    }}
                    onMouseOver={(e) => e.target.style.background = 'var(--accent-color-user)'}
                    onMouseOut={(e) => e.target.style.background = 'var(--sidebar-bg)'}
                />

                {/* BOTTOM: Details Panel (Takes remaining space) */}
                <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--sidebar-bg)' }}>
                    {selectedTable ? (
                        <div>
                            {/* Details Header */}
                            <div style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                position: 'sticky',
                                top: 0,
                                backgroundColor: 'var(--sidebar-bg)', // Keep sticky header opaque matching theme
                                zIndex: 1
                            }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--accent-color-user)', fontSize: '11px' }}>
                                        {selectedTable.name}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {selectedTable.rowCount ? `${selectedTable.rowCount} rows` : ''} • {selectedTable.columns.length} cols
                                    </div>
                                </div>

                                {/* Preview Button */}
                                <button
                                    onClick={() => setPreviewTable(selectedTable.name)}
                                    title="Preview Table (First 50 rows)"
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '3px',
                                        color: 'var(--text-color)',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        padding: '2px 6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                    onMouseOver={(e) => e.target.style.backgroundColor = 'var(--hover-color)'}
                                    onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                                >
                                    <LuSearch size={14} />
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
                                            borderBottom: '1px solid var(--border-color)',
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
                                                    fontSize: '10px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {meta.icon}
                                                </div>
                                                <span title={col.column_name} style={{
                                                    color: 'var(--text-color)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {col.column_name}
                                                </span>
                                            </div>

                                            {/* Right: Type Label + Copy */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                                                    {col.data_type.toLowerCase()}
                                                </div>
                                                <span
                                                    onClick={(e) => handleCopy(e, col.column_name)}
                                                    title="Copy Column Name"
                                                    className="copy-icon"
                                                    style={{ cursor: 'pointer', opacity: 0.5, fontSize: '12px', display: 'flex', alignItems: 'center' }}
                                                >
                                                    <LuClipboard size={12} />
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            <div style={{ marginBottom: '10px', opacity: 0.5 }}><LuSearch size={40} /></div>
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

            {/* Query History Modal */}
            <QueryHistoryModal
                isOpen={showHistory}
                onClose={() => setShowHistory(false)}
                onSelect={onSelectQuery} // Pass select handler if parent supports it
            />

            {/* Custom Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    background: 'var(--modal-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    zIndex: 9999,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '4px 0'
                }}>
                    <div
                        style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--hover-color)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                            navigator.clipboard.writeText(contextMenu.tableName);
                            setContextMenu(null);
                        }}
                    >
                        <LuClipboard size={14} /> Copy Name
                    </div>
                    <div
                        style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--hover-color)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                            setDetailsTable(contextMenu.tableName);
                            setContextMenu(null);
                        }}
                    >
                        <LuInfo size={14} /> View Details
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatabaseExplorer;
