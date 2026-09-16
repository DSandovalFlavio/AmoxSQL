/**
 * Con qué clave se guarda el estado visual de una celda.
 *
 * ## Por qué no es el identificador
 *
 * Parecería lo natural, pero el `id` de una celda **se inventa al leer el
 * archivo**: el formato en disco no lo guarda, así que cambia en cada apertura.
 * Guardar el estado bajo él equivale a no guardarlo: el gráfico que alguien
 * configuró hoy aparecería mañana como una tabla, sin error, sin aviso y sin
 * forma de relacionarlo con la causa.
 *
 * ## Por qué tampoco es la posición a secas
 *
 * Es lo que hacía la notebook vieja, y por eso mover una celda una fila hacia
 * arriba le daba el estado de su vecina. El nombre sí sobrevive a reordenar, y
 * además es lo que la persona reconoce. Sin nombre no queda más remedio que la
 * posición — pero entonces hay que reescribir el mapa cuando el orden cambia,
 * que es justo lo que hace `reclavar`.
 */

/** La clave de una celda: su nombre si lo tiene, si no su posición. */
export function claveDeCelda(celda, indice) {
    const nombre = String(celda?.nombre || '').trim();
    return nombre ? `n:${nombre}` : `p:${indice}`;
}

/**
 * Reescribe el mapa de estados cuando el documento cambia.
 *
 * Cubre de una vez los cuatro movimientos que alteran claves —añadir, borrar,
 * mover y renombrar— en lugar de un parche por cada uno. El estado de una celda
 * que ya no está se descarta: no le sirve a nadie y estorbaría a la celda que
 * ocupe su sitio.
 *
 * @param {Array} antes celdas antes del cambio
 * @param {Array} despues celdas después del cambio
 * @param {Object} estados mapa `clave -> estado visual`
 * @returns {Object} el mapa reescrito (el mismo objeto si nada cambió)
 */
export function reclavar(antes, despues, estados) {
    const viejas = {};
    (antes || []).forEach((c, i) => { viejas[c.id] = claveDeCelda(c, i); });
    const nuevas = {};
    (despues || []).forEach((c, i) => { nuevas[c.id] = claveDeCelda(c, i); });

    const igual = (despues || []).length === (antes || []).length
        && (despues || []).every((c) => nuevas[c.id] === viejas[c.id]);
    if (igual) return estados;

    const salida = { ...estados };
    // Se vacían primero TODAS las claves viejas y luego se reponen las vivas.
    // En dos pasos y no en uno: si una celda se mueve al sitio de otra, hacerlo
    // sobre la marcha borraría el valor que se acaba de escribir.
    for (const k of Object.values(viejas)) delete salida[k];
    for (const [id, k] of Object.entries(nuevas)) {
        const valor = estados[viejas[id]];
        if (valor) salida[k] = valor;
    }
    return salida;
}
