import { useState, useEffect } from 'react';
import { LuFolderOpen, LuSparkles, LuBrain, LuRocket } from "react-icons/lu";

const DatabaseSelectionModal = ({ isOpen, dbFiles, onSelect, onCancel }) => {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState(dbFiles.length > 0 ? 'EXISTING' : 'CREATE'); // EXISTING | CREATE | MEMORY

    // Existing DB State
    const [selectedPath, setSelectedPath] = useState(dbFiles.length > 0 ? dbFiles[0].path : null);
    const [mode, setMode] = useState('READ_ONLY'); // READ_ONLY | READ_WRITE

    // New DB State
    const [newDbName, setNewDbName] = useState('');

    useEffect(() => {
        if (dbFiles.length > 0) {
            if (!selectedPath) setSelectedPath(dbFiles[0].path);
            if (activeTab === 'CREATE' && dbFiles.length > 0) setActiveTab('EXISTING');
        } else {
            // If no files, default to CREATE
            setActiveTab('CREATE');
        }
    }, [dbFiles]);

    const handleSubmit = () => {
        if (activeTab === 'MEMORY') {
            onSelect({ path: ':memory:', readOnly: false });
        } else if (activeTab === 'CREATE') {
            if (!newDbName.trim()) {
                alert("Please enter a database name");
                return;
            }
            let name = newDbName.trim();
            if (!name.endsWith('.duckdb') && !name.endsWith('.db')) {
                name += '.duckdb';
            }
            // Create New = Read/Write implicitly
            onSelect({ path: name, readOnly: false });
        } else {
            // EXISTING
            if (!selectedPath) return; // Should not happen
            onSelect({ path: selectedPath, readOnly: mode === 'READ_ONLY' });
        }
    };

    const renderTabButton = (id, label, icon) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                flex: 1,
                padding: '10px',
                background: activeTab === id ? '#25262B' : 'transparent',
                border: 'none',
                borderBottom: activeTab === id ? '2px solid #00ffff' : '2px solid transparent',
                color: activeTab === id ? '#fff' : '#888',
                cursor: 'pointer',
                fontWeight: activeTab === id ? 'bold' : 'normal',
                fontSize: '13px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
        >
            <span>{icon}</span>
            <span>{label}</span>
        </button>
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(3px)'
        }}>
            <div style={{
                backgroundColor: '#141517', width: '550px',
                borderRadius: '8px', border: '1px solid #454545',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                color: '#bcbec4', fontFamily: 'sans-serif',
                overflow: 'hidden', display: 'flex', flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{ padding: '20px 25px', borderBottom: '1px solid #2C2E33', backgroundColor: '#1A1B1E' }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>
                        Initialize Database Session
                    </h3>
                    <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#888' }}>
                        Choose a data source to begin your work.
                    </p>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #2C2E33', backgroundColor: '#1A1B1E' }}>
                    {dbFiles.length > 0 && renderTabButton('EXISTING', 'Open Existing', <LuFolderOpen size={16} />)}
                    {renderTabButton('CREATE', 'Create New', <LuSparkles size={16} />)}
                    {renderTabButton('MEMORY', 'In-Memory', <LuBrain size={16} />)}
                </div>

                {/* Content Area */}
                <div style={{ padding: '25px', minHeight: '200px' }}>

                    {/* --- TAB: EXISTING --- */}
                    {activeTab === 'EXISTING' && (
                        <div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', textTransform: 'uppercase', color: '#666' }}>Select Database File</label>
                                <select
                                    value={selectedPath || ''}
                                    onChange={(e) => setSelectedPath(e.target.value)}
                                    style={{ width: '100%', padding: '10px', background: '#0F1012', color: 'white', border: '1px solid #333', borderRadius: '4px' }}
                                >
                                    {dbFiles.map(f => (
                                        <option key={f.path} value={f.path}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', marginBottom: '10px', fontSize: '12px', textTransform: 'uppercase', color: '#666' }}>Connection Mode</label>

                                <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '15px', padding: '10px', border: mode === 'READ_ONLY' ? '1px solid #00ffff' : '1px solid #333', borderRadius: '4px', background: mode === 'READ_ONLY' ? 'rgba(0, 255, 255, 0.05)' : 'transparent' }}>
                                    <input type="radio" name="dbmode" value="READ_ONLY" checked={mode === 'READ_ONLY'} onChange={(e) => setMode(e.target.value)} style={{ marginTop: '3px' }} />
                                    <div style={{ marginLeft: '10px' }}>
                                        <div style={{ color: '#00ffff', fontWeight: 'bold', fontSize: '14px' }}>Read Only</div>
                                        <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>Safe for browsing. Prevents file locks.</div>
                                    </div>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', padding: '10px', border: mode === 'READ_WRITE' ? '1px solid #00aeff' : '1px solid #333', borderRadius: '4px', background: mode === 'READ_WRITE' ? 'rgba(0, 174, 255, 0.05)' : 'transparent' }}>
                                    <input type="radio" name="dbmode" value="READ_WRITE" checked={mode === 'READ_WRITE'} onChange={(e) => setMode(e.target.value)} style={{ marginTop: '3px' }} />
                                    <div style={{ marginLeft: '10px' }}>
                                        <div style={{ color: '#00aeff', fontWeight: 'bold', fontSize: '14px' }}>Read / Write</div>
                                        <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>Exclusive lock. Create tables and edit data.</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* --- TAB: CREATE --- */}
                    {activeTab === 'CREATE' && (
                        <div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', textTransform: 'uppercase', color: '#666' }}>New Database Name</label>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        value={newDbName}
                                        onChange={(e) => setNewDbName(e.target.value)}
                                        placeholder="my_project_data"
                                        style={{ flex: 1, padding: '10px', background: '#0F1012', color: 'white', border: '1px solid #333', borderRadius: '4px 0 0 4px', outline: 'none' }}
                                        autoFocus
                                    />
                                    <div style={{ padding: '10px', background: '#25262B', border: '1px solid #333', borderLeft: 'none', borderRadius: '0 4px 4px 0', color: '#888', fontSize: '13px' }}>
                                        .duckdb
                                    </div>
                                </div>
                                <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                                    This will create a new file in your project folder.
                                </p>
                            </div>
                            <div style={{ padding: '10px', background: 'rgba(0, 255, 128, 0.05)', border: '1px solid rgba(0, 255, 128, 0.2)', borderRadius: '4px' }}>
                                <strong style={{ color: '#00ff80', fontSize: '13px' }}>Note:</strong>
                                <span style={{ fontSize: '12px', color: '#aaa', marginLeft: '5px' }}>New databases are always opened in <strong>Read / Write</strong> mode.</span>
                            </div>
                        </div>
                    )}

                    {/* --- TAB: MEMORY --- */}
                    {activeTab === 'MEMORY' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', paddingTop: '20px' }}>
                            <div style={{ marginBottom: '15px', color: '#888' }}><LuBrain size={48} /></div>
                            <h4 style={{ margin: '0 0 10px 0', color: '#fff' }}>In-Memory Session</h4>
                            <p style={{ fontSize: '13px', color: '#999', maxWidth: '300px', lineHeight: '1.5' }}>
                                Run queries and analyze data without creating any files. All data will be lost when you close the app.
                            </p>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div style={{ padding: '20px 25px', borderTop: '1px solid #2C2E33', display: 'flex', justifyContent: 'flex-end', gap: '10px', backgroundColor: '#1A1B1E' }}>
                    {/* Back Button (Only logic if we had a previous step, but Cancel implies exiting project selection?? Maybe just removed for now) */}
                    <button
                        onClick={handleSubmit}
                        style={{
                            backgroundColor: activeTab === 'CREATE' ? '#00ff80' : '#00ffff',
                            padding: '10px 24px', borderRadius: '4px', border: 'none',
                            color: '#141517', fontWeight: 'bold', cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: (activeTab === 'CREATE' && !newDbName.trim()) ? 0.5 : 1
                        }}
                        disabled={activeTab === 'CREATE' && !newDbName.trim()}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {activeTab === 'CREATE' ? 'Create & Connect' : 'Start Session'} <LuRocket size={16} />
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DatabaseSelectionModal;
