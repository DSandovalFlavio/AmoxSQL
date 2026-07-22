/**
 * Story Flow — in-app guide + first-run tour.
 *
 * Single source of truth for the Story Flow explainer, reused by:
 *  - the "?" help drawer in the visualizer panel
 *  - Settings → Story Flow
 *  - the first-run tour carousel
 */
import { memo } from 'react';
import {
    LuChartColumn, LuDatabase, LuSettings2, LuPalette, LuPenLine, LuDownload,
    LuSparkles, LuExternalLink,
} from 'react-icons/lu';
import { Tour } from '../onboarding/Tour';

// Open an external URL through Electron's shell (falls back to a new tab in dev).
const STERLING_URL = 'https://github.com/LaMatemaga/sterling';
export const openSterling = (e) => {
    e?.preventDefault?.();
    if (window.electronAPI?.openExternal) window.electronAPI.openExternal(STERLING_URL);
    else window.open(STERLING_URL, '_blank', 'noopener,noreferrer');
};

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
        points: ['Palette + per-series colors', 'Gradient fill, card background, typography', 'Sterling editorial palettes, by La Matemaga'],
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
                    <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px', background: 'var(--panel-section-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-active)' }}>
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

        {/* Credit: the Sterling palette system + editorial ideas are by La Matemaga */}
        <div style={{
            marginTop: '18px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle, var(--border-color))',
            fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5,
        }}>
            The Sterling themes, editorial palettes and inline-legend idea are adapted from{' '}
            <a
                href={STERLING_URL}
                onClick={openSterling}
                style={{ color: 'var(--accent-color-user)', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
                Sterling by La Matemaga <LuExternalLink size={11} style={{ verticalAlign: '-1px' }} />
            </a>
            {' '}— an open-source (MIT) editorial figure system. Thank you. ✦
        </div>
    </div>
));
StoryFlowGuide.displayName = 'StoryFlowGuide';

// ─── First-run tour (carousel) — renders through the shared primitive ──
export const StoryFlowTour = memo(({ isOpen, onClose }) => (
    <Tour
        isOpen={isOpen}
        onClose={onClose}
        steps={STORY_FLOW_STAGES}
        brandIcon={LuSparkles}
        brandLabel="Story Flow"
        doneLabel="Done"
    />
));
StoryFlowTour.displayName = 'StoryFlowTour';
