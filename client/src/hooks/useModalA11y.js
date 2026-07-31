import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalA11y(ref, onClose) {
    // Callers almost always pass an inline arrow, which is a new function every
    // render. Keeping it in the dep array re-ran this effect on EVERY render and
    // re-focused the first focusable element — which scrolls it into view, so
    // any state change inside a tall modal yanked the scroll back to the top.
    // Hold it in a ref so the effect only runs when the element itself changes.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    useEffect(() => {
        const el = ref?.current;
        if (!el) return;

        // Focus first focusable element (once, on open)
        const focusable = el.querySelectorAll(FOCUSABLE);
        if (focusable.length) focusable[0].focus();

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current?.(); return; }
            if (e.key !== 'Tab') return;
            const focusableEls = el.querySelectorAll(FOCUSABLE);
            if (!focusableEls.length) return;
            const first = focusableEls[0];
            const last = focusableEls[focusableEls.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };

        el.addEventListener('keydown', handleKeyDown);
        return () => el.removeEventListener('keydown', handleKeyDown);
    }, [ref]);

    return {
        dialogProps: { role: 'dialog', 'aria-modal': 'true', tabIndex: -1 }
    };
}
