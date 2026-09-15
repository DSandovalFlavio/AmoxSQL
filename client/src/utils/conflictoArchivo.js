/**
 * Qué hacer cuando un archivo abierto cambia por fuera.
 *
 * Esto es **una función pura y una tabla de verdad**, a propósito. El vigilante
 * del disco, el flujo de eventos y los diálogos son fontanería que se comprueba
 * con la aplicación delante; lo que no puede fallar nunca es *esta* decisión,
 * porque el caso malo no da un error: **pisa el trabajo de alguien y se calla.**
 *
 * ## Las cuatro salidas
 *
 * - `ignorar` — no ha cambiado nada para nosotros. Es el caso **más frecuente**,
 *   y que exista es lo que hace tolerable todo lo demás: sin él, cada guardado
 *   propio produciría un aviso sobre el cambio que acabas de hacer tú.
 * - `recargar` — cambió fuera y aquí no hay nada que perder. Se trae y ya está:
 *   **preguntar por algo que no tiene conflicto es ruido**, y el ruido enseña a
 *   ignorar los avisos.
 * - `preguntar` — cambió fuera y aquí hay trabajo sin guardar. **Las dos
 *   versiones importan y no podemos elegir por el usuario.**
 * - `desaparecido` — el archivo ya no está. Nunca se cierra la pestaña sola: si
 *   había cambios, lo único que queda de ese archivo está aquí dentro.
 */

/** Lo que devuelve `decidirAviso`, para que nadie escriba la cadena a mano. */
export const ACCIONES = {
    IGNORAR: 'ignorar',
    RECARGAR: 'recargar',
    PREGUNTAR: 'preguntar',
    DESAPARECIDO: 'desaparecido',
};

/** Compara dos rutas viniendo de donde vengan: el explorador y el vigilante no usan las mismas barras. */
export function mismaRuta(a, b) {
    const n = (r) => String(r || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    const na = n(a);
    const nb = n(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // El vigilante habla en rutas relativas a la raíz; una pestaña puede llevar
    // la absoluta. Basta con que una termine donde acaba la otra, en frontera
    // de carpeta — así `datos.sql` no casa con `mis_datos.sql`.
    const largo = na.length > nb.length ? na : nb;
    const corto = na.length > nb.length ? nb : na;
    return largo.endsWith(`/${corto}`);
}

/**
 * Qué hacer con este aviso para esta pestaña.
 *
 * `pestana`: `{ path, dirty, firma }` — `firma` es la del contenido que se leyó
 * al abrirla o la de la última vez que se guardó.
 * `aviso`: `{ ruta, firma, tipo }` del vigilante.
 */
export function decidirAviso(pestana, aviso) {
    if (!pestana || !aviso) return ACCIONES.IGNORAR;
    // Una pestaña sin archivo —un borrador sin título— no puede cambiar por
    // fuera: no hay nada suyo en el disco.
    if (!pestana.path) return ACCIONES.IGNORAR;
    if (!mismaRuta(pestana.path, aviso.ruta)) return ACCIONES.IGNORAR;

    if (aviso.tipo === 'baja' || aviso.firma === null) return ACCIONES.DESAPARECIDO;

    /**
     * **La firma igual es el caso normal, no el raro.**
     *
     * Guardar dispara el vigilante, así que sin esto la aplicación se avisaría a
     * sí misma de cada guardado. También cubre lo que mueve la fecha sin cambiar
     * un byte: cambiar de rama y volver, una herramienta que reescribe lo mismo.
     */
    if (pestana.firma && aviso.firma === pestana.firma) return ACCIONES.IGNORAR;

    /**
     * Sin firma no se puede comparar —una pestaña abierta antes de que esto
     * existiera— y entonces manda el trabajo sin guardar: **ante la duda, se
     * pregunta.** Recargar por si acaso es la única salida que destruye algo.
     */
    return pestana.dirty ? ACCIONES.PREGUNTAR : ACCIONES.RECARGAR;
}

/**
 * Lo mismo para el momento de guardar, cuando el servidor contesta que la firma
 * no coincide.
 *
 * Es deliberadamente **más estricto**: aquí no hay «recargar en silencio»
 * posible, porque el usuario ha pulsado Guardar y tiene algo que escribir. O
 * pregunta, o no había conflicto.
 */
export function decidirGuardado({ conflicto, firmaServidor, firmaPestana }) {
    if (!conflicto) return ACCIONES.IGNORAR;
    // El servidor puede contestar conflicto con la misma firma que ya teníamos
    // si dos guardados se cruzan; entonces no hay nada que resolver.
    if (firmaServidor && firmaPestana && firmaServidor === firmaPestana) return ACCIONES.IGNORAR;
    return ACCIONES.PREGUNTAR;
}
