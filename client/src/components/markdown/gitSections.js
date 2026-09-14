/**
 * gitSections — cruzar el diff de Git con las secciones del documento.
 *
 * Sirve para responder "¿en qué parte de este runbook llevo dos días
 * trabajando?" sin leerlo entero: el panel de estructura marca cada sección con
 * lo que ha cambiado desde el último commit.
 *
 * OJO con los números de línea. El diff habla del archivo **en disco**; el panel
 * trabaja sobre el documento **en memoria**. En cuanto hay cambios sin guardar,
 * añadir veinte líneas arriba desplaza todo lo de abajo y el indicador mentiría.
 * Por eso quien llama solo debe pedir esto con el documento guardado — y cuando
 * no lo esté, decirlo en vez de enseñar un número inventado.
 */

const CABECERA_HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Recorre un diff unificado y devuelve, en coordenadas del archivo NUEVO:
 *  · `anadidas`  — líneas que no existían antes
 *  · `borradasEn` — líneas donde algo se borró (el hueco que dejó)
 *
 * Se cuenta línea a línea y no por el rango del hunk: un hunk arrastra tres
 * líneas de contexto por lado, así que usar su rango entero marcaría como
 * tocadas secciones que nadie tocó.
 */
export function cambiosPorLinea(diff) {
    const anadidas = new Set();
    const borradasEn = new Set();
    let nueva = 0;

    for (const linea of String(diff || '').split(/\r?\n/)) {
        const hunk = linea.match(CABECERA_HUNK);
        if (hunk) { nueva = Number(hunk[1]); continue; }
        if (!nueva) continue;                       // cabecera del diff, todavía
        if (linea.startsWith('+++') || linea.startsWith('---')) continue;
        if (linea.startsWith('\\')) continue;       // "\ No newline at end of file"

        if (linea.startsWith('+')) { anadidas.add(nueva); nueva++; }
        else if (linea.startsWith('-')) { borradasEn.add(nueva); }
        else { nueva++; }                           // contexto (o línea vacía)
    }

    return { anadidas, borradasEn };
}

/**
 * Cuántas líneas ha ganado y perdido cada sección.
 * Devuelve un Map indexado por `headingLine`, que es como el panel identifica
 * las secciones. Las que no han cambiado no aparecen.
 */
export function estadoPorSeccion(sections, diff) {
    const { anadidas, borradasEn } = cambiosPorLinea(diff);
    const fuera = new Map();
    if (!anadidas.size && !borradasEn.size) return fuera;

    for (const s of sections || []) {
        let mas = 0;
        let menos = 0;
        for (let n = s.startLine; n <= s.endLine; n++) {
            if (anadidas.has(n)) mas++;
            if (borradasEn.has(n)) menos++;
        }
        if (mas || menos) fuera.set(s.headingLine, { mas, menos });
    }
    return fuera;
}
