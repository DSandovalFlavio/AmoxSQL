/**
 * AI Modes — in-app guide + first-run tour.
 *
 * Single source of truth for explaining the two AI modes (Assist & Deep Dive),
 * reused by:
 *  - the "?" help button in the AI panel headers (AiModesGuideModal)
 *  - the first-run tour carousel (AiModesTour)
 */
import { memo } from 'react';
import { LuBot, LuCompass, LuSparkles, LuLightbulb } from 'react-icons/lu';
import { Tour, GuideModal } from '../onboarding/Tour';

// ─── Content (the two modes) ─────────────────────────────────
export const AI_MODES = [
    {
        key: 'assist', icon: LuBot, title: 'Assist', tagline: 'Your copilot in the editor',
        headline: 'A pair-analyst at your side',
        desc: 'Lives in the sidebar, bound to the file you have open. Reactive and compact — you drive, it helps.',
        points: [
            'Generate, fix or explain the current query',
            'Build and apply a chart for the result',
            'Quick, conversational answers · toggle with Ctrl+L',
        ],
        examples: ['Explain this query', 'Chart this result by region', 'Why is this returning 0 rows?'],
        when: 'Use it while you\'re writing SQL or tweaking a chart and want a hand.',
    },
    {
        key: 'dive', icon: LuCompass, title: 'Deep Dive', tagline: 'Your autonomous analyst',
        headline: 'Delegate the whole question',
        desc: 'A full-screen analyst over your entire local database. It plans, explores on its own, narrates findings, and can save a notebook.',
        points: [
            'Plans steps and explores proactively',
            'Narrated analysis with charts',
            'Can build a .sqlnb report from the analysis',
        ],
        examples: ['Why did sales drop in Q3?', 'Find the top drivers of churn', 'Give me an overview of this dataset'],
        when: 'Use it when you have a business question and want the whole analysis done for you.',
    },
];

// ─── Reference guide (used by the ? modal) ───────────────────
export const AiModesGuide = memo(() => (
    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>
            AmoxSQL's AI comes in two modes — same engine, different autonomy and scope.
            One works alongside you while you edit; the other runs the analysis for you.
        </p>

        {AI_MODES.map((m, i) => {
            const Icon = m.icon;
            return (
                <div key={m.key} style={{ display: 'flex', gap: '12px', padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-color)' }}>
                    <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px', background: 'var(--panel-section-bg, var(--bg-tertiary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-active)' }}>
                        <Icon size={15} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-active)' }}>{m.title}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{m.tagline}</span>
                        </div>
                        <div style={{ marginTop: '2px' }}>{m.desc}</div>
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            {m.points.map((p, j) => <li key={j} style={{ marginBottom: '2px' }}>{p}</li>)}
                        </ul>
                        <div style={{ marginTop: '6px', fontSize: '12px' }}>
                            <span style={{ color: 'var(--text-active)', fontWeight: 600 }}>When: </span>{m.when}
                        </div>
                        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                            {m.examples.map((ex, j) => (
                                <span key={j} style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--panel-section-bg, var(--hover-bg))', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '2px 9px' }}>{ex}</span>
                            ))}
                        </div>
                    </div>
                </div>
            );
        })}

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', padding: '10px', background: 'var(--panel-section-bg, var(--hover-bg))', borderRadius: '8px' }}>
            <LuLightbulb size={15} style={{ flexShrink: 0, color: 'var(--text-active)', marginTop: '1px' }} />
            <div style={{ fontSize: '12px' }}>
                <strong style={{ color: 'var(--text-active)' }}>Rule of thumb:</strong> Assist while you work; Deep Dive when you want work done.
                You can promote an Assist chat to Deep Dive anytime with the ↗ button.
            </div>
        </div>
    </div>
));
AiModesGuide.displayName = 'AiModesGuide';

// ─── Guide modal (the ? button opens this) — shared primitive ──
export const AiModesGuideModal = memo(({ isOpen, onClose }) => (
    <GuideModal isOpen={isOpen} onClose={onClose} title="The two AI modes" icon={LuSparkles}>
        <AiModesGuide />
    </GuideModal>
));
AiModesGuideModal.displayName = 'AiModesGuideModal';

// ─── First-run tour (carousel) — renders through the shared primitive ──
export const AiModesTour = memo(({ isOpen, onClose }) => (
    <Tour
        isOpen={isOpen}
        onClose={onClose}
        steps={AI_MODES}
        brandIcon={LuSparkles}
        brandLabel="Meet the AI"
        doneLabel="Got it"
    />
));
AiModesTour.displayName = 'AiModesTour';
