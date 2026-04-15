import { useState, useEffect, memo, useDeferredValue } from 'react';
import TablePreviewModal from './TablePreviewModal';
import TableDetailsModal from './TableDetailsModal';
import QueryHistoryModal from './QueryHistoryModal';
import {
    LuRefreshCw, LuEllipsisVertical, LuHistory, LuTable,
    LuHash, LuType, LuCalendar, LuSquareCheck, LuCode,
    LuClipboard, LuInfo, LuSearch, LuChevronRight, LuChevronDown, LuEye, LuShieldCheck,
    LuWorkflow, LuArrowLeft, LuDatabase, LuFolder
} from "react-icons/lu";
import DeleteConfirmModal from './DeleteConfirmModal';

/**
 * Builds a schema-qualified name: "schema"."table" for non-main schemas, just "table" for main.
 */
const qualifiedName = (schema, tableName) => {
    if (!schema || schema === 'main') return `"${tableName}"`;
    return `"${schema}"."${tableName}"`;
};

/**
 * Returns a display name for drag/drop and copy operations.
 */
const displayName = (schema, tableName) => {
    if (!schema || schema === 'main') return tableName;
    return `${schema}.${tableName}`;
};

const DatabaseExplorer = ({ currentDb, onRefresh, onTablesLoaded, onSelectQuery, onQualityCheck, onOpenErDiagram }) => {
    const [schemas, setSchemas] = useState([]); // Array of { schema, tables: [...] }
    const [loading, setLoading] = useState(false);
    const [previewTable, setPreviewTable] = useState(null); // Simple preview
    const [detailsTable, setDetailsTable] = useState(null); // Full Details Modal

    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [expandedTables, setExpandedTables] = useState({}); // { "schema.tableName": true/false }
    const [expandedSchemas, setExpandedSchemas] = useState({}); // { "schemaName": true/false }

    // History Modal State
    const [showHistory, setShowHistory] = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, tableName, schema }

    // Drop Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [tableToDelete, setTableToDelete] = useState(null);
    const [schemaToDelete, setSchemaToDelete] = useState(null);

    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
            setShowHeaderMenu(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        fetchSchemas();
    }, [currentDb]);

    useEffect(() => {
        if (onRefresh) fetchSchemas();
    }, [onRefresh]);

    const fetchSchemas = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/db/schemas');
            if (response.ok) {
                const data = await response.json();
                setSchemas(data);

                // Also flatten for onTablesLoaded (used by autocomplete, AI, etc.)
                if (onTablesLoaded) {
                    const flat = [];
                    for (const s of data) {
                        for (const t of s.tables) {
                            flat.push({ name: t.name, schema: s.schema, type: t.type, columns: t.columns });
                        }
                    }
                    onTablesLoaded(flat);
                }

                // Auto-expand schemas
                const newExpanded = {};
                for (const s of data) {
                    // Auto-expand if only 1 schema, or if search active
                    newExpanded[s.schema] = data.length <= 2;
                }
                setExpandedSchemas(prev => {
                    // Preserve user's expanded state, only set defaults for new schemas
                    const merged = { ...prev };
                    for (const key of Object.keys(newExpanded)) {
                        if (!(key in merged)) merged[key] = newExpanded[key];
                    }
                    return merged;
                });
            }
        } catch (err) {
            console.error("Failed to fetch schemas", err);
        } finally {
            setLoading(false);
        }
    };

    // Helper: Map SQL Types to Icons/Colors
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

    const toggleExpand = (schema, tableName) => {
        const key = `${schema}.${tableName}`;
        setExpandedTables(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleSchema = (schemaName) => {
        setExpandedSchemas(prev => ({ ...prev, [schemaName]: !prev[schemaName] }));
    };

    const confirmDrop = async () => {
        if (!tableToDelete) return;
        const qName = qualifiedName(schemaToDelete, tableToDelete);
        const res = await fetch('http://localhost:3001/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `DROP TABLE IF EXISTS ${qName}` })
        });
        if (res.ok) {
            fetchSchemas();
            setTableToDelete(null);
            setSchemaToDelete(null);
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Drop failed');
        }
    };

    // Determine if we need schema grouping (only if >1 schema)
    const hasMultipleSchemas = schemas.length > 1;
    const totalTables = schemas.reduce((sum, s) => sum + s.tables.length, 0);

    // Filter tables by search query
    const filterTables = (tables) => {
        if (!deferredSearchQuery) return tables;
        const q = deferredSearchQuery.toLowerCase();
        return tables.filter(t => {
            if (t.name.toLowerCase().includes(q)) return true;
            if (t.columns && t.columns.some(col => col.column_name.toLowerCase().includes(q))) return true;
            return false;
        });
    };

    // Render a single table row with columns
    const renderTable = (table, schema) => {
        const key = `${schema}.${table.name}`;
        const q = deferredSearchQuery.toLowerCase();
        const matchesColumn = q && table.columns && table.columns.some(col => col.column_name.toLowerCase().includes(q)) && !table.name.toLowerCase().includes(q);
        const isExpanded = !!expandedTables[key] || matchesColumn;
        const TableIcon = table.type?.toLowerCase().includes('view') ? LuEye : LuTable;
        const dName = displayName(schema, table.name);

        return (
            <div key={key} className="db-table-item">
                <div
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', dName);
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'table', name: table.name, schema }));
                    }}
                    onClick={() => toggleExpand(schema, table.name)}
                    className="db-table-row"
                    title={`${dName} — Drag to editor or right click for operations`}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, tableName: table.name, schema });
                    }}
                >
                    <div className="db-chevron">
                        {isExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                    </div>
                    <TableIcon size={14} style={{ color: 'var(--accent-primary)' }} />
                    <span className="db-table-name">{table.name}</span>
                    <span
                        className="db-copy-btn"
                        onClick={(e) => handleCopy(e, dName)}
                        title="Copy Table Name"
                    >
                        <LuClipboard size={12} />
                    </span>
                </div>

                {/* Columns Node */}
                {isExpanded && table.columns && (
                    <div className="db-columns">
                        {table.columns.map((col, idx) => {
                            const meta = getTypeMeta(col.data_type);
                            return (
                                <div
                                    key={`${col.column_name}-${idx}`}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', col.column_name);
                                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'column', name: col.column_name, tableName: table.name, schema }));
                                        e.stopPropagation();
                                    }}
                                    className="db-column-row"
                                    title="Drag column to editor"
                                >
                                    <div className="db-column-left">
                                        <div className="db-column-icon" style={{ color: meta.color }}>{meta.icon}</div>
                                        <span className="db-column-name">{col.column_name}</span>
                                    </div>
                                    <div className="db-column-right">
                                        <span className="db-column-type">{col.data_type.toLowerCase()}</span>
                                        <span
                                            className="db-column-copy"
                                            onClick={(e) => handleCopy(e, col.column_name)}
                                            title="Copy Column Name"
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
    };

    return (
        <div className="db-explorer">
            {/* Header */}
            <div className="db-header">
                <span className="db-header-title">Database Schema</span>
                <div className="db-header-actions">
                    <button className="db-header-btn" onClick={fetchSchemas} title="Refresh">
                        <LuRefreshCw size={14} />
                    </button>
                    <button
                        className="db-header-btn"
                        onClick={(e) => { e.stopPropagation(); setShowHeaderMenu(!showHeaderMenu); }}
                        title="Options"
                    >
                        <LuEllipsisVertical size={14} />
                    </button>

                    {/* Header Menu */}
                    {showHeaderMenu && (
                        <div className="ctx-menu" style={{ position: 'absolute', top: '30px', right: '10px' }}>
                            <div
                                className="ctx-menu-item"
                                onClick={() => { setShowHistory(true); setShowHeaderMenu(false); }}
                            >
                                <LuHistory size={14} /> <span>Query History</span>
                            </div>
                            <div
                                className="ctx-menu-item"
                                onClick={() => { if (onOpenErDiagram) onOpenErDiagram(); setShowHeaderMenu(false); }}
                            >
                                <LuWorkflow size={14} /> <span>ER Diagram</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Content Container - Tree View & Search */}
            <div className="db-content">
                <div className="db-search-wrap">
                    <div className="db-search-container">
                        <input
                            className="db-search-input"
                            type="text"
                            placeholder="Search tables, views & columns..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <LuSearch size={12} className="db-search-icon" />
                    </div>
                </div>

                <div className="db-tree">
                    {loading && <div className="db-loading">Loading...</div>}
                    {!loading && totalTables === 0 && (
                        <div className="db-empty">
                            <LuTable size={32} className="db-empty-icon" />
                            <span className="db-empty-title">No tables found</span>
                            <span className="db-empty-hint">Import files or run CREATE TABLE queries</span>
                        </div>
                    )}

                    {/* Multi-schema tree view */}
                    {hasMultipleSchemas ? (
                        schemas.map(schemaGroup => {
                            const filtered = filterTables(schemaGroup.tables);
                            if (filtered.length === 0 && deferredSearchQuery) return null;
                            const isSchemaExpanded = !!expandedSchemas[schemaGroup.schema] || !!deferredSearchQuery;
                            const tablesToShow = deferredSearchQuery ? filtered : schemaGroup.tables;

                            return (
                                <div key={schemaGroup.schema} className="db-schema-group">
                                    <div
                                        className="db-schema-row"
                                        onClick={() => toggleSchema(schemaGroup.schema)}
                                    >
                                        <div className="db-chevron">
                                            {isSchemaExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                        </div>
                                        <LuDatabase size={13} className="db-schema-icon" />
                                        <span className="db-schema-name">{schemaGroup.schema}</span>
                                        <span className="db-schema-count">{schemaGroup.tables.length}</span>
                                    </div>
                                    {isSchemaExpanded && (
                                        <div className="db-schema-children">
                                            {tablesToShow.map(table => renderTable(table, schemaGroup.schema))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        /* Single-schema: flat list (backwards compatible) */
                        schemas.flatMap(schemaGroup =>
                            filterTables(schemaGroup.tables).map(table => renderTable(table, schemaGroup.schema))
                        )
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
                onSelect={onSelectQuery}
            />

            {/* Custom Context Menu */}
            {contextMenu && (
                <div className="ctx-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div className="ctx-menu-item" onClick={() => {
                        const qName = qualifiedName(contextMenu.schema, contextMenu.tableName);
                        if (onSelectQuery) onSelectQuery(`SELECT * FROM ${qName} LIMIT 100; `);
                        setContextMenu(null);
                    }}>
                        <LuCode size={14} /> Select Top 100
                    </div>
                    <div className="ctx-menu-item" onClick={() => {
                        setPreviewTable(contextMenu.tableName);
                        setContextMenu(null);
                    }}>
                        <LuEye size={14} /> Preview Table
                    </div>
                    <div className="ctx-menu-item" onClick={() => {
                        navigator.clipboard.writeText(displayName(contextMenu.schema, contextMenu.tableName));
                        setContextMenu(null);
                    }}>
                        <LuClipboard size={14} /> Copy Name
                    </div>
                    <div className="ctx-menu-item" onClick={() => {
                        setDetailsTable(contextMenu.tableName);
                        setContextMenu(null);
                    }}>
                        <LuInfo size={14} /> View Details
                    </div>
                    <div className="ctx-menu-item" onClick={() => {
                        if (onQualityCheck) onQualityCheck(contextMenu.tableName);
                        setContextMenu(null);
                    }}>
                        <LuShieldCheck size={14} /> Quality Check
                    </div>
                    <div className="ctx-menu-separator" />
                    <div className="ctx-menu-item danger" onClick={() => {
                        setTableToDelete(contextMenu.tableName);
                        setSchemaToDelete(contextMenu.schema);
                        setContextMenu(null);
                        setDeleteModalOpen(true);
                    }}>
                        <LuTable size={14} /> Drop Table...
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDrop}
                itemName={tableToDelete}
                itemType="Table"
            />
        </div>
    );
};

export default DatabaseExplorer;
