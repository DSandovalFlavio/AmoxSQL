import { useMemo, useState, Component } from 'react';
import { LuMaximize2, LuDownload, LuFileJson } from 'react-icons/lu';
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
const ChatResultsBlock = ({ chartConfig, allMessages, isDiving, onExportNotebook }) => {
    const [isExpanded, setIsExpanded] = useState(false);

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

    return (
        <div className="ai-chart">
            {/* Header */}
            <div className="ai-chart-header">
                <span className="ai-chart-title">
                    {chartConfig.title || 'Data Visualization'}
                </span>
                {!isDiving && (
                    <button
                        className="ai-chart-btn"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                        <LuMaximize2
                            size={13}
                            style={{
                                transform: isExpanded ? 'rotate(180deg)' : 'none',
                                transition: 'transform 0.2s',
                            }}
                        />
                    </button>
                )}
            </div>

            {/* Chart Area */}
            <div className={`ai-chart-area${isExpandedMode ? ' ai-chart-area--expanded' : ''}`}>
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
                        className="ai-chart-btn ai-chart-btn--primary"
                        onClick={() => {
                            if (onExportNotebook) {
                                // Extract surrounding markdown if available, or just generic message
                                const contextMarkdown = `Automatic AI Export for: **${chartConfig.title || 'Data Analysis'}**`;
                                onExportNotebook(chartConfig.title, sourceQuery, contextMarkdown);
                            }
                        }}
                        title="Export to new SQL Notebook"
                    >
                        <LuFileJson size={11} /> To Notebook
                    </button>
                    <button
                        className="ai-chart-btn"
                        title="Export Config JSON"
                    >
                        <LuFileJson size={11} /> Config
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatResultsBlock;
