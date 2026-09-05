/**
 * BaseChainNode — Shared layout for all chain node types.
 * Provides: handles, status indicator, type badge, label, description,
 * result badge, validation indicators, and the node's own action bar
 * (Fase 1 of docs/dev/auditoria_dataflow_ux.md — the actions the user needs
 * live ON the node, not in a toolbar far away or a menu that only appears
 * after a full run).
 */
import { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
    LuCheck, LuX, LuLoader, LuMinus, LuCircleAlert, LuTriangleAlert,
    LuSlidersHorizontal, LuChevronRight, LuChevronLeft, LuEye, LuEllipsis, LuPause, LuHistory, LuPlus,
} from 'react-icons/lu';
import { NODE_TYPES, STATUS_COLORS, RESULT_TYPE_LABELS } from '../chainNodeTypes';

const statusIcons = {
    pending: null,
    running: <LuLoader size={12} className="chain-node-spin" />,
    success: <LuCheck size={12} />,
    failed: <LuX size={12} />,
    skipped: <LuMinus size={12} />,
};

const BaseChainNode = ({ id, data, selected }) => {
    const nodeType = NODE_TYPES[data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;
    const status = data.status || 'pending';
    const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;
    const resultType = data.resultType;
    const resultSummary = data.resultSummary;
    const durationMs = data.durationMs;
    const disabled = !!data.disabled;
    // The result badge below (check/rows/table name) reflects whatever config
    // was in effect the last time this node actually ran — stale means the
    // config has since changed (here or upstream) and that badge is no longer
    // trustworthy (Fase 5 — H15 of the audit: "the interface was lying").
    const stale = !!data.stale && (status === 'success' || status === 'failed');

    const validationErrors = data.validationErrors || [];
    const validationWarnings = data.validationWarnings || [];
    const hasErrors = validationErrors.length > 0;
    const hasWarnings = validationWarnings.length > 0 && !hasErrors;

    const [showValidation, setShowValidation] = useState(false);
    const [hovered, setHovered] = useState(false);
    const showActionBar = (selected || hovered) && !data.isDragging;

    // The default node bg/border derive from --node-accent + the theme surfaces
    // in CSS (legible in both light and dark). These states override the border.
    let borderOverride = null;
    if (stale) borderOverride = 'var(--color-warning)';
    else if (status !== 'pending') borderOverride = statusColor.border;
    else if (hasErrors) borderOverride = 'var(--color-error)';
    else if (hasWarnings) borderOverride = 'var(--color-warning)';

    const act = (action) => (e) => {
        e.stopPropagation();
        data.onAction?.(action, id, { x: e.clientX, y: e.clientY });
    };

    return (
        <div
            className={`chain-node ${selected ? 'chain-node-selected' : ''} ${hasErrors ? 'chain-node-invalid' : ''} ${disabled ? 'chain-node-disabled' : ''}`}
            style={{
                '--node-accent': nodeType.color.accent,
                ...(borderOverride ? { '--node-border-override': borderOverride } : {}),
                '--status-bg': statusColor.bg,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); data.onAction?.('menu', id, { x: e.clientX, y: e.clientY }); }}
            onDoubleClick={(e) => { e.stopPropagation(); data.onAction?.('configure', id); }}
        >
            {showActionBar && (
                <div className="chain-node-actionbar" onClick={(e) => e.stopPropagation()}>
                    <button className="chain-node-actionbar-key" onClick={act('configure')} title="Configure this node">
                        <LuSlidersHorizontal size={11} /><span>Configure</span>
                    </button>
                    <span className="chain-node-actionbar-sep" />
                    <button onClick={act('run-to')} title="Run up to this node">
                        <LuChevronLeft size={11} /><span>To here</span>
                    </button>
                    <button onClick={act('run-from')} title="Run from this node forward">
                        <LuChevronRight size={11} /><span>From here</span>
                    </button>
                    <span className="chain-node-actionbar-sep" />
                    <button onClick={act('view-data')} title="View this node's data">
                        <LuEye size={11} />
                    </button>
                    <button onClick={act('menu')} title="More actions">
                        <LuEllipsis size={13} />
                    </button>
                </div>
            )}

            <Handle type="target" position={Position.Left} className="chain-handle" />

            {/* Header */}
            <div className="chain-node-header">
                <div className="chain-node-type-badge" style={{ backgroundColor: nodeType.color.accent }}>
                    <Icon size={10} />
                    <span>{nodeType.label}</span>
                </div>

                <div className="chain-node-header-right">
                    {disabled && (
                        <span className="chain-node-disabled-badge" title="Disabled — passes its input through unchanged">
                            <LuPause size={10} />
                        </span>
                    )}

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
                    {stale && (
                        <span className="chain-node-stale-badge" title="The configuration changed after this result — re-run to refresh it">
                            <LuHistory size={9} /><span>outdated</span>
                        </span>
                    )}
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
            {showActionBar && (
                <button
                    className="chain-node-quickadd"
                    onClick={act('quick-add')}
                    title="Add a step from here"
                    aria-label={`Add a step after ${data.label || nodeType.label}`}
                >
                    <LuPlus size={12} />
                </button>
            )}
        </div>
    );
};

export default memo(BaseChainNode);
