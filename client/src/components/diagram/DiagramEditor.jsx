/**
 * AmoxDiagram — la pestaña.
 *
 * Fase 1 del plan: el archivo se crea, se abre, se ve y se guarda. **El lienzo
 * todavía no edita**, y eso es deliberado. Parece media función, pero valida lo
 * caro —el parser, la geometría, el registro del tipo en la aplicación— sin
 * ninguna posibilidad de estropear el documento de nadie. Lo que escribe llega
 * en la fase 2, cuando leer ya esté asentado.
 *
 * El armazón sigue el contrato visual (`mockup_editor_mermaid.html`): barra
 * arriba en cuatro zonas, y debajo el lienzo con el panel de texto plegable. Las
 * columnas laterales —paleta e inspector— llegan con la edición; montarlas ahora
 * sería enseñar mandos que no hacen nada.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
    LuShare2, LuSave, LuCode, LuShieldCheck, LuTriangleAlert, LuChevronDown,
    LuChevronUp, LuLink, LuFile,
} from 'react-icons/lu';
import DiagramCanvas from './DiagramCanvas';
import { coloresDelTema } from './diagramTheme';
import { leerDiagrama } from './diagramFile';
import { medirFlujo } from './mermaidGeometria';
import { nodosDeLienzo, aristasDeLienzo } from './diagramGraph';
import { cabosSueltos } from '../markdown/mermaidFlow';
import { isLightTheme } from '../../theme.js';
import './diagram.css';

const DiagramEditor = ({ content, onSave, onRequestSaveAs, theme, filePath, isDirty, procedencia, onOpenFile }) => {
    const [verTexto, setVerTexto] = useState(false);
    const [verRepaso, setVerRepaso] = useState(false);

    const doc = useMemo(() => leerDiagrama(content), [content]);
    const colores = useMemo(() => coloresDelTema(theme), [theme]);
    const oscuro = !isLightTheme(theme);

    /**
     * La medida es asíncrona porque el render de mermaid lo es, así que hay que
     * saber **de qué texto** son las medidas que hay guardadas.
     *
     * Se guarda la clave junto al resultado en vez de llevar un contador de
     * peticiones. Resuelve lo mismo —una medida lenta de un texto viejo que
     * llega después de la del nuevo— y además contesta sola «¿esto que estoy a
     * punto de dibujar corresponde a lo que hay en pantalla?», que es la
     * pregunta que de verdad importa.
     */
    const [medido, setMedido] = useState({ clave: null, medidas: null });

    useEffect(() => {
        if (!doc.grafo) return undefined;
        let vivo = true;
        const clave = doc.mermaid;
        medirFlujo(doc.mermaid, doc.grafo, { oscuro }).then((m) => {
            if (vivo) setMedido({ clave, medidas: m });
        });
        return () => { vivo = false; };
    }, [doc.mermaid, doc.grafo, oscuro]);

    const medidas = medido.clave === doc.mermaid ? medido.medidas : null;
    const midiendo = !!doc.grafo && !medidas;

    const nodos = useMemo(() => nodosDeLienzo(doc.grafo, medidas), [doc.grafo, medidas]);
    const aristas = useMemo(() => aristasDeLienzo(doc.grafo, colores.arista), [doc.grafo, colores.arista]);
    const avisos = useMemo(() => (doc.grafo ? cabosSueltos(doc.grafo) : []), [doc.grafo]);

    const guardar = useCallback(() => onSave?.(), [onSave]);

    useEffect(() => {
        const alPulsar = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
                e.preventDefault(); setVerTexto((v) => !v);
            }
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [guardar]);

    const nombre = doc.titulo || (filePath || '').split(/[\\/]/).pop() || 'Diagrama';
    const destino = procedencia ? `Guardar en ${procedencia.split(/[\\/]/).pop()}` : 'Guardar el diagrama';

    return (
        <div className="dgm-editor">
            <div className="dgm-bar">
                <div className="dgm-title"><LuShare2 size={14} strokeWidth={2.2} /> {nombre}</div>

                {/* La pastilla de procedencia es lo único que contesta «¿de quién
                    es este diagrama?». Un `.amoxdiagram` no la lleva: no tiene
                    dueño, es el dueño. */}
                {procedencia ? (
                    <button type="button" className="dgm-origin" onClick={() => onOpenFile?.(procedencia)}
                        title="Abrir el documento del que viene">
                        <LuLink size={11} strokeWidth={2.4} /> vive en
                        <span className="dgm-origin-file">{procedencia.split(/[\\/]/).pop()}</span>
                    </button>
                ) : (
                    <span className="dgm-origin dgm-origin--propio">
                        <LuFile size={11} strokeWidth={2.4} /> archivo propio
                    </span>
                )}

                <div className="dgm-sep" />
                <button type="button" className={`dgm-btn${verTexto ? ' dgm-btn--on' : ''}`}
                    onClick={() => setVerTexto((v) => !v)} title="Ver el mermaid (Ctrl+Shift+E)">
                    <LuCode size={12} strokeWidth={2.3} /> Texto
                </button>
                <button type="button" className={`dgm-btn${verRepaso ? ' dgm-btn--on' : ''}`}
                    onClick={() => setVerRepaso((v) => !v)} title="Cabos sueltos">
                    <LuShieldCheck size={12} strokeWidth={2.3} /> Repasar
                    {avisos.length > 0 && <span className="dgm-btn-n">{avisos.length}</span>}
                </button>

                <div className="dgm-spacer" />
                <button type="button" className="dgm-btn" onClick={() => onRequestSaveAs?.(content)}>
                    Guardar como…
                </button>
                <button type="button" className="dgm-btn dgm-btn--primary" onClick={guardar} disabled={!isDirty}>
                    <LuSave size={12} strokeWidth={2.3} /> {destino}
                </button>
            </div>

            <div className="dgm-body">
                <div className="dgm-stage">
                    {!doc.grafo ? (
                        <div className="dgm-vacio">
                            <LuTriangleAlert size={22} strokeWidth={1.9} />
                            <p><b>Este diagrama no se puede editar visualmente.</b></p>
                            <p className="dgm-vacio-por">
                                {doc.mermaid
                                    ? 'Usa algo que el editor todavía no sabe dibujar. El texto está intacto y se puede editar a mano.'
                                    : 'El archivo no tiene ningún bloque mermaid.'}
                            </p>
                            {doc.mermaid && (
                                <button type="button" className="dgm-btn" onClick={() => setVerTexto(true)}>
                                    <LuCode size={12} strokeWidth={2.3} /> Ver el texto
                                </button>
                            )}
                        </div>
                    ) : midiendo ? (
                        <div className="dgm-vacio"><p>Midiendo el diagrama…</p></div>
                    ) : (
                        <ReactFlowProvider>
                            <DiagramCanvas nodos={nodos} aristas={aristas} colores={colores} soloLectura />
                        </ReactFlowProvider>
                    )}

                    {verRepaso && (
                        <div className="dgm-repaso">
                            <div className="dgm-repaso-tit"><LuShieldCheck size={13} strokeWidth={2.2} /> Repaso</div>
                            {avisos.length === 0
                                ? <div className="dgm-repaso-fila dgm-repaso-fila--ok">Ningún cabo suelto.</div>
                                : avisos.map((a) => (
                                    <div key={`${a.tipo}:${a.id}`} className="dgm-repaso-fila">
                                        <LuTriangleAlert size={12} strokeWidth={2.2} /> {a.texto}
                                    </div>
                                ))}
                            <p className="dgm-repaso-pie">No bloquea nada: un diagrama a medias es un estado legítimo.</p>
                        </div>
                    )}
                </div>

                {verTexto && (
                    <div className="dgm-texto">
                        <div className="dgm-texto-cab">
                            <LuCode size={12} strokeWidth={2.3} /> Mermaid
                            <span className="dgm-spacer" />
                            <span className="dgm-texto-n">
                                {doc.mermaid.split('\n').length} líneas
                                {doc.grafo?.conservado.length > 0 && ` · ${doc.grafo.conservado.length} conservadas`}
                            </span>
                            <button type="button" className="dgm-btn dgm-btn--icono" onClick={() => setVerTexto(false)}>
                                <LuChevronDown size={12} strokeWidth={2.3} />
                            </button>
                        </div>
                        {/* De sólo lectura en esta fase, por lo mismo que el
                            lienzo: escribir aquí llega con la fase 2. */}
                        <pre className="dgm-texto-cod">{doc.mermaid}</pre>
                        {doc.grafo?.conservado.length > 0 && (
                            <div className="dgm-texto-leyenda">
                                <span><i className="dgm-pip dgm-pip--warn" /> se conserva tal cual, el editor no lo toca</span>
                            </div>
                        )}
                    </div>
                )}
                {!verTexto && (
                    <button type="button" className="dgm-texto-plegado" onClick={() => setVerTexto(true)}>
                        <LuChevronUp size={12} strokeWidth={2.3} /> Mermaid
                    </button>
                )}
            </div>
        </div>
    );
};

export default DiagramEditor;
