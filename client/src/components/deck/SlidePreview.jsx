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
import { parseAmoxChartBlock, resolveFooterFields } from '../../utils/deckParser';
import DeckFooter from './DeckFooter';

const AMOXCHART_FENCE_RE = /```amoxchart\n([\s\S]*?)```/;
const COL_BREAK_RE = /^\s*<!--\s*col\s*-->\s*$/m;
// Speaker notes (Fase 5) live in a fenced block same as the chart — but they
// are for the presenter, never the audience. Stripped once below, before any
// of the layout branches see the markdown, so a notes block can never
// render as a literal code block on screen.
const NOTES_FENCE_RE = /```notes\n([\s\S]*?)```/;

function useChartRenderer(variables, refreshToken, onProcedencia) {
    return useMemo(() => (raw) => {
        const parsed = parseAmoxChartBlock(raw);
        return (
            <AmoxChartEmbed
                src={parsed.src}
                variables={variables}
                refreshToken={refreshToken}
                onProcedencia={onProcedencia}
            />
        );
    }, [variables, refreshToken, onProcedencia]);
}

/**
 * La banda de cabecera. La portada no la lleva: ya tiene su propio título a
 * tamaño display y el antetítulo competiría con él.
 */
export function SlideEyebrow({ eyebrow, layout }) {
    if (!eyebrow || !eyebrow.trim() || layout === 'title') return null;
    return <div className="deck-slide-eyebrow">{eyebrow}</div>;
}

const SlidePreview = ({
    slide, variables = {}, refreshToken = 0, onOpenFile, theme,
    eyebrow, deckFooter, slideNumber, refreshedAt,
}) => {
    // La procedencia la reporta la figura cuando termina de ejecutarse; la
    // lámina la guarda para su pie. Sin contexto global: el dato nace y muere
    // dentro de la misma lámina.
    const [procedencia, setProcedencia] = useState(null);
    const recibirProcedencia = useCallback((datos) => setProcedencia(datos), []);
    const chartRenderer = useChartRenderer(variables, refreshToken, recibirProcedencia);
    const visibleMarkdown = slide.markdown.replace(NOTES_FENCE_RE, '').trim();
    const hayFigura = AMOXCHART_FENCE_RE.test(visibleMarkdown);
    const camposPie = resolveFooterFields({
        slideFooter: slide.footer,
        deckFooter,
        layout: slide.layout,
        hasChart: hayFigura,
    });

    let body;

    if (slide.layout === 'content-chart' && AMOXCHART_FENCE_RE.test(visibleMarkdown)) {
        const match = visibleMarkdown.match(AMOXCHART_FENCE_RE);
        const before = visibleMarkdown.slice(0, match.index).trim();
        const after = visibleMarkdown.slice(match.index + match[0].length).trim();
        const parsed = parseAmoxChartBlock(match[1]);
        body = (
            <div className="deck-slide-body deck-slide-body--content-chart">
                <div className="deck-slide-col deck-slide-col--text">
                    {before && <MarkdownPreview content={before} theme={theme} onOpenFile={onOpenFile} widthMode="full" />}
                    {after && <MarkdownPreview content={after} theme={theme} onOpenFile={onOpenFile} widthMode="full" />}
                </div>
                <div className="deck-slide-col deck-slide-col--chart">
                    <AmoxChartEmbed
                        src={parsed.src}
                        variables={variables}
                        refreshToken={refreshToken}
                        onProcedencia={recibirProcedencia}
                    />
                </div>
            </div>
        );
    } else if (slide.layout === 'two-col' && COL_BREAK_RE.test(visibleMarkdown)) {
        const [left, right = ''] = visibleMarkdown.split(COL_BREAK_RE);
        body = (
            <div className="deck-slide-body deck-slide-body--two-col">
                <div className="deck-slide-col">
                    <MarkdownPreview content={left.trim()} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} />
                </div>
                <div className="deck-slide-col">
                    <MarkdownPreview content={right.trim()} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} />
                </div>
            </div>
        );
    } else {
        // title / content / chart-full — y content-chart sin bloque de gráfico,
        // que cae aquí en vez de quedarse con media lámina vacía.
        body = (
            <div className={`deck-slide-body deck-slide-body--${slide.layout}`}>
                <MarkdownPreview content={visibleMarkdown} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} />
            </div>
        );
    }

    return (
        <div className="deck-slide">
            <SlideEyebrow eyebrow={eyebrow} layout={slide.layout} />
            {body}
            <DeckFooter
                fields={camposPie}
                figure={procedencia}
                variables={variables}
                slideNumber={slideNumber}
                refreshedAt={refreshedAt}
            />
        </div>
    );
};

export default SlidePreview;
