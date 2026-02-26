import { memo, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea, LabelList
} from 'recharts';
import { LuDownload, LuCalendar, LuGitMerge, LuCircle, LuMaximize, LuMinimize, LuSave, LuUpload } from "react-icons/lu";
import SaveQueryModal from './SaveQueryModal';

// Distinctive color palettes for themes
export const COLOR_PALETTES = {
    default: [
        '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#3B3EAC', '#0099C6',
        '#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11',
        '#6633CC', '#E67300', '#8B0707', '#329262', '#5574A6'
    ],
    // Qualitative
    set1: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf'],
    set2: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'],
    pastel2: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'],
    dark2: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'],
    // Sequential
    blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'],
    greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'],
    reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'],
    ylorbr: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'],
    // Diverging
    spectral: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
    rdylbu: ['#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4'],
    rdylgn: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'],
    piyg: ['#c51b7d', '#e9a3c9', '#fde0ef', '#e6f5d0', '#a1d76a', '#4d9221']
};

// Helper to format Date strings
const formatDateLabel = (val) => {
    if (!val) return '';
    const str = String(val);
    // YYYY-MM-DD...
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
        return str.split('T')[0]; // Keep YYYY-MM-DD
    }
    return str;
};

// Simple Color Picker Component to avoid native input issues
const SimpleColorPicker = ({ color, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    // Ensure color is valid for display, fallback to white if empty
    const displayColor = color || '#ffffff';

    return (
        <div style={{ position: 'relative', display: 'inline-block' }} ref={wrapperRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '30px', height: '20px',
                    backgroundColor: displayColor,
                    border: '1px solid #555',
                    cursor: 'pointer',
                    borderRadius: '4px'
                }}
                title="Click to select color"
            />
            {isOpen && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                    backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--border-color)', padding: '10px',
                    borderRadius: '4px', boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                    width: '260px', marginTop: '5px',
                    display: 'flex', flexDirection: 'column', gap: '10px'
                }}>
                    <div style={{ overflowY: 'auto', maxHeight: '180px', paddingRight: '5px' }}>
                        {Object.entries(COLOR_PALETTES).map(([category, colors]) => (
                            <div key={category} style={{ marginBottom: '8px' }}>
                                <div style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                    {category}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {colors.map(c => (
                                        <div
                                            key={c}
                                            onClick={() => { onChange(c); setIsOpen(false); }}
                                            style={{
                                                width: '20px', height: '20px',
                                                backgroundColor: c,
                                                cursor: 'pointer',
                                                border: color === c ? '2px solid white' : '1px solid #333',
                                                borderRadius: '2px',
                                                boxSizing: 'border-box'
                                            }}
                                            title={c}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Hex:</span>
                        <input
                            type="text"
                            value={color}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="#FFFFFF"
                            style={{
                                flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                color: 'var(--text-active)', fontSize: '11px', padding: '4px', minWidth: 0
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper Component for Dot Highlighting
const CustomizedDot = (props) => {
    const { cx, cy, stroke, payload, value, dataKey, highlightConfig, uniqueId } = props; // uniqueId to break memo if needed? No, just rely on props.
    // Wait, dataKey is passed to Line but not necessarily to Dot unless we pass it specifically?
    // We pass <CustomizedDot dataKey={key} ... /> so Recharts clones it and ADDS cx, cy, payload, value.
    // So props will have: dataKey (from our element) + cx, cy, payload, value (from Recharts).

    // We also need access to processedData or at least know if this point is max/min.
    // Calculating max/min inside Dot is inefficient. Better to pass "highlightValue" or similar.
    // But data changes per series.
    // Let's rely on passed props: 'isMax', 'isMin', 'targetValue'.
    // Actually, simpler: pass the computed highlight value for THIS series to the dot.

    let isHighlighted = false;

    // We need the logic to determine if this SPECIFIC point is the one to highlight.
    // If mode is 'max', we need to know the max of the series.
    // We can pass 'highlightVal' prop to this component.

    if (props.highlightType === 'max' && value === props.highlightVal) isHighlighted = true;
    else if (props.highlightType === 'min' && value === props.highlightVal) isHighlighted = true;
    else if (props.highlightType === 'exact' && String(payload[props.xAxisKey]) === String(props.highlightVal)) isHighlighted = true;

    if (isHighlighted) {
        return (
            <svg x={cx - 6} y={cy - 6} width={12} height={12} fill={props.highlightColor} viewBox="0 0 1024 1024">
                <circle cx="512" cy="512" r="512" />
            </svg>
        );
    }

    if (!props.showDots) return null;
    return <circle cx={cx} cy={cy} r={3} stroke={stroke} strokeWidth={2} fill="#fff" />;
};

// Note: query is passed in to be bundled into the saved chart file
const DataVisualizer = memo(({ data, isReportMode = false, query = '', initialChartConfig = null }) => {
    const [chartType, setChartType] = useState(initialChartConfig?.chartType || 'bar');
    const [xAxisKey, setXAxisKey] = useState(initialChartConfig?.xAxisKey || '');
    const [yAxisKeys, setYAxisKeys] = useState(initialChartConfig?.yAxisKeys || []);
    const [rightYAxisKey, setRightYAxisKey] = useState(initialChartConfig?.rightYAxisKey || '');
    const [splitByKey, setSplitByKey] = useState(initialChartConfig?.splitByKey || '');
    const [dateAggregation, setDateAggregation] = useState(initialChartConfig?.dateAggregation || 'none');
    const [isDateColumn, setIsDateColumn] = useState(initialChartConfig?.isDateColumn !== undefined ? initialChartConfig.isDateColumn : false);
    const [showLabels, setShowLabels] = useState(initialChartConfig?.showLabels !== undefined ? initialChartConfig.showLabels : false);
    const [tooltipShowPercent, setTooltipShowPercent] = useState(initialChartConfig?.tooltipShowPercent !== undefined ? initialChartConfig.tooltipShowPercent : false);
    const [dataLabelPosition, setDataLabelPosition] = useState(initialChartConfig?.dataLabelPosition || 'top'); // 'outside', 'inside-end', 'inside-center', 'inside-start'
    const [bubbleSizeKey, setBubbleSizeKey] = useState(initialChartConfig?.bubbleSizeKey || '');

    // --- New Customization State ---
    // General
    const [colorTheme, setColorTheme] = useState(initialChartConfig?.colorTheme || 'default');
    const [sortMode, setSortMode] = useState(initialChartConfig?.sortMode || 'x-asc'); // x-asc, x-desc, y-asc, y-desc
    const [limit, setLimit] = useState(initialChartConfig?.limit || 50); // Limit number of items shown (renamed from maxItems)
    const [numberFormat, setNumberFormat] = useState(initialChartConfig?.numberFormat || 'compact'); // 'compact', 'standard', 'thousands', 'millions', 'billions', 'raw'

    // Line / General
    const [lineType, setLineType] = useState(initialChartConfig?.lineType || 'monotone'); // monotone, linear, step, stepBefore, stepAfter
    const [lineAreaFill, setLineAreaFill] = useState(initialChartConfig?.lineAreaFill !== undefined ? initialChartConfig.lineAreaFill : false);
    const [showDots, setShowDots] = useState(initialChartConfig?.showDots !== undefined ? initialChartConfig.showDots : true);
    const [isCumulative, setIsCumulative] = useState(initialChartConfig?.isCumulative !== undefined ? initialChartConfig.isCumulative : false);
    const [yLogScale, setYLogScale] = useState(initialChartConfig?.yLogScale !== undefined ? initialChartConfig.yLogScale : false);
    const [yAxisDomain, setYAxisDomain] = useState(initialChartConfig?.yAxisDomain || ['auto', 'auto']); // [min, max]
    const [refLine, setRefLine] = useState(initialChartConfig?.refLine || { value: '', label: '', color: 'red' });
    const [refArea, setRefArea] = useState(initialChartConfig?.refArea || { x1: '', x2: '', y1: '', y2: '', color: '#ffffff', opacity: 0.1 });

    // Bar
    const [barStackMode, setBarStackMode] = useState(initialChartConfig?.barStackMode || 'none'); // 'none', 'stack', 'expand'
    const [barRadius, setBarRadius] = useState(initialChartConfig?.barRadius !== undefined ? initialChartConfig.barRadius : 0);
    const [barColorMode, setBarColorMode] = useState(initialChartConfig?.barColorMode || 'series'); // 'series' or 'dimension' (x-value)
    const [highlightConfig, setHighlightConfig] = useState(initialChartConfig?.highlightConfig || { type: 'none', value: '', color: '#ff0000' }); // type: none, max, min, mask (specific value)

    // Series Customization (Line/Bar colors & styles)
    const [seriesConfig, setSeriesConfig] = useState(initialChartConfig?.seriesConfig || {}); // { [key]: { color: '#...', style: 'solid' | 'dashed' | 'dotted' } }
    const [customAxisTitles, setCustomAxisTitles] = useState(initialChartConfig?.customAxisTitles || { x: '', y: '' });
    const [showXAxisTitle, setShowXAxisTitle] = useState(initialChartConfig?.showXAxisTitle !== undefined ? initialChartConfig.showXAxisTitle : true);
    const [showYAxisTitle, setShowYAxisTitle] = useState(initialChartConfig?.showYAxisTitle !== undefined ? initialChartConfig.showYAxisTitle : true);
    const [xAxisLabelAngle, setXAxisLabelAngle] = useState(initialChartConfig?.xAxisLabelAngle !== undefined ? initialChartConfig.xAxisLabelAngle : 0); // 0, 45, 90
    const [legendPosition, setLegendPosition] = useState(initialChartConfig?.legendPosition || 'bottom'); // top, bottom, left, right

    // Donut
    const [donutThickness, setDonutThickness] = useState(initialChartConfig?.donutThickness !== undefined ? initialChartConfig.donutThickness : 60);
    const [donutLabelContent, setDonutLabelContent] = useState(initialChartConfig?.donutLabelContent || 'name_percent'); // 'percent', 'value', 'name', 'name_percent', 'name_value'
    const [donutLabelPosition, setDonutLabelPosition] = useState(initialChartConfig?.donutLabelPosition || 'outside'); // 'inside', 'outside'
    const [donutGroupingThreshold, setDonutGroupingThreshold] = useState(initialChartConfig?.donutGroupingThreshold !== undefined ? initialChartConfig.donutGroupingThreshold : 0); // 0-100% threshold for "Others" // Inner Radius
    const [donutCenterKpi, setDonutCenterKpi] = useState(initialChartConfig?.donutCenterKpi !== undefined ? initialChartConfig.donutCenterKpi : 'none'); // 'none', 'total', 'average'

    // Scatter
    const [scatterQuadrants, setScatterQuadrants] = useState(initialChartConfig?.scatterQuadrants !== undefined ? initialChartConfig.scatterQuadrants : false);

    // Storytelling State
    const [chartTitle, setChartTitle] = useState(initialChartConfig?.chartTitle || '');
    const [chartSubtitle, setChartSubtitle] = useState(initialChartConfig?.chartSubtitle || '');
    const [chartFootnote, setChartFootnote] = useState(initialChartConfig?.chartFootnote || '');
    const titleRef = useRef(null);
    const subtitleRef = useRef(null);
    const footnoteRef = useRef(null);
    const [textAlign, setTextAlign] = useState(initialChartConfig?.textAlign || 'center'); // 'center', 'left'
    const [gridMode, setGridMode] = useState(initialChartConfig?.gridMode || 'both'); // 'both', 'horizontal', 'vertical', 'none'
    const [showAxisLines, setShowAxisLines] = useState(initialChartConfig?.showAxisLines !== undefined ? initialChartConfig.showAxisLines : true);

    // Chart Margins & Spacing
    const [marginTop, setMarginTop] = useState(initialChartConfig?.marginTop !== undefined ? initialChartConfig.marginTop : 20);
    const [marginBottom, setMarginBottom] = useState(initialChartConfig?.marginBottom !== undefined ? initialChartConfig.marginBottom : 10);
    const [marginLeft, setMarginLeft] = useState(initialChartConfig?.marginLeft !== undefined ? initialChartConfig.marginLeft : 20);
    const [marginRight, setMarginRight] = useState(initialChartConfig?.marginRight !== undefined ? initialChartConfig.marginRight : 30);
    const [titleSpacing, setTitleSpacing] = useState(initialChartConfig?.titleSpacing !== undefined ? initialChartConfig.titleSpacing : 10);

    // Ref for chart export
    const chartRef = useRef(null);

    // Ref for file upload
    const fileInputRef = useRef(null);

    // Fullscreen, save modal and Tab state
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('data');

    // Extract columns
    const columns = useMemo(() => {
        if (!data || data.length === 0) return [];
        return Object.keys(data[0]);
    }, [data]);

    // Initialize defaults
    useMemo(() => {
        if (columns.length > 0) {
            if (!xAxisKey) setXAxisKey(columns[0]);

            // Default Y Axis
            if (yAxisKeys.length === 0 && columns.length > 1) {
                const numCol = columns.find(c => typeof data[0][c] === 'number');
                setYAxisKeys([numCol || columns[1]]);
            } else if (yAxisKeys.length === 0) {
                setYAxisKeys([columns[0]]);
            }
        }
    }, [columns, data, xAxisKey, yAxisKeys]);

    const handleYAxisChange = (col) => {
        if (splitByKey) {
            setYAxisKeys([col]);
            return;
        }

        if (yAxisKeys.includes(col)) {
            if (yAxisKeys.length > 1) {
                setYAxisKeys(yAxisKeys.filter(k => k !== col));
            }
        } else {
            setYAxisKeys([...yAxisKeys, col]);
        }
    };

    const formatNumber = useCallback((value) => {
        if (typeof value !== 'number') return value;

        try {
            switch (numberFormat) {
                case 'standard':
                    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
                case 'currency':
                    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
                case 'thousands':
                    return (value / 1000).toFixed(1) + 'k';
                case 'millions':
                    return (value / 1000000).toFixed(1) + 'M';
                case 'billions':
                    return (value / 1000000000).toFixed(1) + 'B';
                case 'raw':
                    return String(value);
                case 'compact':
                default:
                    return new Intl.NumberFormat('en-US', {
                        notation: "compact",
                        maximumFractionDigits: 1
                    }).format(value);
            }
        } catch (e) {
            return String(value);
        }
    }, [numberFormat]);

    const renderTooltipFormatter = useCallback((value, name, props) => {
        let formattedVal = formatNumber(value);

        if (tooltipShowPercent) {
            if (chartType === 'donut' && props && props.payload && props.payload.percent !== undefined) {
                const pct = (props.payload.percent * 100).toFixed(1);
                formattedVal += ` (${pct}%)`;
            } else if (chartType !== 'donut' && props && props.payload) {
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
    }, [formatNumber, tooltipShowPercent, chartType, yAxisKeys]);

    // Detect if X-Axis is a Date column
    const isDateColumnMemo = useMemo(() => {
        if (!xAxisKey || !data || data.length === 0) return false;
        const val = data.find(r => r[xAxisKey] != null)?.[xAxisKey];
        if (typeof val !== 'string') return false;
        return /^\d{4}-\d{2}-\d{2}/.test(val);
    }, [data, xAxisKey]);

    // --- MEMOIZED CONFIGS (Top Level) ---

    const activeColors = useMemo(() => COLOR_PALETTES[colorTheme] || COLOR_PALETTES.default, [colorTheme]);

    // Tooltip Style (Stable)
    const tooltipStyle = useMemo(() => ({
        backgroundColor: 'var(--tooltip-bg)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-color)',
        fontSize: '12px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
    }), []);

    // Axes Layout Props (Stable based on showAxisLines)
    const axisCommonProps = useMemo(() => ({
        axisLine: showAxisLines,
        tickLine: showAxisLines
    }), [showAxisLines]);

    // Legend Props (Stable based on position)
    const legendProps = useMemo(() => {
        let padTop = 0;
        let padBottom = 0;
        let padLeft = 0;

        if (legendPosition === 'top') padBottom = 15;
        if (legendPosition === 'bottom') padTop = 15;
        if (legendPosition === 'right') padLeft = 20;

        return {
            wrapperStyle: { paddingTop: padTop, paddingBottom: padBottom, paddingLeft: padLeft },
            verticalAlign: (legendPosition === 'top' || legendPosition === 'bottom') ? legendPosition : 'middle',
            align: (legendPosition === 'left' || legendPosition === 'right') ? legendPosition : 'center',
            layout: (legendPosition === 'left' || legendPosition === 'right') ? 'vertical' : 'horizontal'
        };
    }, [legendPosition]);

    // X-Axis Tick Props (Stable based on angle)
    const xAxisTickProps = useMemo(() => ({
        fill: 'var(--text-tertiary)',
        fontSize: 11,
        angle: -Number(xAxisLabelAngle), // Recharts rotates counter-clockwise with negative
        textAnchor: Number(xAxisLabelAngle) !== 0 ? 'end' : 'middle',
        dy: Number(xAxisLabelAngle) !== 0 ? 5 : 0
    }), [xAxisLabelAngle]);


    // Process Data (Aggregation & Pivot)
    const { processedData, finalSeriesKeys } = useMemo(() => {
        if (!data || data.length === 0) return { processedData: [], finalSeriesKeys: [] };

        let result = [];
        let seriesKeys = [];

        // 1. GROUP & AGGREGATE
        const grouped = {};

        // Helper to get group key
        const getGroupKey = (row) => {
            let key = row[xAxisKey];
            if (key == null) return null;
            if (isDateColumnMemo) {
                if (dateAggregation === 'month') return String(key).substring(0, 7);
                if (dateAggregation === 'year') return String(key).substring(0, 4);
                return formatDateLabel(key);
            }
            return key;
        };

        // ... Data Processing Logic ...

        if (splitByKey && yAxisKeys.length > 0) {
            const valueCol = yAxisKeys[0]; // Can only split one metric
            const uniqueSeries = new Set();

            data.forEach(row => {
                const xVal = getGroupKey(row);
                if (xVal == null) return;

                if (!grouped[xVal]) grouped[xVal] = { [xAxisKey]: xVal };

                const splitVal = String(row[splitByKey]);
                uniqueSeries.add(splitVal);

                const numericVal = Number(row[valueCol]) || 0;
                grouped[xVal][splitVal] = (grouped[xVal][splitVal] || 0) + numericVal;

                // Bubble Size
                if (bubbleSizeKey) {
                    const sizeVal = Number(row[bubbleSizeKey]) || 0;
                    grouped[xVal][`${splitVal}_size`] = (grouped[xVal][`${splitVal}_size`] || 0) + sizeVal;
                }
            });
            seriesKeys = Array.from(uniqueSeries).sort();
            result = Object.values(grouped);
        } else {
            // Standard (No Split)
            seriesKeys = [...yAxisKeys];

            data.forEach(row => {
                const xVal = getGroupKey(row);
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

        // 2. SORT IT
        result.sort((a, b) => {
            const valA_X = a[xAxisKey];
            const valB_X = b[xAxisKey];

            // For Y sorting, we sum the series if multiple, or take the first
            const getSumY = (row) => seriesKeys.reduce((acc, k) => acc + (Number(row[k]) || 0), 0);

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

        // 3. APPLY CUMULATIVE (If enabled, BEFORE limit? No, usually cumulative implies full dataset order. 
        // But if we limit to 'Top 10', cumulative doesn't make much sense or should be on the top 10.
        // Let's do cumulative first if 'x-asc' sorted, otherwise it might be weird. 
        // Actually, cumulative usually requires time-sort. If sorted by Y, cumulative is meaningless chart-wise usually.
        // We will apply it on the RESULTING array order.
        if (isCumulative && chartType === 'line') {
            const runningTotals = {};
            seriesKeys.forEach(k => runningTotals[k] = 0);

            result = result.map(row => {
                const newRow = { ...row };
                seriesKeys.forEach(k => {
                    const val = Number(row[k]) || 0;
                    runningTotals[k] += val;
                    newRow[k] = runningTotals[k];
                });
                return newRow;
            });
        }

        // 4. LIMIT
        if (limit > 0 && result.length > limit) {
            result = result.slice(0, Number(limit));
        }

        return { processedData: result, finalSeriesKeys: seriesKeys };
    }, [data, xAxisKey, yAxisKeys, splitByKey, isDateColumnMemo, dateAggregation, bubbleSizeKey, chartType, isCumulative, sortMode, limit]);


    // --- DONUT DATA & LABELS ---
    const donutData = useMemo(() => {
        if (chartType !== 'donut' || !processedData || processedData.length === 0) return processedData;

        const dataKey = yAxisKeys[0];
        if (!dataKey) return processedData;

        // Calculate total for percentages
        const total = processedData.reduce((sum, item) => sum + (Number(item[dataKey]) || 0), 0);
        if (total === 0) return processedData;

        const threshold = Number(donutGroupingThreshold) || 0;
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
            // Create "Others" item
            const othersItem = { ...processedData[0] }; // Clone structure
            othersItem[xAxisKey] = 'Others';
            othersItem[dataKey] = othersSum;
            keep.push(othersItem);
        }

        return keep;
    }, [processedData, chartType, yAxisKeys, donutGroupingThreshold, xAxisKey]);

    const renderCustomizedLabel = useCallback((props) => {
        const { cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value } = props;
        const RADIAN = Math.PI / 180;

        // Position logic
        let radius = outerRadius + 20; // default outside
        if (donutLabelPosition === 'inside') {
            radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        }

        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        // Content logic
        let text = '';
        const pStr = (percent * 100).toFixed(0) + '%';
        const valStr = formatNumber(value);

        switch (donutLabelContent) {
            case 'percent': text = pStr; break;
            case 'value': text = valStr; break;
            case 'name': text = name; break;
            case 'name_percent': text = `${name} (${pStr})`; break;
            case 'name_value': text = `${name}: ${valStr}`; break;
            default: text = `${name} (${pStr})`;
        }

        return (
            <text
                x={x} y={y}
                fill="#ccc"
                textAnchor={x > cx ? 'start' : 'end'}
                dominantBaseline="central"
                fontSize={11}
            >
                {text}
            </text>
        );
    }, [donutLabelContent, donutLabelPosition]);

    // Data Label Position Mapping
    const labelProps = useMemo(() => {
        if (!showLabels) return false;

        let position = 'top';
        let fill = 'var(--text-secondary)';

        if (chartType === 'bar-horizontal') {
            if (dataLabelPosition === 'outside') position = 'right';
            else if (dataLabelPosition === 'inside-end') position = 'insideRight';
            else if (dataLabelPosition === 'inside-center') position = 'inside';
            else if (dataLabelPosition === 'inside-start') position = 'insideLeft';
        } else if (chartType === 'donut') {
            // Donut handled separately, ignore this prop.
            return false;
        } else {
            if (dataLabelPosition === 'outside') position = 'top';
            else if (dataLabelPosition === 'inside-end') position = 'insideTop';
            else if (dataLabelPosition === 'inside-center') position = 'inside';
            else if (dataLabelPosition === 'inside-start') position = 'insideBottom';
        }

        // Apply white text if label is positioned inside a filled element (like a bar)
        if (position.includes('inside')) {
            fill = 'var(--text-primary)';
        }

        return { position, fill, fontSize: 10, formatter: formatNumber };
    }, [showLabels, dataLabelPosition, chartType, formatNumber]);

    // --- BAR LABELS WITH AUTO-HIDE ---
    const renderCustomBarLabel = useCallback((props) => {
        const { x, y, width, height, value } = props;
        if (value == null) return null;

        const { position, fill } = labelProps;
        const isHorizontal = chartType === 'bar-horizontal';

        // Auto-hide logic for small bars when labels are inside
        if (position && position.includes('inside')) {
            if (isHorizontal && (width < 30 || height < 12)) return null;
            if (!isHorizontal && (height < 20 || width < 20)) return null;
        }

        let textX = x + width / 2;
        let textY = y + height / 2;
        let textAnchor = "middle";
        let dominantBaseline = "central";

        const offset = 5;

        if (position === 'top') {
            textX = x + width / 2;
            textY = y - offset;
            dominantBaseline = "bottom";
        } else if (position === 'right') {
            textX = x + width + offset;
            textY = y + height / 2;
            textAnchor = "start";
        } else if (position === 'insideTop') {
            textX = x + width / 2;
            textY = y + offset * 2;
            dominantBaseline = "auto";
        } else if (position === 'insideBottom') {
            textX = x + width / 2;
            textY = y + height - offset;
            dominantBaseline = "bottom";
        } else if (position === 'insideRight') {
            textX = x + width - offset;
            textY = y + height / 2;
            textAnchor = "end";
        } else if (position === 'insideLeft') {
            textX = x + offset;
            textY = y + height / 2;
            textAnchor = "start";
        }

        return (
            <text x={textX} y={textY} fill={fill} fontSize={10} textAnchor={textAnchor} dominantBaseline={dominantBaseline}>
                {formatNumber(value)}
            </text>
        );
    }, [labelProps, chartType, formatNumber]);

    // --- RENDER HELPERS ---

    const xAxisTickFormatter = useCallback((val) => {
        if (typeof val === 'number') return formatNumber(val);
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            if (dateAggregation === 'year') return val;
            if (dateAggregation === 'month') return val;
            return val.split('T')[0];
        }
        const str = String(val);
        if (chartType === 'bar-horizontal' && str.length > 40) return str.substring(0, 37) + '...';
        else if (chartType !== 'bar-horizontal' && str.length > 20) return str.substring(0, 17) + '...';
        return str;
    }, [formatNumber, dateAggregation, isDateColumnMemo, chartType]);

    let defaultXLabel = "X Axis Column";
    let defaultYLabel = "Y Axis Columns";
    if (chartType === 'bar-horizontal') {
        defaultXLabel = "Values";
        defaultYLabel = "Categories";
    } else if (chartType === 'donut') {
        defaultXLabel = "Segment Label";
        defaultYLabel = "Segment Size";
    }

    // Chart Configuration Constants
    const CommonProps = useMemo(() => {
        let pt = Number(marginTop);
        let pb = Number(marginBottom);
        if (chartFootnote) pb += 15;

        if (legendPosition === 'top') pt += 5; // Space strictly for legend
        if (legendPosition === 'bottom') pb += 10; // Only add space if legend is actually at the bottom

        // Give extra left margin when a Y-axis label is active so it doesn't squish into the axis numbers
        let pl = Number(marginLeft);
        if (showYAxisTitle && chartType !== 'bar-horizontal') pl += 15;
        if (showXAxisTitle && chartType === 'bar-horizontal') pl += 15;

        const margin = { top: pt, right: Number(marginRight), left: pl, bottom: pb };
        return {
            data: processedData,
            margin: margin,
            style: { fontSize: '12px' }
        };
    }, [processedData, legendPosition, xAxisLabelAngle, chartFootnote, marginTop, marginBottom, marginLeft, marginRight, showYAxisTitle, showXAxisTitle, chartType]);

    // Domain & Scale
    const yDomain = useMemo(() => [
        yAxisDomain[0] !== '' && !isNaN(yAxisDomain[0]) ? Number(yAxisDomain[0]) : 'auto',
        yAxisDomain[1] !== '' && !isNaN(yAxisDomain[1]) ? Number(yAxisDomain[1]) : 'auto'
    ], [yAxisDomain]);
    const yScale = yLogScale ? 'log' : 'auto';

    // Calculate dynamic Y-axis width for horizontal bar charts to prevent label cutoff
    const dynamicYAxisWidth = useMemo(() => {
        if (chartType !== 'bar-horizontal' || !processedData || processedData.length === 0) return 100;

        let maxLength = 0;
        processedData.forEach(d => {
            const labelStr = xAxisTickFormatter(d[xAxisKey]);
            if (labelStr && labelStr.length > maxLength) {
                maxLength = labelStr.length;
            }
        });

        // Approximate width: base 20px + ~8px per character + title padding
        const calculatedWidth = 20 + (maxLength * 8) + (showXAxisTitle ? 25 : 10);

        // Cap it between 60 and 400 pixels to allow much longer labels natively
        return Math.min(Math.max(calculatedWidth, 60), 400);
    }, [processedData, xAxisKey, chartType, xAxisTickFormatter, showXAxisTitle]);

    // Calculate dynamic X-axis height to prevent rotated label cutoff
    const dynamicXAxisHeight = useMemo(() => {
        if (!processedData || processedData.length === 0) return 30;

        let baseHeight = showXAxisTitle ? 30 : 10;
        if (chartType === 'bar-horizontal') return baseHeight + 15; // Only numbers on bottom X

        const angle = Number(xAxisLabelAngle);

        if (angle === 0) return baseHeight + 20; // Default flat labels

        let maxLength = 0;
        processedData.forEach(d => {
            const labelStr = xAxisTickFormatter(d[xAxisKey]);
            if (labelStr && labelStr.length > maxLength) {
                maxLength = labelStr.length;
            }
        });

        // Trigonometry: height required = string_length * sin(angle) * pixels_per_char
        const angleRad = angle * (Math.PI / 180);
        const textHeight = Math.abs(Math.sin(angleRad)) * (maxLength * 6); // ~6px wide font assuming 11px font size

        // Add 10px tick padding -> clamp max sizes logically
        return Math.min(Math.max(baseHeight + textHeight + 10, 40), 180);
    }, [processedData, xAxisKey, xAxisLabelAngle, xAxisTickFormatter, showXAxisTitle]);

    // Ref Line Element
    const renderRefLine = () => {
        if (!refLine.value) return null;
        const isHorizontal = chartType === 'bar-horizontal';
        return (
            <ReferenceLine
                y={!isHorizontal ? Number(refLine.value) : undefined}
                x={isHorizontal ? Number(refLine.value) : undefined}
                label={{ value: refLine.label, position: isHorizontal ? 'insideTopLeft' : 'top', fill: refLine.color, fontSize: 10 }}
                stroke={refLine.color}
                strokeDasharray="3 3"
            />
        );
    };

    // Ref Area Element
    const renderRefArea = () => {
        const hasX = refArea.x1 !== '' && refArea.x2 !== '';
        const hasY = refArea.y1 !== '' && refArea.y2 !== '';

        if (!hasX && !hasY) return null;

        const x1 = isNaN(Number(refArea.x1)) || refArea.x1 === '' ? refArea.x1 : Number(refArea.x1);
        const x2 = isNaN(Number(refArea.x2)) || refArea.x2 === '' ? refArea.x2 : Number(refArea.x2);

        const isHorizontal = chartType === 'bar-horizontal';

        return (
            <>
                {hasX && !isHorizontal && <ReferenceArea x1={x1} x2={x2} fill={refArea.color} fillOpacity={refArea.opacity} />}
                {hasX && isHorizontal && <ReferenceArea y1={x1} y2={x2} fill={refArea.color} fillOpacity={refArea.opacity} />}

                {hasY && !isHorizontal && <ReferenceArea y1={Number(refArea.y1)} y2={Number(refArea.y2)} fill={refArea.color} fillOpacity={refArea.opacity} />}
                {hasY && isHorizontal && <ReferenceArea x1={Number(refArea.y1)} x2={Number(refArea.y2)} fill={refArea.color} fillOpacity={refArea.opacity} />}
            </>
        );
    };



    // Axis Titles
    const XLabel = showXAxisTitle ? (customAxisTitles.x || defaultXLabel || xAxisKey) : '';
    const YLabel = showYAxisTitle ? (customAxisTitles.y || defaultYLabel || 'Values') : '';

    // --- CHART CONTENT MEMO ---
    const ChartContent = useMemo(() => {
        if (!processedData || processedData.length === 0) return <div style={{ color: 'var(--text-muted)' }}>No data to display</div>;

        try {
            switch (chartType) {
                case 'line':
                    const LineChartComponent = lineAreaFill ? AreaChart : LineChart;
                    const LineSeriesComponent = lineAreaFill ? Area : Line;

                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChartComponent {...CommonProps}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={gridMode === 'both' || gridMode === 'vertical'} horizontal={gridMode === 'both' || gridMode === 'horizontal'} />
                                <XAxis
                                    {...axisCommonProps}
                                    dataKey={xAxisKey}
                                    stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    tickFormatter={xAxisTickFormatter}
                                    label={showXAxisTitle ? { value: XLabel, position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                    height={dynamicXAxisHeight}
                                />
                                <YAxis
                                    yAxisId="left"
                                    {...axisCommonProps}
                                    stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    tickFormatter={formatNumber}
                                    domain={yDomain}
                                    scale={yScale}
                                    allowDataOverflow={true}
                                    label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                />
                                {rightYAxisKey && (
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        {...axisCommonProps}
                                        stroke="var(--border-color)"
                                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                        tickFormatter={formatNumber}
                                        domain={yDomain}
                                        scale={yScale}
                                        allowDataOverflow={true}
                                    />
                                )}
                                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} formatter={renderTooltipFormatter} labelFormatter={xAxisTickFormatter} />
                                {legendPosition !== 'none' && <Legend {...legendProps} />}
                                {renderRefLine()}
                                {renderRefArea()}
                                {finalSeriesKeys.map((key, index) => {
                                    const config = seriesConfig[key] || {};
                                    const color = config.color || activeColors[index % activeColors.length];
                                    const strokeDash = config.style === 'dashed' ? '5 5' : (config.style === 'dotted' ? '2 2' : '');

                                    let highlightValSeries = null;
                                    if (highlightConfig.type === 'max') {
                                        highlightValSeries = Math.max(...processedData.map(d => Number(d[key]) || -Infinity));
                                    } else if (highlightConfig.type === 'min') {
                                        highlightValSeries = Math.min(...processedData.map(d => Number(d[key]) || Infinity));
                                    } else if (highlightConfig.type === 'exact') {
                                        highlightValSeries = highlightConfig.value;
                                    }

                                    return (
                                        <LineSeriesComponent
                                            key={key || index}
                                            yAxisId={key === rightYAxisKey ? "right" : "left"}
                                            type={lineType}
                                            dataKey={key}
                                            stroke={color}
                                            strokeWidth={2}
                                            strokeDasharray={strokeDash}
                                            fill={lineAreaFill ? color : "transparent"}
                                            fillOpacity={0.2}
                                            dot={
                                                <CustomizedDot
                                                    dataKey={key}
                                                    showDots={showDots}
                                                    highlightType={highlightConfig.type}
                                                    highlightVal={highlightValSeries}
                                                    highlightColor={highlightConfig.color || '#ff0000'}
                                                    xAxisKey={xAxisKey}
                                                    payload={processedData}
                                                />
                                            }
                                            activeDot={{ r: 6 }}
                                            name={String(key)}
                                            label={labelProps}
                                            isAnimationActive={false}
                                        />
                                    );
                                })}
                            </LineChartComponent>
                        </ResponsiveContainer>
                    );
                case 'bar':
                case 'bar-horizontal':
                    const isHorizontal = chartType === 'bar-horizontal';

                    let highlightVal = null;
                    const primaryKey = yAxisKeys[0];
                    if (highlightConfig.type === 'max') {
                        highlightVal = Math.max(...processedData.map(d => Number(d[primaryKey]) || -Infinity));
                    } else if (highlightConfig.type === 'min') {
                        highlightVal = Math.min(...processedData.map(d => Number(d[primaryKey]) || Infinity));
                    }

                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout={isHorizontal ? 'vertical' : 'horizontal'}
                                stackOffset={barStackMode === 'expand' ? 'expand' : 'none'}
                                {...CommonProps}
                                margin={{ ...CommonProps.margin, right: legendPosition === 'right' ? 10 : 30, left: legendPosition === 'left' ? 10 : 20 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={isHorizontal ? (gridMode === 'both' || gridMode === 'horizontal') : (gridMode === 'both' || gridMode === 'vertical')} horizontal={isHorizontal ? (gridMode === 'both' || gridMode === 'vertical') : (gridMode === 'both' || gridMode === 'horizontal')} />

                                {isHorizontal ? (
                                    <>
                                        <XAxis
                                            {...axisCommonProps}
                                            type="number"
                                            stroke="var(--border-color)"
                                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                            tickFormatter={formatNumber}
                                            domain={yDomain}
                                            scale={yScale}
                                            label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                            height={showXAxisTitle ? 30 : 5}
                                        />
                                        <YAxis
                                            {...axisCommonProps}
                                            type="category"
                                            dataKey={xAxisKey}
                                            stroke="var(--border-color)"
                                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                            width={dynamicYAxisWidth}
                                            tickFormatter={xAxisTickFormatter}
                                            label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <XAxis
                                            {...axisCommonProps}
                                            dataKey={xAxisKey}
                                            stroke="var(--border-color)"
                                            tick={xAxisTickProps}
                                            tickFormatter={xAxisTickFormatter}
                                            label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                            height={dynamicXAxisHeight}
                                        />
                                        <YAxis
                                            yAxisId="left"
                                            {...axisCommonProps}
                                            stroke="var(--border-color)"
                                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                            tickFormatter={formatNumber}
                                            domain={yDomain}
                                            scale={yScale}
                                            label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                        />
                                        {rightYAxisKey && (
                                            <YAxis
                                                yAxisId="right"
                                                orientation="right"
                                                {...axisCommonProps}
                                                stroke="var(--border-color)"
                                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                                tickFormatter={formatNumber}
                                                domain={yDomain}
                                                scale={yScale}
                                            />
                                        )}
                                    </>
                                )}

                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} formatter={renderTooltipFormatter} labelFormatter={xAxisTickFormatter} />
                                {legendPosition !== 'none' && <Legend {...legendProps} wrapperStyle={{ ...legendProps.wrapperStyle, paddingLeft: '10px' }} />}

                                {renderRefLine()}
                                {renderRefArea()}

                                {finalSeriesKeys.map((key, index) => {
                                    const config = seriesConfig[key] || {};
                                    const baseColor = config.color || activeColors[index % activeColors.length];

                                    let seriesMax = 1;
                                    if (barColorMode === 'intensity') {
                                        seriesMax = Math.max(...processedData.map(d => Number(d[key]) || 0));
                                        if (seriesMax <= 0) seriesMax = 1;
                                    }

                                    return (
                                        <Bar
                                            key={key}
                                            yAxisId={isHorizontal ? 0 : (key === rightYAxisKey ? "right" : "left")}
                                            dataKey={key}
                                            stackId={(barStackMode === 'stack' || barStackMode === 'expand') ? "a" : undefined}
                                            fill={baseColor}
                                            radius={isHorizontal ? [0, barRadius, barRadius, 0] : [barRadius, barRadius, 0, 0]}
                                            name={String(key)}
                                            isAnimationActive={false}
                                        >
                                            {showLabels && (
                                                <LabelList
                                                    dataKey={key}
                                                    content={renderCustomBarLabel}
                                                />
                                            )}
                                            {processedData.map((entry, entryIndex) => {
                                                const val = Number(entry[key]);
                                                let finalColor = baseColor;
                                                let cellOpacity = 1;

                                                if (barColorMode === 'dimension') {
                                                    finalColor = activeColors[entryIndex % activeColors.length];
                                                } else if (barColorMode === 'intensity') {
                                                    const ratio = seriesMax > 0 ? (val / seriesMax) : 1;
                                                    cellOpacity = 0.2 + (0.8 * Math.max(0, ratio)); // 0.2 to 1.0 based on value
                                                }

                                                if (highlightConfig.type !== 'none') {
                                                    if (highlightConfig.type === 'max' && val === highlightVal) {
                                                        finalColor = highlightConfig.color;
                                                    } else if (highlightConfig.type === 'min' && val === highlightVal) {
                                                        finalColor = highlightConfig.color;
                                                    } else if (highlightConfig.type === 'exact' && String(entry[xAxisKey]) === String(highlightConfig.value)) {
                                                        finalColor = highlightConfig.color;
                                                    }
                                                }

                                                return <Cell key={`cell-${entryIndex}`} fill={finalColor} fillOpacity={cellOpacity} />;
                                            })}
                                        </Bar>
                                    );
                                })}
                            </BarChart>
                        </ResponsiveContainer>
                    );
                case 'scatter':
                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart {...CommonProps}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={gridMode === 'both' || gridMode === 'vertical'} horizontal={gridMode === 'both' || gridMode === 'horizontal'} />
                                <XAxis
                                    {...axisCommonProps}
                                    dataKey={xAxisKey}
                                    type={isDateColumnMemo ? "category" : "number"}
                                    name={XLabel}
                                    stroke="var(--border-color)"
                                    tick={xAxisTickProps}
                                    tickFormatter={xAxisTickFormatter}
                                    interval="preserveStartEnd"
                                    domain={['auto', 'auto']}
                                    label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                    height={dynamicXAxisHeight}
                                />
                                <YAxis
                                    yAxisId="left"
                                    {...axisCommonProps}
                                    type="number"
                                    name={YLabel}
                                    stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    tickFormatter={formatNumber}
                                    label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 } : undefined}
                                />
                                {rightYAxisKey && (
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        {...axisCommonProps}
                                        type="number"
                                        name={rightYAxisKey}
                                        stroke="var(--border-color)"
                                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                        tickFormatter={formatNumber}
                                    />
                                )}
                                <ZAxis
                                    type="number"
                                    dataKey="size"
                                    range={[60, 600]}
                                    name="Size"
                                />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} formatter={renderTooltipFormatter} labelFormatter={xAxisTickFormatter} />
                                {legendPosition !== 'none' && <Legend {...legendProps} />}
                                {renderRefLine()}
                                {renderRefArea()}
                                {scatterQuadrants && xAxisKey && yAxisKeys[0] && (() => {
                                    const xVals = processedData.map(d => Number(d[xAxisKey])).filter(v => !isNaN(v));
                                    const yVals = processedData.map(d => Number(d[yAxisKeys[0]])).filter(v => !isNaN(v));
                                    if (xVals.length === 0 || yVals.length === 0) return null;
                                    const xMean = xVals.reduce((a, b) => a + b, 0) / xVals.length;
                                    const yMean = yVals.reduce((a, b) => a + b, 0) / yVals.length;
                                    return (
                                        <>
                                            <ReferenceLine x={xMean} stroke="var(--border-color)" strokeWidth={2} strokeDasharray="5 5" />
                                            <ReferenceLine y={yMean} stroke="var(--border-color)" strokeWidth={2} strokeDasharray="5 5" />
                                        </>
                                    );
                                })()}
                                {finalSeriesKeys.map((key, index) => {
                                    const config = seriesConfig[key] || {};
                                    const baseColor = config.color || activeColors[index % activeColors.length];
                                    const seriesData = processedData.map(d => ({
                                        ...d,
                                        size: splitByKey ? d[`${key}_size`] : d[bubbleSizeKey]
                                    }));
                                    return (
                                        <Scatter
                                            key={key || index}
                                            yAxisId={key === rightYAxisKey ? "right" : "left"}
                                            name={String(key)}
                                            data={seriesData}
                                            dataKey={key}
                                            fill={baseColor}
                                            shape="circle"
                                            isAnimationActive={false}
                                        />
                                    );
                                })}
                            </ScatterChart>
                        </ResponsiveContainer>
                    );
                case 'donut':
                    let donutCenterText = '';
                    let donutCenterSubtext = '';
                    if (donutCenterKpi !== 'none' && donutData.length > 0) {
                        const sum = donutData.reduce((acc, curr) => acc + (Number(curr[yAxisKeys[0]]) || 0), 0);
                        if (donutCenterKpi === 'total') {
                            donutCenterText = formatNumber(sum);
                            donutCenterSubtext = 'Total';
                        } else if (donutCenterKpi === 'average') {
                            donutCenterText = formatNumber(sum / donutData.length);
                            donutCenterSubtext = 'Average';
                        }
                    }

                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                {donutCenterKpi !== 'none' && donutThickness > 30 && (
                                    <>
                                        <text x="50%" y="50%" dy={-5} textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--text-active)', fontSize: '20px', fontWeight: 'bold' }}>
                                            {donutCenterText}
                                        </text>
                                        <text x="50%" y="50%" dy={15} textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                                            {donutCenterSubtext}
                                        </text>
                                    </>
                                )}
                                <Pie
                                    data={donutData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={donutThickness}
                                    outerRadius="80%"
                                    paddingAngle={2}
                                    dataKey={yAxisKeys[0]}
                                    nameKey={xAxisKey}
                                    label={showLabels ? renderCustomizedLabel : false}
                                    labelLine={showLabels && donutLabelPosition === 'outside'}
                                    isAnimationActive={false}
                                >
                                    {donutData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={seriesConfig[entry[xAxisKey]]?.color || activeColors[index % activeColors.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} formatter={renderTooltipFormatter} />
                                {legendPosition !== 'none' && <Legend {...legendProps} />}
                            </PieChart>
                        </ResponsiveContainer>
                    );
                default:
                    return <div>Unsupported</div>;
            }
        } catch (err) {
            console.error("Chart Render Error:", err);
            return <div style={{ color: 'red', padding: 20 }}>Error rendering chart: {err.message}</div>;
        }
    }, [
        processedData, chartType, xAxisKey, yAxisKeys, rightYAxisKey, seriesConfig, customAxisTitles,
        xAxisLabelAngle, legendPosition, highlightConfig, barStackMode, barRadius, barColorMode,
        donutThickness, donutCenterKpi, scatterQuadrants, yDomain, yScale, refLine, refArea,
        showLabels, lineType, lineAreaFill, showDots, isDateColumnMemo, CommonProps, XLabel, YLabel,
        tooltipStyle, legendProps, xAxisTickProps, xAxisTickFormatter, donutData, renderCustomizedLabel,
        activeColors, renderTooltipFormatter, dynamicYAxisWidth, gridMode, renderCustomBarLabel,
        axisCommonProps, formatNumber, showXAxisTitle, showYAxisTitle, splitByKey, bubbleSizeKey, donutLabelPosition
    ]);

    const handleDownload = async () => {
        if (!chartRef.current) return;

        try {
            // Calculate a dynamic scale to ensure the output is at least Full HD (1920x1080)
            const currentWidth = chartRef.current.offsetWidth || 1;
            const currentHeight = chartRef.current.offsetHeight || 1;

            const targetWidth = 1920;
            const targetHeight = 1080;

            const scaleX = targetWidth / currentWidth;
            const scaleY = targetHeight / currentHeight;

            // Use the maximum scale needed to hit at least 1080p on both edges, 
            // ensuring the original aspect ratio is perfectly preserved and no lower than 2x.
            const dynamicScale = Math.max(scaleX, scaleY, 2);

            // Use html2canvas for robust screenshotting
            const canvas = await html2canvas(chartRef.current, {
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--surface-base').trim() || '#1e1f22', // Force dark background
                scale: dynamicScale, // Dynamic Full HD stringency
                logging: false,
                useCORS: true,
                ignoreElements: (element) => element.tagName === 'BUTTON' // Optional: Ignore the download button itself if inside ref? 
                // The ref is on the chart area, but let's be safe.
            });

            const pngFile = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.download = `chart_${chartType}_${Date.now()}.png`;
            downloadLink.href = pngFile;
            downloadLink.click();

        } catch (err) {
            console.error("Export failed:", err);
            // Fallback? No, alert user.
            alert("Could not export chart.");
        }
    };

    // --- CONFIGURATION SAVE / LOAD ---
    const performSaveConfig = async (filename, description) => {
        if (!filename.endsWith(".amoxvis")) {
            filename += ".amoxvis";
        }

        const config = {
            chartType, colorTheme, xAxisKey, yAxisKeys, rightYAxisKey, customAxisTitles,
            sortMode, limit, isDateColumn: isDateColumnMemo, dateAggregation, showDots, showLabels, dataLabelPosition, legendPosition,
            gridMode, xAxisLabelAngle, lineType, lineAreaFill, barStackMode, barRadius, barColorMode,
            donutThickness, donutCenterKpi, donutLabelContent, scatterQuadrants,
            yLogScale, yAxisDomain, refLine, refArea, highlightConfig, seriesConfig,
            chartTitle, chartSubtitle, chartFootnote, textAlign, showAxisLines, tooltipShowPercent,
            showXAxisTitle, showYAxisTitle,
            marginTop, marginBottom, marginLeft, marginRight, titleSpacing, // New margin/spacing configs
            query: query // Including the SQL query
        };

        try {
            const response = await fetch('http://localhost:3001/api/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: filename, // Save to root of workspace
                    content: JSON.stringify(config, null, 2)
                })
            });
            const result = await response.json();
            if (result.error) {
                return { success: false, error: result.error };
            } else {
                setIsSaveModalOpen(false); // Close Modal on success
                return { success: true, summary: `Chart successfully saved as '${filename}'! You can now edit it directly from the File Explorer.` };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const handleLoadConfig = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                if (config.chartType) setChartType(config.chartType);
                if (config.xAxisKey) setXAxisKey(config.xAxisKey);
                if (config.yAxisKeys) setYAxisKeys(config.yAxisKeys);
                if (config.rightYAxisKey !== undefined) setRightYAxisKey(config.rightYAxisKey);
                if (config.splitByKey !== undefined) setSplitByKey(config.splitByKey);
                if (config.bubbleSizeKey !== undefined) setBubbleSizeKey(config.bubbleSizeKey);
                if (config.dateAggregation !== undefined) setDateAggregation(config.dateAggregation);
                if (config.sortMode !== undefined) setSortMode(config.sortMode);
                if (config.maxItems !== undefined) setMaxItems(config.maxItems);
                if (config.numberFormat) setNumberFormat(config.numberFormat);
                if (config.lineType !== undefined) setLineType(config.lineType);
                if (config.lineAreaFill !== undefined) setLineAreaFill(config.lineAreaFill);
                if (config.lineSmooth !== undefined && config.lineType === undefined) setLineType(config.lineSmooth ? 'monotone' : 'linear'); // migration
                if (config.showDots !== undefined) setShowDots(config.showDots);
                if (config.isCumulative !== undefined) setIsCumulative(config.isCumulative);
                if (config.yLogScale !== undefined) setYLogScale(config.yLogScale);
                else if (config.yAxisLog !== undefined) setYLogScale(config.yAxisLog); // legacy config support
                if (config.yAxisDomain !== undefined) setYAxisDomain(config.yAxisDomain);
                if (config.refLine !== undefined) setRefLine(config.refLine);
                if (config.refArea) setRefArea(config.refArea);
                if (config.barStackMode !== undefined) setBarStackMode(config.barStackMode);
                if (config.barRadius !== undefined) setBarRadius(config.barRadius);
                if (config.barStacked !== undefined && config.barStackMode === undefined) setBarStackMode(config.barStacked ? 'stack' : 'none'); // migration
                if (config.barColorMode) setBarColorMode(config.barColorMode);
                if (config.showXAxisTitle !== undefined) setShowXAxisTitle(config.showXAxisTitle);
                if (config.showYAxisTitle !== undefined) setShowYAxisTitle(config.showYAxisTitle);
                if (config.highlightConfig) setHighlightConfig(config.highlightConfig);
                if (config.scatterQuadrants !== undefined) setScatterQuadrants(config.scatterQuadrants);
                if (config.seriesConfig) setSeriesConfig(config.seriesConfig);
                if (config.customAxisTitles) setCustomAxisTitles(config.customAxisTitles);
                if (config.xAxisLabelAngle !== undefined) setXAxisLabelAngle(config.xAxisLabelAngle);
                if (config.legendPosition) setLegendPosition(config.legendPosition);
                if (config.colorTheme) setColorTheme(config.colorTheme);
                if (config.donutThickness !== undefined) setDonutThickness(config.donutThickness);
                if (config.donutLabelContent) setDonutLabelContent(config.donutLabelContent);
                if (config.donutLabelPosition) setDonutLabelPosition(config.donutLabelPosition);
                if (config.donutGroupingThreshold !== undefined) setDonutGroupingThreshold(config.donutGroupingThreshold);
                if (config.donutCenterKpi !== undefined) setDonutCenterKpi(config.donutCenterKpi);
                if (config.chartTitle !== undefined) {
                    setChartTitle(config.chartTitle);
                    if (titleRef.current) titleRef.current.value = config.chartTitle;
                }
                if (config.chartSubtitle !== undefined) {
                    setChartSubtitle(config.chartSubtitle);
                    if (subtitleRef.current) subtitleRef.current.value = config.chartSubtitle;
                }
                if (config.chartFootnote !== undefined) {
                    setChartFootnote(config.chartFootnote);
                    if (footnoteRef.current) footnoteRef.current.value = config.chartFootnote;
                }
                if (config.textAlign) setTextAlign(config.textAlign);
                if (config.gridMode) setGridMode(config.gridMode);
                if (config.showAxisLines !== undefined) setShowAxisLines(config.showAxisLines);
                if (config.showLabels !== undefined) setShowLabels(config.showLabels);
                if (config.tooltipShowPercent !== undefined) setTooltipShowPercent(config.tooltipShowPercent);
                if (config.dataLabelPosition) setDataLabelPosition(config.dataLabelPosition);
                // Load new margin/spacing configs
                if (config.marginTop !== undefined) setMarginTop(config.marginTop);
                if (config.marginBottom !== undefined) setMarginBottom(config.marginBottom);
                if (config.marginLeft !== undefined) setMarginLeft(config.marginLeft);
                if (config.marginRight !== undefined) setMarginRight(config.marginRight);
                if (config.titleSpacing !== undefined) setTitleSpacing(config.titleSpacing);
            } catch (err) {
                console.error("Error loading config:", err);
                alert("Failed to parse configuration file.");
            }
        };
        reader.readAsText(file);
        event.target.value = null; // Reset input
    };

    if (!data || data.length === 0) return <div>No data to visualize</div>;

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}>
            <SaveQueryModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onSave={performSaveConfig}
                initialName="my_chart.amoxvis"
                title="Save Chart Layout"
                placeholder="my_chart.amoxvis"
                hideDescription={true}
            />

            {/* Controls Panel - Hidden in Report Mode */}
            {!isReportMode && (
                <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--border-color)', padding: '15px', overflowY: 'auto', backgroundColor: 'var(--panel-bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: 'var(--text-active)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Configuration
                        </h3>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <input
                                type="file"
                                accept=".json"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleLoadConfig}
                            />
                            <button
                                onClick={() => fileInputRef.current.click()}
                                title="Load Configuration"
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <LuUpload size={14} />
                            </button>
                            <button
                                onClick={() => setIsSaveModalOpen(true)}
                                title="Save Configuration"
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <LuSave size={14} />
                            </button>
                            <button
                                onClick={handleDownload}
                                title="Download Chart as PNG"
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <LuDownload size={14} /> PNG
                            </button>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '15px' }}>
                        {['Data', 'Story', 'Style', 'Axes'].map(tab => {
                            const tabKey = tab.toLowerCase();
                            return (
                                <button
                                    key={tabKey}
                                    onClick={() => setActiveTab(tabKey)}
                                    style={{
                                        flex: 1, padding: '6px 0', background: 'transparent', border: 'none',
                                        borderBottom: activeTab === tabKey ? '2px solid var(--accent-color-user)' : '2px solid transparent',
                                        color: activeTab === tabKey ? 'var(--text-active)' : 'var(--text-muted)',
                                        cursor: 'pointer', fontSize: '11px', fontWeight: activeTab === tabKey ? '600' : '500', transition: 'all 0.2s'
                                    }}
                                >
                                    {tab}
                                </button>
                            );
                        })}
                    </div>

                    {/* --- TAB: DATA --- */}
                    {activeTab === 'data' && (
                        <>

                            {/* --- CHART TYPE --- */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>Chart Type</label>
                                <select
                                    value={chartType}
                                    onChange={(e) => setChartType(e.target.value)}
                                    style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                >
                                    <option value="line">Line Chart</option>
                                    <option value="bar">Vertical Bar Chart</option>
                                    <option value="bar-horizontal">Horizontal Bar Chart</option>
                                    <option value="scatter">Scatter Chart</option>
                                    <option value="donut">Donut Chart</option>
                                </select>
                            </div>

                            {/* --- DATA SELECTION --- */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                                    {defaultXLabel}
                                </label>
                                <select
                                    value={xAxisKey}
                                    onChange={(e) => setXAxisKey(e.target.value)}
                                    style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                >
                                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                                </select>
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                                    {defaultYLabel}
                                    {splitByKey && <span style={{ color: 'var(--accent-color-user)', fontStyle: 'italic', marginLeft: 5 }}>(Value to Pivot)</span>}
                                </label>
                                {splitByKey ? (
                                    <select
                                        value={yAxisKeys[0] || ''}
                                        onChange={(e) => setYAxisKeys([e.target.value])}
                                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                    >
                                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                                    </select>
                                ) : (
                                    <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '5px', borderRadius: '4px', backgroundColor: 'var(--input-bg)' }}>
                                        {columns.map(col => (
                                            <label key={col} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={yAxisKeys.includes(col)}
                                                    onChange={() => handleYAxisChange(col)}
                                                    disabled={yAxisKeys.length === 1 && yAxisKeys.includes(col)}
                                                    style={{ accentColor: 'var(--accent-primary)' }}
                                                />
                                                {col}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {yAxisKeys.length > 0 && !splitByKey && chartType !== 'donut' && chartType !== 'bar-horizontal' && (
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
                                        Secondary Y-Axis (Right)
                                    </label>
                                    <select
                                        value={rightYAxisKey}
                                        onChange={(e) => setRightYAxisKey(e.target.value)}
                                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                    >
                                        <option value="">(None)</option>
                                        {yAxisKeys.map(col => <option key={col} value={col}>{col}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* --- SORTING & LIMITS --- */}
                            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 2 }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: '500' }}>Sort By</label>
                                    <select
                                        value={sortMode}
                                        onChange={(e) => setSortMode(e.target.value)}
                                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                    >
                                        <option value="x-asc">Axis Label Asc</option>
                                        <option value="x-desc">Axis Label Desc</option>
                                        <option value="y-desc">Value (Y) Desc</option>
                                        <option value="y-asc">Value (Y) Asc</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: '500' }}>Limit</label>
                                    <input
                                        type="number"
                                        placeholder="All"
                                        value={limit === 0 ? '' : limit}
                                        onChange={(e) => setLimit(e.target.value === '' ? 0 : Number(e.target.value))}
                                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                    />
                                </div>
                            </div>

                            {/* --- ADVANCED DATA OPTIONS --- */}
                            {
                                isDateColumnMemo && (
                                    <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--accent-color-user)', marginBottom: '8px', fontWeight: '600' }}>
                                            <LuCalendar size={12} /> Date Aggregation
                                        </label>
                                        <select
                                            value={dateAggregation}
                                            onChange={(e) => setDateAggregation(e.target.value)}
                                            style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                        >
                                            <option value="none">Raw Data (Daily/Exact)</option>
                                            <option value="month">Group by Month</option>
                                            <option value="year">Group by Year</option>
                                        </select>
                                    </div>
                                )
                            }

                            {
                                chartType !== 'donut' && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: '500' }}>
                                            <LuGitMerge size={12} /> Split By Column
                                        </label>
                                        <select
                                            value={splitByKey}
                                            onChange={(e) => setSplitByKey(e.target.value)}
                                            style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                        >
                                            <option value="">(None)</option>
                                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                                        </select>
                                    </div>
                                )
                            }

                            {
                                chartType === 'scatter' && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', fontWeight: '500' }}>
                                            <LuCircle size={12} /> Bubble Size
                                        </label>
                                        <select
                                            value={bubbleSizeKey}
                                            onChange={(e) => setBubbleSizeKey(e.target.value)}
                                            style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                        >
                                            <option value="">(Uniform Size)</option>
                                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                                        </select>
                                    </div>
                                )
                            }

                            {
                                chartType === 'donut' && (
                                    <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ marginBottom: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Group Small Slices (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={donutGroupingThreshold}
                                                onChange={(e) => setDonutGroupingThreshold(Number(e.target.value))}
                                                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }}
                                            />
                                            <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>Slices {'<'} % will be grouped into "Others".</span>
                                        </div>
                                    </div>
                                )
                            }
                        </>
                    )}

                    {/* --- TAB: STORY --- */}
                    {activeTab === 'story' && (
                        <>
                            {/* --- STORYTELLING (Texts) --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>Storytelling</h4>

                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Text Alignment</label>
                                    <select value={textAlign} onChange={(e) => setTextAlign(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                        <option value="left">Left</option>
                                        <option value="center">Center</option>
                                        <option value="right">Right</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Title</label>
                                    <input type="text" placeholder="Chart Title" defaultValue={chartTitle} ref={titleRef} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Subtitle</label>
                                    <input type="text" placeholder="Chart Subtitle" defaultValue={chartSubtitle} ref={subtitleRef} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Footnote</label>
                                    <input type="text" placeholder="Data source or footnote" defaultValue={chartFootnote} ref={footnoteRef} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                </div>
                                <button onClick={() => { setChartTitle(titleRef.current.value); setChartSubtitle(subtitleRef.current.value); setChartFootnote(footnoteRef.current.value); }} style={{ width: '100%', padding: '6px', background: 'var(--accent-color-user)', color: 'var(--button-text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', marginTop: '5px' }}>
                                    Apply Text
                                </button>
                            </div>

                            {/* --- SPACING & MARGINS --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Margins & Spacing</h4>

                                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Title Gap</label>
                                        <input type="number" value={titleSpacing} onChange={(e) => setTitleSpacing(Number(e.target.value))} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Chart Top</label>
                                        <input type="number" value={marginTop} onChange={(e) => setMarginTop(Number(e.target.value))} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Chart Bottom</label>
                                        <input type="number" value={marginBottom} onChange={(e) => setMarginBottom(Number(e.target.value))} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Chart Left</label>
                                        <input type="number" value={marginLeft} onChange={(e) => setMarginLeft(Number(e.target.value))} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Chart Right</label>
                                        <input type="number" value={marginRight} onChange={(e) => setMarginRight(Number(e.target.value))} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                    <div style={{ flex: 1 }}></div>
                                </div>
                            </div>

                            {/* --- DONUT CENTER KPI --- */}
                            {chartType === 'donut' && (
                                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Donut Center</h4>
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Center Metric Overlay</label>
                                        <select value={donutCenterKpi} onChange={(e) => setDonutCenterKpi(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                            <option value="none">None</option>
                                            <option value="total">Sum of Values (Total)</option>
                                            <option value="average">Average of Values</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* --- REFERENCE LINE --- */}
                            {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter') && (
                                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Reference Line</h4>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Y Value</label>
                                        <input type="text" placeholder="Enter value..." value={refLine.value} onChange={(e) => setRefLine({ ...refLine, value: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '6px', fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Label</label>
                                        <input type="text" placeholder="e.g. Goal" value={refLine.label} onChange={(e) => setRefLine({ ...refLine, label: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '6px', fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Color</label>
                                        <SimpleColorPicker color={refLine.color} onChange={(val) => setRefLine({ ...refLine, color: val })} />
                                    </div>
                                </div>
                            )}

                            {/* --- REFERENCE AREA --- */}
                            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Reference Area (Range)</h4>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>X-Axis Range</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" placeholder="Start" value={refArea.x1} onChange={(e) => setRefArea({ ...refArea, x1: e.target.value })} style={{ flex: 1, minWidth: 0, background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '6px', fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box' }} />
                                        <input type="text" placeholder="End" value={refArea.x2} onChange={(e) => setRefArea({ ...refArea, x2: e.target.value })} style={{ flex: 1, minWidth: 0, background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '6px', fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box' }} />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Y-Axis Range</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" placeholder="Start" value={refArea.y1} onChange={(e) => setRefArea({ ...refArea, y1: e.target.value })} style={{ flex: 1, minWidth: 0, background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '6px', fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box' }} />
                                        <input type="text" placeholder="End" value={refArea.y2} onChange={(e) => setRefArea({ ...refArea, y2: e.target.value })} style={{ flex: 1, minWidth: 0, background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '6px', fontSize: '11px', borderRadius: '4px', boxSizing: 'border-box' }} />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Color</label>
                                    <SimpleColorPicker color={refArea.color} onChange={(val) => setRefArea({ ...refArea, color: val })} />
                                </div>
                            </div>
                        </>
                    )}

                    {/* --- TAB: STYLE --- */}
                    {activeTab === 'style' && (
                        <>
                            {/* --- DATA LABELS --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-primary)', textTransform: 'uppercase' }}>Data Labels & Annotations</h4>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: showLabels ? '8px' : '0' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
                                        Show Data Labels
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={tooltipShowPercent} onChange={(e) => setTooltipShowPercent(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} />
                                        Show % of Total in Tooltip
                                    </label>
                                </div>

                                {showLabels && chartType !== 'donut' && (
                                    <div style={{ paddingLeft: '22px', marginBottom: '10px', marginTop: '10px' }}>
                                        <select value={dataLabelPosition} onChange={(e) => setDataLabelPosition(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                            <option value="outside">Outside</option>
                                            <option value="inside-center">Inside Center</option>
                                            <option value="inside-start">Inside Start</option>
                                            <option value="inside-end">Inside End</option>
                                        </select>
                                    </div>
                                )}

                                {chartType === 'donut' && showLabels && (
                                    <>
                                        <div style={{ marginBottom: '10px', paddingLeft: '22px', marginTop: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Label Content</label>
                                            <select value={donutLabelContent} onChange={(e) => setDonutLabelContent(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="percent">Percentage Only</option>
                                                <option value="value">Value Only</option>
                                                <option value="name">Name Only</option>
                                                <option value="name_percent">Name + Percentage</option>
                                                <option value="name_value">Name + Value</option>
                                            </select>
                                        </div>
                                        <div style={{ marginBottom: '10px', paddingLeft: '22px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Position</label>
                                            <select value={donutLabelPosition} onChange={(e) => setDonutLabelPosition(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="outside">Outside</option>
                                                <option value="inside">Inside</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* --- LEGEND SETTINGS --- */}
                            {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter' || chartType === 'donut') && (
                                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Legend</h4>
                                    <div>
                                        <select value={legendPosition} onChange={(e) => setLegendPosition(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                            <option value="top">Top</option>
                                            <option value="bottom">Bottom</option>
                                            <option value="left">Left</option>
                                            <option value="right">Right</option>
                                            <option value="none">Hidden</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* --- SERIES STYLING --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Aesthetics</h4>

                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Color Theme</label>
                                    <select value={colorTheme} onChange={(e) => setColorTheme(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                        <optgroup label="Default">
                                            <option value="default">AmoxSQL Default</option>
                                        </optgroup>
                                        <optgroup label="Qualitative (Categorical)">
                                            <option value="set1">Set 1</option>
                                            <option value="set2">Set 2</option>
                                            <option value="pastel2">Pastes</option>
                                            <option value="dark2">Dark</option>
                                        </optgroup>
                                        <optgroup label="Sequential">
                                            <option value="blues">Blues</option>
                                            <option value="greens">Greens</option>
                                            <option value="reds">Reds</option>
                                            <option value="ylorbr">Yellow-Orange-Brown</option>
                                        </optgroup>
                                        <optgroup label="Diverging">
                                            <option value="spectral">Spectral</option>
                                            <option value="rdylbu">Red-Yellow-Blue</option>
                                            <option value="rdylgn">Red-Yellow-Green</option>
                                            <option value="piyg">Pink-Yellow-Green</option>
                                        </optgroup>
                                    </select>
                                </div>

                                {chartType === 'line' && (
                                    <>
                                        <div style={{ marginBottom: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Line Interpolation</label>
                                            <select value={lineType} onChange={(e) => setLineType(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="monotone">Smooth (Natural)</option>
                                                <option value="linear">Linear (Straight)</option>
                                                <option value="step">Step</option>
                                                <option value="stepBefore">Step Before</option>
                                                <option value="stepAfter">Step After</option>
                                            </select>
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={lineAreaFill} onChange={(e) => setLineAreaFill(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Fill Area (Area Chart)
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={showDots} onChange={(e) => setShowDots(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Show Points
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={isCumulative} onChange={(e) => setIsCumulative(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Cumulative Sum (Running Total)
                                        </label>
                                    </>
                                )}

                                {(chartType === 'bar' || chartType === 'bar-horizontal') && (
                                    <>
                                        <div style={{ marginBottom: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Bar Layout</label>
                                            <select value={barStackMode} onChange={(e) => setBarStackMode(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="none">Grouped (Side-by-side)</option>
                                                <option value="stack">Stacked (Absolute)</option>
                                                <option value="expand">100% Stacked (Proportional)</option>
                                            </select>
                                        </div>
                                        <div style={{ marginBottom: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Border Radius: {barRadius}px</label>
                                            <input type="range" min="0" max="20" value={barRadius} onChange={(e) => setBarRadius(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                                        </div>
                                        {barStackMode === 'none' && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Color Mode</label>
                                                <select value={barColorMode} onChange={(e) => setBarColorMode(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                    <option value="series">By Series (Uniform)</option>
                                                    <option value="dimension">By Category (Varied)</option>
                                                    <option value="intensity">Color Intensity by Value</option>
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )}

                                {chartType === 'donut' && (
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Inner Radius (Thickness): {donutThickness}</label>
                                        <input type="range" min="0" max="90" value={donutThickness} onChange={(e) => setDonutThickness(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                                    </div>
                                )}

                                {chartType === 'scatter' && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                        <input type="checkbox" checked={scatterQuadrants} onChange={(e) => setScatterQuadrants(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Show Automatic Quadrants (Mean Crosshairs)
                                    </label>
                                )}

                                {/* Highlight Rules */}
                                {(chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'line') && (
                                    <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Highlight Rule</label>
                                        <select value={highlightConfig.type} onChange={(e) => setHighlightConfig({ ...highlightConfig, type: e.target.value })} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px', marginBottom: '8px' }}>
                                            <option value="none">None</option>
                                            <option value="max">Max Value</option>
                                            <option value="min">Min Value</option>
                                            <option value="exact">Specific Category</option>
                                        </select>

                                        {highlightConfig.type === 'exact' && (
                                            <input type="text" placeholder="Category to highlight..." value={highlightConfig.value} onChange={(e) => setHighlightConfig({ ...highlightConfig, value: e.target.value })} style={{ width: '100%', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px', marginBottom: '8px' }} />
                                        )}

                                        {highlightConfig.type !== 'none' && (
                                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                <SimpleColorPicker color={highlightConfig.color} onChange={(val) => setHighlightConfig({ ...highlightConfig, color: val })} />
                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Highlight Color</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* --- INDIVIDUAL COLORS --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Color Pickers</h4>

                                {chartType === 'donut' ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                                        {donutData.map((d, i) => {
                                            const key = d[xAxisKey];
                                            const color = seriesConfig[key]?.color || activeColors[i % activeColors.length];
                                            return (
                                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <SimpleColorPicker color={color} colorTheme={colorTheme} onChange={(val) => setSeriesConfig({ ...seriesConfig, [key]: { ...seriesConfig[key], color: val } })} />
                                                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={key}>{key}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <>
                                        {finalSeriesKeys.map((key, i) => {
                                            const currentConfig = seriesConfig[key] || {};
                                            const currentColor = currentConfig.color || activeColors[i % activeColors.length];
                                            const currentStyle = currentConfig.style || 'solid';

                                            return (
                                                <div key={key} style={{ marginBottom: '10px' }}>
                                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</label>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <SimpleColorPicker color={currentColor} onChange={(val) => { setSeriesConfig({ ...seriesConfig, [key]: { ...seriesConfig[key], color: val } }); }} />
                                                        {chartType === 'line' && (
                                                            <select value={currentStyle} onChange={(e) => { setSeriesConfig({ ...seriesConfig, [key]: { ...seriesConfig[key], style: e.target.value } }); }} style={{ flex: 1, backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', fontSize: '10px' }}>
                                                                <option value="solid">Solid</option>
                                                                <option value="dashed">Dashed</option>
                                                                <option value="dotted">Dotted</option>
                                                            </select>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>

                        </>
                    )}

                    {/* --- TAB: AXES --- */}
                    {activeTab === 'axes' && (
                        <>
                            {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter') && (
                                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Axes & Scale</h4>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>Number Format</label>
                                        <select value={numberFormat} onChange={(e) => setNumberFormat(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}>
                                            <option value="compact">Auto (Compact - 1.2k)</option>
                                            <option value="standard">Standard (1,234.56)</option>
                                            <option value="currency">Currency ($1,234)</option>
                                            <option value="thousands">Thousands (1.2k)</option>
                                            <option value="millions">Millions (1.2M)</option>
                                            <option value="billions">Billions (1.2B)</option>
                                            <option value="raw">Raw (1234.56)</option>
                                        </select>
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                        <input type="checkbox" checked={showAxisLines} onChange={(e) => setShowAxisLines(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Show Axis Lines & Ticks
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                        <input type="checkbox" checked={yLogScale} onChange={(e) => setYLogScale(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Logarithmic Scale ({chartType === 'bar-horizontal' ? 'Bottom Values' : 'Y'})
                                    </label>

                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{chartType === 'bar-horizontal' ? 'Bottom Value Min' : 'Y Min'}</label>
                                            <input type="number" placeholder="Auto" value={yAxisDomain[0] === 'auto' ? '' : yAxisDomain[0]} onChange={(e) => setYAxisDomain([e.target.value === '' ? 'auto' : e.target.value, yAxisDomain[1]])} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{chartType === 'bar-horizontal' ? 'Bottom Value Max' : 'Y Max'}</label>
                                            <input type="number" placeholder="Auto" value={yAxisDomain[1] === 'auto' ? '' : yAxisDomain[1]} onChange={(e) => setYAxisDomain([yAxisDomain[0], e.target.value === '' ? 'auto' : e.target.value])} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Grid Lines</label>
                                        <select value={gridMode} onChange={(e) => setGridMode(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                            <option value="both">Both (Horizontal & Vertical)</option>
                                            <option value="horizontal">Horizontal Only</option>
                                            <option value="vertical">Vertical Only</option>
                                            <option value="none">None</option>
                                        </select>
                                    </div>

                                    <div style={{ marginBottom: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <label style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{chartType === 'bar-horizontal' ? 'Bottom Axis (X) Title' : 'X-Axis Title'}</label>
                                            <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={showXAxisTitle} onChange={(e) => setShowXAxisTitle(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Show
                                            </label>
                                        </div>
                                        <input type="text" placeholder={defaultXLabel} value={customAxisTitles.x} onChange={(e) => setCustomAxisTitles({ ...customAxisTitles, x: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px', opacity: showXAxisTitle ? 1 : 0.5 }} disabled={!showXAxisTitle} />
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <label style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{chartType === 'bar-horizontal' ? 'Left Axis (Y) Title' : 'Y-Axis Title'}</label>
                                            <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={showYAxisTitle} onChange={(e) => setShowYAxisTitle(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Show
                                            </label>
                                        </div>
                                        <input type="text" placeholder={defaultYLabel} value={customAxisTitles.y} onChange={(e) => setCustomAxisTitles({ ...customAxisTitles, y: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px', opacity: showYAxisTitle ? 1 : 0.5 }} disabled={!showYAxisTitle} />
                                    </div>

                                    {(chartType === 'line' || chartType === 'bar') && (
                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>X-Axis Label Rotation</label>
                                            <select value={xAxisLabelAngle} onChange={(e) => setXAxisLabelAngle(Number(e.target.value))} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="0">0° (Horizontal)</option>
                                                <option value="45">45°</option>
                                                <option value="90">90° (Vertical)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Chart Area */}
            < div style={{
                flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: isReportMode ? 'transparent' : 'var(--chart-bg)', overflow: isReportMode ? 'visible' : 'hidden',
                ...(isFullscreen ? {
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    padding: '40px'
                } : {})
            }}>
                {!isReportMode && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: isFullscreen ? '0 0 10px 0' : '10px 20px 0 0' }}>
                        {isFullscreen && (
                            <button
                                onClick={handleDownload}
                                title="Download Chart as PNG"
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
                                    display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => { e.target.style.color = 'var(--text-active)'; e.target.style.borderColor = 'var(--accent-color-user)'; }}
                                onMouseOut={(e) => { e.target.style.color = 'var(--text-muted)'; e.target.style.borderColor = 'var(--border-color)'; }}
                            >
                                <LuDownload size={14} /> PNG
                            </button>
                        )}
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Data'}
                            style={{
                                background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.2s'
                            }}
                            onMouseOver={(e) => e.target.style.color = 'var(--text-active)'}
                            onMouseOut={(e) => e.target.style.color = 'var(--text-muted)'}
                        >
                            {isFullscreen ? <LuMinimize size={18} /> : <LuMaximize size={16} />}
                        </button>
                    </div>
                )}
                <div ref={chartRef} style={{ flex: 1, padding: isFullscreen ? '0 20px 20px 20px' : '0 20px 20px 20px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                    {chartTitle && <h2 style={{ textAlign: textAlign, margin: `0 0 ${titleSpacing}px 0`, color: 'var(--text-active)', fontSize: '18px', fontWeight: '600', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartTitle}</h2>}
                    {chartSubtitle && <h3 style={{ textAlign: textAlign, margin: `0 0 ${titleSpacing}px 0`, color: 'var(--text-muted)', fontSize: '14px', fontWeight: '400', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartSubtitle}</h3>}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '10px', minWidth: '10px', width: '100%', height: '100%' }}>
                        {ChartContent}
                    </div>
                    {chartFootnote && <div style={{ textAlign: textAlign, marginTop: `${titleSpacing}px`, color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', borderTop: '1px solid var(--border-color)', paddingTop: '5px', whiteSpace: 'pre-wrap', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartFootnote}</div>}
                </div>
            </div >
        </div >
    );
});

export default DataVisualizer;
