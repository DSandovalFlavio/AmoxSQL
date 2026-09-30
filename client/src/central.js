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

/**
 * Lo que el proyecto recién abierto necesita y esta máquina no tiene (el
 * manifiesto, A2). null si no falta nada o si no se pudo saber: un aviso de más
 * sobre algo que quizá esté es peor que ninguno.
 */
export async function requisitosQueFaltan() {
    try {
        const r = await fetch(`${API_BASE}/api/project/requisitos`);
        if (!r.ok) return null;
        const d = await r.json();
        return d.completo ? null : d.faltan;
    } catch { return null; }
}

export function describirFaltantes(faltan) {
    const partes = [];
    const cred = faltan?.credenciales || [];
    const ext = faltan?.extensiones || [];
    if (cred.length) partes.push(`the credential${cred.length > 1 ? 's' : ''} ${cred.map(c => c.nombre).join(', ')}`);
    if (ext.length) partes.push(`the extension${ext.length > 1 ? 's' : ''} ${ext.join(', ')}`);
    return `This project needs ${partes.join(' and ')}, which ${cred.length + ext.length > 1 ? 'are' : 'is'} missing on this machine.`;
}

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
