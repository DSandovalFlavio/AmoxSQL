/** Las llamadas del Excel tal como llega (C2, 5.10). Lanzan con el mensaje y el código del servidor. */
import { API_BASE } from '../../api.js';

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, {
        method: metodo,
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) {
        const e = new Error(datos.error || `Request failed (${r.status})`);
        e.codigo = datos.codigo || null;
        throw e;
    }
    return datos;
}

const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')).toString();

export const hojasDelLibro = (ruta) => pedir('GET', `/api/files/inspect-excel?${q({ path: ruta })}`).then(d => d.sheets || []);
export const vistaCruda = (ruta, hoja) => pedir('GET', `/api/excel/vista?${q({ path: ruta, hoja })}`);
export const probarLectura = (ruta, opciones) => pedir('POST', '/api/excel/probar', { path: ruta, opciones });
export const lecturaRecordada = (ruta) => pedir('GET', `/api/excel/recordado?${q({ path: ruta })}`).then(d => d.opciones || null);

// ── Rangos ──────────────────────────────────────────────────────────────────

export const RANGO = /^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d*)$/;

export function columnaANumero(letras) {
    let n = 0;
    for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
    return n;
}

/** `A4:E` → { desde: 'A', fila: 4, hasta: 'E', filaFinal: null } (null si no es un rango). */
export function leerRango(r) {
    const m = RANGO.exec(String(r || '').trim().toUpperCase());
    if (!m) return null;
    return { desde: m[1], fila: Number(m[2]), hasta: m[3], filaFinal: m[4] ? Number(m[4]) : null };
}

export function escribirRango({ desde, fila, hasta, filaFinal }) {
    return `${desde}${fila}:${hasta}${filaFinal || ''}`;
}
