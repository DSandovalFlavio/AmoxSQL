/**
 * Encontrar y reemplazar bloques cercados dentro de un markdown.
 *
 * Esto vivía dentro de `deck/deckBlockModel.js`, atado a la lista de lenguajes
 * del deck. AmoxDiagram necesita lo mismo para los bloques ` ```mermaid `, y la
 * tentación era copiarlo: son doce líneas.
 *
 * No se copia. En este repo la función de contraste llegó a tener **tres**
 * copias y la tercera estaba mal — decía calcular luminancia WCAG y calculaba
 * brillo YIQ, y el síntoma fue una etiqueta ilegible en un gráfico, a años luz
 * del sitio donde estaba el fallo. Doce líneas duplicadas no son baratas: son
 * doce líneas que alguien arreglará en un sitio y no en el otro.
 */

/**
 * Todos los bloques cercados de un texto, en orden.
 *
 * `lenguajes` filtra por el infotexto de la cerca; sin él vienen todos.
 *
 * Se recorre cerca por cerca en vez de con una expresión que abarque todo: así
 * un bloque **sin cerrar** no se traga el resto del documento, que es justo el
 * estado en el que está mientras alguien lo escribe.
 *
 * El salto contempla el retorno de carro: en Windows un archivo llega con CRLF,
 * y olvidarlo es el mismo descuido que una vez dejó la disposición de dos
 * columnas del deck sin partir.
 */
export function bloquesCercados(texto, lenguajes = null) {
    const re = /```([a-z]*)[ \t]*\r?\n([\s\S]*?)```/g;
    const fuera = [];
    let m;
    while ((m = re.exec(texto || '')) !== null) {
        if (lenguajes && !lenguajes.includes(m[1])) continue;
        fuera.push({ lang: m[1], desde: m.index, hasta: m.index + m[0].length, cuerpo: m[2] });
    }
    return fuera;
}

/** El bloque donde está el cursor, si lo hay. */
export function cercadoEnCursor(texto, caret, lenguajes = null) {
    return bloquesCercados(texto, lenguajes)
        .find((b) => caret >= b.desde && caret <= b.hasta) || null;
}

/**
 * Sustituye el cuerpo de **un** bloque y devuelve el texto completo.
 *
 * Lo de fuera del bloque no se toca, ni un carácter. Es la garantía de la que
 * depende que AmoxDiagram pueda guardar en un markdown de trescientas líneas sin
 * que su autor tenga que revisar el resto.
 */
export function reemplazarCercado(texto, bloque, cuerpoNuevo) {
    const t = texto || '';
    const cerrado = ['```' + bloque.lang, cuerpoNuevo, '```'].join('\n');
    return t.slice(0, bloque.desde) + cerrado + t.slice(bloque.hasta);
}
