/**
 * Story Flow — in-app guide + first-run tour.
 *
 * Single source of truth for the Story Flow explainer, reused by:
 *  - the "?" help drawer in the visualizer panel
 *  - Settings → Story Flow
 *  - the first-run tour carousel
 */
import { memo, useState, useEffect } from 'react';
import {
    LuChartColumn, LuDatabase, LuSettings2, LuPalette, LuPenLine, LuDownload,
    LuSparkles, LuArrowRight,
} from 'react-icons/lu';

// ─── Content (the 6 stages) ──────────────────────────────────
export const STORY_FLOW_STAGES = [
    {
        key: 'type', icon: LuChartColumn, title: 'Type', tagline: 'What shape tells the story?',
        headline: 'Start with the right shape',
        desc: 'Pick the chart by what you want to communicate, not by geometry.',
        points: ['Grouped by intent: Compare, Trend, Composition, Relationship, Flow', 'Bar, line, area, donut, pie, scatter, combo, funnel, waterfall…'],
    },
    {
        key: 'data', icon: LuDatabase, title: 'Data', tagline: 'What goes where?',
        headline: 'Connect data to channels',
        desc: 'Map your columns onto channels and shape what gets plotted.',
        points: ['Channels: X, Y, Color/Split, Size, secondary axis', 'Sort, Top-N, date aggregation'],
    },
    {
        key: 'format', icon: LuSettings2, title: 'Format', tagline: 'Make it readable',
        headline: 'Make the numbers easy to read',
        desc: 'The mechanics that keep values legible.',
        points: ['Axes, number format, grid & legend', 'Data labels, rich tooltips, label size & rotation'],
    },
    {
        key: 'style', icon: LuPalette, title: 'Style', tagline: 'Make it look good',
        headline: 'Give it a clean visual identity',
        desc: 'The look and feel of the chart.',
        points: ['Palette + per-series colors', 'Gradient fill, card background, typography'],
    },
    {
        key: 'story', icon: LuPenLine, title: 'Story', tagline: 'Make it speak',
        headline: 'Turn a chart into an insight',
        desc: 'The narrative layer that makes a reader get the point in seconds.',
        points: ['Headline KPI + delta, takeaway block', 'Annotations, goal/reference lines, highlight'],
    },
    {
        key: 'export', icon: LuDownload, title: 'Export', tagline: 'Ship it',
        headline: 'Send it where it’s needed',
        desc: 'Get the chart out in the right format and size.',
        points: ['Social / slide size presets', 'PNG, copy to clipboard, save as .amoxvis'],
    },
];

export const STORY_FLOW_PRINCIPLES = [
    { title: 'A headline that states, not describes', desc: '“South leads with 16% of sales”, not “Sales by region”.' },
    { title: 'One message per chart', desc: 'Highlight what matters and let the rest recede.' },
    { title: 'Annotate the moment that matters', desc: 'Call out the spike or event — not every point.' },
    { title: 'Context in the number', desc: 'Always pair a value with its change or comparison.' },
];

// ─── Reference guide (used by the ? drawer and Settings) ──────
export const StoryFlowGuide = memo(() => (
    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>
            Story Flow organizes chart editing as the natural sequence of telling a story with
            data — six stages, left to right. Each tab does one job, so the steps stay obvious.
        </p>

        {STORY_FLOW_STAGES.map((s, i) => {
            const Icon = s.icon;
            return (
                <div key={s.key} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-color)' }}>
                    <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px', background: 'var(--panel-section-bg, var(--bg-tertiary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-active)' }}>
                        <Icon size={15} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-active)' }}>{i + 1}. {s.title}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{s.tagline}</span>
                        </div>
                        <div style={{ marginTop: '2px' }}>{s.desc}</div>
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            {s.points.map((p, j) => <li key={j} style={{ marginBottom: '2px' }}>{p}</li>)}
                        </ul>
                    </div>
                </div>
            );
        })}

        <h3 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-active)', margin: '18px 0 8px' }}>
            Storytelling principles
        </h3>
        {STORY_FLOW_PRINCIPLES.map((p, i) => (
            <div key={i} style={{ marginBottom: '8px' }}>
                <div style={{ color: 'var(--text-active)', fontWeight: 600, fontSize: '12.5px' }}>{p.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.desc}</div>
            </div>
        ))}
    </div>
));
StoryFlowGuide.displayName = 'StoryFlowGuide';

// ─── First-run tour (carousel) ───────────────────────────────
export const StoryFlowTour = memo(({ isOpen, onClose }) => {
    const [step, setStep] = useState(0);
    useEffect(() => { if (isOpen) setStep(0); }, [isOpen]);
    if (!isOpen) return null;

    const stages = STORY_FLOW_STAGES;
    const s = stages[step];
    const Icon = s.icon;
    const last = step === stages.length - 1;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', width: '100%', maxWidth: '520px', padding: '22px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <LuSparkles size={13} /> Story Flow
                        <span style={{ background: 'var(--accent-subtle, rgba(94,106,210,0.18))', color: 'var(--accent-color-user, #8b93e6)', fontSize: '10px', padding: '1px 7px', borderRadius: '20px' }}>New</span>
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Step {step + 1} of {stages.length}</span>
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <Icon size={14} /> {s.title} — {s.tagline}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-active)', marginBottom: '6px' }}>{s.headline}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '12px' }}>{s.desc}</div>
                <ul style={{ margin: '0 0 16px 0', paddingLeft: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    {s.points.map((p, j) => <li key={j} style={{ marginBottom: '3px' }}>{p}</li>)}
                </ul>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                    {stages.map((_, i) => (
                        <span key={i} style={{ height: '6px', flex: 1, borderRadius: '3px', background: i === step ? 'var(--accent-color-user, var(--text-active))' : 'var(--border-color)' }} />
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>Skip tour</button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {step > 0 && (
                            <button onClick={() => setStep(step - 1)} style={{ background: 'var(--bg-tertiary, var(--panel-section-bg))', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Back</button>
                        )}
                        <button onClick={() => (last ? onClose() : setStep(step + 1))} style={{ background: 'var(--accent-color-user, #5E6AD2)', border: 'none', color: 'var(--button-text-color, #fff)', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            {last ? 'Done' : 'Next'} {!last && <LuArrowRight size={13} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
StoryFlowTour.displayName = 'StoryFlowTour';
