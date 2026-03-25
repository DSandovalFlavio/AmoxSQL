import React, { useState, useEffect } from 'react';
import { LuX, LuPalette, LuMoon, LuSun, LuCpu, LuDownload, LuCheck, LuLoader, LuInfo, LuGithub, LuGlobe, LuHeart, LuRows3, LuColumns3, LuCode, LuCloud } from 'react-icons/lu';

const RECOMMENDED_MODELS = [
    { id: 'qwen2.5:1.5b', label: 'Qwen 2.5 (1.5B)', size: '1.4GB RAM', desc: 'Ideal for ultralight machines.' },
    { id: 'llama3.2:3b', label: 'Llama 3.2 (3B)', size: '2.0GB RAM', desc: 'Very balanced and fast.' },
    { id: 'llama3.1:8b', label: 'Llama 3.1 (8B)', size: '4.9GB RAM', desc: 'Powerful SQL & Code model.' },
    { id: 'gemma2:2b', label: 'Gemma 2 (2B)', size: '1.6GB RAM', desc: 'Great reasoning for small memory.' }
];

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange, currentAccent, onAccentChange, currentLayout, onLayoutChange, editorSettings = {}, onEditorSettingsChange }) => {
    const [activeTab, setActiveTab] = useState('appearance');

    // AI Settings State
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [provider, setProvider] = useState('ollama');
    const [defaultModel, setDefaultModel] = useState('qwen3:1.7b');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [geminiUsage, setGeminiUsage] = useState({ flashLite: 0, flash: 0, pro: 0, tokens: 0 });

    // Ollama Specific State
    const [installedModels, setInstalledModels] = useState([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Download State
    const [customModelInput, setCustomModelInput] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(null); // { status: string, percent: number }

    // DuckDB Version (auto-fetched)
    const [duckdbVersion, setDuckdbVersion] = useState('...');

    // Function Catalog State
    const [catalogStats, setCatalogStats] = useState({ total: 0, documented: 0, cacheExists: false, undocumented: [] });
    const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
    const [showUndocumented, setShowUndocumented] = useState(false);

    // Cloud Storage State
    const [s3Config, setS3Config] = useState({ accessKeyId: '', secretKey: '', region: '', endpoint: '', defaultBucket: '' });
    const [gcsConfig, setGcsConfig] = useState({ accessKeyId: '', secretKey: '', defaultBucket: '' });
    const [isTestingCloud, setIsTestingCloud] = useState(false);
    const [cloudTestResult, setCloudTestResult] = useState(null);

    // Helper: open links in system browser (Electron) or new tab (browser)
    const openExternalLink = (e, url) => {
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    useEffect(() => {
        if (isOpen) {
            // Load base config
            fetch('http://localhost:3001/api/settings/config')
                .then(res => res.json())
                .then(data => {
                    setGeminiApiKey(data.geminiApiKey || '');
                    setProvider(data.provider || 'ollama');
                    setDefaultModel(data.defaultModel || 'qwen3:1.7b');
                    if (data.usage) {
                        setGeminiUsage(data.usage);
                    }
                    if (data.s3Config) setS3Config(data.s3Config);
                    if (data.gcsConfig) setGcsConfig(data.gcsConfig);
                    if (data.provider !== 'gemini') {
                        fetchInstalledModels();
                    }
                })
                .catch(err => console.error("Failed to load config", err));

            // Fetch DuckDB version
            fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'SELECT version() as version' })
            })
                .then(res => res.json())
                .then(data => {
                    if (data && data.data && data.data.length > 0 && data.data[0].version) {
                        setDuckdbVersion(data.data[0].version);
                    }
                })
                .catch(() => setDuckdbVersion('N/A'));

            // Fetch Function Catalog Stats
            fetchCatalogStats();
        }
    }, [isOpen]);

    const fetchCatalogStats = () => {
        fetch('http://localhost:3001/api/functions/coverage')
            .then(res => res.json())
            .then(data => setCatalogStats(data))
            .catch(err => console.error("Failed to load catalog stats", err));
    };

    const handleRefreshCatalog = async () => {
        setIsRefreshingCatalog(true);
        try {
            await fetch('http://localhost:3001/api/functions/refresh', { method: 'POST' });
            fetchCatalogStats();
            // Dispatch event to force SqlEditor to reload catalog
            window.dispatchEvent(new Event('amox_catalog_refreshed'));
        } catch (err) {
            console.error(err);
        } finally {
            setIsRefreshingCatalog(false);
        }
    };

    // Fetch Ollama Models when switching provider
    useEffect(() => {
        if (isOpen && provider === 'ollama' && !isDownloading) {
            fetchInstalledModels();
        }
    }, [provider, isOpen, isDownloading]);

    const fetchInstalledModels = async () => {
        setIsLoadingModels(true);
        try {
            const res = await fetch('http://localhost:3001/api/settings/ollama/models');
            const data = await res.json();
            if (data.models) {
                setInstalledModels(data.models);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handleSaveConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            await fetch('http://localhost:3001/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geminiApiKey, provider, defaultModel, s3Config, gcsConfig })
            });

            // Dispatch event to sync other components
            window.dispatchEvent(new Event('amox_settings_updated'));

            setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error("Failed to save config", err);
            setSaveMessage({ type: 'error', text: 'Failed to save settings' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadModel = async (modelId) => {
        if (!modelId.trim() || isDownloading) return;

        setIsDownloading(true);
        setDownloadProgress({ status: 'Starting download...', percent: 0 });

        try {
            const response = await fetch('http://localhost:3001/api/settings/ollama/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.status === "success") {
                                setDownloadProgress({ status: 'Download Complete!', percent: 100 });
                            } else if (data.total && data.completed) {
                                const percent = Math.round((data.completed / data.total) * 100);
                                setDownloadProgress({ status: data.status, percent });
                            } else if (data.error) {
                                throw new Error(data.error);
                            } else {
                                setDownloadProgress({ status: data.status, percent: prev => prev?.percent || 0 });
                            }
                        } catch (e) {
                            // ignore parse err for incomplete chunks
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Download failed:", err);
            setDownloadProgress({ status: 'Error: ' + err.message, percent: 0, error: true });
        } finally {
            setTimeout(() => {
                setIsDownloading(false);
                setDownloadProgress(null);
                setCustomModelInput('');
                fetchInstalledModels();
            }, 3000);
        }
    };

    const handleTestCloudConnection = async (testProvider) => {
        setIsTestingCloud(true);
        setCloudTestResult(null);

        // Save current config before testing to ensure server uses latest values
        try {
            await fetch('http://localhost:3001/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ s3Config, gcsConfig })
            });

            const res = await fetch('http://localhost:3001/api/export/cloud/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: testProvider })
            });
            const data = await res.json();
            
            if (data.success) {
                setCloudTestResult({ type: 'success', text: data.message });
            } else {
                setCloudTestResult({ type: 'error', text: data.error || data.message || 'Connection failed' });
            }
        } catch (err) {
            setCloudTestResult({ type: 'error', text: err.message });
        } finally {
            setIsTestingCloud(false);
            setTimeout(() => setCloudTestResult(null), 5000);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
            backdropFilter: 'blur(8px)'
        }}>
            <div className="modal-panel" style={{
                backgroundColor: 'var(--surface-overlay)',
                color: 'var(--text-secondary)',
                width: '850px',
                height: '600px',
                borderRadius: '12px',
                display: 'flex',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--border-default)'
            }}>
                {/* Sidebar */}
                <div style={{
                    width: '180px',
                    backgroundColor: 'var(--surface-raised)',
                    borderRight: '1px solid var(--border-subtle)',
                    padding: '15px 0',
                    flexShrink: 0
                }}>
                    <div style={{ padding: '0 15px 15px', fontWeight: 'bold', fontSize: '14px', color: 'var(--text-active)' }}>
                        Settings
                    </div>

                    <div
                        onClick={() => setActiveTab('appearance')}
                        style={{
                            padding: '10px 15px', cursor: 'pointer',
                            backgroundColor: activeTab === 'appearance' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'appearance' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                            borderLeft: activeTab === 'appearance' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuPalette size={16} /> Appearance
                    </div>

                    <div
                        onClick={() => setActiveTab('editor')}
                        style={{
                            padding: '10px 15px', cursor: 'pointer',
                            backgroundColor: activeTab === 'editor' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'editor' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                            borderLeft: activeTab === 'editor' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuCode size={16} /> Editor
                    </div>

                    <div
                        onClick={() => setActiveTab('ai')}
                        style={{
                            padding: '10px 15px', cursor: 'pointer',
                            backgroundColor: activeTab === 'ai' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'ai' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                            borderLeft: activeTab === 'ai' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuCpu size={16} /> AI Assistant
                    </div>

                    <div
                        onClick={() => setActiveTab('cloud')}
                        style={{
                            padding: '10px 15px', cursor: 'pointer',
                            backgroundColor: activeTab === 'cloud' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'cloud' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                            borderLeft: activeTab === 'cloud' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuCloud size={16} /> Cloud Storage
                    </div>

                    <div
                        onClick={() => setActiveTab('about')}
                        style={{
                            padding: '10px 15px', cursor: 'pointer',
                            backgroundColor: activeTab === 'about' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'about' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
                            borderLeft: activeTab === 'about' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuInfo size={16} /> About AmoxSQL
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface-base)' }}>
                    <div style={{
                        padding: '15px 20px',
                        borderBottom: '1px solid var(--border-subtle)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--text-active)' }}>
                            {activeTab === 'appearance' ? 'Appearance' : activeTab === 'editor' ? 'Editor' : activeTab === 'ai' ? 'AI Settings' : activeTab === 'cloud' ? 'Cloud Storage' : activeTab === 'about' ? 'About AmoxSQL' : 'Settings'}
                        </h2>
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-color)', padding: '5px', cursor: 'pointer', display: 'flex' }}>
                            <LuX size={18} />
                        </button>
                    </div>

                    <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                        {activeTab === 'appearance' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                {/* Theme Selection */}
                                <div>
                                    <h3 style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--text-active)' }}>Color Theme</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                                        {[
                                            { id: 'dark',     label: 'Obsidian',  icon: <LuMoon size={14} />, sidebar: '#0e0f11', editor: '#141518', text: '#ccc', desc: 'Deepest dark' },
                                            { id: 'onyx',     label: 'Onyx',      icon: <LuMoon size={14} />, sidebar: '#101113', editor: '#1a1c20', text: '#ccc', desc: 'Near-black blue' },
                                            { id: 'carbon',   label: 'Carbon',    icon: <LuMoon size={14} />, sidebar: '#121315', editor: '#1c1f24', text: '#bbb', desc: 'Blue-grey dark' },
                                            { id: 'graphite', label: 'Graphite',  icon: <LuMoon size={14} />, sidebar: '#141618', editor: '#222529', text: '#bbb', desc: 'Warm dark grey' },
                                            { id: 'nord',     label: 'Nord Dark', icon: <LuMoon size={14} />, sidebar: '#151920', editor: '#222833', text: '#d8dee9', desc: 'Polar night' },
                                            { id: 'ivory',    label: 'Ivory',     icon: <LuSun size={14} />,  sidebar: '#f3ede4', editor: '#faf6ef', text: '#3b3228', desc: 'Warm paper' },
                                            { id: 'mist',     label: 'Mist',      icon: <LuSun size={14} />,  sidebar: '#e8ecf2', editor: '#f2f4f8', text: '#2c3444', desc: 'Cool fog' },
                                            { id: 'light',    label: 'Light',     icon: <LuSun size={14} />,  sidebar: '#f2f3f5', editor: '#ffffff', text: '#333',    desc: 'Clean & bright' },
                                        ].map(t => (
                                            <div
                                                key={t.id}
                                                onClick={() => onThemeChange(t.id)}
                                                style={{
                                                    cursor: 'pointer',
                                                    border: currentTheme === t.id ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                    borderRadius: '10px', padding: '12px',
                                                    backgroundColor: t.editor,
                                                    opacity: currentTheme === t.id ? 1 : 0.65,
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: t.text, fontSize: '12px', fontWeight: 600 }}>
                                                    {t.icon} {t.label}
                                                </div>
                                                <div style={{ display: 'flex', height: '48px', borderRadius: '6px', overflow: 'hidden', fontSize: '9px' }}>
                                                    <div style={{ width: '30%', background: t.sidebar, borderRight: `1px solid ${t.id === 'light' ? '#dee2e6' : '#333'}` }}></div>
                                                    <div style={{ flex: 1, background: t.editor, color: t.text, padding: '6px', fontFamily: 'monospace' }}>
                                                        SELECT *
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '10px', color: t.text, opacity: 0.5, marginTop: '6px' }}>{t.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Accent Color Selection */}
                                <div>
                                    <h3 style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--text-active)' }}>Accent Color</h3>

                                    {/* Vibrant palette */}
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Vibrant</p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                        {[
                                            { id: 'cyan', color: '#00FFFF', label: 'Cyan (Default)' },
                                            { id: 'amox-2', color: '#00F5FF', label: 'Aqua' },
                                            { id: 'amox-4', color: '#00DAFF', label: 'Sky' },
                                            { id: 'amox-6', color: '#00B6FF', label: 'Azure' },
                                            { id: 'amox-8', color: '#0090FF', label: 'Blue' },
                                            { id: 'amox-10', color: '#0068FF', label: 'Cobalt' },
                                            { id: 'linear', color: '#5E6AD2', label: 'Linear Blue' },
                                        ].map(swatch => (
                                            <div
                                                key={swatch.id}
                                                onClick={() => onAccentChange && onAccentChange(swatch.id)}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer',
                                                    background: swatch.color,
                                                    border: currentAccent === swatch.id ? '2px solid var(--text-primary)' : '2px solid transparent',
                                                    outline: currentAccent === swatch.id ? '2px solid var(--accent-color-user)' : 'none',
                                                    outlineOffset: '2px',
                                                    transition: 'all 0.15s',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                title={swatch.label}
                                            >
                                                {currentAccent === swatch.id && <span style={{ color: '#000', fontWeight: 'bold', fontSize: '12px' }}>✓</span>}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Sober palette */}
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Sober</p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'sage', color: '#7dab8a', label: 'Sage', checkColor: '#000' },
                                            { id: 'amber', color: '#d4a853', label: 'Amber', checkColor: '#000' },
                                            { id: 'rose', color: '#c97878', label: 'Rose', checkColor: '#000' },
                                            { id: 'lavender', color: '#a88ec4', label: 'Lavender', checkColor: '#000' },
                                            { id: 'steel', color: '#8a9bb0', label: 'Steel', checkColor: '#000' },
                                            { id: 'copper', color: '#c4956a', label: 'Copper', checkColor: '#000' },
                                        ].map(swatch => (
                                            <div
                                                key={swatch.id}
                                                onClick={() => onAccentChange && onAccentChange(swatch.id)}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer',
                                                    background: swatch.color,
                                                    border: currentAccent === swatch.id ? '2px solid var(--text-primary)' : '2px solid transparent',
                                                    outline: currentAccent === swatch.id ? '2px solid var(--accent-color-user)' : 'none',
                                                    outlineOffset: '2px',
                                                    transition: 'all 0.15s',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}
                                                title={swatch.label}
                                            >
                                                {currentAccent === swatch.id && <span style={{ color: swatch.checkColor, fontWeight: 'bold', fontSize: '12px' }}>✓</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Editor Layout Selection */}
                                <div>
                                    <h3 style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--text-active)' }}>Editor Layout</h3>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                        Choose how the SQL editor and results panel are arranged. Vertical is ideal for ultrawide monitors.
                                    </p>
                                    <div style={{ display: 'flex', gap: '20px' }}>

                                        {/* Horizontal (default) */}
                                        <div
                                            onClick={() => onLayoutChange && onLayoutChange('horizontal')}
                                            style={{
                                                flex: 1, cursor: 'pointer',
                                                border: currentLayout !== 'vertical' ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                borderRadius: '8px', padding: '15px',
                                                backgroundColor: 'var(--sidebar-item-active-bg)',
                                                opacity: currentLayout !== 'vertical' ? 1 : 0.7, transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-active)' }}>
                                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {currentLayout !== 'vertical' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-color-user)' }}></div>}
                                                </div>
                                                <LuRows3 size={18} /> Horizontal
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                                <div style={{ flex: 1, background: 'var(--input-bg)', borderBottom: '2px solid var(--accent-color-user)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>EDITOR</span>
                                                </div>
                                                <div style={{ flex: 1, background: 'var(--surface-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>RESULTS</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Vertical (side by side) */}
                                        <div
                                            onClick={() => onLayoutChange && onLayoutChange('vertical')}
                                            style={{
                                                flex: 1, cursor: 'pointer',
                                                border: currentLayout === 'vertical' ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                borderRadius: '8px', padding: '15px',
                                                backgroundColor: 'var(--sidebar-item-active-bg)',
                                                opacity: currentLayout === 'vertical' ? 1 : 0.7, transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-active)' }}>
                                                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {currentLayout === 'vertical' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--accent-color-user)' }}></div>}
                                                </div>
                                                <LuColumns3 size={18} /> Vertical
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'row', height: '60px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                                                <div style={{ flex: 1, background: 'var(--input-bg)', borderRight: '2px solid var(--accent-color-user)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>EDITOR</span>
                                                </div>
                                                <div style={{ flex: 1, background: 'var(--surface-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>RESULTS</span>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>

                            </div>
                        )}

                        {activeTab === 'editor' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.25s ease' }}>

                                {/* ── Typography ── */}
                                <div>
                                    <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: '14px', fontWeight: 600 }}>Typography</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {/* Font Family */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Font Family</span>
                                            <select
                                                value={editorSettings.fontFamily || "'JetBrains Mono', 'Consolas', monospace"}
                                                onChange={(e) => onEditorSettingsChange && onEditorSettingsChange({ fontFamily: e.target.value })}
                                                style={{ width: '200px', padding: '6px 10px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                                            >
                                                <option value="'JetBrains Mono', 'Consolas', monospace">JetBrains Mono</option>
                                                <option value="'Fira Code', 'Consolas', monospace">Fira Code</option>
                                                <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
                                                <option value="'Consolas', monospace">Consolas</option>
                                                <option value="'Monaco', 'Courier New', monospace">Monaco</option>
                                                <option value="'Source Code Pro', monospace">Source Code Pro</option>
                                            </select>
                                        </div>

                                        {/* Font Size */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Font Size</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input
                                                    type="range"
                                                    min="10"
                                                    max="24"
                                                    value={editorSettings.fontSize || 14}
                                                    onChange={(e) => onEditorSettingsChange && onEditorSettingsChange({ fontSize: parseInt(e.target.value) })}
                                                    style={{ width: '120px', accentColor: 'var(--accent-color-user)', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '12px', color: 'var(--text-active)', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{editorSettings.fontSize || 14}px</span>
                                            </div>
                                        </div>

                                        {/* Tab Size */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Tab Size</span>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {[2, 4].map(size => (
                                                    <button
                                                        key={size}
                                                        onClick={() => onEditorSettingsChange && onEditorSettingsChange({ tabSize: size })}
                                                        style={{
                                                            padding: '4px 14px', fontSize: '12px', fontWeight: 500,
                                                            backgroundColor: (editorSettings.tabSize || 4) === size ? 'var(--accent-muted)' : 'var(--input-bg)',
                                                            color: (editorSettings.tabSize || 4) === size ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                            border: (editorSettings.tabSize || 4) === size ? '1px solid var(--accent-primary)' : '1px solid var(--border-default)',
                                                            borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s'
                                                        }}
                                                    >{size} spaces</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0' }} />

                                {/* ── Display ── */}
                                <div>
                                    <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: '14px', fontWeight: 600 }}>Display</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                                        {/* Minimap */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Minimap</span>
                                                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>Show a preview of the code on the right edge</p>
                                            </div>
                                            <div
                                                onClick={() => onEditorSettingsChange && onEditorSettingsChange({ minimap: !editorSettings.minimap })}
                                                style={{
                                                    width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer',
                                                    backgroundColor: editorSettings.minimap ? 'var(--accent-primary)' : 'var(--border-strong)',
                                                    transition: 'background-color 0.15s', position: 'relative', flexShrink: 0
                                                }}
                                            >
                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--surface-overlay)', position: 'absolute', top: '2px', left: editorSettings.minimap ? '18px' : '2px', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                            </div>
                                        </div>

                                        {/* Word Wrap */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Word Wrap</span>
                                                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>Wrap lines that exceed the editor width</p>
                                            </div>
                                            <div
                                                onClick={() => onEditorSettingsChange && onEditorSettingsChange({ wordWrap: editorSettings.wordWrap === 'on' ? 'off' : 'on' })}
                                                style={{
                                                    width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer',
                                                    backgroundColor: editorSettings.wordWrap === 'on' ? 'var(--accent-primary)' : 'var(--border-strong)',
                                                    transition: 'background-color 0.15s', position: 'relative', flexShrink: 0
                                                }}
                                            >
                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--surface-overlay)', position: 'absolute', top: '2px', left: editorSettings.wordWrap === 'on' ? '18px' : '2px', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                            </div>
                                        </div>

                                        {/* Line Numbers */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Line Numbers</span>
                                                <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'var(--text-tertiary)' }}>Show line numbers in the gutter</p>
                                            </div>
                                            <div
                                                onClick={() => onEditorSettingsChange && onEditorSettingsChange({ lineNumbers: (editorSettings.lineNumbers ?? 'on') === 'on' ? 'off' : 'on' })}
                                                style={{
                                                    width: '36px', height: '20px', borderRadius: '10px', cursor: 'pointer',
                                                    backgroundColor: (editorSettings.lineNumbers ?? 'on') === 'on' ? 'var(--accent-primary)' : 'var(--border-strong)',
                                                    transition: 'background-color 0.15s', position: 'relative', flexShrink: 0
                                                }}
                                            >
                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'var(--surface-overlay)', position: 'absolute', top: '2px', left: (editorSettings.lineNumbers ?? 'on') === 'on' ? '18px' : '2px', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                                            </div>
                                        </div>

                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0' }} />

                                {/* ── Results Panel ── */}
                                <div>
                                    <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: '14px', fontWeight: 600 }}>Results Panel</h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                                        {/* Results Font Size */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Results Font Size</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <input
                                                    type="range"
                                                    min="11"
                                                    max="16"
                                                    value={editorSettings.resultsFontSize || 13}
                                                    onChange={(e) => onEditorSettingsChange && onEditorSettingsChange({ resultsFontSize: parseInt(e.target.value) })}
                                                    style={{ width: '120px', accentColor: 'var(--accent-color-user)', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontSize: '12px', color: 'var(--text-active)', minWidth: '32px', textAlign: 'right', fontFamily: 'monospace' }}>{editorSettings.resultsFontSize || 13}px</span>
                                            </div>
                                        </div>

                                        {/* Default View Mode */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Default Results View</span>
                                            <select
                                                value={editorSettings.defaultViewMode || 'table'}
                                                onChange={(e) => onEditorSettingsChange && onEditorSettingsChange({ defaultViewMode: e.target.value })}
                                                style={{ width: '120px', padding: '6px 10px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12px', outline: 'none', cursor: 'pointer' }}
                                            >
                                                <option value="table">Table</option>
                                                <option value="chart">Chart</option>
                                                <option value="profile">Profile</option>
                                            </select>
                                        </div>

                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '0' }} />

                                {/* ── Editor Intelligence ── */}
                                <div>
                                    <h3 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: '14px', fontWeight: 600 }}>Editor Intelligence</h3>

                                    <div style={{ backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-active)' }}>DuckDB Function Catalog</h4>
                                            <button
                                                onClick={handleRefreshCatalog}
                                                disabled={isRefreshingCatalog}
                                                style={{
                                                    padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)',
                                                    backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', cursor: isRefreshingCatalog ? 'default' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '6px'
                                                }}
                                            >
                                                {isRefreshingCatalog ? <LuLoader size={12} style={{ animation: 'spin 2s linear infinite' }} /> : null}
                                                {catalogStats.cacheExists ? 'Refresh Cache' : 'Generate Cache'}
                                            </button>
                                        </div>

                                        <p style={{ margin: '0 0 15px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            The editor provides rich autocompletion and hover documentation for DuckDB functions.
                                            We merge curated rich docs with live database introspection.
                                        </p>

                                        <div style={{ marginBottom: '15px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-active)', marginBottom: '6px' }}>
                                                <span>Rich Documentation Coverage</span>
                                                <span>{catalogStats.documented} / {catalogStats.total > 0 ? catalogStats.total : '?'} functions</span>
                                            </div>
                                            <div style={{ height: '6px', backgroundColor: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: catalogStats.total > 0 ? `${(catalogStats.documented / catalogStats.total) * 100}%` : '0%',
                                                    backgroundColor: 'var(--accent-color-user)',
                                                    transition: 'width 0.3s ease'
                                                }} />
                                            </div>
                                        </div>

                                        {catalogStats.undocumented?.length > 0 && (
                                            <div>
                                                <button
                                                    onClick={() => setShowUndocumented(!showUndocumented)}
                                                    style={{
                                                        background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: 0,
                                                        fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                                    }}
                                                >
                                                    {showUndocumented ? 'Hide' : 'Show'} {catalogStats.undocumented.length} functions with basic auto-generated docs
                                                </button>

                                                {showUndocumented && (
                                                    <div style={{
                                                        marginTop: '10px', maxHeight: '150px', overflowY: 'auto',
                                                        backgroundColor: 'var(--surface-base)', borderRadius: '4px', border: '1px solid var(--border-subtle)', padding: '5px'
                                                    }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '4px' }}>
                                                            {catalogStats.undocumented.map((fn, i) => (
                                                                <div key={i} title={fn.description} style={{
                                                                    fontSize: '10px', color: 'var(--text-muted)', padding: '2px 6px',
                                                                    backgroundColor: 'var(--input-bg)', borderRadius: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                                                }}>
                                                                    {fn.function_name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        )}

                        {activeTab === 'ai' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
                                {/* Provider Selection & Main Save */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-active)' }}>AI Engine Provider</h3>
                                        <select
                                            value={provider}
                                            onChange={(e) => setProvider(e.target.value)}
                                            style={{
                                                width: '100%', maxWidth: '250px', padding: '8px 10px', backgroundColor: 'var(--input-bg)',
                                                color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none', cursor: 'pointer', fontSize: '12px'
                                            }}
                                        >
                                            <option value="ollama">Ollama (Local Engine)</option>
                                            <option value="gemini">Google Gemini (Cloud)</option>
                                        </select>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
                                            Choose between running fully private local models or using Google's Cloud API.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                        <button
                                            onClick={handleSaveConfig}
                                            disabled={isSaving}
                                            style={{
                                                padding: '8px 16px', backgroundColor: 'var(--accent-color-user)',
                                                color: 'var(--button-text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                                fontWeight: 'bold', opacity: isSaving ? 0.7 : 1, transition: 'all 0.2s', fontSize: '12px'
                                            }}
                                        >
                                            {isSaving ? 'Saving...' : 'Save AI Settings'}
                                        </button>
                                        {saveMessage && (
                                            <div style={{ fontSize: '13px', color: saveMessage.type === 'success' ? 'var(--feedback-success-text)' : 'var(--feedback-error-text)' }}>
                                                {saveMessage.type === 'success' ? '✓ ' : '× '} {saveMessage.text}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0' }} />

                                {/* Gemini Specific */}
                                {provider === 'gemini' && (
                                    <div style={{ animation: 'fadeIn 0.3s', display: 'flex', gap: '20px', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            <div style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px' }}>
                                                <h3 style={{ fontSize: '13px', margin: '0 0 10px 0', color: 'var(--text-active)' }}>Authentication</h3>

                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type={geminiApiKey ? "password" : "text"}
                                                        value={geminiApiKey}
                                                        onChange={(e) => setGeminiApiKey(e.target.value)}
                                                        placeholder="Enter your Gemini API Key"
                                                        style={{
                                                            flex: 1, padding: '8px 12px', fontSize: '12px', backgroundColor: 'var(--input-bg)',
                                                            color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none',
                                                            fontFamily: geminiApiKey ? 'monospace' : 'inherit'
                                                        }}
                                                    />
                                                    {geminiApiKey && (
                                                        <button
                                                            onClick={() => setGeminiApiKey('')}
                                                            title="Clear API Key"
                                                            style={{
                                                                padding: '8px', backgroundColor: 'var(--sidebar-item-active-bg)',
                                                                border: '1px solid var(--border-color)', borderRadius: '4px',
                                                                color: 'var(--color-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                            }}
                                                        >
                                                            <LuX size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
                                                    Your key is stored securely in your computer's home directory (`~/.amoxsql/`). Removing it here will delete it from your local storage upon saving.
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <h3 style={{ fontSize: '13px', margin: 0, color: 'var(--text-active)' }}>Daily Free Tier Usage (2026 Limits)</h3>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-active)', marginBottom: '4px', fontWeight: '500' }}>
                                                        <span>2.5 Flash-Lite</span>
                                                        <span>{geminiUsage.flashLite} / 1000</span>
                                                    </div>
                                                    <div style={{ height: '4px', backgroundColor: 'var(--input-bg)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min((geminiUsage.flashLite / 1000) * 100, 100)}%`, backgroundColor: 'var(--color-warning)', transition: 'width 0.3s ease' }}></div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-active)', marginBottom: '4px', fontWeight: '500' }}>
                                                        <span>2.5 Flash</span>
                                                        <span>{geminiUsage.flash} / 250</span>
                                                    </div>
                                                    <div style={{ height: '4px', backgroundColor: 'var(--input-bg)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min((geminiUsage.flash / 250) * 100, 100)}%`, backgroundColor: 'var(--color-success)', transition: 'width 0.3s ease' }}></div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-active)', marginBottom: '4px', fontWeight: '500' }}>
                                                        <span>2.5 Pro</span>
                                                        <span>{geminiUsage.pro} / 100</span>
                                                    </div>
                                                    <div style={{ height: '4px', backgroundColor: 'var(--input-bg)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${Math.min((geminiUsage.pro / 100) * 100, 100)}%`, backgroundColor: '#00ffff', transition: 'width 0.3s ease' }}></div>
                                                    </div>
                                                </div>

                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                                                    <span>Total Tokens Consumed</span>
                                                    <span style={{ color: 'var(--text-active)', fontWeight: 'bold', fontSize: '12px' }}>{geminiUsage.tokens.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal' }}>/ 4,000,000</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Ollama Specific */}
                                {provider === 'ollama' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', animation: 'fadeIn 0.3s', flex: 1 }}>

                                        <div>
                                            <h3 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span>Installed Local Models</span>
                                                {isLoadingModels && <LuLoader size={14} style={{ animation: 'spin 2s linear infinite', color: 'var(--text-muted)' }} />}
                                            </h3>

                                            <div style={{
                                                backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)',
                                                borderRadius: '6px', padding: '10px', maxHeight: '100px', overflowY: 'auto'
                                            }}>
                                                {installedModels.length === 0 && !isLoadingModels ? (
                                                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', padding: '10px' }}>
                                                        No models installed. You need to install at least one model below.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {installedModels.map((m, i) => (
                                                            <div key={i} style={{
                                                                backgroundColor: 'var(--input-bg)', padding: '4px 8px', borderRadius: '4px',
                                                                fontSize: '11px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '4px',
                                                                color: 'var(--text-active)'
                                                            }}>
                                                                <LuCpu size={12} color="var(--accent-color-user)" />
                                                                {m.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px' }}>
                                            <h3 style={{ fontSize: '13px', margin: '0 0 10px 0', color: 'var(--text-active)' }}>Install New Model</h3>

                                            {/* Progress Bar */}
                                            {downloadProgress && (
                                                <div style={{ marginBottom: '15px', backgroundColor: 'var(--sidebar-item-active-bg)', padding: '10px', borderRadius: '6px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px', color: downloadProgress.error ? 'var(--color-error)' : 'var(--text-active)' }}>
                                                        <span>{downloadProgress.status}</span>
                                                        <span>{downloadProgress.percent}%</span>
                                                    </div>
                                                    <div style={{ height: '4px', backgroundColor: 'var(--input-bg)', borderRadius: '2px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', width: `${downloadProgress.percent}%`,
                                                            backgroundColor: downloadProgress.error ? 'var(--color-error)' : 'var(--accent-color-user)',
                                                            transition: 'width 0.2s'
                                                        }}></div>
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                                {RECOMMENDED_MODELS.map(m => {
                                                    const isInstalled = installedModels.some(im => im.name.startsWith(m.id));
                                                    return (
                                                        <div key={m.id} style={{
                                                            flex: 1, backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)',
                                                            borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column'
                                                        }}>
                                                            <div style={{ fontWeight: 'bold', fontSize: '11px', color: 'var(--text-active)', marginBottom: '4px' }}>{m.label}</div>
                                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', flex: 1 }}>{m.desc}</div>

                                                            <button
                                                                onClick={() => handleDownloadModel(m.id)}
                                                                disabled={isDownloading || isInstalled}
                                                                style={{
                                                                    width: '100%', padding: '4px', borderRadius: '4px', cursor: (isDownloading || isInstalled) ? 'default' : 'pointer',
                                                                    backgroundColor: isInstalled ? 'transparent' : 'var(--input-bg)',
                                                                    color: isInstalled ? 'var(--color-success)' : 'var(--text-color)', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                                                    border: isInstalled ? '1px solid var(--color-success-bg)' : '1px solid var(--border-color)'
                                                                }}
                                                            >
                                                                {isInstalled ? <><LuCheck size={12} /> Installed</> : <><LuDownload size={12} /> Install</>}
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <input
                                                    type="text"
                                                    value={customModelInput}
                                                    onChange={(e) => setCustomModelInput(e.target.value)}
                                                    placeholder="Or pull any custom Ollama model (e.g., mistral:latest)"
                                                    style={{
                                                        flex: 1, padding: '8px 10px', backgroundColor: 'var(--input-bg)',
                                                        color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none', fontSize: '11px'
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleDownloadModel(customModelInput)}
                                                    disabled={isDownloading || !customModelInput.trim()}
                                                    style={{
                                                        padding: '8px 15px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                                        color: 'var(--text-active)', borderRadius: '4px', cursor: (isDownloading || !customModelInput.trim()) ? 'not-allowed' : 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
                                                        opacity: (isDownloading || !customModelInput.trim()) ? 0.5 : 1
                                                    }}
                                                >
                                                    <LuDownload size={14} /> Pull Custom
                                                </button>
                                            </div>
                                            <p style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                                Don't have Ollama installed? <a href="https://ollama.com/download" onClick={(e) => openExternalLink(e, 'https://ollama.com/download')} style={{ color: 'var(--accent-color-user)', cursor: 'pointer' }}>Download it from ollama.com</a>.
                                            </p>
                                        </div>

                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'cloud' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.25s ease' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--text-active)' }}>S3 & GCS Export Configuration</h3>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0, maxWidth: '500px' }}>
                                            Connect your cloud storage buckets to export query results directly to S3 or Google Cloud Storage using DuckDB's native httpfs extension.
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleSaveConfig}
                                        disabled={isSaving}
                                        style={{
                                            padding: '8px 16px', backgroundColor: 'var(--accent-color-user)',
                                            color: 'var(--button-text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                            fontWeight: 'bold', opacity: isSaving ? 0.7 : 1, transition: 'all 0.2s', fontSize: '12px'
                                        }}
                                    >
                                        {isSaving ? 'Saving...' : 'Save Cloud Settings'}
                                    </button>
                                </div>

                                {saveMessage && (
                                    <div style={{ fontSize: '12px', padding: '10px', borderRadius: '4px', backgroundColor: saveMessage.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)', color: saveMessage.type === 'success' ? 'var(--color-success)' : 'var(--color-error)', border: `1px solid ${saveMessage.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)'}` }}>
                                        {saveMessage.text}
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
                                    {/* S3 Config */}
                                    <div style={{ backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                            <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: '6px' }}><LuCloud /> Amazon S3</h4>
                                            <button onClick={() => handleTestCloudConnection('s3')} disabled={isTestingCloud} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: isTestingCloud ? 'not-allowed' : 'pointer' }}>
                                                {isTestingCloud ? 'Testing...' : 'Test Connection'}
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Access Key ID</div>
                                                <input type="text" value={s3Config.accessKeyId} onChange={(e) => setS3Config({...s3Config, accessKeyId: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }} placeholder="AKIAIOSFODNN7EXAMPLE" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Secret Access Key</div>
                                                <input type="password" value={s3Config.secretKey} onChange={(e) => setS3Config({...s3Config, secretKey: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none', fontFamily: 'monospace' }} placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Region</div>
                                                <input type="text" value={s3Config.region} onChange={(e) => setS3Config({...s3Config, region: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }} placeholder="us-east-1" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Endpoint (Optional - for MinIO/R2)</div>
                                                <input type="text" value={s3Config.endpoint} onChange={(e) => setS3Config({...s3Config, endpoint: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }} placeholder="s3.us-east-1.amazonaws.com" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Default Bucket (for testing)</div>
                                                <input type="text" value={s3Config.defaultBucket} onChange={(e) => setS3Config({...s3Config, defaultBucket: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }} placeholder="my-bucket-name" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* GCS Config */}
                                    <div style={{ backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '15px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                            <h4 style={{ margin: 0, fontSize: '12px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: '6px' }}><LuCloud /> Google Cloud Storage</h4>
                                            <button onClick={() => handleTestCloudConnection('gcs')} disabled={isTestingCloud} style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: isTestingCloud ? 'not-allowed' : 'pointer' }}>
                                                {isTestingCloud ? 'Testing...' : 'Test HMAC'}
                                            </button>
                                        </div>
                                        <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                            DuckDB connects to GCS using HMAC keys via the S3-compatible API. You must create an HMAC key in your Google Cloud Console.
                                        </p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>HMAC Access ID</div>
                                                <input type="text" value={gcsConfig.accessKeyId} onChange={(e) => setGcsConfig({...gcsConfig, accessKeyId: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }} placeholder="GOOG1EQX..." />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>HMAC Secret</div>
                                                <input type="password" value={gcsConfig.secretKey} onChange={(e) => setGcsConfig({...gcsConfig, secretKey: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none', fontFamily: 'monospace' }} placeholder="..." />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Default Bucket</div>
                                                <input type="text" value={gcsConfig.defaultBucket} onChange={(e) => setGcsConfig({...gcsConfig, defaultBucket: e.target.value})} style={{ width: '100%', padding: '6px 10px', fontSize: '11px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none' }} placeholder="gs://my-bucket" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Test Result Display */}
                                {cloudTestResult && (
                                    <div style={{ 
                                        padding: '12px 15px', borderRadius: '6px', fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px',
                                        backgroundColor: cloudTestResult.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                                        color: cloudTestResult.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
                                        border: `1px solid ${cloudTestResult.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-error-bg)'}`
                                    }}>
                                        {cloudTestResult.type === 'success' ? <LuCheck /> : <LuX />}
                                        {cloudTestResult.text}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'about' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '12px', backgroundColor: 'var(--sidebar-item-active-bg)', border: '1px solid var(--border-color)' }}>
                                        <LuInfo size={32} color="var(--accent-color-user)" />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, color: 'var(--text-active)', fontSize: '20px' }}>AmoxSQL</h2>
                                        <p style={{ margin: '4px 0 0 0', color: 'var(--accent-color-user)', fontSize: '12px', fontWeight: 'bold' }}>Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}</p>
                                        <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '11px' }}>DuckDB Engine: {duckdbVersion}</p>
                                    </div>
                                </div>

                                <div style={{ backgroundColor: 'var(--sidebar-item-active-bg)', padding: '15px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                    <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: 'var(--text-active)' }}>
                                        <strong>The Modern Codex for Local Data Analysis.</strong><br /><br />
                                        AmoxSQL is a professional, high-performance Local Data IDE built specifically for DuckDB.
                                        Designed for serious data analysts and engineers who need speed, privacy, and advanced tooling without the cloud overhead.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <h3 style={{ fontSize: '13px', margin: 0, color: 'var(--text-active)' }}>Key Features</h3>
                                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-color)', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <li><strong>100% Offline & Private:</strong> Process data and run AI entirely on your local machine.</li>
                                        <li><strong>Blazing Fast:</strong> Built on DuckDB for unmatched analytical performance.</li>
                                        <li><strong>Smart Visualization:</strong> Create and save advanced Recharts configurations instantly.</li>
                                        <li><strong>Integrated AI Assistance:</strong> Support for local Ollama models and Google Gemini.</li>
                                        <li><strong>Drag & Drop Workflow:</strong> Seamlessly move tables and columns into the powerful Monaco Editor.</li>
                                        <li><strong>Extension Gallery:</strong> Explore and install DuckDB extensions with a visual gallery.</li>
                                        <li><strong>Vertical Split Layout:</strong> Arrange editor and results side-by-side for ultrawide monitors.</li>
                                        <li><strong>Premium Animations:</strong> Smooth transitions across all modals, panels, and view modes.</li>
                                    </ul>
                                </div>

                                {/* Sponsor CTA */}
                                <div style={{ backgroundColor: 'var(--accent-subtle)', padding: '16px', borderRadius: '8px', border: '1px solid var(--accent-muted)', textAlign: 'center' }}>
                                    <LuHeart size={20} style={{ color: 'var(--color-error)', marginBottom: '8px' }} />
                                    <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--text-active)', lineHeight: '1.5' }}>
                                        <strong>Love AmoxSQL?</strong> Your support helps us keep building new features, improving performance, and making data analysis accessible to everyone.
                                    </p>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        Every contribution — big or small — fuels the future of this project. 🚀
                                    </p>
                                    <a
                                        href="https://github.com/sponsors/dsandovalflavio"
                                        onClick={(e) => openExternalLink(e, 'https://github.com/sponsors/dsandovalflavio')}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '8px 20px', borderRadius: '6px',
                                            background: 'linear-gradient(135deg, #ef4444, #ec4899)',
                                            color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '600',
                                            border: 'none', cursor: 'pointer', transition: 'filter 0.2s'
                                        }}
                                    >
                                        <LuHeart size={14} /> Become a Sponsor
                                    </a>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-color)', lineHeight: '1.5' }}>
                                        Created with 💙 by <strong>@dsandovalflavio</strong>.<br />
                                        <span style={{ color: 'var(--text-muted)' }}>From Latin America to the World.</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        <a href="https://github.com/dsandovalflavio/amoxsql" onClick={(e) => openExternalLink(e, 'https://github.com/dsandovalflavio/amoxsql')} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-active)', textDecoration: 'none', fontSize: '12px', padding: '6px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', transition: 'all 0.2s', cursor: 'pointer' }}>
                                            <LuGithub size={14} /> GitHub Repository
                                        </a>
                                        <a href="https://github.com/dsandovalflavio" onClick={(e) => openExternalLink(e, 'https://github.com/dsandovalflavio')} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-active)', textDecoration: 'none', fontSize: '12px', padding: '6px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', transition: 'all 0.2s', cursor: 'pointer' }}>
                                            <LuGlobe size={14} /> Creator Profile
                                        </a>
                                        <a href="https://github.com/sponsors/dsandovalflavio" onClick={(e) => openExternalLink(e, 'https://github.com/sponsors/dsandovalflavio')} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-error)', textDecoration: 'none', fontSize: '12px', padding: '6px 12px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', transition: 'all 0.2s', cursor: 'pointer' }}>
                                            <LuHeart size={14} /> Sponsor
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
