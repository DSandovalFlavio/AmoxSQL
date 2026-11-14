import { useEffect, useRef } from 'react';

/**
 * Encuadra un lienzo UNA vez, cuando de verdad se puede (6.0, M10).
 *
 * Una pestaña restaurada se monta oculta: su lienzo mide 0 × 0 y el encuadre
 * falla. Sin reintento, al mostrarla se quedaba en zoom 1 y desplazamiento 0.
 * Aquí, si `encuadrar()` no puede todavía (devuelve false), se vuelve a probar
 * cada vez que el contenedor cambia de tamaño, hasta que lo consigue.
 *
 * @param {{current: HTMLElement|null}} ref  el contenedor del lienzo
 * @param {boolean} listo   hay algo que encuadrar y la vista ya existe (`viewportInitialized`:
 *                         antes, React Flow ignora `setViewport`)
 * @param {() => boolean} encuadrar  hace el encuadre; true si lo hizo
 */
export function useEncuadreInicial(ref, listo, encuadrar) {
    const hecho = useRef(false);
    const encuadrarRef = useRef(encuadrar);
    encuadrarRef.current = encuadrar;

    useEffect(() => {
        if (hecho.current || !listo || !ref.current) return undefined;
        const intentar = () => {
            if (hecho.current) return true;
            if (encuadrarRef.current()) hecho.current = true;
            return hecho.current;
        };
        if (intentar() || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => { if (intentar()) ro.disconnect(); });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [listo, ref]);
}
