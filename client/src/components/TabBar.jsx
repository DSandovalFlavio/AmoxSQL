import React, { useState, useRef, useEffect } from 'react';
import { LuX, LuPlus, LuCode, LuFilePlus, LuFileText, LuChevronDown } from 'react-icons/lu';

const TabBar = ({ tabs, activeTabId, onTabClick, onTabClose, paneId, onDragStart, onReorder, onCreateNew }) => {
    const [showNewMenu, setShowNewMenu] = useState(false);
    const menuRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!showNewMenu) return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowNewMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showNewMenu]);

    const handleDragStart = (e, tabId) => {
        if (onDragStart) onDragStart(e, tabId, paneId);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = (e, targetTabId) => {
        e.preventDefault();
        e.stopPropagation();
        if (onReorder) onReorder(null, targetTabId, paneId);
    };

    // Drop on empty bar space (past the last tab, or an entirely empty bar —
    // e.g. an empty pane's bar with zero tabs and thus no per-tab drop
    // targets at all). Per-tab handleDrop above stops propagation, so this
    // only fires when the drop didn't land on a specific tab.
    const handleBarDrop = (e) => {
        e.preventDefault();
        if (onReorder) onReorder(null, null, paneId);
    };

    return (
        <div className="tab-bar">
            {/* New File Button — always first, like Chrome's "+" */}
            {onCreateNew && (
                <div className="tab-bar-new" ref={menuRef}>
                    <button
                        className="tab-bar-new-btn"
                        onClick={() => onCreateNew('sql')}
                        title="New SQL File"
                    >
                        <LuPlus size={14} />
                    </button>
                    <button
                        className="tab-bar-new-chevron"
                        onClick={() => setShowNewMenu(v => !v)}
                        title="New File Options"
                    >
                        <LuChevronDown size={10} />
                    </button>
                    {showNewMenu && (
                        <div className="tab-bar-new-menu">
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('sql'); setShowNewMenu(false); }}>
                                <LuCode size={13} /> SQL Query
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('notebook'); setShowNewMenu(false); }}>
                                <LuFilePlus size={13} /> Notebook
                            </div>
                            <div className="tab-bar-new-menu-item" onClick={() => { onCreateNew('md'); setShowNewMenu(false); }}>
                                <LuFileText size={13} /> Markdown
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="tab-bar-tabs" onDragOver={handleDragOver} onDrop={handleBarDrop}>
                {tabs.map(tab => {
                    const isActive = tab.id === activeTabId;
                    return (
                        <div
                            key={tab.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, tab.id)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, tab.id)}
                            onClick={() => onTabClick(tab.id)}
                            className={`tab-item${isActive ? ' active' : ''}`}
                        >
                            <span className="tab-label">
                                {tab.name}
                            </span>
                            {tab.dirty && <span className="tab-dirty">●</span>}
                            <span
                                className="tab-close"
                                onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                                title="Close"
                            >
                                <LuX size={12} />
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Memoized: App re-renders must not reconcile the tab chrome when props are stable.
export default React.memo(TabBar);
