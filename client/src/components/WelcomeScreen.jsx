import { useState, useRef } from 'react';
import { LuFolderOpen, LuSettings } from "react-icons/lu";
import Logo from './Logo';

const WelcomeScreen = ({ onOpenProject, onOpenSettings }) => {
    const [path, setPath] = useState('');
    const folderInputRef = useRef(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (path.trim()) {
            onOpenProject(path.trim());
        }
    };

    const handleBrowseFolder = async () => {
        // Electron: use native dialog via IPC
        if (window.electronAPI && window.electronAPI.selectFolder) {
            const selected = await window.electronAPI.selectFolder();
            if (selected) setPath(selected);
        } else {
            // Browser fallback: use hidden directory input
            folderInputRef.current?.click();
        }
    };

    const handleFolderInputChange = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            // webkitRelativePath gives us the relative path, extract the root folder
            const relativePath = files[0].webkitRelativePath;
            if (relativePath) {
                const folderName = relativePath.split('/')[0];
                setPath(folderName);
            }
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            backgroundColor: 'var(--surface-base)',
            color: 'var(--text-secondary)',
            fontFamily: 'inherit',
            position: 'relative'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <div style={{ marginBottom: '-60px' }}>
                    {/* AmoxSQL Logo */}
                    <Logo width={360} height={360} />
                </div>
                <h1 style={{ fontSize: '42px', fontWeight: '700', color: 'var(--text-primary)', margin: '0', letterSpacing: '1px' }}>
                    Amox<span style={{ color: 'var(--accent-primary)' }}>SQL</span>
                </h1>
                <p style={{ fontSize: '16px', color: 'var(--text-tertiary)', marginTop: '10px', fontStyle: 'italic' }}>
                    The Modern Codex for Local Data Analysis
                </p>
            </div>

            <div style={{
                width: '450px',
                padding: '30px',
                backgroundColor: 'var(--surface-raised)',
                borderRadius: '12px',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-default)'
            }}>
                <h2 style={{ marginTop: 0, fontSize: '18px', color: 'var(--text-primary)', marginBottom: '20px', fontWeight: '600' }}>Open Workspace</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Project Path</label>
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
                                onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-overlay)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                            >
                                <LuFolderOpen size={18} />
                            </button>
                            {/* Hidden fallback input for browser mode */}
                            <input
                                ref={folderInputRef}
                                type="file"
                                webkitdirectory=""
                                directory=""
                                style={{ display: 'none' }}
                                onChange={handleFolderInputChange}
                            />
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                            Paste the absolute path or click the folder icon to browse.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={!path.trim()}
                        style={{
                            marginTop: '10px',
                            padding: '12px',
                            backgroundColor: path.trim() ? 'var(--accent-primary)' : 'var(--surface-inset)',
                            color: path.trim() ? 'var(--surface-base)' : 'var(--text-disabled)',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: path.trim() ? 'pointer' : 'default',
                            transition: 'background-color 200ms ease, filter 200ms ease'
                        }}
                        onMouseOver={(e) => { if (path.trim()) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.filter = 'none'; }}
                    >
                        Open Project
                    </button>

                    {/* Optional: Recent Projects list could go here later */}
                </form>
            </div>

            {/* Settings Gear */}
            <button
                onClick={onOpenSettings}
                title="Settings"
                style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: '24px',
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
                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
                <LuSettings size={20} />
            </button>

            <div style={{ position: 'absolute', bottom: '24px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                v1.0.0
            </div>
        </div>
    );
};

export default WelcomeScreen;
