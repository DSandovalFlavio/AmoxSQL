/**
 * La palabra con la que el usuario llama a lo que agrupa sus proyectos (B8).
 *
 * Cada usuario elige la suya —Clients, Teams, Brands, Products o Workspaces— y
 * TODO texto que nombre el concepto pasa por aquí: nunca se escribe la palabra
 * a mano en un componente. La guarda `scripts/probarPalabraProject.mjs` vigila
 * que «workspace» no vuelva a significar carpeta.
 *
 *     const e = useEtiqueta();
 *     `New ${e.s}…`          → "New client…"
 *     `${e.P} group them.`   → "Clients group them."
 */
import { useEffect, useState } from 'react';
import { API_BASE } from './api.js';

export const FORMAS = {
    clients:    { s: 'client',    p: 'clients' },
    teams:      { s: 'team',      p: 'teams' },
    brands:     { s: 'brand',     p: 'brands' },
    products:   { s: 'product',   p: 'products' },
    workspaces: { s: 'workspace', p: 'workspaces' },
};
export const CLAVES = Object.keys(FORMAS);

const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Las cuatro formas de una clave: s, S (singular), p, P (plural). */
export function formas(clave) {
    const f = FORMAS[clave] || FORMAS.workspaces;
    return { clave: FORMAS[clave] ? clave : 'workspaces', s: f.s, S: mayuscula(f.s), p: f.p, P: mayuscula(f.p) };
}

// Una sola copia para toda la app: se pide una vez y avisa a quien la use.
let estado = { ...formas('workspaces'), elegida: null, actualizacion: false, cargada: false };
const oyentes = new Set();
let pedida = null;

function publicar(nuevo) {
    estado = nuevo;
    for (const o of oyentes) o(estado);
}

/** El valor de ahora, no el de cuando se pidió (la promesa se guarda resuelta). */
export const etiquetaActual = () => estado;

export function cargarEtiqueta(forzar = false) {
    if (pedida && !forzar) return pedida.then(() => estado);
    pedida = fetch(`${API_BASE}/api/preferencias/etiqueta`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
            if (d) publicar({ ...formas(d.clave), elegida: d.elegida, actualizacion: !!d.actualizacion, cargada: true });
            return estado;
        })
        .catch(() => { pedida = null; return estado; });
    return pedida;
}

export async function elegirEtiqueta(clave) {
    const r = await fetch(`${API_BASE}/api/preferencias/etiqueta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save it.');
    publicar({ ...estado, ...formas(clave), elegida: true, cargada: true });
    return estado;
}

export function useEtiqueta() {
    const [e, setE] = useState(estado);
    useEffect(() => {
        oyentes.add(setE);
        setE(estado);
        cargarEtiqueta();
        return () => { oyentes.delete(setE); };
    }, []);
    return e;
}
