import { useState } from 'react';
import { LuChevronDown, LuChevronRight, LuLoader, LuCheck, LuX, LuDatabase, LuTable, LuChartBar, LuMessageSquare } from 'react-icons/lu';

const TOOL_ICONS = {
    execute_sql: LuDatabase,
    list_tables: LuTable,
    describe_table: LuTable,
    display_chart: LuChartBar,
    suggest_followups: LuMessageSquare,
};

// [mientras corre, cuando terminó]: con una sola forma, un gráfico ya dibujado
// seguía diciendo «Building chart».
const TOOL_LABELS = {
    execute_sql: ['Running a query', 'Ran a query'],
    list_tables: ['Listing tables', 'Listed the tables'],
    describe_table: ['Reading the table structure', 'Read the table structure'],
    display_chart: ['Drawing a chart', 'Drew a chart'],
    suggest_followups: ['Suggesting questions', 'Suggested questions'],
    profile_data: ['Profiling the data', 'Profiled the data'],
    build_notebook: ['Writing a notebook', 'Wrote a notebook'],
    save_to_vault: ['Saving the analysis', 'Saved the analysis'],
    lookup_duckdb_docs: ['Checking the SQL reference', 'Checked the SQL reference'],
    ask_user: ['Asking you a question', 'Asked you a question'],
};

// Una herramienta sin etiqueta no enseña su nombre interno tal cual (`profile_data`).
const legible = (nombre) => {
    const t = String(nombre || '').replace(/_/g, ' ').trim();
    return t ? t[0].toUpperCase() + t.slice(1) : 'Working';
};

/** What a tool is doing (or did), in words. Also Deep Dive's live status line. */
export function etiquetaHerramienta(nombre, cargando) {
    const [haciendo, hecho] = TOOL_LABELS[nombre] || [legible(nombre), legible(nombre)];
    return cargando ? haciendo : hecho;
}

/**
 * ToolCallBlock — Collapsible indicator for a tool call in the agent loop.
 * Shows loading state while executing, then result summary when complete.
 */
const ToolCallBlock = ({ toolName, args, result, isLoading = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const Icon = TOOL_ICONS[toolName] || LuDatabase;
    const [haciendo, hecho] = TOOL_LABELS[toolName] || [legible(toolName), legible(toolName)];
    const label = isLoading ? haciendo : hecho;
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
                    {isLoading ? `${label}…` : label}
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
                    <span className="ai-tool-meta ai-tool-meta--error">Failed</span>
                )}

                {!isLoading && (
                    <span className="ai-tool-chevron">
                        {isExpanded ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
                    </span>
                )}
            </div>

            {/* Error preview — always visible when failed */}
            {hasError && !isExpanded && (
                <div className="ai-tool-error-preview">
                    {result.error}
                </div>
            )}

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
                            <div className="ai-tool-details-label">
                                {hasError ? 'Error Details' : 'Output'}
                            </div>
                            <pre className={`ai-tool-pre ${hasError ? 'ai-tool-pre--error' : ''}`}>
                                {typeof result === 'string' ? result : JSON.stringify(result, null, 2).substring(0, 800)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ToolCallBlock;
