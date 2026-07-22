import React, { useState, useEffect, useRef } from 'react';
import { API_BASE as API } from '../api.js';
import { LuX, LuPalette, LuMoon, LuSun, LuCpu, LuDownload, LuCheck, LuLoader, LuInfo, LuGithub, LuGlobe, LuHeart, LuRows3, LuColumns3, LuCode, LuCloud, LuKeyboard, LuSettings, LuTrash2, LuBrain, LuWrapText, LuWrench, LuEye, LuSparkles, LuLayoutGrid, LuFolderOpen, LuCircleCheck, LuCircle, LuPlug, LuFileSpreadsheet, LuCopy, LuGitBranch } from 'react-icons/lu';
import MemoriesPanel from './ai/MemoriesPanel';
import SkillsPanel from './ai/SkillsPanel';
import TabWithSubTabs from './settings/TabWithSubTabs';
import { useToast } from './ToastProvider';
import { useDialog } from './dialogs/DialogProvider';
import { StoryFlowGuide } from './DataVisualizer/StoryFlowGuide';
import { DataFlowGuide } from './chains/DataFlowGuide';
import { openTour, hasSeenTour } from './onboarding/tourRegistry';

const RECOMMENDED_MODELS = [
    // ── Edge / Lightweight ──
    { id: 'gemma4:e2b', label: 'Gemma 4 E2B', size: '~1.6GB', desc: 'Tool calling nativo en 2B. Ideal para empezar.', tier: 'medium', isNew: true },
    { id: 'qwen3.5:2b', label: 'Qwen 3.5 (2B)', size: '~1.5GB', desc: 'Ultra ligero con contexto de 32K.', tier: 'low' },
    
    // ── Balanced ──
    { id: 'gemma4:e4b', label: 'Gemma 4 E4B', size: '~2.8GB', desc: 'Balance perfecto: tool calling + audio + vision.', tier: 'medium', isNew: true },
    { id: 'qwen3.5:4b', label: 'Qwen 3.5 (4B)', size: '~2.5GB', desc: 'Líder en tool calling para su tamaño.', tier: 'medium' },
    
    // ── Powerful ──
    { id: 'gemma4:26b', label: 'Gemma 4 26B', size: '~16GB', desc: 'MoE: Solo 4B activo pero potencia de 26B.', tier: 'high', isNew: true },
    { id: 'qwen3.5:9b', label: 'Qwen 3.5 (9B)', size: '~5.5GB', desc: 'Excelente para análisis complejos.', tier: 'medium' },
    
    // ── Maximum ──
    { id: 'gemma4:31b', label: 'Gemma 4 31B', size: '~20GB', desc: 'Calidad máxima local. #3 en Arena.', tier: 'high', isNew: true },
    { id: 'qwen3.5:27b', label: 'Qwen 3.5 (27B)', size: '~16GB', desc: 'Contexto de 256K. Potencia bruta.', tier: 'high' }
];

const THEMES = [
    { id: 'amoxdark',  label: 'Amox Dark',    icon: <LuMoon size={14} />, sidebar: '#151b22', editor: '#0f141a', text: '#22d3ee', desc: 'Signature · cyan brand' },
    { id: 'dark',      label: 'Obsidian',     icon: <LuMoon size={14} />, sidebar: '#191b1f', editor: '#0b0c0d', text: '#ccc',    desc: 'Deepest dark' },
    { id: 'onyx',      label: 'Onyx',         icon: <LuMoon size={14} />, sidebar: '#131415', editor: '#111214', text: '#ccc',    desc: 'True black' },
    { id: 'nord',      label: 'Nord Dark',    icon: <LuMoon size={14} />, sidebar: '#151920', editor: '#222833', text: '#d8dee9', desc: 'Polar night' },
    { id: 'islands',   label: 'Dark Islands', icon: <LuMoon size={14} />, sidebar: '#1e2024', editor: '#181a1d', text: '#bcbec4', desc: 'JetBrains-inspired' },
    { id: 'ayu',       label: 'Ayu Dark',     icon: <LuMoon size={14} />, sidebar: '#141821', editor: '#0d1017', text: '#e6b450', desc: 'Ink blue · gold accent' },
    { id: 'sterlingdark',  label: 'Sterling Dark',  icon: <LuMoon size={14} />, sidebar: '#1d1530', editor: '#120d1f', text: '#c4b5fd', desc: 'Sterling · by La Matemaga' },
    { id: 'sterlingdeep',  label: 'Sterling Deep',  icon: <LuMoon size={14} />, sidebar: '#0b0912', editor: '#08060f', text: '#c4b5fd', desc: 'Sterling · deep & calm' },
    { id: 'amoxlight', label: 'Amox Light',   icon: <LuSun size={14} />,  sidebar: '#f8fafb', editor: '#f1f4f7', text: '#0a7d8c', desc: 'Signature · teal brand' },
    { id: 'sterlinglight', label: 'Sterling Light', icon: <LuSun size={14} />,  sidebar: '#fbf9fe', editor: '#f6f3fb', text: '#7c5ce0', desc: 'Sterling · by La Matemaga' },
    { id: 'ivory',     label: 'Ivory',        icon: <LuSun size={14} />,  sidebar: '#f3ede4', editor: '#faf6ef', text: '#3b3228', desc: 'Warm paper' },
    { id: 'mist',      label: 'Mist',         icon: <LuSun size={14} />,  sidebar: '#e8ecf2', editor: '#f2f4f8', text: '#2c3444', desc: 'Cool fog' },
    { id: 'light',     label: 'Light',        icon: <LuSun size={14} />,  sidebar: '#f2f3f5', editor: '#ffffff', text: '#333',    desc: 'Clean & bright' },
];

const VIBRANT_ACCENTS = [
    { id: 'cyan', color: '#00FFFF', label: 'Cyan (Default)' },
    { id: 'amox-2', color: '#00F5FF', label: 'Aqua' },
    { id: 'amox-4', color: '#00DAFF', label: 'Sky' },
    { id: 'amox-6', color: '#00B6FF', label: 'Azure' },
    { id: 'amox-8', color: '#0090FF', label: 'Blue' },
    { id: 'amox-10', color: '#0068FF', label: 'Cobalt' },
    { id: 'linear',  color: '#5E6AD2', label: 'Linear Blue' },
    { id: 'islands', color: '#548af7', label: 'Islands Blue' },
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
    appearance:  'Appearance',
    editor:      'Editor',
    behavior:    'Behavior',
    ai:          'AI',
    integrations:'Store Integrations',
    workspace:   'Workspace',
    shortcuts:   'Keyboard Shortcuts',
    about:       'About AmoxSQL',
    storyflow:   'Story Flow',
    dataflow:    'Data Flow',
    // Legacy aliases so existing initialTab values keep working
    formatter:   'Editor',
    memories:    'AI',
    aicontext:   'AI',
    cloud:       'Store Integrations',
    gallery:     'Chart Gallery',
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
            { keys: 'Ctrl + L', description: 'Toggle Assist' },
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
        if (!hasSeenTour('ai-context')) openTour('ai-context');
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

// ─── Reusable Toggle Component ───
const Toggle = ({ on, onChange }) => (
    <div className={`stg-toggle${on ? ' stg-toggle--on' : ''}`} onClick={onChange}>
        <div className="stg-toggle-knob" />
    </div>
);

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
            window.dispatchEvent(new Event('amox_files_changed'));
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
                Canonical workspace folders help keep your project organized.
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
                        onClick={() => window.dispatchEvent(new CustomEvent('amox_open_workspace_wizard'))}
                    >
                        Open Workspace Wizard
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
const LEGACY_TAB_MAP = {
    formatter:    { tab: 'editor',     sub: 'formatting' },
    memories:     { tab: 'ai',         sub: 'knowledge' },
    aicontext:    { tab: 'ai',         sub: 'knowledge' },
    cloud:        { tab: 'integrations', sub: null },
    gallery:      { tab: 'appearance', sub: null },
};

// ─── External Skills Downloader ───────────────────────────────────────────────

function ExternalSkillsSection() {
    const downloadSkill = async (type) => {
        // Lazy-import so the module (and its constants.js dep) only loads when needed
        const { buildBasicSkill, buildAdvancedSkill } = await import('../skills/externalSkillTemplates.js');
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
                        SQL expert + Story Flow chart designer. Responds with SQL <em>and</em> a chart configuration JSON you can paste directly into Story Flow.
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

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange, currentAccent, onAccentChange, currentInterfaceFont = 'manrope', onInterfaceFontChange, currentLayout, onLayoutChange, editorSettings = {}, onEditorSettingsChange, initialTab, onTabReset, uiZoomLevel = 1.0, onUiZoomChange }) => {
    const [activeTab, setActiveTab] = useState('appearance');
    const [editorSubTab, setEditorSubTab]   = useState('general');
    const [aiSubTab,     setAiSubTab]       = useState('models');
    const [settingsSearch, setSettingsSearch] = useState('');
    const contentRef = useRef(null);
    const toast = useToast();
    const dialog = useDialog();

    // AI Settings State
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [anthropicApiKey, setAnthropicApiKey] = useState('');
    const [minimaxApiKey, setMinimaxApiKey] = useState('');
    const [provider, setProvider] = useState('ollama');
    const [defaultModel, setDefaultModel] = useState('qwen3:1.7b');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [geminiUsage, setGeminiUsage] = useState({ flashLite: 0, flash: 0, pro: 0, tokens: 0 });
    const [plannerMode, setPlannerMode] = useState(true);
    const [geminiModels, setGeminiModels] = useState([]);
    const [modelTierOverrides, setModelTierOverrides] = useState({});

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
            const res = await fetch(`${API}/api/settings/ollama/models-enriched`);
            const data = await res.json();
            if (data.models) setInstalledModels(data.models);
        } catch (err) { console.error(err); }
        finally { setIsLoadingModels(false); }
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
                    modelTierOverrides
                })
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
                        { id: 'workspace',     icon: <LuFolderOpen size={16} />, label: 'Workspace' },
                        // ── Help & info ──
                        { separator: true, id: '_sep_help' },
                        { id: 'shortcuts',     icon: <LuKeyboard  size={16} />, label: 'Shortcuts' },
                        { id: 'storyflow',     icon: <LuSparkles  size={16} />, label: 'Story Flow' },
                        { id: 'dataflow',      icon: <LuGitBranch size={16} />, label: 'Data Flow' },
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
                        <h2 className="stg-content-title">{TAB_TITLES[activeTab]}</h2>
                        <button onClick={onClose} className="stg-close-btn"><LuX size={18} /></button>
                    </div>

                    <div className="stg-content-body" ref={contentRef}>

                        {/* ═══ STORY FLOW ═══ */}
                        {activeTab === 'storyflow' && (
                            <div className="stg-section">
                                <StoryFlowGuide />
                                <div style={{ marginTop: '18px' }}>
                                    <button
                                        onClick={() => { try { localStorage.removeItem('amoxsql-storyflow-tour-seen'); } catch (e) {} window.dispatchEvent(new CustomEvent('amox_replay_storyflow_tour')); }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--accent-color-user, #5E6AD2)', color: 'var(--button-text-color, #fff)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                                    >
                                        <LuSparkles size={14} /> Replay tour
                                    </button>
                                    <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Opens the step-by-step tour the next time you open a chart.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ═══ DATA FLOW ═══ */}
                        {activeTab === 'dataflow' && (
                            <div className="stg-section">
                                <DataFlowGuide />
                                <div style={{ marginTop: '18px' }}>
                                    <button
                                        onClick={() => { try { localStorage.removeItem('amoxsql-dataflow-tour-seen'); } catch (e) {} window.dispatchEvent(new CustomEvent('amox_replay_dataflow_tour')); }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--accent-color-user, #5E6AD2)', color: 'var(--button-text-color, #fff)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                                    >
                                        <LuGitBranch size={14} /> Replay tour
                                    </button>
                                    <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Opens the step-by-step tour the next time you open a Data Flow.
                                    </p>
                                </div>
                            </div>
                        )}

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

                                {/* Interface Font */}
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb12">Interface Font</h3>
                                    <select
                                        value={currentInterfaceFont}
                                        onChange={e => onInterfaceFontChange?.(e.target.value)}
                                        style={{
                                            width: '100%', maxWidth: 300, padding: '8px 10px',
                                            background: 'var(--input-bg)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 6, fontSize: 13,
                                            fontFamily: 'var(--font-sans)',
                                        }}
                                    >
                                        <option value="manrope">Manrope</option>
                                        <option value="inter">Inter</option>
                                        <option value="lato">Lato</option>
                                        <option value="ibm-plex">IBM Plex Sans</option>
                                        <option value="space-grotesk">Space Grotesk</option>
                                        <option value="lora">Lora (serif)</option>
                                        <option value="system">System Default</option>
                                    </select>
                                    <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                                        Applies to the whole interface. The code editor font is configured separately under Editor.
                                    </p>
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

                                {/* Interface Scale */}
                                <hr className="stg-divider" />
                                <div>
                                    <h3 className="stg-section-heading stg-section-heading--mb4">Interface Scale</h3>
                                    <p className="stg-row-desc stg-row-desc--mb14">
                                        Adjust the size of all UI elements (menus, sidebar, tabs, panels). Similar to browser zoom.
                                    </p>
                                    <div className="stg-group">
                                        <div className="stg-row">
                                            <span className="stg-row-label">Scale</span>
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
                                {<div className="stg-subtab-content">
                                {/* Layout */}
                                <div>
                                    <h3 className="stg-section-title">Layout</h3>
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
                                <hr className="stg-divider" />
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
                                                <option value="'Manrope', sans-serif">Manrope (sans-serif)</option>
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
                                    </div>
                                </div>

                                <hr className="stg-divider" />

                                {/* Cursor */}
                                <div>
                                    <h3 className="stg-section-title">Cursor</h3>
                                    <div className="stg-group stg-group--mt14">
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

                                {/* Results */}
                                <div>
                                    <h3 className="stg-section-title">Results</h3>
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
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Default Results Limit</span>
                                                <p className="stg-row-desc">Maximum number of rows to return on quick SELECT operations</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w120"
                                                value={editorSettings.queryResultLimit ?? 10000}
                                                onChange={(e) => onEditorSettingsChange?.({ queryResultLimit: parseInt(e.target.value) })}
                                            >
                                                <option value={100}>100 rows</option>
                                                <option value={500}>500 rows</option>
                                                <option value={1000}>1,000 rows</option>
                                                <option value={5000}>5,000 rows</option>
                                                <option value={10000}>10,000 rows</option>
                                                <option value={50000}>50,000 rows</option>
                                                <option value={0}>Sin límite</option>
                                            </select>
                                        </div>
                                        {editorSettings.queryResultLimit === 0 && (
                                            <div className="stg-alert stg-alert--warning stg-mt8">
                                                <strong>Advertencia:</strong> Quitar el límite de resultados puede causar un consumo excesivo de memoria o congelar la interfaz si la tabla tiene demasiados registros. Recomendamos usar SQL Notebooks con consultas agregadas para explorar datos masivos.
                                            </div>
                                        )}
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
                                <hr className="stg-divider" />
                                {/* Markdown Editor */}
                                <div>
                                    <h3 className="stg-section-title">Markdown Editor</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Default View Mode</span>
                                                <p className="stg-row-desc">Starting view when opening a .md file</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={editorSettings.markdownDefaultView || 'edit'}
                                                onChange={(e) => onEditorSettingsChange?.({ markdownDefaultView: e.target.value })}
                                            >
                                                <option value="edit">Edit only</option>
                                                <option value="split">Split (Edit + Preview)</option>
                                                <option value="preview">Preview only</option>
                                            </select>
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Show Formatting Toolbar</span>
                                                <p className="stg-row-desc">Display the markdown formatting toolbar in .md files</p>
                                            </div>
                                            <Toggle
                                                on={editorSettings.markdownToolbarVisible ?? true}
                                                onChange={() => onEditorSettingsChange?.({ markdownToolbarVisible: !(editorSettings.markdownToolbarVisible ?? true) })}
                                            />
                                        </div>
                                    </div>
                                </div>
                                </div>}
                                {/* ── Formatting (merged into the same section) ── */}
                                {<div className="stg-subtab-content">
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
                                    </div>
                                </div>

                                <div className="stg-row" style={{ marginTop: 8 }}>
                                    <div>
                                        <span className="stg-row-label">Save Formatter Settings</span>
                                        <p className="stg-row-desc">Persist your current formatting preferences</p>
                                    </div>
                                    <button
                                        className="stg-btn stg-btn--primary"
                                        onClick={saveFormatterConfig}
                                    >
                                        {formatterSaved ? <><LuCheck size={14} /> Saved!</> : 'Apply & Save'}
                                    </button>
                                </div>
                                </div>}
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
                                                <span className="stg-row-label">Show Welcome Screen</span>
                                                <p className="stg-row-desc">Show the welcome screen when AmoxSQL starts</p>
                                            </div>
                                            <Toggle on={(editorSettings.showWelcomeOnStart ?? true)} onChange={() => onEditorSettingsChange?.({ showWelcomeOnStart: !(editorSettings.showWelcomeOnStart ?? true) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Toggle Sidebar on Active Tab Click</span>
                                                <p className="stg-row-desc">Collapse the sidebar when clicking the currently active tab icon</p>
                                            </div>
                                            <Toggle on={(editorSettings.toggleSidebarOnActiveTabClick ?? true)} onChange={() => onEditorSettingsChange?.({ toggleSidebarOnActiveTabClick: !(editorSettings.toggleSidebarOnActiveTabClick ?? true) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Default Data File Action</span>
                                                <p className="stg-row-desc">What happens when clicking data files (.csv, .json, .parquet)</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={editorSettings.defaultDataFileAction || 'preview'}
                                                onChange={(e) => onEditorSettingsChange?.({ defaultDataFileAction: e.target.value })}
                                            >
                                                <option value="preview">Open Quick Preview Modal</option>
                                                <option value="query">Open Direct Query</option>
                                            </select>
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
                                {/* File Explorer */}
                                <div>
                                    <h3 className="stg-section-title">File Explorer</h3>
                                    <div className="stg-group stg-group--mt14">
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Show File Sizes in Explorer</span>
                                                <p className="stg-row-desc">Display the size of files in the left sidebar</p>
                                            </div>
                                            <Toggle on={(editorSettings.showFileSizes ?? true)} onChange={() => onEditorSettingsChange?.({ showFileSizes: !(editorSettings.showFileSizes ?? true) })} />
                                        </div>
                                        <div className="stg-row">
                                            <div>
                                                <span className="stg-row-label">Default Explorer Sort View</span>
                                                <p className="stg-row-desc">Starting view mode for the file explorer</p>
                                            </div>
                                            <select
                                                className="stg-select stg-select--w200"
                                                value={editorSettings.defaultExplorerSort || 'default'}
                                                onChange={(e) => onEditorSettingsChange?.({ defaultExplorerSort: e.target.value })}
                                            >
                                                <option value="default">Default</option>
                                                <option value="name">By Name</option>
                                                <option value="type">By Type Grouped</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <hr className="stg-divider" />
                                {/* Settings backup & reset */}
                                <div>
                                    <h3 className="stg-section-title">Backup & Reset</h3>
                                    <div className="stg-group stg-group--mt14">
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
                            </div>
                        )}

                        {/* ═══ AI ═══ */}
                        {activeTab === 'ai' && (
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
                                        <button onClick={handleSaveConfig} disabled={isSaving} className="stg-btn stg-btn--primary" title="Guarda toda la configuración (AI, cloud, editor, etc.)">
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
                                                    value={geminiApiKey}
                                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                                    placeholder="Enter API Key — or leave blank to use ADC (Vertex AI)"
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
                                                    API Key mode active. Your key is stored in <code className="stg-code">~/.amoxsql/config.json</code>. Clear the key to switch to ADC (Vertex AI).
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
                                                    value={anthropicApiKey}
                                                    onChange={(e) => setAnthropicApiKey(e.target.value)}
                                                    placeholder="Enter your Anthropic API Key"
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
                                                    value={minimaxApiKey}
                                                    onChange={(e) => setMinimaxApiKey(e.target.value)}
                                                    placeholder="Enter your MiniMax API Key"
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
                        )}

                        {/* ═══ STORE INTEGRATIONS ═══ */}
                        {activeTab === 'integrations' && (
                            <div className="stg-section">
                                {/* ── Cloud Storage (S3 / GCS) ── */}
                                <div className="stg-row stg-row--top">
                                    <div>
                                        <h3 className="stg-section-heading stg-section-heading--mb8"><LuCloud size={14} /> Cloud Storage Export</h3>
                                        <p className="stg-row-desc stg-row-desc--maxw480">
                                            Connect your cloud storage buckets to export query results directly to S3 or Google Cloud Storage using DuckDB's native httpfs extension.
                                        </p>
                                    </div>
                                    <button onClick={handleSaveConfig} disabled={isSaving} className="stg-btn stg-btn--primary" title="Guarda toda la configuración (AI, cloud, editor, etc.)">
                                        {isSaving ? 'Saving...' : 'Save Settings'}
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

                                {/* ── Separator ── */}
                                <div style={{ borderTop: '1px solid var(--border-subtle)', margin: '24px 0' }} />

                                {/* ── Google Sheets ── */}
                                <div className="stg-row stg-row--top">
                                    <div>
                                        <h3 className="stg-section-heading stg-section-heading--mb8">
                                            <LuFileSpreadsheet size={14} style={{ color: 'var(--color-success)' }} /> Google Sheets
                                        </h3>
                                        <p className="stg-row-desc stg-row-desc--maxw480">
                                            Connect Google Sheets as queryable data sources via DuckDB. Each spreadsheet appears as a virtual database in the File Explorer — every sheet tab is a table you can query with SQL.
                                        </p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            if (!gsheetsKeyPath.trim()) return;
                                            setIsTestingGSheets(true);
                                            setGsheetsTestResult(null);
                                            try {
                                                const res = await fetch(`${API}/api/gsheets/setup`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ serviceAccountKeyPath: gsheetsKeyPath.trim() })
                                                });
                                                const data = await res.json();
                                                if (res.ok) {
                                                    setGsheetsEmail(data.email);
                                                    setGsheetsStatus({ isConfigured: true, extensionLoaded: true });
                                                    setGsheetsTestResult({ type: 'success', text: 'Google Sheets connected successfully!' });
                                                } else {
                                                    setGsheetsTestResult({ type: 'error', text: data.error || 'Setup failed' });
                                                }
                                            } catch (err) {
                                                setGsheetsTestResult({ type: 'error', text: err.message });
                                            } finally {
                                                setIsTestingGSheets(false);
                                                setTimeout(() => setGsheetsTestResult(null), 5000);
                                            }
                                        }}
                                        disabled={isTestingGSheets || !gsheetsKeyPath.trim()}
                                        className="stg-btn stg-btn--primary"
                                    >
                                        {isTestingGSheets ? 'Connecting...' : 'Save & Connect'}
                                    </button>
                                </div>

                                <div className="stg-card" style={{ marginTop: 12 }}>
                                    <div className="stg-card-header">
                                        <h4 className="stg-card-title"><LuFileSpreadsheet size={14} style={{ color: 'var(--color-success)' }} /> Service Account Configuration</h4>
                                        <span style={{ fontSize: '11px', color: gsheetsStatus.isConfigured ? '#34a853' : 'var(--text-tertiary)' }}>
                                            {gsheetsStatus.isConfigured ? '● Connected' : '○ Not configured'}
                                        </span>
                                    </div>

                                    <div className="stg-flex-col--gap10" style={{ marginTop: 8 }}>
                                        <div>
                                            <div className="stg-field-label">Service Account Key (JSON file path)</div>
                                            <input
                                                type="text"
                                                className="stg-input stg-input--mono"
                                                value={gsheetsKeyPath}
                                                onChange={(e) => setGsheetsKeyPath(e.target.value)}
                                                placeholder="C:\Users\you\.gcp\service-account.json"
                                            />
                                        </div>

                                        {gsheetsEmail && (
                                            <div>
                                                <div className="stg-field-label">Service Account Email</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <code className="stg-input stg-input--mono" style={{ flex: 1, padding: '8px 10px', background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 6, fontSize: '11px' }}>
                                                        {gsheetsEmail}
                                                    </code>
                                                    <button
                                                        className="stg-btn"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(gsheetsEmail);
                                                            setEmailCopied(true);
                                                            setTimeout(() => setEmailCopied(false), 2000);
                                                        }}
                                                        title="Copy email"
                                                    >
                                                        {emailCopied ? <LuCheck size={12} /> : <LuCopy size={12} />}
                                                    </button>
                                                </div>
                                                <p className="stg-row-desc" style={{ marginTop: 6, fontSize: '11px' }}>
                                                    👆 Share your Google Sheets with this email (Viewer or Editor) to allow AmoxSQL to read/write them.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface-inset)', borderRadius: 8, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                                        <strong>Minimum Permissions Required:</strong>
                                        <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                            <li><strong>Google Sheets API</strong> — Must be enabled in your GCP project.</li>
                                            <li><strong>Role:</strong> <code>roles/viewer</code> (read-only) or <code>roles/editor</code> (read + write).</li>
                                            <li><strong>Scope:</strong> <code>https://www.googleapis.com/auth/spreadsheets</code> (for read & write).</li>
                                            <li>Each Google Sheet must be <strong>shared with the Service Account email</strong> (like sharing with a collaborator).</li>
                                        </ul>
                                    </div>
                                </div>

                                {gsheetsTestResult && (
                                    <div className={`stg-alert stg-alert--${gsheetsTestResult.type}`} style={{ marginTop: 10 }}>
                                        {gsheetsTestResult.type === 'success' ? <LuCheck size={14} /> : <LuX size={14} />}
                                        {gsheetsTestResult.text}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ═══ CHART GALLERY ═══ */}
                        {/* ═══ WORKSPACE ═══ */}
                        {activeTab === 'workspace' && (
                            <WorkspaceSettingsPanel />
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
