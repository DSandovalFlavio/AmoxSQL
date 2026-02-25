import React from 'react';

const TabBar = ({ tabs, activeTabId, onTabClick, onTabClose, paneId, onDragStart, onReorder }) => {

    const handleDragStart = (e, tabId) => {
        // e.dataTransfer.setData('application/json', JSON.stringify({ tabId, sourcePane: paneId }));
        // Using callback for cleaner state up top
        if (onDragStart) onDragStart(e, tabId, paneId);
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Allow drop
    };

    const handleDrop = (e, targetTabId) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent LayoutManager.handleGlobalDrop
        // Identify source from some shared state or dataTransfer if we used it.
        // But here we need to know the DRAGGED tab ID.
        // Since we are using a parent-level state `draggedTab` in LayoutManager, 
        // we assume `onReorder` will check that state? 
        // OR we can pass the dragTabId via dataTransfer.
        // Let's rely on the fact that LayoutManager knows `draggedTab`.
        // BUT wait, onReorder needs dragTabId.
        // Let's pass it in dataTransfer for robustness here, or just trust the parent?
        // Actually, if we use the parent state approach, we need to ask parent "who is being dragged?".
        // For local reorder, we can just use `onReorder(dragTabId, targetTabId, paneId)`.
        // Issue: We don't have dragTabId here unless we stored it in dataTransfer.
        // Let's assume onDragStart set it in parent, and parent handles the drop?
        // No, we are handling drop HERE on the target TAB.
        // Better: LayoutManager handles DROP for splitting. TabBar handles DROP for reordering.
        // LayoutManager's `draggedTab` state is the source of truth.
        // We can't access it here easily without props.
        // Let's just pass `draggedTab` as a prop? Or use simple dragstart/drop with DataTransfer.

        // Let's use simple DataTransfer for the ID to be self-contained.
        // Update: LayoutManager uses `draggedTab` state for the OVERLAY logic.
        // We should probably inject the ID into dataTransfer too.

        // Wait, I didn't add setData in LayoutManager's onDragStart wrapper? 
        // I should have. Let's fix that here if I can, or relies on the localized handleDragStart.
        // The props `onDragStart` is passed from LayoutManager.

        // Let's just use the LayoutManager's `draggedTab` state if possible? No, we don't have it.
        // Let's use a specialized reorder handler that takes (targetTabId, paneId). Parent knows `draggedTab`.
        // Yes, `onReorder(null, targetTabId, paneId)` -> Parent checks `draggedTab`.
        if (onReorder) onReorder(null, targetTabId, paneId);
    };

    return (
        <div style={{
            display: 'flex',
            backgroundColor: 'var(--surface-raised)',
            height: '36px',
            alignItems: 'stretch',
            borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto',
            userSelect: 'none'
        }}>
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
                        className="tab-item"
                        style={{
                            padding: '0 12px',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: isActive ? 'transparent' : 'transparent',
                            color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                            borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            cursor: 'pointer',
                            minWidth: '80px',
                            maxWidth: '200px',
                            fontSize: '13px',
                            fontWeight: isActive ? '500' : '400',
                            transition: 'color 120ms ease, border-color 120ms ease',
                            position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                            if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
                            const closeBtn = e.currentTarget.querySelector('.tab-close');
                            if (closeBtn) closeBtn.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                            if (!isActive) e.currentTarget.style.color = 'var(--text-tertiary)';
                            const closeBtn = e.currentTarget.querySelector('.tab-close');
                            if (closeBtn && !isActive) closeBtn.style.opacity = '0';
                        }}
                    >
                        <span style={{ marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tab.name} {tab.dirty && '●'}
                        </span>
                        <span
                            className="tab-close"
                            onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                            style={{
                                cursor: 'pointer',
                                borderRadius: '4px',
                                padding: '2px 4px',
                                fontSize: '14px',
                                opacity: isActive ? '1' : '0',
                                transition: 'opacity 120ms ease, background-color 120ms ease',
                                color: 'var(--text-tertiary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: '1'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                            title="Close"
                        >
                            ×
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default TabBar;
