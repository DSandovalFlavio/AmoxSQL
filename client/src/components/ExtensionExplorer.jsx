import { API_BASE } from '../api.js';
import { useState, useEffect, useRef, useCallback, forwardRef, memo } from 'react';
import {
    LuRefreshCw, LuDownload, LuSearch, LuPackage, LuCheck, LuCircle,
    LuLoader, LuCircleAlert, LuShieldCheck, LuUsers, LuPlay, LuExternalLink,
    LuCopy, LuStar, LuChevronDown, LuChevronRight, LuZap, LuCircleSlash,
} from "react-icons/lu";
import { useToast } from './ToastProvider';
import FEATURED_EXTENSIONS from '../data/featuredExtensions';
import { openTour, hasSeenTour } from './onboarding/tourRegistry';

// Core extensions known to ship with DuckDB — never need FROM community
const KNOWN_CORE = new Set([
    'autocomplete', 'avro', 'aws', 'azure', 'core_functions', 'delta', 'excel',
    'fts', 'httpfs', 'iceberg', 'inet', 'jemalloc', 'json', 'motherduck',
    'parquet', 'postgres_scanner', 'spatial', 'sqlite_scanner', 'substrait',
    'tpcds', 'tpch', 'ui', 'vss',
]);

const isCore = (ext) => {
    const name = (ext.extension_name || '').toLowerCase();
    const mode = (ext.install_mode || '').toLowerCase();
    const from = (ext.installed_from || '').toLowerCase();
    if (KNOWN_CORE.has(name)) return true;
    if (mode === 'repository' || from.includes('core')) return true;
    const featured = FEATURED_EXTENSIONS.find(f => f.name === name);
    if (featured) return !featured.fromCommunity;
    return !ext.installed && !ext.install_mode;
};

const FILTER_OPTIONS = ['All', 'Featured', 'Loaded', 'Installed', 'Community', 'Core'];

const ExtensionExplorer = () => {
    const [extensions, setExtensions] = useState([]);
    const [autoload, setAutoload] = useState([]); // names set to load on startup
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');
    const [busyExt, setBusyExt] = useState(null); // extension name being acted upon
    const [featuredOpen, setFeaturedOpen] = useState(true);
    const [contextMenu, setContextMenu] = useState(null); // { x, y, ext }
    const contextMenuRef = useRef(null);
    const toast = useToast();

    const autoloadSet = new Set(autoload);

    const fetchExtensions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [extRes, autoRes] = await Promise.all([
                fetch(`${API_BASE}/api/db/extensions`),
                fetch(`${API_BASE}/api/db/extensions/autoload`),
            ]);
            if (!extRes.ok) throw new Error('Failed to fetch');
            const data = await extRes.json();
            setExtensions(data);
            if (autoRes.ok) {
                const auto = await autoRes.json();
                setAutoload(Array.isArray(auto.names) ? auto.names : []);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchExtensions(); }, [fetchExtensions]);

    // First-run Extensions tour (rendered by the global OnboardingHost)
    useEffect(() => {
        if (!hasSeenTour('extensions')) openTour('extensions');
    }, []);

    // Refresh when SQL editor triggers a LOAD externally
    useEffect(() => {
        const handler = () => fetchExtensions();
        window.addEventListener('amoxsql:extension-loaded', handler);
        return () => window.removeEventListener('amoxsql:extension-loaded', handler);
    }, [fetchExtensions]);

    // Close context menu on outside click
    useEffect(() => {
        if (!contextMenu) return;
        const handler = (e) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
                setContextMenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [contextMenu]);

    const handleInstall = async (name, fromCommunity = false) => {
        setBusyExt(name);
        try {
            const res = await fetch(`${API_BASE}/api/db/extensions/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, fromCommunity }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Extension '${name}' installed and loaded.`);
                fetchExtensions();
            } else {
                if (data.platformUnavailable) {
                    const ver = data.duckdbVersion ? ` for DuckDB ${data.duckdbVersion}` : '';
                    const plat = data.platform ? ` on ${data.platform}` : '';
                    toast.error(
                        `'${name}' is not yet available${ver}${plat}. ` +
                        `Check the extension's GitHub repository to track when support is added.`,
                        12000
                    );
                } else if (data.canRetryFromCommunity) {
                    toast.warning(
                        `'${name}' not found in official repo. Retrying from community...`,
                        3000
                    );
                    setTimeout(() => handleInstall(name, true), 500);
                } else {
                    toast.error(data.details || data.error, 8000);
                }
            }
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusyExt(null);
            setQuery('');
        }
    };

    const handleLoad = async (name) => {
        setBusyExt(name);
        setContextMenu(null);
        try {
            const res = await fetch(`${API_BASE}/api/db/extensions/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Extension '${name}' loaded.`);
                fetchExtensions();
            } else {
                toast.error(data.details || data.error, 8000);
            }
        } catch (err) {
            toast.error(err.message);
        } finally {
            setBusyExt(null);
        }
    };

    const handleForget = async (name) => {
        setContextMenu(null);
        try {
            const res = await fetch(`${API_BASE}/api/db/extensions/forget`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.info(`'${name}' won't auto-load on startup anymore.`, 4000);
                fetchExtensions();
            } else {
                toast.error(data.details || data.error, 6000);
            }
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleCopyName = (name) => {
        navigator.clipboard.writeText(name).then(() => toast.info(`Copied '${name}'`, 2000));
        setContextMenu(null);
    };

    const handleOpenDocs = (url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        setContextMenu(null);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            const featured = FEATURED_EXTENSIONS.find(f => f.name === query.trim().toLowerCase());
            handleInstall(query.trim(), featured?.fromCommunity ?? false);
        }
    };

    const handleContextMenu = (e, ext) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, ext });
    };

    // Filter logic
    const filtered = extensions.filter(ext => {
        const q = query.toLowerCase();
        const matchesQuery = !q ||
            (ext.extension_name || '').toLowerCase().includes(q) ||
            (ext.description || '').toLowerCase().includes(q);
        if (!matchesQuery) return false;

        switch (activeFilter) {
            case 'Loaded':    return ext.loaded;
            case 'Installed': return ext.installed;
            case 'Community': return !isCore(ext);
            case 'Core':      return isCore(ext);
            case 'Featured':  return FEATURED_EXTENSIONS.some(f => f.name === ext.extension_name);
            default:          return true;
        }
    });

    const showInstallBtn = query.trim() && !extensions.some(
        e => (e.extension_name || '').toLowerCase() === query.trim().toLowerCase()
    );

    const sorted = [...filtered].sort((a, b) => {
        const scoreA = (a.loaded ? 2 : 0) + (a.installed ? 1 : 0);
        const scoreB = (b.loaded ? 2 : 0) + (b.installed ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.extension_name || '').localeCompare(b.extension_name || '');
    });

    const installedCount = extensions.filter(e => e.installed).length;
    const loadedCount = extensions.filter(e => e.loaded).length;

    // Featured items enriched with live status
    const featuredItems = FEATURED_EXTENSIONS.map(feat => {
        const live = extensions.find(e => e.extension_name === feat.name);
        return { ...feat, installed: live?.installed ?? false, loaded: live?.loaded ?? false };
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* Header */}
            <div className="sidebar-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LuPackage size={14} /> EXTENSIONS
                </span>
                <div className="fe-header-actions">
                    <button
                        className="fe-header-btn"
                        onClick={fetchExtensions}
                        title="Refresh extensions"
                    >
                        <LuRefreshCw size={13} className={loading ? 'ext-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Search + install */}
            <div className="ext-search-section">
                <div className="ext-search-row">
                    <div className="fe-search" style={{ flex: 1 }}>
                        <LuSearch size={12} className="fe-search-icon" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search or install extension..."
                            disabled={!!busyExt}
                            className="fe-search-input"
                        />
                    </div>
                    {showInstallBtn && (
                        <button
                            onClick={() => {
                                const feat = FEATURED_EXTENSIONS.find(f => f.name === query.trim().toLowerCase());
                                handleInstall(query.trim(), feat?.fromCommunity ?? false);
                            }}
                            disabled={!!busyExt}
                            title={`Install "${query.trim()}"`}
                            className="ext-install-btn"
                        >
                            {busyExt === query.trim()
                                ? <LuLoader size={12} className="ext-spin" />
                                : <LuDownload size={12} />}
                            Install
                        </button>
                    )}
                </div>
            </div>

            {/* Filter chips — segmented language */}
            <div className="seg-chips">
                {FILTER_OPTIONS.map(f => (
                    <button
                        key={f}
                        onClick={() => setActiveFilter(f)}
                        className={`seg-chip ${activeFilter === f ? 'seg-chip--active' : ''}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Stats bar */}
            <div className="ext-stats-bar">
                <span>{extensions.length} total</span>
                <span style={{ color: 'var(--feedback-success-text)' }}>● {installedCount} installed</span>
                <span style={{ color: 'var(--accent-primary)' }}>● {loadedCount} loaded</span>
            </div>

            {/* Gallery */}
            <div className="ext-gallery">
                {loading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', color: 'var(--text-tertiary)' }}>
                        <LuLoader size={16} className="ext-spin" style={{ marginRight: '8px' }} />
                        Loading extensions...
                    </div>
                )}

                {error && (
                    <div style={{ padding: '16px', color: 'var(--feedback-error-text)', textAlign: 'center', fontSize: '12px' }}>
                        <LuCircleAlert size={16} style={{ marginBottom: '6px' }} />
                        <div>{error}</div>
                        <button onClick={fetchExtensions} style={{ marginTop: '8px', fontSize: '11px', padding: '4px 12px' }}>Retry</button>
                    </div>
                )}

                {!loading && !error && (
                    <>
                        {/* Featured section */}
                        {(activeFilter === 'All' || activeFilter === 'Featured') && (
                            <div>
                                <button
                                    onClick={() => setFeaturedOpen(p => !p)}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '10px 14px 4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '10px',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        color: 'var(--text-disabled)',
                                    }}
                                >
                                    {featuredOpen ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />}
                                    <LuStar size={9} style={{ color: 'var(--color-warning)' }} />
                                    Featured
                                    <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                                    <span style={{ fontSize: '9px' }}>{featuredItems.length}</span>
                                </button>

                                {featuredOpen && featuredItems.map(feat => (
                                    <FeaturedCard
                                        key={feat.name}
                                        feat={feat}
                                        busy={busyExt === feat.name}
                                        onInstall={handleInstall}
                                        onLoad={handleLoad}
                                        onContextMenu={handleContextMenu}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Standard grouped list */}
                        {activeFilter !== 'Featured' && (() => {
                            const groups = [
                                { label: 'Active', items: sorted.filter(e => e.installed && e.loaded), color: 'var(--accent-primary)' },
                                { label: 'Installed', items: sorted.filter(e => e.installed && !e.loaded), color: 'var(--feedback-success-text)' },
                                { label: 'Available', items: sorted.filter(e => !e.installed), color: 'var(--text-tertiary)' },
                            ].filter(g => g.items.length > 0);

                            if (groups.length === 0) {
                                return (
                                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                        {query
                                            ? `No extensions match "${query}"`
                                            : 'No extensions in this filter'}
                                    </div>
                                );
                            }

                            return groups.map(group => (
                                <div key={group.label}>
                                    <div style={{
                                        padding: '10px 14px 4px',
                                        fontSize: '10px',
                                        fontWeight: '600',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        color: 'var(--text-disabled)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                    }}>
                                        <LuCircle size={5} fill={group.color} color={group.color} />
                                        {group.label}
                                        <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
                                        <span style={{ fontSize: '9px' }}>{group.items.length}</span>
                                    </div>
                                    {group.items.map(ext => (
                                        <ExtCard
                                            key={ext.extension_name}
                                            ext={ext}
                                            core={isCore(ext)}
                                            busy={busyExt === ext.extension_name}
                                            onInstall={handleInstall}
                                            onLoad={handleLoad}
                                            onContextMenu={handleContextMenu}
                                        />
                                    ))}
                                </div>
                            ));
                        })()}
                    </>
                )}
            </div>

            {/* Context menu */}
            {contextMenu && (
                <ContextMenu
                    ref={contextMenuRef}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    ext={contextMenu.ext}
                    isAutoload={autoloadSet.has(contextMenu.ext.extension_name || contextMenu.ext.name)}
                    onLoad={handleLoad}
                    onForget={handleForget}
                    onCopyName={handleCopyName}
                    onOpenDocs={handleOpenDocs}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    );
};

/* ── Featured card ── */
const FeaturedCard = ({ feat, busy, onInstall, onLoad, onContextMenu }) => {
    const categoryColor = {
        AI: 'oklch(0.68 0.16 300)',
        Text: 'oklch(0.68 0.18 200)',
        Language: 'oklch(0.68 0.2 140)',
        'I/O': 'oklch(0.68 0.18 50)',
        Geo: 'oklch(0.68 0.2 160)',
        Search: 'oklch(0.68 0.18 30)',
    }[feat.category] || 'var(--text-tertiary)';

    return (
        <div
            className={`ext-card ${feat.loaded ? 'ext-card-loaded' : ''} ${feat.installed ? 'ext-card-installed' : ''}`}
            onContextMenu={(e) => onContextMenu(e, feat)}
            style={{ position: 'relative' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span className="ext-card-name">{feat.name}</span>
                    <span style={{
                        fontSize: '9px', fontWeight: '600', padding: '1px 5px',
                        borderRadius: '6px', background: `color-mix(in oklch, ${categoryColor} 15%, transparent)`,
                        color: categoryColor, border: `1px solid color-mix(in oklch, ${categoryColor} 25%, transparent)`,
                    }}>
                        {feat.category}
                    </span>
                </div>
                <span className={feat.fromCommunity ? 'ext-badge-community' : 'ext-badge-core'}>
                    {feat.fromCommunity ? <><LuUsers size={9} /> community</> : <><LuShieldCheck size={9} /> core</>}
                </span>
            </div>

            <div className="ext-card-desc" style={{ marginBottom: '8px' }}>{feat.tagline}</div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Primary action */}
                {!feat.installed && (
                    <button
                        onClick={() => onInstall(feat.name, feat.fromCommunity)}
                        disabled={busy}
                        className="ext-install-btn"
                        style={{ fontSize: '10px', padding: '3px 8px' }}
                    >
                        {busy
                            ? <LuLoader size={10} className="ext-spin" />
                            : feat.postInstall
                                ? <LuZap size={10} />
                                : <LuDownload size={10} />}
                        {feat.postInstall ? 'Install + Setup' : 'Install'}
                    </button>
                )}
                {feat.installed && !feat.loaded && (
                    <button
                        onClick={() => onLoad(feat.name)}
                        disabled={busy}
                        className="ext-install-btn"
                        style={{ fontSize: '10px', padding: '3px 8px', background: 'var(--feedback-success-text)' }}
                    >
                        {busy ? <LuLoader size={10} className="ext-spin" /> : <LuPlay size={10} />}
                        Load
                    </button>
                )}
                {feat.installed && <span className="ext-status-installed"><LuCheck size={10} /> Installed</span>}
                {feat.loaded && <span className="ext-status-loaded"><LuCircle size={8} fill="currentColor" /> Loaded</span>}

                <a
                    href={feat.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '10px', color: 'var(--text-tertiary)', textDecoration: 'none',
                    }}
                    title="Open documentation"
                    onClick={(e) => e.stopPropagation()}
                >
                    <LuExternalLink size={10} /> Docs
                </a>
            </div>
        </div>
    );
};

/* ── Regular extension card ── */
const ExtCard = ({ ext, core, busy, onInstall, onLoad, onContextMenu }) => {
    const installed = ext.installed;
    const loaded = ext.loaded;
    const featuredMeta = FEATURED_EXTENSIONS.find(f => f.name === ext.extension_name);
    const docsUrl = featuredMeta?.docsUrl;

    return (
        <div
            className={`ext-card ${loaded ? 'ext-card-loaded' : ''} ${installed ? 'ext-card-installed' : ''}`}
            onContextMenu={(e) => onContextMenu(e, ext)}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span className="ext-card-name">{ext.extension_name}</span>
                    {ext.extension_version && (
                        <span className="badge badge-neutral" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            v{ext.extension_version}
                        </span>
                    )}
                </div>
                <span className={core ? 'ext-badge-core' : 'ext-badge-community'}>
                    {core ? <><LuShieldCheck size={9} /> core</> : <><LuUsers size={9} /> community</>}
                </span>
            </div>

            {ext.description && <div className="ext-card-desc">{ext.description}</div>}

            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Action buttons by state */}
                {!installed && (
                    <button
                        onClick={() => onInstall(ext.extension_name, !core)}
                        disabled={busy}
                        className="ext-install-btn"
                        style={{ fontSize: '10px', padding: '3px 8px' }}
                    >
                        {busy ? <LuLoader size={10} className="ext-spin" /> : <LuDownload size={10} />}
                        Install
                    </button>
                )}
                {installed && !loaded && (
                    <button
                        onClick={() => onLoad(ext.extension_name)}
                        disabled={busy}
                        className="ext-install-btn"
                        style={{ fontSize: '10px', padding: '3px 8px', background: 'var(--feedback-success-text)' }}
                    >
                        {busy ? <LuLoader size={10} className="ext-spin" /> : <LuPlay size={10} />}
                        Load
                    </button>
                )}

                {installed && <span className="ext-status-installed"><LuCheck size={10} /> Installed</span>}
                {loaded && <span className="ext-status-loaded"><LuCircle size={8} fill="currentColor" /> Loaded</span>}
                {!installed && !loaded && <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>Not installed</span>}

                {ext.install_mode && installed && (
                    <span style={{ fontSize: '10px', color: 'var(--text-disabled)', marginLeft: 'auto' }}>
                        {ext.install_mode}
                    </span>
                )}
                {docsUrl && (
                    <a
                        href={docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px',
                            fontSize: '10px', color: 'var(--text-tertiary)', textDecoration: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <LuExternalLink size={10} /> Docs
                    </a>
                )}
            </div>
        </div>
    );
};

/* ── Context menu ── */
const ContextMenu = forwardRef(({ x, y, ext, isAutoload, onLoad, onForget, onCopyName, onOpenDocs, onClose }, ref) => {
    const installed = ext.installed;
    const loaded = ext.loaded;
    const extName = ext.extension_name || ext.name;
    const featuredMeta = FEATURED_EXTENSIONS.find(f => f.name === ext.extension_name);
    const docsUrl = featuredMeta?.docsUrl ||
        (ext.extension_name ? `https://duckdb.org/docs/extensions/${ext.extension_name}` : null);

    // Adjust if near bottom/right of screen
    const style = {
        position: 'fixed',
        top: Math.min(y, window.innerHeight - 160),
        left: Math.min(x, window.innerWidth - 180),
        zIndex: 10000,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        padding: '4px',
        minWidth: '160px',
    };

    const itemStyle = {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 10px', borderRadius: '5px', cursor: 'pointer',
        fontSize: '12px', color: 'var(--text-secondary)',
        background: 'transparent', border: 'none', width: '100%', textAlign: 'left',
    };

    return (
        <div ref={ref} style={style}>
            <button style={itemStyle} onClick={() => onCopyName(ext.extension_name)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <LuCopy size={12} /> Copy name
            </button>

            {installed && !loaded && (
                <button style={itemStyle} onClick={() => onLoad(ext.extension_name)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <LuPlay size={12} /> Load
                </button>
            )}
            {loaded && (
                <button style={itemStyle} onClick={() => onLoad(ext.extension_name)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <LuRefreshCw size={12} /> Reload
                </button>
            )}

            {isAutoload && (
                <button style={itemStyle} onClick={() => onForget(extName)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <LuCircleSlash size={12} /> Remove from startup
                </button>
            )}

            {docsUrl && (
                <button style={itemStyle} onClick={() => onOpenDocs(docsUrl)}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <LuExternalLink size={12} /> Open docs
                </button>
            )}

            <div style={{ margin: '4px 0', borderTop: '1px solid var(--border-subtle)' }} />
            <button style={{ ...itemStyle, fontSize: '11px', color: 'var(--text-tertiary)' }}
                onClick={() => {
                    navigator.clipboard.writeText(
                        `INSTALL "${ext.extension_name}";\nLOAD "${ext.extension_name}";`
                    );
                    onClose();
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <LuCopy size={11} /> Copy SQL commands
            </button>
        </div>
    );
});
ContextMenu.displayName = 'ContextMenu';

export default memo(ExtensionExplorer);
