/**
 * RichTooltip — custom Recharts tooltip showing value + delta vs. previous point.
 * Used when config.tooltipMode === 'rich'. Receives the ordered processedData
 * + xAxisKey so it can look up the previous row and compute period-over-period Δ.
 */
import { memo } from 'react';
import { formatNumber } from '../utils/numberFormat';

const RichTooltip = memo(({ active, payload, label, numberFormat, decimalPlaces, processedData, xAxisKey }) => {
    if (!active || !payload || payload.length === 0) return null;

    const fmt = (v) => formatNumber(v, numberFormat, decimalPlaces);
    const idx = processedData ? processedData.findIndex(d => String(d[xAxisKey]) === String(label)) : -1;

    return (
        <div style={{
            background: 'var(--tooltip-bg)', border: '1px solid var(--border-color)',
            borderRadius: '8px', padding: '8px 10px', minWidth: '130px',
            boxShadow: 'var(--shadow-md)',
        }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label}</div>
            {payload.map((entry, i) => {
                const val = Number(entry.value);
                let deltaNode = null;
                if (idx > 0 && processedData) {
                    const prev = Number(processedData[idx - 1][entry.dataKey]);
                    if (!isNaN(prev) && prev !== 0 && !isNaN(val)) {
                        const dpct = ((val - prev) / Math.abs(prev)) * 100;
                        const up = dpct >= 0;
                        deltaNode = (
                            <span style={{
                                color: up ? 'var(--color-success)' : 'var(--color-error)',
                                fontSize: '10px', fontWeight: '600', marginLeft: '6px', whiteSpace: 'nowrap',
                            }}>
                                {up ? '▲' : '▼'} {up ? '+' : ''}{dpct.toFixed(1)}%
                            </span>
                        );
                    }
                }
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{entry.name}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-active)', marginLeft: 'auto' }}>{fmt(val)}</span>
                        {deltaNode}
                    </div>
                );
            })}
        </div>
    );
});

RichTooltip.displayName = 'RichTooltip';

export default RichTooltip;
