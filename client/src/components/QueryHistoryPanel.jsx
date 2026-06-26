import { API_BASE } from '../api.js';
import { useState, useEffect, memo, useDeferredValue } from 'react';
import { LuClipboard, LuStar, LuRefreshCw, LuSearch, LuX } from 'react-icons/lu';

/**
 * QueryHistoryPanel — Sidebar panel for browsing query history and bookmarks.
 */
const QueryHistoryPanel = ({ onSelect, onInsertQuery, onClose }) => {
    // Support both onSelect (legacy) and onInsertQuery (new spec) callbacks
    const handleSelect = (query) => {
        if (onInsertQuery) onInsertQuery(query);
        if (onSelect) onSelect(query);
    };
    const [history, setHistory] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const deferredSearch = useDeferredValue(search);
    const [viewTab, setViewTab] = useState('history'); // 'history' | 'bookmarks'

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE}/api/db/history`);
            const data = await response.json();
            if (Array.isArray(data)) setHistory(data);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    };

    const fetchBookmarks = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/bookmarks`);
            const data = await response.json();
            if (Array.isArray(data)) setBookmarks(data);
        } catch (e) { /* silent */ }
    };

    useEffect(() => {
        fetchHistory();
        fetchBookmarks();
    }, []);

    const toggleBookmark = async (query, e) => {
        e.stopPropagation();
        const exists = bookmarks.find(b => b.query === query);
        let updated;
        if (exists) {
            updated = bookmarks.filter(b => b.query !== query);
        } else {
            updated = [...bookmarks, { query, bookmarkedAt: new Date().toISOString() }];
        }
        setBookmarks(updated);
        try {
            await fetch(`${API_BASE}/api/bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
        } catch (e) { /* silent */ }
    };

    const removeBookmark = async (query, e) => {
        e.stopPropagation();
        const updated = bookmarks.filter(b => b.query !== query);
        setBookmarks(updated);
        try {
            await fetch(`${API_BASE}/api/bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
        } catch (e) { /* silent */ }
    };

    const isBookmarked = (query) => bookmarks.some(b => b.query === query);

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        const now = new Date();
        const diff = now - d;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return d.toLocaleDateString();
    };

    const VISIBLE_LIMIT = 150;
    const q = deferredSearch.toLowerCase();
    const filteredList = viewTab === 'history'
        ? history.filter(h => h.query.toLowerCase().includes(q))
        : bookmarks.filter(b => b.query.toLowerCase().includes(q));
    // Limit rendered DOM nodes when not searching — prevents layout/paint spike on show
    const activeList = q ? filteredList : filteredList.slice(0, VISIBLE_LIMIT);
    const hiddenCount = q ? 0 : Math.max(0, filteredList.length - VISIBLE_LIMIT);


    const handleCopy = (text, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
    };

    // Temporal grouping helper
    const getTimeGroup = (dateString) => {
        if (!dateString) return 'Older';
        const d = new Date(dateString);
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffDays === 0 && d.getDate() === now.getDate()) return 'Today';
        if (diffDays <= 1 || (diffDays === 0 && d.getDate() !== now.getDate())) return 'Yesterday';
        if (diffDays <= 7) return 'This Week';
        return 'Older';
    };

    // Group the list for history tab
    const groupedItems = (() => {
        if (viewTab !== 'history') return null;
        const groups = {};
        const order = ['Today', 'Yesterday', 'This Week', 'Older'];
        order.forEach(g => { groups[g] = []; });
        activeList.forEach(item => {
            const group = getTimeGroup(item.executed_at);
            if (groups[group]) groups[group].push(item);
        });
        return order.filter(g => groups[g].length > 0).map(g => ({ label: g, items: groups[g] }));
    })();

    const renderQueryItem = (item, idx) => {
        const query = item.query;
        const date = viewTab === 'history' ? item.executed_at : item.bookmarkedAt;
        const starred = isBookmarked(query);
        const preview = query.split('\n').slice(0, 3).join('\n');
        const isTruncated = query.split('\n').length > 3;

        return (
            <div
                key={idx}
                className="qh-item"
                onClick={() => handleSelect(query)}
                title="Click to insert into new editor"
            >
                {/* Date & Actions */}
                <div className="qh-item-header">
                    <span className="qh-item-date">{formatDate(date)}</span>
                    <div className="qh-item-actions">
                        {viewTab === 'history' ? (
                            <span
                                onClick={(e) => toggleBookmark(query, e)}
                                title={starred ? 'Remove bookmark' : 'Bookmark'}
                                className="qh-action-btn"
                                style={{ color: starred ? 'var(--feedback-warning)' : undefined }}
                            >
                                <LuStar size={11} fill={starred ? 'var(--feedback-warning)' : 'none'} />
                            </span>
                        ) : (
                            <span
                                onClick={(e) => removeBookmark(query, e)}
                                title="Remove"
                                className="qh-action-btn"
                                style={{ color: 'var(--feedback-warning)' }}
                            >
                                <LuStar size={11} fill="var(--feedback-warning)" />
                            </span>
                        )}
                        <span
                            onClick={(e) => handleCopy(query, e)}
                            title="Copy"
                            className="qh-action-btn"
                        >
                            <LuClipboard size={11} />
                        </span>
                    </div>
                </div>
                {/* SQL Preview */}
                <div className="qh-item-sql">
                    {preview}{isTruncated ? '...' : ''}
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div className="sidebar-header">
                <span>Query History</span>
                <div className="fe-header-actions">
                    <button
                        className="fe-header-btn"
                        onClick={() => { fetchHistory(); fetchBookmarks(); }}
                        title="Refresh"
                    >
                        <LuRefreshCw size={13} />
                    </button>
                    {onClose && (
                        <button
                            className="fe-header-btn"
                            onClick={onClose}
                            title="Close"
                            aria-label="Close history panel"
                        >
                            <LuX size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Search — always directly under the header */}
            <div style={{ padding: '14px 14px 8px' }}>
                <div className="fe-search">
                    <LuSearch size={12} className="fe-search-icon" />
                    <input
                        type="text"
                        placeholder="Search queries..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="fe-search-input"
                    />
                </div>
            </div>

            {/* Tab Switcher — segmented control */}
            <div className="seg-wrap">
                <div className="seg seg--fill">
                    <button
                        onClick={() => setViewTab('history')}
                        className={`seg-item ${viewTab === 'history' ? 'seg-item--active' : ''}`}
                    >
                        Recent
                    </button>
                    <button
                        onClick={() => setViewTab('bookmarks')}
                        className={`seg-item ${viewTab === 'bookmarks' ? 'seg-item--active' : ''}`}
                    >
                        <LuStar size={12} /> Saved ({bookmarks.length})
                    </button>
                </div>
            </div>

            {/* Query List */}
            <div style={{ flex: 1, overflowY: 'auto', paddingTop: '6px' }}>
                {loading && viewTab === 'history' && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px' }}>Loading...</div>
                )}

                {!loading && activeList.length === 0 && (
                    <div style={{ padding: '32px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <LuSearch size={28} color="var(--text-muted)" style={{ opacity: 0.35 }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {viewTab === 'history' ? 'No query history yet' : 'No saved queries'}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                            {viewTab === 'history' ? 'Run a query to see it here' : '★ Star queries from history to save them'}
                        </span>
                    </div>
                )}

                {/* Grouped history view */}
                {viewTab === 'history' && groupedItems && groupedItems.map(group => (
                    <div key={group.label}>
                        <div className="qh-group-header">
                            {group.label}
                        </div>
                        {group.items.map((item, idx) => renderQueryItem(item, `${group.label}-${idx}`))}
                    </div>
                ))}

                {/* Flat bookmarks view */}
                {viewTab === 'bookmarks' && activeList.map((item, idx) => renderQueryItem(item, idx))}

                {/* Hidden items note */}
                {hiddenCount > 0 && (
                    <div style={{ padding: '8px 14px', textAlign: 'center', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                        +{hiddenCount} more — use search to find older queries
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="qh-footer">
                {viewTab === 'history'
                    ? `${history.length} queries · auto-prune 30d`
                    : `${bookmarks.length} saved`
                }
            </div>
        </div>
    );
};

export default memo(QueryHistoryPanel);
