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
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#252526', padding: '20px', borderRadius: '5px', width: '400px',
                border: '1px solid #454545', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                color: '#bcbec4', fontFamily: 'sans-serif'
            }}>
                <h3 style={{ marginTop: 0, color: '#fff', fontSize: '16px' }}>Open Folder</h3>
                <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '15px' }}>
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
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: '#3c3c3c', border: '1px solid #555', color: '#fff', borderRadius: '3px' }}
                            autoFocus
                            required
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                        <button type="button" onClick={onClose} style={{ backgroundColor: '#4e5157', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" style={{ backgroundColor: '#3574f0', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Open</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OpenProjectModal;
