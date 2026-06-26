/**
 * OnboardingHost — mounted once near the app root.
 *
 * Owns ALL tour rendering so any tour can be opened or replayed from anywhere
 * (a feature's first-run, the Command Palette, Settings) regardless of which
 * view is currently mounted. Features call openTour(id); this listens and
 * renders the shared <Tour>, persisting "seen" on close.
 *
 * Tours are queued, not overwritten: if several first-run effects fire at once
 * (e.g. the global welcome plus a panel that mounts), they play one after the
 * other instead of clobbering each other.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Tour } from './Tour';
import { TOURS, OPEN_TOUR_EVENT, getTour, markTourSeen } from './tourRegistry';

export default function OnboardingHost() {
    const [queue, setQueue] = useState([]);     // array of tour ids; queue[0] is active
    const shownThisSession = useRef(new Set());  // avoid re-queuing the same tour repeatedly

    const enqueue = useCallback((id) => {
        if (!getTour(id)) return;
        setQueue((q) => {
            if (shownThisSession.current.has(id) || q.includes(id)) return q;
            shownThisSession.current.add(id);
            return [...q, id];
        });
    }, []);

    useEffect(() => {
        const onOpen = (e) => enqueue(e?.detail?.id);
        window.addEventListener(OPEN_TOUR_EVENT, onOpen);

        // Bridge legacy per-feature replay events (e.g. Settings buttons) so
        // they work globally even when the owning view isn't mounted. A replay
        // is explicit user intent, so clear the session guard to allow re-show.
        const legacyHandlers = TOURS
            .filter((t) => t.legacyReplayEvent)
            .map((t) => {
                const handler = () => { shownThisSession.current.delete(t.id); enqueue(t.id); };
                window.addEventListener(t.legacyReplayEvent, handler);
                return [t.legacyReplayEvent, handler];
            });

        return () => {
            window.removeEventListener(OPEN_TOUR_EVENT, onOpen);
            legacyHandlers.forEach(([evt, handler]) => window.removeEventListener(evt, handler));
        };
    }, [enqueue]);

    const handleClose = useCallback(() => {
        setQueue((q) => {
            if (q[0]) markTourSeen(q[0]);
            return q.slice(1);
        });
    }, []);

    const tour = queue[0] ? getTour(queue[0]) : null;
    if (!tour) return null;

    return (
        <Tour
            key={tour.id}
            isOpen
            onClose={handleClose}
            steps={tour.steps}
            brandIcon={tour.brandIcon}
            brandLabel={tour.brandLabel}
            doneLabel={tour.doneLabel}
        />
    );
}
