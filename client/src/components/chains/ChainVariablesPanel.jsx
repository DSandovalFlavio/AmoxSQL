/**
 * ChainVariablesPanel — Modal to define chain-level variables.
 * Variables are referenced anywhere in a node's config as ${name} and are
 * interpolated at run time by the backend (server/ChainExecutor.js).
 * Uses the same inline-style modal pattern as ChainDataPreview.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LuX, LuPlus, LuMinus, LuVariable } from 'react-icons/lu';

const ChainVariablesPanel = ({ variables = {}, onChange, onClose }) => {
    // Editable as an ordered list of { key, value } rows.
    const [rows, setRows] = useState(() =>
        Object.entries(variables).map(([k, v]) => ({ key: k, value: String(v ?? '') }))
    );

    const commit = (newRows) => {
        setRows(newRows);
        const obj = {};
        for (const r of newRows) {
            const k = r.key.trim();
            if (k) obj[k] = r.value;
        }
        onChange?.(obj);
    };

    const addRow = () => commit([...rows, { key: '', value: '' }]);
    const updateRow = (i, field, val) => commit(rows.map((r, j) => (j === i ? { ...r, [field]: val } : r)));
    const removeRow = (i) => commit(rows.filter((_, j) => j !== i));

    const inputStyle = {
        flex: 1, minWidth: 0,
        background: 'var(--surface-base)',
        border: '1px solid var(--border-default)',
        borderRadius: 6, padding: '6px 8px',
        color: 'var(--text-active)', fontSize: 12,
        fontFamily: 'var(--font-mono)',
    };

    const modal = (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',

            }}
            onClick={onClose}
        >
            <div
                className="modal-panel"
                style={{
                    width: 'min(92vw, 540px)', maxHeight: '80vh',
                    backgroundColor: 'var(--surface-overlay)', borderRadius: 12,
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-default)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border-default)',
                    background: 'var(--surface-raised)', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <LuVariable size={15} style={{ color: 'var(--accent-color-user)' }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-active)' }}>Chain Variables</span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <LuX size={15} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.5 }}>
                        Define reusable values, then reference them anywhere in a node's
                        configuration as{' '}
                        <code style={{
                            fontFamily: 'var(--font-mono)', background: 'var(--surface-raised)',
                            padding: '1px 5px', borderRadius: 4, color: 'var(--accent-color-user)',
                        }}>{'${name}'}</code>{' '}
                        — file paths, SQL, filter values, table names, URLs.
                    </p>

                    {rows.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                            No variables yet.
                        </div>
                    )}

                    {rows.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <input
                                style={inputStyle}
                                placeholder="name"
                                value={r.key}
                                onChange={e => updateRow(i, 'key', e.target.value)}
                            />
                            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>=</span>
                            <input
                                style={inputStyle}
                                placeholder="value"
                                value={r.value}
                                onChange={e => updateRow(i, 'value', e.target.value)}
                            />
                            <button
                                onClick={() => removeRow(i)}
                                title="Remove variable"
                                style={{
                                    background: 'none', border: '1px solid var(--border-default)',
                                    borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
                                    padding: 6, display: 'flex', alignItems: 'center', flexShrink: 0,
                                }}
                            >
                                <LuMinus size={13} />
                            </button>
                        </div>
                    ))}

                    <button
                        onClick={addRow}
                        style={{
                            marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                            background: 'var(--surface-raised)', border: '1px solid var(--border-default)',
                            borderRadius: 6, cursor: 'pointer', color: 'var(--text-active)',
                            padding: '6px 10px', fontSize: 12,
                        }}
                    >
                        <LuPlus size={13} /> Add Variable
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default ChainVariablesPanel;
