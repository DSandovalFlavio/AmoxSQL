/**
 * AmoxSQL — chart config → native PowerPoint chart mapper
 *
 * Maps a Story Flow chart config (the DEFAULT_CONFIG shape from
 * DataVisualizer/constants.js) to pptxgenjs's chart API, so the exported
 * PowerPoint chart is NATIVE and editable (double-click it in PowerPoint,
 * the underlying data grid opens) instead of a flat image.
 *
 * Scope (documented, not a hidden gap): only the base chart — type, series,
 * category labels, colors, title, legend, data labels — maps natively.
 * AmoxSQL's storytelling overlays (annotations, ref/goal/trend lines,
 * headline KPI, advanced color themes) have no equivalent in pptxgenjs's
 * chart API and are dropped in native mode. Chart types with no native
 * mapping (scatter, bubble, heatmap, treemap, funnel, waterfall) — and any
 * chart where the caller wants pixel-perfect fidelity to those overlays —
 * should render as a PNG image instead (see generatePptxReport.js's
 * per-chart native/image toggle).
 */

// chartType → { pptxType, barDir?, barGrouping? }. Anything absent here has
// no native mapping and must fall back to an image.
const NATIVE_CHART_MAP = {
    'bar': { pptxType: 'bar', barDir: 'col', barGrouping: 'clustered' },
    'bar-stacked': { pptxType: 'bar', barDir: 'col', barGrouping: 'stacked' },
    'bar-100': { pptxType: 'bar', barDir: 'col', barGrouping: 'percentStacked' },
    'bar-horizontal': { pptxType: 'bar', barDir: 'bar', barGrouping: 'clustered' },
    'bar-horizontal-stacked': { pptxType: 'bar', barDir: 'bar', barGrouping: 'stacked' },
    'bar-horizontal-100': { pptxType: 'bar', barDir: 'bar', barGrouping: 'percentStacked' },
    'line': { pptxType: 'line' },
    'area': { pptxType: 'area' },
    'donut': { pptxType: 'doughnut' },
    'pie': { pptxType: 'pie' },
    'combo': { pptxType: 'combo' }, // built specially — see buildComboChartSpec
};

const NUMBER_FORMAT_CODE = {
    percent: '0%',
    currency: '$#,##0',
    thousands: '#,##0,K',
    millions: '#,##0,,M',
    billions: '#,##0,,,B',
    raw: '0',
};

export function isNativeChartType(chartType) {
    return Object.prototype.hasOwnProperty.call(NATIVE_CHART_MAP, chartType);
}

function stripHash(hex) {
    return (hex || '').replace(/^#/, '');
}

function legendPos(position) {
    return { top: 't', bottom: 'b', left: 'l', right: 'r' }[position] || 'b';
}

/**
 * Category-labels + one-series-per-yAxisKey (or per distinct splitByKey
 * value) — the shape pptxgenjs's addChart(type, data, options) expects.
 */
export function buildChartSeriesData(data, config) {
    const { xAxisKey, yAxisKeys = [], splitByKey } = config;
    const labels = data.map((row) => String(row[xAxisKey] ?? ''));

    if (splitByKey && yAxisKeys[0]) {
        const valueKey = yAxisKeys[0];
        const seriesNames = [...new Set(data.map((row) => String(row[splitByKey] ?? '')))];
        return seriesNames.map((seriesName) => ({
            name: seriesName,
            labels,
            values: data.map((row) => (String(row[splitByKey] ?? '') === seriesName ? Number(row[valueKey]) || 0 : 0)),
        }));
    }

    return yAxisKeys.map((key) => ({
        name: key,
        labels,
        values: data.map((row) => Number(row[key]) || 0),
    }));
}

function baseChartOptions(config, colors) {
    const seriesCount = (config.yAxisKeys || []).length + (config.splitByKey ? 1 : 0);
    return {
        showTitle: !!config.chartTitle,
        title: config.chartTitle || '',
        showLegend: (config.legendPosition || 'bottom') !== 'none' && seriesCount > 1,
        legendPos: legendPos(config.legendPosition),
        showValue: !!config.showLabels,
        chartColors: (colors || []).map(stripHash),
        dataLabelFormatCode: NUMBER_FORMAT_CODE[config.numberFormat],
        valAxisLabelFormatCode: NUMBER_FORMAT_CODE[config.numberFormat],
    };
}

/** Simple (non-combo) native chart: one pptxType, one series array. */
export function buildNativeChartSpec(config, data, colors) {
    const mapping = NATIVE_CHART_MAP[config.chartType];
    if (!mapping || mapping.pptxType === 'combo') return null;

    const options = baseChartOptions(config, colors);
    if (mapping.barDir) options.barDir = mapping.barDir;
    if (mapping.barGrouping) options.barGrouping = mapping.barGrouping;

    return { pptxType: mapping.pptxType, data: buildChartSeriesData(data, config), options };
}

/**
 * pptxgenjs only emits a second <c:valAx>/<c:catAx> pair when the SHARED
 * chart options carry an explicit `valAxes`/`catAxes` array of length 2 —
 * per-series `secondaryValAxis: true` alone marks a series as belonging to
 * axis id #2 but never actually defines that axis, so PowerPoint gets a
 * chart XML with a dangling axis reference and silently collapses both
 * series onto the single axis that *is* defined (the same crushed-bars
 * symptom this function exists to avoid). Call this to add the two empty
 * placeholder entries; the axes still inherit format/gridline options from
 * the shared options object itself.
 */
function withSecondaryAxisDeclared(sharedOptions) {
    return { ...sharedOptions, valAxes: [{}, {}], catAxes: [{}, {}] };
}

/**
 * Same chart type on two axes (e.g. a bar chart with a rightYAxisKey mixing
 * revenue and transaction counts) — pptxgenjs only exposes secondaryValAxis
 * per entry of the multi-chart-type array, so this splits yAxisKeys into a
 * left group and a right group, both rendered with the same pptxType, and
 * returns the same {multiSpec, sharedOptions} shape buildComboChartSpec does.
 * Without this split, both groups would land on one shared axis and any
 * series with a much smaller range collapses to near-zero bar height.
 */
function buildDualAxisChartSpec(config, data, colors, mapping) {
    const { xAxisKey, yAxisKeys = [], rightYAxisKey } = config;
    const labels = data.map((row) => String(row[xAxisKey] ?? ''));
    const leftKeys = yAxisKeys.filter((k) => k !== rightYAxisKey);
    const rightKeys = yAxisKeys.filter((k) => k === rightYAxisKey);

    const seriesFor = (keys) => keys.map((key) => ({
        name: key,
        labels,
        values: data.map((row) => Number(row[key]) || 0),
    }));

    const groupOptions = {};
    if (mapping.barDir) groupOptions.barDir = mapping.barDir;
    if (mapping.barGrouping) groupOptions.barGrouping = mapping.barGrouping;

    const multiSpec = [];
    if (leftKeys.length) multiSpec.push({ type: mapping.pptxType, data: seriesFor(leftKeys), options: { ...groupOptions } });
    if (rightKeys.length) {
        multiSpec.push({
            type: mapping.pptxType,
            data: seriesFor(rightKeys),
            options: { ...groupOptions, secondaryValAxis: true, secondaryCatAxis: true },
        });
    }
    const sharedOptions = leftKeys.length && rightKeys.length
        ? withSecondaryAxisDeclared(baseChartOptions(config, colors))
        : baseChartOptions(config, colors);
    return { multiSpec, sharedOptions };
}

/**
 * Combo chart: bar series (yAxisKeys not in comboLineKeys) + line series
 * (comboLineKeys), sharing category labels, via pptxgenjs's documented
 * multi-chart array signature: addChart([{type,data,options}, ...], null, sharedOptions).
 */
export function buildComboChartSpec(config, data, colors) {
    const { xAxisKey, yAxisKeys = [], comboLineKeys = [], rightYAxisKey } = config;
    const labels = data.map((row) => String(row[xAxisKey] ?? ''));
    const barKeys = yAxisKeys.filter((k) => !comboLineKeys.includes(k));
    const lineKeys = yAxisKeys.filter((k) => comboLineKeys.includes(k));

    const seriesFor = (keys) => keys.map((key) => ({
        name: key,
        labels,
        values: data.map((row) => Number(row[key]) || 0),
    }));

    const usesSecondaryAxis = !!(rightYAxisKey && barKeys.length && lineKeys.length);
    const sharedOptions = usesSecondaryAxis
        ? withSecondaryAxisDeclared(baseChartOptions(config, colors))
        : baseChartOptions(config, colors);
    const multiSpec = [];
    if (barKeys.length) multiSpec.push({ type: 'bar', data: seriesFor(barKeys), options: { barGrouping: 'clustered' } });
    if (lineKeys.length) {
        multiSpec.push({
            type: 'line',
            data: seriesFor(lineKeys),
            options: usesSecondaryAxis ? { secondaryValAxis: true, secondaryCatAxis: true } : {},
        });
    }
    return { multiSpec, sharedOptions };
}

/**
 * Single entry point for the three PPTX exporters (single-chart export,
 * Report Flow deck export, notebook export): picks the right spec builder
 * (combo / dual-axis / plain) and returns a uniform
 * { multi: true, multiSpec, sharedOptions } | { multi: false, pptxType, data, options } | null
 * shape so callers don't each re-implement the combo/dual-axis branching.
 */
export function buildNativeSlideChartSpec(config, data, colors) {
    const mapping = NATIVE_CHART_MAP[config.chartType];
    if (!mapping) return null;

    if (config.chartType === 'combo') {
        return { multi: true, ...buildComboChartSpec(config, data, colors) };
    }

    const { yAxisKeys = [], rightYAxisKey, splitByKey } = config;
    const needsDualAxis = rightYAxisKey && !splitByKey && yAxisKeys.length > 1 && yAxisKeys.includes(rightYAxisKey);
    if (needsDualAxis) {
        return { multi: true, ...buildDualAxisChartSpec(config, data, colors, mapping) };
    }

    const spec = buildNativeChartSpec(config, data, colors);
    return spec ? { multi: false, ...spec } : null;
}
