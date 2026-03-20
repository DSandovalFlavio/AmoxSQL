/**
 * ChartRenderer — Renders the appropriate chart based on chartType.
 * Consolidates all Recharts rendering in one place with shared axis/grid/tooltip helpers.
 */
import { memo, useMemo, useCallback } from 'react';
import {
    LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart,
    PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, ReferenceLine, ReferenceArea, LabelList, Funnel, FunnelChart, Treemap,
} from 'recharts';
import { formatNumber, createFormatter, formatDateLabel, createTooltipFormatter } from '../utils/numberFormat';
import { computeTrendLine, processDonutData } from '../utils/dataProcessing';

// ─── Helper: CustomizedDot ───────────────────────────────────
const CustomizedDot = (props) => {
    const { cx, cy, stroke, payload, value } = props;
    let isHighlighted = false;

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

// ─── Main Renderer ───────────────────────────────────────────
const ChartRenderer = memo(({
    config,
    processedData,
    finalSeriesKeys,
    activeColors,
    columns,
    isDateColumn: isDateCol,
    textScale = 1,
}) => {
    const {
        chartType, xAxisKey, yAxisKeys, rightYAxisKey, splitByKey, bubbleSizeKey,
        numberFormat, decimalPlaces, gridMode, showAxisLines, yLogScale, yAxisDomain,
        showXAxisTitle, showYAxisTitle, customAxisTitles, xAxisLabelAngle,
        showLabels, dataLabelPosition, dataLabelSize, dataLabelMinSpace, tooltipShowPercent, legendPosition,
        lineType, lineAreaFill, showDots, barStackMode, barRadius, barColorMode,
        donutThickness, donutCenterKpi, donutLabelContent, donutLabelPosition,
        donutGroupingThreshold, scatterQuadrants, highlightConfig, seriesConfig,
        refLine, refArea, goalLine, trendLine, comboLineKeys,
        marginTop, marginBottom, marginLeft, marginRight,
    } = config;

    const labelFontSize = dataLabelSize || 11;

    // ── Format functions ──
    const fmt = useCallback((value) => formatNumber(value, numberFormat, decimalPlaces), [numberFormat, decimalPlaces]);

    const xAxisTickFormatter = useCallback((val) => {
        if (typeof val === 'number') return fmt(val);
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.split('T')[0];
        const str = String(val);
        const isHoriz = chartType.startsWith('bar-horizontal');
        if (isHoriz && str.length > 40) return str.substring(0, 37) + '...';
        if (!isHoriz && str.length > 20) return str.substring(0, 17) + '...';
        return str;
    }, [fmt, chartType]);

    const tooltipFormatter = useCallback(
        createTooltipFormatter(fmt, tooltipShowPercent, chartType, yAxisKeys),
        [fmt, tooltipShowPercent, chartType, yAxisKeys]
    );

    // ── Axis labels ──
    const defaultXLabel = chartType.includes('horizontal') ? 'Values' : chartType === 'donut' ? 'Segment' : 'X Axis';
    const defaultYLabel = chartType.includes('horizontal') ? 'Categories' : chartType === 'donut' ? 'Size' : 'Values';
    const XLabel = showXAxisTitle ? (customAxisTitles.x || defaultXLabel || xAxisKey) : '';
    const YLabel = showYAxisTitle ? (customAxisTitles.y || defaultYLabel || 'Values') : '';

    // ── Theme & Scale ──
    const fontSize = Math.round(11 * textScale);
    const titleFontSize = Math.round(12 * textScale);
    const yDomain = [
        yAxisDomain[0] !== '' && !isNaN(yAxisDomain[0]) ? Number(yAxisDomain[0]) : 'auto',
        yAxisDomain[1] !== '' && !isNaN(yAxisDomain[1]) ? Number(yAxisDomain[1]) : 'auto'
    ];
    const yScale = yLogScale ? 'log' : 'auto';
    const isHorizontal = chartType.startsWith('bar-horizontal');

    // ── Margins ──
    const margin = useMemo(() => {
        let pt = Number(marginTop);
        let pb = Number(marginBottom);
        let pl = Number(marginLeft);
        if (showYAxisTitle && !isHorizontal) pl += 15;
        if (showXAxisTitle && isHorizontal) pl += 15;
        if (legendPosition === 'top') pt += 5;
        if (legendPosition === 'bottom') pb += 10;
        return { top: pt, right: Number(marginRight), left: pl, bottom: pb };
    }, [marginTop, marginBottom, marginLeft, marginRight, showYAxisTitle, showXAxisTitle, isHorizontal, legendPosition]);

    // ── Axis common props ──
    const axisCommonProps = useMemo(() => ({
        axisLine: showAxisLines ? { stroke: 'var(--border-color)' } : false,
        tickLine: showAxisLines ? { stroke: 'var(--border-color)' } : false,
    }), [showAxisLines]);

    const xAxisTickProps = useMemo(() => ({
        fill: 'var(--text-muted)', fontSize,
        angle: -Number(xAxisLabelAngle),
        textAnchor: Number(xAxisLabelAngle) > 0 ? 'end' : 'middle',
        dy: Number(xAxisLabelAngle) > 0 ? 5 : 0,
    }), [xAxisLabelAngle, fontSize]);

    // ── Tooltip style ──
    const tooltipStyle = {
        backgroundColor: 'var(--tooltip-bg)', border: '1px solid var(--border-color)',
        borderRadius: '6px', color: 'var(--text-primary)', fontSize: `${fontSize}px`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    };

    // ── Custom Legend Renderer ──
    const CustomLegend = useCallback(({ payload }) => {
        if (!payload || payload.length === 0) return null;
        const isVert = legendPosition === 'left' || legendPosition === 'right';
        return (
            <div style={{
                display: 'flex',
                flexDirection: isVert ? 'column' : 'row',
                flexWrap: 'wrap',
                gap: '6px',
                justifyContent: isVert ? 'flex-start' : 'center',
                alignItems: 'center',
                padding: legendPosition === 'top' ? '0 0 14px 0'
                    : legendPosition === 'bottom' ? '14px 0 0 0'
                        : isVert ? '0 10px' : '0',
            }}>
                {payload.map((entry, i) => (
                    <span key={`legend-${i}`} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--panel-section-bg, rgba(255,255,255,0.04))',
                        fontSize: `${fontSize}px`,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        cursor: 'default',
                        transition: 'opacity 0.15s',
                    }}>
                        <span style={{
                            width: '8px', height: '8px',
                            borderRadius: '50%',
                            backgroundColor: entry.color,
                            flexShrink: 0,
                        }} />
                        {entry.value}
                    </span>
                ))}
            </div>
        );
    }, [legendPosition, fontSize]);

    // ── Legend props ──
    const legendProps = useMemo(() => {
        if (legendPosition === 'none') return {};
        const layout = (legendPosition === 'left' || legendPosition === 'right') ? 'vertical' : 'horizontal';
        return {
            verticalAlign: legendPosition === 'bottom' ? 'bottom' : legendPosition === 'top' ? 'top' : 'middle',
            align: legendPosition === 'left' ? 'left' : legendPosition === 'right' ? 'right' : 'center',
            layout,
            content: CustomLegend,
        };
    }, [legendPosition, CustomLegend]);

    // ── Dynamic axis sizes ──
    const dynamicYAxisWidth = useMemo(() => {
        if (!isHorizontal || !processedData?.length) return 100;
        let max = 0;
        processedData.forEach(d => {
            const l = xAxisTickFormatter(d[xAxisKey])?.length || 0;
            if (l > max) max = l;
        });
        return Math.min(Math.max(20 + max * 8 + (showXAxisTitle ? 25 : 10), 60), 400);
    }, [processedData, xAxisKey, isHorizontal, xAxisTickFormatter, showXAxisTitle]);

    const dynamicXAxisHeight = useMemo(() => {
        if (!processedData?.length) return 30;
        let base = showXAxisTitle ? 30 : 10;
        if (isHorizontal) return base + 15;
        const angle = Number(xAxisLabelAngle);
        if (angle === 0) return base + 20;
        let max = 0;
        processedData.forEach(d => {
            const l = xAxisTickFormatter(d[xAxisKey])?.length || 0;
            if (l > max) max = l;
        });
        const rad = angle * (Math.PI / 180);
        const textH = Math.abs(Math.sin(rad)) * (max * 6);
        return Math.min(Math.max(base + textH + 10, 40), 180);
    }, [processedData, xAxisKey, xAxisLabelAngle, isHorizontal, xAxisTickFormatter, showXAxisTitle]);

    // ── Label position mapping ──
    // ── Contrast color helper ──
    const getContrastColor = useCallback((hexColor) => {
        if (!hexColor || hexColor.length < 7) return '#ffffff';
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        // Relative luminance (WCAG formula)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.55 ? '#1a1a2e' : '#ffffff';
    }, []);

    const labelContentRenderer = useCallback((props) => {
        if (!showLabels) return null;
        const { x, y, width, height, value } = props;
        if (value == null || value === 0) return null;

        const isHoriz = chartType.startsWith('bar-horizontal');
        const minSpace = dataLabelMinSpace ?? 30;

        // Auto-hide if segment is too small to fit the label neatly
        if (width !== undefined && height !== undefined) {
            const relevantSpace = isHoriz ? width : height;
            if (relevantSpace < minSpace) return null;
        }

        const position = dataLabelPosition || 'outside';
        let textX = x + (width || 0) / 2, textY = y, textAnchor = 'middle', baseline = 'auto';
        const off = 5;
        const isInside = position.startsWith('inside');

        if (isHoriz) {
            if (position === 'outside') { textX = x + (width || 0) + off; textAnchor = 'start'; textY = y + (height || 0) / 2; baseline = 'central'; }
            else { textX = x + (width || 0) / 2; textY = y + (height || 0) / 2; baseline = 'central'; }
        } else {
            if (position === 'outside' || position === 'top') { textY = y - off; baseline = 'auto'; }
            else if (position === 'inside-center') { textY = y + (height || 0) / 2; baseline = 'central'; }
            else if (position === 'inside-start') { textY = y + (height || 0) - off; baseline = 'auto'; }
            else if (position === 'inside-end') { textY = y + off * 2; baseline = 'auto'; }
        }

        // Determine label color based on position:
        // Inside → contrast with bar color; Outside → use theme text color
        const fillColor = isInside && props.fill
            ? getContrastColor(props.fill)
            : 'var(--text-secondary)';

        return (
            <text x={textX} y={textY} fill={fillColor} fontSize={labelFontSize}
                textAnchor={textAnchor} dominantBaseline={baseline}
                fontWeight={isInside ? '600' : '400'}>
                {fmt(value)}
            </text>
        );
    }, [showLabels, dataLabelPosition, dataLabelMinSpace, chartType, fmt, labelFontSize, getContrastColor]);

    // ── Donut label ──
    const renderDonutLabel = useCallback(({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, value }) => {
        if (!showLabels) return null;
        const RADIAN = Math.PI / 180;
        const isOutside = donutLabelPosition === 'outside';
        const radius = isOutside ? outerRadius + 20 : innerRadius + (outerRadius - innerRadius) / 2;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        let text = '';
        switch (donutLabelContent) {
            case 'percent': text = `${(percent * 100).toFixed(1)}%`; break;
            case 'value': text = fmt(value); break;
            case 'name': text = name; break;
            case 'name_percent': text = `${name} ${(percent * 100).toFixed(1)}%`; break;
            case 'name_value': text = `${name} ${fmt(value)}`; break;
            default: text = `${(percent * 100).toFixed(1)}%`;
        }

        return (
            <text x={x} y={y} fill={isOutside ? 'var(--text-secondary)' : '#fff'}
                textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
                fontSize={fontSize - 1}>
                {text}
            </text>
        );
    }, [showLabels, donutLabelContent, donutLabelPosition, fmt, fontSize]);

    // ── Reference elements ──
    const refElements = useMemo(() => {
        const els = [];

        // Reference Line
        if (refLine.value) {
            els.push(
                <ReferenceLine
                    key="refLine"
                    y={!isHorizontal ? Number(refLine.value) : undefined}
                    x={isHorizontal ? Number(refLine.value) : undefined}
                    label={{ value: refLine.label, position: isHorizontal ? 'insideTopLeft' : 'top', fill: refLine.color, fontSize: fontSize - 1 }}
                    stroke={refLine.color}
                    strokeDasharray={refLine.style === 'dashed' ? '5 5' : refLine.style === 'dotted' ? '2 2' : '0'}
                />
            );
        }

        // Goal Line
        if (goalLine.enabled && goalLine.value) {
            const dashArray = goalLine.style === 'dashed' ? '8 4' : goalLine.style === 'dotted' ? '3 3' : '0';
            els.push(
                <ReferenceLine
                    key="goalLine"
                    y={!isHorizontal ? Number(goalLine.value) : undefined}
                    x={isHorizontal ? Number(goalLine.value) : undefined}
                    label={{ value: goalLine.label, position: 'top', fill: goalLine.color, fontSize: fontSize - 1, fontWeight: '600' }}
                    stroke={goalLine.color}
                    strokeWidth={2}
                    strokeDasharray={dashArray}
                />
            );
        }

        // Reference Area
        const hasX = refArea.x1 !== '' && refArea.x2 !== '';
        const hasY = refArea.y1 !== '' && refArea.y2 !== '';
        if (hasX || hasY) {
            const x1 = isNaN(Number(refArea.x1)) || refArea.x1 === '' ? refArea.x1 : Number(refArea.x1);
            const x2 = isNaN(Number(refArea.x2)) || refArea.x2 === '' ? refArea.x2 : Number(refArea.x2);
            if (hasX && !isHorizontal) els.push(<ReferenceArea key="refAreaX" x1={x1} x2={x2} fill={refArea.color} fillOpacity={refArea.opacity || 0.1} />);
            if (hasX && isHorizontal) els.push(<ReferenceArea key="refAreaXH" y1={x1} y2={x2} fill={refArea.color} fillOpacity={refArea.opacity || 0.1} />);
            if (hasY && !isHorizontal) els.push(<ReferenceArea key="refAreaY" y1={Number(refArea.y1)} y2={Number(refArea.y2)} fill={refArea.color} fillOpacity={refArea.opacity || 0.1} />);
            if (hasY && isHorizontal) els.push(<ReferenceArea key="refAreaYH" x1={Number(refArea.y1)} x2={Number(refArea.y2)} fill={refArea.color} fillOpacity={refArea.opacity || 0.1} />);
        }

        return els;
    }, [refLine, goalLine, refArea, isHorizontal, fontSize]);

    // ── Trend line data ──
    const trendData = useMemo(() => {
        if (trendLine.type === 'none') return null;
        return computeTrendLine(processedData, xAxisKey, yAxisKeys, trendLine.type, trendLine.windowSize);
    }, [trendLine, processedData, xAxisKey, yAxisKeys]);

    // ── Donut data ──
    const donutData = useMemo(() => {
        if (chartType !== 'donut') return [];
        return processDonutData(processedData, yAxisKeys, xAxisKey, donutGroupingThreshold);
    }, [processedData, yAxisKeys, xAxisKey, donutGroupingThreshold, chartType]);

    // ── Grid ──
    const gridH = gridMode === 'both' || gridMode === 'horizontal';
    const gridV = gridMode === 'both' || gridMode === 'vertical';

    // ── No data ──
    if (!processedData || processedData.length === 0) {
        return <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>No data to display</div>;
    }

    try {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ LINE / AREA ━━━
        if (chartType === 'line' || chartType === 'area') {
            const ChartComp = (chartType === 'area' || lineAreaFill) ? AreaChart : LineChart;
            const SeriesComp = (chartType === 'area' || lineAreaFill) ? Area : Line;
            const isStacked = chartType === 'area';

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <ChartComp data={processedData} margin={margin} style={{ fontSize: `${fontSize}px` }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={isHorizontal ? gridH : gridV} horizontal={isHorizontal ? gridV : gridH} />
                        <XAxis {...axisCommonProps} dataKey={xAxisKey} stroke="var(--border-color)"
                            tick={xAxisTickProps} tickFormatter={xAxisTickFormatter}
                            label={showXAxisTitle ? { value: XLabel, position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined}
                            height={dynamicXAxisHeight} />
                        <YAxis yAxisId="left" {...axisCommonProps} stroke="var(--border-color)"
                            tick={{ fill: 'var(--text-muted)', fontSize }} tickFormatter={fmt}
                            domain={yDomain} scale={yScale} allowDataOverflow
                            label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined} />
                        {rightYAxisKey && (
                            <YAxis yAxisId="right" orientation="right" {...axisCommonProps} stroke="var(--border-color)"
                                tick={{ fill: 'var(--text-muted)', fontSize }} tickFormatter={fmt}
                                domain={yDomain} scale={yScale} allowDataOverflow />
                        )}
                        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
                            formatter={tooltipFormatter} labelFormatter={xAxisTickFormatter} />
                        {legendPosition !== 'none' && <Legend {...legendProps} />}
                        {refElements}

                        {/* Trend line */}
                        {trendData && (
                            <Line yAxisId="left" data={trendData} dataKey="trend" stroke={trendLine.color}
                                strokeWidth={2} strokeDasharray="6 3" dot={false} name="Trend"
                                connectNulls isAnimationActive={false} />
                        )}

                        {finalSeriesKeys.map((key, index) => {
                            const cfg = seriesConfig[key] || {};
                            const color = cfg.color || activeColors[index % activeColors.length];
                            const dash = cfg.style === 'dashed' ? '5 5' : cfg.style === 'dotted' ? '2 2' : '';

                            let hlVal = null;
                            if (highlightConfig.type === 'max') hlVal = Math.max(...processedData.map(d => Number(d[key]) || -Infinity));
                            else if (highlightConfig.type === 'min') hlVal = Math.min(...processedData.map(d => Number(d[key]) || Infinity));
                            else if (highlightConfig.type === 'exact') hlVal = highlightConfig.value;

                            return (
                                <SeriesComp
                                    key={key || index} yAxisId={key === rightYAxisKey ? 'right' : 'left'}
                                    type={lineType} dataKey={key} stroke={color} strokeWidth={2}
                                    strokeDasharray={dash}
                                    fill={lineAreaFill || chartType === 'area' ? color : 'transparent'}
                                    fillOpacity={0.2}
                                    stackId={isStacked ? 'stack' : undefined}
                                    dot={<CustomizedDot dataKey={key} showDots={showDots}
                                        highlightType={highlightConfig.type} highlightVal={hlVal}
                                        highlightColor={highlightConfig.color || '#ff0000'}
                                        xAxisKey={xAxisKey} />}
                                    activeDot={{ r: 6 }}
                                    name={String(key)}
                                    isAnimationActive={false}
                                />
                            );
                        })}
                    </ChartComp>
                </ResponsiveContainer>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ BAR ━━━
        if (chartType === 'bar' || chartType.startsWith('bar-horizontal') ||
            chartType === 'bar-stacked' || chartType === 'bar-100') {

            const effectiveStack = chartType === 'bar-stacked' ? 'stack'
                : chartType === 'bar-100' ? 'expand'
                    : chartType === 'bar-horizontal-stacked' ? 'stack'
                        : chartType === 'bar-horizontal-100' ? 'expand'
                            : barStackMode;

            let hlVal = null;
            const pk = yAxisKeys[0];
            if (highlightConfig.type === 'max') hlVal = Math.max(...processedData.map(d => Number(d[pk]) || -Infinity));
            else if (highlightConfig.type === 'min') hlVal = Math.min(...processedData.map(d => Number(d[pk]) || Infinity));

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        layout={isHorizontal ? 'vertical' : 'horizontal'}
                        stackOffset={effectiveStack === 'expand' ? 'expand' : 'none'}
                        data={processedData} margin={margin} style={{ fontSize: `${fontSize}px` }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)"
                            vertical={isHorizontal ? gridH : gridV} horizontal={isHorizontal ? gridV : gridH} />

                        {isHorizontal ? (
                            <>
                                <XAxis {...axisCommonProps} type="number" stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize }} tickFormatter={fmt}
                                    domain={yDomain} scale={yScale}
                                    label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined}
                                    height={showXAxisTitle ? 30 : 5} />
                                <YAxis {...axisCommonProps} type="category" dataKey={xAxisKey}
                                    stroke="var(--border-color)" tick={{ fill: 'var(--text-muted)', fontSize }}
                                    width={dynamicYAxisWidth} tickFormatter={xAxisTickFormatter}
                                    label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined} />
                            </>
                        ) : (
                            <>
                                <XAxis {...axisCommonProps} dataKey={xAxisKey} stroke="var(--border-color)"
                                    tick={xAxisTickProps} tickFormatter={xAxisTickFormatter}
                                    label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined}
                                    height={dynamicXAxisHeight} />
                                <YAxis yAxisId="left" {...axisCommonProps} stroke="var(--border-color)"
                                    tick={{ fill: 'var(--text-muted)', fontSize }} tickFormatter={fmt}
                                    domain={yDomain} scale={yScale}
                                    label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined} />
                                {rightYAxisKey && (
                                    <YAxis yAxisId="right" orientation="right" {...axisCommonProps}
                                        stroke="var(--border-color)" tick={{ fill: 'var(--text-muted)', fontSize }}
                                        tickFormatter={fmt} domain={yDomain} scale={yScale} />
                                )}
                            </>
                        )}

                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            formatter={tooltipFormatter} labelFormatter={xAxisTickFormatter} />
                        {legendPosition !== 'none' && <Legend {...legendProps} />}
                        {refElements}

                        {/* Trend line overlay on bar chart */}
                        {trendData && !isHorizontal && (
                            <Line yAxisId="left" data={trendData} dataKey="trend" stroke={trendLine.color}
                                strokeWidth={2} strokeDasharray="6 3" dot={false} name="Trend"
                                connectNulls isAnimationActive={false} />
                        )}

                        {finalSeriesKeys.map((key, index) => {
                            const cfg = seriesConfig[key] || {};
                            const baseColor = cfg.color || activeColors[index % activeColors.length];
                            let seriesMax = 1;
                            if (barColorMode === 'intensity') {
                                seriesMax = Math.max(...processedData.map(d => Number(d[key]) || 0)) || 1;
                            }

                            return (
                                <Bar key={key}
                                    yAxisId={isHorizontal ? 0 : (key === rightYAxisKey ? 'right' : 'left')}
                                    dataKey={key}
                                    stackId={(effectiveStack === 'stack' || effectiveStack === 'expand') ? 'a' : undefined}
                                    fill={baseColor}
                                    radius={isHorizontal ? [0, barRadius, barRadius, 0] : [barRadius, barRadius, 0, 0]}
                                    name={String(key)} isAnimationActive={false}
                                >
                                    {showLabels && <LabelList dataKey={key} content={labelContentRenderer} />}
                                    {processedData.map((entry, ei) => {
                                        const val = Number(entry[key]);
                                        let color = baseColor;
                                        let opacity = 1;
                                        if (barColorMode === 'dimension') color = activeColors[ei % activeColors.length];
                                        else if (barColorMode === 'intensity') opacity = 0.2 + 0.8 * Math.max(0, val / seriesMax);
                                        if (highlightConfig.type !== 'none') {
                                            if ((highlightConfig.type === 'max' && val === hlVal) ||
                                                (highlightConfig.type === 'min' && val === hlVal) ||
                                                (highlightConfig.type === 'exact' && String(entry[xAxisKey]) === String(highlightConfig.value)))
                                                color = highlightConfig.color;
                                        }
                                        return <Cell key={`c-${ei}`} fill={color} fillOpacity={opacity} />;
                                    })}
                                </Bar>
                            );
                        })}
                    </BarChart>
                </ResponsiveContainer>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ COMBO ━━━
        if (chartType === 'combo') {
            const lineKeys = new Set(comboLineKeys || []);
            // If no explicit line keys, use the second key onwards
            if (lineKeys.size === 0 && finalSeriesKeys.length > 1) {
                finalSeriesKeys.slice(1).forEach(k => lineKeys.add(k));
            }

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={processedData} margin={margin} style={{ fontSize: `${fontSize}px` }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={gridV} horizontal={gridH} />
                        <XAxis {...axisCommonProps} dataKey={xAxisKey} stroke="var(--border-color)"
                            tick={xAxisTickProps} tickFormatter={xAxisTickFormatter}
                            label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined}
                            height={dynamicXAxisHeight} />
                        <YAxis yAxisId="left" {...axisCommonProps} stroke="var(--border-color)"
                            tick={{ fill: 'var(--text-muted)', fontSize }} tickFormatter={fmt}
                            domain={yDomain} scale={yScale}
                            label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined} />
                        {rightYAxisKey && (
                            <YAxis yAxisId="right" orientation="right" {...axisCommonProps}
                                stroke="var(--border-color)" tick={{ fill: 'var(--text-muted)', fontSize }}
                                tickFormatter={fmt} domain={yDomain} scale={yScale} />
                        )}
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} labelFormatter={xAxisTickFormatter} />
                        {legendPosition !== 'none' && <Legend {...legendProps} />}
                        {refElements}

                        {finalSeriesKeys.map((key, i) => {
                            const cfg = seriesConfig[key] || {};
                            const color = cfg.color || activeColors[i % activeColors.length];

                            if (lineKeys.has(key)) {
                                return (
                                    <Line key={key} yAxisId={key === rightYAxisKey ? 'right' : 'left'}
                                        type={lineType} dataKey={key} stroke={color} strokeWidth={2}
                                        dot={{ r: 3, fill: '#fff', stroke: color }}
                                        name={String(key)} isAnimationActive={false} />
                                );
                            }
                            return (
                                <Bar key={key} yAxisId={key === rightYAxisKey ? 'right' : 'left'}
                                    dataKey={key} fill={color}
                                    radius={[barRadius, barRadius, 0, 0]}
                                    name={String(key)} isAnimationActive={false} />
                            );
                        })}
                    </ComposedChart>
                </ResponsiveContainer>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ SCATTER / BUBBLE ━━━
        if (chartType === 'scatter' || chartType === 'bubble') {
            return (
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart data={processedData} margin={margin} style={{ fontSize: `${fontSize}px` }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-color)" vertical={gridV} horizontal={gridH} />
                        <XAxis {...axisCommonProps} dataKey={xAxisKey}
                            type={isDateCol ? 'category' : 'number'} name={XLabel}
                            stroke="var(--border-color)" tick={xAxisTickProps} tickFormatter={xAxisTickFormatter}
                            interval="preserveStartEnd" domain={['auto', 'auto']}
                            label={showXAxisTitle ? { value: XLabel, position: 'bottom', offset: 0, fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined}
                            height={dynamicXAxisHeight} />
                        <YAxis yAxisId="left" {...axisCommonProps} type="number" name={YLabel}
                            stroke="var(--border-color)" tick={{ fill: 'var(--text-muted)', fontSize }}
                            tickFormatter={fmt}
                            label={showYAxisTitle ? { value: YLabel, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: titleFontSize } : undefined} />
                        {rightYAxisKey && (
                            <YAxis yAxisId="right" orientation="right" {...axisCommonProps} type="number"
                                name={rightYAxisKey} stroke="var(--border-color)"
                                tick={{ fill: 'var(--text-muted)', fontSize }} tickFormatter={fmt} />
                        )}
                        <ZAxis type="number" dataKey="size" range={[60, 600]} name="Size" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle}
                            formatter={tooltipFormatter} labelFormatter={xAxisTickFormatter} />
                        {legendPosition !== 'none' && <Legend {...legendProps} />}
                        {refElements}

                        {scatterQuadrants && xAxisKey && yAxisKeys[0] && (() => {
                            const xVals = processedData.map(d => Number(d[xAxisKey])).filter(v => !isNaN(v));
                            const yVals = processedData.map(d => Number(d[yAxisKeys[0]])).filter(v => !isNaN(v));
                            if (!xVals.length || !yVals.length) return null;
                            const xMean = xVals.reduce((a, b) => a + b, 0) / xVals.length;
                            const yMean = yVals.reduce((a, b) => a + b, 0) / yVals.length;
                            return (
                                <>
                                    <ReferenceLine x={xMean} stroke="var(--border-color)" strokeWidth={2} strokeDasharray="5 5" />
                                    <ReferenceLine y={yMean} stroke="var(--border-color)" strokeWidth={2} strokeDasharray="5 5" />
                                </>
                            );
                        })()}

                        {finalSeriesKeys.map((key, i) => {
                            const cfg = seriesConfig[key] || {};
                            const color = cfg.color || activeColors[i % activeColors.length];
                            const seriesData = processedData.map(d => ({
                                ...d, size: splitByKey ? d[`${key}_size`] : d[bubbleSizeKey]
                            }));
                            return (
                                <Scatter key={key || i}
                                    yAxisId={key === rightYAxisKey ? 'right' : 'left'}
                                    name={String(key)} data={seriesData} dataKey={key}
                                    fill={color} shape="circle" isAnimationActive={false} />
                            );
                        })}
                    </ScatterChart>
                </ResponsiveContainer>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ DONUT ━━━
        if (chartType === 'donut') {
            let centerText = '', centerSubtext = '';
            if (donutCenterKpi !== 'none' && donutData.length > 0) {
                const sum = donutData.reduce((acc, d) => acc + (Number(d[yAxisKeys[0]]) || 0), 0);
                if (donutCenterKpi === 'total') { centerText = fmt(sum); centerSubtext = 'Total'; }
                else if (donutCenterKpi === 'average') { centerText = fmt(sum / donutData.length); centerSubtext = 'Average'; }
            }

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        {donutCenterKpi !== 'none' && donutThickness > 30 && (
                            <>
                                <text x="50%" y="50%" dy={-5} textAnchor="middle" dominantBaseline="middle"
                                    style={{ fill: 'var(--text-active)', fontSize: `${Math.round(20 * textScale)}px`, fontWeight: 'bold' }}>
                                    {centerText}
                                </text>
                                <text x="50%" y="50%" dy={15} textAnchor="middle" dominantBaseline="middle"
                                    style={{ fill: 'var(--text-muted)', fontSize: `${fontSize}px`, textTransform: 'uppercase' }}>
                                    {centerSubtext}
                                </text>
                            </>
                        )}
                        <Pie data={donutData} cx="50%" cy="50%"
                            innerRadius={donutThickness} outerRadius="80%"
                            paddingAngle={2} dataKey={yAxisKeys[0]} nameKey={xAxisKey}
                            label={showLabels ? renderDonutLabel : false}
                            labelLine={showLabels && donutLabelPosition === 'outside'}
                            isAnimationActive={false}>
                            {donutData.map((entry, i) => (
                                <Cell key={`dc-${i}`}
                                    fill={seriesConfig[entry[xAxisKey]]?.color || activeColors[i % activeColors.length]}
                                    stroke="none" />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                        {legendPosition !== 'none' && <Legend {...legendProps} />}
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ FUNNEL ━━━
        if (chartType === 'funnel') {
            const funnelData = processedData.map((d, i) => ({
                name: String(d[xAxisKey]),
                value: Number(d[yAxisKeys[0]]) || 0,
                fill: seriesConfig[d[xAxisKey]]?.color || activeColors[i % activeColors.length],
            })).sort((a, b) => b.value - a.value);

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                        <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
                        <Funnel dataKey="value" data={funnelData} isAnimationActive={false}>
                            {showLabels && <LabelList position="center" fill="#fff" fontSize={fontSize}
                                formatter={(v) => fmt(v)} />}
                        </Funnel>
                        {legendPosition !== 'none' && <Legend {...legendProps} />}
                    </FunnelChart>
                </ResponsiveContainer>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ HEATMAP ━━━
        if (chartType === 'heatmap') {
            // Heatmap: rows = xAxisKey categories, columns = yAxisKeys
            // Each cell shows the value with color intensity
            const palette = activeColors;
            const allValues = [];
            processedData.forEach(row => {
                finalSeriesKeys.forEach(k => {
                    const v = Number(row[k]);
                    if (!isNaN(v)) allValues.push(v);
                });
            });
            const minVal = Math.min(...allValues);
            const maxVal = Math.max(...allValues);
            const range = maxVal - minVal || 1;

            const getColor = (value) => {
                const ratio = (value - minVal) / range;
                // Use first and last of active palette for interpolation
                const r1 = parseInt(palette[0].slice(1, 3), 16);
                const g1 = parseInt(palette[0].slice(3, 5), 16);
                const b1 = parseInt(palette[0].slice(5, 7), 16);
                const lastColor = palette[Math.min(palette.length - 1, 3)] || palette[0];
                const r2 = parseInt(lastColor.slice(1, 3), 16);
                const g2 = parseInt(lastColor.slice(3, 5), 16);
                const b2 = parseInt(lastColor.slice(5, 7), 16);
                const r = Math.round(r1 + (r2 - r1) * ratio);
                const g = Math.round(g1 + (g2 - g1) * ratio);
                const b = Math.round(b1 + (b2 - b1) * ratio);
                return `rgb(${r},${g},${b})`;
            };

            const textColor = (bg) => {
                // Simple luminance check
                const hex = bg.replace('rgb(', '').replace(')', '');
                const [r, g, b] = hex.split(',').map(Number);
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return lum > 0.5 ? '#1a1a1a' : '#ffffff';
            };

            const cellSize = Math.max(24, Math.min(60, Math.floor(600 / Math.max(processedData.length, finalSeriesKeys.length))));

            return (
                <div style={{ width: '100%', height: '100%', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: `${fontSize}px` }}>
                        <thead>
                            <tr>
                                <th style={{ padding: '4px 8px', color: 'var(--text-muted)', fontWeight: '500', textAlign: 'left' }}></th>
                                {finalSeriesKeys.map(k => (
                                    <th key={k} style={{
                                        padding: '4px 8px', color: 'var(--text-secondary)',
                                        fontWeight: '500', fontSize: `${fontSize - 1}px`,
                                        maxWidth: `${cellSize + 20}px`, overflow: 'hidden',
                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }} title={k}>{k}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.map((row, ri) => (
                                <tr key={ri}>
                                    <td style={{
                                        padding: '4px 8px', color: 'var(--text-secondary)',
                                        fontSize: `${fontSize}px`, whiteSpace: 'nowrap',
                                        fontWeight: '500',
                                    }}>{String(row[xAxisKey])}</td>
                                    {finalSeriesKeys.map(k => {
                                        const val = Number(row[k]) || 0;
                                        const bg = getColor(val);
                                        return (
                                            <td key={k} style={{
                                                padding: '4px 8px', textAlign: 'center',
                                                backgroundColor: bg, color: textColor(bg),
                                                fontWeight: '600', fontSize: `${fontSize - 1}px`,
                                                minWidth: `${cellSize}px`, borderRadius: '2px',
                                                border: '1px solid rgba(0,0,0,0.1)',
                                            }} title={`${row[xAxisKey]} × ${k}: ${val}`}>
                                                {showLabels ? fmt(val) : ''}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ TREEMAP ━━━
        if (chartType === 'treemap') {
            const treemapData = processedData.map((d, i) => ({
                name: String(d[xAxisKey]),
                size: Number(d[yAxisKeys[0]]) || 0,
                fill: seriesConfig[d[xAxisKey]]?.color || activeColors[i % activeColors.length]
            })).filter(d => d.size > 0);

            const CustomizedTreemapContent = (props) => {
                const { x, y, width, height, index, name, value, fill } = props;
                if (!width || !height || width < 2 || height < 2) return null;
                const textColor = getContrastColor(fill || '#000');
                
                return (
                    <g>
                        <rect x={x} y={y} width={width} height={height} 
                              style={{ fill: fill || 'var(--accent-primary)', stroke: 'var(--surface-overlay)', strokeWidth: 1.5 }} />
                        {showLabels && width > 40 && height > 30 && (
                            <>
                                <text x={x + width / 2} y={y + height / 2 - (height > 40 ? 6 : 0)} 
                                      textAnchor="middle" fill={textColor} fontSize={fontSize} fontWeight="600"
                                >
                                    {name?.length > 15 && width < 100 ? name.substring(0, 12) + '...' : name}
                                </text>
                                {height > 40 && (
                                    <text x={x + width / 2} y={y + height / 2 + 10} 
                                          textAnchor="middle" fill={textColor} fontSize={fontSize - 1} opacity={0.8}
                                    >
                                        {fmt(value)}
                                    </text>
                                )}
                            </>
                        )}
                    </g>
                );
            };

            return (
                <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                        data={treemapData}
                        dataKey="size"
                        aspectRatio={4 / 3}
                        stroke="var(--surface-overlay)"
                        fill="var(--accent-primary)"
                        content={<CustomizedTreemapContent />}
                        isAnimationActive={false}
                    >
                        <Tooltip contentStyle={tooltipStyle} formatter={(val) => [fmt(val), yAxisKeys[0] || 'Size']} />
                    </Treemap>
                </ResponsiveContainer>
            );
        }

        return <div style={{ color: 'var(--text-muted)', padding: '20px' }}>Unsupported chart type: {chartType}</div>;

    } catch (err) {
        console.error('Chart Render Error:', err);
        return <div style={{ color: '#ef4444', padding: 20 }}>Error rendering chart: {err.message}</div>;
    }
});

ChartRenderer.displayName = 'ChartRenderer';

export default ChartRenderer;
