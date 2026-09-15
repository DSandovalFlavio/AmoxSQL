/**
 * diagramFromChain — convierte un `.sqlchain` en un diagrama mermaid.
 *
 * Documentar un pipeline no debería ser redibujarlo: el DAG ya está construido
 * en Data Flow, con sus nodos y sus aristas. Esto lo recorre y lo serializa.
 *
 * Genera el esqueleto UNA vez. A partir de ahí es markdown editable, no un
 * enlace vivo: el documento describe el flujo, no lo refleja en tiempo real —
 * si lo reflejara, cualquier retoque de la chain borraría lo que escribiste.
 *
 * **Ya no compone el texto a mano.** Construye el grafo y se lo da a
 * `mermaidFlow`, que es quien sabe cómo se escribe. Antes había aquí una tabla
 * de cercos y un saneador de identificadores propios; los dos vivían a un paso
 * de desincronizarse con el parser que tiene que volver a leer esto.
 */
import { flujoAMermaid, idLibre, FORMA_POR_DEFECTO } from './mermaidFlow.js';

/** Qué forma le toca a cada tipo de nodo de una chain. */
const FORMA_POR_TIPO = {
    import_file: 'almacen',      // fuente de datos
    bucket_read: 'almacen',
    gsheet_read: 'almacen',
    table_ref: 'almacen',
    export_file: 'salida',       // salida
    assert: 'decision',          // decisión / control
    checkpoint: 'hito',
};

/** El texto de un nodo, recortado a lo que cabe en una caja. */
function etiqueta(texto) {
    return String(texto || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48) || 'sin nombre';
}

/**
 * `chain` es el objeto ya parseado de un `.sqlchain`.
 * Devuelve el bloque markdown completo, listo para insertar.
 */
export function chainAMermaid(chain, { direccion = 'LR' } = {}) {
    const origen = Array.isArray(chain?.nodes) ? chain.nodes : [];
    if (!origen.length) return null;

    const usados = new Set();
    const ids = new Map();
    const nodos = origen.map((n) => {
        const id = idLibre(n.id || n.label || n.type, usados);
        usados.add(id);
        ids.set(n.id, id);
        // Un nodo desactivado se marca, en vez de desaparecer: que el documento
        // cuente también lo que está apagado.
        return {
            id,
            texto: etiqueta(n.label || n.type) + (n.disabled ? ' ·off·' : ''),
            forma: FORMA_POR_TIPO[n.type] || FORMA_POR_DEFECTO,
        };
    });

    const aristas = [];
    for (const arista of (Array.isArray(chain?.edges) ? chain.edges : [])) {
        const desde = ids.get(arista.source);
        const hasta = ids.get(arista.target);
        if (!desde || !hasta) continue;
        aristas.push({ desde, hasta, etiqueta: etiqueta(arista.label || ''), estilo: 'lotes' });
    }

    // Nodos sueltos sin aristas siguen apareciendo: son parte del flujo aunque
    // todavía no estén conectados. De eso se encarga `flujoAMermaid`.
    const texto = flujoAMermaid({ direccion, nodos, aristas, subgrafos: [], conservado: [] });
    return ['```mermaid', texto, '```', ''].join('\n');
}
