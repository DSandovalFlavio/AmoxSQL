import React from 'react';
import { LuX } from 'react-icons/lu';

const TabBar = ({ tabs, activeTabId, onTabClick, onTabClose, paneId, onDragStart, onReorder }) => {

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

    return (
        <div className="tab-bar">
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
    );
};

export default TabBar;
