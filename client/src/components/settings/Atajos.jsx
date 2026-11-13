/**
 * Settings › La lista de atajos (sale de utils/atajos.js).
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { seccionesDeAtajos } from '../../utils/atajos';

const SHORTCUT_SECTIONS = seccionesDeAtajos();

export default function Atajos() {
    return (
        <div className="stg-section">
            <p className="stg-row-desc stg-row-desc--mb14">
                Complete reference of all keyboard shortcuts available in AmoxSQL. On macOS, use <kbd className="stg-kbd">⌘</kbd> instead of <kbd className="stg-kbd">Ctrl</kbd>.
            </p>

            {SHORTCUT_SECTIONS.map((group, gi) => (
                <div key={group.category}>
                    {gi > 0 && <hr className="stg-divider" />}
                    <h3 className="stg-section-title">{group.category}</h3>
                    <div className="stg-group stg-group--mt14">
                        {group.items.map(item => (
                            <div key={item.keys} className="stg-row stg-row--shortcut">
                                <span className="stg-row-label">{item.description}</span>
                                <div className="stg-shortcut-keys">
                                    {item.keys.split(' + ').map((key, i) => (
                                        <span key={i}>
                                            {i > 0 && <span className="stg-shortcut-plus">+</span>}
                                            <kbd className="stg-kbd">{key}</kbd>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
