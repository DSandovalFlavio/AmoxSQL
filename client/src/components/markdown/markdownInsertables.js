/**
 * markdownInsertables — el catálogo de lo que se puede insertar en un
 * documento.
 *
 * Una sola lista de datos alimenta las dos puertas de entrada: el menú de `/`
 * (proveedor de completado de Monaco) y el desplegable *Insertar* de la barra.
 * Añadir un elemento nuevo es añadir una entrada aquí, no tocar dos sitios.
 *
 * Cada entrada lleva un `snippet` en el formato de Monaco: `${1:texto}` son
 * paradas de tabulación, así que insertar una tabla y saltar de celda con Tab
 * sale gratis. Las que dependen del documento (el índice, la fecha de hoy)
 * traen `build()` en su lugar.
 *
 * NO hay nada que ejecute consultas ni incruste datos: un `.md` documenta
 * procesos y recoge notas; el análisis vive en los notebooks.
 */
import { parse, sections } from './markdownModel.js';

/**
 * Plantillas para empezar un diagrama desde cero.
 *
 * Vivían en `diagramFromChain.js`, que tras AmoxDiagram dejó de ser el archivo
 * del formato para ser un consumidor más. Su sitio es éste: son **contenido de
 * menú**, no formato — texto que alguien eligió porque es lo que la gente
 * necesita empezar a escribir, y que se cambia sin tocar el parser.
 */
export const PLANTILLAS_DIAGRAMA = [
    {
        id: 'flujo',
        label: 'Flow',
        detalle: 'boxes and arrows',
        texto: ['```mermaid', 'flowchart LR', '  A["source"] --> B["transform"]', '  B --> C["destination"]', '```', ''].join('\n'),
    },
    // Las tres de arquitectura salen de la pregunta 21 de la auditoría: las
    // genéricas —«flujo», «secuencia»— no son lo que empieza a escribir alguien
    // que documenta una plataforma de datos. Llevan sus capas ya definidas,
    // porque colorear por zona es la primera cosa que hace este público.
    {
        id: 'capas',
        label: 'Layered architecture',
        detalle: 'landing, refined, consumption',
        texto: ['```mermaid', 'flowchart LR', '  subgraph z1["Landing"]', '    fuente[("Source system")]', '  end', '  subgraph z2["Refined"]', '    limpieza["Cleaning"]', '    modelo["Model"]', '  end', '  subgraph z3["Consumption"]', '    tablero(("Dashboard"))', '  end', '  fuente --> limpieza', '  limpieza --> modelo', '  modelo ==> tablero', '  classDef origen fill:#1b3a52,stroke:#4a9fd8', '  classDef proceso fill:#1d4034,stroke:#4fb286', '  classDef salida fill:#4a3a16,stroke:#d9a441', '  class fuente origen', '  class limpieza,modelo proceso', '  class tablero salida', '```', ''].join('\n'),
    },
    {
        id: 'ingesta',
        label: 'Ingestion',
        detalle: 'batch against streaming',
        texto: ['```mermaid', 'flowchart LR', '  diario[("Daily load")] --> land["Landing zone"]', '  eventos[("Events")] -.-> land', '  land --> calidad{"Passes quality?"}', '  calidad -->|yes| almacen[("Warehouse")]', '  calidad -->|no| cuarentena[/"Quarantine"/]', '```', ''].join('\n'),
    },
    {
        id: 'experimento',
        label: 'Experiment',
        detalle: 'train, evaluate, retrain',
        texto: ['```mermaid', 'flowchart LR', '  rasgos[("Features")] --> entrenar["Train"]', '  entrenar --> evaluar{"Better?"}', '  evaluar -->|yes| publicar[\\"Publish"\\]', '  evaluar -->|no| ajustar["Tune"]', '  ajustar --> entrenar', '```', ''].join('\n'),
    },
    {
        id: 'secuencia',
        label: 'Sequence',
        detalle: 'who calls whom',
        texto: ['```mermaid', 'sequenceDiagram', '  Source->>Ingestion: hands over the file', '  Ingestion->>Warehouse: load', '  Warehouse-->>Ingestion: confirms', '```', ''].join('\n'),
    },
    {
        id: 'estados',
        label: 'States',
        detalle: 'the life of a process',
        texto: ['```mermaid', 'stateDiagram-v2', '  [*] --> Pending', '  Pending --> Running', '  Running --> Done', '  Running --> Failed', '  Failed --> Pending: retry', '```', ''].join('\n'),
    },
    {
        id: 'er',
        label: 'Entity-relationship',
        detalle: 'tables and their keys',
        texto: ['```mermaid', 'erDiagram', '  CUSTOMER ||--o{ ORDER : places', '  ORDER ||--|{ LINE : contains', '```', ''].join('\n'),
    },
];

/** Fecha local en ISO corto, sin arrastrar la zona horaria de UTC. */
function hoy() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}

const CALLOUT_KINDS = [
    { id: 'nota', kind: 'NOTE', label: 'Note', icon: 'info', keywords: 'note remark' },
    { id: 'consejo', kind: 'TIP', label: 'Tip', icon: 'bulb', keywords: 'tip advice trick' },
    { id: 'importante', kind: 'IMPORTANT', label: 'Important', icon: 'circleAlert', keywords: 'important key' },
    { id: 'aviso', kind: 'WARNING', label: 'Warning', icon: 'warning', keywords: 'warning careful heads up' },
    { id: 'atencion', kind: 'CAUTION', label: 'Caution', icon: 'danger', keywords: 'caution danger destructive deletes' },
];

export const INSERTABLES = [
    // ── Texto ────────────────────────────────────────────────────────────────
    ...[1, 2, 3, 4, 5, 6].map(n => ({
        id: `h${n}`,
        label: `Heading ${n}`,
        group: 'texto',
        icon: 'hash',
        keywords: `title heading h${n} section`,
        snippet: `${'#'.repeat(n)} \${1:Heading}`,
    })),
    {
        id: 'lista', label: 'List', group: 'texto', icon: 'list',
        keywords: 'bullet point item',
        snippet: '- ${1:item}',
    },
    {
        id: 'numerada', label: 'Numbered list', group: 'texto', icon: 'listOrdered',
        keywords: 'ordered steps enumerate',
        snippet: '1. ${1:first}',
    },
    {
        id: 'tarea', label: 'Task', group: 'texto', icon: 'todo',
        detail: 'a box you can tick',
        keywords: 'checkbox pending todo to do',
        snippet: '- [ ] ${1:task}',
    },
    {
        id: 'cita', label: 'Quote', group: 'texto', icon: 'quote',
        keywords: 'blockquote cite',
        snippet: '> ${1:quote}',
    },
    {
        id: 'tabla', label: 'Table', group: 'texto', icon: 'table',
        detail: '3 columns, Tab between cells',
        keywords: 'table grid columns',
        snippet: [
            '| ${1:Column} | ${2:Column} | ${3:Column} |',
            '| --- | --- | --- |',
            '| ${4:} | ${5:} | ${6:} |',
        ].join('\n'),
    },
    {
        id: 'separador', label: 'Divider', group: 'texto', icon: 'minus',
        keywords: 'horizontal line rule hr',
        snippet: '\n---\n',
    },

    // ── Procedimiento ────────────────────────────────────────────────────────
    {
        id: 'pasos', label: 'Steps', group: 'procedimiento', icon: 'listOrdered',
        detail: 'numbered, with a box',
        keywords: 'procedure runbook recipe sequence',
        snippet: [
            '1. [ ] ${1:First step}',
            '2. [ ] ${2:Second step}',
            '3. [ ] ${3:Third step}',
        ].join('\n'),
    },
    {
        id: 'comando', label: 'Command', group: 'procedimiento', icon: 'terminal',
        detail: 'a block with a copy button',
        keywords: 'shell bash console terminal run',
        snippet: '```bash\n${1:command}\n```\n',
    },
    {
        id: 'verificacion', label: 'Check', group: 'procedimiento', icon: 'shield',
        detail: 'how to confirm it worked',
        keywords: 'verify validate check control',
        snippet: '> [!TIP]\n> **Check:** ${1:what you should see to call the step done}\n',
    },
    ...CALLOUT_KINDS.map(({ id, kind, label, icon, keywords }) => ({
        id,
        label,
        group: 'procedimiento',
        icon,
        detail: 'callout',
        keywords: `callout admonition ${keywords}`,
        snippet: `> [!${kind}]\n> \${1:${label}}\n`,
    })),
    {
        id: 'codigo', label: 'Code block', group: 'procedimiento', icon: 'code',
        keywords: 'code fence sql python yaml json',
        snippet: '```${1:sql}\n${2:}\n```\n',
    },
    {
        id: 'diagrama', label: 'Diagram · Flow', group: 'procedimiento', icon: 'workflow',
        detail: 'boxes and arrows',
        keywords: 'mermaid flow graph dag pipeline',
        // Con comillas, que es la forma canónica que escribe AmoxDiagram: así
        // un diagrama insertado a mano y luego editado en el lienzo no produce
        // un diff de reformateo la primera vez que se guarda.
        snippet: '```mermaid\nflowchart LR\n  ${1:A["source"]} --> ${2:B["transform"]}\n  ${2} --> ${3:C["destination"]}\n```\n',
    },
    // Cuatro plantillas, no una: un diagrama de secuencia o de estados no se
    // escribe de memoria, y son justo los que documentan un proceso.
    ...PLANTILLAS_DIAGRAMA.filter(p => p.id !== 'flujo').map(p => ({
        id: `diagrama-${p.id}`,
        label: `Diagram · ${p.label}`,
        group: 'procedimiento',
        icon: 'workflow',
        detail: p.detalle,
        keywords: `mermaid diagram graph ${p.id}`,
        snippet: p.texto,
    })),
    {
        id: 'imagen', label: 'Image', group: 'procedimiento', icon: 'image',
        detail: 'or just paste a screenshot',
        keywords: 'capture photo screenshot png',
        snippet: '![${1:description}](${2:./assets/image.png})',
    },

    // ── Documento ────────────────────────────────────────────────────────────
    {
        id: 'cabecera', label: 'Document header', group: 'documento', icon: 'user',
        detail: 'owner, status, review',
        keywords: 'front matter yaml metadata owner currency',
        build: () => [
            '---',
            'owner: ${1:who owns it}',
            'estado: ${2:vigente}',
            `revisado: ${hoy()}`,
            'tags: [${3:}]',
            '---',
            '',
        ].join('\n'),
    },
    {
        id: 'fecha', label: 'Dated entry', group: 'documento', icon: 'clock',
        detail: 'for timelines and notes',
        keywords: 'today journal log timeline diary',
        build: () => `### ${hoy()}\n\n\${1:}`,
    },
    {
        id: 'indice', label: 'Outline', group: 'documento', icon: 'tree',
        detail: 'built from the headings',
        keywords: 'toc table of contents navigation',
        build: ({ content }) => {
            const list = sections(parse(content || ''))
                .filter(s => s.level >= 2 && s.level <= 4);
            if (!list.length) return '${1:The document has no headings yet}';
            const menor = Math.min(...list.map(s => s.level));
            return `${list.map(s => `${'  '.repeat(s.level - menor)}- [${s.text}](#${s.slug})`).join('\n')}\n`;
        },
    },
];

export const GROUPS = [
    { id: 'texto', label: 'Text' },
    { id: 'procedimiento', label: 'Procedure' },
    { id: 'documento', label: 'Document' },
];

/** El texto a insertar, resolviendo las entradas que dependen del documento. */
export function snippetFor(item, context = {}) {
    return typeof item.build === 'function' ? item.build(context) : item.snippet;
}

/** Un snippet sin sus paradas de tabulación, para cuando no hay dónde insertarlas. */
export function plainText(snippet) {
    return (snippet || '')
        .replace(/\$\{\d+:([^}]*)\}/g, '$1')
        .replace(/\$\{\d+\}/g, '')
        .replace(/\$\d+/g, '');
}
