/**
 * markdownModel — el modelo estructural del documento markdown.
 *
 * Saber "qué bloque hay bajo el cursor", "dónde empieza y acaba esta sección"
 * y "qué casilla es esta línea" es el MISMO problema, y aquí se resuelve una
 * sola vez con mdast en lugar de con expresiones regulares repartidas por la
 * interfaz. `node.position` da rangos de línea exactos, que es justo lo que
 * necesitan el selector de bloque, la barra contextual, el reordenar secciones
 * y las casillas interactivas.
 *
 * Usa el mismo procesador que los generadores de Word y PowerPoint
 * (`unified` + `remark-parse` + `remark-gfm`), así que no añade dependencias.
 *
 * Nota sobre `extractToc` (markdownUtils.js): sigue con su propia
 * implementación por regex a propósito. Moverla aquí crearía un ciclo de
 * importación con `nodeToText`, y toca hacerlo cuando el panel de estructura
 * reemplace al índice actual.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import GithubSlugger from 'github-slugger';
import { nodeToText } from './markdownUtils.js';

const processor = unified().use(remarkParse).use(remarkGfm);

// ── Parseo con caché de un hueco ────────────────────────────────────────────
// El editor llama a `parse` con el mismo contenido varias veces (el selector de
// bloque al mover el cursor, las acciones estructurales al pulsarlas), y
// comparar cadenas es mucho más barato que volver a parsear.
// Un solo hueco: con dos documentos abiertos en split se turnan y cada uno paga
// un parseo extra al alternar, que en documentos de este tamaño es sub-ms.
// Sin debounce aquí — el retardo es cosa de quien llama.
let cachedSource = null;
let cachedTree = null;

// El front-matter YAML no es markdown, pero CommonMark sí ve algo ahí: un
// párrafo seguido de `---` es un título setext, así que las cuatro líneas de
// metadatos se convertían en una sección fantasma que ensuciaba el índice, el
// contador de secciones y —lo peligroso— podía moverse con el resto.
// Se detecta aquí y se cuelga del árbol para que blockAt y sections lo salten.
const FRONTMATTER_RE = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

export function frontmatterRange(content) {
    const m = (content || '').match(FRONTMATTER_RE);
    if (!m) return null;
    return { startLine: 1, endLine: m[0].replace(/\r?\n$/, '').split(/\r?\n/).length };
}

export function parse(content) {
    const source = content || '';
    if (source === cachedSource && cachedTree) return cachedTree;
    cachedSource = source;
    cachedTree = processor.parse(source);
    cachedTree.data = { ...cachedTree.data, frontmatter: frontmatterRange(source) };
    return cachedTree;
}

// ── Tipos de bloque ─────────────────────────────────────────────────────────
// Orden de especificidad: ante una línea que cae dentro de varios nodos
// anidados gana el más concreto. Un bloque de código dentro de un elemento de
// lista es "código"; un elemento de lista dentro de una cita es "lista".
// `paragraph` va al final: es el tipo por defecto cuando no hay nada mejor.
const PRIORITY = ['code', 'table', 'heading', 'thematicBreak', 'listItem', 'blockquote', 'html', 'paragraph'];

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;

const ALERT_LABELS = {
    note: 'Nota',
    tip: 'Consejo',
    important: 'Importante',
    warning: 'Aviso',
    caution: 'Atención',
};

/** Nodos que contienen la línea dada, de fuera hacia dentro. */
function chainAt(tree, line) {
    const chain = [];
    const walk = (node) => {
        if (node.type !== 'root') {
            const pos = node.position;
            if (!pos || line < pos.start.line || line > pos.end.line) return;
            chain.push(node);
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
    return chain;
}

/**
 * Describe el bloque que contiene `line` (1-indexada, como Monaco).
 * Devuelve siempre un objeto: una línea en blanco es un párrafo vacío.
 */
export function blockAt(tree, line) {
    const fm = tree?.data?.frontmatter;
    if (fm && line >= fm.startLine && line <= fm.endLine) {
        return { type: 'frontmatter', label: 'Cabecera', startLine: fm.startLine, endLine: fm.endLine, node: null };
    }

    const chain = chainAt(tree, line);

    let picked = null;
    for (const type of PRIORITY) {
        const matches = chain.filter((n) => n.type === type);
        if (matches.length) { picked = matches[matches.length - 1]; break; }
    }

    if (!picked) {
        return { type: 'paragraph', label: 'Párrafo', startLine: line, endLine: line, node: null };
    }

    const startLine = picked.position.start.line;
    const endLine = picked.position.end.line;
    const base = { startLine, endLine, node: picked };

    switch (picked.type) {
        case 'heading':
            return { ...base, type: 'heading', level: picked.depth, label: `Título ${picked.depth}` };

        case 'code':
            return { ...base, type: 'code', lang: picked.lang || '', label: picked.lang ? `Código · ${picked.lang}` : 'Bloque de código' };

        case 'table':
            return { ...base, type: 'table', label: 'Tabla' };

        case 'thematicBreak':
            return { ...base, type: 'thematicBreak', label: 'Separador' };

        case 'listItem': {
            if (picked.checked === true || picked.checked === false) {
                return { ...base, type: 'task', checked: picked.checked === true, label: 'Tarea' };
            }
            const list = [...chain].reverse().find((n) => n.type === 'list');
            const ordered = !!list?.ordered;
            return { ...base, type: 'list', ordered, label: ordered ? 'Lista numerada' : 'Lista' };
        }

        case 'blockquote': {
            const marker = nodeToText(picked.children?.[0]).match(ALERT_RE);
            if (marker) {
                const kind = marker[1].toLowerCase();
                return { ...base, type: 'callout', kind, label: `Callout · ${ALERT_LABELS[kind]}` };
            }
            return { ...base, type: 'blockquote', label: 'Cita' };
        }

        default:
            return { ...base, type: 'paragraph', label: 'Párrafo' };
    }
}

// ── Secciones ───────────────────────────────────────────────────────────────
/**
 * Los títulos del documento con su rango de líneas. Una sección va desde su
 * título hasta la línea anterior al siguiente título de nivel igual o
 * superior — de modo que mover un H2 se lleva sus H3 con él.
 *
 * Los slugs salen de github-slugger sobre el texto ya renderizado (sin
 * marcadores de énfasis), que es lo mismo que hace rehype-slug en la vista
 * previa: los enlaces del índice resuelven.
 */
export function sections(tree) {
    const slugger = new GithubSlugger();
    const fm = tree?.data?.frontmatter;
    const headings = (tree.children || []).filter(
        (n) => n.type === 'heading' && n.position && !(fm && n.position.start.line <= fm.endLine),
    );
    const lastLine = tree.position?.end?.line ?? 0;

    return headings.map((heading, i) => {
        const text = nodeToText(heading).trim();
        let endLine = lastLine;
        for (let j = i + 1; j < headings.length; j++) {
            if (headings[j].depth <= heading.depth) {
                endLine = headings[j].position.start.line - 1;
                break;
            }
        }
        return {
            level: heading.depth,
            text,
            slug: slugger.slug(text),
            headingLine: heading.position.start.line,
            startLine: heading.position.start.line,
            endLine,
        };
    });
}

/** La sección que contiene `line`, o null si está antes del primer título. */
export function sectionAt(tree, line) {
    const list = sections(tree);
    for (let i = list.length - 1; i >= 0; i--) {
        if (line >= list[i].startLine && line <= list[i].endLine) return list[i];
    }
    return null;
}

/**
 * Mueve una sección entera (título y contenido) delante de otra.
 * Devuelve el contenido nuevo, para aplicarlo como UNA sola edición: así el
 * movimiento se deshace de una vez.
 */
export function moveSection(content, fromHeadingLine, toHeadingLine) {
    const source = content || '';
    const list = sections(parse(source));
    const src = list.find((s) => s.headingLine === fromHeadingLine);
    const dst = list.find((s) => s.headingLine === toHeadingLine);
    if (!src || !dst || src === dst) return source;

    const lines = source.split('\n');
    const block = lines.slice(src.startLine - 1, src.endLine);
    const rest = [...lines.slice(0, src.startLine - 1), ...lines.slice(src.endLine)];

    // El destino se desplaza si estaba por detrás del bloque que acabamos de sacar.
    let insertAt = dst.startLine - 1;
    if (dst.startLine > src.startLine) insertAt -= block.length;

    rest.splice(Math.max(0, insertAt), 0, ...block);
    return rest.join('\n');
}

// ── Marcadores de línea ─────────────────────────────────────────────────────
/**
 * Marcadores de inicio de línea que se excluyen entre sí: viñeta, número,
 * casilla, cita y título. El selector de bloque SUSTITUYE el que haya por el
 * nuevo en vez de apilarlos — apilar es lo que hacía el toggle anterior, y lo
 * que producía líneas como "### ## Título" al cambiar de nivel.
 */
export const LINE_MARKER_RE = /^(\s*)((?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?|>\s?|#{1,6}\s+)?/;

/**
 * Qué hay que reemplazar en una línea para convertirla al marcador dado.
 * Devuelve `{ prefixLength, text }`: los caracteres iniciales a sustituir y
 * por qué texto. La sangría se conserva siempre. `marker` vacío = párrafo.
 */
export function replaceLineMarker(lineText, marker) {
    const [, indent = '', existing = ''] = (lineText || '').match(LINE_MARKER_RE) || [];
    return { prefixLength: indent.length + existing.length, text: indent + marker };
}

// ── Casillas ────────────────────────────────────────────────────────────────
/** La marca de una casilla dentro de su línea: `- [ ] ` / `* [x] ` / `1. [ ] `. */
export const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;

/**
 * Marca o desmarca la casilla de una línea. Devuelve la línea igual si no
 * lleva casilla, para que quien llama pueda no hacer nada sin comparar dos
 * veces. Respeta la sangría, el tipo de viñeta y una `X` mayúscula ya escrita.
 */
export function toggleTaskLine(lineText) {
    return (lineText || '').replace(TASK_RE, (_m, abre, marca, cierra) => `${abre}${marca === ' ' ? 'x' : ' '}${cierra}`);
}

/**
 * La tarea cuya casilla vive EN `line` (no la que simplemente la contiene: un
 * elemento de lista de cinco líneas solo es marcable desde la primera).
 */
export function taskAt(tree, line) {
    let found = null;
    const walk = (node) => {
        if (node.type !== 'root') {
            const pos = node.position;
            if (!pos || line < pos.start.line || line > pos.end.line) return;
            if (node.type === 'listItem' && (node.checked === true || node.checked === false) && pos.start.line === line) {
                found = node;
            }
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
    if (!found) return null;
    return { done: found.checked === true, line: found.position.start.line, node: found };
}

// Responsable y vencimiento son texto plano al FINAL de la línea, no sintaxis
// inventada: fuera de AmoxSQL la lista se sigue leyendo igual. Reconocerlos
// solo al final es lo que evita que un `@` a media frase se coma medio texto.
const DUE_RE = /\s+vence\s+(\d{4}-\d{2}-\d{2})\s*$/iu;
const OWNER_RE = /\s+@([\p{L}\d._-]+)\s*$/u;

/** Separa `texto @responsable vence 2026-09-14` en sus tres partes. */
export function parseTaskMeta(rawText) {
    let text = (rawText || '').trim();
    let owner = null;
    let due = null;

    // En bucle porque los dos pueden venir en cualquier orden.
    for (let i = 0; i < 2; i++) {
        const vence = text.match(DUE_RE);
        if (vence && !due) { due = vence[1]; text = text.slice(0, vence.index).trim(); continue; }
        const quien = text.match(OWNER_RE);
        if (quien && !owner) { owner = quien[1]; text = text.slice(0, quien.index).trim(); continue; }
        break;
    }

    return { text, owner, due };
}

/** Todas las casillas del documento, en orden, con su responsable y vencimiento. */
export function tasks(tree) {
    const out = [];
    const walk = (node) => {
        if (node.type === 'listItem' && (node.checked === true || node.checked === false) && node.position) {
            // Solo la primera línea del elemento. Una continuación perezosa
            // ("- [ ] tarea" y debajo más texto sangrado) cae DENTRO del mismo
            // párrafo de mdast, así que hay que cortar por el salto de línea:
            // el responsable y la fecha viven en la línea de la casilla.
            const primera = node.children?.[0];
            const meta = parseTaskMeta(nodeToText(primera || node).split('\n')[0]);
            out.push({ done: node.checked === true, line: node.position.start.line, ...meta });
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
    return out.sort((a, b) => a.line - b.line);
}

/**
 * Las secciones con cuántas casillas llevan hechas. Es lo que pinta el `2/6`
 * junto al título en la vista previa, y lo que delata una sección de trabajo
 * que nadie ha tocado.
 */
export function sectionProgress(tree) {
    const todas = tasks(tree);
    return sections(tree).map((s) => {
        const dentro = todas.filter(t => t.line >= s.startLine && t.line <= s.endLine);
        return { ...s, total: dentro.length, done: dentro.filter(t => t.done).length };
    });
}

// ── Tablas ──────────────────────────────────────────────────────────────────
/**
 * Realinea una tabla GFM. Las celdas se recortan del original por offset (no
 * por texto renderizado) para no perder el markdown de dentro: `**negrita**`,
 * `` `código` `` y enlaces siguen intactos.
 *
 * Devuelve `{ text, startLine, endLine }` para reemplazar el rango, o null si
 * el nodo no es una tabla.
 */
export function tableCells(content, tableNode) {
    if (!tableNode || tableNode.type !== 'table' || !tableNode.position) return null;
    const source = content || '';

    // El rango de una celda en mdast incluye la barra que la abre, y en la
    // última de la fila también la que la cierra. Se quitan aquí — pero solo
    // si la de cierre no viene escapada (`\|` es una barra dentro del texto).
    const cellSource = (cell) => source
        .slice(cell.position.start.offset, cell.position.end.offset)
        .replace(/^\s*\|/, '')
        .replace(/(?<!\\)\|\s*$/, '')
        .trim();

    const rows = (tableNode.children || []).map((row) => (row.children || []).map(cellSource));
    if (!rows.length) return null;

    return {
        rows,
        align: [...(tableNode.align || [])],
        startLine: tableNode.position.start.line,
        endLine: tableNode.position.end.line,
    };
}

/** Serializa filas + alineación a una tabla GFM con las columnas cuadradas. */
export function renderTable(rows, align = []) {
    const cols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    if (!cols) return '';

    // Mínimo 3 para que el separador siempre pueda llevar sus dos puntos.
    const width = [];
    for (let c = 0; c < cols; c++) {
        width[c] = rows.reduce((max, row) => Math.max(max, (row[c] || '').length), 3);
    }

    const pad = (text, c) => {
        const t = text || '';
        const room = width[c] - t.length;
        if (align[c] === 'right') return ' '.repeat(room) + t;
        if (align[c] === 'center') {
            const left = Math.floor(room / 2);
            return ' '.repeat(left) + t + ' '.repeat(room - left);
        }
        return t + ' '.repeat(room);
    };

    const row = (cells) => `| ${Array.from({ length: cols }, (_, c) => pad(cells[c], c)).join(' | ')} |`;

    const separator = `| ${Array.from({ length: cols }, (_, c) => {
        const w = width[c];
        if (align[c] === 'center') return `:${'-'.repeat(w - 2)}:`;
        if (align[c] === 'right') return `${'-'.repeat(w - 1)}:`;
        if (align[c] === 'left') return `:${'-'.repeat(w - 1)}`;
        return '-'.repeat(w);
    }).join(' | ')} |`;

    const [head, ...body] = rows;
    return [row(head), separator, ...body.map(row)].join('\n');
}

/**
 * Realinea una tabla GFM sin tocar su contenido.
 * Devuelve `{ text, startLine, endLine }` para reemplazar el rango, o null si
 * el nodo no es una tabla.
 */
export function formatTable(content, tableNode) {
    const table = tableCells(content, tableNode);
    if (!table) return null;
    return { text: renderTable(table.rows, table.align), startLine: table.startLine, endLine: table.endLine };
}

/**
 * En qué celda cae la columna `column` (1-indexada, como Monaco) de una fila.
 * Cuenta las barras que no vienen escapadas: `\|` es contenido, no separador.
 */
export function cellIndexAt(lineText, column) {
    const before = (lineText || '').slice(0, Math.max(0, column - 1));
    let count = 0;
    for (let i = 0; i < before.length; i++) {
        if (before[i] === '|' && before[i - 1] !== '\\') count++;
    }
    return Math.max(0, count - 1);
}

const TABLE_OPS = new Set(['addRowBelow', 'removeRow', 'addColRight', 'removeCol', 'align']);

/**
 * Edita la estructura de una tabla: filas, columnas y alineación.
 *
 * `op` es uno de addRowBelow · removeRow · addColRight · removeCol · align.
 * `row` y `col` son índices de fila (0 = cabecera) y de columna. `align` toma
 * 'left' | 'center' | 'right' | null.
 *
 * La cabecera no se puede borrar, ni quedarse la tabla sin columnas: en esos
 * casos devuelve null y quien llama no hace nada.
 */
export function tableEdit(content, tableNode, op, { row = 0, col = 0, align = null } = {}) {
    if (!TABLE_OPS.has(op)) return null;
    const table = tableCells(content, tableNode);
    if (!table) return null;

    const rows = table.rows.map(r => [...r]);
    const aligns = [...table.align];
    const cols = rows.reduce((max, r) => Math.max(max, r.length), 0);

    switch (op) {
        case 'addRowBelow':
            rows.splice(Math.max(1, row + 1), 0, Array(cols).fill(''));
            break;

        case 'removeRow':
            if (row <= 0 || rows.length <= 2) return null;  // ni la cabecera ni la última fila
            rows.splice(row, 1);
            break;

        case 'addColRight':
            rows.forEach((r, i) => {
                while (r.length < cols) r.push('');
                r.splice(col + 1, 0, i === 0 ? 'Columna' : '');
            });
            aligns.splice(col + 1, 0, null);
            break;

        case 'removeCol':
            if (cols <= 1) return null;
            rows.forEach((r) => { while (r.length < cols) r.push(''); r.splice(col, 1); });
            aligns.splice(col, 1);
            break;

        case 'align':
            aligns[col] = align;
            break;

        default:
            return null;
    }

    return { text: renderTable(rows, aligns), startLine: table.startLine, endLine: table.endLine };
}

// ── Front-matter: leer y escribir ───────────────────────────────────────────
/**
 * Lee el front-matter como pares clave/valor. Es YAML plano a propósito: los
 * metadatos de un documento son cuatro campos y una lista de etiquetas, no un
 * árbol. Con un parser completo habría que arrastrar js-yaml al navegador para
 * nada.
 */
export function leerFrontmatter(content) {
    const rango = frontmatterRange(content);
    if (!rango) return null;

    const lineas = (content || '').split(/\r?\n/).slice(1, rango.endLine - 1);
    const meta = {};
    for (const l of lineas) {
        const m = l.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (!m) continue;
        const [, clave, bruto] = m;
        const valor = bruto.trim();
        if (valor.startsWith('[') && valor.endsWith(']')) {
            meta[clave] = valor.slice(1, -1).split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        } else {
            meta[clave] = valor.replace(/^["']|["']$/g, '');
        }
    }
    return meta;
}

/**
 * Devuelve el documento con el front-matter actualizado. Conserva las claves
 * que no se tocan y el orden en que estaban; si el documento no tenía cabecera,
 * la crea delante. Nunca reescribe el cuerpo.
 */
export function escribirFrontmatter(content, cambios) {
    const source = content || '';
    const rango = frontmatterRange(source);
    const previo = leerFrontmatter(source) || {};
    const meta = { ...previo, ...cambios };

    const serializar = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v ?? ''));
    const cuerpoYaml = Object.entries(meta)
        .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length) && String(v) !== '')
        .map(([k, v]) => `${k}: ${serializar(v)}`)
        .join('\n');
    const bloque = `---\n${cuerpoYaml}\n---`;

    if (!rango) return `${bloque}\n\n${source}`;

    const lineas = source.split(/\r?\n/);
    return [...bloque.split('\n'), ...lineas.slice(rango.endLine)].join('\n');
}

/**
 * A qué artefactos del proyecto apunta este documento.
 *
 * Solo enlaces relativos a formatos que AmoxSQL sabe abrir: un `.md` que
 * enlaza a una consulta o a una cadena es lo que convierte una carpeta de
 * archivos sueltos en documentación navegable. Las URL externas y las anclas
 * (`#seccion`) se descartan — no llevan a ningún archivo.
 *
 * Se devuelven sin repetir y en el orden en que aparecen: el primero suele ser
 * el importante.
 */
const EXT_ENLAZABLE = /\.(sql|sqlnb|sqlchain|amoxvis|amoxdeck|md)$/i;

export function enlacesSalientes(tree) {
    const vistos = new Set();
    const out = [];
    const walk = (node) => {
        if (node.type === 'link' && typeof node.url === 'string') {
            const url = node.url.trim();
            // Fuera protocolos y anclas: nada de eso es un archivo del proyecto.
            if (url && !/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith('#')) {
                const ruta = url.split(/[?#]/)[0].replace(/^\.\//, '');
                if (EXT_ENLAZABLE.test(ruta) && !vistos.has(ruta)) {
                    vistos.add(ruta);
                    out.push({ path: ruta, text: nodeToText(node).trim() || ruta.split('/').pop() });
                }
            }
        }
        if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
    return out;
}
