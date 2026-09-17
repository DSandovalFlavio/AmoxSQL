/**
 * Devolver un diagrama al documento del que salió.
 *
 * Es la parte más delicada de AmoxDiagram, y por eso es pura y está aquí sola:
 * **perder el trabajo de otro en silencio es el único fallo de este editor que
 * no tiene arreglo.** Todo lo demás se deshace.
 *
 * ## El ancla
 *
 * Un bloque cercado no tiene identificador. Para reconocerlo al volver hay dos
 * datos y ninguno basta solo:
 *
 * - **La posición entre los bloques mermaid del archivo.** Sobrevive a que
 *   alguien escriba párrafos alrededor, que es lo más frecuente. No sobrevive a
 *   que inserten otro diagrama antes.
 * - **El texto original.** Sobrevive a que muevan el bloque de sitio. No
 *   sobrevive a que lo editen a mano.
 *
 * Se usan los dos: la posición para encontrarlo y el texto para **comprobar que
 * es el mismo**. Si la posición falla se busca el texto por todo el archivo,
 * porque un bloque movido sigue siendo el mismo bloque. Si ninguna de las dos
 * cosas encaja, no se adivina: se pregunta.
 */
import { bloquesCercados, reemplazarCercado } from '../markdown/fencedBlocks.js';

/** Normaliza para comparar: los saltos de línea de Windows no son un cambio. */
function comparable(t) {
    return String(t || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

/**
 * Dónde está ahora el bloque que se abrió, y si sigue siendo el mismo.
 *
 * Devuelve `{ bloque, movido }` cuando lo reconoce, o `{ motivo }` cuando no.
 */
export function localizarBloque(markdown, procedencia) {
    const bloques = bloquesCercados(markdown, ['mermaid']);
    if (!bloques.length) return { motivo: 'sin-bloques' };

    const original = comparable(procedencia?.original);
    const enSuSitio = bloques[procedencia?.indice ?? 0];
    if (enSuSitio && comparable(enSuSitio.cuerpo) === original) {
        return { bloque: enSuSitio, movido: false };
    }

    // Un bloque movido sigue siendo el mismo bloque: se busca su texto. Sólo
    // vale si aparece UNA vez — con dos copias idénticas no hay forma de saber
    // cuál abrió el usuario, y elegir una al azar es exactamente lo que no se
    // puede hacer aquí.
    const iguales = bloques.filter((b) => comparable(b.cuerpo) === original);
    if (iguales.length === 1) return { bloque: iguales[0], movido: true };
    if (iguales.length > 1) return { motivo: 'ambiguo' };

    return { motivo: 'cambiado', actual: enSuSitio ? enSuSitio.cuerpo : null };
}

/**
 * El markdown con el diagrama actualizado, o el motivo por el que no se puede.
 *
 * `forzar` salta la comprobación del ancla y escribe en la posición guardada.
 * Es lo que se usa **sólo** cuando el usuario, viendo el aviso, dice que sí.
 */
export function fusionar(markdown, procedencia, textoNuevo, { forzar = false } = {}) {
    const bloques = bloquesCercados(markdown, ['mermaid']);

    if (forzar) {
        const destino = bloques[procedencia?.indice ?? 0];
        if (!destino) return { ok: false, motivo: 'sin-bloques' };
        return { ok: true, contenido: reemplazarCercado(markdown, destino, textoNuevo), movido: false };
    }

    const encontrado = localizarBloque(markdown, procedencia);
    if (encontrado.motivo) return { ok: false, motivo: encontrado.motivo, actual: encontrado.actual };

    return {
        ok: true,
        contenido: reemplazarCercado(markdown, encontrado.bloque, textoNuevo),
        movido: encontrado.movido,
    };
}

/** Qué decirle al usuario, en su idioma y no en el del programa. */
export const MOTIVOS = {
    'sin-bloques': 'The document no longer has a diagram.',
    ambiguo: 'There are two identical diagrams and it is not clear which one you opened.',
    cambiado: 'The diagram in this document is not the one you opened. Somebody — or you, in another tab — touched it since.',
};

/**
 * La procedencia que se guarda al abrir un diagrama desde un markdown.
 *
 * El texto original se congela aquí: es el «como estaba cuando lo abrí» contra
 * el que se compara al guardar.
 */
export function procedenciaDe(archivo, indice, original) {
    return { archivo, indice, original };
}

/** El contenido de la pestaña: el bloque, sin cabecera, listo para el editor. */
export function envoltorio(mermaid) {
    return ['```mermaid', mermaid.replace(/\r?\n$/, ''), '```', ''].join('\n');
}

/**
 * En qué posición entre los bloques mermaid empieza la línea dada.
 *
 * La vista previa sabe de qué línea del documento sale cada bloque; el editor
 * necesita saber **cuál de los diagramas** es. Esto traduce lo uno en lo otro.
 * Devuelve 0 si no encuentra nada mejor: abrir el primero es menos malo que no
 * abrir ninguno, y la comprobación del texto lo atrapará igualmente.
 */
export function indicePorLinea(markdown, linea) {
    if (!linea) return 0;
    const bloques = bloquesCercados(markdown, ['mermaid']);
    let mejor = 0;
    let distancia = Infinity;
    bloques.forEach((b, i) => {
        const lineaBloque = markdown.slice(0, b.desde).split(/\r?\n/).length;
        const d = Math.abs(lineaBloque - linea);
        if (d < distancia) { distancia = d; mejor = i; }
    });
    return mejor;
}
