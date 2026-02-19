import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import SqlEditor from './SqlEditor';
import ResultsTable from './ResultsTable';
import DebugResultModal from './DebugResultModal';

const NotebookCell = ({
    id,
    type,
    content,
    result, // { data, executionTime, error, loading }
    onUpdate,
    onRun,
    onDelete,
    onMoveUp,
    onMoveDown,
    isPluginInstalled = true, // Assumption for now
    isReportMode = false // New Prop
}) => {
    const [isEditingMarkdown, setIsEditingMarkdown] = useState(false);
    const [localContent, setLocalContent] = useState(content);

    // Debug State
    const [debugModalOpen, setDebugModalOpen] = useState(false);
    const [debugCteName, setDebugCteName] = useState(null);
    const [debugResult, setDebugResult] = useState(null);
    const [debugQuery, setDebugQuery] = useState('');

    useEffect(() => {
        setLocalContent(content);
    }, [content]);

    const handleBlur = () => {
        onUpdate(id, localContent);
        if (type === 'markdown') {
            setIsEditingMarkdown(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && e.ctrlKey && type === 'code') {
            onRun(id);
        }
    };

    const handleDebugCte = async (cteName) => {
        // Construct the debug query
        // Logic: Find the entire query, truncate AFTER the target CTE definition, 
        // and append "SELECT * FROM cteName LIMIT 100"

        let query = localContent;
        // Simple heuristic: Find "cteName AS (" and count parentheses to find the end of it?
        // Actually, we can just effectively run:
        // WITH ... (all previous CTEs) ... target_cte AS (...) SELECT * FROM target_cte LIMIT 100;

        // BETTER APPROACH for complex SQL:
        // Just take the original query, wrap it in a subquery? No, `WITH` clause must be at top.
        // We need to parse where certain CTEs end.

        // Simplest HACK for MVP:
        // Assume `WITH` is at the start.
        // Identify the position of `cteName AS (`.
        // We need the DEFINITION of this CTE and all PREVIOUS CTEs.
        // If we simply cut the string at the end of this CTE's definition and append SELECT, it might work if we know where it ends.

        // alternative: Use regex to find "cteName AS ( ... )". Finding closing parenthesis is hard with regex.
        // Let's rely on the user writing valid SQL.

        // PLAN B:
        // Regex to find start of NEXT CTE (", next_cte AS") or start of main "SELECT".
        // Truncate there.

        setDebugCteName(cteName);
        setDebugModalOpen(true);
        setDebugResult(null); // Loading state

        try {
            // We need a server endpoint to help us debug or we try to manipulate string here.
            // Let's try string manipulation here.
            const cteStartRegex = new RegExp(`\\b${cteName}\\s+AS\\s*\\(`, 'i');
            const match = cteStartRegex.exec(query);

            if (!match) {
                throw new Error("Could not find CTE definition.");
            }

            // We need to find the END of this CTE. 
            // It ends at the next comma followed by an identifier and "AS (", OR at the main query body (SELECT/INSERT/UPDATE).
            // This is brittle without a real parser.

            // Let's try: append `SELECT * FROM cteName LIMIT 100` to the full query? 
            // Result: "WITH ... SELECT ... ; SELECT * FROM cteName ..." -> This runs two queries. DuckDB returns result of last one?
            // If we run multiple statements, we might get multiple results.
            // Let's try running: `query; SELECT * FROM cteName LIMIT 100` is NOT valid if `query` is a SELECT.

            // DuckDB doesn't persist updated CTEs across statements unless created as VIEW.
            // We could try: `CREATE OR REPLACE TEMPORARY VIEW debug_view AS ( original_query_with_SELECT_replaced_by_counting?)` No.

            // Back to truncation strategy.
            // Find start of `cteName`.
            // Use a simple paren counter starting from `(` after AS.
            let parenCount = 0;
            let foundStart = false;
            let cutIndex = -1;

            for (let i = match.index; i < query.length; i++) {
                if (query[i] === '(') {
                    parenCount++;
                    foundStart = true;
                } else if (query[i] === ')') {
                    parenCount--;
                    if (foundStart && parenCount === 0) {
                        // Found closing parenthesis of this CTE
                        cutIndex = i + 1; // Include the ')'
                        break;
                    }
                }
            }

            if (cutIndex === -1) throw new Error("Could not parse CTE bounds.");

            // Construct Query:
            // "WITH ... (up to end of target CTE) SELECT * FROM cteName LIMIT 100"
            // The problem is `WITH ... (end of CTE), next_cte ...` -> we have a comma there.
            // The truncation must replace the comma (if present) or just stop.

            const partialQuery = query.substring(0, cutIndex);
            const debugQ = `${partialQuery} SELECT * FROM ${cteName} LIMIT 100`;
            setDebugQuery(debugQ);

            // Execute via fetch
            const response = await fetch('http://localhost:3001/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: debugQ }),
            });
            const data = await response.json();

            if (response.ok) {
                setDebugResult({ data: data.data, executionTime: data.executionTime });
            } else {
                setDebugResult({ error: data.error });
            }

        } catch (e) {
            setDebugResult({ error: e.message });
        }
    };

    return (
        <div className={isReportMode ? 'report-card' : ''} style={{
            marginBottom: isReportMode ? undefined : '16px',
            border: isReportMode ? undefined : '1px solid var(--border-color)',
            borderRadius: '8px',
            backgroundColor: isReportMode ? undefined : 'var(--panel-bg)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* ... Header ... */}
            {!isReportMode && (
                <div style={{
                    padding: '4px 8px',
                    backgroundColor: 'var(--header-bg)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '11px',
                    color: 'var(--text-muted)'
                }}>
                    {/* ... Existing header content ... */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: type === 'code' ? '#4dabf7' : '#ffd43b', textTransform: 'uppercase' }}>
                            {type}
                        </span>
                        {type === 'code' && (
                            <button
                                onClick={() => onRun(id)}
                                style={{
                                    ...btnStyle,
                                    color: 'var(--accent-color-user)',
                                    opacity: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                title="Run Cell (Ctrl+Enter)"
                            >
                                ▶ Run
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => onMoveUp(id)} style={btnStyle} title="Move Up">↑</button>
                        <button onClick={() => onMoveDown(id)} style={btnStyle} title="Move Down">↓</button>
                        <button onClick={() => onDelete(id)} style={{ ...btnStyle, color: '#ff6b6b' }} title="Delete">🗑</button>
                    </div>
                </div>
            )}

            {/* Cell Content */}
            <div style={{ padding: type === 'markdown' && !isEditingMarkdown ? '12px' : '0' }}>
                {type === 'markdown' ? (
                    // ... markdown render ...
                    isEditingMarkdown && !isReportMode ? (
                        <textarea
                            value={localContent}
                            onChange={(e) => setLocalContent(e.target.value)}
                            onBlur={handleBlur}
                            autoFocus
                            style={{ width: '100%', minHeight: '100px', backgroundColor: 'var(--editor-bg)', color: 'var(--text-color)', border: 'none', padding: '12px', fontFamily: 'monospace', resize: 'vertical' }}
                            placeholder="Type markdown here... (Click outside to preview)"
                        />
                    ) : (
                        <div
                            onDoubleClick={() => !isReportMode && setIsEditingMarkdown(true)}
                            style={{ minHeight: '24px', cursor: isReportMode ? 'default' : 'text' }}
                            title={isReportMode ? "" : "Double click to edit"}
                        >
                            {localContent.trim() ? (
                                <div className="markdown-body" style={{ color: 'var(--text-color)' }}>
                                    <ReactMarkdown>{localContent}</ReactMarkdown>
                                </div>
                            ) : (
                                !isReportMode && <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Empty Markdown Cell (Double click to edit)</span>
                            )}
                        </div>
                    )
                ) : (
                    // Code Cell
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Editor Area */}
                        {!isReportMode && (
                            <div style={{ height: 'auto', minHeight: '100px', borderLeft: '4px solid var(--accent-color-user)' }}>
                                <div style={{ height: '150px' }} onKeyDown={handleKeyDown}>
                                    <SqlEditor
                                        value={localContent}
                                        onChange={(val) => {
                                            setLocalContent(val);
                                            onUpdate(id, val);
                                        }}
                                        onDebugCte={handleDebugCte} // Pass handler
                                    />
                                </div>
                            </div>
                        )}
                        {/* Results Area */}
                        {result && (
                            <div style={{
                                borderTop: !isReportMode ? '1px solid var(--border-color)' : 'none',
                                backgroundColor: 'var(--editor-bg)',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                {result.loading && <div style={{ padding: '10px', color: 'var(--text-muted)' }}>Running...</div>}
                                {result.error && <div style={{ padding: '10px', color: '#ff6b6b' }}>Error: {result.error}</div>}
                                {result.data && (
                                    <div style={{ height: isReportMode ? '500px' : '400px', overflow: 'hidden' }}>
                                        <ResultsTable
                                            data={result.data}
                                            executionTime={result.executionTime}
                                            query={localContent}
                                            onDbChange={() => { }}
                                            isReportMode={isReportMode}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <DebugResultModal
                isOpen={debugModalOpen}
                onClose={() => setDebugModalOpen(false)}
                cteName={debugCteName}
                result={debugResult}
                query={debugQuery}
            />
        </div>
    );
};

const btnStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '12px',
    opacity: 0.7,
    transition: 'opacity 0.2s'
};

export default NotebookCell;
