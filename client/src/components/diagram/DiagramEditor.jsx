/**
 * AmoxDiagram — la pestaña.
 *
 * **La verdad es el archivo.** Cada gesto produce un grafo nuevo, ese grafo se
 * escribe al texto, y el lienzo se deriva del texto otra vez. Da una vuelta más
 * larga que mantener el grafo en estado y guardar de vez en cuando, y a cambio
 * no hay dos versiones de la misma cosa: lo que se ve dibujado es exactamente
 * lo que hay en el archivo, siempre.
 *
 * De ahí sale gratis el historial: deshacer es volver a un texto anterior.
 *
 * El armazón sigue el contrato visual (`mockup_editor_mermaid.html`): barra
 * arriba en cuatro zonas, tres columnas debajo, y el panel de texto plegable
 * bajo el lienzo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
    LuShare2, LuSave, LuCode, LuShieldCheck, LuTriangleAlert, LuChevronDown,
    LuChevronUp, LuLink, LuFile, LuUndo2, LuRedo2, LuPanelLeft, LuPanelRight,
} from 'react-icons/lu';
import DiagramCanvas from './DiagramCanvas';
import DiagramInspector from './DiagramInspector';
import DiagramOutline from './DiagramOutline';
import { coloresDelTema } from './diagramTheme';
import { leerDiagrama, escribirDiagrama } from './diagramFile';
import { medirFlujo } from './mermaidGeometria';
import { nodosDeLienzo, aristasDeLienzo } from './diagramGraph';
import {
    anadirNodo, encadenarNodo, borrarNodo, duplicarNodo, renombrarNodo, cambiarForma,
    conectar, desconectar, etiquetarArista, estiloArista, cambiarDireccion,
    asignarCapa, crearCapa, agrupar, desagrupar, renombrarGrupo, moverAGrupo,
} from './diagramOps';
import { cabosSueltos, capasDe } from '../markdown/mermaidFlow';
import { reemplazarCercado, bloquesCercados } from '../markdown/fencedBlocks';
import { useHistorial, esAtajoDeHistorial } from '../../hooks/useHistorial';
import { isLightTheme } from '../../theme.js';
import './diagram.css';

const AVISO_MOVER = 'amoxsql-diagram-aviso-mover';

/**
 * Los colores con los que nace una capa nueva.
 *
 * Son valores fijos y no tokens del tema a propósito: van al archivo, dentro de
 * un `classDef`, y ahí tienen que seguir significando lo mismo cuando el
 * documento se lea en otro sitio. Un `var(--algo)` en un `classDef` no se
 * resuelve fuera de esta aplicación.
 *
 * Relleno oscuro y filete claro del mismo tono: es lo que mantiene legible el
 * texto blanco que mermaid pone encima.
 */
const PALETA_CAPAS = [
    { nombre: 'origen', fill: '#1b3a52', stroke: '#4a9fd8' },
    { nombre: 'proceso', fill: '#1d4034', stroke: '#4fb286' },
    { nombre: 'salida', fill: '#4a3a16', stroke: '#d9a441' },
    { nombre: 'alerta', fill: '#4d2323', stroke: '#d86a6a' },
    { nombre: 'apoyo', fill: '#332a4d', stroke: '#8f7ad8' },
];

const DiagramEditor = ({ content, onChange, onSave, onRequestSaveAs, theme, filePath, isDirty, procedencia, onOpenFile }) => {
    const [verTexto, setVerTexto] = useState(false);
    const [verRepaso, setVerRepaso] = useState(false);
    const [verIzq, setVerIzq] = useState(true);
    const [verDer, setVerDer] = useState(true);
    const [seleccion, setSeleccion] = useState(null);
    const [editandoId, setEditandoId] = useState(null);
    const [consulta, setConsulta] = useState('');
    const [avisoMover, setAvisoMover] = useState(false);
    // La caja recién creada, mientras siga llamándose como el marcador de
    // posición: es la única a la que el identificador todavía puede seguir.
    const [sinBautizar, setSinBautizar] = useState(null);
    const [borrador, setBorrador] = useState(null);
    const [conflicto, setConflicto] = useState(null);

    const doc = useMemo(() => leerDiagrama(content), [content]);
    const colores = useMemo(() => coloresDelTema(theme), [theme]);
    const oscuro = !isLightTheme(theme);
    const historial = useHistorial(content, onChange);

    /**
     * La medida es asíncrona porque el render de mermaid lo es, así que hay que
     * saber **de qué texto** son las medidas guardadas. La clave viaja con el
     * resultado en vez de llevar un contador de peticiones: resuelve lo mismo
     * —una medida lenta de un texto viejo que llega después de la del nuevo— y
     * además contesta sola «¿esto que voy a dibujar es lo que hay en pantalla?».
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

    // ── escribir ────────────────────────────────────────────────────────────
    /** Todo gesto pasa por aquí: grafo nuevo → texto → historial. */
    const aplicar = useCallback((grafo) => {
        historial.escribir(escribirDiagrama(content, grafo));
    }, [content, historial]);

    const g = doc.grafo;

    const crear = useCallback((forma) => {
        if (!g) return;
        // Si hay una caja seleccionada, la nueva se encadena a ella. Es la única
        // información que el gesto puede llevar: dónde sueltas no significa nada
        // porque la posición la decide mermaid.
        const r = seleccion?.tipo === 'nodo'
            ? encadenarNodo(g, seleccion.id, { forma })
            : anadirNodo(g, { forma });
        if (!r.id) return;
        aplicar(r.grafo);
        setSeleccion({ tipo: 'nodo', id: r.id });
        setEditandoId(r.id);
        setSinBautizar(r.id);
    }, [g, seleccion, aplicar]);

    const borrarSeleccion = useCallback(() => {
        if (!g || !seleccion) return;
        if (seleccion.tipo === 'arista') aplicar(desconectar(g, seleccion.indice));
        else if (seleccion.tipo === 'grupo') aplicar(desagrupar(g, seleccion.id));
        else {
            // Varias cajas se borran de una, no una a una: cada `borrarNodo`
            // devuelve un grafo nuevo, así que encadenarlos es lo correcto —
            // aplicarlos todos contra el mismo original perdería todo menos el
            // último.
            const ids = seleccion.tipo === 'varios' ? seleccion.ids : [seleccion.id];
            aplicar(ids.reduce((acc, id) => borrarNodo(acc, id), g));
        }
        setSeleccion(null);
    }, [g, seleccion, aplicar]);

    const duplicar = useCallback((id) => {
        if (!g) return;
        const r = duplicarNodo(g, id);
        if (!r.id) return;
        aplicar(r.grafo);
        setSeleccion({ tipo: 'nodo', id: r.id });
    }, [g, aplicar]);

    /**
     * Pinchar una caja con `Ctrl` o `Mayús` la suma a la selección.
     *
     * Es lo que hace posible agrupar, que es la operación central de este
     * editor. Se resuelve aquí y no con la selección interna de React Flow
     * porque la verdad del lienzo es el archivo: dos sistemas de selección
     * acabarían discrepando sobre qué hay marcado.
     */
    const elegirNodo = useCallback((id, sumando) => {
        setEditandoId(null);
        setSeleccion((prev) => {
            if (!sumando) return { tipo: 'nodo', id };
            const ya = prev?.tipo === 'varios' ? prev.ids : (prev?.tipo === 'nodo' ? [prev.id] : []);
            const ids = ya.includes(id) ? ya.filter((x) => x !== id) : [...ya, id];
            if (!ids.length) return null;
            return ids.length === 1 ? { tipo: 'nodo', id: ids[0] } : { tipo: 'varios', ids };
        });
    }, []);

    const agruparSeleccion = useCallback((ids) => {
        if (!g) return;
        const r = agrupar(g, ids, 'Zona');
        if (!r.id) return;
        aplicar(r.grafo);
        // Se selecciona el grupo recién hecho: lo siguiente que quiere cualquiera
        // es ponerle nombre, y el inspector ya está enseñando el campo.
        setSeleccion({ tipo: 'grupo', id: r.id });
    }, [g, aplicar]);

    /**
     * Una capa nueva, con un color tomado de la paleta editorial.
     *
     * El color no se pregunta: elegir un relleno y un filete que contrasten es
     * trabajo, y equivocarse produce una caja ilegible. Se toma el siguiente
     * color sin usar, y quien quiera otro lo cambia en el `classDef` —que sigue
     * siendo suyo— desde el panel de texto.
     */
    const anadirCapa = useCallback((id) => {
        if (!g) return;
        const usados = capasDe(g).map((c) => c.fill);
        const libre = PALETA_CAPAS.find((c) => !usados.includes(c.fill)) || PALETA_CAPAS[0];
        const r = crearCapa(g, id, libre.nombre, libre.fill, libre.stroke);
        aplicar(r.grafo);
    }, [g, aplicar]);

    /**
     * Guardar, con la conversación que hace falta cuando el destino es de otro.
     *
     * Para un `.amoxdiagram` esto es el guardado de siempre. Cuando el diagrama
     * vive dentro de un markdown, quien mezcla devuelve un motivo en vez de
     * escribir, y **aquí se pregunta**: sobrescribir, guardar aparte, o dejarlo.
     * Ninguna de las tres se elige por el usuario.
     */
    const guardar = useCallback(async (opciones) => {
        const r = await onSave?.(false, opciones);
        if (r && r.ok === false && r.motivo !== 'error') setConflicto(r);
        else setConflicto(null);
    }, [onSave]);

    const intentarMover = useCallback(() => {
        if (localStorage.getItem(AVISO_MOVER) === '1') return;
        setAvisoMover(true);
    }, []);

    const cerrarAvisoMover = useCallback(() => {
        try { localStorage.setItem(AVISO_MOVER, '1'); } catch { /* modo privado */ }
        setAvisoMover(false);
    }, []);

    // ── el panel de texto ───────────────────────────────────────────────────
    /**
     * Mientras se escribe a mano, el borrador vive aquí y **no se escribe al
     * archivo hasta que se puede leer**. Eso hace dos cosas a la vez: el dibujo
     * se queda congelado en lo último bueno en vez de vaciarse —vaciarse da la
     * sensación de haber perdido el trabajo— y el archivo nunca guarda algo que
     * luego no sabríamos abrir.
     */
    const textoMostrado = borrador ?? doc.mermaid;
    const errorTexto = useMemo(() => {
        if (borrador === null || borrador === doc.mermaid) return null;
        return 'No se entiende. El dibujo se queda como estaba y esto no se guarda hasta que se pueda leer.';
    }, [borrador, doc.mermaid]);

    const escribirTexto = useCallback((texto) => {
        const bloque = bloquesCercados(content, ['mermaid'])[0];
        if (!bloque) return;
        // Se prueba a leerlo antes de tocar el archivo. Si se entiende, entra tal
        // y como lo escribió el autor —sin pasarlo por la forma canónica— para
        // que el cursor no salte mientras teclea.
        const siguiente = reemplazarCercado(content, bloque, texto);
        if (leerDiagrama(siguiente).grafo) {
            setBorrador(null);
            historial.escribir(siguiente);
        } else {
            setBorrador(texto);
        }
    }, [content, historial]);

    // ── atajos ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const alPulsar = (e) => {
            const enCampo = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardar(); return; }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
                e.preventDefault(); setVerTexto((v) => !v); return;
            }
            const accion = esAtajoDeHistorial(e);
            if (accion) { e.preventDefault(); historial[accion](); return; }
            if (enCampo) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && seleccion) { e.preventDefault(); borrarSeleccion(); return; }
            // `Tab` encadena desde la caja seleccionada: el camino de quien ya
            // tiene el diagrama en la cabeza y sólo quiere volcarlo.
            if (e.key === 'Tab' && seleccion?.tipo === 'nodo' && !e.shiftKey) { e.preventDefault(); crear(); }
        };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [guardar, historial, seleccion, borrarSeleccion, crear]);

    // ── lienzo ──────────────────────────────────────────────────────────────
    /**
     * Al bautizar una caja recién creada, el identificador la sigue; después
     * ya no. Es lo que evita que el archivo acabe con `sin_nombre[("Almacén")]`
     * sin meter churn en el diff cada vez que alguien retoca una etiqueta.
     */
    const renombrar = useCallback((id, texto) => {
        aplicar(renombrarNodo(g, id, texto, { tambienId: id === sinBautizar }));
        if (id === sinBautizar) setSinBautizar(null);
    }, [g, aplicar, sinBautizar]);

    const extras = useMemo(() => ({
        editandoId,
        onEditar: setEditandoId,
        onRenombrar: renombrar,
    }), [editandoId, renombrar]);

    const nodos = useMemo(() => nodosDeLienzo(g, medidas, seleccion, extras), [g, medidas, seleccion, extras]);
    const aristas = useMemo(() => aristasDeLienzo(g, colores.arista, seleccion), [g, colores.arista, seleccion]);
    const avisos = useMemo(() => (g ? cabosSueltos(g) : []), [g]);

    const nombre = doc.titulo || (filePath || '').split(/[\\/]/).pop() || 'Diagrama';
    // La procedencia es un objeto —qué archivo, qué posición, cómo estaba— y no
    // sólo una ruta: guardar necesita las tres cosas para saber si el documento
    // sigue como se abrió.
    const archivoOrigen = procedencia?.archivo || '';
    const nombreOrigen = archivoOrigen.split(/[\\/]/).pop();
    const destino = procedencia ? `Guardar en ${nombreOrigen}` : 'Guardar el diagrama';

    return (
        <div className="dgm-editor">
            <div className="dgm-bar">
                <div className="dgm-title"><LuShare2 size={14} strokeWidth={2.2} /> {nombre}</div>

                {/* La pastilla de procedencia es lo único que contesta «¿de quién
                    es este diagrama?». Un `.amoxdiagram` no la lleva: no tiene
                    dueño, es el dueño. */}
                {procedencia ? (
                    <button type="button" className="dgm-origin" onClick={() => onOpenFile?.(archivoOrigen)}
                        title="Abrir el documento del que viene">
                        <LuLink size={11} strokeWidth={2.4} /> vive en
                        <span className="dgm-origin-file">{nombreOrigen}</span>
                    </button>
                ) : (
                    <span className="dgm-origin dgm-origin--propio">
                        <LuFile size={11} strokeWidth={2.4} /> archivo propio
                    </span>
                )}

                <div className="dgm-sep" />
                <button type="button" className="dgm-btn dgm-btn--icono" onClick={historial.deshacer}
                    disabled={!historial.puedeDeshacer} title="Deshacer (Ctrl+Z)">
                    <LuUndo2 size={12} strokeWidth={2.3} />
                </button>
                <button type="button" className="dgm-btn dgm-btn--icono" onClick={historial.rehacer}
                    disabled={!historial.puedeRehacer} title="Rehacer (Ctrl+Shift+Z)">
                    <LuRedo2 size={12} strokeWidth={2.3} />
                </button>

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
                <button type="button" className={`dgm-btn dgm-btn--icono${verIzq ? '' : ' dgm-btn--apagado'}`}
                    onClick={() => setVerIzq((v) => !v)} title="Plegar la columna izquierda">
                    <LuPanelLeft size={12} strokeWidth={2.3} />
                </button>
                <button type="button" className={`dgm-btn dgm-btn--icono${verDer ? '' : ' dgm-btn--apagado'}`}
                    onClick={() => setVerDer((v) => !v)} title="Plegar el inspector">
                    <LuPanelRight size={12} strokeWidth={2.3} />
                </button>
                <div className="dgm-sep" />
                <button type="button" className="dgm-btn" onClick={() => onRequestSaveAs?.(content)}>
                    Guardar como…
                </button>
                <button type="button" className="dgm-btn dgm-btn--primary" onClick={() => guardar()} disabled={!isDirty}>
                    <LuSave size={12} strokeWidth={2.3} /> {destino}
                </button>
            </div>

            <div className="dgm-cuerpo">
                {g && verIzq && (
                    <DiagramOutline
                        grafo={g}
                        seleccion={seleccion}
                        consulta={consulta}
                        onConsulta={setConsulta}
                        onElegir={(id) => elegirNodo(id, false)}
                        onAnadirForma={crear}
                    />
                )}

                <div className="dgm-centro">
                    <div className="dgm-stage">
                        {!g ? (
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
                                <DiagramCanvas
                                    nodos={nodos}
                                    aristas={aristas}
                                    colores={colores}
                                    onElegirNodo={elegirNodo}
                                    onElegirGrupo={(id) => { setSeleccion({ tipo: 'grupo', id }); setEditandoId(null); }}
                                    onElegirArista={(indice) => { setSeleccion({ tipo: 'arista', indice }); setEditandoId(null); }}
                                    onLimpiarSeleccion={() => { setSeleccion(null); setEditandoId(null); }}
                                    onConectar={(c) => aplicar(conectar(g, c.source, c.target))}
                                    onDobleClicLienzo={() => crear()}
                                    onIntentarMover={intentarMover}
                                />
                            </ReactFlowProvider>
                        )}

                        {conflicto && (
                            <div className="dgm-velo">
                                <div className="dgm-dialogo">
                                    <h5><LuTriangleAlert size={15} strokeWidth={2.1} /> El documento cambió mientras editabas</h5>
                                    <p>{conflicto.mensaje}</p>
                                    {/* Tres salidas, no dos. La de en medio —guardar aparte—
                                        es la que evita tener que elegir entre perder lo tuyo
                                        o pisar lo de otro, y es la razón de que esto no sea
                                        un «confirmar/cancelar» de los normales. */}
                                    <div className="dgm-dialogo-botones">
                                        <button type="button" className="dgm-btn" onClick={() => setConflicto(null)}>
                                            Cancelar
                                        </button>
                                        <button type="button" className="dgm-btn"
                                            onClick={() => { setConflicto(null); onRequestSaveAs?.(content); }}>
                                            Guardar como archivo nuevo
                                        </button>
                                        <button type="button" className="dgm-btn dgm-btn--primary"
                                            onClick={() => guardar({ forzar: true })}>
                                            Sobrescribir
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {avisoMover && (
                            <div className="dgm-globo">
                                {/* El contrato visual decía aquí «arrastra para reordenar
                                    y para cambiar de grupo». Las dos cosas llegan con los
                                    grupos, en la fase 4 — y prometerlas ahora sería
                                    exactamente la promesa incumplida que este editor
                                    existe para evitar. El aviso dice lo que hoy es cierto. */}
                                <p>
                                    <b>Las cajas no se colocan a mano.</b> Su posición la calcula el
                                    diagrama a partir de cómo están conectadas, así que nunca queda
                                    torcido — y lo que ves aquí es lo que saldrá en el documento.
                                </p>
                                <button type="button" className="dgm-btn" onClick={cerrarAvisoMover}>Entendido</button>
                            </div>
                        )}

                        {verRepaso && g && (
                            <div className="dgm-repaso">
                                <div className="dgm-repaso-tit"><LuShieldCheck size={13} strokeWidth={2.2} /> Repaso</div>
                                {avisos.length === 0
                                    ? <div className="dgm-repaso-fila dgm-repaso-fila--ok">Ningún cabo suelto.</div>
                                    : avisos.map((a) => (
                                        <button key={`${a.tipo}:${a.id}`} type="button" className="dgm-repaso-fila"
                                            onClick={() => a.tipo !== 'grupo-vacio' && setSeleccion({ tipo: 'nodo', id: a.id })}>
                                            <LuTriangleAlert size={12} strokeWidth={2.2} /> {a.texto}
                                        </button>
                                    ))}
                                <p className="dgm-repaso-pie">No bloquea nada: un diagrama a medias es un estado legítimo.</p>
                            </div>
                        )}
                    </div>

                    {verTexto ? (
                        <div className="dgm-texto">
                            <div className="dgm-texto-cab">
                                <LuCode size={12} strokeWidth={2.3} /> Mermaid
                                <span className="dgm-spacer" />
                                <span className="dgm-texto-n">
                                    {textoMostrado.split('\n').length} líneas
                                    {g?.conservado.length > 0 && ` · ${g.conservado.length} conservadas`}
                                </span>
                                <button type="button" className="dgm-btn dgm-btn--icono" onClick={() => setVerTexto(false)}>
                                    <LuChevronDown size={12} strokeWidth={2.3} />
                                </button>
                            </div>
                            <textarea
                                className={`dgm-texto-cod${errorTexto ? ' dgm-texto-cod--mal' : ''}`}
                                value={textoMostrado}
                                spellCheck={false}
                                onChange={(e) => escribirTexto(e.target.value)}
                            />
                            {errorTexto ? (
                                <div className="dgm-texto-leyenda dgm-texto-leyenda--mal">
                                    <LuTriangleAlert size={12} strokeWidth={2.2} /> {errorTexto}
                                </div>
                            ) : g?.conservado.length > 0 && (
                                <div className="dgm-texto-leyenda">
                                    <span><i className="dgm-pip dgm-pip--warn" /> se conserva tal cual, el editor no lo toca</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button type="button" className="dgm-texto-plegado" onClick={() => setVerTexto(true)}>
                            <LuChevronUp size={12} strokeWidth={2.3} /> Mermaid
                        </button>
                    )}
                </div>

                {g && verDer && (
                    <div className="dgm-der">
                        <DiagramInspector
                            grafo={g}
                            seleccion={seleccion}
                            onRenombrar={renombrar}
                            onForma={(id, forma) => aplicar(cambiarForma(g, id, forma))}
                            onEtiqueta={(i, texto) => aplicar(etiquetarArista(g, i, texto))}
                            onEstiloArista={(i, estilo) => aplicar(estiloArista(g, i, estilo))}
                            onDireccion={(d) => aplicar(cambiarDireccion(g, d))}
                            onDuplicar={duplicar}
                            onBorrar={borrarSeleccion}
                            onAnadir={() => crear()}
                            onCapa={(id, capa) => aplicar(asignarCapa(g, id, capa))}
                            onCrearCapa={anadirCapa}
                            onMoverAGrupo={(id, sgId) => aplicar(moverAGrupo(g, id, sgId))}
                            onAgrupar={agruparSeleccion}
                            onDesagrupar={(id) => { aplicar(desagrupar(g, id)); setSeleccion(null); }}
                            onRenombrarGrupo={(id, t) => aplicar(renombrarGrupo(g, id, t))}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default DiagramEditor;
