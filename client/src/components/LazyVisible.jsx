import { useEffect, useRef, useState } from 'react';

/**
 * LazyVisible — mounts its children the first time the placeholder scrolls
 * near the viewport, then keeps them mounted forever (mount-once: no unmount
 * on scroll-out, so editor cursors, chart state, etc. are never destroyed).
 *
 * This is deliberate lazy-mount-by-visibility, NOT list virtualization
 * (which is vetoed in this repo): there is no windowing and no synthetic
 * scrolling — offscreen heavy content (Monaco instances, Recharts charts,
 * result tables) simply waits to mount until it is about to be seen.
 *
 * @param {number|string} height  Placeholder height while unmounted.
 * @param {boolean} force         Render immediately (print/report/export paths).
 */
const LazyVisible = ({ height, force = false, rootMargin = '400px', children }) => {
    const [visible, setVisible] = useState(force);
    const ref = useRef(null);

    useEffect(() => {
        if (visible || force) return;
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }
        const obs = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                setVisible(true);
                obs.disconnect();
            }
        }, { rootMargin });
        obs.observe(el);
        return () => obs.disconnect();
    }, [visible, force, rootMargin]);

    if (visible || force) return children;
    return <div ref={ref} style={{ height, minHeight: 40 }} />;
};

export default LazyVisible;
