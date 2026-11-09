/**
 * Una copia de las pestañas que aún no tienen archivo, para que una ventana que se
 * cae no se las lleve: los borradores solo cubren lo que ya tiene ruta.
 *
 * Solo se lee al recuperar la ventana (`?reanudar=1`). Al abrir la app con normalidad
 * no vuelven: quien cerró sin guardar ya contestó.
 */
const CLAVE = 'amoxsql-sin-guardar-v1';
// localStorage ronda los 5 MB. Un texto enorme no debe echar a los demás.
const MAX_POR_PESTANA = 1024 * 1024;

const claveDe = (proyecto) => `${CLAVE}:${String(proyecto || '').replace(/\\/g, '/').toLowerCase()}`;

const copiables = (tabs, panel) => tabs
    .filter(t => !t.path && typeof t.content === 'string' && t.content.trim() && t.content.length <= MAX_POR_PESTANA)
    .map(t => ({ name: t.name, type: t.type, content: t.content, panel }));

export function guardarCopia(proyecto, izquierda, derecha) {
    try {
        const copia = [...copiables(izquierda, 'left'), ...copiables(derecha, 'right')];
        if (copia.length) localStorage.setItem(claveDe(proyecto), JSON.stringify(copia));
        else localStorage.removeItem(claveDe(proyecto));
    } catch { /* sin sitio: se queda la copia anterior */ }
}

export function leerCopia(proyecto) {
    try {
        const copia = JSON.parse(localStorage.getItem(claveDe(proyecto)) || '[]');
        return Array.isArray(copia) ? copia : [];
    } catch {
        return [];
    }
}

// App lo marca al volver de `?reanudar=1`, que ya no sigue en la URL cuando se
// monta el editor. Se consume una sola vez.
let reanudada = false;
export const marcarReanudada = () => { reanudada = true; };
export function consumirReanudada() {
    const r = reanudada;
    reanudada = false;
    return r;
}
