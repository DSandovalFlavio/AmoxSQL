import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE } from '../../api.js';
import { LuUser, LuBot, LuDatabase, LuBrain, LuChevronDown, LuChevronRight, LuZap, LuTrendingUp, LuCircleHelp, LuArrowRight, LuTriangleAlert, LuSearch, LuX, LuNotebookPen, LuMessageSquareQuote } from 'react-icons/lu';
import SqlBlock from './SqlBlock';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';
import EditProposalBlock from './EditProposalBlock';
import StreamingMarkdown, { MarkdownChunk } from './StreamingMarkdown';

/**
 * Markdown renderers for chat prose. Module-level factory so the object can be
 * memoized per message (stable identity keeps memoized markdown chunks alive).
 */
function makeMdComponents(setCiteQueryId) {
    return {
        p: ({ children }) => <p>{children}</p>,
        a: ({ href, children }) => {
            // Inline citation: [value](cite:<queryId>#<column>) → clickable, opens the source query
            if (href && href.startsWith('cite:')) {
                const [qid, column] = href.slice(5).split('#');
                return (
                    <button
                        type="button"
                        title={`From query ${qid}${column ? ` · ${column}` : ''} — click to inspect`}
                        onClick={() => setCiteQueryId(qid)}
                        style={{
                            font: 'inherit', color: 'var(--accent-primary)',
                            background: 'none', border: 'none',
                            borderBottom: '1px dotted var(--accent-primary)',
                            padding: 0, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >{children}</button>
                );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        },
        pre: ({ children, ...props }) => (
            <pre className="ai-msg-code-block" {...props}>{children}</pre>
        ),
        code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            return match ? (
                <code className={className} {...props}>{children}</code>
            ) : (
                <code className="ai-msg-inline-code" {...props}>{children}</code>
            );
        },
        ul: ({ children }) => <ul>{children}</ul>,
        ol: ({ children }) => <ol>{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong>{children}</strong>,
        h1: ({ children }) => <h3>{children}</h3>,
        h2: ({ children }) => <h3>{children}</h3>,
        h3: ({ children }) => <h4>{children}</h4>,
        table: ({ children }) => (
            <div className="ai-msg-table-wrap">
                <table>{children}</table>
            </div>
        ),
        th: ({ children }) => <th>{children}</th>,
        td: ({ children }) => <td>{children}</td>,
    };
}

/**
 * Safely decodes URL-encoded strings (like %C3%AD) that some LLMs emit in JSON.
 */
function decodeSafely(str) {
    if (typeof str !== 'string') return str;
    try {
        return str.replace(/(%[0-9A-Fa-f]{2})+/g, match => decodeURIComponent(match));
    } catch (e) {
        return str;
    }
}

/**
 * Modal that shows the SQL query and result rows that back a specific finding.
 */
function QueryAuditModal({ queryId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/ai/query-cache/${queryId}`)
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [queryId]);

    return (
        <div className="query-audit-overlay" onClick={onClose}>
            <div className="query-audit-modal" onClick={e => e.stopPropagation()}>
                <div className="query-audit-header">
                    <span className="query-audit-title">
                        <LuSearch size={13} />
                        Source Query
                    </span>
                    <button className="query-audit-close" onClick={onClose}><LuX size={14} /></button>
                </div>

                {loading && <div className="query-audit-loading">Loading…</div>}
                {error   && <div className="query-audit-error">Error: {error}</div>}

                {data && (
                    <>
                        <pre className="query-audit-sql">{data.sqlQuery}</pre>
                        <div className="query-audit-meta">
                            {data.rowCount} rows · {data.execMs}ms
                        </div>
                        {data.data?.length > 0 && (
                            <div className="query-audit-table-wrap">
                                <table className="query-audit-table">
                                    <thead>
                                        <tr>
                                            {data.columns.map(c => (
                                                <th key={c.name}>{c.name}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.data.slice(0, 20).map((row, ri) => (
                                            <tr key={ri}>
                                                {data.columns.map(c => (
                                                    <td key={c.name}>{String(row[c.name] ?? '')}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.data.length > 20 && (
                                    <div className="query-audit-truncated">
                                        Showing 20 of {data.rowCount} rows
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * NarrativeCard — renders a structured final_answer with tldr/findings/cause/actions/caveats.
 */
export function NarrativeCard({ result, onFollowUp, onAskAbout }) {
    const { tldr, findings, likely_cause, suggested_actions, caveats, followup_questions } = result;
    const [causeOpen, setCauseOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [auditQueryId, setAuditQueryId] = useState(null);
    const hasDetails = findings?.length > 0 || !!likely_cause || suggested_actions?.length > 0 || caveats?.length > 0;

    const openAudit = useCallback((qid) => setAuditQueryId(qid), []);
    const closeAudit = useCallback(() => setAuditQueryId(null), []);

    return (
        <div className="ai-narrative">
            {auditQueryId && (
                <QueryAuditModal queryId={auditQueryId} onClose={closeAudit} />
            )}

            {tldr && (
                <div className="ai-narrative-tldr">
                    <LuZap size={12} className="ai-narrative-tldr-icon" />
                    <span>{decodeSafely(tldr)}</span>
                </div>
            )}

            {hasDetails && (
                <button
                    onClick={() => setDetailsOpen(o => !o)}
                    title={detailsOpen ? 'Hide the structured summary' : 'Show the structured summary'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '11px', padding: '2px 0', marginTop: '2px',
                    }}
                >
                    {detailsOpen ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />}
                    {detailsOpen ? 'Hide summary' : 'Show summary'}
                </button>
            )}

            {detailsOpen && (<>

            {findings?.length > 0 && (
                <div className="ai-narrative-section">
                    <div className="ai-narrative-section-label">
                        <LuTrendingUp size={11} />
                        Findings
                    </div>
                    <ul className="ai-narrative-findings">
                        {findings.map((f, i) => (
                            <li key={i} className="ai-narrative-finding">
                                <span className="ai-narrative-finding-point">{decodeSafely(f.point)}</span>
                                <span className="ai-narrative-finding-right">
                                    {f.value && <span className="ai-narrative-finding-value">{decodeSafely(f.value)}</span>}
                                    {f.source_query_id && (
                                        <button
                                            className="ai-narrative-audit-btn"
                                            title="Ver consulta fuente"
                                            onClick={() => openAudit(f.source_query_id)}
                                        >
                                            <LuSearch size={10} />
                                        </button>
                                    )}
                                    {onAskAbout && (
                                        <button
                                            className="ai-narrative-audit-btn"
                                            title="Ask the agent about this finding"
                                            onClick={() => onAskAbout({
                                                type: 'finding',
                                                findingText: decodeSafely(f.point) + (f.value ? ` (${decodeSafely(f.value)})` : ''),
                                                queryId: f.source_query_id || undefined,
                                                label: `Finding: ${decodeSafely(f.point).slice(0, 40)}`,
                                                key: `finding:${i}:${f.source_query_id || decodeSafely(f.point).slice(0, 20)}`,
                                            })}
                                        >
                                            <LuMessageSquareQuote size={10} />
                                        </button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {likely_cause && (
                <div className="ai-narrative-section">
                    <button className="ai-narrative-cause-toggle" onClick={() => setCauseOpen(o => !o)}>
                        <LuCircleHelp size={11} />
                        <span>Why?</span>
                        {causeOpen ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />}
                    </button>
                    {causeOpen && <p className="ai-narrative-cause">{decodeSafely(likely_cause)}</p>}
                </div>
            )}

            {suggested_actions?.length > 0 && (
                <div className="ai-narrative-section">
                    <div className="ai-narrative-section-label">
                        <LuArrowRight size={11} />
                        Next steps
                    </div>
                    <ol className="ai-narrative-actions">
                        {suggested_actions.map((a, i) => (
                            <li key={i}>{decodeSafely(a)}</li>
                        ))}
                    </ol>
                </div>
            )}

            {caveats?.length > 0 && (
                <div className="ai-narrative-caveats">
                    <LuTriangleAlert size={10} className="ai-narrative-caveats-icon" />
                    <span>{decodeSafely(caveats.join(' '))}</span>
                </div>
            )}

            </>)}

            {followup_questions?.length > 0 && (
                <div className="ai-msg-followups">
                    <span className="ai-msg-followups__label">Explore</span>
                    <div className="ai-msg-followups__list">
                        {followup_questions.map((q, i) => (
                            <button key={i} className="ai-msg-followup" onClick={() => onFollowUp?.(q)}>
                                {decodeSafely(q)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {onFollowUp && (
                <div className="ai-msg-followups" style={{ marginTop: '4px' }}>
                    <button
                        className="ai-msg-followup"
                        title="Build a .sqlnb notebook from this analysis"
                        onClick={() => onFollowUp('Save this analysis as a notebook — include the queries, the charts, and a short narrative for each section.')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            color: 'var(--accent-primary)',
                            border: '1px solid var(--accent-primary)',
                            background: 'var(--accent-subtle, transparent)',
                            fontWeight: 600,
                        }}
                    >
                        <LuNotebookPen size={13} /> Save as notebook
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Parses thinking tokens (<think>...</think>) from model output.
 * Returns an array of {type: 'text'|'thinking', content} parts.
 */
function parseThinkingBlocks(text) {
    if (!text) return [{ type: 'text', content: '' }];

    const parts = [];
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
    let lastIndex = 0;
    let match;

    while ((match = thinkRegex.exec(text)) !== null) {
        // Text before this thinking block
        if (match.index > lastIndex) {
            const textBefore = text.slice(lastIndex, match.index).trim();
            if (textBefore) parts.push({ type: 'text', content: textBefore });
        }
        // The thinking block itself
        const thinking = match[1].trim();
        const isStreaming = !match[0].endsWith('</think>');
        if (thinking || isStreaming) {
            parts.push({ type: 'thinking', content: thinking, isStreaming });
        }
        lastIndex = match.index + match[0].length;

        if (match.index === thinkRegex.lastIndex) {
            thinkRegex.lastIndex++;
        }
    }

    // Remaining text after last thinking block
    if (lastIndex < text.length) {
        const remaining = text.slice(lastIndex).trim();
        if (remaining) parts.push({ type: 'text', content: remaining });
    }

    // If no thinking blocks found, return text as-is
    if (parts.length === 0) {
        return [{ type: 'text', content: text }];
    }

    return parts;
}

/**
 * ThinkingBlock — Collapsible block showing model reasoning.
 */
const ThinkingBlock = ({ content, isStreaming }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    // Auto-expand if it's currently streaming
    useEffect(() => {
        if (isStreaming) {
            setIsExpanded(true);
        }
    }, [isStreaming]);

    return (
        <div className="ai-msg-thinking">
            <button
                className="ai-msg-thinking__toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <LuBrain size={12} className={`ai-msg-thinking__icon ${isStreaming ? 'ai-pulsing' : ''}`} />
                <span>{isStreaming ? 'Reasoning...' : 'Reasoning'}</span>
                {isExpanded
                    ? <LuChevronDown size={12} />
                    : <LuChevronRight size={12} />
                }
            </button>
            {isExpanded && (
                <div className="ai-msg-thinking__content">
                    {content ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                p: ({ children }) => <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--text-tertiary)' }}>{children}</p>,
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Thinking...</span>
                    )}
                </div>
            )}
        </div>
    );
};

/**
 * Extract unique table references from SQL queries in tool calls.
 */
function extractCitations(toolCalls) {
    if (!toolCalls) return [];
    const tables = new Set();
    for (const tc of toolCalls) {
        const sqlArg = tc.toolName === 'execute_sql' && tc.args?.query
            ? tc.args.query
            : null;
        if (sqlArg) {
            // Extract FROM/JOIN table references
            const sql = sqlArg.toUpperCase();
            const matches = sql.matchAll(/(?:FROM|JOIN)\s+"?(\w+)"?(?:\."?(\w+)"?)?/gi);
            for (const m of matches) {
                const tbl = m[2] || m[1];
                if (tbl && !['INFORMATION_SCHEMA', 'PG_CATALOG', 'AMOXSQL_AI'].includes(tbl.toUpperCase())) {
                    tables.add(m[2] ? `${m[1]}.${m[2]}` : m[1]);
                }
            }
        }
        if (tc.toolName === 'describe_table' && tc.args?.table_name) {
            tables.add(tc.args.table_name);
        }
    }
    return [...tables];
}

/**
 * ChatMessage — Renders a single message in the AI chat.
 * Supports user messages, assistant responses with markdown,
 * tool call indicators, SQL blocks, chart results, and follow-up suggestions.
 *
 * Linear UI redesign: all inline styles replaced with ai-msg-* CSS classes.
 * User messages render as right-aligned bubbles, assistant messages as
 * left-aligned cards with avatar and grouped content sections.
 */
const ChatMessage = ({ role, content, toolCalls, allMessages, isDiving, isStreaming, onRunSql, onApplyToFile, onAppendToFile, onApplyChart, onFollowUp, onExportNotebook, onExportAmoxvis, onOpenFile, pendingEdits, acceptEdit, rejectEdit, currentFileContent, activityOnly = false }) => {
    const isUser = role === 'user';
    const isAssistant = role === 'assistant';

    // State for inline data table toggles (keyed by sqlCalls index)
    const [expandedTables, setExpandedTables] = useState(new Set());
    const toggleTable = (index) => {
        setExpandedTables(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    // Inline citation → opens the query audit modal for the cited result
    const [citeQueryId, setCiteQueryId] = useState(null);

    // Stable markdown renderers (setCiteQueryId is a stable setter). A fresh
    // components object per render would defeat the memoized markdown chunks.
    const mdComponents = useMemo(() => makeMdComponents(setCiteQueryId), []);

    // Parse follow-up suggestions from suggest_followups tool
    const followUps = toolCalls?.filter(tc => tc.toolName === 'suggest_followups')
        .flatMap(tc => tc.result?.suggestions || []) || [];

    // SQL queries from execute_sql tool calls
    const sqlCalls = toolCalls?.filter(tc => tc.toolName === 'execute_sql') || [];

    // Chart visualizations from display_chart tool calls
    const chartCalls = toolCalls?.filter(tc => tc.toolName === 'display_chart') || [];

    // edit_file tool calls — shown as accept/reject proposals (assistant mode only)
    const editFileCalls = !isDiving ? (toolCalls?.filter(tc => tc.toolName === 'edit_file') || []) : [];

    // final_answer structured results — rendered as NarrativeCard when structured fields are present
    const narrativeCalls = toolCalls?.filter(tc =>
        tc.toolName === 'final_answer' && tc.result && (tc.result.tldr || tc.result.findings?.length)
    ) || [];

    // Other tool calls (list_tables, describe_table, read_file) — exclude edit_file and final_answer (handled separately)
    const otherCalls = toolCalls?.filter(tc =>
        tc.toolName !== 'execute_sql' && tc.toolName !== 'suggest_followups' && tc.toolName !== 'display_chart' && tc.toolName !== 'build_notebook' && tc.toolName !== 'edit_file' && tc.toolName !== 'final_answer'
    ) || [];

    // Notebook creation results
    const notebookCalls = toolCalls?.filter(tc => tc.toolName === 'build_notebook' && tc.result?.success) || [];

    // Citations: tables referenced in this response
    const citations = isAssistant ? extractCitations(toolCalls) : [];

    // --- User message: right-aligned bubble, no avatar ---
    if (isUser) {
        return (
            <div className="ai-msg ai-msg--user">
                <div className="ai-msg-bubble">
                    <span className="ai-msg-role">You</span>
                    <div className="ai-msg-text">
                        <p>{content}</p>
                    </div>
                </div>
            </div>
        );
    }

    // --- Assistant message: left-aligned card with avatar ---
    return (
        <div className="ai-msg ai-msg--assistant">
            <div className="ai-msg-avatar">
                <LuBot size={14} />
            </div>

            <div className="ai-msg-body">
                <span className="ai-msg-role">AmoxSQL AI</span>

                {/* Other tool calls (shown before text) */}
                {otherCalls.length > 0 && (
                    <div className="ai-msg-tools">
                        {otherCalls.map((tc, i) => (
                            <ToolCallBlock
                                key={i}
                                toolName={tc.toolName}
                                args={tc.args}
                                result={tc.result}
                                isLoading={false}
                            />
                        ))}
                    </div>
                )}

                {/* edit_file proposals: Accept/Reject diff view */}
                {editFileCalls.length > 0 && editFileCalls.map((tc, i) => {
                    const isPending = pendingEdits && tc.result?.action === 'edit_file' && pendingEdits[tc.toolCallId || `edit_${i}`];
                    if (isPending) {
                        return (
                            <EditProposalBlock
                                key={i}
                                currentContent={currentFileContent || ''}
                                proposedContent={tc.result?.content || ''}
                                description={tc.result?.description}
                                onAccept={() => acceptEdit(tc.toolCallId || `edit_${i}`)}
                                onReject={() => rejectEdit(tc.toolCallId || `edit_${i}`)}
                            />
                        );
                    }
                    // Already accepted or rejected — show compact status
                    return (
                        <div key={i} className="ai-msg-tools">
                            <ToolCallBlock
                                toolName="edit_file"
                                args={tc.args}
                                result={tc.result}
                                isLoading={false}
                            />
                        </div>
                    );
                })}

                {/* SQL blocks */}
                {sqlCalls.length > 0 && (
                    <div className="ai-msg-tools">
                        {sqlCalls.map((tc, i) => (
                            <div key={i}>
                                <SqlBlock
                                    sql={tc.args?.query || ''}
                                    onRun={onRunSql}
                                    onApplyToFile={!isDiving ? onApplyToFile : undefined}
                                    onAppendToFile={!isDiving ? onAppendToFile : undefined}
                                    defaultExpanded={sqlCalls.length <= 2}
                                />
                                {tc.result && !tc.result.error && tc.result.rowCount !== undefined && (
                                    <div className="ai-msg-sql-result ai-msg-sql-result--success">
                                        <span className="ai-msg-sql-result__icon">&#10003;</span>
                                        {tc.result.rowCount} rows ({tc.result.executionTime}ms)
                                        {tc.result.data && tc.result.data.length > 0 && (
                                            <button
                                                className="ai-msg-table-toggle"
                                                onClick={() => toggleTable(i)}
                                            >
                                                {expandedTables.has(i)
                                                    ? <LuChevronDown size={10} />
                                                    : <LuChevronRight size={10} />}
                                                {expandedTables.has(i) ? 'Hide table' : 'View data'}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {expandedTables.has(i) && tc.result?.data?.length > 0 && (() => {
                                    const cols = tc.result.columns?.length > 0
                                        ? tc.result.columns
                                        : Object.keys(tc.result.data[0] || {}).map(n => ({ name: n }));
                                    return (
                                        <div className="ai-msg-inline-table">
                                            <div className="ai-msg-table-wrap">
                                                <table>
                                                    <thead>
                                                        <tr>{cols.map((col, ci) => <th key={ci}>{col.name}</th>)}</tr>
                                                    </thead>
                                                    <tbody>
                                                        {tc.result.data.slice(0, 50).map((row, ri) => (
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
                                            {tc.result.data.length > 50 && (
                                                <div className="ai-msg-inline-table-hint">
                                                    Showing 50 of {tc.result.rowCount || tc.result.data.length} rows — click Run above to see all
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                                {tc.result?.error && (
                                    <div className="ai-msg-sql-result ai-msg-sql-result--error">
                                        <span className="ai-msg-sql-result__icon">&#10007;</span>
                                        <span className="ai-msg-sql-error-text">{tc.result.error}</span>
                                    </div>
                                )}
                                {!tc.result && (
                                    <div className="ai-msg-sql-result ai-msg-sql-result--error">
                                        <span className="ai-msg-sql-result__icon">&#10007;</span>
                                        <span className="ai-msg-sql-error-text">Failed — no result returned</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Text content (markdown) — with thinking block support.
                    Closed parts render through memoized chunks (parse once);
                    while streaming, only the growing tail re-parses per flush. */}
                {content && (() => {
                    const parts = parseThinkingBlocks(content);
                    const lastTextIdx = parts.map(p => p.type).lastIndexOf('text');
                    return (
                        <div className="ai-msg-text">
                            {citeQueryId && <QueryAuditModal queryId={citeQueryId} onClose={() => setCiteQueryId(null)} />}
                            {parts.map((part, idx) => {
                                if (part.type === 'thinking') {
                                    return <ThinkingBlock key={idx} content={part.content} isStreaming={part.isStreaming} />;
                                }
                                // Inspector mode: reasoning + activity only, hide the prose
                                // (the prose already lives in the transcript card).
                                if (activityOnly) return null;
                                if (isStreaming && idx === lastTextIdx) {
                                    return <StreamingMarkdown key={idx} content={part.content} components={mdComponents} />;
                                }
                                return <MarkdownChunk key={idx} content={part.content} components={mdComponents} />;
                            })}
                            {isStreaming && (
                                <span className="ai-msg-cursor" />
                            )}
                        </div>
                    );
                })()}

                {/* Citations — tables referenced in this response */}
                {citations.length > 0 && (
                    <div style={{
                        marginTop: '6px', marginBottom: '6px',
                        display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center',
                    }}>
                        <LuDatabase size={10} style={{ color: 'var(--text-muted)', marginRight: '2px' }} />
                        {citations.map((table, i) => (
                            <span key={i} style={{
                                fontSize: '10px', padding: '1px 6px',
                                backgroundColor: 'var(--sidebar-item-active-bg)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '3px', color: 'var(--accent-color-user)',
                                fontFamily: "'Cascadia Code', 'Consolas', monospace",
                            }}>
                                {table}
                            </span>
                        ))}
                    </div>
                )}

                {/* Notebook creation results */}
                {notebookCalls.length > 0 && (
                    <div style={{ marginTop: '6px', marginBottom: '6px' }}>
                        {notebookCalls.map((tc, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: 'var(--sidebar-item-active-bg)',
                                border: '1px solid var(--accent-color-user)',
                                borderRadius: '6px', fontSize: '12px',
                            }}>
                                <LuNotebookPen size={14} style={{ color: 'var(--accent-color-user)', flexShrink: 0 }} />
                                <span style={{ flex: 1, color: 'var(--text-active)' }}>
                                    Notebook created: <strong>{tc.result.fileName}</strong> ({tc.result.cellCount} cells)
                                </span>
                                {onOpenFile && (
                                    <button
                                        onClick={() => onOpenFile(tc.result.path)}
                                        style={{
                                            padding: '3px 10px', fontSize: '11px',
                                            backgroundColor: 'var(--accent-color-user)',
                                            color: 'var(--button-text-color)',
                                            border: 'none', borderRadius: '4px', cursor: 'pointer',
                                        }}
                                    >
                                        Open
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Chart blocks (shown after text) */}
                {chartCalls.length > 0 && (
                    <div className="ai-msg-tools ai-msg-tools--charts">
                        {chartCalls.map((tc, i) => (
                            <div key={i}>
                                <ToolCallBlock
                                    toolName={tc.toolName}
                                    args={tc.args}
                                    result={tc.result}
                                    isLoading={false}
                                />
                                {tc.result && tc.result.chartConfig && (
                                    <ChatResultsBlock
                                        chartConfig={tc.result.chartConfig}
                                        allMessages={allMessages}
                                        isDiving={isDiving}
                                        onExportNotebook={onExportNotebook}
                                        onExportAmoxvis={onExportAmoxvis}
                                        onApplyChart={!isDiving ? onApplyChart : undefined}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Structured narrative summary from final_answer tool */}
                {narrativeCalls.length > 0 && narrativeCalls.map((tc, i) => (
                    <NarrativeCard key={i} result={tc.result} onFollowUp={onFollowUp} />
                ))}

                {/* Follow-up suggestions as pills (from suggest_followups tool) */}
                {followUps.length > 0 && (
                    <div className="ai-msg-followups">
                        <span className="ai-msg-followups__label">Suggestions</span>
                        <div className="ai-msg-followups__list">
                            {followUps.map((suggestion, i) => (
                                <button
                                    key={i}
                                    className="ai-msg-followup"
                                    onClick={() => onFollowUp && onFollowUp(suggestion)}
                                >
                                    {decodeSafely(suggestion)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Memoize: re-render only when actual message content or pendingEdits change.
// Callbacks from parent may be recreated on every render (input keystrokes etc),
// but they are functionally identical so we intentionally ignore them in the compare.
export default memo(ChatMessage, (prev, next) => (
    prev.role === next.role &&
    prev.content === next.content &&
    prev.toolCalls === next.toolCalls &&
    prev.isStreaming === next.isStreaming &&
    prev.isDiving === next.isDiving &&
    prev.allMessages === next.allMessages &&
    prev.pendingEdits === next.pendingEdits &&
    prev.currentFileContent === next.currentFileContent
));
