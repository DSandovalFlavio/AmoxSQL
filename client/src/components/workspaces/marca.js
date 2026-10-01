/**
 * La marca del workspace de la carpeta abierta (B5): color, paleta y logo.
 *
 * Los decks y las figuras que se crean NUEVOS en un proyecto enlazado la toman
 * como valores iniciales; lo que ya existe no cambia (no es retroactivo). Y lo
 * que se hereda se escribe en el propio archivo —el acento y el logo en el
 * front-matter del deck, la paleta en el .amoxvis—: el archivo sigue viéndose
 * igual fuera de este workspace o en otra máquina.
 */
import { API_BASE } from '../../api.js';
import { ACCENTS } from '../../accents.js';

let marca = null;

export const marcaActual = () => marca;
export const olvidarMarca = () => { marca = null; };

export async function refrescarMarca() {
    try {
        const r = await fetch(`${API_BASE}/api/project/marca`);
        marca = r.ok ? ((await r.json()).marca || null) : null;
    } catch {
        marca = null;
    }
    return marca;
}

const rgb = (hex) => {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};

/** El acento de la app más cercano a un color (los decks usan acentos con nombre). */
export function acentoCercano(hex) {
    const c = rgb(hex);
    if (!c) return null;
    let mejor = null;
    let distancia = Infinity;
    for (const a of ACCENTS) {
        const o = rgb(a.color);
        if (!o) continue;
        const d = (c[0] - o[0]) ** 2 + (c[1] - o[1]) ** 2 + (c[2] - o[2]) ** 2;
        if (d < distancia) { distancia = d; mejor = a.id; }
    }
    return mejor;
}

/** Una figura nueva: la paleta de la marca, si la hay. */
export function conMarcaGrafico(config) {
    const m = marca;
    if (!m || !Array.isArray(m.paleta) || m.paleta.length < 2) return config;
    return { ...config, colorTheme: 'brand', brandColors: m.paleta };
}

/** Un deck nuevo: el acento más cercano al color de la marca y su logo en la portada. */
export function conMarcaDeck(texto) {
    const m = marca;
    if (!m || !texto.startsWith('---')) return texto;
    const lineas = [];
    const acento = m.color ? acentoCercano(m.color) : null;
    if (acento) lineas.push(`accent: ${acento}`);
    if (m.logo) lineas.push(`logo: "${m.logo}"`);
    if (!lineas.length) return texto;
    // Justo después de la primera línea del front-matter (`---`).
    const fin = texto.indexOf('\n');
    return `${texto.slice(0, fin + 1)}${lineas.join('\n')}\n${texto.slice(fin + 1)}`;
}
