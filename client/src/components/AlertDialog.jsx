import { useEffect } from 'react';

const AlertDialog = ({ isOpen, onClose, title = 'Notification', message, type = 'info' }) => {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isOpen && (e.key === 'Escape' || e.key === 'Enter')) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,

        }}>
            <div className="modal-panel" style={{
                backgroundColor: 'var(--surface-overlay)', padding: '24px', borderRadius: '12px', width: '400px',
                border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)', fontFamily: 'inherit'
            }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-active)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {title}
                </h3>

                <div style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-color)', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {message}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={onClose} autoFocus style={{
                        backgroundColor: 'var(--accent-color-user)', padding: '6px 20px', borderRadius: '3px',
                        border: 'none', color: 'var(--button-text-color)', fontWeight: 'bold', cursor: 'pointer'
                    }}>
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertDialog;
