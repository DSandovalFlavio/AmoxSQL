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
        const splitIsDate = isDateColumn(data, splitByKey);

        data.forEach(row => {
            const xVal = getGroupKey(row, xAxisKey, isDate, dateAggregation);
            if (xVal == null) return;

            if (!grouped[xVal]) grouped[xVal] = { [xAxisKey]: xVal };

            const splitVal = splitIsDate ? formatDateLabel(row[splitByKey]) : String(row[splitByKey]);
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
export const computeHeadline = (processedData, yAxisKeys, metric, compareWith, window = 'all') => {
    const VACIO = { value: null, delta: null, deltaPercent: null, compareLabel: null };
    if (!processedData || processedData.length === 0 || yAxisKeys.length === 0) return VACIO;

    const key = yAxisKeys[0];
    const values = processedData.map(d => Number(d[key]) || 0);

    /* La ventana dice cuantos puntos entran en una metrica agregada.
       'all' = toda la serie; un numero = los ultimos N. Es lo que hace posible
       comparar un total contra "el periodo anterior": sin ventana no hay
       periodo anterior que valga, porque ya te has comido todos los datos. */
    const n = window === 'all' ? values.length : Math.min(Number(window) || 0, values.length);
    const actual  = values.slice(values.length - n);
    const previa  = values.slice(Math.max(0, values.length - 2 * n), values.length - n);

    const agregar = (arr) => {
        if (arr.length === 0) return null;
        const suma = arr.reduce((a, b) => a + b, 0);
        return metric === 'average' ? suma / arr.length : suma;
    };

    let mainValue;
    switch (metric) {
        case 'average': mainValue = agregar(actual); break;
        case 'last':    mainValue = values[values.length - 1]; break;
        case 'first':   mainValue = values[0]; break;
        case 'total':
        default:        mainValue = agregar(actual); break;
    }

    /* LA REGLA: la comparacion tiene que ser del mismo TIPO que la metrica.
       Un punto se compara con un punto; una suma, con otra suma del mismo
       tamano. Antes se comparaba el total del periodo contra el primer punto
       de la serie — un total frente a un mes — y salia un +7658 % que no
       significaba nada junto a una conclusion que decia que habia caido.
       Si no hay pareja valida no se inventa una: no hay pastilla. */
    const esAgregada = metric === 'total' || metric === 'average';
    let compareValue = null;
    let compareLabel = null;

    if (metric === 'first') {
        // El primer valor no tiene contra que compararse.
    } else if (esAgregada) {
        if (compareWith === 'previous' && previa.length === n && n > 0) {
            compareValue = agregar(previa);
            compareLabel = `vs. ${n} previos`;
        }
        // 'first' con una metrica agregada es la combinacion invalida: se ignora.
    } else if (metric === 'last') {
        if (compareWith === 'previous' && values.length > 1) {
            compareValue = values[values.length - 2];
            compareLabel = 'vs. anterior';
        } else if (compareWith === 'first' && values.length > 1) {
            compareValue = values[0];
            compareLabel = 'vs. inicio';
        }
    }

    let delta = null, deltaPercent = null;
    if (compareValue !== null && compareValue !== 0 && mainValue !== null) {
        delta = mainValue - compareValue;
        deltaPercent = (delta / Math.abs(compareValue)) * 100;
    } else {
        compareLabel = null;   // sin delta no hay etiqueta que ensenar
    }

    return { value: mainValue, delta, deltaPercent, compareLabel };
};

/**
 * Compute linear trend line points.
 */
export const computeTrendLine = (processedData, xAxisKey, yAxisKeys, type, windowSize = 3) => {
    if (!processedData || processedData.length < 2 || yAxisKeys.length === 0) return [];

    // Trend is computed over the sum of every plotted series at each x. For a
    // single-series chart this is just that series; for a split-by / multi-series
    // chart the pivoted rows no longer carry the original value column, so we must
    // sum the actual series keys (e.g. each region) instead of a missing yAxisKeys[0].
    const keys = Array.isArray(yAxisKeys) ? yAxisKeys : [yAxisKeys];
    const rowValue = (d) => keys.reduce((acc, k) => acc + (Number(d[k]) || 0), 0);
    const values = processedData.map((d, i) => ({ x: i, y: rowValue(d), label: d[xAxisKey] }));

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
