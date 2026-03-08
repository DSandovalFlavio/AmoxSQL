/**
 * Data processing pipeline for chart data:
 * grouping, aggregation, pivot, sorting, cumulative, and limiting.
 */

import { formatDateLabel } from './numberFormat';

/**
 * Detect if a column contains date-like strings.
 */
export const isDateColumn = (data, columnKey) => {
    if (!columnKey || !data || data.length === 0) return false;
    const val = data.find(r => r[columnKey] != null)?.[columnKey];
    if (typeof val !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}/.test(val);
};

/**
 * Get the group key for a row, optionally aggregating dates.
 */
const getGroupKey = (row, xAxisKey, isDate, dateAggregation) => {
    let key = row[xAxisKey];
    if (key == null) return null;
    if (isDate) {
        if (dateAggregation === 'month') return String(key).substring(0, 7);
        if (dateAggregation === 'year') return String(key).substring(0, 4);
        return formatDateLabel(key);
    }
    return key;
};

/**
 * Main data processing function. Returns { processedData, finalSeriesKeys }.
 */
export const processChartData = ({
    data,
    xAxisKey,
    yAxisKeys,
    splitByKey,
    isDate,
    dateAggregation,
    bubbleSizeKey,
    chartType,
    isCumulative,
    sortMode,
    limit,
}) => {
    if (!data || data.length === 0) return { processedData: [], finalSeriesKeys: [] };

    let result = [];
    let seriesKeys = [];
    const grouped = {};

    // ── 1. GROUP & AGGREGATE ────────────────────
    if (splitByKey && yAxisKeys.length > 0) {
        const valueCol = yAxisKeys[0];
        const uniqueSeries = new Set();

        data.forEach(row => {
            const xVal = getGroupKey(row, xAxisKey, isDate, dateAggregation);
            if (xVal == null) return;

            if (!grouped[xVal]) grouped[xVal] = { [xAxisKey]: xVal };

            const splitVal = String(row[splitByKey]);
            uniqueSeries.add(splitVal);

            const numericVal = Number(row[valueCol]) || 0;
            grouped[xVal][splitVal] = (grouped[xVal][splitVal] || 0) + numericVal;

            if (bubbleSizeKey) {
                const sizeVal = Number(row[bubbleSizeKey]) || 0;
                grouped[xVal][`${splitVal}_size`] = (grouped[xVal][`${splitVal}_size`] || 0) + sizeVal;
            }
        });
        seriesKeys = Array.from(uniqueSeries).sort();
        result = Object.values(grouped);
    } else {
        seriesKeys = [...yAxisKeys];

        data.forEach(row => {
            const xVal = getGroupKey(row, xAxisKey, isDate, dateAggregation);
            if (xVal == null) return;

            if (!grouped[xVal]) {
                grouped[xVal] = { [xAxisKey]: xVal };
                seriesKeys.forEach(k => grouped[xVal][k] = 0);
                if (bubbleSizeKey) grouped[xVal][bubbleSizeKey] = 0;
            }

            seriesKeys.forEach(k => {
                const val = Number(row[k]);
                if (!isNaN(val)) grouped[xVal][k] += val;
            });
            if (bubbleSizeKey) {
                const sVal = Number(row[bubbleSizeKey]);
                if (!isNaN(sVal)) grouped[xVal][bubbleSizeKey] += sVal;
            }
        });
        result = Object.values(grouped);
    }

    // ── 2. SORT ─────────────────────────────────
    const getSumY = (row) => seriesKeys.reduce((acc, k) => acc + (Number(row[k]) || 0), 0);

    result.sort((a, b) => {
        const valA_X = a[xAxisKey];
        const valB_X = b[xAxisKey];
        const valA_Y = getSumY(a);
        const valB_Y = getSumY(b);

        switch (sortMode) {
            case 'x-asc':
                if (typeof valA_X === 'number' && typeof valB_X === 'number') return valA_X - valB_X;
                return String(valA_X).localeCompare(String(valB_X));
            case 'x-desc':
                if (typeof valA_X === 'number' && typeof valB_X === 'number') return valB_X - valA_X;
                return String(valB_X).localeCompare(String(valA_X));
            case 'y-asc':
                return valA_Y - valB_Y;
            case 'y-desc':
                return valB_Y - valA_Y;
            default:
                return 0;
        }
    });

    // ── 3. CUMULATIVE ───────────────────────────
    if (isCumulative && (chartType === 'line' || chartType === 'area')) {
        const runningTotals = {};
        seriesKeys.forEach(k => runningTotals[k] = 0);

        result = result.map(row => {
            const newRow = { ...row };
            seriesKeys.forEach(k => {
                runningTotals[k] += Number(row[k]) || 0;
                newRow[k] = runningTotals[k];
            });
            return newRow;
        });
    }

    // ── 4. LIMIT ────────────────────────────────
    if (limit > 0 && result.length > limit) {
        result = result.slice(0, Number(limit));
    }

    return { processedData: result, finalSeriesKeys: seriesKeys };
};

/**
 * Process donut data — group small slices into "Others".
 */
export const processDonutData = (processedData, yAxisKeys, xAxisKey, groupingThreshold) => {
    if (!processedData || processedData.length === 0) return processedData;

    const dataKey = yAxisKeys[0];
    if (!dataKey) return processedData;

    const total = processedData.reduce((sum, item) => sum + (Number(item[dataKey]) || 0), 0);
    if (total === 0) return processedData;

    const threshold = Number(groupingThreshold) || 0;
    if (threshold <= 0) return processedData;

    const keep = [];
    let othersSum = 0;

    processedData.forEach(item => {
        const val = Number(item[dataKey]) || 0;
        const percent = (val / total) * 100;
        if (percent >= threshold) {
            keep.push(item);
        } else {
            othersSum += val;
        }
    });

    if (othersSum > 0) {
        const othersItem = { ...processedData[0] };
        othersItem[xAxisKey] = 'Others';
        othersItem[dataKey] = othersSum;
        keep.push(othersItem);
    }

    return keep;
};

/**
 * Compute headline KPI values.
 */
export const computeHeadline = (processedData, yAxisKeys, metric, compareWith) => {
    if (!processedData || processedData.length === 0 || yAxisKeys.length === 0) {
        return { value: null, delta: null, deltaPercent: null };
    }

    const key = yAxisKeys[0];
    const values = processedData.map(d => Number(d[key]) || 0);

    let mainValue;
    switch (metric) {
        case 'total':
            mainValue = values.reduce((a, b) => a + b, 0);
            break;
        case 'average':
            mainValue = values.reduce((a, b) => a + b, 0) / values.length;
            break;
        case 'last':
            mainValue = values[values.length - 1];
            break;
        case 'first':
            mainValue = values[0];
            break;
        default:
            mainValue = values.reduce((a, b) => a + b, 0);
    }

    let compareValue = null;
    if (compareWith === 'first' && values.length > 0) {
        compareValue = values[0];
    } else if (compareWith === 'previous' && values.length > 1) {
        compareValue = values[values.length - 2];
    }

    let delta = null;
    let deltaPercent = null;
    if (compareValue !== null && compareValue !== 0) {
        delta = mainValue - compareValue;
        deltaPercent = ((delta / Math.abs(compareValue)) * 100);
    }

    return { value: mainValue, delta, deltaPercent };
};

/**
 * Compute linear trend line points.
 */
export const computeTrendLine = (processedData, xAxisKey, yAxisKeys, type, windowSize = 3) => {
    if (!processedData || processedData.length < 2 || yAxisKeys.length === 0) return [];

    const key = yAxisKeys[0];
    const values = processedData.map((d, i) => ({ x: i, y: Number(d[key]) || 0, label: d[xAxisKey] }));

    if (type === 'linear') {
        // Simple linear regression
        const n = values.length;
        const sumX = values.reduce((a, v) => a + v.x, 0);
        const sumY = values.reduce((a, v) => a + v.y, 0);
        const sumXY = values.reduce((a, v) => a + v.x * v.y, 0);
        const sumX2 = values.reduce((a, v) => a + v.x * v.x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return processedData.map((d, i) => ({
            [xAxisKey]: d[xAxisKey],
            trend: slope * i + intercept
        }));
    }

    if (type === 'moving-average') {
        const window = Math.max(2, Math.min(windowSize, processedData.length));
        return processedData.map((d, i) => {
            if (i < window - 1) return { [xAxisKey]: d[xAxisKey], trend: null };
            const slice = values.slice(i - window + 1, i + 1);
            const avg = slice.reduce((a, v) => a + v.y, 0) / window;
            return { [xAxisKey]: d[xAxisKey], trend: avg };
        });
    }

    return [];
};
