import { memo } from 'react';

/**
 * Inline legend — concept adopted from Sterling (MIT) © La Matemaga
 * (https://github.com/LaMatemaga/sterling): instead of a detached box, the
 * legend lives INSIDE the subtitle sentence, woven with Intl.ListFormat
 * ("comparing ●North, ●South and ●West"). Each item pairs a small SVG mark —
 * the shape cycles per series as a redundant cue beyond color — with its label
 * in the palette's legend-text twin when available.
 */

const SHAPES = ['circle', 'square', 'triangle', 'line'];

const Mark = ({ shape }) => {
    if (shape === 'square') return <rect x="2" y="2" width="8" height="8" rx="1" />;
    if (shape === 'triangle') return <path d="M 6 1 L 11 10 L 1 10 Z" />;
    if (shape === 'line') return <path d="M 1 6 H 11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />;
    return <circle cx="6" cy="6" r="4.5" />;
};

const InlineLegend = ({ items, fontSize = 14 }) => {
    if (!items || items.length === 0) return null;

    let parts;
    try {
        parts = new Intl.ListFormat(undefined, { style: 'long', type: 'conjunction' })
            .formatToParts(items.map(item => item.label));
    } catch {
        // Environments without Intl.ListFormat: join with commas
        parts = items.flatMap((item, i) => (
            i === 0 ? [{ type: 'element', value: item.label }]
                : [{ type: 'literal', value: ', ' }, { type: 'element', value: item.label }]
        ));
    }

    let itemIndex = 0;
    return (
        <span style={{ whiteSpace: 'normal' }}>
            {parts.map((part, i) => {
                if (part.type !== 'element') {
                    return <span key={`lit-${i}`}>{part.value}</span>;
                }
                const item = items[itemIndex++];
                const shape = SHAPES[(item.shapeIndex ?? 0) % SHAPES.length];
                return (
                    <span
                        key={`${item.label}-${i}`}
                        style={{
                            display: 'inline-flex', alignItems: 'baseline', gap: '0.3em',
                            color: item.textColor || 'var(--text-primary)',
                            fontWeight: 600, whiteSpace: 'nowrap',
                        }}
                    >
                        <svg
                            viewBox="0 0 12 12" aria-hidden="true" focusable="false"
                            style={{
                                width: `${Math.round(fontSize * 0.72)}px`,
                                height: `${Math.round(fontSize * 0.72)}px`,
                                position: 'relative', top: '0.08em',
                                color: item.color, fill: 'currentColor', overflow: 'visible',
                                flexShrink: 0,
                            }}
                        >
                            <Mark shape={shape} />
                        </svg>
                        <span>{item.label}</span>
                    </span>
                );
            })}
        </span>
    );
};

export default memo(InlineLegend);
