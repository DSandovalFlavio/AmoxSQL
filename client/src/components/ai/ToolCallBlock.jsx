import { useState } from 'react';
import { LuChevronDown, LuChevronRight, LuLoader, LuCheck, LuX, LuDatabase, LuTable, LuChartBar, LuMessageSquare } from 'react-icons/lu';

const TOOL_ICONS = {
    execute_sql: LuDatabase,
    list_tables: LuTable,
    describe_table: LuTable,
    display_chart: LuChartBar,
    suggest_followups: LuMessageSquare,
};

const TOOL_LABELS = {
    execute_sql: 'Ejecutando SQL',
    list_tables: 'Listando tablas',
    describe_table: 'Describiendo tabla',
    display_chart: 'Generando gráfico',
    suggest_followups: 'Sugiriendo preguntas',
};

/**
 * ToolCallBlock — Collapsible indicator for a tool call in the agent loop.
 * Shows loading state while executing, then result summary when complete.
 */
const ToolCallBlock = ({ toolName, args, result, isLoading = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const Icon = TOOL_ICONS[toolName] || LuDatabase;
    const label = TOOL_LABELS[toolName] || toolName;
    const hasError = result?.error;

    return (
        <div style={{
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            margin: '6px 0',
            overflow: 'hidden',
            backgroundColor: 'var(--sidebar-bg)',
            opacity: isLoading ? 0.9 : 1,
        }}>
            {/* Header */}
            <div
                onClick={() => !isLoading && setIsExpanded(!isExpanded)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 10px', cursor: isLoading ? 'default' : 'pointer',
                    fontSize: '11px', color: 'var(--text-muted)',
                }}
            >
                {isLoading ? (
                    <LuLoader size={12} style={{ animation: 'spin 2s linear infinite', color: 'var(--accent-color-user)' }} />
                ) : hasError ? (
                    <LuX size={12} style={{ color: 'var(--feedback-error-text)' }} />
                ) : (
                    <LuCheck size={12} style={{ color: 'var(--feedback-success-text)' }} />
                )}

                <Icon size={12} style={{ color: 'var(--accent-color-user)' }} />

                <span style={{ flex: 1, fontWeight: '500' }}>
                    {isLoading ? `${label}...` : label}
                    {toolName === 'execute_sql' && result?.rowCount !== undefined && !hasError && (
                        <span style={{ fontWeight: '400', marginLeft: '6px' }}>
                            — {result.rowCount} rows ({result.executionTime}ms)
                        </span>
                    )}
                    {toolName === 'describe_table' && args?.table_name && (
                        <span style={{ fontWeight: '400', marginLeft: '6px' }}>
                            — {args.table_name}
                        </span>
                    )}
                    {hasError && (
                        <span style={{ color: 'var(--feedback-error-text)', fontWeight: '400', marginLeft: '6px' }}>
                            Error
                        </span>
                    )}
                </span>

                {!isLoading && (
                    isExpanded ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />
                )}
            </div>

            {/* Expandable details */}
            {isExpanded && !isLoading && (
                <div style={{
                    borderTop: '1px solid var(--border-color)',
                    padding: '8px 10px',
                    fontSize: '11px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                }}>
                    {args && (
                        <div style={{ marginBottom: '6px' }}>
                            <div style={{ color: 'var(--text-muted)', fontWeight: '600', marginBottom: '3px' }}>Input:</div>
                            <pre style={{
                                margin: 0, padding: '6px 8px',
                                backgroundColor: 'var(--input-bg)', borderRadius: '4px',
                                fontSize: '10px', color: 'var(--text-color)',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                fontFamily: "'Cascadia Code', 'Consolas', monospace",
                            }}>
                                {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {result && (
                        <div>
                            <div style={{ color: 'var(--text-muted)', fontWeight: '600', marginBottom: '3px' }}>Output:</div>
                            <pre style={{
                                margin: 0, padding: '6px 8px',
                                backgroundColor: 'var(--input-bg)', borderRadius: '4px',
                                fontSize: '10px', color: hasError ? 'var(--feedback-error-text)' : 'var(--text-color)',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                fontFamily: "'Cascadia Code', 'Consolas', monospace",
                                maxHeight: '80px', overflowY: 'auto',
                            }}>
                                {typeof result === 'string' ? result : JSON.stringify(result, null, 2).substring(0, 500)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ToolCallBlock;
