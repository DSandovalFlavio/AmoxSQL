import { memo, useState, useMemo, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, LabelList
} from 'recharts';
import { LuDownload, LuCalendar, LuGitMerge, LuCircle, LuMaximize, LuMinimize, LuSave, LuUpload } from "react-icons/lu";

// Distinctive color palette
const COLORS = [
    '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#3B3EAC', '#0099C6',
    '#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11',
    '#6633CC', '#E67300', '#8B0707', '#329262', '#5574A6'
];

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
                    width: '210px', marginTop: '5px'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '10px' }}>
                        {COLORS.map(c => (
                            <div
                                key={c}
                                onClick={() => { onChange(c); setIsOpen(false); }}
                                style={{
                                    width: '20px', height: '20px',
                                    backgroundColor: c,
                                    cursor: 'pointer',
                                    border: color === c ? '2px solid white' : '1px solid #333',
                                    borderRadius: '2px'
                                }}
                                title={c}
                            />
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px', color: '#888' }}>Hex:</span>
                        <input
                            type="text"
                            value={color}
                            onChange={(e) => onChange(e.target.value)}
                            style={{
                                flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                color: 'var(--text-active)', fontSize: '11px', padding: '4px'
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

const DataVisualizer = memo(({ data, isReportMode = false }) => {
    const [chartType, setChartType] = useState('line');
    const [xAxisKey, setXAxisKey] = useState('');
    const [yAxisKeys, setYAxisKeys] = useState([]);
    const [splitByKey, setSplitByKey] = useState('');
    const [dateAggregation, setDateAggregation] = useState('none');
    const [showLabels, setShowLabels] = useState(false);
    const [dataLabelPosition, setDataLabelPosition] = useState('outside'); // 'outside', 'inside-end', 'inside-center', 'inside-start'
    const [bubbleSizeKey, setBubbleSizeKey] = useState('');

    // --- New Customization State ---
    // General
    const [sortMode, setSortMode] = useState('x-asc'); // x-asc, x-desc, y-asc, y-desc
    const [maxItems, setMaxItems] = useState(50); // Limit number of items shown
    const [numberFormat, setNumberFormat] = useState('compact'); // 'compact', 'standard', 'thousands', 'millions', 'billions', 'raw'

    // Line / General
    const [lineSmooth, setLineSmooth] = useState(true);
    const [showDots, setShowDots] = useState(true);
    const [isCumulative, setIsCumulative] = useState(false);
    const [yAxisLog, setYAxisLog] = useState(false);
    const [yAxisDomain, setYAxisDomain] = useState(['auto', 'auto']); // [min, max]
    const [refLine, setRefLine] = useState({ value: '', label: '', color: 'red' });

    // Bar
    const [barStacked, setBarStacked] = useState(false);
    const [barColorMode, setBarColorMode] = useState('series'); // 'series' or 'dimension' (x-value)
    const [highlightConfig, setHighlightConfig] = useState({ type: 'none', value: '', color: '#ff0000' }); // type: none, max, min, mask (specific value)

    // Series Customization (Line/Bar colors & styles)
    const [seriesConfig, setSeriesConfig] = useState({}); // { [key]: { color: '#...', style: 'solid' | 'dashed' | 'dotted' } }
    const [customAxisTitles, setCustomAxisTitles] = useState({ x: '', y: '' });
    const [xAxisLabelAngle, setXAxisLabelAngle] = useState(0); // 0, 45, 90
    const [legendPosition, setLegendPosition] = useState('bottom'); // top, bottom, left, right

    // Donut
    const [donutThickness, setDonutThickness] = useState(60);
    const [donutLabelContent, setDonutLabelContent] = useState('name_percent'); // 'percent', 'value', 'name', 'name_percent', 'name_value'
    const [donutLabelPosition, setDonutLabelPosition] = useState('outside'); // 'inside', 'outside'
    const [donutGroupingThreshold, setDonutGroupingThreshold] = useState(0); // 0-100% threshold for "Others" // Inner Radius

    // Scatter
    // ...

    // Storytelling State
    const [chartTitle, setChartTitle] = useState('');
    const [chartSubtitle, setChartSubtitle] = useState('');
    const [chartFootnote, setChartFootnote] = useState('');
    const titleRef = useRef(null);
    const subtitleRef = useRef(null);
    const footnoteRef = useRef(null);
    const [textAlign, setTextAlign] = useState('center'); // 'center', 'left'
    const [gridMode, setGridMode] = useState('both'); // 'both', 'horizontal', 'vertical', 'none'
    const [showAxisLines, setShowAxisLines] = useState(true);

    // Ref for chart export
    const chartRef = useRef(null);

    // Ref for file upload
    const fileInputRef = useRef(null);

    // Fullscreen and Tab state
    const [isFullscreen, setIsFullscreen] = useState(false);
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

    // Detect if X-Axis is a Date column
    const isDateColumn = useMemo(() => {
        if (!xAxisKey || !data || data.length === 0) return false;
        const val = data.find(r => r[xAxisKey] != null)?.[xAxisKey];
        if (typeof val !== 'string') return false;
        return /^\d{4}-\d{2}-\d{2}/.test(val);
    }, [data, xAxisKey]);

    // --- MEMOIZED CONFIGS (Top Level) ---

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
        fill: '#888',
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
            if (isDateColumn) {
                if (dateAggregation === 'month') key = String(key).substring(0, 7);
                else if (dateAggregation === 'year') key = String(key).substring(0, 4);
                else key = formatDateLabel(key);
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
        if (maxItems > 0 && result.length > maxItems) {
            result = result.slice(0, Number(maxItems));
        }

        return { processedData: result, finalSeriesKeys: seriesKeys };

    }, [data, xAxisKey, yAxisKeys, splitByKey, isDateColumn, dateAggregation, bubbleSizeKey, chartType, isCumulative, sortMode, maxItems]);


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
        let fill = '#ccc';

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
            fill = '#fff';
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
        if (str.length > 15) return str.substring(0, 15) + '...';
        return str;
    }, [formatNumber, dateAggregation]);

    let defaultXLabel = "X Axis Column";
    let defaultYLabel = "Y Axis Columns";
    if (chartType === 'bar-horizontal') {
        defaultXLabel = "Category Column (Y-Axis)";
        defaultYLabel = "Value Columns (X-Axis)";
    } else if (chartType === 'donut') {
        defaultXLabel = "Segment Label";
        defaultYLabel = "Segment Size";
    }

    // Chart Configuration Constants
    const CommonProps = useMemo(() => {
        let pt = 20;
        let pb = Number(xAxisLabelAngle) > 0 ? 70 : 40; // Base space for XAxis

        if (legendPosition === 'top') pt += 5; // Space strictly for legend
        if (legendPosition === 'bottom') pb += 5; // 40 + 30 = 70. Very stable.

        return {
            data: processedData,
            margin: { top: pt, right: 30, left: 20, bottom: pb },
            style: { fontSize: '12px' }
        };
    }, [processedData, legendPosition, xAxisLabelAngle]);

    // Domain & Scale
    const yDomain = useMemo(() => [
        yAxisDomain[0] !== '' && !isNaN(yAxisDomain[0]) ? Number(yAxisDomain[0]) : 'auto',
        yAxisDomain[1] !== '' && !isNaN(yAxisDomain[1]) ? Number(yAxisDomain[1]) : 'auto'
    ], [yAxisDomain]);
    const yScale = yAxisLog ? 'log' : 'auto';

    // Ref Line Element
    const renderRefLine = () => {
        if (!refLine.value) return null;
        return (
            <ReferenceLine
                y={Number(refLine.value)}
                label={{ value: refLine.label, position: 'top', fill: refLine.color, fontSize: 10 }}
                stroke={refLine.color}
                strokeDasharray="3 3"
            />
        );
    };

    // Axis Titles
    const XLabel = customAxisTitles.x || defaultXLabel || xAxisKey;
    const YLabel = customAxisTitles.y || defaultYLabel || 'Values';

    // --- CHART CONTENT MEMO ---
    const ChartContent = useMemo(() => {
        if (!processedData || processedData.length === 0) return <div style={{ color: 'var(--text-muted)' }}>No data to display</div>;

        try {
            switch (chartType) {
                case 'line':
                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart {...CommonProps}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={gridMode === 'both' || gridMode === 'vertical'} horizontal={gridMode === 'both' || gridMode === 'horizontal'} />
                                <XAxis
                                    {...axisCommonProps}
                                    dataKey={xAxisKey}
                                    stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    tickFormatter={xAxisTickFormatter}
                                    label={{ value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 }}
                                    height={Number(xAxisLabelAngle) > 0 ? 80 : 50}
                                />
                                <YAxis
                                    {...axisCommonProps}
                                    stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    tickFormatter={formatNumber}
                                    domain={yDomain}
                                    scale={yScale}
                                    allowDataOverflow={true}
                                    label={{ value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
                                />
                                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.2)' }} formatter={(value) => formatNumber(value)} labelFormatter={xAxisTickFormatter} />
                                <Legend {...legendProps} />
                                {renderRefLine()}
                                {finalSeriesKeys.map((key, index) => {
                                    const config = seriesConfig[key] || {};
                                    const color = config.color || COLORS[index % COLORS.length];
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
                                        <Line
                                            key={key || index}
                                            type={lineSmooth ? "monotone" : "linear"}
                                            dataKey={key}
                                            stroke={color}
                                            strokeWidth={2}
                                            strokeDasharray={strokeDash}
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
                            </LineChart>
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
                                            label={{ value: YLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 }}
                                            height={50}
                                        />
                                        <YAxis
                                            {...axisCommonProps}
                                            type="category"
                                            dataKey={xAxisKey}
                                            stroke="var(--border-color)"
                                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                            width={100}
                                            tickFormatter={xAxisTickFormatter}
                                            label={{ value: XLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
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
                                            label={{ value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 }}
                                            height={Number(xAxisLabelAngle) > 0 ? 80 : 50}
                                        />
                                        <YAxis
                                            {...axisCommonProps}
                                            stroke="var(--border-color)"
                                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                            tickFormatter={formatNumber}
                                            domain={yDomain}
                                            scale={yScale}
                                            label={{ value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
                                        />
                                    </>
                                )}

                                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} formatter={(value) => formatNumber(value)} labelFormatter={xAxisTickFormatter} />
                                <Legend {...legendProps} wrapperStyle={{ ...legendProps.wrapperStyle, paddingLeft: '10px' }} />

                                {renderRefLine()}

                                {finalSeriesKeys.map((key, index) => (
                                    <Bar
                                        key={key}
                                        dataKey={key}
                                        stackId={barStacked ? "a" : undefined}
                                        fill={COLORS[index % COLORS.length]}
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
                                            let finalColor = COLORS[index % COLORS.length];

                                            if (barColorMode === 'dimension') {
                                                finalColor = COLORS[entryIndex % COLORS.length];
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

                                            return <Cell key={`cell-${entryIndex}`} fill={finalColor} />;
                                        })}
                                    </Bar>
                                ))}
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
                                    type={isDateColumn ? "category" : "number"}
                                    name={XLabel}
                                    stroke="var(--border-color)"
                                    tick={xAxisTickProps}
                                    tickFormatter={xAxisTickFormatter}
                                    interval="preserveStartEnd"
                                    domain={['auto', 'auto']}
                                    label={{ value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: 12 }}
                                    height={Number(xAxisLabelAngle) > 0 ? 80 : 50}
                                />
                                <YAxis
                                    {...axisCommonProps}
                                    type="number"
                                    name={YLabel}
                                    stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                                    tickFormatter={formatNumber}
                                    label={{ value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 12 }}
                                />
                                <ZAxis
                                    type="number"
                                    dataKey="size"
                                    range={[60, 600]}
                                    name="Size"
                                />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} formatter={(value, name) => [formatNumber(value), name]} labelFormatter={xAxisTickFormatter} />
                                <Legend {...legendProps} />
                                {finalSeriesKeys.map((key, index) => {
                                    const seriesData = processedData.map(d => ({
                                        ...d,
                                        size: splitByKey ? d[`${key} _size`] : d[bubbleSizeKey]
                                    }));
                                    return (
                                        <Scatter
                                            key={key || index}
                                            name={String(key)}
                                            data={seriesData}
                                            dataKey={key}
                                            fill={COLORS[index % COLORS.length]}
                                            shape="circle"
                                            isAnimationActive={false}
                                        />
                                    );
                                })}
                            </ScatterChart>
                        </ResponsiveContainer>
                    );
                case 'donut':
                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
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
                                        <Cell key={`cell-${index}`} fill={seriesConfig[entry[xAxisKey]]?.color || COLORS[index % COLORS.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatNumber(value)} />
                                <Legend {...legendProps} />
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
    }, [processedData, chartType, xAxisKey, yAxisKeys, seriesConfig, customAxisTitles, xAxisLabelAngle, legendPosition, highlightConfig, barStacked, barColorMode, donutThickness, yDomain, yScale, refLine, showLabels, lineSmooth, showDots, isDateColumn, CommonProps, XLabel, YLabel, tooltipStyle, legendProps, xAxisTickProps, xAxisTickFormatter, donutData, renderCustomizedLabel]);

    const handleDownload = async () => {
        if (!chartRef.current) return;

        try {
            // Use html2canvas for robust screenshotting
            const canvas = await html2canvas(chartRef.current, {
                backgroundColor: '#1e1f22', // Force dark background
                scale: 2, // Retina quality
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
    const handleSaveConfig = () => {
        const config = {
            chartType, xAxisKey, yAxisKeys, splitByKey, bubbleSizeKey, dateAggregation,
            sortMode, maxItems, numberFormat, lineSmooth, showDots, isCumulative, yAxisLog, yAxisDomain, refLine,
            barStacked, barColorMode, highlightConfig,
            seriesConfig, customAxisTitles, xAxisLabelAngle, legendPosition,
            donutThickness, donutLabelContent, donutLabelPosition, donutGroupingThreshold,
            chartTitle, chartSubtitle, chartFootnote, textAlign, gridMode, showAxisLines, showLabels, dataLabelPosition
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `chart_config_${Date.now()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
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
                if (config.splitByKey !== undefined) setSplitByKey(config.splitByKey);
                if (config.bubbleSizeKey !== undefined) setBubbleSizeKey(config.bubbleSizeKey);
                if (config.dateAggregation !== undefined) setDateAggregation(config.dateAggregation);
                if (config.sortMode !== undefined) setSortMode(config.sortMode);
                if (config.maxItems !== undefined) setMaxItems(config.maxItems);
                if (config.numberFormat) setNumberFormat(config.numberFormat);
                if (config.lineSmooth !== undefined) setLineSmooth(config.lineSmooth);
                if (config.showDots !== undefined) setShowDots(config.showDots);
                if (config.isCumulative !== undefined) setIsCumulative(config.isCumulative);
                if (config.yAxisLog !== undefined) setYAxisLog(config.yAxisLog);
                if (config.yAxisDomain) setYAxisDomain(config.yAxisDomain);
                if (config.refLine) setRefLine(config.refLine);
                if (config.barStacked !== undefined) setBarStacked(config.barStacked);
                if (config.barColorMode) setBarColorMode(config.barColorMode);
                if (config.highlightConfig) setHighlightConfig(config.highlightConfig);
                if (config.seriesConfig) setSeriesConfig(config.seriesConfig);
                if (config.customAxisTitles) setCustomAxisTitles(config.customAxisTitles);
                if (config.xAxisLabelAngle !== undefined) setXAxisLabelAngle(config.xAxisLabelAngle);
                if (config.legendPosition) setLegendPosition(config.legendPosition);
                if (config.donutThickness !== undefined) setDonutThickness(config.donutThickness);
                if (config.donutLabelContent) setDonutLabelContent(config.donutLabelContent);
                if (config.donutLabelPosition) setDonutLabelPosition(config.donutLabelPosition);
                if (config.donutGroupingThreshold !== undefined) setDonutGroupingThreshold(config.donutGroupingThreshold);
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
                if (config.dataLabelPosition) setDataLabelPosition(config.dataLabelPosition);
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
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
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
                                onClick={handleSaveConfig}
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
                                            <label key={col} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', cursor: 'pointer', fontSize: '12px', color: '#ddd' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={yAxisKeys.includes(col)}
                                                    onChange={() => handleYAxisChange(col)}
                                                    disabled={yAxisKeys.length === 1 && yAxisKeys.includes(col)}
                                                    style={{ accentColor: '#00ffff' }}
                                                />
                                                {col}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* --- SORTING & LIMITS --- */}
                            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 2 }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>Sort By</label>
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
                                    <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>Limit</label>
                                    <input
                                        type="number"
                                        placeholder="All"
                                        value={maxItems === 0 ? '' : maxItems}
                                        onChange={(e) => setMaxItems(e.target.value === '' ? 0 : Number(e.target.value))}
                                        style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px' }}
                                    />
                                </div>
                            </div>

                            {/* --- ADVANCED DATA OPTIONS --- */}
                            {
                                isDateColumn && (
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
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>
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
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>
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
                                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Group Small Slices (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={donutGroupingThreshold}
                                                onChange={(e) => setDonutGroupingThreshold(Number(e.target.value))}
                                                style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }}
                                            />
                                            <span style={{ fontSize: '10px', color: '#666' }}>Slices {'<'} % will be grouped into "Others".</span>
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
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Storytelling</h4>

                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Text Alignment</label>
                                    <select value={textAlign} onChange={(e) => setTextAlign(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                        <option value="left">Left</option>
                                        <option value="center">Center</option>
                                        <option value="right">Right</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Title</label>
                                    <input type="text" placeholder="Chart Title" defaultValue={chartTitle} ref={titleRef} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Subtitle</label>
                                    <input type="text" placeholder="Chart Subtitle" defaultValue={chartSubtitle} ref={subtitleRef} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                </div>
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Footnote / Comments</label>
                                    <textarea placeholder="Add comments, sources, or insights..." defaultValue={chartFootnote} ref={footnoteRef} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px', minHeight: '50px', resize: 'vertical' }} />
                                </div>

                                <button
                                    onClick={() => {
                                        setChartTitle(titleRef.current?.value || '');
                                        setChartSubtitle(subtitleRef.current?.value || '');
                                        setChartFootnote(footnoteRef.current?.value || '');
                                    }}
                                    style={{
                                        width: '100%', backgroundColor: 'var(--panel-section-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '6px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: '500'
                                    }}
                                    onMouseOver={(e) => e.target.style.backgroundColor = 'var(--input-bg)'}
                                    onMouseOut={(e) => e.target.style.backgroundColor = 'var(--panel-section-bg)'}
                                >
                                    Apply Text
                                </button>
                            </div>

                            {/* --- DATA LABELS --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Data Labels & Annotations</h4>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: showLabels ? '8px' : '0' }}>
                                    <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} style={{ accentColor: '#00ffff' }} />
                                    Show Data Labels
                                </label>

                                {showLabels && chartType !== 'donut' && (
                                    <div style={{ paddingLeft: '22px', marginBottom: '10px', marginTop: '10px' }}>
                                        <select value={dataLabelPosition} onChange={(e) => setDataLabelPosition(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                            <option value="outside">Outside (Fuera)</option>
                                            <option value="inside-center">Inside Center (Dentro - Medio)</option>
                                            <option value="inside-start">Inside Start (Dentro - Inicio)</option>
                                            <option value="inside-end">Inside End (Dentro - Final)</option>
                                        </select>
                                    </div>
                                )}

                                {chartType === 'donut' && showLabels && (
                                    <>
                                        <div style={{ marginBottom: '10px', paddingLeft: '22px', marginTop: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Label Content</label>
                                            <select value={donutLabelContent} onChange={(e) => setDonutLabelContent(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="percent">Percentage Only</option>
                                                <option value="value">Value Only</option>
                                                <option value="name">Name Only</option>
                                                <option value="name_percent">Name + Percentage</option>
                                                <option value="name_value">Name + Value</option>
                                            </select>
                                        </div>
                                        <div style={{ marginBottom: '10px', paddingLeft: '22px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Position</label>
                                            <select value={donutLabelPosition} onChange={(e) => setDonutLabelPosition(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                <option value="outside">Outside</option>
                                                <option value="inside">Inside</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* --- REFERENCE LINE --- */}
                            {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter') && (
                                <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Reference Line</h4>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y Value</label>
                                        <input type="number" placeholder="Enter value..." value={refLine.value} onChange={(e) => setRefLine({ ...refLine, value: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Label</label>
                                        <input type="text" placeholder="e.g. Goal" value={refLine.label} onChange={(e) => setRefLine({ ...refLine, label: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Color</label>
                                        <SimpleColorPicker color={refLine.color} onChange={(val) => setRefLine({ ...refLine, color: val })} />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* --- TAB: STYLE --- */}
                    {activeTab === 'style' && (
                        <>
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
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* --- SERIES STYLING --- */}
                            <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: 'var(--panel-section-bg)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-active)', textTransform: 'uppercase' }}>Aesthetics</h4>

                                {chartType === 'line' && (
                                    <>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={lineSmooth} onChange={(e) => setLineSmooth(e.target.checked)} style={{ accentColor: '#00ffff' }} /> Smooth Lines
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={showDots} onChange={(e) => setShowDots(e.target.checked)} style={{ accentColor: '#00ffff' }} /> Show Points
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={isCumulative} onChange={(e) => setIsCumulative(e.target.checked)} style={{ accentColor: '#00ffff' }} /> Cumulative Sum (Running Total)
                                        </label>
                                    </>
                                )}

                                {(chartType === 'bar' || chartType === 'bar-horizontal') && (
                                    <>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                            <input type="checkbox" checked={barStacked} onChange={(e) => setBarStacked(e.target.checked)} style={{ accentColor: '#00ffff' }} /> Stack Bars
                                        </label>
                                        {!barStacked && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>Color Mode</label>
                                                <select value={barColorMode} onChange={(e) => setBarColorMode(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                                    <option value="series">By Series (Uniform)</option>
                                                    <option value="dimension">By Category (Varied)</option>
                                                </select>
                                            </div>
                                        )}
                                    </>
                                )}

                                {chartType === 'donut' && (
                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#ccc', marginBottom: '4px' }}>Inner Radius (Thickness): {donutThickness}</label>
                                        <input type="range" min="0" max="90" value={donutThickness} onChange={(e) => setDonutThickness(Number(e.target.value))} style={{ width: '100%', accentColor: '#00ffff' }} />
                                    </div>
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
                                            const color = seriesConfig[key]?.color || COLORS[i % COLORS.length];
                                            return (
                                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <SimpleColorPicker color={color} onChange={(val) => setSeriesConfig({ ...seriesConfig, [key]: { ...seriesConfig[key], color: val } })} />
                                                    <span style={{ fontSize: '10px', color: '#ccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={key}>{key}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <>
                                        {finalSeriesKeys.map((key, i) => {
                                            const currentConfig = seriesConfig[key] || {};
                                            const currentColor = currentConfig.color || COLORS[i % COLORS.length];
                                            const currentStyle = currentConfig.style || 'solid';

                                            return (
                                                <div key={key} style={{ marginBottom: '10px' }}>
                                                    <label style={{ display: 'block', fontSize: '11px', color: '#ddd', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}</label>
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

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                        <input type="checkbox" checked={showAxisLines} onChange={(e) => setShowAxisLines(e.target.checked)} style={{ accentColor: '#00ffff' }} /> Show Axis Lines & Ticks
                                    </label>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                        <input type="checkbox" checked={yAxisLog} onChange={(e) => setYAxisLog(e.target.checked)} style={{ accentColor: '#00ffff' }} /> Logarithmic Scale (Y)
                                    </label>

                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y Min</label>
                                            <input type="number" placeholder="Auto" value={yAxisDomain[0]} onChange={(e) => setYAxisDomain([e.target.value, yAxisDomain[1]])} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y Max</label>
                                            <input type="number" placeholder="Auto" value={yAxisDomain[1]} onChange={(e) => setYAxisDomain([yAxisDomain[0], e.target.value])} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Grid Lines</label>
                                        <select value={gridMode} onChange={(e) => setGridMode(e.target.value)} style={{ width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '11px' }}>
                                            <option value="both">Both (Horizontal & Vertical)</option>
                                            <option value="horizontal">Horizontal Only</option>
                                            <option value="vertical">Vertical Only</option>
                                            <option value="none">None</option>
                                        </select>
                                    </div>

                                    <div style={{ marginBottom: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>X-Axis Title</label>
                                        <input type="text" placeholder={defaultXLabel} value={customAxisTitles.x} onChange={(e) => setCustomAxisTitles({ ...customAxisTitles, x: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y-Axis Title</label>
                                        <input type="text" placeholder={defaultYLabel} value={customAxisTitles.y} onChange={(e) => setCustomAxisTitles({ ...customAxisTitles, y: e.target.value })} style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px', fontSize: '11px' }} />
                                    </div>

                                    {(chartType === 'line' || chartType === 'bar') && (
                                        <div style={{ marginTop: '10px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>X-Axis Label Rotation</label>
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
                flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--chart-bg)', overflow: 'hidden',
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
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: isFullscreen ? '0 0 10px 0' : '10px 20px 0 0' }}>
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
                <div ref={chartRef} style={{ flex: 1, padding: isFullscreen ? '0 20px 20px 20px' : '0 20px 20px 20px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                    {chartTitle && <h2 style={{ textAlign: textAlign, margin: '0 0 5px 0', color: 'var(--text-active)', fontSize: '18px', fontWeight: '600', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartTitle}</h2>}
                    {chartSubtitle && <h3 style={{ textAlign: textAlign, margin: '0 0 5px 0', color: 'var(--text-muted)', fontSize: '14px', fontWeight: '400', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartSubtitle}</h3>}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                        {ChartContent}
                    </div>
                    {chartFootnote && <div style={{ textAlign: textAlign, marginTop: '5px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', borderTop: '1px solid var(--border-color)', paddingTop: '5px', whiteSpace: 'pre-wrap', paddingLeft: textAlign === 'left' ? '50px' : '0' }}>{chartFootnote}</div>}
                </div>
            </div >
        </div >
    );
});

export default DataVisualizer;
