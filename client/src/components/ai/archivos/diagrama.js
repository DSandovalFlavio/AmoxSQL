/**
 * **El Assistant en un diagrama** (plan del Assistant, E5).
 *
 * Un diagrama es pequeño y se propone entero, pero **como grafo** (cajas, flechas,
 * grupos), nunca como mermaid: aquí se escribe con `escribirDiagrama`, el mismo
 * serializador del editor, así que lo que entra siempre se vuelve a abrir en el
 * editor visual (D1). Lo que el editor conserva sin entender (`classDef`, `style`,
 * comentarios) sigue en su sitio.
 *
 * Puro. Lo usan el panel (estado), el editor de diagramas y las pruebas.
 */
import { leerDiagrama, escribirDiagrama } from '../../diagram/diagramFile.js';
import { FORMAS, ESTILOS_ARISTA, capasDe } from '../../markdown/mermaidFlow.js';

const limpio = (t) => String(t ?? '').replace(/\r/g, '').trim();

/** ¿Es una propuesta para un diagrama? */
export const esDeDiagrama = (r) => r?.action === 'propose_change' && r.objetivo?.tipo === 'diagrama';

/** Lo que el Assistant ve del diagrama: el grafo, las formas y estilos que admite, las capas. */
export function estructuraDeDiagrama(doc) {
    const g = doc?.grafo;
    if (!g) return null;
    return {
        mermaid: doc.mermaid,
        grafo: {
            direccion: g.direccion,
            nodos: g.nodos.map(n => ({ id: n.id, texto: n.texto, forma: n.forma, clases: n.clases || [] })),
            aristas: g.aristas.map(a => ({ desde: a.desde, hasta: a.hasta, etiqueta: a.etiqueta || '', estilo: a.estilo })),
            subgrafos: (g.subgrafos || []).map(s => ({ id: s.id, titulo: s.titulo, nodos: [...s.nodos] })),
        },
        formas: Object.keys(FORMAS),
        estilos: Object.keys(ESTILOS_ARISTA),
        capas: capasDe(g).map(c => c.nombre),
    };
}

/** ¿Sigue valiendo? El diagrama no cambió desde que se propuso (es la unidad). */
export const vigenteEnDiagrama = (contenido, r) => esDeDiagrama(r) && limpio(leerDiagrama(contenido).mermaid) === limpio(r.original);

/** El grafo propuesto, con lo que el editor conserva sin entender. Una caja que sigue conserva sus extras. */
export function grafoPropuesto(actual, r) {
    const porId = new Map((actual?.nodos || []).map(n => [n.id, n]));
    return {
        ...r.grafo,
        nodos: r.grafo.nodos.map(n => (porId.get(n.id)?.otros ? { ...n, otros: porId.get(n.id).otros } : n)),
        conservado: actual?.conservado || [],
    };
}

/** El archivo con el diagrama propuesto, o `{ error }`. Se comprueba que el editor lo vuelva a abrir. */
export function aplicarDiagrama(contenido, r) {
    if (!vigenteEnDiagrama(contenido, r)) return { error: 'The diagram changed since this was proposed.' };
    const doc = leerDiagrama(contenido);
    if (!doc.grafo) return { error: 'This diagram cannot be edited visually, so the proposal cannot be applied.' };
    const texto = escribirDiagrama(contenido, grafoPropuesto(doc.grafo, r));
    if (!leerDiagrama(texto).grafo) return { error: 'The proposed diagram would not open again in the editor.' };
    return { texto };
}

/** Qué cambia: cajas nuevas, quitadas y la lista corta. */
export function cambiosDeDiagrama(actual, r) {
    const antes = new Map((actual?.nodos || []).map(n => [n.id, n]));
    const despues = new Map((r?.grafo?.nodos || []).map(n => [n.id, n]));
    const nuevos = [...despues.keys()].filter(id => !antes.has(id));
    const quitados = [...antes.keys()].filter(id => !despues.has(id));
    const renombrados = [...despues.keys()].filter(id => antes.has(id) && (antes.get(id).texto !== despues.get(id).texto || antes.get(id).forma !== despues.get(id).forma));
    const llave = (a) => `${a.desde}→${a.hasta}`;
    const aA = new Set((actual?.aristas || []).map(llave));
    const aD = new Set((r?.grafo?.aristas || []).map(llave));
    const flechasNuevas = [...aD].filter(k => !aA.has(k)).length;
    const flechasQuitadas = [...aA].filter(k => !aD.has(k)).length;
    const lista = [
        ...nuevos.map(id => `New box “${despues.get(id).texto}”`),
        ...quitados.map(id => `Removed “${antes.get(id).texto}”`),
        ...renombrados.map(id => `Changed “${antes.get(id).texto}”`),
        ...(flechasNuevas ? [`${flechasNuevas} new arrow${flechasNuevas === 1 ? '' : 's'}`] : []),
        ...(flechasQuitadas ? [`${flechasQuitadas} arrow${flechasQuitadas === 1 ? '' : 's'} removed`] : []),
        ...(actual && r?.grafo?.direccion && actual.direccion !== r.grafo.direccion ? [`Direction: ${actual.direccion} → ${r.grafo.direccion}`] : []),
    ];
    return { nuevos, quitados, lista: lista.length ? lista : ['Groups or labels'] };
}

/** «Redraw the diagram: 2 new boxes». */
export function describirDiagrama(r, actual = null) {
    if (!actual) return 'Change to the diagram';
    const { nuevos, quitados } = cambiosDeDiagrama(actual, r);
    const partes = [nuevos.length ? `${nuevos.length} new box${nuevos.length === 1 ? '' : 'es'}` : null, quitados.length ? `${quitados.length} removed` : null].filter(Boolean);
    return partes.length ? `Change to the diagram: ${partes.join(', ')}` : 'Change to the diagram';
}
