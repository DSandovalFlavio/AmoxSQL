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
                <div style={{
                    fontSize: '10px', fontWeight: '600', textTransform: 'uppercase',
                    color: 'var(--text-muted)', padding: '10px 16px 4px',
                    letterSpacing: '0.5px',
                }}>{label}</div>
                {items.map(conv => (
                    <div
                        key={conv.id}
                        onClick={() => onSelect(conv.id)}
                        style={{
                            padding: '8px 16px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            backgroundColor: conv.id === activeId ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            borderLeft: conv.id === activeId ? '2px solid var(--accent-color-user)' : '2px solid transparent',
                            transition: 'all 0.12s',
                        }}
                        className={conv.id === activeId ? '' : 'ai-conv-item'}
                    >
                        <LuMessageSquare size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <span style={{
                            flex: 1, fontSize: '12px', color: 'var(--text-active)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                            {conv.title || 'New Conversation'}
                        </span>
                        <div style={{ display: 'flex', gap: '2px', opacity: 0.6 }} className="conv-actions">
                            <button
                                onClick={(e) => handleToggleStar(e, conv.id)}
                                title={conv.is_starred ? 'Unstar' : 'Star'}
                                style={{
                                    background: 'none', border: 'none', padding: '2px',
                                    color: conv.is_starred ? 'var(--feedback-warning-text)' : 'var(--text-muted)',
                                    cursor: 'pointer', display: 'flex',
                                }}
                            >
                                <LuStar size={11} fill={conv.is_starred ? 'currentColor' : 'none'} />
                            </button>
                            <button
                                onClick={(e) => handleDelete(e, conv.id)}
                                title="Delete"
                                style={{
                                    background: 'none', border: 'none', padding: '2px',
                                    color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                                }}
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
        <div style={{
            width: '260px', minWidth: '260px', height: '100%',
            backgroundColor: 'var(--sidebar-bg)',
            borderRight: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-active)' }}>Conversations</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={onNew}
                        title="New Conversation"
                        style={{
                            background: 'none', border: 'none', padding: '4px',
                            color: 'var(--accent-color-user)', cursor: 'pointer', display: 'flex',
                        }}
                    >
                        <LuPlus size={16} />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            title="Close"
                            style={{
                                background: 'none', border: 'none', padding: '4px',
                                color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
                            }}
                        >
                            <LuX size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Search */}
            <div style={{ padding: '8px 12px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                    borderRadius: '6px', padding: '5px 10px',
                }}>
                    <LuSearch size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <input
                        type="text" value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search conversations..."
                        style={{
                            flex: 1, border: 'none', outline: 'none', fontSize: '11px',
                            backgroundColor: 'transparent', color: 'var(--text-active)',
                            fontFamily: 'inherit',
                        }}
                    />
                </div>
            </div>

            {/* New Conversation Button */}
            <div style={{ padding: '4px 12px 8px' }}>
                <button
                    onClick={onNew}
                    style={{
                        width: '100%', padding: '8px 12px',
                        backgroundColor: 'var(--accent-color-user)', color: 'var(--button-text-color)',
                        border: 'none', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '12px', fontWeight: '600',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        transition: 'opacity 0.15s',
                    }}
                    className="ai-new-conv-btn"
                >
                    <LuPlus size={14} /> New Conversation
                </button>
            </div>

            {/* Conversation List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Loading...
                    </div>
                ) : conversations.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
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
