import { useState, useEffect } from 'react';

const ImportModal = ({ isOpen, onClose, onImport, initialFile = '', isFolder = false }) => {
    const [tableName, setTableName] = useState('');
    const [cleanColumns, setCleanColumns] = useState(true);
    const [fileType, setFileType] = useState('csv'); // csv | parquet | json
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successSummary, setSuccessSummary] = useState(null);

    useEffect(() => {
        if (isOpen) {
            // Reset state
            setSuccessSummary(null);
            setError(null);
            setLoading(false);

            if (initialFile) {
                // Suggest table name from folder/filename
                const name = initialFile.split(/[/\\]/).pop().split('.')[0];
                setTableName(name.replace(/[^a-zA-Z0-9]/g, '_'));
            }
        }
    }, [isOpen, initialFile]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        let finalPath = initialFile;
        if (isFolder) {
            // Append glob pattern based on file type
            finalPath = `${initialFile.replace(/\\/g, '/')}`;
            if (!finalPath.endsWith('/')) finalPath += '/';
            finalPath += `*.${fileType}`;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await onImport(tableName, cleanColumns, isFolder ? finalPath : null);

            if (result && result.success) {
                setSuccessSummary(result.summary || "Import completed successfully.");
            } else {
                setError(result?.error || "Import failed.");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
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
                    {successSummary ? 'Import Completed' : (isFolder ? 'Import Folder to Database' : 'Import File to Database')}
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
                    /* Import Form */
                    <>
                        <div style={{ marginBottom: '15px', fontSize: '12px', color: '#aaa', wordBreak: 'break-all' }}>
                            {isFolder ? 'Folder:' : 'File:'} {initialFile}
                        </div>

                        {loading && <div style={{ padding: '10px', textAlign: 'center', color: '#00ffff' }}>Importing...</div>}
                        {error && <div style={{ padding: '10px', backgroundColor: '#3e2020', color: '#ff8888', borderRadius: '4px', marginBottom: '10px', fontSize: '12px' }}>{error}</div>}

                        {!loading && (
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Table Name</label>
                                    <input
                                        type="text"
                                        value={tableName}
                                        onChange={(e) => setTableName(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: '#3c3c3c', border: '1px solid #555', color: '#fff', borderRadius: '3px' }}
                                        autoFocus
                                        required
                                    />
                                </div>

                                {isFolder && (
                                    <div style={{ backgroundColor: '#2d2d30', padding: '10px', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>File Type to Import</label>
                                        <div style={{ display: 'flex', gap: '15px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="fileType"
                                                    checked={fileType === 'csv'}
                                                    onChange={() => setFileType('csv')}
                                                /> CSV (*.csv)
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="fileType"
                                                    checked={fileType === 'parquet'}
                                                    onChange={() => setFileType('parquet')}
                                                /> Parquet (*.parquet)
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="fileType"
                                                    checked={fileType === 'json'}
                                                    onChange={() => setFileType('json')}
                                                /> JSON (*.json)
                                            </label>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="cleanCols"
                                        checked={cleanColumns}
                                        onChange={(e) => setCleanColumns(e.target.checked)}
                                    />
                                    <label htmlFor="cleanCols" style={{ fontSize: '12px', cursor: 'pointer' }}>
                                        Clean Column Names (spaces -&gt; underscores)
                                    </label>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button type="button" onClick={handleClose} style={{ backgroundColor: '#4e5157', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" style={{ backgroundColor: '#00ffff', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Import</button>
                                </div>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ImportModal;
