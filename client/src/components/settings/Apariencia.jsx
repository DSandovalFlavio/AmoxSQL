/**
 * Settings › Colores, tema, tipografía y tamaño de la interfaz.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
// Los acentos viven fuera: el inspector del deck necesita la misma lista y no
// puede importar 97 KB de modal para leer dos arrays.
import { LuMoon, LuSun } from 'react-icons/lu';
import { VIBRANT_ACCENTS, SOBER_ACCENTS } from '../../accents.js';
import { Toggle } from './comun';

/**
 * Los temas, EN COLUMNAS, porque el orden dice algo.
 *
 * Las tres primeras son parejas: la misma paleta en oscuro arriba y en claro
 * abajo. Leerlas en vertical es leer «este tema, en sus dos modos», que es como
 * se elige de verdad — nadie compara Amox Light contra Nord, compara Amox
 * contra Sterling.
 *
 * Las dos ultimas son los temas con caracter propio, que no tienen pareja
 * clara. Van ordenados de mas oscuro arriba a mas claro abajo, columna a
 * columna: Obsidian 0,145 · Ember 0,203 · Dark Islands 0,217 · Nord 0,234 (la
 * claridad en OKLCH; ver `docs/dev/mapa_temas.html`, que se genera del CSS).
 */
const COLUMNAS_DE_TEMAS = [
    [
        { id: 'amoxdark',  label: 'Amox Dark',    icon: <LuMoon size={14} />, sidebar: '#151b22', editor: '#0f141a', text: '#22d3ee', desc: 'Signature · cyan brand' },
        { id: 'amoxlight', label: 'Amox Light',   icon: <LuSun size={14} />,  sidebar: '#f8fafb', editor: '#f1f4f7', text: '#0a7d8c', desc: 'Signature · teal brand' },
    ],
    [
        { id: 'sterlingdeep',  label: 'Sterling Deep',  icon: <LuMoon size={14} />, sidebar: '#181824', editor: '#13131f', text: '#b6f09c', desc: 'Deep violet · lime accent' },
        { id: 'sterlinglight', label: 'Sterling Light', icon: <LuSun size={14} />,  sidebar: '#fbf9fe', editor: '#f6f3fb', text: '#7c5ce0', desc: 'Sterling · by La Matemaga' },
    ],
    [
        { id: 'deepdark',  label: 'Deep Dark',    icon: <LuMoon size={14} />, sidebar: '#0f0f0f', editor: '#050505', text: '#ccc',    desc: 'True black · no tint at all' },
        { id: 'mist',      label: 'Mist',         icon: <LuSun size={14} />,  sidebar: '#e8ecf2', editor: '#f2f4f8', text: '#2c3444', desc: 'Cool fog' },
    ],
    [
        { id: 'dark',      label: 'Obsidian',     icon: <LuMoon size={14} />, sidebar: '#0e1017', editor: '#080a0f', text: '#ccc',    desc: 'Deep ink blue' },
        { id: 'ember',     label: 'Ember',        icon: <LuMoon size={14} />, sidebar: '#1a1a23', editor: '#16161c', text: '#e95678', desc: 'Cool floor · warm syntax' },
    ],
    [
        { id: 'islands',   label: 'Dark Islands', icon: <LuMoon size={14} />, sidebar: '#1e2024', editor: '#181a1d', text: '#bcbec4', desc: 'Sober grey, no tint' },
        { id: 'nord',      label: 'Nord Dark',    icon: <LuMoon size={14} />, sidebar: '#151920', editor: '#222833', text: '#d8dee9', desc: 'Polar night' },
    ],
];

// Esquinas del resplandor del fondo. Los ids coinciden con las clases body.glow-*
// de index.css; el punto de la miniatura se posiciona con esos mismos ids.
const GLOW_CORNERS = [
    { id: 'tl', label: 'Top left' },
    { id: 'tc', label: 'Top center' },
    { id: 'tr', label: 'Top right' },
    { id: 'bl', label: 'Bottom left' },
    { id: 'br', label: 'Bottom right' },
];

export default function Apariencia({
    accentL,
    currentAccent,
    currentInterfaceFont,
    currentTheme,
    editorSettings,
    effectiveAccentL,
    glowCorner,
    glowStrength,
    isLightMode,
    onAccentChange,
    onAccentLChange,
    onEditorSettingsChange,
    onGlowCornerChange,
    onGlowStrengthChange,
    onInterfaceFontChange,
    onThemeChange,
    onUiZoomChange,
    uiZoomLevel,
}) {
    return (
        <div className="stg-section">
            {/* Theme */}
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb12">Color Theme</h3>
                <div className="stg-theme-grid">
                    {COLUMNAS_DE_TEMAS.map((columna, i) => (
                      <div className="stg-theme-col" key={i}>
                    {columna.map(t => (
                        <div
                            key={t.id}
                            onClick={() => onThemeChange(t.id)}
                            className={`stg-theme-card${currentTheme === t.id ? ' stg-theme-card--active' : ''}`}
                            style={{ backgroundColor: t.editor }}
                        >
                            <div className="stg-theme-card-label" style={{ color: t.text }}>
                                {t.icon} {t.label}
                            </div>
                            <div className="stg-theme-preview">
                                <div className="stg-theme-preview-sidebar" style={{ background: t.sidebar, borderRight: `1px solid ${t.id === 'light' ? '#dee2e6' : '#333'}` }} />
                                <div className="stg-theme-preview-editor" style={{ background: t.editor, color: t.text }}>
                                    SELECT *
                                </div>
                            </div>
                            <div className="stg-theme-card-desc" style={{ color: t.text }}>{t.desc}</div>
                        </div>
                    ))}
                      </div>
                    ))}
                </div>
            </div>

            {/* Interface Font */}
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb12">Interface Font</h3>
                <select
                    value={currentInterfaceFont}
                    onChange={e => onInterfaceFontChange?.(e.target.value)}
                    style={{
                        width: '100%', maxWidth: 300, padding: '8px 10px',
                        background: 'var(--input-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 6, fontSize: 13,
                        fontFamily: 'var(--font-sans)',
                    }}
                >
                    <option value="manrope">Manrope</option>
                    <option value="inter">Inter</option>
                    <option value="lato">Lato</option>
                    <option value="ibm-plex">IBM Plex Sans</option>
                    <option value="space-grotesk">Space Grotesk</option>
                    <option value="lora">Lora (serif)</option>
                    <option value="system">System Default</option>
                </select>
                <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    Applies to the whole interface. The code editor font is configured separately under Editor.
                </p>
            </div>

            {/* Accent */}
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb12">Accent Color</h3>
                <p className="stg-swatch-label">Vibrant</p>
                <div className="stg-swatch-group stg-mb14">
                    {VIBRANT_ACCENTS.map(s => (
                        <div
                            key={s.id}
                            onClick={() => onAccentChange?.(s.id)}
                            className={`stg-swatch${currentAccent === s.id ? ' stg-swatch--active' : ''}`}
                            style={{ background: s.color }}
                            title={s.label}
                        >
                            {currentAccent === s.id && <span className="stg-swatch-check" style={{ color: '#000' }}>✓</span>}
                        </div>
                    ))}
                </div>
                <p className="stg-swatch-label">Sober</p>
                <div className="stg-swatch-group">
                    {SOBER_ACCENTS.map(s => (
                        <div
                            key={s.id}
                            onClick={() => onAccentChange?.(s.id)}
                            className={`stg-swatch${currentAccent === s.id ? ' stg-swatch--active' : ''}`}
                            style={{ background: s.color }}
                            title={s.label}
                        >
                            {currentAccent === s.id && <span className="stg-swatch-check" style={{ color: s.checkColor }}>✓</span>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Lighting */}
            <hr className="stg-divider" />
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb4">Lighting</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    How strongly the accent lights the interface, and where the glow behind the panels comes from.
                </p>
                <div className="stg-group">
                    <div className="stg-row">
                        <span className="stg-row-label">Accent intensity</span>
                        <div className="stg-flex">
                            <input type="range" className="stg-range" min="0.6" max="0.95" step="0.005"
                                value={effectiveAccentL}
                                disabled={isLightMode}
                                onChange={(e) => onAccentLChange?.(parseFloat(e.target.value))}
                            />
                            <span className="stg-range-value">{effectiveAccentL.toFixed(3).replace(/^0/, '')}</span>
                        </div>
                    </div>
                    <div className="stg-row">
                        <span className="stg-row-desc">
                            {isLightMode
                                ? 'Light themes set their own accent, tuned for contrast on a light background. This control applies to dark themes.'
                                : 'Picking a different accent resets this to that accent’s own intensity.'}
                        </span>
                        {!isLightMode && accentL != null && (
                            <button className="stg-link-btn" onClick={() => onAccentLChange?.(null)}>Reset</button>
                        )}
                    </div>

                    <div className="stg-row">
                        <span className="stg-row-label">Glow corner</span>
                        <div className="stg-flex">
                            {GLOW_CORNERS.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => onGlowCornerChange?.(c.id)}
                                    className={`stg-glow-corner${glowCorner === c.id ? ' stg-glow-corner--active' : ''}`}
                                    title={c.label}
                                    aria-label={c.label}
                                >
                                    <span className={`stg-glow-dot stg-glow-dot--${c.id}`} />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="stg-row">
                        <span className="stg-row-label">Glow strength</span>
                        <div className="stg-flex">
                            <input type="range" className="stg-range" min="0" max="50" step="1"
                                value={glowStrength}
                                onChange={(e) => onGlowStrengthChange?.(parseInt(e.target.value, 10))}
                            />
                            <span className="stg-range-value">{glowStrength}%</span>
                        </div>
                    </div>
                    <div className="stg-row">
                        <span className="stg-row-desc">
                            At 0% the glow is off. The bottom corners light the status bar instead of the title bar.
                        </span>
                    </div>
                </div>
            </div>

            {/* Interface Scale */}
            <hr className="stg-divider" />
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb4">Interface Scale</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    Adjust the size of all UI elements (menus, sidebar, tabs, panels). Similar to browser zoom.
                </p>
                <div className="stg-group">
                    <div className="stg-row">
                        <span className="stg-row-label">Scale</span>
                        <div className="stg-flex">
                            <input type="range" className="stg-range" min="0.7" max="1.4" step="0.05"
                                value={uiZoomLevel}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    onUiZoomChange?.(val);
                                    // Trigger Electron zoom if available
                                    if (window.electronAPI?.zoom?.set) {
                                        window.electronAPI.zoom.set(val);
                                    }
                                }}
                            />
                            <span className="stg-range-value">{Math.round(uiZoomLevel * 100)}%</span>
                        </div>
                    </div>
                    <div className="stg-row">
                        <span className="stg-row-desc">Use <kbd className="stg-kbd">Ctrl</kbd> + <kbd className="stg-kbd">=</kbd> / <kbd className="stg-kbd">-</kbd> for quick zoom. <kbd className="stg-kbd">Ctrl</kbd> + <kbd className="stg-kbd">0</kbd> to reset.</span>
                    </div>
                </div>
            </div>
            <hr className="stg-divider" />
            <div>
                <h3 className="stg-section-heading stg-section-heading--mb4">Activity Bar</h3>
                <div className="stg-group">
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Show names under the icons</span>
                            <p className="stg-row-desc">Files, Search, Data, Library… written under each icon of the left strip</p>
                        </div>
                        <Toggle on={!!editorSettings.activityBarLabels} onChange={() => onEditorSettingsChange?.({ activityBarLabels: !editorSettings.activityBarLabels })} />
                    </div>
                </div>
            </div>
        </div>
    );
}
