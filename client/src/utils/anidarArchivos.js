/**
 * Los archivos que van con otro (6.0, M11).
 *
 * En el explorador, un gráfico guardado desde una consulta (`.amoxvis` con
 * `origen`) se cuelga de su `.sql` cuando están en la misma carpeta: lo que
 * se ve es «la consulta y sus gráficos», no dos archivos sueltos que hay que
 * relacionar de cabeza. Puro: recibe el listado de una carpeta y no toca nada.
 *
 * @param {Array<{ name: string, path: string, isDirectory?: boolean, origen?: string }>} lista
 * @returns {{ sueltos: Array, anidados: Map<string, Array> }}
 *   `sueltos`: lo que va en la lista (en el mismo orden); `anidados`: ruta del
 *   padre → sus hijos (en el mismo orden en que venían).
 */
export function anidarRelacionados(lista) {
    const norm = (p) => String(p || '').replace(/\\/g, '/');
    const consultas = new Set(
        lista.filter(f => !f.isDirectory && /\.sql$/i.test(f.name)).map(f => norm(f.path)),
    );
    const anidados = new Map();
    const sueltos = [];
    for (const f of lista) {
        const padre = !f.isDirectory && /\.amoxvis$/i.test(f.name) && f.origen ? norm(f.origen) : null;
        if (padre && consultas.has(padre)) {
            if (!anidados.has(padre)) anidados.set(padre, []);
            anidados.get(padre).push(f);
        } else {
            sueltos.push(f);
        }
    }
    return { sueltos, anidados };
}
