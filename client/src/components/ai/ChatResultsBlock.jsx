import { useMemo, useState, Component } from 'react';
import { LuMaximize2, LuDownload, LuFileJson, LuImage, LuCheck, LuChartColumn } from 'react-icons/lu';
import html2canvas from 'html2canvas-pro';
import ChartRenderer from '../DataVisualizer/renderers/ChartRenderer';
import { processChartData, isDateColumn } from '../DataVisualizer/utils/dataProcessing';
import { COLOR_PALETTES } from '../DataVisualizer/constants';

/**
 * Catches Recharts' internal infinite-update crash (LegendSizeDispatcher bug in v3.x)
 * so a single broken chart doesn't take down the whole chat UI.
 */
class ChartErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { crashed: false };
    }
    static getDerivedStateFromError() {
        return { crashed: true };
    }
    componentDidCatch(err) {
        console.warn('[ChartErrorBoundary] Recharts error caught:', err?.message || err);
    }
    render() {
        if (this.state.crashed) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                    Chart unavailable — try expanding the view.
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * ChatResultsBlock — Renders an inline chart visualization for the AI chat.
 * Finds the data from previous messages using queryId and renders ChartRenderer.
 */
const ChatResultsBlock = ({ chartConfig, allMessages, isDiving, onExportNotebook, onExportAmoxvis, onApplyChart }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [applied, setApplied] = useState(false);
    const chartDOMId = useMemo(() => `ai-chart-${Math.random().toString(36).substr(2, 9)}`, []);

    // Find the data in previous messages
    const { data, sourceQuery, executionTime } = useMemo(() => {
        if (!allMessages || !chartConfig?.queryId) return { data: null, sourceQuery: null, executionTime: null };

        for (const msg of allMessages) {
            if (msg.toolCalls) {
                for (const tc of msg.toolCalls) {
                    if (tc.toolName === 'execute_sql' && tc.result?.queryId === chartConfig.queryId) {
                        return {
                            data: tc.result.data || [],
                            sourceQuery: tc.args?.query || '',
                            executionTime: tc.result.executionTime,
                        };
                    }
                }
            }
        }
        return { data: null, sourceQuery: null, executionTime: null };
    }, [allMessages, chartConfig]);

    if (!data || data.length === 0) {
        return (
            <div className="ai-chart ai-chart--empty">
                [Chart: Waiting for data {chartConfig?.queryId}]
            </div>
        );
    }

    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    const isDateCol = isDateColumn(data, chartConfig.xAxisKey);

    // Merge LLM config with defaults. AI-supplied values always win over defaults.
    const fullConfig = useMemo(() => {
        const cc = chartConfig;
        const hasXLabel = !!cc.xAxisLabel;
        const hasYLabel = !!cc.yAxisLabel;
        return {
            // ── Core ──────────────────────────────────────────────────────────────
            chartType:   cc.chartType || 'bar',
            xAxisKey:    cc.xAxisKey,
            yAxisKeys:   cc.yAxisKeys || [],
            chartTitle:  cc.title || cc.chartTitle || '',
            chartSubtitle: cc.chartSubtitle || '',
            chartFootnote: cc.chartFootnote || '',

            // ── Data mapping ──────────────────────────────────────────────────────
            rightYAxisKey: cc.rightYAxisKey || '',
            splitByKey:    cc.splitByKey    || '',
            bubbleSizeKey: cc.bubbleSizeKey || '',

            // ── Axes ──────────────────────────────────────────────────────────────
            customAxisTitles: { x: cc.xAxisLabel || '', y: cc.yAxisLabel || '' },
            showXAxisTitle:   hasXLabel,
            showYAxisTitle:   hasYLabel,
            xAxisLabelAngle:  cc.xAxisLabelAngle ?? 0,
            dateAggregation:  cc.dateAggregation || 'none',
            yLogScale:        cc.yLogScale ?? false,
            yAxisDomain:      ['auto', 'auto'],
            yAxisPosition:    'left',
            showAxisLines:    true,

            // ── Data options ──────────────────────────────────────────────────────
            numberFormat:  cc.numberFormat  || 'compact',
            decimalPlaces: -1,
            sortMode:      cc.sortMode      || 'natural',
            limit:         cc.limit         ?? 0,
            isCumulative:  cc.isCumulative  ?? false,

            // ── Visual style ──────────────────────────────────────────────────────
            colorTheme:     cc.colorTheme    || 'default',
            showLabels:     cc.showLabels    ?? false,
            dataLabelPosition: 'outside',
            dataLabelSize:  10,
            legendPosition: cc.legendPosition || 'top',
            gridMode:       cc.gridMode      || 'horizontal',
            tooltipShowPercent: false,
            textScale:  0.9,
            textAlign:  cc.textAlign || 'left',
            titleSpacing: 10,
            marginTop: 10, marginBottom: 10, marginLeft: 10, marginRight: 10,

            // ── Line/Area ─────────────────────────────────────────────────────────
            lineType:     cc.lineType    || 'monotone',
            lineAreaFill: false,
            showDots:     cc.showDots    ?? true,

            // ── Bar ───────────────────────────────────────────────────────────────
            barStackMode:  'none',
            barRadius:     cc.barRadius     ?? 2,
            barColorMode:  cc.barColorMode  || 'series',

            // ── Donut ─────────────────────────────────────────────────────────────
            donutThickness:        60,
            donutCenterKpi:        cc.donutCenterKpi    || 'none',
            donutLabelContent:     cc.donutLabelContent || 'percent',
            donutLabelPosition:    'outside',
            donutGroupingThreshold: 0,

            // ── Scatter ───────────────────────────────────────────────────────────
            scatterQuadrants: false,

            // ── Analytical overlays ───────────────────────────────────────────────
            trendLine:       cc.trendLine     || { type: 'none', windowSize: 3, color: '#fbbf24' },
            goalLine:        cc.goalLine      || { enabled: false, value: '', label: '', color: '#22c55e', style: 'dashed' },
            refLine:         cc.refLine       || { value: '', label: '', color: '#ff4444', style: 'dashed' },
            refArea:         { x1: '', x2: '', y1: '', y2: '', color: '#ffffff', opacity: 0.1 },
            highlightConfig: cc.highlightConfig || { type: 'none', value: '', color: '#ff4444' },

            // ── Headline KPI ──────────────────────────────────────────────────────
            headline: cc.headline || { visible: false, metric: 'total', compareWith: 'none', size: 'auto' },

            // ── Series colors ─────────────────────────────────────────────────────
            seriesConfig: {},
        };
    }, [chartConfig]);

    // Process data for ChartRenderer
    const { processedData, finalSeriesKeys } = useMemo(() => {
        return processChartData({
            data,
            xAxisKey: fullConfig.xAxisKey,
            yAxisKeys: fullConfig.yAxisKeys,
            splitByKey: fullConfig.splitByKey,
            isDate: isDateCol,
            dateAggregation: fullConfig.dateAggregation,
            bubbleSizeKey: fullConfig.bubbleSizeKey,
            chartType: fullConfig.chartType,
            isCumulative: fullConfig.isCumulative,
            sortMode: fullConfig.sortMode,
            limit: fullConfig.limit || 0,
        });
    }, [data, fullConfig, isDateCol]);

    const activeColors = COLOR_PALETTES[fullConfig.colorTheme] || COLOR_PALETTES.default;
    const isExpandedMode = isExpanded || isDiving;

    const handleDownloadImage = async () => {
        const chartEl = document.getElementById(`${chartDOMId}-area`);
        if (!chartEl) return;
        try {
            const canvas = await html2canvas(chartEl, { backgroundColor: '#1e1e1e' });
            const link = document.createElement('a');
            link.download = `chart_${chartConfig.queryId || 'export'}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.error('Error downloading chart image:', err);
        }
    };

    const handleToggleFullscreen = () => {
        const el = document.getElementById(chartDOMId);
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const handleDownloadConfig = () => {
        if (onExportAmoxvis) {
            onExportAmoxvis(chartConfig.title, sourceQuery, fullConfig);
        } else {
            const blob = new Blob([JSON.stringify(fullConfig, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chart_config_${chartConfig.queryId || 'export'}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    return (
        <div id={chartDOMId} className="ai-chart">
            {/* Header */}
            <div className="ai-chart-header">
                <span className="ai-chart-title">
                    {chartConfig.title || 'Data Visualization'}
                </span>
                <button
                    className="ai-chart-btn"
                    onClick={handleToggleFullscreen}
                    title="Toggle Fullscreen"
                >
                    <LuMaximize2 size={13} />
                </button>
            </div>

            {/* Chart Area */}
            <div id={`${chartDOMId}-area`} className={`ai-chart-area${isExpandedMode ? ' ai-chart-area--expanded' : ''}`} style={{ padding: '10px 0' }}>
                <ChartErrorBoundary>
                    <ChartRenderer
                        config={fullConfig}
                        processedData={processedData}
                        finalSeriesKeys={finalSeriesKeys}
                        activeColors={activeColors}
                        columns={columns}
                        isDateColumn={isDateCol}
                        textScale={isExpandedMode ? 1 : 0.8}
                    />
                </ChartErrorBoundary>
            </div>

            {/* Footer / Actions */}
            <div className="ai-chart-footer">
                <span className="ai-chart-meta">
                    Based on {data.length} rows {executionTime ? `(${executionTime}ms)` : ''}
                </span>
                <div className="ai-chart-footer-actions">
                    {onApplyChart && (
                        <button
                            className="ai-chart-btn"
                            style={applied ? undefined : { background: 'var(--accent-primary)', color: 'var(--button-text-color, #fff)', borderColor: 'transparent' }}
                            onClick={() => {
                                // Apply only meaningful chart fields — keep the file's own
                                // sizing/margins (the chat preview uses compact cosmetics).
                                const { textScale, marginTop, marginBottom, marginLeft, marginRight,
                                    dataLabelSize, decimalPlaces, yAxisPosition, ...applyCfg } = fullConfig;
                                onApplyChart(applyCfg);
                                setApplied(true);
                            }}
                            title="Apply this chart to your file's visualization"
                        >
                            {applied ? <><LuCheck size={12} /> Applied</> : <><LuChartColumn size={12} /> Apply to chart</>}
                        </button>
                    )}
                    <button
                        className="ai-chart-btn"
                        onClick={handleDownloadImage}
                        title="Download Chart as PNG"
                    >
                        <LuImage size={12} /> PNG
                    </button>
                    <button
                        className="ai-chart-btn"
                        onClick={handleDownloadConfig}
                        title="Edit in Amoxvis"
                    >
                        <LuFileJson size={12} /> Edit Config
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatResultsBlock;
