/**
 * **El Assistant en un notebook** (plan del Assistant, E3).
 *
 * El cuaderno no se cambia por líneas ni entero: se cambia **por celdas**. Una
 * propuesta cambia el texto de una celda (`cambiar`) o añade una celda después de
 * otra (`despues_de`), y nunca toca las demás, los nombres, las marcas ni los
 * parámetros (N1).
 *
 * Las celdas no tienen identificador en el archivo: el `id` se inventa al leer.
 * Así que una propuesta las señala como la ve el modelo —su número— y además por
 * lo que no cambia sin que el usuario la toque: su nombre, si lo tiene, y su
 * texto. Si la celda se movió, se encuentra; si su texto cambió, la propuesta
 * caducó.
 *
 * Puro. Lo usan el panel (estado de una propuesta), el editor del cuaderno (que la
 * aplica sobre su propio documento, conservando los `id` y con ellos los
 * resultados de las demás celdas) y las pruebas.
 */

const limpio = (t) => String(t ?? '').replace(/\r/g, '').trim();
const llave = (n) => String(n || '').trim().toLowerCase();

/** ¿Es una propuesta por celdas? */
export const esDeCelda = (r) => r?.action === 'propose_change' && r.objetivo?.tipo === 'celda';

/**
 * Lo que el Assistant ve del cuaderno: cada celda con su número, su tipo, su
 * nombre, qué lee y si corrió o falló. Viaja en el foco; el servidor lo convierte
 * en texto para el modelo y lo usa para validar una propuesta.
 *
 * @param {object} doc - `{ meta, celdas }` de `leerCuaderno`
 * @param {object} extra - `{ analisis: id → { lee }, resultados: id → { error, data }, vivas: [{ nombre }] }`
 */
export function estructuraDeCuaderno(doc, { analisis = {}, resultados = {}, vivas = [] } = {}) {
    return {
        parametros: { ...(doc?.meta?.parametros || {}) },
        vivas: (vivas || []).map(v => v?.nombre).filter(Boolean).slice(0, 60),
        celdas: (doc?.celdas || []).map((c, i) => {
            const r = resultados[c.id];
            return {
                n: i + 1,
                tipo: c.tipo === 'texto' ? 'texto' : 'sql',
                nombre: c.tipo === 'texto' ? null : (String(c.nombre || '').trim() || null),
                texto: String(c.contenido || ''),
                ...(c.tipo === 'sql' ? { lee: (analisis[c.id]?.lee || []).slice(0, 20) } : {}),
                ...(c.materializada ? { materializada: true } : {}),
                ...(c.borrador ? { borrador: true } : {}),
                ...(r ? (r.error ? { estado: 'error' } : { estado: 'corrio', filas: Array.isArray(r.data) ? r.data.length : undefined }) : {}),
            };
        }),
    };
}

/** La celda a la que apunta una referencia: por nombre, por número con su texto, o por su texto si es único. */
function hallar(celdas, { n, nombre, original }) {
    const texto = limpio(original);
    if (nombre) {
        const conNombre = celdas.map((c, i) => [c, i]).filter(([c]) => llave(c.nombre) === llave(nombre));
        if (conNombre.length !== 1) return null;
        const [c, i] = conNombre[0];
        return limpio(c.contenido) === texto ? i : null;
    }
    if (n >= 1 && n <= celdas.length && limpio(celdas[n - 1].contenido) === texto) return n - 1;
    const iguales = celdas.map((c, i) => [c, i]).filter(([c]) => limpio(c.contenido) === texto);
    return iguales.length === 1 ? iguales[0][1] : null;
}

/**
 * Dónde cae hoy la propuesta, o null si caducó.
 * @returns {{ indice: number, insertar: boolean } | null} `indice` desde 0: la celda que cambia, o dónde entra la nueva
 */
export function ubicarCelda(celdas, r) {
    if (!esDeCelda(r)) return null;
    const o = r.objetivo;
    if (o.accion === 'despues_de') {
        if (!o.n) return { indice: 0, insertar: true };
        const i = hallar(celdas, { n: o.n, nombre: r.anclaNombre, original: r.original });
        return i === null ? null : { indice: i + 1, insertar: true };
    }
    const i = hallar(celdas, { n: o.n, nombre: r.anclaNombre, original: r.original });
    if (i === null) return null;
    // Una celda de SQL no se convierte en texto ni al revés.
    const tipo = celdas[i].tipo === 'texto' ? 'texto' : 'sql';
    return tipo === o.celdaTipo ? { indice: i, insertar: false } : null;
}

/**
 * Las celdas con la propuesta aplicada (las demás, las mismas: conservan su `id`).
 * @param {() => string} idNuevo - cómo se llama la celda nueva
 */
export function aplicarACeldas(celdas, r, idNuevo) {
    const donde = ubicarCelda(celdas, r);
    if (!donde) return { error: 'That cell changed since this was proposed.' };
    const out = [...celdas];
    const contenido = String(r.contenido ?? '').replace(/\r/g, '');
    if (donde.insertar) {
        const nueva = r.objetivo.celdaTipo === 'texto'
            ? { id: idNuevo(), tipo: 'texto', contenido }
            : { id: idNuevo(), tipo: 'sql', nombre: String(r.objetivo.nombre || '').trim(), materializada: false, contenido };
        out.splice(donde.indice, 0, nueva);
        return { celdas: out, donde, id: nueva.id };
    }
    out[donde.indice] = { ...out[donde.indice], contenido };
    return { celdas: out, donde, id: out[donde.indice].id };
}

/** «Change to cell 3 (ventas_mes)», «New SQL cell after cell 2». */
export function describirCelda(r, donde = null) {
    const o = r?.objetivo || {};
    const n = donde ? (donde.insertar ? donde.indice : donde.indice + 1) : o.n;
    const nombre = r?.anclaNombre ? ` (${r.anclaNombre})` : '';
    if (o.accion === 'despues_de') {
        const que = o.celdaTipo === 'texto' ? 'text cell' : `SQL cell${o.nombre ? ` ${o.nombre}` : ''}`;
        return n ? `New ${que} after cell ${n}${nombre}` : `New ${que} at the top`;
    }
    return `Change to cell ${n}${nombre}`;
}
