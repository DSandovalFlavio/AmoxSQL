/**
 * slashMenu — el menú de inserción de `/`, montado sobre el proveedor de
 * completado de Monaco.
 *
 * Por qué el proveedor y no un widget propio: de él salen gratis el filtrado
 * difuso, la navegación con flechas, el Enter y —lo que de verdad importa— los
 * snippets con paradas de tabulación, que es lo que permite insertar una tabla
 * y luego ir saltando de celda con Tab. Un widget propio daría más control
 * visual a cambio de reimplementar todo eso a mano.
 *
 * El disparo está acotado a propósito: `/` solo abre el menú a principio de
 * línea o después de un espacio, así que escribir una ruta (`docs/dev`) o una
 * fracción (`y/o`) no lo invoca. Esc lo cierra y deja la barra escrita.
 */
import { INSERTABLES, GROUPS, snippetFor } from './markdownInsertables.js';

// `/` más lo tecleado detrás, y solo si antes hay principio de línea o espacio.
export const TRIGGER_RE = /(?:^|\s)\/([\p{L}\d-]*)$/u;

const GROUP_ORDER = new Map(GROUPS.map((g, i) => [g.id, i]));

/**
 * Registra el proveedor una sola vez por instancia de Monaco.
 * `getContent` devuelve el texto actual del documento, que necesitan las
 * entradas dinámicas (el índice se genera desde los títulos de verdad).
 */
export function registerSlashMenu(monaco, getContent) {
    if (monaco.languages._mdSlashRegistered) return;
    monaco.languages._mdSlashRegistered = true;

    monaco.languages.registerCompletionItemProvider('markdown', {
        triggerCharacters: ['/'],

        provideCompletionItems(model, position) {
            const textUntil = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
            });

            const match = textUntil.match(TRIGGER_RE);
            if (!match) return { suggestions: [] };

            // El rango cubre la barra y lo tecleado detrás, para que aceptar
            // una sugerencia sustituya "/tab" en vez de dejarlo delante.
            const typed = match[1];
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: position.column - typed.length - 1,
                endColumn: position.column,
            };

            const content = typeof getContent === 'function' ? getContent() : model.getValue();

            const suggestions = INSERTABLES.map((item, i) => {
                const grupo = GROUPS.find(g => g.id === item.group);
                return {
                    label: {
                        label: `/${item.id}`,
                        detail: `  ${item.label}`,
                        description: item.detail || grupo?.label || '',
                    },
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    // El filtro de Monaco casa contra este texto, que empieza por
                    // "/" porque el rango tecleado también lo incluye.
                    filterText: `/${item.id} ${item.label} ${item.keywords || ''}`,
                    sortText: `${GROUP_ORDER.get(item.group) ?? 9}${String(i).padStart(3, '0')}`,
                    insertText: snippetFor(item, { content, line: position.lineNumber }),
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                };
            });

            return { suggestions };
        },
    });
}
