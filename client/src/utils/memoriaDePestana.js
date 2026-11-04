/**
 * **Lo que una pestaña recuerda mientras no la miras** (Dec-82, Dec-83).
 *
 * Dos cosas viven fuera de React porque sobreviven al desmontaje y ningún render
 * debe depender de ellas:
 *
 *   - El modelo de Monaco de cada pestaña. Antes había uno solo y `setValue` al
 *     cambiar de pestaña, que borraba la historia: Ctrl+Z no deshacía nada de lo
 *     escrito antes de ir a otra.
 *   - El estado de la tabla de resultados: orden, filtros, página, columnas,
 *     anchos y scroll. Solo vale para los MISMOS datos; una ejecución nueva
 *     empieza de cero, como siempre.
 */
const modelos = new Map();
const resultados = new Map();

export function tieneModelo(tabId) {
    const m = modelos.get(tabId);
    return !!m && !m.isDisposed();
}

export function modeloDe(monaco, tabId, texto, idioma) {
    if (tieneModelo(tabId)) return modelos.get(tabId);
    const uri = monaco.Uri.parse(`inmemory://amoxsql/pestana/${encodeURIComponent(tabId)}`);
    const modelo = monaco.editor.getModel(uri) || monaco.editor.createModel(texto ?? '', idioma || 'sql', uri);
    modelos.set(tabId, modelo);
    return modelo;
}

export const recordarResultados = (tabId, estado) => { resultados.set(tabId, estado); };

/** El estado guardado, solo si es de estos mismos datos. */
export function leerResultados(tabId, datos) {
    const e = resultados.get(tabId);
    return e && e.datos === datos ? e : null;
}

/** Suelta lo de las pestañas que ya no existen. */
export function olvidarPestanas(vivas) {
    for (const [id, m] of modelos) {
        if (!vivas.has(id)) { if (!m.isDisposed()) m.dispose(); modelos.delete(id); }
    }
    for (const id of resultados.keys()) {
        if (!vivas.has(id)) resultados.delete(id);
    }
}
