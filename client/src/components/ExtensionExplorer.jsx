import { useState, useEffect } from 'react';
import {
    LuRefreshCw, LuDownload, LuSearch, LuPackage, LuCheck, LuCircle,
    LuLoader, LuCircleAlert, LuShieldCheck, LuUsers
} from "react-icons/lu";

const ExtensionExplorer = () => {
    const [extensions, setExtensions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [query, setQuery] = useState('');
    const [installing, setInstalling] = useState(false);
    const [installMsg, setInstallMsg] = useState(null);

    const fetchExtensions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('http://localhost:3001/api/db/extensions');
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setExtensions(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchExtensions(); }, []);

    const handleInstall = async (name) => {
        const extName = (name || query).trim();
        if (!extName) return;
        setInstalling(true);
        setInstallMsg(null);
        try {
            const res = await fetch('http://localhost:3001/api/db/extensions/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: extName })
            });
            const data = await res.json();
            if (res.ok) {
                setInstallMsg({ type: 'success', text: data.message });
                setQuery('');
                fetchExtensions();
            } else {
                setInstallMsg({ type: 'error', text: data.details || data.error });
            }
        } catch (err) {
            setInstallMsg({ type: 'error', text: err.message });
        } finally {
            setInstalling(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) handleInstall();
    };

    // Determine if extension is "core" based on install_mode or installed_from
    const isCore = (ext) => {
        const mode = (ext.install_mode || '').toLowerCase();
        const from = (ext.installed_from || '').toLowerCase();
        // Core extensions are typically from the official repository or built-in
        return mode === 'repository' || from.includes('core') || (!ext.installed && !ext.install_mode);
    };

    // Filter logic — unified query filters and can install
    const filtered = extensions.filter(ext => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (ext.extension_name || '').toLowerCase().includes(q) ||
            (ext.description || '').toLowerCase().includes(q);
    });

    // Show install button if query doesn't exactly match any extension
    const showInstallBtn = query.trim() && !extensions.some(
        e => (e.extension_name || '').toLowerCase() === query.trim().toLowerCase()
    );

    // Sort: installed+loaded first, then installed, then rest
    const sorted = [...filtered].sort((a, b) => {
        const scoreA = (a.loaded ? 2 : 0) + (a.installed ? 1 : 0);
        const scoreB = (b.loaded ? 2 : 0) + (b.installed ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (a.extension_name || '').localeCompare(b.extension_name || '');
    });

    const installedCount = extensions.filter(e => e.installed).length;
    const loadedCount = extensions.filter(e => e.loaded).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LuPackage size={12} /> EXTENSIONS
                </span>
                <button
                    onClick={fetchExtensions}
                    title="Refresh extensions"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', padding: '2px', cursor: 'pointer', display: 'flex' }}
                >
                    <LuRefreshCw size={13} className={loading ? 'ext-spin' : ''} />
                </button>
            </div>

            {/* Unified search + install */}
            <div className="ext-search-section">
                <div className="ext-search-row">
                    <div className="fe-search" style={{ flex: 1 }}>
                        <LuSearch size={12} className="fe-search-icon" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => { setQuery(e.target.value); setInstallMsg(null); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Search or install extension..."
                            disabled={installing}
                            className="fe-search-input"
                        />
                    </div>
                    {showInstallBtn && (
                        <button
                            onClick={() => handleInstall()}
                            disabled={installing}
                            title={`Install "${query.trim()}"`}
                            className="ext-install-btn"
                        >
                            {installing ? <LuLoader size={12} className="ext-spin" /> : <LuDownload size={12} />}
                            Install
                        </button>
                    )}
                </div>
                {installMsg && (
                    <div className={`ext-install-msg ${installMsg.type}`}>
                        {installMsg.type === 'success' ? <LuCheck size={11} /> : <LuCircleAlert size={11} />}
                        {installMsg.text}
                    </div>
                )}
            </div>

            {/* Stats bar */}
            <div className="ext-stats-bar">
                <span>{extensions.length} total</span>
                <span style={{ color: 'var(--feedback-success-text)' }}>● {installedCount} installed</span>
                <span style={{ color: 'var(--accent-primary)' }}>● {loadedCount} loaded</span>
            </div>

            {/* Extension Cards — Grouped by Status */}
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

                {!loading && !error && (() => {
                    const groups = [
                        { label: 'Active', items: sorted.filter(e => e.installed && e.loaded), color: 'var(--accent-primary)' },
                        { label: 'Installed', items: sorted.filter(e => e.installed && !e.loaded), color: 'var(--feedback-success-text)' },
                        { label: 'Available', items: sorted.filter(e => !e.installed), color: 'var(--text-tertiary)' },
                    ].filter(g => g.items.length > 0);

                    if (groups.length === 0 && query) {
                        return (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                No extensions match "{query}"
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
                                <span style={{ fontSize: '9px', color: 'var(--text-disabled)' }}>{group.items.length}</span>
                            </div>
                            {group.items.map(ext => {
                                const core = isCore(ext);
                                const installed = ext.installed;
                                const loaded = ext.loaded;
                                return (
                                    <div key={ext.extension_name} className={`ext-card ${loaded ? 'ext-card-loaded' : ''} ${installed ? 'ext-card-installed' : ''}`}>
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
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                            {installed && <span className="ext-status-installed"><LuCheck size={10} /> Installed</span>}
                                            {loaded && <span className="ext-status-loaded"><LuCircle size={8} fill="currentColor" /> Loaded</span>}
                                            {!installed && !loaded && <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>Not installed</span>}
                                            {ext.install_mode && installed && <span style={{ fontSize: '10px', color: 'var(--text-disabled)', marginLeft: 'auto' }}>{ext.install_mode}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ));
                })()}
            </div>
        </div>
    );
};

export default ExtensionExplorer;
