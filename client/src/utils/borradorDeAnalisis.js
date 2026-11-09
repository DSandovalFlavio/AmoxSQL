/**
 * El punto de control de un análisis de Deep Dive en curso (plan UX, F9).
 *
 * Una ejecución se guarda al terminar, o al fallar (`useAiChat`). Si la ventana
 * se cierra o muere a mitad, ninguna de las dos llega: el plan sigue en el servidor,
 * pero la prosa, las consultas y los gráficos de esa ejecución se perdían. Aquí se
 * copia lo hecho en cada paso, y al reabrir la sesión se recupera como una
 * ejecución cortada («The window closed in the middle of the analysis»).
 *
 * Es local (localStorage), por conversación, y se borra en cuanto la ejecución se
 * guarda de verdad. Las filas de cada consulta se recortan para no llenarlo: 200
 * bastan para que sus gráficos se dibujen.
 */
const PREFIJO = 'amoxsql-dd-borrador:';
const FILAS = 200;

const recortar = (tc) => {
    const r = tc.result;
    if (tc.toolName !== 'execute_sql' || !Array.isArray(r?.data) || r.data.length <= FILAS) return tc;
    return { ...tc, result: { ...r, data: r.data.slice(0, FILAS) } };
};

export function guardarBorrador(conversationId, { id, texto, toolCalls }) {
    if (!conversationId) return;
    try {
        localStorage.setItem(PREFIJO + conversationId, JSON.stringify({ id, texto, toolCalls: (toolCalls || []).map(recortar), en: Date.now() }));
    } catch { /* sin sitio: se queda el anterior */ }
}

export function leerBorrador(conversationId) {
    if (!conversationId) return null;
    try {
        const b = JSON.parse(localStorage.getItem(PREFIJO + conversationId) || 'null');
        return b && (b.texto || b.toolCalls?.length) ? b : null;
    } catch {
        return null;
    }
}

export function borrarBorrador(conversationId) {
    if (!conversationId) return;
    try { localStorage.removeItem(PREFIJO + conversationId); } catch { /* nada */ }
}
