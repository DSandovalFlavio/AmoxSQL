import { memo, useState } from 'react';
import {
    LuCheck, LuX, LuLoader, LuCircleSlash, LuChevronDown, LuChevronRight,
    LuListChecks,
} from 'react-icons/lu';
import { describeResult } from '../utils/resultSummary';

const STATUS_ICON = {
    ok:        { Icon: LuCheck,       color: 'var(--color-success-text, #4ade80)' },
    error:     { Icon: LuX,           color: 'var(--color-error-text, #f87171)' },
    running:   { Icon: LuLoader,      color: 'var(--accent-primary, #22d3ee)', spin: true },
    cancelled: { Icon: LuCircleSlash, color: 'var(--text-tertiary, #8a8a93)' },
};

// compact=true when a final table is shown below the summary: the summary then
// keeps its natural height (never squished by the growing table) and caps its
// step list to a small scroller. compact=false (summary is the only result):
// it fills the pane and scrolls.
const ScriptRunSummary = ({ scriptRun, compact = false }) => {
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
            display: 'flex',
            flexDirection: 'column',
            // With a table below (compact): never shrink — keep natural height so
            // the growing table can't squish the summary to a sliver.
            // Alone: fill the fixed-height pane and let the steps scroll (an
            // auto-height notebook parent ignores the % cap and grows naturally).
            ...(compact
                ? { flexShrink: 0 }
                : { flex: '1 1 auto', minHeight: 0, maxHeight: 'calc(100% - 16px)' }),
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

            {/* Steps — scroll internally when the run is long; header stays put */}
            {!collapsed && (
                <div style={{
                    borderTop: '1px solid var(--border-subtle, #33333c)',
                    overflowY: 'auto',
                    // compact: a small scroller above the table. alone: fill + scroll.
                    ...(compact
                        ? { maxHeight: '30vh' }
                        : { flex: '1 1 auto', minHeight: 0 }),
                }}>
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
                                        <span style={{ color: 'var(--text-secondary, #9a9aa2)' }}>{describeResult(step)}</span>
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
