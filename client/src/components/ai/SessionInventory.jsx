import { useState, useEffect, useCallback, useRef } from 'react';
import {
    LuDatabase, LuTable, LuFile, LuX,
    LuFileCode, LuBookOpen, LuChartBar,
    LuTrash2, LuPackage, LuPencil,
    LuSparkles, LuFileSearch, LuDownload,
} from 'react-icons/lu';

const ARTIFACT_ICONS = {
    sql: LuFileCode,
    notebook: LuBookOpen,
    chart: LuChartBar,
};

/**
 * SessionInventory — Right-side panel in Data Diving mode.
 * Combines context drag & drop (top) with session artifacts (bottom).
 */
const SessionInventory = ({
    // Context section (same as AiContextPanel)
    contextObjects,
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
    onRemoveContext,
    onQuickAction,
    hasMessages,
    // Session / Artifacts
    conversationId,
    onOpenFile,
    // Session naming
    sessionName,
    onUpdateSessionName,
}) => {
    const [artifacts, setArtifacts] = useState([]);
    const [isEditingName, setIsEditingName] = useState(false);
    const [nameValue, setNameValue] = useState(sessionName || '');
    const nameInputRef = useRef(null);

    // Sync external sessionName changes
    useEffect(() => {
        setNameValue(sessionName || '');
    }, [sessionName]);

    // Fetch artifacts when conversationId changes
    const fetchArtifacts = useCallback(async () => {
        if (!conversationId) {
            setArtifacts([]);
            return;
        }
        try {
            const res = await fetch(`http://localhost:3001/api/ai/sessions/${conversationId}/artifacts`);
            if (res.ok) {
                const data = await res.json();
                setArtifacts(data);
            } else {
                setArtifacts([]);
            }
        } catch {
            setArtifacts([]);
        }
    }, [conversationId]);

    useEffect(() => {
        fetchArtifacts();
    }, [fetchArtifacts]);

    // Delete artifact
    const handleDeleteArtifact = async (artifactId, e) => {
        e.stopPropagation();
        if (!conversationId) return;
        try {
            const res = await fetch(
                `http://localhost:3001/api/ai/sessions/${conversationId}/artifacts/${artifactId}`,
                { method: 'DELETE' }
            );
            if (res.ok) {
                setArtifacts(prev => prev.filter(a => a.id !== artifactId));
            }
        } catch {
            // silently ignore
        }
    };

    // Session name editing
    const startEditing = () => {
        setIsEditingName(true);
        setTimeout(() => nameInputRef.current?.focus(), 0);
    };

    const commitName = () => {
        setIsEditingName(false);
        const trimmed = nameValue.trim();
        if (trimmed && trimmed !== sessionName) {
            onUpdateSessionName?.(trimmed);
        } else {
            setNameValue(sessionName || '');
        }
    };

    const handleNameKeyDown = (e) => {
        if (e.key === 'Enter') {
            commitName();
        } else if (e.key === 'Escape') {
            setNameValue(sessionName || '');
            setIsEditingName(false);
        }
    };

    const getArtifactIcon = (artifact) => {
        const Icon = ARTIFACT_ICONS[artifact.artifact_type] || LuFile;
        return <Icon size={14} />;
    };

    return (
        <div className="ai-ctx">
            {/* Session Name Header */}
            <div className="ai-ctx-header">
                {isEditingName ? (
                    <input
                        ref={nameInputRef}
                        className="ai-ctx-session-name-input"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={handleNameKeyDown}
                        spellCheck={false}
                    />
                ) : (
                    <span
                        className="ai-ctx-header-title ai-ctx-session-name"
                        onClick={startEditing}
                        title="Click to rename session"
                    >
                        {sessionName || 'Untitled Session'}
                        <LuPencil size={11} className="ai-ctx-session-edit-icon" />
                    </span>
                )}
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

            {/* Artifacts Section */}
            <div className="ai-ctx-section">
                <div className="ai-ctx-section-label">
                    <span>Artifacts</span>
                    <span className="ai-ctx-count">{artifacts.length}</span>
                </div>
                {artifacts.length === 0 ? (
                    <div className="ai-ctx-drop-empty" style={{ padding: '12px 8px' }}>
                        <LuPackage size={20} />
                        <span>No artifacts yet</span>
                    </div>
                ) : (
                    <div className="ai-ctx-artifacts">
                        {artifacts.map((artifact) => (
                            <div
                                key={artifact.id}
                                className="ai-ctx-artifact"
                                onClick={() => onOpenFile?.(artifact.file_path)}
                                title={artifact.file_path}
                            >
                                <span className="ai-ctx-artifact-icon">
                                    {getArtifactIcon(artifact)}
                                </span>
                                <span className="ai-ctx-artifact-name">
                                    {artifact.file_name || artifact.file_path?.split(/[/\\]/).pop() || 'Untitled'}
                                </span>
                                <button
                                    className="ai-ctx-artifact-delete"
                                    onClick={(e) => handleDeleteArtifact(artifact.id, e)}
                                    title="Remove artifact"
                                >
                                    <LuTrash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Tips */}
            <div className="ai-ctx-tips">
                <LuSparkles size={12} />
                <span>Drag tables from the Database Explorer for better AI context.</span>
            </div>
        </div>
    );
};

export default SessionInventory;
