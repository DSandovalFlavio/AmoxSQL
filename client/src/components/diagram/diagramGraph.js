/**
 * Del grafo del formato a lo que React Flow sabe pintar.
 *
 * Es traducción pura y sin DOM: entra el modelo más las medidas, salen nodos y
 * aristas. Separado del componente para poder ejercitarlo desde Node — que es
 * lo que evitó que el orden de las capas se descubriera mirando la pantalla.
 */
import { ESTILOS_ARISTA, ESTILO_POR_DEFECTO, capasDe, esFormaNombrada, nombreDeForma } from '../markdown/mermaidFlow.js';
import { mascaraDeSilueta } from './diagramShapes.js';

/**
 * El tamaño de una caja, declarado **en el nodo** y no sólo en su CSS.
 *
 * Parece redundante —el `div` ya lleva su `width`— y no lo es por dos razones,
 * las dos descubiertas mirando la aplicación y no las pruebas:
 *
 * 1. **El minimapa se quedaba vacío.** React Flow dibuja ahí sólo los nodos que
 *    declaran tamaño; los que hay que medir no salen. Se veía un recuadro negro
 *    flotando en la esquina, que parece un fallo de pintado y no una lista
 *    vacía.
 * 2. **Medir depende de que el navegador pinte.** React Flow mide con un
 *    `ResizeObserver`, que no dispara mientras la ventana está tapada — y sin
 *    medida no hay aristas ni encuadre. Diciéndole el tamaño no tiene que medir
 *    nada: ya lo sabemos, nos lo acaba de decir mermaid.
 */
const tamano = (c) => ({ width: c.ancho, height: c.alto, style: { width: c.ancho, height: c.alto } });

/** Cómo se dibuja cada estilo de flecha. El grosor va al doble del normal. */
const TRAZO = {
    lotes: { strokeWidth: 1.6 },
    continuo: { strokeWidth: 1.6, strokeDasharray: '5 4' },
    principal: { strokeWidth: 3.2 },
    simple: { strokeWidth: 1.6 },
};

/**
 * Los nodos del lienzo, grupos incluidos.
 *
 * **Los grupos van primero, y eso no es estético.** React Flow apila por orden
 * de aparición, así que un recuadro de grupo declarado después de sus cajas las
 * taparía: se verían las cajas atenuadas detrás de un panel, y el usuario
 * pensaría que están deshabilitadas.
 */
/** ¿Está esta caja dentro de la selección, sea única o múltiple? */
export function estaSeleccionado(seleccion, id) {
    if (!seleccion) return false;
    if (seleccion.tipo === 'nodo') return seleccion.id === id;
    if (seleccion.tipo === 'varios') return seleccion.ids.includes(id);
    return false;
}

export function nodosDeLienzo(grafo, medidas, seleccion = null, extras = {}, biblioteca = []) {
    if (!grafo || !medidas) return [];

    const entrantes = new Map();
    for (const a of grafo.aristas) entrantes.set(a.hasta, (entrantes.get(a.hasta) || 0) + 1);

    // El color de cada capa, leído de los `classDef` del propio diagrama. Se
    // pinta la caja con él para que el lienzo enseñe **lo mismo** que va a
    // renderizar el documento: un editor que colorea a su manera vuelve a
    // separar el dibujo del resultado, que es lo que este diseño evita.
    const colores = new Map(capasDe(grafo).map((c) => [c.nombre, c]));

    const grupos = grafo.subgrafos
        .filter((sg) => medidas.grupos.has(sg.id))
        .map((sg) => {
            const c = medidas.grupos.get(sg.id);
            return {
                id: `grupo:${sg.id}`,
                type: 'grupo',
                position: { x: c.x, y: c.y },
                selected: seleccion?.tipo === 'grupo' && seleccion.id === sg.id,
                data: { titulo: sg.titulo, ancho: c.ancho, alto: c.alto },
                draggable: false,
                ...tamano(c),
            };
        });

    const cajas = grafo.nodos.map((n) => {
        const c = medidas.nodos.get(n.id) || { x: 0, y: 0, ancho: 120, alto: 38, conEtiqueta: true };
        const capa = (n.clases || []).map((x) => colores.get(x)).find(Boolean) || null;
        // Una forma aprendida se dibuja con el contorno que dio mermaid. Si
        // todavia no esta en la biblioteca, la caja sale rectangular — se ve
        // igual de bien y el aviso ya esta ofreciendo guardarla.
        const silueta = esFormaNombrada(n.forma)
            ? biblioteca.find((f) => f.nombre === nombreDeForma(n.forma))?.silueta
            : null;
        return {
            id: n.id,
            type: 'caja',
            position: { x: c.x, y: c.y },
            selected: estaSeleccionado(seleccion, n.id),
            data: {
                texto: n.texto,
                forma: n.forma,
                ancho: c.ancho,
                alto: c.alto,
                entrantes: entrantes.get(n.id) || 0,
                mascara: silueta ? mascaraDeSilueta(silueta) : null,
                sinEtiqueta: c.conEtiqueta === false,
                fill: capa?.fill || null,
                stroke: capa?.stroke || null,
                ...extras,
            },
            ...tamano(c),
        };
    });

    return [...grupos, ...cajas];
}

/** Las flechas del lienzo. */
export function aristasDeLienzo(grafo, color, seleccion = null) {
    if (!grafo) return [];
    return grafo.aristas.map((a, i) => {
        const trazo = TRAZO[a.estilo] || TRAZO[ESTILO_POR_DEFECTO];
        return {
            // El índice entra en el identificador a propósito: **dos cajas pueden
            // estar unidas por dos flechas distintas** —una de ida por lotes y
            // otra de vuelta continua— y con la clave `origen-destino` React
            // dibujaría sólo una de las dos sin avisar.
            id: `e${i}:${a.desde}->${a.hasta}`,
            source: a.desde,
            target: a.hasta,
            label: a.etiqueta || undefined,
            type: 'smoothstep',
            markerEnd: a.estilo === 'simple' ? undefined : { type: 'arrowclosed', color, width: 14, height: 14 },
            selected: seleccion?.tipo === 'arista' && seleccion.indice === i,
            style: { stroke: color, ...trazo },
            // El indice viaja en los datos porque es como se nombra una flecha
            // en el grafo: no tiene identificador propio, y dos cajas pueden
            // estar unidas por varias.
            data: { indice: i, estilo: a.estilo, nombre: ESTILOS_ARISTA[a.estilo]?.nombre },
        };
    });
}
