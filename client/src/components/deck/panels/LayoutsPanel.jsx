/**
 * LayoutsPanel — Report Flow Studio "Layouts" tab.
 *
 * A gallery of the deck layouts with a schematic preview + one-line hint, so a
 * user can recognize what each layout looks like before using it. Clicking a
 * card applies that layout to the ACTIVE slide (the one open in the Design
 * view); the current layout is marked. New slides are added from the Slides
 * panel's "+ Add slide".
 *
 * Agrupada por familia: quince entradas en una lista plana no se eligen, se
 * sufren, y el orden de las familias es el mismo en que aparecen en un deck.
 */
import { DECK_LAYOUT_GALLERY_BY_FAMILY } from '../deckLayoutPreviews';

const LayoutsPanel = ({ onApplyLayout, activeLayout }) => {
    return (
        <div className="deck-panel deck-panel--layouts">
            <p className="deck-panel-hint">Click a layout to apply it to the current slide.</p>

            {DECK_LAYOUT_GALLERY_BY_FAMILY.map((family) => (
                <section key={family.key} className="dlp-family">
                    <h4 className="dlp-family-label">{family.label}</h4>
                    <div className="dlp-gallery">
                        {family.items.map(({ id, label, hint, Preview }) => (
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
                </section>
            ))}
        </div>
    );
};

export default LayoutsPanel;
