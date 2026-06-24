/**
 * Number formatting utilities for chart axes, labels, and tooltips.
 */

/**
 * Format a number according to the specified format type.
 * @param {number} value
 * @param {string} format - 'compact' | 'standard' | 'currency' | 'thousands' | 'millions' | 'billions' | 'percent' | 'raw'
 * @param {number} decimals - -1 for auto, or 0-10
 * @returns {string}
 */
export const formatNumber = (value, format = 'compact', decimals = -1) => {
    if (typeof value !== 'number' || isNaN(value)) return String(value ?? '');

    const maxFrac = decimals >= 0 ? decimals : undefined;

    try {
        switch (format) {
            case 'standard':
                return new Intl.NumberFormat('en-US', {
                    maximumFractionDigits: maxFrac ?? 2
                }).format(value);

            case 'currency':
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: maxFrac ?? 0
                }).format(value);

            case 'thousands':
                return (value / 1000).toFixed(maxFrac ?? 1) + 'k';

            case 'millions':
                return (value / 1000000).toFixed(maxFrac ?? 1) + 'M';

            case 'billions':
                return (value / 1000000000).toFixed(maxFrac ?? 1) + 'B';

            case 'percent':
                return new Intl.NumberFormat('en-US', {
                    style: 'percent',
                    maximumFractionDigits: maxFrac ?? 1
                }).format(value / 100);

            case 'raw':
                return decimals >= 0 ? value.toFixed(decimals) : String(value);

            case 'compact':
            default:
                return new Intl.NumberFormat('en-US', {
                    notation: 'compact',
                    maximumFractionDigits: maxFrac ?? 1
                }).format(value);
        }
    } catch {
        return String(value);
    }
};

/**
 * Create a memoizable formatter function based on format and decimals.
 */
export const createFormatter = (format, decimals = -1) => {
    return (value) => formatNumber(value, format, decimals);
};

/**
 * Format a date label string, keeping YYYY-MM-DD.
 */
export const formatDateLabel = (val) => {
    if (!val) return '';
    const str = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.split('T')[0].split(' ')[0];
    }
    return str;
};

/**
 * Tooltip formatter that optionally appends percentage of total.
 */
export const createTooltipFormatter = (formatFn, showPercent, chartType, yAxisKeys) => {
    return (value, name, props) => {
        let formattedVal = formatFn(value);

        if (showPercent) {
            if (chartType === 'donut' && props?.payload?.percent !== undefined) {
                const pct = (props.payload.percent * 100).toFixed(1);
                formattedVal += ` (${pct}%)`;
            } else if (chartType !== 'donut' && props?.payload) {
                let total = 0;
                yAxisKeys.forEach(key => {
                    total += Number(props.payload[key]) || 0;
                });
                if (total > 0 && typeof value === 'number') {
                    const pct = ((value / total) * 100).toFixed(1);
                    formattedVal += ` (${pct}%)`;
                }
            }
        }
        return [formattedVal, name];
    };
};
