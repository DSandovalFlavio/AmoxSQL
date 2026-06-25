/**
 * AI Modes — in-app guide + first-run tour.
 *
 * Single source of truth for explaining the two AI modes (Assist & Deep Dive),
 * reused by:
 *  - the "?" help button in the AI panel headers (AiModesGuideModal)
 *  - the first-run tour carousel (AiModesTour)
 */
import { memo, useState, useEffect } from 'react';
import { LuBot, LuCompass, LuSparkles, LuArrowRight, LuX, LuLightbulb } from 'react-icons/lu';

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

// ─── Guide modal (the ? button opens this) ───────────────────
export const AiModesGuideModal = memo(({ isOpen, onClose }) => {
    if (!isOpen) return null;
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', width: '100%', maxWidth: '540px', maxHeight: '80vh', overflowY: 'auto', padding: '22px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '14px', fontWeight: 600, color: 'var(--text-active)' }}>
                        <LuSparkles size={15} /> The two AI modes
                    </span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><LuX size={16} /></button>
                </div>
                <AiModesGuide />
            </div>
        </div>
    );
});
AiModesGuideModal.displayName = 'AiModesGuideModal';

// ─── First-run tour (carousel) ───────────────────────────────
export const AiModesTour = memo(({ isOpen, onClose }) => {
    const [step, setStep] = useState(0);
    useEffect(() => { if (isOpen) setStep(0); }, [isOpen]);
    if (!isOpen) return null;

    const s = AI_MODES[step];
    const Icon = s.icon;
    const last = step === AI_MODES.length - 1;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '14px', width: '100%', maxWidth: '520px', padding: '22px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <LuSparkles size={13} /> Meet the AI
                        <span style={{ background: 'var(--accent-subtle, rgba(94,106,210,0.18))', color: 'var(--accent-color-user, #8b93e6)', fontSize: '10px', padding: '1px 7px', borderRadius: '20px' }}>New</span>
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{step + 1} of {AI_MODES.length}</span>
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <Icon size={14} /> {s.title} — {s.tagline}
                </div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-active)', marginBottom: '6px' }}>{s.headline}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '10px' }}>{s.desc}</div>
                <div style={{ fontSize: '12px', marginBottom: '12px' }}><span style={{ color: 'var(--text-active)', fontWeight: 600 }}>When: </span>{s.when}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '16px' }}>
                    {s.examples.map((ex, j) => (
                        <span key={j} style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--panel-section-bg, var(--hover-bg))', border: '1px solid var(--border-color)', borderRadius: '20px', padding: '2px 9px' }}>{ex}</span>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                    {AI_MODES.map((_, i) => (
                        <span key={i} style={{ height: '6px', flex: 1, borderRadius: '3px', background: i === step ? 'var(--accent-color-user, var(--text-active))' : 'var(--border-color)' }} />
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}>Skip</button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {step > 0 && (
                            <button onClick={() => setStep(step - 1)} style={{ background: 'var(--bg-tertiary, var(--panel-section-bg))', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Back</button>
                        )}
                        <button onClick={() => (last ? onClose() : setStep(step + 1))} style={{ background: 'var(--accent-color-user, #5E6AD2)', border: 'none', color: 'var(--button-text-color, #fff)', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            {last ? 'Got it' : 'Next'} {!last && <LuArrowRight size={13} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
AiModesTour.displayName = 'AiModesTour';
