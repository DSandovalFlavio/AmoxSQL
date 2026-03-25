import { useState, useEffect } from 'react';
import { LuHash, LuType, LuLoader, LuMaximize, LuMinimize, LuTriangleAlert, LuInfo, LuCircleCheck } from 'react-icons/lu';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

/**
 * DataProfiler V2 — Advanced Automated Exploratory Data Analysis (EDA)
 * Equivalent to Pandas Profiling/YData Profiling, powered natively by DuckDB.
 */
const DataProfiler = ({ data, isActive, query }) => {
    const [profile, setProfile] = useState([]);
    const [globalStats, setGlobalStats] = useState(null);
    const [correlations, setCorrelations] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [isCalculating, setIsCalculating] = useState(false);
    const [processedQueryRef, setProcessedQueryRef] = useState(null);
    const [isFullScreen, setIsFullScreen] = useState(false);

    useEffect(() => {
        if (isActive && processedQueryRef !== query) {
            if (!query || !data || data.length === 0) {
                setProfile([]);
                setGlobalStats(null);
                setCorrelations([]);
                setAlerts([]);
                setProcessedQueryRef(query);
                return;
            }

            const fetchProfile = async () => {
                setIsCalculating(true);
                try {
                    const res = await fetch(`http://localhost:3001/api/profile`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query })
                    });
                    const result = await res.json();

                    if (result.profile && Array.isArray(result.profile)) {
                        const totalRows = result.global?.totalRows || data.length;

                        const mappedProfile = result.profile.map(col => {
                            const isNumeric = ['INTEGER', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'HUGEINT', 'TINYINT', 'SMALLINT'].some(t => col.column_type.toUpperCase().includes(t));
                            const colName = col.column_name;
                            const adv = result.advanced || {};

                            return {
                                column: colName,
                                total: totalRows,
                                nullCount: Math.round((parseFloat(col.null_percentage) / 100) * totalRows),
                                nullPct: parseFloat(col.null_percentage).toFixed(1),
                                uniqueCount: isNaN(parseInt(col.approx_unique)) ? 0 : parseInt(col.approx_unique),
                                uniquePct: totalRows > 0 ? ((col.approx_unique / totalRows) * 100).toFixed(1) : '0',
                                dtype: isNumeric ? 'numeric' : 'text',

                                // Advanced Numerics
                                min: col.min,
                                max: col.max,
                                mean: col.avg !== null ? parseFloat(col.avg) : null,
                                median: col.q50 !== null ? parseFloat(col.q50) : null,
                                stddev: col.std !== null ? parseFloat(col.std) : null,
                                skewness: adv[`${colName}_skewness`] !== undefined ? parseFloat(adv[`${colName}_skewness`]) : null,
                                kurtosis: adv[`${colName}_kurtosis`] !== undefined ? parseFloat(adv[`${colName}_kurtosis`]) : null,
                                zeros: adv[`${colName}_zeros`] !== undefined ? parseInt(adv[`${colName}_zeros`]) : 0,
                                negatives: adv[`${colName}_negatives`] !== undefined ? parseInt(adv[`${colName}_negatives`]) : 0,

                                // Advanced Text
                                maxLength: adv[`${colName}_max_length`] !== undefined ? parseInt(adv[`${colName}_max_length`]) : null,
                                minLength: adv[`${colName}_min_length`] !== undefined ? parseInt(adv[`${colName}_min_length`]) : null,
                                avgLength: adv[`${colName}_avg_length`] !== undefined ? parseFloat(adv[`${colName}_avg_length`]) : null,

                                // Visuals bindings
                                histogram: result.visuals?.[colName]?.type === 'histogram' ? result.visuals[colName].data : undefined,
                                topValues: result.visuals?.[colName]?.type === 'top' ? result.visuals[colName].data.map(tv => ({
                                    value: tv.value,
                                    count: tv.count,
                                    pct: totalRows > 0 ? ((tv.count / totalRows) * 100).toFixed(1) : '0'
                                })) : undefined,
                            };
                        });

                        setProfile(mappedProfile);
                        setGlobalStats({
                            totalRows: result.global?.totalRows || 0,
                            duplicateRows: result.global?.duplicateRows || 0,
                            cols: mappedProfile.length
                        });
                        setCorrelations(result.correlations || []);

                        // Generate Alerts
                        let newAlerts = [];
                        if (result.global?.duplicateRows > 0) {
                            newAlerts.push({ type: 'danger', msg: `Dataset contains ${result.global.duplicateRows.toLocaleString()} exact duplicate rows.` });
                        }

                        mappedProfile.forEach(col => {
                            const nullPctFloat = parseFloat(col.nullPct);
                            if (nullPctFloat >= 95) newAlerts.push({ type: 'danger', msg: `Column "${col.column}" is almost entirely empty (${col.nullPct}% missing).` });
                            else if (nullPctFloat > 50) newAlerts.push({ type: 'warning', msg: `Column "${col.column}" has high missing values (${col.nullPct}%).` });

                            if (col.uniqueCount === 1) newAlerts.push({ type: 'warning', msg: `Column "${col.column}" has a constant single value.` });

                            if (col.dtype === 'text' && col.uniqueCount > 0 && col.total > 100) {
                                const uniquePctf = parseFloat(col.uniquePct);
                                if (uniquePctf > 90 && uniquePctf < 100) newAlerts.push({ type: 'info', msg: `Column "${col.column}" has high cardinality (${col.uniquePct}% unique).` });
                            }

                            if (col.dtype === 'numeric' && col.zeros > 0) {
                                const zeroPct = ((col.zeros / col.total) * 100);
                                if (zeroPct > 50) newAlerts.push({ type: 'info', msg: `Column "${col.column}" contains ${zeroPct.toFixed(1)}% zeroes.` });
                            }

                            if (col.dtype === 'numeric' && col.skewness !== null && Math.abs(col.skewness) > 3) {
                                newAlerts.push({ type: 'info', msg: `Column "${col.column}" is highly skewed (Skew: ${col.skewness.toFixed(2)}).` });
                            }
                        });

                        // Check high correlation pairs
                        (result.correlations || []).forEach(pair => {
                            if (Math.abs(pair.score) > 0.95 && Math.abs(pair.score) !== 1) {
                                newAlerts.push({ type: 'warning', msg: `Variables "${pair.col1}" and "${pair.col2}" are highly correlated (${pair.score.toFixed(3)}).` });
                            }
                        });

                        setAlerts(newAlerts);

                    } else {
                        setProfile([]);
                    }
                } catch (err) {
                    console.error("DuckDB Profiler Error:", err);
                    setProfile([]);
                }

                setIsCalculating(false);
                setProcessedQueryRef(query);
            };

            fetchProfile();
        }
    }, [isActive, query, processedQueryRef, data]);

    if (!data || data.length === 0) {
        return <div style={{ padding: '20px', color: 'var(--text-tertiary)', textAlign: 'center' }}>No data to profile</div>;
    }

    if (isCalculating || !processedQueryRef) {
        return (
            <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', height: '100%' }}>
                <LuLoader size={24} className="dbt-spin" style={{ marginBottom: '12px', color: 'var(--accent-primary)' }} />
                <span>Running Complete EDA Analysis...</span>
            </div>
        );
    }

    const fmt = (n) => {
        if (n === undefined || n === null) return '—';
        if (typeof n === 'number') {
            if (Number.isInteger(n)) return n.toLocaleString();
            return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
        }
        return String(n);
    };

    const containerStyle = isFullScreen ? {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'var(--bg-color)',
        zIndex: 9999,
        padding: '24px 40px',
        overflowY: 'auto',
    } : {
        padding: '20px',
        overflowY: 'auto',
        height: '100%'
    };

    return (
        <div style={containerStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', color: 'var(--text-active)' }}>Data Profiling Report</h2>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Automated Exploratory Data Analysis powered by AmoxSQL</span>
                </div>
                <button
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    style={{
                        padding: '6px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                        color: 'var(--text-active)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                        fontSize: '12px', fontWeight: 600, transition: 'var(--transition-fast)'
                    }}
                >
                    {isFullScreen ? <LuMinimize size={14} /> : <LuMaximize size={14} />}
                    {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
                </button>
            </div>

            {/* OVERVIEW SECTION */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '30px' }}>
                <div style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
                    <h3 style={{ fontSize: '14px', margin: '0 0 16px 0', color: 'var(--text-active)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>Dataset Overview</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <OverviewStat label="Number of Variables" value={globalStats?.cols || 0} />
                        <OverviewStat label="Number of Observations" value={fmt(globalStats?.totalRows)} />
                        <OverviewStat label="Missing Cells (%)" value={`${(profile.reduce((acc, col) => acc + parseFloat(col.nullPct), 0) / (profile.length || 1)).toFixed(1)}%`} />
                        <OverviewStat label="Duplicate Rows" value={fmt(globalStats?.duplicateRows)} color={globalStats?.duplicateRows > 0 ? 'var(--color-error)' : undefined} />
                    </div>
                </div>

                {/* ALERTS SECTION */}
                <div style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                    <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', color: 'var(--text-active)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        Alerts & Warnings
                        <span style={{ fontSize: '11px', backgroundColor: 'var(--accent-muted)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '12px' }}>{alerts.length} found</span>
                    </h3>
                    {alerts.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '13px', paddingTop: '10px' }}>
                            <LuCircleCheck size={16} color="var(--color-success)" /> No severe data quality issues detected.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {alerts.map((al, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', padding: '8px', backgroundColor: 'var(--bg-color)', borderRadius: '6px', borderLeft: `3px solid ${al.type === 'danger' ? 'var(--color-error)' : al.type === 'warning' ? 'var(--color-warning)' : 'var(--color-info)'}` }}>
                                    {al.type === 'danger' ? <LuTriangleAlert size={15} color="var(--color-error)" style={{ marginTop: '2px' }} /> : <LuInfo size={15} color={al.type === 'warning' ? 'var(--color-warning)' : 'var(--color-info)'} style={{ marginTop: '2px' }} />}
                                    <span style={{ color: 'var(--text-secondary)' }}>{al.msg}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* VARIABLES SECTION */}
            <h3 style={{ fontSize: '16px', margin: '0 0 16px 0', color: 'var(--text-active)' }}>Variables</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }}>
                {profile.map(col => (
                    <div key={col.column} style={{
                        backgroundColor: 'var(--surface-raised)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'border-color var(--transition-fast)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        overflow: 'hidden'
                    }}>
                        {/* 1. Header & Quick Identity KPIs */}
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border-subtle)',
                            backgroundColor: 'var(--bg-color)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '16px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    backgroundColor: col.dtype === 'numeric' ? 'color-mix(in srgb, var(--color-info) 12%, transparent)' : 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
                                    color: col.dtype === 'numeric' ? 'var(--color-info)' : 'var(--color-warning)',
                                    flexShrink: 0,
                                }}>
                                    {col.dtype === 'numeric' ? <LuHash size={16} /> : <LuType size={16} />}
                                </div>
                                <div>
                                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{col.column}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>{col.dtype}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                                <MiniStat label="Distinct" value={`${fmt(col.uniqueCount)} (${col.uniquePct}%)`} />
                                <MiniStat label="Missing" value={`${fmt(col.nullCount)} (${col.nullPct}%)`} color={parseFloat(col.nullPct) > 20 ? 'var(--color-error)' : undefined} />
                                {col.dtype === 'numeric' && (
                                    <>
                                        <MiniStat label="Zeros" value={`${fmt(col.zeros)} (${(col.zeros / col.total * 100).toFixed(1)}%)`} />
                                        <MiniStat label="Negatives" value={fmt(col.negatives)} />
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 2. Visualizations & Deep Stats Body */}
                        <div style={{
                            padding: '24px',
                            display: 'grid',
                            gridTemplateColumns: isFullScreen ? '2fr 1fr' : '1.5fr 1fr',
                            gap: '40px',
                            alignItems: 'start'
                        }}>

                            {/* Left Side: The Chart */}
                            <div style={{ minWidth: '0' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-active)', marginBottom: '16px' }}>
                                    {col.dtype === 'numeric' ? 'Value Distribution' : 'Top Frequencies'}
                                </div>

                                {col.dtype === 'numeric' ? (
                                    col.histogram && (
                                        <div style={{ height: '200px', width: '100%', minWidth: '200px' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={col.histogram.map((count, i) => ({ name: `Bin ${i + 1}`, count: Number(count) }))} margin={{ top: 10, right: 5, bottom: 5, left: -20 }}>
                                                    <XAxis dataKey="name" hide />
                                                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} axisLine={false} tickLine={false} />
                                                    <Tooltip cursor={{ fill: 'var(--surface-inset)' }} contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12px', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
                                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                                                        {col.histogram.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill="#3b82f6" fillOpacity={0.8} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )
                                ) : (
                                    <div style={{ height: '200px', width: '100%', minWidth: '250px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={(col.topValues || []).slice(0, 5).map(tv => ({ name: String(tv.value) || '(empty)', count: Number(tv.count), pct: tv.pct }))} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 10 }}>
                                                <XAxis type="number" hide />
                                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={(val) => val.length > 15 ? val.substring(0, 13) + '...' : val} />
                                                <Tooltip cursor={{ fill: 'var(--surface-inset)' }} contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12px', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} formatter={(value, name, props) => [`${value} (${props.payload.pct}%)`, 'Count']} />
                                                <Bar dataKey="count" fill="var(--accent-primary)" radius={[0, 4, 4, 0]} barSize={20} label={{ position: 'right', fill: 'var(--text-tertiary)', fontSize: 10, offset: 12, formatter: (val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val }}>
                                                    {(col.topValues || []).slice(0, 5).map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill="var(--accent-primary)" fillOpacity={1 - (index * 0.15)} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>

                            {/* Right Side: Descriptive Statistics Grid */}
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-active)', marginBottom: '16px' }}>Descriptive Statistics</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                                    {col.dtype === 'numeric' ? (
                                        <>
                                            <StatBlock label="Minimum" value={fmt(col.min)} />
                                            <StatBlock label="Maximum" value={fmt(col.max)} />
                                            <StatBlock label="Mean" value={fmt(col.mean)} />
                                            <StatBlock label="Median" value={fmt(col.median)} />
                                            <StatBlock label="Std Deviation" value={fmt(col.stddev)} />
                                            {isFullScreen && (
                                                <>
                                                    <StatBlock label="Skewness" value={fmt(col.skewness)} />
                                                    <StatBlock label="Kurtosis" value={fmt(col.kurtosis)} />
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <StatBlock label="Min Length" value={fmt(col.minLength)} />
                                            <StatBlock label="Max Length" value={fmt(col.maxLength)} />
                                            <StatBlock label="Mean Length" value={fmt(col.avgLength)} />
                                        </>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                ))}
            </div>

            {/* CORRELATION MATRIX */}
            {correlations && correlations.length > 0 && (
                <div style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)', borderRadius: '10px', overflow: 'hidden', marginBottom: '40px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-color)' }}>
                        <h3 style={{ fontSize: '15px', margin: 0, color: 'var(--text-active)' }}>Numeric Correlations (Pearson)</h3>
                    </div>
                    <div style={{ overflowX: 'auto', padding: '24px' }}>
                        <CorrelationHeatmap correlations={correlations} variables={profile.filter(p => p.dtype === 'numeric').map(p => p.column)} />
                    </div>
                </div>
            )}
        </div>
    );
};

const OverviewStat = ({ label, value, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: '18px', fontWeight: 600, color: color || 'var(--text-active)' }}>{value}</span>
    </div>
);

const MiniStat = ({ label, value, color }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: color || 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
);

const StatBlock = ({ label, value }) => (
    <div style={{ padding: '12px 16px', backgroundColor: 'var(--surface-inset)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>{value}</div>
    </div>
);

const CorrelationHeatmap = ({ correlations, variables }) => {
    // Generate an NxN grid
    const size = variables.length;

    // Create matrix lookup
    const matrix = {};
    variables.forEach(v1 => {
        matrix[v1] = {};
        variables.forEach(v2 => {
            if (v1 === v2) matrix[v1][v2] = 1.0;
            else matrix[v1][v2] = 0;
        });
    });

    // Populate from pairs
    correlations.forEach(pair => {
        if (matrix[pair.col1] && matrix[pair.col1][pair.col2] !== undefined) {
            matrix[pair.col1][pair.col2] = pair.score;
            matrix[pair.col2][pair.col1] = pair.score; // Symmetric
        }
    });

    const getColorParams = (val) => {
        // Red = -1, White/Transparent = 0, Blue = 1
        // Very basic heatmap color assignment
        if (isNaN(val)) return 'transparent';
        if (val > 0) {
            return `rgba(59, 130, 246, ${val})`; // Blue
        } else {
            return `rgba(239, 68, 68, ${Math.abs(val)})`; // Red
        }
    };

    return (
        <table style={{ borderSpacing: 0, borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
                <tr>
                    <th style={{ padding: '8px 12px' }}></th>
                    {variables.map(v => (
                        <th key={v} style={{
                            padding: '8px 12px', fontWeight: 500, color: 'var(--text-secondary)',
                            minWidth: '60px', writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                            textAlign: 'left'
                        }} title={v}>
                            <div style={{ width: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxHeight: '100px' }}>{v}</div>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {variables.map(v1 => (
                    <tr key={v1}>
                        <td style={{ padding: '8px 12px', fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'right', whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v1}>
                            {v1}
                        </td>
                        {variables.map(v2 => {
                            const val = matrix[v1][v2];
                            const isAuto = val === 1.0;
                            return (
                                <td key={`${v1}-${v2}`} style={{
                                    padding: '0',
                                    width: '40px',
                                    height: '40px',
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <div style={{
                                        width: '100%', height: '100%',
                                        backgroundColor: getColorParams(val),
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: isAuto ? 'var(--text-tertiary)' : (Math.abs(val) > 0.5 ? '#fff' : 'var(--text-primary)'),
                                        fontWeight: 600,
                                        fontSize: '10px'
                                    }} title={`${v1} x ${v2}: ${val.toFixed(3)}`}>
                                        {isAuto ? '-' : val.toFixed(2)}
                                    </div>
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default DataProfiler;
