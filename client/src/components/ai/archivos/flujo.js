/**
 * **El Assistant en un Data Flow** (plan del Assistant, E5).
 *
 * El servidor aplica las operaciones del modelo sobre el `.sqlchain` (pasos que
 * entran, cambian o salen, conexiones) y devuelve el flujo que quedaría —sin
 * posiciones— con la lista de `diffDeProcesos`. Aquí se decide si sigue valiendo
 * (los pasos que tocaba siguen como estaban) y cómo se funde con el lienzo: los
 * pasos que se quedan conservan su sitio, los nuevos se colocan junto a lo que
 * leen.
 *
 * Puro. Lo usan el panel (estado), el editor de Data Flow y las pruebas.
 */

/** JSON con las claves en orden (el mismo criterio que el servidor). */
export function estable(v) {
    return JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));
}

const comparable = (n) => estable({ type: n.type, label: n.label || '', config: n.config || {}, disabled: !!n.disabled });

/** ¿Es una propuesta para un Data Flow? */
export const esDePasos = (r) => r?.action === 'propose_change' && r.objetivo?.tipo === 'pasos';

/**
 * ¿Sigue valiendo? Los pasos que cambia o quita, y las conexiones que quita, tienen
 * que seguir como estaban; y los que añade no pueden existir ya.
 * @param {{ nodes: Array, edges: Array }} def - el flujo de hoy
 */
export function vigenteEnFlujo(def, r) {
    if (!esDePasos(r)) return false;
    const hoy = new Map((def?.nodes || []).map(n => [n.id, n]));
    for (const [id, n] of Object.entries(r.original?.nodos || {})) {
        const ahora = hoy.get(id);
        if (!ahora || comparable(ahora) !== comparable(n)) return false;
    }
    for (const e of r.original?.aristas || []) {
        if (!(def?.edges || []).some(x => x.source === e.source && x.target === e.target)) return false;
    }
    // Los pasos que se quedan sin tocarse pueden haberse movido o reconfigurado: no
    // importa, al aceptar se conserva lo de hoy de los que la propuesta no toca.
    return true;
}

/**
 * Los pasos y conexiones con la propuesta aplicada: los que no toca, como están
 * hoy (con su posición y su configuración de hoy); los que cambia o añade, como
 * los dejó el servidor.
 * @param {{ nodes, edges }} def - el flujo de hoy (sin posiciones)
 * @returns {{ nodes, edges }}
 */
export function fundirPasos(def, r) {
    const despues = new Map((r.despues?.nodes || []).map(n => [n.id, n]));
    const tocados = Object.keys(r.original?.nodos || {});
    const quitados = new Set(tocados.filter(id => !despues.has(id)));
    const cambiados = new Set(tocados.filter(id => despues.has(id)));
    const hoy = (def?.nodes || []).filter(n => !quitados.has(n.id));
    const ids = new Set(hoy.map(n => n.id));
    // Lo que el usuario añadió después de la propuesta se queda.
    const nodes = [
        ...hoy.map(n => (cambiados.has(n.id) ? despues.get(n.id) : n)),
        ...(r.despues?.nodes || []).filter(n => !ids.has(n.id) && !quitados.has(n.id)),
    ];
    const vivos = new Set(nodes.map(n => n.id));
    const llave = (e) => `${e.source}→${e.target}`;
    const desconectadas = new Set((r.original?.aristas || []).map(llave));
    const edges = (def?.edges || []).filter(e => vivos.has(e.source) && vivos.has(e.target) && !desconectadas.has(llave(e)));
    const ya = new Set(edges.map(llave));
    const eHoy = new Set((def?.edges || []).map(llave));
    for (const e of r.despues?.edges || []) {
        if (!ya.has(llave(e)) && !eHoy.has(llave(e)) && vivos.has(e.source) && vivos.has(e.target)) edges.push(e);
    }
    return { nodes, edges };
}

/**
 * Qué pasa con cada paso y cada conexión: para pintar la propuesta sobre el lienzo.
 * @returns {{ nuevos: Set, cambiados: Set, quitados: Set, aristasNuevas: Array, aristasQuitadas: Array }}
 */
export function clasificar(def, r) {
    const hoy = new Map((def?.nodes || []).map(n => [n.id, n]));
    const despues = new Map((r.despues?.nodes || []).map(n => [n.id, n]));
    const nuevos = new Set([...despues.keys()].filter(id => !hoy.has(id)));
    const quitados = new Set([...hoy.keys()].filter(id => !despues.has(id)));
    const cambiados = new Set([...despues.keys()].filter(id => hoy.has(id) && comparable(hoy.get(id)) !== comparable(despues.get(id))));
    const llave = (e) => `${e.source}→${e.target}`;
    const eHoy = new Set((def?.edges || []).map(llave));
    const eDespues = new Set((r.despues?.edges || []).map(llave));
    return {
        nuevos, cambiados, quitados,
        aristasNuevas: (r.despues?.edges || []).filter(e => !eHoy.has(llave(e))),
        aristasQuitadas: (def?.edges || []).filter(e => !eDespues.has(llave(e))),
    };
}

/**
 * Dónde va cada paso nuevo: a la derecha del primero que lee (o debajo de todo si
 * no lee nada), y uno debajo de otro si varios leen lo mismo.
 * @param {Map<string, {x, y}>} posiciones - las de hoy
 */
export function posicionesNuevas(r, posiciones, nuevos) {
    const fuera = new Map(posiciones);
    const ocupados = new Map();
    const maxY = posiciones.size ? Math.max(...[...posiciones.values()].map(p => p.y)) : 0;
    const minX = posiciones.size ? Math.min(...[...posiciones.values()].map(p => p.x)) : 120;
    let sueltos = 0;
    // Un hueco libre: si ya hay un paso ahí (el hijo de hoy del mismo padre), más abajo.
    const libre = (p) => {
        let q = { ...p };
        for (let i = 0; i < 40 && [...fuera.values()].some(o => Math.abs(o.x - q.x) < 230 && Math.abs(o.y - q.y) < 110); i++) q = { x: q.x, y: q.y + 140 };
        return q;
    };
    // En el orden en que están en `despues`, que es el que el modelo los añadió.
    for (const n of r.despues?.nodes || []) {
        if (!nuevos.has(n.id)) continue;
        const padre = (r.despues.edges || []).find(e => e.target === n.id && fuera.has(e.source))?.source;
        if (padre) {
            const p = fuera.get(padre);
            const k = ocupados.get(padre) || 0;
            ocupados.set(padre, k + 1);
            fuera.set(n.id, libre({ x: p.x + 300, y: p.y + k * 140 }));
        } else {
            fuera.set(n.id, libre({ x: minX, y: maxY + 160 + (sueltos++) * 140 }));
        }
    }
    return fuera;
}

/** «Change to the flow: 3 changes». */
export function describirPasos(r) {
    const n = (r?.cambios || []).length;
    return n ? `Change to the flow: ${n} change${n === 1 ? '' : 's'}` : 'Change to the flow';
}
