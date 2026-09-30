/**
 * El lado del cliente de la base de AmoxSQL (A5).
 *
 * Hasta la 5.8 los proyectos recientes vivían sólo aquí, en el localStorage del
 * renderer (`amoxsql-recent-projects`, rutas de la más reciente a la más
 * vieja). El servidor no puede leerlo, así que se lo manda el cliente al
 * arrancar. El servidor anota que ya lo hizo, y las siguientes veces contesta
 * sin hacer nada: llamarla en cada arranque es barato.
 *
 * El localStorage NO se vacía. La 5.8 lo sigue leyendo, y mientras duren las
 * prereleases hay que poder volver a ella.
 */
import { API_BASE } from './api.js';

const RECIENTES = 'amoxsql-recent-projects';

export async function importarRecientesUnaVez() {
    let rutas = [];
    try { rutas = JSON.parse(localStorage.getItem(RECIENTES) || '[]'); } catch { /* sin localStorage: nada que importar */ }
    try {
        await fetch(`${API_BASE}/api/central/recientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rutas: Array.isArray(rutas) ? rutas : [] }),
        });
    } catch {
        // Si la base central no está, se reintenta en el próximo arranque: la
        // preferencia que lo marca como hecho sólo se escribe cuando sale bien.
    }
}
