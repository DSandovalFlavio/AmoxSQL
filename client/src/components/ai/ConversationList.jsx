import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LuSearch, LuPlus, LuStar, LuTrash2, LuMessageSquare, LuPencil, LuCheck } from 'react-icons/lu';

import { API_BASE as API } from '../../api.js';
const PAGE_SIZE = 20;

/**
 * ConversationList — Sidebar panel in Data Diving mode.
 * Lists conversations grouped by date with search, star, delete, and pagination.
 */
const ConversationList = ({ activeId, onSelect, onNew, mode }) => {
    const [conversations, setConversations] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const listRef = useRef(null);

    const startRename = (e, conv) => {
        e.stopPropagation();
        setRenamingId(conv.id);
        setRenameValue(conv.title || '');
    };

    const submitRename = async (id) => {
        const title = renameValue.trim();
        setRenamingId(null);
        if (!title) return;
        setConversations(prev => prev.map(c => (c.id === id ? { ...c, title } : c)));
        try {
            await fetch(`${API}/api/ai/conversations/${id}/title`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title }),
            });
        } catch (err) { console.error('Rename failed:', err); }
    };

    // Fetch conversations with pagination
    const fetchConversations = useCallback(async (append = false) => {
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (mode) params.set('mode', mode);
            const limit = append ? PAGE_SIZE : PAGE_SIZE;
            const offset = append ? conversations.length : 0;
            params.set('limit', limit + 1); // Fetch one extra to detect hasMore
            if (offset > 0) params.set('offset', offset);
            const res = await fetch(`${API}/api/ai/conversations?${params}`);
            if (res.ok) {
                const data = await res.json();
                const newHasMore = data.length > limit;
                const items = newHasMore ? data.slice(0, limit) : data;
                setHasMore(newHasMore);
                if (append) {
                    setConversations(prev => [...prev, ...items]);
                } else {
                    setConversations(items);
                }
            }
        } catch (err) {
            console.error('Failed to fetch conversations:', err);
        } finally {
            setLoading(false);
        }
    }, [search, conversations.length]);

    useEffect(() => {
        setLoading(true);
        setHasMore(true);
        fetchConversations(false);
    }, [search]);

    // Refresh when a new conversation is created from this tab
    useEffect(() => {
        const handler = () => fetchConversations(false);
        window.addEventListener('amox_conversation_created', handler);
        return () => window.removeEventListener('amox_conversation_created', handler);
    }, [fetchConversations]);

    // Infinite scroll handler
    const handleScroll = useCallback(() => {
        if (!listRef.current || !hasMore || loading) return;
        const { scrollTop, scrollHeight, clientHeight } = listRef.current;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            fetchConversations(true);
        }
    }, [hasMore, loading, fetchConversations]);

    // Group by date
    const grouped = useMemo(() => {
        const groups = { starred: [], today: [], yesterday: [], thisWeek: [], older: [] };
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

        for (const conv of conversations) {
            if (conv.is_starred) {
                groups.starred.push(conv);
                continue;
            }
            const d = new Date(conv.updated_at || conv.created_at);
            if (d >= today) groups.today.push(conv);
            else if (d >= yesterday) groups.yesterday.push(conv);
            else if (d >= weekAgo) groups.thisWeek.push(conv);
            else groups.older.push(conv);
        }
        return groups;
    }, [conversations]);

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        try {
            await fetch(`${API}/api/ai/conversations/${id}`, { method: 'DELETE' });
            setConversations(prev => prev.filter(c => c.id !== id));
            if (activeId === id) onSelect(null);
        } catch (err) { console.error('Delete failed:', err); }
    };

    const handleToggleStar = async (e, id) => {
        e.stopPropagation();
        try {
            await fetch(`${API}/api/ai/conversations/${id}/star`, { method: 'PUT' });
            fetchConversations();
        } catch (err) { console.error('Star toggle failed:', err); }
    };

    const renderGroup = (label, items) => {
        if (items.length === 0) return null;
        return (
            <div key={label}>
                <div className="ai-conv-group">{label}</div>
                {items.map(conv => (
                    <div
                        key={conv.id}
                        onClick={() => renamingId !== conv.id && onSelect(conv.id)}
                        onDoubleClick={(e) => startRename(e, conv)}
                        className={`ai-conv-item${conv.id === activeId ? ' ai-conv-item--active' : ''}`}
                    >
                        <LuMessageSquare size={13} className="ai-conv-item-icon" />
                        {renamingId === conv.id ? (
                            <input
                                type="text"
                                className="ai-conv-rename-input"
                                value={renameValue}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => submitRename(conv.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') submitRename(conv.id);
                                    else if (e.key === 'Escape') setRenamingId(null);
                                }}
                            />
                        ) : (
                            <span className="ai-conv-item-title">
                                {conv.title || 'New Conversation'}
                            </span>
                        )}
                        <div className="ai-conv-item-actions">
                            {renamingId === conv.id ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); submitRename(conv.id); }}
                                    title="Save name"
                                    className="ai-conv-action-btn"
                                >
                                    <LuCheck size={11} />
                                </button>
                            ) : (
                                <button
                                    onClick={(e) => startRename(e, conv)}
                                    title="Rename"
                                    className="ai-conv-action-btn"
                                >
                                    <LuPencil size={11} />
                                </button>
                            )}
                            <button
                                onClick={(e) => handleToggleStar(e, conv.id)}
                                title={conv.is_starred ? 'Unstar' : 'Star'}
                                className={`ai-conv-action-btn${conv.is_starred ? ' ai-conv-action-btn--starred' : ''}`}
                            >
                                <LuStar size={11} fill={conv.is_starred ? 'currentColor' : 'none'} />
                            </button>
                            <button
                                onClick={(e) => handleDelete(e, conv.id)}
                                title="Delete"
                                className="ai-conv-action-btn ai-conv-action-btn--delete"
                            >
                                <LuTrash2 size={11} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="ai-conv">
            {/* Header — matches the Files / DB sidebar sections */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Conversations
                </span>
                <div className="fe-header-actions">
                    <button onClick={onNew} title="New Conversation" className="fe-header-btn">
                        <LuPlus size={13} />
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="ai-conv-search">
                <div className="fe-search">
                    <LuSearch size={12} className="fe-search-icon" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search conversations..."
                        className="fe-search-input"
                    />
                </div>
            </div>

            {/* Conversation List */}
            <div className="ai-conv-list" ref={listRef} onScroll={handleScroll}>
                {loading ? (
                    <div className="ai-conv-empty">Loading...</div>
                ) : conversations.length === 0 ? (
                    <div className="ai-conv-empty">
                        {search ? 'No conversations found.' : 'No conversations yet.'}
                    </div>
                ) : (
                    <>
                        {renderGroup('Starred', grouped.starred)}
                        {renderGroup('Today', grouped.today)}
                        {renderGroup('Yesterday', grouped.yesterday)}
                        {renderGroup('This Week', grouped.thisWeek)}
                        {renderGroup('Older', grouped.older)}
                        {hasMore && (
                            <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                                Loading more...
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ConversationList;
