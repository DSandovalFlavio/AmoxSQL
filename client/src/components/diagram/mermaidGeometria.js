/**
 * De dónde salen las posiciones de las cajas.
 *
 * Mermaid **no guarda coordenadas** —el formato no tiene dónde ponerlas— pero
 * las **calcula** para dibujar, y las publica en el SVG que devuelve. Así que en
 * vez de traerse una librería de disposición y colocar las cajas a nuestra
 * manera, se le pregunta a quien va a dibujar el diagrama de verdad.
 *
 * El efecto secundario es el que importa: **el editor enseña exactamente lo que
 * el documento va a renderizar.** No es que el problema de los dos dibujos se
 * resuelva; es que deja de existir.
 *
 * ## Las dos trampas, medidas y no supuestas
 *
 * 1. **No se parsea la cadena del SVG: se monta en el DOM.** Un diagrama con una
 *    directiva `click` produce un SVG que **no es XML bien formado**, y
 *    `DOMParser(svg, 'image/svg+xml')` devuelve un `parsererror` — medido: un
 *    nodo de tres. Montado en un contenedor salen los tres.
 * 2. **No se lee el atributo `transform`: se llama a `getCTM()`.** Un nodo con
 *    enlace va envuelto en un `<a transform="translate(…)">`, así que su
 *    `<g class="node">` **no tiene `transform`** y leer el atributo devuelve
 *    `null`. Esa caja aterrizaría en el origen, encima de otra, **sin un solo
 *    error por consola**. `getCTM()` da la posición esté donde esté el
 *    transform.
 */
import { renderMermaid, idDeRender } from '../markdown/mermaidRuntime';

/** Lo que se le da a una caja cuando no se ha podido medir. */
const CAJA_POR_DEFECTO = { ancho: 120, alto: 38 };

/** Escapa lo que pueda tener significado dentro de una expresión regular. */
function escapar(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * La caja de un elemento del SVG, en unidades del dibujo.
 *
 * `getCTM()` viene en unidades de la vista, que llevan la escala del `viewBox`;
 * `getBBox()` viene en unidades locales. Mezclarlas descoloca todo, así que la
 * posición se divide por la escala antes de combinarse con el tamaño.
 *
 * Y se suma `bbox.x`/`bbox.y` porque mermaid **centra** la caja en el origen del
 * grupo: sin eso, cada nodo saldría desplazado media caja arriba y a la
 * izquierda, que es un error lo bastante pequeño como para parecer un problema
 * de estilo.
 */
function cajaDe(el) {
    const ctm = el.getCTM?.();
    if (!ctm) return null;
    let bbox;
    try { bbox = el.getBBox(); } catch { return null; }
    const escala = ctm.a || 1;
    return {
        x: ctm.e / escala + bbox.x,
        y: ctm.f / escala + bbox.y,
        ancho: Math.max(bbox.width, 1),
        alto: Math.max(bbox.height, 1),
    };
}

/**
 * Renderiza el diagrama en oculto y devuelve dónde cae cada caja y cada grupo.
 *
 * Devuelve `null` si mermaid no pudo dibujarlo. El editor ya sabe que el texto
 * se parsea —eso lo contestó `parsearFlujo`—, así que llegar aquí y fallar
 * significa que emitimos algo que el motor no entiende, y eso se prefiere
 * ruidoso: con posiciones inventadas el dibujo del editor y el del documento
 * dejarían de coincidir, que es justo lo que este diseño evita.
 */
export async function medirFlujo(texto, grafo, { oscuro = true } = {}) {
    if (!texto || !grafo) return null;

    const id = idDeRender('medir');
    let svg;
    try {
        ({ svg } = await renderMermaid(id, texto, { oscuro, paraMedir: true }));
    } catch {
        return null;
    }

    // Fuera de la pantalla pero **dentro del documento**: sin estar montado no
    // hay `getCTM()` ni `getBBox()` que valgan. `visibility` en vez de `display`
    // por lo mismo — un elemento con `display:none` no tiene caja.
    const jaula = document.createElement('div');
    jaula.setAttribute('aria-hidden', 'true');
    jaula.style.cssText = 'position:absolute;left:-10000px;top:0;width:2400px;visibility:hidden;pointer-events:none';
    jaula.innerHTML = svg;
    document.body.appendChild(jaula);

    try {
        const nodos = new Map();
        for (const nodo of grafo.nodos) {
            // Se busca por el identificador exacto y no troceando la cadena: un
            // nodo puede llamarse `a-1`, y partir por guiones confundiría
            // `flowchart-a-1-0` entre el nodo «a» y el nodo «a-1».
            const re = new RegExp(`^${escapar(id)}-flowchart-${escapar(nodo.id)}-\\d+$`);
            const el = [...jaula.querySelectorAll('g.node')].find((g) => re.test(g.id));
            const caja = el ? cajaDe(el) : null;
            nodos.set(nodo.id, caja || { x: 0, y: 0, ...CAJA_POR_DEFECTO });
        }

        const grupos = new Map();
        for (const sg of grafo.subgrafos) {
            const el = jaula.querySelector(`#${CSS.escape(`${id}-${sg.id}`)}`);
            const caja = el ? cajaDe(el) : null;
            if (caja) grupos.set(sg.id, caja);
        }

        // Todo en positivo: React Flow admite coordenadas negativas, pero el
        // encuadre inicial y el minimapa se leen mejor con el origen arriba a la
        // izquierda.
        const cajas = [...nodos.values(), ...grupos.values()];
        const minX = Math.min(0, ...cajas.map((c) => c.x));
        const minY = Math.min(0, ...cajas.map((c) => c.y));
        if (minX < 0 || minY < 0) {
            for (const c of cajas) { c.x -= minX; c.y -= minY; }
        }

        return { nodos, grupos, medidos: [...nodos.values()].filter((c) => c.ancho > 1).length };
    } finally {
        jaula.remove();
    }
}
