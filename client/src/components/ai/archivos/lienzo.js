/**
 * **El Assistant en un Canvas** (plan del Assistant, E5).
 *
 * El modelo ve las tarjetas —con lo que lee cada una, que son las flechas— y
 * nunca las fotos (C1). Propone una tarjeta a la vez: cambiar el SQL de una
 * consulta o el texto de una nota, o añadir una tarjeta junto a otra. La
 * revisión es una tarjeta fantasma sobre el lienzo.
 *
 * Puro. Lo usan el panel (estado), el Canvas y las pruebas.
 */

const limpio = (t) => String(t ?? '').replace(/\r/g, '').trim();

/** ¿Es una propuesta para el Canvas? */
export const esDeTarjeta = (r) => r?.action === 'propose_change' && r.objetivo?.tipo === 'tarjeta';

/** Cómo se dice de dónde lee una Source. */
function origenDe(o) {
    if (!o) return null;
    if (o.tipo === 'tabla') return `the table ${o.nombre}`;
    if (o.tipo === 'archivo') return `the file ${o.ruta}`;
    if (o.tipo === 'fuente') return `the named source ${o.nombre}`;
    return null;
}

/**
 * Lo que el Assistant ve del Canvas: cada tarjeta con su tipo, su SQL o su texto
 * y lo que lee. Sin fotos, sin posiciones.
 * @param {object} lienzo - el documento (`leerLienzo`)
 * @param {{ flechas: Array<{de, a}>, estados: Map }} extra
 */
export function estructuraDeLienzo(lienzo, { flechas = [], estados = new Map(), errores = {} } = {}) {
    return {
        titulo: lienzo?.titulo || null,
        parametros: { ...(lienzo?.parametros || {}) },
        tarjetas: (lienzo?.tarjetas || []).map(t => ({
            id: t.id, tipo: t.tipo,
            ...(t.titulo ? { titulo: t.titulo } : {}),
            ...(t.tipo === 'query' ? { sql: String(t.sql || '') } : {}),
            ...((t.tipo === 'note' || t.tipo === 'text') ? { texto: String(t.texto || '') } : {}),
            ...(t.tipo === 'source' ? { origen: origenDe(t.origen) } : {}),
            ...(t.desde ? { desde: t.desde } : {}),
            ...(t.marco ? { marco: t.marco } : {}),
            lee: flechas.filter(e => e.a === t.id && e.de !== t.id).map(e => e.de),
            ...(errores[t.id] ? { estado: 'error' } : estados.get?.(t.id) ? { estado: estados.get(t.id) } : {}),
        })),
    };
}

/** ¿Sigue valiendo? La tarjeta que cambia sigue como estaba; el nombre nuevo, libre. */
export function vigenteEnLienzo(lienzo, r) {
    if (!esDeTarjeta(r)) return false;
    const o = r.objetivo;
    const tarjetas = lienzo?.tarjetas || [];
    if (o.accion === 'cambiar') {
        const t = tarjetas.find(x => x.id === o.id);
        return !!t && limpio(t[o.campo]) === limpio(r.original);
    }
    if (o.id && tarjetas.some(t => t.id.toLowerCase() === o.id.toLowerCase())) return false;
    return !o.cerca || tarjetas.some(t => t.id === o.cerca);
}

/** Dónde va una tarjeta nueva: a la derecha de la de `cerca`, o junto a la última. */
export function sitioDeNueva(lienzo, r, [w, h] = [380, 300]) {
    const tarjetas = (lienzo?.tarjetas || []).filter(t => t.tipo !== 'frame');
    const ref = tarjetas.find(t => t.id === r.objetivo?.cerca) || tarjetas[tarjetas.length - 1];
    if (!ref) return { x: 0, y: 0, w, h };
    return { x: Math.round((ref.x ?? 0) + (ref.w ?? 380) + 70), y: Math.round(ref.y ?? 0), w, h };
}

/**
 * El Canvas con la propuesta aplicada, o `{ error }`.
 * @param {(base: string) => string} idLibre - para una nota o un texto, que no traen nombre
 */
export function aplicarALienzo(lienzo, r, { idLibre, tamano = {} } = {}) {
    if (!vigenteEnLienzo(lienzo, r)) return { error: 'That card changed since this was proposed.' };
    const o = r.objetivo;
    const contenido = String(r.contenido ?? '').replace(/\r/g, '');
    if (o.accion === 'cambiar') {
        return { lienzo: { ...lienzo, tarjetas: lienzo.tarjetas.map(t => (t.id === o.id ? { ...t, [o.campo]: contenido } : t)) }, id: o.id };
    }
    const id = o.id || idLibre(o.tarjetaTipo === 'note' ? 'nota' : 'texto');
    const sitio = sitioDeNueva(lienzo, r, tamano[o.tarjetaTipo]);
    const nueva = { id, tipo: o.tarjetaTipo, ...sitio, [o.campo]: contenido };
    return { lienzo: { ...lienzo, tarjetas: [...lienzo.tarjetas, nueva] }, id };
}

/** «Change to the card ventas_sur», «New query card top_ciudades». */
export function describirTarjeta(r) {
    const o = r?.objetivo || {};
    const que = { query: 'query', note: 'note', text: 'text' }[o.tarjetaTipo] || 'card';
    if (o.accion === 'cambiar') return `Change to the ${que} ${o.id}`;
    return `New ${que} card${o.id ? ` ${o.id}` : ''}${o.cerca ? ` next to ${o.cerca}` : ''}`;
}
