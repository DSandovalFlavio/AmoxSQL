/**
 * BaseChainNode — Shared layout for all chain node types.
 * Provides: handles, status indicator, type badge, label, description,
 * result badge, validation indicators, and data preview button.
 */
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LuCheck, LuX, LuLoader, LuMinus, LuCircleAlert, LuTriangleAlert, LuEye } from 'react-icons/lu';
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

    const validationErrors = data.validationErrors || [];
    const validationWarnings = data.validationWarnings || [];
    const hasErrors = validationErrors.length > 0;
    const hasWarnings = validationWarnings.length > 0 && !hasErrors;

    const [showValidation, setShowValidation] = useState(false);

    // The default node bg/border derive from --node-accent + the theme surfaces
    // in CSS (legible in both light and dark). These states override the border.
    let borderOverride = null;
    if (status !== 'pending') borderOverride = statusColor.border;
    else if (hasErrors) borderOverride = 'var(--color-error)';
    else if (hasWarnings) borderOverride = 'var(--color-warning)';

    const canPreview = status === 'success' && resultSummary?.table;

    return (
        <div
            className={`chain-node ${selected ? 'chain-node-selected' : ''} ${hasErrors ? 'chain-node-invalid' : ''}`}
            style={{
                '--node-accent': nodeType.color.accent,
                ...(borderOverride ? { '--node-border-override': borderOverride } : {}),
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

                <div className="chain-node-header-right">
                    {/* Validation indicator */}
                    {status === 'pending' && (hasErrors || hasWarnings) && (
                        <button
                            className={`chain-node-validation-btn ${hasErrors ? 'chain-node-validation-error' : 'chain-node-validation-warn'}`}
                            onClick={(e) => { e.stopPropagation(); setShowValidation(v => !v); }}
                            title={hasErrors ? `${validationErrors.length} error(s)` : `${validationWarnings.length} warning(s)`}
                        >
                            {hasErrors
                                ? <LuCircleAlert size={11} />
                                : <LuTriangleAlert size={11} />
                            }
                        </button>
                    )}

                    {/* Preview button */}
                    {canPreview && (
                        <button
                            className="chain-node-preview-btn"
                            onClick={(e) => { e.stopPropagation(); data.onPreview?.(resultSummary.table); }}
                            title={`Preview: ${resultSummary.table}`}
                        >
                            <LuEye size={11} />
                        </button>
                    )}

                    {/* Status */}
                    {status !== 'pending' && (
                        <div className="chain-node-status" style={{ color: statusColor.text }}>
                            {statusIcons[status]}
                            {durationMs !== undefined && (
                                <span className="chain-node-duration">{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs/1000).toFixed(1)}s`}</span>
                            )}
                        </div>
                    )}
                </div>
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
                        <span className="chain-node-result-detail">→ {data.config?.tableName || resultSummary.table}</span>
                    )}
                    {resultSummary?.path && (
                        <span className="chain-node-result-detail">→ {resultSummary.path}</span>
                    )}
                    {resultSummary?.size && (
                        <span className="chain-node-result-detail">{resultSummary.size}</span>
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

            {/* Validation tooltip */}
            {showValidation && (hasErrors || hasWarnings) && (
                <div className="chain-node-validation-popup" onClick={(e) => e.stopPropagation()}>
                    {validationErrors.map((e, i) => (
                        <div key={`e${i}`} className="chain-node-validation-item chain-node-validation-item-error">
                            <LuCircleAlert size={10} />
                            <span>{e}</span>
                        </div>
                    ))}
                    {validationWarnings.map((w, i) => (
                        <div key={`w${i}`} className="chain-node-validation-item chain-node-validation-item-warn">
                            <LuTriangleAlert size={10} />
                            <span>{w}</span>
                        </div>
                    ))}
                </div>
            )}

            <Handle type="source" position={Position.Right} className="chain-handle" />
        </div>
    );
};

export default memo(BaseChainNode);
