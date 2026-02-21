import { useState, useEffect } from 'react';
import TablePreviewModal from './TablePreviewModal';
import TableDetailsModal from './TableDetailsModal';
import QueryHistoryModal from './QueryHistoryModal';
import {
    LuRefreshCw, LuEllipsisVertical, LuHistory, LuTable,
    LuHash, LuType, LuCalendar, LuSquareCheck, LuCode,
    LuClipboard, LuInfo, LuSearch, LuChevronRight, LuChevronDown, LuEye
} from "react-icons/lu";

const DatabaseExplorer = ({ currentDb, onRefresh, onTablesLoaded, onSelectQuery }) => {
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [previewTable, setPreviewTable] = useState(null); // Simple preview
    const [detailsTable, setDetailsTable] = useState(null); // Full Details Modal

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedTables, setExpandedTables] = useState({}); // { tableName: true/false }

    // History Modal State
    const [showHistory, setShowHistory] = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);

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
    };

    const toggleExpand = (tableName) => {
        setExpandedTables(prev => ({ ...prev, [tableName]: !prev[tableName] }));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', position: 'relative' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Database Schema</span>
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

            {/* Content Container - Tree View & Search */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="text"
                            placeholder="Search tables & views..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                border: '1px solid var(--border-color)', borderRadius: '4px',
                                padding: '4px 8px 4px 24px', fontSize: '11px', outline: 'none'
                            }}
                        />
                        <LuSearch size={12} color="var(--text-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading && <div style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div>}
                    {!loading && tables.length === 0 && (
                        <div style={{ padding: '10px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '12px' }}>No tables found</div>
                    )}

                    {tables.filter(t => {
                        if (!searchQuery) return true;
                        const q = searchQuery.toLowerCase();
                        if (t.name.toLowerCase().includes(q)) return true;
                        if (t.columns && t.columns.some(col => col.column_name.toLowerCase().includes(q))) return true;
                        return false;
                    }).map(table => {
                        const q = searchQuery.toLowerCase();
                        const matchesColumn = q && table.columns && table.columns.some(col => col.column_name.toLowerCase().includes(q)) && !table.name.toLowerCase().includes(q);
                        const isExpanded = !!expandedTables[table.name] || matchesColumn;
                        const TableIcon = table.type?.toLowerCase().includes('view') ? LuEye : LuTable;

                        return (
                            <div key={table.name} style={{ display: 'flex', flexDirection: 'column' }}>
                                {/* Table Item */}
                                <div
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', table.name);
                                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'table', name: table.name }));
                                    }}
                                    onClick={() => toggleExpand(table.name)}
                                    className="file-item"
                                    style={{
                                        padding: '4px 10px 4px 0px', // Custom padding for chevron
                                        cursor: 'pointer',
                                        color: 'var(--text-active)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '13px',
                                    }}
                                    title="Drag to editor or right click for operations"
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setContextMenu({ x: e.clientX, y: e.clientY, tableName: table.name });
                                    }}
                                >
                                    <div style={{ display: 'flex', width: '20px', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                        {isExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                    </div>
                                    <TableIcon size={14} color="var(--accent-color-user)" />
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.name}</span>
                                    <span
                                        onClick={(e) => handleCopy(e, table.name)}
                                        title="Copy Table Name"
                                        style={{ fontSize: '12px', color: 'var(--text-muted)', opacity: 0.6, marginLeft: 'auto', display: 'flex', alignItems: 'center' }}
                                    >
                                        <LuClipboard size={12} />
                                    </span>
                                </div>

                                {/* Columns Node */}
                                {isExpanded && table.columns && (
                                    <div style={{ boxSizing: 'border-box', borderLeft: '1px solid var(--border-color)', margin: '0 0 5px 20px', display: 'flex', flexDirection: 'column' }}>
                                        {table.columns.map((col, idx) => {
                                            const meta = getTypeMeta(col.data_type);
                                            return (
                                                <div
                                                    key={`${col.column_name}-${idx}`}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('text/plain', col.column_name);
                                                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'column', name: col.column_name, tableName: table.name }));
                                                        e.stopPropagation();
                                                    }}
                                                    className="file-item"
                                                    style={{
                                                        padding: '4px 10px 4px 10px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        fontSize: '12px',
                                                        cursor: 'grab',
                                                        color: 'var(--text-color)'
                                                    }}
                                                    title="Drag column to editor"
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                        <div style={{ width: '14px', textAlign: 'center', color: meta.color }}>{meta.icon}</div>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.column_name}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{col.data_type.toLowerCase()}</span>
                                                        <span
                                                            onClick={(e) => handleCopy(e, col.column_name)}
                                                            title="Copy Column Name"
                                                            style={{ cursor: 'pointer', opacity: 0.5, fontSize: '12px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}
                                                        >
                                                            <LuClipboard size={12} />
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
