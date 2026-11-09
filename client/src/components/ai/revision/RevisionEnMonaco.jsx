import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { LuSparkles, LuCheck, LuX, LuChevronDown, LuLock } from 'react-icons/lu';
import { diffLineas } from '../../../utils/diffLineas.js';
import { ubicarRango, describirRango } from '../archivos/rango.js';

/**
 * **La propuesta del Assistant, dentro del editor** (plan del Assistant, E2).
 *
 * Lo que sale se marca en rojo en sus propias líneas; lo que entra se ve debajo,
 * en verde, en una zona que ocupa sitio pero no es texto del archivo; encima, una
 * barra con Accept · Reject · Next. Nada de esto toca el modelo: el archivo no
 * cambia hasta Accept, que va por `executeEdits` (Ctrl+Z lo deshace).
 *
 * Mientras está pendiente, sus líneas son de solo lectura (decisión 2): el editor
 * se pone en solo lectura cuando el cursor entra en ellas y vuelve al salir.
 *
 * Se vuelve a pintar cuando el texto cambia: la propuesta se ubica por su texto
 * (`ubicarRango`), así que sigue a sus líneas si se escribe encima o debajo, y
 * desaparece si esa parte cambió (el chat la da por caducada).
 */

function BarraDePropuesta({ tc, donde, indice, total, bloqueada, onAceptar, onRechazar, onSiguiente }) {
    const r = tc.result || {};
    const insercion = donde.hasta < donde.desde;
    return (
        <div className="amx-rev-barra" role="group" aria-label="Assist proposal">
            <LuSparkles size={12} className="amx-rev-barra-icono" />
            <span className="amx-rev-barra-titulo">{insercion ? 'Insert' : 'Change'} {describirRango(r, donde)}</span>
            {r.resumen && <span className="amx-rev-barra-desc">{r.resumen}</span>}
            <button type="button" className="amx-rev-btn amx-rev-btn--ok" onMouseDown={(e) => e.preventDefault()} onClick={onAceptar}>
                <LuCheck size={12} /> Accept
            </button>
            <button type="button" className="amx-rev-btn" onMouseDown={(e) => e.preventDefault()} onClick={onRechazar}>
                <LuX size={12} /> Reject
            </button>
            {total > 1 && (
                <button type="button" className="amx-rev-btn amx-rev-btn--fant" onMouseDown={(e) => e.preventDefault()} onClick={onSiguiente} title="Next proposal">
                    {indice + 1} of {total} <LuChevronDown size={12} />
                </button>
            )}
            {bloqueada && <span className="amx-rev-barra-nota"><LuLock size={11} /> locked while pending</span>}
        </div>
    );
}

/**
 * Engancha la revisión a un editor. Devuelve `{ mostrar(propuestas, acciones), revelar(toolCallId), dispose() }`.
 */
export function crearRevision(editor, monaco) {
    let actual = { propuestas: [], acciones: null };
    let zonas = [];
    let widgets = [];
    let bloqueos = [];       // [{ desde, hasta }] líneas que no se editan mientras hay propuesta
    let ubicadas = [];       // [{ tc, donde }] en el orden del archivo
    let enSoloLectura = false;
    const decoraciones = editor.createDecorationsCollection();
    // Un editor que ya era de solo lectura no se toca.
    const yaSoloLectura = !!editor.getOption(monaco.editor.EditorOption.readOnly);

    const limpiar = () => {
        editor.changeViewZones(acc => zonas.forEach(z => acc.removeZone(z)));
        zonas = [];
        decoraciones.clear();
        for (const w of widgets) { editor.removeOverlayWidget(w); w.raiz.unmount(); }
        widgets = [];
        bloqueos = [];
    };

    const fijarSoloLectura = () => {
        if (yaSoloLectura) return;
        const linea = editor.getPosition()?.lineNumber;
        const dentro = !!linea && bloqueos.some(b => linea >= b.desde && linea <= b.hasta);
        if (dentro === enSoloLectura) return;
        if (dentro) {
            enSoloLectura = true;
            editor.updateOptions({ readOnly: true, readOnlyMessage: { value: 'Accept or reject the Assist proposal on these lines first.' } });
        } else {
            enSoloLectura = false;
            editor.updateOptions({ readOnly: false });
        }
    };

    const pintar = () => {
        limpiar();
        const modelo = editor.getModel();
        if (!modelo || !actual.propuestas.length) { fijarSoloLectura(); return; }
        const texto = modelo.getValue();
        const n = modelo.getLineCount();
        ubicadas = actual.propuestas
            .map(tc => ({ tc, donde: ubicarRango(texto, tc.result) }))
            .filter(x => x.donde)
            .sort((a, b) => a.donde.desde - b.donde.desde);

        const fuente = editor.getOption(monaco.editor.EditorOption.fontInfo);
        const alto = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const nuevasDecoraciones = [];

        editor.changeViewZones(acc => {
            ubicadas.forEach(({ tc, donde }, indice) => {
                const actuales = donde.hasta >= donde.desde ? modelo.getLinesContent().slice(donde.desde - 1, donde.hasta) : [];
                const nuevas = tc.result.contenido === '' ? [] : String(tc.result.contenido).replace(/\r/g, '').split('\n');
                const { bloques } = diffLineas(actuales, nuevas);

                for (const b of bloques) {
                    for (let k = b.desdeA; k < b.hastaA; k++) {
                        const linea = donde.desde + k;
                        nuevasDecoraciones.push({
                            range: new monaco.Range(linea, 1, linea, 1),
                            options: { isWholeLine: true, className: 'amx-rev-sale', linesDecorationsClassName: 'amx-rev-sale-margen' },
                        });
                    }
                    if (b.entra.length) {
                        const dom = document.createElement('div');
                        dom.className = 'amx-rev-entra';
                        dom.style.fontFamily = fuente.fontFamily;
                        dom.style.fontSize = `${fuente.fontSize}px`;
                        dom.style.lineHeight = `${alto}px`;
                        for (const l of b.entra) {
                            const fila = document.createElement('div');
                            fila.className = 'amx-rev-entra-linea';
                            fila.textContent = l || ' ';
                            dom.appendChild(fila);
                        }
                        zonas.push(acc.addZone({
                            afterLineNumber: Math.min(n, donde.desde - 1 + b.hastaA),
                            heightInLines: b.entra.length,
                            domNode: dom,
                            ordinal: 1000,   // tras el hueco de la barra, si van en la misma línea (inserción)
                        }));
                    }
                }

                bloqueos.push(donde.hasta >= donde.desde
                    ? { desde: donde.desde, hasta: donde.hasta }
                    : { desde: Math.max(1, donde.desde - 1), hasta: Math.min(n, donde.desde) });

                // La barra va en un hueco propio encima de la propuesta (una zona de
                // 30 px que va primero) y se coloca donde Monaco dice que empieza ese
                // hueco (`onDomNodeTop`), como un widget superpuesto. Colgada de una
                // línea, una línea partida en dos filas quedaba tapada (E3).
                const nodo = document.createElement('div');
                nodo.className = 'amx-rev-widget';
                nodo.style.position = 'absolute';
                nodo.style.left = `${editor.getLayoutInfo().contentLeft + 4}px`;
                const hueco = document.createElement('div');
                zonas.push(acc.addZone({
                    afterLineNumber: Math.min(n, donde.desde - 1), heightInPx: 38, domNode: hueco, ordinal: 0,
                    // Se mide dónde quedó el hueco de verdad: el número que da Monaco no
                    // cuenta el relleno de arriba de algunos editores (el de Markdown).
                    onDomNodeTop: () => requestAnimationFrame(() => {
                        const raizEditor = editor.getDomNode();
                        if (!raizEditor || !hueco.isConnected) return;
                        nodo.style.top = `${hueco.getBoundingClientRect().top - raizEditor.getBoundingClientRect().top + 2}px`;
                    }),
                }));
                const raiz = createRoot(nodo);
                const widget = {
                    raiz,
                    getId: () => `amx.rev.${tc.toolCallId || indice}`,
                    getDomNode: () => nodo,
                    getPosition: () => null,
                };
                flushSync(() => raiz.render(
                    <BarraDePropuesta
                        tc={tc} donde={donde} indice={indice} total={ubicadas.length} bloqueada
                        onAceptar={() => actual.acciones?.aceptar(tc)}
                        onRechazar={() => actual.acciones?.rechazar(tc)}
                        onSiguiente={() => revelarIndice((indice + 1) % ubicadas.length)}
                    />
                ));
                editor.addOverlayWidget(widget);
                widgets.push(widget);
            });
        });
        decoraciones.set(nuevasDecoraciones);
        fijarSoloLectura();
    };

    const revelarIndice = (i) => {
        const u = ubicadas[i];
        if (!u) return;
        editor.revealLineInCenter(Math.max(1, u.donde.desde));
        editor.setPosition({ lineNumber: Math.max(1, u.donde.desde - 1), column: 1 });
        editor.focus();
    };

    // El texto cambió (el usuario escribió, o se aceptó): se vuelve a ubicar.
    let temporizador = null;
    const alCambiar = editor.onDidChangeModelContent(() => {
        if (!actual.propuestas.length) return;
        clearTimeout(temporizador);
        temporizador = setTimeout(pintar, 150);
    });
    const alMoverCursor = editor.onDidChangeCursorPosition(fijarSoloLectura);
    const alCambiarModelo = editor.onDidChangeModel(() => { actual = { propuestas: [], acciones: null }; limpiar(); fijarSoloLectura(); });

    const alPedirRevision = (e) => {
        const i = ubicadas.findIndex(u => u.tc.toolCallId === e.detail?.toolCallId);
        if (i >= 0) revelarIndice(i);
    };
    window.addEventListener('amox_revisar_propuesta', alPedirRevision);

    return {
        mostrar(propuestas, acciones) {
            actual = { propuestas: propuestas || [], acciones };
            // Fuera del ciclo de React: llega desde un efecto del panel, y pintar usa flushSync.
            clearTimeout(temporizador);
            temporizador = setTimeout(pintar, 0);
        },
        dispose() {
            clearTimeout(temporizador);
            alCambiar.dispose(); alMoverCursor.dispose(); alCambiarModelo.dispose();
            window.removeEventListener('amox_revisar_propuesta', alPedirRevision);
            limpiar();
            if (enSoloLectura) editor.updateOptions({ readOnly: false });
        },
    };
}
