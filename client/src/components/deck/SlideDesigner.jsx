/**
 * SlideDesigner — la vista Design del Studio: edita UNA lámina a la vez.
 *
 * Fase 0 del rediseño (docs/dev/plan_studio_deck.md): **la lámina declara sus
 * regiones**. Hasta ahora el único indicio de que algo se podía editar era un
 * «Edit text» que aparecía al pasar el ratón por encima, así que una lámina en
 * reposo era indistinguible de una imagen. Ahora cada hueco se dibuja con su
 * filete y su nombre, se selecciona con el ratón o con el tabulador, y se entra
 * a editar con Intro o con el segundo clic.
 *
 * Qué región tiene cada disposición y cómo se lee y se escribe su trozo de
 * prosa lo dice `deckRegions.js`, que es la única verdad sobre eso. Antes
 * estaba aquí en forma de ramas y de funciones sueltas (`editarCabecera`,
 * `editarResto`, `unir`), y en `SlidePreview` otra vez, a su manera.
 *
 * Dos cosas que NO cambian: la lámina se sigue pintando exactamente igual —el
 * cromo de edición es un añadido, no un reemplazo— y toda edición devuelve la
 * prosa COMPLETA, así que una región nunca puede partir el archivo.
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { LuChevronLeft, LuChevronRight, LuChevronUp, LuChevronDown, LuChartBar, LuX, LuPencilLine, LuNotebookPen, LuTriangleAlert, LuEye, LuCode } from 'react-icons/lu';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { SlideEyebrow, SlideSectionIndex, SlideCoverMeta } from './SlidePreview';
import DeckFooter from './DeckFooter';
import SlideCharts from './SlideCharts';
import { SlideKpi, SlideTakeaway, SlideTituloHeredado } from './SlideFigureParts';
import { renderDeckBlock } from './deckBlocks';
import AmoxChartEmbed from './AmoxChartEmbed';
import { splitSlideContent } from '../../utils/deckTemplates';
import { resolveFooterFields, resolveTone } from '../../utils/deckParser';
import { DECK_LAYOUT_META } from './deckLayoutPreviews';
import { regionesDe, leerParte, escribirParte, tieneTituloPropio } from './deckRegions';
import { BarraFormato, MenuInsercion } from './DeckWriting';
import { useMenuInsercion, ejecutarAccion, accionDeAtajo, restaurarSeleccion } from './deckWritingOps';

/**
 * Una lámina es una página: `.deck-slide` recorta en vez de hacer scroll, así
 * que lo que no cabe desaparecería sin decir nada. Esto mide el hueco y además
 * dice **qué región** desborda, que es la mitad útil del aviso: saber que te
 * pasas por 124 px no sirve de nada si no sabes de dónde quitar.
 */
function useDesborde(canvasRef) {
    const [desborde, setDesborde] = useState({ px: 0, region: null });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        // Sólo se avisa a React cuando la medida CAMBIA de verdad.
        //
        // Esto no es una optimización, es lo que impide que la aplicación se
        // congele. Antes de la fase 0 el estado era un número y `setDesborde(0)`
        // con el mismo 0 no repintaba nada: React descarta la actualización
        // cuando el valor es idéntico. Al pasar a `{px, region}` cada medición
        // devolvía un objeto NUEVO, así que nunca era idéntico — y el bucle se
        // cierra solo: el MutationObserver mira el lienzo, cualquier repintado
        // toca el DOM (Recharts anima, MarkdownPreview rerenderiza), eso vuelve
        // a disparar la medición, que vuelve a cambiar el estado. Una lámina con
        // figura no llegaba nunca al reposo.
        const publicar = (px, region) => setDesborde(
            (prev) => (prev.px === px && prev.region === region ? prev : { px, region }),
        );

        const medir = () => {
            const slide = canvas.querySelector('.deck-slide');
            if (!slide) { publicar(0, null); return; }
            // No basta con medir la lámina: una columna que recorta esconde su
            // propio desborde sin que el alto de la lámina crezca.
            //
            // Sólo cuentan las cajas que RECORTAN de verdad. Una caja sin
            // `overflow` puede dar unos pocos píxeles de diferencia por la caja
            // de línea de un encabezado sin que se corte nada, y avisar de eso
            // es enseñar a ignorar el aviso.
            const cajas = [slide, ...slide.querySelectorAll('.deck-slide-col, .deck-slide-cabecera')];
            let peorPx = 0;
            let peorEl = null;
            for (const el of cajas) {
                const oy = getComputedStyle(el).overflowY;
                if (oy !== 'hidden' && oy !== 'clip' && oy !== 'auto' && oy !== 'scroll') continue;
                const px = el.scrollHeight - el.clientHeight;
                if (px > peorPx) { peorPx = px; peorEl = el; }
            }
            // El nombre sale de la región que hay dentro de la caja que
            // desborda; si la que se pasa es la lámina entera, no hay una sola
            // culpable y el aviso se queda genérico.
            const rg = peorEl && peorEl !== slide ? peorEl.querySelector('[data-rg]') : null;
            publicar(Math.max(0, peorPx), rg?.getAttribute('data-rg') || null);
        };
        medir();

        // El alto depende del ancho (aspect-ratio) y del contenido, así que
        // hacen falta las dos señales: la del tamaño y la del DOM.
        const ro = new ResizeObserver(medir);
        ro.observe(canvas);

        // El inspector mete y saca una sonda dentro de la lámina para resolver
        // el color de cada acento (ver deckColor.js). Es un nodo de cero por
        // cero que no cambia ninguna medida, pero sí dispara al observador.
        // Ignorarla no es imprescindible desde que `publicar` compara antes de
        // avisar, pero medir doce veces seguidas para no cambiar nada es
        // trabajo tirado en el hilo que pinta.
        const esSonda = (n) => n?.nodeType === 1 && n.hasAttribute?.('data-sonda');
        const soloSonda = (registros) => registros.every((r) => (
            r.type === 'childList'
            && [...r.addedNodes, ...r.removedNodes].every(esSonda)
        ));
        const mo = new MutationObserver((registros) => { if (!soloSonda(registros)) medir(); });
        mo.observe(canvas, { childList: true, subtree: true, characterData: true });
        return () => { ro.disconnect(); mo.disconnect(); };
    }, [canvasRef]);

    return desborde;
}

/**
 * Una región de texto: markdown renderizado que se cambia por un `textarea`.
 *
 * El primer clic **selecciona** y el segundo edita. Es deliberado y es lo único
 * de la fase 0 que cambia un gesto que ya existía: sin un paso de selección, el
 * inspector de la fase 1 no tendría de qué hablar. El doble clic entra directo,
 * para quien ya sabía dónde pinchar.
 */
function RegionTexto({
    region, value, onCommit, theme, onOpenFile,
    seleccionada, editando, onSeleccionar, onEditar, onSalir,
}) {
    const [draft, setDraft] = useState(value);
    const areaRef = useRef(null);
    const menu = useMenuInsercion(areaRef, setDraft);

    useEffect(() => { if (!editando) setDraft(value); }, [value, editando]);
    useEffect(() => { if (editando) areaRef.current?.focus(); }, [editando]);
    // Después de que el DOM tenga el texto nuevo y antes de pintar: es el único
    // momento en que colocar el cursor no se lo lleva por delante el repintado.
    useLayoutEffect(() => { restaurarSeleccion(areaRef.current); }, [draft]);

    const commit = () => {
        onSalir();
        if (draft !== value) onCommit(draft);
    };

    if (editando) {
        return (
            <div className="deck-rg deck-rg--editando" data-rg={region.nombre}>
                <BarraFormato areaRef={areaRef} onCambio={setDraft} onAbrirMenu={menu.abrir} />
                <textarea
                    ref={areaRef}
                    className="deck-prose-editor"
                    value={draft}
                    spellCheck={false}
                    onChange={(e) => { setDraft(e.target.value); menu.revisar(); }}
                    onSelect={menu.revisar}
                    onBlur={(e) => {
                        // Pulsar en la barra o en el menú no es salir de la
                        // región: los dos previenen el `mousedown`, así que el
                        // foco vuelve solo. Sin esta comprobación, confirmar
                        // con el ratón cerraría la edición antes de aplicar.
                        if (e.relatedTarget?.closest?.('.deck-barra, .deck-menu')) return;
                        commit();
                    }}
                    onKeyDown={(e) => {
                        // Con el menú abierto manda él: se lo dejamos.
                        if (menu.disparo && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;
                        const atajo = accionDeAtajo(e);
                        if (atajo) { e.preventDefault(); ejecutarAccion(areaRef.current, atajo, setDraft); e.stopPropagation(); return; }
                        // Esc cancela; Ctrl+Intro confirma. Los dos se paran
                        // aquí para que no lleguen al manejador de la lámina.
                        if (e.key === 'Escape') { setDraft(value); onSalir(); e.stopPropagation(); return; }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); e.stopPropagation(); return; }
                        e.stopPropagation();
                    }}
                />
                {menu.disparo && (
                    <MenuInsercion
                        consulta={menu.disparo.consulta}
                        onElegir={menu.elegir}
                        onCerrar={menu.cerrar}
                    />
                )}
                <span className="deck-rg-ayuda"><kbd>Esc</kbd> cancel · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> confirm</span>
            </div>
        );
    }

    return (
        <div
            className={`deck-rg deck-prose-view${seleccionada ? ' deck-rg--sel' : ''}`}
            data-rg={region.nombre}
            role="button"
            tabIndex={-1}
            title={`${region.nombre} — Enter to edit`}
            onClick={(e) => { e.stopPropagation(); if (seleccionada) onEditar(); else onSeleccionar(); }}
            onDoubleClick={(e) => { e.stopPropagation(); onEditar(); }}
        >
            <span className="deck-prose-edit-hint"><LuPencilLine size={12} /> Editar</span>
            {value.trim()
                ? <MarkdownPreview content={value} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />
                : <span className="deck-prose-placeholder">{region.pista}</span>}
        </div>
    );
}

/** El hueco de una figura, o el placeholder que abre el selector. */
function RegionFigura({
    region, chartSrc, variables, refreshToken, palette, onRemove, onRequestAdd,
    onProcedencia, onPiezas, seleccionada, onSeleccionar,
}) {
    const comun = {
        className: `deck-rg deck-chart-slot${seleccionada ? ' deck-rg--sel' : ''}`,
        'data-rg': region.nombre,
        onClick: (e) => { e.stopPropagation(); onSeleccionar(); },
    };

    if (!chartSrc) {
        return (
            <div {...comun} className={`${comun.className} deck-chart-slot--empty`}>
                <button type="button" className="deck-chart-slot-cta" onClick={(e) => { e.stopPropagation(); onRequestAdd(); }}>
                    <LuChartBar size={22} />
                    <span>Add a figure</span>
                    <span className="deck-chart-slot-sub">{region.pista}</span>
                </button>
            </div>
        );
    }
    return (
        <div {...comun}>
            <button type="button" className="deck-chart-remove" title="Remove the figure" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
                <LuX size={13} />
            </button>
            {/* La paleta del deck también aquí. Sin ella el diseñador pintaba
                la figura con la del `.amoxvis` y la vista Review con la del
                deck: la misma lámina salía de dos colores segun donde la
                miraras, y el que manda es el del pase. */}
            <AmoxChartEmbed
                src={chartSrc}
                variables={variables}
                refreshToken={refreshToken}
                palette={palette}
                onProcedencia={onProcedencia}
                onPiezas={onPiezas}
            />
        </div>
    );
}

/** Notas del orador: tira plegable bajo el lienzo, exportada al `.pptx`. */
function NotesPanel({ notes, onCommit }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(notes);

    useEffect(() => { if (!open) setDraft(notes); }, [notes, open]);

    return (
        <div className={`deck-notes-panel${open ? ' deck-notes-panel--open' : ''}`}>
            <button type="button" className="deck-notes-toggle" onClick={() => setOpen((v) => !v)}>
                <LuNotebookPen size={13} />
                <span>Speaker notes{notes.trim() ? '' : ' (empty)'}</span>
                {open ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />}
            </button>
            {open && (
                <textarea
                    className="deck-notes-editor"
                    value={draft}
                    placeholder="For whoever presents — they do not show on the slide, and they travel to the PowerPoint notes pane."
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    onBlur={() => { if (draft !== notes) onCommit(draft); }}
                />
            )}
        </div>
    );
}

const SlideDesigner = ({
    slide, index, total, aspectRatio, eyebrow, deckFooter, slideNumber,
    refreshedAt, frontMatter, variables = {}, refreshToken = 0, theme,
    onOpenFile, onEditProse, onEditNotes, onRemoveChart, onRemoveChartAt,
    onRequestAddChart, onPrev, onNext,
    selRegionId = null, onSelectRegion, onProcedenciaChange,
    crudo = null, crudoAbierto = false, onAlternarCrudo,
}) => {
    const { prose, chartSrc, charts, notes } = splitSlideContent(slide.markdown);
    const layout = slide.layout;
    const meta = DECK_LAYOUT_META[layout];
    const acento = frontMatter?.accent || null;
    const paleta = frontMatter?.palette || null;
    const tono = resolveTone({ slideTone: slide.tone, deckTone: frontMatter?.tone });
    const canvasRef = useRef(null);
    const desborde = useDesborde(canvasRef);
    const [procedencia, setProcedencia] = useState(null);
    const recibirProcedencia = useCallback((datos) => {
        setProcedencia(datos);
        onProcedenciaChange?.(datos);
    }, [onProcedenciaChange]);
    const [piezas, setPiezas] = useState(null);
    const recibirPiezas = useCallback((p) => setPiezas(p), []);

    // ── Selección de región ──────────────────────────────────────────────
    const regiones = useMemo(() => regionesDe(layout), [layout]);
    // Las de texto y figura son las que se pueden recorrer; el antetítulo es
    // una directiva y su control llega con el inspector (fase 1).
    const recorribles = useMemo(() => regiones.filter((r) => r.tipo === 'texto' || r.tipo === 'figura'), [regiones]);
    // La seleccion vive en DeckEditor: el inspector es columna hermana y los
    // dos tienen que estar mirando lo mismo. Editar, en cambio, es asunto del
    // lienzo y se queda aqui.
    const selId = selRegionId;
    const setSelId = onSelectRegion;
    const [editId, setEditId] = useState(null);
    const [limpia, setLimpia] = useState(false);

    // Cambiar de lámina o de disposición deja la selección apuntando a una
    // región que puede no existir. Es el mismo fallo del estado derivado que
    // ya nos enseñó el pie de una lámina con la nota de la anterior.
    useEffect(() => {
        setSelId(null);
        setEditId(null);
        setPiezas(null);
        setProcedencia(null);
        onProcedenciaChange?.(null);
        // `setSelId` es el `setState` del padre y es estable; no entra en las
        // dependencias para no relanzar el efecto en cada render suyo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slide.id, layout, chartSrc]);

    const irARegion = useCallback((paso) => {
        if (!recorribles.length) return;
        const i = recorribles.findIndex((r) => r.id === selId);
        const siguiente = i === -1
            ? (paso > 0 ? 0 : recorribles.length - 1)
            : (i + paso + recorribles.length) % recorribles.length;
        setSelId(recorribles[siguiente].id);
        setEditId(null);
    }, [recorribles, selId]);

    useEffect(() => {
        const onKey = (e) => {
            // Mientras se escribe manda el cuadro de texto; sólo miramos aquí
            // lo que él no consume (y él ya para la propagación de lo suyo).
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
            if (e.altKey || e.metaKey) return;

            if (e.key === 'Tab') { e.preventDefault(); irARegion(e.shiftKey ? -1 : 1); return; }
            if (e.key === 'Enter' && selId) { e.preventDefault(); setEditId(selId); return; }
            if (e.key === 'Escape') { setEditId(null); setSelId(null); return; }
            if (e.key === '.' && e.ctrlKey) { e.preventDefault(); setLimpia((v) => !v); return; }
        };
        const el = canvasRef.current?.closest('.deck-design');
        el?.addEventListener('keydown', onKey);
        return () => el?.removeEventListener('keydown', onKey);
    }, [irARegion, selId]);

    const camposPie = resolveFooterFields({
        slideFooter: slide.footer, deckFooter, layout, hasChart: !!chartSrc,
    });

    // ── Fábricas de región ───────────────────────────────────────────────
    const propsRegion = (id) => ({
        seleccionada: selId === id,
        editando: editId === id,
        onSeleccionar: () => { setSelId(id); setEditId(null); },
        onEditar: () => { setSelId(id); setEditId(id); },
        onSalir: () => setEditId(null),
    });

    /**
     * Una región de texto, leída y escrita por la tabla. Nada a mano.
     *
     * Son FUNCIONES que devuelven elementos, no componentes, y por eso van en
     * minúscula. Definir un componente dentro del render —`const Texto = (...)`
     * y usarlo como `<Texto />`— crea un tipo nuevo en cada pasada, y React no
     * puede saber que es el mismo: desmonta el subárbol entero y lo vuelve a
     * montar. Con una figura dentro eso significa que `AmoxChartEmbed` se monta
     * otra vez, vuelve a pedir el `.amoxvis`, vuelve a ejecutar la consulta y
     * vuelve a poner estado — que provoca el siguiente render. Medido: más de
     * dos mil peticiones al servidor y la aplicación congelada.
     *
     * Llamándolas como funciones, lo que React ve es `<RegionTexto>`, que sí es
     * un tipo estable.
     */
    const texto = (id) => {
        const region = regiones.find((r) => r.id === id);
        if (!region) return null;
        return (
            <RegionTexto
                region={region}
                value={leerParte(prose, region.parte)}
                onCommit={(v) => onEditProse(escribirParte(prose, region.parte, v))}
                theme={theme}
                onOpenFile={onOpenFile}
                {...propsRegion(id)}
            />
        );
    };

    const figura = (id) => {
        const region = regiones.find((r) => r.id === id);
        if (!region) return null;
        return (
            <RegionFigura
                region={region}
                chartSrc={chartSrc}
                variables={variables}
                refreshToken={refreshToken}
                palette={paleta}
                onRemove={onRemoveChart}
                onRequestAdd={onRequestAddChart}
                onProcedencia={recibirProcedencia}
                onPiezas={recibirPiezas}
                seleccionada={selId === id}
                onSeleccionar={() => { setSelId(id); setEditId(null); }}
            />
        );
    };

    // El título de la figura sólo asciende si la lámina no escribe el suyo.
    const tituloHeredado = tieneTituloPropio(prose) ? '' : (piezas?.title || '');
    const heredadas = (
        <>
            <SlideKpi kpi={piezas?.kpi} />
            <SlideTakeaway texto={piezas?.takeaway} />
        </>
    );

    // Mismo reparto en dos bandas que SlidePreview: cabecera y cuerpo, con el
    // modificador de disposición en el cuerpo. Ver la nota de aquel archivo.
    let cuerpo;
    if (layout === 'chart-grid' || layout === 'compare') {
        cuerpo = (
            <div className={`deck-slide-body deck-slide-body--${layout}`}>
                <div className="deck-slide-cabecera">{texto('claim')}</div>
                <SlideCharts
                    charts={charts}
                    variables={variables}
                    refreshToken={refreshToken}
                    onProcedencia={recibirProcedencia}
                    modo={layout === 'compare' ? 'compare' : 'grid'}
                    palette={paleta}
                    onQuitar={onRemoveChartAt}
                    onAnadir={onRequestAddChart}
                />
                <div className="deck-slide-cierre">{texto(layout === 'compare' ? 'veredicto' : 'cierre')}</div>
            </div>
        );
    } else if (layout === 'two-col') {
        cuerpo = (
            <div className="deck-slide-body deck-slide-body--two-col">
                <div className="deck-slide-col">{texto('col-a')}</div>
                <div className="deck-slide-col">{texto('col-b')}</div>
            </div>
        );
    } else if (layout === 'finding') {
        cuerpo = (
            <div className="deck-slide-body deck-slide-body--finding">
                <div className="deck-slide-cabecera">{texto('claim')}</div>
                <div className="deck-slide-col deck-slide-col--text">
                    {texto('detalle')}
                    {heredadas}
                </div>
                <div className="deck-slide-col deck-slide-col--chart">{figura('figura')}</div>
            </div>
        );
    } else if (layout === 'chart-full') {
        cuerpo = (
            <div className="deck-slide-body deck-slide-body--chart-full deck-slide-body--design-chartfull">
                <div className="deck-slide-chartfull-caption">{texto('texto')}</div>
                <div className="deck-slide-chartfull-chart">{figura('figura')}</div>
            </div>
        );
    } else {
        // El resto: una sola región de texto, y la figura debajo si la lámina
        // llegó con una (se puede escribir a mano en el crudo).
        cuerpo = (
            <div className={`deck-slide-body deck-slide-body--${layout}`}>
                {texto('texto')}
                {chartSrc && <div className="deck-slide-inline-chart">{figura('figura')}</div>}
                {chartSrc && heredadas}
            </div>
        );
    }

    const body = (
        <div
            className={`deck-slide${acento ? ` accent-${acento}` : ''}`}
            data-accent={acento || undefined}
            data-tone={tono !== 'theme' ? tono : undefined}
            onClick={() => { setSelId(null); setEditId(null); }}
        >
            <SlideEyebrow eyebrow={eyebrow} layout={layout} />
            <SlideSectionIndex layout={layout} slideNumber={slideNumber} />
            <SlideTituloHeredado titulo={tituloHeredado} />
            {cuerpo}
            <SlideCoverMeta frontMatter={frontMatter} layout={layout} />
            <DeckFooter
                fields={camposPie}
                figure={procedencia}
                variables={variables}
                slideNumber={slideNumber}
                refreshedAt={refreshedAt}
                caveat={piezas?.footnote}
            />
        </div>
    );

    return (
        <div className="deck-design" tabIndex={-1}>
            <div className="deck-design-nav">
                <button type="button" onClick={onPrev} disabled={index <= 0} title="Previous slide">
                    <LuChevronLeft size={16} />
                </button>
                <span className="deck-design-counter">
                    Lámina {index + 1} / {total}
                    <span className="deck-design-layout-badge">{meta?.label || layout}</span>
                </span>
                <button
                    type="button"
                    className={`deck-design-limpia${limpia ? ' deck-design-limpia--on' : ''}`}
                    onClick={() => setLimpia((v) => !v)}
                    title="Clean view — turns the regions off without leaving Design (Ctrl+.)"
                >
                    <LuEye size={14} /> Vista limpia
                </button>
                <button
                    type="button"
                    className={`deck-design-limpia${crudoAbierto ? ' deck-design-limpia--on' : ''}`}
                    onClick={onAlternarCrudo}
                    title="The raw source of this slide (Ctrl+Shift+E)"
                >
                    <LuCode size={14} /> Crudo
                </button>
                <button type="button" onClick={onNext} disabled={index >= total - 1} title="Next slide">
                    <LuChevronRight size={16} />
                </button>
            </div>

            <div
                className={`deck-design-canvas${limpia ? ' deck-design-canvas--limpia' : ''}`}
                ref={canvasRef}
                style={{ aspectRatio }}
            >
                {body}
                {desborde.px > 2 && (
                    <div className="deck-desborde" title="A slide is a page: it crops instead of scrolling. Move something to a second slide.">
                        <LuTriangleAlert size={12} />
                        {desborde.region
                            ? <>The <b>{desborde.region}</b> region overflows by {Math.round(desborde.px)} px</>
                            : <>The slide overflows by {Math.round(desborde.px)} px</>}
                    </div>
                )}
            </div>

            {crudo}

            {onEditNotes && <NotesPanel notes={notes} onCommit={onEditNotes} />}
        </div>
    );
};

export default SlideDesigner;
