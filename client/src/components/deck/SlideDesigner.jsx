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
import { useState, useEffect } from 'react';
import { LuChevronLeft, LuChevronRight, LuChartBar, LuX, LuPencilLine } from 'react-icons/lu';
import MarkdownPreview from '../markdown/MarkdownPreview';
import AmoxChartEmbed from './AmoxChartEmbed';
import { splitSlideContent } from '../../utils/deckTemplates';
import { DECK_LAYOUT_META } from './deckLayoutPreviews';

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
                ? <MarkdownPreview content={value} theme={theme} onOpenFile={onOpenFile} widthMode="full" />
                : <span className="deck-prose-placeholder">{placeholder || 'Click to add text'}</span>}
        </div>
    );
}

/** Live chart slot, or an empty placeholder that points at the Charts panel. */
function ChartSlot({ chartSrc, variables, refreshToken, onRemove, onRequestAdd }) {
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
            <AmoxChartEmbed src={chartSrc} variables={variables} refreshToken={refreshToken} />
        </div>
    );
}

const SlideDesigner = ({
    slide,
    index,
    total,
    aspectRatio,
    variables = {},
    refreshToken = 0,
    theme,
    onOpenFile,
    onEditProse,
    onRemoveChart,
    onRequestAddChart,
    onPrev,
    onNext,
}) => {
    const { prose, chartSrc } = splitSlideContent(slide.markdown);
    const layout = slide.layout;
    const meta = DECK_LAYOUT_META[layout];

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
        />
    );

    let body;
    if (layout === 'content-chart') {
        body = (
            <div className="deck-slide deck-slide--content-chart">
                <div className="deck-slide-col deck-slide-col--text">{proseEl}</div>
                <div className="deck-slide-col deck-slide-col--chart">{chartEl}</div>
            </div>
        );
    } else if (layout === 'chart-full') {
        body = (
            <div className="deck-slide deck-slide--chart-full deck-slide--design-chartfull">
                {prose.trim() && <div className="deck-slide-chartfull-caption">{proseEl}</div>}
                <div className="deck-slide-chartfull-chart">{chartEl}</div>
                {!prose.trim() && <div className="deck-slide-chartfull-editcaption">{proseEl}</div>}
            </div>
        );
    } else {
        // title / content / two-col — prose fills; chart (if any) sits below.
        body = (
            <div className={`deck-slide deck-slide--${layout}`}>
                {proseEl}
                {chartSrc && <div className="deck-slide-inline-chart">{chartEl}</div>}
            </div>
        );
    }

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

            <div className="deck-design-canvas" style={{ aspectRatio }}>
                {body}
            </div>
        </div>
    );
};

export default SlideDesigner;
