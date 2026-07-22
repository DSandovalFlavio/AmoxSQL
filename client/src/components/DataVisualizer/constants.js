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
    // Sterling — editorial palette system from Sterling (MIT) © La Matemaga
    // https://github.com/LaMatemaga/sterling
    // Eight named categoricals (Violet, Teal, Orchid, Amber, Blue, Coral, Moss,
    // Payne), calibrated per surface: `sterling` for light chart backgrounds,
    // `sterlingDark` for dark ones. Ramps preserve Sterling's semantics: the
    // diverging scale reads violet=positive <-> teal=negative.
    sterling: ['#9A79E7', '#25A08D', '#D45AC7', '#E4A43A', '#5A83D7', '#E87864', '#96AB51', '#536B78'],
    sterlingDark: ['#B69AF2', '#5EC9AE', '#E88BDD', '#F2C46D', '#86A8E8', '#F29A88', '#B7C974', '#B7C8D1'],
    sterlingSequential: ['#4D357A', '#563C87', '#684AA1', '#7B59BC', '#8E68D8', '#9A79E7', '#A889ED', '#B69AF2', '#D5C3F6', '#F1ECFA'],
    sterlingDiverging: ['#4D357A', '#7B59BC', '#9A79E7', '#B69AF2', '#F1ECFA', '#F6F3FB', '#E4F4EF', '#5EC9AE', '#25A08D', '#1E796C', '#164D47'],
    sterlingHeat: ['#4D357A', '#684AA1', '#4666AF', '#4F73C6', '#218C7C', '#4E9670', '#879347', '#B0953A', '#D39A32', '#E4B85C', '#F5DEA0'],
};

// ─── Legend text twins ──────────────────────────────────────
// Sterling's key legibility idea (MIT © La Matemaga): a mark color and the TEXT
// that labels it are not the same color. Each categorical has a hue-matched twin
// — darkened for light surfaces, lightened for dark ones — so legend labels read
// as TEXT (>= 4.5:1 against the chart surface), not as a mark tone tuned for area.
//
// The `sterling`/`sterlingDark` twins are La Matemaga's own hand-designed legend
// values. The rest were generated once (scripts/gen_twins — OKLCH lightness walk
// keeping hue, chroma nudged so darkened tones don't go muddy) targeting 4.5:1
// against a light paper (#f6f3fb) and a dark chart bg (#101319), then reviewed.
//
// Only legend TEXT color is affected — mark colors and saved .amoxvis charts are
// untouched. Palettes without an entry fall back to the default text color.
export const LEGEND_PAIRS = {
    sterling: {
        light: ['#6945B8', '#147568', '#A43A99', '#855700', '#365DA5', '#A94230', '#5D6F19', '#445762'],
        dark:  ['#C7B3F7', '#78D8C1', '#F0A0E7', '#F5CB7C', '#9BB9EF', '#F6AA9A', '#C5D486', '#C6D5DC'],
    },
    sterlingDark: {
        light: ['#6945B8', '#147568', '#A43A99', '#855700', '#365DA5', '#A94230', '#5D6F19', '#445762'],
        dark:  ['#C7B3F7', '#78D8C1', '#F0A0E7', '#F5CB7C', '#9BB9EF', '#F6AA9A', '#C5D486', '#C6D5DC'],
    },
    default: {
        light: ['#755ad2', '#cd3741', '#1c70cb', '#9e5e00', '#007e45', '#c53488', '#7a56cf', '#bc4c00'],
        dark:  ['#9c83ff', '#ff686b', '#56a4ff', '#ffbd00', '#00d695', '#fc69b8', '#a887ff', '#ff8d1d'],
    },
    vivid: {
        light: ['#2a63d7', '#dd1300', '#b84b00', '#008200', '#9f00a0', '#3a38b7', '#0075a6', '#d41d67', '#347f00', '#c01c24', '#29639b', '#9e3c9e', '#007c6b', '#767300', '#6824d9', '#c44500', '#920000', '#007e4a', '#4e70a8'],
        dark:  ['#3f7af0', '#f33500', '#ff9400', '#009800', '#d036cf', '#6772f5', '#009acd', '#e63475', '#5fac00', '#e24441', '#4983be', '#b957b9', '#00ac9a', '#abaa00', '#905cff', '#ee6c00', '#dd4f42', '#1d945e', '#5b7eb7'],
    },
    set1: {
        light: ['#e10000', '#1b73b4', '#008000', '#9c48a9', '#c83a00', '#776f00', '#ac5218', '#bb3c85'],
        dark:  ['#fc0011', '#2e82c3', '#3eb13c', '#b35ec0', '#ff7700', '#faf900', '#c0642f', '#fe7ac1'],
    },
    set2: {
        light: ['#007d60', '#bd4608', '#5a6d9a', '#ac4a8a', '#4a7a00', '#906500', '#896733', '#6e6e6e'],
        dark:  ['#59c4a4', '#ff8756', '#8ba0d0', '#ed85c6', '#a2da3d', '#ffd800', '#e8c38d', '#b3b3b3'],
    },
    pastel: {
        light: ['#487a66', '#936442', '#646e80', '#8b627c', '#677549', '#7c6e1f', '#7d6e58', '#707070'],
        dark:  ['#aee3cc', '#ffcba6', '#cad5ea', '#f7c8e5', '#e5f6c4', '#fff0a3', '#f3e2c9', '#cccccc'],
    },
    dark2: {
        light: ['#007f56', '#c83e00', '#6e67b2', '#d60075', '#387f00', '#9d5e00', '#976200', '#666666'],
        dark:  ['#00a075', '#e15700', '#7c75c1', '#f5008e', '#60a800', '#eca900', '#aa7400', '#7e7e7e'],
    },
    blues: {
        light: ['#00439d', '#0571bd', '#0075ae', '#2677a2', '#46758d', '#5a7083', '#63707b', '#6c7074'],
        dark:  ['#3c7edd', '#2683d1', '#3392cd', '#62afdc', '#99cbe5', '#c4dbf2', '#ddebf9', '#ebeff3'],
    },
    greens: {
        light: ['#005c2f', '#008233', '#008029', '#1c7e28', '#417c3c', '#53754d', '#62725d', '#6c716a'],
        dark:  ['#378d5d', '#089141', '#2dad55', '#6bc66e', '#9cdb95', '#c4eabc', '#e3f5dd', '#ebf0e9'],
    },
    reds: {
        light: ['#a00000', '#d40003', '#de0000', '#d42f00', '#b84926', '#9e5d42', '#85685b', '#776e69'],
        dark:  ['#e54640', '#f3292b', '#f92014', '#ff603b', '#ff8d69', '#ffb99b', '#ffdfcf', '#f7ece6'],
    },
    purples: {
        light: ['#410086', '#561e97', '#6b4eaa', '#6b66a9', '#706a9b', '#6c6c8c', '#6e6e7f', '#6f6d74'],
        dark:  ['#9365ea', '#9365df', '#8a6ece', '#807cc0', '#9e99cd', '#bcbddf', '#dadaed', '#efedf5'],
    },
    ylorbr: {
        light: ['#922400', '#cc3900', '#ca4000', '#bb4f00', '#9d6000', '#866a00', '#786f30', '#707056'],
        dark:  ['#cf5e37', '#e14e00', '#f56800', '#ff9400', '#ffc231', '#ffe385', '#faf1af', '#f1f1d4'],
    },
    spectral: {
        light: ['#d52242', '#cd3600', '#aa5900', '#8a6b00', '#697400', '#487c42', '#007d60', '#0076b1'],
        dark:  ['#eb3c53', '#fd6432', '#ffab51', '#ffdf7e', '#e6f68c', '#a6df9f', '#59c4a4', '#1e88c4'],
    },
    rdylbu: {
        light: ['#dc060c', '#cd3600', '#aa5900', '#8a6b00', '#5d7075', '#447585', '#35769c', '#3a71b8'],
        dark:  ['#f23027', '#fd6432', '#ffab51', '#ffdf84', '#def3f9', '#a6daec', '#6daed6', '#497fc7'],
    },
    rdylgn: {
        light: ['#dc060c', '#cd3600', '#aa5900', '#8a6b00', '#647600', '#497b00', '#077f11', '#008030'],
        dark:  ['#f23027', '#fd6432', '#ffab51', '#ffdf7e', '#d8f07e', '#a2db5b', '#5bbf59', '#009a49'],
    },
    piyg: {
        light: ['#cd007e', '#9f5780', '#846877', '#677550', '#477d00', '#2e7e00'],
        dark:  ['#e72594', '#eea0cb', '#ffdff0', '#e5f6cc', '#9dd95b', '#459400'],
    },
    ocean: {
        light: ['#0073ba', '#0079a0', '#007994', '#0c7b8b', '#367884', '#4d757d'],
        dark:  ['#0086ce', '#00b6de', '#26cce9', '#86e2f3', '#a6e9f7', '#c6f1fa'],
    },
    sunset: {
        light: ['#d42b39', '#d42700', '#b65200', '#956200', '#2e7e00', '#007b8a'],
        dark:  ['#ff6064', '#f74e00', '#f78f00', '#fec900', '#63b23e', '#00a8b7'],
    },
    corporate: {
        light: ['#2a3e52', '#314961', '#627071', '#627374', '#696f73', '#696d6e'],
        dark:  ['#6b8299', '#66809a', '#7e8c8d', '#93a5a7', '#bcc3c8', '#ebeff0'],
    },
    neon: {
        light: ['#c200c7', '#007d80', '#d92400', '#008100', '#dc003e', '#6814ff'],
        dark:  ['#ff00ff', '#00ffff', '#ff5a00', '#00ff00', '#ff0060', '#8c5fff'],
    },
};

// ─── Palette purpose guidance ────────────────────────────────
// Sterling's usage contract, as a picker hint: pick by the reading task, not by
// looks. Categorical for distinct groups, sequential for ordered magnitude,
// diverging around a meaningful midpoint.
export const PALETTE_PURPOSE = {
    Modern: 'Categorical — distinct groups with no order.',
    Qualitative: 'Categorical — distinct groups (ColorBrewer).',
    Sequential: 'Ordered magnitude — low to high on one scale.',
    Diverging: 'Around a meaningful midpoint (e.g. above/below zero).',
    Brand: 'Categorical, brand-leaning accents.',
};

// ─── Chart Type Registry ─────────────────────────────────────
// Each type has: key, label, category, icon (SVG path or emoji), supports (features list)
// Grouped by narrative INTENT (what the chart is meant to communicate),
// not by geometry. Order within each intent goes simple → complex.
export const CHART_TYPES = [
    // Compare — magnitudes side by side
    { key: 'bar', label: 'Column', category: 'compare', description: 'Vertical bars' },
    { key: 'bar-horizontal', label: 'Bar', category: 'compare', description: 'Horizontal bars' },
    // Trend — change over a continuum
    { key: 'line', label: 'Line', category: 'trend', description: 'Line series' },
    { key: 'area', label: 'Stacked Area', category: 'trend', description: 'Filled area stacked' },
    { key: 'combo', label: 'Combo', category: 'trend', description: 'Bar + Line combined' },
    // Composition — parts of a whole
    { key: 'bar-stacked', label: 'Stacked Column', category: 'composition', description: 'Stacked vertically' },
    { key: 'bar-100', label: '100% Stacked', category: 'composition', description: 'Proportional stacked' },
    { key: 'bar-horizontal-stacked', label: 'Stacked Bar', category: 'composition', description: 'Horizontal stacked' },
    { key: 'bar-horizontal-100', label: '100% Stacked Bar', category: 'composition', description: 'Horizontal proportional' },
    { key: 'donut', label: 'Donut', category: 'composition', description: 'Donut ring chart' },
    { key: 'pie', label: 'Pie', category: 'composition', description: 'Full pie chart' },
    { key: 'treemap', label: 'Treemap', category: 'composition', description: 'Hierarchical rectangles' },
    // Relationship — how variables relate
    { key: 'scatter', label: 'Scatter', category: 'relation', description: 'XY scatter plot' },
    { key: 'bubble', label: 'Bubble', category: 'relation', description: 'Scatter with size' },
    { key: 'heatmap', label: 'Heatmap', category: 'relation', description: 'Color intensity matrix' },
    // Flow — stages / pipeline
    { key: 'funnel', label: 'Funnel', category: 'flow', description: 'Funnel / pipeline' },
    { key: 'waterfall', label: 'Waterfall', category: 'flow', description: 'Cumulative bridge' },
];

export const CHART_CATEGORIES = [
    { key: 'compare', label: 'Compare' },
    { key: 'trend', label: 'Trend' },
    { key: 'composition', label: 'Composition' },
    { key: 'relation', label: 'Relationship' },
    { key: 'flow', label: 'Flow' },
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
// Curated for data-viz storytelling: high legibility at small sizes, clear
// numerals, and a range of voices (neutral / humanist / technical / editorial).
// All families below are loaded via the Google Fonts link in index.html.
export const FONT_OPTIONS = [
    { value: 'system', label: 'System Default', family: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    { value: 'inter', label: 'Inter — clean & neutral', family: '"Inter", sans-serif' },
    { value: 'lato', label: 'Lato — warm & humanist', family: '"Lato", sans-serif' },
    { value: 'ibm-plex', label: 'IBM Plex Sans — technical', family: '"IBM Plex Sans", sans-serif' },
    { value: 'manrope', label: 'Manrope — modern dashboard', family: '"Manrope", sans-serif' },
    { value: 'space-grotesk', label: 'Space Grotesk — bold headlines', family: '"Space Grotesk", sans-serif' },
    { value: 'lora', label: 'Lora — editorial serif', family: '"Lora", Georgia, serif' },
    { value: 'jetbrains', label: 'JetBrains Mono — numeric', family: '"JetBrains Mono", monospace' },
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
    tooltipMode: 'standard', // 'standard' | 'rich'

    // Colors & Theme
    colorTheme: 'default',
    backgroundTone: 'default',
    customBgColor: '',
    borderStyle: 'none',
    borderColor: '',
    fontFamily: 'system',
    textScale: 1,

    // Fill & card styling
    fillStyle: 'gradient', // 'gradient' | 'solid' (area/line fill)
    cardStyle: { shadow: false, radius: 8, gradient: false, gradientFrom: '#1e1f29', gradientTo: '#0f1015' },

    // Number format
    numberFormat: 'compact',
    decimalPlaces: -1, // -1 = auto

    // Grid & Axes
    gridMode: 'horizontal',
    showAxisLines: true,
    axisLabelOpacity: 0.8, // "Label Intensity" — ticks + axis titles + legend, over --text-primary (mode-aware). 0.2–1
    axisLabelSize: 11,     // axis tick label font size (px)
    axisLabelGap: 5,       // gap between tick labels and the axis (tickMargin)
    axisLabelMaxChars: 0,  // 0 = auto truncation; >0 = truncate long labels to N chars
    yLogScale: false,
    yAxisDomain: ['auto', 'auto'],
    rightYAxisDomain: ['auto', 'auto'],
    showXAxisTitle: true,
    showYAxisTitle: true,
    customAxisTitles: { x: '', y: '' },
    xAxisLabelAngle: 0,

    // Line specific
    lineType: 'monotone',
    lineAreaFill: false,
    showDots: false,
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
    takeaway: '',
    textAlign: 'left',

    // Editorial figure shell (Sterling idea, MIT © La Matemaga): a dedicated
    // source line, a portable signature, and a QED-like title mark keep charts
    // publication-ready. All off/empty by default — nothing changes until used.
    chartSource: '',                          // "Source: X" caption at the foot
    signature: { visible: false, author: '' }, // "Made with AmoxSQL" / "by X"
    titleMark: false,                          // QED-like period after the title

    // Reference elements
    refLine: { value: '', label: '', color: '#ff4444', style: 'dashed' },
    refArea: { x1: '', x2: '', y1: '', y2: '', color: '#ffffff', opacity: 0.1 },

    // Annotations — free-form callouts anchored to data
    // [{ id, type:'text'|'box', x, y, x2, y2, text, color }]
    annotations: [],

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
