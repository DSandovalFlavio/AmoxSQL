/**
 * El archivo `.amoxdiagram`: front-matter y **un** bloque mermaid.
 *
 * Mismo patrón que `.amoxdeck`, que ya es markdown con cabecera, y por la misma
 * razón: el archivo se lee sin la aplicación. Abierto en cualquier editor de
 * texto, o en el navegador de un repositorio, sigue siendo un diagrama que se
 * entiende — y el bloque cercado se renderiza solo en la mayoría de los sitios
 * donde se mira markdown.
 *
 * **Un diagrama por archivo.** Varios conviven en un markdown, que es donde un
 * diagrama tiene vecinos y texto que lo explica. Un `.amoxdiagram` con tres
 * diagramas obligaría a inventar navegación entre ellos para algo que el
 * markdown ya resuelve.
 */
import { bloquesCercados, reemplazarCercado } from '../markdown/fencedBlocks.js';
import { parsearFlujo, flujoAMermaid, flujoVacio } from '../markdown/mermaidFlow.js';

export const EXT_DIAGRAMA = '.amoxdiagram';

/** Con qué empieza un diagrama nuevo. Tres cajas: un origen, un proceso, un destino. */
export const DIAGRAMA_INICIAL = [
    '---',
    'title: Untitled diagram',
    '---',
    '',
    '```mermaid',
    'flowchart LR',
    '  origen["Source"] --> proceso["Transform"]',
    '  proceso --> destino["Destino"]',
    '```',
    '',
].join('\n');

/**
 * Parte el front-matter del resto sin interpretarlo.
 *
 * Se devuelve el **texto** de la cabecera, no un objeto: quien la quiera
 * modificar usa `setFrontMatterKeys`, que edita línea a línea y respeta
 * comentarios, orden y entrecomillado. Volcarla con un serializador de YAML
 * reescribiría la cabecera entera en cada guardado.
 */
export function partirCabecera(contenido) {
    const m = (contenido || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
    if (!m) return { cabecera: '', cuerpo: contenido || '' };
    return { cabecera: m[0], cuerpo: (contenido || '').slice(m[0].length) };
}

/** El título declarado en la cabecera, si lo hay. */
export function tituloDe(cabecera) {
    const m = /^title:[ \t]*(.*)$/m.exec(cabecera || '');
    if (!m) return '';
    return m[1].trim().replace(/^["'](.*)["']$/, '$1');
}

/**
 * Un `.amoxdiagram` leído: cabecera, texto mermaid y grafo.
 *
 * `grafo` es `null` cuando el diagrama no se sabe leer — y eso **no es un
 * error del archivo**. El texto sigue estando en `mermaid`, intacto, para que
 * el editor pueda enseñarlo y explicar por qué no lo abre.
 */
export function leerDiagrama(contenido) {
    const { cabecera, cuerpo } = partirCabecera(contenido);
    const bloques = bloquesCercados(cuerpo, ['mermaid']);
    const bloque = bloques[0] || null;
    const mermaid = bloque ? bloque.cuerpo.replace(/\r?\n$/, '') : '';
    return {
        cabecera,
        titulo: tituloDe(cabecera),
        mermaid,
        bloque,
        grafo: mermaid ? parsearFlujo(mermaid) : null,
        sobran: Math.max(0, bloques.length - 1),
    };
}

/**
 * Escribe el grafo de vuelta **sin tocar nada más**.
 *
 * Si el archivo ya tenía un bloque, se sustituye ese y sólo ese: la cabecera,
 * los comentarios y cualquier texto alrededor quedan byte a byte iguales. Si no
 * lo tenía —un archivo a medio escribir a mano— se añade al final, que es menos
 * sorprendente que reescribirlo entero.
 */
export function escribirDiagrama(contenido, grafo) {
    const texto = flujoAMermaid(grafo);
    const { cabecera, cuerpo } = partirCabecera(contenido);
    const bloque = bloquesCercados(cuerpo, ['mermaid'])[0];
    if (bloque) return cabecera + reemplazarCercado(cuerpo, bloque, texto);
    const separador = cuerpo && !cuerpo.endsWith('\n') ? '\n\n' : (cuerpo ? '\n' : '');
    return `${cabecera}${cuerpo}${separador}\`\`\`mermaid\n${texto}\n\`\`\`\n`;
}

/** Un archivo nuevo a partir de un grafo — para «Guardar como» desde un markdown. */
export function archivoDesdeGrafo(grafo, titulo = 'Untitled diagram') {
    const cabecera = `---\ntitle: ${titulo}\n---\n\n`;
    return `${cabecera}\`\`\`mermaid\n${flujoAMermaid(grafo || flujoVacio())}\n\`\`\`\n`;
}

/** ¿Este archivo es un diagrama? Por extensión o por el tipo de la pestaña. */
export function esDiagrama(nombreOTipo) {
    const s = String(nombreOTipo || '').toLowerCase();
    return s === 'amoxdiagram' || s.endsWith(EXT_DIAGRAMA);
}
