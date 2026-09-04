/**
 * ChainNodeConfigPanel — Right-side config panel for the selected node.
 * Displays editable label, description, and type-specific configuration fields.
 */
import { useState, useEffect, useRef } from 'react';
import {
    LuX, LuFileCode2, LuPlus, LuExternalLink, LuTrash2, LuMinus,
    LuCode, LuChevronDown, LuChevronRight, LuCopy, LuFolderOpen, LuLightbulb
} from 'react-icons/lu';
import { NODE_TYPES } from './chainNodeTypes';
import Combobox from './_Combobox';
import { computeOutputColumns } from './nodeLineage';
import { validateNode } from './chainValidation';
import NodeDocView from './NodeDocView';
import { LuCircleAlert, LuTriangleAlert, LuCheck } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

// Renders a list of columns ({ name, type?, from? }) with a dimmed right-hand hint.
const ColumnRows = ({ columns, hintKey = 'type' }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
        {columns.map((c, i) => (
            <div key={`${c.name}-${i}`} style={{
                display: 'flex', justifyContent: 'space-between', gap: 8,
                padding: '4px 8px', borderRadius: 4, background: 'var(--surface-raised)', fontSize: 12,
            }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-active)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {c[hintKey] && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{c[hintKey]}</span>}
            </div>
        ))}
    </div>
);

const ChainNodeConfigPanel = ({ node, onUpdate, onDelete, onClose, onCreateSqlFile, onOpenFile, sqlFiles = [], chainDefinition, chainFile }) => {
    const [availableTables, setAvailableTables] = useState([]);
    const [projectFiles, setProjectFiles] = useState([]);
    const [upstreamColumns, setUpstreamColumns] = useState([]);
    const [activeTab, setActiveTab] = useState('basic');
    const [previewData, setPreviewData] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [panelWidth, setPanelWidth] = useState(() => {
        const v = Number(localStorage.getItem('amoxsql-chain-config-width'));
        return v >= 260 ? v : 300;
    });

    // Available tables/views for table autocomplete.
    useEffect(() => {
        let cancelled = false;
        fetch(`${API_BASE}/api/db/tables`)
            .then(r => r.json())
            .then(data => { if (!cancelled) setAvailableTables(Array.isArray(data) ? data : []); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // Project data files for import autocomplete.
    useEffect(() => {
        let cancelled = false;
        fetch(`${API_BASE}/api/files/list?path=&recursive=true`)
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                const files = (data.files || data || [])
                    .map(f => (typeof f === 'string' ? f : (f.path || f.name)))
                    .filter(f => f && /\.(csv|tsv|parquet|json|jsonl|xlsx|xls)$/i.test(f));
                setProjectFiles(files);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // Upstream columns for the selected node (column autocomplete). Re-fetched when the
    // selected node, the chain file, or the connection topology changes — so reconnecting
    // nodes refreshes suggestions (edgesSig is a stable value-compared string).
    const nodeId = node?.id;
    const edgesSig = JSON.stringify((chainDefinition && chainDefinition.edges) || []);
    useEffect(() => {
        if (!nodeId || !chainDefinition) { setUpstreamColumns([]); return; }
        let cancelled = false;
        fetch(`${API_BASE}/api/chains/schema/infer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId, chainDefinition, chainFile: chainFile || '' }),
        })
            .then(r => r.json())
            .then(data => { if (!cancelled) setUpstreamColumns(Array.isArray(data?.columns) ? data.columns : []); })
            .catch(() => { if (!cancelled) setUpstreamColumns([]); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeId, chainFile, edgesSig]);

    // Node output preview (only when the Preview tab is open). Resolves the node's
    // physical output table server-side; available after the node has run.
    useEffect(() => {
        if (activeTab !== 'preview' || !nodeId || !chainDefinition) return;
        let cancelled = false;
        setPreviewLoading(true);
        fetch(`${API_BASE}/api/chains/preview-node`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId, chainDefinition, chainFile: chainFile || '', limit: 50 }),
        })
            .then(r => r.json())
            .then(d => { if (!cancelled) setPreviewData(d); })
            .catch(() => { if (!cancelled) setPreviewData({ available: false }); })
            .finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, nodeId, chainFile, edgesSig]);

    useEffect(() => {
        localStorage.setItem('amoxsql-chain-config-width', String(panelWidth));
    }, [panelWidth]);

    // Clean up an in-progress panel resize if the panel unmounts mid-drag.
    const resizeCleanupRef = useRef(null);
    useEffect(() => () => { resizeCleanupRef.current?.(); }, []);

    if (!node) return null;

    const nodeType = NODE_TYPES[node.data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;
    const config = node.data.config || {};
    const tableOptions = availableTables.map(t => ({ value: t.name, hint: t.type === 'VIEW' ? 'view' : (t.schema && t.schema !== 'main' ? t.schema : undefined) }));
    const columnOptions = upstreamColumns.map(c => ({ value: c.name, hint: c.type }));
    const fileOptions = projectFiles.map(f => ({ value: f }));
    const outputColumns = computeOutputColumns(node.data.nodeType, config, upstreamColumns);
    const nodeValidation = validateNode(node, (chainDefinition && chainDefinition.edges) || []);

    const updateField = (field, value) => {
        onUpdate(node.id, { [field]: value });
    };

    const updateConfig = (key, value) => {
        onUpdate(node.id, { config: { ...config, [key]: value } });
    };

    // Merge several config keys in a single update (avoids stale-config clobber when
    // two related fields change together, e.g. sourcePath + auto-detected fileType).
    const updateConfigMulti = (patch) => {
        onUpdate(node.id, { config: { ...config, ...patch } });
    };

    const startResize = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = panelWidth;
        const onMove = (ev) => setPanelWidth(Math.min(680, Math.max(260, startW + (startX - ev.clientX))));
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

    return (
        <div className="chain-config-panel" style={{ width: panelWidth, minWidth: panelWidth, position: 'relative' }}>
            <div
                onMouseDown={startResize}
                title="Drag to resize panel"
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', zIndex: 6 }}
            />
            {/* Header */}
            <div className="chain-config-header">
                <div className="chain-config-header-left">
                    <Icon size={14} style={{ color: nodeType.color.accent }} />
                    <span>{nodeType.label}</span>
                </div>
                <button className="chain-config-close" onClick={onClose}>
                    <LuX size={14} />
                </button>
            </div>

            {/* Tabs — segmented control */}
            <div style={{ padding: '8px 12px', flexShrink: 0 }}>
                <div className="seg">
                    {['basic', 'schema', 'preview', 'validation', 'info'].map(t => (
                        <button
                            key={t}
                            onClick={() => setActiveTab(t)}
                            className={`seg-item${activeTab === t ? ' seg-item--active' : ''}`}
                            style={{ textTransform: 'capitalize' }}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="chain-config-body">
                {activeTab === 'basic' && (<>
                {/* Label */}
                <div className="chain-config-field">
                    <label>Name</label>
                    <input
                        type="text"
                        value={node.data.label || ''}
                        onChange={(e) => updateField('label', e.target.value)}
                        placeholder="Node name..."
                        className="chain-config-input"
                    />
                </div>

                {/* Description */}
                <div className="chain-config-field">
                    <label>Description</label>
                    <textarea
                        value={node.data.description || ''}
                        onChange={(e) => updateField('description', e.target.value)}
                        placeholder="What does this step do?"
                        className="chain-config-textarea"
                        rows={3}
                    />
                </div>

                <div className="chain-config-separator" />

                {/* Type-specific config */}
                {node.data.nodeType === 'sql_file' && (
                    <SqlFileConfig
                        config={config}
                        onChange={updateConfig}
                        sqlFiles={sqlFiles}
                        onCreateSqlFile={onCreateSqlFile}
                        onOpenFile={onOpenFile}
                    />
                )}

                {node.data.nodeType === 'sql_inline' && (
                    <SqlInlineConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'import_file' && (
                    <ImportFileConfig config={config} onChange={updateConfig} onChangeMulti={updateConfigMulti} fileOptions={fileOptions} />
                )}

                {node.data.nodeType === 'import_folder' && (
                    <ImportFolderConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'export_file' && (
                    <ExportFileConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'chart' && (
                    <ChartNodeConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'report' && (
                    <ReportNodeConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'checkpoint' && (
                    <CheckpointConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'table_ref' && (
                    <TableRefConfig config={config} onChange={updateConfig} tableOptions={tableOptions} />
                )}

                {node.data.nodeType === 'merge_tables' && (
                    <MergeTablesConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'assert' && (
                    <AssertConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'join_tables' && (
                    <JoinTablesConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'filter' && (
                    <FilterConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'group_aggregate' && (
                    <GroupAggregateConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'select_columns' && (
                    <SelectColumnsConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'deduplicate' && (
                    <DeduplicateConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'add_column' && (
                    <AddColumnConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'sort' && (
                    <SortConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'sample' && (
                    <SampleConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'pivot' && (
                    <PivotConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'rename_table' && (
                    <RenameTableConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'create_table' && (
                    <CreateTableConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'type_cast' && (
                    <TypeCastConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'window_functions' && (
                    <WindowFunctionsConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'unpivot' && (
                    <UnpivotConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'http_fetch' && (
                    <HttpFetchConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'clean' && (
                    <CleanConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'date_ops' && (
                    <DateOpsConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'flatten' && (
                    <FlattenConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'bucket_read' && (
                    <BucketReadConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'gsheet_read' && (
                    <GSheetReadConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'ai_enrich' && (
                    <AiEnrichConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'schema_validation' && (
                    <SchemaValidationConfig config={config} onChange={updateConfig} columnOptions={columnOptions} />
                )}

                {node.data.nodeType === 'notification' && (
                    <NotificationConfig config={config} onChange={updateConfig} />
                )}

                {/* SQL Preview */}
                <SqlPreview nodeType={node.data.nodeType} config={config} />

                <div className="chain-config-separator" />

                {/* Delete */}
                <button className="chain-config-delete" onClick={() => onDelete(node.id)}>
                    <LuTrash2 size={13} />
                    <span>Delete Node</span>
                </button>
                </>)}

                {activeTab === 'schema' && (
                    <>
                        <div className="chain-config-section">
                            <label>Input Columns</label>
                            {upstreamColumns.length === 0 ? (
                                <p className="chain-config-hint">
                                    No upstream columns detected yet. Connect a data source, or run the
                                    chain so derived columns become available.
                                </p>
                            ) : (
                                <ColumnRows columns={upstreamColumns} hintKey="type" />
                            )}
                        </div>
                        <div className="chain-config-section">
                            <label>Output Columns</label>
                            {outputColumns === null ? (
                                <p className="chain-config-hint">
                                    Output shape depends on the data for this node — run the chain to
                                    see the resulting columns.
                                </p>
                            ) : outputColumns.length === 0 ? (
                                <p className="chain-config-hint">
                                    Configure this node to define its output columns.
                                </p>
                            ) : (
                                <ColumnRows columns={outputColumns} hintKey="from" />
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'preview' && (
                    <div className="chain-config-section">
                        <label>Output Preview</label>
                        {previewLoading ? (
                            <p className="chain-config-hint">Loading…</p>
                        ) : !previewData?.available ? (
                            <p className="chain-config-hint">
                                No materialized output yet. Run the chain (or up to this node) to preview its result.
                            </p>
                        ) : (previewData.rows || []).length === 0 ? (
                            <p className="chain-config-hint">Output table is empty (0 rows).</p>
                        ) : (
                            <div style={{ overflowX: 'auto', border: '1px solid var(--border-default)', borderRadius: 6, marginTop: 4 }}>
                                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                                    <thead>
                                        <tr>
                                            {previewData.columns.map(c => (
                                                <th key={c.name} style={{ position: 'sticky', top: 0, textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-default)', background: 'var(--surface-raised)', color: 'var(--text-active)', whiteSpace: 'nowrap' }}>{c.name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.rows.map((row, ri) => (
                                            <tr key={ri}>
                                                {previewData.columns.map(c => (
                                                    <td key={c.name} style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-default)', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {row[c.name] === null || row[c.name] === undefined ? <span style={{ opacity: 0.4 }}>null</span> : String(row[c.name])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {previewData.totalRows > previewData.rows.length && (
                                    <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-muted)' }}>
                                        Showing {previewData.rows.length} of {Number(previewData.totalRows).toLocaleString()} rows
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'validation' && (
                    <div className="chain-config-section">
                        <label>Validation</label>
                        {nodeValidation.errors.length === 0 && nodeValidation.warnings.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
                                <LuCheck size={13} style={{ color: 'var(--color-success)' }} /> No issues — this node is ready.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                {nodeValidation.errors.map((e, i) => (
                                    <div key={`e${i}`} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--color-error)' }}>
                                        <LuCircleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{e}</span>
                                    </div>
                                ))}
                                {nodeValidation.warnings.map((w, i) => (
                                    <div key={`w${i}`} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--color-warning)' }}>
                                        <LuTriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{w}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'info' && (
                    <div className="chain-config-section">
                        <NodeDocView typeId={node.data.nodeType} showHeader={false} />
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Type-specific config components ---

const SqlFileConfig = ({ config, onChange, sqlFiles, onCreateSqlFile, onOpenFile }) => (
    <div className="chain-config-section">
        <label>SQL File</label>
        <select
            value={config.filePath || ''}
            onChange={(e) => onChange('filePath', e.target.value)}
            className="chain-config-select"
        >
            <option value="">Select a file...</option>
            {sqlFiles.map(f => (
                <option key={f} value={f}>{f}</option>
            ))}
        </select>
        <div className="chain-config-actions">
            {config.filePath && (
                <button className="chain-config-action-btn" onClick={() => onOpenFile(config.filePath)}>
                    <LuExternalLink size={12} />
                    <span>Open in Editor</span>
                </button>
            )}
            <button className="chain-config-action-btn" onClick={onCreateSqlFile}>
                <LuPlus size={12} />
                <span>Create New SQL File</span>
            </button>
        </div>
    </div>
);

const SqlInlineConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>SQL Query</label>
        <textarea
            value={config.query || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder="SELECT * FROM ..."
            className="chain-config-textarea chain-config-sql"
            rows={6}
        />
    </div>
);

const IMPORT_EXT_MAP = { csv: 'csv', tsv: 'tsv', parquet: 'parquet', json: 'json', jsonl: 'json', xlsx: 'xlsx', xls: 'xlsx' };

// Sets sourcePath + (auto-detected) fileType in ONE merged config update, so the
// two fields don't clobber each other (sequential single-key updates spread the
// same stale config and the last one wins). onChangeMulti merges a patch object.
const applyFilePath = (filePath, onChangeMulti) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const patch = { sourcePath: filePath };
    if (IMPORT_EXT_MAP[ext]) patch.fileType = IMPORT_EXT_MAP[ext];
    onChangeMulti(patch);
};

const ImportFileConfig = ({ config, onChange, onChangeMulti, fileOptions = [] }) => {
    const handleBrowse = async () => {
        if (window.electronAPI?.openFileDialog) {
            const result = await window.electronAPI.openFileDialog({
                filters: [
                    { name: 'Data Files', extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'xlsx', 'xls'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (result && !result.canceled && result.filePaths?.[0]) {
                applyFilePath(result.filePaths[0], onChangeMulti);
            }
        } else {
            // Fallback: HTML file input (works in browser / dev)
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.tsv,.parquet,.json,.jsonl,.xlsx,.xls';
            input.onchange = (e) => {
                const file = e.target.files?.[0];
                if (file) applyFilePath(file.path || file.name, onChangeMulti);
            };
            input.click();
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('chain-config-drop-active');
        // 1) Internal FileExplorer drag (application/json payload).
        const json = e.dataTransfer.getData('application/json');
        if (json) {
            try {
                const payload = JSON.parse(json);
                if (payload && (payload.type === 'file' || payload.type === 'folder') && payload.path) {
                    applyFilePath(payload.path, onChangeMulti);
                    return;
                }
            } catch { /* fall through to OS files */ }
        }
        // 2) OS file drag (Windows Explorer, etc.).
        const file = e.dataTransfer.files?.[0];
        if (file) applyFilePath(file.path || file.name, onChange);
    };

    return (
        <div className="chain-config-section">
            <label>Source File Path</label>
            <div
                className="chain-config-input-with-btn"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('chain-config-drop-active'); }}
                onDragLeave={(e) => e.currentTarget.classList.remove('chain-config-drop-active')}
                onDrop={handleDrop}
            >
                <Combobox
                    value={config.sourcePath || ''}
                    onChange={(v) => applyFilePath(v, onChangeMulti)}
                    options={fileOptions}
                    placeholder="Drag, pick, or type a file path…"
                    className="chain-config-input"
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                />
                <button className="chain-config-browse-btn" onClick={handleBrowse} title="Browse files">
                    <LuFolderOpen size={13} />
                </button>
            </div>
            <label>Target Table Name</label>
            <input
                type="text"
                value={config.tableName || ''}
                onChange={(e) => onChange('tableName', e.target.value)}
                placeholder="raw_sales"
                className="chain-config-input"
            />
            <label>File Type</label>
            <select
                value={config.fileType || 'csv'}
                onChange={(e) => onChange('fileType', e.target.value)}
                className="chain-config-select"
            >
                <option value="csv">CSV</option>
                <option value="tsv">TSV (Tab-separated)</option>
                <option value="parquet">Parquet</option>
                <option value="json">JSON</option>
                <option value="xlsx">Excel (.xlsx)</option>
            </select>
            {(config.fileType === 'csv' || config.fileType === 'tsv') && (
                <>
                    <label>Delimiter <span className="chain-config-optional">(advanced)</span></label>
                    <input
                        type="text"
                        value={config.delimiter || ','}
                        onChange={(e) => onChange('delimiter', e.target.value)}
                        placeholder=","
                        className="chain-config-input chain-config-input-sm"
                        maxLength={3}
                    />
                    <label>Skip Rows <span className="chain-config-optional">(optional)</span></label>
                    <input
                        type="number"
                        value={config.skipRows || '0'}
                        onChange={(e) => onChange('skipRows', e.target.value)}
                        placeholder="0"
                        className="chain-config-input chain-config-input-sm"
                        min="0"
                    />
                </>
            )}
            {config.fileType === 'xlsx' && (
                <>
                    <label>Sheet Name <span className="chain-config-optional">(optional, default: first sheet)</span></label>
                    <input
                        type="text"
                        value={config.sheetName || ''}
                        onChange={(e) => onChange('sheetName', e.target.value)}
                        placeholder="Sheet1"
                        className="chain-config-input"
                    />
                </>
            )}
        </div>
    );
};

const ImportFolderConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Folder Path</label>
        <input
            type="text"
            value={config.folderPath || ''}
            onChange={(e) => onChange('folderPath', e.target.value)}
            placeholder="data/raw/"
            className="chain-config-input"
        />
        <label>File Pattern</label>
        <input
            type="text"
            value={config.filePattern || '*.csv'}
            onChange={(e) => onChange('filePattern', e.target.value)}
            placeholder="*.csv"
            className="chain-config-input"
        />
        <label>Target Table Name</label>
        <input
            type="text"
            value={config.tableName || ''}
            onChange={(e) => onChange('tableName', e.target.value)}
            placeholder="all_raw_data"
            className="chain-config-input"
        />
    </div>
);

const ExportFileConfig = ({ config, onChange }) => {
    const handleBrowse = async () => {
        const ext = config.format === 'parquet' ? 'parquet' : config.format === 'xlsx' ? 'xlsx' : config.format === 'json' ? 'json' : 'csv';
        if (window.electronAPI?.saveFileDialog) {
            const result = await window.electronAPI.saveFileDialog({
                defaultPath: `output.${ext}`,
                filters: [{ name: 'Data Files', extensions: [ext] }],
            });
            if (result && !result.canceled && result.filePath) {
                onChange('outputPath', result.filePath);
            }
        } else {
            // Fallback: prompt for manual path entry
            const p = window.prompt('Output file path:', `output.${ext}`);
            if (p) onChange('outputPath', p);
        }
    };

    return (
        <div className="chain-config-section">
            <label>SQL Query <span className="chain-config-optional">(optional — auto-resolved from upstream)</span></label>
            <textarea
                value={config.query || ''}
                onChange={(e) => onChange('query', e.target.value)}
                placeholder="SELECT * FROM clean_sales"
                className="chain-config-textarea chain-config-sql"
                rows={3}
            />
            {!config.query && (
                <p className="chain-config-hint chain-config-hint-info">
                    <LuLightbulb size={12} />{' '}Leave empty to automatically export from the connected upstream node.
                </p>
            )}
            <label>Output Format</label>
            <select
                value={config.format || 'csv'}
                onChange={(e) => onChange('format', e.target.value)}
                className="chain-config-select"
            >
                <option value="csv">CSV</option>
                <option value="parquet">Parquet</option>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="json">JSON</option>
            </select>
            {config.format === 'csv' && (
                <>
                    <label>Delimiter <span className="chain-config-optional">(optional)</span></label>
                    <input
                        type="text"
                        value={config.delimiter || ','}
                        onChange={(e) => onChange('delimiter', e.target.value)}
                        placeholder=","
                        className="chain-config-input chain-config-input-sm"
                        maxLength={3}
                    />
                </>
            )}
            {config.format === 'parquet' && (
                <>
                    <label>Compression <span className="chain-config-optional">(optional)</span></label>
                    <select
                        value={config.compression || ''}
                        onChange={(e) => onChange('compression', e.target.value)}
                        className="chain-config-select"
                    >
                        <option value="">Default (Snappy)</option>
                        <option value="snappy">Snappy</option>
                        <option value="gzip">GZIP</option>
                        <option value="zstd">ZSTD</option>
                        <option value="uncompressed">None</option>
                    </select>
                </>
            )}
            <label>Output File Path</label>
            <div className="chain-config-input-with-btn">
                <input
                    type="text"
                    value={config.outputPath || ''}
                    onChange={(e) => onChange('outputPath', e.target.value)}
                    placeholder="exports/output.csv"
                    className="chain-config-input"
                />
                <button className="chain-config-browse-btn" onClick={handleBrowse} title="Choose output location">
                    <LuFolderOpen size={13} />
                </button>
            </div>
            {/^(s3|gs|gcs):\/\//i.test(config.outputPath || '') && (
                <p className="chain-config-hint chain-config-hint-info">
                    <LuLightbulb size={12} />{' '}Cloud destination — credentials are read from Settings (S3/GCS).
                </p>
            )}
            {(config.format === 'parquet' || config.format === 'csv') && (
                <>
                    <label>Partition By <span className="chain-config-optional">(optional)</span></label>
                    <input
                        type="text"
                        value={Array.isArray(config.partitionBy) ? config.partitionBy.join(', ') : (config.partitionBy || '')}
                        onChange={(e) => onChange('partitionBy', e.target.value)}
                        placeholder="year, region"
                        className="chain-config-input"
                    />
                    <p className="chain-config-hint">
                        Comma-separated columns. When set, the output path is treated as a directory of partitioned files (e.g. <code>year=2025/…</code>).
                    </p>
                </>
            )}
        </div>
    );
};

// Shared by ChartNodeConfig and ReportNodeConfig (deck mode) — chart type +
// axis fields. Left blank, xAxisKey/yAxisKeys auto-resolve server-side from
// the query's columns (first column as X, first numeric column as Y) — the
// same heuristic DataVisualizer.jsx uses client-side, so a chart the
// pipeline writes unattended looks like one a person would have picked.
const ChartAxisFields = ({ config, onChange }) => (
    <>
        <label>Chart Type</label>
        <select
            value={config.chartType || 'bar'}
            onChange={(e) => onChange('chartType', e.target.value)}
            className="chain-config-select"
        >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
            <option value="area">Area</option>
            <option value="pie">Pie</option>
            <option value="donut">Donut</option>
        </select>
        <label>X Axis <span className="chain-config-optional">(optional — auto-picked)</span></label>
        <input
            type="text"
            value={config.xAxisKey || ''}
            onChange={(e) => onChange('xAxisKey', e.target.value)}
            placeholder="column name"
            className="chain-config-input"
        />
        <label>Y Axis <span className="chain-config-optional">(optional — auto-picked)</span></label>
        <input
            type="text"
            value={config.yAxisKeys || ''}
            onChange={(e) => onChange('yAxisKeys', e.target.value)}
            placeholder="column name(s), comma-separated"
            className="chain-config-input"
        />
        <label>Chart Title <span className="chain-config-optional">(optional)</span></label>
        <input
            type="text"
            value={config.chartTitle || ''}
            onChange={(e) => onChange('chartTitle', e.target.value)}
            placeholder="Sales by region"
            className="chain-config-input"
        />
    </>
);

const ChartNodeConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>SQL Query <span className="chain-config-optional">(optional — auto-resolved from upstream)</span></label>
        <textarea
            value={config.query || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder="SELECT region, SUM(sales) FROM clean_sales GROUP BY region"
            className="chain-config-textarea chain-config-sql"
            rows={3}
        />
        {!config.query && (
            <p className="chain-config-hint chain-config-hint-info">
                <LuLightbulb size={12} />{' '}Leave empty to chart the connected upstream node's output.
            </p>
        )}
        <ChartAxisFields config={config} onChange={onChange} />
        <label>Output Path (.amoxvis)</label>
        <input
            type="text"
            value={config.outputPath || ''}
            onChange={(e) => onChange('outputPath', e.target.value)}
            placeholder="charts/sales_by_region.amoxvis"
            className="chain-config-input"
        />
    </div>
);

const ReportNodeConfig = ({ config, onChange }) => {
    const outputType = config.outputType === 'deck' ? 'deck' : 'notebook';
    return (
        <div className="chain-config-section">
            <label>SQL Query <span className="chain-config-optional">(optional — auto-resolved from upstream)</span></label>
            <textarea
                value={config.query || ''}
                onChange={(e) => onChange('query', e.target.value)}
                placeholder="SELECT region, SUM(sales) FROM clean_sales GROUP BY region"
                className="chain-config-textarea chain-config-sql"
                rows={3}
            />
            {!config.query && (
                <p className="chain-config-hint chain-config-hint-info">
                    <LuLightbulb size={12} />{' '}Leave empty to report on the connected upstream node's output.
                </p>
            )}
            <label>Output Type</label>
            <select
                value={outputType}
                onChange={(e) => onChange('outputType', e.target.value)}
                className="chain-config-select"
            >
                <option value="notebook">Notebook (.sqlnb) — one SQL cell</option>
                <option value="deck">Deck (.amoxdeck) — one chart slide</option>
            </select>
            <label>Title</label>
            <input
                type="text"
                value={config.title || ''}
                onChange={(e) => onChange('title', e.target.value)}
                placeholder="Weekly Sales Report"
                className="chain-config-input"
            />
            {outputType === 'deck' && <ChartAxisFields config={config} onChange={onChange} />}
            <label>Output Path {outputType === 'deck' ? '(.amoxdeck)' : '(.sqlnb)'}</label>
            <input
                type="text"
                value={config.outputPath || ''}
                onChange={(e) => onChange('outputPath', e.target.value)}
                placeholder={outputType === 'deck' ? 'reports/weekly_sales.amoxdeck' : 'reports/weekly_sales.sqlnb'}
                className="chain-config-input"
            />
            {outputType === 'deck' && (
                <p className="chain-config-hint">
                    Also writes the chart it references as a standalone .amoxvis next to the deck.
                </p>
            )}
        </div>
    );
};

const CheckpointConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Resume Label</label>
        <input
            type="text"
            value={config.resumeLabel || ''}
            onChange={(e) => onChange('resumeLabel', e.target.value)}
            placeholder="e.g., Wait for team review"
            className="chain-config-input"
        />
        <p className="chain-config-hint">
            Execution will pause at this node. Use "Resume" to continue from here.
        </p>
    </div>
);

const TableRefConfig = ({ config, onChange, tableOptions = [] }) => (
    <div className="chain-config-section">
        <label>Table / View Name</label>
        <Combobox
            value={config.tableName || ''}
            onChange={(v) => onChange('tableName', v)}
            options={tableOptions}
            placeholder="Type or pick a table…"
        />
        <p className="chain-config-hint">
            Select an existing table or view. This node passes it as input to downstream nodes (Export, SQL, Assert, etc.).
        </p>
    </div>
);

const MergeTablesConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Result Table Name</label>
        <input
            type="text"
            value={config.tableName || 'merged_data'}
            onChange={(e) => onChange('tableName', e.target.value)}
            placeholder="merged_data"
            className="chain-config-input"
        />
        <label>Merge Mode</label>
        <select
            value={config.mergeMode || 'union_all'}
            onChange={(e) => onChange('mergeMode', e.target.value)}
            className="chain-config-select"
        >
            <option value="union_all">UNION ALL (keep duplicates)</option>
            <option value="union">UNION (remove duplicates)</option>
        </select>
        <p className="chain-config-hint">
            Connect multiple upstream nodes. Their outputs will be combined into one table.
        </p>
    </div>
);

const AssertConfig = ({ config, onChange, columnOptions = [] }) => (
    <div className="chain-config-section">
        <label>Assertion Type</label>
        <select
            value={config.assertType || 'not_empty'}
            onChange={(e) => onChange('assertType', e.target.value)}
            className="chain-config-select"
        >
            <option value="not_empty">Table is not empty</option>
            <option value="row_count_gt">Row count greater than...</option>
            <option value="no_nulls">No NULL values in column</option>
            <option value="unique">Column values are unique</option>
            <option value="custom_query">Custom SQL query</option>
        </select>

        {config.assertType !== 'custom_query' && (
            <>
                <label>Table Name <span className="chain-config-optional">(optional if connected)</span></label>
                <input
                    type="text"
                    value={config.tableName || ''}
                    onChange={(e) => onChange('tableName', e.target.value)}
                    placeholder="Auto-detected from upstream node"
                    className="chain-config-input"
                />
            </>
        )}

        {config.assertType === 'row_count_gt' && (
            <>
                <label>Minimum Rows</label>
                <input
                    type="number"
                    value={config.threshold || '0'}
                    onChange={(e) => onChange('threshold', e.target.value)}
                    placeholder="0"
                    className="chain-config-input"
                    min="0"
                />
            </>
        )}

        {(config.assertType === 'no_nulls' || config.assertType === 'unique') && (
            <>
                <label>Column Name</label>
                <Combobox
                    value={config.column || ''}
                    onChange={(v) => onChange('column', v)}
                    options={columnOptions}
                    placeholder="column_name"
                    className="chain-config-input"
                />
            </>
        )}

        {config.assertType === 'custom_query' && (
            <>
                <label>SQL Query</label>
                <textarea
                    value={config.query || ''}
                    onChange={(e) => onChange('query', e.target.value)}
                    placeholder="SELECT 1 WHERE (SELECT COUNT(*) FROM my_table) > 0"
                    className="chain-config-textarea chain-config-sql"
                    rows={4}
                />
                <p className="chain-config-hint">
                    Must return at least 1 row to pass. If it returns 0 rows, the assertion fails.
                </p>
            </>
        )}

        {config.assertType !== 'custom_query' && (
            <p className="chain-config-hint chain-config-hint-info">
                <LuLightbulb size={12} />{' '}If no table is specified, this node will check the table produced by the connected upstream node.
            </p>
        )}
    </div>
);

const JoinTablesConfig = ({ config, onChange, columnOptions = [] }) => {
    const keys = (config.keys && config.keys.length)
        ? config.keys
        : ((config.leftKey || config.rightKey) ? [{ left: config.leftKey || '', right: config.rightKey || '' }] : [{ left: '', right: '' }]);
    const update = (i, patch) => onChange('keys', keys.map((k, j) => (j === i ? { ...k, ...patch } : k)));
    const remove = (i) => onChange('keys', keys.filter((_, j) => j !== i));
    const add = () => onChange('keys', [...keys, { left: '', right: '' }]);

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'joined_data'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />
            <label>Join Type</label>
            <select
                value={config.joinType || 'LEFT'}
                onChange={(e) => onChange('joinType', e.target.value)}
                className="chain-config-select"
            >
                <option value="LEFT">LEFT JOIN (keep all from left)</option>
                <option value="INNER">INNER JOIN (only matching rows)</option>
                <option value="RIGHT">RIGHT JOIN (keep all from right)</option>
                <option value="FULL">FULL JOIN (keep everything)</option>
            </select>
            <label>Join Keys (left = right)</label>
            {keys.map((k, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox value={k.left || ''} onChange={(v) => update(i, { left: v })} options={columnOptions} placeholder="left column" className="chain-config-input chain-config-input-sm" />
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>=</span>
                    <Combobox value={k.right || ''} onChange={(v) => update(i, { right: v })} options={[]} placeholder="right column" className="chain-config-input chain-config-input-sm" />
                    <button className="chain-config-remove-btn" onClick={() => remove(i)}><LuMinus size={12} /></button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={add}><LuPlus size={12} /> Add Key</button>
            <p className="chain-config-hint chain-config-hint-info">
                <LuLightbulb size={12} />{' '}Connect exactly 2 upstream nodes (1st = left, 2nd = right). Add multiple keys for a composite join. (The right-side column list isn't shown — the second table's schema isn't known here.)
            </p>
        </div>
    );
};

const FilterConfig = ({ config, onChange, columnOptions = [] }) => {
    const conditions = config.conditions || [];

    const addCondition = () => {
        onChange('conditions', [...conditions, { column: '', operator: '=', value: '' }]);
    };

    const updateCondition = (index, field, value) => {
        const updated = conditions.map((c, i) => i === index ? { ...c, [field]: value } : c);
        onChange('conditions', updated);
    };

    const removeCondition = (index) => {
        onChange('conditions', conditions.filter((_, i) => i !== index));
    };

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'filtered_data'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />

            {conditions.length > 1 && (
                <>
                    <label>Combine Conditions With</label>
                    <select
                        value={config.connector || 'AND'}
                        onChange={(e) => onChange('connector', e.target.value)}
                        className="chain-config-select"
                    >
                        <option value="AND">AND (all must match)</option>
                        <option value="OR">OR (any can match)</option>
                    </select>
                </>
            )}

            <label>Conditions</label>
            {conditions.map((cond, i) => (
                <div key={i} className="chain-config-condition-row">
                    <Combobox
                        value={cond.column}
                        onChange={(v) => updateCondition(i, 'column', v)}
                        options={columnOptions}
                        placeholder="column"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <select
                        value={cond.operator}
                        onChange={(e) => updateCondition(i, 'operator', e.target.value)}
                        className="chain-config-select chain-config-select-sm"
                    >
                        <option value="=">=</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<">&lt;</option>
                        <option value="<=">&lt;=</option>
                        <option value="LIKE">LIKE</option>
                        <option value="NOT LIKE">NOT LIKE</option>
                        <option value="IS NULL">IS NULL</option>
                        <option value="IS NOT NULL">IS NOT NULL</option>
                        <option value="IN">IN</option>
                        <option value="BETWEEN">BETWEEN</option>
                    </select>
                    {cond.operator !== 'IS NULL' && cond.operator !== 'IS NOT NULL' && (
                        <input
                            type="text"
                            value={cond.value}
                            onChange={(e) => updateCondition(i, 'value', e.target.value)}
                            placeholder={cond.operator === 'IN' ? 'a, b, c' : cond.operator === 'BETWEEN' ? 'min' : 'value'}
                            className="chain-config-input chain-config-input-sm"
                        />
                    )}
                    {cond.operator === 'BETWEEN' && (
                        <input
                            type="text"
                            value={cond.value2 || ''}
                            onChange={(e) => updateCondition(i, 'value2', e.target.value)}
                            placeholder="max"
                            className="chain-config-input chain-config-input-sm"
                        />
                    )}
                    <button className="chain-config-remove-btn" onClick={() => removeCondition(i)} title="Remove">
                        <LuMinus size={12} />
                    </button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addCondition}>
                <LuPlus size={12} /> Add Condition
            </button>
        </div>
    );
};

const GroupAggregateConfig = ({ config, onChange, columnOptions = [] }) => {
    const groupColumns = config.groupColumns || [];
    const aggregations = config.aggregations || [];

    const addGroupColumn = () => {
        onChange('groupColumns', [...groupColumns, '']);
    };

    const updateGroupColumn = (index, value) => {
        const updated = [...groupColumns];
        updated[index] = value;
        onChange('groupColumns', updated);
    };

    const removeGroupColumn = (index) => {
        onChange('groupColumns', groupColumns.filter((_, i) => i !== index));
    };

    const addAggregation = () => {
        onChange('aggregations', [...aggregations, { func: 'COUNT', column: '*', alias: '' }]);
    };

    const updateAggregation = (index, field, value) => {
        const updated = aggregations.map((a, i) => i === index ? { ...a, [field]: value } : a);
        onChange('aggregations', updated);
    };

    const removeAggregation = (index) => {
        onChange('aggregations', aggregations.filter((_, i) => i !== index));
    };

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'aggregated_data'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />

            <label>Group By Columns</label>
            {columnOptions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 6, padding: 4 }}>
                    {[...new Set([...columnOptions.map(o => o.value), ...groupColumns])].map(name => {
                        const hint = columnOptions.find(o => o.value === name)?.hint;
                        const checked = groupColumns.includes(name);
                        return (
                            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 6px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}>
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => onChange('groupColumns', e.target.checked
                                        ? [...groupColumns, name]
                                        : groupColumns.filter(c => c !== name))}
                                />
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-active)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                {hint && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{hint}</span>}
                            </label>
                        );
                    })}
                </div>
            ) : (
                <>
                    {groupColumns.map((col, i) => (
                        <div key={i} className="chain-config-inline-row">
                            <Combobox
                                value={col}
                                onChange={(v) => updateGroupColumn(i, v)}
                                options={columnOptions}
                                placeholder="column_name"
                                className="chain-config-input chain-config-input-sm"
                            />
                            <button className="chain-config-remove-btn" onClick={() => removeGroupColumn(i)}>
                                <LuMinus size={12} />
                            </button>
                        </div>
                    ))}
                    <button className="chain-config-add-btn" onClick={addGroupColumn}>
                        <LuPlus size={12} /> Add Group Column
                    </button>
                </>
            )}

            <label style={{ marginTop: 8 }}>Aggregations</label>
            {aggregations.map((agg, i) => (
                <div key={i} className="chain-config-agg-row">
                    <select
                        value={agg.func}
                        onChange={(e) => updateAggregation(i, 'func', e.target.value)}
                        className="chain-config-select chain-config-select-sm"
                    >
                        <option value="COUNT">COUNT</option>
                        <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                        <option value="SUM">SUM</option>
                        <option value="AVG">AVG</option>
                        <option value="MIN">MIN</option>
                        <option value="MAX">MAX</option>
                        <option value="MEDIAN">MEDIAN</option>
                        <option value="PERCENTILE">PERCENTILE</option>
                        <option value="STDDEV">STDDEV</option>
                        <option value="VAR_SAMP">VARIANCE</option>
                        <option value="STRING_AGG">STRING_AGG</option>
                        <option value="LIST">LIST</option>
                        <option value="FIRST">FIRST</option>
                        <option value="LAST">LAST</option>
                    </select>
                    <Combobox
                        value={agg.column}
                        onChange={(v) => updateAggregation(i, 'column', v)}
                        options={[{ value: '*' }, ...columnOptions]}
                        placeholder="column or *"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <input
                        type="text"
                        value={agg.alias || ''}
                        onChange={(e) => updateAggregation(i, 'alias', e.target.value)}
                        placeholder="alias"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <button className="chain-config-remove-btn" onClick={() => removeAggregation(i)}>
                        <LuMinus size={12} />
                    </button>
                    {agg.func === 'PERCENTILE' && (
                        <input
                            type="number" step="0.05" min="0" max="1"
                            value={agg.percentile ?? 0.5}
                            onChange={(e) => updateAggregation(i, 'percentile', e.target.value)}
                            placeholder="0.5"
                            className="chain-config-input chain-config-input-sm"
                        />
                    )}
                    {agg.func === 'STRING_AGG' && (
                        <input
                            type="text"
                            value={agg.sep ?? ', '}
                            onChange={(e) => updateAggregation(i, 'sep', e.target.value)}
                            placeholder="separator"
                            className="chain-config-input chain-config-input-sm"
                        />
                    )}
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addAggregation}>
                <LuPlus size={12} /> Add Aggregation
            </button>

            <label style={{ marginTop: 8 }}>HAVING <span className="chain-config-optional">(optional)</span></label>
            <input
                type="text"
                value={config.having || ''}
                onChange={(e) => onChange('having', e.target.value)}
                placeholder="e.g. SUM(amount) > 1000"
                className="chain-config-input chain-config-sql"
            />
        </div>
    );
};

const SelectColumnsConfig = ({ config, onChange, columnOptions = [] }) => {
    const columns = config.columns || [];

    const addColumn = () => {
        onChange('columns', [...columns, { name: '', alias: '' }]);
    };

    const updateColumn = (index, field, value) => {
        const updated = columns.map((c, i) => i === index ? { ...c, [field]: value } : c);
        onChange('columns', updated);
    };

    const removeColumn = (index) => {
        onChange('columns', columns.filter((_, i) => i !== index));
    };

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'selected_columns'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />

            <label>Columns</label>
            {columns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox
                        value={col.name}
                        onChange={(v) => updateColumn(i, 'name', v)}
                        options={columnOptions}
                        placeholder="column_name"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <input
                        type="text"
                        value={col.alias || ''}
                        onChange={(e) => updateColumn(i, 'alias', e.target.value)}
                        placeholder="rename as (optional)"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <button className="chain-config-remove-btn" onClick={() => removeColumn(i)}>
                        <LuMinus size={12} />
                    </button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addColumn}>
                <LuPlus size={12} /> Add Column
            </button>
        </div>
    );
};

const DeduplicateConfig = ({ config, onChange, columnOptions = [] }) => {
    const keyColumns = config.keyColumns || [];

    const addKeyColumn = () => {
        onChange('keyColumns', [...keyColumns, '']);
    };

    const updateKeyColumn = (index, value) => {
        const updated = [...keyColumns];
        updated[index] = value;
        onChange('keyColumns', updated);
    };

    const removeKeyColumn = (index) => {
        onChange('keyColumns', keyColumns.filter((_, i) => i !== index));
    };

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'deduplicated'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />

            <label>Keep</label>
            <select
                value={config.keep || 'first'}
                onChange={(e) => onChange('keep', e.target.value)}
                className="chain-config-select"
            >
                <option value="first">First occurrence</option>
                <option value="last">Last occurrence</option>
            </select>

            <label>Key Columns <span className="chain-config-optional">(empty = all columns)</span></label>
            {keyColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox
                        value={col}
                        onChange={(v) => updateKeyColumn(i, v)}
                        options={columnOptions}
                        placeholder="column_name"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <button className="chain-config-remove-btn" onClick={() => removeKeyColumn(i)}>
                        <LuMinus size={12} />
                    </button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addKeyColumn}>
                <LuPlus size={12} /> Add Key Column
            </button>
            <p className="chain-config-hint">
                If no key columns are specified, exact duplicate rows will be removed.
            </p>
        </div>
    );
};

// No-code expression snippets for Add Column. {} marks where the cursor logically continues.
const ADD_COLUMN_SNIPPETS = [
    { label: 'a + b', insert: ' + ' },
    { label: 'a − b', insert: ' - ' },
    { label: 'a × b', insert: ' * ' },
    { label: 'a ÷ b', insert: ' / ' },
    { label: 'ROUND', insert: 'ROUND(, 2)' },
    { label: 'UPPER', insert: 'UPPER()' },
    { label: 'LOWER', insert: 'LOWER()' },
    { label: 'CONCAT', insert: "CONCAT(, ' ', )" },
    { label: 'COALESCE', insert: 'COALESCE(, 0)' },
    { label: 'CASE', insert: 'CASE WHEN  THEN  ELSE  END' },
];

const AddColumnConfig = ({ config, onChange, columnOptions = [] }) => {
    const newColumns = config.newColumns || [];

    const addNewColumn = () => {
        onChange('newColumns', [...newColumns, { name: '', expression: '' }]);
    };

    const updateNewColumn = (index, field, value) => {
        const updated = newColumns.map((c, i) => i === index ? { ...c, [field]: value } : c);
        onChange('newColumns', updated);
    };

    const appendToExpression = (index, fragment) => {
        const cur = newColumns[index]?.expression || '';
        const needsSpace = cur && !/[\s(]$/.test(cur) && !/^[\s),]/.test(fragment);
        updateNewColumn(index, 'expression', cur + (needsSpace ? ' ' : '') + fragment);
    };

    const removeNewColumn = (index) => {
        onChange('newColumns', newColumns.filter((_, i) => i !== index));
    };

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'with_column'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />

            <label>New Columns</label>
            {newColumns.map((col, i) => (
                <div key={i} className="chain-config-column-builder">
                    <div className="chain-config-column-def">
                        <input
                            type="text"
                            value={col.name}
                            onChange={(e) => updateNewColumn(i, 'name', e.target.value)}
                            placeholder="column_name"
                            className="chain-config-input"
                        />
                        <input
                            type="text"
                            value={col.expression}
                            onChange={(e) => updateNewColumn(i, 'expression', e.target.value)}
                            placeholder='e.g. price * quantity'
                            className="chain-config-input"
                        />
                        <button className="chain-config-remove-btn" onClick={() => removeNewColumn(i)}>
                            <LuMinus size={12} />
                        </button>
                    </div>
                    <div className="chain-config-builder-tools">
                        {columnOptions.length > 0 && (
                            <Combobox
                                value=""
                                onChange={(v) => { if (v) appendToExpression(i, `"${v}"`); }}
                                options={columnOptions}
                                placeholder="+ insert column"
                                className="chain-config-input chain-config-input-sm"
                            />
                        )}
                        <div className="chain-config-snippet-row">
                            {ADD_COLUMN_SNIPPETS.map(s => (
                                <button
                                    key={s.label}
                                    type="button"
                                    className="chain-config-chip-btn"
                                    onClick={() => appendToExpression(i, s.insert)}
                                    title={`Insert ${s.label}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addNewColumn}>
                <LuPlus size={12} /> Add Column
            </button>
            <p className="chain-config-hint">
                Build expressions with the buttons, or type SQL directly: price * quantity, UPPER(name), YEAR(date), CONCAT(first, ' ', last)
            </p>
        </div>
    );
};

const SortConfig = ({ config, onChange, columnOptions = [] }) => {
    const sortColumns = config.sortColumns || [];

    const addSortColumn = () => {
        onChange('sortColumns', [...sortColumns, { column: '', direction: 'ASC' }]);
    };

    const updateSortColumn = (index, field, value) => {
        const updated = sortColumns.map((c, i) => i === index ? { ...c, [field]: value } : c);
        onChange('sortColumns', updated);
    };

    const removeSortColumn = (index) => {
        onChange('sortColumns', sortColumns.filter((_, i) => i !== index));
    };

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input
                type="text"
                value={config.tableName || 'sorted_data'}
                onChange={(e) => onChange('tableName', e.target.value)}
                className="chain-config-input"
            />

            <label>Sort By</label>
            {sortColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox
                        value={col.column}
                        onChange={(v) => updateSortColumn(i, 'column', v)}
                        options={columnOptions}
                        placeholder="column_name"
                        className="chain-config-input chain-config-input-sm"
                    />
                    <select
                        value={col.direction || 'ASC'}
                        onChange={(e) => updateSortColumn(i, 'direction', e.target.value)}
                        className="chain-config-select chain-config-select-sm"
                    >
                        <option value="ASC">A → Z (ascending)</option>
                        <option value="DESC">Z → A (descending)</option>
                    </select>
                    <button className="chain-config-remove-btn" onClick={() => removeSortColumn(i)}>
                        <LuMinus size={12} />
                    </button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addSortColumn}>
                <LuPlus size={12} /> Add Sort Column
            </button>
        </div>
    );
};

const SampleConfig = ({ config, onChange, columnOptions = [] }) => (
    <div className="chain-config-section">
        <label>Result Table Name</label>
        <input
            type="text"
            value={config.tableName || 'sample_data'}
            onChange={(e) => onChange('tableName', e.target.value)}
            className="chain-config-input"
        />
        <label>Sample Type</label>
        <select
            value={config.sampleType || 'rows'}
            onChange={(e) => onChange('sampleType', e.target.value)}
            className="chain-config-select"
        >
            <option value="rows">First N rows</option>
            <option value="percent">Random percentage</option>
            <option value="stratified">Stratified (N per group)</option>
        </select>
        {config.sampleType === 'stratified' && (
            <>
                <label>Group Column</label>
                <Combobox
                    value={config.strataColumn || ''}
                    onChange={(v) => onChange('strataColumn', v)}
                    options={columnOptions}
                    placeholder="column to stratify by"
                    className="chain-config-input"
                />
            </>
        )}
        <label>{config.sampleType === 'percent' ? 'Percentage (%)' : config.sampleType === 'stratified' ? 'Rows per group' : 'Number of Rows'}</label>
        <input
            type="number"
            value={config.sampleValue || '100'}
            onChange={(e) => onChange('sampleValue', e.target.value)}
            className="chain-config-input"
            min="1"
            max={config.sampleType === 'percent' ? '100' : undefined}
        />
    </div>
);

const PivotConfig = ({ config, onChange, columnOptions = [] }) => (
    <div className="chain-config-section">
        <label>Result Table Name</label>
        <input
            type="text"
            value={config.tableName || 'pivoted_data'}
            onChange={(e) => onChange('tableName', e.target.value)}
            className="chain-config-input"
        />
        <label>Group Column (rows)</label>
        <Combobox
            value={config.groupColumn || ''}
            onChange={(v) => onChange('groupColumn', v)}
            options={columnOptions}
            placeholder="e.g. region"
            className="chain-config-input"
        />
        <label>Pivot Column (becomes new columns)</label>
        <Combobox
            value={config.pivotColumn || ''}
            onChange={(v) => onChange('pivotColumn', v)}
            options={columnOptions}
            placeholder="e.g. month"
            className="chain-config-input"
        />
        <label>Value Column</label>
        <Combobox
            value={config.valueColumn || ''}
            onChange={(v) => onChange('valueColumn', v)}
            options={columnOptions}
            placeholder="e.g. sales_amount"
            className="chain-config-input"
        />
        <label>Aggregation Function</label>
        <select
            value={config.aggFunc || 'SUM'}
            onChange={(e) => onChange('aggFunc', e.target.value)}
            className="chain-config-select"
        >
            <option value="SUM">SUM</option>
            <option value="COUNT">COUNT</option>
            <option value="AVG">AVG</option>
            <option value="MIN">MIN</option>
            <option value="MAX">MAX</option>
        </select>
        <p className="chain-config-hint">
            Transforms rows into columns. Example: rows with month=Jan, month=Feb become separate columns.
        </p>
    </div>
);

const RenameTableConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>New Table Name</label>
        <input
            type="text"
            value={config.newName || ''}
            onChange={(e) => onChange('newName', e.target.value)}
            placeholder="new_table_name"
            className="chain-config-input"
        />
        <p className="chain-config-hint chain-config-hint-info">
            <LuLightbulb size={12} />{' '}Renames the table produced by the connected upstream node.
        </p>
    </div>
);

const CreateTableConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Target Table Name</label>
        <input
            type="text"
            value={config.tableName || ''}
            onChange={(e) => onChange('tableName', e.target.value)}
            placeholder="my_new_table"
            className="chain-config-input"
        />
        <label>SQL Query <span className="chain-config-optional">(optional)</span></label>
        <textarea
            value={config.query || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder="SELECT * FROM ..."
            className="chain-config-textarea chain-config-sql"
            rows={4}
        />
        {!config.query && (
            <p className="chain-config-hint chain-config-hint-info">
                <LuLightbulb size={12} />{' '}If empty, the table will be created from the upstream node's output.
            </p>
        )}
    </div>
);

/**
 * SQL Preview — Shows the SQL that will be generated for a node.
 * Helps users learn SQL by seeing what happens behind the scenes.
 */
const generateSqlPreview = (nodeType, config) => {
    const c = config || {};
    switch (nodeType) {
        case 'sql_file':
            return c.filePath ? `-- Contents of ${c.filePath}\n-- (SQL from file will be executed as-is)` : null;
        case 'sql_inline':
            return c.query || null;
        case 'table_ref':
            return c.tableName ? `SELECT * FROM "${c.tableName}"` : null;
        case 'import_file': {
            if (!c.sourcePath) return null;
            const tbl = c.tableName || 'imported_data';
            const ft = c.fileType || 'csv';
            const reader = ft === 'parquet' ? 'read_parquet' : ft === 'json' ? 'read_json_auto' : ft === 'xlsx' ? 'read_xlsx' : 'read_csv';
            const opts = ft === 'csv' ? ", auto_detect=true, header=true" : '';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM ${reader}('${c.sourcePath}'${opts})`;
        }
        case 'import_folder': {
            if (!c.folderPath) return null;
            const tbl = c.tableName || 'imported_data';
            const pattern = c.filePattern || '*.csv';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM read_csv(\n  '${c.folderPath}/${pattern}',\n  auto_detect=true, header=true,\n  union_by_name=true\n)`;
        }
        case 'export_file': {
            if (!c.outputPath) return null;
            const q = c.query || 'SELECT * FROM <upstream_table>';
            const fmt = (c.format || 'csv').toUpperCase();
            const partCols = Array.isArray(c.partitionBy) ? c.partitionBy : (c.partitionBy ? String(c.partitionBy).split(',').map(s => s.trim()).filter(Boolean) : []);
            const partOpt = partCols.length ? `, PARTITION_BY (${partCols.map(p => `"${p}"`).join(', ')})` : '';
            return `COPY (\n  ${q}\n) TO '${c.outputPath}'\n(FORMAT ${fmt}, HEADER${partOpt})`;
        }
        case 'bucket_read': {
            if (!c.uri) return null;
            const tbl = c.tableName || 'cloud_data';
            const ft = c.format || 'parquet';
            const reader = ft === 'parquet' ? 'read_parquet' : ft === 'json' ? 'read_json_auto' : 'read_csv';
            const opts = ft === 'csv' ? ', auto_detect=true, header=true' : '';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM ${reader}('${c.uri}'${opts})`;
        }
        case 'gsheet_read': {
            if (!c.spreadsheetId) return null;
            const tbl = c.tableName || 'gsheet_data';
            const sheetOpt = c.sheet ? `, sheet='${c.sheet}'` : '';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM read_gsheet('${c.spreadsheetId}'${sheetOpt})`;
        }
        case 'ai_enrich': {
            if (!c.inputColumn) return null;
            const out = c.outputColumn || 'ai_result';
            return `-- For each row, the AI ${c.task || 'classify'} task reads "${c.inputColumn}"\n-- and writes the result into "${out}".\nSELECT *, ai_${c.task || 'classify'}("${c.inputColumn}") AS "${out}"\nFROM <upstream_table>\nLIMIT ${c.maxRows ?? 500}`;
        }
        case 'create_table': {
            if (!c.tableName) return null;
            const q = c.query || 'SELECT * FROM <upstream_table>';
            return `CREATE OR REPLACE TABLE "${c.tableName}" AS\n${q}`;
        }
        case 'filter': {
            const conds = c.conditions || [];
            if (conds.length === 0) return null;
            const connector = c.connector || 'AND';
            const tbl = c.tableName || 'filtered_data';
            const where = conds.map(cond => {
                const col = `"${cond.column || '?'}"`;
                if (cond.operator === 'IS NULL' || cond.operator === 'IS NOT NULL') return `${col} ${cond.operator}`;
                return `${col} ${cond.operator || '='} '${cond.value || ''}'`;
            }).join(`\n  ${connector} `);
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM <upstream_table>\nWHERE ${where}`;
        }
        case 'group_aggregate': {
            const groups = c.groupColumns || [];
            const aggs = c.aggregations || [];
            if (aggs.length === 0) return null;
            const tbl = c.tableName || 'aggregated_data';
            const selects = [
                ...groups.map(g => `"${g}"`),
                ...aggs.map(a => a.func === 'COUNT' && a.column === '*' ? `COUNT(*) AS "${a.alias || 'count'}"` : `${a.func}("${a.column}") AS "${a.alias || `${a.func.toLowerCase()}_${a.column}`}"`)
            ];
            const groupBy = groups.length > 0 ? `\nGROUP BY ${groups.map(g => `"${g}"`).join(', ')}` : '';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT\n  ${selects.join(',\n  ')}\nFROM <upstream_table>${groupBy}`;
        }
        case 'join_tables': {
            const tbl = c.tableName || 'joined_data';
            const jt = c.joinType || 'LEFT';
            const lk = c.leftKey || '?';
            const rk = c.rightKey || '?';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT *\nFROM <left_table> AS _left\n${jt} JOIN <right_table> AS _right\n  ON _left."${lk}" = _right."${rk}"`;
        }
        case 'select_columns': {
            const cols = c.columns || [];
            if (cols.length === 0) return null;
            const tbl = c.tableName || 'selected_columns';
            const colList = cols.map(col => col.alias && col.alias !== col.name ? `"${col.name}" AS "${col.alias}"` : `"${col.name}"`);
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT\n  ${colList.join(',\n  ')}\nFROM <upstream_table>`;
        }
        case 'deduplicate': {
            const keys = c.keyColumns || [];
            const tbl = c.tableName || 'deduplicated';
            if (keys.length === 0) return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT DISTINCT *\nFROM <upstream_table>`;
            const partition = keys.map(k => `"${k}"`).join(', ');
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM (\n  SELECT *, ROW_NUMBER() OVER (\n    PARTITION BY ${partition}\n  ) AS _rn\n  FROM <upstream_table>\n) WHERE _rn = 1`;
        }
        case 'add_column': {
            const cols = c.newColumns || [];
            if (cols.length === 0) return null;
            const tbl = c.tableName || 'with_column';
            const exprs = cols.map(col => `(${col.expression || '?'}) AS "${col.name || 'new_col'}"`);
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT\n  *,\n  ${exprs.join(',\n  ')}\nFROM <upstream_table>`;
        }
        case 'sort': {
            const sorts = c.sortColumns || [];
            if (sorts.length === 0) return null;
            const tbl = c.tableName || 'sorted_data';
            const orderBy = sorts.map(s => `"${s.column || '?'}" ${s.direction || 'ASC'}`).join(', ');
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM <upstream_table>\nORDER BY ${orderBy}`;
        }
        case 'sample': {
            const tbl = c.tableName || 'sample_data';
            const val = c.sampleValue || '100';
            if (c.sampleType === 'percent') return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM <upstream_table>\nUSING SAMPLE ${val}%`;
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nSELECT * FROM <upstream_table>\nLIMIT ${val}`;
        }
        case 'pivot': {
            if (!c.groupColumn || !c.pivotColumn || !c.valueColumn) return null;
            const tbl = c.tableName || 'pivoted_data';
            return `CREATE OR REPLACE TABLE "${tbl}" AS\nPIVOT <upstream_table>\nON "${c.pivotColumn}"\nUSING ${c.aggFunc || 'SUM'}("${c.valueColumn}")\nGROUP BY "${c.groupColumn}"`;
        }
        case 'rename_table':
            return c.newName ? `ALTER TABLE <upstream_table>\nRENAME TO "${c.newName}"` : null;
        case 'assert': {
            const at = c.assertType || 'not_empty';
            const tbl = c.tableName || '<upstream_table>';
            if (at === 'not_empty') return `-- Assertion: table is not empty\nSELECT COUNT(*) FROM "${tbl}"\n-- Fails if count = 0`;
            if (at === 'row_count_gt') return `-- Assertion: row count > ${c.threshold || 0}\nSELECT COUNT(*) FROM "${tbl}"\n-- Fails if count <= ${c.threshold || 0}`;
            if (at === 'no_nulls') return `-- Assertion: no NULL values\nSELECT COUNT(*) FROM "${tbl}"\nWHERE "${c.column || '?'}" IS NULL\n-- Fails if count > 0`;
            if (at === 'unique') return `-- Assertion: unique values\nSELECT COUNT(*) - COUNT(DISTINCT "${c.column || '?'}")\nFROM "${tbl}"\n-- Fails if result > 0`;
            if (at === 'custom_query') return c.query || null;
            return null;
        }
        case 'chart': {
            const q = c.query || 'SELECT * FROM <upstream_table>';
            const out = c.outputPath || '<output>.amoxvis';
            return `-- Writes ${out} (chart config JSON, not a table)\n${q}`;
        }
        case 'report': {
            const q = c.query || 'SELECT * FROM <upstream_table>';
            const out = c.outputPath || (c.outputType === 'deck' ? '<output>.amoxdeck' : '<output>.sqlnb');
            const kind = c.outputType === 'deck' ? 'deck + its chart' : 'notebook';
            return `-- Writes ${out} (${kind}, not a table)\n${q}`;
        }
        default:
            return null;
    }
};

const SqlPreview = ({ nodeType, config }) => {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const sql = generateSqlPreview(nodeType, config);

    if (!sql && nodeType === 'checkpoint') return null;
    if (!sql) return (
        <div className="chain-config-sql-preview">
            <div className="chain-config-sql-preview-header" onClick={() => setExpanded(!expanded)}>
                {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                <LuCode size={12} />
                <span>SQL Preview</span>
            </div>
            {expanded && (
                <div className="chain-config-sql-preview-empty">
                    Configure the node to see the generated SQL
                </div>
            )}
        </div>
    );

    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(sql);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="chain-config-sql-preview">
            <div className="chain-config-sql-preview-header" onClick={() => setExpanded(!expanded)}>
                {expanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                <LuCode size={12} />
                <span>SQL Preview</span>
                {expanded && (
                    <button className="chain-config-sql-copy" onClick={handleCopy} title="Copy SQL">
                        <LuCopy size={11} />
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                )}
            </div>
            {expanded && (
                <pre className="chain-config-sql-preview-code">{sql}</pre>
            )}
        </div>
    );
};

// --- New node configs ---

const TypeCastConfig = ({ config, onChange, columnOptions = [] }) => {
    const casts = config.casts || [];
    const TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'DECIMAL(18,4)', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'TIME', 'FLOAT', 'HUGEINT'];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'casted_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Casts</label>
            {casts.map((c, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox value={c.column || ''} onChange={v => { const u = [...casts]; u[i] = { ...u[i], column: v }; onChange('casts', u); }} options={columnOptions} placeholder="column" className="chain-config-input chain-config-input-sm" />
                    <select value={c.targetType || 'VARCHAR'} onChange={e => { const u = [...casts]; u[i] = { ...u[i], targetType: e.target.value }; onChange('casts', u); }} className="chain-config-select chain-config-select-sm">
                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="text" value={c.alias || ''} onChange={e => { const u = [...casts]; u[i] = { ...u[i], alias: e.target.value }; onChange('casts', u); }} placeholder="alias (optional)" className="chain-config-input chain-config-input-sm" />
                    <button className="chain-config-remove-btn" onClick={() => onChange('casts', casts.filter((_, j) => j !== i))}><LuMinus size={12} /></button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={() => onChange('casts', [...casts, { column: '', targetType: 'VARCHAR', alias: '' }])}>
                <LuPlus size={12} /> Add Cast
            </button>
            <p className="chain-config-hint">Uses TRY_CAST — invalid values become NULL instead of failing.</p>
        </div>
    );
};

const WindowFunctionsConfig = ({ config, onChange, columnOptions = [] }) => {
    const windows = config.windows || [];
    const FUNCS = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNT'];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'with_window'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Window Functions</label>
            {windows.map((w, i) => (
                <div key={i} className="chain-config-window-row">
                    <div className="chain-config-inline-row">
                        <select value={w.func || 'ROW_NUMBER'} onChange={e => { const u = [...windows]; u[i] = { ...u[i], func: e.target.value }; onChange('windows', u); }} className="chain-config-select chain-config-select-sm">
                            {FUNCS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <Combobox value={w.column || ''} onChange={v => { const u = [...windows]; u[i] = { ...u[i], column: v }; onChange('windows', u); }} options={[{ value: '*' }, ...columnOptions]} placeholder="column (or * for COUNT)" className="chain-config-input chain-config-input-sm" />
                        <input type="text" value={w.alias || ''} onChange={e => { const u = [...windows]; u[i] = { ...u[i], alias: e.target.value }; onChange('windows', u); }} placeholder="alias" className="chain-config-input chain-config-input-sm" />
                        <button className="chain-config-remove-btn" onClick={() => onChange('windows', windows.filter((_, j) => j !== i))}><LuMinus size={12} /></button>
                    </div>
                    <input type="text" value={(w.partitionBy || []).join(', ')} onChange={e => { const u = [...windows]; u[i] = { ...u[i], partitionBy: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; onChange('windows', u); }} placeholder="PARTITION BY: col1, col2" className="chain-config-input" />
                    <input type="text" value={(w.orderBy || []).join(', ')} onChange={e => { const u = [...windows]; u[i] = { ...u[i], orderBy: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; onChange('windows', u); }} placeholder="ORDER BY: col1, col2" className="chain-config-input" />
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={() => onChange('windows', [...windows, { func: 'ROW_NUMBER', column: '', alias: '', partitionBy: [], orderBy: [] }])}>
                <LuPlus size={12} /> Add Window Function
            </button>
        </div>
    );
};

const UnpivotConfig = ({ config, onChange, columnOptions = [] }) => {
    const valueColumns = config.valueColumns || [];
    const idColumns = config.idColumns || [];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'unpivoted_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Value Columns (become rows)</label>
            {valueColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox value={col} onChange={v => { const u = [...valueColumns]; u[i] = v; onChange('valueColumns', u); }} options={columnOptions} placeholder="column_name" className="chain-config-input chain-config-input-sm" />
                    <button className="chain-config-remove-btn" onClick={() => onChange('valueColumns', valueColumns.filter((_, j) => j !== i))}><LuMinus size={12} /></button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={() => onChange('valueColumns', [...valueColumns, ''])}>
                <LuPlus size={12} /> Add Value Column
            </button>
            <label>Name Column</label>
            <input type="text" value={config.nameColumn || 'variable'} onChange={e => onChange('nameColumn', e.target.value)} placeholder="variable" className="chain-config-input" />
            <label>Value Column</label>
            <input type="text" value={config.valueColumn || 'value'} onChange={e => onChange('valueColumn', e.target.value)} placeholder="value" className="chain-config-input" />
            <p className="chain-config-hint">Turns wide data (many columns) into tall data (many rows). Each selected column becomes a row with the column name in "Name Column" and the value in "Value Column".</p>
        </div>
    );
};

const HttpFetchConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>URL</label>
        <input type="text" value={config.url || ''} onChange={e => onChange('url', e.target.value)} placeholder="https://example.com/data.csv" className="chain-config-input" />
        <label>Table Name</label>
        <input type="text" value={config.tableName || 'fetched_data'} onChange={e => onChange('tableName', e.target.value)} placeholder="fetched_data" className="chain-config-input" />
        <label>Format</label>
        <select value={config.format || 'csv'} onChange={e => onChange('format', e.target.value)} className="chain-config-select">
            <option value="csv">CSV</option>
            <option value="parquet">Parquet</option>
            <option value="json">JSON</option>
        </select>
        <p className="chain-config-hint chain-config-hint-info">
            <LuLightbulb size={12} />{' '}DuckDB can read files directly from URLs. Requires internet access and the httpfs extension (auto-installed).
        </p>
    </div>
);

const BucketReadConfig = ({ config, onChange }) => {
    const uri = config.uri || '';
    const provider = /^(gs|gcs):\/\//i.test(uri) ? 'gcs' : (uri ? 's3' : (config.provider || 's3'));
    return (
        <div className="chain-config-section">
            <label>Bucket URI</label>
            <input
                type="text"
                value={uri}
                onChange={e => {
                    const v = e.target.value;
                    const p = /^(gs|gcs):\/\//i.test(v) ? 'gcs' : 's3';
                    onChange('uri', v);
                    if (p !== config.provider) onChange('provider', p);
                }}
                placeholder="s3://my-bucket/data/*.parquet"
                className="chain-config-input"
            />
            <label>Format</label>
            <select value={config.format || 'parquet'} onChange={e => onChange('format', e.target.value)} className="chain-config-select">
                <option value="parquet">Parquet</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
            </select>
            <label>Table Name</label>
            <input type="text" value={config.tableName || 'cloud_data'} onChange={e => onChange('tableName', e.target.value)} placeholder="cloud_data" className="chain-config-input" />
            <p className="chain-config-hint chain-config-hint-info">
                <LuLightbulb size={12} />{' '}Reads directly from {provider === 'gcs' ? 'Google Cloud Storage' : 'S3-compatible storage'}. Configure credentials in Settings → Cloud. Glob patterns like <code>*.parquet</code> are supported.
            </p>
        </div>
    );
};

const GSheetReadConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Spreadsheet ID or URL</label>
        <input
            type="text"
            value={config.spreadsheetId || ''}
            onChange={e => {
                const raw = e.target.value.trim();
                const m = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
                onChange('spreadsheetId', m ? m[1] : raw);
            }}
            placeholder="1AbC… or full Google Sheets URL"
            className="chain-config-input"
        />
        <label>Sheet / Tab Name <span className="chain-config-optional">(optional)</span></label>
        <input type="text" value={config.sheet || ''} onChange={e => onChange('sheet', e.target.value)} placeholder="Sheet1" className="chain-config-input" />
        <label>Table Name</label>
        <input type="text" value={config.tableName || 'gsheet_data'} onChange={e => onChange('tableName', e.target.value)} placeholder="gsheet_data" className="chain-config-input" />
        <p className="chain-config-hint chain-config-hint-info">
            <LuLightbulb size={12} />{' '}Requires a Google service-account key configured in Settings. The account must have read access to the sheet.
        </p>
    </div>
);

const AiEnrichConfig = ({ config, onChange, columnOptions = [] }) => {
    const task = config.task || 'classify';
    const options = config.options || {};
    const setOption = (key, value) => onChange('options', { ...options, [key]: value });
    return (
        <div className="chain-config-section">
            <label>Input Column</label>
            <Combobox
                value={config.inputColumn || ''}
                onChange={v => onChange('inputColumn', v)}
                options={columnOptions}
                placeholder="text column to read"
            />
            <label>Task</label>
            <select value={task} onChange={e => onChange('task', e.target.value)} className="chain-config-select">
                <option value="classify">Classify (assign a label)</option>
                <option value="extract">Extract (pull a value)</option>
                <option value="summarize">Summarize</option>
                <option value="redact_pii">Redact PII</option>
                <option value="custom">Custom instruction</option>
            </select>
            {task === 'classify' && (
                <>
                    <label>Categories <span className="chain-config-optional">(optional)</span></label>
                    <input type="text" value={options.categories || ''} onChange={e => setOption('categories', e.target.value)} placeholder="positive, neutral, negative" className="chain-config-input" />
                </>
            )}
            {task === 'extract' && (
                <>
                    <label>What to extract</label>
                    <input type="text" value={options.instruction || ''} onChange={e => setOption('instruction', e.target.value)} placeholder="the company name" className="chain-config-input" />
                </>
            )}
            {task === 'custom' && (
                <>
                    <label>Instruction</label>
                    <textarea value={options.instruction || ''} onChange={e => setOption('instruction', e.target.value)} placeholder="Describe exactly what to return for each row…" className="chain-config-textarea" rows={3} />
                </>
            )}
            <label>Output Column</label>
            <input type="text" value={config.outputColumn || 'ai_result'} onChange={e => onChange('outputColumn', e.target.value)} placeholder="ai_result" className="chain-config-input" />
            <label>Max Rows</label>
            <input
                type="number"
                value={config.maxRows ?? 500}
                onChange={e => onChange('maxRows', Math.max(1, parseInt(e.target.value, 10) || 1))}
                min={1}
                className="chain-config-input chain-config-input-sm"
            />
            <p className="chain-config-hint chain-config-hint-info">
                <LuLightbulb size={12} />{' '}Runs the active AI model once per row using the configured provider. Keep Max Rows modest — large tables mean many calls.
            </p>
        </div>
    );
};

const CleanConfig = ({ config, onChange, columnOptions = [] }) => {
    const operations = config.operations || [];
    const CLEAN_TYPES = [
        { value: 'trim', label: 'Trim whitespace' },
        { value: 'lower', label: 'Convert to lowercase' },
        { value: 'upper', label: 'Convert to uppercase' },
        { value: 'replace', label: 'Replace text' },
        { value: 'regex_replace', label: 'Regex replace' },
        { value: 'fill_null', label: 'Fill NULL values' },
        { value: 'nullify_empty', label: 'Nullify empty strings' },
        { value: 'regex_extract', label: 'Regex extract' },
        { value: 'split_part', label: 'Split — take part' },
        { value: 'normalize', label: 'Normalize (accents/spaces)' },
    ];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'cleaned_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Cleaning Operations</label>
            {operations.map((op, i) => (
                <div key={i} className="chain-config-clean-row">
                    <div className="chain-config-inline-row">
                        <Combobox value={op.column || ''} onChange={v => { const u = [...operations]; u[i] = { ...u[i], column: v }; onChange('operations', u); }} options={columnOptions} placeholder="column" className="chain-config-input chain-config-input-sm" />
                        <select value={op.type || 'trim'} onChange={e => { const u = [...operations]; u[i] = { ...u[i], type: e.target.value }; onChange('operations', u); }} className="chain-config-select chain-config-select-sm">
                            {CLEAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <button className="chain-config-remove-btn" onClick={() => onChange('operations', operations.filter((_, j) => j !== i))}><LuMinus size={12} /></button>
                    </div>
                    {op.type === 'replace' && (
                        <div className="chain-config-inline-row">
                            <input type="text" value={op.from || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], from: e.target.value }; onChange('operations', u); }} placeholder="search text" className="chain-config-input chain-config-input-sm" />
                            <input type="text" value={op.to || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], to: e.target.value }; onChange('operations', u); }} placeholder="replacement" className="chain-config-input chain-config-input-sm" />
                        </div>
                    )}
                    {op.type === 'regex_replace' && (
                        <div className="chain-config-inline-row">
                            <input type="text" value={op.pattern || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], pattern: e.target.value }; onChange('operations', u); }} placeholder="regex pattern" className="chain-config-input chain-config-input-sm" />
                            <input type="text" value={op.replacement || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], replacement: e.target.value }; onChange('operations', u); }} placeholder="replacement" className="chain-config-input chain-config-input-sm" />
                        </div>
                    )}
                    {op.type === 'fill_null' && (
                        <input type="text" value={op.defaultValue || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], defaultValue: e.target.value }; onChange('operations', u); }} placeholder="default value for NULLs" className="chain-config-input" />
                    )}
                    {op.type === 'regex_extract' && (
                        <input type="text" value={op.pattern || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], pattern: e.target.value }; onChange('operations', u); }} placeholder="regex pattern (first match)" className="chain-config-input" />
                    )}
                    {op.type === 'split_part' && (
                        <div className="chain-config-inline-row">
                            <input type="text" value={op.delimiter || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], delimiter: e.target.value }; onChange('operations', u); }} placeholder="delimiter (e.g. ,)" className="chain-config-input chain-config-input-sm" />
                            <input type="number" min="1" value={op.part ?? 1} onChange={e => { const u = [...operations]; u[i] = { ...u[i], part: e.target.value }; onChange('operations', u); }} placeholder="part #" className="chain-config-input chain-config-input-sm" />
                        </div>
                    )}
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={() => onChange('operations', [...operations, { column: '', type: 'trim' }])}>
                <LuPlus size={12} /> Add Operation
            </button>
        </div>
    );
};

const DATE_OPS = [
    { value: 'parse', label: 'Parse text → date' },
    { value: 'extract', label: 'Extract part' },
    { value: 'truncate', label: 'Truncate (bucket)' },
    { value: 'format', label: 'Format date → text' },
    { value: 'add', label: 'Add / subtract' },
    { value: 'diff', label: 'Difference (2 dates)' },
    { value: 'age', label: 'Age (from today)' },
];
const DATE_PARTS = ['year', 'quarter', 'month', 'week', 'day', 'dayofweek', 'hour', 'minute'];
const DATE_UNITS = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute'];

const DateOpsConfig = ({ config, onChange, columnOptions = [] }) => {
    const operations = config.operations || [];
    const update = (i, patch) => onChange('operations', operations.map((o, j) => (j === i ? { ...o, ...patch } : o)));
    const remove = (i) => onChange('operations', operations.filter((_, j) => j !== i));
    const add = () => onChange('operations', [...operations, { column: '', op: 'parse', alias: '' }]);

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'dated_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />

            <label>Date Operations</label>
            {operations.map((o, i) => (
                <div key={i} className="chain-config-clean-row">
                    <div className="chain-config-inline-row">
                        <Combobox value={o.column || ''} onChange={v => update(i, { column: v })} options={columnOptions} placeholder="date column" className="chain-config-input chain-config-input-sm" />
                        <select value={o.op || 'parse'} onChange={e => update(i, { op: e.target.value })} className="chain-config-select chain-config-select-sm">
                            {DATE_OPS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <button className="chain-config-remove-btn" onClick={() => remove(i)}><LuMinus size={12} /></button>
                    </div>

                    {(o.op === 'parse' || o.op === 'format') && (
                        <input
                            type="text"
                            value={o.format || ''}
                            onChange={e => update(i, { format: e.target.value })}
                            placeholder={o.op === 'parse' ? 'format e.g. %d/%m/%Y  (blank = auto)' : 'format e.g. %Y-%m-%d'}
                            className="chain-config-input"
                        />
                    )}
                    {o.op === 'extract' && (
                        <select value={o.part || 'year'} onChange={e => update(i, { part: e.target.value })} className="chain-config-select">
                            {DATE_PARTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    )}
                    {(o.op === 'truncate' || o.op === 'age') && (
                        <select value={o.unit || (o.op === 'age' ? 'day' : 'month')} onChange={e => update(i, { unit: e.target.value })} className="chain-config-select">
                            {DATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    )}
                    {o.op === 'add' && (
                        <div className="chain-config-inline-row">
                            <input type="number" value={o.amount ?? ''} onChange={e => update(i, { amount: e.target.value })} placeholder="amount (e.g. -7)" className="chain-config-input chain-config-input-sm" />
                            <select value={o.unit || 'day'} onChange={e => update(i, { unit: e.target.value })} className="chain-config-select chain-config-select-sm">
                                {DATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    )}
                    {o.op === 'diff' && (
                        <div className="chain-config-inline-row">
                            <Combobox value={o.column2 || ''} onChange={v => update(i, { column2: v })} options={columnOptions} placeholder="second date column" className="chain-config-input chain-config-input-sm" />
                            <select value={o.unit || 'day'} onChange={e => update(i, { unit: e.target.value })} className="chain-config-select chain-config-select-sm">
                                {DATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    )}

                    <input
                        type="text"
                        value={o.alias || ''}
                        onChange={e => update(i, { alias: e.target.value })}
                        placeholder={`output column (blank = ${o.column || 'col'}_${o.op || 'op'}; = source to replace)`}
                        className="chain-config-input"
                    />
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={add}><LuPlus size={12} /> Add Operation</button>
            <p className="chain-config-hint">
                Uses TRY_* — invalid values become NULL instead of failing. Set the output column equal
                to the source column to replace it in place.
            </p>
        </div>
    );
};

const FlattenConfig = ({ config, onChange, columnOptions = [] }) => {
    const mode = config.mode || 'fields';
    const paths = config.paths || [];
    const updatePath = (i, patch) => onChange('paths', paths.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'flattened_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Mode</label>
            <select value={mode} onChange={e => onChange('mode', e.target.value)} className="chain-config-select">
                <option value="fields">Extract JSON fields → columns</option>
                <option value="explode">Explode array → rows</option>
            </select>
            <label>Source Column</label>
            <Combobox value={config.column || ''} onChange={v => onChange('column', v)} options={columnOptions} placeholder="JSON / array column" className="chain-config-input" />
            {mode === 'explode' ? (
                <>
                    <label>Output Column</label>
                    <input type="text" value={config.alias || ''} onChange={e => onChange('alias', e.target.value)} placeholder={`${config.column || 'col'}_item`} className="chain-config-input" />
                </>
            ) : (
                <>
                    <label>Fields to extract</label>
                    {paths.map((p, i) => (
                        <div key={i} className="chain-config-inline-row">
                            <input type="text" value={p.path || ''} onChange={e => updatePath(i, { path: e.target.value })} placeholder="$.user.id" className="chain-config-input chain-config-input-sm" />
                            <input type="text" value={p.alias || ''} onChange={e => updatePath(i, { alias: e.target.value })} placeholder="alias" className="chain-config-input chain-config-input-sm" />
                            <button className="chain-config-remove-btn" onClick={() => onChange('paths', paths.filter((_, j) => j !== i))}><LuMinus size={12} /></button>
                        </div>
                    ))}
                    <button className="chain-config-add-btn" onClick={() => onChange('paths', [...paths, { path: '', alias: '' }])}><LuPlus size={12} /> Add Field</button>
                </>
            )}
            <p className="chain-config-hint">
                Fields: extract JSON paths (e.g. $.user.id) to columns. Explode: unnest a list/array column into one row per element.
            </p>
        </div>
    );
};

const SchemaValidationConfig = ({ config, onChange, columnOptions = [] }) => {
    const expectedColumns = config.expectedColumns || [];
    const TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'FLOAT', 'ANY'];

    return (
        <div className="chain-config-section">
            <label>Expected Columns</label>
            {expectedColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <Combobox value={col.name || ''} onChange={v => { const u = [...expectedColumns]; u[i] = { ...u[i], name: v }; onChange('expectedColumns', u); }} options={columnOptions} placeholder="column_name" className="chain-config-input chain-config-input-sm" />
                    <select value={col.type || 'ANY'} onChange={e => { const u = [...expectedColumns]; u[i] = { ...u[i], type: e.target.value }; onChange('expectedColumns', u); }} className="chain-config-select chain-config-select-sm">
                        {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button className="chain-config-remove-btn" onClick={() => onChange('expectedColumns', expectedColumns.filter((_, j) => j !== i))}><LuMinus size={12} /></button>
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={() => onChange('expectedColumns', [...expectedColumns, { name: '', type: 'ANY' }])}>
                <LuPlus size={12} /> Add Expected Column
            </button>
            <label style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={config.strict || false} onChange={e => onChange('strict', e.target.checked)} />
                Strict mode (fail on unexpected columns)
            </label>
            <p className="chain-config-hint">
                Chain stops if any expected column is missing or has wrong type. Use type "ANY" to skip type check.
            </p>
        </div>
    );
};

const NotificationConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Notification Type</label>
        <select value={config.notifType || 'toast'} onChange={e => onChange('notifType', e.target.value)} className="chain-config-select">
            <option value="toast">App Toast (show message in UI)</option>
            <option value="log_file">Append to Log File</option>
            <option value="webhook">HTTP Webhook</option>
        </select>
        <label>Message</label>
        <input type="text" value={config.message || ''} onChange={e => onChange('message', e.target.value)} placeholder="Step completed successfully" className="chain-config-input" />
        {config.notifType === 'log_file' && (
            <>
                <label>Log File Path</label>
                <input type="text" value={config.logFilePath || ''} onChange={e => onChange('logFilePath', e.target.value)} placeholder="logs/chain.log" className="chain-config-input" />
            </>
        )}
        {config.notifType === 'webhook' && (
            <>
                <label>Webhook URL</label>
                <input type="text" value={config.webhookUrl || ''} onChange={e => onChange('webhookUrl', e.target.value)} placeholder="https://hooks.example.com/..." className="chain-config-input" />
                <p className="chain-config-hint">Sends a POST request with JSON body: {"{ message, timestamp }"}. Webhook failures do NOT stop the chain.</p>
            </>
        )}
    </div>
);

export default ChainNodeConfigPanel;
