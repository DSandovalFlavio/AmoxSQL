/**
 * Settings › Almacenamiento en la nube y Google Sheets.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { API_BASE as API } from '../../api.js';
import { LuCheck, LuX, LuCloud, LuFileSpreadsheet, LuCopy } from 'react-icons/lu';
import { valorVisible, indicacion } from './comun';

export default function Integraciones({
    cloudTestResult,
    emailCopied,
    gcsConfig,
    gsheetsEmail,
    gsheetsKeyPath,
    gsheetsStatus,
    gsheetsTestResult,
    handleSaveConfig,
    handleTestCloudConnection,
    isSaving,
    isTestingCloud,
    isTestingGSheets,
    s3Config,
    saveMessage,
    setEmailCopied,
    setGcsConfig,
    setGsheetsEmail,
    setGsheetsKeyPath,
    setGsheetsStatus,
    setGsheetsTestResult,
    setIsTestingGSheets,
    setS3Config,
}) {
    return (
        <div className="stg-section">
            {/* ── Cloud Storage (S3 / GCS) ── */}
            <div className="stg-row stg-row--top">
                <div>
                    <h3 className="stg-section-heading stg-section-heading--mb8"><LuCloud size={14} /> Cloud Storage Export</h3>
                    <p className="stg-row-desc stg-row-desc--maxw480">
                        Connect your cloud storage buckets to export query results directly to S3 or Google Cloud Storage using DuckDB's native httpfs extension.
                    </p>
                </div>
                <button onClick={handleSaveConfig} disabled={isSaving} className="stg-btn stg-btn--primary" title="Saves the whole configuration (AI, cloud, editor, etc.)">
                    {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            {saveMessage && (
                <div className={`stg-alert stg-alert--${saveMessage.type}`}>
                    {saveMessage.text}
                </div>
            )}

            <div className="stg-cloud-grid">
                {/* S3 */}
                <div className="stg-card">
                    <div className="stg-card-header">
                        <h4 className="stg-card-title"><LuCloud size={14} /> Amazon S3</h4>
                        <button onClick={() => handleTestCloudConnection('s3')} disabled={isTestingCloud} className="stg-btn">
                            {isTestingCloud ? 'Testing...' : 'Test Connection'}
                        </button>
                    </div>
                    <div className="stg-flex-col--gap10">
                        {[
                            { label: 'Access Key ID', key: 'accessKeyId', placeholder: 'AKIAIOSFODNN7EXAMPLE' },
                            { label: 'Secret Access Key', key: 'secretKey', placeholder: 'wJalrXUtnFEMI/K7MDENG...', type: 'password', mono: true },
                            { label: 'Region', key: 'region', placeholder: 'us-east-1' },
                            { label: 'Endpoint (Optional)', key: 'endpoint', placeholder: 's3.us-east-1.amazonaws.com' },
                            { label: 'Default Bucket', key: 'defaultBucket', placeholder: 'my-bucket-name' },
                        ].map(f => (
                            <div key={f.key}>
                                <div className="stg-field-label">{f.label}</div>
                                <input
                                    type={f.type || 'text'}
                                    className={`stg-input${f.mono ? ' stg-input--mono' : ''}`}
                                    value={valorVisible(s3Config[f.key])}
                                    onChange={(e) => setS3Config({ ...s3Config, [f.key]: e.target.value })}
                                    placeholder={indicacion(s3Config[f.key], f.placeholder)}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* GCS */}
                <div className="stg-card">
                    <div className="stg-card-header">
                        <h4 className="stg-card-title"><LuCloud size={14} /> Google Cloud Storage</h4>
                        <button onClick={() => handleTestCloudConnection('gcs')} disabled={isTestingCloud} className="stg-btn">
                            {isTestingCloud ? 'Testing...' : 'Test HMAC'}
                        </button>
                    </div>
                    <p className="stg-card-desc">
                        DuckDB connects to GCS using HMAC keys via the S3-compatible API. Create an HMAC key in your Google Cloud Console.
                    </p>
                    <div className="stg-flex-col--gap10">
                        {[
                            { label: 'HMAC Access ID', key: 'accessKeyId', placeholder: 'GOOG1EQX...' },
                            { label: 'HMAC Secret', key: 'secretKey', placeholder: '...', type: 'password', mono: true },
                            { label: 'Default Bucket', key: 'defaultBucket', placeholder: 'gs://my-bucket' },
                        ].map(f => (
                            <div key={f.key}>
                                <div className="stg-field-label">{f.label}</div>
                                <input
                                    type={f.type || 'text'}
                                    className={`stg-input${f.mono ? ' stg-input--mono' : ''}`}
                                    value={valorVisible(gcsConfig[f.key])}
                                    onChange={(e) => setGcsConfig({ ...gcsConfig, [f.key]: e.target.value })}
                                    placeholder={indicacion(gcsConfig[f.key], f.placeholder)}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {cloudTestResult && (
                <div className={`stg-alert stg-alert--${cloudTestResult.type}`}>
                    {cloudTestResult.type === 'success' ? <LuCheck size={14} /> : <LuX size={14} />}
                    {cloudTestResult.text}
                </div>
            )}

            {/* ── Separator ── */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '24px 0' }} />

            {/* ── Google Sheets ── */}
            <div className="stg-row stg-row--top">
                <div>
                    <h3 className="stg-section-heading stg-section-heading--mb8">
                        <LuFileSpreadsheet size={14} style={{ color: 'var(--color-success)' }} /> Google Sheets
                    </h3>
                    <p className="stg-row-desc stg-row-desc--maxw480">
                        Connect Google Sheets as queryable data sources via DuckDB. Each spreadsheet appears as a virtual database in the File Explorer — every sheet tab is a table you can query with SQL.
                    </p>
                </div>
                <button
                    onClick={async () => {
                        if (!gsheetsKeyPath.trim()) return;
                        setIsTestingGSheets(true);
                        setGsheetsTestResult(null);
                        try {
                            const res = await fetch(`${API}/api/gsheets/setup`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ serviceAccountKeyPath: gsheetsKeyPath.trim() })
                            });
                            const data = await res.json();
                            if (res.ok) {
                                setGsheetsEmail(data.email);
                                setGsheetsStatus({ isConfigured: true, extensionLoaded: true });
                                setGsheetsTestResult({ type: 'success', text: 'Google Sheets connected successfully!' });
                            } else {
                                setGsheetsTestResult({ type: 'error', text: data.error || 'Setup failed' });
                            }
                        } catch (err) {
                            setGsheetsTestResult({ type: 'error', text: err.message });
                        } finally {
                            setIsTestingGSheets(false);
                            setTimeout(() => setGsheetsTestResult(null), 5000);
                        }
                    }}
                    disabled={isTestingGSheets || !gsheetsKeyPath.trim()}
                    className="stg-btn stg-btn--primary"
                >
                    {isTestingGSheets ? 'Connecting...' : 'Save & Connect'}
                </button>
            </div>

            <div className="stg-card" style={{ marginTop: 12 }}>
                <div className="stg-card-header">
                    <h4 className="stg-card-title"><LuFileSpreadsheet size={14} style={{ color: 'var(--color-success)' }} /> Service Account Configuration</h4>
                    <span style={{ fontSize: '11px', color: gsheetsStatus.isConfigured ? '#34a853' : 'var(--text-tertiary)' }}>
                        {gsheetsStatus.isConfigured ? '● Connected' : '○ Not configured'}
                    </span>
                </div>

                <div className="stg-flex-col--gap10" style={{ marginTop: 8 }}>
                    <div>
                        <div className="stg-field-label">Service Account Key (JSON file path)</div>
                        <input
                            type="text"
                            className="stg-input stg-input--mono"
                            value={gsheetsKeyPath}
                            onChange={(e) => setGsheetsKeyPath(e.target.value)}
                            placeholder="C:\Users\you\.gcp\service-account.json"
                        />
                    </div>

                    {gsheetsEmail && (
                        <div>
                            <div className="stg-field-label">Service Account Email</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <code className="stg-input stg-input--mono" style={{ flex: 1, padding: '8px 10px', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: '11px' }}>
                                    {gsheetsEmail}
                                </code>
                                <button
                                    className="stg-btn"
                                    onClick={() => {
                                        navigator.clipboard.writeText(gsheetsEmail);
                                        setEmailCopied(true);
                                        setTimeout(() => setEmailCopied(false), 2000);
                                    }}
                                    title="Copy email"
                                >
                                    {emailCopied ? <LuCheck size={12} /> : <LuCopy size={12} />}
                                </button>
                            </div>
                            <p className="stg-row-desc" style={{ marginTop: 6, fontSize: '11px' }}>
                                👆 Share your Google Sheets with this email (Viewer or Editor) to allow AmoxSQL to read/write them.
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface-inset)', borderRadius: 8, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <strong>Minimum Permissions Required:</strong>
                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                        <li><strong>Google Sheets API</strong> — Must be enabled in your GCP project.</li>
                        <li><strong>Role:</strong> <code>roles/viewer</code> (read-only) or <code>roles/editor</code> (read + write).</li>
                        <li><strong>Scope:</strong> <code>https://www.googleapis.com/auth/spreadsheets</code> (for read & write).</li>
                        <li>Each Google Sheet must be <strong>shared with the Service Account email</strong> (like sharing with a collaborator).</li>
                    </ul>
                </div>
            </div>

            {gsheetsTestResult && (
                <div className={`stg-alert stg-alert--${gsheetsTestResult.type}`} style={{ marginTop: 10 }}>
                    {gsheetsTestResult.type === 'success' ? <LuCheck size={14} /> : <LuX size={14} />}
                    {gsheetsTestResult.text}
                </div>
            )}
        </div>
    );
}
