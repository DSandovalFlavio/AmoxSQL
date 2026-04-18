import React, { useState, useEffect, useRef } from 'react';
import { LuX, LuPalette, LuMoon, LuSun, LuCpu, LuDownload, LuCheck, LuLoader, LuInfo, LuGithub, LuGlobe, LuHeart, LuRows3, LuColumns3, LuCode, LuCloud, LuKeyboard, LuSettings, LuTrash2, LuBrain, LuWrapText } from 'react-icons/lu';
import MemoriesPanel from './ai/MemoriesPanel';
import { useToast } from './ToastProvider';
import { useDialog } from './dialogs/DialogProvider';

const RECOMMENDED_MODELS = [
    { id: 'qwen2.5:1.5b', label: 'Qwen 2.5 (1.5B)', size: '1.4GB RAM', desc: 'Ideal for ultralight machines.' },
    { id: 'llama3.2:3b', label: 'Llama 3.2 (3B)', size: '2.0GB RAM', desc: 'Very balanced and fast.' },
    { id: 'llama3.1:8b', label: 'Llama 3.1 (8B)', size: '4.9GB RAM', desc: 'Powerful SQL & Code model.' },
    { id: 'gemma2:2b', label: 'Gemma 2 (2B)', size: '1.6GB RAM', desc: 'Great reasoning for small memory.' }
];

const THEMES = [
    { id: 'dark',     label: 'Obsidian',  icon: <LuMoon size={14} />, sidebar: '#0e0f11', editor: '#141518', text: '#ccc', desc: 'Deepest dark' },
    { id: 'onyx',     label: 'Onyx',      icon: <LuMoon size={14} />, sidebar: '#101113', editor: '#1a1c20', text: '#ccc', desc: 'Near-black blue' },
    { id: 'carbon',   label: 'Carbon',    icon: <LuMoon size={14} />, sidebar: '#121315', editor: '#1c1f24', text: '#bbb', desc: 'Blue-grey dark' },
    { id: 'graphite', label: 'Graphite',  icon: <LuMoon size={14} />, sidebar: '#141618', editor: '#222529', text: '#bbb', desc: 'Warm dark grey' },
    { id: 'nord',     label: 'Nord Dark', icon: <LuMoon size={14} />, sidebar: '#151920', editor: '#222833', text: '#d8dee9', desc: 'Polar night' },
    { id: 'ivory',    label: 'Ivory',     icon: <LuSun size={14} />,  sidebar: '#f3ede4', editor: '#faf6ef', text: '#3b3228', desc: 'Warm paper' },
    { id: 'mist',     label: 'Mist',      icon: <LuSun size={14} />,  sidebar: '#e8ecf2', editor: '#f2f4f8', text: '#2c3444', desc: 'Cool fog' },
    { id: 'light',    label: 'Light',     icon: <LuSun size={14} />,  sidebar: '#f2f3f5', editor: '#ffffff', text: '#333',    desc: 'Clean & bright' },
];

const VIBRANT_ACCENTS = [
    { id: 'cyan', color: '#00FFFF', label: 'Cyan (Default)' },
    { id: 'amox-2', color: '#00F5FF', label: 'Aqua' },
    { id: 'amox-4', color: '#00DAFF', label: 'Sky' },
    { id: 'amox-6', color: '#00B6FF', label: 'Azure' },
    { id: 'amox-8', color: '#0090FF', label: 'Blue' },
    { id: 'amox-10', color: '#0068FF', label: 'Cobalt' },
    { id: 'linear', color: '#5E6AD2', label: 'Linear Blue' },
];

const SOBER_ACCENTS = [
    { id: 'sage', color: '#7dab8a', label: 'Sage', checkColor: '#000' },
    { id: 'amber', color: '#d4a853', label: 'Amber', checkColor: '#000' },
    { id: 'rose', color: '#c97878', label: 'Rose', checkColor: '#000' },
    { id: 'lavender', color: '#a88ec4', label: 'Lavender', checkColor: '#000' },
    { id: 'steel', color: '#8a9bb0', label: 'Steel', checkColor: '#000' },
    { id: 'copper', color: '#c4956a', label: 'Copper', checkColor: '#000' },
];

const TAB_TITLES = {
    appearance: 'Appearance',
    editor: 'Editor',
    formatter: 'SQL Formatter',
    behavior: 'Behavior',
    ai: 'AI Settings',
    memories: 'AI Memories',
    cloud: 'Cloud Storage',
    shortcuts: 'Keyboard Shortcuts',
    about: 'About AmoxSQL',
};

const SHORTCUT_SECTIONS = [
    {
        category: 'General',
        items: [
            { keys: 'Ctrl + Shift + P', description: 'Command Palette' },
            { keys: 'Ctrl + ,', description: 'Open Settings' },
            { keys: 'Ctrl + S', description: 'Save File' },
            { keys: 'Ctrl + Shift + S', description: 'Save As…' },
            { keys: 'Ctrl + N', description: 'New SQL File' },
            { keys: 'Ctrl + Shift + N', description: 'New Notebook' },
            { keys: 'Ctrl + W', description: 'Close Current Tab' },
            { keys: 'Ctrl + Shift + /', description: 'Keyboard Shortcuts' },
        ]
    },
    {
        category: 'Query Execution',
        items: [
            { keys: 'Ctrl + Enter', description: 'Run Query / Run Cell' },
            { keys: 'F5', description: 'Run Query (alias)' },
            { keys: 'Ctrl + Shift + A', description: 'Analyze Query Plan (EXPLAIN)' },
            { keys: 'Ctrl + Shift + Enter', description: 'Run All Cells (Notebooks)' },
        ]
    },
    {
        category: 'Navigation',
        items: [
            { keys: 'Ctrl + Tab', description: 'Next Tab' },
            { keys: 'Ctrl + Shift + Tab', description: 'Previous Tab' },
            { keys: 'Ctrl + B', description: 'Toggle Sidebar' },
            { keys: 'Ctrl + L', description: 'Toggle AI Assistant' },
            { keys: 'Ctrl + Shift + E', description: 'Focus File Explorer' },
            { keys: 'Ctrl + Shift + D', description: 'Focus Database Explorer' },
        ]
    },
    {
        category: 'Editor',
        items: [
            { keys: 'Ctrl + /', description: 'Toggle Line Comment' },
            { keys: 'Ctrl + D', description: 'Duplicate Selection / Line' },
            { keys: 'Ctrl + Shift + K', description: 'Delete Line' },
            { keys: 'Ctrl + F', description: 'Find in Editor' },
            { keys: 'Ctrl + H', description: 'Find and Replace' },
            { keys: 'Ctrl + K', description: 'Format SQL (Prettify)' },
            { keys: 'Ctrl + Shift + F', description: 'Format SQL (Alternative)' },
            { keys: 'Ctrl + Z', description: 'Undo' },
            { keys: 'Ctrl + Shift + Z', description: 'Redo' },
            { keys: 'Ctrl + A', description: 'Select All' },
        ]
    },
    {
        category: 'View',
        items: [
            { keys: 'Ctrl + =', description: 'Zoom In' },
            { keys: 'Ctrl + -', description: 'Zoom Out' },
            { keys: 'Ctrl + 0', description: 'Reset Zoom' },
            { keys: 'Escape', description: 'Close Modals / Exit Full View' },
        ]
    },
];

// ─── Reusable Toggle Component ───
const Toggle = ({ on, onChange }) => (
    <div className={`stg-toggle${on ? ' stg-toggle--on' : ''}`} onClick={onChange}>
        <div className="stg-toggle-knob" />
    </div>
);

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange, currentAccent, onAccentChange, currentLayout, onLayoutChange, editorSettings = {}, onEditorSettingsChange, initialTab, onTabReset, uiZoomLevel = 1.0, onUiZoomChange }) => {
    const [activeTab, setActiveTab] = useState('appearance');
    const [settingsSearch, setSettingsSearch] = useState('');
    const contentRef = useRef(null);
    const toast = useToast();
    const dialog = useDialog();

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
    const [downloadProgress, setDownloadProgress] = useState(null);

    // DuckDB Version
    const [duckdbVersion, setDuckdbVersion] = useState('...');

    // Function Catalog State
    const [catalogStats, setCatalogStats] = useState({ total: 0, documented: 0, cacheExists: false, undocumented: [] });
    const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
    const [showUndocumented, setShowUndocumented] = useState(false);

    // Formatter Config State
    const [formatterConfig, setFormatterConfig] = useState(() => {
        try {
            const saved = localStorage.getItem('amoxsql-formatter-config');
            return saved ? JSON.parse(saved) : { keywordCase: 'upper', tabWidth: 4, linesBetweenQueries: 2, indentStyle: 'standard' };
        } catch { return { keywordCase: 'upper', tabWidth: 4, linesBetweenQueries: 2, indentStyle: 'standard' }; }
    });
    const [formatterSaved, setFormatterSaved] = useState(false);

    const saveFormatterConfig = () => {
        localStorage.setItem('amoxsql-formatter-config', JSON.stringify(formatterConfig));
        setFormatterSaved(true);
        setTimeout(() => setFormatterSaved(false), 2000);
    };

    // Cloud Storage State
    const [s3Config, setS3Config] = useState({ accessKeyId: '', secretKey: '', region: '', endpoint: '', defaultBucket: '' });
    const [gcsConfig, setGcsConfig] = useState({ accessKeyId: '', secretKey: '', defaultBucket: '' });
    const [isTestingCloud, setIsTestingCloud] = useState(false);
    const [cloudTestResult, setCloudTestResult] = useState(null);

    const openExternalLink = (e, url) => {
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    // Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    // Scroll reset on tab change
    useEffect(() => {
        if (contentRef.current) contentRef.current.scrollTop = 0;
    }, [activeTab]);

    // Respond to initialTab prop (e.g. from Ctrl+Shift+/)
    useEffect(() => {
        if (isOpen && initialTab) {
            setActiveTab(initialTab);
            onTabReset?.();
        }
    }, [isOpen, initialTab]);

    useEffect(() => {
        if (isOpen) {
            fetch('http://localhost:3001/api/settings/config')
                .then(res => res.json())
                .then(data => {
                    setGeminiApiKey(data.geminiApiKey || '');
                    setProvider(data.provider || 'ollama');
                    setDefaultModel(data.defaultModel || 'qwen3:1.7b');
                    if (data.usage) setGeminiUsage(data.usage);
                    if (data.s3Config) setS3Config(data.s3Config);
                    if (data.gcsConfig) setGcsConfig(data.gcsConfig);
                    if (data.provider !== 'gemini') fetchInstalledModels();
                })
                .catch(err => console.error("Failed to load config", err));

            fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: 'SELECT version() as version' })
            })
                .then(res => res.json())
                .then(data => {
                    if (data?.data?.[0]?.version) setDuckdbVersion(data.data[0].version);
                })
                .catch(() => setDuckdbVersion('N/A'));

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
            window.dispatchEvent(new Event('amox_catalog_refreshed'));
        } catch (err) { console.error(err); }
        finally { setIsRefreshingCatalog(false); }
    };

    useEffect(() => {
        if (isOpen && provider === 'ollama' && !isDownloading) fetchInstalledModels();
    }, [provider, isOpen, isDownloading]);

    const fetchInstalledModels = async () => {
        setIsLoadingModels(true);
        try {
            const res = await fetch('http://localhost:3001/api/settings/ollama/models');
            const data = await res.json();
            if (data.models) setInstalledModels(data.models);
        } catch (err) { console.error(err); }
        finally { setIsLoadingModels(false); }
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
            window.dispatchEvent(new Event('amox_settings_updated'));
            setSaveMessage({ type: 'success', text: 'Settings saved successfully' });
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error("Failed to save config", err);
            setSaveMessage({ type: 'error', text: 'Failed to save settings' });
        } finally { setIsSaving(false); }
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
                                setDownloadProgress({ status: data.status, percent: Math.round((data.completed / data.total) * 100) });
                            } else if (data.error) {
                                throw new Error(data.error);
                            } else {
                                setDownloadProgress(prev => ({ status: data.status, percent: prev?.percent || 0 }));
                            }
                        } catch (e) { /* ignore parse err */ }
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
            setCloudTestResult(data.success
                ? { type: 'success', text: data.message }
                : { type: 'error', text: data.error || data.message || 'Connection failed' });
        } catch (err) {
            setCloudTestResult({ type: 'error', text: err.message });
        } finally {
            setIsTestingCloud(false);
            setTimeout(() => setCloudTestResult(null), 5000);
        }
    };

    if (!isOpen) return null;

    const coveragePercent = catalogStats.total > 0 ? (catalogStats.documented / catalogStats.total) * 100 : 0;

    return (
        <div className="stg-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="stg-modal">
                {/* ─── Sidebar ─── */}
                <div className="stg-sidebar">
                    <div className="stg-sidebar-title">Settings</div>
                    <input
                        type="search"
                        placeholder="Search settings..."
                        value={settingsSearch}
                        onChange={e => setSettingsSearch(e.target.value)}
                        className="stg-search-input"
                        aria-label="Search settings"
                    />
                    {[
                        { id: 'appearance', icon: <LuPalette size={16} />, label: 'Appearance' },
                        { id: 'editor', icon: <LuCode size={16} />, label: 'Editor' },
                        { id: 'formatter', icon: <LuWrapText size={16} />, label: 'Formatter' },
                        { id: 'behavior', icon: <LuSettings size={16} />, label: 'Behavior' },
                        { id: 'ai', icon: <LuCpu size={16} />, label: 'AI Assistant' },
                        { id: 'memories', icon: <LuBrain size={16} />, label: 'AI Memories' },
                        { id: 'cloud', icon: <LuCloud size={16} />, label: 'Cloud Storage' },
                        { id: 'shortcuts', icon: <LuKeyboard size={16} />, label: 'Shortcuts' },
                        { id: 'about', icon: <LuInfo size={16} />, label: 'About AmoxSQL' },
                    ].filter(tab => !settingsSearch || tab.label.toLowerCase().includes(settingsSearch.toLowerCase())).map(tab => (
                        <div
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`stg-tab${activeTab === tab.id ? ' stg-tab--active' : ''}`}
                        >
                            {tab.icon} {tab.label}
                        </div>
                    ))}
                </div>

                {/* ─── Content ─── */}
                <div className="stg-content">
                    <div className="stg-content-header">
                        <h2 className="stg-content-title">{TAB_TITLES[activeTab]}</h2>
                        <button onClick={onClose} className="stg-close-btn"><LuX size={18} /></button>
                    </div>

                    <div className="stg-content-body" ref={contentRef}>

                        {/* ═══ APPEARANCE ═══ */}
                        {activeTab === 'appearance' && (
                            <div className="stg-section">
                                {/* Theme */}
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb12">Color Theme</h3>
                                    <div className="stg-theme-grid">
                                        {THEMES.map(t => (
                                            <div
                                                key={t.id}
                                                onClick={() => onThemeChange(t.id)}
                                                className={`stg-theme-card${currentTheme === t.id ? ' stg-theme-card--active' : ''}`}
                                                style={{ backgroundColor: t.editor }}
                                            >
                                                <div className="stg-theme-card-label" style={{ color: t.text }}>
                                                    {t.icon} {t.label}
                                                </div>
                                                <div className="stg-theme-preview">
                                                    <div className="stg-theme-preview-sidebar" style={{ background: t.sidebar, borderRight: `1px solid ${t.id === 'light' ? '#dee2e6' : '#333'}` }} />
                                                    <div className="stg-theme-preview-editor" style={{ background: t.editor, color: t.text }}>
                                                        SELECT *
                                                    </div>
                                                </div>
                                                <div className="stg-theme-card-desc" style={{ color: t.text }}>{t.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Accent */}
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb12">Accent Color</h3>
                                    <p className="stg-swatch-label">Vibrant</p>
                                    <div className="stg-swatch-group stg-mb14">
                                        {VIBRANT_ACCENTS.map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => onAccentChange?.(s.id)}
                                                className={`stg-swatch${currentAccent === s.id ? ' stg-swatch--active' : ''}`}
                                                style={{ background: s.color }}
                                                title={s.label}
                                            >
                                                {currentAccent === s.id && <span className="stg-swatch-check" style={{ color: '#000' }}>✓</span>}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="stg-swatch-label">Sober</p>
                                    <div className="stg-swatch-group">
                                        {SOBER_ACCENTS.map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => onAccentChange?.(s.id)}
                                                className={`stg-swatch${currentAccent === s.id ? ' stg-swatch--active' : ''}`}
                                                style={{ background: s.color }}
                                                title={s.label}
                                            >
                                                {currentAccent === s.id && <span className="stg-swatch-check" style={{ color: s.checkColor }}>✓</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Layout */}
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb4">Editor Layout</h3>
                                    <p className="stg-row-desc stg-row-desc--mb14">
                                        Choose how the SQL editor and results panel are arranged. Vertical is ideal for ultrawide monitors.
                                    </p>
                                    <div className="stg-layout-grid">
                                        <div
                                            onClick={() => onLayoutChange?.('horizontal')}
                                            className={`stg-layout-card${currentLayout !== 'vertical' ? ' stg-layout-card--active' : ''}`}
                                        >
                                            <div className="stg-layout-label">
                                                <div className="stg-radio">{currentLayout !== 'vertical' && <div className="stg-radio-dot" />}</div>
                                                <LuRows3 size={18} /> Horizontal
                                            </div>
                                            <div className="stg-layout-preview stg-layout-preview--h">
                                                <div className="stg-layout-preview-pane stg-layout-preview-pane--editor">EDITOR</div>
                                                <div className="stg-layout-preview-pane stg-layout-preview-pane--results">RESULTS</div>
                                            </div>
                                        </div>
                                        <div
                                            onClick={() => onLayoutChange?.('vertical')}
                                            className={`stg-layout-card${currentLayout === 'vertical' ? ' stg-layout-card--active' : ''}`}
                                        >
                                            <div className="stg-layout-label">
                                                <div className="stg-radio">{currentLayout === 'vertical' && <div className="stg-radio-dot" />}</div>
                                                <LuColumns3 size={18} /> Vertical
                                            </div>
                                            <div className="stg-layout-preview stg-layout-preview--v">
                                                <div className="stg-layout-preview-pane stg-layout-preview-pane--editor">EDITOR</div>
                                                <div className="stg-layout-preview-pane stg-layout-preview-pane--results">RESULTS</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Interface Scale */}
                                <hr className="stg-divider" />
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb4">Interface Scale</h3>
                                    <p className="stg-row-desc stg-row-desc--mb14">
                                        Adjust the size of all UI elements (menus, sidebar, tabs, panels). Similar to browser zoom.
                                    </p>
                                    <div className="stg-group">
                                        <div className="stg-row">
                                            <span className="stg-row-label">UI Zoom Level</span>
                                            <div className="stg-flex">
                                                <input type="range" className="stg-range" min="0.7" max="1.4" step="0.05"
                                                    value={uiZoomLevel}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        onUiZoomChange?.(val);
                                                        // Trigger Electron zoom if available
                                                        if (window.electronAPI?.zoom?.set) {
                                                            window.electronAPI.zoom.set(val);
                                                        }
                                                    }}
                                                />
                                                <span className="stg-range-value">{Math.round(uiZoomLevel * 100)}%</span>
                                            </div>
                                        </div>
                                        <div className="stg-row">
                                            <span className="stg-row-desc">Use <kbd className="stg-kbd">Ctrl</kbd> + <kbd className="stg-kbd">=</kbd> / <kbd className="stg-kbd">-</kbd> for quick zoom. <kbd className="stg-kbd">Ctrl</kbd> + <kbd className="stg-kbd">0</kbd> to reset.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ EDITOR ═══ */}
                        {activeTab === 'editor' && (
                            <div className="stg-section">
                                {/* Typography */}
                                <div>
                                    <h3 className="stg-section-title">Typography</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <span className="stg-row-label">Font Family</span>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={editorSettings.fontFamily || "'JetBrains Mono', 'Consolas', monospace"}
                                                onChange={(e) => onEditorSettingsChange?.({ fontFamily: e.target.value })}
                                            >
                                                <option value="'JetBrains Mono', 'Consolas', monospace">JetBrains Mono</option>
                                                <option value="'Fira Code', 'Consolas', monospace">Fira Code</option>
                                                <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
                                                <option value="'Consolas', monospace">Consolas</option>
                                                <option value="'Monaco', 'Courier New', monospace">Monaco</option>
                                                <option value="'Source Code Pro', monospace">Source Code Pro</option>
                                            </select>
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Code Font Size</span>
                                                <p className="stg-row-desc">Controls text size inside the SQL editor only</p>
                                            </div>
                                            <div className="stg-flex">
                                                <input type="range" className="stg-range" min="10" max="24"
                                                    value={editorSettings.fontSize || 14}
                                                    onChange={(e) => onEditorSettingsChange?.({ fontSize: parseInt(e.target.value) })}
                                                />
                                                <span className="stg-range-value">{editorSettings.fontSize || 14}px</span>
                                            </div>
                                        </div>
                                        <div className="stg-row">
                                            <span className="stg-row-label">Tab Size</span>
                                            <div className="stg-flex--gap-sm">
                                                {[2, 4].map(size => (
                                                    <button
                                                        key={size}
                                                        onClick={() => onEditorSettingsChange?.({ tabSize: size })}
                                                        className={`stg-tab-btn${(editorSettings.tabSize || 4) === size ? ' stg-tab-btn--active' : ''}`}
                                                    >{size} spaces</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                {/* Display */}
                                <div>
                                    <h3 className="stg-section-title">Display</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Minimap</span>
                                                <p className="stg-row-desc">Show a preview of the code on the right edge</p>
                                            </div>
                                            <Toggle on={!!editorSettings.minimap} onChange={() => onEditorSettingsChange?.({ minimap: !editorSettings.minimap })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Word Wrap</span>
                                                <p className="stg-row-desc">Wrap lines that exceed the editor width</p>
                                            </div>
                                            <Toggle on={editorSettings.wordWrap === 'on'} onChange={() => onEditorSettingsChange?.({ wordWrap: editorSettings.wordWrap === 'on' ? 'off' : 'on' })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Line Numbers</span>
                                                <p className="stg-row-desc">Show line numbers in the gutter</p>
                                            </div>
                                            <Toggle on={(editorSettings.lineNumbers ?? 'on') === 'on'} onChange={() => onEditorSettingsChange?.({ lineNumbers: (editorSettings.lineNumbers ?? 'on') === 'on' ? 'off' : 'on' })} />
                                        </div>
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                {/* Advanced Editor Options */}
                                <div>
                                    <h3 className="stg-section-title">Advanced Code Intelligence</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Bracket Pair Colorization</span>
                                                <p className="stg-row-desc">Color matches brackets to make them easier to identify</p>
                                            </div>
                                            <Toggle on={(editorSettings.bracketPairColorization ?? true)} onChange={() => onEditorSettingsChange?.({ bracketPairColorization: !(editorSettings.bracketPairColorization ?? true) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Render Whitespace</span>
                                                <p className="stg-row-desc">Show dots for spaces and arrows for tabs</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w120"
                                                value={editorSettings.renderWhitespace || 'none'}
                                                onChange={(e) => onEditorSettingsChange?.({ renderWhitespace: e.target.value })}
                                            >
                                                <option value="none">None</option>
                                                <option value="boundary">Boundary</option>
                                                <option value="selection">Selection</option>
                                                <option value="all">All</option>
                                            </select>
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Smooth Scrolling</span>
                                                <p className="stg-row-desc">Enable animated smooth scrolling in the editor</p>
                                            </div>
                                            <Toggle on={(editorSettings.smoothScrolling ?? false)} onChange={() => onEditorSettingsChange?.({ smoothScrolling: !(editorSettings.smoothScrolling ?? false) })} />
                                        </div>
                                        <div className="stg-row">
                                            <span className="stg-row-label">Cursor Style</span>
                                            <select
                                                className="stg-select stg-select--w120"
                                                value={editorSettings.cursorStyle || 'line'}
                                                onChange={(e) => onEditorSettingsChange?.({ cursorStyle: e.target.value })}
                                            >
                                                <option value="line">Line</option>
                                                <option value="block">Block</option>
                                                <option value="underline">Underline</option>
                                                <option value="line-thin">Line Thin</option>
                                                <option value="block-outline">Block Outline</option>
                                                <option value="underline-thin">Underline Thin</option>
                                            </select>
                                        </div>
                                        <div className="stg-row">
                                            <span className="stg-row-label">Cursor Blinking</span>
                                            <select
                                                className="stg-select stg-select--w120"
                                                value={editorSettings.cursorBlinking || 'blink'}
                                                onChange={(e) => onEditorSettingsChange?.({ cursorBlinking: e.target.value })}
                                            >
                                                <option value="blink">Blink</option>
                                                <option value="smooth">Smooth</option>
                                                <option value="phase">Phase</option>
                                                <option value="expand">Expand</option>
                                                <option value="solid">Solid (No blink)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                {/* Results Panel */}
                                <div>
                                    <h3 className="stg-section-title">Results Panel</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <span className="stg-row-label">Results Font Size</span>
                                            <div className="stg-flex">
                                                <input type="range" className="stg-range" min="11" max="16"
                                                    value={editorSettings.resultsFontSize || 13}
                                                    onChange={(e) => onEditorSettingsChange?.({ resultsFontSize: parseInt(e.target.value) })}
                                                />
                                                <span className="stg-range-value">{editorSettings.resultsFontSize || 13}px</span>
                                            </div>
                                        </div>
                                        <div className="stg-row">
                                            <span className="stg-row-label">Default Results View</span>
                                            <select
                                                className="stg-select stg-select--w120"
                                                value={editorSettings.defaultViewMode || 'table'}
                                                onChange={(e) => onEditorSettingsChange?.({ defaultViewMode: e.target.value })}
                                            >
                                                <option value="table">Table</option>
                                                <option value="chart">Chart</option>
                                                <option value="profile">Profile</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                {/* Editor Intelligence */}
                                <div>
                                    <h3 className="stg-section-title">Editor Intelligence</h3>
                                    <div className="stg-card stg-card--mt14">
                                        <div className="stg-card-header">
                                            <h4 className="stg-card-title">DuckDB Function Catalog</h4>
                                            <button onClick={handleRefreshCatalog} disabled={isRefreshingCatalog} className="stg-btn">
                                                {isRefreshingCatalog && <LuLoader size={12} className="stg-spin" />}
                                                {catalogStats.cacheExists ? 'Refresh Cache' : 'Generate Cache'}
                                            </button>
                                        </div>
                                        <p className="stg-card-desc">
                                            The editor provides rich autocompletion and hover documentation for DuckDB functions.
                                            We merge curated rich docs with live database introspection.
                                        </p>
                                        <div className="stg-mb6">
                                            <div className="stg-row stg-row--mb6">
                                                <span className="stg-stat-label">Rich Documentation Coverage</span>
                                                <span className="stg-stat-label">{catalogStats.documented} / {catalogStats.total > 0 ? catalogStats.total : '?'}</span>
                                            </div>
                                            <div className="stg-progress">
                                                <div className="stg-progress-fill" style={{ width: `${coveragePercent}%` }} />
                                            </div>
                                        </div>

                                        {catalogStats.undocumented?.length > 0 && (
                                            <div className="stg-mt10">
                                                <button
                                                    onClick={() => setShowUndocumented(!showUndocumented)}
                                                    className="stg-undoc-toggle"
                                                >
                                                    {showUndocumented ? 'Hide' : 'Show'} {catalogStats.undocumented.length} functions with basic auto-generated docs
                                                </button>
                                                {showUndocumented && (
                                                    <div className="stg-undoc-list">
                                                        <div className="stg-undoc-grid">
                                                            {catalogStats.undocumented.map((fn, i) => (
                                                                <div key={i} title={fn.description} className="stg-undoc-item">
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

                        {/* ═══ FORMATTER ═══ */}
                        {activeTab === 'formatter' && (
                            <div className="stg-section">
                                <div>
                                    <h3 className="stg-section-title">SQL Formatter</h3>
                                    <p className="stg-row-desc stg-row-desc--mb14">
                                        Configure how SQL is formatted when using Ctrl+K / Shift+Alt+F.
                                        Changes apply immediately to future format operations.
                                    </p>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Keyword Case</span>
                                                <p className="stg-row-desc">Controls capitalization of SQL keywords (SELECT, FROM, WHERE…)</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={formatterConfig.keywordCase || 'upper'}
                                                onChange={e => setFormatterConfig(c => ({ ...c, keywordCase: e.target.value }))}
                                            >
                                                <option value="upper">UPPER (SELECT, FROM)</option>
                                                <option value="lower">lower (select, from)</option>
                                                <option value="preserve">Preserve (as-is)</option>
                                            </select>
                                        </div>

                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Tab Width</span>
                                                <p className="stg-row-desc">Number of spaces per indentation level</p>
                                            </div>
                                            <input
                                                type="number"
                                                className="stg-select stg-select--w200"
                                                min={1} max={8}
                                                value={formatterConfig.tabWidth ?? 4}
                                                onChange={e => setFormatterConfig(c => ({ ...c, tabWidth: Math.max(1, Math.min(8, parseInt(e.target.value) || 4)) }))}
                                            />
                                        </div>

                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Lines Between Queries</span>
                                                <p className="stg-row-desc">Blank lines inserted between separate SQL statements</p>
                                            </div>
                                            <input
                                                type="number"
                                                className="stg-select stg-select--w200"
                                                min={0} max={3}
                                                value={formatterConfig.linesBetweenQueries ?? 2}
                                                onChange={e => setFormatterConfig(c => ({ ...c, linesBetweenQueries: Math.max(0, Math.min(3, parseInt(e.target.value) || 2)) }))}
                                            />
                                        </div>

                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Indent Style</span>
                                                <p className="stg-row-desc">Controls how indentation is applied to clauses</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={formatterConfig.indentStyle || 'standard'}
                                                onChange={e => setFormatterConfig(c => ({ ...c, indentStyle: e.target.value }))}
                                            >
                                                <option value="standard">Standard</option>
                                                <option value="tabsLeftAlign">Tabs Left Align</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        className="stg-save-btn"
                                        onClick={saveFormatterConfig}
                                    >
                                        {formatterSaved ? <><LuCheck size={14} /> Saved!</> : 'Apply & Save'}
                                    </button>
                                    {formatterSaved && (
                                        <span style={{ fontSize: '12px', color: 'var(--feedback-success, #4CAF50)' }}>
                                            Formatter config saved to localStorage.
                                        </span>
                                    )}
                                </div>

                                <hr className="stg-divider" />

                                <div>
                                    <h3 className="stg-section-title">Keyboard Shortcuts</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <span className="stg-row-label">Format SQL</span>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <kbd className="stg-kbd">Ctrl+K</kbd>
                                                <kbd className="stg-kbd">Ctrl+Shift+F</kbd>
                                                <kbd className="stg-kbd">Shift+Alt+F</kbd>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ BEHAVIOR ═══ */}
                        {activeTab === 'behavior' && (
                            <div className="stg-section">
                                {/* Workflow */}
                                <div>
                                    <h3 className="stg-section-title">Workflow</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Auto Save</span>
                                                <p className="stg-row-desc">Automatically save dirty files after a delay</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={editorSettings.autoSaveInterval || 0}
                                                onChange={(e) => onEditorSettingsChange?.({ autoSaveInterval: parseInt(e.target.value) })}
                                            >
                                                <option value={0}>Off</option>
                                                <option value={5000}>After 5 seconds</option>
                                                <option value={15000}>After 15 seconds</option>
                                                <option value={30000}>After 30 seconds</option>
                                                <option value={60000}>After 1 minute</option>
                                            </select>
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Format on Save</span>
                                                <p className="stg-row-desc">Automatically format SQL when manually saving</p>
                                            </div>
                                            <Toggle on={(editorSettings.formatOnSave ?? false)} onChange={() => onEditorSettingsChange?.({ formatOnSave: !(editorSettings.formatOnSave ?? false) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Format on Paste</span>
                                                <p className="stg-row-desc">Format SQL automatically when pasting content</p>
                                            </div>
                                            <Toggle on={(editorSettings.formatOnPaste ?? false)} onChange={() => onEditorSettingsChange?.({ formatOnPaste: !(editorSettings.formatOnPaste ?? false) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Show Welcome Screen</span>
                                                <p className="stg-row-desc">Show the welcome screen when AmoxSQL starts</p>
                                            </div>
                                            <Toggle on={(editorSettings.showWelcomeOnStart ?? true)} onChange={() => onEditorSettingsChange?.({ showWelcomeOnStart: !(editorSettings.showWelcomeOnStart ?? true) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Confirm Default Operations</span>
                                                <p className="stg-row-desc">Ask for confirmation before dropping tables</p>
                                            </div>
                                            <Toggle on={(editorSettings.confirmBeforeDrop ?? true)} onChange={() => onEditorSettingsChange?.({ confirmBeforeDrop: !(editorSettings.confirmBeforeDrop ?? true) })} />
                                        </div>
                                    </div>
                                </div>
                                <hr className="stg-divider" />
                                {/* Queries */}
                                <div>
                                    <h3 className="stg-section-title">Query Execution</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Default Results Limit</span>
                                                <p className="stg-row-desc">Maximum number of rows to return on quick SELECT operations</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w120"
                                                value={editorSettings.queryResultLimit || 100}
                                                onChange={(e) => onEditorSettingsChange?.({ queryResultLimit: parseInt(e.target.value) })}
                                            >
                                                <option value={100}>100 rows</option>
                                                <option value={500}>500 rows</option>
                                                <option value={1000}>1000 rows</option>
                                                <option value={5000}>5000 rows</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ AI ═══ */}
                        {activeTab === 'ai' && (
                            <div className="stg-section">
                                {/* Provider */}
                                <div className="stg-row stg-row--top">
                                    <div className="stg-flex-1">
                                        <h3 className="stg-section-heading stg-section-heading--mb8">AI Engine Provider</h3>
                                        <select
                                            className="stg-select stg-select--full"
                                            value={provider}
                                            onChange={(e) => setProvider(e.target.value)}
                                        >
                                            <option value="ollama">Ollama (Local Engine)</option>
                                            <option value="gemini">Google Gemini (Cloud)</option>
                                        </select>
                                        <p className="stg-row-desc stg-mt8">
                                            Choose between running fully private local models or using Google's Cloud API.
                                        </p>
                                    </div>
                                    <div className="stg-ai-actions">
                                        <button onClick={handleSaveConfig} disabled={isSaving} className="stg-btn stg-btn--primary">
                                            {isSaving ? 'Saving...' : 'Save AI Settings'}
                                        </button>
                                        {saveMessage && (
                                            <span className={`stg-save-msg stg-save-msg--${saveMessage.type}`}>
                                                {saveMessage.type === 'success' ? '✓' : '×'} {saveMessage.text}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                {/* Gemini */}
                                {provider === 'gemini' && (
                                    <>
                                        <div className="stg-card stg-card--transparent">
                                            <h4 className="stg-card-title stg-card-title--mb10">Authentication</h4>
                                            <div className="stg-flex--gap8">
                                                <input
                                                    type={geminiApiKey ? "password" : "text"}
                                                    className={`stg-input${geminiApiKey ? ' stg-input--mono' : ''}`}
                                                    value={geminiApiKey}
                                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                                    placeholder="Enter your Gemini API Key"
                                                />
                                                {geminiApiKey && (
                                                    <button onClick={() => setGeminiApiKey('')} className="stg-btn stg-btn--danger-text" title="Clear API Key">
                                                        <LuX size={14} />
                                                    </button>
                                                )}
                                            </div>
                                            <p className="stg-card-desc stg-card-desc--mt8">
                                                Your key is stored securely in your computer's home directory (~/.amoxsql/).
                                            </p>
                                        </div>

                                        <div className="stg-card">
                                            <h4 className="stg-card-title stg-card-title--mb12">Daily Free Tier Usage (2026 Limits)</h4>
                                            <div className="stg-flex-col">
                                                {[
                                                    { label: '2.5 Flash-Lite', value: geminiUsage.flashLite, max: 1000, variant: '--warning' },
                                                    { label: '2.5 Flash', value: geminiUsage.flash, max: 250, variant: '--success' },
                                                    { label: '2.5 Pro', value: geminiUsage.pro, max: 100, variant: '' },
                                                ].map(bar => (
                                                    <div key={bar.label}>
                                                        <div className="stg-row stg-row--mb4">
                                                            <span className="stg-stat-label--bold">{bar.label}</span>
                                                            <span className="stg-stat-label--bold">{bar.value} / {bar.max}</span>
                                                        </div>
                                                        <div className="stg-progress">
                                                            <div className={`stg-progress-fill${bar.variant ? ` stg-progress-fill${bar.variant}` : ''}`} style={{ width: `${Math.min((bar.value / bar.max) * 100, 100)}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                                <div className="stg-row stg-row--separator">
                                                    <span className="stg-stat-label--muted">Total Tokens Consumed</span>
                                                    <span className="stg-stat-label--bold">
                                                        {geminiUsage.tokens.toLocaleString()} <span className="stg-stat-token">/ 4,000,000</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Ollama */}
                                {provider === 'ollama' && (
                                    <>
                                        <div>
                                            <div className="stg-row stg-row--mb8">
                                                <h3 className="stg-section-heading">Installed Local Models</h3>
                                                {isLoadingModels && <LuLoader size={14} className="stg-spin--muted" />}
                                            </div>
                                            <div className="stg-card stg-card--scroll">
                                                {installedModels.length === 0 && !isLoadingModels ? (
                                                    <div className="stg-empty-text">
                                                        No models installed. Install at least one model below.
                                                    </div>
                                                ) : (
                                                    <div className="stg-model-chips">
                                                        {installedModels.map((m, i) => (
                                                            <div key={i} className="stg-model-chip">
                                                                <LuCpu size={12} className="stg-icon-accent" />
                                                                {m.name}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="stg-card stg-card--transparent">
                                            <h4 className="stg-card-title stg-card-title--mb12">Install New Model</h4>

                                            {downloadProgress && (
                                                <div className="stg-card stg-card--mb14">
                                                    <div className="stg-row stg-row--mb6">
                                                        <span className={`stg-stat-label${downloadProgress.error ? ' stg-save-msg--error' : ''}`}>{downloadProgress.status}</span>
                                                        <span className="stg-stat-label">{downloadProgress.percent}%</span>
                                                    </div>
                                                    <div className="stg-progress">
                                                        <div className={`stg-progress-fill${downloadProgress.error ? ' stg-progress-fill--error' : ''}`} style={{ width: `${downloadProgress.percent}%` }} />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="stg-model-grid stg-model-grid--mb14">
                                                {RECOMMENDED_MODELS.map(m => {
                                                    const isInstalled = installedModels.some(im => im.name.startsWith(m.id));
                                                    return (
                                                        <div key={m.id} className="stg-model-card">
                                                            <div className="stg-model-card-name">{m.label}</div>
                                                            <div className="stg-model-card-desc">{m.desc}</div>
                                                            <button
                                                                onClick={() => handleDownloadModel(m.id)}
                                                                disabled={isDownloading || isInstalled}
                                                                className={`stg-btn stg-btn--full${isInstalled ? ' stg-btn--installed' : ''}`}
                                                            >
                                                                {isInstalled ? <><LuCheck size={12} /> Installed</> : <><LuDownload size={12} /> Install</>}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="stg-flex--gap8">
                                                <input
                                                    type="text"
                                                    className="stg-input"
                                                    value={customModelInput}
                                                    onChange={(e) => setCustomModelInput(e.target.value)}
                                                    placeholder="Or pull any custom Ollama model (e.g., mistral:latest)"
                                                />
                                                <button
                                                    onClick={() => handleDownloadModel(customModelInput)}
                                                    disabled={isDownloading || !customModelInput.trim()}
                                                    className="stg-btn"
                                                >
                                                    <LuDownload size={14} /> Pull
                                                </button>
                                            </div>
                                            <p className="stg-card-desc stg-card-desc--mt10">
                                                Don't have Ollama installed?{' '}
                                                <a href="https://ollama.com/download" onClick={(e) => openExternalLink(e, 'https://ollama.com/download')} className="stg-link">
                                                    Download it from ollama.com
                                                </a>.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ═══ CLOUD ═══ */}
                        {activeTab === 'cloud' && (
                            <div className="stg-section">
                                <div className="stg-row stg-row--top">
                                    <div>
                                        <h3 className="stg-section-heading stg-section-heading--mb8">S3 & GCS Export Configuration</h3>
                                        <p className="stg-row-desc stg-row-desc--maxw480">
                                            Connect your cloud storage buckets to export query results directly to S3 or Google Cloud Storage using DuckDB's native httpfs extension.
                                        </p>
                                    </div>
                                    <button onClick={handleSaveConfig} disabled={isSaving} className="stg-btn stg-btn--primary">
                                        {isSaving ? 'Saving...' : 'Save Cloud Settings'}
                                    </button>
                                </div>

                                {saveMessage && (
                                    <div className={`stg-alert stg-alert--${saveMessage.type}`}>
                                        {saveMessage.text}
                                    </div>
                                )}

                                <div className="stg-cloud-grid">
                                    {/* S3 */}
                                    <div className="stg-card">
                                        <div className="stg-card-header">
                                            <h4 className="stg-card-title"><LuCloud size={14} /> Amazon S3</h4>
                                            <button onClick={() => handleTestCloudConnection('s3')} disabled={isTestingCloud} className="stg-btn">
                                                {isTestingCloud ? 'Testing...' : 'Test Connection'}
                                            </button>
                                        </div>
                                        <div className="stg-flex-col--gap10">
                                            {[
                                                { label: 'Access Key ID', key: 'accessKeyId', placeholder: 'AKIAIOSFODNN7EXAMPLE' },
                                                { label: 'Secret Access Key', key: 'secretKey', placeholder: 'wJalrXUtnFEMI/K7MDENG...', type: 'password', mono: true },
                                                { label: 'Region', key: 'region', placeholder: 'us-east-1' },
                                                { label: 'Endpoint (Optional)', key: 'endpoint', placeholder: 's3.us-east-1.amazonaws.com' },
                                                { label: 'Default Bucket', key: 'defaultBucket', placeholder: 'my-bucket-name' },
                                            ].map(f => (
                                                <div key={f.key}>
                                                    <div className="stg-field-label">{f.label}</div>
                                                    <input
                                                        type={f.type || 'text'}
                                                        className={`stg-input${f.mono ? ' stg-input--mono' : ''}`}
                                                        value={s3Config[f.key]}
                                                        onChange={(e) => setS3Config({ ...s3Config, [f.key]: e.target.value })}
                                                        placeholder={f.placeholder}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* GCS */}
                                    <div className="stg-card">
                                        <div className="stg-card-header">
                                            <h4 className="stg-card-title"><LuCloud size={14} /> Google Cloud Storage</h4>
                                            <button onClick={() => handleTestCloudConnection('gcs')} disabled={isTestingCloud} className="stg-btn">
                                                {isTestingCloud ? 'Testing...' : 'Test HMAC'}
                                            </button>
                                        </div>
                                        <p className="stg-card-desc">
                                            DuckDB connects to GCS using HMAC keys via the S3-compatible API. Create an HMAC key in your Google Cloud Console.
                                        </p>
                                        <div className="stg-flex-col--gap10">
                                            {[
                                                { label: 'HMAC Access ID', key: 'accessKeyId', placeholder: 'GOOG1EQX...' },
                                                { label: 'HMAC Secret', key: 'secretKey', placeholder: '...', type: 'password', mono: true },
                                                { label: 'Default Bucket', key: 'defaultBucket', placeholder: 'gs://my-bucket' },
                                            ].map(f => (
                                                <div key={f.key}>
                                                    <div className="stg-field-label">{f.label}</div>
                                                    <input
                                                        type={f.type || 'text'}
                                                        className={`stg-input${f.mono ? ' stg-input--mono' : ''}`}
                                                        value={gcsConfig[f.key]}
                                                        onChange={(e) => setGcsConfig({ ...gcsConfig, [f.key]: e.target.value })}
                                                        placeholder={f.placeholder}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {cloudTestResult && (
                                    <div className={`stg-alert stg-alert--${cloudTestResult.type}`}>
                                        {cloudTestResult.type === 'success' ? <LuCheck size={14} /> : <LuX size={14} />}
                                        {cloudTestResult.text}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ MEMORIES ═══ */}
                        {activeTab === 'memories' && (
                            <div className="stg-section">
                                <p className="stg-row-desc stg-row-desc--mb14">
                                    Memories are facts and rules that AmoxSQL AI automatically extracts from your conversations to personalize future responses. You can edit or delete them here.
                                </p>
                                <MemoriesPanel />
                            </div>
                        )}

                        {/* ═══ KEYBOARD SHORTCUTS ═══ */}
                        {activeTab === 'shortcuts' && (
                            <div className="stg-section">
                                <p className="stg-row-desc stg-row-desc--mb14">
                                    Complete reference of all keyboard shortcuts available in AmoxSQL. On macOS, use <kbd className="stg-kbd">⌘</kbd> instead of <kbd className="stg-kbd">Ctrl</kbd>.
                                </p>

                                {SHORTCUT_SECTIONS.map((group, gi) => (
                                    <div key={group.category}>
                                        {gi > 0 && <hr className="stg-divider" />}
                                        <h3 className="stg-section-title">{group.category}</h3>
                                        <div className="stg-group stg-group--mt14">
                                            {group.items.map(item => (
                                                <div key={item.keys} className="stg-row stg-row--shortcut">
                                                    <span className="stg-row-label">{item.description}</span>
                                                    <div className="stg-shortcut-keys">
                                                        {item.keys.split(' + ').map((key, i) => (
                                                            <span key={i}>
                                                                {i > 0 && <span className="stg-shortcut-plus">+</span>}
                                                                <kbd className="stg-kbd">{key}</kbd>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ═══ ABOUT ═══ */}
                        {activeTab === 'about' && (
                            <div className="stg-section">
                                <div className="stg-about-header">
                                    <div className="stg-about-icon"><LuInfo size={32} /></div>
                                    <div>
                                        <h2 className="stg-about-name">AmoxSQL</h2>
                                        <p className="stg-about-version">Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?.?.?'}</p>
                                        <p className="stg-about-engine">DuckDB Engine: {duckdbVersion}</p>
                                    </div>
                                </div>

                                <div className="stg-card">
                                    <p className="stg-about-body">
                                        <strong>The Modern Codex for Local Data Analysis.</strong><br /><br />
                                        AmoxSQL is a professional, high-performance Local Data IDE built specifically for DuckDB.
                                        Designed for serious data analysts and engineers who need speed, privacy, and advanced tooling without the cloud overhead.
                                    </p>
                                </div>

                                {/* System Settings Actions */}
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb10">Configuration Management</h3>
                                    <div className="stg-group">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Export Settings</span>
                                                <p className="stg-row-desc">Save your current configuration to a JSON file</p>
                                            </div>
                                            <button className="stg-btn" onClick={() => {
                                                const settings = { editor: editorSettings, theme: currentTheme, accent: currentAccent, layout: currentLayout, zoom: uiZoomLevel };
                                                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'amoxsql-settings.json';
                                                a.click();
                                            }}>
                                                <LuDownload size={14} /> Export
                                            </button>
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Import Settings</span>
                                                <p className="stg-row-desc">Load a previously exported configuration file</p>
                                            </div>
                                            <button className="stg-btn" onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'application/json';
                                                input.onchange = (e) => {
                                                    const file = e.target.files[0];
                                                    const reader = new FileReader();
                                                    reader.onload = (re) => {
                                                        try {
                                                            const data = JSON.parse(re.target.result);
                                                            if (data.editor) onEditorSettingsChange?.(data.editor);
                                                            if (data.theme) onThemeChange?.(data.theme);
                                                            if (data.accent) onAccentChange?.(data.accent);
                                                            if (data.layout) onLayoutChange?.(data.layout);
                                                            if (data.zoom) onUiZoomChange?.(data.zoom);
                                                            toast.success('Settings imported successfully');
                                                        } catch {
                                                            toast.error('Invalid settings file');
                                                        }
                                                    };
                                                    reader.readAsText(file);
                                                };
                                                input.click();
                                            }}>
                                                <LuDownload size={14} style={{ transform: 'rotate(180deg)' }} /> Import
                                            </button>
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label stg-text-danger">Reset to Defaults</span>
                                                <p className="stg-row-desc">Restore all editor and appearance settings to factory defaults</p>
                                            </div>
                                            <button className="stg-btn stg-btn--danger-text" onClick={async () => {
                                                const ok = await dialog.confirmAsync({
                                                    title: 'Reset to defaults?',
                                                    message: 'All UI and editor settings will be restored to factory defaults. Your queries and databases will NOT be affected.',
                                                    confirmLabel: 'Reset',
                                                    destructive: true,
                                                });
                                                if (ok) {
                                                    onEditorSettingsChange?.({});
                                                    onThemeChange?.('dark');
                                                    onAccentChange?.('cyan');
                                                    onLayoutChange?.('horizontal');
                                                    onUiZoomChange?.(1.0);
                                                    toast.success('Settings restored to defaults');
                                                }
                                            }}>
                                                <LuTrash2 size={14} /> Reset
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <hr className="stg-divider" />

                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb10">Key Features</h3>
                                    <ul className="stg-about-features">
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

                                <div className="stg-sponsor-cta">
                                    <LuHeart size={20} className="stg-sponsor-icon" />
                                    <p className="stg-sponsor-text">
                                        <strong>Love AmoxSQL?</strong> Your support helps us keep building new features, improving performance, and making data analysis accessible to everyone.
                                    </p>
                                    <p className="stg-sponsor-subtitle">
                                        Every contribution — big or small — fuels the future of this project.
                                    </p>
                                    <a
                                        href="https://github.com/sponsors/dsandovalflavio"
                                        onClick={(e) => openExternalLink(e, 'https://github.com/sponsors/dsandovalflavio')}
                                        className="stg-sponsor-btn"
                                    >
                                        <LuHeart size={14} /> Become a Sponsor
                                    </a>
                                </div>

                                <div className="stg-about-footer">
                                    <p className="stg-about-footer-text">
                                        Created with love by <strong>@dsandovalflavio</strong>.<br />
                                        <span className="stg-about-footer-muted">From Latin America to the World.</span>
                                    </p>
                                    <div className="stg-flex--wrap">
                                        <a href="https://github.com/dsandovalflavio/amoxsql" onClick={(e) => openExternalLink(e, 'https://github.com/dsandovalflavio/amoxsql')} className="stg-link-btn">
                                            <LuGithub size={14} /> GitHub Repository
                                        </a>
                                        <a href="https://github.com/dsandovalflavio" onClick={(e) => openExternalLink(e, 'https://github.com/dsandovalflavio')} className="stg-link-btn">
                                            <LuGlobe size={14} /> Creator Profile
                                        </a>
                                        <a href="https://github.com/sponsors/dsandovalflavio" onClick={(e) => openExternalLink(e, 'https://github.com/sponsors/dsandovalflavio')} className="stg-link-btn stg-link-btn--danger">
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
