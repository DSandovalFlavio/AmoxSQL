import { useState, useRef } from 'react';
import { LuFolderOpen } from "react-icons/lu";
import Logo from './Logo';

const WelcomeScreen = ({ onOpenProject }) => {
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
            backgroundColor: '#0F1012', // VS Code dark theme bg
            color: '#ccccc7',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <div style={{ marginBottom: '-60px' }}>
                    {/* AmoxSQL Logo */}
                    <Logo width={360} height={360} />
                </div>
                <h1 style={{ fontSize: '42px', fontWeight: '700', color: '#ffffff', margin: '0', letterSpacing: '1px' }}>
                    Amox<span style={{ color: 'var(--accent-color-user)' }}>SQL</span>
                </h1>
                <p style={{ fontSize: '16px', color: '#888', marginTop: '10px', fontStyle: 'italic' }}>
                    The Modern Codex for Local Data Analysis
                </p>
            </div>

            <div style={{
                width: '450px',
                padding: '30px',
                backgroundColor: '#141517',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                border: '1px solid var(--accent-color-user)'
            }}>
                <h2 style={{ marginTop: 0, fontSize: '18px', color: '#fff', marginBottom: '20px' }}>Open Workspace</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '500' }}>Project Path</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                placeholder="C:/Users/Dev/MyProject"
                                autoFocus
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '4px',
                                    border: '1px solid #3c3c3c',
                                    backgroundColor: '#3c3c3c',
                                    color: '#fff',
                                    fontSize: '14px',
                                    outline: 'none'
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleBrowseFolder}
                                title="Browse for folder"
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '4px',
                                    border: '1px solid #3c3c3c',
                                    backgroundColor: '#3c3c3c',
                                    color: 'var(--accent-color-user)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background-color 0.2s, border-color 0.2s'
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-color-user)'; e.currentTarget.style.backgroundColor = '#2a2c2f'; }}
                                onMouseOut={(e) => { e.currentTarget.style.borderColor = '#3c3c3c'; e.currentTarget.style.backgroundColor = '#3c3c3c'; }}
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
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                            Paste the absolute path or click the folder icon to browse.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={!path.trim()}
                        style={{
                            marginTop: '10px',
                            padding: '12px',
                            backgroundColor: path.trim() ? '#0092acff' : '#1f2124ff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: path.trim() ? 'pointer' : 'default',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        Open Project
                    </button>

                    {/* Optional: Recent Projects list could go here later */}
                </form>
            </div>

            <div style={{ position: 'absolute', bottom: '20px', fontSize: '12px', color: '#555' }}>
                v1.0.0
            </div>
        </div>
    );
};

export default WelcomeScreen;
