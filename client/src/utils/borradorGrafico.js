/**
 * El gráfico de un `.sql` se recuerda con el archivo (Dec-79).
 *
 * El servidor lo guarda en `.amoxsql/borradores/graficos.json`
 * (`server/borradores.js`). Aquí solo se lee al abrir el archivo y se escribe,
 * agrupado, mientras se configura: Story Flow avisa cada medio segundo y no hace
 * falta una escritura por aviso.
 */
import { API_BASE } from '../api.js';

const ESPERA = 800;
const pendientes = new Map(); // ruta → { cambios, temporizador }

/** El borrador de un archivo: `{ vista, grafico }` o null. */
export async function leerBorrador(ruta) {
    if (!ruta) return null;
    try {
        const r = await fetch(`${API_BASE}/api/borrador-grafico?path=${encodeURIComponent(ruta)}`);
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
}

function enviar(ruta) {
    const p = pendientes.get(ruta);
    if (!p) return;
    pendientes.delete(ruta);
    clearTimeout(p.temporizador);
    fetch(`${API_BASE}/api/borrador-grafico`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: ruta, cambios: p.cambios }),
    }).catch(() => { /* recordar no es imprescindible: el gráfico sigue en la pestaña */ });
}

/** Junta `cambios` (`vista`, `grafico`) con los pendientes y los manda en un rato. */
export function guardarBorrador(ruta, cambios) {
    if (!ruta || !cambios) return;
    const previo = pendientes.get(ruta);
    if (previo) clearTimeout(previo.temporizador);
    const juntos = { ...(previo?.cambios || {}), ...cambios };
    pendientes.set(ruta, { cambios: juntos, temporizador: setTimeout(() => enviar(ruta), ESPERA) });
}

/** Lo que quede por mandar, ya (al cerrar la ventana). */
export function vaciarBorradores() {
    for (const ruta of [...pendientes.keys()]) enviar(ruta);
}

if (typeof window !== 'undefined') window.addEventListener('beforeunload', vaciarBorradores);
