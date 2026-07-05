import { useState, useEffect } from 'react';

const DeleteConfirmModal = ({ isOpen, onClose, onConfirm, itemName, itemType }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setLoading(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleDelete = async () => {
        setLoading(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (err) {
            setError(err.message || "An error occurred during deletion.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--overlay-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,

        }}>
            <div className="modal-panel" style={{
                backgroundColor: 'var(--surface-overlay)', padding: '24px', borderRadius: '12px', width: '400px',
                border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)', fontFamily: 'inherit'
            }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-active)', fontSize: '16px' }}>
                    Delete {itemType}
                </h3>

                <div style={{ marginBottom: '20px', fontSize: '13px', color: 'var(--text-color)', lineHeight: '1.5' }}>
                    Are you sure you want to delete this {itemType.toLowerCase()}?<br /><br />
                    <strong style={{ color: 'var(--text-active)', wordBreak: 'break-all' }}>{itemName}</strong>
                    {itemType === 'Table' && <div style={{ marginTop: '10px', color: 'var(--color-destructive)', fontWeight: 'bold' }}>This action cannot be undone.</div>}
                </div>

                {error && <div style={{ padding: '10px', backgroundColor: 'var(--feedback-error-bg)', color: 'var(--feedback-error-text)', borderRadius: '4px', marginBottom: '15px', fontSize: '12px', border: '1px solid var(--feedback-error-border)' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={onClose} disabled={loading} style={{
                        backgroundColor: 'var(--surface-overlay)', padding: '6px 16px', borderRadius: '3px',
                        border: '1px solid var(--border-color)', color: 'var(--text-color)', cursor: loading ? 'default' : 'pointer', fontWeight: '500', opacity: loading ? 0.7 : 1
                    }}>
                        Cancel
                    </button>
                    <button type="button" onClick={handleDelete} disabled={loading} style={{
                        backgroundColor: 'var(--color-destructive)', padding: '6px 16px', borderRadius: '3px',
                        border: 'none', color: 'var(--color-destructive-text)', fontWeight: 'bold', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1
                    }}>
                        {loading ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmModal;
