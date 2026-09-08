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
import { COLOR_PALETTES, EXPORT_PRESETS, FONT_OPTIONS, BACKGROUND_TONES, CANVAS_SIZES, resolveLayout } from './constants';
import { processChartData, isDateColumn, computeHeadline } from './utils/dataProcessing';
import { exportChartAsPng, exportChartAsSvg, exportChartAsPptx, saveChartConfig, copyChartToClipboard } from './utils/exportChart';
import { buildSlideRaw } from '../../utils/deckTemplates';
import { serializeDeck } from '../../utils/deckParser';
import { renderRichText } from './utils/richText';
import { formatNumber } from './utils/numberFormat';
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
/**
 * Coloca las siete piezas de la tarjeta según el modo de composición.
 *
 * `stacked`      — columna. Lo de siempre, y lo que usa el panel del IDE.
 * `split-header` — título y subtítulo a la izquierda, KPI a la derecha, en la
 *                  misma fila. Recupera el alto que el lienzo necesita cuando
 *                  la tarjeta es ancha y baja.
 * `side`         — texto en una columna y lienzo en la otra. Es el modo de 16:9
 *                  y banner: se lee la frase y luego se mira la prueba, sin
 *                  desplazarse en vertical.
 *
 * `retiradas` es el conjunto de piezas que no caben; se comprueba aquí y no en
 * cada rama para que el orden de retirada sea el mismo en las tres.
 */
function componerFigura(modo, piezas, retiradas, kpiEnCabecera, desnuda) {
    const hay = (k) => !retiradas.has(k);
    const p = (k) => (hay(k) ? piezas[k] : null);

    /* Figura desnuda: sólo el lienzo. Dentro de una lámina de Report Flow la
       tarjeta se disuelve —la lámina YA es la tarjeta: pone fondo, borde,
       título, conclusión y firma— y sus piezas suben de nivel a través de
       `onPiezas`. Meter aquí otra tarjeta duplicaría las cinco y sumaría los
       rellenos, dejando al dibujo poco más de la mitad del hueco.
       Ver docs/dev/sistema_deck.html, apartado 05. */
    if (desnuda) return piezas.lienzo;

    /* La cifra va donde tú digas, no donde la deje la maqueta. Antes el modo
       'split-header' la mandaba a la derecha por su cuenta y saltaba de sitio al
       cambiar el ancho del panel: se sentía como que el gráfico se movía solo.
       Ahora la posición es una opción (headline.position) y la maqueta la
       respeta en los tres modos. */
    const cabecera = kpiEnCabecera ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>{piezas.titulo}{p('sub')}</div>
            <div style={{ flex: 'none' }}>{piezas.kpi}</div>
        </div>
    ) : (
        <>{piezas.titulo}{p('sub')}{piezas.kpi}</>
    );

    if (modo === 'side') {
        return (
            <div style={{
                flex: 1, minHeight: 0, display: 'grid',
                gridTemplateColumns: 'minmax(0, 34%) minmax(0, 1fr)',
                gap: '0 26px', alignItems: 'start',
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {cabecera}{p('takeaway')}{p('nota')}{p('firma')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
                    {piezas.lienzo}
                </div>
            </div>
        );
    }

    /* 'split-header' ya no es un modo aparte: era exactamente "el KPI a la
       derecha del título", que ahora es una opción del KPI. Se mantiene el valor
       para no romper los .amoxvis guardados con él, y hace lo mismo que apilado
       con la cifra en cabecera. */
    return (
        <>
            {cabecera}{piezas.lienzo}{p('takeaway')}{p('nota')}{p('firma')}
        </>
    );
}

/**
 * Qué piezas se retiran cuando no hay alto.
 *
 * Por UMBRALES y no midiendo bloque a bloque: medir cada pieza obliga a pintar,
 * medir y volver a pintar, y con el lienzo dentro eso son dos reflujos por
 * cambio de tamaño. Con umbrales el resultado es el mismo y es predecible.
 * El orden es fijo — nota al pie, subtítulo, fuente y firma, conclusión — y
 * título, KPI y lienzo no se retiran nunca.
 */
/**
 * El ancho NATURAL de una tarjeta con esa proporción: su tamaño al 100 %.
 *
 * 880×620 es la caja de diseño. Se toma el ancho, pero acotado por el alto: una
 * tarjeta muy apaisada no puede medir 880 de ancho y quedarse en 460 de alto sin
 * dejar de parecerse a las demás, y una vertical no puede medir 880 de ancho
 * porque no cabría de alto en ninguna pantalla.
 */
const ANCHO_DISENO = 880;
const ALTO_DISENO = 620;
const anchoBase = (razon) => Math.min(ANCHO_DISENO, ALTO_DISENO * razon);

function calcularRetiradas(alto) {
    if (!alto || alto >= 420) return new Set();
    if (alto >= 340) return new Set(['nota']);
    if (alto >= 280) return new Set(['nota', 'sub']);
    if (alto >= 230) return new Set(['nota', 'sub', 'firma']);
    return new Set(['nota', 'sub', 'firma', 'takeaway']);
}

const DataVisualizer = memo(({ data, isReportMode = false, query = '', sourcePath = null, initialChartConfig = null, onConfigChange = null, isActive = true, onCreateNew = null, chrome = 'card', onPiezas = null }) => {
    // 'none' disuelve la tarjeta y deja sólo el lienzo: lo que necesita una
    // lámina de Report Flow, que ya aporta el marco. `isReportMode` NO sirve
    // para esto — sólo oculta los controles y transparenta el fondo.
    const desnuda = chrome === 'none';
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
    /* La TARJETA entera, con su filete, sus esquinas y su aire. Es lo que hay que
       capturar al exportar: `chartRef` apunta al div de dentro, así que el PNG
       salía sin tarjeta — el gráfico al ras y el texto pegado arriba. */
    const cardRef = useRef(null);
    /* El área donde vive la tarjeta. Se mide para poder darle a la tarjeta su
       tamaño real dentro de ella en vez de dejar que se estire. */
    const areaRef = useRef(null);
    const [area, setArea] = useState({ w: 0, h: 0 });
    /* El tamaño REAL de la tarjeta, medido. De aquí sale la escala del texto, y
       por eso funciona igual en el editor y durante la exportación (donde la
       tarjeta recibe medidas mucho mayores). */
    const [tamMedido, setTamMedido] = useState({ w: 0, h: 0 });
    const [zoom, setZoom] = useState(1);
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
        /* Intenté esconderla con una sola serie por considerarla ruido. Error:
           en los gráficos donde la categoría va por fila — treemap, barras por
           categoría — hay UNA sola clave de serie y la leyenda es justo lo que
           da sentido a los colores. Se queda como estaba. */
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
        computeHeadline(processedData, state.yAxisKeys, state.headline.metric, state.headline.compareWith, state.headline.window),
        [processedData, state.yAxisKeys, state.headline.metric, state.headline.compareWith, state.headline.window]
    );

    /* ── Las piezas de la tarjeta, hacia arriba ──
       Cuando la tarjeta se disuelve dentro de una lámina, sus piezas no
       desaparecen: suben de nivel y las coloca la lámina (el título pasa a ser
       la afirmación, el KPI entra en la tira, la conclusión se queda con su
       filete). Se emiten desde aquí y no se recalculan fuera a propósito: la
       matriz de validez del KPI vive en `computeHeadline` y duplicarla ya
       costó una ronda de correcciones.
       El número va ya formateado para que quien lo reciba no necesite conocer
       `numberFormat` ni `decimalPlaces`. */
    const onPiezasRef = useRef(onPiezas);
    useEffect(() => { onPiezasRef.current = onPiezas; }, [onPiezas]);
    useEffect(() => {
        if (!onPiezasRef.current) return;
        const fmt = (v) => formatNumber(v, state.numberFormat, state.decimalPlaces);
        const hayKpi = state.headline?.visible && headlineData?.value !== null && headlineData?.value !== undefined;
        onPiezasRef.current({
            title: state.chartTitle || '',
            subtitle: state.chartSubtitle || '',
            takeaway: state.takeaway || '',
            footnote: state.chartFootnote || '',
            kpi: hayKpi ? {
                label: (state.yAxisKeys && state.yAxisKeys[0]) || '',
                value: fmt(headlineData.value),
                deltaPercent: headlineData.deltaPercent,
                delta: headlineData.deltaPercent !== null ? fmt(Math.abs(headlineData.delta)) : null,
                compareLabel: headlineData.compareLabel || null,
            } : null,
        });
    }, [
        state.chartTitle, state.chartSubtitle, state.takeaway, state.chartFootnote,
        state.headline, state.numberFormat, state.decimalPlaces, state.yAxisKeys, headlineData,
    ]);

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
            await exportChartAsPng(cardRef.current || chartRef.current, preset, state.chartType, state.chartTitle);
        } catch {
            setAlertData({ isOpen: true, message: 'Could not export chart.' });
        }
        setShowExportMenu(false);
    }, [state.chartType, state.chartTitle]);

    const handleExportSvg = useCallback(() => {
        try {
            exportChartAsSvg(cardRef.current || chartRef.current, state.chartType, state.chartTitle);
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
            await copyChartToClipboard(cardRef.current || chartRef.current);
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
                // El servidor tiene que saber que esto es un recorte: si no, el
                // subtitulo dice el rango de las 500 primeras filas como si
                // fuera el del conjunto entero.
                truncated: data.length > 500,
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

    /* ── El hueco de la figura, medido ──
       Hace falta para dos cosas: elegir el modo cuando `layout` es 'auto', y
       saber qué piezas no caben. Un ResizeObserver sobre el propio contenedor
       de la tarjeta; se ignora en modo informe y a pantalla completa, donde
       sobra el alto y no queremos que nada se retire. */
    const [hueco, setHueco] = useState({ w: 0, h: 0 });
    useEffect(() => {
        const el = chartRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(([entrada]) => {
            const { width, height } = entrada.contentRect;
            setHueco(prev => (Math.abs(prev.w - width) < 4 && Math.abs(prev.h - height) < 4)
                ? prev : { w: width, h: height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    /* ── El TAMAÑO NATURAL, y la escala del texto que se deriva de él ──
       Al 100 % la figura mide su tamaño de diseño y la tipografía va a su tamaño
       real: 18 px son 18 px. El zoom multiplica la tarjeta ENTERA — caja, texto y
       dibujo a la vez — así que al 150 % todo es un 50 % mayor y las proporciones
       no se mueven. Es lo que uno espera de un zoom.

       Antes el 100 % significaba «lo más grande que quepa», y como la tipografía
       escalaba con el tamaño, la figura se veía siempre ampliada aunque el
       control marcara 100 %. Eran dos ideas peleándose.

       Al exportar la tarjeta recibe medidas mucho mayores, y como la escala sale
       del tamaño MEDIDO, el texto crece con ella y las proporciones aguantan
       igual a 1920 que en el editor. */
    const carta = tamMedido;
    const escalaTexto = useMemo(() => {
        if (!carta.w || !carta.h) return state.textScale || 1;
        const base = anchoBase(carta.w / carta.h);
        return (state.textScale || 1) * (carta.w / base);
    }, [carta.w, carta.h, state.textScale]);

    /* ── El tamaño REAL de la tarjeta ──
       La figura deja de estirarse para llenar el hueco. Tiene su proporción y se
       dibuja al mayor tamaño que quepa dentro del área, por el zoom. Lo que sobra
       queda vacío, igual que la mesa alrededor de una hoja.

       Esto arregla algo que no era evidente: como la tarjeta se estiraba, la
       misma figura se exportaba distinta según si el explorador de archivos
       estaba abierto o cerrado. Con la proporción fija, lo que ves es lo que se
       descarga. */
    const tamCarta = useMemo(() => {
        const prop = CANVAS_SIZES.find(c => c.label === (state.canvasSize || '4:3'));
        if (!prop || !prop.w || !prop.h) return null;          // 'Libre': ocupa el hueco
        const razon = prop.w / prop.h;
        const base = anchoBase(razon);
        const w = base * zoom;
        return { width: `${Math.round(w)}px`, height: `${Math.round(w / razon)}px`, flex: 'none' };
    }, [state.canvasSize, zoom]);

    /* El zoom que hace que la figura quepa entera. Es lo que hace el botón
       «Ajustar»; ya no es lo que significa el 100 %. */
    const zoomQueCabe = useMemo(() => {
        const prop = CANVAS_SIZES.find(c => c.label === (state.canvasSize || '4:3'));
        if (!prop || !prop.w || !prop.h || !area.w || !area.h) return 1;
        const razon = prop.w / prop.h;
        const cabe = Math.min(area.w, area.h * razon);
        return Math.max(0.3, Math.min(3, cabe / anchoBase(razon)));
    }, [state.canvasSize, area.w, area.h]);

    useEffect(() => {
        if (typeof ResizeObserver === 'undefined') return;
        const observadores = [];
        const medir = (el, set) => {
            if (!el) return;
            const ro = new ResizeObserver(([e]) => {
                const { width, height } = e.contentRect;
                set(p => (Math.abs(p.w - width) < 3 && Math.abs(p.h - height) < 3) ? p : { w: width, h: height });
            });
            ro.observe(el);
            observadores.push(ro);
        };
        medir(areaRef.current, setArea);
        medir(cardRef.current, setTamMedido);
        return () => observadores.forEach(o => o.disconnect());
    }, []);

    const modoLayout = useMemo(
        () => resolveLayout(state.layout, hueco.w, hueco.h),
        [state.layout, hueco.w, hueco.h]);

    const retiradas = useMemo(
        () => ((isReportMode || isFullscreen) ? new Set() : calcularRetiradas(hueco.h)),
        [isReportMode, isFullscreen, hueco.h]);

    /* ── Las siete piezas de la tarjeta ──
       Ninguna lleva sangria propia. Antes los bloques de texto metian 50 px por
       la izquierda para alinearse con las etiquetas del eje, y el lienzo no: el
       gráfico se salía 50 px por fuera del texto y la tarjeta se veía
       descuadrada. Ahora todo comparte el padding de la tarjeta y los cantos
       coinciden — que es lo que hace que se lea como UNA figura y no como dos
       cosas apiladas.
       Se declaran aquí y se COLOCAN abajo según el modo de composición, en vez
       de escribirse en el orden del render. Así el orden vive en un solo sitio
       y no hay tres copias del mismo JSX para tres maquetas. */
    const piezas = {
        titulo: (<>
            {/* Title */}
            {state.chartTitle && (
                <h2 style={{
                    textAlign: state.textAlign,
                    margin: `0 0 ${Math.round(state.titleSpacing * escalaTexto)}px 0`,
                    color: 'var(--text-active)',
                    fontSize: `${Math.round(18 * escalaTexto)}px`,
                    fontWeight: '600',
                }}>
                    {renderRichText(state.chartTitle)}
                    {/* QED-like title mark (Sterling): a period in the accent color */}
                    {state.titleMark && <span style={{ color: 'var(--accent-color-user)' }}>.</span>}
                </h2>
            )}
        </>),
        sub: (<>
            {(state.chartSubtitle || inlineLegendItems) && (
                <h3 style={{
                    textAlign: state.textAlign,
                    margin: `0 0 ${Math.round(state.titleSpacing * escalaTexto)}px 0`,
                    color: 'var(--text-muted)',
                    fontSize: `${Math.round(14 * escalaTexto)}px`,
                    fontWeight: '400',
                }}>
                    {state.chartSubtitle ? renderRichText(state.chartSubtitle) : null}
                    {inlineLegendItems && (
                        <>
                            {state.chartSubtitle ? ' ' : null}
                            <InlineLegend
                                items={inlineLegendItems}
                                fontSize={Math.round(14 * escalaTexto)}
                            />
                        </>
                    )}
                </h3>
            )}

            {/* Headline KPI */}
        </>),
        /* En donut la cifra vive en el centro del anillo (donutCenterKpi), asi
           que repetirla en la cabecera sobra: son el mismo numero dos veces. */
        kpi: (<>{state.chartType !== 'donut' && (<>
            <HeadlineOverlay
                headline={state.headline}
                headlineData={headlineData}
                numberFormat={state.numberFormat}
                decimalPlaces={state.decimalPlaces}
                textScale={escalaTexto}
                textAlign={state.textAlign}
            />
        </>)}
        </>),
        lienzo: (<>
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
                        textScale={escalaTexto}
                    />
                )}
            </div>
        </>),
        takeaway: (<>
            {/* Takeaway */}
            {state.takeaway && (
                <div style={{
                    marginTop: `${Math.round(state.titleSpacing * escalaTexto)}px`,
                    color: 'var(--text-secondary)',
                    fontSize: `${Math.round(13 * escalaTexto)}px`,
                    lineHeight: 1.5,
                    borderLeft: '3px solid var(--accent-color-user)',
                    paddingLeft: '10px',
                    textAlign: state.textAlign,
                    whiteSpace: 'pre-wrap',
                }}>{renderRichText(state.takeaway)}</div>
            )}
        </>),
        nota: (<>
            {/* Footnote */}
            {state.chartFootnote && (
                <div style={{
                    textAlign: state.textAlign,
                    marginTop: `${Math.round(state.titleSpacing * escalaTexto)}px`,
                    color: 'var(--text-muted)',
                    fontSize: `${Math.round(12 * escalaTexto)}px`,
                    fontStyle: 'italic',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '5px',
                    whiteSpace: 'pre-wrap',
                }}>{state.chartFootnote}</div>
            )}
        </>),
        firma: (<>
            {/* Editorial caption row (Sterling figure shell): Source + signature.
                Mono, muted, split left/right — the publication contract at the foot. */}
            {(state.chartSource || state.signature?.visible) && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginTop: `${Math.round(state.titleSpacing * escalaTexto)}px`,
                    paddingTop: '5px',
                    borderTop: state.chartFootnote ? 'none' : '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontSize: `${Math.round(11 * escalaTexto)}px`,
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
        </>),
    };

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

            {/* ━━━ Chart Area ━━━
                La tarjeta se separa de los bordes del panel. Pegada al ras no se
                leía como tarjeta: el filete y el redondeo quedaban comidos por el
                borde del contenedor y parecía un panel más. El margen es lo que la
                convierte en un objeto sobre una mesa.
                No aplica en modo informe (allí la maqueta la pone el documento) ni
                a pantalla completa, que ya trae sus 40 px. */}
            {/* Columna: el lienzo arriba y su barra debajo. Sin esta columna la
                barra se colocaba como una TERCERA COLUMNA a la derecha del
                gráfico, porque el contenedor de DataVisualizer es una fila
                (panel de opciones | zona del gráfico). */}
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div ref={areaRef} style={{
                flex: 1, minHeight: 0, minWidth: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                overflow: 'auto', padding: (isReportMode || isFullscreen) ? 0 : '12px',
            }}>
            <div ref={cardRef} style={{
                ...(tamCarta && !isReportMode && !isFullscreen
                    ? tamCarta
                    : { flex: 1, height: '100%' }),
                display: 'flex', flexDirection: 'column', minWidth: 0,
                position: 'relative',   // ancla de la barra de botones flotante
                backgroundColor: (isReportMode || desnuda) ? 'transparent' : 'var(--chart-bg)',
                overflow: isReportMode ? 'visible' : 'hidden',
                ...((!isReportMode && !isFullscreen) ? { margin: '14px 16px 16px' } : {}),
                // Desnuda: ni fondo, ni filete, ni sombra, ni radio. Los pone la lámina.
                ...(desnuda ? {} : bgStyle),
                ...(desnuda ? {} : borderCss),
                ...(desnuda ? {} : cardCss),
                ...(isFullscreen ? {
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 9999, padding: '40px',
                } : {}),
            }}>
                {!isReportMode && (
                    /* data-export-hide: la fila de botones no sale en la foto. Sin
                       esto, aunque html2canvas ignora los <button>, el contenedor
                       seguiría reservando su alto y el PNG saldría con una banda
                       vacía arriba. */
                    /* Flotante en la esquina, no en el flujo. Si ocupa alto, el
                       aire de arriba depende de si los botones están o no — y en
                       la exportación no están, así que la tarjeta salía con el
                       título pegado al borde. Así el padding manda solo. */
                    <div data-export-hide="true" style={{
                        position: 'absolute', top: '8px', right: '10px', zIndex: 2,
                        display: 'flex', justifyContent: 'flex-end', gap: '8px',
                    }}>
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
                    /* El aire interior de la tarjeta. 28 a los lados y no 20: con la
                       tarjeta ya separada del panel, un margen corto hacía que el
                       lienzo tocara casi el filete y se perdía la sensación de
                       figura. A pantalla completa se abre más, que hay sitio. */
                    flex: 1,
                    /* Mismo aire por los cuatro lados. Arriba iba en 10 contra 34
                       de los lados, y el contenido se veía pegado al filete —
                       sobre todo al exportar, donde la barra de botones no sale y
                       ese hueco desaparece del todo. */
                    padding: desnuda
                        ? 0
                        : (isFullscreen
                            ? '48px 48px 40px'
                            : `${Math.round(30 * escalaTexto)}px ${Math.round(34 * escalaTexto)}px ${Math.round(30 * escalaTexto)}px`),
                    display: 'flex', flexDirection: 'column', minHeight: '300px',
                    fontFamily,
                    // Contain layout/paint so the chart's internal reflow stays local,
                    // without forcing a giant GPU texture (translateZ) — a fullscreen SVG
                    // layer saturates the compositor and makes scrollbars stutter.
                    contain: 'layout paint',
                }}>
                    {componerFigura(modoLayout, piezas, retiradas, (state.headline?.position || 'below') === 'header-right' || modoLayout === 'split-header', desnuda)}
                </div>
            </div>
            </div>

            {/* ── Barra del lienzo ──
                La forma a la que se dibuja la figura y el zoom para mirarla de
                cerca. El zoom es solo para VER: no entra en la exportación, que
                usa siempre la proporción elegida aquí. */}
            {!isReportMode && !isFullscreen && (
                <div data-export-hide="true" style={{
                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    padding: '6px 16px 10px', flex: 'none',
                }}>
                    <span style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Lienzo</span>
                    <div style={{ display: 'flex', gap: '3px' }}>
                        {CANVAS_SIZES.map(c => (
                            <button key={c.label} onClick={() => setField('canvasSize', c.label)}
                                style={{
                                    background: state.canvasSize === c.label ? 'var(--accent-muted)' : 'transparent',
                                    border: `1px solid ${state.canvasSize === c.label ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                    color: state.canvasSize === c.label ? 'var(--accent-primary)' : 'var(--text-muted)',
                                    borderRadius: '5px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer',
                                }}>{c.label}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '10px', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Zoom</span>
                        <input type="range" min={40} max={220} step={5}
                            value={Math.round(zoom * 100)}
                            onChange={e => setZoom(Number(e.target.value) / 100)}
                            style={{ width: '120px', accentColor: 'var(--accent-primary)' }} />
                        <button onClick={() => setZoom(zoom === 1 ? zoomQueCabe : 1)}
                            title={zoom === 1 ? 'Ajustar al hueco' : 'Volver al tamaño real (100 %)'}
                            style={{
                                background: 'transparent', border: '1px solid var(--border-color)',
                                color: 'var(--text-muted)', borderRadius: '5px', padding: '3px 7px',
                                fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                                minWidth: '48px',
                            }}>{Math.round(zoom * 100)}%</button>
                    </div>
                </div>
            )}
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
