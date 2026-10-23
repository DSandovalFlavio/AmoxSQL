import { API_BASE } from '../api.js';
import { useState, useEffect, memo, useDeferredValue } from 'react';
import { getCached, setCached } from '../state/sidebarCache';
import TablePreviewModal from './TablePreviewModal';
import TableDetailsModal from './TableDetailsModal';
import QueryHistoryModal from './QueryHistoryModal';
import {
    LuRefreshCw, LuEllipsisVertical, LuHistory, LuTable,
    LuHash, LuType, LuCalendar, LuSquareCheck, LuCode,
    LuClipboard, LuInfo, LuSearch, LuChevronRight, LuChevronDown, LuEye, LuShieldCheck,
    LuWorkflow, LuArrowLeft, LuDatabase, LuFolder, LuFileInput, LuTriangleAlert,
    LuPlus, LuPencil, LuCopy, LuTrash2, LuFolderPlus, LuSquarePlus,
} from "react-icons/lu";
import { useDialog } from './dialogs/DialogProvider';
import { useToast } from './ToastProvider';
import DeleteConfirmModal from './DeleteConfirmModal';
import FuentesExplorador from './fuentes/FuentesExplorador';
import OtrosProyectos from './OtrosProyectos';
import DestinosDeEntrega from './fuentes/DestinosDeEntrega';
import { VersionesDelLago, NuevoLago, ComoEstaba, esLago } from './lago/Lago';
import { LuWaves, LuHistory as LuVersiones } from 'react-icons/lu';

/**
 * Builds a schema-qualified name: "schema"."table" for non-main schemas, just "table" for main.
 */
const qualifiedName = (schema, tableName) => {
    if (!schema || schema === 'main') return `"${tableName}"`;
    return `"${schema}"."${tableName}"`;
};

/** Un identificador entre comillas dobles, con las suyas dobladas. */
const ident = (n) => `"${String(n).replace(/"/g, '""')}"`;
/** `schema.tabla` calificado siempre (también `main`): para ALTER y DROP. */
const calificado = (schema, nombre) => `${ident(schema || 'main')}.${ident(nombre)}`;

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
    const [contextMenu, setContextMenu] = useState(null); // { x, y, tableName, schema, esVista }
    // El mismo menú, desde los tres puntos de un esquema y desde el «+» de la cabecera.
    const [menuEsquema, setMenuEsquema] = useState(null); // { x, y, schema, tablas }
    const [menuNuevo, setMenuNuevo] = useState(null);     // { x, y }
    const dialog = useDialog();
    const toast = useToast();
    // 5.12 (I8): DuckLake
    const [nuevoLago, setNuevoLago] = useState(false);
    const [comoEstaba, setComoEstaba] = useState(null);   // { tabla, schema }

    // Drop Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [tableToDelete, setTableToDelete] = useState(null);
    const [schemaToDelete, setSchemaToDelete] = useState(null);

    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
            setMenuEsquema(null);
            setMenuNuevo(null);
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
        // Show cached schema instantly — no spinner flash on tab switch or DB return
        const cacheKey = `schema:${currentDb}`;
        const cached = getCached(cacheKey);
        if (cached) {
            setSchemas(cached);
            if (onTablesLoaded) {
                const flat = cached.flatMap(s => s.tables.map(t => ({ name: t.name, schema: s.schema, type: t.type, columns: t.columns })));
                onTablesLoaded(flat);
            }
        }
        setLoading(!cached);
        try {
            const response = await fetch(`${API_BASE}/api/db/schemas`);
            if (response.ok) {
                const data = await response.json();
                setCached(cacheKey, data);
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
        if (t.includes('INT')) return { icon: <LuHash size={12} />, color: 'var(--type-integer)', label: 'Integer' };
        if (t.includes('DOUBLE') || t.includes('FLOAT') || t.includes('DECIMAL')) return { icon: <LuHash size={12} />, color: 'var(--type-float)', label: 'Number' };
        if (t.includes('CHAR') || t.includes('TEXT') || t.includes('STRING')) return { icon: <LuType size={12} />, color: 'var(--type-text)', label: 'Text' };
        if (t.includes('DATE') || t.includes('TIME')) return { icon: <LuCalendar size={12} />, color: 'var(--type-datetime)', label: 'Date/Time' };
        if (t.includes('BOOL')) return { icon: <LuSquareCheck size={12} />, color: 'var(--type-boolean)', label: 'Boolean' };
        return { icon: <LuCode size={12} />, color: 'var(--type-default)', label: type };
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

    // Lo que se borra puede ser una vista: `DROP TABLE` sobre una vista falla.
    const [borrarEsVista, setBorrarEsVista] = useState(false);
    const confirmDrop = async () => {
        if (!tableToDelete) return;
        const qName = qualifiedName(schemaToDelete, tableToDelete);
        const res = await fetch(`${API_BASE}/api/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `DROP ${borrarEsVista ? 'VIEW' : 'TABLE'} IF EXISTS ${qName}` })
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

    /** Ejecuta una sentencia del explorador y refresca el árbol; el error, en un aviso. */
    const ejecutar = async (sql, hecho) => {
        try {
            const r = await fetch(`${API_BASE}/api/query`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d.error) throw new Error(d.error || d.details || `Failed (${r.status})`);
            if (hecho) toast.success(hecho);
            fetchSchemas();
            return true;
        } catch (e) {
            toast.error(String(e.message || e).split('\n')[0]);
            return false;
        }
    };

    const nombreValido = (v) => (!String(v || '').trim() ? 'Write a name' : /["]/.test(v) ? 'It cannot contain double quotes' : null);

    const renombrar = async ({ tableName, schema, esVista }) => {
        const nuevo = await dialog.promptAsync({
            title: `Rename ${esVista ? 'view' : 'table'} "${tableName}"`,
            message: 'Queries, notebooks and processes that use the old name will need the new one.',
            defaultValue: tableName, confirmLabel: 'Rename', validate: nombreValido,
        });
        const n = String(nuevo || '').trim();
        if (!n || n === tableName) return;
        await ejecutar(`ALTER ${esVista ? 'VIEW' : 'TABLE'} ${calificado(schema, tableName)} RENAME TO ${ident(n)}`, `Renamed to "${n}"`);
    };

    const duplicar = async ({ tableName, schema }) => {
        const nuevo = await dialog.promptAsync({
            title: `Duplicate "${tableName}"`,
            message: 'A new table with the same columns and rows.',
            defaultValue: `${tableName}_copy`, confirmLabel: 'Duplicate', validate: nombreValido,
        });
        const n = String(nuevo || '').trim();
        if (!n) return;
        await ejecutar(`CREATE TABLE ${calificado(schema, n)} AS SELECT * FROM ${calificado(schema, tableName)}`, `"${n}" created`);
    };

    /** Editar una vista: su definición, en una pestaña, lista para cambiar y ejecutar. */
    const editarVista = async ({ tableName, schema }) => {
        try {
            const r = await fetch(`${API_BASE}/api/query`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `SELECT sql FROM duckdb_views() WHERE NOT temporary AND schema_name = '${String(schema || 'main').replace(/'/g, "''")}' AND view_name = '${String(tableName).replace(/'/g, "''")}' LIMIT 1` }),
            });
            const d = await r.json();
            const def = d.data?.[0]?.sql;
            if (!def) throw new Error('The view definition could not be read');
            const cuerpo = String(def).replace(/^\s*CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+/i, 'CREATE OR REPLACE VIEW ');
            onSelectQuery?.(`-- Edit the view and run it to save the change\n${cuerpo.trim().replace(/;?\s*$/, ';')}\n`);
        } catch (e) { toast.error(e.message); }
    };

    const nuevaTabla = (schema = 'main') => {
        const prefijo = schema && schema !== 'main' ? `${ident(schema)}.` : '';
        onSelectQuery?.(`CREATE TABLE ${prefijo}nueva_tabla (\n    id INTEGER PRIMARY KEY,\n    nombre VARCHAR,\n    creada TIMESTAMP DEFAULT current_timestamp\n);\n\n-- Or from a query:\n-- CREATE TABLE ${prefijo}nueva_tabla AS SELECT * FROM otra_tabla;\n`);
    };
    const nuevaVista = (schema = 'main') => {
        const prefijo = schema && schema !== 'main' ? `${ident(schema)}.` : '';
        onSelectQuery?.(`CREATE OR REPLACE VIEW ${prefijo}nueva_vista AS\nSELECT *\nFROM tabla\nWHERE true;\n`);
    };
    const nuevoEsquema = async () => {
        const nombre = await dialog.promptAsync({ title: 'New schema', message: 'A schema groups tables and views inside this database.', placeholder: 'staging', confirmLabel: 'Create', validate: nombreValido });
        const n = String(nombre || '').trim();
        if (!n) return;
        if (await ejecutar(`CREATE SCHEMA ${ident(n)}`, `Schema "${n}" created`)) setExpandedSchemas(p => ({ ...p, [n]: true }));
    };
    const borrarEsquema = async ({ schema, tablas }) => {
        if (schema === 'main') { toast.info('The main schema cannot be dropped.'); return; }
        const ok = await dialog.confirmAsync({
            title: `Drop schema "${schema}"`,
            message: tablas
                ? `It has ${tablas} table${tablas === 1 ? '' : 's'} or view${tablas === 1 ? '' : 's'}, and they are dropped with it. This cannot be undone.`
                : 'It is empty. This cannot be undone.',
            confirmLabel: 'Drop schema', destructive: true,
        });
        if (ok) await ejecutar(`DROP SCHEMA ${ident(schema)}${tablas ? ' CASCADE' : ''}`, `Schema "${schema}" dropped`);
    };

    /** Abre un menú bajo el botón que se pulsó (los tres puntos o el «+»). */
    const bajo = (e) => { const r = e.currentTarget.getBoundingClientRect(); return { x: Math.max(8, r.right - 200), y: r.bottom + 4 }; };

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
                    title={`${dName}${table.descripcion ? `\n${table.descripcion}` : ''}${table.procedencia ? `\nLoaded ${table.procedencia.resumen}` : ''}${table.procedencia?.cambiados?.length ? `\n${table.procedencia.cambiados.join(', ')} changed after it was loaded` : ''}\nDrag to editor or right click for operations`}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, tableName: table.name, schema, esVista: table.type?.toLowerCase().includes('view') });
                    }}
                >
                    <div className="db-chevron">
                        {isExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                    </div>
                    <TableIcon size={14} style={{ color: 'var(--accent-primary)' }} />
                    <span className="db-table-name">{table.name}</span>
                    {/* De dónde salió (C5): cargada desde un archivo; aviso si el archivo cambió */}
                    {table.procedencia && (table.procedencia.cambiados?.length
                        ? <LuTriangleAlert size={12} className="db-procedencia-aviso" aria-label="The source file changed after loading" />
                        : <LuFileInput size={12} className="db-procedencia-icono" aria-label="Loaded from a file" />)}
                    <span
                        className="db-copy-btn"
                        onClick={(e) => handleCopy(e, dName)}
                        title="Copy Table Name"
                    >
                        <LuClipboard size={12} />
                    </span>
                    <button
                        type="button"
                        className="db-mas-btn"
                        title="More: preview, rename, duplicate, drop…"
                        onClick={(e) => {
                            e.stopPropagation();
                            const p = bajo(e);
                            setMenuEsquema(null); setMenuNuevo(null);
                            setContextMenu({ ...p, tableName: table.name, schema, esVista: table.type?.toLowerCase().includes('view') });
                        }}
                    >
                        <LuEllipsisVertical size={13} />
                    </button>
                </div>

                {/* 5.12 (I5): lo que dice la tabla (su comentario, o dbt) */}
                {isExpanded && table.descripcion && (
                    <div className="db-descripcion" title={table.descripcionDe === 'dbt' ? 'From the dbt project' : 'From the table comment'}>{table.descripcion}</div>
                )}
                {/* Columns Node */}
                {isExpanded && table.procedencia && (
                    <div className={`db-procedencia${table.procedencia.cambiados?.length ? ' db-procedencia--cambio' : ''}`}>
                        Loaded {table.procedencia.resumen}
                        {table.procedencia.cambiados?.length > 0 && (
                            <span> · {table.procedencia.cambiados.join(', ')} changed after it was loaded: import it again to see the new data.</span>
                        )}
                    </div>
                )}
                {isExpanded && table.columns && (
                    <div className="db-columns tree-reveal">
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
                                    className={`db-column-row${col.descripcion ? ' db-column-row--desc' : ''}`}
                                    title={col.descripcion ? `${col.column_name}: ${col.descripcion}\nDrag column to editor` : 'Drag column to editor'}
                                >
                                    <div className="db-column-left">
                                        <div className="db-column-icon" style={{ color: meta.color }}>{meta.icon}</div>
                                        <span className="db-column-name">{col.column_name}</span>
                                        {col.descripcion && <span className="db-column-desc">{col.descripcion}</span>}
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
                <span className="db-header-title"><LuDatabase size={14} /> Database Schema</span>
                <div className="db-header-actions">
                    {/* Single-schema DBs: ER is for that one schema, so expose it here.
                        Multi-schema DBs get a per-schema ER button on each schema row. */}
                    {!hasMultipleSchemas && schemas[0] && (
                        <button
                            className="db-header-btn"
                            onClick={() => onOpenErDiagram && onOpenErDiagram(schemas[0].schema)}
                            title={`ER Diagram (${schemas[0].schema})`}
                        >
                            <LuWorkflow size={14} />
                        </button>
                    )}
                    <button className="db-header-btn" title="New table, view or schema" onClick={(e) => { e.stopPropagation(); const p = bajo(e); setContextMenu(null); setMenuEsquema(null); setMenuNuevo(m => (m ? null : p)); }}>
                        <LuPlus size={14} />
                    </button>
                    <button className="db-header-btn" onClick={() => setNuevoLago(true)} title="New lake… (DuckLake: every change is a version)">
                        <LuWaves size={14} />
                    </button>
                    <button className="db-header-btn" onClick={fetchSchemas} title="Refresh">
                        <LuRefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Content Container - Tree View & Search */}
            <div className="db-content">
                <div className="db-search-wrap">
                    <div className="db-search-container">
                        <input
                            className="db-search-input"
                            type="text"
                            placeholder="Search sources, tables, views & columns..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <LuSearch size={12} className="db-search-icon" />
                    </div>
                </div>

                <div className="db-tree">
                    {/* Las fuentes con nombre (C1): arriba, porque son la entrada. */}
                    <FuentesExplorador
                        onSelectQuery={onSelectQuery}
                        refresco={`${currentDb}|${onRefresh || ''}`}
                        busqueda={deferredSearchQuery}
                        getTypeMeta={getTypeMeta}
                    />
                    {/* Y adónde se entrega (D6): las carpetas con nombre de los procesos. */}
                    {!deferredSearchQuery && <DestinosDeEntrega variante="arbol" />}
                    {/* 5.12 (I8): las versiones del lago abierto */}
                    {!deferredSearchQuery && esLago(currentDb) && <VersionesDelLago refresco={`${currentDb}|${onRefresh || ''}`} onSelectQuery={onSelectQuery} />}
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
                                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu(null); setMenuNuevo(null); setMenuEsquema({ x: e.clientX, y: e.clientY, schema: schemaGroup.schema, tablas: schemaGroup.tables.length }); }}
                                    >
                                        <div className="db-chevron">
                                            {isSchemaExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                                        </div>
                                        <LuDatabase size={13} className="db-schema-icon" />
                                        <span className="db-schema-name">{schemaGroup.schema}</span>
                                        <span className="db-schema-count">{schemaGroup.tables.length}</span>
                                        <button
                                            className="db-schema-er-btn"
                                            title={`ER Diagram (${schemaGroup.schema})`}
                                            onClick={(e) => { e.stopPropagation(); if (onOpenErDiagram) onOpenErDiagram(schemaGroup.schema); }}
                                        >
                                            <LuWorkflow size={13} />
                                        </button>
                                        <button
                                            className="db-schema-er-btn"
                                            title={`More (${schemaGroup.schema}): new table, drop…`}
                                            onClick={(e) => { e.stopPropagation(); const p = bajo(e); setContextMenu(null); setMenuNuevo(null); setMenuEsquema({ ...p, schema: schemaGroup.schema, tablas: schemaGroup.tables.length }); }}
                                        >
                                            <LuEllipsisVertical size={13} />
                                        </button>
                                    </div>
                                    {isSchemaExpanded && (
                                        <div className="db-schema-children tree-reveal">
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
                    {/* 5.14 (J1): las bases de otros proyectos del workspace, en sólo lectura. */}
                    <OtrosProyectos
                        onSelectQuery={onSelectQuery}
                        refresco={`${currentDb}|${onRefresh || ''}`}
                        busqueda={deferredSearchQuery}
                        getTypeMeta={getTypeMeta}
                    />
                </div>
            </div>

            {/* Preview Modal (Simple) */}
            {previewTable && (
                <TablePreviewModal
                    tableName={previewTable.name}
                    schema={previewTable.schema}
                    onClose={() => setPreviewTable(null)}
                />
            )}

            {/* Full Details Modal */}
            <TableDetailsModal
                isOpen={!!detailsTable}
                tableName={detailsTable?.name}
                schema={detailsTable?.schema}
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
                        setPreviewTable({ name: contextMenu.tableName, schema: contextMenu.schema });
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
                        setDetailsTable({ name: contextMenu.tableName, schema: contextMenu.schema });
                        setContextMenu(null);
                    }}>
                        <LuInfo size={14} /> View Details
                    </div>
                    <div className="ctx-menu-item" onClick={() => {
                        if (onQualityCheck) onQualityCheck({ name: contextMenu.tableName, schema: contextMenu.schema });
                        setContextMenu(null);
                    }}>
                        <LuShieldCheck size={14} /> Quality Check
                    </div>
                    {esLago(currentDb) && (
                        <div className="ctx-menu-item" onClick={() => {
                            setComoEstaba({ tabla: contextMenu.tableName, schema: contextMenu.schema });
                            setContextMenu(null);
                        }}>
                            <LuVersiones size={14} /> As it was…
                        </div>
                    )}
                    <div className="ctx-menu-separator" />
                    {contextMenu.esVista && (
                        <div className="ctx-menu-item" onClick={() => { const c = contextMenu; setContextMenu(null); editarVista(c); }}>
                            <LuPencil size={14} /> Edit view…
                        </div>
                    )}
                    <div className="ctx-menu-item" onClick={() => { const c = contextMenu; setContextMenu(null); renombrar(c); }}>
                        <LuPencil size={14} /> Rename…
                    </div>
                    {!contextMenu.esVista && (
                        <div className="ctx-menu-item" onClick={() => { const c = contextMenu; setContextMenu(null); duplicar(c); }}>
                            <LuCopy size={14} /> Duplicate…
                        </div>
                    )}
                    <div className="ctx-menu-separator" />
                    <div className="ctx-menu-item danger" onClick={() => {
                        setTableToDelete(contextMenu.tableName);
                        setSchemaToDelete(contextMenu.schema);
                        setBorrarEsVista(!!contextMenu.esVista);
                        setContextMenu(null);
                        setDeleteModalOpen(true);
                    }}>
                        <LuTrash2 size={14} /> {contextMenu.esVista ? 'Drop View...' : 'Drop Table...'}
                    </div>
                </div>
            )}

            {menuEsquema && (
                <div className="ctx-menu" style={{ top: menuEsquema.y, left: menuEsquema.x }} onClick={(e) => e.stopPropagation()}>
                    <div className="ctx-menu-item" onClick={() => { const s = menuEsquema.schema; setMenuEsquema(null); nuevaTabla(s); }}>
                        <LuSquarePlus size={14} /> New table in {menuEsquema.schema}…
                    </div>
                    <div className="ctx-menu-item" onClick={() => { const s = menuEsquema.schema; setMenuEsquema(null); nuevaVista(s); }}>
                        <LuEye size={14} /> New view in {menuEsquema.schema}…
                    </div>
                    <div className="ctx-menu-item" onClick={() => { const s = menuEsquema.schema; setMenuEsquema(null); onOpenErDiagram?.(s); }}>
                        <LuWorkflow size={14} /> ER Diagram
                    </div>
                    <div className="ctx-menu-item" onClick={() => { navigator.clipboard.writeText(menuEsquema.schema); setMenuEsquema(null); }}>
                        <LuClipboard size={14} /> Copy Name
                    </div>
                    {menuEsquema.schema !== 'main' && (
                        <>
                            <div className="ctx-menu-separator" />
                            <div className="ctx-menu-item danger" onClick={() => { const m = menuEsquema; setMenuEsquema(null); borrarEsquema(m); }}>
                                <LuTrash2 size={14} /> Drop Schema…
                            </div>
                        </>
                    )}
                </div>
            )}

            {menuNuevo && (
                <div className="ctx-menu" style={{ top: menuNuevo.y, left: menuNuevo.x }} onClick={(e) => e.stopPropagation()}>
                    <div className="ctx-menu-item" onClick={() => { setMenuNuevo(null); nuevaTabla('main'); }}>
                        <LuSquarePlus size={14} /> New table…
                    </div>
                    <div className="ctx-menu-item" onClick={() => { setMenuNuevo(null); nuevaVista('main'); }}>
                        <LuEye size={14} /> New view…
                    </div>
                    <div className="ctx-menu-item" onClick={() => { setMenuNuevo(null); nuevoEsquema(); }}>
                        <LuFolderPlus size={14} /> New schema…
                    </div>
                </div>
            )}

            {nuevoLago && <NuevoLago onClose={() => setNuevoLago(false)} />}
            {comoEstaba && <ComoEstaba tabla={comoEstaba.tabla} schema={comoEstaba.schema || 'main'} onSelectQuery={onSelectQuery} onClose={() => setComoEstaba(null)} />}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDrop}
                itemName={tableToDelete}
                itemType={borrarEsVista ? 'View' : 'Table'}
            />
        </div>
    );
};

export default memo(DatabaseExplorer);
