import { useState, useEffect } from 'react';

const SaveToDbModal = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState('TABLE'); // TABLE or VIEW
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [successSummary, setSuccessSummary] = useState(null);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setSuccessSummary(null);
            setError(null);
            setSaving(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const result = await onSave(name, type);

            if (result && result.success) {
                setSuccessSummary(result.summary || `${type} created successfully.`);
            } else {
                setError(result?.error || "Failed to save to database.");
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setSuccessSummary(null);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(8px)'
        }}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', padding: '24px', borderRadius: '12px', width: '350px',
                border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)', fontFamily: 'inherit'
            }}>
                <h3 style={{ marginTop: 0, color: 'var(--text-active)', fontSize: '16px' }}>
                    {successSummary ? 'Save Completed' : 'Save Results to Database'}
                </h3>

                {!successSummary && (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Create a new table or view from the current query results.
                    </p>
                )}

                {successSummary ? (
                    /* Success View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ padding: '15px', backgroundColor: '#1e3a1e', border: '1px solid #2e5a2e', borderRadius: '4px', color: '#aaffaa', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                            <strong>Success!</strong><br /><br />
                            {successSummary}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleClose} style={{ backgroundColor: 'var(--accent-color-user)', padding: '8px 16px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Form View */
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {saving && <div style={{ padding: '10px', textAlign: 'center', color: 'var(--accent-color-user)' }}>Saving...</div>}
                        {error && <div style={{ padding: '10px', backgroundColor: '#3e2020', color: '#ff8888', borderRadius: '4px', marginBottom: '10px', fontSize: '12px' }}>{error}</div>}

                        {!saving && (
                            <>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="my_new_table"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)', borderRadius: '3px' }}
                                        autoFocus
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Type</label>
                                    <div style={{ display: 'flex', gap: '15px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="type"
                                                value="TABLE"
                                                checked={type === 'TABLE'}
                                                onChange={(e) => setType(e.target.value)}
                                            />
                                            Table
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="type"
                                                value="VIEW"
                                                checked={type === 'VIEW'}
                                                onChange={(e) => setType(e.target.value)}
                                            />
                                            View
                                        </label>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                    <button type="button" onClick={handleClose} style={{ backgroundColor: 'var(--button-bg-secondary)', padding: '6px 12px', borderRadius: '3px', border: '1px solid var(--border-color)', color: 'var(--text-color)', cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" style={{ backgroundColor: 'var(--accent-color-user)', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
                                </div>
                            </>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
};

export default SaveToDbModal;
