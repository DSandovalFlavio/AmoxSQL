import { useState, useEffect, useCallback, useRef } from 'react';
import {
    LuPackage, LuSearch, LuX, LuTrash2,
    LuFileCode, LuHash, LuHistory, LuPencil,
    LuCheck, LuTriangleAlert,
} from 'react-icons/lu';

const API_BASE = 'http://localhost:3001';
const PAGE_SIZE = 50;

/**
 * Format a date string as a relative time (e.g. "2 hours ago", "3 days ago").
 */
function relativeTime(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    return `${Math.floor(diffMonth / 12)}y ago`;
}

/**
 * Extract the first N lines from a SQL string for preview.
 */
function sqlPreview(sql, lines = 2) {
    if (!sql) return '';
    return sql.split('\n').slice(0, lines).join('\n');
}

/**
 * Parse a comma-separated tag string into an array.
 */
function parseTags(tagStr) {
    if (!tagStr) return [];
    return tagStr.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * AnalysisVault — Browsable UI for the persistent Analysis Vault.
 * Displays saved analyses that survive file deletion, with search, tag
 * filtering, inline editing, and open-in-editor functionality.
 */
const AnalysisVault = ({ onOpenInEditor, onClose }) => {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);

    // Inline editing state
    const [editingId, setEditingId] = useState(null);
    const [editTitle, setEditTitle] = useState('');
    const [editTags, setEditTags] = useState('');
    const editTitleRef = useRef(null);

    // Delete confirmation
    const [deletingId, setDeletingId] = useState(null);

    // ── Fetch entries ──────────────────────────────────────────────
    const fetchEntries = useCallback(async (resetOffset = false) => {
        setLoading(true);
        setError(null);
        const currentOffset = resetOffset ? 0 : offset;
        if (resetOffset) setOffset(0);

        try {
            const params = new URLSearchParams();
            if (searchText) params.set('search', searchText);
            if (tagFilter) params.set('tags', tagFilter);
            params.set('limit', String(PAGE_SIZE));
            params.set('offset', String(currentOffset));

            const res = await fetch(`${API_BASE}/api/ai/vault?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.entries || [];
            setEntries(list);
            setHasMore(list.length === PAGE_SIZE);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [searchText, tagFilter, offset]);

    // Initial load and re-fetch on filter changes
    useEffect(() => {
        fetchEntries(true);
    }, [searchText, tagFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Delete entry ───────────────────────────────────────────────
    const handleDelete = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/api/ai/vault/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setEntries(prev => prev.filter(e => e.id !== id));
            setDeletingId(null);
        } catch (err) {
            setError(`Delete failed: ${err.message}`);
        }
    };

    // ── Start inline edit ──────────────────────────────────────────
    const startEditing = (entry) => {
        setEditingId(entry.id);
        setEditTitle(entry.title || '');
        setEditTags(entry.tags || '');
        setTimeout(() => editTitleRef.current?.focus(), 0);
    };

    // ── Save inline edit ───────────────────────────────────────────
    const saveEdit = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/api/ai/vault/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: editTitle, tags: editTags }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setEntries(prev =>
                prev.map(e => e.id === id ? { ...e, title: editTitle, tags: editTags } : e)
            );
            setEditingId(null);
        } catch (err) {
            setError(`Update failed: ${err.message}`);
        }
    };

    const cancelEdit = () => setEditingId(null);

    // ── Pagination ─────────────────────────────────────────────────
    const loadMore = () => {
        const newOffset = offset + PAGE_SIZE;
        setOffset(newOffset);
    };

    useEffect(() => {
        if (offset > 0) fetchEntries(false);
    }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Render ─────────────────────────────────────────────────────
    return (
        <div className="vault-panel">
            {/* Header */}
            <div className="vault-header">
                <div className="vault-header-title">
                    <LuPackage size={18} />
                    <span>Analysis Vault</span>
                </div>
                <button className="vault-close-btn" onClick={onClose} title="Close">
                    <LuX size={16} />
                </button>
            </div>

            {/* Search bar */}
            <div className="vault-search">
                <div className="vault-search-input-wrap">
                    <LuSearch size={14} className="vault-search-icon" />
                    <input
                        type="text"
                        className="vault-search-input"
                        placeholder="Search analyses..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                    {searchText && (
                        <button className="vault-search-clear" onClick={() => setSearchText('')}>
                            <LuX size={12} />
                        </button>
                    )}
                </div>
                <div className="vault-search-input-wrap vault-tag-filter-wrap">
                    <LuHash size={14} className="vault-search-icon" />
                    <input
                        type="text"
                        className="vault-tag-filter"
                        placeholder="Filter by tag..."
                        value={tagFilter}
                        onChange={e => setTagFilter(e.target.value)}
                    />
                    {tagFilter && (
                        <button className="vault-search-clear" onClick={() => setTagFilter('')}>
                            <LuX size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="vault-error">
                    <LuTriangleAlert size={14} />
                    <span>{error}</span>
                    <button className="vault-error-dismiss" onClick={() => setError(null)}>
                        <LuX size={12} />
                    </button>
                </div>
            )}

            {/* Entry list */}
            <div className="vault-list">
                {loading && entries.length === 0 && (
                    <div className="vault-loading">Loading...</div>
                )}

                {!loading && entries.length === 0 && (
                    <div className="vault-empty">
                        <LuPackage size={40} strokeWidth={1} />
                        <p className="vault-empty-title">No saved analyses</p>
                        <p className="vault-empty-subtitle">
                            Analyses saved from AI conversations will appear here.
                        </p>
                    </div>
                )}

                {entries.map(entry => (
                    <div key={entry.id} className="vault-entry">
                        {/* Title row */}
                        <div className="vault-entry-header">
                            {editingId === entry.id ? (
                                <div className="vault-edit-row">
                                    <input
                                        ref={editTitleRef}
                                        className="vault-edit-title-input"
                                        value={editTitle}
                                        onChange={e => setEditTitle(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') saveEdit(entry.id);
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                        placeholder="Title"
                                    />
                                    <button
                                        className="vault-icon-btn vault-save-btn"
                                        onClick={() => saveEdit(entry.id)}
                                        title="Save"
                                    >
                                        <LuCheck size={14} />
                                    </button>
                                    <button
                                        className="vault-icon-btn"
                                        onClick={cancelEdit}
                                        title="Cancel"
                                    >
                                        <LuX size={14} />
                                    </button>
                                </div>
                            ) : (
                                <span
                                    className="vault-entry-title"
                                    onDoubleClick={() => startEditing(entry)}
                                    title="Double-click to edit"
                                >
                                    {entry.title || 'Untitled'}
                                </span>
                            )}
                        </div>

                        {/* SQL preview */}
                        {entry.sql_content && (
                            <pre className="vault-sql-preview">
                                {sqlPreview(entry.sql_content)}
                            </pre>
                        )}

                        {/* Meta row */}
                        <div className="vault-entry-meta">
                            <span className="vault-meta-item" title={entry.created_at}>
                                <LuHistory size={12} />
                                {relativeTime(entry.created_at)}
                            </span>
                            {entry.source_file && (
                                <span className="vault-meta-item vault-meta-source" title={entry.source_file}>
                                    <LuFileCode size={12} />
                                    <span className="vault-source-name">
                                        {entry.source_file.split(/[/\\]/).pop()}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* Tags */}
                        {editingId === entry.id ? (
                            <div className="vault-edit-tags-row">
                                <LuHash size={12} />
                                <input
                                    className="vault-edit-tags-input"
                                    value={editTags}
                                    onChange={e => setEditTags(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') saveEdit(entry.id);
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                    placeholder="tag1, tag2, ..."
                                />
                            </div>
                        ) : (
                            parseTags(entry.tags).length > 0 && (
                                <div className="vault-tags">
                                    {parseTags(entry.tags).map(tag => (
                                        <span
                                            key={tag}
                                            className="vault-tag-chip"
                                            onClick={() => setTagFilter(tag)}
                                            title={`Filter by "${tag}"`}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )
                        )}

                        {/* Actions */}
                        <div className="vault-entry-actions">
                            <button
                                className="vault-btn vault-btn-primary"
                                onClick={() => onOpenInEditor(entry.sql_content)}
                                disabled={!entry.sql_content}
                                title="Open SQL in editor"
                            >
                                <LuFileCode size={13} />
                                Open in Editor
                            </button>

                            {editingId !== entry.id && (
                                <button
                                    className="vault-icon-btn"
                                    onClick={() => startEditing(entry)}
                                    title="Edit title & tags"
                                >
                                    <LuPencil size={13} />
                                </button>
                            )}

                            {deletingId === entry.id ? (
                                <div className="vault-delete-confirm">
                                    <span className="vault-delete-label">Delete?</span>
                                    <button
                                        className="vault-icon-btn vault-delete-yes"
                                        onClick={() => handleDelete(entry.id)}
                                        title="Confirm delete"
                                    >
                                        <LuCheck size={13} />
                                    </button>
                                    <button
                                        className="vault-icon-btn"
                                        onClick={() => setDeletingId(null)}
                                        title="Cancel"
                                    >
                                        <LuX size={13} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    className="vault-icon-btn vault-delete-btn"
                                    onClick={() => setDeletingId(entry.id)}
                                    title="Delete entry"
                                >
                                    <LuTrash2 size={13} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {hasMore && (
                    <button className="vault-load-more" onClick={loadMore} disabled={loading}>
                        {loading ? 'Loading...' : 'Load more'}
                    </button>
                )}
            </div>

        </div>
    );
};

export default AnalysisVault;
