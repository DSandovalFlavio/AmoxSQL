/**
 * El encuadre inicial de un lienzo (Data Flow, el diagrama, el Canvas), que se
 * pueda leer (6.0, M10 · T1/T9).
 *
 * «Que quepa todo» encogía un flujo de ocho pasos al 33 %: cada paso en 61×27 px
 * y su texto en ~4 px, porque al lado del lateral de la app y de los paneles del
 * editor el lienzo se queda en la mitad de la ventana. Ahora:
 *
 *   - si todo cabe a un zoom legible (≥ ZOOM_LEGIBLE), se encuadra todo,
 *     centrado, como antes;
 *   - si no, el zoom se queda en ZOOM_LEGIBLE y la vista se ancla al PRINCIPIO
 *     del documento (arriba a la izquierda, donde empieza un flujo); el resto se
 *     alcanza desplazando o con el minimapa. Si a ese zoom cabe de alto, se
 *     centra en vertical.
 *
 * El botón «Fit» de cada editor sigue encuadrando todo: es un gesto explícito.
 * Pura, sin React ni React Flow: `scripts/probarEncuadreLegible.mjs`.
 */

export const ZOOM_LEGIBLE = 0.75;

/**
 * @param {{x:number,y:number,width:number,height:number}} caja  lo que hay que encuadrar (coordenadas del lienzo)
 * @param {number} ancho  ancho visible del lienzo, en px
 * @param {number} alto   alto visible del lienzo, en px
 * @param {object} [o]
 * @param {number} [o.relleno=0.2]   margen alrededor al encuadrar todo, como fracción
 * @param {number} [o.maximo=1]      zoom máximo (acercar de más no ayuda a leer)
 * @param {number} [o.legible]       zoom por debajo del cual se deja de encoger
 * @param {number} [o.margen=32]     px entre el borde visible y el documento al anclar
 * @param {number} [o.izquierda=0]   px tapados a la izquierda (una paleta flotante)
 * @returns {{x:number,y:number,zoom:number,anclado:boolean}|null}
 */
export function encuadreLegible(caja, ancho, alto, o = {}) {
    const { relleno = 0.2, maximo = 1, legible = ZOOM_LEGIBLE, margen = 32, izquierda = 0 } = o;
    if (!caja || !(caja.width > 0) || !(caja.height > 0) || !(ancho > 0) || !(alto > 0)) return null;
    const anchoUtil = Math.max(1, ancho - izquierda);
    const cabe = Math.min(anchoUtil / (caja.width * (1 + 2 * relleno)), alto / (caja.height * (1 + 2 * relleno)));
    const zoomTodo = Math.min(maximo, cabe);

    if (zoomTodo >= legible) {
        const z = zoomTodo;
        return {
            x: izquierda + (anchoUtil - caja.width * z) / 2 - caja.x * z,
            y: (alto - caja.height * z) / 2 - caja.y * z,
            zoom: z,
            anclado: false,
        };
    }
    const z = Math.min(legible, maximo);
    const cabeDeAlto = caja.height * z + 2 * margen <= alto;
    return {
        x: izquierda + margen - caja.x * z,
        y: cabeDeAlto ? (alto - caja.height * z) / 2 - caja.y * z : margen - caja.y * z,
        zoom: z,
        anclado: true,
    };
}
