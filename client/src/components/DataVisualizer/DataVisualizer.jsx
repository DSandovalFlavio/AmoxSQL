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
import { API_BASE } from '../../api';
import { LuDownload, LuMaximize, LuMinimize, LuSave, LuUpload, LuChartColumn, LuDatabase, LuSettings2, LuRuler, LuPalette, LuPenLine, LuInfo, LuX, LuClipboardPaste } from 'react-icons/lu';
import SaveQueryModal from '../SaveQueryModal';
import AlertDialog from '../AlertDialog';

// Core modules
import { useChartState } from './useChartState';
import { COLOR_PALETTES, EXPORT_PRESETS, FONT_OPTIONS, BACKGROUND_TONES } from './constants';
import { processChartData, isDateColumn, computeHeadline } from './utils/dataProcessing';
import { exportChartAsPng, exportChartAsSvg, exportChartAsPptx, saveChartConfig, copyChartToClipboard } from './utils/exportChart';
import { buildSlideRaw } from '../../utils/deckTemplates';
import { serializeDeck } from '../../utils/deckParser';
import { renderRichText } from './utils/richText';
import { getLegendTextColors } from './utils/legendColors';
import InlineLegend from './InlineLegend';

// Panels
import ChartTypeSelector from './panels/ChartTypeSelector';
import DataPanel from './panels/DataPanel';
import FormatPanel from './panels/FormatPanel';
import ThemePanel from './panels/ThemePanel';
import StoryPanel from './panels/StoryPanel';
import ExportPanel from './panels/ExportPanel';
import PasteJsonModal from './panels/PasteJsonModal';

// Renderers & Overlays
import ChartRenderer from './renderers/ChartRenderer';
import HeadlineOverlay from './overlays/HeadlineOverlay';
import { StoryFlowGuide } from './StoryFlowGuide';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';

// ─── Tab definitions ─────────────────────────────────────────
const TABS = [
    { key: 'type', icon: LuChartColumn, title: 'Type', hint: 'What shape tells the story?' },
    { key: 'data', icon: LuDatabase, title: 'Data', hint: 'What goes where?' },
    { key: 'format', icon: LuSettings2, title: 'Format', hint: 'Make it readable' },
    { key: 'style', icon: LuPalette, title: 'Style', hint: 'Make it look good' },
    { key: 'story', icon: LuPenLine, title: 'Story', hint: 'Make it speak' },
    { key: 'export', icon: LuDownload, title: 'Export', hint: 'Ship it' },
];

// ─── Component ───────────────────────────────────────────────
const DataVisualizer = memo(({ data, isReportMode = false, query = '', sourcePath = null, initialChartConfig = null, onConfigChange = null, isActive = true, onCreateNew = null }) => {
    // ── State ──
    const {
        state, setField, setFields, loadConfig, resetConfig,
        effectiveChartType, effectiveBarStackMode, isHorizontal,
        useConfigChangeNotifier, getConfigForSave,
    } = useChartState(initialChartConfig);

    const [activeTab, setActiveTab] = useState('type');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isPasteJsonOpen, setIsPasteJsonOpen] = useState(false);
    const [alertData, setAlertData] = useState({ isOpen: false, message: '' });
    const [showGuide, setShowGuide] = useState(false);

    const chartRef = useRef(null);
    const fileInputRef = useRef(null);

    // ── Columns ──
    const columns = useMemo(() => data && data.length > 0 ? Object.keys(data[0]) : [], [data]);

    // ── Auto-derive x/y keys, re-validating against the data's actual columns ──
    // Runs on mount AND whenever the result columns change (a new query with a
    // different schema). Only fills in axes that are missing or no longer valid,
    // so a user's manual pick survives as long as its column still exists.
    // This MUST be a real effect (not a useMemo side-effect) and MUST re-validate:
    // with keep-alive tabs the DataVisualizer persists across query runs, so a
    // stale axis from a previous query would keep pointing at a column that no
    // longer exists → processChartData returns nothing → the chart shows
    // "No data" until a full app restart. (Reported bug.)
    useEffect(() => {
        if (columns.length === 0) return;
        const xValid = state.xAxisKey && columns.includes(state.xAxisKey);
        const yValid = state.yAxisKeys?.length > 0 && state.yAxisKeys.every(k => columns.includes(k));
        const spInvalid = state.splitByKey && !columns.includes(state.splitByKey);
        if (xValid && yValid && !spInvalid) return;
        const numericCols = columns.filter(c => !isNaN(Number(data[0][c])));
        const fallbackY = numericCols.length > 0 ? [numericCols[0]] : [columns[Math.min(1, columns.length - 1)]];
        const patch = {
            xAxisKey:  xValid ? state.xAxisKey  : columns[0],
            yAxisKeys: yValid ? state.yAxisKeys : fallbackY,
        };
        if (spInvalid) patch.splitByKey = '';
        setFields(patch);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // ── Inline legend items (legendPosition 'inline' — Sterling-style, woven
    // into the subtitle). Built from the series that actually render; series
    // color overrides win, label text uses the palette's legend twin. Donut/pie
    // encode categories per-row, not per-series, so they keep box legends.
    const inlineLegendItems = useMemo(() => {
        if (state.legendPosition !== 'inline') return null;
        if (state.chartType === 'donut') return null;
        if (!finalSeriesKeys || finalSeriesKeys.length === 0) return null;
        const twins = getLegendTextColors(state.colorTheme);
        return finalSeriesKeys.map((key, i) => {
            const custom = state.seriesConfig?.[key]?.color;
            return {
                label: state.seriesConfig?.[key]?.label || key,
                color: custom || activeColors[i % activeColors.length],
                textColor: custom ? null : (twins ? twins[i % twins.length] : null),
                shapeIndex: i,
            };
        });
    }, [state.legendPosition, state.chartType, state.colorTheme, state.seriesConfig, finalSeriesKeys, activeColors]);

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

    // First-run Story Flow tour (editor only, not report mode). Rendering +
    // replay are owned by the global OnboardingHost via the tour registry.
    useEffect(() => {
        if (isReportMode) return;
        if (!hasSeenTour('storyflow')) openTour('storyflow');
    }, [isReportMode]);

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

    // ── Card styling (shadow / radius / gradient background) ──
    const cardCss = useMemo(() => {
        const c = state.cardStyle || {};
        const s = {};
        if (c.radius != null) s.borderRadius = `${c.radius}px`;
        if (c.shadow) s.boxShadow = 'var(--shadow-lg)';
        if (c.gradient) s.background = `linear-gradient(160deg, ${c.gradientFrom || '#1e1f29'}, ${c.gradientTo || '#0f1015'})`;
        return s;
    }, [state.cardStyle]);

    // ── Handlers ──
    const handleYAxisChange = useCallback((col) => {
        const keys = state.yAxisKeys.includes(col)
            ? state.yAxisKeys.filter(k => k !== col)
            : [...state.yAxisKeys, col];
        if (keys.length > 0) setField('yAxisKeys', keys);
    }, [state.yAxisKeys, setField]);

    const handleDownload = useCallback(async (preset) => {
        try {
            await exportChartAsPng(chartRef.current, preset, state.chartType, state.chartTitle);
        } catch {
            setAlertData({ isOpen: true, message: 'Could not export chart.' });
        }
        setShowExportMenu(false);
    }, [state.chartType, state.chartTitle]);

    const handleExportSvg = useCallback(() => {
        try {
            exportChartAsSvg(chartRef.current, state.chartType, state.chartTitle);
        } catch (err) {
            setAlertData({ isOpen: true, title: 'SVG', type: 'error', message: err.message || 'Could not export chart as SVG.' });
        }
        setShowExportMenu(false);
    }, [state.chartType, state.chartTitle]);

    const [isExportingPptx, setIsExportingPptx] = useState(false);
    const handleExportPptx = useCallback(async () => {
        if (isExportingPptx) return;
        setIsExportingPptx(true);
        try {
            await exportChartAsPptx(chartRef.current, getConfigForSave(), processedData, state.chartType, state.chartTitle, activeColors);
        } catch (err) {
            setAlertData({ isOpen: true, title: 'PowerPoint', type: 'error', message: err.message || 'Could not export chart as PowerPoint.' });
        } finally {
            setIsExportingPptx(false);
        }
        setShowExportMenu(false);
    }, [isExportingPptx, getConfigForSave, processedData, state.chartType, state.chartTitle, activeColors]);

    const handleCopy = useCallback(async () => {
        try {
            await copyChartToClipboard(chartRef.current);
            setAlertData({ isOpen: true, title: 'Copied', type: 'success', message: 'Chart copied to clipboard as an image.' });
        } catch {
            setAlertData({ isOpen: true, title: 'Clipboard', type: 'error', message: 'Could not copy chart to clipboard.' });
        }
    }, []);

    // Export the PROCESSED rows behind the figure as CSV (Sterling idea, MIT ©
    // La Matemaga): the exact aggregated/pivoted rows the chart draws, so the
    // summary is inspectable — not the untouched source query.
    const handleExportData = useCallback(() => {
        const rows = processedData;
        if (!rows || rows.length === 0) {
            setAlertData({ isOpen: true, title: 'No data', type: 'error', message: 'There are no processed rows to export yet.' });
            return;
        }
        const cols = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set()));
        const esc = (v) => {
            if (v == null) return '';
            const s = String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const base = (state.chartTitle || 'chart').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'chart';
        a.href = url;
        a.download = `${base}-data.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [processedData, state.chartTitle]);

    // 'save' — the plain "Save as .amoxvis" flow. 'presentation' — Fase 4:
    // "Add to new presentation" reuses the same save step (a deck slide has
    // to reference a real .amoxvis file, so there's no way around saving
    // one) and then, once it exists on disk, builds a one-slide deck around
    // it and opens that as a new unsaved tab for the user to name and save.
    const [saveIntent, setSaveIntent] = useState('save');

    const performSaveConfig = useCallback(async (filename) => {
        // sourcePath links the new .amoxvis back to the .sql file this query
        // came from (Fase 3 — procedencia), so editing the query later can
        // go to that file instead of a copy embedded in the chart. Only set
        // for charts built from a saved .sql tab — an ad-hoc/notebook query
        // has no such file to point at.
        const result = await saveChartConfig(filename, getConfigForSave(), query, sourcePath);
        if (result.success) {
            setIsSaveModalOpen(false);
            if (saveIntent === 'presentation' && onCreateNew) {
                const chartPath = filename.endsWith('.amoxvis') ? filename : `${filename}.amoxvis`;
                const title = (state.chartTitle || chartPath.split(/[/\\]/).pop().replace(/\.amoxvis$/, '')).replace(/[^\w\s-]+/g, '');
                const frontMatterText = `---\ntitle: ${title}\ntheme: dark\naspect: "16:9"\n---`;
                const deckMarkdown = serializeDeck(frontMatterText, [{ raw: buildSlideRaw({ layout: 'chart-full', chartSrc: chartPath }) }]);
                onCreateNew('amoxdeck', deckMarkdown);
            }
        }
        return result;
    }, [getConfigForSave, query, sourcePath, saveIntent, onCreateNew, state.chartTitle]);

    const handleGenerateStory = useCallback(async () => {
        if (!data || data.length === 0 || !state.xAxisKey || !state.yAxisKeys?.[0]) return null;
        const res = await fetch(`${API_BASE}/api/ai/chart-story`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: data.slice(0, 500),
                xKey: state.xAxisKey,
                yKey: state.yAxisKeys[0],
                chartType: state.chartType,
            }),
        });
        if (!res.ok) return { error: 'Server error generating story.' };
        return res.json();
    }, [data, state.xAxisKey, state.yAxisKeys, state.chartType]);

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
                title={saveIntent === 'presentation' ? 'Save Chart — then add to a new presentation' : 'Save Chart Layout'}
                placeholder="my_chart.amoxvis"
                hideDescription={true}
            />

            {/* ━━━ Controls Panel ━━━ */}
            {!isReportMode && (
                <div style={{
                    width: '320px', flexShrink: 0, borderRight: '1px solid var(--border-color)',
                    padding: '12px', overflowY: 'auto',
                    backgroundColor: 'var(--panel-bg)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    {/* ── Header ── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{
                            margin: 0, fontSize: '12px', fontWeight: '600',
                            color: 'var(--text-active)', textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}>Story Flow</h3>
                        <input type="file" accept=".json,.amoxvis" ref={fileInputRef} style={{ display: 'none' }} onChange={handleLoadConfig} />
                        <button onClick={() => setShowGuide(true)} title="What is Story Flow?"
                            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', padding: '3px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                            <LuInfo size={13} />
                        </button>
                    </div>

                    {/* ── Tab Navigation — segmented control ── */}
                    <div className="seg seg--fill" style={{ marginBottom: '12px' }}>
                        {TABS.map(tab => {
                            const IconComp = tab.icon;
                            return (
                                <button key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    title={tab.title}
                                    className={`seg-item${activeTab === tab.key ? ' seg-item--active' : ''}`}>
                                    <IconComp size={14} />
                                </button>
                            );
                        })}
                    </div>

                    {/* ── Tab hint ── */}
                    {(() => {
                        const cur = TABS.find(t => t.key === activeTab);
                        return cur?.hint ? (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '-4px 0 10px 0', fontStyle: 'italic' }}>
                                {cur.hint}
                            </div>
                        ) : null;
                    })()}

                    {/* ── Tab Content ── */}
                    <div style={{ flex: 1, overflowY: 'auto', scrollbarGutter: 'stable', paddingRight: '4px' }}>
                        {activeTab === 'type' && (() => {
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

                        {activeTab === 'format' && (
                            <FormatPanel
                                state={state}
                                setField={setField}
                                finalSeriesKeys={finalSeriesKeys}
                            />
                        )}

                        {activeTab === 'style' && (
                            <ThemePanel
                                state={state}
                                setField={setField}
                                activeColors={activeColors}
                                seriesKeys={finalSeriesKeys}
                                donutData={state.chartType === 'donut' ? processedData : []}
                            />
                        )}

                        {activeTab === 'story' && (
                            <StoryPanel
                                state={state}
                                setField={setField}
                                onGenerateStory={handleGenerateStory}
                                xValues={[...new Set(processedData.map(d => d[state.xAxisKey]))]}
                            />
                        )}

                        {activeTab === 'export' && (
                            <ExportPanel
                                onExport={handleDownload}
                                onExportSvg={handleExportSvg}
                                onExportPptx={handleExportPptx}
                                isExportingPptx={isExportingPptx}
                                onOpenSave={() => { setSaveIntent('save'); setIsSaveModalOpen(true); }}
                                onAddToPresentation={onCreateNew ? () => { setSaveIntent('presentation'); setIsSaveModalOpen(true); } : null}
                                onLoadFile={() => fileInputRef.current.click()}
                                onCopy={handleCopy}
                                onPasteJson={() => setIsPasteJsonOpen(true)}
                                onExportData={handleExportData}
                                chartRef={chartRef}
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
                ...cardCss,
                ...(isFullscreen ? {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 9999, padding: '40px',
                } : {}),
            }}>
                {!isReportMode && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: isFullscreen ? '0 0 10px 0' : '8px 16px 0 0' }}>
                        {isFullscreen && (
                            <button onClick={() => handleDownload({ label: 'original', width: chartRef.current?.offsetWidth, height: chartRef.current?.offsetHeight })} title="Download Chart as PNG"
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
                    // Contain layout/paint so the chart's internal reflow stays local,
                    // without forcing a giant GPU texture (translateZ) — a fullscreen SVG
                    // layer saturates the compositor and makes scrollbars stutter.
                    contain: 'layout paint',
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
                        }}>
                            {renderRichText(state.chartTitle)}
                            {/* QED-like title mark (Sterling): a period in the accent color */}
                            {state.titleMark && <span style={{ color: 'var(--accent-color-user)' }}>.</span>}
                        </h2>
                    )}
                    {(state.chartSubtitle || inlineLegendItems) && (
                        <h3 style={{
                            textAlign: state.textAlign,
                            margin: `0 0 ${state.titleSpacing}px 0`,
                            color: 'var(--text-muted)',
                            fontSize: `${Math.round(14 * state.textScale)}px`,
                            fontWeight: '400',
                            paddingLeft: state.textAlign === 'left' ? '50px' : '0',
                        }}>
                            {state.chartSubtitle ? renderRichText(state.chartSubtitle) : null}
                            {inlineLegendItems && (
                                <>
                                    {state.chartSubtitle ? ' ' : null}
                                    <InlineLegend
                                        items={inlineLegendItems}
                                        fontSize={Math.round(14 * state.textScale)}
                                    />
                                </>
                            )}
                        </h3>
                    )}

                    {/* Chart — only mount the ResponsiveContainer when this view is
                        actually visible. With keep-alive result tabs the whole
                        DataVisualizer stays mounted even while the chart panel is
                        display:none; if Recharts' ResponsiveContainer mounts in a
                        0×0 (hidden) box it measures 0 and doesn't reliably re-size
                        when shown → a blank chart. Gating the mount on isActive means
                        it always measures the real, visible size. (Config state lives
                        on DataVisualizer, which stays mounted — nothing is lost.) */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '10px', minWidth: '10px', width: '100%', height: '100%' }}>
                        {(isActive || isReportMode) && (
                            <ChartRenderer
                                config={state}
                                processedData={processedData}
                                finalSeriesKeys={finalSeriesKeys}
                                activeColors={activeColors}
                                columns={columns}
                                isDateColumn={isDateCol}
                                textScale={state.textScale}
                            />
                        )}
                    </div>

                    {/* Takeaway */}
                    {state.takeaway && (
                        <div style={{
                            marginTop: `${state.titleSpacing}px`,
                            color: 'var(--text-secondary)',
                            fontSize: `${Math.round(13 * state.textScale)}px`,
                            lineHeight: 1.5,
                            borderLeft: '3px solid var(--accent-color-user)',
                            paddingLeft: '10px',
                            textAlign: state.textAlign,
                            marginLeft: state.textAlign === 'left' ? '50px' : '0',
                            whiteSpace: 'pre-wrap',
                        }}>{renderRichText(state.takeaway)}</div>
                    )}

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

                    {/* Editorial caption row (Sterling figure shell): Source + signature.
                        Mono, muted, split left/right — the publication contract at the foot. */}
                    {(state.chartSource || state.signature?.visible) && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            gap: '12px',
                            flexWrap: 'wrap',
                            marginTop: `${state.titleSpacing}px`,
                            paddingTop: '5px',
                            borderTop: state.chartFootnote ? 'none' : '1px solid var(--border-color)',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                            fontSize: `${Math.round(11 * state.textScale)}px`,
                            paddingLeft: state.textAlign === 'left' ? '50px' : '0',
                        }}>
                            <span>
                                {state.chartSource && (
                                    <><span style={{ color: 'var(--text-secondary)' }}>Source:</span> {state.chartSource}</>
                                )}
                            </span>
                            {state.signature?.visible && (
                                <span style={{ color: 'var(--text-secondary)', textAlign: 'right' }}>
                                    {state.signature.author
                                        ? `Made by ${state.signature.author} with AmoxSQL`
                                        : 'Made with AmoxSQL'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showGuide && (
                <div onClick={() => setShowGuide(false)} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', padding: '20px 22px' }}>
                        <button onClick={() => setShowGuide(false)} title="Close"
                            style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                            <LuX size={18} />
                        </button>
                        <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <LuInfo size={16} /> Story Flow
                        </h2>
                        <StoryFlowGuide />
                    </div>
                </div>
            )}

            <PasteJsonModal
                isOpen={isPasteJsonOpen}
                onClose={() => setIsPasteJsonOpen(false)}
                onApply={(cfg) => { loadConfig(cfg); setAlertData({ isOpen: true, title: 'Config aplicada', type: 'success', message: 'La configuración del gráfico se aplicó correctamente.' }); }}
                columns={columns}
            />

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))}
                title={alertData.title || 'Chart'}
                message={alertData.message}
                type={alertData.type || 'error'}
            />
        </div>
    );
});

DataVisualizer.displayName = 'DataVisualizer';

export default DataVisualizer;
