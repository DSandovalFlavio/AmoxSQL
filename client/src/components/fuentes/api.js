/**
 * Las llamadas de las fuentes con nombre (C1, 5.10). Todas devuelven el JSON o
 * lanzan con el mensaje del servidor. `workspaceId` las dirige a un workspace;
 * sin él, al proyecto abierto.
 */
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

const conWorkspace = (workspaceId) => (workspaceId ? `?${new URLSearchParams({ workspaceId })}` : '');

export const listarFuentes = (workspaceId) => pedir('GET', `/api/fuentes${conWorkspace(workspaceId)}`);
export const columnasDeFuentes = () => pedir('GET', '/api/fuentes/columnas').then(d => d.fuentes || []);
export const guardarFuente = ({ workspaceId, definicion, anterior, ubicacionAqui }) =>
    pedir('POST', '/api/fuentes', { workspaceId, definicion, anterior, ubicacionAqui });
export const borrarFuente = (nombre, workspaceId) =>
    pedir('DELETE', `/api/fuentes/${encodeURIComponent(nombre)}${conWorkspace(workspaceId)}`);
export const ubicarFuente = (nombre, ubicacion, workspaceId) =>
    pedir('PUT', `/api/fuentes/${encodeURIComponent(nombre)}/ubicacion`, { ubicacion, workspaceId });
export const probarFuente = (definicion, ubicacion) => pedir('POST', '/api/fuentes/probar', { definicion, ubicacion });
export const hojasDeExcel = (ruta) =>
    pedir('GET', `/api/files/inspect-excel?path=${encodeURIComponent(ruta)}`).then(d => d.sheets || []);

/** Avisa a quien enseñe fuentes (el explorador, Data Flow) de que algo cambió. */
export const avisarCambio = () => window.dispatchEvent(new CustomEvent('amox_fuentes_cambiaron'));

/** Del nombre de un archivo a un nombre de fuente: «Ventas Semana 39.xlsx» → ventas-semana-39. */
export function sugerirNombre(ruta) {
    const base = String(ruta || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    const n = base.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');
    return n || 'source';
}

export const NOMBRE_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function formatoDe(ruta) {
    const r = String(ruta || '').toLowerCase();
    if (/\.(xlsx|xlsm)$/.test(r)) return 'xlsx';
    if (/\.parquet$/.test(r)) return 'parquet';
    if (/\.(json|jsonl|ndjson)(\.gz)?$/.test(r)) return 'json';
    if (/\.(csv|tsv|txt)(\.gz)?$/.test(r)) return 'csv';
    return null;
}

/** Lo que dice cada estado, en una línea. null = está bien. */
export const TEXTO_ESTADO = {
    encontrada: null,
    remota: null,
    sin_ubicar: 'No location on this machine',
    no_encontrada: 'File not found here',
    no_es_archivo: 'The location is not a file',
    // Fuentes de tipo carpeta (C3)
    no_es_carpeta: 'The location is not a folder',
    vacia: 'No matching file in the folder yet',
    llegando: 'A file is still arriving',
};

/** Elegir un archivo con el diálogo nativo (fuera de Electron, null). */
export async function elegirArchivo() {
    if (!window.electronAPI?.openFileDialog) return null;
    const r = await window.electronAPI.openFileDialog({
        title: 'Choose the source file',
        filters: [
            { name: 'Data files', extensions: ['xlsx', 'xlsm', 'csv', 'tsv', 'txt', 'parquet', 'json', 'jsonl', 'ndjson'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    return r && !r.canceled && r.filePaths?.[0] ? r.filePaths[0] : null;
}

/** Lo que hay ahora en una carpeta con un patrón: { total, archivos: [{ ruta, nombre, modificada, quieto }] }. */
export const archivosDeLaCarpeta = (dir, patron, subcarpetas) =>
    pedir('GET', `/api/fuentes/carpeta?${new URLSearchParams({ dir, patron: patron || '*', subcarpetas: subcarpetas ? '1' : '' })}`);

/** Elegir una carpeta con el diálogo nativo (fuera de Electron, null). */
export async function elegirCarpeta() {
    if (!window.electronAPI?.selectFolder) return null;
    const r = await window.electronAPI.selectFolder();
    if (!r) return null;
    if (typeof r === 'string') return r;
    return !r.canceled && r.filePaths?.[0] ? r.filePaths[0] : null;
}
