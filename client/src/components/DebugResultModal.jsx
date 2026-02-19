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
                width: '90%', height: '80%', backgroundColor: 'var(--modal-bg)',
                borderRadius: '8px', display: 'flex', flexDirection: 'column',
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid var(--border-color)'
            }}>
                <div style={{
                    padding: '15px 20px', borderBottom: '1px solid var(--border-color)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    backgroundColor: 'var(--header-bg)'
                }}>
                    <h3 style={{ margin: 0, color: 'var(--text-active)', fontSize: '16px' }}>
                        Debugging CTE: <span style={{ color: 'var(--accent-color-user)' }}>{cteName}</span>
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', color: 'var(--text-muted)',
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
                        <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Running...</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DebugResultModal;
