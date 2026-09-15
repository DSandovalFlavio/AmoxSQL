/**
 * El único sitio que configura mermaid.
 *
 * `mermaid.initialize()` es **global al módulo**: no devuelve una instancia, le
 * cambia la configuración a todo el que lo use. Mientras el único consumidor era
 * la vista previa de markdown eso no se notaba, y `MarkdownPreview` se guardaba
 * en una variable de módulo el último tema aplicado para no reconfigurar en cada
 * render.
 *
 * Con AmoxDiagram hay **dos** consumidores, y esa caché se vuelve una mentira:
 * el medidor configura con sus opciones, la vista previa cree que la suya sigue
 * puesta porque su variable no ha cambiado, y el siguiente diagrama del
 * documento sale con la configuración del otro. No daría un error: daría un
 * dibujo distinto, que es peor.
 *
 * Así que la configuración se aplica **antes de cada render**, sin caché. Es una
 * llamada síncrona sobre un objeto de opciones; el coste real del render está en
 * medir el texto y calcular la disposición, no aquí.
 */
import mermaid from 'mermaid';

/**
 * Mermaid mide el ancho de cada etiqueta en un contenedor oculto para
 * dimensionar la caja, y luego dibuja. Si la fuente con la que mide no es la
 * misma con la que pinta, la caja sale estrecha y se recortan las últimas
 * letras. Su tipo por defecto no es el de la aplicación, así que se fija la
 * misma en las dos: mermaid inyecta un `<style>` con este `fontFamily` dentro
 * del SVG, y así medir y pintar coinciden en todas partes.
 */
export const MERMAID_FONT = "'Manrope', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

/**
 * Renderiza un diagrama y devuelve su SVG.
 *
 * `paraMedir` cambia una sola cosa: apaga `useMaxWidth`, que es lo que hace que
 * mermaid escale el dibujo al ancho disponible. Escalado, las coordenadas que
 * se leen del SVG vienen en unidades de pantalla mientras que los tamaños
 * vienen en unidades del dibujo, y mezclarlas descoloca todas las cajas. Para
 * enseñar un diagrama el escalado es justo lo que se quiere; para medirlo, no.
 */
export async function renderMermaid(id, codigo, { oscuro = true, paraMedir = false } = {}) {
    mermaid.initialize({
        startOnLoad: false,
        theme: oscuro ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: MERMAID_FONT,
        themeVariables: { fontFamily: MERMAID_FONT },
        flowchart: { htmlLabels: true, useMaxWidth: !paraMedir },
    });
    return mermaid.render(id, codigo);
}

/** Un identificador de render que no choque con otro. */
export function idDeRender(prefijo = 'mermaid') {
    return `${prefijo}-${Math.random().toString(36).slice(2, 11)}`;
}
