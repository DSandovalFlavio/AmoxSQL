import { ubicarRango, esDeRango } from './archivos/rango.js';
import { ubicarCelda, esDeCelda } from './archivos/cuaderno.js';
import { leerCuaderno } from '../../utils/cuadernoFile.js';

/**
 * **Las propuestas del Assistant y su estado** (plan del Assistant, E1/A1).
 *
 * Una propuesta es una llamada a `write_file` (una versión nueva del archivo
 * activo), a `propose_change` (unas líneas del archivo activo, E2) o a
 * `propose_file` (un archivo nuevo). Ninguna escribe nada: esperan a
 * que el usuario decida. Su estado viaja en la propia llamada, que se guarda con
 * el mensaje:
 *
 *   propuesta  — pendiente: Accept / Reject (o Create / Dismiss).
 *   aplicada   — el usuario la aceptó (entró al editor, o se creó el archivo).
 *   rechazada  — el usuario la descartó.
 *   caducada   — (derivado) el archivo cambió desde que se propuso: aceptarla
 *                borraría lo escrito después, así que se ofrece pedirla de nuevo.
 *                Una propuesta por líneas solo caduca si cambió ESA parte.
 *   anterior   — (derivado) de una conversación de antes de que se guardara el
 *                estado: no se sabe qué pasó, y no se pinta como hecha.
 *
 * Puro: lo usan `useAiChat` (al recibirla y al decidir) y `ChatMessage` (al pintarla).
 */

export const HERRAMIENTAS_DE_PROPUESTA = new Set(['write_file', 'propose_change', 'propose_file', 'edit_file']);

/** ¿Es esta llamada una propuesta (y no un error)? */
export function esPropuesta(tc) {
    if (!tc || !HERRAMIENTAS_DE_PROPUESTA.has(tc.toolName)) return false;
    const r = tc.result;
    return !!r && !r.error && (r.action === 'edit_file' || r.action === 'propose_file' || r.action === 'propose_change');
}

/** ¿Propone un archivo nuevo (y no un cambio del activo)? */
export const esArchivoNuevo = (tc) => tc?.result?.action === 'propose_file';

/**
 * La huella de un texto (FNV-1a de 32 bits, en hex). Basta para saber si el
 * archivo cambió desde la propuesta; no es criptográfica ni lo necesita.
 */
export function huella(texto) {
    const t = String(texto ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * El estado que se ve.
 *
 * @param {object} tc - la llamada (con `estado` y, si cambia el archivo activo, `base`)
 * @param {string|null} contenidoActual - el texto de la pestaña ahora; null si no se sabe
 */
export function estadoDe(tc, contenidoActual = null) {
    if (!esPropuesta(tc)) return null;
    if (tc.estado === 'aplicada' || tc.estado === 'rechazada') return tc.estado;
    if (tc.estado !== 'propuesta') return 'anterior';
    if (esDeRango(tc.result)) {
        return contenidoActual != null && !ubicarRango(contenidoActual, tc.result) ? 'caducada' : 'propuesta';
    }
    // E3: por celdas, caduca solo si cambió su celda (o la de al lado, si añade una).
    if (esDeCelda(tc.result)) {
        return contenidoActual != null && !ubicarCelda(leerCuaderno(contenidoActual).celdas, tc.result) ? 'caducada' : 'propuesta';
    }
    if (!esArchivoNuevo(tc) && tc.base && contenidoActual != null && huella(contenidoActual) !== tc.base) {
        return 'caducada';
    }
    return 'propuesta';
}

/**
 * Marca las propuestas de un mensaje recién recibido: pendientes, y con la
 * huella del archivo que el modelo tenía delante.
 */
export function marcarPropuestas(llamadas, contenidoEnviado) {
    const base = contenidoEnviado == null ? null : huella(contenidoEnviado);
    return llamadas.map(tc => {
        if (!esPropuesta(tc) || tc.estado) return tc;
        // Por líneas no hace falta la huella: la propuesta trae el texto que reemplaza.
        if (esDeRango(tc.result) || esDeCelda(tc.result)) return { ...tc, estado: 'propuesta' };
        return esArchivoNuevo(tc) ? { ...tc, estado: 'propuesta' } : { ...tc, estado: 'propuesta', base };
    });
}

/** Una copia de los mensajes con el estado nuevo de una llamada. */
export function conEstado(mensajes, toolCallId, estado) {
    return mensajes.map(m => {
        if (!m.toolCalls?.some(tc => tc.toolCallId === toolCallId)) return m;
        return { ...m, toolCalls: m.toolCalls.map(tc => (tc.toolCallId === toolCallId ? { ...tc, estado } : tc)) };
    });
}
