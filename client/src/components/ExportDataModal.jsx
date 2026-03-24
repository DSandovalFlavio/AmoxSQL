import { useState } from 'react';
import { LuX, LuDownload, LuFileSpreadsheet, LuFile, LuCloud, LuHardDrive } from 'react-icons/lu';

/**
 * ExportDataModal — Export query results to CSV, Parquet, or Excel (XLSX)
 * Uses DuckDB's native COPY TO for high-performance export.
 */
const ExportDataModal = ({ isOpen, onClose, query, currentDb }) => {
    const [format, setFormat] = useState('csv');
    const [filename, setFilename] = useState('export'); // For local
    const [destination, setDestination] = useState(''); // For cloud
    const [exportTarget, setExportTarget] = useState('local'); // 'local' or 'cloud'
    const [cloudProvider, setCloudProvider] = useState('s3'); // 's3' or 'gcs'
    const [exporting, setExporting] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const extensions = { csv: '.csv', parquet: '.parquet', xlsx: '.xlsx' };
    const fullFilename = `${filename}${extensions[format] || '.csv'}`;

    const handleExport = async () => {
        setExporting(true);
        setError(null);
        setResult(null);

        try {
            if (exportTarget === 'local') {
                const response = await fetch('http://localhost:3001/api/export-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query,
                        format: format,
                        filename: fullFilename,
                    }),
                });
                const data = await response.json();

                if (response.ok) {
                    setResult(data);
                } else {
                    setError(data.error || 'Export failed');
                }
            } else {
                // Cloud Export
                if (!destination.trim()) {
                    throw new Error("Destination URI is required for cloud export");
                }
                const response = await fetch('http://localhost:3001/api/export/cloud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: query,
                        format: format,
                        destination: destination,
                        provider: cloudProvider
                    }),
                });
                const data = await response.json();

                if (response.ok) {
                    setResult({ path: destination, message: data.message });
                } else {
                    setError(data.error || 'Cloud export failed');
                }
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setExporting(false);
        }
    };

    const formatOptions = [
        { value: 'csv', label: 'CSV', desc: 'Comma-separated values', icon: <LuFile size={16} /> },
        { value: 'parquet', label: 'Parquet', desc: 'Columnar format, ideal for analytics', icon: <LuFile size={16} /> },
        { value: 'xlsx', label: 'Excel (.xlsx)', desc: 'Microsoft Excel workbook', icon: <LuFileSpreadsheet size={16} /> },
    ];

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
        }} onClick={onClose}>
            <div className="modal-panel" style={{
                backgroundColor: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                borderRadius: '12px', padding: '24px', width: '440px',
                boxShadow: 'var(--shadow-lg)', maxHeight: '80vh', overflowY: 'auto',
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-active)' }}>
                        <LuDownload size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                        Export Data
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <LuX size={18} />
                    </button>
                </div>

                {/* Query Preview */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Source Query</label>
                    <div style={{
                        backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                        borderRadius: '6px', padding: '8px 10px', fontSize: '11px',
                        fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)',
                        maxHeight: '80px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.4,
                    }}>
                        {query ? (query.length > 300 ? query.substring(0, 300) + '...' : query) : 'No query provided'}
                    </div>
                </div>

                {/* Target Selection */}
                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setExportTarget('local')}
                        style={{
                            flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer',
                            backgroundColor: exportTarget === 'local' ? 'var(--accent-primary)' : 'var(--input-bg)',
                            color: exportTarget === 'local' ? 'var(--button-text-color)' : 'var(--text-secondary)',
                            border: exportTarget === 'local' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', fontWeight: 600
                        }}
                    >
                        <LuHardDrive size={14} /> Local Server
                    </button>
                    <button
                        onClick={() => setExportTarget('cloud')}
                        style={{
                            flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer',
                            backgroundColor: exportTarget === 'cloud' ? 'var(--accent-primary)' : 'var(--input-bg)',
                            color: exportTarget === 'cloud' ? 'var(--button-text-color)' : 'var(--text-secondary)',
                            border: exportTarget === 'cloud' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', fontWeight: 600
                        }}
                    >
                        <LuCloud size={14} /> Cloud Storage
                    </button>
                </div>

                {/* Format Selection */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>Format</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {formatOptions.filter(o => exportTarget === 'local' || o.value !== 'xlsx').map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setFormat(opt.value)}
                                style={{
                                    flex: 1, padding: '10px 8px', borderRadius: '8px', cursor: 'pointer',
                                    backgroundColor: format === opt.value ? 'var(--accent-primary)' : 'var(--input-bg)',
                                    color: format === opt.value ? 'var(--button-text-color)' : 'var(--text-secondary)',
                                    border: format === opt.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                    fontSize: '11px', fontWeight: 600, transition: 'all 120ms ease',
                                }}
                            >
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {exportTarget === 'local' ? (
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Filename</label>
                        <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                            <input
                                type="text"
                                value={filename}
                                onChange={e => setFilename(e.target.value)}
                                placeholder="export"
                                style={{
                                    flex: 1, backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                    border: '1px solid var(--border-color)', borderRight: 'none',
                                    borderRadius: '6px 0 0 6px', padding: '8px 10px', fontSize: '12px', outline: 'none',
                                }}
                            />
                            <div style={{
                                backgroundColor: 'var(--panel-section-bg)', border: '1px solid var(--border-color)',
                                borderRadius: '0 6px 6px 0', padding: '8px 10px', fontSize: '12px',
                                color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                            }}>
                                {extensions[format]}
                            </div>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            File will be saved in your workspace directory.
                        </div>
                    </div>
                ) : (
                    <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Cloud Provider</label>
                            <select
                                value={cloudProvider}
                                onChange={(e) => setCloudProvider(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 10px', fontSize: '12px', backgroundColor: 'var(--input-bg)',
                                    color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '6px', outline: 'none'
                                }}
                            >
                                <option value="s3">Amazon S3</option>
                                <option value="gcs">Google Cloud Storage (GCS)</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '4px' }}>Destination URI</label>
                            <input
                                type="text"
                                value={destination}
                                onChange={e => setDestination(e.target.value)}
                                placeholder={cloudProvider === 's3' ? "s3://my-bucket/path/data-export" + (extensions[format] || '.csv') : "gs://my-bucket/path/data-export" + (extensions[format] || '.csv')}
                                style={{
                                    width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                    border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', outline: 'none', fontFamily: 'monospace'
                                }}
                            />
                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                Ensure your credentials are set in Settings &gt; Cloud Storage
                            </div>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ backgroundColor: 'var(--feedback-error-bg)', border: '1px solid var(--feedback-error-border)', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '11px', color: 'var(--feedback-error)' }}>
                        {error}
                    </div>
                )}

                {/* Success */}
                {result && (
                    <div style={{ backgroundColor: 'var(--feedback-success-bg)', border: '1px solid var(--feedback-success-border)', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '11px', color: 'var(--feedback-success)' }}>
                        ✅ Exported to <strong>{result.path}</strong> ({result.rowCount ?? '?'} rows)
                    </div>
                )}

                {/* Export Button */}
                <button
                    onClick={handleExport}
                    disabled={exporting || !query}
                    style={{
                        width: '100%', padding: '10px', borderRadius: '8px', cursor: exporting ? 'wait' : 'pointer',
                        backgroundColor: exporting ? 'var(--accent-secondary)' : 'var(--accent-primary)',
                        color: 'var(--button-text-color)', border: 'none', fontSize: '13px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        opacity: !query ? 0.5 : 1,
                    }}
                >
                    <LuDownload size={16} />
                    {exporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
                </button>
            </div>
        </div>
    );
};

export default ExportDataModal;
