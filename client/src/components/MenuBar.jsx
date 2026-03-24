import { useState } from 'react';

const MenuBar = ({ onOpenProject, currentPath, onRunChain }) => {
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
                    className="mb-trigger"
                    data-active={activeMenu === 'file'}
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
                            className="mb-item"
                        >
                            📂 Open Folder...
                        </div>
                        <div
                            onClick={() => { window.location.reload(); }}
                            className="mb-item"
                        >
                            Reload Window
                        </div>
                        {onRunChain && (
                            <>
                                <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }} />
                                <div
                                    onClick={() => { onRunChain(); setActiveMenu(null); }}
                                    className="mb-item"
                                >
                                    🔗 Run Chain...
                                </div>
                            </>
                        )}
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
