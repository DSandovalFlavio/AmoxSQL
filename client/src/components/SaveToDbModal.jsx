import { useState } from 'react';

const SaveToDbModal = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState('TABLE'); // TABLE or VIEW

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(name, type);
        setName(''); // Reset
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
            <div style={{
                backgroundColor: '#141517', padding: '20px', borderRadius: '5px', width: '350px',
                border: '1px solid #454545', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                color: '#bcbec4', fontFamily: 'sans-serif'
            }}>
                <h3 style={{ marginTop: 0, color: '#fff', fontSize: '16px' }}>Save Results to Database</h3>
                <p style={{ fontSize: '12px', color: '#aaa' }}>
                    Create a new table or view from the current query results.
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px' }}>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="my_new_table"
                            style={{ width: '100%', boxSizing: 'border-box', padding: '8px', backgroundColor: '#3c3c3c', border: '1px solid #555', color: '#fff', borderRadius: '3px' }}
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
                        <button type="button" onClick={onClose} style={{ backgroundColor: '#4e5157', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#fff', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" style={{ backgroundColor: '#00ffff', padding: '6px 12px', borderRadius: '3px', border: 'none', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SaveToDbModal;
