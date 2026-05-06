/**
 * WorkspaceWizard — shows on first open of a new project.
 * Lets the user pick which canonical folders to scaffold.
 */
import { API_BASE } from '../api.js';
import { useState, useEffect } from 'react';
import {
    LuFolderOpen, LuSparkles, LuCheck, LuArrowRight, LuX,
    LuFileCode2, LuBookOpen, LuChartBar, LuGitBranch,
    LuDatabase, LuPackage, LuBot, LuBrain
} from 'react-icons/lu';

// Map folder id → icon + accent colour
const FOLDER_ICONS = {
    queries:   { icon: LuFileCode2,  color: 'var(--icon-sql)',          label: 'Queries' },
    notebooks: { icon: LuBookOpen,   color: 'var(--icon-notebook)',     label: 'Notebooks' },
    charts:    { icon: LuChartBar,   color: 'var(--accent-blue, #38bdf8)', label: 'Charts' },
    chains:    { icon: LuGitBranch,  color: 'var(--accent-primary)',    label: 'Chains' },
    data:      { icon: LuDatabase,   color: 'var(--icon-db)',           label: 'Data' },
    exports:   { icon: LuPackage,    color: 'var(--text-tertiary)',     label: 'Exports' },
    context:   { icon: LuBrain,      color: 'var(--accent-primary)',    label: 'Context (AI)' },
    agent:     { icon: LuBot,        color: 'var(--accent-secondary, var(--accent-primary))', label: 'Agent' },
};

// Folders selected by default on first run
const DEFAULT_SELECTED = ['queries', 'notebooks', 'data'];

export default function WorkspaceWizard({ projectPath, onComplete, onSkip }) {
    const [folderDefs, setFolderDefs]     = useState([]);
    const [selected,   setSelected]       = useState(new Set(DEFAULT_SELECTED));
    const [creating,   setCreating]       = useState(false);
    const [done,       setDone]           = useState(false);
    const [created,    setCreated]        = useState([]);

    useEffect(() => {
        fetch(`${API_BASE}/api/project/folder-defs`)
            .then(r => r.json())
            .then(data => setFolderDefs(data.folders || []))
            .catch(() => {});
    }, []);

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleCreate = async () => {
        setCreating(true);
        try {
            const res  = await fetch(`${API_BASE}/api/project/scaffold`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ folders: [...selected] }),
            });
            const data = await res.json();
            setCreated(data.created || []);
            setDone(true);
        } catch (err) {
            console.error('Scaffold error:', err);
        } finally {
            setCreating(false);
        }
    };

    const handleFinish = () => onComplete(created);

    const handleSkip = async () => {
        // Mark wizard as completed even when skipped
        await fetch(`${API_BASE}/api/project/config`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ updates: { wizard: { completed: true, skipped: true } } }),
        }).catch(() => {});
        onSkip?.();
    };

    return (
        <div className="ww-backdrop">
            <div className="ww-card">
                {/* Header */}
                <div className="ww-header">
                    <div className="ww-header-icon">
                        <LuSparkles size={20} />
                    </div>
                    <div className="ww-header-text">
                        <h2 className="ww-title">Set Up Your Workspace</h2>
                        <p className="ww-subtitle">
                            {projectPath
                                ? <><strong>{projectPath.split(/[/\\]/).pop()}</strong> looks like a new project.</>
                                : 'This looks like a new project.'}
                            {' '}Create a folder structure to stay organized.
                        </p>
                    </div>
                    <button className="ww-close-btn" onClick={handleSkip} title="Skip">
                        <LuX size={16} />
                    </button>
                </div>

                {!done ? (
                    <>
                        {/* Folder grid */}
                        <div className="ww-grid">
                            {folderDefs.map(f => {
                                const meta    = FOLDER_ICONS[f.id] || {};
                                const Icon    = meta.icon || LuFolderOpen;
                                const checked = selected.has(f.id);

                                return (
                                    <button
                                        key={f.id}
                                        className={`ww-folder-card ${checked ? 'ww-folder-selected' : ''}`}
                                        onClick={() => toggle(f.id)}
                                        type="button"
                                    >
                                        <div className="ww-folder-icon" style={{ color: meta.color || 'var(--icon-folder)' }}>
                                            <Icon size={22} />
                                        </div>
                                        <div className="ww-folder-info">
                                            <span className="ww-folder-name">{f.label}</span>
                                            <span className="ww-folder-desc">{f.description}</span>
                                        </div>
                                        <div className={`ww-folder-check ${checked ? 'ww-folder-check-on' : ''}`}>
                                            {checked && <LuCheck size={11} />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Actions */}
                        <div className="ww-actions">
                            <button className="ww-btn-skip" onClick={handleSkip}>
                                Skip for now
                            </button>
                            <button
                                className="ww-btn-create"
                                onClick={handleCreate}
                                disabled={creating || selected.size === 0}
                            >
                                {creating ? 'Creating…' : (
                                    <>
                                        Create {selected.size} folder{selected.size !== 1 ? 's' : ''}
                                        <LuArrowRight size={15} />
                                    </>
                                )}
                            </button>
                        </div>
                    </>
                ) : (
                    /* Done state */
                    <div className="ww-done">
                        <div className="ww-done-icon"><LuCheck size={28} /></div>
                        <h3 className="ww-done-title">Workspace ready!</h3>
                        <div className="ww-done-list">
                            {created.map(p => (
                                <div key={p} className="ww-done-item">
                                    <LuFolderOpen size={13} />
                                    <span>{p}</span>
                                </div>
                            ))}
                        </div>
                        <button className="ww-btn-create" onClick={handleFinish}>
                            Open Project <LuArrowRight size={15} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
