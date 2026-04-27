import { useMemo, useState, Component } from 'react';
import { LuMaximize2, LuDownload, LuFileJson, LuImage } from 'react-icons/lu';
import html2canvas from 'html2canvas';
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
const ChatResultsBlock = ({ chartConfig, allMessages, isDiving, onExportNotebook, onExportAmoxvis }) => {
    const [isExpanded, setIsExpanded] = useState(false);
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

    // Merge LLM config with required defaults for ChartRenderer
    const fullConfig = useMemo(() => {
        return {
            chartType: chartConfig.chartType || 'bar',
            xAxisKey: chartConfig.xAxisKey,
            yAxisKeys: chartConfig.yAxisKeys || [],
            chartTitle: chartConfig.title || '',
            numberFormat: 'auto',
            decimalPlaces: 2,
            gridMode: 'horizontal',
            showAxisLines: true,
            yLogScale: false,
            yAxisDomain: ['auto', 'auto'],
            showXAxisTitle: true,
            showYAxisTitle: true,
            customAxisTitles: {},
            xAxisLabelAngle: '0',
            showLabels: true,
            dataLabelPosition: 'outside',
            dataLabelSize: 10,
            tooltipShowPercent: false,
            legendPosition: 'top',
            lineType: 'monotone',
            lineAreaFill: false,
            showDots: true,
            barStackMode: 'none',
            barRadius: 2,
            barColorMode: 'series',
            donutThickness: 60,
            donutCenterKpi: 'none',
            donutLabelContent: 'percent',
            donutLabelPosition: 'outside',
            donutGroupingThreshold: 0,
            scatterQuadrants: false,
            highlightConfig: { type: 'none' },
            seriesConfig: {},
            refLine: { value: '', label: '', color: '#ff0000', style: 'dashed' },
            refArea: { x1: '', x2: '', y1: '', y2: '', color: '#ff0000', opacity: 0.1 },
            goalLine: { enabled: false, value: '', label: '', color: '#00ff00', style: 'dashed' },
            trendLine: { type: 'none', windowSize: 3, color: '#ffaa00' },
            headline: { metric: 'total', compareWith: 'none' },
            textScale: 0.9,
            textAlign: 'left',
            titleSpacing: 10,
            marginTop: 10,
            marginBottom: 10,
            marginLeft: 10,
            marginRight: 10,
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

    const activeColors = COLOR_PALETTES.default;
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
