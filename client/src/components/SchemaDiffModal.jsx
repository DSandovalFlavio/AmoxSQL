import { useState, useEffect } from 'react';
import { LuX, LuGitCompare, LuPlus, LuMinus, LuPencil } from 'react-icons/lu';

/**
 * SchemaDiffModal — Compare schemas of two tables side by side.
 * Shows added, removed, and type-changed columns.
 */
const SchemaDiffModal = ({ isOpen, onClose, tables = [] }) => {
    const [leftTable, setLeftTable] = useState('');
    const [rightTable, setRightTable] = useState('');
    const [leftSchema, setLeftSchema] = useState([]);
    const [rightSchema, setRightSchema] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchSchema = async (tableName) => {
        if (!tableName) return [];
        try {
            const res = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: `DESCRIBE "${tableName}"` }),
            });
            const data = await res.json();
            return (data.data || []).map(col => ({
                name: col.column_name,
                type: col.column_type,
                nullable: col.null !== 'NO',
            }));
        } catch (e) {
            return [];
        }
    };

    const handleCompare = async () => {
        if (!leftTable || !rightTable) return;
        setLoading(true);
        const [l, r] = await Promise.all([fetchSchema(leftTable), fetchSchema(rightTable)]);
        setLeftSchema(l);
        setRightSchema(r);
        setLoading(false);
    };

    useEffect(() => {
        if (isOpen && tables.length >= 2) {
            setLeftTable(tables[0]?.name || '');
            setRightTable(tables[1]?.name || '');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Build diff
    const leftMap = Object.fromEntries(leftSchema.map(c => [c.name, c]));
    const rightMap = Object.fromEntries(rightSchema.map(c => [c.name, c]));
    const allCols = [...new Set([...leftSchema.map(c => c.name), ...rightSchema.map(c => c.name)])];

    const diffRows = allCols.map(name => {
        const l = leftMap[name];
        const r = rightMap[name];
        if (l && r) {
            const typeChanged = l.type !== r.type;
            return { name, status: typeChanged ? 'modified' : 'unchanged', leftType: l.type, rightType: r.type };
        } else if (l && !r) {
            return { name, status: 'removed', leftType: l.type, rightType: null };
        } else {
            return { name, status: 'added', leftType: null, rightType: r.type };
        }
    });

    const stats = {
        added: diffRows.filter(d => d.status === 'added').length,
        removed: diffRows.filter(d => d.status === 'removed').length,
        modified: diffRows.filter(d => d.status === 'modified').length,
        unchanged: diffRows.filter(d => d.status === 'unchanged').length,
    };

    const statusColors = { added: '#10b981', removed: '#ef4444', modified: '#f59e0b', unchanged: 'var(--text-tertiary)' };
    const statusIcons = { added: <LuPlus size={12} />, removed: <LuMinus size={12} />, modified: <LuPencil size={12} />, unchanged: null };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(8px)'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--surface-overlay)', width: '650px', maxHeight: '550px',
                borderRadius: '12px', border: '1px solid var(--border-default)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                boxShadow: 'var(--shadow-lg)'
            }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface-raised)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <LuGitCompare size={18} color="var(--accent-primary)" />
                        <h2 style={{ margin: 0, fontSize: '15px', color: 'var(--text-active)' }}>Schema Diff</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <LuX size={18} />
                    </button>
                </div>

                {/* Table Selection */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <select value={leftTable} onChange={e => setLeftTable(e.target.value)}
                        style={{ flex: 1, padding: '6px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}>
                        <option value="">Select left table...</option>
                        {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                    <LuGitCompare size={16} color="var(--text-muted)" />
                    <select value={rightTable} onChange={e => setRightTable(e.target.value)}
                        style={{ flex: 1, padding: '6px', backgroundColor: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12px' }}>
                        <option value="">Select right table...</option>
                        {tables.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                    <button onClick={handleCompare} disabled={!leftTable || !rightTable}
                        style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 600, backgroundColor: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: (!leftTable || !rightTable) ? 0.5 : 1 }}>
                        Compare
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                    {loading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading schemas...</div>}

                    {!loading && diffRows.length > 0 && (
                        <>
                            {/* Stats */}
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '11px' }}>
                                {stats.added > 0 && <span style={{ color: statusColors.added }}>+{stats.added} added</span>}
                                {stats.removed > 0 && <span style={{ color: statusColors.removed }}>−{stats.removed} removed</span>}
                                {stats.modified > 0 && <span style={{ color: statusColors.modified }}>~{stats.modified} changed</span>}
                                <span style={{ color: 'var(--text-tertiary)' }}>{stats.unchanged} unchanged</span>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Column</th>
                                        <th style={thStyle}>{leftTable || 'Left'}</th>
                                        <th style={thStyle}>{rightTable || 'Right'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diffRows.map(row => (
                                        <tr key={row.name}>
                                            <td style={{ ...tdStyle, color: statusColors[row.status] }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {statusIcons[row.status]}
                                                    <span style={{ fontSize: '10px', textTransform: 'uppercase' }}>{row.status}</span>
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                                                {row.name}
                                            </td>
                                            <td style={{ ...tdStyle, color: row.status === 'removed' ? statusColors.removed : 'var(--text-tertiary)' }}>
                                                {row.leftType || '—'}
                                            </td>
                                            <td style={{ ...tdStyle, color: row.status === 'added' ? statusColors.added : row.status === 'modified' ? statusColors.modified : 'var(--text-tertiary)' }}>
                                                {row.rightType || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}

                    {!loading && leftSchema.length === 0 && rightSchema.length === 0 && (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                            Select two tables and click Compare to see the schema diff.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const thStyle = {
    padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border-color)',
    color: 'var(--text-tertiary)', fontWeight: 600, fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.3px',
};

const tdStyle = {
    padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
};

export default SchemaDiffModal;
