import { useState, useEffect } from 'react';
import {
    LuRefreshCw, LuDownload, LuSearch, LuPackage, LuCheck, LuCircle,
    LuLoader, LuCircleAlert, LuShieldCheck, LuUsers
} from "react-icons/lu";

const ExtensionExplorer = () => {
    const [extensions, setExtensions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [installName, setInstallName] = useState('');
    const [installing, setInstalling] = useState(false);
    const [installMsg, setInstallMsg] = useState(null);
    const [filter, setFilter] = useState('');

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

    const handleInstall = async () => {
        const name = installName.trim();
        if (!name) return;
        setInstalling(true);
        setInstallMsg(null);
        try {
            const res = await fetch('http://localhost:3001/api/db/extensions/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (res.ok) {
                setInstallMsg({ type: 'success', text: data.message });
                setInstallName('');
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
        if (e.key === 'Enter') handleInstall();
    };

    // Determine if extension is "core" based on install_mode or installed_from
    const isCore = (ext) => {
        const mode = (ext.install_mode || '').toLowerCase();
        const from = (ext.installed_from || '').toLowerCase();
        // Core extensions are typically from the official repository or built-in
        return mode === 'repository' || from.includes('core') || (!ext.installed && !ext.install_mode);
    };

    // Filter logic
    const filtered = extensions.filter(ext => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (ext.extension_name || '').toLowerCase().includes(q) ||
            (ext.description || '').toLowerCase().includes(q);
    });

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
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
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

            {/* Install bar */}
            <div className="ext-install-bar">
                <div style={{ display: 'flex', gap: '6px', padding: '6px 12px' }}>
                    <input
                        type="text"
                        value={installName}
                        onChange={(e) => setInstallName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Extension name..."
                        disabled={installing}
                        style={{
                            flex: 1, padding: '6px 10px', fontSize: '12px',
                            backgroundColor: 'var(--surface-inset)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '6px', color: 'var(--text-primary)',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleInstall}
                        disabled={installing || !installName.trim()}
                        title="Install & Load extension"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '5px 10px', fontSize: '11px', fontWeight: 600,
                            backgroundColor: 'var(--accent-primary)',
                            color: 'var(--surface-base)',
                            border: 'none', borderRadius: '6px',
                            cursor: installing ? 'wait' : 'pointer',
                            opacity: (!installName.trim() || installing) ? 0.5 : 1
                        }}
                    >
                        {installing ? <LuLoader size={12} className="ext-spin" /> : <LuDownload size={12} />}
                        Install
                    </button>
                </div>
                {installMsg && (
                    <div style={{
                        padding: '4px 12px 6px', fontSize: '11px',
                        color: installMsg.type === 'success' ? 'var(--feedback-success-text)' : 'var(--feedback-error-text)',
                        display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                        {installMsg.type === 'success' ? <LuCheck size={11} /> : <LuCircleAlert size={11} />}
                        {installMsg.text}
                    </div>
                )}
            </div>

            {/* Filter / Search */}
            <div style={{ padding: '4px 12px 6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <LuSearch size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-disabled)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter extensions..."
                        style={{
                            width: '100%', padding: '5px 8px 5px 26px', fontSize: '11px',
                            backgroundColor: 'var(--surface-inset)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '5px', color: 'var(--text-primary)',
                            outline: 'none'
                        }}
                    />
                </div>
            </div>

            {/* Stats bar */}
            <div style={{ padding: '2px 14px 6px', display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                <span>{extensions.length} total</span>
                <span style={{ color: 'var(--feedback-success-text)' }}>● {installedCount} installed</span>
                <span style={{ color: 'var(--accent-primary)' }}>● {loadedCount} loaded</span>
            </div>

            {/* Extension Cards */}
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

                {!loading && !error && sorted.map((ext) => {
                    const core = isCore(ext);
                    const installed = ext.installed;
                    const loaded = ext.loaded;

                    return (
                        <div
                            key={ext.extension_name}
                            className={`ext-card ${loaded ? 'ext-card-loaded' : ''} ${installed ? 'ext-card-installed' : ''}`}
                        >
                            {/* Card Header */}
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

                            {/* Description */}
                            {ext.description && (
                                <div className="ext-card-desc">{ext.description}</div>
                            )}

                            {/* Status row */}
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                {installed && (
                                    <span className="ext-status-installed">
                                        <LuCheck size={10} /> Installed
                                    </span>
                                )}
                                {loaded && (
                                    <span className="ext-status-loaded">
                                        <LuCircle size={8} fill="currentColor" /> Loaded
                                    </span>
                                )}
                                {!installed && !loaded && (
                                    <span style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>
                                        Not installed
                                    </span>
                                )}
                                {ext.install_mode && installed && (
                                    <span style={{ fontSize: '10px', color: 'var(--text-disabled)', marginLeft: 'auto' }}>
                                        {ext.install_mode}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {!loading && !error && sorted.length === 0 && filter && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                        No extensions match "{filter}"
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExtensionExplorer;
