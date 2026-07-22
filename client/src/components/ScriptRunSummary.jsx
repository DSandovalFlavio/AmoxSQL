import { memo, useState } from 'react';
import {
    LuCheck, LuX, LuLoader, LuCircleSlash, LuChevronDown, LuChevronRight,
    LuListChecks,
} from 'react-icons/lu';
import { RESULT_TYPE_LABELS } from './chains/chainNodeTypes';

// Human label for a completed step, folding in the affected-row count / object
// name so a DML/DDL statement reads as "5 rows updated" / "Table created: t".
function labelFor(step) {
    const { resultType, rowsAffected, rowCount, truncated, details } = step;
    switch (resultType) {
        case 'rows_updated':
        case 'rows_inserted':
        case 'rows_deleted': {
            const verb = { rows_updated: 'updated', rows_inserted: 'inserted', rows_deleted: 'deleted' }[resultType];
            if (rowsAffected != null) return `${rowsAffected.toLocaleString()} row${rowsAffected === 1 ? '' : 's'} ${verb}`;
            return RESULT_TYPE_LABELS[resultType] || 'Done';
        }
        case 'table_created':  return details?.table ? `Table created: ${details.table}` : 'Table created';
        case 'view_created':   return details?.view ? `View created: ${details.view}` : 'View created';
        case 'table_dropped':  return details?.table ? `Table dropped: ${details.table}` : 'Table dropped';
        case 'view_dropped':   return details?.view ? `View dropped: ${details.view}` : 'View dropped';
        case 'extension_installed': return details?.extension ? `Extension installed: ${details.extension}` : 'Extension installed';
        case 'extension_loaded':    return details?.extension ? `Extension loaded: ${details.extension}` : 'Extension loaded';
        case 'file_exported':  return 'File exported';
        case 'query_result': {
            const n = rowCount ?? 0;
            return `${n.toLocaleString()}${truncated ? '+' : ''} row${n === 1 ? '' : 's'} returned`;
        }
        default: return RESULT_TYPE_LABELS[resultType] || 'Executed';
    }
}

const STATUS_ICON = {
    ok:        { Icon: LuCheck,       color: 'var(--color-success-text, #4ade80)' },
    error:     { Icon: LuX,           color: 'var(--color-error-text, #f87171)' },
    running:   { Icon: LuLoader,      color: 'var(--accent-primary, #22d3ee)', spin: true },
    cancelled: { Icon: LuCircleSlash, color: 'var(--text-tertiary, #8a8a93)' },
};

const ScriptRunSummary = ({ scriptRun }) => {
    const [collapsed, setCollapsed] = useState(false);
    if (!scriptRun || !Array.isArray(scriptRun.steps)) return null;

    const { steps, total, okCount = 0, failCount = 0, totalMs, running, cancelled, stoppedAtError } = scriptRun;

    const headerState = running
        ? 'Running…'
        : cancelled
            ? 'Cancelled'
            : stoppedAtError
                ? 'Stopped at error'
                : 'Completed';

    const headerColor = failCount > 0
        ? 'var(--color-error-text, #f87171)'
        : running
            ? 'var(--accent-primary, #22d3ee)'
            : 'var(--color-success-text, #4ade80)';

    return (
        <div style={{
            border: '1px solid var(--border-subtle, #33333c)',
            borderRadius: '8px',
            background: 'var(--surface-raised, #1a1a20)',
            margin: '8px',
            overflow: 'hidden',
            fontSize: '12px',
        }}>
            {/* Header */}
            <button
                onClick={() => setCollapsed(c => !c)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', background: 'transparent', border: 'none',
                    cursor: 'pointer', color: 'var(--text-primary, #bdbdc4)', textAlign: 'left',
                }}
            >
                {collapsed ? <LuChevronRight size={13} /> : <LuChevronDown size={13} />}
                <LuListChecks size={14} style={{ color: 'var(--accent-primary, #22d3ee)' }} />
                <span style={{ fontWeight: 600, color: 'var(--text-active, #e5e5e5)' }}>Script</span>
                <span style={{ color: headerColor, fontWeight: 500 }}>{headerState}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary, #8a8a93)', display: 'flex', gap: '10px' }}>
                    <span>{okCount}/{total ?? steps.length} ok{failCount > 0 ? ` · ${failCount} failed` : ''}</span>
                    {totalMs != null && <span>{totalMs} ms</span>}
                </span>
            </button>

            {/* Steps */}
            {!collapsed && (
                <div style={{ borderTop: '1px solid var(--border-subtle, #33333c)' }}>
                    {steps.map((step) => {
                        const { Icon, color, spin } = STATUS_ICON[step.status] || STATUS_ICON.running;
                        return (
                            <div key={step.index} style={{
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                padding: '8px 12px',
                                borderTop: step.index === 0 ? 'none' : '1px solid var(--border-subtle, #2a2a30)',
                            }}>
                                <Icon size={14} className={spin ? 'ext-spin' : ''} style={{ color, marginTop: '1px', flexShrink: 0 }} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <code style={{
                                        display: 'block',
                                        fontFamily: 'var(--font-mono, monospace)',
                                        color: 'var(--text-primary, #bdbdc4)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {step.sqlPreview}
                                    </code>
                                    {step.status === 'error' && step.error && (
                                        <div style={{
                                            marginTop: '4px', color: 'var(--color-error-text, #f87171)',
                                            fontFamily: 'var(--font-mono, monospace)', fontSize: '11px',
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        }}>
                                            {step.error}
                                        </div>
                                    )}
                                </div>
                                <div style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                                    gap: '2px', flexShrink: 0, color: 'var(--text-tertiary, #8a8a93)',
                                }}>
                                    {step.status === 'ok' && (
                                        <span style={{ color: 'var(--text-secondary, #9a9aa2)' }}>{labelFor(step)}</span>
                                    )}
                                    {step.ms != null && <span style={{ fontSize: '11px' }}>{step.ms} ms</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default memo(ScriptRunSummary);
