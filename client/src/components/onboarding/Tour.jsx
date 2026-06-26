/**
 * Tour — the single reusable first-run carousel.
 *
 * Every studio's first-run tour (Story Flow, Data Flow, AI Modes, Notebooks…)
 * renders through this one component, so they all look and behave identically.
 * Callers supply only content (`steps`) + branding; layout, motion, keyboard
 * navigation and accessibility live here.
 *
 * Step shape (all fields optional except headline):
 *   { icon, title, tagline, headline, desc, points?: string[],
 *     when?: string, examples?: string[] }
 */
import { memo, useState, useEffect, useCallback } from 'react';
import { LuArrowRight, LuX } from 'react-icons/lu';
import './onboarding.css';

export const Tour = memo(({
    isOpen,
    onClose,
    steps = [],
    brandIcon: BrandIcon,
    brandLabel,
    badge = 'New',
    doneLabel = 'Done',
}) => {
    const [step, setStep] = useState(0);
    useEffect(() => { if (isOpen) setStep(0); }, [isOpen]);

    const total = steps.length;
    const last = step === total - 1;
    const go = useCallback((next) => {
        setStep((s) => Math.max(0, Math.min(total - 1, next)));
    }, [total]);

    // Keyboard: Esc closes, ←/→ navigate, Enter advances.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
            else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); last ? onClose?.() : go(step + 1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, step, last, go, onClose]);

    if (!isOpen || total === 0) return null;

    const s = steps[step];
    const StepIcon = s.icon;

    return (
        <div className="ob-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={brandLabel}>
            <div className="ob-panel" onClick={(e) => e.stopPropagation()}>
                <div className="ob-head">
                    <span className="ob-brand">
                        {BrandIcon && <BrandIcon size={13} />} {brandLabel}
                        {badge && <span className="ob-badge">{badge}</span>}
                    </span>
                    <span className="ob-counter">{step + 1} / {total}</span>
                </div>

                {(StepIcon || s.title || s.tagline) && (
                    <div className="ob-eyebrow">
                        {StepIcon && <StepIcon size={14} />}
                        {s.title}{s.title && s.tagline ? ' — ' : ''}{s.tagline}
                    </div>
                )}
                <div className="ob-headline">{s.headline}</div>
                {s.desc && <div className="ob-desc">{s.desc}</div>}

                {s.when && (
                    <div className="ob-when"><strong>When: </strong>{s.when}</div>
                )}

                {s.points?.length > 0 && (
                    <ul className="ob-points">
                        {s.points.map((p, j) => <li key={j}>{p}</li>)}
                    </ul>
                )}

                {s.examples?.length > 0 && (
                    <div className="ob-chips">
                        {s.examples.map((ex, j) => <span key={j} className="ob-chip">{ex}</span>)}
                    </div>
                )}

                <div className="ob-progress">
                    {steps.map((_, i) => (
                        <span
                            key={i}
                            className={`ob-progress-seg${i === step ? ' ob-progress-seg--active' : ''}`}
                            onClick={() => go(i)}
                            aria-label={`Go to step ${i + 1}`}
                        />
                    ))}
                </div>

                <div className="ob-foot">
                    <button className="ob-btn ob-btn--ghost" onClick={onClose}>Skip</button>
                    <div className="ob-actions">
                        {step > 0 && (
                            <button className="ob-btn ob-btn--secondary" onClick={() => go(step - 1)}>Back</button>
                        )}
                        <button className="ob-btn ob-btn--primary" onClick={() => (last ? onClose() : go(step + 1))}>
                            {last ? doneLabel : 'Next'} {!last && <LuArrowRight size={13} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
Tour.displayName = 'Tour';

/**
 * GuideModal — the reusable scrollable modal the "?" buttons open.
 * Wraps any reference-guide content with a consistent header + close.
 */
export const GuideModal = memo(({ isOpen, onClose, title, icon: Icon, children }) => {
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return (
        <div className="ob-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
            <div className="ob-panel ob-panel--guide" onClick={(e) => e.stopPropagation()}>
                <div className="ob-head">
                    <span className="ob-guide-title">{Icon && <Icon size={15} />} {title}</span>
                    <button className="ob-close" onClick={onClose} aria-label="Close"><LuX size={16} /></button>
                </div>
                <div className="ob-guide-body">{children}</div>
            </div>
        </div>
    );
});
GuideModal.displayName = 'GuideModal';
