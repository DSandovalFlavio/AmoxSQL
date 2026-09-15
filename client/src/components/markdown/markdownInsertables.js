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
        label: 'Flujo',
        detalle: 'cajas y flechas',
        texto: ['```mermaid', 'flowchart LR', '  A["origen"] --> B["transformación"]', '  B --> C["destino"]', '```', ''].join('\n'),
    },
    // Las tres de arquitectura salen de la pregunta 21 de la auditoría: las
    // genéricas —«flujo», «secuencia»— no son lo que empieza a escribir alguien
    // que documenta una plataforma de datos. Llevan sus capas ya definidas,
    // porque colorear por zona es la primera cosa que hace este público.
    {
        id: 'capas',
        label: 'Arquitectura por capas',
        detalle: 'aterrizaje, refinado, consumo',
        texto: ['```mermaid', 'flowchart LR', '  subgraph z1["Aterrizaje"]', '    fuente[("Sistema de origen")]', '  end', '  subgraph z2["Refinado"]', '    limpieza["Limpieza"]', '    modelo["Modelo"]', '  end', '  subgraph z3["Consumo"]', '    tablero(("Tablero"))', '  end', '  fuente --> limpieza', '  limpieza --> modelo', '  modelo ==> tablero', '  classDef origen fill:#1b3a52,stroke:#4a9fd8', '  classDef proceso fill:#1d4034,stroke:#4fb286', '  classDef salida fill:#4a3a16,stroke:#d9a441', '  class fuente origen', '  class limpieza,modelo proceso', '  class tablero salida', '```', ''].join('\n'),
    },
    {
        id: 'ingesta',
        label: 'Ingesta',
        detalle: 'por lotes frente a continua',
        texto: ['```mermaid', 'flowchart LR', '  diario[("Carga diaria")] --> land["Zona de aterrizaje"]', '  eventos[("Eventos")] -.-> land', '  land --> calidad{"¿Pasa calidad?"}', '  calidad -->|sí| almacen[("Almacén")]', '  calidad -->|no| cuarentena[/"Cuarentena"/]', '```', ''].join('\n'),
    },
    {
        id: 'experimento',
        label: 'Experimento',
        detalle: 'entrenar, evaluar, reentrenar',
        texto: ['```mermaid', 'flowchart LR', '  rasgos[("Rasgos")] --> entrenar["Entrenar"]', '  entrenar --> evaluar{"¿Mejora?"}', '  evaluar -->|sí| publicar[\\"Publicar"\\]', '  evaluar -->|no| ajustar["Ajustar"]', '  ajustar --> entrenar', '```', ''].join('\n'),
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

/** Fecha local en ISO corto, sin arrastrar la zona horaria de UTC. */
function hoy() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}

const CALLOUT_KINDS = [
    { id: 'nota', kind: 'NOTE', label: 'Nota', icon: 'info', keywords: 'note apunte' },
    { id: 'consejo', kind: 'TIP', label: 'Consejo', icon: 'bulb', keywords: 'tip truco recomendación' },
    { id: 'importante', kind: 'IMPORTANT', label: 'Importante', icon: 'circleAlert', keywords: 'important clave' },
    { id: 'aviso', kind: 'WARNING', label: 'Aviso', icon: 'warning', keywords: 'warning cuidado ojo' },
    { id: 'atencion', kind: 'CAUTION', label: 'Atención', icon: 'danger', keywords: 'caution peligro destructivo borra' },
];

export const INSERTABLES = [
    // ── Texto ────────────────────────────────────────────────────────────────
    ...[1, 2, 3, 4, 5, 6].map(n => ({
        id: `h${n}`,
        label: `Título ${n}`,
        group: 'texto',
        icon: 'hash',
        keywords: `titulo heading h${n} seccion`,
        snippet: `${'#'.repeat(n)} \${1:Título}`,
    })),
    {
        id: 'lista', label: 'Lista', group: 'texto', icon: 'list',
        keywords: 'viñeta bullet punto',
        snippet: '- ${1:elemento}',
    },
    {
        id: 'numerada', label: 'Lista numerada', group: 'texto', icon: 'listOrdered',
        keywords: 'ordenada pasos enumerar',
        snippet: '1. ${1:primero}',
    },
    {
        id: 'tarea', label: 'Tarea', group: 'texto', icon: 'todo',
        detail: 'casilla marcable',
        keywords: 'casilla checkbox pendiente todo por hacer',
        snippet: '- [ ] ${1:tarea}',
    },
    {
        id: 'cita', label: 'Cita', group: 'texto', icon: 'quote',
        keywords: 'blockquote citar',
        snippet: '> ${1:cita}',
    },
    {
        id: 'tabla', label: 'Tabla', group: 'texto', icon: 'table',
        detail: '3 columnas, Tab entre celdas',
        keywords: 'table rejilla columnas',
        snippet: [
            '| ${1:Columna} | ${2:Columna} | ${3:Columna} |',
            '| --- | --- | --- |',
            '| ${4:} | ${5:} | ${6:} |',
        ].join('\n'),
    },
    {
        id: 'separador', label: 'Separador', group: 'texto', icon: 'minus',
        keywords: 'linea horizontal regla hr',
        snippet: '\n---\n',
    },

    // ── Procedimiento ────────────────────────────────────────────────────────
    {
        id: 'pasos', label: 'Pasos', group: 'procedimiento', icon: 'listOrdered',
        detail: 'numerados, con casilla',
        keywords: 'procedimiento runbook receta secuencia',
        snippet: [
            '1. [ ] ${1:Primer paso}',
            '2. [ ] ${2:Segundo paso}',
            '3. [ ] ${3:Tercer paso}',
        ].join('\n'),
    },
    {
        id: 'comando', label: 'Comando', group: 'procedimiento', icon: 'terminal',
        detail: 'bloque con botón de copiar',
        keywords: 'shell bash consola terminal ejecutar',
        snippet: '```bash\n${1:comando}\n```\n',
    },
    {
        id: 'verificacion', label: 'Verificación', group: 'procedimiento', icon: 'shield',
        detail: 'cómo confirmar que quedó bien',
        keywords: 'comprobar validar check control',
        snippet: '> [!TIP]\n> **Verificación:** ${1:qué tiene que verse para dar el paso por bueno}\n',
    },
    ...CALLOUT_KINDS.map(({ id, kind, label, icon, keywords }) => ({
        id,
        label,
        group: 'procedimiento',
        icon,
        detail: 'callout',
        keywords: `callout aviso admonition ${keywords}`,
        snippet: `> [!${kind}]\n> \${1:${label}}\n`,
    })),
    {
        id: 'codigo', label: 'Bloque de código', group: 'procedimiento', icon: 'code',
        keywords: 'code fence sql python yaml json',
        snippet: '```${1:sql}\n${2:}\n```\n',
    },
    {
        id: 'diagrama', label: 'Diagrama · Flujo', group: 'procedimiento', icon: 'workflow',
        detail: 'cajas y flechas',
        keywords: 'mermaid flujo grafo dag pipeline',
        // Con comillas, que es la forma canónica que escribe AmoxDiagram: así
        // un diagrama insertado a mano y luego editado en el lienzo no produce
        // un diff de reformateo la primera vez que se guarda.
        snippet: '```mermaid\nflowchart LR\n  ${1:A["origen"]} --> ${2:B["transformación"]}\n  ${2} --> ${3:C["destino"]}\n```\n',
    },
    // Cuatro plantillas, no una: un diagrama de secuencia o de estados no se
    // escribe de memoria, y son justo los que documentan un proceso.
    ...PLANTILLAS_DIAGRAMA.filter(p => p.id !== 'flujo').map(p => ({
        id: `diagrama-${p.id}`,
        label: `Diagrama · ${p.label}`,
        group: 'procedimiento',
        icon: 'workflow',
        detail: p.detalle,
        keywords: `mermaid diagrama grafo ${p.id}`,
        snippet: p.texto,
    })),
    {
        id: 'imagen', label: 'Imagen', group: 'procedimiento', icon: 'image',
        detail: 'o pega una captura directamente',
        keywords: 'captura foto screenshot png',
        snippet: '![${1:descripción}](${2:./assets/imagen.png})',
    },

    // ── Documento ────────────────────────────────────────────────────────────
    {
        id: 'cabecera', label: 'Cabecera del documento', group: 'documento', icon: 'user',
        detail: 'dueño, estado, revisión',
        keywords: 'front matter yaml metadatos owner vigencia',
        build: () => [
            '---',
            'owner: ${1:responsable}',
            'estado: ${2:vigente}',
            `revisado: ${hoy()}`,
            'tags: [${3:}]',
            '---',
            '',
        ].join('\n'),
    },
    {
        id: 'fecha', label: 'Entrada con fecha', group: 'documento', icon: 'clock',
        detail: 'para cronologías y notas',
        keywords: 'hoy diario log timeline cronologia bitacora',
        build: () => `### ${hoy()}\n\n\${1:}`,
    },
    {
        id: 'indice', label: 'Índice', group: 'documento', icon: 'tree',
        detail: 'generado desde los títulos',
        keywords: 'toc tabla de contenidos navegacion',
        build: ({ content }) => {
            const list = sections(parse(content || ''))
                .filter(s => s.level >= 2 && s.level <= 4);
            if (!list.length) return '${1:El documento todavía no tiene títulos}';
            const menor = Math.min(...list.map(s => s.level));
            return `${list.map(s => `${'  '.repeat(s.level - menor)}- [${s.text}](#${s.slug})`).join('\n')}\n`;
        },
    },
];

export const GROUPS = [
    { id: 'texto', label: 'Texto' },
    { id: 'procedimiento', label: 'Procedimiento' },
    { id: 'documento', label: 'Documento' },
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
