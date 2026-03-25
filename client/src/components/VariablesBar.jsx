import { useState } from 'react';
import { LuPlus, LuTrash2, LuVariable, LuChevronDown, LuChevronRight } from 'react-icons/lu';

/**
 * VariablesToggle — Button for the action bar that toggles variables panel.
 * Renders as an ep-action-btn group button.
 */
export const VariablesToggle = ({ count, isExpanded, onToggle, onAdd }) => {
    return (
        <div className="ep-action-group">
            <button
                className={`ep-action-btn${isExpanded ? ' active' : ''}`}
                onClick={onToggle}
                title="Toggle Variables"
                style={{ gap: '5px' }}
            >
                <LuVariable size={13} />
                <span>Variables</span>
                {count > 0 && (
                    <span className="ep-var-badge">{count}</span>
                )}
                {isExpanded ? <LuChevronDown size={10} /> : <LuChevronRight size={10} />}
            </button>
            <button
                className="ep-action-btn"
                onClick={(e) => { e.stopPropagation(); onAdd(); }}
                title="Add Variable"
                style={{ padding: '0 6px' }}
            >
                <LuPlus size={12} />
            </button>
        </div>
    );
};

/**
 * VariablesPanel — Expandable row that shows below the action bar.
 * Renders the variable inputs in a horizontal wrap layout.
 */
export const VariablesPanel = ({ variables, onChange }) => {
    if (variables.length === 0) return null;

    const handleUpdate = (idx, field, val) => {
        const updated = [...variables];
        updated[idx] = { ...updated[idx], [field]: val };
        onChange(updated);
    };

    const handleRemove = (idx) => {
        onChange(variables.filter((_, i) => i !== idx));
    };

    return (
        <div className="ep-variables-panel">
            {variables.map((v, idx) => (
                <div key={idx} className="ep-var-chip">
                    <span className="ep-var-syntax">${'{'}</span>
                    <input
                        type="text"
                        value={v.name}
                        onChange={e => handleUpdate(idx, 'name', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="name"
                        className="ep-var-input ep-var-name"
                    />
                    <span className="ep-var-syntax">{'}'}</span>
                    <span className="ep-var-equals">=</span>
                    {v.type === 'date' ? (
                        <input
                            type="date"
                            value={v.value}
                            onChange={e => handleUpdate(idx, 'value', e.target.value)}
                            className="ep-var-input ep-var-value"
                        />
                    ) : (
                        <input
                            type="text"
                            value={v.value}
                            onChange={e => handleUpdate(idx, 'value', e.target.value)}
                            placeholder="value"
                            className="ep-var-input ep-var-value"
                        />
                    )}
                    <select
                        value={v.type}
                        onChange={e => handleUpdate(idx, 'type', e.target.value)}
                        className="ep-var-select"
                    >
                        <option value="text">text</option>
                        <option value="date">date</option>
                        <option value="number">number</option>
                    </select>
                    <button
                        onClick={() => handleRemove(idx)}
                        className="ep-var-remove"
                        title="Remove"
                    >
                        <LuTrash2 size={11} />
                    </button>
                </div>
            ))}
        </div>
    );
};

/**
 * VariablesBar — Legacy default export (kept for backward compat).
 * Now just re-exports the toggle + panel pattern.
 */
const VariablesBar = ({ variables, onChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleAdd = () => {
        const name = `var_${variables.length + 1}`;
        onChange([...variables, { name, value: '', type: 'text' }]);
        if (!isExpanded) setIsExpanded(true);
    };

    return (
        <>
            <VariablesToggle
                count={variables.length}
                isExpanded={isExpanded}
                onToggle={() => setIsExpanded(!isExpanded)}
                onAdd={handleAdd}
            />
            {isExpanded && (
                <VariablesPanel variables={variables} onChange={onChange} />
            )}
        </>
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
