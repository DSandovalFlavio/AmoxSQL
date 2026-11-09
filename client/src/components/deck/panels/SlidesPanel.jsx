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
import { Fragment } from 'react';
import { LuChevronUp, LuChevronDown, LuTrash2, LuPlus, LuCopy, LuSparkles } from 'react-icons/lu';
import { DECK_LAYOUT_META } from '../deckLayoutPreviews';
import { slideTitle } from '../../../utils/deckTemplates';

/**
 * E4 (plan del Assistant): una lámina con una propuesta pendiente lleva la marca
 * del Assistant; una lámina nueva propuesta aparece como fantasma en su hueco, y
 * al pulsarla se revisa (Antes / Propuesta).
 */
const Fantasma = ({ f, onAbrir }) => {
    const meta = DECK_LAYOUT_META[f.layout];
    return (
        <div className="deck-outline-item deck-outline-item--fantasma">
            <button type="button" className="deck-outline-item-main" onClick={() => onAbrir?.(f.id)} title="Review the slide Assist proposes">
                <span className="deck-outline-item-index"><LuSparkles size={12} /></span>
                <div className="deck-outline-item-info">
                    <span className="deck-outline-item-title">{f.titulo}</span>
                    <span className="deck-outline-item-layout">Proposed · {meta?.label || f.layout}</span>
                </div>
            </button>
        </div>
    );
};

const SlidesPanel = ({ slides, activeSlideIndex, onNavigate, onMove, onDelete, onAddSlide, onDuplicate, marcadas = null, fantasmas = [], onAbrirFantasma }) => {
    const fantasmasEn = (i) => (fantasmas || []).filter(f => f.indice === i).map(f => <Fantasma key={f.id} f={f} onAbrir={onAbrirFantasma} />);
    return (
        <div className="deck-panel deck-panel--slides">
            <p className="deck-panel-hint">Click to open a slide; reorder or remove it.</p>

            <div className="deck-outline-list">
                {slides.map((slide, index) => {
                    const meta = DECK_LAYOUT_META[slide.layout];
                    const conPropuesta = !!marcadas?.has(index);
                    return (
                        <Fragment key={slide.id}>
                        {fantasmasEn(index)}
                        <div className={`deck-outline-item${index === activeSlideIndex ? ' deck-outline-item--active' : ''}${conPropuesta ? ' deck-outline-item--propuesta' : ''}`}>
                            <button
                                type="button"
                                className="deck-outline-item-main"
                                onClick={() => onNavigate(slide)}
                                title="Jump to this slide"
                            >
                                <span className="deck-outline-item-index" title={conPropuesta ? "Assist proposes a change to this slide" : undefined}>{conPropuesta ? <LuSparkles size={12} /> : index + 1}</span>
                                <div className="deck-outline-item-info">
                                    <span className="deck-outline-item-title">{slideTitle(slide.markdown)}</span>
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
                                    onClick={() => onDuplicate?.(index)}
                                    title="Duplicate the slide (Ctrl+D)"
                                >
                                    <LuCopy size={14} strokeWidth={2.2} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(index)}
                                    title="Delete the slide"
                                    className="deck-outline-item-delete"
                                >
                                    <LuTrash2 size={15} strokeWidth={2.4} />
                                </button>
                            </div>
                        </div>
                        </Fragment>
                    );
                })}
                {fantasmasEn(slides.length)}
            </div>

            <button type="button" className="deck-outline-add" onClick={onAddSlide}>
                <LuPlus size={13} /> Add slide
            </button>
        </div>
    );
};

export default SlidesPanel;
