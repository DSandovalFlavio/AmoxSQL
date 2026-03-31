/**
 * ChainNodeConfigPanel — Right-side config panel for the selected node.
 * Displays editable label, description, and type-specific configuration fields.
 */
import { useState } from 'react';
import {
    LuX, LuFileCode2, LuPlus, LuExternalLink, LuTrash2, LuMinus,
    LuCode, LuChevronDown, LuChevronRight, LuCopy
} from 'react-icons/lu';
import { NODE_TYPES } from './chainNodeTypes';

const ChainNodeConfigPanel = ({ node, onUpdate, onDelete, onClose, onCreateSqlFile, onOpenFile, sqlFiles = [] }) => {
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

const ImportFileConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>Source File Path</label>
        <input
            type="text"
            value={config.sourcePath || ''}
            onChange={(e) => onChange('sourcePath', e.target.value)}
            placeholder="data/sales.csv"
            className="chain-config-input"
        />
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
            <option value="parquet">Parquet</option>
            <option value="json">JSON</option>
            <option value="xlsx">Excel (.xlsx)</option>
        </select>
    </div>
);

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

const ExportFileConfig = ({ config, onChange }) => (
    <div className="chain-config-section">
        <label>SQL Query <span className="chain-config-optional">(optional)</span></label>
        <textarea
            value={config.query || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder="SELECT * FROM clean_sales"
            className="chain-config-textarea chain-config-sql"
            rows={4}
        />
        {!config.query && (
            <p className="chain-config-hint chain-config-hint-info">
                💡 If empty, this node will automatically export data from the connected upstream node (table, import, or query result).
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
        </select>
        <label>Output File Path</label>
        <input
            type="text"
            value={config.outputPath || ''}
            onChange={(e) => onChange('outputPath', e.target.value)}
            placeholder="exports/output.csv"
            className="chain-config-input"
        />
    </div>
);

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

export default ChainNodeConfigPanel;
