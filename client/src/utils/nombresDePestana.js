/**
 * Los nombres de las pestañas (6.0, M11).
 *
 * Ocho pestañas «Untitled.sql» no se distinguían: el único cambio era el punto
 * de «sin guardar». Ahora una pestaña nueva se llama por su tipo y un número
 * («Query 1.sql», «Notebook 2.sqlnb»), el más bajo libre entre las abiertas; y
 * dos pestañas con el mismo nombre (dos `cierre.sql` de carpetas distintas)
 * enseñan su carpeta al lado.
 *
 * Pura, sin React: `scripts/probarNombresDePestana.mjs`.
 */

const BASES = {
    sql: ['Query', 'sql'],
    sqlnb: ['Notebook', 'sqlnb'],
    sqlchain: ['Data Flow', 'sqlchain'],
    md: ['Note', 'md'],
    amoxdeck: ['Report', 'amoxdeck'],
    amoxdiagram: ['Diagram', 'amoxdiagram'],
    amoxcanvas: ['Canvas', 'amoxcanvas'],
    amoxvis: ['Chart', 'amoxvis'],
    texto: ['Text', 'txt'],
};

/** ¿Es un tipo que nace con nombre «Base N.ext»? */
export const tieneNombreNumerado = (tipo) => !!BASES[tipo];

/**
 * El nombre de una pestaña nueva de ese tipo: «Query 1.sql», o el número más
 * bajo que no esté ya abierto.
 * @param {string} tipo
 * @param {string[]} abiertos  los nombres de las pestañas abiertas (de los dos paneles)
 */
export function nombreNuevo(tipo, abiertos = []) {
    const [base, ext] = BASES[tipo] || BASES.sql;
    const usados = new Set(abiertos.map(n => String(n).toLowerCase()));
    for (let n = 1; ; n++) {
        const nombre = `${base} ${n}.${ext}`;
        if (!usados.has(nombre.toLowerCase())) return nombre;
    }
}

const partes = (ruta) => String(ruta || '').split(/[\\/]+/).filter(Boolean);

/**
 * Lo que distingue a cada pestaña de otra con el mismo nombre: su carpeta (o
 * las dos últimas, si la carpeta también coincide). Sólo para las que chocan.
 * @param {{id:string,name:string,path?:string}[]} pestanas
 * @returns {Map<string,string>}  id → «flujos» / «2024/flujos»
 */
export function carpetasQueDistinguen(pestanas = []) {
    const porNombre = new Map();
    for (const t of pestanas) {
        const k = String(t.name || '').toLowerCase();
        if (!porNombre.has(k)) porNombre.set(k, []);
        porNombre.get(k).push(t);
    }
    const out = new Map();
    for (const grupo of porNombre.values()) {
        if (grupo.length < 2) continue;
        for (const t of grupo) {
            const carpetas = partes(t.path).slice(0, -1);
            if (!carpetas.length) continue;   // sin guardar: el nombre ya es único («Query 1»)
            let n = 1;
            const sufijo = (k) => carpetas.slice(-k).join('/');
            // Una carpeta más mientras otra del grupo termine igual.
            while (n < carpetas.length && grupo.some(o => o !== t && partes(o.path).slice(0, -1).slice(-n).join('/') === sufijo(n))) n++;
            out.set(t.id, sufijo(n));
        }
    }
    return out;
}
