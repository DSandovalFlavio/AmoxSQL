import React from 'react';
import ResultsTable from './ResultsTable';

const DebugResultModal = ({ isOpen, onClose, cteName, result, query }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                width: '90%', height: '80%', backgroundColor: '#1e1f22',
                borderRadius: '8px', display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #333'
            }}>
                <div style={{
                    padding: '15px 20px', borderBottom: '1px solid #333',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>
                        Debugging CTE: <span style={{ color: '#00ffff' }}>{cteName}</span>
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', color: '#888',
                            fontSize: '24px', cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ flex: 1, overflow: 'hidden', padding: '10px' }}>
                    {result ? (
                        <>
                            {result.error ? (
                                <div style={{ color: '#ff6b6b', padding: '20px' }}>
                                    Error executing CTE: {result.error}
                                </div>
                            ) : (
                                <ResultsTable
                                    data={result.data}
                                    executionTime={result.executionTime}
                                    query={query}
                                />
                            )}
                        </>
                    ) : (
                        <div style={{ padding: '20px', color: '#888' }}>Running...</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DebugResultModal;
