import ReactMarkdown from 'react-markdown';
import { LuUser, LuBot } from 'react-icons/lu';
import SqlBlock from './SqlBlock';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';

/**
 * ChatMessage — Renders a single message in the AI chat.
 * Supports user messages, assistant responses with markdown,
 * tool call indicators, SQL blocks, chart results, and follow-up suggestions.
 */
const ChatMessage = ({ role, content, toolCalls, allMessages, isDiving, isStreaming, onRunSql, onFollowUp, onExportNotebook }) => {
    const isUser = role === 'user';
    const isAssistant = role === 'assistant';

    // Parse follow-up suggestions from suggest_followups tool
    const followUps = toolCalls?.filter(tc => tc.toolName === 'suggest_followups')
        .flatMap(tc => tc.result?.suggestions || []) || [];

    // SQL queries from execute_sql tool calls
    const sqlCalls = toolCalls?.filter(tc => tc.toolName === 'execute_sql') || [];

    // Chart visualizations from display_chart tool calls
    const chartCalls = toolCalls?.filter(tc => tc.toolName === 'display_chart') || [];

    // Other tool calls (list_tables, describe_table)
    const otherCalls = toolCalls?.filter(tc =>
        tc.toolName !== 'execute_sql' && tc.toolName !== 'suggest_followups' && tc.toolName !== 'display_chart'
    ) || [];

    return (
        <div style={{
            display: 'flex', gap: '10px',
            padding: '12px 16px',
            backgroundColor: isUser ? 'transparent' : 'var(--sidebar-item-active-bg)',
            borderBottom: '1px solid var(--border-color)',
        }}>
            {/* Avatar */}
            <div style={{
                width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isUser ? 'var(--accent-color-user)' : 'var(--border-color)',
                color: isUser ? 'var(--button-text-color)' : 'var(--accent-color-user)',
                marginTop: '2px',
            }}>
                {isUser ? <LuUser size={13} /> : <LuBot size={13} />}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                {/* Role label */}
                <div style={{
                    fontSize: '11px', fontWeight: '600',
                    color: isUser ? 'var(--text-active)' : 'var(--accent-color-user)',
                    marginBottom: '4px', textTransform: 'uppercase',
                }}>
                    {isUser ? 'You' : 'AmoxSQL AI'}
                </div>

                {/* Other tool calls (shown before text for assistant) */}
                {isAssistant && otherCalls.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
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

                {/* SQL blocks */}
                {isAssistant && sqlCalls.length > 0 && (
                    <div style={{ marginBottom: '6px' }}>
                        {sqlCalls.map((tc, i) => (
                            <div key={i}>
                                <SqlBlock
                                    sql={tc.args?.query || ''}
                                    onRun={onRunSql}
                                    defaultExpanded={sqlCalls.length <= 2}
                                />
                                {tc.result && !tc.result.error && tc.result.rowCount !== undefined && (
                                    <div style={{
                                        fontSize: '11px', color: 'var(--feedback-success-text)',
                                        marginBottom: '6px', marginLeft: '4px',
                                    }}>
                                        ✓ {tc.result.rowCount} rows ({tc.result.executionTime}ms)
                                    </div>
                                )}
                                {tc.result?.error && (
                                    <div style={{
                                        fontSize: '11px', color: 'var(--feedback-error-text)',
                                        marginBottom: '6px', padding: '4px 8px',
                                        backgroundColor: 'var(--feedback-error-bg)',
                                        borderRadius: '4px',
                                    }}>
                                        ✗ {tc.result.error}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Text content (markdown) */}
                {content && (
                    <div className="ai-message-content" style={{
                        fontSize: '13px', lineHeight: '1.6',
                        color: 'var(--text-active)',
                        wordBreak: 'break-word',
                    }}>
                        {isUser ? (
                            <p style={{ margin: 0 }}>{content}</p>
                        ) : (
                            <ReactMarkdown
                                components={{
                                    p: ({ children }) => <p style={{ margin: '0 0 8px 0' }}>{children}</p>,
                                    pre: ({ children, ...props }) => (
                                        <pre style={{
                                            backgroundColor: 'var(--input-bg)', padding: '8px 10px',
                                            borderRadius: '4px', fontSize: '12px', overflowX: 'auto',
                                            border: '1px solid var(--border-color)',
                                            fontFamily: "'Cascadia Code', 'Consolas', monospace",
                                            margin: '0 0 8px 0',
                                        }} {...props}>{children}</pre>
                                    ),
                                    code: ({ className, children, ...props }) => {
                                        const match = /language-(\w+)/.exec(className || '');
                                        return match ? (
                                            <code className={className} {...props}>{children}</code>
                                        ) : (
                                            <code style={{
                                                backgroundColor: 'var(--input-bg)', padding: '1px 4px',
                                                borderRadius: '3px', fontSize: '12px',
                                                fontFamily: "'Cascadia Code', 'Consolas', monospace",
                                            }} {...props}>{children}</code>
                                        );
                                    },
                                    ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ul>,
                                    ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ol>,
                                    li: ({ children }) => <li style={{ marginBottom: '2px', fontSize: '13px' }}>{children}</li>,
                                    strong: ({ children }) => <strong style={{ color: 'var(--text-active)' }}>{children}</strong>,
                                    h1: ({ children }) => <h3 style={{ margin: '8px 0 4px', fontSize: '15px', color: 'var(--text-active)' }}>{children}</h3>,
                                    h2: ({ children }) => <h3 style={{ margin: '8px 0 4px', fontSize: '14px', color: 'var(--text-active)' }}>{children}</h3>,
                                    h3: ({ children }) => <h4 style={{ margin: '6px 0 4px', fontSize: '13px', color: 'var(--text-active)' }}>{children}</h4>,
                                    table: ({ children }) => (
                                        <div style={{ overflowX: 'auto', margin: '6px 0' }}>
                                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>{children}</table>
                                        </div>
                                    ),
                                    th: ({ children }) => <th style={{ padding: '4px 8px', borderBottom: '2px solid var(--border-color)', textAlign: 'left', color: 'var(--text-active)', fontWeight: '600' }}>{children}</th>,
                                    td: ({ children }) => <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-color)' }}>{children}</td>,
                                }}
                            >
                                {content}
                            </ReactMarkdown>
                        )}
                        {isStreaming && (
                            <span style={{
                                display: 'inline-block', width: '6px', height: '14px',
                                backgroundColor: 'var(--accent-color-user)',
                                marginLeft: '2px', animation: 'blink 1s step-end infinite',
                            }} />
                        )}
                    </div>
                )}

                {/* Chart blocks (shown after text) */}
                {isAssistant && chartCalls.length > 0 && (
                    <div style={{ marginTop: '8px', marginBottom: '6px' }}>
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
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Follow-up suggestions */}
                {followUps.length > 0 && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>Suggestions:</div>
                        {followUps.map((suggestion, i) => (
                            <button
                                key={i}
                                onClick={() => onFollowUp && onFollowUp(suggestion)}
                                style={{
                                    textAlign: 'left', padding: '8px 12px',
                                    backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)',
                                    borderRadius: '6px', color: 'var(--text-active)', fontSize: '12px',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                    fontFamily: 'inherit',
                                }}
                                onMouseEnter={e => { e.target.style.borderColor = 'var(--accent-color-user)'; e.target.style.backgroundColor = 'var(--sidebar-item-active-bg)'; }}
                                onMouseLeave={e => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.backgroundColor = 'var(--input-bg)'; }}
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
