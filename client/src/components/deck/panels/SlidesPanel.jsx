/**
 * SlidesPanel — Report Flow Studio "Slides" tab.
 *
 * An outline of the deck: one row per slide with its layout badge and a
 * best-effort title (first heading, else first line of text). Clicking a row
 * jumps the editor cursor to that slide (Edit view) or scrolls to its card
 * (Present view) via `onNavigate`. Reorder (`onMove`) and delete (`onDelete`)
 * mutate the underlying markdown through DeckEditor's serializeDeck-based
 * handlers — this panel is just the outline UI, not a parallel data model.
 */
import { LuChevronUp, LuChevronDown, LuTrash2, LuPlus } from 'react-icons/lu';
import { DECK_LAYOUT_META } from '../deckLayoutPreviews';

function extractSlideTitle(markdown) {
    const heading = (markdown || '').match(/^#{1,6}\s+(.+)$/m);
    if (heading) return heading[1].trim();
    const firstLine = (markdown || '').split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    if (!firstLine) return '(empty slide)';
    return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine;
}

const SlidesPanel = ({ slides, activeSlideIndex, onNavigate, onMove, onDelete, onAddSlide }) => {
    return (
        <div className="deck-panel deck-panel--slides">
            <p className="deck-panel-hint">Click to open a slide; reorder or remove it.</p>

            <div className="deck-outline-list">
                {slides.map((slide, index) => {
                    const meta = DECK_LAYOUT_META[slide.layout];
                    return (
                        <div key={slide.id} className={`deck-outline-item${index === activeSlideIndex ? ' deck-outline-item--active' : ''}`}>
                            <button
                                type="button"
                                className="deck-outline-item-main"
                                onClick={() => onNavigate(slide)}
                                title="Jump to this slide"
                            >
                                <span className="deck-outline-item-index">{index + 1}</span>
                                <div className="deck-outline-item-info">
                                    <span className="deck-outline-item-title">{extractSlideTitle(slide.markdown)}</span>
                                    <span className="deck-outline-item-layout">{meta?.label || slide.layout}</span>
                                </div>
                            </button>
                            <div className="deck-outline-item-actions">
                                <button
                                    type="button"
                                    disabled={index === 0}
                                    onClick={() => onMove(index, -1)}
                                    title="Move up"
                                >
                                    <LuChevronUp size={15} strokeWidth={2.4} />
                                </button>
                                <button
                                    type="button"
                                    disabled={index === slides.length - 1}
                                    onClick={() => onMove(index, 1)}
                                    title="Move down"
                                >
                                    <LuChevronDown size={15} strokeWidth={2.4} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(index)}
                                    title="Delete slide"
                                    className="deck-outline-item-delete"
                                >
                                    <LuTrash2 size={15} strokeWidth={2.4} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <button type="button" className="deck-outline-add" onClick={onAddSlide}>
                <LuPlus size={13} /> Add slide
            </button>
        </div>
    );
};

export default SlidesPanel;
