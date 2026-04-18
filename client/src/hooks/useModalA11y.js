import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useModalA11y(ref, onClose) {
    useEffect(() => {
        const el = ref?.current;
        if (!el) return;

        // Focus first focusable element
        const focusable = el.querySelectorAll(FOCUSABLE);
        if (focusable.length) focusable[0].focus();

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
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
    }, [ref, onClose]);

    return {
        dialogProps: { role: 'dialog', 'aria-modal': 'true', tabIndex: -1 }
    };
}
