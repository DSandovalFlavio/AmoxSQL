import { useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import SqlBlock from './SqlBlock';

/**
 * SqlActivityBlock — an execute_sql step in the Deep Dive inspector:
 * the formatted SQL (collapsible, copy/open-in-editor) + a result summary +
 * an expandable result table preview. Restores the rich query view the inspector
 * lost when it fell back to a raw JSON tool row.
 */
function SqlActivityBlock({ tc, onRunSql }) {
    const [showTable, setShowTable] = useState(false);
    const result = tc.result;
    const hasRows = result && !result.error && result.data && result.data.length > 0;
    const cols = hasRows
        ? (result.columns?.length > 0 ? result.columns : Object.keys(result.data[0] || {}).map(n => ({ name: n })))
        : [];

    return (
        <div className="ddi-sql">
            <SqlBlock sql={tc.args?.query || ''} onRun={onRunSql} defaultExpanded={false} />

            {result && !result.error && result.rowCount !== undefined && (
                <div className="ai-msg-sql-result ai-msg-sql-result--success">
                    <span className="ai-msg-sql-result__icon">&#10003;</span>
                    {result.rowCount} rows ({result.executionTime}ms)
                    {hasRows && (
                        <button className="ai-msg-table-toggle" onClick={() => setShowTable(s => !s)}>
                            {showTable ? <LuChevronDown size={10} /> : <LuChevronRight size={10} />}
                            {showTable ? 'Hide table' : 'View data'}
                        </button>
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
                                {result.data.slice(0, 50).map((row, ri) => (
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
                    {result.data.length > 50 && (
                        <div className="ai-msg-table-more">Showing 50 of {result.rowCount} rows</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SqlActivityBlock;
