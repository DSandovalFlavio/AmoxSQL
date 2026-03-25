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

    const stateClass = isLoading
        ? 'ai-tool--loading'
        : hasError
            ? 'ai-tool--error'
            : 'ai-tool--success';

    return (
        <div className={`ai-tool ${stateClass}`}>
            {/* Header */}
            <div
                className="ai-tool-header"
                onClick={() => !isLoading && setIsExpanded(!isExpanded)}
                data-clickable={!isLoading}
            >
                <span className="ai-tool-icon">
                    {isLoading ? (
                        <LuLoader size={13} className="ai-tool-spinner" />
                    ) : hasError ? (
                        <LuX size={13} />
                    ) : (
                        <LuCheck size={13} />
                    )}
                </span>

                <Icon size={13} className="ai-tool-type-icon" />

                <span className="ai-tool-label">
                    {isLoading ? `${label}...` : label}
                </span>

                {toolName === 'execute_sql' && result?.rowCount !== undefined && !hasError && (
                    <span className="ai-tool-meta">
                        {result.rowCount} rows &middot; {result.executionTime}ms
                    </span>
                )}
                {toolName === 'describe_table' && args?.table_name && (
                    <span className="ai-tool-meta">{args.table_name}</span>
                )}
                {hasError && (
                    <span className="ai-tool-meta ai-tool-meta--error">Error</span>
                )}

                {!isLoading && (
                    <span className="ai-tool-chevron">
                        {isExpanded ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
                    </span>
                )}
            </div>

            {/* Expandable details */}
            {isExpanded && !isLoading && (
                <div className="ai-tool-details">
                    {args && (
                        <div className="ai-tool-details-section">
                            <div className="ai-tool-details-label">Input</div>
                            <pre className="ai-tool-pre">
                                {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
                            </pre>
                        </div>
                    )}
                    {result && (
                        <div className="ai-tool-details-section">
                            <div className="ai-tool-details-label">Output</div>
                            <pre className={`ai-tool-pre ${hasError ? 'ai-tool-pre--error' : ''}`}>
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
