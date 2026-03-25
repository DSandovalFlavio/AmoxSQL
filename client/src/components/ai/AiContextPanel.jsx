import { LuDatabase, LuTable, LuFile, LuX, LuSparkles, LuFileSearch, LuChartBar, LuDownload } from 'react-icons/lu';

/**
 * AiContextPanel — Right-side panel in Data Diving mode.
 * Shows drag & drop context and quick actions.
 */
const AiContextPanel = ({
    contextObjects,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    onRemoveContext,
    onQuickAction,
    hasMessages,
}) => {
    return (
        <div className="ai-ctx">
            {/* Header */}
            <div className="ai-ctx-header">
                <span className="ai-ctx-header-title">Context</span>
            </div>

            {/* Context Objects */}
            <div className="ai-ctx-section">
                <div className="ai-ctx-section-label">
                    <span>Tables & Files</span>
                    <span className="ai-ctx-count">{contextObjects.length}</span>
                </div>
                <div
                    className={`ai-ctx-drop${isDragOver ? ' ai-ctx-drop--active' : ''}${contextObjects.length > 0 ? ' ai-ctx-drop--has-items' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    {contextObjects.length === 0 ? (
                        <div className="ai-ctx-drop-empty">
                            <LuDatabase size={20} />
                            <span>Drag tables or files here</span>
                        </div>
                    ) : (
                        <div className="ai-ctx-items">
                            {contextObjects.map((obj, i) => (
                                <div key={i} className="ai-ctx-chip">
                                    {obj.type === 'table'
                                        ? <LuTable size={12} className="ai-ctx-chip-icon ai-ctx-chip-icon--table" />
                                        : <LuFile size={12} className="ai-ctx-chip-icon ai-ctx-chip-icon--file" />
                                    }
                                    <span className="ai-ctx-chip-name">{obj.name}</span>
                                    <button
                                        className="ai-ctx-chip-remove"
                                        onClick={() => onRemoveContext(i)}
                                    >
                                        <LuX size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            {!hasMessages && (
                <div className="ai-ctx-section">
                    <div className="ai-ctx-section-label">Quick Actions</div>
                    <div className="ai-ctx-actions">
                        <button className="ai-ctx-action" onClick={() => onQuickAction('Show me all tables')}>
                            <LuTable size={14} />
                            <span>List Tables</span>
                        </button>
                        <button className="ai-ctx-action" onClick={() => onQuickAction('Describe the schema of all tables')}>
                            <LuFileSearch size={14} />
                            <span>Describe Schema</span>
                        </button>
                        <button className="ai-ctx-action" onClick={() => onQuickAction('Profile the data quality of the main tables')}>
                            <LuChartBar size={14} />
                            <span>Profile Data</span>
                        </button>
                        <button className="ai-ctx-action" onClick={() => onQuickAction('Show me sample data from each table')}>
                            <LuDownload size={14} />
                            <span>Sample Data</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Tips */}
            <div className="ai-ctx-tips">
                <LuSparkles size={12} />
                <span>Drag tables from the Database Explorer for better AI context.</span>
            </div>
        </div>
    );
};

export default AiContextPanel;
