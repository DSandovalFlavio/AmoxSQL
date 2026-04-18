import { useState, useMemo } from 'react';
import { LuX, LuPlus, LuMinus, LuEqual } from 'react-icons/lu';

const computeDiff = (a, b, keyCol) => {
    if (!keyCol) return { added: b, removed: a, unchanged: [] };
    const aMap = new Map(a.map(r => [String(r[keyCol]), r]));
    const bMap = new Map(b.map(r => [String(r[keyCol]), r]));
    const added = b.filter(r => !aMap.has(String(r[keyCol])));
    const removed = a.filter(r => !bMap.has(String(r[keyCol])));
    const unchanged = a.filter(r => bMap.has(String(r[keyCol])));
    return { added, removed, unchanged };
};

const MiniTable = ({ rows, columns, colorClass }) => {
    if (!rows || rows.length === 0) return <div className="cr-empty">No rows in this section</div>;
    return (
        <div className="cr-mini-table-wrap">
            <table className="cr-mini-table">
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col} className="cr-mini-th">{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 100).map((row, i) => (
                        <tr key={i} className={`cr-mini-row ${colorClass}`}>
                            {columns.map(col => (
                                <td key={col} className="cr-mini-td">
                                    {row[col] === null || row[col] === undefined ? (
                                        <span className="cr-null">NULL</span>
                                    ) : String(row[col])}
                                </td>
                            ))}
                        </tr>
                    ))}
                    {rows.length > 100 && (
                        <tr>
                            <td colSpan={columns.length} className="cr-mini-td" style={{ textAlign: 'center', fontStyle: 'italic', color: 'var(--text-tertiary)' }}>
                                ... and {rows.length - 100} more rows
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

const CompareResults = ({ dataA, dataB, labelA = 'Result A', labelB = 'Result B', onClose }) => {
    const columnsA = dataA && dataA.length > 0 ? Object.keys(dataA[0]) : [];
    const columnsB = dataB && dataB.length > 0 ? Object.keys(dataB[0]) : [];
    const allColumns = [...new Set([...columnsA, ...columnsB])];

    const [keyCol, setKeyCol] = useState(allColumns[0] || '');
    const [activeSection, setActiveSection] = useState('added');

    const diff = useMemo(() => computeDiff(dataA || [], dataB || [], keyCol), [dataA, dataB, keyCol]);

    const sections = [
        { id: 'added', label: 'Added', icon: <LuPlus size={12} />, count: diff.added.length, colorClass: 'cr-added', color: 'var(--feedback-success, #4CAF50)' },
        { id: 'removed', label: 'Removed', icon: <LuMinus size={12} />, count: diff.removed.length, colorClass: 'cr-removed', color: 'var(--feedback-error, #E06C75)' },
        { id: 'unchanged', label: 'Unchanged', icon: <LuEqual size={12} />, count: diff.unchanged.length, colorClass: 'cr-unchanged', color: 'var(--text-tertiary)' },
    ];

    const activeData = diff[activeSection];
    const activeColumns = activeSection === 'added' ? columnsB : columnsA;

    return (
        <div className="cr-overlay">
            <div className="cr-modal">
                <div className="cr-header">
                    <div className="cr-header-left">
                        <span className="cr-title">Compare Results</span>
                        <span className="cr-labels">{labelA} vs {labelB}</span>
                    </div>
                    <button className="cr-close-btn" onClick={onClose} aria-label="Close">
                        <LuX size={16} />
                    </button>
                </div>

                <div className="cr-controls">
                    <div className="cr-key-select">
                        <label className="cr-key-label">Key Column:</label>
                        <select
                            className="cr-key-input"
                            value={keyCol}
                            onChange={e => setKeyCol(e.target.value)}
                        >
                            <option value="">— No key (show all) —</option>
                            {allColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                    </div>

                    <div className="cr-stats">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                className={`cr-stat-btn${activeSection === s.id ? ' active' : ''}`}
                                onClick={() => setActiveSection(s.id)}
                                style={{ '--cr-section-color': s.color }}
                            >
                                {s.icon}
                                <span className="cr-stat-count">{s.count}</span>
                                <span className="cr-stat-label">{s.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="cr-body">
                    <MiniTable
                        rows={activeData}
                        columns={activeColumns.length > 0 ? activeColumns : allColumns}
                        colorClass={sections.find(s => s.id === activeSection)?.colorClass || ''}
                    />
                </div>
            </div>
        </div>
    );
};

export default CompareResults;
