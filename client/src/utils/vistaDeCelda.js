/**
 * De una celda escrita a las sentencias que se mandan al motor.
 *
 * Esto es lo que justifica que el cuaderno exista como formato propio: **nadie
 * escribe `CREATE OR REPLACE TEMP VIEW`**. Se escribe la consulta, la celda le
 * pone nombre, y la siguiente celda ya puede hacer `FROM ese_nombre`. La sesión
 * es el dataframe, y hasta ahora la interfaz no lo contaba.
 *
 * ## Lo que se manda son dos piezas, no una
 *
 * `preparacion` deja la vista puesta y `lector` trae las filas. Van separadas
 * porque **el límite de filas sólo sabe recortar una consulta que empiece por
 * `SELECT`**: si se mandara todo junto, el texto empezaría por `CREATE` y la
 * celda se traería la tabla entera al navegador sin que nadie lo pidiera.
 *
 * ## Los nombres van siempre entre comillas
 *
 * Comprobado contra el motor: crear `"paso_1"` y leerlo como `paso_1` funciona,
 * `"Ventas Netas"` se lee como `"ventas netas"`, y hasta `"select"` vale. Citar
 * siempre cuesta nada y evita tener que llevar la lista de palabras reservadas.
 */

/** Un identificador, siempre entre comillas dobles. */
export function citarIdentificador(nombre) {
    return `"${String(nombre).replace(/"/g, '""')}"`;
}

/** Un literal de texto, con las comillas simples dobladas. */
export function citarTexto(texto) {
    return `'${String(texto).replace(/'/g, "''")}'`;
}

/**
 * Qué le pasa a un nombre para no servir, o `null` si sirve.
 *
 * Se es permisivo a propósito —las comillas admiten casi todo— y sólo se para
 * lo que rompería de verdad o confundiría al leerlo.
 */
export function problemaDeNombre(nombre) {
    const t = String(nombre || '').trim();
    if (!t) return 'No name';
    if (t.length > 120) return 'Too long';
    if (/["]/.test(t)) return 'It cannot contain double quotes';
    if (/[\r\n\t;]/.test(t)) return 'It cannot contain line breaks or semicolons';
    if (/^\d/.test(t)) return 'It cannot start with a number';
    return null;
}

/**
 * El primer `paso_N` libre.
 *
 * Se busca el hueco más bajo en vez de contar celdas: si se borra la tercera de
 * cinco, el nombre que se libera se reutiliza, y sobre todo **el nombre no
 * depende de la posición**. Un nombre que cambiara al reordenar rompería el
 * `FROM paso_3` que alguien escribió en la celda de abajo.
 */
export function nombrePorOmision(usados) {
    const tomados = new Set((usados || []).map((n) => String(n || '').trim().toLowerCase()));
    for (let i = 1; ; i++) {
        const candidato = `paso_${i}`;
        if (!tomados.has(candidato)) return candidato;
    }
}

/** Quita el punto y coma final para poder envolver la consulta. */
function sinPuntoFinal(sql) {
    return String(sql || '').trimEnd().replace(/;+\s*$/, '');
}

/**
 * Las sentencias que hay que mandar para ejecutar una celda.
 *
 * @param {object} opciones
 * @param {string} opciones.sql el texto de la celda
 * @param {object} opciones.analisis lo que devolvió `analizarCelda`
 * @param {string} [opciones.nombre] el nombre de la celda
 * @param {string} [opciones.descripcion] la descripción (del comentario de arriba)
 * @param {boolean} [opciones.materializar] tabla temporal en vez de vista
 * @returns {{preparacion: string, lector: string, vista: string|null, deja: string}}
 *   `deja` es `'vista'`, `'tabla'`, `'propia'` (la escribió quien la usa) o
 *   `'nada'` (no se puede envolver, y eso no es un error).
 */
export function componerCelda({ sql, analisis, nombre, descripcion, materializar } = {}) {
    const texto = String(sql || '');
    const nada = { preparacion: '', lector: texto, vista: null, deja: 'nada' };
    if (!analisis || analisis.vacia) return { ...nada, lector: texto };

    // Ya la escribió quien la usa: se respeta tal cual y el nombre es el suyo.
    // Reescribirla sería quitarle el control a quien fue explícito.
    if (analisis.vistaPropia) {
        return {
            preparacion: texto,
            lector: `SELECT * FROM ${citarIdentificador(analisis.vistaPropia)}`,
            vista: analisis.vistaPropia,
            deja: 'propia',
        };
    }

    // Un `INSERT`, un `COPY`, varias sentencias: se ejecuta tal cual. La celda
    // lo dirá —«no deja vista»— sin tratarlo como un fallo, porque no lo es.
    if (!analisis.envolvible) return nada;

    const limpio = String(nombre || '').trim();
    if (!limpio || problemaDeNombre(limpio)) return nada;

    const id = citarIdentificador(limpio);
    const clase = materializar ? 'TEMP TABLE' : 'TEMP VIEW';
    const cuerpo = sinPuntoFinal(texto);

    // El salto de línea tras el paréntesis no es estética: si la consulta
    // empieza por un comentario `--`, pegarlo a `AS (` dejaría el paréntesis
    // dentro del comentario.
    //
    // Aquí NO se tira nada. `CREATE OR REPLACE` no sabe cambiar de tipo —con
    // una vista puesta, `CREATE OR REPLACE TEMP TABLE` responde «Existing
    // object x is of type View»— pero saber si hay que relevarla exige mirar el
    // catálogo, y eso es estado del motor: lo decide el servidor, al ejecutar.
    //
    // La primera versión lo resolvía aquí, mandando siempre un `DROP` del otro
    // tipo. Estaba mal: `DROP ... IF EXISTS` **no perdona el desajuste de
    // tipo**, sólo la ausencia. Con la vista ya creada, el `DROP TABLE IF
    // EXISTS` de la segunda ejecución fallaba, así que ninguna celda se podía
    // ejecutar dos veces. Seis pruebas contra el motor y ninguna cubría eso,
    // que es lo que pasa siempre.
    const sentencias = [
        `CREATE OR REPLACE ${clase} ${id} AS (\n${cuerpo}\n);`,
    ];

    // La descripción se guarda EN EL MOTOR, no sólo en el documento: así la
    // vista se explica sola desde cualquier sitio que lea el catálogo.
    const desc = String(descripcion || '').trim();
    if (desc) {
        sentencias.push(`COMMENT ON ${materializar ? 'TABLE' : 'VIEW'} ${id} IS ${citarTexto(desc)};`);
    }

    return {
        preparacion: sentencias.join('\n'),
        lector: `SELECT * FROM ${id}`,
        vista: limpio,
        deja: materializar ? 'tabla' : 'vista',
    };
}
