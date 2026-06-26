/**
 * ChartGallery — Gallery of chart examples with thumbnail generation.
 * Renders in the Settings modal. Shows PNG thumbnails stored on disk.
 * Click opens the .amoxvis in read-only mode.
 */
import { API_BASE } from '../api.js';
import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createRoot } from 'react-dom/client';
import { GALLERY_CHARTS } from '../data/galleryChartDefinitions';
import ChartRenderer from './DataVisualizer/renderers/ChartRenderer';
import { processChartData } from './DataVisualizer/utils/dataProcessing';
import { COLOR_PALETTES } from './DataVisualizer/constants';
import html2canvas from 'html2canvas-pro';
import {
    LuRefreshCw, LuLoader, LuImage, LuChevronRight,
    LuLayoutGrid, LuCopy, LuExternalLink
} from 'react-icons/lu';
import { useToast } from './ToastProvider';

// ─── Category Filters ────────────────────────────────────────────────────────
const CATEGORIES = [
    { key: 'all', label: 'All' },
    { key: 'column', label: 'Columns' },
    { key: 'bar', label: 'Bars' },
    { key: 'line', label: 'Lines' },
    { key: 'circular', label: 'Circular' },
    { key: 'scatter', label: 'Scatter' },
    { key: 'other', label: 'Other' },
];

// ─── Component ───────────────────────────────────────────────────────────────
const ChartGallery = memo(({ onOpenChart, onClose }) => {
    const [charts, setCharts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [filter, setFilter] = useState('all');
    const offscreenRef = useRef(null);
    const toast = useToast();

    // Fetch chart list from backend
    const fetchCharts = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/api/gallery/list`);
            const data = await res.json();
            setCharts(data.charts || []);
        } catch (err) {
            console.error('[Gallery] Failed to fetch charts:', err);
            toast.error('Failed to load gallery');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCharts(); }, [fetchCharts]);

    // Check if all thumbnails exist
    const allHaveThumbnails = charts.length > 0 && charts.every(c => c.hasThumbnail);
    const missingCount = charts.filter(c => !c.hasThumbnail).length;

    // ─── Thumbnail Generation ────────────────────────────────────────────────
    const generateThumbnails = useCallback(async () => {
        const toGenerate = GALLERY_CHARTS.filter(gc =>
            charts.find(c => c.id === gc.id && !c.hasThumbnail)
        );
        if (toGenerate.length === 0) return;

        setGenerating(true);
        setProgress({ current: 0, total: toGenerate.length });

        for (let i = 0; i < toGenerate.length; i++) {
            const chart = toGenerate[i];
            setProgress({ current: i + 1, total: toGenerate.length });

            try {
                await generateSingleThumbnail(chart, offscreenRef);
            } catch (err) {
                console.warn(`[Gallery] Failed to generate thumbnail for ${chart.id}:`, err);
            }
        }

        setGenerating(false);
        await fetchCharts(); // Refresh list
        toast.success('Gallery thumbnails generated!');
    }, [charts, fetchCharts]);

    // Regenerate all thumbnails
    const regenerateAll = useCallback(async () => {
        setGenerating(true);
        setProgress({ current: 0, total: GALLERY_CHARTS.length });

        for (let i = 0; i < GALLERY_CHARTS.length; i++) {
            setProgress({ current: i + 1, total: GALLERY_CHARTS.length });
            try {
                await generateSingleThumbnail(GALLERY_CHARTS[i]);
            } catch (err) {
                console.warn(`[Gallery] Regen failed for ${GALLERY_CHARTS[i].id}:`, err);
            }
        }

        setGenerating(false);
        await fetchCharts();
        toast.success('All thumbnails regenerated!');
    }, [fetchCharts]);

    // Handle card click — open .amoxvis
    const handleCardClick = useCallback((chart) => {
        if (onOpenChart) {
            onOpenChart(chart.amoxvisPath);
        }
    }, [onOpenChart]);

    // Copy config to clipboard
    const handleCopyConfig = useCallback(async (e, chartId) => {
        e.stopPropagation();
        try {
            const res = await fetch(`${API_BASE}/api/gallery/chart/${chartId}`);
            const data = await res.json();
            await navigator.clipboard.writeText(JSON.stringify(data.content, null, 2));
            toast.success('Config copied to clipboard');
        } catch (err) {
            toast.error('Failed to copy config');
        }
    }, []);

    // Save to workspace
    const handleSaveToWorkspace = useCallback(async (e, chartId) => {
        e.stopPropagation();
        try {
            const res = await fetch(`${API_BASE}/api/gallery/copy-to-workspace`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chartId }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Saved to workspace: ${chartId}.amoxvis`);
            } else {
                toast.error(data.error || 'Failed to save');
            }
        } catch (err) {
            toast.error('Failed to save to workspace');
        }
    }, []);

    // Filter charts
    const filteredCharts = charts.filter(c => {
        if (filter === 'all') return true;
        const def = GALLERY_CHARTS.find(gc => gc.id === c.id);
        return def?.meta?.category === filter;
    });

    // Get metadata for a chart
    const getMeta = (id) => GALLERY_CHARTS.find(gc => gc.id === id)?.meta || {};

    return (
        <div className="chart-gallery">
            {/* Header */}
            <div className="chart-gallery-header">
                <div className="chart-gallery-header__text">
                    <p className="chart-gallery-header__desc">
                        Explore all AmoxVis chart types with professional designs.
                        Click any chart to open it and inspect its full configuration.
                    </p>
                </div>
                {allHaveThumbnails && (
                    <button
                        className="stg-btn chart-gallery-regen-btn"
                        onClick={regenerateAll}
                        disabled={generating}
                    >
                        <LuRefreshCw size={14} className={generating ? 'spinning' : ''} />
                        Regenerate
                    </button>
                )}
            </div>

            {/* Category Filters */}
            <div className="chart-gallery-filters">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        className={`chart-gallery-filter-pill${filter === cat.key ? ' active' : ''}`}
                        onClick={() => setFilter(cat.key)}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Loading State */}
            {loading && (
                <div className="chart-gallery-empty">
                    <LuLoader size={32} className="spinning" />
                    <p>Loading gallery...</p>
                </div>
            )}

            {/* Generate Prompt */}
            {!loading && !allHaveThumbnails && !generating && (
                <div className="chart-gallery-generate-prompt">
                    <LuImage size={40} style={{ opacity: 0.5 }} />
                    <h4>{missingCount === charts.length
                        ? 'Generate Chart Gallery'
                        : `${missingCount} thumbnails missing`
                    }</h4>
                    <p>Generate preview thumbnails for all {charts.length} chart examples.
                    This renders each chart once and saves an image to disk.</p>
                    <button className="stg-btn chart-gallery-generate-btn" onClick={generateThumbnails}>
                        <LuImage size={14} /> Generate Gallery
                    </button>
                </div>
            )}

            {/* Progress Bar */}
            {generating && (
                <div className="chart-gallery-progress">
                    <div className="chart-gallery-progress__bar">
                        <div
                            className="chart-gallery-progress__fill"
                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                    </div>
                    <span className="chart-gallery-progress__text">
                        Generating {progress.current} / {progress.total}...
                    </span>
                </div>
            )}

            {/* Grid */}
            {!loading && (allHaveThumbnails || !generating) && filteredCharts.length > 0 && (
                <div className="chart-gallery-grid">
                    {filteredCharts.map(chart => {
                        const meta = getMeta(chart.id);
                        return (
                            <div
                                key={chart.id}
                                className="chart-gallery-card"
                                onClick={() => handleCardClick(chart)}
                                title={`Click to open: ${chart.title}`}
                            >
                                <div className="chart-gallery-card__image-wrap">
                                    {chart.hasThumbnail ? (
                                        <img
                                            src={`${API_BASE}/api/gallery/thumbnail/${chart.id}`}
                                            alt={chart.title}
                                            className="chart-gallery-card__image"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="chart-gallery-card__placeholder">
                                            <LuImage size={24} />
                                        </div>
                                    )}
                                    <div className="chart-gallery-card__overlay">
                                        <button
                                            className="chart-gallery-card__action"
                                            onClick={(e) => handleCopyConfig(e, chart.id)}
                                            title="Copy config to clipboard"
                                        >
                                            <LuCopy size={16} />
                                        </button>
                                        <button
                                            className="chart-gallery-card__action"
                                            onClick={(e) => handleSaveToWorkspace(e, chart.id)}
                                            title="Save to workspace"
                                        >
                                            <LuExternalLink size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="chart-gallery-card__info">
                                    <span className="chart-gallery-card__type">{chart.chartType}</span>
                                    <h4 className="chart-gallery-card__title">{chart.title}</h4>
                                    {meta.showcasedFeatures && (
                                        <div className="chart-gallery-card__badges">
                                            {meta.showcasedFeatures.slice(0, 3).map(f => (
                                                <span key={f} className="chart-gallery-badge">{f}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="chart-gallery-card__open-hint">
                                    <LuChevronRight size={14} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Empty filtered state */}
            {!loading && !generating && filteredCharts.length === 0 && charts.length > 0 && (
                <div className="chart-gallery-empty">
                    <p>No charts in this category</p>
                </div>
            )}
        </div>
    );
});

// ─── Thumbnail Generation Helper ─────────────────────────────────────────────

async function generateSingleThumbnail(chartDef) {
    return new Promise((resolve, reject) => {
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '0px';
        container.style.top = '0px';
        container.style.zIndex = '-9999';
        container.style.width = '700px';
        container.style.height = '450px';
        document.body.appendChild(container);

        const root = createRoot(container);

        // Process data for ChartRenderer
        const config = chartDef.amoxvis;
        const data = chartDef.data;
        const activeTheme = config.colorTheme || 'default';
        const activeColors = COLOR_PALETTES[activeTheme] || COLOR_PALETTES.default;

        // Apply hex fallbacks for CSS variables to the container to prevent html2canvas
        // from crashing when trying to parse oklch() colors defined in index.css.
        Object.assign(container.style, {
            '--surface-base': '#111214',
            '--surface-raised': '#191b1f',
            '--surface-overlay': '#1f2125',
            '--border-default': '#2a2b2f',
            '--border-color': '#2a2b2f',
            '--text-primary': '#f0f0f0',
            '--text-secondary': '#a0a0a0',
            '--text-muted': '#6b6e75',
            '--accent-primary': '#00d4ff',
            '--hover-bg': '#222327'
        });
        const { processedData, finalSeriesKeys } = processChartData({
            data,
            xAxisKey: config.xAxisKey,
            yAxisKeys: config.yAxisKeys,
            splitByKey: config.splitByKey || '',
            isDate: false,
            dateAggregation: 'none',
            bubbleSizeKey: config.bubbleSizeKey || '',
            chartType: config.chartType,
            isCumulative: config.isCumulative || false,
            sortMode: config.sortMode || 'none',
            limit: config.limit || 0,
        });



        // Render chart
        root.render(
            <div style={{
                width: '100%', height: '100%',
                background: 'var(--surface-base, #111214)',
                padding: '16px',
                boxSizing: 'border-box',
            }}>
                <ChartRenderer
                    config={config}
                    processedData={processedData}
                    finalSeriesKeys={finalSeriesKeys}
                    trendData={[]}
                    headline={{ value: null }}
                    activeColors={activeColors}
                    forceDimensions={{ width: 668, height: 418 }}
                />
            </div>
        );

        // Wait for Recharts to render and ResizeObserver to fire (ResponsiveContainer)
        setTimeout(async () => {
            try {
                const canvas = await html2canvas(container, {
                    backgroundColor: '#111214',
                    scale: 1,
                    logging: false,
                    useCORS: true
                });
                
                const dataUrl = canvas.toDataURL('image/png');

                // Send to backend
                await fetch(`${API_BASE}/api/gallery/thumbnail`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: chartDef.id, imageData: dataUrl }),
                });

                root.unmount();
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
                resolve();
            } catch (err) {
                root.unmount();
                if (document.body.contains(container)) {
                    document.body.removeChild(container);
                }
                reject(err);
            }
        }, 1500);
    });
}

ChartGallery.displayName = 'ChartGallery';
export default ChartGallery;
