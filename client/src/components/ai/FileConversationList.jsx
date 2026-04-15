import { useState, useEffect, useCallback } from 'react';
import { LuMessageSquarePlus, LuArrowLeft, LuMessageSquare, LuLoader, LuTrash2 } from 'react-icons/lu';

const API = 'http://localhost:3001';

/**
 * Groups conversations by relative date buckets.
 */
const groupConversations = (conversations) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    const groups = {
        today: [],
        yesterday: [],
        lastWeek: [],
        lastMonth: [],
        older: [],
    };

    for (const conv of conversations) {
        const date = new Date(conv.updated_at || conv.created_at);
        if (date >= todayStart) {
            groups.today.push(conv);
        } else if (date >= yesterdayStart) {
            groups.yesterday.push(conv);
        } else if (date >= weekStart) {
            groups.lastWeek.push(conv);
        } else if (date >= monthStart) {
            groups.lastMonth.push(conv);
        } else {
            groups.older.push(conv);
        }
    }

    return groups;
};

/**
 * Formats time for a conversation item.
 */
const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const GROUP_LABELS = {
    today: 'Today',
    yesterday: 'Yesterday',
    lastWeek: 'Last 7 Days',
    lastMonth: 'Last 30 Days',
    older: 'Older',
};

/**
 * FileConversationList — Full-panel history view showing all conversations
 * for the currently active file, grouped by date (Cursor/ChatGPT style).
 */
const FileConversationList = ({ filePath, activeConversationId, onSelect, onNew, onBack }) => {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState(null);

    // Fetch conversations for the current file
    const fetchConversations = useCallback(async () => {
        if (!filePath) {
            setConversations([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const params = new URLSearchParams({ path: filePath });
            const res = await fetch(`${API}/api/ai/conversations/by-file?${params}`);
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } catch (err) {
            console.error('Failed to fetch file conversations:', err);
        } finally {
            setLoading(false);
        }
    }, [filePath]);

    // Fetch when component mounts or filePath changes
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Delete a conversation
    const handleDelete = async (e, convId) => {
        e.stopPropagation();
        if (deletingId) return;
        setDeletingId(convId);
        try {
            const res = await fetch(`${API}/api/ai/conversations/${convId}`, { method: 'DELETE' });
            if (res.ok) {
                setConversations(prev => prev.filter(c => c.id !== convId));
                // If we deleted the active conversation, start a new one
                if (convId === activeConversationId) {
                    onNew();
                }
            }
        } catch (err) {
            console.error('Failed to delete conversation:', err);
        } finally {
            setDeletingId(null);
        }
    };

    const groups = groupConversations(conversations);
    const groupOrder = ['today', 'yesterday', 'lastWeek', 'lastMonth', 'older'];
    const hasConversations = conversations.length > 0;

    return (
        <div className="ai-history-panel">
            {/* Header */}
            <div className="ai-history-header">
                <button className="ai-icon-btn" onClick={onBack} title="Back to chat">
                    <LuArrowLeft size={16} />
                </button>
                <span className="ai-history-title">Chat History</span>
                <button
                    className="ai-history-new-btn"
                    onClick={() => { onNew(); onBack(); }}
                    title="New Chat"
                >
                    <LuMessageSquarePlus size={14} />
                    <span>New</span>
                </button>
            </div>

            {/* List */}
            <div className="ai-history-list">
                {loading ? (
                    <div className="ai-history-empty">
                        <LuLoader size={18} style={{ animation: 'spin 2s linear infinite' }} />
                        <span>Loading conversations...</span>
                    </div>
                ) : !hasConversations ? (
                    <div className="ai-history-empty">
                        <LuMessageSquare size={24} style={{ opacity: 0.4 }} />
                        <span>No conversations yet</span>
                        <p>Start a new chat to begin exploring your data.</p>
                    </div>
                ) : (
                    groupOrder.map(groupKey => {
                        const items = groups[groupKey];
                        if (items.length === 0) return null;
                        return (
                            <div key={groupKey} className="ai-history-group">
                                <div className="ai-history-group-label">{GROUP_LABELS[groupKey]}</div>
                                {items.map(conv => (
                                    <div
                                        key={conv.id}
                                        className={`ai-history-item${conv.id === activeConversationId ? ' ai-history-item--active' : ''}`}
                                        onClick={() => { onSelect(conv.id); onBack(); }}
                                    >
                                        <div className="ai-history-item-icon">
                                            <LuMessageSquare size={14} />
                                        </div>
                                        <div className="ai-history-item-content">
                                            <span className="ai-history-item-title">
                                                {conv.title || 'New Conversation'}
                                            </span>
                                            <span className="ai-history-item-meta">
                                                {conv.message_count ? `${conv.message_count} messages` : ''} 
                                                {conv.message_count ? ' · ' : ''}
                                                {formatTime(conv.updated_at || conv.created_at)}
                                            </span>
                                        </div>
                                        <button
                                            className="ai-history-item-delete"
                                            onClick={(e) => handleDelete(e, conv.id)}
                                            title="Delete conversation"
                                        >
                                            <LuTrash2 size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default FileConversationList;
