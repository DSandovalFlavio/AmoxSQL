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
        const modeColor = readOnly ? '#FFA500' : '#00ffff'; // Orange for RO, Cyan for RW
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
            {/* Avatar Circle */}
            <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: '#25262B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                border: '2px solid #2C2E33',
                flexShrink: 0
            }}>
                <svg width="40" height="40" viewBox="58 -10 300 300" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="miniNeonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: '#00ffff', stopOpacity: 1 }} />
                            <stop offset="100%" style={{ stopColor: '#0055ff', stopOpacity: 1 }} />
                        </linearGradient>
                    </defs>
                    <g transform="translate(50, 0) scale(0.8)">
                        <path
                            d="M 135 285 Q 125 290 115 275 L 185 75 Q 200 45 215 75 L 285 275 Q 275 290 265 285"
                            stroke="url(#miniNeonGradient)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" fill="none"
                        />
                        <path
                            d="M 130 210 Q 200 330 270 210"
                            stroke="url(#miniNeonGradient)" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" fill="none"
                        />
                    </g>
                </svg>
            </div>

            {/* Text Block */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{
                    fontSize: '11px',
                    color: '#00ffff',
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                    Project Workspace
                </span>
                <span style={{
                    fontWeight: '700',
                    color: '#E9ECEF',
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
                    <span style={{ fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        color: '#909296',
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
