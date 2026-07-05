/**
 * Combobox — Filterable dropdown with free-text fallback.
 * The input text IS the value (controlled, no separate internal text state — so
 * reusing an instance across list rows can't leak stale text). Type to filter
 * `options`; pick a suggestion or type any value. The menu renders in a portal
 * with fixed positioning so it is never clipped by the scrolling config panel.
 *
 * options: array of strings, or { value, hint } objects (hint shown dimmed, e.g. a type).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const Combobox = ({ value = '', onChange, options = [], placeholder, className, onDrop, onDragOver, onDragLeave }) => {
    const [open, setOpen] = useState(false);
    const [rect, setRect] = useState(null);
    const inputRef = useRef(null);

    const norm = (options || [])
        .map(o => (typeof o === 'string' ? { value: o } : o))
        .filter(o => o && o.value !== undefined && o.value !== null && String(o.value).length > 0);
    const q = String(value || '').toLowerCase().trim();
    // When the value exactly matches an option, show the full list (lets the user re-pick);
    // otherwise filter by what's typed.
    const exact = norm.some(o => String(o.value).toLowerCase() === q);
    const filtered = (q && !exact)
        ? norm.filter(o => String(o.value).toLowerCase().includes(q) || (o.hint || '').toLowerCase().includes(q))
        : norm;

    const updateRect = useCallback(() => {
        if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    }, []);

    useEffect(() => {
        if (!open) return;
        updateRect();
        const reposition = () => updateRect();
        const onDown = (e) => {
            if (inputRef.current && inputRef.current.contains(e.target)) return;
            if (e.target.closest && e.target.closest('[data-combobox-menu]')) return;
            setOpen(false);
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        document.addEventListener('mousedown', onDown);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            document.removeEventListener('mousedown', onDown);
        };
    }, [open, updateRect]);

    const pick = (val) => { onChange(val); setOpen(false); };

    const menu = (open && rect && filtered.length > 0) ? createPortal(
        <div
            data-combobox-menu
            style={{
                position: 'fixed',
                top: rect.bottom + 3,
                left: rect.left,
                width: Math.max(rect.width, 220),
                maxHeight: 240, overflowY: 'auto', zIndex: 3000,
                background: 'var(--surface-overlay)',
                border: '1px solid var(--border-default)',
                borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: 4,
            }}
        >
            {filtered.slice(0, 100).map((o, i) => {
                const selected = String(o.value) === String(value);
                return (
                    <div
                        key={`${o.value}-${i}`}
                        onMouseDown={(e) => { e.preventDefault(); pick(String(o.value)); }}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            padding: '6px 9px', cursor: 'pointer', fontSize: 12.5, borderRadius: 5,
                            color: 'var(--text-active)',
                            background: selected ? 'var(--surface-raised)' : 'transparent',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = selected ? 'var(--surface-raised)' : 'transparent'; }}
                    >
                        <span style={{
                            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)',
                        }}>{o.value}</span>
                        {o.hint && (
                            <span style={{
                                flexShrink: 0, fontSize: 10, color: 'var(--text-muted)',
                                fontFamily: 'var(--font-mono)', opacity: 0.8,
                            }}>{o.hint}</span>
                        )}
                    </div>
                );
            })}
        </div>,
        document.body
    ) : null;

    return (
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <input
                ref={inputRef}
                type="text"
                className={className || 'chain-config-input'}
                value={value || ''}
                placeholder={placeholder}
                onFocus={() => { updateRect(); setOpen(true); }}
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                style={{ width: '100%' }}
            />
            {menu}
        </div>
    );
};

export default Combobox;
