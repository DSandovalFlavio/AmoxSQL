/**
 * Buscar y filtrar en todo el proyecto desde el explorador (6.0, M11).
 *
 * Antes, la búsqueda del explorador sólo miraba la carpeta en pantalla: para
 * encontrar `cierre.sql` había que saber ya dónde estaba. Ahora, con texto o
 * con un tipo marcado, se busca en el índice del proyecto (`/api/files/index`)
 * y se enseña una lista plana con la carpeta de cada uno. Puro.
 */

/** Los tipos que se pueden marcar, en el orden del menú. */
export const TIPOS_DE_FILTRO = [
    { id: 'sql', etiqueta: 'SQL', ext: ['sql'] },
    { id: 'sqlnb', etiqueta: 'Notebooks', ext: ['sqlnb'] },
    { id: 'amoxvis', etiqueta: 'Charts', ext: ['amoxvis'] },
    { id: 'sqlchain', etiqueta: 'Data Flow', ext: ['sqlchain'] },
    { id: 'informes', etiqueta: 'Decks, canvases and diagrams', ext: ['amoxdeck', 'amoxcanvas', 'amoxdiagram'] },
    { id: 'datos', etiqueta: 'Data files', ext: ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson', 'xlsx', 'xls'] },
    { id: 'texto', etiqueta: 'Markdown and text', ext: ['md', 'mdx', 'txt', 'rst'] },
];

const extDe = (nombre) => {
    const n = String(nombre || '').toLowerCase();
    const i = n.lastIndexOf('.');
    return i > 0 ? n.slice(i + 1) : '';
};

/** ¿Pasa este nombre los tipos marcados? Sin ninguno marcado, pasa todo. */
export function pasaTipos(nombre, tipos) {
    if (!tipos || tipos.size === 0) return true;
    const ext = extDe(nombre);
    return TIPOS_DE_FILTRO.some(t => tipos.has(t.id) && t.ext.includes(ext));
}

/**
 * Lo que se enseña al buscar. Con una barra en el texto se compara con la
 * ruta entera (`informes/cierre`); si no, con el nombre. Primero los que
 * empiezan por el texto, luego por nombre y ruta. Como mucho `tope`.
 *
 * @param {Array<{ name: string, path: string }>} indice
 * @param {string} texto
 * @param {Set<string>} tipos
 */
export function buscarEnProyecto(indice, texto, tipos, tope = 500) {
    const q = String(texto || '').trim().toLowerCase();
    const porRuta = q.includes('/');
    const lista = [];
    for (const f of indice || []) {
        if (!pasaTipos(f.name, tipos)) continue;
        if (q) {
            const donde = (porRuta ? f.path : f.name).toLowerCase();
            if (!donde.includes(q)) continue;
        }
        lista.push(f);
    }
    const nombre = (f) => f.name.toLowerCase();
    lista.sort((a, b) => {
        if (q) {
            const ea = nombre(a).startsWith(q), eb = nombre(b).startsWith(q);
            if (ea !== eb) return ea ? -1 : 1;
        }
        return nombre(a).localeCompare(nombre(b)) || a.path.localeCompare(b.path);
    });
    return lista.slice(0, tope);
}

/** Las carpetas que contienen algún cambio de git (todas las de encima de cada archivo). */
export function carpetasConCambios(rutasCambiadas) {
    const carpetas = new Set();
    for (const r of rutasCambiadas || []) {
        const partes = String(r).replace(/\\/g, '/').split('/').filter(Boolean);
        for (let i = 1; i < partes.length; i++) carpetas.add(partes.slice(0, i).join('/'));
    }
    return carpetas;
}
