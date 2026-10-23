/**
 * El archivo del Canvas: **`.amoxcanvas`, JSON** (5.15, Dec-54).
 *
 * Un lienzo es estructura —posiciones, tamaños, marcos, conexiones con etiqueta
 * y la foto de cada tarjeta—, no prosa, y JSON es lo que el lienzo de nodos lee
 * y escribe. Para que siga siendo revisable en git:
 *
 * - **Orden fijo** de las claves y de las tarjetas (por id) y sangría de dos:
 *   leer y volver a escribir sin tocar nada devuelve el mismo texto, byte a byte.
 * - **El SQL va en líneas** (`"sql": ["SELECT *", "FROM x"]`): cambiar una línea
 *   de una consulta es un diff de una línea, sin `\n` escapados en medio.
 * - **La foto** (Dec-58) va dentro, con topes: 50 filas por tabla y 2.000 puntos
 *   por gráfico. Un lienzo abre al instante con lo que enseñaba, y **Clear
 *   snapshots** la quita antes de un commit si no se quiere versionar.
 *
 * El modelo en memoria lleva el SQL como texto (`sql: string`); el archivo, como
 * líneas. Un `tipo` desconocido se conserva tal cual: el formato está abierto a
 * tarjetas que lleguen después (una transformación visual, por ejemplo).
 */

export const FORMATO = 'amoxcanvas';
export const VERSION = 1;

/** Los topes de la foto. */
export const FILAS_DE_FOTO = 50;
export const PUNTOS_DE_FOTO = 2000;

/** Las tarjetas que dejan una vista con su nombre: las que otras pueden leer. */
export const DEJAN_VISTA = new Set(['source', 'query']);

/** Los tipos conocidos (Dec-56). Otros se conservan, pero no se pintan. */
export const TIPOS = ['source', 'query', 'chart', 'number', 'note', 'text', 'frame'];

/** El orden en que se escriben las claves de una tarjeta; lo demás va detrás, por nombre. */
const ORDEN_TARJETA = ['id', 'tipo', 'x', 'y', 'w', 'h', 'marco', 'titulo', 'modo', 'materializada',
    'origen', 'sql', 'desde', 'grafico', 'cifra', 'texto', 'color', 'foto'];
const ORDEN_LIENZO = ['formato', 'version', 'titulo', 'descripcion', 'parametros', 'tarjetas', 'etiquetas', 'vista'];
const ORDEN_FOTO = ['cuando', 'filas', 'columnas', 'tipos', 'muestra', 'puntos', 'valor', 'error'];

export const LIENZO_VACIO = Object.freeze({
    titulo: '', descripcion: '', parametros: {}, tarjetas: [], etiquetas: {}, vista: null,
});

/** Un error de formato: el editor lo enseña y NO sobrescribe el archivo. */
export class ErrorDeLienzo extends Error {}

const comoTexto = (sql) => (Array.isArray(sql) ? sql.join('\n') : String(sql ?? ''));
const comoLineas = (sql) => String(sql ?? '').replace(/\r\n?/g, '\n').split('\n');

/**
 * Lee un `.amoxcanvas`. Un archivo vacío es un lienzo vacío; uno que no se
 * entiende **lanza** (nunca se abre «vacío» algo que tenía contenido: el
 * siguiente guardado lo borraría).
 */
export function leerLienzo(texto) {
    const s = String(texto ?? '').trim();
    if (!s) return clonarVacio();
    let j;
    try { j = JSON.parse(s); } catch (e) {
        throw new ErrorDeLienzo(`This canvas file is not valid JSON (${e.message}). It was not opened, so nothing in it is lost.`);
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new ErrorDeLienzo('This file is not a canvas.');
    if (j.formato && j.formato !== FORMATO) throw new ErrorDeLienzo(`This file is a "${j.formato}", not a canvas.`);
    if (Number(j.version) > VERSION) {
        throw new ErrorDeLienzo(`This canvas was saved by a newer AmoxSQL (format ${j.version}). Update AmoxSQL to open it.`);
    }
    const tarjetas = Array.isArray(j.tarjetas) ? j.tarjetas : [];
    const vistos = new Set();
    const leidas = [];
    for (const t of tarjetas) {
        if (!t || typeof t !== 'object' || !t.id) continue;
        if (vistos.has(String(t.id).toLowerCase())) continue;   // la primera manda, como en el cuaderno
        vistos.add(String(t.id).toLowerCase());
        const c = { ...t, id: String(t.id) };
        if ('sql' in c) c.sql = comoTexto(c.sql);
        leidas.push(c);
    }
    return {
        titulo: String(j.titulo ?? ''),
        descripcion: String(j.descripcion ?? ''),
        parametros: j.parametros && typeof j.parametros === 'object' ? { ...j.parametros } : {},
        tarjetas: leidas,
        etiquetas: j.etiquetas && typeof j.etiquetas === 'object' ? { ...j.etiquetas } : {},
        vista: j.vista && typeof j.vista === 'object' ? { ...j.vista } : null,
        // Lo que no conocemos de la raíz, se conserva.
        ...Object.fromEntries(Object.entries(j).filter(([k]) => !ORDEN_LIENZO.includes(k))),
    };
}

function clonarVacio() {
    return { titulo: '', descripcion: '', parametros: {}, tarjetas: [], etiquetas: {}, vista: null };
}

/** Las claves en un orden dado y el resto detrás, por nombre. */
function ordenar(obj, orden) {
    const fuera = {};
    for (const k of orden) if (obj[k] !== undefined) fuera[k] = obj[k];
    for (const k of Object.keys(obj).filter(x => !orden.includes(x)).sort()) if (obj[k] !== undefined) fuera[k] = obj[k];
    return fuera;
}

const ordenarClaves = (obj) => Object.fromEntries(Object.keys(obj || {}).sort().map(k => [k, obj[k]]));

/** La foto, recortada a sus topes y con sus claves en orden. */
export function recortarFoto(foto) {
    if (!foto || typeof foto !== 'object') return undefined;
    const f = { ...foto };
    if (Array.isArray(f.muestra) && f.muestra.length > FILAS_DE_FOTO) f.muestra = f.muestra.slice(0, FILAS_DE_FOTO);
    if (Array.isArray(f.puntos) && f.puntos.length > PUNTOS_DE_FOTO) f.puntos = f.puntos.slice(0, PUNTOS_DE_FOTO);
    return ordenar(f, ORDEN_FOTO);
}

const redondo = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : n);

function paraArchivo(t) {
    const c = { ...t };
    for (const k of ['x', 'y', 'w', 'h']) if (k in c) c[k] = redondo(c[k]);
    if ('sql' in c) c.sql = comoLineas(c.sql);
    if (c.foto) c.foto = recortarFoto(c.foto);
    else delete c.foto;
    for (const k of Object.keys(c)) if (c[k] === undefined || c[k] === null || c[k] === '') delete c[k];
    if (c.materializada === false) delete c.materializada;
    return ordenar(c, ORDEN_TARJETA);
}

/**
 * Escribe el lienzo. **Estable por requisito**: el mismo lienzo da siempre el
 * mismo texto (tarjetas por id, claves en orden, posiciones redondeadas).
 */
export function escribirLienzo(lienzo = LIENZO_VACIO) {
    const l = lienzo || LIENZO_VACIO;
    const tarjetas = [...(l.tarjetas || [])]
        .filter(t => t && t.id)
        .sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'))
        .map(paraArchivo);
    const raiz = ordenar({
        ...Object.fromEntries(Object.entries(l).filter(([k]) => !ORDEN_LIENZO.includes(k))),
        formato: FORMATO,
        version: VERSION,
        titulo: l.titulo || undefined,
        descripcion: l.descripcion || undefined,
        parametros: Object.keys(l.parametros || {}).length ? ordenarClaves(l.parametros) : undefined,
        tarjetas,
        etiquetas: Object.keys(l.etiquetas || {}).length ? ordenarClaves(l.etiquetas) : undefined,
        vista: l.vista ? ordenar({ x: redondo(l.vista.x), y: redondo(l.vista.y), zoom: l.vista.zoom }, ['x', 'y', 'zoom']) : undefined,
    }, ORDEN_LIENZO);
    // La foto en filas, una por línea: con la sangría de siempre cada celda iría
    // en su propia línea y un lienzo de veinte tarjetas tendría miles.
    const compactos = [];
    const marcar = (v) => { compactos.push(v); return `\u0000${compactos.length - 1}\u0000`; };
    for (const t of raiz.tarjetas) {
        if (!t.foto) continue;
        const f = { ...t.foto };
        if (Array.isArray(f.columnas)) f.columnas = marcar(f.columnas);
        if (Array.isArray(f.muestra)) f.muestra = f.muestra.map(marcar);
        if (Array.isArray(f.puntos)) f.puntos = f.puntos.map(marcar);
        t.foto = f;
    }
    const texto = JSON.stringify(raiz, null, 2).replace(/"\\u0000(\d+)\\u0000"/g, (_, i) => JSON.stringify(compactos[Number(i)]));
    return `${texto}\n`;
}

/** **Clear snapshots**: el lienzo sin ninguna foto. */
export function sinFotos(lienzo) {
    return { ...lienzo, tarjetas: (lienzo.tarjetas || []).map(({ foto, ...t }) => t) };
}

/** La clave de una etiqueta escrita a mano: `padre→hijo`. */
export const claveDeEtiqueta = (de, a) => `${de}→${a}`;

/** El título de un lienzo: el suyo, o el primer texto que empiece por `#`. */
export function tituloDeLienzo(lienzo) {
    if (lienzo?.titulo) return lienzo.titulo;
    for (const t of lienzo?.tarjetas || []) {
        if (t.tipo !== 'text') continue;
        const m = /^#+\s+(.+)$/m.exec(t.texto || '');
        if (m) return m[1].trim();
    }
    return '';
}
