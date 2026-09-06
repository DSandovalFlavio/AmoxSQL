import { useState, useRef, useEffect } from 'react';
import { LuFolderOpen, LuSettings, LuClock, LuTrash2, LuSparkles, LuBrain, LuRocket, LuPencil, LuFolder } from "react-icons/lu";
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
            if (!name.endsWith('.duckdb') && !name.endsWith('.db') && !name.endsWith('.ducklake')) {
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
            className={`seg-item${dbActiveTab === id ? ' seg-item--active' : ''}`}
            type="button"
        >
            <span style={{ display: 'inline-flex' }}>{icon}</span>
            <span>{label}</span>
        </button>
    );

    return (
        <div className="ws-root">
            {/* ── Mitad izquierda: todo lo accionable, a alto completo ── */}
            <div className="ws-pane">
                <div className="ws-col">
                    <div className="ws-brand ws-enter ws-enter-1">
                        <Logo width={32} height={32} />
                        <span className="ws-brand-name">Amox<span>SQL</span></span>
                    </div>
                    <p className="ws-tagline ws-enter ws-enter-1">The Modern Codex for Local Data Analysis</p>

                    {step === 1 ? (
                        <>
                            <form onSubmit={handleSubmitPath} className="ws-form ws-enter ws-enter-2">
                                <label className="ws-label" htmlFor="ws-path">Open a workspace</label>
                                <div className="ws-field">
                                    <input
                                        id="ws-path"
                                        type="text"
                                        value={path}
                                        onChange={(e) => setPath(e.target.value)}
                                        placeholder="C:/Users/Dev/MyProject"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleBrowseFolder}
                                        title="Browse for folder"
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
                                <p className="ws-hint">Paste the absolute path or click the folder icon to browse.</p>
                                <button type="submit" className="ws-cta" disabled={!path.trim()}>
                                    Open Project
                                </button>
                            </form>

                            {/* Los recientes ya no van dentro de la tarjeta del paso 1: son la
                                lista principal y se quedan con todo el alto que sobra. */}
                            {recentProjects.length > 0 && (
                                <div className="ws-recent">
                                    <div className="ws-recent-head">
                                        <LuClock size={13} style={{ color: 'var(--accent-primary)' }} />
                                        Recent projects
                                        <button onClick={handleClearRecent} title="Clear all recent projects" className="ws-clear-btn">
                                            <LuTrash2 size={12} /> Clear
                                        </button>
                                    </div>
                                    <div className="ws-recent-list">
                                        {recentProjects.map((p, i) => {
                                            const folderName = p.split(/[\\/]/).pop() || p;
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => { setPath(p); processWorkspaceSelection(p); }}
                                                    title={p}
                                                    className="ws-recent-item"
                                                >
                                                    <LuFolder size={16} className="ws-recent-icon" />
                                                    <span className="ws-recent-text">
                                                        <span className="ws-recent-name">{folderName}</span>
                                                        <span className="ws-recent-path">{p}</span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="ws-step2 ws-enter ws-enter-2">
                            <div className="ws-current">
                                <LuFolderOpen size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                <span className="ws-current-path">{path}</span>
                                <button onClick={() => setStep(1)} className="ws-edit-btn">
                                    <LuPencil size={12} /> Edit
                                </button>
                            </div>

                            <div className="seg" style={{ display: 'inline-flex' }}>
                                {scannedDbs.length > 0 && renderDbTabButton('EXISTING', 'Open Existing', <LuFolderOpen size={14} />)}
                                {renderDbTabButton('CREATE', 'Create New', <LuSparkles size={14} />)}
                                {renderDbTabButton('MEMORY', 'In-Memory', <LuBrain size={14} />)}
                            </div>

                            <div className="ws-db-body">
                                {dbActiveTab === 'EXISTING' && (
                                    <div className="ws-db-row">
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <label className="ws-label">Database</label>
                                            <select
                                                value={selectedDbPath || ''}
                                                onChange={(e) => setSelectedDbPath(e.target.value)}
                                                className="ws-select"
                                            >
                                                {scannedDbs.map(f => (
                                                    <option key={f.path} value={f.path}>{f.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="ws-label">Mode</label>
                                            <div className="seg" style={{ display: 'inline-flex' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setDbMode('READ_WRITE')}
                                                    title="Exclusive lock. Create tables and edit data."
                                                    className={`seg-item${dbMode === 'READ_WRITE' ? ' seg-item--active' : ''}`}
                                                >
                                                    Read / Write
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDbMode('READ_ONLY')}
                                                    title="Safe for browsing. Prevents file locks."
                                                    className={`seg-item${dbMode === 'READ_ONLY' ? ' seg-item--active' : ''}`}
                                                >
                                                    Read Only
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {dbActiveTab === 'CREATE' && (
                                    <>
                                        <div>
                                            <label className="ws-label">New database name</label>
                                            <div className="ws-suffix-field">
                                                <input
                                                    type="text"
                                                    value={newDbName}
                                                    onChange={(e) => setNewDbName(e.target.value)}
                                                    placeholder="my_project_data"
                                                />
                                                <div className="ws-suffix">.duckdb</div>
                                            </div>
                                        </div>
                                        <p className="ws-note">
                                            Creates a new file in your project folder. Opened in <strong>Read / Write</strong> mode.
                                        </p>
                                    </>
                                )}

                                {dbActiveTab === 'MEMORY' && (
                                    <div className="ws-memory">
                                        <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}><LuBrain size={32} /></div>
                                        <div>
                                            <h4>In-Memory Session</h4>
                                            <p className="ws-note">
                                                Run queries without creating any files. All data will be lost when you close the app.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleSubmitConfig}
                                className="ws-cta"
                                disabled={dbActiveTab === 'CREATE' && !newDbName.trim()}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {dbActiveTab === 'CREATE' ? 'Create & Connect' : 'Start Session'} <LuRocket size={14} />
                            </button>
                        </div>
                    )}

                    <div className="ws-foot">
                        <button onClick={onOpenSettings} title="Settings" className="ws-settings-btn">
                            <LuSettings size={15} /> Settings
                        </button>
                        <span className="ws-version">
                            v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Mitad derecha: el lienzo. En la F5 aloja la animación de partículas. ── */}
            <div className="ws-canvas">
                <div className="ws-canvas-mark">
                    <Logo width={190} height={190} />
                </div>
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
