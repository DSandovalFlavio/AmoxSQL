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
import { FORMA_POR_DEFECTO, ESTILO_POR_DEFECTO, idLibre, grupoDe, defineCapa } from '../markdown/mermaidFlow.js';

/** Una copia en profundidad de lo que se va a tocar. */
function clonar(g) {
    return {
        direccion: g.direccion,
        // Las clases se copian como lista propia: sin esto, `asignarCapa` sobre
        // la copia le cambiaría la capa también al original.
        nodos: g.nodos.map((n) => ({ ...n, clases: [...(n.clases || [])] })),
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
    n.nodos.push({ id, texto, forma, clases: [] });
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
    // La copia hereda la capa: duplicar una fuente para hacer la siguiente y
    // que salga de otro color sería tener que acordarse de repintarla.
    n.nodos.splice(donde + 1, 0, { id: nuevo, texto: orig.texto, forma: orig.forma, clases: [...(orig.clases || [])] });
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

// ── capas ───────────────────────────────────────────────────────────────────

/**
 * Mete o saca una caja de una capa.
 *
 * Una caja puede llevar varias clases —mermaid las acumula— pero en esta
 * interfaz una capa es **una**: «origen», «refinado», «consumo». Asignar una
 * quita la anterior, porque si no, dos rellenos se pisan y el color que sale
 * depende del orden de las líneas, que es justo lo que nadie quiere depurar.
 */
export function asignarCapa(g, id, capa) {
    const n = clonar(g);
    const nodo = n.nodos.find((x) => x.id === id);
    if (!nodo) return n;
    const conocidas = new Set(capasConocidas(n));
    nodo.clases = (nodo.clases || []).filter((c) => !conocidas.has(c));
    if (capa) nodo.clases.push(capa);
    return n;
}

/** Los nombres de capa que el diagrama define con un `classDef`. */
export function capasConocidas(g) {
    return (g?.conservado || [])
        .map((l) => /^classDef\s+([A-Za-z_][A-Za-z0-9_-]*)\s/.exec(l))
        .filter(Boolean)
        .map((m) => m[1]);
}

/**
 * Declara una capa nueva y se la pone a la caja.
 *
 * Añade una línea a lo conservado, que es lo único que este editor escribe ahí.
 * Añadir no es lo mismo que tocar: las líneas que había siguen intactas, y una
 * definición nueva no cambia el aspecto de ninguna caja que no la use.
 */
export function crearCapa(g, id, nombre, fill, stroke) {
    const limpio = String(nombre || '').replace(/[^A-Za-z0-9_-]/g, '').toLowerCase() || 'capa';
    const usados = new Set(capasConocidas(g));
    let final = limpio;
    let i = 2;
    while (usados.has(final)) final = `${limpio}${i++}`;

    const n = clonar(g);
    n.conservado.push(defineCapa(final, fill, stroke));
    return { grafo: id ? asignarCapa(n, id, final) : n, capa: final };
}

// ── grupos ──────────────────────────────────────────────────────────────────

/**
 * Agrupa varias cajas en una zona.
 *
 * **Es la operación central de este editor**, no un detalle de acabado: quien
 * dibuja una arquitectura piensa en aterrizaje, refinado y consumo antes que en
 * las cajas que hay dentro.
 *
 * Una caja sólo puede estar en un grupo —mermaid tampoco admite más— así que
 * agrupar la saca del anterior. Y un grupo que se queda sin cajas desaparece:
 * un recuadro vacío en el dibujo no significa nada.
 */
export function agrupar(g, ids, titulo = 'Zona') {
    const dentro = (ids || []).filter((id) => g.nodos.some((x) => x.id === id));
    if (!dentro.length) return { grafo: g, id: null };

    const n = clonar(g);
    const id = idLibre(titulo, idsUsados(n));
    for (const sg of n.subgrafos) sg.nodos = sg.nodos.filter((x) => !dentro.includes(x));
    n.subgrafos.push({ id, titulo, nodos: dentro });
    n.subgrafos = n.subgrafos.filter((sg) => sg.nodos.length);
    return { grafo: n, id };
}

/** Deshace el grupo. Las cajas se quedan; lo que desaparece es el recuadro. */
export function desagrupar(g, sgId) {
    const n = clonar(g);
    n.subgrafos = n.subgrafos.filter((sg) => sg.id !== sgId);
    return n;
}

/** El título de un grupo — lo que se lee en el recuadro. */
export function renombrarGrupo(g, sgId, titulo) {
    const n = clonar(g);
    const sg = n.subgrafos.find((x) => x.id === sgId);
    if (sg) sg.titulo = titulo;
    return n;
}

/** Mueve una caja a otro grupo, o la deja fuera de todos con `null`. */
export function moverAGrupo(g, id, sgId) {
    if (!g.nodos.some((x) => x.id === id)) return g;
    const n = clonar(g);
    for (const sg of n.subgrafos) sg.nodos = sg.nodos.filter((x) => x !== id);
    if (sgId) {
        const destino = n.subgrafos.find((sg) => sg.id === sgId);
        if (destino) destino.nodos.push(id);
    }
    n.subgrafos = n.subgrafos.filter((sg) => sg.nodos.length);
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
