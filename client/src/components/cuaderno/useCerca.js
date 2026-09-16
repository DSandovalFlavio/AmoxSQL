import { useEffect, useState } from 'react';

/**
 * ¿Está este elemento cerca de lo que se ve?
 *
 * ## Por qué hace falta
 *
 * Un cuaderno de treinta celdas monta **treinta editores de código** y treinta
 * tablas de resultado con su motor de gráficos detrás. Medido: dieciséis celdas
 * de SQL son dieciséis instancias de Monaco antes de tocar nada. Con eso el
 * desplazamiento se arrastra, y no por culpa de ninguna celda en concreto.
 *
 * ## Por qué esto NO es virtualizar una lista
 *
 * El proyecto prohíbe la virtualización de listas y tablas, y con razón: mide
 * alturas, las estima mal, y el desplazamiento acaba dando saltos.
 *
 * Aquí no se mide nada. **La celda de SQL tiene un alto fijo**, así que su
 * hueco existe y ocupa exactamente lo mismo esté montada o no: el contenedor de
 * desplazamiento no cambia de tamaño jamás y la barra no se mueve. Lo único que
 * se aplaza es *el contenido de una caja que ya está dibujada*. Es el premio de
 * haber fijado la altura.
 *
 * ## Y una vez montada, NO se desmonta
 *
 * Esto es un cambio de opinión, y viene de usarlo. Desmontar al alejarse
 * parecía la mitad simétrica del truco, y es la que lo estropeaba: bajar por el
 * cuaderno destruía el editor y el gráfico de cada celda que quedaba atrás y los
 * volvía a construir al subir. Medido sobre dieciséis celdas, un recorrido
 * entero bloqueaba el hilo principal **1,5–2 s, y otro tanto en cada pasada**,
 * porque nunca se aprovechaba nada de lo ya hecho. Con el pestillo puesto, la
 * tercera pasada bloquea 272 ms.
 *
 * Construir una celda cuesta; tenerla construida, no. El desmontaje no ahorraba
 * trabajo: lo repetía.
 *
 * ## El margen
 *
 * Dos pantallas por arriba y por abajo. Bastante para que lo que entra ya esté
 * montado antes de verse, y poco para que no haya más de un puñado a la vez.
 *
 * @param {object} ref referencia al elemento que se vigila
 * @param {boolean} [siempre] si es cierto, se da por cerca y no se observa nada
 */
export function useCerca(ref, siempre = false) {
    /**
     * Empieza en `false` y el observador lo pone en `true` **una sola vez**.
     *
     * Sin observador —o sin elemento— se queda en `true`: peor de rendimiento,
     * pero nunca una celda en blanco. Ese caso se resuelve aquí, en el valor
     * inicial, y no dentro del efecto: llamar a `setState` en el cuerpo de un
     * efecto encadena pintados, que es justo lo que este gancho viene a evitar.
     */
    const hayObservador = typeof IntersectionObserver !== 'undefined';
    const [cerca, setCerca] = useState(!hayObservador);

    useEffect(() => {
        if (siempre || !hayObservador) return undefined;
        const el = ref.current;
        if (!el) return undefined;

        const obs = new IntersectionObserver(
            ([e]) => {
                if (!e.isIntersecting) return;   // no se desmonta nunca
                setCerca(true);
                obs.disconnect();                // y no hace falta seguir mirando
            },
            { rootMargin: '200% 0px' },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [ref, siempre, hayObservador]);

    // `siempre` va aqui y NO en el valor inicial: llega despues del montaje —es
    // el turno que reparte el cuaderno— y un valor inicial solo se lee una vez.
    // Leerlo alli dejaba la celda apagada para siempre, y encima con el
    // observador desconectado, que es lo unico que podia encenderla.
    return cerca || siempre;
}
