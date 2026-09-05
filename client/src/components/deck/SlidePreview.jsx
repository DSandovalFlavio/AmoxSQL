/**
 * SlidePreview — renders one deck slide according to its layout.
 *
 * Every layout reuses MarkdownPreview for text (headings, lists, code,
 * callouts, KaTeX, tables — full parity with the standalone .md editor) via
 * its `renderChartBlock` hook, which turns a fenced ```amoxchart block into
 * a live <AmoxChartEmbed>. `content-chart` additionally splits the slide at
 * its chart block into two CSS columns (text left, chart right); `two-col`
 * splits on an explicit `<!-- col -->` marker the user places in the slide.
 * Layouts without special handling (title, content, chart-full) just render
 * the whole slide as one flowing MarkdownPreview inside a layout-specific
 * CSS wrapper.
 */
import { useMemo } from 'react';
import MarkdownPreview from '../markdown/MarkdownPreview';
import AmoxChartEmbed from './AmoxChartEmbed';
import { parseAmoxChartBlock } from '../../utils/deckParser';

const AMOXCHART_FENCE_RE = /```amoxchart\n([\s\S]*?)```/;
const COL_BREAK_RE = /^\s*<!--\s*col\s*-->\s*$/m;
// Speaker notes (Fase 5) live in a fenced block same as the chart — but they
// are for the presenter, never the audience. Stripped once below, before any
// of the layout branches see the markdown, so a notes block can never
// render as a literal code block on screen.
const NOTES_FENCE_RE = /```notes\n([\s\S]*?)```/;

function useChartRenderer(variables, refreshToken) {
    return useMemo(() => (raw) => {
        const parsed = parseAmoxChartBlock(raw);
        return <AmoxChartEmbed src={parsed.src} variables={variables} refreshToken={refreshToken} />;
    }, [variables, refreshToken]);
}

const SlidePreview = ({ slide, variables = {}, refreshToken = 0, onOpenFile, theme }) => {
    const chartRenderer = useChartRenderer(variables, refreshToken);
    const visibleMarkdown = slide.markdown.replace(NOTES_FENCE_RE, '').trim();

    if (slide.layout === 'content-chart') {
        const match = visibleMarkdown.match(AMOXCHART_FENCE_RE);
        if (match) {
            const before = visibleMarkdown.slice(0, match.index).trim();
            const after = visibleMarkdown.slice(match.index + match[0].length).trim();
            const parsed = parseAmoxChartBlock(match[1]);
            return (
                <div className="deck-slide deck-slide--content-chart">
                    <div className="deck-slide-col deck-slide-col--text">
                        {before && <MarkdownPreview content={before} theme={theme} onOpenFile={onOpenFile} widthMode="full" />}
                        {after && <MarkdownPreview content={after} theme={theme} onOpenFile={onOpenFile} widthMode="full" />}
                    </div>
                    <div className="deck-slide-col deck-slide-col--chart">
                        <AmoxChartEmbed src={parsed.src} variables={variables} refreshToken={refreshToken} />
                    </div>
                </div>
            );
        }
        // Layout declared but no chart block present — fall back to plain content below.
    }

    if (slide.layout === 'two-col' && COL_BREAK_RE.test(visibleMarkdown)) {
        const [left, right = ''] = visibleMarkdown.split(COL_BREAK_RE);
        return (
            <div className="deck-slide deck-slide--two-col">
                <div className="deck-slide-col">
                    <MarkdownPreview content={left.trim()} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} />
                </div>
                <div className="deck-slide-col">
                    <MarkdownPreview content={right.trim()} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} />
                </div>
            </div>
        );
    }

    return (
        <div className={`deck-slide deck-slide--${slide.layout}`}>
            <MarkdownPreview content={visibleMarkdown} theme={theme} onOpenFile={onOpenFile} widthMode="full" renderChartBlock={chartRenderer} />
        </div>
    );
};

export default SlidePreview;
