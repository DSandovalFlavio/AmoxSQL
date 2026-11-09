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
const datosDeGrafico = new Map();

export function tieneModelo(tabId) {
    const m = modelos.get(tabId);
    return !!m && !m.isDisposed();
}

// El monaco con el que se crearon los modelos: hace falta para encontrar el
// editor que muestra uno (el Assistant inserta donde está el cursor).
let monacoDeLosModelos = null;

/**
 * El editor que muestra ahora el modelo de esta pestaña, o null si no se ve
 * (otra pestaña al frente, resultados a pantalla completa…).
 */
export function editorDe(tabId) {
    if (!monacoDeLosModelos || !tieneModelo(tabId)) return null;
    const modelo = modelos.get(tabId);
    return monacoDeLosModelos.editor.getEditors().find(e => e.getModel() === modelo) || null;
}

export function modeloDe(monaco, tabId, texto, idioma) {
    monacoDeLosModelos = monaco;
    if (tieneModelo(tabId)) return modelos.get(tabId);
    const uri = monaco.Uri.parse(`inmemory://amoxsql/pestana/${encodeURIComponent(tabId)}`);
    const modelo = monaco.editor.getModel(uri) || monaco.editor.createModel(texto ?? '', idioma || 'sql', uri);
    modelos.set(tabId, modelo);
    return modelo;
}

/**
 * **Dónde está el usuario en la pestaña** (plan del Assistant, E2): la selección y
 * la sentencia bajo el cursor. Vive aquí, fuera de React: cambia a cada movimiento
 * del cursor y nada debe repintarse por eso. El Assistant lo lee al enviar.
 *
 * Solo avisa (`amox_foco`) cuando cambia lo que se ve en el chat: si hay selección
 * y qué líneas abarca.
 */
const focos = new Map();
export function fijarFoco(tabId, foco) {
    if (!tabId) return;
    const antes = focos.get(tabId);
    focos.set(tabId, foco);
    const clave = (f) => (f?.seleccion ? `${f.seleccion.desde}-${f.seleccion.hasta}` : '');
    if (clave(antes) !== clave(foco)) {
        window.dispatchEvent(new CustomEvent('amox_foco', { detail: { tabId, seleccion: foco?.seleccion ? { desde: foco.seleccion.desde, hasta: foco.seleccion.hasta } : null } }));
    }
}
/**
 * E3: un editor que no es Monaco (el notebook) no puede avisar a cada movimiento
 * de lo que tiene; deja aquí una función y se le pregunta al enviar. Gana sobre el
 * foco guardado. Devuelve cómo quitarla.
 */
const proveedores = new Map();
export function fijarProveedorDeFoco(tabId, fn) {
    if (!tabId) return () => {};
    proveedores.set(tabId, fn);
    return () => { if (proveedores.get(tabId) === fn) proveedores.delete(tabId); };
}
export const focoDe = (tabId) => {
    const fn = proveedores.get(tabId);
    if (fn) { try { return fn() || null; } catch { return null; } }
    return focos.get(tabId) || null;
};

/**
 * E3: quien sabe aplicar una propuesta sobre su propio documento (el notebook la
 * aplica en sus celdas, conservando sus `id` y con ellos los resultados de las
 * demás). Devuelve cómo quitarlo.
 */
const aplicadores = new Map();
export function fijarAplicador(tabId, fn) {
    if (!tabId) return () => {};
    aplicadores.set(tabId, fn);
    return () => { if (aplicadores.get(tabId) === fn) aplicadores.delete(tabId); };
}
export const aplicadorDe = (tabId) => aplicadores.get(tabId) || null;

export const recordarResultados = (tabId, estado) => { resultados.set(tabId, estado); };

/** El estado guardado, solo si es de estos mismos datos. */
export function leerResultados(tabId, datos) {
    const e = resultados.get(tabId);
    return e && e.datos === datos ? e : null;
}

/**
 * Los datos de un gráfico en su pestaña, para no releer el archivo cada vez que se
 * vuelve a ella. **Refresh** relee. Lo muy grande no se guarda: pesa más en memoria
 * de lo que cuesta volver a pedirlo con el tope de filas.
 */
const MAX_FILAS_RECORDADAS = 200000;
export function recordarDatosDeGrafico(tabId, consulta, filas) {
    if (filas?.length > MAX_FILAS_RECORDADAS) datosDeGrafico.delete(tabId);
    else datosDeGrafico.set(tabId, { consulta, filas });
}
export function leerDatosDeGrafico(tabId, consulta) {
    const d = datosDeGrafico.get(tabId);
    return d && d.consulta === consulta ? d.filas : null;
}

/** Suelta lo de las pestañas que ya no existen. */
export function olvidarPestanas(vivas) {
    for (const [id, m] of modelos) {
        if (!vivas.has(id)) { if (!m.isDisposed()) m.dispose(); modelos.delete(id); }
    }
    for (const id of resultados.keys()) {
        if (!vivas.has(id)) resultados.delete(id);
    }
    for (const id of datosDeGrafico.keys()) {
        if (!vivas.has(id)) datosDeGrafico.delete(id);
    }
    for (const id of focos.keys()) {
        if (!vivas.has(id)) focos.delete(id);
    }
}
