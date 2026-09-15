/**
 * Deshacer y rehacer en todo el Studio.
 *
 * Fase 5 del rediseño. Hasta ahora no había ninguno: cambiar la disposición de
 * una lámina por error, o borrar una figura, o tocar un acento, no tenía vuelta
 * atrás más que reescribiéndolo a mano.
 *
 * **El estado es el archivo entero**, así que el historial es una pila de
 * cadenas y no un registro de operaciones. Eso lo hace barato —un `.amoxdeck`
 * son seis kilobytes— y, sobre todo, lo hace correcto sin esfuerzo: no hay que
 * escribir la inversa de cada acción, que es donde estos sistemas se rompen
 * cuando alguien añade la acción número once y se olvida de su inversa.
 *
 * Dos cosas que no son obvias:
 *
 * 1. **La vista Source no pasa por aquí.** Monaco tiene su propio historial por
 *    pulsación, y encima del nuestro daría dos deshaceres peleándose: el
 *    primero devolvería una letra y el segundo el documento entero.
 * 2. **Mientras se escribe en una región manda el `textarea`.** Su deshacer
 *    nativo es el que espera quien está tecleando; el nuestro sólo entra cuando
 *    el foco no está en un cuadro de texto. Sin esa comprobación, `Ctrl+Z` a
 *    media frase tiraba la lámina entera.
 */
import { useCallback, useState } from 'react';

/** Cuántos pasos se recuerdan. Cincuenta ediciones de un deck son de sobra. */
const TOPE = 50;

/**
 * Las dos pilas van en estado y no en `ref`, aunque un `ref` parezca lo natural
 * para algo que «no se pinta». Sí se pinta: de su longitud sale si los botones
 * de deshacer y rehacer están activos, y leer un `ref` durante el render da un
 * valor que React no garantiza — lo señaló el linter. Y no cuesta nada: las
 * pilas sólo cambian cuando hay una escritura, que ya provoca repintado.
 */
export function useHistorial(content, onChange) {
    const [pasado, setPasado] = useState([]);
    const [futuro, setFuturo] = useState([]);

    /**
     * Toda escritura del Studio pasa por aquí. Guarda lo que había y escribe lo
     * nuevo; rehacer se pierde, que es lo que espera cualquiera que edite
     * después de deshacer.
     */
    const escribir = useCallback((siguiente) => {
        if (siguiente === content) return;
        setPasado((p) => [...p, content].slice(-TOPE));
        setFuturo([]);
        onChange(siguiente);
    }, [content, onChange]);

    const deshacer = useCallback(() => {
        if (!pasado.length) return;
        const previo = pasado[pasado.length - 1];
        setPasado((p) => p.slice(0, -1));
        setFuturo((f) => [content, ...f].slice(0, TOPE));
        onChange(previo);
    }, [content, onChange, pasado]);

    const rehacer = useCallback(() => {
        if (!futuro.length) return;
        const siguiente = futuro[0];
        setFuturo((f) => f.slice(1));
        setPasado((p) => [...p, content].slice(-TOPE));
        onChange(siguiente);
    }, [content, onChange, futuro]);

    return {
        escribir,
        deshacer,
        rehacer,
        puedeDeshacer: pasado.length > 0,
        puedeRehacer: futuro.length > 0,
    };
}

/**
 * ¿Esta pulsación es para el historial del Studio?
 *
 * `false` mientras el foco está en un cuadro de texto: ahí manda el deshacer
 * nativo del navegador, que es el que espera quien está tecleando.
 */
export function esAtajoDeHistorial(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
    const enTexto = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
    if (enTexto) return null;
    const k = (e.key || '').toLowerCase();
    if (k === 'z' && !e.shiftKey) return 'deshacer';
    if ((k === 'z' && e.shiftKey) || k === 'y') return 'rehacer';
    return null;
}
