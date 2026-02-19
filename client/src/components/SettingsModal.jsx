import React, { useState } from 'react';
import { LuX, LuPalette, LuMonitor, LuMoon, LuSun } from 'react-icons/lu';

const SettingsModal = ({ isOpen, onClose, currentTheme, onThemeChange }) => {
    const [activeTab, setActiveTab] = useState('appearance');

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
        }}>
            <div style={{
                backgroundColor: 'var(--modal-bg)',
                color: 'var(--text-color)',
                width: '700px',
                height: '500px',
                borderRadius: '8px',
                display: 'flex',
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                border: '1px solid var(--border-color)'
            }}>
                {/* Sidebar */}
                <div style={{
                    width: '200px',
                    backgroundColor: 'var(--sidebar-bg)',
                    borderRight: '1px solid var(--border-color)',
                    padding: '20px 0'
                }}>
                    <div style={{ padding: '0 20px 20px', fontWeight: 'bold', fontSize: '16px', color: 'var(--text-active)' }}>
                        Settings
                    </div>

                    <div
                        onClick={() => setActiveTab('appearance')}
                        style={{
                            padding: '10px 20px',
                            cursor: 'pointer',
                            backgroundColor: activeTab === 'appearance' ? 'var(--sidebar-item-active-bg)' : 'transparent',
                            color: activeTab === 'appearance' ? 'var(--text-active)' : 'var(--text-color)',
                            display: 'flex', alignItems: 'center', gap: '10px',
                            borderLeft: activeTab === 'appearance' ? '3px solid var(--accent-color-user)' : '3px solid transparent'
                        }}
                    >
                        <LuPalette size={16} /> Appearance
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{
                        padding: '15px 20px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-active)' }}>
                            {activeTab === 'appearance' ? 'Appearance' : 'Settings'}
                        </h2>
                        <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-color)', padding: '5px' }}>
                            <LuX size={20} />
                        </button>
                    </div>

                    <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                        {activeTab === 'appearance' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                                {/* Theme Selection */}
                                <div>
                                    <h3 style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--text-active)' }}>Color Theme</h3>
                                    <div style={{ display: 'flex', gap: '15px' }}>

                                        {/* Dark Option */}
                                        <div
                                            onClick={() => onThemeChange('dark')}
                                            style={{
                                                flex: 1,
                                                cursor: 'pointer',
                                                border: currentTheme === 'dark' ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                padding: '10px',
                                                backgroundColor: '#1e1f22', // Preview Force Dark
                                                opacity: currentTheme === 'dark' ? 1 : 0.7
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#fff' }}>
                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #555', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {currentTheme === 'dark' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ffff' }}></div>}
                                                </div>
                                                <LuMoon size={16} /> Dark
                                            </div>
                                            {/* Preview Mockup */}
                                            <div style={{ display: 'flex', height: '60px', borderRadius: '4px', overflow: 'hidden', fontSize: '8px' }}>
                                                <div style={{ width: '30%', background: '#141517', borderRight: '1px solid #333' }}></div>
                                                <div style={{ flex: 1, background: '#1e1f22', color: '#ccc', padding: '4px' }}>
                                                    SELECT * FROM...
                                                </div>
                                            </div>
                                        </div>

                                        {/* Light Option */}
                                        <div
                                            onClick={() => onThemeChange('light')}
                                            style={{
                                                flex: 1,
                                                cursor: 'pointer',
                                                border: currentTheme === 'light' ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                padding: '10px',
                                                backgroundColor: '#ffffff', // Preview Force Light
                                                opacity: currentTheme === 'light' ? 1 : 0.7
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#000' }}>
                                                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {currentTheme === 'light' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0059ff' }}></div>}
                                                </div>
                                                <LuSun size={16} /> Light
                                            </div>
                                            {/* Preview Mockup */}
                                            <div style={{ display: 'flex', height: '60px', borderRadius: '4px', overflow: 'hidden', fontSize: '8px', border: '1px solid #eee' }}>
                                                <div style={{ width: '30%', background: '#f8f9fa', borderRight: '1px solid #dee2e6' }}></div>
                                                <div style={{ flex: 1, background: '#ffffff', color: '#333', padding: '4px' }}>
                                                    SELECT * FROM...
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>

                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    Current Accent Color: <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: 'var(--accent-color-user)', borderRadius: '50%' }}></span> {currentTheme === 'dark' ? 'Green #00ffff' : 'Blue #0059ff'}
                                </div>

                            </div>
                        )}
                    </div>

                    <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border-color)', textAlign: 'right' }}>
                        <button onClick={onClose} style={{ padding: '8px 16px' }}>Done</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
