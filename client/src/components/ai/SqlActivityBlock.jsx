import { useState } from 'react';
import { LuChevronDown, LuChevronRight, LuDownload } from 'react-icons/lu';
import SqlBlock from './SqlBlock';

const PREVIEW_ROWS = 50;

/** Build and download a CSV from a query result. */
function exportCsv(cols, data) {
    const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map(c => esc(c.name)).join(',')];
    for (const row of data) lines.push(cols.map(c => esc(row[c.name])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

/**
 * SqlActivityBlock — an execute_sql step in the Deep Dive inspector:
 * formatted SQL (copy/open-in-editor) + result summary + an expandable result
 * table (preview, "show all", export CSV).
 */
function SqlActivityBlock({ tc, onRunSql }) {
    const [showTable, setShowTable] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const result = tc.result;
    const hasRows = result && !result.error && result.data && result.data.length > 0;
    const cols = hasRows
        ? (result.columns?.length > 0 ? result.columns : Object.keys(result.data[0] || {}).map(n => ({ name: n })))
        : [];
    const rows = hasRows ? (showAll ? result.data : result.data.slice(0, PREVIEW_ROWS)) : [];

    return (
        <div className="ddi-sql">
            <SqlBlock sql={tc.args?.query || ''} onRun={onRunSql} defaultExpanded={false} />

            {result && !result.error && result.rowCount !== undefined && (
                <div className="ai-msg-sql-result ai-msg-sql-result--success">
                    <span className="ai-msg-sql-result__icon">&#10003;</span>
                    {result.rowCount} rows ({result.executionTime}ms)
                    {hasRows && (
                        <>
                            <button className="ai-msg-table-toggle" onClick={() => setShowTable(s => !s)}>
                                {showTable ? <LuChevronDown size={10} /> : <LuChevronRight size={10} />}
                                {showTable ? 'Hide table' : 'View data'}
                            </button>
                            <button className="ai-msg-table-toggle" onClick={() => exportCsv(cols, result.data)} title="Download all rows as CSV">
                                <LuDownload size={10} /> CSV
                            </button>
                        </>
                    )}
                </div>
            )}

            {result?.error && (
                <div className="ai-msg-sql-result ai-msg-sql-result--error">{result.error}</div>
            )}

            {showTable && hasRows && (
                <div className="ai-msg-inline-table">
                    <div className="ai-msg-table-wrap">
                        <table>
                            <thead>
                                <tr>{cols.map((col, ci) => <th key={ci}>{col.name}</th>)}</tr>
                            </thead>
                            <tbody>
                                {rows.map((row, ri) => (
                                    <tr key={ri}>
                                        {cols.map((col, ci) => (
                                            <td key={ci}>
                                                {row[col.name] === null || row[col.name] === undefined
                                                    ? <span className="ai-null-value">NULL</span>
                                                    : String(row[col.name])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {result.data.length > PREVIEW_ROWS && (
                        showAll
                            ? <button className="ai-msg-table-more" onClick={() => setShowAll(false)}>Show fewer</button>
                            : <button className="ai-msg-table-more" onClick={() => setShowAll(true)}>Show all {result.rowCount} rows</button>
                    )}
                </div>
            )}
        </div>
    );
}

export default SqlActivityBlock;
