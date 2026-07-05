import { API_BASE } from '../api.js';
import { useState, useEffect } from 'react';
import { LuX, LuPlay, LuGripVertical, LuPlus, LuTrash2, LuCheck, LuCircleAlert, LuLoader, LuLink } from 'react-icons/lu';

/**
 * ExecutionChainModal — Define a sequence of .sql files to execute in order.
 * Use case: 01_clean.sql → 02_transform.sql → 03_aggregate.sql
 */
const ExecutionChainModal = ({ isOpen, onClose, sqlFiles = [] }) => {
    const [chain, setChain] = useState([]);
    const [running, setRunning] = useState(false);
    const [currentStep, setCurrentStep] = useState(-1);
    const [results, setResults] = useState({}); // { index: { status, time, error } }
    const [selectedFile, setSelectedFile] = useState('');

    useEffect(() => {
        if (isOpen) {
            setChain([]);
            setRunning(false);
            setCurrentStep(-1);
            setResults({});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const addStep = () => {
        if (!selectedFile) return;
        setChain(prev => [...prev, selectedFile]);
        setSelectedFile('');
    };

    const removeStep = (idx) => {
        setChain(prev => prev.filter((_, i) => i !== idx));
        setResults(prev => {
            const next = { ...prev };
            delete next[idx];
            return next;
        });
    };

    const moveStep = (fromIdx, toIdx) => {
        if (toIdx < 0 || toIdx >= chain.length) return;
        const newChain = [...chain];
        const [item] = newChain.splice(fromIdx, 1);
        newChain.splice(toIdx, 0, item);
        setChain(newChain);
    };

    const runChain = async () => {
        setRunning(true);
        setResults({});

        for (let i = 0; i < chain.length; i++) {
            setCurrentStep(i);
            setResults(prev => ({ ...prev, [i]: { status: 'running' } }));

            try {
                // Read the file content
                const fileRes = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(chain[i])}`);
                const fileData = await fileRes.json();

                if (fileData.error) {
                    setResults(prev => ({ ...prev, [i]: { status: 'error', error: `File read failed: ${fileData.error}` } }));
                    break;
                }

                // Execute the query
                const start = performance.now();
                const queryRes = await fetch(`${API_BASE}/api/query`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: fileData.content, skipHistory: true }),
                });
                const queryData = await queryRes.json();
                const elapsed = (performance.now() - start).toFixed(0);

                if (queryRes.ok) {
                    setResults(prev => ({ ...prev, [i]: { status: 'success', time: elapsed, rows: queryData.rowCount } }));
                } else {
                    setResults(prev => ({ ...prev, [i]: { status: 'error', error: queryData.error, time: elapsed } }));
                    break; // Stop chain on error
                }
            } catch (err) {
                setResults(prev => ({ ...prev, [i]: { status: 'error', error: err.message } }));
                break;
            }
        }

        setCurrentStep(-1);
        setRunning(false);
    };

    const allDone = Object.keys(results).length === chain.length && chain.length > 0 &&
        Object.values(results).every(r => r.status === 'success');

    const statusIcon = (idx) => {
        const r = results[idx];
        if (!r) return <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border-color)', display: 'inline-block' }} />;
        if (r.status === 'running') return <LuLoader size={16} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />;
        if (r.status === 'success') return <LuCheck size={16} style={{ color: 'var(--color-success)' }} />;
        if (r.status === 'error') return <LuCircleAlert size={16} style={{ color: 'var(--color-error)' }} />;
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            backgroundColor: 'var(--overlay-bg)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
        }} onClick={onClose}>
            <div className="modal-panel" style={{
                backgroundColor: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                borderRadius: '12px', padding: '24px', width: '520px',
                boxShadow: 'var(--shadow-lg)', maxHeight: '80vh', overflowY: 'auto',
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-active)' }}>
                        <LuLink size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                        Query Execution Chain
                    </h3>
                    <button className="amox-modal-close" onClick={onClose} title="Close">
                        <LuX size={18} />
                    </button>
                </div>

                {/* Description */}
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                    Define a sequence of <code>.sql</code> files to execute in order. The chain stops on the first error.
                </p>

                {/* Add Step */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <select
                        value={selectedFile}
                        onChange={e => setSelectedFile(e.target.value)}
                        disabled={running}
                        style={{
                            flex: 1, backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                            border: '1px solid var(--border-color)', borderRadius: '6px', padding: '7px 10px', fontSize: '12px',
                        }}
                    >
                        <option value="">Select a .sql file...</option>
                        {sqlFiles.filter(f => f.endsWith('.sql')).map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                    <button
                        onClick={addStep}
                        disabled={!selectedFile || running}
                        style={{
                            backgroundColor: 'var(--accent-primary)', color: 'var(--button-text-color)', border: 'none',
                            borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', fontSize: '12px',
                            display: 'flex', alignItems: 'center', gap: '4px', opacity: !selectedFile ? 0.5 : 1,
                        }}
                    >
                        <LuPlus size={14} /> Add
                    </button>
                </div>

                {/* Chain Steps */}
                <div style={{ marginBottom: '20px' }}>
                    {chain.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-disabled)', fontSize: '12px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                            No steps added yet. Select SQL files above to build your chain.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {chain.map((file, idx) => {
                                const r = results[idx];
                                return (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '8px 10px', borderRadius: '6px',
                                        backgroundColor: currentStep === idx ? 'var(--color-info-bg)' : r?.status === 'error' ? 'var(--color-error-bg)' : r?.status === 'success' ? 'var(--color-success-bg)' : 'var(--input-bg)',
                                        border: `1px solid ${currentStep === idx ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                        transition: 'all 120ms ease',
                                    }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, minWidth: '20px' }}>
                                            {idx + 1}.
                                        </span>

                                        {statusIcon(idx)}

                                        <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-active)', fontFamily: "'JetBrains Mono', monospace" }}>
                                            {file}
                                        </span>

                                        {r?.time && (
                                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                                {r.time}ms
                                            </span>
                                        )}

                                        {!running && (
                                            <button onClick={() => removeStep(idx)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}>
                                                <LuTrash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Error Detail */}
                {Object.values(results).find(r => r.status === 'error') && (
                    <div style={{
                        backgroundColor: 'var(--color-error-bg)', border: '1px solid var(--feedback-error-border)',
                        borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', fontSize: '11px',
                        color: 'var(--color-error)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap',
                        maxHeight: '100px', overflowY: 'auto',
                    }}>
                        {Object.values(results).find(r => r.status === 'error')?.error}
                    </div>
                )}

                {/* Success */}
                {allDone && (
                    <div style={{
                        backgroundColor: 'var(--color-success-bg)', border: '1px solid var(--feedback-success-border)',
                        borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', fontSize: '11px', color: 'var(--color-success)',
                    }}>
                        ✅ All {chain.length} steps completed successfully!
                    </div>
                )}

                {/* Run Button */}
                <button
                    onClick={runChain}
                    disabled={running || chain.length === 0}
                    style={{
                        width: '100%', padding: '10px', borderRadius: '8px', cursor: running ? 'wait' : 'pointer',
                        backgroundColor: running ? 'var(--accent-muted)' : 'var(--accent-primary)',
                        color: 'var(--button-text-color)', border: 'none', fontSize: '13px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        opacity: chain.length === 0 ? 0.5 : 1,
                    }}
                >
                    <LuPlay size={16} />
                    {running ? `Running Step ${currentStep + 1} of ${chain.length}...` : 'Run Chain'}
                </button>

                {/* Spin animation */}
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
};

export default ExecutionChainModal;
