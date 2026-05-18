import { useState, useEffect, useCallback } from 'react';
import { LuZap, LuRefreshCw, LuChevronDown, LuChevronRight, LuTag } from 'react-icons/lu';
import { API_BASE as API } from '../../api.js';

/**
 * SkillsPanel — Read-only list of available AI skills loaded from agent/skills/.
 * Shows name, description, keywords, and expandable content preview.
 */
const SkillsPanel = () => {
    const [skills, setSkills] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedId, setExpandedId] = useState(null);
    const [skillContent, setSkillContent] = useState({});
    const [loadingContent, setLoadingContent] = useState(null);

    const loadSkills = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API}/api/ai/skills`);
            if (res.ok) setSkills(await res.json());
        } catch (err) {
            console.error('Failed to load skills:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadSkills(); }, [loadSkills]);

    const handleToggle = async (skill) => {
        if (expandedId === skill.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(skill.id);
        if (skillContent[skill.id]) return;

        setLoadingContent(skill.id);
        try {
            const res = await fetch(`${API}/api/ai/skills/${skill.id}`);
            if (res.ok) {
                const data = await res.json();
                setSkillContent(prev => ({ ...prev, [skill.id]: data.content || '' }));
            }
        } catch (err) {
            console.error('Failed to load skill content:', err);
        } finally {
            setLoadingContent(null);
        }
    };

    if (isLoading) {
        return (
            <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Loading skills...
            </div>
        );
    }

    return (
        <div className="mem-panel">
            <div className="mem-panel__header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <LuZap size={16} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>AI Skills</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({skills.length})</span>
                </div>
                <button
                    className="mem-panel__refresh-btn"
                    onClick={loadSkills}
                    title="Refresh skills"
                >
                    <LuRefreshCw size={13} />
                </button>
            </div>

            {skills.length === 0 ? (
                <div className="mem-panel__empty">
                    <LuZap size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No skills found.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Add skill files to <code style={{ fontSize: 10 }}>agent/skills/</code> in your project.
                    </p>
                </div>
            ) : (
                <div className="mem-panel__list">
                    {skills.map(skill => {
                        const isExpanded = expandedId === skill.id;
                        return (
                            <div key={skill.id} className="mem-item" style={{ cursor: 'default' }}>
                                <div
                                    className="mem-item__view"
                                    style={{ cursor: 'pointer', userSelect: 'none' }}
                                    onClick={() => handleToggle(skill)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        {isExpanded
                                            ? <LuChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            : <LuChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                        }
                                        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                                            {skill.name}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: 'auto', flexShrink: 0 }}>
                                            {skill.id}
                                        </span>
                                    </div>
                                    <p className="mem-item__content" style={{ marginLeft: 19, marginBottom: skill.keywords?.length ? 6 : 0 }}>
                                        {skill.description}
                                    </p>
                                    {skill.keywords?.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginLeft: 19 }}>
                                            <LuTag size={10} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                            {skill.keywords.slice(0, 8).map(kw => (
                                                <span
                                                    key={kw}
                                                    style={{
                                                        fontSize: 10,
                                                        padding: '1px 6px',
                                                        borderRadius: 3,
                                                        background: 'var(--bg-tertiary)',
                                                        color: 'var(--text-muted)',
                                                        border: '1px solid var(--border-subtle)',
                                                    }}
                                                >
                                                    {kw}
                                                </span>
                                            ))}
                                            {skill.keywords.length > 8 && (
                                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                    +{skill.keywords.length - 8} more
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div style={{
                                        marginTop: 8,
                                        padding: '10px 12px',
                                        background: 'var(--bg-secondary)',
                                        borderRadius: 4,
                                        border: '1px solid var(--border-subtle)',
                                    }}>
                                        {loadingContent === skill.id ? (
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading...</span>
                                        ) : (
                                            <pre style={{
                                                margin: 0,
                                                fontSize: 11,
                                                color: 'var(--text-secondary)',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                fontFamily: 'monospace',
                                                lineHeight: 1.6,
                                                maxHeight: 320,
                                                overflowY: 'auto',
                                            }}>
                                                {skillContent[skill.id] || 'No content available.'}
                                            </pre>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <p style={{ margin: '12px 4px 0', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                Skills guide the AI agent with specialized workflows. Add or edit SKILL.md files in <code style={{ fontSize: 10 }}>agent/skills/</code> to customize behavior.
            </p>
        </div>
    );
};

export default SkillsPanel;
