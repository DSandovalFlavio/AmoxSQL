/**
 * ChainNodeConfigPanel — Right-side config panel for the selected node.
 * Displays editable label, description, and type-specific configuration fields.
 */
import { useState, useEffect } from 'react';
import {
    LuX, LuFileCode2, LuPlus, LuExternalLink, LuTrash2
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
        <label>SQL Query</label>
        <textarea
            value={config.query || ''}
            onChange={(e) => onChange('query', e.target.value)}
            placeholder="SELECT * FROM clean_sales"
            className="chain-config-textarea chain-config-sql"
            rows={4}
        />
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

export default ChainNodeConfigPanel;
