import { useEffect, useRef } from 'react';

/**
 * Escape cierra el diálogo de encima, y solo ese (Dec-88). Si hay dos abiertos,
 * el último en abrirse: la pila es de todos los que usan este gancho.
 *
 * El editor cerrando su búsqueda o sus sugerencias tiene preferencia porque corta
 * la propagación. No se mira `defaultPrevented`: Monaco lo deja puesto también
 * cuando no ha hecho nada con la tecla, y el plan de ejecución no se cerraba.
 */
const pila = [];

export function useEscape(alCerrar, activo = true) {
    const cerrarRef = useRef(alCerrar);
    cerrarRef.current = alCerrar;

    useEffect(() => {
        if (!activo) return undefined;
        const yo = {};
        pila.push(yo);
        const alPulsar = (e) => {
            if (e.key !== 'Escape' || pila[pila.length - 1] !== yo) return;
            e.preventDefault();
            cerrarRef.current?.();
        };
        // En captura no: el editor de dentro de un diálogo debe poder quedárselo.
        window.addEventListener('keydown', alPulsar);
        return () => {
            window.removeEventListener('keydown', alPulsar);
            const i = pila.indexOf(yo);
            if (i >= 0) pila.splice(i, 1);
        };
    }, [activo]);
}
