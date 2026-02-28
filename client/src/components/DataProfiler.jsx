import { useMemo } from 'react';
import { LuHash, LuType } from 'react-icons/lu';

/**
 * DataProfiler — Computes and displays statistical profile of query result data.
 * Runs entirely client-side from the data array already in memory.
 */
const DataProfiler = ({ data }) => {
    const profile = useMemo(() => {
        if (!data || data.length === 0) return [];

        const columns = Object.keys(data[0]);
        return columns.map(col => {
            const values = data.map(row => row[col]);
            const total = values.length;

            // Nulls
            const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
            const nullPct = ((nullCount / total) * 100).toFixed(1);

            // Non-null values
            const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');

            // Unique values
            const uniqueSet = new Set(nonNull.map(v => String(v)));
            const uniqueCount = uniqueSet.size;
            const uniquePct = nonNull.length > 0 ? ((uniqueCount / nonNull.length) * 100).toFixed(1) : '0';

            // Detect type
            const sampleNonNull = nonNull.slice(0, 100);
            const isNumeric = sampleNonNull.length > 0 && sampleNonNull.every(v => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''));

            let stats = {
                column: col,
                total,
                nullCount,
                nullPct,
                uniqueCount,
                uniquePct,
                dtype: 'text',
            };

            if (isNumeric) {
                const nums = nonNull.map(v => typeof v === 'number' ? v : Number(v)).filter(n => !isNaN(n));
                stats.dtype = 'numeric';
                if (nums.length > 0) {
                    nums.sort((a, b) => a - b);
                    stats.min = nums[0];
                    stats.max = nums[nums.length - 1];
                    stats.mean = nums.reduce((s, v) => s + v, 0) / nums.length;
                    stats.median = nums.length % 2 === 0
                        ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
                        : nums[Math.floor(nums.length / 2)];
                    const variance = nums.reduce((s, v) => s + Math.pow(v - stats.mean, 2), 0) / nums.length;
                    stats.stddev = Math.sqrt(variance);

                    // Simple histogram (5 bins)
                    const range = stats.max - stats.min;
                    if (range > 0) {
                        const binCount = 5;
                        const binWidth = range / binCount;
                        stats.histogram = Array(binCount).fill(0);
                        nums.forEach(v => {
                            let bin = Math.floor((v - stats.min) / binWidth);
                            if (bin >= binCount) bin = binCount - 1;
                            stats.histogram[bin]++;
                        });
                    }
                }
            } else {
                // Top 5 values for categorical
                const freq = {};
                nonNull.forEach(v => {
                    const key = String(v);
                    freq[key] = (freq[key] || 0) + 1;
                });
                stats.topValues = Object.entries(freq)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([value, count]) => ({ value, count, pct: ((count / nonNull.length) * 100).toFixed(1) }));
            }

            return stats;
        });
    }, [data]);

    if (!data || data.length === 0) {
        return <div style={{ padding: '20px', color: 'var(--text-tertiary)', textAlign: 'center' }}>No data to profile</div>;
    }

    const fmt = (n) => {
        if (n === undefined || n === null) return '—';
        if (typeof n === 'number') {
            if (Number.isInteger(n)) return n.toLocaleString();
            return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        return String(n);
    };

    return (
        <div style={{ padding: '12px', overflow: 'auto', height: '100%' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '10px',
            }}>
                {profile.map(col => (
                    <div key={col.column} className="profiler-card" style={{
                        backgroundColor: 'var(--surface-raised)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}>
                        {/* Column Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '6px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: col.dtype === 'numeric' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: col.dtype === 'numeric' ? '#3b82f6' : '#f59e0b',
                            }}>
                                {col.dtype === 'numeric' ? <LuHash size={13} /> : <LuType size={13} />}
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {col.column}
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {col.dtype}
                                </div>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', fontSize: '11px' }}>
                            <StatCell label="Total" value={fmt(col.total)} />
                            <StatCell label="Nulls" value={`${col.nullCount} (${col.nullPct}%)`}
                                color={parseFloat(col.nullPct) > 20 ? '#ef4444' : undefined} />
                            <StatCell label="Unique" value={`${fmt(col.uniqueCount)} (${col.uniquePct}%)`} />
                        </div>

                        {/* Numeric-specific Stats */}
                        {col.dtype === 'numeric' && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', fontSize: '11px' }}>
                                    <StatCell label="Min" value={fmt(col.min)} />
                                    <StatCell label="Max" value={fmt(col.max)} />
                                    <StatCell label="Mean" value={fmt(col.mean)} />
                                    <StatCell label="Median" value={fmt(col.median)} />
                                </div>

                                {/* Mini Histogram */}
                                {col.histogram && (
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '28px', marginTop: '2px' }}>
                                        {col.histogram.map((count, i) => {
                                            const maxCount = Math.max(...col.histogram);
                                            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                            return (
                                                <div key={i} style={{
                                                    flex: 1,
                                                    height: `${Math.max(height, 4)}%`,
                                                    backgroundColor: 'var(--accent-muted)',
                                                    borderRadius: '2px 2px 0 0',
                                                    transition: 'height 200ms ease',
                                                }}
                                                    title={`${count} values`}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Categorical Top Values */}
                        {col.dtype === 'text' && col.topValues && col.topValues.length > 0 && (
                            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    Top Values
                                </div>
                                {col.topValues.map((tv, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{
                                            flex: 1, height: '4px', borderRadius: '2px',
                                            backgroundColor: 'var(--surface-inset)', overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                height: '100%', width: `${tv.pct}%`,
                                                backgroundColor: 'var(--accent-primary)',
                                                borderRadius: '2px',
                                                opacity: 1 - (i * 0.15),
                                            }} />
                                        </div>
                                        <span style={{
                                            color: 'var(--text-secondary)', maxWidth: '100px',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }} title={tv.value}>
                                            {tv.value}
                                        </span>
                                        <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                            {tv.pct}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const StatCell = ({ label, value, color }) => (
    <div style={{
        backgroundColor: 'var(--surface-inset)',
        borderRadius: '4px',
        padding: '4px 6px',
        textAlign: 'center',
    }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {label}
        </div>
        <div style={{
            color: color || 'var(--text-primary)',
            fontWeight: 500,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
        }}>
            {value}
        </div>
    </div>
);

export default DataProfiler;
