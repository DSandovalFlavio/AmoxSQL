/**
 * Monaco se queda con Ctrl+K (empieza un acorde), Ctrl+L (selecciona la línea) y
 * Ctrl+Shift+F antes de que lleguen a la ventana: con el foco en el editor, los
 * atajos de la aplicación no respondían. Se le dicen de vuelta a App por un evento.
 *
 * Coste asumido: los acordes de Monaco que empiezan por Ctrl+K dejan de existir.
 * El comentario sigue en Ctrl+/ y formatear en Shift+Alt+F.
 */
export const ATAJO_DE_EDITOR = 'amox_atajo_de_editor';

const lanzar = (accion) => () => window.dispatchEvent(new CustomEvent(ATAJO_DE_EDITOR, { detail: { accion } }));

export function atajosGlobalesEnMonaco(editor, monaco, { sinPaleta = false } = {}) {
    const { CtrlCmd, Shift } = monaco.KeyMod;
    const { KeyK, KeyL, KeyF } = monaco.KeyCode;
    if (!sinPaleta) editor.addCommand(CtrlCmd | KeyK, lanzar('paleta'));
    editor.addCommand(CtrlCmd | KeyL, lanzar('assist'));
    editor.addCommand(CtrlCmd | Shift | KeyF, lanzar('buscar'));
}
