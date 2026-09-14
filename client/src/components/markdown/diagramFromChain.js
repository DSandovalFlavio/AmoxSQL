/**
 * diagramFromChain — convierte un `.sqlchain` en un diagrama mermaid.
 *
 * Documentar un pipeline no debería ser redibujarlo: el DAG ya está construido
 * en Data Flow, con sus nodos y sus aristas. Esto lo recorre y lo serializa.
 *
 * Genera el esqueleto UNA vez. A partir de ahí es markdown editable, no un
 * enlace vivo: el documento describe el flujo, no lo refleja en tiempo real —
 * si lo reflejara, cualquier retoque de la chain borraría lo que escribiste.
 */

/** Formas de mermaid según lo que hace el nodo. */
const FORMA = {
    import_file: ['[(', ')]'],      // fuente de datos
    bucket_read: ['[(', ')]'],
    gsheet_read: ['[(', ')]'],
    table_ref: ['[(', ')]'],
    export_file: ['[/', '/]'],      // salida
    assert: ['{', '}'],             // decisión / control
    checkpoint: ['((', '))'],
};

const POR_DEFECTO = ['[', ']'];

/** Los identificadores de mermaid no admiten según qué; se saneàn. */
function idSeguro(id, i) {
    const limpio = String(id || '').replace(/[^A-Za-z0-9_]/g, '');
    return limpio && /^[A-Za-z_]/.test(limpio) ? limpio : `n${i}`;
}

/** El texto de un nodo no puede llevar corchetes ni comillas sin escapar. */
function etiquetaSegura(texto) {
    return String(texto || '')
        .replace(/["[\]{}()|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48) || 'sin nombre';
}

/**
 * `chain` es el objeto ya parseado de un `.sqlchain`.
 * Devuelve el bloque markdown completo, listo para insertar.
 */
export function chainAMermaid(chain, { direccion = 'LR' } = {}) {
    const nodos = Array.isArray(chain?.nodes) ? chain.nodes : [];
    if (!nodos.length) return null;

    const ids = new Map();
    nodos.forEach((n, i) => ids.set(n.id, idSeguro(n.id, i)));

    const lineas = [`flowchart ${direccion}`];

    for (const nodo of nodos) {
        const [abre, cierra] = FORMA[nodo.type] || POR_DEFECTO;
        const etiqueta = etiquetaSegura(nodo.label || nodo.type);
        // Un nodo desactivado se marca, en vez de desaparecer: que el documento
        // cuente también lo que está apagado.
        const sufijo = nodo.disabled ? ' ·off·' : '';
        lineas.push(`  ${ids.get(nodo.id)}${abre}"${etiqueta}${sufijo}"${cierra}`);
    }

    const aristas = Array.isArray(chain?.edges) ? chain.edges : [];
    for (const arista of aristas) {
        const de = ids.get(arista.source);
        const a = ids.get(arista.target);
        if (!de || !a) continue;
        const etiqueta = arista.label ? `|${etiquetaSegura(arista.label)}|` : '';
        lineas.push(`  ${de} -->${etiqueta} ${a}`);
    }

    // Nodos sueltos sin aristas siguen apareciendo: son parte del flujo aunque
    // todavía no estén conectados.
    return ['```mermaid', ...lineas, '```', ''].join('\n');
}

/** Plantillas para empezar un diagrama desde cero. */
export const PLANTILLAS_DIAGRAMA = [
    {
        id: 'flujo',
        label: 'Flujo',
        detalle: 'cajas y flechas',
        texto: ['```mermaid', 'flowchart LR', '  A[origen] --> B[transformación]', '  B --> C[destino]', '```', ''].join('\n'),
    },
    {
        id: 'secuencia',
        label: 'Secuencia',
        detalle: 'quién llama a quién',
        texto: ['```mermaid', 'sequenceDiagram', '  Origen->>Ingesta: entrega el fichero', '  Ingesta->>Almacén: carga', '  Almacén-->>Ingesta: confirma', '```', ''].join('\n'),
    },
    {
        id: 'estados',
        label: 'Estados',
        detalle: 'ciclo de vida de un proceso',
        texto: ['```mermaid', 'stateDiagram-v2', '  [*] --> Pendiente', '  Pendiente --> Ejecutando', '  Ejecutando --> Completado', '  Ejecutando --> Fallido', '  Fallido --> Pendiente: reintento', '```', ''].join('\n'),
    },
    {
        id: 'er',
        label: 'Entidad-relación',
        detalle: 'tablas y sus claves',
        texto: ['```mermaid', 'erDiagram', '  CLIENTE ||--o{ PEDIDO : hace', '  PEDIDO ||--|{ LINEA : contiene', '```', ''].join('\n'),
    },
];
