import { useState, useEffect, useCallback } from 'react';
import { LuBrain, LuTrash2, LuPencil, LuCheck, LuX, LuRefreshCw } from 'react-icons/lu';

const API = 'http://localhost:3001';

const CATEGORY_LABELS = {
    global_rule: 'Rule',
    personal_fact: 'Fact',
};

const CATEGORY_COLORS = {
    global_rule: 'var(--accent-primary)',
    personal_fact: 'var(--accent-color-user)',
};

/**
 * MemoriesPanel — CRUD UI for AI cross-conversation memories.
 * Lists all active memories (superseded_by IS NULL), allows edit/delete.
 */
const MemoriesPanel = () => {
    const [memories, setMemories] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [editCategory, setEditCategory] = useState('');

    const loadMemories = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API}/api/ai/memories`);
            if (res.ok) setMemories(await res.json());
        } catch (err) {
            console.error('Failed to load memories:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadMemories(); }, [loadMemories]);

    const handleDelete = async (id) => {
        try {
            await fetch(`${API}/api/ai/memories/${id}`, { method: 'DELETE' });
            setMemories(prev => prev.filter(m => m.id !== id));
        } catch (err) {
            console.error('Failed to delete memory:', err);
        }
    };

    const handleStartEdit = (memory) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
        setEditCategory(memory.category);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editContent.trim()) return;
        try {
            await fetch(`${API}/api/ai/memories/${editingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent.trim(), category: editCategory }),
            });
            setMemories(prev => prev.map(m =>
                m.id === editingId ? { ...m, content: editContent.trim(), category: editCategory } : m
            ));
            setEditingId(null);
        } catch (err) {
            console.error('Failed to update memory:', err);
        }
    };

    const handleCancelEdit = () => { setEditingId(null); };

    if (isLoading) {
        return (
            <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Loading memories...
            </div>
        );
    }

    return (
        <div className="mem-panel">
            <div className="mem-panel__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LuBrain size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>AI Memories</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({memories.length})</span>
                </div>
                <button
                    className="mem-panel__refresh-btn"
                    onClick={loadMemories}
                    title="Refresh memories"
                >
                    <LuRefreshCw size={13} />
                </button>
            </div>

            {memories.length === 0 ? (
                <div className="mem-panel__empty">
                    <LuBrain size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No memories yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Memories are extracted automatically from your conversations.
                    </p>
                </div>
            ) : (
                <div className="mem-panel__list">
                    {memories.map(memory => (
                        <div key={memory.id} className="mem-item">
                            {editingId === memory.id ? (
                                <div className="mem-item__edit">
                                    <select
                                        className="mem-item__category-select"
                                        value={editCategory}
                                        onChange={e => setEditCategory(e.target.value)}
                                    >
                                        <option value="global_rule">Rule</option>
                                        <option value="personal_fact">Fact</option>
                                    </select>
                                    <textarea
                                        className="mem-item__textarea"
                                        value={editContent}
                                        onChange={e => setEditContent(e.target.value)}
                                        rows={3}
                                        autoFocus
                                    />
                                    <div className="mem-item__edit-actions">
                                        <button className="mem-item__action-btn mem-item__action-btn--save" onClick={handleSaveEdit} title="Save">
                                            <LuCheck size={13} /> Save
                                        </button>
                                        <button className="mem-item__action-btn mem-item__action-btn--cancel" onClick={handleCancelEdit} title="Cancel">
                                            <LuX size={13} /> Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mem-item__view">
                                    <span
                                        className="mem-item__badge"
                                        style={{ backgroundColor: `${CATEGORY_COLORS[memory.category] || 'var(--accent-primary)'}22`, color: CATEGORY_COLORS[memory.category] || 'var(--accent-primary)', borderColor: `${CATEGORY_COLORS[memory.category] || 'var(--accent-primary)'}44` }}
                                    >
                                        {CATEGORY_LABELS[memory.category] || memory.category}
                                    </span>
                                    <p className="mem-item__content">{memory.content}</p>
                                    <div className="mem-item__actions">
                                        <button className="mem-item__action-btn" onClick={() => handleStartEdit(memory)} title="Edit">
                                            <LuPencil size={12} />
                                        </button>
                                        <button className="mem-item__action-btn mem-item__action-btn--delete" onClick={() => handleDelete(memory.id)} title="Delete">
                                            <LuTrash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MemoriesPanel;
