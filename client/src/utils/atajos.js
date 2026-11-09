/**
 * **La tabla de los atajos** (Dec-88). Una sola: de aquí leen el manejador global
 * (`App.jsx`), Ajustes y la documentación (`scripts/atajosADocs.mjs`), y
 * `scripts/probarInteraccion.mjs` comprueba que la paleta no diga otra cosa.
 * Había cuatro listas y no coincidían.
 *
 * `donde` dice quién atiende la tecla:
 *   app       el manejador global, aquí abajo
 *   editor    Monaco o `SqlEditor`, con el foco en el editor
 *   cuaderno  el cuaderno
 *   ventana   `electron/main.js`
 *
 * Para comparar se usa la letra sin distinguir mayúsculas (con Bloq Mayús, Ctrl+S
 * llegaba como 'S' y no respondía) y los símbolos también por la tecla física,
 * porque cambian con la distribución: en un teclado latinoamericano `\\` necesita
 * AltGr, y Shift+/ da `?` en unos teclados y otra cosa en otros.
 */
const A = (id, teclas, categoria, en, es, extra = {}) => ({ id, teclas, categoria, en, es, donde: 'app', ...extra });
const EDITOR = { donde: 'editor' };
const SIEMPRE = { siempre: true };

export const ATAJOS = [
    A('paleta', 'Ctrl+K', 'General', 'Command palette', 'Paleta de comandos', SIEMPRE),
    A('salto', 'Ctrl+P', 'General', 'Jump to a file, table or column', 'Saltar a un archivo, tabla o columna', SIEMPRE),
    A('paleta2', 'Ctrl+Shift+P', 'General', 'Command palette (alias)', 'Paleta de comandos (alias)', SIEMPRE),
    A('ajustes', 'Ctrl+,', 'General', 'Settings', 'Ajustes'),
    A('lista', 'Ctrl+Shift+/', 'General', 'This list', 'Esta lista'),

    A('guardar', 'Ctrl+S', 'Files', 'Save', 'Guardar'),
    A('guardarComo', 'Ctrl+Shift+S', 'Files', 'Save as…', 'Guardar como…'),
    A('nuevoSql', 'Ctrl+N', 'Files', 'New SQL query', 'Nueva consulta SQL'),
    A('nuevoCuaderno', 'Ctrl+Shift+N', 'Files', 'New notebook', 'Nuevo cuaderno'),
    A('buscar', 'Ctrl+Shift+F', 'Files', 'Search the whole project', 'Buscar en todo el proyecto'),

    A('ejecutar', 'Ctrl+Enter', 'Queries', 'Run (the selection, or the whole script)', 'Ejecutar (la selección, o todo el script)'),
    A('ejecutar2', 'F5', 'Queries', 'Run', 'Ejecutar'),
    A('sentencia', 'Ctrl+Alt+Enter', 'Queries', 'Run only the statement under the cursor', 'Ejecutar solo la sentencia bajo el cursor', EDITOR),
    A('cancelar', 'Esc', 'Queries', "Stop this tab's query (when nothing else is open)", 'Detener la consulta de esta pestaña (si no hay nada más abierto)', { donde: 'app-esc' }),
    A('analizar', 'Ctrl+Shift+A', 'Queries', 'Analyse the execution plan', 'Analizar el plan de ejecución'),
    A('analizar2', 'Ctrl+E', 'Queries', 'Analyse the execution plan (alias)', 'Analizar el plan de ejecución (alias)', EDITOR),
    A('historial', 'Ctrl+Shift+H', 'Queries', 'Query history', 'Historial de consultas'),
    A('ambos', 'Ctrl+Shift+R', 'Queries', 'Run both split panes', 'Ejecutar los dos paneles'),
    A('todas', 'Ctrl+Shift+Enter', 'Queries', 'Run all cells', 'Ejecutar todas las celdas', { donde: 'cuaderno' }),

    A('cerrar', 'Ctrl+W', 'Tabs', 'Close the tab', 'Cerrar la pestaña'),
    A('reabrir', 'Ctrl+Shift+T', 'Tabs', 'Reopen the last one you closed', 'Reabrir la última que cerraste'),
    A('fijar', 'Alt+P', 'Tabs', 'Pin or unpin the tab', 'Fijar o soltar la pestaña'),
    A('siguiente', 'Ctrl+Tab', 'Tabs', 'Go to the most recently used', 'Ir a la usada más recientemente'),
    A('anterior', 'Ctrl+Shift+Tab', 'Tabs', 'The other way round', 'Al revés'),
    A('atras', 'Alt+Left', 'Tabs', 'Back through visited tabs', 'Atrás por las pestañas visitadas'),
    A('adelante', 'Alt+Right', 'Tabs', 'Forward through visited tabs', 'Adelante por las pestañas visitadas'),
    A('dividir', 'Ctrl+\\', 'Tabs', 'Split the screen in two', 'Dividir la pantalla en dos'),
    A('duplicar', 'Ctrl+Shift+\\', 'Tabs', 'Duplicate the tab to the other pane', 'Duplicar la pestaña al otro panel'),

    A('lateral', 'Ctrl+B', 'Panels', 'Show or hide the sidebar', 'Mostrar u ocultar la barra lateral'),
    A('assist', 'Ctrl+L', 'Panels', 'Show or hide Assist; with text selected, ask about it', 'Mostrar u ocultar Assist; con texto seleccionado, preguntar por él'),
    A('archivos', 'Ctrl+Shift+E', 'Panels', 'Go to the file explorer', 'Ir al explorador de archivos'),
    A('esquema', 'Ctrl+Shift+D', 'Panels', 'Go to the database schema', 'Ir al esquema de la base de datos'),

    A('encontrar', 'Ctrl+F', 'Editor', 'Find', 'Buscar', EDITOR),
    A('reemplazar', 'Ctrl+H', 'Editor', 'Find and replace', 'Buscar y reemplazar', EDITOR),
    A('formatear', 'Shift+Alt+F', 'Editor', 'Format the SQL', 'Formatear el SQL', EDITOR),
    A('comentar', 'Ctrl+/', 'Editor', 'Comment or uncomment the line', 'Comentar o descomentar la línea', EDITOR),
    A('coincidencia', 'Ctrl+D', 'Editor', 'Select the next match (several cursors)', 'Seleccionar la siguiente coincidencia (varios cursores)', EDITOR),
    A('copiarLinea', 'Shift+Alt+Down', 'Editor', 'Duplicate the line', 'Duplicar la línea', EDITOR),
    A('moverLinea', 'Alt+Up', 'Editor', 'Move the line up (Alt+Down, down)', 'Subir la línea (Alt+Abajo, bajarla)', EDITOR),
    A('borrarLinea', 'Ctrl+Shift+K', 'Editor', 'Delete the line', 'Borrar la línea', EDITOR),
    A('deshacer', 'Ctrl+Z', 'Editor', 'Undo (each tab keeps its own history)', 'Deshacer (cada pestaña guarda su historia)', EDITOR),
    A('rehacer', 'Ctrl+Shift+Z', 'Editor', 'Redo', 'Rehacer', EDITOR),

    A('acercar', 'Ctrl+=', 'View', 'Zoom in', 'Acercar', { donde: 'ventana' }),
    A('alejar', 'Ctrl+-', 'View', 'Zoom out', 'Alejar', { donde: 'ventana' }),
    A('zoom0', 'Ctrl+0', 'View', 'Reset zoom', 'Restablecer el zoom', { donde: 'ventana' }),
    A('escapar', 'Escape', 'View', 'Close the dialog on top', 'Cerrar el diálogo de encima', { donde: 'modal' }),
];

const esMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');

const SIMBOLOS = {
    '/': (e) => e.code === 'Slash' || e.key === '/' || e.key === '?',
    '\\': (e) => e.code === 'Backslash' || e.key === '\\' || e.key === '|',
    ',': (e) => e.key === ',' || e.code === 'Comma',
};
const ESPECIALES = { Left: 'ArrowLeft', Right: 'ArrowRight' };

function partir(teclas) {
    const p = teclas.split('+');
    // «Ctrl+-» y «Ctrl+=»: la tecla es lo último que queda, nunca vacío.
    const tecla = p.pop() || '+';
    return { ctrl: p.includes('Ctrl'), shift: p.includes('Shift'), alt: p.includes('Alt'), tecla };
}

/** ¿Este evento es esta combinación? */
export function coincide(e, teclas, mac = esMac()) {
    const a = partir(teclas);
    const ctrl = e.ctrlKey || (mac && e.metaKey);
    if (!!ctrl !== a.ctrl || !!e.shiftKey !== a.shift || !!e.altKey !== a.alt) return false;
    if (SIMBOLOS[a.tecla]) return SIMBOLOS[a.tecla](e);
    if (a.tecla.length === 1) return (e.key || '').toLowerCase() === a.tecla.toLowerCase();
    return e.key === (ESPECIALES[a.tecla] || a.tecla);
}

const DE_LA_APP = ATAJOS.filter(a => a.donde === 'app');

/** El atajo global que corresponde a este evento, o null. */
export const atajoDe = (e, mac = esMac()) => DE_LA_APP.find(a => coincide(e, a.teclas, mac)) || null;

/** Para pintarlo: «Ctrl + S». */
export const teclasLegibles = (teclas) => {
    const { ctrl, shift, alt, tecla } = partir(teclas);
    return [ctrl && 'Ctrl', shift && 'Shift', alt && 'Alt', tecla].filter(Boolean).join(' + ');
};

/** Por categorías, en el orden de la tabla. */
export function seccionesDeAtajos(idioma = 'en') {
    const secciones = new Map();
    for (const a of ATAJOS) {
        if (!secciones.has(a.categoria)) secciones.set(a.categoria, { category: a.categoria, items: [] });
        secciones.get(a.categoria).items.push({ keys: teclasLegibles(a.teclas), description: a[idioma] });
    }
    return [...secciones.values()];
}
