/**
 * HeadlineOverlay — Large KPI number displayed above the chart.
 */
import { memo } from 'react';
import { formatNumber } from '../utils/numberFormat';

const HeadlineOverlay = memo(({ headline, headlineData, numberFormat, decimalPlaces, textScale, textAlign }) => {
    if (!headline.visible || headlineData.value === null) return null;

    const size = headline.size === 'custom'
        ? headline.customSize
        : Math.max(24, Math.round(32 * textScale));

    const fmt = (v) => formatNumber(v, numberFormat, decimalPlaces);

    const deltaColor = headlineData.delta > 0 ? 'var(--color-success)' : headlineData.delta < 0 ? 'var(--color-error)' : 'var(--text-muted)';
    const deltaIcon = headlineData.delta > 0 ? '▲' : headlineData.delta < 0 ? '▼' : '●';

    return (
        <div style={{
            textAlign: textAlign || 'left',
            padding: textAlign === 'left' ? '0 0 8px 50px' : '0 0 8px 0',
        }}>
            <div style={{
                fontSize: `${size}px`,
                fontWeight: '700',
                color: 'var(--text-active)',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
            }}>
                {fmt(headlineData.value)}
            </div>
            {/* La pastilla solo aparece si computeHeadline encontro una pareja
                VALIDA (metrica y comparacion del mismo tipo), y entonces dice
                siempre contra que compara. Sin esa etiqueta un "+7658 %" se
                puede leer como cualquier cosa — que es justo lo que pasaba. */}
            {headlineData.deltaPercent !== null && headlineData.compareLabel && (
                <div style={{
                    display: 'inline-flex', alignItems: 'baseline', gap: '4px',
                    marginTop: '4px', fontSize: `${Math.round(12 * textScale)}px`,
                    color: deltaColor, fontWeight: '600', flexWrap: 'wrap',
                }}>
                    <span>{deltaIcon}</span>
                    <span>{headlineData.deltaPercent >= 0 ? '+' : ''}{headlineData.deltaPercent.toFixed(1)}%</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: '400', marginLeft: '4px' }}>
                        ({fmt(Math.abs(headlineData.delta))}) {headlineData.compareLabel}
                    </span>
                </div>
            )}
        </div>
    );
});

HeadlineOverlay.displayName = 'HeadlineOverlay';

export default HeadlineOverlay;
