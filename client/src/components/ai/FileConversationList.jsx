import { useState, useEffect, useRef, useCallback } from 'react';
import { LuMessageSquarePlus, LuChevronDown, LuHistory } from 'react-icons/lu';

const API = 'http://localhost:3001';

/**
 * Formats a date as a compact relative string.
 */
const relativeDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/**
 * FileConversationList — Compact dropdown showing past conversations
 * for the currently active file in the AI Assistant panel header.
 */
const FileConversationList = ({ filePath, activeConversationId, onSelect, onNew }) => {
    const [conversations, setConversations] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);

    // Fetch conversations for the current file
    const fetchConversations = useCallback(async () => {
        if (!filePath) {
            setConversations([]);
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

    // Re-fetch when filePath changes
    useEffect(() => {
        fetchConversations();
    }, [fetchConversations]);

    // Re-fetch when dropdown opens (to catch new conversations)
    useEffect(() => {
        if (isOpen) fetchConversations();
    }, [isOpen]);

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const activeConv = conversations.find(c => c.id === activeConversationId);
    const otherConvs = conversations.filter(c => c.id !== activeConversationId);

    // If no conversations and no active one, show only the new chat button
    if (conversations.length === 0 && !activeConversationId) {
        return (
            <button
                onClick={onNew}
                className="file-conv-new-btn"
                title="New Chat"
            >
                <LuMessageSquarePlus size={14} />
            </button>
        );
    }

    return (
        <div className="file-conv" ref={dropdownRef}>
            {/* Trigger button */}
            <button
                className={`file-conv-trigger${isOpen ? ' file-conv-trigger--open' : ''}`}
                onClick={() => setIsOpen(prev => !prev)}
                title="File conversations"
            >
                <span className="file-conv-trigger-label">
                    {activeConv ? (activeConv.title || 'New Conversation') : 'Conversations'}
                </span>
                <LuChevronDown
                    size={12}
                    className={`file-conv-chevron${isOpen ? ' file-conv-chevron--open' : ''}`}
                />
            </button>

            {/* New chat button */}
            <button
                onClick={onNew}
                className="file-conv-new-btn"
                title="New Chat"
            >
                <LuMessageSquarePlus size={14} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="file-conv-dropdown">
                    {loading ? (
                        <div className="file-conv-empty">Loading...</div>
                    ) : (
                        <>
                            {/* Active conversation */}
                            {activeConv && (
                                <div
                                    className="file-conv-item file-conv-item--active"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <span className="file-conv-item-title">
                                        {activeConv.title || 'New Conversation'}
                                    </span>
                                    <span className="file-conv-item-date">
                                        <LuHistory size={10} />
                                        {relativeDate(activeConv.updated_at || activeConv.created_at)}
                                    </span>
                                </div>
                            )}

                            {/* Separator if both active and others exist */}
                            {activeConv && otherConvs.length > 0 && (
                                <div className="file-conv-separator" />
                            )}

                            {/* Other conversations */}
                            {otherConvs.map(conv => (
                                <div
                                    key={conv.id}
                                    className="file-conv-item"
                                    onClick={() => {
                                        onSelect(conv.id);
                                        setIsOpen(false);
                                    }}
                                >
                                    <span className="file-conv-item-title">
                                        {conv.title || 'New Conversation'}
                                    </span>
                                    <span className="file-conv-item-date">
                                        <LuHistory size={10} />
                                        {relativeDate(conv.updated_at || conv.created_at)}
                                    </span>
                                </div>
                            ))}

                            {/* Empty state */}
                            {otherConvs.length === 0 && !activeConv && (
                                <div className="file-conv-empty">No conversations for this file.</div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default FileConversationList;
