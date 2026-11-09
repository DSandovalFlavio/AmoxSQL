/**
 * Las variables del proyecto en el cliente (6.0, Dec-98). Una sola lista para todo
 * AmoxSQL: la sección Variables de SQL Snippets, la barra Variables del editor, el
 * completado de `$` y el Assistant la leen del servidor (`/api/variables`), que la
 * guarda en `.amoxsql/variables.json` y la pone en el motor.
 *
 * Quien la cambia avisa con el evento `amox_variables` ({ variables }); los demás
 * escuchan y se ponen al día. `window.__amoxVariables` es la última conocida (para el
 * completado de Monaco, que vive fuera de React).
 */
import { API_BASE } from '../api.js';

export const TIPOS = [
    { id: 'texto', label: 'Text' },
    { id: 'numero', label: 'Number' },
    { id: 'fecha', label: 'Date' },
    { id: 'logico', label: 'Yes / no' },
    { id: 'lista', label: 'List' },
];
export const etiquetaDeTipo = (t) => TIPOS.find(x => x.id === t)?.label || 'Text';

const publicar = (variables) => {
    window.__amoxVariables = variables;
    window.dispatchEvent(new CustomEvent('amox_variables', { detail: { variables } }));
};

export async function cargarVariables() {
    try {
        const r = await fetch(`${API_BASE}/api/variables`);
        const d = await r.json();
        const variables = Array.isArray(d.variables) ? d.variables : [];
        publicar(variables);
        return { variables, avisos: d.avisos || [], proyecto: !!d.proyecto };
    } catch {
        return { variables: [], avisos: [], proyecto: false };
    }
}

/** Guarda la lista entera. Devuelve { variables } o { error } (lo que no es válido no se guarda). */
export async function guardarVariables(variables) {
    try {
        const r = await fetch(`${API_BASE}/api/variables`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variables }),
        });
        const d = await r.json();
        if (!r.ok) return { error: d.error || 'The variables could not be saved.' };
        publicar(d.variables);
        return { variables: d.variables };
    } catch (e) {
        return { error: e.message };
    }
}

/** Un valor para enseñarlo en una línea. */
export function valorEnTexto(v) {
    if (v.valor === null || v.valor === undefined || v.valor === '') return '—';
    if (v.tipo === 'lista') return (v.valor || []).join(', ');
    if (v.tipo === 'logico') return v.valor ? 'yes' : 'no';
    return String(v.valor);
}

// ── La barra del editor: { name, value, type: text|number|date } ⇄ la del proyecto ──
const DE_BARRA = { text: 'texto', number: 'numero', date: 'fecha' };
const A_BARRA = { texto: 'text', numero: 'number', fecha: 'date' };

export const aBarra = (variables) => (variables || []).map(v => ({
    name: v.nombre,
    value: v.tipo === 'lista' ? (v.valor || []).join(', ') : v.tipo === 'logico' ? (v.valor ? 'true' : 'false') : (v.valor ?? ''),
    type: A_BARRA[v.tipo] || 'text',
    tipo: v.tipo,
    descripcion: v.descripcion,
}));

export const deBarra = (lista) => (lista || []).filter(v => v.name).map(v => ({
    nombre: v.name,
    // Un tipo que la barra no sabe editar (lógico, lista) se conserva.
    tipo: v.tipo && !A_BARRA[v.tipo] ? v.tipo : (DE_BARRA[v.type] || 'texto'),
    valor: v.value,
    ...(v.descripcion ? { descripcion: v.descripcion } : {}),
}));
