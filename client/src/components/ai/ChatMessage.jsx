import ReactMarkdown from 'react-markdown';
import { LuUser, LuBot } from 'react-icons/lu';
import SqlBlock from './SqlBlock';
import ToolCallBlock from './ToolCallBlock';
import ChatResultsBlock from './ChatResultsBlock';

/**
 * ChatMessage — Renders a single message in the AI chat.
 * Supports user messages, assistant responses with markdown,
 * tool call indicators, SQL blocks, chart results, and follow-up suggestions.
 *
 * Linear UI redesign: all inline styles replaced with ai-msg-* CSS classes.
 * User messages render as right-aligned bubbles, assistant messages as
 * left-aligned cards with avatar and grouped content sections.
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

                {/* SQL blocks */}
                {sqlCalls.length > 0 && (
                    <div className="ai-msg-tools">
                        {sqlCalls.map((tc, i) => (
                            <div key={i}>
                                <SqlBlock
                                    sql={tc.args?.query || ''}
                                    onRun={onRunSql}
                                    defaultExpanded={sqlCalls.length <= 2}
                                />
                                {tc.result && !tc.result.error && tc.result.rowCount !== undefined && (
                                    <div className="ai-msg-sql-result ai-msg-sql-result--success">
                                        <span className="ai-msg-sql-result__icon">&#10003;</span>
                                        {tc.result.rowCount} rows ({tc.result.executionTime}ms)
                                    </div>
                                )}
                                {tc.result?.error && (
                                    <div className="ai-msg-sql-result ai-msg-sql-result--error">
                                        <span className="ai-msg-sql-result__icon">&#10007;</span>
                                        {tc.result.error}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Text content (markdown) */}
                {content && (
                    <div className="ai-msg-text">
                        <ReactMarkdown
                            components={{
                                p: ({ children }) => <p>{children}</p>,
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
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                        {isStreaming && (
                            <span className="ai-msg-cursor" />
                        )}
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
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Follow-up suggestions as pills */}
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
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
