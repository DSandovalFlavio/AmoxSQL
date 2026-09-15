/**
 * Las operaciones del editor, como funciones puras sobre el grafo.
 *
 * Ninguna toca el DOM ni React: entra un grafo, sale otro. Eso permite
 * ejercitarlas desde Node, que es lo que evita descubrir en la pantalla que
 * borrar una caja dejó sus flechas colgando.
 *
 * **Todas devuelven un grafo nuevo.** No se muta el que entra: el historial
 * guarda el texto de cada paso, y una mutación silenciosa haría que deshacer
 * devolviera un estado que ya venía modificado.
 */
import { FORMA_POR_DEFECTO, ESTILO_POR_DEFECTO, idLibre, grupoDe } from '../markdown/mermaidFlow.js';

/** Una copia en profundidad de lo que se va a tocar. */
function clonar(g) {
    return {
        direccion: g.direccion,
        nodos: g.nodos.map((n) => ({ ...n })),
        aristas: g.aristas.map((a) => ({ ...a })),
        subgrafos: g.subgrafos.map((s) => ({ ...s, nodos: [...s.nodos] })),
        conservado: [...g.conservado],
    };
}

/** Los identificadores ya usados — nodos y subgrafos comparten espacio en mermaid. */
export function idsUsados(g) {
    return new Set([...g.nodos.map((n) => n.id), ...g.subgrafos.map((s) => s.id)]);
}

/** Una caja nueva. Devuelve el grafo y el id, que quien llama necesita para seleccionarla. */
export function anadirNodo(g, { texto = 'Sin nombre', forma = FORMA_POR_DEFECTO, grupo = null } = {}) {
    const n = clonar(g);
    const id = idLibre(texto, idsUsados(n));
    n.nodos.push({ id, texto, forma });
    if (grupo) {
        const sg = n.subgrafos.find((s) => s.id === grupo);
        if (sg) sg.nodos.push(id);
    }
    return { grafo: n, id };
}

/**
 * Una caja encadenada a otra: se crea y se conecta en el mismo gesto.
 *
 * Es el camino de quien ya tiene el diagrama en la cabeza y sólo quiere
 * volcarlo — pulsar `Tab` y escribir, sin soltar el teclado.
 */
export function encadenarNodo(g, desde, opciones = {}) {
    const anterior = g.nodos.find((x) => x.id === desde);
    if (!anterior) return { grafo: g, id: null };
    // Hereda el grupo del que viene: encadenar dentro de una zona no debería
    // sacarte de ella.
    const grupo = grupoDe(g, desde)?.id || null;
    const { grafo, id } = anadirNodo(g, { grupo, ...opciones });
    grafo.aristas.push({ desde, hasta: id, etiqueta: '', estilo: ESTILO_POR_DEFECTO });
    return { grafo, id };
}

/** Borra una caja **y las flechas que la tocaban**, que si no quedan colgando. */
export function borrarNodo(g, id) {
    const n = clonar(g);
    n.nodos = n.nodos.filter((x) => x.id !== id);
    n.aristas = n.aristas.filter((a) => a.desde !== id && a.hasta !== id);
    for (const sg of n.subgrafos) sg.nodos = sg.nodos.filter((x) => x !== id);
    return n;
}

/**
 * Duplica una caja. La copia entra **junto a la original**, no al final.
 *
 * Quien duplica la tercera de cinco fuentes parecidas espera encontrarla al
 * lado; al final de la lista tendría que buscarla.
 */
export function duplicarNodo(g, id) {
    const orig = g.nodos.find((x) => x.id === id);
    if (!orig) return { grafo: g, id: null };
    const n = clonar(g);
    const nuevo = idLibre(orig.texto, idsUsados(n));
    const donde = n.nodos.findIndex((x) => x.id === id);
    n.nodos.splice(donde + 1, 0, { id: nuevo, texto: orig.texto, forma: orig.forma });
    const sg = n.subgrafos.find((s) => s.nodos.includes(id));
    if (sg) sg.nodos.splice(sg.nodos.indexOf(id) + 1, 0, nuevo);
    return { grafo: n, id: nuevo };
}

/**
 * Cambia el texto de una caja.
 *
 * **El identificador no se renombra con el texto**, y es deliberado por dos
 * razones: es lo que nombran las líneas conservadas —un `class erp,web origen`
 * las llama por id— y porque cambiarlo en cada retoque de una etiqueta movería
 * también todas las líneas de flecha que lo mencionan, ensuciando el diff con
 * un cambio que nadie pidió.
 *
 * `tambienId` es la única excepción, y sirve para un caso concreto: la caja que
 * **acabas de crear** y todavía se llama «Sin nombre». Ahí el identificador es
 * un marcador de posición, no una decisión de nadie, y arrastrarlo para siempre
 * deja en el archivo cosas como `sin_nombre[("Almacén")]`. Ocurre una sola vez
 * y antes de guardar, así que no hay diff que ensuciar.
 *
 * Aun así se comprueba: si el identificador aparece en alguna línea conservada
 * —porque el usuario ya la escribió a mano— no se toca. Vale más un nombre feo
 * que un estilo que deja de aplicarse.
 */
export function renombrarNodo(g, id, texto, { tambienId = false } = {}) {
    const n = clonar(g);
    const nodo = n.nodos.find((x) => x.id === id);
    if (!nodo) return n;
    nodo.texto = texto;

    if (!tambienId) return n;
    if (n.conservado.some((linea) => new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}\\b`).test(linea))) return n;

    const usados = idsUsados(n);
    usados.delete(id);
    const nuevo = idLibre(texto, usados);
    if (nuevo === id) return n;

    nodo.id = nuevo;
    for (const a of n.aristas) {
        if (a.desde === id) a.desde = nuevo;
        if (a.hasta === id) a.hasta = nuevo;
    }
    for (const sg of n.subgrafos) {
        const i = sg.nodos.indexOf(id);
        if (i !== -1) sg.nodos[i] = nuevo;
    }
    return n;
}

/** Cambia la forma de una caja. */
export function cambiarForma(g, id, forma) {
    const n = clonar(g);
    const nodo = n.nodos.find((x) => x.id === id);
    if (nodo) nodo.forma = forma;
    return n;
}

/**
 * Une dos cajas.
 *
 * Se niega a unir una caja consigo misma y a repetir una flecha que ya existe
 * con el mismo estilo: mermaid dibujaría dos encima y parecería una sola más
 * gruesa, que es un cambio invisible y por tanto imposible de deshacer a ojo.
 */
export function conectar(g, desde, hasta, estilo = ESTILO_POR_DEFECTO) {
    if (!desde || !hasta || desde === hasta) return g;
    if (!g.nodos.some((x) => x.id === desde) || !g.nodos.some((x) => x.id === hasta)) return g;
    if (g.aristas.some((a) => a.desde === desde && a.hasta === hasta && a.estilo === estilo)) return g;
    const n = clonar(g);
    n.aristas.push({ desde, hasta, etiqueta: '', estilo });
    return n;
}

/** Quita la flecha que está en esa posición de la lista. */
export function desconectar(g, indice) {
    const n = clonar(g);
    n.aristas.splice(indice, 1);
    return n;
}

/** Cambia la etiqueta de una flecha. */
export function etiquetarArista(g, indice, etiqueta) {
    const n = clonar(g);
    if (n.aristas[indice]) n.aristas[indice].etiqueta = etiqueta;
    return n;
}

/** Cambia cómo corre una flecha: por lotes, continuo, camino principal. */
export function estiloArista(g, indice, estilo) {
    const n = clonar(g);
    if (n.aristas[indice]) n.aristas[indice].estilo = estilo;
    return n;
}

/** La dirección del diagrama entero. */
export function cambiarDireccion(g, direccion) {
    const n = clonar(g);
    n.direccion = direccion;
    return n;
}

/**
 * Las cajas cuyo texto contiene la consulta, en el orden del diagrama.
 *
 * Con cuarenta cajas el esquema deja de servir para leer y empieza a servir
 * para saltar, y esto es lo que lo hace posible. Sin acentos y sin mayúsculas:
 * nadie escribe «¿Calidad?» con la tilde puesta cuando está buscando.
 */
export function buscarNodos(g, consulta) {
    const q = normalizar(consulta);
    if (!q) return g?.nodos || [];
    return (g?.nodos || []).filter((n) => normalizar(n.texto).includes(q) || normalizar(n.id).includes(q));
}

function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
