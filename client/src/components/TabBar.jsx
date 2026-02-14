import React from 'react';

const TabBar = ({ tabs, activeTabId, onTabClick, onTabClose }) => {
    return (
        <div style={{
            display: 'flex',
            backgroundColor: '#141517', // Requested Theme Color
            height: '35px',
            alignItems: 'center',
            borderBottom: '1px solid #1E1E1E',
            overflowX: 'auto',
            userSelect: 'none'
        }}>
            {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                return (
                    <div
                        key={tab.id}
                        onClick={() => onTabClick(tab.id)}
                        className="tab-item"
                        style={{
                            padding: '0 10px',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: isActive ? '#1E1E1E' : '#2D2D2D',
                            color: isActive ? '#ffffff' : '#969696',
                            borderRight: '1px solid #1E1E1E',
                            borderTop: isActive ? '1px solid #007fd4' : '1px solid transparent', // Active indicator
                            cursor: 'pointer',
                            minWidth: '100px',
                            maxWidth: '200px',
                            fontSize: '13px'
                        }}
                    >
                        <span style={{ marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tab.name} {tab.dirty && '●'}
                        </span>
                        <span
                            onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                            style={{
                                cursor: 'pointer',
                                borderRadius: '3px',
                                padding: '0 4px',
                                fontSize: '14px'
                            }}
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
