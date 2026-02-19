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
        <div style={{ height: '30px', backgroundColor: 'var(--header-bg)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '12px', userSelect: 'none', color: 'var(--text-muted)' }}>
            <div style={{ position: 'relative' }}>
                <div
                    onClick={() => toggleMenu('file')}
                    style={{ padding: '0 8px', cursor: 'pointer', backgroundColor: activeMenu === 'file' ? 'var(--panel-bg)' : 'transparent', height: '30px', display: 'flex', alignItems: 'center' }}
                >
                    File
                </div>
                {activeMenu === 'file' && (
                    <div style={{
                        position: 'absolute', top: '30px', left: 0, backgroundColor: 'var(--header-bg)', border: '1px solid var(--border-color)',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)', minWidth: '150px', zIndex: 1000
                    }}>
                        <div
                            onClick={() => { onOpenProject(); setActiveMenu(null); }}
                            style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-color)' }}
                            className="menu-item"
                        >
                            📂 Open Folder...
                        </div>
                        <div
                            onClick={() => { /* Reload */ window.location.reload(); }}
                            style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-color)', borderTop: '1px solid var(--border-color)' }}
                            className="menu-item"
                        >
                            Reload Window
                        </div>
                    </div>
                )}
            </div>
            {/* Add more menus here like Edit, View etc if needed */}
            <div style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                {currentPath}
            </div>
        </div>
    );
};

export default MenuBar;
