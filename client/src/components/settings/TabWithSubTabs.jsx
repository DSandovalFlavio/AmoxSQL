/**
 * TabWithSubTabs — reusable sub-tab bar for Settings panels.
 * Renders the canonical segmented control (.seg) + active child content below.
 *
 * Usage:
 *   <TabWithSubTabs
 *     tabs={[
 *       { id: 'modes', label: 'Modes' },
 *       { id: 'models', label: 'Models' },
 *     ]}
 *     activeTab={aiSubTab}
 *     onChange={setAiSubTab}
 *   />
 *   {aiSubTab === 'modes' && <Modes ... />}
 */
import { memo } from 'react';

const TabWithSubTabs = memo(function TabWithSubTabs({ tabs, activeTab, onChange }) {
    return (
        <div className="seg" style={{ display: 'inline-flex', marginBottom: '16px' }}>
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    className={`seg-item${activeTab === tab.id ? ' seg-item--active' : ''}`}
                    onClick={() => onChange(tab.id)}
                    type="button"
                >
                    {tab.icon && <span style={{ display: 'inline-flex' }}>{tab.icon}</span>}
                    {tab.label}
                    {tab.badge != null && (
                        <span style={{
                            marginLeft: '4px', fontSize: 'var(--text-2xs)',
                            background: 'var(--accent-muted)', color: 'var(--accent-primary)',
                            borderRadius: 'var(--radius-full)', padding: '0 5px', lineHeight: '15px',
                        }}>{tab.badge}</span>
                    )}
                </button>
            ))}
        </div>
    );
});

export default TabWithSubTabs;
