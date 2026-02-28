import { useState, useEffect } from 'react';
import { LuClipboard, LuStar, LuRefreshCw, LuSearch, LuTrash2 } from 'react-icons/lu';

/**
 * QueryHistoryPanel — Sidebar panel for browsing query history and bookmarks.
 */
const QueryHistoryPanel = ({ onSelect }) => {
    const [history, setHistory] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [viewTab, setViewTab] = useState('history'); // 'history' | 'bookmarks'

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/db/history');
            const data = await response.json();
            if (Array.isArray(data)) setHistory(data);
        } catch (e) { /* silent */ }
        finally { setLoading(false); }
    };

    const fetchBookmarks = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/bookmarks');
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
            await fetch('http://localhost:3001/api/bookmarks', {
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
            await fetch('http://localhost:3001/api/bookmarks', {
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

    const q = search.toLowerCase();
    const activeList = viewTab === 'history'
        ? history.filter(h => h.query.toLowerCase().includes(q))
        : bookmarks.filter(b => b.query.toLowerCase().includes(q));

    const handleSelect = (query) => {
        if (onSelect) onSelect(query);
    };

    const handleCopy = (text, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="sidebar-header" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Query History
                </span>
                <button
                    onClick={() => { fetchHistory(); fetchBookmarks(); }}
                    title="Refresh"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                    <LuRefreshCw size={12} />
                </button>
            </div>

            {/* Tab Switcher */}
            <div style={{ padding: '0 16px 6px', display: 'flex', gap: '0', borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                    onClick={() => setViewTab('history')}
                    style={{
                        flex: 1, padding: '4px 0', border: 'none', cursor: 'pointer',
                        fontSize: '11px', fontWeight: 600,
                        backgroundColor: 'transparent',
                        color: viewTab === 'history' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                        borderBottom: viewTab === 'history' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    }}
                >
                    Recent
                </button>
                <button
                    onClick={() => setViewTab('bookmarks')}
                    style={{
                        flex: 1, padding: '4px 0', border: 'none', cursor: 'pointer',
                        fontSize: '11px', fontWeight: 600,
                        backgroundColor: 'transparent',
                        color: viewTab === 'bookmarks' ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                        borderBottom: viewTab === 'bookmarks' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                    }}
                >
                    ★ Saved ({bookmarks.length})
                </button>
            </div>

            {/* Search */}
            <div style={{ padding: '6px 16px 8px' }}>
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder="Search queries..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                            border: '1px solid var(--border-color)', borderRadius: '4px',
                            padding: '4px 8px 4px 24px', fontSize: '11px', outline: 'none',
                        }}
                    />
                    <LuSearch size={12} color="var(--text-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
            </div>

            {/* Query List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading && viewTab === 'history' && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px' }}>Loading...</div>
                )}

                {!loading && activeList.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                        {viewTab === 'history' ? 'No query history yet' : 'No saved queries. ★ Star from history.'}
                    </div>
                )}

                {activeList.map((item, idx) => {
                    const query = item.query;
                    const date = viewTab === 'history' ? item.executed_at : item.bookmarkedAt;
                    const starred = isBookmarked(query);
                    // Show first 3 lines max
                    const preview = query.split('\n').slice(0, 3).join('\n');
                    const isTruncated = query.split('\n').length > 3;

                    return (
                        <div
                            key={idx}
                            className="file-item"
                            onClick={() => handleSelect(query)}
                            title="Click to insert into new editor"
                            style={{
                                padding: '6px 12px', cursor: 'pointer',
                                borderBottom: '1px solid var(--border-subtle)',
                                fontSize: '11px',
                            }}
                        >
                            {/* Date & Actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{formatDate(date)}</span>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    {viewTab === 'history' ? (
                                        <span
                                            onClick={(e) => toggleBookmark(query, e)}
                                            title={starred ? 'Remove bookmark' : 'Bookmark'}
                                            style={{ cursor: 'pointer', color: starred ? '#f59e0b' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', transition: 'color 120ms ease' }}
                                        >
                                            <LuStar size={11} fill={starred ? '#f59e0b' : 'none'} />
                                        </span>
                                    ) : (
                                        <span
                                            onClick={(e) => removeBookmark(query, e)}
                                            title="Remove"
                                            style={{ cursor: 'pointer', color: '#f59e0b', display: 'flex', alignItems: 'center' }}
                                        >
                                            <LuStar size={11} fill="#f59e0b" />
                                        </span>
                                    )}
                                    <span
                                        onClick={(e) => handleCopy(query, e)}
                                        title="Copy"
                                        style={{ cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
                                    >
                                        <LuClipboard size={11} />
                                    </span>
                                </div>
                            </div>
                            {/* SQL Preview */}
                            <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                                whiteSpace: 'pre-wrap',
                                lineHeight: '1.4',
                                overflow: 'hidden',
                                maxHeight: '48px',
                            }}>
                                {preview}{isTruncated ? '...' : ''}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{
                padding: '6px 16px', borderTop: '1px solid var(--border-subtle)',
                fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center',
            }}>
                {viewTab === 'history'
                    ? `${history.length} queries · auto-prune 30d`
                    : `${bookmarks.length} saved`
                }
            </div>
        </div>
    );
};

export default QueryHistoryPanel;
