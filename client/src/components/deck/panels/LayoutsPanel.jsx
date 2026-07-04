/**
 * LayoutsPanel — Report Flow Studio "Layouts" tab.
 *
 * A gallery of the 5 deck layouts with a schematic preview + one-line hint, so
 * a user can recognize what each layout looks like before using it. Clicking a
 * card applies that layout to the ACTIVE slide (the one open in the Design
 * view); the current layout is marked. New slides are added from the Slides
 * panel's "+ Add slide".
 */
import { DECK_LAYOUT_GALLERY } from '../deckLayoutPreviews';

const LayoutsPanel = ({ onApplyLayout, activeLayout }) => {
    return (
        <div className="deck-panel deck-panel--layouts">
            <p className="deck-panel-hint">Click a layout to apply it to the current slide.</p>
            <div className="dlp-gallery">
                {DECK_LAYOUT_GALLERY.map(({ id, label, hint, Preview }) => (
                    <button
                        key={id}
                        type="button"
                        className={`dlp-card${activeLayout === id ? ' dlp-card--active' : ''}`}
                        onClick={() => onApplyLayout(id)}
                        title={`Apply the "${label}" layout to this slide`}
                    >
                        <Preview />
                        <div className="dlp-card-label">{label}{activeLayout === id ? ' · current' : ''}</div>
                        <div className="dlp-card-hint">{hint}</div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default LayoutsPanel;
