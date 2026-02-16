import { useState, useEffect } from 'react';

const SaveQueryModal = ({ isOpen, onClose, onSave, initialName = '' }) => {
    const [filename, setFilename] = useState(initialName);
    const [description, setDescription] = useState('');
    const [folders, setFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [loadingFolders, setLoadingFolders] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successSummary, setSuccessSummary] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setFilename(initialName); // Reset name on open
            setSuccessSummary(null);
            setError(null);
            setSaving(false);
            fetchFolders();
        }
    }, [isOpen]);

    const fetchFolders = async () => {
        setLoadingFolders(true);
        try {
            const response = await fetch('http://localhost:3001/api/folders');
            if (response.ok) {
                const data = await response.json();
                setFolders(data);
            }
        } catch (err) {
            console.error("Failed to load folders", err);
        } finally {
            setLoadingFolders(false);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        let fullPath = filename;
        if (selectedFolder) {
            fullPath = `${selectedFolder}/${filename}`;
        }

        setSaving(true);
        setError(null);

        try {
            // onSave (triggered from App.jsx handleSaveAs) returns a result object now
            const result = await onSave(fullPath, description);

            if (result && result.success) {
                setSuccessSummary(result.summary || "File saved successfully.");
            } else {
                setError(result?.error || "Save failed.");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setSuccessSummary(null);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#252526', padding: '20px', borderRadius: '5px', width: '400px',
                border: '1px solid #454545', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                color: '#bcbec4', fontFamily: 'sans-serif'
            }}>
                <h3 style={{ marginTop: 0, color: '#fff', fontSize: '16px' }}>
                    {successSummary ? 'Save Completed' : 'Save Query'}
                </h3>

                {successSummary ? (
                    /* Success View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ padding: '15px', backgroundColor: '#1e3a1e', border: '1px solid #2e5a2e', borderRadius: '4px', color: '#aaffaa', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                            <strong>Success!</strong><br /><br />
                            {successSummary}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleClose} style={{ backgroundColor: '#00ffff', padding: '8px 16px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Save Form */
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {saving && <div style={{ padding: '10px', textAlign: 'center', color: '#00ffff' }}>Saving...</div>}
                        {error && <div style={{ padding: '10px', backgroundColor: '#3e2020', color: '#ff8888', borderRadius: '4px', marginBottom: '10px', fontSize: '12px' }}>{error}</div>}

                        {!saving && (
                            <>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Folder</label>
                                    <select
                                        value={selectedFolder}
                                        onChange={(e) => setSelectedFolder(e.target.value)}
                                        style={{ width: '100%', padding: '8px', backgroundColor: '#3c3c3c', border: '1px solid #555', color: '#fff', borderRadius: '3px' }}
                                    >
                                        {folders.map(f => (
                                            <option key={f.path} value={f.path}>
                                                {f.name === 'Root' ? '/ (Root)' : f.path}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Filename</label>
                                    <input
                                        type="text"
                                        value={filename}
                                        onChange={(e) => setFilename(e.target.value)}
                                        placeholder="query.sql or notebook.sqlnb"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: '#3c3c3c', border: '1px solid #555', color: '#fff', borderRadius: '3px' }}
                                        autoFocus
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Description (optional)</label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="What does this query do?"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px', height: '80px', backgroundColor: '#3c3c3c', border: '1px solid #555', color: '#fff', resize: 'vertical', borderRadius: '3px' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button type="button" onClick={handleClose} style={{ backgroundColor: '#4e5157', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" style={{ backgroundColor: '#00ffff', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
                                </div>
                            </>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
};

export default SaveQueryModal;
