import { useState } from 'react';
import { LuPlus, LuTrash2, LuVariable, LuChevronDown, LuChevronRight } from 'react-icons/lu';

/**
 * VariablesBar — Collapsible bar for defining query parameters.
 * Variables use ${name} syntax and are resolved before execution.
 */
const VariablesBar = ({ variables, onChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleAdd = () => {
        const name = `var_${variables.length + 1}`;
        onChange([...variables, { name, value: '', type: 'text' }]);
        if (!isExpanded) setIsExpanded(true);
    };

    const handleUpdate = (idx, field, val) => {
        const updated = [...variables];
        updated[idx] = { ...updated[idx], [field]: val };
        onChange(updated);
    };

    const handleRemove = (idx) => {
        onChange(variables.filter((_, i) => i !== idx));
    };

    if (variables.length === 0) {
        return (
            <div style={{
                padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px',
                borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--surface-raised)',
                fontSize: '11px', color: 'var(--text-tertiary)',
            }}>
                <LuVariable size={12} />
                <span>No variables defined</span>
                <button
                    onClick={handleAdd}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 500 }}
                >
                    <LuPlus size={11} /> Add
                </button>
            </div>
        );
    }

    return (
        <div style={{
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--surface-raised)',
        }}>
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px',
                    cursor: 'pointer', fontSize: '11px', color: 'var(--text-tertiary)',
                    userSelect: 'none',
                }}
            >
                {isExpanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                <LuVariable size={12} color="var(--accent-primary)" />
                <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                    Variables ({variables.length})
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); handleAdd(); }}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    title="Add Variable"
                >
                    <LuPlus size={12} />
                </button>
            </div>

            {/* Variables Grid */}
            {isExpanded && (
                <div style={{ padding: '4px 12px 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {variables.map((v, idx) => (
                        <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            backgroundColor: 'var(--surface-inset)', borderRadius: '4px',
                            padding: '3px 6px', border: '1px solid var(--border-subtle)',
                        }}>
                            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontFamily: "'JetBrains Mono', monospace" }}>${'{'}</span>
                            <input
                                type="text"
                                value={v.name}
                                onChange={e => handleUpdate(idx, 'name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                placeholder="name"
                                style={{
                                    width: '80px', background: 'transparent', border: 'none',
                                    color: 'var(--text-primary)', fontSize: '11px', outline: 'none',
                                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 500,
                                }}
                            />
                            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{'}'}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>=</span>
                            {v.type === 'date' ? (
                                <input
                                    type="date"
                                    value={v.value}
                                    onChange={e => handleUpdate(idx, 'value', e.target.value)}
                                    style={{
                                        width: '120px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)', fontSize: '11px', borderRadius: '3px', padding: '1px 4px',
                                    }}
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={v.value}
                                    onChange={e => handleUpdate(idx, 'value', e.target.value)}
                                    placeholder="value"
                                    style={{
                                        width: '100px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)', fontSize: '11px', borderRadius: '3px', padding: '1px 4px',
                                        fontFamily: "'JetBrains Mono', monospace",
                                    }}
                                />
                            )}
                            <select
                                value={v.type}
                                onChange={e => handleUpdate(idx, 'type', e.target.value)}
                                style={{
                                    backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                    color: 'var(--text-tertiary)', fontSize: '10px', borderRadius: '3px', padding: '1px 2px',
                                }}
                            >
                                <option value="text">text</option>
                                <option value="date">date</option>
                                <option value="number">number</option>
                            </select>
                            <button
                                onClick={() => handleRemove(idx)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0' }}
                                title="Remove"
                            >
                                <LuTrash2 size={11} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Resolve ${variable_name} placeholders in SQL with variable values.
 */
export function resolveVariables(sql, variables) {
    if (!variables || variables.length === 0) return sql;
    let resolved = sql;
    for (const v of variables) {
        if (!v.name) continue;
        const pattern = new RegExp(`\\$\\{${v.name}\\}`, 'g');
        let value = v.value || '';
        // For text type, wrap in quotes if the variable isn't already inside quotes
        // For number type, use raw
        // For date type, wrap in DATE '' format
        if (v.type === 'date' && value) {
            value = `'${value}'`;
        } else if (v.type === 'number') {
            // Keep raw
        } else {
            // Text: just replace raw — user is responsible for quoting in SQL
        }
        resolved = resolved.replace(pattern, value);
    }
    return resolved;
}

export default VariablesBar;
