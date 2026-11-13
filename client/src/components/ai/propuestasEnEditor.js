import { emitir } from '../../eventos.js';
/**
 * **El puente entre el chat y el editor** (plan del Assistant, E2).
 *
 * Las propuestas viven en la conversación (`useAiChat`); se revisan en el editor
 * del archivo. El panel publica aquí las pendientes de su archivo y cómo
 * aceptarlas o rechazarlas; el editor que muestra ese archivo se suscribe y las
 * pinta. Sin React: el editor no se repinta por esto, solo cambia sus
 * decoraciones.
 */

const normalizar = (ruta) => String(ruta || '').replace(/\\/g, '/').toLowerCase();

const porRuta = new Map();   // ruta → { propuestas, acciones }
const oyentes = new Map();   // ruta → Set<fn>

/**
 * @param {string} ruta - el archivo de la conversación
 * @param {object[]} propuestas - llamadas pendientes por líneas (`propose_change`)
 * @param {{ aceptar: (tc) => Promise, rechazar: (tc) => void }} acciones
 */
export function publicarPropuestas(ruta, propuestas, acciones) {
    const k = normalizar(ruta);
    if (!k) return;
    const antes = porRuta.get(k);
    const mismas = antes && antes.propuestas.length === propuestas.length
        && antes.propuestas.every((tc, i) => tc === propuestas[i]);
    porRuta.set(k, { propuestas, acciones });
    if (mismas) return;
    for (const fn of oyentes.get(k) || []) fn(porRuta.get(k));
}

/** Se llama enseguida con lo que haya y después con cada cambio. Devuelve cómo dejar de oír. */
export function suscribirPropuestas(ruta, fn) {
    const k = normalizar(ruta);
    if (!k) return () => {};
    if (!oyentes.has(k)) oyentes.set(k, new Set());
    oyentes.get(k).add(fn);
    fn(porRuta.get(k) || { propuestas: [], acciones: null });
    return () => oyentes.get(k)?.delete(fn);
}

/** «Review» en el chat: el editor que la tenga la enseña. */
export function pedirRevision(toolCallId) {
    emitir('amox_revisar_propuesta', { toolCallId });
}
