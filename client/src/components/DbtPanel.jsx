import { useState, useEffect, useCallback } from 'react';
import {
    LuContainer, LuCheck, LuX, LuCopy, LuPlay, LuRefreshCw,
    LuChevronDown, LuChevronRight, LuPlus, LuTrash2,
    LuFolderOpen, LuFileCode, LuSettings2, LuTerminal,
    LuPackage, LuLoader, LuCircleAlert, LuSparkles,
    LuClipboardCopy, LuSquareTerminal, LuWrench, LuGitBranch
} from 'react-icons/lu';
import DbtLineageGraph from './DbtLineageGraph';

const API = 'http://localhost:3001/api';

const DbtPanel = ({ projectPath, onFileOpen }) => {
    // Navigation
    const [activeSection, setActiveSection] = useState('setup'); // setup | config | models | sources | commands

    // Environment state
    const [envStatus, setEnvStatus] = useState(() => {
        try {
            const cached = localStorage.getItem('amox-dbt-env-cache');
            if (cached) return JSON.parse(cached).envStatus || null;
        } catch (e) { /* no cache */ }
        return null;
    });

    // Conda environments
    const [condaEnvs, setCondaEnvs] = useState(() => {
        try {
            const cached = localStorage.getItem('amox-dbt-env-cache');
            if (cached) return JSON.parse(cached).condaEnvs || [];
        } catch (e) { /* no cache */ }
        return [];
    });
    const [condaEnvsLoading, setCondaEnvsLoading] = useState(false);
    const [selectedCondaEnv, setSelectedCondaEnv] = useState(() => {
        try {
            const cached = localStorage.getItem('amox-dbt-env-cache');
            if (cached) return JSON.parse(cached).selectedCondaEnv || 'none';
        } catch (e) { /* no cache */ }
        return 'none';
    });
    const [condaPath, setCondaPath] = useState(() => {
        try {
            const cached = localStorage.getItem('amox-dbt-env-cache');
            if (cached) return JSON.parse(cached).condaPath || null;
        } catch (e) { /* no cache */ }
        return null;
    });
    const [envDbtVersion, setEnvDbtVersion] = useState(null);
    const [envDbtLoading, setEnvDbtLoading] = useState(false);
    const [envCacheTime, setEnvCacheTime] = useState(() => {
        try {
            const cached = localStorage.getItem('amox-dbt-env-cache');
            if (cached) return JSON.parse(cached).timestamp || null;
        } catch (e) { /* no cache */ }
        return null;
    });
    const [envLoading, setEnvLoading] = useState(false);

    // Project state
    const [projectInfo, setProjectInfo] = useState(null);
    const [projectLoading, setProjectLoading] = useState(false);

    // Init form
    const [initName, setInitName] = useState('my_dbt_project');
    const [initLoading, setInitLoading] = useState(false);

    // Config state
    const [profiles, setProfiles] = useState(null);
    const [projectConfig, setProjectConfig] = useState(null);
    const [configLoading, setConfigLoading] = useState(false);

    // Profile form fields
    const [profileName, setProfileName] = useState('');
    const [targetName, setTargetName] = useState('dev');
    const [duckdbPath, setDuckdbPath] = useState('dev.duckdb');
    const [schemaName, setSchemaName] = useState('main');
    const [threads, setThreads] = useState(4);

    // Model generator
    const [modelName, setModelName] = useState('');
    const [modelTemplate, setModelTemplate] = useState('staging');
    const [modelPath, setModelPath] = useState('models/staging');
    const [modelMaterialization, setModelMaterialization] = useState('view');
    const [modelSchema, setModelSchema] = useState('');
    const [modelDescription, setModelDescription] = useState('');
    const [modelPreview, setModelPreview] = useState('');
    const [modelCreating, setModelCreating] = useState(false);

    // Source generator
    const [sourceName, setSourceName] = useState('');
    const [sourceSchema, setSourceSchema] = useState('');
    const [sourceTables, setSourceTables] = useState([{ name: '', description: '' }]);
    const [sourcePreview, setSourcePreview] = useState('');
    const [sourceCreating, setSourceCreating] = useState(false);

    // Command builder
    const [cmdAction, setCmdAction] = useState('run');
    const [cmdSelect, setCmdSelect] = useState('');
    const [cmdExclude, setCmdExclude] = useState('');
    const [cmdFullRefresh, setCmdFullRefresh] = useState(false);
    const [cmdTarget, setCmdTarget] = useState('dev');
    const [generatedCmd, setGeneratedCmd] = useState('');
    const [cmdCopied, setCmdCopied] = useState(false);

    // Execute output
    const [execOutput, setExecOutput] = useState([]);
    const [execRunning, setExecRunning] = useState(false);
    const [execExitCode, setExecExitCode] = useState(null);

    // Toast
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // --- Environment Check ---
    const checkEnv = useCallback(async () => {
        setEnvLoading(true);
        try {
            const res = await fetch(`${API}/dbt/validate-env`);
            const data = await res.json();
            setEnvStatus(data);
            if (data.condaPath) setCondaPath(data.condaPath);
            if (data.conda) {
                await loadCondaEnvs(data.condaPath, data);
            } else {
                // Save env-only cache (no conda)
                saveEnvCache(data, [], null, 'none');
            }
        } catch (err) {
            setEnvStatus({ python: false, dbt: false, conda: false, error: err.message });
        }
        setEnvLoading(false);
    }, []);

    // --- Save cache to localStorage ---
    const saveEnvCache = (env, envs, cPath, selEnv) => {
        const cache = {
            envStatus: env,
            condaEnvs: envs,
            condaPath: cPath,
            selectedCondaEnv: selEnv,
            timestamp: new Date().toISOString(),
        };
        try {
            localStorage.setItem('amox-dbt-env-cache', JSON.stringify(cache));
            setEnvCacheTime(cache.timestamp);
        } catch (e) { /* quota exceeded etc */ }
    };

    // --- Load Conda Environments ---
    const loadCondaEnvs = async (cPath, envData) => {
        setCondaEnvsLoading(true);
        try {
            const cp = cPath || condaPath || '';
            const qs = cp && cp !== 'conda' ? `?condaPath=${encodeURIComponent(cp)}` : '';
            const res = await fetch(`${API}/dbt/conda-envs${qs}`);
            const data = await res.json();
            if (data.success && data.envs) {
                setCondaEnvs(data.envs);
                const dbtEnv = data.envs.find(e => e.hasDbt);
                const selEnv = dbtEnv ? dbtEnv.name : 'none';
                if (dbtEnv) setSelectedCondaEnv(selEnv);
                // Save to cache
                saveEnvCache(envData || envStatus, data.envs, cp || null, selEnv);
            }
        } catch (err) {
            console.error('Failed to load conda envs', err);
        }
        setCondaEnvsLoading(false);
    };

    // --- Project Detection ---
    const detectProject = useCallback(async () => {
        setProjectLoading(true);
        try {
            const res = await fetch(`${API}/dbt/detect`);
            const data = await res.json();
            setProjectInfo(data);
        } catch (err) {
            setProjectInfo({ exists: false });
        }
        setProjectLoading(false);
    }, []);

    // Initial load — use cache if available and fresh, only fetch if stale
    useEffect(() => {
        // Environment: only re-check if cache is missing OR older than 1 hour
        const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
        const isStale = !envCacheTime || (Date.now() - new Date(envCacheTime).getTime()) > CACHE_TTL_MS;

        if (!envStatus || isStale) {
            checkEnv();
        }

        // Project: only detect once per mount
        if (!projectInfo) {
            detectProject();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Check exact DBT version when conda env changes
    useEffect(() => {
        if (!selectedCondaEnv || selectedCondaEnv === 'none') {
            setEnvDbtVersion(null);
            return;
        }

        // Cache the version per environment to prevent redundant CLI calls
        const envCacheKey = `amox-dbt-ver-${selectedCondaEnv}`;
        const cachedVer = sessionStorage.getItem(envCacheKey);

        if (cachedVer) {
            setEnvDbtVersion(cachedVer);
            return;
        }

        const checkEnvDbt = async () => {
            setEnvDbtLoading(true);
            try {
                const cp = condaPath || 'conda';
                const qs = cp && cp !== 'conda' ? `condaPath=${encodeURIComponent(cp)}&` : '';
                const res = await fetch(`${API}/dbt/check-env-dbt?${qs}envName=${encodeURIComponent(selectedCondaEnv)}`);
                const data = await res.json();
                if (data.found) {
                    setEnvDbtVersion(data.version);
                    sessionStorage.setItem(envCacheKey, data.version);
                } else {
                    setEnvDbtVersion(null);
                }
            } catch (err) {
                setEnvDbtVersion(null);
            }
            setEnvDbtLoading(false);
        };
        checkEnvDbt();
    }, [selectedCondaEnv, condaPath]);

    // --- Init Project ---
    const handleInitProject = async () => {
        setInitLoading(true);
        try {
            const res = await fetch(`${API}/dbt/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectName: initName })
            });
            const data = await res.json();
            if (data.success) {
                showToast(data.message);
                await detectProject();
                await loadConfig();
            } else {
                showToast(data.error || 'Init failed', 'error');
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
        setInitLoading(false);
    };

    // --- Config Loading ---
    const loadConfig = useCallback(async () => {
        setConfigLoading(true);
        try {
            const [profRes, projRes] = await Promise.all([
                fetch(`${API}/dbt/profiles`),
                fetch(`${API}/dbt/project-config`)
            ]);
            const profData = await profRes.json();
            const projData = await projRes.json();

            if (profData.exists) {
                setProfiles(profData.profiles);
                const firstProfile = Object.keys(profData.profiles)[0];
                if (firstProfile) {
                    setProfileName(firstProfile);
                    const output = profData.profiles[firstProfile]?.outputs?.dev;
                    if (output) {
                        setTargetName('dev');
                        setDuckdbPath(output.path || 'dev.duckdb');
                        setSchemaName(output.schema || 'main');
                        setThreads(output.threads || 4);
                    }
                }
            }
            if (projData.exists) {
                setProjectConfig(projData.config);
            }
        } catch (err) {
            console.error('Failed to load DBT config', err);
        }
        setConfigLoading(false);
    }, []);

    useEffect(() => {
        if (projectInfo?.exists) loadConfig();
    }, [projectInfo, loadConfig]);

    // --- Save Profiles ---
    const saveProfiles = async () => {
        const profileData = {
            [profileName]: {
                target: targetName,
                outputs: {
                    [targetName]: {
                        type: 'duckdb',
                        path: duckdbPath,
                        schema: schemaName,
                        threads: parseInt(threads) || 4,
                    }
                }
            }
        };

        try {
            const res = await fetch(`${API}/dbt/profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profiles: profileData })
            });
            if (res.ok) {
                showToast('profiles.yml saved');
                setProfiles(profileData);
            } else {
                showToast('Failed to save profiles', 'error');
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // --- Model Template Path Auto-update ---
    useEffect(() => {
        const pathMap = { staging: 'models/staging', intermediate: 'models/intermediate', mart: 'models/marts', basic: 'models', incremental: 'models' };
        setModelPath(pathMap[modelTemplate] || 'models');
        const matMap = { staging: 'view', intermediate: 'view', mart: 'table', incremental: 'incremental', basic: 'view' };
        setModelMaterialization(matMap[modelTemplate] || 'view');
    }, [modelTemplate]);

    // --- Create Model ---
    const handleCreateModel = async () => {
        if (!modelName.trim()) return showToast('Model name is required', 'error');
        setModelCreating(true);
        try {
            const res = await fetch(`${API}/dbt/template/model`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: modelName,
                    template: modelTemplate,
                    materialization: modelMaterialization,
                    schema: modelSchema || undefined,
                    description: modelDescription || undefined,
                    path: modelPath
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Model created: ${data.path}`);
                setModelName('');
                setModelDescription('');
                if (onFileOpen) onFileOpen(data.path);
            } else {
                showToast(data.error || 'Failed to create model', 'error');
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
        setModelCreating(false);
    };

    // --- Create Source ---
    const handleCreateSource = async () => {
        if (!sourceName.trim()) return showToast('Source name is required', 'error');
        const validTables = sourceTables.filter(t => t.name.trim());
        if (validTables.length === 0) return showToast('At least one table name is required', 'error');

        setSourceCreating(true);
        try {
            const res = await fetch(`${API}/dbt/template/source`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sourceName,
                    sourceSchema: sourceSchema || undefined,
                    tables: validTables,
                    targetPath: 'models/staging'
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Source created: ${data.path}`);
                setSourcePreview(data.content);
            } else {
                showToast(data.error || 'Failed to create source', 'error');
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
        setSourceCreating(false);
    };

    // --- Command Builder ---
    useEffect(() => {
        let cmd = `dbt ${cmdAction}`;
        if (cmdSelect) cmd += ` --select ${cmdSelect}`;
        if (cmdExclude) cmd += ` --exclude ${cmdExclude}`;
        if (cmdFullRefresh && ['run', 'build'].includes(cmdAction)) cmd += ' --full-refresh';
        cmd += ' --profiles-dir .';
        if (cmdTarget) cmd += ` --target ${cmdTarget}`;
        setGeneratedCmd(cmd);
    }, [cmdAction, cmdSelect, cmdExclude, cmdFullRefresh, cmdTarget]);

    const handleCopyCmd = () => {
        const fullCmd = selectedCondaEnv !== 'none' ? `conda run -n ${selectedCondaEnv} ${generatedCmd}` : generatedCmd;
        navigator.clipboard.writeText(fullCmd);
        setCmdCopied(true);
        setTimeout(() => setCmdCopied(false), 2000);
    };

    // --- Execute Command ---
    const handleExecute = async () => {
        if (!generatedCmd || execRunning) return;
        setExecOutput([]);
        setExecRunning(true);
        setExecExitCode(null);

        try {
            const res = await fetch(`${API}/dbt/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: generatedCmd, condaEnv: selectedCondaEnv, condaPath })
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'exit') {
                                setExecExitCode(data.code);
                            } else {
                                setExecOutput(prev => [...prev, data]);
                            }
                        } catch (e) { /* parse error */ }
                    }
                }
            }
        } catch (err) {
            setExecOutput(prev => [...prev, { type: 'error', text: err.message }]);
        }
        setExecRunning(false);
    };

    // --- Quick Actions ---
    const quickActions = [
        { label: 'Run All', cmd: 'dbt run --profiles-dir .', icon: LuPlay },
        { label: 'Compile', cmd: 'dbt compile --profiles-dir .', icon: LuPackage },
        { label: 'Test', cmd: 'dbt test --profiles-dir .', icon: LuCheck },
        { label: 'Debug', cmd: 'dbt debug --profiles-dir .', icon: LuWrench },
    ];

    const handleQuickAction = (cmd) => {
        setGeneratedCmd(cmd);
        setCmdAction(cmd.split(' ')[1]);
    };

    // ============== RENDER ==============

    const sectionTabs = [
        { id: 'setup', label: 'Setup', icon: LuSparkles },
        { id: 'config', label: 'Config', icon: LuSettings2 },
        { id: 'models', label: 'Models', icon: LuFileCode },
        { id: 'sources', label: 'Sources', icon: LuFolderOpen },
        { id: 'lineage', label: 'Lineage', icon: LuGitBranch },
        { id: 'commands', label: 'Commands', icon: LuTerminal },
    ];

    return (
        <div className="dbt-panel">
            {/* Panel Header */}
            <div className="dbt-panel-header">
                <LuContainer size={16} style={{ color: 'var(--accent-primary)' }} />
                <span>DBT Studio</span>
            </div>

            {/* Section Tabs */}
            <div className="dbt-tabs">
                {sectionTabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`dbt-tab ${activeSection === tab.id ? 'dbt-tab--active' : ''}`}
                        onClick={() => setActiveSection(tab.id)}
                        title={tab.label}
                    >
                        <tab.icon size={13} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Toast */}
            {toast && (
                <div className={`dbt-toast ${toast.type === 'error' ? 'dbt-toast--error' : ''}`}>
                    {toast.type === 'error' ? <LuCircleAlert size={13} /> : <LuCheck size={13} />}
                    {toast.msg}
                </div>
            )}

            {/* Content */}
            <div className="dbt-content">

                {/* ========== SETUP SECTION ========== */}
                {activeSection === 'setup' && (
                    <div className="dbt-section-content">
                        {/* Environment Status */}
                        <div className="dbt-card">
                            <div className="dbt-card-header">
                                <span>Environment</span>
                                <button className="dbt-icon-btn" onClick={checkEnv} disabled={envLoading} title="Refresh">
                                    <LuRefreshCw size={13} className={envLoading ? 'dbt-spin' : ''} />
                                </button>
                            </div>
                            {envLoading && !envStatus ? (
                                <div className="dbt-loading"><LuLoader size={16} className="dbt-spin" /> Checking...</div>
                            ) : envStatus ? (
                                <div className="dbt-env-grid">
                                    <div className="dbt-env-item">
                                        <div className={`dbt-env-dot ${envStatus.python ? 'dbt-env-dot--ok' : 'dbt-env-dot--fail'}`} />
                                        <span>Python</span>
                                        <span className="dbt-env-version">{envStatus.python ? `v${envStatus.pythonVersion}` : 'Not found'}</span>
                                    </div>
                                    <div className="dbt-env-item">
                                        <div className={`dbt-env-dot ${(envDbtVersion || envStatus.dbt) ? 'dbt-env-dot--ok' : 'dbt-env-dot--fail'}`} />
                                        <span>DBT</span>
                                        {envDbtLoading ? (
                                            <span className="dbt-env-version"><LuLoader size={10} className="dbt-spin" /> checking env...</span>
                                        ) : (
                                            <span className="dbt-env-version">
                                                {envDbtVersion ? `v${envDbtVersion} (env)` : (envStatus.dbt ? `v${envStatus.dbtVersion} (sys)` : 'Not found')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="dbt-env-item">
                                        <div className={`dbt-env-dot ${envStatus.conda ? 'dbt-env-dot--ok' : 'dbt-env-dot--fail'}`} />
                                        <span>Conda</span>
                                        <span className="dbt-env-version">{envStatus.conda ? `v${envStatus.condaVersion}` : 'Not found'}</span>
                                    </div>
                                    {envStatus.conda && envStatus.condaPath && envStatus.condaPath !== 'conda' && (
                                        <div style={{ paddingLeft: '14px', fontSize: '10px', color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                                            ⚠ Not in PATH — found at: {envStatus.condaPath}
                                        </div>
                                    )}
                                    {envStatus.mamba && (
                                        <div className="dbt-env-item">
                                            <div className="dbt-env-dot dbt-env-dot--ok" />
                                            <span>Mamba</span>
                                            <span className="dbt-env-version">v{envStatus.mambaVersion}</span>
                                        </div>
                                    )}
                                </div>
                            ) : null}

                            {/* Conda Environments */}
                            {envStatus && (
                                <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                                    <div className="dbt-form-field">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <label style={{ margin: 0 }}>Conda Environment</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {envCacheTime && (
                                                    <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>
                                                        {new Date(envCacheTime).toLocaleDateString()}
                                                    </span>
                                                )}
                                                <button
                                                    className="dbt-icon-btn"
                                                    onClick={() => checkEnv()}
                                                    disabled={envLoading || condaEnvsLoading}
                                                    title="Refresh environment detection"
                                                    style={{ padding: '2px' }}
                                                >
                                                    <LuRefreshCw size={11} className={envLoading || condaEnvsLoading ? 'dbt-spin' : ''} />
                                                </button>
                                            </div>
                                        </div>
                                        {envStatus.conda ? (
                                            condaEnvsLoading ? (
                                                <div className="dbt-loading" style={{ padding: '4px 0' }}>
                                                    <LuLoader size={12} className="dbt-spin" /> Scanning envs...
                                                </div>
                                            ) : condaEnvs.length > 0 ? (
                                                <select
                                                    value={selectedCondaEnv}
                                                    onChange={e => setSelectedCondaEnv(e.target.value)}
                                                >
                                                    <option value="none">System PATH (no conda)</option>
                                                    {condaEnvs.map(env => (
                                                        <option key={env.name} value={env.name}>
                                                            {env.name}{env.hasDbt ? ` ✓ dbt${env.dbtVersion ? ` v${env.dbtVersion}` : ''}` : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Conda detected, no envs found</span>
                                            )
                                        ) : (
                                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                Conda not detected — install <a href="https://docs.anaconda.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>Anaconda</a> or <a href="https://docs.conda.io/projects/miniconda/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>Miniconda</a> to use environments
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {envStatus && !envStatus.dbt && !condaEnvs.some(e => e.hasDbt) && (
                                <div className="dbt-hint">
                                    <LuCircleAlert size={12} />
                                    <span>Install DBT: <code>pip install dbt-duckdb</code>{envStatus?.conda ? ' or ' : ''}{envStatus?.conda && <code>conda install -c conda-forge dbt-duckdb</code>}</span>
                                </div>
                            )}
                        </div>

                        {/* Project Status */}
                        <div className="dbt-card">
                            <div className="dbt-card-header">
                                <span>Project</span>
                                <button className="dbt-icon-btn" onClick={detectProject} disabled={projectLoading} title="Refresh">
                                    <LuRefreshCw size={13} className={projectLoading ? 'dbt-spin' : ''} />
                                </button>
                            </div>
                            {projectInfo?.exists ? (
                                <div className="dbt-project-info">
                                    <div className="dbt-env-item">
                                        <div className="dbt-env-dot dbt-env-dot--ok" />
                                        <span>{projectInfo.projectName}</span>
                                        <span className="dbt-env-version">v{projectInfo.version}</span>
                                    </div>
                                    <div className="dbt-tag-row">
                                        <span className="dbt-tag">profile: {projectInfo.profile}</span>
                                        {projectInfo.modelPaths?.map(p => (
                                            <span key={p} className="dbt-tag">{p}/</span>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="dbt-init-form">
                                    <p className="dbt-subtle-text">No DBT project detected. Initialize one:</p>
                                    <div className="dbt-form-field">
                                        <label>Project Name</label>
                                        <input
                                            type="text"
                                            value={initName}
                                            onChange={e => setInitName(e.target.value)}
                                            placeholder="my_dbt_project"
                                        />
                                    </div>
                                    <button
                                        className="dbt-btn dbt-btn--primary"
                                        onClick={handleInitProject}
                                        disabled={initLoading || !initName.trim()}
                                    >
                                        {initLoading ? <LuLoader size={13} className="dbt-spin" /> : <LuSparkles size={13} />}
                                        Initialize Project
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Quick Start Guide */}
                        {!projectInfo?.exists && (
                            <div className="dbt-card">
                                <div className="dbt-card-header"><span>Quick Start</span></div>
                                <ol className="dbt-steps">
                                    <li><code>pip install dbt-duckdb</code>{envStatus?.conda && <> or <code>conda install -c conda-forge dbt-duckdb</code></>}</li>
                                    <li>Click "Initialize Project" above</li>
                                    <li>Go to Config tab to customize profiles.yml</li>
                                    <li>Go to Models tab to create your first model</li>
                                    <li>Go to Commands tab to run <code>dbt run</code></li>
                                </ol>
                            </div>
                        )}
                    </div>
                )}

                {/* ========== CONFIG SECTION ========== */}
                {activeSection === 'config' && (
                    <div className="dbt-section-content">
                        {!projectInfo?.exists ? (
                            <div className="dbt-empty-state">
                                <LuCircleAlert size={24} />
                                <p>No DBT project found. Go to Setup to initialize one.</p>
                            </div>
                        ) : (
                            <>
                                {/* profiles.yml Editor */}
                                <div className="dbt-card">
                                    <div className="dbt-card-header">
                                        <span>profiles.yml</span>
                                        {configLoading && <LuLoader size={13} className="dbt-spin" />}
                                    </div>
                                    <div className="dbt-form-field">
                                        <label>Profile Name</label>
                                        <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="my_project" />
                                    </div>
                                    <div className="dbt-form-row">
                                        <div className="dbt-form-field">
                                            <label>Target</label>
                                            <input type="text" value={targetName} onChange={e => setTargetName(e.target.value)} placeholder="dev" />
                                        </div>
                                        <div className="dbt-form-field">
                                            <label>Threads</label>
                                            <input type="number" value={threads} onChange={e => setThreads(e.target.value)} min="1" max="16" />
                                        </div>
                                    </div>
                                    <div className="dbt-form-field">
                                        <label>DuckDB Path</label>
                                        <input type="text" value={duckdbPath} onChange={e => setDuckdbPath(e.target.value)} placeholder="dev.duckdb" />
                                    </div>
                                    <div className="dbt-form-field">
                                        <label>Schema</label>
                                        <input type="text" value={schemaName} onChange={e => setSchemaName(e.target.value)} placeholder="main" />
                                    </div>
                                    <button className="dbt-btn dbt-btn--primary" onClick={saveProfiles}>
                                        <LuCheck size={13} /> Save Profile
                                    </button>
                                </div>

                                {/* dbt_project.yml Summary */}
                                <div className="dbt-card">
                                    <div className="dbt-card-header"><span>dbt_project.yml</span></div>
                                    {projectConfig ? (
                                        <div className="dbt-config-summary">
                                            <div className="dbt-config-row"><span>name</span><code>{projectConfig.name}</code></div>
                                            <div className="dbt-config-row"><span>version</span><code>{projectConfig.version}</code></div>
                                            <div className="dbt-config-row"><span>profile</span><code>{projectConfig.profile}</code></div>
                                            <div className="dbt-config-row"><span>models</span><code>{(projectConfig['model-paths'] || ['models']).join(', ')}</code></div>
                                        </div>
                                    ) : (
                                        <p className="dbt-subtle-text">No configuration loaded.</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ========== MODELS SECTION ========== */}
                {activeSection === 'models' && (
                    <div className="dbt-section-content">
                        {!projectInfo?.exists ? (
                            <div className="dbt-empty-state">
                                <LuCircleAlert size={24} />
                                <p>Initialize a DBT project first.</p>
                            </div>
                        ) : (
                            <div className="dbt-card">
                                <div className="dbt-card-header"><span>New Model</span></div>

                                <div className="dbt-form-field">
                                    <label>Template</label>
                                    <div className="dbt-template-grid">
                                        {['staging', 'intermediate', 'mart', 'incremental', 'basic'].map(t => (
                                            <button
                                                key={t}
                                                className={`dbt-template-btn ${modelTemplate === t ? 'dbt-template-btn--active' : ''}`}
                                                onClick={() => setModelTemplate(t)}
                                            >
                                                {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="dbt-form-field">
                                    <label>Model Name</label>
                                    <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} placeholder="stg_orders" />
                                </div>

                                <div className="dbt-form-row">
                                    <div className="dbt-form-field">
                                        <label>Path</label>
                                        <input type="text" value={modelPath} onChange={e => setModelPath(e.target.value)} placeholder="models/staging" />
                                    </div>
                                    <div className="dbt-form-field">
                                        <label>Materialization</label>
                                        <select value={modelMaterialization} onChange={e => setModelMaterialization(e.target.value)}>
                                            <option value="view">view</option>
                                            <option value="table">table</option>
                                            <option value="incremental">incremental</option>
                                            <option value="ephemeral">ephemeral</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="dbt-form-field">
                                    <label>Schema <span className="dbt-optional">(optional)</span></label>
                                    <input type="text" value={modelSchema} onChange={e => setModelSchema(e.target.value)} placeholder="staging" />
                                </div>

                                <div className="dbt-form-field">
                                    <label>Description <span className="dbt-optional">(optional)</span></label>
                                    <input type="text" value={modelDescription} onChange={e => setModelDescription(e.target.value)} placeholder="Brief model description" />
                                </div>

                                <button
                                    className="dbt-btn dbt-btn--primary"
                                    onClick={handleCreateModel}
                                    disabled={modelCreating || !modelName.trim()}
                                >
                                    {modelCreating ? <LuLoader size={13} className="dbt-spin" /> : <LuFileCode size={13} />}
                                    Create Model
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ========== SOURCES SECTION ========== */}
                {activeSection === 'sources' && (
                    <div className="dbt-section-content">
                        {!projectInfo?.exists ? (
                            <div className="dbt-empty-state">
                                <LuCircleAlert size={24} />
                                <p>Initialize a DBT project first.</p>
                            </div>
                        ) : (
                            <div className="dbt-card">
                                <div className="dbt-card-header"><span>New Source Definition</span></div>

                                <div className="dbt-form-field">
                                    <label>Source Name</label>
                                    <input type="text" value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="raw_data" />
                                </div>

                                <div className="dbt-form-field">
                                    <label>Schema <span className="dbt-optional">(optional)</span></label>
                                    <input type="text" value={sourceSchema} onChange={e => setSourceSchema(e.target.value)} placeholder="main" />
                                </div>

                                <div className="dbt-form-field">
                                    <label>Tables</label>
                                    {sourceTables.map((table, idx) => (
                                        <div key={idx} className="dbt-source-table-row">
                                            <input
                                                type="text"
                                                value={table.name}
                                                onChange={e => {
                                                    const updated = [...sourceTables];
                                                    updated[idx] = { ...updated[idx], name: e.target.value };
                                                    setSourceTables(updated);
                                                }}
                                                placeholder="table_name"
                                            />
                                            <input
                                                type="text"
                                                value={table.description}
                                                onChange={e => {
                                                    const updated = [...sourceTables];
                                                    updated[idx] = { ...updated[idx], description: e.target.value };
                                                    setSourceTables(updated);
                                                }}
                                                placeholder="Description (optional)"
                                                style={{ flex: 1 }}
                                            />
                                            {sourceTables.length > 1 && (
                                                <button
                                                    className="dbt-icon-btn dbt-icon-btn--danger"
                                                    onClick={() => setSourceTables(sourceTables.filter((_, i) => i !== idx))}
                                                >
                                                    <LuTrash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        className="dbt-btn dbt-btn--ghost"
                                        onClick={() => setSourceTables([...sourceTables, { name: '', description: '' }])}
                                    >
                                        <LuPlus size={12} /> Add Table
                                    </button>
                                </div>

                                <button
                                    className="dbt-btn dbt-btn--primary"
                                    onClick={handleCreateSource}
                                    disabled={sourceCreating || !sourceName.trim()}
                                >
                                    {sourceCreating ? <LuLoader size={13} className="dbt-spin" /> : <LuFolderOpen size={13} />}
                                    Create Source
                                </button>

                                {sourcePreview && (
                                    <div className="dbt-preview">
                                        <div className="dbt-preview-header">
                                            <span>Generated YAML</span>
                                            <button className="dbt-icon-btn" onClick={() => navigator.clipboard.writeText(sourcePreview)}>
                                                <LuCopy size={12} />
                                            </button>
                                        </div>
                                        <pre className="dbt-code">{sourcePreview}</pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ========== LINEAGE SECTION ========== */}
                {activeSection === 'lineage' && (
                    <div className="dbt-section-content" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {!projectInfo?.exists ? (
                            <div className="dbt-empty-state">
                                <LuCircleAlert size={24} />
                                <p>Initialize a DBT project first.</p>
                            </div>
                        ) : (
                            <DbtLineageGraph onFileOpen={onFileOpen} />
                        )}
                    </div>
                )}

                {/* ========== COMMANDS SECTION ========== */}
                {activeSection === 'commands' && (
                    <div className="dbt-section-content">
                        {/* Quick Actions */}
                        <div className="dbt-quick-actions">
                            {quickActions.map(qa => (
                                <button
                                    key={qa.label}
                                    className="dbt-quick-btn"
                                    onClick={() => handleQuickAction(qa.cmd)}
                                    disabled={execRunning}
                                >
                                    <qa.icon size={13} />
                                    {qa.label}
                                </button>
                            ))}
                        </div>

                        {/* Command Builder */}
                        <div className="dbt-card">
                            <div className="dbt-card-header"><span>Command Builder</span></div>

                            {/* Conda env selector in commands */}
                            {envStatus?.conda && condaEnvs.length > 0 && (
                                <div className="dbt-form-field">
                                    <label>Conda Env</label>
                                    <select
                                        value={selectedCondaEnv}
                                        onChange={e => setSelectedCondaEnv(e.target.value)}
                                    >
                                        <option value="none">System PATH</option>
                                        {condaEnvs.map(env => (
                                            <option key={env.name} value={env.name}>
                                                {env.name}{env.hasDbt ? ' ✓' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="dbt-form-field">
                                <label>Action</label>
                                <select value={cmdAction} onChange={e => setCmdAction(e.target.value)}>
                                    {['run', 'build', 'compile', 'test', 'seed', 'snapshot', 'debug', 'clean', 'deps', 'parse'].map(a => (
                                        <option key={a} value={a}>dbt {a}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="dbt-form-row">
                                <div className="dbt-form-field">
                                    <label>--select <span className="dbt-optional">(optional)</span></label>
                                    <input type="text" value={cmdSelect} onChange={e => setCmdSelect(e.target.value)} placeholder="model_name or tag:daily" />
                                </div>
                                <div className="dbt-form-field">
                                    <label>--target</label>
                                    <input type="text" value={cmdTarget} onChange={e => setCmdTarget(e.target.value)} placeholder="dev" />
                                </div>
                            </div>

                            <div className="dbt-form-field">
                                <label>--exclude <span className="dbt-optional">(optional)</span></label>
                                <input type="text" value={cmdExclude} onChange={e => setCmdExclude(e.target.value)} placeholder="model_to_skip" />
                            </div>

                            {['run', 'build'].includes(cmdAction) && (
                                <label className="dbt-checkbox">
                                    <input type="checkbox" checked={cmdFullRefresh} onChange={e => setCmdFullRefresh(e.target.checked)} />
                                    <span>--full-refresh</span>
                                </label>
                            )}

                            {/* Generated Command */}
                            <div className="dbt-command-box">
                                <code>{selectedCondaEnv !== 'none' ? `conda run -n ${selectedCondaEnv} ${generatedCmd}` : generatedCmd}</code>
                                <div className="dbt-command-actions">
                                    <button className="dbt-icon-btn" onClick={handleCopyCmd} title="Copy to clipboard">
                                        {cmdCopied ? <LuCheck size={14} style={{ color: 'var(--success)' }} /> : <LuClipboardCopy size={14} />}
                                    </button>
                                    <button
                                        className="dbt-btn dbt-btn--execute"
                                        onClick={handleExecute}
                                        disabled={execRunning || (!envStatus?.dbt && !condaEnvs.some(e => e.hasDbt && e.name === selectedCondaEnv))}
                                        title={!envStatus?.dbt && selectedCondaEnv === 'none' ? 'DBT not found — select a conda env with dbt' : 'Execute command'}
                                    >
                                        {execRunning ? <LuLoader size={13} className="dbt-spin" /> : <LuSquareTerminal size={13} />}
                                        {execRunning ? 'Running...' : 'Execute'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Output Panel */}
                        {(execOutput.length > 0 || execRunning) && (
                            <div className="dbt-card">
                                <div className="dbt-card-header">
                                    <span>
                                        Output
                                        {execExitCode !== null && (
                                            <span className={`dbt-exit-badge ${execExitCode === 0 ? 'dbt-exit-badge--ok' : 'dbt-exit-badge--fail'}`}>
                                                exit: {execExitCode}
                                            </span>
                                        )}
                                    </span>
                                    {!execRunning && (
                                        <button className="dbt-icon-btn" onClick={() => { setExecOutput([]); setExecExitCode(null); }}>
                                            <LuX size={13} />
                                        </button>
                                    )}
                                </div>
                                <div className="dbt-output">
                                    {execOutput.map((line, i) => (
                                        <div key={i} className={`dbt-output-line ${line.type === 'stderr' ? 'dbt-output-line--err' : ''} ${line.type === 'error' ? 'dbt-output-line--fatal' : ''}`}>
                                            {line.text}
                                        </div>
                                    ))}
                                    {execRunning && (
                                        <div className="dbt-output-line dbt-output-line--running">
                                            <LuLoader size={12} className="dbt-spin" /> Running...
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div >
    );
};

export default DbtPanel;
