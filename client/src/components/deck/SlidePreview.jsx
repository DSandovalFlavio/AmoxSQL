/**
 * SlidePreview — renders one deck slide according to its layout.
 *
 * Una lámina tiene dos bandas: la cabecera (antetítulo) y el cuerpo. El cuerpo
 * es lo que cambia con la disposición, así que el modificador de layout vive en
 * `.deck-slide-body--X` y no en `.deck-slide`. Sin esa separación el antetítulo
 * se convertiría en una celda más de la rejilla en `content-chart` y `two-col`,
 * y aparecería dentro de la primera columna en vez de encima de las dos.
 *
 * Every layout reuses MarkdownPreview for text (headings, lists, code,
 * callouts, KaTeX, Mermaid, tables — full parity with the standalone .md
 * editor) via its `renderChartBlock` hook, which turns a fenced ```amoxchart
 * block into a live <AmoxChartEmbed>. `content-chart` additionally splits the
 * slide at its chart block into two columns (text left, chart right);
 * `two-col` splits on an explicit `<!-- col -->` marker the user places in the
 * slide.
 */
import { useMemo, useState, useCallback } from 'react';
import MarkdownPreview from '../markdown/MarkdownPreview';
import AmoxChartEmbed from './AmoxChartEmbed';
import { parseAmoxChartBlock, resolveFooterFields, resolveTone } from '../../utils/deckParser';
import { splitSlideContent } from '../../utils/deckTemplates';
import DeckFooter from './DeckFooter';
import SlideCharts from './SlideCharts';
import { SlideKpi, SlideTakeaway, SlideTituloHeredado, tieneTituloPropio, partirCabecera } from './SlideFigureParts';
import { renderDeckBlock } from './deckBlocks';

// `\r?\n` y no `\n`: en Windows un .amoxdeck guardado por cualquier editor
// llega con CRLF, y con el salto sin contemplar el retorno esta expresion no
// casaba. El grafico seguia dibujandose (lo pinta MarkdownPreview por su cuenta),
// asi que el fallo era invisible: lo unico que se perdia era el reparto en dos
// columnas de la lamina, que caia al cuerpo generico sin decir nada.
const AMOXCHART_FENCE_RE = /```amoxchart\r?\n([\s\S]*?)```/;
export const COL_BREAK_RE = /^\s*<!--\s*col\s*-->\s*$/m;
// Speaker notes (Fase 5) live in a fenced block same as the chart — but they
// are for the presenter, never the audience. Stripped once below, before any
// of the layout branches see the markdown, so a notes block can never
// render as a literal code block on screen.
const NOTES_FENCE_RE = /```notes\r?\n([\s\S]*?)```/;

function useChartRenderer(variables, refreshToken, onProcedencia, onPiezas, palette) {
    return useMemo(() => (raw) => {
        const parsed = parseAmoxChartBlock(raw);
        return (
            <AmoxChartEmbed
                src={parsed.src}
                card={parsed.card === true}
                variables={variables}
                refreshToken={refreshToken}
                palette={palette}
                onProcedencia={onProcedencia}
                onPiezas={onPiezas}
            />
        );
    }, [variables, refreshToken, onProcedencia, onPiezas, palette]);
}

/**
 * La banda de cabecera. No la llevan las láminas que ya son todo título: la
 * portada, el separador, la afirmación y el cierre. Ahí el antetítulo compite
 * con lo único que la lámina tiene que decir.
 */
const SIN_ANTETITULO = new Set(['cover', 'section', 'statement', 'closing']);

/**
 * Los cuatro datos que un lector necesita antes de creerse nada, y que la
 * portada enseña en grande en vez de esconder en el pie. Salen del
 * front-matter, no de la prosa: son del deck entero, no de una lámina.
 */
const COVER_META = [
    ['period', 'Period'],
    ['source', 'Source'],
    ['author', 'Analyst'],
    ['date', 'Data as of'],
];

export function SlideCoverMeta({ frontMatter, layout }) {
    if (layout !== 'cover' || !frontMatter) return null;
    const campos = COVER_META.filter(([k]) => frontMatter[k]);
    if (!campos.length) return null;
    return (
        <div className="deck-portada-meta">
            {campos.map(([k, etiqueta]) => (
                <div key={k}>
                    <u>{etiqueta}</u>
                    <b>{String(frontMatter[k])}</b>
                </div>
            ))}
        </div>
    );
}

/** El separador lleva su número a tamaño display: es la señal del corte. */
export function SlideSectionIndex({ layout, slideNumber }) {
    if (layout !== 'section' || slideNumber === undefined) return null;
    return <div className="deck-slide-indice">{String(slideNumber).padStart(2, '0')}</div>;
}

export function SlideEyebrow({ eyebrow, layout }) {
    if (!eyebrow || !eyebrow.trim() || SIN_ANTETITULO.has(layout)) return null;
    return <div className="deck-slide-eyebrow">{eyebrow}</div>;
}

const SlidePreview = ({
    slide, variables = {}, refreshToken = 0, onOpenFile, theme,
    eyebrow, deckFooter, slideNumber, refreshedAt, frontMatter,
}) => {
    // Tema del deck: el acento se aplica como clase en la lámina y la paleta
    // viaja a cada figura. Así una lámina y su gráfico no pueden discrepar.
    const acento = frontMatter?.accent || null;
    const paleta = frontMatter?.palette || null;
    const tono = resolveTone({ slideTone: slide.tone, deckTone: frontMatter?.tone });
    // La procedencia la reporta la figura cuando termina de ejecutarse; la
    // lámina la guarda para su pie. Sin contexto global: el dato nace y muere
    // dentro de la misma lámina.
    const [procedencia, setProcedencia] = useState(null);
    const recibirProcedencia = useCallback((datos) => setProcedencia(datos), []);
    // Las piezas que la figura suelta al disolverse su tarjeta.
    const [piezas, setPiezas] = useState(null);
    const recibirPiezas = useCallback((p) => setPiezas(p), []);
    const chartRenderer = useChartRenderer(variables, refreshToken, recibirProcedencia, recibirPiezas, paleta);
    const visibleMarkdown = slide.markdown.replace(NOTES_FENCE_RE, '').trim();
    const hayFigura = AMOXCHART_FENCE_RE.test(visibleMarkdown);
    const camposPie = resolveFooterFields({
        slideFooter: slide.footer,
        deckFooter,
        layout: slide.layout,
        hasChart: hayFigura,
    });

    // El título de la figura sólo asciende si la lámina no escribe el suyo.
    const tituloHeredado = tieneTituloPropio(visibleMarkdown) ? '' : (piezas?.title || '');
    const heredadas = (
        <>
            <SlideKpi kpi={piezas?.kpi} />
            <SlideTakeaway texto={piezas?.takeaway} />
        </>
    );

    let body;

    // Las dos láminas de varias figuras. Van antes que el resto porque su
    // reparto no lo decide el markdown sino el número de figuras.
    if (slide.layout === 'chart-grid' || slide.layout === 'compare') {
        const { prose, charts } = splitSlideContent(visibleMarkdown);
        const { cabecera, resto } = partirCabecera(prose);
        body = (
            <div className={`deck-slide-body deck-slide-body--${slide.layout}`}>
                {cabecera && (
                    <div className="deck-slide-cabecera">
                        <MarkdownPreview content={cabecera} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />
                    </div>
                )}
                <SlideCharts
                    charts={charts}
                    variables={variables}
                    refreshToken={refreshToken}
                    palette={paleta}
                    onProcedencia={recibirProcedencia}
                    modo={slide.layout === 'compare' ? 'compare' : 'grid'}
                />
                {resto && (
                    <div className="deck-slide-cierre">
                        <MarkdownPreview content={resto} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />
                    </div>
                )}
            </div>
        );
    } else if (slide.layout === 'finding' && AMOXCHART_FENCE_RE.test(visibleMarkdown)) {
        const match = visibleMarkdown.match(AMOXCHART_FENCE_RE);
        const before = visibleMarkdown.slice(0, match.index).trim();
        const after = visibleMarkdown.slice(match.index + match[0].length).trim();
        const parsed = parseAmoxChartBlock(match[1]);
        // La afirmación cruza a todo lo ancho; sólo la narrativa va en columna.
        const { cabecera, resto } = partirCabecera(before);
        body = (
            <div className="deck-slide-body deck-slide-body--finding">
                {cabecera && (
                    <div className="deck-slide-cabecera">
                        <MarkdownPreview content={cabecera} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />
                    </div>
                )}
                <div className="deck-slide-col deck-slide-col--text">
                    {resto && <MarkdownPreview content={resto} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />}
                    {after && <MarkdownPreview content={after} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderBlock={renderDeckBlock} />}
                    {heredadas}
                </div>
                <div className="deck-slide-col deck-slide-col--chart">
                    <AmoxChartEmbed
                        src={parsed.src}
                        card={parsed.card === true}
                        variables={variables}
                        refreshToken={refreshToken}
                    palette={paleta}
                        onProcedencia={recibirProcedencia}
                        onPiezas={recibirPiezas}
                    />
                </div>
            </div>
        );
    } else if (slide.layout === 'two-col' && COL_BREAK_RE.test(visibleMarkdown)) {
        const [left, right = ''] = visibleMarkdown.split(COL_BREAK_RE);
        body = (
            <div className="deck-slide-body deck-slide-body--two-col">
                <div className="deck-slide-col">
                    <MarkdownPreview content={left.trim()} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} renderBlock={renderDeckBlock} />
                </div>
                <div className="deck-slide-col">
                    <MarkdownPreview content={right.trim()} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} renderBlock={renderDeckBlock} />
                </div>
            </div>
        );
    } else {
        // El resto de tipos son el cuerpo por defecto con otro reparto, que lo
        // pone el CSS. Aquí cae también un `finding` sin bloque de gráfico, en
        // vez de quedarse con media lámina vacía.
        body = (
            <div className={`deck-slide-body deck-slide-body--${slide.layout}`}>
                <MarkdownPreview content={visibleMarkdown} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} renderBlock={renderDeckBlock} />
                {hayFigura && heredadas}
            </div>
        );
    }

    return (
        <div
            className={`deck-slide${acento ? ` accent-${acento}` : ''}`}
            data-accent={acento || undefined}
            data-tone={tono !== 'theme' ? tono : undefined}
        >
            <SlideEyebrow eyebrow={eyebrow} layout={slide.layout} />
            <SlideSectionIndex layout={slide.layout} slideNumber={slideNumber} />
            <SlideTituloHeredado titulo={tituloHeredado} />
            {body}
            <SlideCoverMeta frontMatter={frontMatter} layout={slide.layout} />
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
};

export default SlidePreview;
