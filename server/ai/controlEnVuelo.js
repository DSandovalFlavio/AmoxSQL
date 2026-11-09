/**
 * Lo que el usuario le dice a un análisis de Deep Dive mientras corre (plan UX, F6).
 *
 * La petición de streaming solo va del servidor al cliente: para que el usuario
 * pueda saltar un paso, dar una indicación o pausar sin detener la ejecución, el
 * cliente lo deja aquí con una petición aparte, y el bucle lo recoge al empezar
 * cada iteración (`tomar`). En memoria y por conversación: dura lo que dura la
 * ejecución; al terminar se limpia.
 */
const pendientes = new Map(); // conversationId → { saltar: Set, indicaciones: [], pausar: bool }

function de(conversationId) {
    let c = pendientes.get(conversationId);
    if (!c) { c = { saltar: new Set(), indicaciones: [], pausar: false }; pendientes.set(conversationId, c); }
    return c;
}

/** Desde la ruta: `{ saltar?: stepId, indicacion?: texto, pausar?: true }`. */
function anotar(conversationId, { saltar, indicacion, pausar } = {}) {
    if (!conversationId) return false;
    const c = de(conversationId);
    if (saltar) c.saltar.add(String(saltar));
    if (typeof indicacion === 'string' && indicacion.trim()) c.indicaciones.push(indicacion.trim().slice(0, 2000));
    if (pausar) c.pausar = true;
    return true;
}

/** Desde el bucle: lo pendiente, y se vacía. */
function tomar(conversationId) {
    const c = pendientes.get(conversationId);
    if (!c) return { saltar: [], indicaciones: [], pausar: false };
    pendientes.delete(conversationId);
    return { saltar: [...c.saltar], indicaciones: c.indicaciones, pausar: c.pausar };
}

function limpiar(conversationId) { pendientes.delete(conversationId); }

/**
 * Marca como saltados los pasos pendientes de `ids`. Devuelve los que cambiaron.
 * Lo usa el bucle para los saltos en vuelo y para los que llegan con «Continue»
 * (antes solo se aplicaban si el agente volvía a crear el plan: al continuar uno en
 * pausa, el paso que habías saltado se ejecutaba igual).
 */
function aplicarSaltos(plan, ids, nota = 'Skipped by you') {
    const set = new Set((ids || []).map(o => (typeof o === 'string' ? o : o?.stepId)).filter(Boolean));
    const cambiados = [];
    for (const step of plan?.steps || []) {
        if (set.has(step.id) && (step.status === 'pending' || !step.status)) {
            step.status = 'skipped';
            step.note = nota;
            cambiados.push(step.id);
        }
    }
    return cambiados;
}

module.exports = { anotar, tomar, limpiar, aplicarSaltos };
