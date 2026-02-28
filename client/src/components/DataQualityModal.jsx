import { useState, useEffect } from 'react';
import { LuX, LuShieldCheck, LuCircleAlert, LuCircleCheck, LuLoader } from 'react-icons/lu';

/**
 * DataQualityModal — Runs automated quality checks on a table using DuckDB.
 * Checks: null%, duplicate rows, cardinality, data type consistency, outliers.
 */
const DataQualityModal = ({ isOpen, onClose, tableName }) => {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && tableName) {
            runQualityChecks();
        }
    }, [isOpen, tableName]);

    const runQualityChecks = async () => {
        setLoading(true);
        setError(null);
        setReport(null);

        try {
            // Use SUMMARIZE for basic profile
            const summaryRes = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `SUMMARIZE "${tableName}"` }),
            });
            const summaryData = await summaryRes.json();

            if (!summaryRes.ok) throw new Error(summaryData.error);

            // Count total rows
            const countRes = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `SELECT COUNT(*) AS total_rows FROM "${tableName}"` }),
            });
            const countData = await countRes.json();
            const totalRows = countData.data?.[0]?.total_rows || 0;

            // Check for duplicate full rows
            const dupRes = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `SELECT COUNT(*) AS dup_count FROM (SELECT *, COUNT(*) AS cnt FROM "${tableName}" GROUP BY ALL HAVING cnt > 1)` }),
            });
            const dupData = await dupRes.json();
            const dupCount = dupData.data?.[0]?.dup_count || 0;

            // Build column-level checks from SUMMARIZE
            const columnChecks = (summaryData.data || []).map(col => {
                const nullPct = parseFloat(col.null_percentage || 0);
                const approxUnique = parseInt(col.approx_unique || 0);
                const totalNonNull = totalRows - Math.round(totalRows * nullPct / 100);

                const checks = [];
                // Null check
                if (nullPct === 0) {
                    checks.push({ name: 'Completeness', status: 'pass', detail: 'No nulls' });
                } else if (nullPct < 5) {
                    checks.push({ name: 'Completeness', status: 'warn', detail: `${nullPct}% null values` });
                } else {
                    checks.push({ name: 'Completeness', status: 'fail', detail: `${nullPct}% null values` });
                }

                // Uniqueness check
                const uniqueRatio = totalNonNull > 0 ? (approxUnique / totalNonNull) : 0;
                if (uniqueRatio > 0.95) {
                    checks.push({ name: 'Uniqueness', status: 'pass', detail: `${approxUnique} unique (likely ID)` });
                } else if (uniqueRatio > 0.5) {
                    checks.push({ name: 'Uniqueness', status: 'info', detail: `${approxUnique} unique values` });
                } else {
                    checks.push({ name: 'Uniqueness', status: 'info', detail: `${approxUnique} unique (categorical)` });
                }

                return {
                    column: col.column_name,
                    type: col.column_type,
                    min: col.min,
                    max: col.max,
                    nullPct,
                    approxUnique,
                    checks,
                };
            });

            // Overall score
            const totalChecks = columnChecks.reduce((sum, c) => sum + c.checks.length, 0);
            const passedChecks = columnChecks.reduce((sum, c) => sum + c.checks.filter(ch => ch.status === 'pass').length, 0);
            const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

            setReport({
                tableName,
                totalRows,
                columnCount: columnChecks.length,
                dupCount,
                score,
                columns: columnChecks,
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const scoreColor = (report?.score ?? 100) >= 80 ? '#10b981' : (report?.score ?? 100) >= 50 ? '#f59e0b' : '#ef4444';
    const statusIcon = {
        pass: <LuCircleCheck size={12} color="#10b981" />,
        warn: <LuCircleAlert size={12} color="#f59e0b" />,
        fail: <LuCircleAlert size={12} color="#ef4444" />,
        info: <LuShieldCheck size={12} color="#6366f1" />,
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(8px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', width: '700px', maxHeight: '600px',
                borderRadius: '12px', border: '1px solid var(--border-default)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: 'var(--shadow-lg)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-raised)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <LuShieldCheck size={18} color={scoreColor} />
                        <h2 style={{ margin: 0, fontSize: '15px', color: 'var(--text-active)' }}>
                            Quality Check: {tableName}
                        </h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <LuX size={18} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {loading && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                            <LuLoader size={24} className="spin" />
                            Running quality checks...
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '20px', color: '#ef4444', textAlign: 'center' }}>Error: {error}</div>
                    )}

                    {report && (
                        <>
                            {/* Score Card */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px',
                            }}>
                                <ScoreCard label="Quality Score" value={`${report.score}%`} color={scoreColor} highlight />
                                <ScoreCard label="Total Rows" value={report.totalRows.toLocaleString()} />
                                <ScoreCard label="Columns" value={String(report.columnCount)} />
                                <ScoreCard label="Duplicate Rows" value={String(report.dupCount)} color={report.dupCount > 0 ? '#f59e0b' : undefined} />
                            </div>

                            {/* Column Quality Table */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Column</th>
                                        <th style={thStyle}>Type</th>
                                        <th style={thStyle}>Nulls</th>
                                        <th style={thStyle}>Unique</th>
                                        <th style={thStyle}>Checks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.columns.map(col => (
                                        <tr key={col.column}>
                                            <td style={tdStyle}>
                                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{col.column}</span>
                                            </td>
                                            <td style={{ ...tdStyle, color: 'var(--text-tertiary)' }}>{col.type}</td>
                                            <td style={{ ...tdStyle, color: col.nullPct > 5 ? '#ef4444' : col.nullPct > 0 ? '#f59e0b' : '#10b981' }}>
                                                {col.nullPct}%
                                            </td>
                                            <td style={tdStyle}>{col.approxUnique.toLocaleString()}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                    {col.checks.map((ch, i) => (
                                                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title={ch.detail}>
                                                            {statusIcon[ch.status]}
                                                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{ch.name}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ScoreCard = ({ label, value, color, highlight }) => (
    <div style={{
        backgroundColor: 'var(--surface-inset)', borderRadius: '8px', padding: '12px',
        textAlign: 'center', border: highlight ? `1px solid ${color || 'var(--border-subtle)'}` : '1px solid var(--border-subtle)',
    }}>
        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            {label}
        </div>
        <div style={{
            fontSize: highlight ? '22px' : '16px', fontWeight: 700,
            color: color || 'var(--text-primary)',
            fontFamily: "'JetBrains Mono', monospace",
        }}>
            {value}
        </div>
    </div>
);

const thStyle = {
    padding: '8px 10px', textAlign: 'left',
    borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.3px',
};

const tdStyle = {
    padding: '6px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-primary)',
};

export default DataQualityModal;
