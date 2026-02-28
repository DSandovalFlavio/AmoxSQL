import { useState, useEffect, useRef } from 'react';
import { LuX, LuClipboard, LuStar, LuHistory, LuBookmark } from "react-icons/lu";

const QueryHistoryModal = ({ isOpen, onClose, onSelect }) => {
    const [history, setHistory] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [viewTab, setViewTab] = useState('history'); // 'history' | 'bookmarks'

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
            fetchBookmarks();
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/db/history');
            const data = await response.json();
            if (Array.isArray(data)) {
                setHistory(data);
            }
        } catch (e) {
            console.error("Failed to fetch history", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchBookmarks = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/bookmarks');
            const data = await response.json();
            if (Array.isArray(data)) setBookmarks(data);
        } catch (e) { /* silent */ }
    };

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
        return new Date(dateString).toLocaleString();
    };

    const q = search.toLowerCase();
    const filteredHistory = history.filter(h =>
        h.query.toLowerCase().includes(q)
    );
    const filteredBookmarks = bookmarks.filter(b =>
        b.query.toLowerCase().includes(q)
    );

    const handleCopy = (text, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
    };

    if (!isOpen) return null;

    const activeList = viewTab === 'history' ? filteredHistory : filteredBookmarks;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(8px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', width: '800px', height: '600px',
                borderRadius: '12px', border: '1px solid var(--border-default)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                color: 'var(--text-secondary)', fontFamily: 'inherit', boxShadow: 'var(--shadow-lg)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-raised)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--text-active)' }}>
                            {viewTab === 'history' ? 'Query History' : 'Bookmarked Queries'}
                        </h2>
                        {/* Tab Switcher */}
                        <div style={{ display: 'flex', backgroundColor: 'var(--input-bg)', borderRadius: '4px', padding: '2px', border: '1px solid var(--border-color)' }}>
                            <button
                                onClick={() => setViewTab('history')}
                                style={{ padding: '3px 10px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '600', backgroundColor: viewTab === 'history' ? 'var(--accent-color-user)' : 'transparent', color: viewTab === 'history' ? 'var(--button-text-color)' : 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <LuHistory size={12} /> History
                            </button>
                            <button
                                onClick={() => setViewTab('bookmarks')}
                                style={{ padding: '3px 10px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '600', backgroundColor: viewTab === 'bookmarks' ? 'var(--accent-color-user)' : 'transparent', color: viewTab === 'bookmarks' ? 'var(--button-text-color)' : 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <LuBookmark size={12} /> Bookmarks{bookmarks.length > 0 ? ` (${bookmarks.length})` : ''}
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', fontSize: '13px' }}
                        />
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                    </div>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    {loading && viewTab === 'history' && <div style={{ padding: '20px', textAlign: 'center' }}>Loading history...</div>}
                    {!loading && activeList.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            {viewTab === 'history' ? 'No history found (RW mode required)' : 'No bookmarked queries yet. Star ⭐ queries from the History tab.'}
                        </div>
                    )}

                    {!loading && activeList.map((item, index) => {
                        const query = item.query;
                        const date = viewTab === 'history' ? item.executed_at : item.bookmarkedAt;
                        const starred = isBookmarked(query);

                        return (
                            <div key={index} style={{
                                padding: '12px 20px',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '5px',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                onClick={() => {
                                    if (onSelect) {
                                        onSelect(query);
                                        onClose();
                                    }
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    <span>{formatDate(date)}</span>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {viewTab === 'history' ? (
                                            <button
                                                onClick={(e) => toggleBookmark(query, e)}
                                                title={starred ? "Remove Bookmark" : "Bookmark this query"}
                                                style={{ background: 'transparent', border: 'none', color: starred ? '#f59e0b' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color 120ms ease' }}
                                            >
                                                <LuStar size={14} fill={starred ? '#f59e0b' : 'none'} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={(e) => removeBookmark(query, e)}
                                                title="Remove Bookmark"
                                                style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                            >
                                                <LuStar size={14} fill="#f59e0b" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => handleCopy(query, e)}
                                            title="Copy to Clipboard"
                                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-color-user)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        >
                                            <LuClipboard size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '13px',
                                    color: 'var(--text-color)',
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: '100px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    position: 'relative'
                                }}>
                                    {query}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface-raised)', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    {viewTab === 'history'
                        ? 'Auto-prunes records older than 30 days. Click to insert query. ⭐ to bookmark.'
                        : `${bookmarks.length} bookmarked quer${bookmarks.length !== 1 ? 'ies' : 'y'}. Click to insert.`
                    }
                </div>
            </div>
        </div >
    );
};

export default QueryHistoryModal;
