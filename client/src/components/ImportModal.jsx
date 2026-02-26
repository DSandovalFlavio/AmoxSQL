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
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', padding: '24px', borderRadius: '12px', width: '400px',
                border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)', fontFamily: 'inherit'
            }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-active)', fontSize: '16px' }}>
                    {successSummary ? 'Import Completed' : (isFolder ? 'Import Folder to Database' : 'Import File to Database')}
                </h3>

                {successSummary ? (
                    /* Success View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ padding: '15px', backgroundColor: 'var(--feedback-success-bg)', border: '1px solid var(--feedback-success-border)', borderRadius: '4px', color: 'var(--feedback-success-text)', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                            <strong>Success!</strong><br /><br />
                            {successSummary}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleClose} style={{ backgroundColor: 'var(--accent-color-user)', padding: '8px 16px', borderRadius: '3px', border: 'none', color: 'var(--button-text-color)', fontWeight: 'bold', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Import Form */
                    <>
                        <div style={{ marginBottom: '15px', fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                            {isFolder ? 'Folder:' : 'File:'} {initialFile}
                        </div>

                        {loading && <div style={{ padding: '10px', textAlign: 'center', color: 'var(--accent-color-user)' }}>Importing...</div>}
                        {error && <div style={{ padding: '10px', backgroundColor: 'var(--feedback-error-bg)', color: 'var(--feedback-error-text)', borderRadius: '4px', marginBottom: '10px', fontSize: '12px', border: '1px solid var(--feedback-error-border)' }}>{error}</div>}

                        {!loading && (
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Table Name</label>
                                    <input
                                        type="text"
                                        value={tableName}
                                        onChange={(e) => setTableName(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', borderRadius: '3px' }}
                                        autoFocus
                                        required
                                    />
                                </div>

                                {isFolder && (
                                    <div style={{ backgroundColor: 'var(--panel-bg)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
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
                                    <button type="button" onClick={handleClose} style={{ backgroundColor: 'var(--button-bg-secondary)', padding: '6px 12px', borderRadius: '3px', border: '1px solid var(--border-color)', color: 'var(--text-color)', cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" style={{ backgroundColor: 'var(--accent-color-user)', padding: '6px 12px', borderRadius: '3px', border: 'none', color: 'var(--button-text-color)', fontWeight: 'bold', cursor: 'pointer' }}>Import</button>
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
