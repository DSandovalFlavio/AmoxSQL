import { useState, useRef, useEffect } from 'react';
import { LuFolderOpen, LuSettings, LuClock, LuTrash2, LuSparkles, LuBrain, LuRocket, LuPencil } from "react-icons/lu";
import Logo from './Logo';
import AlertDialog from './AlertDialog';

const RECENT_KEY = 'amoxsql-recent-projects';

const getRecentProjects = () => {
    try {
        const data = localStorage.getItem(RECENT_KEY);
        return data ? JSON.parse(data) : [];
    } catch { return []; }
};

const WelcomeScreen = ({ initialPath, onSelectWorkspace, onStartSession, onOpenSettings }) => {
    // Step 1 State: Workspace
    const [path, setPath] = useState('');
    const folderInputRef = useRef(null);
    const [recentProjects, setRecentProjects] = useState(getRecentProjects);
    
    // Step 2 State: Database Config
    const [step, setStep] = useState(1); // 1 = Workspace, 2 = DB
    const [scannedDbs, setScannedDbs] = useState([]);
    
    const [dbActiveTab, setDbActiveTab] = useState('CREATE'); // EXISTING | CREATE | MEMORY
    const [selectedDbPath, setSelectedDbPath] = useState(null);
    const [dbMode, setDbMode] = useState('READ_WRITE'); // READ_WRITE | READ_ONLY
    const [newDbName, setNewDbName] = useState('');

    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });

    // Handle initialPath passed down
    useEffect(() => {
        if (initialPath) {
            setPath(initialPath);
            processWorkspaceSelection(initialPath);
        }
    }, [initialPath]);

    const processWorkspaceSelection = async (workspacePath) => {
        if (!workspacePath) return;
        const result = await onSelectWorkspace(workspacePath);
        if (result && result.success) {
            const files = result.dbs || [];
            setScannedDbs(files);
            
            // Setup default Step 2 state
            if (files.length > 0) {
                setDbActiveTab('EXISTING');
                setSelectedDbPath(files[0].path);
            } else {
                setDbActiveTab('CREATE');
            }
            // Transition to Step 2
            setStep(2);
        }
    };

    const handleSubmitPath = (e) => {
        e.preventDefault();
        if (path.trim()) {
            processWorkspaceSelection(path.trim());
        }
    };

    const handleBrowseFolder = async () => {
        if (window.electronAPI && window.electronAPI.selectFolder) {
            const selected = await window.electronAPI.selectFolder();
            if (selected) {
                setPath(selected);
                // Optionally auto-open here: processWorkspaceSelection(selected);
            }
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

    const handleSubmitConfig = () => {
        if (dbActiveTab === 'MEMORY') {
            onStartSession(':memory:', false);
        } else if (dbActiveTab === 'CREATE') {
            if (!newDbName.trim()) {
                setAlertData({ isOpen: true, message: "Please enter a database name." });
                return;
            }
            let name = newDbName.trim();
            if (!name.endsWith('.duckdb') && !name.endsWith('.db')) {
                name += '.duckdb';
            }
            onStartSession(name, false);
        } else {
            // EXISTING
            if (!selectedDbPath) return;
            onStartSession(selectedDbPath, dbMode === 'READ_ONLY');
        }
    };

    const renderDbTabButton = (id, label, icon) => (
        <button
            onClick={() => setDbActiveTab(id)}
            style={{
                flex: 1,
                padding: '10px',
                background: dbActiveTab === id ? 'var(--sidebar-item-active-bg)' : 'transparent',
                border: 'none',
                borderBottom: dbActiveTab === id ? '2px solid var(--accent-color-user)' : '2px solid transparent',
                color: dbActiveTab === id ? 'var(--text-active)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: dbActiveTab === id ? 'bold' : 'normal',
                fontSize: '13px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                transition: 'all 0.2s ease'
            }}
            type="button"
        >
            <span>{icon}</span>
            <span>{label}</span>
        </button>
    );

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
            {/* Header: Logo + Title */}
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

            {/* Container for Steps */}
            <div style={{
                width: '560px',
                maxWidth: '90vw',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                
                {/* STEP 1: Workspace */}
                <div style={{
                    padding: step === 1 ? '28px' : '16px 20px',
                    backgroundColor: 'var(--surface-raised)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-default)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: step === 1 ? '60vh' : '80px',
                    overflow: step === 1 ? 'visible' : 'hidden'
                }}>
                    
                    {step === 1 ? (
                        <>
                            <h2 style={{ marginTop: 0, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '16px', fontWeight: '600' }}>Step 1: Open Workspace</h2>

                            <form onSubmit={handleSubmitPath} style={{ display: 'flex', flexDirection: 'column', gap: '12px', opacity: 1, transition: 'opacity 0.2s ease' }}>
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

                            {/* Recent Projects */}
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
                                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                                        gap: '10px', overflowY: 'auto', maxHeight: '200px', paddingRight: '4px'
                                    }}>
                                        {recentProjects.map((p, i) => {
                                            const folderName = p.split(/[\\/]/).pop() || p;
                                            const directoryInfo = p.substring(0, p.length - folderName.length) || 'Root';

                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { setPath(p); processWorkspaceSelection(p); }}
                                                    title={p}
                                                    style={{
                                                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                                        backgroundColor: 'var(--surface-inset)', borderRadius: '8px',
                                                        border: '1px solid var(--border-default)', padding: '12px',
                                                        cursor: 'pointer', textAlign: 'left',
                                                        transition: 'all 150ms ease', position: 'relative', overflow: 'hidden'
                                                    }}
                                                    className="ws-recent-item"
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', marginBottom: '4px' }}>
                                                        <LuFolderOpen size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                                            {folderName}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', opacity: 0.7, paddingLeft: '24px' }}>
                                                        {directoryInfo}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        // Collapsed Workspace View
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 'bold' }}>Step 1: Workspace</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '14px' }}>
                                    <LuFolderOpen size={16} style={{ color: 'var(--accent-primary)' }} />
                                    <span style={{ fontWeight: 500 }}>{path}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setStep(1)}
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px',
                                    color: 'var(--text-secondary)', padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <LuPencil size={12} /> Edit
                            </button>
                        </div>
                    )}
                </div>

                {/* STEP 2: Database Config — Compact Layout */}
                <div style={{
                    backgroundColor: 'var(--surface-raised)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-default)',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: step === 2 ? '400px' : '0px',
                    opacity: step === 2 ? 1 : 0,
                    overflow: 'hidden'
                }}>
                    {/* Tabs (header is merged into tabs row) */}
                    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', padding: '0 16px', whiteSpace: 'nowrap' }}>Step 2</span>
                        <div style={{ width: '1px', height: '24px', background: 'var(--border-subtle)' }} />
                        {scannedDbs.length > 0 && renderDbTabButton('EXISTING', 'Open Existing', <LuFolderOpen size={14} />)}
                        {renderDbTabButton('CREATE', 'Create New', <LuSparkles size={14} />)}
                        {renderDbTabButton('MEMORY', 'In-Memory', <LuBrain size={14} />)}
                    </div>

                    {/* Content Area — Compact */}
                    <div style={{ padding: '16px 20px' }}>
                        {/* TAB: EXISTING — Inline layout */}
                        {dbActiveTab === 'EXISTING' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', animation: 'fadeIn 0.2s' }}>
                                {/* Row: Database Select + Mode Toggle */}
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Database</label>
                                        <select
                                            value={selectedDbPath || ''}
                                            onChange={(e) => setSelectedDbPath(e.target.value)}
                                            style={{ width: '100%', padding: '9px 10px', background: 'var(--surface-inset)', color: 'var(--text-active)', border: '1px solid var(--border-default)', borderRadius: '6px', outline: 'none', fontSize: '13px' }}
                                        >
                                            {scannedDbs.map(f => (
                                                <option key={f.path} value={f.path}>{f.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>Mode</label>
                                        {/* Segmented Pill Toggle */}
                                        <div style={{
                                            display: 'flex',
                                            border: '1px solid var(--border-default)',
                                            borderRadius: '6px',
                                            overflow: 'hidden',
                                            background: 'var(--surface-inset)'
                                        }}>
                                            <button
                                                type="button"
                                                onClick={() => setDbMode('READ_WRITE')}
                                                title="Exclusive lock. Create tables and edit data."
                                                style={{
                                                    padding: '8px 16px',
                                                    border: 'none',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    background: dbMode === 'READ_WRITE' ? 'var(--accent-primary)' : 'transparent',
                                                    color: dbMode === 'READ_WRITE' ? 'var(--surface-base)' : 'var(--text-secondary)',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                Read / Write
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDbMode('READ_ONLY')}
                                                title="Safe for browsing. Prevents file locks."
                                                style={{
                                                    padding: '8px 16px',
                                                    border: 'none',
                                                    borderLeft: '1px solid var(--border-default)',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    background: dbMode === 'READ_ONLY' ? 'var(--accent-primary)' : 'transparent',
                                                    color: dbMode === 'READ_ONLY' ? 'var(--surface-base)' : 'var(--text-secondary)',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                Read Only
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: CREATE — Compact */}
                        {dbActiveTab === 'CREATE' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.2s' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600 }}>New Database Name</label>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <input
                                            type="text"
                                            value={newDbName}
                                            onChange={(e) => setNewDbName(e.target.value)}
                                            placeholder="my_project_data"
                                            style={{ flex: 1, padding: '9px 12px', background: 'var(--surface-inset)', color: 'var(--text-active)', border: '1px solid var(--border-default)', borderRadius: '6px 0 0 6px', outline: 'none', fontSize: '13px' }}
                                        />
                                        <div style={{ padding: '9px 12px', background: 'var(--surface-overlay)', border: '1px solid var(--border-default)', borderLeft: 'none', borderRadius: '0 6px 6px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                                            .duckdb
                                        </div>
                                    </div>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.4 }}>
                                    Creates a new file in your project folder. Opened in <strong style={{ color: 'var(--text-secondary)' }}>Read / Write</strong> mode.
                                </p>
                            </div>
                        )}

                        {/* TAB: MEMORY — Compact */}
                        {dbActiveTab === 'MEMORY' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', animation: 'fadeIn 0.2s' }}>
                                <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}><LuBrain size={36} /></div>
                                <div>
                                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '14px' }}>In-Memory Session</h4>
                                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: '1.5' }}>
                                        Run queries without creating any files. All data will be lost when you close the app.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer / CTA */}
                    <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--surface-overlay)', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSubmitConfig}
                            style={{
                                backgroundColor: 'var(--accent-primary)',
                                padding: '9px 22px', borderRadius: '6px', border: 'none',
                                color: 'var(--surface-base)', fontWeight: 'bold', cursor: 'pointer',
                                transition: 'all 0.2s', fontSize: '13px',
                                opacity: (dbActiveTab === 'CREATE' && !newDbName.trim()) ? 0.5 : 1,
                                display: 'flex', alignItems: 'center', gap: '8px'
                            }}
                            disabled={dbActiveTab === 'CREATE' && !newDbName.trim()}
                        >
                            {dbActiveTab === 'CREATE' ? 'Create & Connect' : 'Start Session'} <LuRocket size={14} />
                        </button>
                    </div>
                </div>

            </div>

            {/* Settings Gear */}
            <button
                onClick={onOpenSettings}
                title="Settings"
                style={{
                    position: 'absolute', bottom: '20px', left: '24px', background: 'transparent',
                    border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '8px',
                    borderRadius: '6px', transition: 'color 120ms ease, background-color 120ms ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                className="ws-settings-btn"
            >
                <LuSettings size={20} />
            </button>

            {/* Version */}
            <div style={{ position: 'absolute', bottom: '24px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}
            </div>

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData({ ...alertData, isOpen: false })}
                title="Validation Error"
                message={alertData.message}
                type="error"
            />
        </div>
    );
};

export default WelcomeScreen;
