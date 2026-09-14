/**
 * EditorOverlay — el formato que aparece donde está el cursor.
 *
 * Tres piezas sobre el lienzo de Monaco, nunca a la vez:
 *
 *  · **Burbuja de selección** — al seleccionar texto. Formato en línea, enlace,
 *    cita y convertir en tarea. Sin acciones de asistente: para eso está el
 *    panel lateral que ya existe.
 *  · **Barra del bloque** — con el cursor dentro de una tabla o de un bloque de
 *    código, pegada encima de él. Es lo que evita que la barra superior crezca
 *    con controles que solo valen dentro de un bloque concreto.
 *  · **Manija del margen** — al pasar el ratón por una línea, fuera de la
 *    medida de lectura. Abre el catálogo de bloques en esa línea. Es la puerta
 *    de ratón a lo que `/` hace con el teclado, y lo que permitió quitar de la
 *    barra el selector de bloque, la tabla y el menú «Insertar».
 *
 * Las tres se posicionan con `getScrolledVisiblePosition`, que da coordenadas
 * relativas al contenedor del editor — de ahí que el overlay tenga que vivir
 * dentro de `.mde-editor-pane` y este sea `position: relative`.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    LuBold, LuItalic, LuStrikethrough, LuCode, LuLink, LuQuote, LuListTodo,
    LuPlus, LuMinus, LuTable, LuAlignLeft, LuAlignCenter, LuAlignRight,
    LuCopy, LuCheck, LuChevronDown,
} from 'react-icons/lu';
import { parse, blockAt, formatTable, tableEdit, cellIndexAt } from './markdownModel.js';

const LANGUAGES = ['sql', 'bash', 'python', 'yaml', 'json', 'javascript', 'mermaid', 'text'];

const BUBBLE_HEIGHT = 34;

export default function EditorOverlay({ editor, content, onWrap, onLineMarker, onInsertar, insertarAbierto }) {
    const [selBubble, setSelBubble] = useState(null);   // { top, left }
    const [blockBar, setBlockBar] = useState(null);     // { top, left, type, lang }
    const [showLangs, setShowLangs] = useState(false);
    const [copied, setCopied] = useState(false);
    const [handle, setHandle] = useState(null);       // { top, left, line }
    const contentRef = useRef(content);

    useEffect(() => { contentRef.current = content; }, [content]);

    // ── Dónde va cada cosa ───────────────────────────────────────────────────
    const refresh = useCallback(() => {
        if (!editor) return;
        const selection = editor.getSelection();
        if (!selection) return;

        // Con selección: burbuja anclada al principio, y nada más.
        if (!selection.isEmpty()) {
            const at = editor.getScrolledVisiblePosition(selection.getStartPosition());
            setBlockBar(null);
            setShowLangs(false);
            setSelBubble(at ? { top: Math.max(4, at.top - BUBBLE_HEIGHT - 6), left: Math.max(4, at.left) } : null);
            setHandle(null);
            return;
        }

        setSelBubble(null);

        // Sin selección: ¿el cursor está dentro de una tabla o de un bloque de código?
        let block;
        try {
            block = blockAt(parse(contentRef.current || ''), selection.startLineNumber);
        } catch {
            setBlockBar(null);
            return;
        }
        if (block.type !== 'table' && block.type !== 'code') {
            setBlockBar(null);
            setShowLangs(false);
            return;
        }

        const at = editor.getScrolledVisiblePosition({ lineNumber: block.startLine, column: 1 });
        if (!at) { setBlockBar(null); return; }

        // Encima del bloque; si no cabe, justo debajo de su primera línea.
        const arriba = at.top - BUBBLE_HEIGHT - 4;
        setBlockBar({
            top: arriba >= 4 ? arriba : at.top + (at.height || 19) + 4,
            left: Math.max(4, at.left),
            type: block.type,
            lang: block.lang || '',
        });
    }, [editor]);

    // ── La manija sigue al ratón, no al cursor ───────────────────────────────
    // Es una afordancia de raton: aparece en la linea sobre la que esta, aunque
    // el cursor de texto este en otra parte. Mientras el menu esta abierto se
    // queda quieta — si se moviera, el menu apuntaria a una linea y escribiria
    // en otra.
    const abiertoRef = useRef(insertarAbierto);
    useEffect(() => { abiertoRef.current = insertarAbierto; }, [insertarAbierto]);

    // La manija vive DENTRO del panel pero FUERA del editor de Monaco, asi que
    // llevar el raton hacia ella dispara el `onMouseLeave` del editor. Ocultarla
    // ahi mismo la hacia imposible de pulsar: desaparecia justo debajo del
    // cursor. De ahi el retardo, que la propia manija cancela al recibir el
    // raton.
    const ocultarRef = useRef(null);
    const cancelarOcultar = useCallback(() => {
        if (ocultarRef.current) { clearTimeout(ocultarRef.current); ocultarRef.current = null; }
    }, []);
    const ocultarLuego = useCallback(() => {
        cancelarOcultar();
        ocultarRef.current = setTimeout(() => setHandle(null), 260);
    }, [cancelarOcultar]);

    useEffect(() => cancelarOcultar, [cancelarOcultar]);

    const seguirRaton = useCallback((e) => {
        if (!editor || abiertoRef.current) return;
        if (!editor.getSelection()?.isEmpty()) { setHandle(null); return; }
        // Sin posicion (el margen, el hueco bajo la ultima linea) no se mueve ni
        // se esconde: quedarse quieta es lo que permite ir a pulsarla.
        const line = e?.target?.position?.lineNumber;
        if (!line) return;
        const at = editor.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
        if (!at) return;
        cancelarOcultar();
        setHandle({ top: at.top, left: Math.max(0, at.left - 30), line });
    }, [editor, cancelarOcultar]);

    // Irse del PANEL es lo que esconde la manija, no irse del area de texto de
    // Monaco: el margen donde vive la manija ya cuenta como "fuera" para
    // `onMouseLeave`, y usar ese evento la hacia desaparecer justo cuando ibas
    // a pulsarla.
    useEffect(() => {
        const panel = editor?.getDomNode?.()?.closest?.('.mde-editor-pane');
        if (!panel) return undefined;
        const fuera = () => { if (!abiertoRef.current) ocultarLuego(); };
        panel.addEventListener('mouseleave', fuera);
        return () => panel.removeEventListener('mouseleave', fuera);
    }, [editor, ocultarLuego]);

    useEffect(() => {
        if (!editor) return undefined;
        const subs = [
            editor.onMouseMove(seguirRaton),
            editor.onDidChangeCursorSelection(refresh),
            editor.onDidScrollChange(refresh),
            editor.onDidChangeModelContent(refresh),
            editor.onDidBlurEditorWidget(() => { setShowLangs(false); }),
        ];
        // Sin llamada inicial a propósito: sin interacción no hay nada que
        // enseñar, y los propios eventos traen la primera posición.
        return () => subs.forEach(s => s?.dispose?.());
    }, [editor, refresh, seguirRaton]);

    // ── Acciones de tabla ────────────────────────────────────────────────────
    // Siempre reparsean el contenido VIVO: entre que se pintó la barra y se
    // pulsa el botón, el documento ha podido cambiar.
    const applyTable = useCallback((op, extra = {}) => {
        if (!editor) return;
        const model = editor.getModel();
        const live = model.getValue();
        const at = editor.getPosition();
        const block = blockAt(parse(live), at.lineNumber);
        if (block.type !== 'table') return;

        const filas = block.node.children || [];
        // La línea del separador no tiene nodo: se trata como la cabecera.
        const row = Math.max(0, filas.findIndex(r => r.position.start.line === at.lineNumber));
        const col = cellIndexAt(model.getLineContent(at.lineNumber), at.column);

        const result = op === 'format'
            ? formatTable(live, block.node)
            : tableEdit(live, block.node, op, { row, col, ...extra });
        if (!result) return;

        editor.executeEdits('mde', [{
            range: {
                startLineNumber: result.startLine,
                startColumn: 1,
                endLineNumber: result.endLine,
                endColumn: model.getLineMaxColumn(result.endLine),
            },
            text: result.text,
        }]);
        editor.focus();
    }, [editor]);

    // ── Acciones de bloque de código ─────────────────────────────────────────
    const setLanguage = useCallback((lang) => {
        if (!editor) return;
        const model = editor.getModel();
        const block = blockAt(parse(model.getValue()), editor.getPosition().lineNumber);
        if (block.type !== 'code') return;
        const lineText = model.getLineContent(block.startLine);
        const cerca = lineText.match(/^(\s*(?:```|~~~))/);
        if (!cerca) return;
        editor.executeEdits('mde', [{
            range: {
                startLineNumber: block.startLine,
                startColumn: cerca[1].length + 1,
                endLineNumber: block.startLine,
                endColumn: lineText.length + 1,
            },
            text: lang === 'text' ? '' : lang,
        }]);
        setShowLangs(false);
        editor.focus();
    }, [editor]);

    const copyCode = useCallback(async () => {
        if (!editor) return;
        const model = editor.getModel();
        const block = blockAt(parse(model.getValue()), editor.getPosition().lineNumber);
        if (block.type !== 'code') return;
        const lineas = [];
        for (let n = block.startLine + 1; n < block.endLine; n++) lineas.push(model.getLineContent(n));
        try {
            await navigator.clipboard.writeText(lineas.join('\n'));
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch (e) {
            console.error('Failed to copy code block', e);
        }
    }, [editor]);

    // Mantiene el foco en el editor: sin esto, pulsar un botón lo pierde y la
    // selección sobre la que íbamos a actuar desaparece.
    const keepFocus = (e) => e.preventDefault();

    if (!editor) return null;

    return (
        <>
            {handle && onInsertar && (
                <button
                    className={`mde-gutter-handle${insertarAbierto ? ' abierta' : ''}`}
                    style={{ top: handle.top, left: handle.left }}
                    title="Insertar un bloque aquí"
                    onMouseEnter={cancelarOcultar}
                    onMouseLeave={() => { if (!insertarAbierto) ocultarLuego(); }}
                    onMouseDown={keepFocus}
                    onClick={() => onInsertar({ line: handle.line, top: handle.top, left: handle.left })}
                >
                    <LuPlus size={13} />
                </button>
            )}

            {selBubble && (
                <div className="mde-overlay mde-bubble" style={{ top: selBubble.top, left: selBubble.left }} onMouseDown={keepFocus}>
                    <button className="mde-overlay-btn" title="Negrita (Ctrl+B)" onClick={() => onWrap('**')}><LuBold size={13} /></button>
                    <button className="mde-overlay-btn" title="Cursiva (Ctrl+I)" onClick={() => onWrap('_')}><LuItalic size={13} /></button>
                    <button className="mde-overlay-btn" title="Tachado" onClick={() => onWrap('~~')}><LuStrikethrough size={13} /></button>
                    <button className="mde-overlay-btn" title="Código en línea (Ctrl+E)" onClick={() => onWrap('`')}><LuCode size={13} /></button>
                    <span className="mde-overlay-sep" />
                    <button className="mde-overlay-btn" title="Enlace (Ctrl+K)" onClick={() => onWrap('link')}><LuLink size={13} /></button>
                    <button className="mde-overlay-btn" title="Cita" onClick={() => onLineMarker('> ')}><LuQuote size={13} /></button>
                    <button className="mde-overlay-btn" title="Convertir en tarea (Ctrl+Shift+T)" onClick={() => onLineMarker('- [ ] ')}><LuListTodo size={13} /></button>
                </div>
            )}

            {blockBar?.type === 'table' && (
                <div className="mde-overlay mde-blockbar" style={{ top: blockBar.top, left: blockBar.left }} onMouseDown={keepFocus}>
                    <button className="mde-overlay-btn wide" title="Añadir fila debajo" onClick={() => applyTable('addRowBelow')}><LuPlus size={12} /> Fila</button>
                    <button className="mde-overlay-btn wide" title="Añadir columna a la derecha" onClick={() => applyTable('addColRight')}><LuPlus size={12} /> Columna</button>
                    <button className="mde-overlay-btn" title="Quitar la fila del cursor" onClick={() => applyTable('removeRow')}><LuMinus size={12} /></button>
                    <span className="mde-overlay-sep" />
                    <button className="mde-overlay-btn" title="Alinear a la izquierda" onClick={() => applyTable('align', { align: 'left' })}><LuAlignLeft size={12} /></button>
                    <button className="mde-overlay-btn" title="Centrar" onClick={() => applyTable('align', { align: 'center' })}><LuAlignCenter size={12} /></button>
                    <button className="mde-overlay-btn" title="Alinear a la derecha" onClick={() => applyTable('align', { align: 'right' })}><LuAlignRight size={12} /></button>
                    <span className="mde-overlay-sep" />
                    <button className="mde-overlay-btn wide" title="Cuadrar las columnas" onClick={() => applyTable('format')}><LuTable size={12} /> Formatear</button>
                </div>
            )}

            {blockBar?.type === 'code' && (
                <div className="mde-overlay mde-blockbar" style={{ top: blockBar.top, left: blockBar.left }} onMouseDown={keepFocus}>
                    <div className="mde-lang-anchor">
                        <button className="mde-overlay-btn wide" title="Lenguaje del bloque" onClick={() => setShowLangs(v => !v)}>
                            {blockBar.lang || 'texto'} <LuChevronDown size={9} />
                        </button>
                        {showLangs && (
                            <div className="mde-lang-menu">
                                {LANGUAGES.map(lang => (
                                    <div
                                        key={lang}
                                        className={`mde-lang-item${lang === (blockBar.lang || 'text') ? ' active' : ''}`}
                                        onClick={() => setLanguage(lang)}
                                    >
                                        {lang}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <span className="mde-overlay-sep" />
                    <button className="mde-overlay-btn wide" title="Copiar el contenido del bloque" onClick={copyCode}>
                        {copied ? <LuCheck size={12} /> : <LuCopy size={12} />} {copied ? 'Copiado' : 'Copiar'}
                    </button>
                </div>
            )}
        </>
    );
}
