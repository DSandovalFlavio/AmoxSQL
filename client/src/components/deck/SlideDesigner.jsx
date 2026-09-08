/**
 * SlideDesigner — the Report Flow Studio "Design" view: edits ONE active slide
 * at a time (like a real slide editor), not a scroll of the whole deck.
 *
 * The slide's text is edited in place: click the prose to turn it into a
 * focused editor for THAT slide's markdown, blur to commit. The chart is a
 * live slot — picking a chart from the Charts panel sets/replaces the chart on
 * THIS slide (never appended to the bottom of the file). Everything is
 * serialized back to the `.amoxdeck` markdown by DeckEditor; the user never
 * touches the raw file (same relationship Story Flow has with its `.amoxvis`
 * JSON).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { LuChevronLeft, LuChevronRight, LuChevronUp, LuChevronDown, LuChartBar, LuX, LuPencilLine, LuNotebookPen, LuTriangleAlert } from 'react-icons/lu';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { SlideEyebrow, SlideSectionIndex, SlideCoverMeta } from './SlidePreview';
import DeckFooter from './DeckFooter';
import { SlideKpi, SlideTakeaway, SlideTituloHeredado, tieneTituloPropio, partirCabecera } from './SlideFigureParts';
import { renderDeckBlock } from './deckBlocks';
import AmoxChartEmbed from './AmoxChartEmbed';
import { splitSlideContent } from '../../utils/deckTemplates';
import { resolveFooterFields } from '../../utils/deckParser';
import { DECK_LAYOUT_META } from './deckLayoutPreviews';

/**
 * A slide is one page: `.deck-slide` clips instead of scrolling, so content
 * that does not fit would just vanish. This measures the gap and lets the
 * designer surface it — without the warning, removing the scrollbar would only
 * trade a visible failure for a silent one.
 */
function useDesborde(canvasRef) {
    const [desborde, setDesborde] = useState(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const medir = () => {
            const slide = canvas.querySelector('.deck-slide');
            if (!slide) { setDesborde(0); return; }
            // No basta con medir la lámina: una columna que recorta esconde su
            // propio desborde sin que el alto de la lámina crezca, así que el
            // aviso se perdía justo donde más falta hace.
            //
            // Sólo cuentan las cajas que RECORTAN de verdad. Una caja sin
            // `overflow` puede dar unos pocos píxeles de diferencia por la caja
            // de línea de un encabezado sin que se corte nada, y avisar de eso
            // es enseñar a ignorar el aviso.
            const cajas = [slide, ...slide.querySelectorAll('.deck-slide-col, .deck-slide-cabecera')];
            const peor = cajas.reduce((max, el) => {
                const oy = getComputedStyle(el).overflowY;
                if (oy !== 'hidden' && oy !== 'clip' && oy !== 'auto' && oy !== 'scroll') return max;
                return Math.max(max, el.scrollHeight - el.clientHeight);
            }, 0);
            setDesborde(Math.max(0, peor));
        };
        medir();

        // El alto depende del ancho (aspect-ratio) y del contenido, así que
        // hacen falta las dos señales: la del tamaño y la del DOM.
        const ro = new ResizeObserver(medir);
        ro.observe(canvas);
        const mo = new MutationObserver(medir);
        mo.observe(canvas, { childList: true, subtree: true, characterData: true });
        return () => { ro.disconnect(); mo.disconnect(); };
    }, [canvasRef]);

    return desborde;
}

/** Click-to-edit prose: rendered markdown that swaps to a textarea on click. */
function EditableProse({ value, placeholder, onCommit, theme, onOpenFile }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

    const commit = () => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
    };

    if (editing) {
        return (
            <textarea
                className="deck-prose-editor"
                value={draft}
                autoFocus
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
                    e.stopPropagation();
                }}
            />
        );
    }

    return (
        <div
            className="deck-prose-view"
            role="button"
            tabIndex={0}
            title="Click to edit text"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
        >
            <span className="deck-prose-edit-hint"><LuPencilLine size={12} /> Edit text</span>
            {value.trim()
                ? <MarkdownPreview content={value} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />
                : <span className="deck-prose-placeholder">{placeholder || 'Click to add text'}</span>}
        </div>
    );
}

/** Live chart slot, or an empty placeholder that points at the Charts panel. */
function ChartSlot({ chartSrc, variables, refreshToken, onRemove, onRequestAdd, onProcedencia, onPiezas }) {
    if (!chartSrc) {
        return (
            <button type="button" className="deck-chart-slot deck-chart-slot--empty" onClick={onRequestAdd}>
                <LuChartBar size={22} />
                <span>Add a chart</span>
                <span className="deck-chart-slot-sub">Pick one from the Charts panel</span>
            </button>
        );
    }
    return (
        <div className="deck-chart-slot">
            <button type="button" className="deck-chart-remove" title="Remove chart" onClick={onRemove}>
                <LuX size={13} />
            </button>
            <AmoxChartEmbed
                src={chartSrc}
                variables={variables}
                refreshToken={refreshToken}
                onProcedencia={onProcedencia}
                onPiezas={onPiezas}
            />
        </div>
    );
}

/** Collapsible speaker-notes strip below the canvas — exported as native
 *  notes in the .pptx (see generatePptxReport.js's slide.addNotes call). */
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
                    placeholder="Notes for the presenter — not shown on the slide, exported into the PowerPoint's Notes pane."
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => { if (draft !== notes) onCommit(draft); }}
                />
            )}
        </div>
    );
}

const SlideDesigner = ({
    slide,
    index,
    total,
    aspectRatio,
    eyebrow,
    deckFooter,
    slideNumber,
    refreshedAt,
    frontMatter,
    variables = {},
    refreshToken = 0,
    theme,
    onOpenFile,
    onEditProse,
    onEditNotes,
    onRemoveChart,
    onRequestAddChart,
    onPrev,
    onNext,
}) => {
    const { prose, chartSrc, notes } = splitSlideContent(slide.markdown);
    const layout = slide.layout;
    const meta = DECK_LAYOUT_META[layout];
    const canvasRef = useRef(null);
    const desborde = useDesborde(canvasRef);
    const [procedencia, setProcedencia] = useState(null);
    const recibirProcedencia = useCallback((datos) => setProcedencia(datos), []);
    const [piezas, setPiezas] = useState(null);
    const recibirPiezas = useCallback((p) => setPiezas(p), []);
    const camposPie = resolveFooterFields({
        slideFooter: slide.footer,
        deckFooter,
        layout,
        hasChart: !!chartSrc,
    });

    const proseEl = (
        <EditableProse value={prose} onCommit={onEditProse} theme={theme} onOpenFile={onOpenFile} />
    );
    const chartEl = (
        <ChartSlot
            chartSrc={chartSrc}
            variables={variables}
            refreshToken={refreshToken}
            onRemove={onRemoveChart}
            onRequestAdd={onRequestAddChart}
            onProcedencia={recibirProcedencia}
            onPiezas={recibirPiezas}
        />
    );

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
    // Igual que en Present: la afirmación cruza a todo lo ancho. Son dos
    // regiones editables independientes, y cada una devuelve la prosa COMPLETA
    // al confirmar, así que el archivo nunca se parte.
    const { cabecera, resto } = partirCabecera(prose);
    const editarCabecera = (nueva) => onEditProse([nueva.trim(), resto].filter(Boolean).join('\n\n'));
    const editarResto = (nuevo) => onEditProse([cabecera, nuevo.trim()].filter(Boolean).join('\n\n'));

    let cuerpo;
    if (layout === 'finding') {
        cuerpo = (
            <div className="deck-slide-body deck-slide-body--finding">
                <div className="deck-slide-cabecera">
                    <EditableProse value={cabecera} placeholder="Click to add the claim" onCommit={editarCabecera} theme={theme} onOpenFile={onOpenFile} />
                </div>
                <div className="deck-slide-col deck-slide-col--text">
                    <EditableProse value={resto} placeholder="Click to add the narrative" onCommit={editarResto} theme={theme} onOpenFile={onOpenFile} />
                    {heredadas}
                </div>
                <div className="deck-slide-col deck-slide-col--chart">{chartEl}</div>
            </div>
        );
    } else if (layout === 'chart-full') {
        cuerpo = (
            <div className="deck-slide-body deck-slide-body--chart-full deck-slide-body--design-chartfull">
                {prose.trim() && <div className="deck-slide-chartfull-caption">{proseEl}</div>}
                <div className="deck-slide-chartfull-chart">{chartEl}</div>
                {!prose.trim() && <div className="deck-slide-chartfull-editcaption">{proseEl}</div>}
            </div>
        );
    } else {
        // title / content / two-col — prose fills; chart (if any) sits below.
        cuerpo = (
            <div className={`deck-slide-body deck-slide-body--${layout}`}>
                {proseEl}
                {chartSrc && <div className="deck-slide-inline-chart">{chartEl}</div>}
                {chartSrc && heredadas}
            </div>
        );
    }

    const body = (
        <div className="deck-slide">
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
        <div className="deck-design">
            <div className="deck-design-nav">
                <button type="button" onClick={onPrev} disabled={index <= 0} title="Previous slide">
                    <LuChevronLeft size={16} />
                </button>
                <span className="deck-design-counter">
                    Slide {index + 1} / {total}
                    <span className="deck-design-layout-badge">{meta?.label || layout}</span>
                </span>
                <button type="button" onClick={onNext} disabled={index >= total - 1} title="Next slide">
                    <LuChevronRight size={16} />
                </button>
            </div>

            <div className="deck-design-canvas" ref={canvasRef} style={{ aspectRatio }}>
                {body}
                {desborde > 2 && (
                    <div className="deck-desborde" title="A slide is one page — it clips instead of scrolling. Move something to a second slide.">
                        <LuTriangleAlert size={12} />
                        Content overflows by {Math.round(desborde)}px
                    </div>
                )}
            </div>

            {onEditNotes && <NotesPanel notes={notes} onCommit={onEditNotes} />}
        </div>
    );
};

export default SlideDesigner;
