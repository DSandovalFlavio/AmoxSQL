/**
 * DataVisualizer — Main Orchestrator
 *
 * This is the slim entry point that composes all sub-modules:
 * - useChartState for state management
 * - Panel components for the sidebar UI
 * - ChartRenderer for chart rendering
 * - HeadlineOverlay for KPI display
 * - Export utilities for PNG/config saving
 *
 * Props:
 *   data - Array of row objects from query results
 *   isReportMode - Boolean, hides controls for embedded reports
 *   query - SQL query string, saved with chart config
 *   initialChartConfig - Loaded config object (from .amoxvis)
 *   onConfigChange - Callback when config changes
 */
import { memo, useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { LuDownload, LuMaximize, LuMinimize, LuSave, LuUpload, LuChartColumn, LuDatabase, LuSettings2, LuRuler, LuPalette, LuPenLine } from 'react-icons/lu';
import SaveQueryModal from '../SaveQueryModal';
import AlertDialog from '../AlertDialog';

// Core modules
import { useChartState } from './useChartState';
import { COLOR_PALETTES, EXPORT_PRESETS, FONT_OPTIONS, BACKGROUND_TONES } from './constants';
import { processChartData, isDateColumn, computeHeadline } from './utils/dataProcessing';
import { exportChartAsPng, saveChartConfig } from './utils/exportChart';

// Panels
import ChartTypeSelector from './panels/ChartTypeSelector';
import DataPanel from './panels/DataPanel';
import DetailPanel from './panels/DetailPanel';
import AxisPanel from './panels/AxisPanel';
import ThemePanel from './panels/ThemePanel';
import AnnotationsPanel from './panels/AnnotationsPanel';

// Renderers & Overlays
import ChartRenderer from './renderers/ChartRenderer';
import HeadlineOverlay from './overlays/HeadlineOverlay';

// ─── Tab definitions ─────────────────────────────────────────
const TABS = [
    { key: 'chart', icon: LuChartColumn, title: 'Chart' },
    { key: 'data', icon: LuDatabase, title: 'Data' },
    { key: 'detail', icon: LuSettings2, title: 'Detail' },
    { key: 'axes', icon: LuRuler, title: 'Axes' },
    { key: 'theme', icon: LuPalette, title: 'Theme' },
    { key: 'annotate', icon: LuPenLine, title: 'Story' },
];

// ─── Component ───────────────────────────────────────────────
const DataVisualizer = memo(({ data, isReportMode = false, query = '', initialChartConfig = null, onConfigChange = null }) => {
    // ── State ──
    const {
        state, setField, setFields, loadConfig, resetConfig,
        effectiveChartType, effectiveBarStackMode, isHorizontal,
        useConfigChangeNotifier, getConfigForSave,
    } = useChartState(initialChartConfig);

    const [activeTab, setActiveTab] = useState('chart');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });

    const chartRef = useRef(null);
    const fileInputRef = useRef(null);

    // ── Columns ──
    const columns = useMemo(() => data && data.length > 0 ? Object.keys(data[0]) : [], [data]);

    // ── Initialize x/y keys on first load ──
    useMemo(() => {
        if (columns.length > 0 && !state.xAxisKey) {
            const numericCols = columns.filter(c => !isNaN(Number(data[0][c])));
            setFields({
                xAxisKey: columns[0],
                yAxisKeys: numericCols.length > 0 ? [numericCols[0]] : [columns[Math.min(1, columns.length - 1)]],
            });
        }
    }, [columns]);

    // ── Derived data ──
    const isDateCol = useMemo(() => isDateColumn(data, state.xAxisKey), [data, state.xAxisKey]);

    const { processedData, finalSeriesKeys } = useMemo(() =>
        processChartData({
            data, xAxisKey: state.xAxisKey, yAxisKeys: state.yAxisKeys,
            splitByKey: state.splitByKey, isDate: isDateCol,
            dateAggregation: state.dateAggregation, bubbleSizeKey: state.bubbleSizeKey,
            chartType: state.chartType, isCumulative: state.isCumulative,
            sortMode: state.sortMode, limit: state.limit,
        }),
        [data, state.xAxisKey, state.yAxisKeys, state.splitByKey, isDateCol,
            state.dateAggregation, state.bubbleSizeKey, state.chartType,
            state.isCumulative, state.sortMode, state.limit]
    );

    // ── Active colors ──
    const activeColors = useMemo(() =>
        COLOR_PALETTES[state.colorTheme] || COLOR_PALETTES.default,
        [state.colorTheme]
    );

    // ── Headline computation ──
    const headlineData = useMemo(() =>
        computeHeadline(processedData, state.yAxisKeys, state.headline.metric, state.headline.compareWith),
        [processedData, state.yAxisKeys, state.headline.metric, state.headline.compareWith]
    );

    // ── Config change notification ──
    useConfigChangeNotifier(onConfigChange);

    // ── External chart config updates from AI (update_chart_config tool) ──
    // Merges AI changes into the current state via setFields, preserving
    // user-selected axes and other fields not included in the AI's partial update.
    useEffect(() => {
        const handler = (event) => {
            setFields(event.detail.changes);
        };
        window.addEventListener('amox_update_chart_config', handler);
        return () => window.removeEventListener('amox_update_chart_config', handler);
    }, [setFields]);

    // ── Font family resolution ──
    const fontFamily = useMemo(() => {
        const f = FONT_OPTIONS.find(f => f.value === state.fontFamily);
        return f ? f.family : FONT_OPTIONS[0].family;
    }, [state.fontFamily]);

    // ── Background tone resolution ──
    const bgStyle = useMemo(() => {
        switch (state.backgroundTone) {
            case 'darker': return { filter: 'brightness(0.85)' };
            case 'lighter': return { filter: 'brightness(1.15)' };
            case 'warm': return { filter: 'sepia(0.15) brightness(1.02)' };
            case 'cool': return { filter: 'hue-rotate(10deg) brightness(1.02)' };
            case 'custom': return { backgroundColor: state.customBgColor || 'var(--chart-bg)' };
            default: return {};
        }
    }, [state.backgroundTone, state.customBgColor]);

    // ── Border style resolution ──
    const borderCss = useMemo(() => {
        if (state.borderStyle === 'none') return {};
        const color = state.borderColor || 'var(--border-color)';
        const style = state.borderStyle === 'subtle' ? 'solid' : state.borderStyle;
        const width = state.borderStyle === 'subtle' ? '1px' : '2px';
        return { border: `${width} ${style} ${color}`, borderRadius: '8px' };
    }, [state.borderStyle, state.borderColor]);

    // ── Handlers ──
    const handleYAxisChange = useCallback((col) => {
        const keys = state.yAxisKeys.includes(col)
            ? state.yAxisKeys.filter(k => k !== col)
            : [...state.yAxisKeys, col];
        if (keys.length > 0) setField('yAxisKeys', keys);
    }, [state.yAxisKeys, setField]);

    const handleDownload = useCallback(async (preset) => {
        try {
            await exportChartAsPng(chartRef.current, preset, state.chartType);
        } catch {
            setAlertData({ isOpen: true, message: 'Could not export chart.' });
        }
        setShowExportMenu(false);
    }, [state.chartType]);

    const performSaveConfig = useCallback(async (filename) => {
        const result = await saveChartConfig(filename, getConfigForSave(), query);
        if (result.success) setIsSaveModalOpen(false);
        return result;
    }, [getConfigForSave, query]);

    const handleLoadConfig = useCallback((event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const cfg = JSON.parse(e.target.result);
                loadConfig(cfg);
            } catch (err) {
                console.error('Error loading config:', err);
                setAlertData({ isOpen: true, message: 'Failed to parse configuration file.' });
            }
        };
        reader.readAsText(file);
        event.target.value = null;
    }, [loadConfig]);

    // ── Early exit ──
    if (!data || data.length === 0) return <div>No data to visualize</div>;

    // ─── RENDER ──────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', position: 'relative', fontFamily }}>
            <SaveQueryModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                onSave={performSaveConfig}
                initialName="my_chart.amoxvis"
                title="Save Chart Layout"
                placeholder="my_chart.amoxvis"
                hideDescription={true}
            />

            {/* ━━━ Controls Panel ━━━ */}
            {!isReportMode && (
                <div style={{
                    width: '280px', flexShrink: 0, borderRight: '1px solid var(--border-color)',
                    padding: '12px', overflowY: 'auto', backgroundColor: 'var(--panel-bg)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{
                            margin: 0, fontSize: '12px', fontWeight: '600',
                            color: 'var(--text-active)', textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}>Configuration</h3>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <input type="file" accept=".json,.amoxvis" ref={fileInputRef} style={{ display: 'none' }} onChange={handleLoadConfig} />
                            <button onClick={() => fileInputRef.current.click()} title="Load Configuration"
                                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '3px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                                <LuUpload size={13} />
                            </button>
                            <button onClick={() => setIsSaveModalOpen(true)} title="Save Configuration"
                                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '3px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                                <LuSave size={13} />
                            </button>
                            <div style={{ position: 'relative' }}>
                                <button onClick={() => setShowExportMenu(v => !v)} title="Export Chart as PNG"
                                    style={{
                                        background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                                        cursor: 'pointer', padding: '3px 6px', borderRadius: '4px', fontSize: '10px',
                                        display: 'flex', alignItems: 'center', gap: '3px'
                                    }}>
                                    <LuDownload size={13} /> PNG ▾
                                </button>
                                {showExportMenu && (
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                                        background: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                                        borderRadius: '8px', boxShadow: 'var(--shadow-md)', padding: '4px',
                                        zIndex: 999, minWidth: '180px', backdropFilter: 'blur(12px)',
                                    }}>
                                        {EXPORT_PRESETS.map(p => (
                                            <div key={p.label} onClick={() => handleDownload(p)}
                                                className="dv-export-item"
                                                style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>{p.label}</span>
                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.width}×{p.height}</span>
                                            </div>
                                        ))}
                                        <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                                        <div onClick={() => handleDownload({ label: 'Original', width: chartRef.current?.offsetWidth || 1920, height: chartRef.current?.offsetHeight || 1080 })}
                                            className="dv-export-item"
                                            style={{ padding: '5px 10px', cursor: 'pointer', fontSize: '11px', color: 'var(--text-secondary)', borderRadius: '4px' }}>
                                            Original Size
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Tab Navigation ── */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '12px', gap: '2px' }}>
                        {TABS.map(tab => {
                            const IconComp = tab.icon;
                            return (
                                <button key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    title={tab.title}
                                    style={{
                                        flex: 1, padding: '6px 0', background: 'transparent', border: 'none',
                                        borderBottom: activeTab === tab.key ? '2px solid var(--accent-color-user)' : '2px solid transparent',
                                        color: activeTab === tab.key ? 'var(--text-active)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                    <IconComp size={14} />
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Tab Content ── */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {activeTab === 'chart' && (() => {
                            // Compute the effective visual type including stack mode
                            let effectiveType = state.chartType;
                            if (state.chartType === 'bar' && state.barStackMode === 'stack') effectiveType = 'bar-stacked';
                            else if (state.chartType === 'bar' && state.barStackMode === 'expand') effectiveType = 'bar-100';
                            else if (state.chartType === 'bar-horizontal' && state.barStackMode === 'stack') effectiveType = 'bar-horizontal-stacked';
                            else if (state.chartType === 'bar-horizontal' && state.barStackMode === 'expand') effectiveType = 'bar-horizontal-100';

                            return (
                                <ChartTypeSelector
                                    currentType={effectiveType}
                                    onTypeChange={type => {
                                        // Handle compound types
                                        if (type === 'bar-stacked') setFields({ chartType: 'bar', barStackMode: 'stack' });
                                        else if (type === 'bar-100') setFields({ chartType: 'bar', barStackMode: 'expand' });
                                        else if (type === 'bar-horizontal-stacked') setFields({ chartType: 'bar-horizontal', barStackMode: 'stack' });
                                        else if (type === 'bar-horizontal-100') setFields({ chartType: 'bar-horizontal', barStackMode: 'expand' });
                                        else if (type === 'bubble') setFields({ chartType: 'scatter' });
                                        else setFields({ chartType: type, barStackMode: type === 'bar' || type === 'bar-horizontal' ? 'none' : state.barStackMode });
                                    }}
                                />
                            );
                        })()}

                        {activeTab === 'data' && (
                            <DataPanel
                                state={state}
                                columns={columns}
                                isDateColumn={isDateCol}
                                setField={setField}
                                onYAxisChange={handleYAxisChange}
                            />
                        )}

                        {activeTab === 'detail' && (
                            <DetailPanel
                                state={state}
                                setField={setField}
                                finalSeriesKeys={finalSeriesKeys}
                            />
                        )}

                        {activeTab === 'axes' && (
                            <AxisPanel
                                state={state}
                                setField={setField}
                                defaultXLabel={state.xAxisKey}
                                defaultYLabel={state.yAxisKeys.join(', ')}
                            />
                        )}

                        {activeTab === 'theme' && (
                            <ThemePanel
                                state={state}
                                setField={setField}
                                activeColors={activeColors}
                                seriesKeys={finalSeriesKeys}
                                donutData={state.chartType === 'donut' ? processedData : []}
                            />
                        )}

                        {activeTab === 'annotate' && (
                            <AnnotationsPanel
                                state={state}
                                setField={setField}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* ━━━ Chart Area ━━━ */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                backgroundColor: isReportMode ? 'transparent' : 'var(--chart-bg)',
                overflow: isReportMode ? 'visible' : 'hidden',
                ...bgStyle,
                ...borderCss,
                ...(isFullscreen ? {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 9999, padding: '40px',
                } : {}),
            }}>
                {!isReportMode && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: isFullscreen ? '0 0 10px 0' : '8px 16px 0 0' }}>
                        {isFullscreen && (
                            <button onClick={handleDownload} title="Download Chart as PNG"
                                style={{
                                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                                    cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontSize: '11px',
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                }}>
                                <LuDownload size={14} /> PNG
                            </button>
                        )}
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                            style={{
                                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', padding: '4px', borderRadius: '4px',
                                display: 'flex', alignItems: 'center',
                            }}>
                            {isFullscreen ? <LuMinimize size={18} /> : <LuMaximize size={16} />}
                        </button>
                    </div>
                )}

                <div ref={chartRef} style={{
                    flex: 1, padding: isFullscreen ? '0 20px 20px 20px' : '0 20px 20px 20px',
                    display: 'flex', flexDirection: 'column', minHeight: '300px',
                    fontFamily,
                }}>
                    {/* Headline KPI */}
                    <HeadlineOverlay
                        headline={state.headline}
                        headlineData={headlineData}
                        numberFormat={state.numberFormat}
                        decimalPlaces={state.decimalPlaces}
                        textScale={state.textScale}
                        textAlign={state.textAlign}
                    />

                    {/* Title */}
                    {state.chartTitle && (
                        <h2 style={{
                            textAlign: state.textAlign,
                            margin: `0 0 ${state.titleSpacing}px 0`,
                            color: 'var(--text-active)',
                            fontSize: `${Math.round(18 * state.textScale)}px`,
                            fontWeight: '600',
                            paddingLeft: state.textAlign === 'left' ? '50px' : '0',
                        }}>{state.chartTitle}</h2>
                    )}
                    {state.chartSubtitle && (
                        <h3 style={{
                            textAlign: state.textAlign,
                            margin: `0 0 ${state.titleSpacing}px 0`,
                            color: 'var(--text-muted)',
                            fontSize: `${Math.round(14 * state.textScale)}px`,
                            fontWeight: '400',
                            paddingLeft: state.textAlign === 'left' ? '50px' : '0',
                        }}>{state.chartSubtitle}</h3>
                    )}

                    {/* Chart */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '10px', minWidth: '10px', width: '100%', height: '100%' }}>
                        <ChartRenderer
                            config={state}
                            processedData={processedData}
                            finalSeriesKeys={finalSeriesKeys}
                            activeColors={activeColors}
                            columns={columns}
                            isDateColumn={isDateCol}
                            textScale={state.textScale}
                        />
                    </div>

                    {/* Footnote */}
                    {state.chartFootnote && (
                        <div style={{
                            textAlign: state.textAlign,
                            marginTop: `${state.titleSpacing}px`,
                            color: 'var(--text-muted)',
                            fontSize: `${Math.round(12 * state.textScale)}px`,
                            fontStyle: 'italic',
                            borderTop: '1px solid var(--border-color)',
                            paddingTop: '5px',
                            whiteSpace: 'pre-wrap',
                            paddingLeft: state.textAlign === 'left' ? '50px' : '0',
                        }}>{state.chartFootnote}</div>
                    )}
                </div>
            </div>

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))}
                title="Chart Error"
                message={alertData.message}
                type="error"
            />
        </div>
    );
});

DataVisualizer.displayName = 'DataVisualizer';

export default DataVisualizer;
