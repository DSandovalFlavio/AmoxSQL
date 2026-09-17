/**
 * Sacar el cuaderno de AmoxSQL: a un documento de Word, o a un tablero.
 *
 * ## Por qué queda Word y no queda HTML
 *
 * Porque hacen cosas distintas aunque se parezcan. **Un tablero se proyecta; un
 * documento de Word circula** — se comenta, se firma, se adjunta a un correo y
 * acaba en el expediente del análisis. El HTML no hacía ninguna de las dos: era
 * una versión peor del tablero, que además ya tiene su propio puente desde aquí.
 *
 * ## Por qué hay una traducción por medio
 *
 * El exportador a Word es el del cuaderno anterior y se queda como está: funciona
 * y no hay motivo para reescribirlo. Habla de celdas `{id, type, content}` con
 * `type` en inglés, así que aquí se traduce. Cambiar el exportador para que
 * hablara el idioma nuevo sería tocar código que hoy funciona a cambio de nada.
 */

/** Las celdas en la forma que entiende el exportador. */
export function celdasParaExportar(celdas) {
    return (celdas || []).map((c) => ({
        id: c.id,
        type: c.tipo === 'texto' ? 'markdown' : 'code',
        content: String(c.contenido || ''),
    }));
}

/**
 * Las celdas cuyo gráfico **no se va a poder capturar**.
 *
 * El exportador saca las figuras del DOM vivo, así que una celda puesta en «sólo
 * el código» no tiene nada que capturar: su gráfico saldría como tabla o no
 * saldría. Se avisa antes de exportar en vez de descubrirlo en el documento, que
 * es donde nadie vuelve a mirar.
 */
export function graficosQueNoSalen(celdas, claves, estados) {
    const fuera = [];
    for (const c of celdas || []) {
        if (c.tipo !== 'sql') continue;
        const e = estados?.[claves?.[c.id]];
        if (!e || e.vista !== 'chart') continue;
        if (e.modo === 'codigo') fuera.push(String(c.nombre || '').trim() || 'sin nombre');
    }
    return fuera;
}

/**
 * Las diapositivas de un tablero, a partir del cuaderno.
 *
 * El texto se vuelve prosa y cada celda con gráfico se vuelve una diapositiva de
 * figura, con su `.amoxvis` escrito al lado. **Qué celdas tienen gráfico se lee
 * del estado, no del DOM**: el puente anterior miraba la pantalla, así que una
 * celda plegada o fuera de vista no entraba y nadie sabía por qué.
 *
 * @returns {{ordenes: Array, cuantos: number}} `ordenes` son los archivos que hay
 *   que escribir y las diapositivas que salen, sin efectos: quien llama decide
 *   cuándo tocar el disco.
 */
export function planDeTablero(celdas, claves, estados, resultados, base) {
    const nombre = String(base || 'cuaderno').replace(/[^\w-]+/g, '_');
    const trozos = [];
    let figura = 0;

    for (const c of celdas || []) {
        if (c.tipo === 'texto') {
            if (String(c.contenido || '').trim()) trozos.push({ clase: 'prosa', texto: c.contenido });
            continue;
        }
        const e = estados?.[claves?.[c.id]];
        const r = resultados?.[c.id];
        if (!e?.grafico || e.vista !== 'chart' || !(r?.data?.length > 0)) continue;
        figura += 1;
        trozos.push({
            clase: 'figura',
            archivo: `charts/${nombre}_${figura}.amoxvis`,
            contenido: JSON.stringify({ ...e.grafico, query: c.contenido }, null, 2),
        });
    }

    return { trozos, figuras: figura, nombre };
}
