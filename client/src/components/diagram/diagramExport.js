/**
 * Sacar el diagrama de la aplicación: SVG y PNG.
 *
 * Es de las primeras cosas que se piden (pregunta 19 de la auditoría), y por una
 * razón concreta: **el diagrama acaba en un documento de diseño que no es este
 * markdown**, y hasta ahora la única forma de llevárselo era una captura de
 * pantalla.
 *
 * ## Por qué no se fotografía el lienzo
 *
 * Lo evidente sería rasterizar lo que se ve —React Flow, con `html2canvas`, como
 * hace Story Flow con sus tarjetas—. Pero lo que se ve es **nuestra** versión del
 * diagrama: nuestras cajas, nuestro filete de selección, nuestro fondo de
 * puntos. Lo que el usuario quiere llevarse es el diagrama **como lo dibuja el
 * documento**.
 *
 * Así que se le vuelve a pedir a mermaid, que es quien lo va a dibujar en el
 * documento de verdad. Sale más limpio, sale en vector, y no hay ninguna
 * posibilidad de que la imagen y el documento discrepen.
 *
 * ## La tipografía de exportación no es la de la aplicación
 *
 * Un SVG que sale de aquí se abre en otro sitio: en un visor de imágenes, en un
 * documento, en el navegador de un repositorio. Ahí **no está cargada la fuente
 * de la aplicación**, y un SVG lleva los tamaños de caja ya calculados: si el
 * texto se dibuja con otra tipografía, se sale de su caja.
 *
 * Por eso se mide y se dibuja con una familia que existe en todas partes. El
 * diagrama exportado se ve un punto distinto del de la pantalla, y a cambio se
 * ve **igual en cualquier sitio donde acabe**, que es justo lo que se le pide a
 * un archivo que uno manda por correo.
 */
import mermaid from 'mermaid';
import { idDeRender } from '../markdown/mermaidRuntime';

/** Presente en cualquier sistema: medir y dibujar coinciden fuera de aquí. */
const FUENTE_PORTABLE = 'Arial, Helvetica, sans-serif';

/** Un nombre de archivo a partir del título, sin sorpresas para el disco. */
export function nombreDeArchivo(titulo) {
    const base = String(titulo || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()
        .slice(0, 48);
    return base || 'diagrama';
}

/** Renderiza el diagrama para llevárselo, no para enseñarlo aquí. */
async function svgDeExportacion(texto, { oscuro = true } = {}) {
    mermaid.initialize({
        startOnLoad: false,
        theme: oscuro ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: FUENTE_PORTABLE,
        themeVariables: { fontFamily: FUENTE_PORTABLE },
        // `htmlLabels` se queda como en el documento. La primera versión lo
        // apagaba «para que el PNG no saliera con las cajas vacías», y medirlo
        // demostró dos cosas falsas en esa frase: en mermaid 11.14 apagarlo NO
        // convierte las etiquetas en `<text>` —siguen en un `foreignObject`— y
        // un `foreignObject` **sí** se rasteriza si el SVG entra por un
        // `data:`. Comprobado comparando el PNG con y sin esos nodos: 17,5 kB
        // frente a 7,3 kB.
        flowchart: { htmlLabels: true, useMaxWidth: false },
    });
    const { svg } = await mermaid.render(idDeRender('exportar'), texto);
    return svg;
}

/** Lanza la descarga de un blob con el nombre dado. */
function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    // Se revoca después, no en el acto: en algunos navegadores revocar antes de
    // que arranque la descarga la deja en nada.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** El diagrama en vector. Es el formato que no pierde nada. */
export async function exportarSvg(texto, { oscuro = true, titulo } = {}) {
    const svg = await svgDeExportacion(texto, { oscuro });
    descargar(new Blob([svg], { type: 'image/svg+xml' }), `${nombreDeArchivo(titulo)}.svg`);
}

/**
 * El diagrama en PNG, al doble de resolución.
 *
 * Al doble porque el destino habitual es una presentación o un documento, donde
 * un PNG a tamaño natural se ve borroso en cuanto alguien lo amplía un poco.
 */
export async function exportarPng(texto, { oscuro = true, titulo, escala = 2 } = {}) {
    const svg = await svgDeExportacion(texto, { oscuro });

    const medidas = /<svg[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg);
    const caja = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(svg);
    const ancho = Number(medidas?.[1] || caja?.[1] || 1200);
    const alto = Number(medidas?.[2] || caja?.[2] || 800);

    /**
     * **Por `data:` y no por `blob:`**, y esto costó medirlo.
     *
     * Un SVG cargado desde una URL de blob **contamina el lienzo**: Chromium lo
     * trata como recurso de otro origen y `toBlob` revienta con un
     * `SecurityError` — el PNG no llega a existir. Desde un `data:` el lienzo
     * queda limpio y la descarga sale. El SVG suelto sí se entrega como blob,
     * que ahí no hay lienzo de por medio.
     */
    const imagen = new Image();
    await new Promise((listo, falla) => {
        imagen.onload = listo;
        imagen.onerror = () => falla(new Error('el navegador no pudo leer el diagrama'));
        imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    const ctx = lienzo.getContext('2d');
    // Un PNG sin fondo sobre una diapositiva oscura deja el texto claro
    // invisible. Se pinta el mismo lienzo que usa el tema del diagrama.
    ctx.fillStyle = oscuro ? '#1e1f22' : '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

    const blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
    descargar(blob, `${nombreDeArchivo(titulo)}.png`);
}
