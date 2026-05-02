/**
 * GitPanel — Source Control sidebar panel.
 * MVP: status, stage/unstage, commit, branch display, log.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    LuGitBranch, LuRefreshCw, LuPlus, LuMinus, LuCheck,
    LuGitMerge, LuCircleAlert, LuChevronDown,
    LuChevronRight, LuFilePlus, LuFilePen, LuFile,
    LuLoader,
} from 'react-icons/lu';

const API = 'http://localhost:3001';

/* ── Status badge helpers ─────────────────────────────────────── */
const STATUS_META = {
    M: { label: 'M', title: 'Modified',  color: 'var(--git-modified, #e8a838)',  Icon: LuFilePen  },
    A: { label: 'A', title: 'Added',     color: 'var(--git-added,    #4caf7d)',  Icon: LuFilePlus },
    D: { label: 'D', title: 'Deleted',   color: 'var(--git-deleted,  #e06c75)',  Icon: LuFile     },
    R: { label: 'R', title: 'Renamed',   color: 'var(--git-modified, #e8a838)',  Icon: LuFilePen  },
    C: { label: 'C', title: 'Copied',    color: 'var(--git-added,    #4caf7d)',  Icon: LuFilePlus },
    '?': { label: '?', title: 'Untracked', color: 'var(--text-muted)',           Icon: LuFile     },
};
function statusMeta(s) { return STATUS_META[s] || STATUS_META['?']; }

/* ── File row ─────────────────────────────────────────────────── */
function FileRow({ file, onStage, onUnstage, staged }) {
    const meta = statusMeta(file.status);
    const IconComp = meta.Icon;
    const name = file.path.split(/[/\\]/).pop();
    const dir  = file.path.includes('/') || file.path.includes('\\')
        ? file.path.substring(0, file.path.lastIndexOf(file.path.includes('/') ? '/' : '\\'))
        : '';

    return (
        <div className="git-file-row" title={file.path}>
            <span className="git-file-icon">
                <IconComp size={13} color={meta.color} />
            </span>
            <span className="git-file-name">{name}</span>
            {dir && <span className="git-file-dir">{dir}</span>}
            <span className="git-file-badge" style={{ color: meta.color }} title={meta.title}>
                {meta.label}
            </span>
            <div className="git-file-actions">
                {staged
                    ? <button className="git-icon-btn" title="Unstage" onClick={() => onUnstage(file.path)}><LuMinus size={12} /></button>
                    : <button className="git-icon-btn" title="Stage"   onClick={() => onStage(file.path)}><LuPlus  size={12} /></button>
                }
            </div>
        </div>
    );
}

/* ── Section header ───────────────────────────────────────────── */
function SectionHeader({ label, count, expanded, onToggle, action }) {
    return (
        <div className="git-section-header" onClick={onToggle}>
            <span className="git-section-chevron">
                {expanded ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
            </span>
            <span className="git-section-label">{label}</span>
            {count != null && <span className="git-section-count">{count}</span>}
            {action && <div className="git-section-action" onClick={e => e.stopPropagation()}>{action}</div>}
        </div>
    );
}

/* ── Main component ───────────────────────────────────────────── */
export default function GitPanel({ projectPath }) {
    const [gitAvailable, setGitAvailable]   = useState(null); // null=loading
    const [isRepo,       setIsRepo]         = useState(false);
    const [status,       setStatus]         = useState(null);
    const [log,          setLog]            = useState([]);
    const [branches,     setBranches]       = useState({ current: null, branches: [] });
    const [loading,      setLoading]        = useState(false);
    const [commitMsg,    setCommitMsg]       = useState('');
    const [committing,   setCommitting]     = useState(false);
    const [initing,      setIniting]        = useState(false);
    const [error,        setError]          = useState(null);
    const [stagedOpen,   setStagedOpen]     = useState(true);
    const [changesOpen,  setChangesOpen]    = useState(true);
    const [logOpen,      setLogOpen]        = useState(false);
    const [branchOpen,   setBranchOpen]     = useState(false);
    const commitRef = useRef(null);

    /* ── fetch helpers ─────────────────────────────────────────── */
    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [avail, stat, lg, br] = await Promise.all([
                fetch(`${API}/api/git/available`).then(r => r.json()),
                fetch(`${API}/api/git/status`).then(r => r.json()),
                fetch(`${API}/api/git/log?limit=30`).then(r => r.json()),
                fetch(`${API}/api/git/branches`).then(r => r.json()),
            ]);
            setGitAvailable(avail.available);
            setIsRepo(!!stat.isRepo);
            setStatus(stat.isRepo ? stat : null);
            setLog(lg.commits || []);
            setBranches(br);
        } catch (e) {
            setError('Could not reach server');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    /* ── actions ───────────────────────────────────────────────── */
    async function handleInit() {
        setIniting(true);
        try {
            await fetch(`${API}/api/git/init`, { method: 'POST' });
            await refresh();
        } catch { setError('Init failed'); }
        finally { setIniting(false); }
    }

    async function handleStage(filePath) {
        await fetch(`${API}/api/git/stage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [filePath] }),
        });
        await refresh();
    }

    async function handleUnstage(filePath) {
        await fetch(`${API}/api/git/unstage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: [filePath] }),
        });
        await refresh();
    }

    async function handleStageAll() {
        const unstaged = (status?.files || []).filter(f => !f.staged).map(f => f.path);
        if (!unstaged.length) return;
        await fetch(`${API}/api/git/stage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: unstaged }),
        });
        await refresh();
    }

    async function handleCommit() {
        if (!commitMsg.trim()) return;
        setCommitting(true);
        try {
            const res = await fetch(`${API}/api/git/commit`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: commitMsg.trim() }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setCommitMsg('');
            await refresh();
        } catch (e) {
            setError(e.message);
        } finally {
            setCommitting(false);
        }
    }

    async function handleCheckout(branchName) {
        try {
            await fetch(`${API}/api/git/checkout`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch: branchName }),
            });
            await refresh();
        } catch { setError('Checkout failed'); }
    }

    /* ── derived state ─────────────────────────────────────────── */
    const staged   = (status?.files || []).filter(f => f.staged);
    const unstaged = (status?.files || []).filter(f => !f.staged);
    const canCommit = staged.length > 0 && commitMsg.trim().length > 0 && !committing;

    /* ── render: loading ───────────────────────────────────────── */
    if (gitAvailable === null) {
        return (
            <div className="git-panel git-panel--center">
                <LuLoader size={18} className="git-spin" />
            </div>
        );
    }

    /* ── render: git not installed ─────────────────────────────── */
    if (gitAvailable === false) {
        return (
            <div className="git-panel git-panel--empty">
                <LuCircleAlert size={32} style={{ opacity: 0.4 }} />
                <p className="git-empty-title">Git not found</p>
                <p className="git-empty-sub">Install Git and restart AmoxSQL to use source control.</p>
            </div>
        );
    }

    /* ── render: no repo ───────────────────────────────────────── */
    if (!isRepo) {
        return (
            <div className="git-panel git-panel--empty">
                <LuGitBranch size={32} style={{ opacity: 0.4 }} />
                <p className="git-empty-title">No repository</p>
                <p className="git-empty-sub">Initialize a Git repository for this workspace to track changes.</p>
                <button
                    className="git-init-btn"
                    onClick={handleInit}
                    disabled={initing}
                >
                    {initing ? <LuLoader size={14} className="git-spin" /> : <LuGitBranch size={14} />}
                    {initing ? 'Initializing…' : 'Initialize Repository'}
                </button>
            </div>
        );
    }

    /* ── render: repo ──────────────────────────────────────────── */
    return (
        <div className="git-panel">
            {/* Header */}
            <div className="git-panel-header">
                <div className="git-panel-title">
                    <LuGitBranch size={14} />
                    <span className="git-branch-name">{status?.branch || '—'}</span>
                    {status && !status.isClean && (
                        <span className="git-dirty-dot" title="Uncommitted changes" />
                    )}
                </div>
                <button className="git-icon-btn" onClick={refresh} title="Refresh" disabled={loading}>
                    <LuRefreshCw size={13} style={loading ? { animation: 'git-spin 1s linear infinite' } : {}} />
                </button>
            </div>

            {error && (
                <div className="git-error-bar">
                    <LuCircleAlert size={12} /> {error}
                    <button onClick={() => setError(null)} className="git-icon-btn git-error-close"><LuMinus size={10} /></button>
                </div>
            )}

            <div className="git-panel-body">
                {/* ── Commit area ── */}
                <div className="git-commit-area">
                    <textarea
                        ref={commitRef}
                        className="git-commit-input"
                        placeholder={staged.length ? 'Commit message…' : 'Stage changes to commit'}
                        value={commitMsg}
                        onChange={e => setCommitMsg(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit();
                        }}
                        rows={2}
                        disabled={!staged.length}
                    />
                    <button
                        className="git-commit-btn"
                        onClick={handleCommit}
                        disabled={!canCommit}
                        title="Commit staged changes (Ctrl+Enter)"
                    >
                        {committing
                            ? <LuLoader size={13} className="git-spin" />
                            : <LuCheck  size={13} />
                        }
                        {committing ? 'Committing…' : `Commit${staged.length ? ` (${staged.length})` : ''}`}
                    </button>
                </div>

                {/* ── Staged changes ── */}
                <SectionHeader
                    label="Staged"
                    count={staged.length}
                    expanded={stagedOpen}
                    onToggle={() => setStagedOpen(p => !p)}
                />
                {stagedOpen && (
                    <div className="git-file-list">
                        {staged.length === 0
                            ? <p className="git-empty-hint">No staged changes</p>
                            : staged.map(f => (
                                <FileRow key={f.path} file={f} staged onUnstage={handleUnstage} onStage={handleStage} />
                            ))
                        }
                    </div>
                )}

                {/* ── Unstaged / working tree ── */}
                <SectionHeader
                    label="Changes"
                    count={unstaged.length}
                    expanded={changesOpen}
                    onToggle={() => setChangesOpen(p => !p)}
                    action={unstaged.length > 0 && (
                        <button className="git-icon-btn" title="Stage all" onClick={handleStageAll}>
                            <LuPlus size={12} />
                        </button>
                    )}
                />
                {changesOpen && (
                    <div className="git-file-list">
                        {unstaged.length === 0
                            ? <p className="git-empty-hint">No unstaged changes</p>
                            : unstaged.map(f => (
                                <FileRow key={f.path} file={f} staged={false} onStage={handleStage} onUnstage={handleUnstage} />
                            ))
                        }
                    </div>
                )}

                {/* ── Branches ── */}
                <SectionHeader
                    label="Branches"
                    count={branches.branches.length}
                    expanded={branchOpen}
                    onToggle={() => setBranchOpen(p => !p)}
                />
                {branchOpen && (
                    <div className="git-file-list">
                        {branches.branches.map(b => (
                            <div
                                key={b.name}
                                className={`git-branch-row${b.current ? ' git-branch-row--active' : ''}`}
                                onClick={() => !b.current && handleCheckout(b.name)}
                                title={b.current ? 'Current branch' : `Checkout ${b.name}`}
                            >
                                <LuGitBranch size={13} style={{ flexShrink: 0 }} />
                                <span className="git-branch-row-name">{b.name}</span>
                                {b.current && <span className="git-branch-current-badge">current</span>}
                                {b.label && <span className="git-branch-label">{b.label}</span>}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Commit log ── */}
                <SectionHeader
                    label="History"
                    count={log.length}
                    expanded={logOpen}
                    onToggle={() => setLogOpen(p => !p)}
                />
                {logOpen && (
                    <div className="git-file-list">
                        {log.length === 0
                            ? <p className="git-empty-hint">No commits yet</p>
                            : log.map(c => (
                                <div key={c.hash} className="git-log-row" title={`${c.hash}\n${c.author}\n${c.date}`}>
                                    <LuGitMerge size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                                    <div className="git-log-info">
                                        <span className="git-log-msg">{c.message}</span>
                                        <span className="git-log-meta">{c.author} · {new Date(c.date).toLocaleDateString()}</span>
                                    </div>
                                    <span className="git-log-hash">{c.hash.slice(0, 7)}</span>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    );
}
