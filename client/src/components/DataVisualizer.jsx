import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, LabelList
} from 'recharts';

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
                    backgroundColor: '#1e1f22', border: '1px solid #555', padding: '10px',
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
                                flex: 1, background: '#1c1c1c', border: '1px solid #444',
                                color: '#fff', fontSize: '11px', padding: '4px'
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

const DataVisualizer = ({ data, isReportMode = false }) => {
    const [chartType, setChartType] = useState('line');
    const [xAxisKey, setXAxisKey] = useState('');
    const [yAxisKeys, setYAxisKeys] = useState([]);
    const [splitByKey, setSplitByKey] = useState('');
    const [dateAggregation, setDateAggregation] = useState('none');
    const [showLabels, setShowLabels] = useState(false);
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

    // Ref for chart export
    const chartRef = useRef(null);

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
        backgroundColor: '#252526',
        borderColor: '#454545',
        color: '#ccc',
        fontSize: '12px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
    }), []);

    // Legend Props (Stable based on position)
    const legendProps = useMemo(() => ({
        wrapperStyle: { paddingTop: '10px' },
        verticalAlign: (legendPosition === 'top' || legendPosition === 'bottom') ? legendPosition : 'middle',
        align: (legendPosition === 'left' || legendPosition === 'right') ? legendPosition : 'center',
        layout: (legendPosition === 'left' || legendPosition === 'right') ? 'vertical' : 'horizontal'
    }), [legendPosition]);

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


    // --- RENDER HELPERS ---

    const xAxisTickFormatter = (val) => {
        if (typeof val === 'number') return formatNumber(val);
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            if (dateAggregation === 'year') return val;
            if (dateAggregation === 'month') return val;
            return val.split('T')[0];
        }
        const str = String(val);
        if (str.length > 15) return str.substring(0, 15) + '...';
        return str;
    };

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
    const CommonProps = {
        data: processedData,
        margin: { top: 20, right: 30, left: 20, bottom: 20 },
        style: { fontSize: '12px' }
    };

    const labelProps = showLabels ? { position: 'top', fill: '#ccc', fontSize: 10, formatter: formatNumber } : false;

    // Domain & Scale
    const yDomain = [
        yAxisDomain[0] !== '' && !isNaN(yAxisDomain[0]) ? Number(yAxisDomain[0]) : 'auto',
        yAxisDomain[1] !== '' && !isNaN(yAxisDomain[1]) ? Number(yAxisDomain[1]) : 'auto'
    ];
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
        if (!processedData || processedData.length === 0) return <div style={{ color: '#888' }}>No data to display</div>;

        try {
            switch (chartType) {
                case 'line':
                    return (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart {...CommonProps}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                                <XAxis
                                    dataKey={xAxisKey}
                                    stroke="#888"
                                    tick={xAxisTickProps}
                                    tickFormatter={xAxisTickFormatter}
                                    label={{ value: XLabel, position: 'bottom', offset: 0, fill: '#aaa', fontSize: 12 }}
                                    height={Number(xAxisLabelAngle) > 0 ? 80 : 50}
                                />
                                <YAxis
                                    stroke="#888"
                                    tick={{ fill: '#888', fontSize: 11 }}
                                    tickFormatter={formatNumber}
                                    domain={yDomain}
                                    scale={yScale}
                                    allowDataOverflow={true}
                                    label={{ value: YLabel, angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 12 }}
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={!isHorizontal} horizontal={isHorizontal} />

                                {isHorizontal ? (
                                    <>
                                        <XAxis
                                            type="number"
                                            stroke="#888"
                                            tick={{ fill: '#888', fontSize: 11 }}
                                            tickFormatter={formatNumber}
                                            domain={yDomain}
                                            scale={yScale}
                                            label={{ value: YLabel, position: 'bottom', offset: 0, fill: '#aaa', fontSize: 12 }}
                                            height={50}
                                        />
                                        <YAxis
                                            type="category"
                                            dataKey={xAxisKey}
                                            stroke="#888"
                                            tick={{ fill: '#888', fontSize: 11 }}
                                            width={100}
                                            tickFormatter={xAxisTickFormatter}
                                            label={{ value: XLabel, angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 12 }}
                                        />
                                    </>
                                ) : (
                                    <>
                                        <XAxis
                                            dataKey={xAxisKey}
                                            stroke="#888"
                                            tick={xAxisTickProps}
                                            tickFormatter={xAxisTickFormatter}
                                            label={{ value: XLabel, position: 'bottom', offset: 0, fill: '#aaa', fontSize: 12 }}
                                            height={Number(xAxisLabelAngle) > 0 ? 80 : 50}
                                        />
                                        <YAxis
                                            stroke="#888"
                                            tick={{ fill: '#888', fontSize: 11 }}
                                            tickFormatter={formatNumber}
                                            domain={yDomain}
                                            scale={yScale}
                                            label={{ value: YLabel, angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 12 }}
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
                                    >
                                        {showLabels && (
                                            <LabelList
                                                dataKey={key}
                                                position={isHorizontal ? "right" : "top"}
                                                fill="#ccc"
                                                fontSize={10}
                                                formatter={formatNumber}
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
                                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                                <XAxis
                                    dataKey={xAxisKey}
                                    type={isDateColumn ? "category" : "number"}
                                    name={XLabel}
                                    stroke="#888"
                                    tick={xAxisTickProps}
                                    tickFormatter={xAxisTickFormatter}
                                    interval="preserveStartEnd"
                                    domain={['auto', 'auto']}
                                    label={{ value: XLabel, position: 'bottom', offset: 0, fill: '#aaa', fontSize: 12 }}
                                    height={Number(xAxisLabelAngle) > 0 ? 80 : 50}
                                />
                                <YAxis
                                    type="number"
                                    name={YLabel}
                                    stroke="#888"
                                    tick={{ fill: '#888', fontSize: 11 }}
                                    tickFormatter={formatNumber}
                                    label={{ value: YLabel, angle: -90, position: 'insideLeft', fill: '#aaa', fontSize: 12 }}
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
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey={yAxisKeys[0]}
                                    nameKey={xAxisKey}
                                    label={showLabels ? renderCustomizedLabel : false}
                                    labelLine={showLabels && donutLabelPosition === 'outside'}
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

    if (!data || data.length === 0) return <div>No data to visualize</div>;

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
            {/* Controls Panel - Hidden in Report Mode */}
            {!isReportMode && (
                <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid #333', padding: '15px', overflowY: 'auto', backgroundColor: '#141517' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: '600', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Configuration
                        </h3>
                        <button
                            onClick={handleDownload}
                            title="Download Chart as PNG"
                            style={{
                                background: 'transparent', border: '1px solid #555', color: '#ccc', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
                                display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <span>⬇</span> PNG
                        </button>
                    </div>

                    {/* --- CHART TYPE --- */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>Chart Type</label>
                        <select
                            value={chartType}
                            onChange={(e) => setChartType(e.target.value)}
                            style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
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
                        <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>
                            {defaultXLabel}
                        </label>
                        <select
                            value={xAxisKey}
                            onChange={(e) => setXAxisKey(e.target.value)}
                            style={{ width: '100%', backgroundColor: '#171517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                        >
                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>
                            {defaultYLabel}
                            {splitByKey && <span style={{ color: '#ff9900', fontStyle: 'italic', marginLeft: 5 }}>(Value to Pivot)</span>}
                        </label>
                        {splitByKey ? (
                            <select
                                value={yAxisKeys[0] || ''}
                                onChange={(e) => setYAxisKeys([e.target.value])}
                                style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                            >
                                {columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                        ) : (
                            <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #444', padding: '5px', borderRadius: '4px', backgroundColor: '#141517' }}>
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
                                style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
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
                                style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                            />
                        </div>
                    </div>

                    {/* --- ADVANCED DATA OPTIONS --- */}
                    {isDateColumn && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <label style={{ display: 'block', fontSize: '11px', color: '#00ffff', marginBottom: '8px', fontWeight: '600' }}>
                                📅 Date Aggregation
                            </label>
                            <select
                                value={dateAggregation}
                                onChange={(e) => setDateAggregation(e.target.value)}
                                style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                            >
                                <option value="none">Raw Data (Daily/Exact)</option>
                                <option value="month">Group by Month</option>
                                <option value="year">Group by Year</option>
                            </select>
                        </div>
                    )}

                    {chartType !== 'donut' && (
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>
                                🔀 Split By Column
                            </label>
                            <select
                                value={splitByKey}
                                onChange={(e) => setSplitByKey(e.target.value)}
                                style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                            >
                                <option value="">(None)</option>
                                {columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                        </div>
                    )}

                    {chartType === 'scatter' && (
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>
                                🔵 Bubble Size
                            </label>
                            <select
                                value={bubbleSizeKey}
                                onChange={(e) => setBubbleSizeKey(e.target.value)}
                                style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                            >
                                <option value="">(Uniform Size)</option>
                                {columns.map(col => <option key={col} value={col}>{col}</option>)}
                            </select>
                        </div>
                    )}

                    {/* --- CHART SPECIFIC SETTINGS --- */}
                    <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Visual Settings</h4>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                            <input
                                type="checkbox"
                                checked={showLabels}
                                onChange={(e) => setShowLabels(e.target.checked)}
                                style={{ accentColor: '#00ffff' }}
                            />
                            Show Data Labels
                        </label>

                        {chartType === 'line' && (
                            <>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                    <input
                                        type="checkbox"
                                        checked={lineSmooth}
                                        onChange={(e) => setLineSmooth(e.target.checked)}
                                        style={{ accentColor: '#00ffff' }}
                                    />
                                    Smooth Lines
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                    <input
                                        type="checkbox"
                                        checked={showDots}
                                        onChange={(e) => setShowDots(e.target.checked)}
                                        style={{ accentColor: '#00ffff' }}
                                    />
                                    Show Points
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                    <input
                                        type="checkbox"
                                        checked={isCumulative}
                                        onChange={(e) => setIsCumulative(e.target.checked)}
                                        style={{ accentColor: '#00ffff' }}
                                    />
                                    Cumulative Sum (Running Total)
                                </label>
                            </>
                        )}

                        {(chartType === 'bar' || chartType === 'bar-horizontal') && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#ccc', marginBottom: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={barStacked}
                                    onChange={(e) => setBarStacked(e.target.checked)}
                                    style={{ accentColor: '#00ffff' }}
                                />
                                Stack Bars
                            </label>
                        )}

                        {chartType === 'donut' && (
                            <div style={{ marginTop: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#ccc', marginBottom: '4px' }}>
                                    Inner Radius (Thickness): {donutThickness}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="90"
                                    value={donutThickness}
                                    onChange={(e) => setDonutThickness(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: '#00ffff' }}
                                />
                            </div>
                        )}
                    </div>

                    {/* --- AXES CONFIGURATION --- */}
                    {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter') && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Axes & Scale</h4>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '11px', color: '#aaa', marginBottom: '8px', fontWeight: '500' }}>Number Format</label>
                                <select
                                    value={numberFormat}
                                    onChange={(e) => setNumberFormat(e.target.value)}
                                    style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px' }}
                                >
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
                                <input
                                    type="checkbox"
                                    checked={yAxisLog}
                                    onChange={(e) => setYAxisLog(e.target.checked)}
                                    style={{ accentColor: '#00ffff' }}
                                />
                                Logarithmic Scale (Y)
                            </label>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y Min</label>
                                    <input
                                        type="number"
                                        placeholder="Auto"
                                        value={yAxisDomain[0]}
                                        onChange={(e) => setYAxisDomain([e.target.value, yAxisDomain[1]])}
                                        style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y Max</label>
                                    <input
                                        type="number"
                                        placeholder="Auto"
                                        value={yAxisDomain[1]}
                                        onChange={(e) => setYAxisDomain([yAxisDomain[0], e.target.value])}
                                        style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- REFERENCE LINE --- */}
                    {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter') && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Reference Line</h4>

                            <div style={{ marginBottom: '8px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y Value</label>
                                <input
                                    type="number"
                                    placeholder="Enter value..."
                                    value={refLine.value}
                                    onChange={(e) => setRefLine({ ...refLine, value: e.target.value })}
                                    style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                />
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Label</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Goal"
                                    value={refLine.label}
                                    onChange={(e) => setRefLine({ ...refLine, label: e.target.value })}
                                    style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Color</label>
                                <SimpleColorPicker
                                    color={refLine.color}
                                    onChange={(val) => setRefLine({ ...refLine, color: val })}
                                />
                            </div>
                        </div>
                    )}

                    {/* --- AXIS TITLES --- */}
                    {(chartType === 'line' || chartType === 'bar' || chartType === 'scatter') && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Axis Titles & Labels</h4>

                            <div style={{ marginBottom: '8px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>X-Axis Title</label>
                                <input
                                    type="text"
                                    placeholder={defaultXLabel}
                                    value={customAxisTitles.x}
                                    onChange={(e) => setCustomAxisTitles({ ...customAxisTitles, x: e.target.value })}
                                    style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                />
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Y-Axis Title</label>
                                <input
                                    type="text"
                                    placeholder={defaultYLabel}
                                    value={customAxisTitles.y}
                                    onChange={(e) => setCustomAxisTitles({ ...customAxisTitles, y: e.target.value })}
                                    style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                />
                            </div>

                            {/* X Axs Rotation */}
                            {(chartType === 'line' || chartType === 'bar') && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>X-Axis Label Rotation</label>
                                    <select
                                        value={xAxisLabelAngle}
                                        onChange={(e) => setXAxisLabelAngle(Number(e.target.value))}
                                        style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                                    >
                                        <option value="0">0° (Horizontal)</option>
                                        <option value="45">45°</option>
                                        <option value="90">90° (Vertical)</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- LEGEND SETTINGS --- */}
                    {(chartType === 'line' || chartType === 'bar' || chartType === 'bar-horizontal' || chartType === 'scatter' || chartType === 'donut') && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Legend</h4>
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Position</label>
                                <select
                                    value={legendPosition}
                                    onChange={(e) => setLegendPosition(e.target.value)}
                                    style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                                >
                                    <option value="top">Top</option>
                                    <option value="bottom">Bottom</option>
                                    <option value="left">Left</option>
                                    <option value="right">Right</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* --- DONUT SETTINGS --- */}
                    {chartType === 'donut' && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Donut Settings</h4>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', fontSize: '11px', color: '#ccc', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={showLabels}
                                        onChange={(e) => setShowLabels(e.target.checked)}
                                        style={{ marginRight: '6px' }}
                                    />
                                    Show Labels
                                </label>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Inner Radius (Thickness)</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="90"
                                    value={donutThickness}
                                    onChange={(e) => setDonutThickness(Number(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Group Small Slices (%)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={donutGroupingThreshold}
                                    onChange={(e) => setDonutGroupingThreshold(Number(e.target.value))}
                                    style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                />
                                <span style={{ fontSize: '10px', color: '#666' }}>Slices smaller than this % will be grouped into "Others".</span>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Label Content</label>
                                <select
                                    value={donutLabelContent}
                                    onChange={(e) => setDonutLabelContent(e.target.value)}
                                    style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                                >
                                    <option value="percent">Percentage Only</option>
                                    <option value="value">Value Only</option>
                                    <option value="name">Name Only</option>
                                    <option value="name_percent">Name + Percentage</option>
                                    <option value="name_value">Name + Value</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Label Position</label>
                                <select
                                    value={donutLabelPosition}
                                    onChange={(e) => setDonutLabelPosition(e.target.value)}
                                    style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                                >
                                    <option value="outside">Outside</option>
                                    <option value="inside">Inside</option>
                                </select>
                            </div>

                            {/* Slice Colors */}
                            <div>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Slice Colors</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                                    {donutData.map((d, i) => {
                                        const key = d[xAxisKey];
                                        const color = seriesConfig[key]?.color || COLORS[i % COLORS.length];
                                        return (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <SimpleColorPicker
                                                    color={color}
                                                    onChange={(val) => setSeriesConfig({
                                                        ...seriesConfig,
                                                        [key]: { ...seriesConfig[key], color: val }
                                                    })}
                                                />
                                                <span style={{ fontSize: '10px', color: '#ccc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={key}>{key}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                        </div>
                    )}

                    {/* --- SERIES STYLING (Line Specific + General Colors) --- */}
                    {chartType === 'line' && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Series Styling</h4>

                            {/* Highlight Config for Line */}
                            <div style={{ marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Point Highlighting</label>
                                <select
                                    value={highlightConfig.type}
                                    onChange={(e) => setHighlightConfig({ ...highlightConfig, type: e.target.value })}
                                    style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px', marginBottom: '5px' }}
                                >
                                    <option value="none">None</option>
                                    <option value="max">Max Value Point</option>
                                    <option value="min">Min Value Point</option>
                                    <option value="exact">Specific X-Value</option>
                                </select>
                                {highlightConfig.type !== 'none' && (
                                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <SimpleColorPicker
                                            color={highlightConfig.color}
                                            onChange={(val) => setHighlightConfig({ ...highlightConfig, color: val })}
                                        />
                                        <span style={{ fontSize: '10px', color: '#888' }}>Highlight Color</span>
                                    </div>
                                )}
                            </div>

                            {/* Individual Series Config */}
                            {finalSeriesKeys.map((key, i) => {
                                const currentConfig = seriesConfig[key] || {};
                                const currentColor = currentConfig.color || COLORS[i % COLORS.length];
                                const currentStyle = currentConfig.style || 'solid';

                                return (
                                    <div key={key} style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', color: '#ddd', marginBottom: '2px' }}>{key}</label>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <SimpleColorPicker
                                                color={currentColor}
                                                onChange={(val) => {
                                                    const existing = seriesConfig[key] || {};
                                                    setSeriesConfig({
                                                        ...seriesConfig,
                                                        [key]: { ...existing, color: val }
                                                    });
                                                }}
                                            />
                                            <select
                                                value={currentStyle}
                                                onChange={(e) => {
                                                    const existing = seriesConfig[key] || {};
                                                    setSeriesConfig({
                                                        ...seriesConfig,
                                                        [key]: { ...existing, style: e.target.value }
                                                    });
                                                }}
                                                style={{ flex: 1, backgroundColor: '#1c1c1c', color: '#fff', border: '1px solid #444', fontSize: '10px' }}
                                            >
                                                <option value="solid">Solid</option>
                                                <option value="dashed">Dashed</option>
                                                <option value="dotted">Dotted</option>
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* --- COLORS & HIGHLIGHTING (Effective for Bar Charts) --- */}
                    {(chartType === 'bar' || chartType === 'bar-horizontal') && (
                        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#0F1012', borderRadius: '4px', border: '1px solid #3e3e42' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#fff', textTransform: 'uppercase' }}>Colors & Highlights</h4>

                            {/* Color Mode */}
                            {!barStacked && (
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Color Mode</label>
                                    <select
                                        value={barColorMode}
                                        onChange={(e) => setBarColorMode(e.target.value)}
                                        style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                                    >
                                        <option value="series">By Series (Uniform)</option>
                                        <option value="dimension">By Category (Varied)</option>
                                    </select>
                                </div>
                            )}

                            {/* Highlight Rules */}
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Highlight Rule</label>
                                <select
                                    value={highlightConfig.type}
                                    onChange={(e) => setHighlightConfig({ ...highlightConfig, type: e.target.value })}
                                    style={{ width: '100%', backgroundColor: '#141517', color: '#fff', border: '1px solid #555', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
                                >
                                    <option value="none">None</option>
                                    <option value="max">Max Value</option>
                                    <option value="min">Min Value</option>
                                    <option value="exact">Specific Category</option>
                                </select>
                            </div>

                            {/* Specific Value Input */}
                            {highlightConfig.type === 'exact' && (
                                <div style={{ marginBottom: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Category to Highlight</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Total, 2023-01..."
                                        value={highlightConfig.value}
                                        onChange={(e) => setHighlightConfig({ ...highlightConfig, value: e.target.value })}
                                        style={{ width: '100%', background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '4px', fontSize: '11px' }}
                                    />
                                </div>
                            )}

                            {/* Highlight Color */}
                            {highlightConfig.type !== 'none' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>Highlight Color</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <SimpleColorPicker
                                            color={highlightConfig.color}
                                            onChange={(val) => setHighlightConfig({ ...highlightConfig, color: val })}
                                        />
                                        {/* Quick Presets */}
                                        {['#ff0000', '#00ff00', '#ffff00'].map(c => (
                                            <div
                                                key={c}
                                                onClick={() => setHighlightConfig({ ...highlightConfig, color: c })}
                                                style={{ width: '20px', height: '30px', background: c, cursor: 'pointer', border: '1px solid #555' }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Chart Area */}
            <div ref={chartRef} style={{ flex: 1, padding: '20px', backgroundColor: '#1e1f22', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', overflow: 'hidden' }}>
                {ChartContent}
            </div>
        </div>
    );
};

export default DataVisualizer;
