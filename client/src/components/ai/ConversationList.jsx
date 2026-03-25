import { useState, useEffect, useMemo } from 'react';
import { LuSearch, LuPlus, LuStar, LuTrash2, LuMessageSquare, LuX } from 'react-icons/lu';

const API = 'http://localhost:3001';

/**
 * ConversationList — Sidebar panel in Data Diving mode.
 * Lists conversations grouped by date with search, star, and delete.
 */
const ConversationList = ({ activeId, onSelect, onNew, onClose }) => {
    const [conversations, setConversations] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    // Fetch conversations
    const fetchConversations = async () => {
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            const res = await fetch(`${API}/api/ai/conversations?${params}`);
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } catch (err) {
            console.error('Failed to fetch conversations:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConversations();
    }, [search]);

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
                        onClick={() => onSelect(conv.id)}
                        className={`ai-conv-item${conv.id === activeId ? ' ai-conv-item--active' : ''}`}
                    >
                        <LuMessageSquare size={13} className="ai-conv-item-icon" />
                        <span className="ai-conv-item-title">
                            {conv.title || 'New Conversation'}
                        </span>
                        <div className="ai-conv-item-actions">
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
            {/* Header */}
            <div className="ai-conv-header">
                <span className="ai-conv-header-title">Conversations</span>
                <div className="ai-conv-header-actions">
                    <button onClick={onNew} title="New Conversation" className="ai-conv-header-btn ai-conv-header-btn--accent">
                        <LuPlus size={16} />
                    </button>
                    {onClose && (
                        <button onClick={onClose} title="Close" className="ai-conv-header-btn">
                            <LuX size={16} />
                        </button>
                    )}
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

            {/* New Conversation Button */}
            <div className="ai-conv-new-btn-wrap">
                <button onClick={onNew} className="ai-conv-new-btn">
                    <LuPlus size={14} /> New Conversation
                </button>
            </div>

            {/* Conversation List */}
            <div className="ai-conv-list">
                {loading ? (
                    <div className="ai-conv-empty">Loading...</div>
                ) : conversations.length === 0 ? (
                    <div className="ai-conv-empty">
                        {search ? 'No conversations found.' : 'No conversations yet.'}
                    </div>
                ) : (
                    <>
                        {renderGroup('⭐ Starred', grouped.starred)}
                        {renderGroup('Today', grouped.today)}
                        {renderGroup('Yesterday', grouped.yesterday)}
                        {renderGroup('This Week', grouped.thisWeek)}
                        {renderGroup('Older', grouped.older)}
                    </>
                )}
            </div>
        </div>
    );
};

export default ConversationList;
