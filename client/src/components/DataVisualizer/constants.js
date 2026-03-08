// ─── Color Palettes ─────────────────────────────────────────
export const COLOR_PALETTES = {
    // AmoxSQL signature palette (inspired by reference images)
    default: ['#9b87f5', '#f87171', '#60a5fa', '#fbbf24', '#34d399', '#f472b6', '#a78bfa', '#fb923c'],
    // Modern data-viz palettes
    vivid: [
        '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#3B3EAC', '#0099C6',
        '#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11',
        '#6633CC', '#E67300', '#8B0707', '#329262', '#5574A6'
    ],
    // Qualitative
    set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'],
    set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    pastel: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
    dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    // Sequential
    blues: ['#084594', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#deebf7', '#f7fbff'],
    greens: ['#005a32', '#238b45', '#41ab5d', '#74c476', '#a1d99b', '#c7e9c0', '#e5f5e0', '#f7fcf5'],
    reds: ['#99000d', '#cb181d', '#ef3b2c', '#fb6a4a', '#fc9272', '#fcbba1', '#fee0d2', '#fff5f0'],
    purples: ['#3f007d', '#54278f', '#6a51a3', '#807dba', '#9e9ac8', '#bcbddc', '#dadaeb', '#f2f0f7'],
    ylorbr: ['#8c2d04', '#cc4c02', '#ec7014', '#fe9929', '#fec44f', '#fee391', '#fff7bc', '#ffffe5'],
    // Diverging
    spectral: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
    rdylbu: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4'],
    rdylgn: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'],
    piyg: ['#c51b7d', '#e9a3c9', '#fde0ef', '#e6f5d0', '#a1d76a', '#4d9221'],
    // Brand-friendly
    ocean: ['#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8'],
    sunset: ['#ff6b6b', '#ee5a24', '#f0932b', '#f9ca24', '#6ab04c', '#22a6b3'],
    corporate: ['#2c3e50', '#34495e', '#7f8c8d', '#95a5a6', '#bdc3c7', '#ecf0f1'],
    neon: ['#ff00ff', '#00ffff', '#ff6600', '#00ff00', '#ff3366', '#6633ff'],
};

// ─── Chart Type Registry ─────────────────────────────────────
// Each type has: key, label, category, icon (SVG path or emoji), supports (features list)
export const CHART_TYPES = [
    // Columns / Bars
    { key: 'bar', label: 'Column', category: 'column', description: 'Vertical bars' },
    { key: 'bar-stacked', label: 'Stacked Column', category: 'column', description: 'Stacked vertically' },
    { key: 'bar-100', label: '100% Stacked', category: 'column', description: 'Proportional stacked' },
    { key: 'bar-horizontal', label: 'Bar', category: 'bar', description: 'Horizontal bars' },
    { key: 'bar-horizontal-stacked', label: 'Stacked Bar', category: 'bar', description: 'Horizontal stacked' },
    { key: 'bar-horizontal-100', label: '100% Stacked Bar', category: 'bar', description: 'Horizontal proportional' },
    // Lines & Areas
    { key: 'line', label: 'Line', category: 'line', description: 'Line series' },
    { key: 'area', label: 'Stacked Area', category: 'line', description: 'Filled area stacked' },
    // Circular
    { key: 'donut', label: 'Donut', category: 'circular', description: 'Donut ring chart' },
    // Scatter
    { key: 'scatter', label: 'Scatter', category: 'scatter', description: 'XY scatter plot' },
    { key: 'bubble', label: 'Bubble', category: 'scatter', description: 'Scatter with size' },
    // Advanced
    { key: 'combo', label: 'Combo', category: 'other', description: 'Bar + Line combined' },
    { key: 'funnel', label: 'Funnel', category: 'other', description: 'Funnel / pipeline' },
    { key: 'heatmap', label: 'Heatmap', category: 'other', description: 'Color intensity matrix' },
];

export const CHART_CATEGORIES = [
    { key: 'column', label: 'Columns' },
    { key: 'bar', label: 'Bars' },
    { key: 'line', label: 'Lines & Areas' },
    { key: 'circular', label: 'Circular' },
    { key: 'scatter', label: 'Scatter' },
    { key: 'other', label: 'Other' },
];

// ─── Export Presets ───────────────────────────────────────────
export const EXPORT_PRESETS = [
    { label: 'PowerPoint 16:9', width: 1920, height: 1080 },
    { label: 'PowerPoint 4:3', width: 1440, height: 1080 },
    { label: 'Square (1:1)', width: 1080, height: 1080 },
    { label: 'Phone Story (9:16)', width: 1080, height: 1920 },
    { label: 'Wide Banner', width: 1200, height: 628 },
];

// ─── Font Options ────────────────────────────────────────────
export const FONT_OPTIONS = [
    { value: 'system', label: 'System Default', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    { value: 'inter', label: 'Inter', family: '"Inter", sans-serif' },
    { value: 'roboto', label: 'Roboto', family: '"Roboto", sans-serif' },
    { value: 'outfit', label: 'Outfit', family: '"Outfit", sans-serif' },
    { value: 'source-sans', label: 'Source Sans Pro', family: '"Source Sans Pro", sans-serif' },
    { value: 'jetbrains', label: 'JetBrains Mono', family: '"JetBrains Mono", monospace' },
    { value: 'poppins', label: 'Poppins', family: '"Poppins", sans-serif' },
];

// ─── Background Tonal Options ────────────────────────────────
export const BACKGROUND_TONES = [
    { value: 'default', label: 'Default (IDE)' },
    { value: 'darker', label: 'Darker' },
    { value: 'lighter', label: 'Lighter' },
    { value: 'warm', label: 'Warm tint' },
    { value: 'cool', label: 'Cool tint' },
    { value: 'custom', label: 'Custom color' },
];

// ─── Number Format Options ───────────────────────────────────
export const NUMBER_FORMAT_OPTIONS = [
    { value: 'compact', label: 'Auto (Compact — 1.2k)' },
    { value: 'standard', label: 'Standard (1,234.56)' },
    { value: 'currency', label: 'Currency ($1,234)' },
    { value: 'thousands', label: 'Thousands (1.2k)' },
    { value: 'millions', label: 'Millions (1.2M)' },
    { value: 'billions', label: 'Billions (1.2B)' },
    { value: 'percent', label: 'Percentage (45.2%)' },
    { value: 'raw', label: 'Raw (1234.56)' },
];

// ─── Default Chart Config ────────────────────────────────────
export const DEFAULT_CONFIG = {
    // Core
    chartType: 'bar',
    xAxisKey: '',
    yAxisKeys: [],
    rightYAxisKey: '',
    splitByKey: '',
    bubbleSizeKey: '',

    // Data processing
    dateAggregation: 'none',
    sortMode: 'x-asc',
    limit: 50,

    // Labels & Tooltips
    showLabels: false,
    dataLabelPosition: 'top',
    dataLabelSize: 11,
    dataLabelMinSpace: 30,
    tooltipShowPercent: false,
    showPercentages: false,

    // Colors & Theme
    colorTheme: 'default',
    backgroundTone: 'default',
    customBgColor: '',
    borderStyle: 'none',
    borderColor: '',
    fontFamily: 'system',
    textScale: 1,

    // Number format
    numberFormat: 'compact',
    decimalPlaces: -1, // -1 = auto

    // Grid & Axes
    gridMode: 'horizontal',
    showAxisLines: true,
    yLogScale: false,
    yAxisDomain: ['auto', 'auto'],
    yAxisPosition: 'left',
    showXAxisTitle: true,
    showYAxisTitle: true,
    customAxisTitles: { x: '', y: '' },
    xAxisLabelAngle: 0,

    // Line specific
    lineType: 'monotone',
    lineAreaFill: false,
    showDots: true,
    isCumulative: false,

    // Bar specific
    barStackMode: 'none',
    barRadius: 4,
    barColorMode: 'series',

    // Donut specific
    donutThickness: 60,
    donutLabelContent: 'name_percent',
    donutLabelPosition: 'outside',
    donutGroupingThreshold: 0,
    donutCenterKpi: 'none',

    // Scatter specific
    scatterQuadrants: false,

    // Combo specific
    comboLineKeys: [],

    // Highlight
    highlightConfig: { type: 'none', value: '', color: '#ff0000' },

    // Series colors/styles
    seriesConfig: {},

    // Legend
    legendPosition: 'bottom',

    // Storytelling
    chartTitle: '',
    chartSubtitle: '',
    chartFootnote: '',
    textAlign: 'left',

    // Reference elements
    refLine: { value: '', label: '', color: '#ff4444', style: 'dashed' },
    refArea: { x1: '', x2: '', y1: '', y2: '', color: '#ffffff', opacity: 0.1 },

    // Goal line
    goalLine: { enabled: false, value: '', label: 'Goal', color: '#22c55e', style: 'dashed' },

    // Trend line
    trendLine: { type: 'none', color: '#fbbf24', windowSize: 3 }, // none, linear, moving-average

    // Headline number
    headline: { visible: false, metric: 'total', compareWith: 'none', size: 'auto', customSize: 28 },

    // Margins & Spacing
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 20,
    marginRight: 30,
    titleSpacing: 10,
};
