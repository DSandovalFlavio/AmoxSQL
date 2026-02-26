import { useState, useEffect } from 'react';

const ImportExcelModal = ({ isOpen, onClose, onImport, initialFile = '' }) => {
    const [loading, setLoading] = useState(false);
    const [sheets, setSheets] = useState([]);
    const [selectedSheets, setSelectedSheets] = useState({}); // { sheetName: boolean }
    const [mode, setMode] = useState('MERGE'); // 'MERGE' | 'INDIVIDUAL'
    const [tableName, setTableName] = useState(''); // For MERGE mode
    const [cleanColumns, setCleanColumns] = useState(true);
    const [error, setError] = useState(null);
    const [successSummary, setSuccessSummary] = useState(null);

    // Fetch Sheets on Open
    useEffect(() => {
        if (isOpen) {
            // Reset state on open
            setSuccessSummary(null);
            setError(null);
            setLoading(false);
            setSheets([]);

            if (initialFile) {
                fetchSheets();
                // Default table name
                const name = initialFile.split(/[/\\]/).pop().split('.')[0];
                setTableName(name.replace(/[^a-zA-Z0-9]/g, '_'));
            }
        }
    }, [isOpen, initialFile]);

    const fetchSheets = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`http://localhost:3001/api/files/inspect-excel?path=${encodeURIComponent(initialFile)}`);
            const data = await response.json();
            if (response.ok) {
                setSheets(data.sheets);
                // Select all by default
                const sel = {};
                data.sheets.forEach(s => sel[s] = true);
                setSelectedSheets(sel);
            } else {
                setError(data.error || "Failed to load sheets");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSheetToggle = (sheet) => {
        setSelectedSheets(prev => ({ ...prev, [sheet]: !prev[sheet] }));
    };

    const handleSelectAll = (select) => {
        const sel = {};
        sheets.forEach(s => sel[s] = select);
        setSelectedSheets(sel);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const sheetList = sheets.filter(s => selectedSheets[s]);
        if (sheetList.length === 0) {
            setError("Please select at least one sheet.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await onImport({
                filePath: initialFile,
                mode,
                sheets: sheetList,
                tableName: mode === 'MERGE' ? tableName : null,
                cleanColumns
            });

            if (result && result.success) {
                setSuccessSummary(result.summary || "Import process completed successfully.");
            } else {
                setError(result?.error || "Import failed without specific error.");
            }
        } catch (err) {
            setError("Unexpected error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setSuccessSummary(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', padding: '24px', borderRadius: '12px', width: '500px', maxHeight: '80vh',
                border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)', fontFamily: 'inherit', display: 'flex', flexDirection: 'column'
            }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-active)', fontSize: '16px' }}>
                    {successSummary ? 'Import Completed' : 'Import Excel to Database'}
                </h3>

                {!successSummary && (
                    <div style={{ marginBottom: '15px', fontSize: '12px', color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                        File: {initialFile}
                    </div>
                )}

                {/* Success View */}
                {successSummary ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: '150px' }}>
                        <div style={{
                            padding: '15px',
                            backgroundColor: 'var(--feedback-success-bg)',
                            border: '1px solid var(--feedback-success-border)',
                            borderRadius: '4px',
                            color: 'var(--feedback-success-text)',
                            whiteSpace: 'pre-wrap',
                            overflowY: 'auto',
                            fontSize: '13px',
                            flex: 1
                        }}>
                            <strong>Success!</strong>
                            <br /><br />
                            {successSummary}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleClose} style={{ backgroundColor: 'var(--accent-color-user)', padding: '8px 16px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Import Form */
                    <>
                        {loading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--accent-color-user)' }}>Processing Import...</div>}

                        {error && <div style={{ padding: '10px', backgroundColor: 'var(--feedback-error-bg)', color: 'var(--feedback-error-text)', borderRadius: '4px', marginBottom: '10px', fontSize: '12px', border: '1px solid var(--feedback-error-border)' }}>{error}</div>}

                        {!loading && (
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, overflow: 'hidden' }}>

                                {/* Import Mode */}
                                <div style={{ backgroundColor: 'var(--panel-bg)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>Import Strategy</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="mode"
                                                checked={mode === 'MERGE'}
                                                onChange={() => setMode('MERGE')}
                                                style={{ accentColor: 'var(--accent-color-user)' }}
                                            />
                                            <div>
                                                <span style={{ color: 'var(--text-active)', fontWeight: 'bold' }}>Merge Sheets (Union)</span>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                                                    Combine all selected sheets into one table. Adds 'source_duck' column.
                                                </div>
                                            </div>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="mode"
                                                checked={mode === 'INDIVIDUAL'}
                                                onChange={() => setMode('INDIVIDUAL')}
                                                style={{ accentColor: 'var(--accent-color-user)' }}
                                            />
                                            <div>
                                                <span style={{ color: 'var(--text-active)', fontWeight: 'bold' }}>Individual Tables</span>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                                                    Create a separate table for each selected sheet.
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Table Name (Only for Merge) */}
                                {mode === 'MERGE' && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Target Table Name</label>
                                        <input
                                            type="text"
                                            value={tableName}
                                            onChange={(e) => setTableName(e.target.value)}
                                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', borderRadius: '3px' }}
                                            required
                                        />
                                    </div>
                                )}

                                {/* Sheet Selection */}
                                <div style={{ flex: 1, overflowY: 'auto', minHeight: '100px', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '5px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px', borderBottom: '1px solid var(--border-color)', marginBottom: '5px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Select Sheets to Import</span>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button type="button" onClick={() => handleSelectAll(true)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-color-user)', cursor: 'pointer', fontSize: '11px' }}>All</button>
                                            <button type="button" onClick={() => handleSelectAll(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}>None</button>
                                        </div>
                                    </div>
                                    {sheets.map(sheet => (
                                        <label key={sheet} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                            <input
                                                type="checkbox"
                                                checked={!!selectedSheets[sheet]}
                                                onChange={() => handleSheetToggle(sheet)}
                                                style={{ accentColor: 'var(--accent-color-user)' }}
                                            />
                                            {sheet}
                                        </label>
                                    ))}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="cleanColsExcel"
                                        checked={cleanColumns}
                                        onChange={(e) => setCleanColumns(e.target.checked)}
                                    />
                                    <label htmlFor="cleanColsExcel" style={{ fontSize: '12px', cursor: 'pointer' }}>
                                        Clean Column Names (spaces -&gt; underscores)
                                    </label>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button type="button" onClick={onClose} style={{ backgroundColor: 'var(--button-bg-secondary)', padding: '6px 12px', borderRadius: '3px', border: '1px solid var(--border-color)', color: 'var(--text-color)', cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" style={{ backgroundColor: 'var(--accent-color-user)', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Import Config</button>
                                </div>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ImportExcelModal;
