/**
 * BaseChainNode — Shared layout for all chain node types.
 * Provides: handles, status indicator, type badge, label, description preview, result badge.
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LuCheck, LuX, LuLoader, LuMinus, LuCircleAlert } from 'react-icons/lu';
import { NODE_TYPES, STATUS_COLORS, RESULT_TYPE_LABELS } from '../chainNodeTypes';

const statusIcons = {
    pending: null,
    running: <LuLoader size={12} className="chain-node-spin" />,
    success: <LuCheck size={12} />,
    failed: <LuX size={12} />,
    skipped: <LuMinus size={12} />,
};

const BaseChainNode = ({ data, selected }) => {
    const nodeType = NODE_TYPES[data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;
    const status = data.status || 'pending';
    const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;
    const resultType = data.resultType;
    const resultSummary = data.resultSummary;
    const durationMs = data.durationMs;

    return (
        <div
            className={`chain-node ${selected ? 'chain-node-selected' : ''}`}
            style={{
                '--node-bg': nodeType.color.bg,
                '--node-border': status !== 'pending' ? statusColor.border : nodeType.color.border,
                '--node-accent': nodeType.color.accent,
                '--status-bg': statusColor.bg,
            }}
        >
            <Handle type="target" position={Position.Left} className="chain-handle" />

            {/* Header */}
            <div className="chain-node-header">
                <div className="chain-node-type-badge" style={{ backgroundColor: nodeType.color.accent }}>
                    <Icon size={10} />
                    <span>{nodeType.label}</span>
                </div>
                {status !== 'pending' && (
                    <div className="chain-node-status" style={{ color: statusColor.text }}>
                        {statusIcons[status]}
                        {durationMs !== undefined && (
                            <span className="chain-node-duration">{durationMs}ms</span>
                        )}
                    </div>
                )}
            </div>

            {/* Label */}
            <div className="chain-node-label" title={data.label}>
                {data.label || 'Untitled'}
            </div>

            {/* Description */}
            {data.description && (
                <div className="chain-node-description" title={data.description}>
                    {data.description}
                </div>
            )}

            {/* Config summary */}
            {data.configSummary && (
                <div className="chain-node-config-summary">
                    {data.configSummary}
                </div>
            )}

            {/* Result badge */}
            {resultType && status === 'success' && (
                <div className="chain-node-result">
                    <span className="chain-node-result-type">
                        {RESULT_TYPE_LABELS[resultType] || resultType}
                    </span>
                    {resultSummary?.rowCount !== undefined && (
                        <span className="chain-node-result-detail">
                            {Number(resultSummary.rowCount).toLocaleString()} rows
                        </span>
                    )}
                    {resultSummary?.table && (
                        <span className="chain-node-result-detail">
                            → {resultSummary.table}
                        </span>
                    )}
                    {resultSummary?.path && (
                        <span className="chain-node-result-detail">
                            → {resultSummary.path}
                        </span>
                    )}
                </div>
            )}

            {/* Error message */}
            {status === 'failed' && data.errorMessage && (
                <div className="chain-node-error">
                    <LuCircleAlert size={10} />
                    <span>{data.errorMessage}</span>
                </div>
            )}

            <Handle type="source" position={Position.Right} className="chain-handle" />
        </div>
    );
};

export default memo(BaseChainNode);
