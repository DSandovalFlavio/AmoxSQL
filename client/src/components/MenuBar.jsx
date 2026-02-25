import { useState } from 'react';

const MenuBar = ({ onOpenProject, currentPath }) => {
    const [activeMenu, setActiveMenu] = useState(null);

    const toggleMenu = (menuName) => {
        if (activeMenu === menuName) {
            setActiveMenu(null);
        } else {
            setActiveMenu(menuName);
        }
    };

    // Close menu when clicking outside (simplistic, for now requires click on item or toggle)
    // Ideally we put a backdrop or global handler

    return (
        <div style={{ height: '28px', backgroundColor: 'var(--surface-raised)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '12px', userSelect: 'none', color: 'var(--text-tertiary)' }}>
            <div style={{ position: 'relative' }}>
                <div
                    onClick={() => toggleMenu('file')}
                    style={{ padding: '0 8px', cursor: 'pointer', backgroundColor: activeMenu === 'file' ? 'var(--hover-bg)' : 'transparent', height: '28px', display: 'flex', alignItems: 'center', borderRadius: '4px', transition: 'background-color 120ms ease' }}
                >
                    File
                </div>
                {activeMenu === 'file' && (
                    <div style={{
                        position: 'absolute', top: '30px', left: 0,
                        backgroundColor: 'var(--surface-overlay)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '8px',
                        boxShadow: 'var(--shadow-md)',
                        minWidth: '180px', zIndex: 1000,
                        padding: '4px',
                        backdropFilter: 'blur(12px)'
                    }}>
                        <div
                            onClick={() => { onOpenProject(); setActiveMenu(null); }}
                            style={{ padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background-color 120ms ease' }}
                            className="menu-item"
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                            📂 Open Folder...
                        </div>
                        <div
                            onClick={() => { window.location.reload(); }}
                            style={{ padding: '7px 12px', cursor: 'pointer', color: 'var(--text-secondary)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background-color 120ms ease' }}
                            className="menu-item"
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                            Reload Window
                        </div>
                    </div>
                )}
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                {currentPath}
            </div>
        </div>
    );
};

export default MenuBar;
