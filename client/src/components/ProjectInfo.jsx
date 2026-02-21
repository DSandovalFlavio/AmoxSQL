import { LuBrain, LuDatabase, LuX } from "react-icons/lu";

const ProjectInfo = ({ projectPath, currentDb, onCloseProject, readOnly }) => {
    // Extract folder name
    const projectName = projectPath ? projectPath.split(/[/\\]/).pop() : 'Untitled';

    // Determine Mode Label
    let connectionInfo = { label: 'In-Memory', color: '#909296', icon: <LuBrain size={14} />, status: 'Active' };

    // Safety check: ensure currentDb is a string
    const isAttached = currentDb && typeof currentDb === 'string' && currentDb !== ':memory:';

    if (isAttached) {
        const dbName = currentDb.split(/[/\\]/).pop();
        const modeLabel = readOnly ? 'Read Only' : 'Read/Write';
        const modeColor = readOnly ? '#FFA500' : 'var(--accent-color-user)'; // Orange for RO, Accent for RW
        connectionInfo = { label: dbName, color: modeColor, icon: <LuDatabase size={14} />, status: 'Connected', mode: modeLabel };
    }

    return (
        <div style={{
            padding: '24px 20px 20px 20px',
            backgroundColor: 'transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '5px'
        }}>
            {/* Text Block */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{
                    fontSize: '11px',
                    color: 'var(--accent-color-user)',
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                    Project Workspace
                </span>
                <span style={{
                    fontWeight: '700',
                    color: 'var(--text-active)',
                    fontSize: '14px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {projectName}
                </span>

                {/* Connection Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span style={{ fontSize: '10px', color: connectionInfo.color, border: `1px solid ${connectionInfo.color}`, padding: '0 4px', borderRadius: '3px' }}>
                        {connectionInfo.status === 'Active' ? 'MEM' : (readOnly ? 'RO' : 'RW')}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {connectionInfo.label}
                    </span>
                </div>
            </div>

            {/* Actions / Status */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <button
                    onClick={onCloseProject}
                    title="Close Project"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <LuX size={16} />
                </button>
            </div>
        </div>
    );
};

export default ProjectInfo;
