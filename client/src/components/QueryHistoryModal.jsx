import React, { useState, useEffect } from 'react';

const QueryHistoryModal = ({ isOpen, onClose, onSelect }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
        }
    }, [isOpen]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/db/history');
            const data = await response.json();
            if (Array.isArray(data)) {
                setHistory(data);
            }
        } catch (e) {
            console.error("Failed to fetch history", e);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleString();
    };

    const filteredHistory = history.filter(h =>
        h.query.toLowerCase().includes(search.toLowerCase())
    );

    const handleCopy = (text, e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        // Optional toast
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: '#1E1F22', width: '800px', height: '600px',
                borderRadius: '8px', border: '1px solid #454545',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                color: '#bcbec4', fontFamily: 'sans-serif', boxShadow: '0 8px 16px rgba(0,0,0,0.4)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '15px 20px', borderBottom: '1px solid #2C2E33', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#25262B' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Query History</h2>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input
                            type="text"
                            placeholder="Search history..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#141517', color: '#fff', fontSize: '13px' }}
                        />
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                    </div>
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    {loading && <div style={{ padding: '20px', textAlign: 'center' }}>Loading history...</div>}
                    {!loading && filteredHistory.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>No history found (RW mode required)</div>
                    )}

                    {!loading && filteredHistory.map((item, index) => (
                        <div key={index} style={{
                            padding: '12px 20px',
                            borderBottom: '1px solid #2C2E33',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '5px',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2A2B30'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => {
                                if (onSelect) {
                                    onSelect(item.query);
                                    onClose();
                                }
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                                <span>{formatDate(item.executed_at)}</span>
                                <button
                                    onClick={(e) => handleCopy(item.query, e)}
                                    title="Copy to Clipboard"
                                    style={{ background: 'transparent', border: 'none', color: '#00ffff', cursor: 'pointer' }}
                                >
                                    📋
                                </button>
                            </div>
                            <div style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '13px',
                                color: '#d4d4d4',
                                whiteSpace: 'pre-wrap',
                                maxHeight: '100px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                position: 'relative'
                            }}>
                                {item.query}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{ padding: '10px 20px', borderTop: '1px solid #2C2E33', backgroundColor: '#25262B', fontSize: '12px', color: '#666', textAlign: 'right' }}>
                    Auto-prunes records older than 30 days. Click to insert query.
                </div>
            </div>
        </div>
    );
};

export default QueryHistoryModal;
