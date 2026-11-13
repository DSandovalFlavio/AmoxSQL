import { createRoot } from 'react-dom/client';
import { LuSparkles, LuWrench, LuMessageCircleQuestion, LuZap, LuWandSparkles, LuScissors, LuPenLine } from 'react-icons/lu';
import { crearRevision } from './RevisionEnMonaco.jsx';
import { focoDeEditor, seleccionConBarra } from '../archivos/index.js';
import { fijarFoco } from '../../../utils/memoriaDePestana.js';
import { suscribirPropuestas } from '../propuestasEnEditor.js';
import { emitir } from '../../../eventos.js';

/**
 * **El Assistant en un editor por líneas** (plan del Assistant, E2): `.sql` y texto.
 *
 * Tres cosas, enganchadas a un editor de Monaco:
 *   1. el foco —la selección y la sentencia bajo el cursor— se guarda en la
 *      memoria de la pestaña, para que el Assistant sepa qué es «esto»;
 *   2. la barra sobre la selección (decisión 1): con más de una palabra
 *      seleccionada aparece Explain · Fix · Optimize · Ask…; Escape la cierra
 *      hasta que la selección cambia;
 *   3. las propuestas pendientes de este archivo, revisadas en el propio editor.
 *
 * El editor de SQL cambia de pestaña sin desmontarse (un modelo por pestaña): por
 * eso pestaña, ruta y tipo se leen con `obtener()` cada vez que cambia el modelo.
 *
 * @param {object} editor
 * @param {object} monaco
 * @param {() => { tabId: string, ruta: string|null, tipo: 'sql'|'texto' }} obtener
 * @returns {() => void} desengancha
 */
export function conectarAsistente(editor, monaco, obtener) {
    // ── 1. El foco ──────────────────────────────────────────────────────────
    let temporizadorFoco = null;
    const guardarFoco = () => {
        const { tabId, tipo } = obtener() || {};
        const modelo = editor.getModel();
        if (!tabId || !modelo) return;
        const sel = editor.getSelection();
        const seleccion = sel && !sel.isEmpty()
            ? { texto: modelo.getValueInRange(sel), desde: sel.startLineNumber, hasta: sel.endColumn === 1 && sel.endLineNumber > sel.startLineNumber ? sel.endLineNumber - 1 : sel.endLineNumber }
            : null;
        fijarFoco(tabId, focoDeEditor({ texto: modelo.getValue(), tipo, seleccion, lineaCursor: sel?.positionLineNumber || 1 }));
    };

    // ── 2. La barra sobre la selección ──────────────────────────────────────
    const nodoBarra = document.createElement('div');
    nodoBarra.className = 'amx-sel-widget';
    const raizBarra = createRoot(nodoBarra);
    let posicionBarra = null;
    let barraVisible = false;
    let cerradaCon = null;   // la selección en la que se pulsó Escape
    const widgetBarra = {
        getId: () => 'amx.asistente.seleccion',
        getDomNode: () => nodoBarra,
        getPosition: () => (posicionBarra ? {
            position: posicionBarra,
            preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.ABOVE],
        } : null),
    };
    const accionar = (accion) => {
        const { tabId } = obtener() || {};
        guardarFoco();
        emitir('amox_asistir', { accion, tabId });
        if (accion !== 'preguntar') ocultarBarra();
    };
    const pintarBarra = (tipo) => {
        const b = (accion, Icono, texto, prim = false) => (
            <button key={accion} type="button" className={`amx-sel-btn${prim ? ' amx-sel-btn--prim' : ''}`}
                onMouseDown={(e) => e.preventDefault()} onClick={() => accionar(accion)}>
                <Icono size={12} /> {texto}
            </button>
        );
        raizBarra.render(
            <div className="amx-sel-barra" role="toolbar" aria-label="Ask Assist about the selection">
                <LuSparkles size={12} className="amx-sel-icono" />
                {tipo === 'markdown' ? (
                    // E3 (M2): en prosa se reescribe, se acorta, se explica o se sigue.
                    <>
                        {b('reescribir', LuWandSparkles, 'Rewrite', true)}
                        {b('acortar', LuScissors, 'Shorter')}
                        {b('explicar', LuMessageCircleQuestion, 'Explain')}
                        {b('continuar', LuPenLine, 'Continue')}
                    </>
                ) : (
                    <>
                        {b('explicar', LuMessageCircleQuestion, 'Explain', true)}
                        {tipo === 'sql' ? b('arreglar', LuWrench, 'Fix') : b('mejorar', LuWandSparkles, 'Improve')}
                        {tipo === 'sql' && b('optimizar', LuZap, 'Optimize')}
                    </>
                )}
                <button type="button" className="amx-sel-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => accionar('preguntar')}>
                    Ask… <kbd>Ctrl L</kbd>
                </button>
            </div>
        );
    };
    const ocultarBarra = () => {
        if (!barraVisible) return;
        barraVisible = false;
        posicionBarra = null;
        editor.removeContentWidget(widgetBarra);
    };
    const claveSel = (sel) => (sel ? `${sel.startLineNumber}:${sel.startColumn}-${sel.endLineNumber}:${sel.endColumn}` : '');
    const decidirBarra = () => {
        const modelo = editor.getModel();
        const sel = editor.getSelection();
        if (!modelo || !sel || sel.isEmpty() || editor.getOption(monaco.editor.EditorOption.readOnly)) { ocultarBarra(); return; }
        if (cerradaCon === claveSel(sel)) return;
        cerradaCon = null;
        if (!seleccionConBarra(modelo.getValueInRange(sel))) { ocultarBarra(); return; }
        posicionBarra = { lineNumber: sel.endLineNumber, column: sel.endColumn };
        pintarBarra(obtener()?.tipo || 'sql');
        if (barraVisible) editor.layoutContentWidget(widgetBarra);
        else { editor.addContentWidget(widgetBarra); barraVisible = true; }
    };

    let temporizadorBarra = null;
    const alSeleccionar = editor.onDidChangeCursorSelection(() => {
        clearTimeout(temporizadorFoco);
        temporizadorFoco = setTimeout(guardarFoco, 120);
        clearTimeout(temporizadorBarra);
        // Mientras se arrastra el ratón no aparece: espera a que la selección se quede quieta.
        temporizadorBarra = setTimeout(decidirBarra, 250);
    });
    const alTeclear = editor.onKeyDown((e) => {
        if (e.keyCode === monaco.KeyCode.Escape && barraVisible) {
            cerradaCon = claveSel(editor.getSelection());
            ocultarBarra();
        }
    });

    // ── 3. Las propuestas de este archivo ───────────────────────────────────
    const revision = crearRevision(editor, monaco);
    let dejarDeOir = () => {};
    let rutaOida = null;
    const oirPropuestas = () => {
        const { ruta } = obtener() || {};
        if (ruta === rutaOida) return;
        dejarDeOir();
        rutaOida = ruta;
        dejarDeOir = ruta ? suscribirPropuestas(ruta, ({ propuestas, acciones }) => revision.mostrar(propuestas, acciones)) : () => {};
    };
    oirPropuestas();
    guardarFoco();
    // Otra pestaña en el mismo editor: otro archivo, otro foco.
    const alCambiarModelo = editor.onDidChangeModel(() => {
        ocultarBarra();
        rutaOida = null;
        // La revisión se limpia sola al cambiar de modelo; se vuelve a oír al terminar el cambio.
        setTimeout(() => { oirPropuestas(); guardarFoco(); }, 0);
    });

    let quitado = false;
    const quitar = () => {
        if (quitado) return;
        quitado = true;
        clearTimeout(temporizadorFoco); clearTimeout(temporizadorBarra);
        alSeleccionar.dispose(); alTeclear.dispose(); alCambiarModelo.dispose(); alDesechar.dispose();
        dejarDeOir();
        try { revision.dispose(); } catch { /* el editor ya no está */ }
        try { ocultarBarra(); } catch { /* ídem */ }
        // Sin editor no hay foco: que el chat no siga enseñando una selección que ya no existe.
        const { tabId } = obtener() || {};
        if (tabId) fijarFoco(tabId, null);
        setTimeout(() => raizBarra.unmount(), 0);
    };
    // E3: un editor que se desmonta solo (el Markdown en la vista de lectura) se desengancha.
    const alDesechar = editor.onDidDispose(quitar);
    return quitar;
}
