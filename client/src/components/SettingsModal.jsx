import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { API_BASE as API } from '../api.js';
import { LuKeyRound, LuX, LuPalette, LuCpu, LuLoader, LuInfo, LuCode, LuSettings, LuFolderOpen, LuCircleCheck, LuCircle, LuPlug, LuLayers } from 'react-icons/lu';
import { useToast } from './ToastProvider';
import { useDialog } from './dialogs/DialogProvider';
import CredentialsPanel from './CredentialsPanel';
import WorkspacesPanel from './workspaces/WorkspacesPanel';
import { useEtiqueta } from '../etiqueta';
import { emitir } from '../eventos.js';

// Cada sección vive en settings/ y se carga la primera vez que se abre (6.0, M8).
const SeccionApariencia = lazy(() => import('./settings/Apariencia'));
const SeccionEditor = lazy(() => import('./settings/Editor'));
const SeccionComportamiento = lazy(() => import('./settings/Comportamiento'));
const SeccionIA = lazy(() => import('./settings/IA'));
const SeccionIntegraciones = lazy(() => import('./settings/Integraciones'));
const SeccionAcercaDe = lazy(() => import('./settings/AcercaDe'));

const TAB_TITLES = {
    appearance:  'Appearance',
    editor:      'Editor',
    behavior:    'Behavior',
    ai:          'AI',
    integrations:'Store Integrations',
    credentials: 'Credentials',
    workspace:   'Project',
    about:       'About AmoxSQL',
    // Legacy aliases so existing initialTab values keep working
    formatter:   'Editor',
    memories:    'AI',
    aicontext:   'AI',
    cloud:       'Store Integrations',
    gallery:     'Chart Gallery',
};

// ─── Workspace Settings Panel ────────────────────────────────────────────────
function WorkspaceSettingsPanel() {
    const [status, setStatus] = React.useState(null);
    const [creating, setCreating] = React.useState(false);
    const toast = useToast();

    const reload = React.useCallback(() => {
        fetch(`${API}/api/project/scaffold-status`)
            .then(r => r.json())
            .then(setStatus)
            .catch(() => {});
    }, []);

    React.useEffect(() => { reload(); }, [reload]);

    const handleCreateFolders = async () => {
        setCreating(true);
        try {
            const missing = (status?.folders || []).filter(f => !f.exists).map(f => f.id);
            await fetch(`${API}/api/project/scaffold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folders: missing }),
            });
            await reload();
            emitir('amox_files_changed');
            toast.success('Missing folders created successfully');
        } catch (err) {
            console.error(err);
            toast.error('Failed to create folders');
        } finally {
            setCreating(false);
        }
    };

    if (!status) return <div className="stg-section" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

    const hasMissing = (status.folders || []).some(f => !f.exists);

    return (
        <div className="stg-section">
            <h3 className="stg-section-title">Folder Structure</h3>
            <p className="stg-row-desc stg-row-desc--mb14">
                Standard project folders help keep your work organized.
                Missing folders can be created at any time.
            </p>
            <div className="stg-group stg-group--mt14">
                {(status.folders || []).map(f => (
                    <div key={f.id} className="stg-row">
                        <div>
                            <span className="stg-row-label">{f.label}/</span>
                            <p className="stg-row-desc">{f.description}</p>
                        </div>
                        {f.exists
                            ? <span style={{ color: 'var(--feedback-success, #4caf50)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <LuCircleCheck size={13} /> Present
                              </span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <LuCircle size={13} /> Not created
                              </span>
                        }
                    </div>
                ))}
            </div>
            {hasMissing && (
                <div style={{ marginTop: 16 }}>
                    <button
                        className="stg-btn stg-btn--primary"
                        onClick={handleCreateFolders}
                        disabled={creating}
                    >
                        {creating
                            ? <><LuLoader size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> Creating…</>
                            : <><LuFolderOpen size={14} /> Create Missing Folders</>
                        }
                    </button>
                </div>
            )}
            {status.isNewProject && !status.wizardCompleted && (
                <div style={{ marginTop: 8 }}>
                    <button
                        className="stg-btn"
                        onClick={() => emitir('amox_open_workspace_wizard')}
                    >
                        Open Project Setup
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Source Control Panel (Sprint 3 stub) ─────────────────────────────────────
function SourceControlPanel() {
    return (
        <div className="stg-section">
            <h3 className="stg-section-title">Git Integration</h3>
            <p className="stg-row-desc stg-row-desc--mb14">
                Local Git support (commit, stage, branch) is available from the Source Control sidebar panel.
                No remote push/pull — designed for local version control of your SQL projects.
            </p>
            <div className="stg-group stg-group--mt14">
                <div className="stg-row">
                    <span className="stg-row-label">Git Panel</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Available in the left sidebar (Ctrl+Shift+G)</span>
                </div>
                <div className="stg-row">
                    <span className="stg-row-label">Auto .gitignore</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generated when initializing a repo — excludes .duckdb files</span>
                </div>
            </div>
        </div>
    );
}

// Map legacy tab IDs to new IDs + sub-tab to pre-select
const SECCIONES_DE_AYUDA = ['shortcuts', 'storyflow', 'dataflow'];

const LEGACY_TAB_MAP = {
    formatter:    { tab: 'editor',     sub: 'formatting' },
    memories:     { tab: 'ai',         sub: 'knowledge' },
    aicontext:    { tab: 'ai',         sub: 'knowledge' },
    cloud:        { tab: 'integrations', sub: null },
    gallery:      { tab: 'appearance', sub: null },
};

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange, currentAccent, onAccentChange,
    accentL = null, effectiveAccentL = 0.73, isLightMode = false, onAccentLChange, glowCorner = 'tl', onGlowCornerChange, glowStrength = 30, onGlowStrengthChange, currentInterfaceFont = 'manrope', onInterfaceFontChange, currentLayout, onLayoutChange, editorSettings = {}, onEditorSettingsChange, initialTab, onTabReset, uiZoomLevel = 1.0, onUiZoomChange }) => {
    const [activeTab, setActiveTab] = useState('appearance');
    const [editorSubTab, setEditorSubTab]   = useState('general');
    const [aiSubTab,     setAiSubTab]       = useState('models');
    const [settingsSearch, setSettingsSearch] = useState('');
    const contentRef = useRef(null);
    const toast = useToast();
    const dialog = useDialog();
    // La sección de workspaces lleva el nombre que eligió el usuario (B8).
    const etiqueta = useEtiqueta();

    // AI Settings State
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [anthropicApiKey, setAnthropicApiKey] = useState('');
    const [minimaxApiKey, setMinimaxApiKey] = useState('');
    // Dónde viven las claves: 'llavero' desde la 5.9; 'texto' si el llavero del
    // sistema no está (config.json, como antes). Lo dice el servidor.
    const [modoLlavero, setModoLlavero] = useState(null);
    const [provider, setProvider] = useState('ollama');
    const [defaultModel, setDefaultModel] = useState('qwen3:1.7b');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [geminiUsage, setGeminiUsage] = useState({ flashLite: 0, flash: 0, pro: 0, tokens: 0 });
    const [plannerMode, setPlannerMode] = useState(true);
    const [geminiModels, setGeminiModels] = useState([]);
    const [modelTierOverrides, setModelTierOverrides] = useState({});
    // AI local performance settings (F1/F4/F5)
    const [memoryExtraction, setMemoryExtraction] = useState('cloud-only');
    const [ollamaThinkOverrides, setOllamaThinkOverrides] = useState({});
    const [ollamaKeepAlive, setOllamaKeepAlive] = useState('4h');
    const [ollamaNumCtx, setOllamaNumCtx] = useState(0);
    // DuckDB docs (offline) settings
    const [duckdbDocsUpdate, setDuckdbDocsUpdate] = useState('auto');
    const [duckdbDocsIntervalDays, setDuckdbDocsIntervalDays] = useState(30);
    const [docsStatus, setDocsStatus] = useState(null);
    const [docsRefreshing, setDocsRefreshing] = useState(false);

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

    // Google Sheets State
    const [gsheetsKeyPath, setGsheetsKeyPath] = useState('');
    const [gsheetsEmail, setGsheetsEmail] = useState('');
    const [gsheetsStatus, setGsheetsStatus] = useState({ isConfigured: false, extensionLoaded: false });
    const [isTestingGSheets, setIsTestingGSheets] = useState(false);
    const [gsheetsTestResult, setGsheetsTestResult] = useState(null);
    const [emailCopied, setEmailCopied] = useState(false);

    // GCP / Vertex AI (ADC) State
    const [gcpProject, setGcpProject]   = useState('');
    const [gcpLocation, setGcpLocation] = useState('us-central1');

    // ADC Test State
    const [isTestingAdc, setIsTestingAdc] = useState(false);
    const [adcTestResult, setAdcTestResult] = useState(null);

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

    // Respond to initialTab prop (e.g. from Ctrl+Shift+/, legacy deep-links)
    useEffect(() => {
        if (isOpen && initialTab) {
            // Los atajos y las guías ya no son de Settings: un enlace viejo abre Help.
            if (SECCIONES_DE_AYUDA.includes(initialTab)) {
                emitir('amox_abrir_ayuda', initialTab);
                onTabReset?.();
                onClose?.();
                return;
            }
            const legacy = LEGACY_TAB_MAP[initialTab];
            if (legacy) {
                setActiveTab(legacy.tab);
                if (legacy.sub) {
                    if (legacy.tab === 'editor') setEditorSubTab(legacy.sub);
                    if (legacy.tab === 'ai')     setAiSubTab(legacy.sub);
                }
            } else {
                setActiveTab(initialTab);
            }
            onTabReset?.();
        }
    }, [isOpen, initialTab]);

    useEffect(() => {
        if (isOpen) {
            fetch(`${API}/api/settings/config`)
                .then(res => res.json())
                .then(data => {
                    setGeminiApiKey(data.geminiApiKey || '');
                    setAnthropicApiKey(data.anthropicApiKey || '');
                    setMinimaxApiKey(data.minimaxApiKey || '');
                    setModoLlavero(data._llavero || null);
                    setGcpProject(data.gcpProject   || '');
                    setGcpLocation(data.gcpLocation || 'us-central1');
                    setProvider(data.provider || 'ollama');
                    setDefaultModel(data.defaultModel || 'gemma4:e2b');
                    if (data.usage) setGeminiUsage(data.usage);
                    if (data.s3Config) setS3Config(data.s3Config);
                    if (data.gcsConfig) setGcsConfig(data.gcsConfig);
                    if (data.experimental) setPlannerMode(!!data.experimental.planner);
                    if (data.geminiModels) setGeminiModels(data.geminiModels);
                    if (data.modelTierOverrides) setModelTierOverrides(data.modelTierOverrides);
                    if (data.memoryExtraction) setMemoryExtraction(data.memoryExtraction);
                    if (data.ollamaThinkOverrides) setOllamaThinkOverrides(data.ollamaThinkOverrides);
                    if (data.ollamaKeepAlive) setOllamaKeepAlive(data.ollamaKeepAlive);
                    if (data.ollamaNumCtx !== undefined) setOllamaNumCtx(data.ollamaNumCtx);
                    if (data.duckdbDocsUpdate) setDuckdbDocsUpdate(data.duckdbDocsUpdate);
                    if (data.duckdbDocsIntervalDays !== undefined) setDuckdbDocsIntervalDays(data.duckdbDocsIntervalDays);
                    // Fetch DuckDB docs snapshot status (date, count, source)
                    fetch(`${API}/api/ai/duckdb-docs/status`).then(r => r.json()).then(setDocsStatus).catch(() => {});
                    if (data.gsheets) {
                        setGsheetsKeyPath(data.gsheets.serviceAccountKeyPath || '');
                        setGsheetsEmail(data.gsheets.serviceAccountEmail || '');
                    }
                    
                    if (data.provider !== 'gemini') fetchInstalledModels();
                })
                .catch(err => console.error("Failed to load config", err));

            fetch(`${API}/api/db/version`)
                .then(res => res.json())
                .then(data => {
                    if (data?.version) setDuckdbVersion(data.version);
                })
                .catch(() => setDuckdbVersion('N/A'));

            fetch(`${API}/api/gsheets/status`)
                .then(res => res.json())
                .then(data => setGsheetsStatus(data))
                .catch(() => {});

            fetchCatalogStats();
        }
    }, [isOpen]);

    const fetchCatalogStats = () => {
        fetch(`${API}/api/functions/coverage`)
            .then(res => res.json())
            .then(data => setCatalogStats(data))
            .catch(err => console.error("Failed to load catalog stats", err));
    };

    const handleRefreshCatalog = async () => {
        setIsRefreshingCatalog(true);
        try {
            await fetch(`${API}/api/functions/refresh`, { method: 'POST' });
            fetchCatalogStats();
            emitir('amox_catalog_refreshed');
        } catch (err) { console.error(err); }
        finally { setIsRefreshingCatalog(false); }
    };

    useEffect(() => {
        if (isOpen && provider === 'ollama' && !isDownloading) fetchInstalledModels();
    }, [provider, isOpen, isDownloading]);

    const fetchInstalledModels = async () => {
        setIsLoadingModels(true);
        try {
            const res = await fetch(`${API}/api/settings/ollama/models-enriched`);
            const data = await res.json();
            if (data.models) setInstalledModels(data.models);
        } catch (err) { console.error(err); }
        finally { setIsLoadingModels(false); }
    };

    const handleRefreshDuckdbDocs = async () => {
        setDocsRefreshing(true);
        try {
            const res = await fetch(`${API}/api/ai/duckdb-docs/refresh`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setDocsStatus(prev => ({ ...prev, ...data }));
                setSaveMessage({ type: 'success', text: 'DuckDB documentation updated' });
            } else {
                setSaveMessage({ type: 'error', text: data.error || 'Could not update' });
            }
            setTimeout(() => setSaveMessage(null), 3000);
        } catch {
            setSaveMessage({ type: 'error', text: 'Could not update (are you offline?)' });
            setTimeout(() => setSaveMessage(null), 3000);
        } finally {
            setDocsRefreshing(false);
        }
    };

    const handleSaveConfig = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            await fetch(`${API}/api/settings/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    geminiApiKey, anthropicApiKey, minimaxApiKey,
                    gcpProject, gcpLocation,
                    provider, defaultModel, s3Config, gcsConfig,
                    experimental: { planner: plannerMode },
                    geminiModels,
                    modelTierOverrides,
                    memoryExtraction, ollamaThinkOverrides,
                    ollamaKeepAlive, ollamaNumCtx,
                    duckdbDocsUpdate, duckdbDocsIntervalDays,
                })
            });
            emitir('amox_settings_updated');
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
            const response = await fetch(`${API}/api/settings/ollama/pull`, {
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
            await fetch(`${API}/api/settings/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ s3Config, gcsConfig })
            });
            const res = await fetch(`${API}/api/export/cloud/test`, {
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

    const handleTestAdc = async () => {
        setIsTestingAdc(true);
        setAdcTestResult(null);
        try {
            const res = await fetch(`${API}/api/settings/cloud/test-adc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Pass current form values so the test uses whatever is typed,
                // even if the user hasn't saved yet.
                body: JSON.stringify({ gcpProject, gcpLocation }),
            });
            const data = await res.json();
            setAdcTestResult(data.success
                ? { type: 'success', text: data.message }
                : { type: 'error', text: data.error || data.message || 'ADC test failed' });
        } catch (err) {
            setAdcTestResult({ type: 'error', text: err.message });
        } finally {
            setIsTestingAdc(false);
            setTimeout(() => setAdcTestResult(null), 8000);
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
                        // ── Configure ──
                        { id: 'appearance',    icon: <LuPalette   size={16} />, label: 'Appearance' },
                        { id: 'editor',        icon: <LuCode      size={16} />, label: 'Editor' },
                        { id: 'behavior',      icon: <LuSettings  size={16} />, label: 'Behavior' },
                        { id: 'ai',            icon: <LuCpu       size={16} />, label: 'AI' },
                        { id: 'integrations',  icon: <LuPlug      size={16} />, label: 'Store Integrations' },
                        { id: 'credentials',   icon: <LuKeyRound  size={16} />, label: 'Credentials' },
                        { id: 'workspace',     icon: <LuFolderOpen size={16} />, label: 'Project' },
                        { id: 'workspaces',    icon: <LuLayers    size={16} />, label: etiqueta.P },
                        // ── Info (la ayuda vive en su propio diálogo, ayuda/Ayuda.jsx) ──
                        { separator: true, id: '_sep_help' },
                        { id: 'about',         icon: <LuInfo      size={16} />, label: 'About AmoxSQL' },
                    ].filter(tab => {
                        if (tab.separator) return !settingsSearch;
                        if (!settingsSearch) return true;
                        const q = settingsSearch.toLowerCase();
                        return tab.label.toLowerCase().includes(q);
                    }).map(tab => (
                        tab.separator ? (
                            <div key={tab.id} className="stg-tab-sep" aria-hidden="true" />
                        ) : (
                            <div
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`stg-tab${activeTab === tab.id ? ' stg-tab--active' : ''}`}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {tab.icon} {tab.label}
                                </span>
                            </div>
                        )
                    ))}
                </div>

                {/* ─── Content ─── */}
                <div className="stg-content">
                    <div className="stg-content-header">
                        <h2 className="stg-content-title">{activeTab === 'workspaces' ? etiqueta.P : TAB_TITLES[activeTab]}</h2>
                        <button onClick={onClose} className="stg-close-btn"><LuX size={18} /></button>
                    </div>

                    <div className="stg-content-body" ref={contentRef}>

                        {/* ═══ APPEARANCE ═══ */}
                        {activeTab === 'appearance' && (
                            <Suspense fallback={null}><SeccionApariencia {...{
                                accentL, currentAccent, currentInterfaceFont, currentTheme, editorSettings,
                                effectiveAccentL, glowCorner, glowStrength, isLightMode, onAccentChange,
                                onAccentLChange, onEditorSettingsChange, onGlowCornerChange,
                                onGlowStrengthChange, onInterfaceFontChange, onThemeChange, onUiZoomChange,
                                uiZoomLevel
                            }} /></Suspense>
                        )}

                        {/* ═══ EDITOR ═══ */}
                        {activeTab === 'editor' && (
                            <Suspense fallback={null}><SeccionEditor {...{
                                catalogStats, coveragePercent, currentLayout, editorSettings, formatterConfig,
                                formatterSaved, handleRefreshCatalog, isRefreshingCatalog,
                                onEditorSettingsChange, onLayoutChange, saveFormatterConfig, setFormatterConfig,
                                setShowUndocumented, showUndocumented
                            }} /></Suspense>
                        )}

                        {/* ═══ BEHAVIOR ═══ */}
                        {activeTab === 'behavior' && (
                            <Suspense fallback={null}><SeccionComportamiento {...{
                                currentAccent, currentLayout, currentTheme, dialog, editorSettings,
                                onAccentChange, onEditorSettingsChange, onLayoutChange, onThemeChange,
                                onUiZoomChange, toast, uiZoomLevel
                            }} /></Suspense>
                        )}

                        {/* ═══ AI ═══ */}
                        {activeTab === 'ai' && (
                            <Suspense fallback={null}><SeccionIA {...{
                                adcTestResult, aiSubTab, anthropicApiKey, customModelInput, docsRefreshing,
                                docsStatus, downloadProgress, duckdbDocsIntervalDays, duckdbDocsUpdate,
                                gcpLocation, gcpProject, geminiApiKey, geminiModels, geminiUsage,
                                handleDownloadModel, handleRefreshDuckdbDocs, handleSaveConfig, handleTestAdc,
                                installedModels, isDownloading, isLoadingModels, isSaving, isTestingAdc,
                                memoryExtraction, minimaxApiKey, modelTierOverrides, modoLlavero,
                                ollamaKeepAlive, ollamaNumCtx, ollamaThinkOverrides, openExternalLink,
                                plannerMode, provider, saveMessage, setAiSubTab, setAnthropicApiKey,
                                setCustomModelInput, setDuckdbDocsIntervalDays, setDuckdbDocsUpdate,
                                setGcpLocation, setGcpProject, setGeminiApiKey, setGeminiModels,
                                setMemoryExtraction, setMinimaxApiKey, setModelTierOverrides, setOllamaKeepAlive,
                                setOllamaNumCtx, setOllamaThinkOverrides, setPlannerMode, setProvider
                            }} /></Suspense>
                        )}

                        {/* ═══ STORE INTEGRATIONS ═══ */}
                        {activeTab === 'integrations' && (
                            <Suspense fallback={null}><SeccionIntegraciones {...{
                                cloudTestResult, emailCopied, gcsConfig, gsheetsEmail, gsheetsKeyPath,
                                gsheetsStatus, gsheetsTestResult, handleSaveConfig, handleTestCloudConnection,
                                isSaving, isTestingCloud, isTestingGSheets, s3Config, saveMessage,
                                setEmailCopied, setGcsConfig, setGsheetsEmail, setGsheetsKeyPath,
                                setGsheetsStatus, setGsheetsTestResult, setIsTestingGSheets, setS3Config
                            }} /></Suspense>
                        )}

                        {/* ═══ CHART GALLERY ═══ */}
                        {/* ═══ WORKSPACE ═══ */}
                        {activeTab === 'credentials' && (
                            <CredentialsPanel />
                        )}

                        {activeTab === 'workspace' && (
                            <WorkspaceSettingsPanel />
                        )}

                        {activeTab === 'workspaces' && (
                            <WorkspacesPanel />
                        )}

                        {/* ═══ ABOUT ═══ */}
                        {activeTab === 'about' && (
                            <Suspense fallback={null}><SeccionAcercaDe {...{
                                duckdbVersion, openExternalLink
                            }} /></Suspense>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
