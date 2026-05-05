/**
 * ChainNodeConfigPanel — Right-side config panel for the selected node.
 * Displays editable label, description, and type-specific configuration fields.
 */
import { useState } from 'react';
import {
    LuX, LuFileCode2, LuPlus, LuExternalLink, LuTrash2, LuMinus,
    LuCode, LuChevronDown, LuChevronRight, LuCopy, LuFolderOpen
} from 'react-icons/lu';
import { NODE_TYPES } from './chainNodeTypes';

const ChainNodeConfigPanel = ({ node, onUpdate, onDelete, onClose, onCreateSqlFile, onOpenFile, sqlFiles = [], chainDefinition }) => {
    if (!node) return null;

    const nodeType = NODE_TYPES[node.data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;
    const config = node.data.config || {};

    const updateField = (field, value) => {
        onUpdate(node.id, { [field]: value });
    };

    const updateConfig = (key, value) => {
        onUpdate(node.id, { config: { ...config, [key]: value } });
    };

    return (
        <div className="chain-config-panel">
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

            <div className="chain-config-body">
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
                    <ImportFileConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'import_folder' && (
                    <ImportFolderConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'export_file' && (
                    <ExportFileConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'checkpoint' && (
                    <CheckpointConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'table_ref' && (
                    <TableRefConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'merge_tables' && (
                    <MergeTablesConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'assert' && (
                    <AssertConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'join_tables' && (
                    <JoinTablesConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'filter' && (
                    <FilterConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'group_aggregate' && (
                    <GroupAggregateConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'select_columns' && (
                    <SelectColumnsConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'deduplicate' && (
                    <DeduplicateConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'add_column' && (
                    <AddColumnConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'sort' && (
                    <SortConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'sample' && (
                    <SampleConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'pivot' && (
                    <PivotConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'rename_table' && (
                    <RenameTableConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'create_table' && (
                    <CreateTableConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'type_cast' && (
                    <TypeCastConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'window_functions' && (
                    <WindowFunctionsConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'unpivot' && (
                    <UnpivotConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'http_fetch' && (
                    <HttpFetchConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'clean' && (
                    <CleanConfig config={config} onChange={updateConfig} />
                )}

                {node.data.nodeType === 'schema_validation' && (
                    <SchemaValidationConfig config={config} onChange={updateConfig} />
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

const applyFilePath = (filePath, onChange) => {
    onChange('sourcePath', filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (IMPORT_EXT_MAP[ext]) onChange('fileType', IMPORT_EXT_MAP[ext]);
};

const ImportFileConfig = ({ config, onChange }) => {
    const handleBrowse = async () => {
        if (window.electronAPI?.openFileDialog) {
            const result = await window.electronAPI.openFileDialog({
                filters: [
                    { name: 'Data Files', extensions: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'xlsx', 'xls'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });
            if (result && !result.canceled && result.filePaths?.[0]) {
                applyFilePath(result.filePaths[0], onChange);
            }
        } else {
            // Fallback: HTML file input (works in browser / dev)
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv,.tsv,.parquet,.json,.jsonl,.xlsx,.xls';
            input.onchange = (e) => {
                const file = e.target.files?.[0];
                if (file) applyFilePath(file.path || file.name, onChange);
            };
            input.click();
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('chain-config-drop-active');
        const file = e.dataTransfer.files?.[0];
        if (file) applyFilePath(file.path || file.name, onChange);
    };

    return (
        <div className="chain-config-section">
            <label>Source File Path</label>
            <div
                className="chain-config-input-with-btn"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('chain-config-drop-active'); }}
                onDragLeave={(e) => e.currentTarget.classList.remove('chain-config-drop-active')}
                onDrop={handleDrop}
            >
                <input
                    type="text"
                    value={config.sourcePath || ''}
                    onChange={(e) => onChange('sourcePath', e.target.value)}
                    placeholder="Drag a file here or type path…"
                    className="chain-config-input"
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
                    💡 Leave empty to automatically export from the connected upstream node.
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

const TableRefConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Table / View Name</label>
        <input
            type="text"
            value={config.tableName || ''}
            onChange={(e) => onChange('tableName', e.target.value)}
            placeholder="my_table"
            className="chain-config-input"
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

const AssertConfig = ({ config, onChange }) => (
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
                <input
                    type="text"
                    value={config.column || ''}
                    onChange={(e) => onChange('column', e.target.value)}
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
                💡 If no table is specified, this node will check the table produced by the connected upstream node.
            </p>
        )}
    </div>
);

const JoinTablesConfig = ({ config, onChange }) => (
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
        <label>Left Table Key Column</label>
        <input
            type="text"
            value={config.leftKey || ''}
            onChange={(e) => onChange('leftKey', e.target.value)}
            placeholder="id"
            className="chain-config-input"
        />
        <label>Right Table Key Column</label>
        <input
            type="text"
            value={config.rightKey || ''}
            onChange={(e) => onChange('rightKey', e.target.value)}
            placeholder="customer_id"
            className="chain-config-input"
        />
        <p className="chain-config-hint chain-config-hint-info">
            💡 Connect exactly 2 upstream nodes. The first connection is the left table, the second is the right table.
        </p>
    </div>
);

const FilterConfig = ({ config, onChange }) => {
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
                    <input
                        type="text"
                        value={cond.column}
                        onChange={(e) => updateCondition(i, 'column', e.target.value)}
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
                    </select>
                    {cond.operator !== 'IS NULL' && cond.operator !== 'IS NOT NULL' && (
                        <input
                            type="text"
                            value={cond.value}
                            onChange={(e) => updateCondition(i, 'value', e.target.value)}
                            placeholder="value"
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

const GroupAggregateConfig = ({ config, onChange }) => {
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
            {groupColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <input
                        type="text"
                        value={col}
                        onChange={(e) => updateGroupColumn(i, e.target.value)}
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

            <label style={{ marginTop: 8 }}>Aggregations</label>
            {aggregations.map((agg, i) => (
                <div key={i} className="chain-config-agg-row">
                    <select
                        value={agg.func}
                        onChange={(e) => updateAggregation(i, 'func', e.target.value)}
                        className="chain-config-select chain-config-select-sm"
                    >
                        <option value="COUNT">COUNT</option>
                        <option value="SUM">SUM</option>
                        <option value="AVG">AVG</option>
                        <option value="MIN">MIN</option>
                        <option value="MAX">MAX</option>
                    </select>
                    <input
                        type="text"
                        value={agg.column}
                        onChange={(e) => updateAggregation(i, 'column', e.target.value)}
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
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={addAggregation}>
                <LuPlus size={12} /> Add Aggregation
            </button>
        </div>
    );
};

const SelectColumnsConfig = ({ config, onChange }) => {
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
                    <input
                        type="text"
                        value={col.name}
                        onChange={(e) => updateColumn(i, 'name', e.target.value)}
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

const DeduplicateConfig = ({ config, onChange }) => {
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
                    <input
                        type="text"
                        value={col}
                        onChange={(e) => updateKeyColumn(i, e.target.value)}
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

const AddColumnConfig = ({ config, onChange }) => {
    const newColumns = config.newColumns || [];

    const addNewColumn = () => {
        onChange('newColumns', [...newColumns, { name: '', expression: '' }]);
    };

    const updateNewColumn = (index, field, value) => {
        const updated = newColumns.map((c, i) => i === index ? { ...c, [field]: value } : c);
        onChange('newColumns', updated);
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
                <div key={i} className="chain-config-column-def">
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
            ))}
            <button className="chain-config-add-btn" onClick={addNewColumn}>
                <LuPlus size={12} /> Add Column
            </button>
            <p className="chain-config-hint">
                Use SQL expressions: price * quantity, UPPER(name), YEAR(date), CONCAT(first, ' ', last)
            </p>
        </div>
    );
};

const SortConfig = ({ config, onChange }) => {
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
                    <input
                        type="text"
                        value={col.column}
                        onChange={(e) => updateSortColumn(i, 'column', e.target.value)}
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

const SampleConfig = ({ config, onChange }) => (
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
        </select>
        <label>{config.sampleType === 'percent' ? 'Percentage (%)' : 'Number of Rows'}</label>
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

const PivotConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Result Table Name</label>
        <input
            type="text"
            value={config.tableName || 'pivoted_data'}
            onChange={(e) => onChange('tableName', e.target.value)}
            className="chain-config-input"
        />
        <label>Group Column (rows)</label>
        <input
            type="text"
            value={config.groupColumn || ''}
            onChange={(e) => onChange('groupColumn', e.target.value)}
            placeholder="e.g. region"
            className="chain-config-input"
        />
        <label>Pivot Column (becomes new columns)</label>
        <input
            type="text"
            value={config.pivotColumn || ''}
            onChange={(e) => onChange('pivotColumn', e.target.value)}
            placeholder="e.g. month"
            className="chain-config-input"
        />
        <label>Value Column</label>
        <input
            type="text"
            value={config.valueColumn || ''}
            onChange={(e) => onChange('valueColumn', e.target.value)}
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
            💡 Renames the table produced by the connected upstream node.
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
                💡 If empty, the table will be created from the upstream node's output.
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
            return `COPY (\n  ${q}\n) TO '${c.outputPath}'\n(FORMAT ${fmt}, HEADER)`;
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

const TypeCastConfig = ({ config, onChange }) => {
    const casts = config.casts || [];
    const TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'DECIMAL(18,4)', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'TIME', 'FLOAT', 'HUGEINT'];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'casted_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Casts</label>
            {casts.map((c, i) => (
                <div key={i} className="chain-config-inline-row">
                    <input type="text" value={c.column || ''} onChange={e => { const u = [...casts]; u[i] = { ...u[i], column: e.target.value }; onChange('casts', u); }} placeholder="column" className="chain-config-input chain-config-input-sm" />
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

const WindowFunctionsConfig = ({ config, onChange }) => {
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
                        <input type="text" value={w.column || ''} onChange={e => { const u = [...windows]; u[i] = { ...u[i], column: e.target.value }; onChange('windows', u); }} placeholder="column (or * for COUNT)" className="chain-config-input chain-config-input-sm" />
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

const UnpivotConfig = ({ config, onChange }) => {
    const valueColumns = config.valueColumns || [];
    const idColumns = config.idColumns || [];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'unpivoted_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Value Columns (become rows)</label>
            {valueColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <input type="text" value={col} onChange={e => { const u = [...valueColumns]; u[i] = e.target.value; onChange('valueColumns', u); }} placeholder="column_name" className="chain-config-input chain-config-input-sm" />
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
            💡 DuckDB can read files directly from URLs. Requires internet access and the httpfs extension (auto-installed).
        </p>
    </div>
);

const CleanConfig = ({ config, onChange }) => {
    const operations = config.operations || [];
    const CLEAN_TYPES = [
        { value: 'trim', label: 'Trim whitespace' },
        { value: 'lower', label: 'Convert to lowercase' },
        { value: 'upper', label: 'Convert to uppercase' },
        { value: 'replace', label: 'Replace text' },
        { value: 'regex_replace', label: 'Regex replace' },
        { value: 'fill_null', label: 'Fill NULL values' },
        { value: 'nullify_empty', label: 'Nullify empty strings' },
    ];

    return (
        <div className="chain-config-section">
            <label>Result Table Name</label>
            <input type="text" value={config.tableName || 'cleaned_data'} onChange={e => onChange('tableName', e.target.value)} className="chain-config-input" />
            <label>Cleaning Operations</label>
            {operations.map((op, i) => (
                <div key={i} className="chain-config-clean-row">
                    <div className="chain-config-inline-row">
                        <input type="text" value={op.column || ''} onChange={e => { const u = [...operations]; u[i] = { ...u[i], column: e.target.value }; onChange('operations', u); }} placeholder="column" className="chain-config-input chain-config-input-sm" />
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
                </div>
            ))}
            <button className="chain-config-add-btn" onClick={() => onChange('operations', [...operations, { column: '', type: 'trim' }])}>
                <LuPlus size={12} /> Add Operation
            </button>
        </div>
    );
};

const SchemaValidationConfig = ({ config, onChange }) => {
    const expectedColumns = config.expectedColumns || [];
    const TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'FLOAT', 'ANY'];

    return (
        <div className="chain-config-section">
            <label>Expected Columns</label>
            {expectedColumns.map((col, i) => (
                <div key={i} className="chain-config-inline-row">
                    <input type="text" value={col.name || ''} onChange={e => { const u = [...expectedColumns]; u[i] = { ...u[i], name: e.target.value }; onChange('expectedColumns', u); }} placeholder="column_name" className="chain-config-input chain-config-input-sm" />
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
