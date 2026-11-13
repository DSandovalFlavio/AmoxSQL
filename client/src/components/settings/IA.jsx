/**
 * Settings › Proveedores, modelos, modos, conocimiento y skills del Assistant.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import React from 'react';
import { ofrecerTour } from '../onboarding/tourRegistry';
import { API_BASE as API } from '../../api.js';
import { LuBrain, LuLoader, LuCheck, LuSparkles, LuDownload, LuCpu, LuInfo, LuX, LuTrash2, LuWrench, LuEye, LuGlobe } from 'react-icons/lu';
import TabWithSubTabs from '../settings/TabWithSubTabs';
import MemoriesPanel from '../ai/MemoriesPanel';
import SkillsPanel from '../ai/SkillsPanel';
import { Toggle, valorVisible, indicacion } from './comun';

const RECOMMENDED_MODELS = [
    // ── Edge / Lightweight ──
    { id: 'gemma4:e2b', label: 'Gemma 4 E2B', size: '~1.6GB', desc: 'Native tool calling in 2B. A good place to start.', tier: 'medium', isNew: true },
    { id: 'qwen3.5:2b', label: 'Qwen 3.5 (2B)', size: '~1.5GB', desc: 'Ultra light, with a 32K context.', tier: 'low' },
    
    // ── Balanced ──
    { id: 'gemma4:e4b', label: 'Gemma 4 E4B', size: '~2.8GB', desc: 'A perfect balance: tool calling + audio + vision.', tier: 'medium', isNew: true },
    { id: 'qwen3.5:4b', label: 'Qwen 3.5 (4B)', size: '~2.5GB', desc: 'The leader in tool calling for its size.', tier: 'medium' },
    
    // ── Powerful ──
    { id: 'gemma4:26b', label: 'Gemma 4 26B', size: '~16GB', desc: 'MoE: only 4B active but the power of 26B.', tier: 'high', isNew: true },
    { id: 'qwen3.5:9b', label: 'Qwen 3.5 (9B)', size: '~5.5GB', desc: 'Excellent for complex analysis.', tier: 'medium' },
    
    // ── Maximum ──
    { id: 'gemma4:31b', label: 'Gemma 4 31B', size: '~20GB', desc: 'Top local quality. #3 on Arena.', tier: 'high', isNew: true },
    { id: 'qwen3.5:27b', label: 'Qwen 3.5 (27B)', size: '~16GB', desc: '256K context. Raw power.', tier: 'high' }
];

// ─── AI Context Tab ───

const FILE_DEFS = [
    {
        key: 'metrics',
        file: 'metrics.yml',
        label: 'metrics.yml',
        desc: 'Business metric definitions — tell the AI what "revenue", "churn", or "MAU" means in SQL.',
        color: '#22c55e',
    },
    {
        key: 'joins',
        file: 'joins.yml',
        label: 'joins.yml',
        desc: 'Canonical JOIN relationships — the AI uses these to write correct table joins without guessing.',
        color: '#3b82f6',
    },
    {
        key: 'glossary',
        file: 'glossary.md',
        label: 'glossary.md',
        desc: 'Domain glossary — definitions of business terms in plain language.',
        color: '#a78bfa',
    },
    {
        key: 'examples',
        file: 'examples/',
        label: 'examples/',
        desc: 'Example SQL queries — the AI finds and reuses these for recurring analysis patterns.',
        color: '#f59e0b',
    },
];

function AiContextTab() {
    const [status, setStatus] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [creating, setCreating] = React.useState(false);
    const [selectedFiles, setSelectedFiles] = React.useState(['metrics', 'joins', 'glossary', 'examples']);

    // First-run AI Context tour (rendered by the global OnboardingHost)
    React.useEffect(() => {
        ofrecerTour('ai-context');
    }, []);

    const reload = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/ai/context-status`);
            const data = await res.json();
            setStatus(data);
        } catch {
            setStatus(null);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { reload(); }, [reload]);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await fetch(`${API}/api/ai/context-setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: selectedFiles }),
            });
            await reload();
            window.dispatchEvent(new Event('amox_files_changed'));
        } finally {
            setCreating(false);
        }
    };

    const toggleFile = (key) => {
        setSelectedFiles(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const fileExists = (key) => {
        if (!status?.files) return false;
        if (key === 'examples') return status.files.examples?.length > 0;
        return status.files[key] === true;
    };

    return (
        <div className="stg-section">
            {/* Hero */}
            <div className="stg-ctx-hero">
                <LuBrain size={28} className="stg-ctx-hero-icon" />
                <div>
                    <h3 className="stg-ctx-hero-title">AI Context Folder</h3>
                    <p className="stg-ctx-hero-desc">
                        A <code>context/</code> folder in your project teaches the AI about your data domain —
                        metric definitions, table relationships, domain terms, and example queries.
                        The AI reads it automatically at the start of every conversation.
                    </p>
                </div>
            </div>

            {/* Status card */}
            <div className="stg-card stg-ctx-status-card">
                {loading ? (
                    <div className="stg-ctx-loading">
                        <LuLoader size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                        <span>Checking project…</span>
                    </div>
                ) : status?.exists ? (
                    <>
                        <div className="stg-ctx-status-header">
                            <LuCheck size={15} className="stg-ctx-status-ok" />
                            <span className="stg-ctx-status-label">Context folder active</span>
                            <code className="stg-ctx-path">{status.path}</code>
                        </div>
                        <div className="stg-ctx-files">
                            {FILE_DEFS.map(f => {
                                const exists = fileExists(f.key);
                                return (
                                    <div key={f.key} className={`stg-ctx-file ${exists ? 'stg-ctx-file--exists' : 'stg-ctx-file--missing'}`}>
                                        <span className="stg-ctx-file-dot" style={{ background: exists ? f.color : 'var(--border-subtle)' }} />
                                        <span className="stg-ctx-file-name">{f.label}</span>
                                        <span className="stg-ctx-file-status">
                                            {exists
                                                ? f.key === 'examples'
                                                    ? `${status.files.examples.length} example${status.files.examples.length !== 1 ? 's' : ''}`
                                                    : 'configured'
                                                : 'missing'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        {FILE_DEFS.some(f => !fileExists(f.key)) && (
                            <button className="stg-btn stg-btn--sm" style={{ marginTop: '8px' }} onClick={handleCreate} disabled={creating}>
                                {creating ? <LuLoader size={12} style={{ animation: 'spin 1.5s linear infinite' }} /> : <LuCheck size={12} />}
                                Add missing files
                            </button>
                        )}
                    </>
                ) : (
                    <div className="stg-ctx-empty">
                        <p className="stg-ctx-empty-msg">
                            No <code>context/</code> folder found in this project. Create it with the templates below to get started.
                        </p>
                    </div>
                )}
            </div>

            {/* Create wizard */}
            {(!status?.exists || FILE_DEFS.some(f => !fileExists(f.key))) && (
                <div>
                    <h3 className="stg-section-heading stg-section-heading--mb10">
                        {status?.exists ? 'Add Missing Files' : 'Create Context Folder'}
                    </h3>
                    <p className="stg-row-desc stg-row-desc--mb14">
                        Select which template files to generate. You can edit them afterwards in the file explorer.
                    </p>
                    <div className="stg-group stg-ctx-checklist">
                        {FILE_DEFS.filter(f => !fileExists(f.key)).map(f => (
                            <div
                                key={f.key}
                                className={`stg-ctx-check-row ${selectedFiles.includes(f.key) ? 'stg-ctx-check-row--on' : ''}`}
                                onClick={() => toggleFile(f.key)}
                            >
                                <div className="stg-ctx-check-box">
                                    {selectedFiles.includes(f.key) && <LuCheck size={10} />}
                                </div>
                                <div className="stg-ctx-check-body">
                                    <span className="stg-ctx-check-label" style={{ color: f.color }}>{f.label}</span>
                                    <span className="stg-ctx-check-desc">{f.desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        className="stg-btn stg-btn--primary stg-ctx-create-btn"
                        onClick={handleCreate}
                        disabled={creating || selectedFiles.length === 0}
                    >
                        {creating
                            ? <><LuLoader size={14} style={{ animation: 'spin 1.5s linear infinite' }} /> Creating…</>
                            : <><LuSparkles size={14} /> {status?.exists ? 'Add selected files' : 'Create context folder'}</>
                        }
                    </button>
                </div>
            )}

            {/* How it works */}
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb10">How it works</h3>
                <div className="stg-ctx-how">
                    <div className="stg-ctx-how-step">
                        <div className="stg-ctx-how-num">1</div>
                        <div>
                            <strong>Create the folder</strong>
                            <p>A <code>context/</code> folder is created at the root of your open project.</p>
                        </div>
                    </div>
                    <div className="stg-ctx-how-step">
                        <div className="stg-ctx-how-num">2</div>
                        <div>
                            <strong>Edit the files</strong>
                            <p>Open them from the file explorer (look for the brain icon in the sidebar) and fill in your real table names, column names, and business definitions.</p>
                        </div>
                    </div>
                    <div className="stg-ctx-how-step">
                        <div className="stg-ctx-how-num">3</div>
                        <div>
                            <strong>AI reads it automatically</strong>
                            <p>Every new Deep Dive conversation loads the context. No need to re-explain "revenue" or table relationships session after session.</p>
                        </div>
                    </div>
                    <div className="stg-ctx-how-step">
                        <div className="stg-ctx-how-num">4</div>
                        <div>
                            <strong>Version it with git</strong>
                            <p>Commit the <code>context/</code> folder to your repo. Your team shares the same AI definitions automatically.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick tip */}
            <div className="stg-ctx-tip">
                <LuSparkles size={12} />
                <span>
                    <strong>Tip:</strong> Ask the AI <em>"What metrics do you know about?"</em> or <em>"Do you have an example for cohort retention?"</em> to verify the context was loaded correctly.
                </span>
            </div>
        </div>
    );
}

// ─── External Skills Downloader ───────────────────────────────────────────────

function ExternalSkillsSection() {
    const downloadSkill = async (type) => {
        // Lazy-import so the module (and its constants.js dep) only loads when needed
        const { buildBasicSkill, buildAdvancedSkill } = await import('../../skills/externalSkillTemplates.js');
        const content = type === 'basic' ? buildBasicSkill() : buildAdvancedSkill();
        const filename = type === 'basic' ? 'amoxsql-data-skill.md' : 'amoxsql-data-viz-skill.md';
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ marginTop: 28 }}>
            <h3 className="stg-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <LuSparkles size={14} /> External AI Skills
            </h3>
            <p className="stg-row-desc stg-row-desc--mb14">
                Don't have API access or can't install Ollama? Upload one of these Skill files to any AI chat assistant you use at work. The skill teaches it to write DuckDB SQL and{' '}
                — in the advanced version — to generate Story Flow chart configurations.
            </p>
            <p className="stg-row-desc stg-row-desc--mb14">
                <strong>How to use:</strong> Download a Skill → upload it to your AI chat as a custom instruction or system prompt → use <em>Export for AI</em> in the results toolbar to copy your data context → paste it in the chat and ask questions.
            </p>
            <div className="stg-cloud-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 8 }}>
                <div className="stg-card">
                    <div className="stg-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LuBrain size={13} /> AmoxSQL Data Skill
                    </div>
                    <p className="stg-card-desc" style={{ marginTop: 4 }}>
                        DuckDB SQL expert. Responds with executable queries and insight summaries.
                        Ideal for users who only need SQL answers.
                    </p>
                    <button
                        className="stg-btn stg-btn--primary"
                        style={{ marginTop: 10, width: '100%' }}
                        onClick={() => downloadSkill('basic')}
                    >
                        <LuDownload size={12} style={{ marginRight: 6 }} />
                        Download amoxsql-data-skill.md
                    </button>
                </div>
                <div className="stg-card">
                    <div className="stg-card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <LuSparkles size={13} /> AmoxSQL Data &amp; Viz Skill
                    </div>
                    <p className="stg-card-desc" style={{ marginTop: 4 }}>
                        SQL expert + chart designer. Responds with SQL <em>and</em> a Vega-Lite chart you paste into Story Flow (Paste JSON) — the panels pick up what they understand.
                    </p>
                    <button
                        className="stg-btn stg-btn--primary"
                        style={{ marginTop: 10, width: '100%' }}
                        onClick={() => downloadSkill('advanced')}
                    >
                        <LuDownload size={12} style={{ marginRight: 6 }} />
                        Download amoxsql-data-viz-skill.md
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

// How "thinking" is toggled for an Ollama model (mirrors OLLAMA_FAMILY_RUNTIME
// on the server): 'native' = qwen3.5/qwen3/ornith (think param), 'gemma-token' =
// gemma4 (system-prompt token), 'always' = lfm2.5 (fixed on), 'none' = no control.
function thinkMechanism(modelName) {
    const n = String(modelName || '').toLowerCase();
    if (/^(qwen3\.5|qwen3|ornith)/.test(n)) return 'native';
    if (/^gemma4/.test(n)) return 'gemma-token';
    if (/^lfm2\.5/.test(n)) return 'always';
    return 'none';
}

export default function IA({
    adcTestResult,
    aiSubTab,
    anthropicApiKey,
    customModelInput,
    docsRefreshing,
    docsStatus,
    downloadProgress,
    duckdbDocsIntervalDays,
    duckdbDocsUpdate,
    gcpLocation,
    gcpProject,
    geminiApiKey,
    geminiModels,
    geminiUsage,
    handleDownloadModel,
    handleRefreshDuckdbDocs,
    handleSaveConfig,
    handleTestAdc,
    installedModels,
    isDownloading,
    isLoadingModels,
    isSaving,
    isTestingAdc,
    memoryExtraction,
    minimaxApiKey,
    modelTierOverrides,
    modoLlavero,
    ollamaKeepAlive,
    ollamaNumCtx,
    ollamaThinkOverrides,
    openExternalLink,
    plannerMode,
    provider,
    saveMessage,
    setAiSubTab,
    setAnthropicApiKey,
    setCustomModelInput,
    setDuckdbDocsIntervalDays,
    setDuckdbDocsUpdate,
    setGcpLocation,
    setGcpProject,
    setGeminiApiKey,
    setGeminiModels,
    setMemoryExtraction,
    setMinimaxApiKey,
    setModelTierOverrides,
    setOllamaKeepAlive,
    setOllamaNumCtx,
    setOllamaThinkOverrides,
    setPlannerMode,
    setProvider,
}) {
    return (
        <div className="stg-section">
            <TabWithSubTabs
                tabs={[
                    { id: 'modes',     label: 'Modes' },
                    { id: 'models',    label: 'Models' },
                    { id: 'knowledge', label: 'Knowledge' },
                    { id: 'skills',    label: 'Skills' },
                ]}
                activeTab={aiSubTab}
                onChange={setAiSubTab}
            />
            {aiSubTab === 'modes' && <div className="stg-subtab-content">
                <h3 className="stg-section-heading stg-section-heading--mb8">The two AI modes</h3>
                <p className="stg-card-desc" style={{ marginTop: 0 }}>
                    Same engine, different autonomy and scope. One works alongside you while you edit; the other runs the analysis for you.
                </p>
                <div className="stg-cloud-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '12px' }}>
                    <div className="stg-card">
                        <div className="stg-card-title">Assist <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· Ctrl+L</span></div>
                        <p className="stg-card-desc" style={{ marginTop: '4px' }}><strong>Your copilot in the editor.</strong></p>
                        <ul className="stg-card-desc" style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                            <li>Lives in the sidebar, bound to the open <code className="stg-code">.sql</code>/<code className="stg-code">.sqlnb</code> file.</li>
                            <li>Generate, fix or explain the current query; build a chart for the result.</li>
                            <li>Reactive and compact — you drive, it helps.</li>
                            <li><strong>Use it when:</strong> you're writing SQL or tweaking a chart and want a hand.</li>
                        </ul>
                    </div>
                    <div className="stg-card">
                        <div className="stg-card-title">Deep Dive</div>
                        <p className="stg-card-desc" style={{ marginTop: '4px' }}><strong>Your autonomous analyst.</strong></p>
                        <ul className="stg-card-desc" style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                            <li>Full-screen tab over the whole local database.</li>
                            <li>Plans steps, explores on its own, narrates findings and can build a notebook.</li>
                            <li>Proactive — you delegate the question.</li>
                            <li><strong>Use it when:</strong> you have a business question and want the whole analysis done.</li>
                        </ul>
                    </div>
                </div>
                <p className="stg-card-desc" style={{ marginTop: '12px' }}>
                    Rule of thumb: <strong>Assist</strong> while you work; <strong>Deep Dive</strong> when you want work done. You can promote an Assist chat to Deep Dive anytime with the ↗ button.
                </p>
            </div>}
            {aiSubTab === 'models' && <div className="stg-subtab-content">
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
                        <option value="anthropic">Anthropic Claude (Cloud)</option>
                        <option value="minimax">MiniMax (Cloud)</option>
                    </select>
                    <p className="stg-row-desc stg-mt8">
                        Choose between running fully private local models or using Cloud APIs.
                    </p>
                </div>
                <div className="stg-ai-actions">
                    <button onClick={handleSaveConfig} disabled={isSaving} className="stg-btn stg-btn--primary" title="Saves the whole configuration (AI, cloud, editor, etc.)">
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                    {saveMessage && (
                        <span className={`stg-save-msg stg-save-msg--${saveMessage.type}`}>
                            {saveMessage.type === 'success' ? '✓' : '×'} {saveMessage.text}
                        </span>
                    )}
                </div>
            </div>

            {/* Planner Toggle */}
            <div className="stg-row stg-row--separator">
                <div className="stg-flex-1">
                    <div className="stg-flex">
                        <h4 className="stg-section-heading stg-section-heading--mb4">Planner Agent (Auto-Loop)</h4>
                        <div className="stg-badge stg-badge--medium">Beta</div>
                    </div>
                    <p className="stg-row-desc">
                        Allow the AI to enter a thinking loop, automatically executing queries and fixing errors until the objective is met. Requires Medium/High tier model.
                    </p>
                </div>
                <Toggle on={plannerMode} onChange={() => setPlannerMode(!plannerMode)} />
            </div>

            <hr className="stg-divider" />

            {/* Gemini */}
            {provider === 'gemini' && (
                <>
                    <div className="stg-card stg-card--transparent">
                        <h4 className="stg-card-title stg-card-title--mb10">Authentication</h4>

                        {/* API Key */}
                        <div className="stg-field-label">Gemini API Key</div>
                        <div className="stg-flex--gap8 stg-mb8">
                            <input
                                type={geminiApiKey ? "password" : "text"}
                                className={`stg-input${geminiApiKey ? ' stg-input--mono' : ''}`}
                                value={valorVisible(geminiApiKey)}
                                onChange={(e) => setGeminiApiKey(e.target.value)}
                                placeholder={indicacion(geminiApiKey, "Enter API Key — or leave blank to use ADC (Vertex AI)")}
                            />
                            {geminiApiKey && (
                                <button onClick={() => setGeminiApiKey('')} className="stg-btn stg-btn--danger-text" title="Clear API Key">
                                    <LuX size={14} />
                                </button>
                            )}
                        </div>

                        {/* ADC fields — only relevant when no API key */}
                        {!geminiApiKey && (
                            <>
                                <div className="stg-adc-section">
                                    <div className="stg-adc-section-label">
                                        Application Default Credentials (ADC) — Vertex AI
                                    </div>
                                    <div className="stg-adc-fields">
                                        <div className="stg-adc-field">
                                            <div className="stg-field-label">GCP Project ID <span className="stg-required">*</span></div>
                                            <input
                                                type="text"
                                                className="stg-input stg-input--mono"
                                                value={gcpProject}
                                                onChange={(e) => setGcpProject(e.target.value)}
                                                placeholder="my-gcp-project-id"
                                            />
                                        </div>
                                        <div className="stg-adc-field stg-adc-field--sm">
                                            <div className="stg-field-label">Region / Location</div>
                                            <input
                                                type="text"
                                                className="stg-input stg-input--mono"
                                                value={gcpLocation}
                                                onChange={(e) => setGcpLocation(e.target.value)}
                                                placeholder="us-central1"
                                            />
                                        </div>
                                    </div>
                                    <div className="stg-flex--gap8 stg-mt8">
                                        <button
                                            onClick={handleTestAdc}
                                            disabled={isTestingAdc || !gcpProject}
                                            className="stg-btn"
                                            title={!gcpProject ? 'Enter a GCP Project ID first' : ''}
                                        >
                                            {isTestingAdc ? 'Testing ADC...' : 'Test ADC Connection'}
                                        </button>
                                    </div>
                                    {adcTestResult && (
                                        <div className={`stg-alert stg-alert--${adcTestResult.type} stg-mt8`}
                                             style={{ whiteSpace: 'pre-wrap' }}>
                                            {adcTestResult.text}
                                        </div>
                                    )}
                                    <p className="stg-card-desc stg-card-desc--mt8">
                                        Run <code className="stg-code">gcloud auth application-default login</code> first.
                                        Your GCP account needs the <strong>Vertex AI User</strong> role on the project.
                                        Settings are stored in <code className="stg-code">~/.amoxsql/config.json</code>.
                                    </p>
                                </div>
                            </>
                        )}

                        {geminiApiKey && (
                            <p className="stg-card-desc">
                                API Key mode active. {modoLlavero === 'llavero'
                                    ? <>Your key is encrypted in your system keychain.</>
                                    : <>Your key is stored in <code className="stg-code">~/.amoxsql/config.json</code>.</>} Clear the key to switch to ADC (Vertex AI).
                            </p>
                        )}
                    </div>

                    <div className="stg-card stg-card--mb14">
                        <div className="stg-flex stg-card-title--mb12" style={{justifyContent:'space-between'}}>
                            <h4 className="stg-card-title" style={{marginBottom: 0}}>Gemini Models Registry</h4>
                            <button onClick={() => {
                                setGeminiModels([...geminiModels, { id: 'new-model', category: 'flash', dailyLimit: 0, contextWindow: 128000, costPerMInput: 0 }]);
                            }} className="stg-btn">Add Model</button>
                        </div>
                        <div className="stg-gemini-grid">
                            {geminiModels.map((m, idx) => (
                                <div key={idx} className="stg-gemini-row">
                                    <div className="stg-flex-1">
                                        <div className="stg-field-label">Model ID</div>
                                        <input type="text" className="stg-input stg-input--mono" value={m.id} onChange={(e) => {
                                            const newModels = [...geminiModels];
                                            newModels[idx].id = e.target.value;
                                            setGeminiModels(newModels);
                                        }} />
                                    </div>
                                    <div>
                                        <div className="stg-field-label">Category</div>
                                        <select className="stg-select" value={m.category} onChange={(e) => {
                                            const newModels = [...geminiModels];
                                            newModels[idx].category = e.target.value;
                                            setGeminiModels(newModels);
                                        }}>
                                            <option value="flash-lite">Flash Lite (Low)</option>
                                            <option value="flash">Flash (Medium)</option>
                                            <option value="pro">Pro (High)</option>
                                        </select>
                                    </div>
                                    <button onClick={() => {
                                        const newModels = [...geminiModels];
                                        newModels.splice(idx, 1);
                                        setGeminiModels(newModels);
                                    }} className="stg-btn stg-btn--danger-text"><LuTrash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="stg-card">
                        <h4 className="stg-card-title stg-card-title--mb12">Usage Dashboard</h4>
                        <div className="stg-flex-col">
                            <div className="stg-row stg-row--mb4">
                                <span className="stg-stat-label--bold">Flash Lite</span>
                                <span className="stg-stat-label--bold">{geminiUsage.flashLite} requests</span>
                            </div>
                            <div className="stg-row stg-row--mb4">
                                <span className="stg-stat-label--bold">Flash</span>
                                <span className="stg-stat-label--bold">{geminiUsage.flash} requests</span>
                            </div>
                            <div className="stg-row stg-row--mb4">
                                <span className="stg-stat-label--bold">Pro</span>
                                <span className="stg-stat-label--bold">{geminiUsage.pro} requests</span>
                            </div>
                            <div className="stg-alert stg-alert--success stg-mt8" style={{marginTop:'8px'}}>
                                <LuInfo size={14}/> Models configured as 'Pro' will use your billing quota immediately. AmoxSQL only tracks local usage.
                            </div>
                            <div className="stg-row stg-row--separator">
                                <span className="stg-stat-label--muted">Total Tokens Consumed</span>
                                <span className="stg-stat-label--bold">
                                    {geminiUsage.tokens.toLocaleString()} <span className="stg-stat-token">tokens</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Anthropic */}
            {provider === 'anthropic' && (
                <>
                    <div className="stg-card stg-card--transparent">
                        <h4 className="stg-card-title stg-card-title--mb10">Authentication</h4>
                        <div className="stg-flex--gap8">
                            <input
                                type={anthropicApiKey ? "password" : "text"}
                                className={`stg-input${anthropicApiKey ? ' stg-input--mono' : ''}`}
                                value={valorVisible(anthropicApiKey)}
                                onChange={(e) => setAnthropicApiKey(e.target.value)}
                                placeholder={indicacion(anthropicApiKey, "Enter your Anthropic API Key")}
                            />
                            {anthropicApiKey && (
                                <button onClick={() => setAnthropicApiKey('')} className="stg-btn stg-btn--danger-text" title="Clear API Key">
                                    <LuX size={14} />
                                </button>
                            )}
                        </div>
                        <p className="stg-card-desc stg-card-desc--mt8">
                            Your key is stored securely in your computer's home directory (~/.amoxsql/).
                        </p>
                    </div>
                </>
            )}

            {/* MiniMax */}
            {provider === 'minimax' && (
                <>
                    <div className="stg-card stg-card--transparent">
                        <h4 className="stg-card-title stg-card-title--mb10">Authentication</h4>
                        <div className="stg-flex--gap8">
                            <input
                                type={minimaxApiKey ? "password" : "text"}
                                className={`stg-input${minimaxApiKey ? ' stg-input--mono' : ''}`}
                                value={valorVisible(minimaxApiKey)}
                                onChange={(e) => setMinimaxApiKey(e.target.value)}
                                placeholder={indicacion(minimaxApiKey, "Enter your MiniMax API Key")}
                            />
                            {minimaxApiKey && (
                                <button onClick={() => setMinimaxApiKey('')} className="stg-btn stg-btn--danger-text" title="Clear API Key">
                                    <LuX size={14} />
                                </button>
                            )}
                        </div>
                        <p className="stg-card-desc stg-card-desc--mt8">
                            Your key is stored securely in your computer's home directory (~/.amoxsql/).
                        </p>
                    </div>
                </>
            )}

            {/* Ollama */}
            {provider === 'ollama' && (
                <>
                    <div>
                        <div className="stg-row stg-row--mb8">
                            <div className="stg-flex">
                                <h3 className="stg-section-heading" style={{marginBottom: 0}}>Model Tiers</h3>
                                {isLoadingModels && <LuLoader size={14} className="stg-spin--muted" />}
                            </div>
                            <span className="stg-stat-label--muted">Drag models to override tier</span>
                        </div>
                        <div className="stg-cloud-grid" style={{gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px'}}>
                            {['low', 'medium', 'high'].map(tierLevel => {
                                const tierModels = installedModels.filter(m => {
                                    const userTier = modelTierOverrides[m.name.toLowerCase()];
                                    return userTier ? userTier === tierLevel : m.tier === tierLevel;
                                });
                                
                                return (
                                    <div 
                                        key={tierLevel} 
                                        className="stg-tier-zone"
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                        onDragLeave={(e) => { e.currentTarget.classList.remove('drag-over'); }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.classList.remove('drag-over');
                                            const modelName = e.dataTransfer.getData('text/plain');
                                            if (modelName) {
                                                setModelTierOverrides(prev => ({
                                                    ...prev,
                                                    [modelName.toLowerCase()]: tierLevel
                                                }));
                                            }
                                        }}
                                    >
                                        <div className="stg-tier-header">
                                            <div className={`stg-tier-title stg-tier-title--${tierLevel}`}>
                                                {tierLevel.charAt(0).toUpperCase() + tierLevel.slice(1)} Tier
                                            </div>
                                            <div className="stg-tier-desc">{tierModels.length} models</div>
                                        </div>
                                        <div className="stg-tier-content">
                                            {tierModels.length === 0 ? (
                                                <div className="stg-tier-empty">Drop models here</div>
                                            ) : (
                                                tierModels.map(m => (
                                                    <div 
                                                        key={m.name} 
                                                        className="stg-model-chip"
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', m.name);
                                                            e.currentTarget.classList.add('is-dragging');
                                                        }}
                                                        onDragEnd={(e) => {
                                                            e.currentTarget.classList.remove('is-dragging');
                                                        }}
                                                    >
                                                        <div className="stg-model-info">
                                                            <div className="stg-model-name">
                                                                <LuCpu size={12} className="stg-icon-accent" />
                                                                {m.name}
                                                            </div>
                                                            <div className="stg-model-meta">
                                                                <span>{m.parameterSize || m.size}</span>
                                                                {modelTierOverrides[m.name.toLowerCase()] && <span style={{color: 'var(--accent-primary)'}}>(User Override)</span>}
                                                            </div>
                                                        </div>
                                                        <div className="stg-model-caps">
                                                            {m.capabilities?.includes('tools') && <div className="stg-cap-badge" title="Tool Calling"><LuWrench size={10} /></div>}
                                                            {m.capabilities?.includes('vision') && <div className="stg-cap-badge" title="Vision"><LuEye size={10} /></div>}
                                                            {m.capabilities?.includes('thinking') && <div className="stg-cap-badge" title="Thinking"><LuBrain size={10} /></div>}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <p className="stg-card-desc stg-card-desc--mt10">
                            Tiers dictate capabilities: Low (Prompts only), Medium (Tools + SQL), High (Tools + Charts + Advanced Planner).
                            Default tiers are auto-detected using Ollama's API based on tool and thinking support.
                        </p>
                    </div>

                    {/* ── AI Local Performance (F1/F4/F5) ── */}
                    <div className="stg-card stg-card--transparent">
                        <h4 className="stg-card-title stg-card-title--mb12">
                            <LuSparkles size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                            Local AI performance
                        </h4>

                        {/* Runtime: keep_alive + num_ctx */}
                        <div className="stg-row stg-row--separator">
                            <div className="stg-flex-1">
                                <h4 className="stg-section-heading stg-section-heading--mb4">Model in memory (keep-alive)</h4>
                                <p className="stg-row-desc">How long the model stays loaded after you use it. Longer = no reload wait when you come back. E.g. <code>4h</code>, <code>30m</code>, <code>-1</code> (always).</p>
                            </div>
                            <input
                                type="text"
                                className="stg-input"
                                style={{ width: 90 }}
                                value={ollamaKeepAlive}
                                onChange={(e) => setOllamaKeepAlive(e.target.value)}
                                placeholder="4h"
                            />
                        </div>

                        <div className="stg-row stg-row--separator">
                            <div className="stg-flex-1">
                                <h4 className="stg-section-heading stg-section-heading--mb4">Context window (num_ctx)</h4>
                                <p className="stg-row-desc">Context tokens per model. <code>0</code> = automatic (8k for small models, 16k for the rest). It has to fit in VRAM so it does not spill to CPU.</p>
                            </div>
                            <input
                                type="number"
                                className="stg-input"
                                style={{ width: 90 }}
                                value={ollamaNumCtx}
                                min={0} step={2048}
                                onChange={(e) => setOllamaNumCtx(Number(e.target.value) || 0)}
                            />
                        </div>

                        {/* Memory extraction policy */}
                        <div className="stg-row stg-row--separator">
                            <div className="stg-flex-1">
                                <h4 className="stg-section-heading stg-section-heading--mb4">Memory extraction</h4>
                                <p className="stg-row-desc">Analyses every conversation to remember preferences. Locally it costs an extra model call that competes for the slot — which is why the default avoids it on Ollama.</p>
                            </div>
                            <select
                                className="stg-select"
                                style={{ width: 150 }}
                                value={memoryExtraction}
                                onChange={(e) => setMemoryExtraction(e.target.value)}
                            >
                                <option value="cloud-only">Cloud only</option>
                                <option value="always">Always</option>
                                <option value="off">Off</option>
                            </select>
                        </div>

                        {/* Per-model thinking control */}
                        <div style={{ marginTop: 10 }}>
                            <h4 className="stg-section-heading stg-section-heading--mb4">Reasoning (thinking) per model</h4>
                            <p className="stg-row-desc" style={{ marginBottom: 8 }}>
                                "Thinking" improves complex answers but adds latency (the model writes before it answers you). <strong>Auto</strong> uses the recommended default for each model.
                            </p>
                            {installedModels.filter(m => thinkMechanism(m.name) !== 'none').length === 0 ? (
                                <p className="stg-row-desc" style={{ opacity: 0.7 }}>No installed model lets you control its reasoning.</p>
                            ) : (
                                installedModels.filter(m => thinkMechanism(m.name) !== 'none').map(m => {
                                    const mech = thinkMechanism(m.name);
                                    const fixed = mech === 'always';
                                    const val = fixed ? 'always' : (ollamaThinkOverrides[m.name] || 'auto');
                                    return (
                                        <div key={m.name} className="stg-row" style={{ padding: '5px 0' }}>
                                            <div className="stg-flex-1" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                                <LuBrain size={12} style={{ color: 'var(--accent-primary)' }} />
                                                {m.name}
                                            </div>
                                            {fixed ? (
                                                <span className="stg-row-desc" style={{ opacity: 0.7 }} title="This model always reasons, by design">Always on</span>
                                            ) : (
                                                <select
                                                    className="stg-select"
                                                    style={{ width: 110 }}
                                                    value={val}
                                                    onChange={(e) => setOllamaThinkOverrides(prev => {
                                                        const next = { ...prev };
                                                        if (e.target.value === 'auto') delete next[m.name];
                                                        else next[m.name] = e.target.value;
                                                        return next;
                                                    })}
                                                >
                                                    <option value="auto">Auto</option>
                                                    <option value="on">Activado</option>
                                                    <option value="off">Desactivado</option>
                                                </select>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* ── Documentación de DuckDB (offline) (D4) ── */}
                    <div className="stg-card stg-card--transparent">
                        <h4 className="stg-card-title stg-card-title--mb12">
                            <LuGlobe size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                            DuckDB documentation (offline)
                        </h4>
                        <p className="stg-card-desc" style={{ marginBottom: 12 }}>
                            The AI can look up the official DuckDB documentation (bundled, offline) to get specific syntax right (EXCLUDE, QUALIFY, PIVOT, list comprehensions…). It always works with the bundled copy; you can keep it up to date.
                        </p>

                        <div className="stg-row stg-row--separator">
                            <div className="stg-flex-1">
                                <h4 className="stg-section-heading stg-section-heading--mb4">Status</h4>
                                <p className="stg-row-desc">
                                    {docsStatus?.available
                                        ? <>Last update: <strong>{docsStatus.extractedAt ? new Date(docsStatus.extractedAt).toLocaleDateString() : '—'}</strong> · {docsStatus.count} topics · {docsStatus.source === 'user' ? 'updated' : 'bundled copy'}</>
                                        : 'Loading…'}
                                </p>
                            </div>
                            <button
                                className="stg-btn stg-btn--secondary"
                                onClick={handleRefreshDuckdbDocs}
                                disabled={docsRefreshing || duckdbDocsUpdate === 'off'}
                                title={duckdbDocsUpdate === 'off' ? 'Switch it to Manual or Automatic to update' : 'Download the latest documentation'}
                            >
                                {docsRefreshing
                                    ? <><LuLoader size={13} style={{ animation: 'spin 1s linear infinite', marginRight: 5, verticalAlign: '-2px' }} />Updating…</>
                                    : <><LuDownload size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />Update now</>}
                            </button>
                        </div>

                        <div className="stg-row stg-row--separator">
                            <div className="stg-flex-1">
                                <h4 className="stg-section-heading stg-section-heading--mb4">Updates</h4>
                                <p className="stg-row-desc">
                                    <strong>Bundled only</strong>: never downloads, fully offline. <strong>Manual</strong>: you decide, with the button. <strong>Automatic</strong>: AmoxSQL refreshes it every so often.
                                </p>
                            </div>
                            <select
                                className="stg-select"
                                style={{ width: 150 }}
                                value={duckdbDocsUpdate}
                                onChange={(e) => setDuckdbDocsUpdate(e.target.value)}
                            >
                                <option value="off">Bundled only (offline)</option>
                                <option value="manual">Manual</option>
                                <option value="auto">Automatic</option>
                            </select>
                        </div>

                        {duckdbDocsUpdate === 'auto' && (
                            <div className="stg-row">
                                <div className="stg-flex-1">
                                    <h4 className="stg-section-heading stg-section-heading--mb4">How often (days)</h4>
                                    <p className="stg-row-desc">How many days between AmoxSQL checking for a newer version at startup.</p>
                                </div>
                                <input
                                    type="number"
                                    className="stg-input"
                                    style={{ width: 90 }}
                                    value={duckdbDocsIntervalDays}
                                    min={1} step={1}
                                    onChange={(e) => setDuckdbDocsIntervalDays(Number(e.target.value) || 30)}
                                />
                            </div>
                        )}
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
                                        <div className="stg-model-card-header">
                                            <div className="stg-model-card-name">{m.label}</div>
                                            {m.isNew && <div className="stg-badge stg-badge--new" style={{display: 'flex', alignItems: 'center', gap: '4px'}}><LuSparkles size={10} /> New</div>}
                                            {!m.isNew && m.tier && <div className={`stg-badge stg-badge--${m.tier}`}>{m.tier.toUpperCase()}</div>}
                                        </div>
                                        <div className="stg-model-card-desc">{m.desc} ({m.size})</div>
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
            </div>}
            {/* ── Knowledge sub-tab: Memories + AI Context ── */}
            {aiSubTab === 'knowledge' && <div className="stg-subtab-content">
            <div>
                <h3 className="stg-section-title">AI Memories</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    Memories are facts and rules that AmoxSQL AI automatically extracts from your conversations to personalize future responses.
                </p>
                <MemoriesPanel />
            </div>
            <hr className="stg-divider" />
            <div>
                <h3 className="stg-section-title">AI Context (Semantic Layer)</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    Define business metrics, joins and a domain glossary so the AI understands your data.
                </p>
                <AiContextTab />
            </div>
            </div>}
            {/* ── Skills sub-tab ── */}
            {aiSubTab === 'skills' && <div className="stg-subtab-content">
            <div>
                <h3 className="stg-section-title">AI Skills</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    Skills are specialized workflows that guide the AI agent for specific analysis types. They are loaded from <code style={{ fontSize: 11 }}>agent/skills/</code> in your project.
                </p>
                <SkillsPanel />
            </div>
            <ExternalSkillsSection />
            </div>}
        </div>
    );
}
