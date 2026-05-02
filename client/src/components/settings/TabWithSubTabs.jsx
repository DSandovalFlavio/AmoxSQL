/**
 * TabWithSubTabs — reusable horizontal sub-tab bar for Settings panels.
 * Renders a compact pill-style tab strip + active child content below.
 *
 * Usage:
 *   <TabWithSubTabs
 *     tabs={[
 *       { id: 'general', label: 'General' },
 *       { id: 'formatting', label: 'Formatting' },
 *     ]}
 *     activeTab={activeEditorSubTab}
 *     onChange={setActiveEditorSubTab}
 *   />
 *   {activeEditorSubTab === 'general' && <EditorGeneral ... />}
 */
import { memo } from 'react';

const TabWithSubTabs = memo(function TabWithSubTabs({ tabs, activeTab, onChange }) {
    return (
        <div className="stg-subtab-bar">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    className={`stg-subtab-btn${activeTab === tab.id ? ' stg-subtab-btn--active' : ''}`}
                    onClick={() => onChange(tab.id)}
                    type="button"
                >
                    {tab.icon && <span className="stg-subtab-icon">{tab.icon}</span>}
                    {tab.label}
                    {tab.badge != null && (
                        <span className="stg-subtab-badge">{tab.badge}</span>
                    )}
                </button>
            ))}
        </div>
    );
});

export default TabWithSubTabs;
