/** Las llamadas de workspaces (B1). Todas devuelven el JSON o lanzan con el mensaje del servidor. */
import { API_BASE } from '../../api.js';

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, {
        method: metodo,
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || `Request failed (${r.status})`);
    return datos;
}

export const listarWorkspaces = (archivados = false) =>
    pedir('GET', `/api/workspaces${archivados ? '?archivados=1' : ''}`).then(d => d.workspaces || []);
export const crearWorkspace = (datos) => pedir('POST', '/api/workspaces', datos);
export const actualizarWorkspace = (id, datos) => pedir('PUT', `/api/workspaces/${encodeURIComponent(id)}`, datos);
export const archivarWorkspace = (id, archivado = true) =>
    pedir('POST', `/api/workspaces/${encodeURIComponent(id)}/archivar`, { archivado });
export const enlaceDelProyecto = () => pedir('GET', '/api/project/workspace');
export const enlazarProyecto = (workspaceId, noPreguntar) =>
    pedir('PUT', '/api/project/workspace', { workspaceId, noPreguntar });

/** Los colores que se ofrecen: legibles sobre los temas oscuros y claros. */
export const COLORES = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#a3e635'];

/** Dos letras para el avatar: las iniciales de las dos primeras palabras. */
export const iniciales = (nombre = '') =>
    nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
