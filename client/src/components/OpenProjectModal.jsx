import { useState } from 'react';

const OpenProjectModal = ({ isOpen, onClose, onOpen }) => {
    const [path, setPath] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onOpen(path);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', padding: '24px', borderRadius: '12px', width: '400px',
                border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)', fontFamily: 'inherit'
            }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-active)', fontSize: '16px' }}>Open Folder</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '15px' }}>
                    Enter the absolute path of the folder you want to open as a workspace.
                </p>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Folder Path</label>
                        <input
                            type="text"
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            placeholder="C:/Users/Name/Projects/MyData"
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', borderRadius: '3px' }}
                            autoFocus
                            required
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button type="button" onClick={onClose} style={{ backgroundColor: 'var(--button-bg-secondary)', padding: '6px 12px', borderRadius: '3px', border: 'none', color: 'var(--text-color)', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" style={{ backgroundColor: 'var(--button-bg-primary)', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Open</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OpenProjectModal;
