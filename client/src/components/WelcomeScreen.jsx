import { useState, useRef, useEffect } from 'react';
import { LuFolderOpen, LuSettings, LuClock, LuTrash2 } from "react-icons/lu";
import Logo from './Logo';

const RECENT_KEY = 'amoxsql-recent-projects';

const getRecentProjects = () => {
    try {
        const data = localStorage.getItem(RECENT_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
};

const WelcomeScreen = ({ onOpenProject, onOpenSettings }) => {
    const [path, setPath] = useState('');
    const folderInputRef = useRef(null);
    const [recentProjects, setRecentProjects] = useState(getRecentProjects);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (path.trim()) {
            onOpenProject(path.trim());
        }
    };

    const handleBrowseFolder = async () => {
        if (window.electronAPI && window.electronAPI.selectFolder) {
            const selected = await window.electronAPI.selectFolder();
            if (selected) setPath(selected);
        } else {
            folderInputRef.current?.click();
        }
    };

    const handleFolderInputChange = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const relativePath = files[0].webkitRelativePath;
            if (relativePath) {
                const folderName = relativePath.split('/')[0];
                setPath(folderName);
            }
        }
    };

    const handleClearRecent = () => {
        localStorage.removeItem(RECENT_KEY);
        setRecentProjects([]);
    };

    useEffect(() => {
        setRecentProjects(getRecentProjects());
    }, []);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: 'var(--surface-base)',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
            position: 'relative',
            overflow: 'hidden',
            paddingTop: '8vh'
        }}>
            {/* Compact Header: Logo + Title */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ marginBottom: '-55px' }}>
                    <Logo width={250} height={250} />
                </div>
                <h1 style={{ fontSize: '36px', fontWeight: '700', color: 'var(--text-primary)', margin: '0', letterSpacing: '1px' }}>
                    Amox<span style={{ color: 'var(--accent-primary)' }}>SQL</span>
                </h1>
                <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '8px', fontStyle: 'italic' }}>
                    The Modern Codex for Local Data Analysis
                </p>
            </div>

            {/* Unified Card: Form + Recent Projects */}
            <div style={{
                width: '560px',
                maxWidth: '90vw',
                padding: '28px',
                backgroundColor: 'var(--surface-raised)',
                borderRadius: '12px',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '60vh',
            }}>
                <h2 style={{ marginTop: 0, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '16px', fontWeight: '600' }}>Open Workspace</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>Project Path</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="C:/Users/Dev/MyProject"
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-default)',
                                    backgroundColor: 'var(--surface-inset)',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                    outline: 'none',
                                    transition: 'border-color 120ms ease, box-shadow 120ms ease'
                                }}
                                onFocus={(e) => { e.target.style.borderColor = 'var(--accent-primary)'; e.target.style.boxShadow = '0 0 0 2px var(--focus-ring)'; }}
                                onBlur={(e) => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; }}
                            />
                            <button
                                type="button"
                                onClick={handleBrowseFolder}
                                title="Browse for folder"
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-default)',
                                    backgroundColor: 'var(--surface-overlay)',
                                    color: 'var(--accent-primary)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background-color 120ms ease, border-color 120ms ease'
                                }}
                                className="ws-icon-btn"
                            >
                                <LuFolderOpen size={18} />
                            </button>
                            <input
                                ref={folderInputRef}
                                type="file"
                                webkitdirectory=""
                                directory=""
                                style={{ display: 'none' }}
                                onChange={handleFolderInputChange}
                            />
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '5px', marginBottom: '0' }}>
                            Paste the absolute path or click the folder icon to browse.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={!path.trim()}
                        style={{
                            padding: '11px',
                            backgroundColor: path.trim() ? 'var(--accent-primary)' : 'var(--surface-inset)',
                            color: path.trim() ? 'var(--surface-base)' : 'var(--text-disabled)',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: path.trim() ? 'pointer' : 'default',
                            transition: 'background-color 200ms ease, filter 200ms ease'
                        }}
                        className="ws-open-btn"
                    >
                        Open Project
                    </button>
                </form>

                {/* Recent Projects — inside the same card */}
                {recentProjects.length > 0 && (
                    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-default)', paddingTop: '16px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <LuClock size={14} style={{ color: 'var(--accent-primary)' }} /> Recent Projects
                            </h3>
                            <button
                                onClick={handleClearRecent}
                                title="Clear all recent projects"
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'var(--text-tertiary)', cursor: 'pointer', padding: '4px 8px',
                                    borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
                                    transition: 'all 120ms ease'
                                }}
                                className="ws-clear-btn"
                            >
                                <LuTrash2 size={12} /> Clear
                            </button>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                            gap: '10px',
                            overflowY: 'auto',
                            maxHeight: '200px',
                            paddingRight: '4px'
                        }}>
                            {recentProjects.map((p, i) => {
                                const folderName = p.split(/[\\/]/).pop() || p;
                                const directoryInfo = p.substring(0, p.length - folderName.length) || 'Root';

                                return (
                                    <button
                                        key={i}
                                        onClick={() => onOpenProject(p)}
                                        title={p}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                            backgroundColor: 'var(--surface-inset)', borderRadius: '8px',
                                            border: '1px solid var(--border-default)', padding: '12px',
                                            cursor: 'pointer', textAlign: 'left',
                                            transition: 'all 150ms ease',
                                            position: 'relative', overflow: 'hidden'
                                        }}
                                        className="ws-recent-item"
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginBottom: '4px' }}>
                                            <LuFolderOpen size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                            <span style={{
                                                fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                width: '100%'
                                            }}>
                                                {folderName}
                                            </span>
                                        </div>
                                        <div style={{
                                            fontSize: '10px', color: 'var(--text-tertiary)',
                                            fontFamily: "'JetBrains Mono', monospace",
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            width: '100%', opacity: 0.7, paddingLeft: '24px'
                                        }}>
                                            {directoryInfo}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Settings Gear — bottom left */}
            <button
                onClick={onOpenSettings}
                title="Settings"
                style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '24px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '6px',
                    transition: 'color 120ms ease, background-color 120ms ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
                className="ws-settings-btn"
            >
                <LuSettings size={20} />
            </button>

            {/* Version — bottom center */}
            <div style={{ position: 'absolute', bottom: '24px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}
            </div>
        </div>
    );
};

export default WelcomeScreen;
