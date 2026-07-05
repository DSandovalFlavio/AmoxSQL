/**
 * GitPanel — Source Control sidebar panel.
 * MVP: status, stage/unstage, commit, branch display, log.
 */
import { useState, useEffect, useCallback, useRef, useLayoutEffect, memo } from 'react';
import {
    LuGitBranch, LuRefreshCw, LuPlus, LuMinus, LuCheck,
    LuGitMerge, LuCircleAlert, LuChevronDown,
    LuChevronRight, LuFilePlus, LuFilePen, LuFile,
    LuLoader, LuEyeOff, LuTrash2, LuUndo2, LuX,
    LuArchive, LuArchiveRestore, LuShield, LuPencil,
} from 'react-icons/lu';

import { API_BASE as API } from '../api.js';

/* ── Status badge helpers ─────────────────────────────────────── */
const STATUS_META = {
    M: { label: 'M', title: 'Modified',  color: 'var(--color-warning)',  Icon: LuFilePen  },
    A: { label: 'A', title: 'Added',     color: 'var(--color-success)',  Icon: LuFilePlus },
    D: { label: 'D', title: 'Deleted',   color: 'var(--color-error)',  Icon: LuFile     },
    R: { label: 'R', title: 'Renamed',   color: 'var(--color-warning)',  Icon: LuFilePen  },
    C: { label: 'C', title: 'Copied',    color: 'var(--color-success)',  Icon: LuFilePlus },
    '?': { label: '?', title: 'Untracked', color: 'var(--text-muted)',           Icon: LuFile     },
};
function statusMeta(s) { return STATUS_META[s] || STATUS_META['?']; }

/* ── File row ─────────────────────────────────────────────────── */
function FileRow({ file, onStage, onUnstage, onDiscard, onViewDiff, onContextMenu, staged }) {
    const meta = statusMeta(file.status);
    const IconComp = meta.Icon;
    const name = file.path.split(/[/\\]/).pop();
    const dir  = file.path.includes('/') || file.path.includes('\\')
        ? file.path.substring(0, file.path.lastIndexOf(file.path.includes('/') ? '/' : '\\'))
        : '';

    return (
        <div className="git-file-row" title={file.path}
            onClick={() => onViewDiff && onViewDiff(file, staged)}
            onContextMenu={(e) => onContextMenu && onContextMenu(e, file, staged)}
            style={{ cursor: 'pointer' }}
        >
            <span className="git-file-icon">
                <IconComp size={13} color={meta.color} />
            </span>
            <span className="git-file-name">{name}</span>
            {dir && <span className="git-file-dir">{dir}</span>}
            <span className="git-file-badge" style={{ color: meta.color }} title={meta.title}>
                {meta.label}
            </span>
            <div className="git-file-actions" onClick={e => e.stopPropagation()}>
                {!staged && onDiscard && (
                    <button className="git-icon-btn" title="Discard changes" onClick={() => onDiscard(file.path)}><LuUndo2 size={12} /></button>
                )}
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
function GitPanel({ projectPath, onFileClick }) {
    const [gitAvailable, setGitAvailable]   = useState(null);
    const [isRepo,       setIsRepo]         = useState(false);
    const [status,       setStatus]         = useState(null);
    const [log,          setLog]            = useState([]);
    const [branches,     setBranches]       = useState({ current: null, branches: [] });
    const [loading,      setLoading]        = useState(false);
    const [commitMsg,    setCommitMsg]      = useState('');
    const [committing,   setCommitting]     = useState(false);
    const [initing,      setIniting]        = useState(false);
    const [error,        setError]          = useState(null);
    const [stagedOpen,   setStagedOpen]     = useState(true);
    const [changesOpen,  setChangesOpen]    = useState(true);
    const [logOpen,      setLogOpen]        = useState(false);
    const [branchOpen,   setBranchOpen]     = useState(false);
    const commitRef = useRef(null);

    // New features
    const [amendMode,      setAmendMode]      = useState(false);
    const [diffModal,      setDiffModal]      = useState(null); // { file, diff, staged }
    const [contextMenu,    setContextMenu]    = useState(null); // { x, y, file, staged }
    const ctxRef = useRef(null);
    const [newBranchName,  setNewBranchName]  = useState('');
    const [showNewBranch,  setShowNewBranch]  = useState(false);
    const [ignorePopover,  setIgnorePopover]  = useState(false);
    const [ignorePatterns, setIgnorePatterns] = useState(new Set());
    const [stashCount,     setStashCount]     = useState(0);

    /* ── fetch helpers ─────────────────────────────────────────── */
    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [avail, stat, lg, br, stash] = await Promise.all([
                fetch(`${API}/api/git/available`).then(r => r.json()),
                fetch(`${API}/api/git/status`).then(r => r.json()),
                fetch(`${API}/api/git/log?limit=30`).then(r => r.json()),
                fetch(`${API}/api/git/branches`).then(r => r.json()),
                fetch(`${API}/api/git/stash/list`).then(r => r.json()).catch(() => ({ stashes: [] })),
            ]);
            setGitAvailable(avail.available);
            setIsRepo(!!stat.isRepo);
            setStatus(stat.isRepo ? stat : null);
            setLog(lg.commits || []);
            setBranches(br);
            setStashCount((stash.stashes || []).length);
            // Load .gitignore patterns
            try {
                const gi = await fetch(`${API}/api/file?path=.gitignore`).then(r => r.json());
                if (gi.content) {
                    setIgnorePatterns(new Set(gi.content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))));
                }
            } catch {}
        } catch (e) {
            setError('Could not reach server');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    // Close context menu on outside click
    useEffect(() => {
        if (!contextMenu) return;
        const handler = () => setContextMenu(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [contextMenu]);

    /* ── actions ───────────────────────────────────────────────── */
    const post = (url, body) => fetch(`${API}${url}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    async function handleInit() {
        setIniting(true);
        try { await post('/api/git/init', {}); await refresh(); }
        catch { setError('Init failed'); }
        finally { setIniting(false); }
    }

    async function handleStage(filePath) { await post('/api/git/stage', { files: [filePath] }); await refresh(); }
    async function handleUnstage(filePath) { await post('/api/git/unstage', { files: [filePath] }); await refresh(); }

    async function handleStageAll() {
        const u = (status?.files || []).filter(f => !f.staged).map(f => f.path);
        if (u.length) { await post('/api/git/stage', { files: u }); await refresh(); }
    }
    async function handleUnstageAll() {
        const s = (status?.files || []).filter(f => f.staged).map(f => f.path);
        if (s.length) { await post('/api/git/unstage', { files: s }); await refresh(); }
    }

    async function handleDiscard(filePath) {
        if (!window.confirm(`Discard all changes in "${filePath.split(/[/\\]/).pop()}"? This cannot be undone.`)) return;
        try { await post('/api/git/discard', { files: [filePath] }); await refresh(); }
        catch { setError('Discard failed'); }
    }

    async function handleCommit() {
        if (!amendMode && !commitMsg.trim()) return;
        setCommitting(true);
        try {
            const res = await post('/api/git/commit', { message: commitMsg.trim(), amend: amendMode });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setCommitMsg(''); setAmendMode(false);
            await refresh();
        } catch (e) { setError(e.message); }
        finally { setCommitting(false); }
    }

    async function handleCheckout(branchName) {
        try { await post('/api/git/checkout', { branch: branchName }); await refresh(); }
        catch { setError('Checkout failed'); }
    }

    async function handleCreateBranch() {
        if (!newBranchName.trim()) return;
        try { await post('/api/git/branch', { name: newBranchName.trim() }); setNewBranchName(''); setShowNewBranch(false); await refresh(); }
        catch { setError('Create branch failed'); }
    }

    async function handleDeleteBranch(name) {
        if (!window.confirm(`Delete branch "${name}"?`)) return;
        try { await post('/api/git/branch/delete', { name }); await refresh(); }
        catch (e) { setError('Delete failed — branch may not be fully merged'); }
    }

    async function handleStash() {
        try { await post('/api/git/stash', {}); await refresh(); }
        catch { setError('Stash failed'); }
    }
    async function handleStashPop() {
        try { await post('/api/git/stash/pop', {}); await refresh(); }
        catch { setError('Stash pop failed — may have conflicts'); }
    }

    async function handleViewDiff(file, staged) {
        try {
            const res = await fetch(`${API}/api/git/diff?file=${encodeURIComponent(file.path)}&staged=${!!staged}`);
            const data = await res.json();
            setDiffModal({ file, diff: data.diff || '(no diff available)', staged });
        } catch { setError('Failed to load diff'); }
    }

    function handleFileContextMenu(e, file, staged) {
        e.preventDefault(); e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, file, staged });
    }

    async function toggleIgnorePattern(pattern) {
        try {
            if (ignorePatterns.has(pattern)) return; // already ignored
            await post('/api/git/ignore', { pattern });
            setIgnorePatterns(prev => new Set([...prev, pattern]));
        } catch {}
    }

    // Quick Ignore data patterns
    const DATA_PATTERNS = [
        { label: 'CSV', pattern: '*.csv' },
        { label: 'Parquet', pattern: '*.parquet' },
        { label: 'Excel', pattern: '*.xlsx' },
        { label: 'JSON', pattern: '*.json' },
        { label: 'DuckDB', pattern: '*.duckdb' },
        { label: 'TSV', pattern: '*.tsv' },
    ];

    // Smart commit message suggestion
    const suggestedMsg = (() => {
        const s = (status?.files || []).filter(f => f.staged);
        if (!s.length) return '';
        const sqlFiles = s.filter(f => f.path.endsWith('.sql')).map(f => f.path.split(/[/\\]/).pop());
        if (sqlFiles.length === 1) return `Update ${sqlFiles[0]}`;
        if (sqlFiles.length > 1) return `Update queries: ${sqlFiles.slice(0, 3).join(', ')}${sqlFiles.length > 3 ? ` +${sqlFiles.length - 3} more` : ''}`;
        const allNames = s.map(f => f.path.split(/[/\\]/).pop());
        if (allNames.length === 1) return `Update ${allNames[0]}`;
        return `Update ${allNames.length} files`;
    })();

    /* ── derived state ─────────────────────────────────────────── */
    const staged   = (status?.files || []).filter(f => f.staged);
    const unstaged = (status?.files || []).filter(f => !f.staged);
    const canCommit = (staged.length > 0 && (commitMsg.trim().length > 0 || amendMode)) && !committing;

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
                <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {/* Quick Ignore popover trigger */}
                    <div style={{ position: 'relative' }}>
                        <button className="git-icon-btn" title="Quick Ignore Data Files" onClick={() => setIgnorePopover(p => !p)}>
                            <LuShield size={13} />
                        </button>
                        {ignorePopover && (
                            <div className="git-ignore-popover">
                                <div className="git-ignore-popover-title">Quick Ignore Patterns</div>
                                {DATA_PATTERNS.map(dp => {
                                    const active = ignorePatterns.has(dp.pattern);
                                    return (
                                        <button key={dp.pattern}
                                            className={`git-ignore-pill${active ? ' git-ignore-pill--active' : ''}`}
                                            onClick={() => !active && toggleIgnorePattern(dp.pattern)}
                                            disabled={active}
                                            title={active ? `${dp.pattern} already in .gitignore` : `Add ${dp.pattern} to .gitignore`}
                                        >
                                            <LuEyeOff size={10} /> {dp.label}
                                            {active && <LuCheck size={10} />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {/* Stash */}
                    {(unstaged.length > 0 || staged.length > 0) && (
                        <button className="git-icon-btn" title="Stash changes" onClick={handleStash}><LuArchive size={13} /></button>
                    )}
                    {stashCount > 0 && (
                        <button className="git-icon-btn" title={`Pop stash (${stashCount})`} onClick={handleStashPop}>
                            <LuArchiveRestore size={13} />
                        </button>
                    )}
                    <button className="git-icon-btn" onClick={refresh} title="Refresh" disabled={loading}>
                        <LuRefreshCw size={13} className={loading ? 'amox-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="git-error-bar">
                    <LuCircleAlert size={12} /> {error}
                    <button onClick={() => setError(null)} className="git-icon-btn git-error-close"><LuX size={10} /></button>
                </div>
            )}

            <div className="git-panel-body">
                {/* ── Commit area ── */}
                <div className="git-commit-area">
                    <div style={{ position: 'relative' }}>
                        <textarea
                            ref={commitRef}
                            className="git-commit-input"
                            placeholder={suggestedMsg || (staged.length ? 'Commit message...' : 'Stage changes to commit')}
                            value={commitMsg}
                            onChange={e => setCommitMsg(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit();
                                if (e.key === 'Tab' && !commitMsg && suggestedMsg) { e.preventDefault(); setCommitMsg(suggestedMsg); }
                            }}
                            rows={2}
                            disabled={!staged.length && !amendMode}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button className="git-commit-btn" onClick={handleCommit} disabled={!canCommit}
                            title={amendMode ? 'Amend last commit (Ctrl+Enter)' : 'Commit staged changes (Ctrl+Enter)'}
                        >
                            {committing ? <LuLoader size={13} className="git-spin" /> : <LuCheck size={13} />}
                            {committing ? 'Committing...' : `Commit${staged.length ? ` (${staged.length})` : ''}`}
                        </button>
                        <button
                            className={`git-icon-btn git-amend-toggle${amendMode ? ' git-amend-toggle--active' : ''}`}
                            onClick={() => setAmendMode(p => !p)}
                            title={amendMode ? 'Amend mode ON — will replace last commit' : 'Toggle amend mode'}
                        >
                            <LuPencil size={12} />
                        </button>
                    </div>
                </div>

                {/* ── Staged changes ── */}
                <SectionHeader
                    label="Staged" count={staged.length}
                    expanded={stagedOpen} onToggle={() => setStagedOpen(p => !p)}
                    action={staged.length > 0 && (
                        <button className="git-icon-btn" title="Unstage all" onClick={handleUnstageAll}><LuMinus size={12} /></button>
                    )}
                />
                {stagedOpen && (
                    <div className="git-file-list">
                        {staged.length === 0
                            ? <p className="git-empty-hint">No staged changes</p>
                            : staged.map(f => (
                                <FileRow key={f.path} file={f} staged
                                    onUnstage={handleUnstage} onStage={handleStage}
                                    onViewDiff={handleViewDiff} onContextMenu={handleFileContextMenu} />
                            ))
                        }
                    </div>
                )}

                {/* ── Unstaged / working tree ── */}
                <SectionHeader
                    label="Changes" count={unstaged.length}
                    expanded={changesOpen} onToggle={() => setChangesOpen(p => !p)}
                    action={unstaged.length > 0 && (
                        <button className="git-icon-btn" title="Stage all" onClick={handleStageAll}><LuPlus size={12} /></button>
                    )}
                />
                {changesOpen && (
                    <div className="git-file-list">
                        {unstaged.length === 0
                            ? <p className="git-empty-hint">No unstaged changes</p>
                            : unstaged.map(f => (
                                <FileRow key={f.path} file={f} staged={false}
                                    onStage={handleStage} onUnstage={handleUnstage}
                                    onDiscard={handleDiscard} onViewDiff={handleViewDiff}
                                    onContextMenu={handleFileContextMenu} />
                            ))
                        }
                    </div>
                )}

                {/* ── Branches ── */}
                <SectionHeader
                    label="Branches" count={branches.branches.length}
                    expanded={branchOpen} onToggle={() => setBranchOpen(p => !p)}
                    action={<button className="git-icon-btn" title="New branch" onClick={e => { e.stopPropagation(); setShowNewBranch(p => !p); setBranchOpen(true); }}><LuPlus size={12} /></button>}
                />
                {branchOpen && (
                    <div className="git-file-list">
                        {showNewBranch && (
                            <div className="git-new-branch-row">
                                <input className="git-new-branch-input" autoFocus
                                    placeholder="Branch name..." value={newBranchName}
                                    onChange={e => setNewBranchName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowNewBranch(false); }}
                                />
                                <button className="git-icon-btn" onClick={handleCreateBranch} title="Create"><LuCheck size={12} /></button>
                                <button className="git-icon-btn" onClick={() => setShowNewBranch(false)} title="Cancel"><LuX size={12} /></button>
                            </div>
                        )}
                        {branches.branches.map(b => (
                            <div key={b.name}
                                className={`git-branch-row${b.current ? ' git-branch-row--active' : ''}`}
                                onClick={() => !b.current && handleCheckout(b.name)}
                                title={b.current ? 'Current branch' : `Checkout ${b.name}`}
                            >
                                <LuGitBranch size={13} style={{ flexShrink: 0 }} />
                                <span className="git-branch-row-name">{b.name}</span>
                                {b.current && <span className="git-branch-current-badge">current</span>}
                                {!b.current && (
                                    <button className="git-icon-btn git-branch-delete" title="Delete branch"
                                        onClick={e => { e.stopPropagation(); handleDeleteBranch(b.name); }}>
                                        <LuTrash2 size={11} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Commit log ── */}
                <SectionHeader label="History" count={log.length} expanded={logOpen} onToggle={() => setLogOpen(p => !p)} />
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

            {/* ── Context Menu ── */}
            {contextMenu && (
                <div ref={ctxRef} className="git-ctx-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                    <div className="context-menu-item" onClick={() => { handleViewDiff(contextMenu.file, contextMenu.staged); setContextMenu(null); }}>
                        <LuFile size={14} /> View Diff
                    </div>
                    {onFileClick && (
                        <div className="context-menu-item" onClick={() => { onFileClick(contextMenu.file.path); setContextMenu(null); }}>
                            <LuFilePen size={14} /> Open File
                        </div>
                    )}
                    <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 8px' }} />
                    {contextMenu.staged
                        ? <div className="context-menu-item" onClick={() => { handleUnstage(contextMenu.file.path); setContextMenu(null); }}><LuMinus size={14} /> Unstage</div>
                        : <div className="context-menu-item" onClick={() => { handleStage(contextMenu.file.path); setContextMenu(null); }}><LuPlus size={14} /> Stage</div>
                    }
                    {!contextMenu.staged && (
                        <div className="context-menu-item context-menu-item--danger" onClick={() => { handleDiscard(contextMenu.file.path); setContextMenu(null); }}>
                            <LuUndo2 size={14} /> Discard Changes
                        </div>
                    )}
                    <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 8px' }} />
                    <div className="context-menu-item" onClick={async () => {
                        await fetch(`${API}/api/git/ignore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern: contextMenu.file.path }) });
                        setContextMenu(null); await refresh();
                    }}>
                        <LuEyeOff size={14} /> Add to .gitignore
                    </div>
                </div>
            )}

            {/* ── Diff Modal ── */}
            {diffModal && (
                <div className="git-diff-overlay" onClick={() => setDiffModal(null)}>
                    <div className="git-diff-modal" onClick={e => e.stopPropagation()}>
                        <div className="git-diff-modal-header">
                            <span>{diffModal.file.path.split(/[/\\]/).pop()} — {diffModal.staged ? 'Staged' : 'Working Tree'} Diff</span>
                            <button className="git-icon-btn" onClick={() => setDiffModal(null)}><LuX size={14} /></button>
                        </div>
                        <pre className="git-diff-content">
                            {diffModal.diff.split('\n').map((line, i) => {
                                let cls = 'git-diff-line';
                                if (line.startsWith('+') && !line.startsWith('+++')) cls += ' git-diff-add';
                                else if (line.startsWith('-') && !line.startsWith('---')) cls += ' git-diff-del';
                                else if (line.startsWith('@@')) cls += ' git-diff-hunk';
                                return <div key={i} className={cls}>{line}</div>;
                            })}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(GitPanel);
