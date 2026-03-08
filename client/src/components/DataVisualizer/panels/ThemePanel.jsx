/**
 * ThemePanel — Color palette, background tonal adjustments, font, text size, border.
 * Tab: "Theme" — "How does it look?"
 */
import { memo } from 'react';
import { Section, SelectField, SliderField, SimpleColorPicker, panelStyles } from './shared';
import { COLOR_PALETTES, FONT_OPTIONS, BACKGROUND_TONES } from '../constants';

const PalettePreview = memo(({ colors, isActive, onClick }) => (
    <div
        onClick={onClick}
        style={{
            display: 'flex', gap: '2px', padding: '4px 6px',
            cursor: 'pointer', borderRadius: '5px',
            border: isActive ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
            background: isActive ? 'rgba(155, 135, 245, 0.1)' : 'transparent',
            transition: 'all 0.15s',
        }}
        onMouseOver={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--accent-color-user)'; }}
        onMouseOut={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border-color)'; }}
    >
        {colors.slice(0, 8).map((c, i) => (
            <div key={i} style={{
                width: '14px', height: '14px', borderRadius: '3px',
                backgroundColor: c, flexShrink: 0,
            }} />
        ))}
    </div>
));
PalettePreview.displayName = 'PalettePreview';

const ThemePanel = memo(({ state, setField, activeColors, seriesKeys, donutData }) => {
    const { colorTheme, backgroundTone, customBgColor, borderStyle, borderColor,
        fontFamily, textScale, seriesConfig, chartType } = state;

    const isDonut = chartType === 'donut';

    // Group palettes by category for display
    const paletteGroups = [
        { label: 'Modern', keys: ['default', 'vivid', 'neon'] },
        { label: 'Qualitative', keys: ['set1', 'set2', 'pastel', 'dark2'] },
        { label: 'Sequential', keys: ['blues', 'greens', 'reds', 'purples', 'ylorbr'] },
        { label: 'Diverging', keys: ['spectral', 'rdylbu', 'rdylgn', 'piyg'] },
        { label: 'Brand', keys: ['ocean', 'sunset', 'corporate'] },
    ];

    return (
        <>
            {/* ── Color Palette ── */}
            <Section title="Color Palette">
                <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {paletteGroups.map(group => (
                        <div key={group.label} style={{ marginBottom: '8px' }}>
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>
                                {group.label}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '3px' }}>
                                {group.keys.filter(k => COLOR_PALETTES[k]).map(key => (
                                    <PalettePreview
                                        key={key}
                                        colors={COLOR_PALETTES[key]}
                                        isActive={colorTheme === key}
                                        onClick={() => setField('colorTheme', key)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── Series Colors ── */}
            <Section title="Series Colors">
                {isDonut ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                        {(donutData || []).map((d, i) => {
                            const key = d[state.xAxisKey];
                            const color = seriesConfig[key]?.color || activeColors[i % activeColors.length];
                            return (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <SimpleColorPicker
                                        color={color}
                                        onChange={val => setField('seriesConfig', {
                                            ...seriesConfig, [key]: { ...seriesConfig[key], color: val }
                                        })}
                                    />
                                    <span style={{
                                        fontSize: '10px', color: 'var(--text-secondary)',
                                        textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                                    }} title={key}>{key}</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <>
                        {(seriesKeys || []).map((key, i) => {
                            const cfg = seriesConfig[key] || {};
                            const currentColor = cfg.color || activeColors[i % activeColors.length];
                            const currentStyle = cfg.style || 'solid';

                            return (
                                <div key={key} style={{ marginBottom: '8px' }}>
                                    <label style={{
                                        display: 'block', fontSize: '10px', color: 'var(--text-secondary)',
                                        marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}>{key}</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <SimpleColorPicker
                                            color={currentColor}
                                            onChange={val => setField('seriesConfig', {
                                                ...seriesConfig, [key]: { ...seriesConfig[key], color: val }
                                            })}
                                        />
                                        {(chartType === 'line' || chartType === 'combo') && (
                                            <select
                                                value={currentStyle}
                                                onChange={e => setField('seriesConfig', {
                                                    ...seriesConfig, [key]: { ...seriesConfig[key], style: e.target.value }
                                                })}
                                                style={{
                                                    flex: 1, backgroundColor: 'var(--input-bg)',
                                                    color: 'var(--text-active)', border: '1px solid var(--border-color)',
                                                    fontSize: '10px', borderRadius: '3px',
                                                }}
                                            >
                                                <option value="solid">Solid</option>
                                                <option value="dashed">Dashed</option>
                                                <option value="dotted">Dotted</option>
                                            </select>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </Section>

            {/* ── Background Tone ── */}
            <Section title="Background">
                <SelectField
                    label="Canvas Tone"
                    value={backgroundTone}
                    onChange={v => setField('backgroundTone', v)}
                    options={BACKGROUND_TONES}
                    style={{ marginBottom: '8px' }}
                />
                {backgroundTone === 'custom' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <SimpleColorPicker
                            color={customBgColor || '#1e1f22'}
                            onChange={v => setField('customBgColor', v)}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Custom Background</span>
                    </div>
                )}
            </Section>

            {/* ── Font & Text ── */}
            <Section title="Typography">
                <SelectField
                    label="Font Family"
                    value={fontFamily}
                    onChange={v => setField('fontFamily', v)}
                    options={FONT_OPTIONS}
                    style={{ marginBottom: '8px' }}
                />
                <SliderField
                    label="Text Size Scale"
                    value={textScale * 100}
                    min={75} max={200}
                    onChange={v => setField('textScale', v / 100)}
                    suffix="%"
                />
            </Section>

            {/* ── Border ── */}
            <Section title="Border">
                <SelectField
                    label="Border Style"
                    value={borderStyle}
                    onChange={v => setField('borderStyle', v)}
                    style={{ marginBottom: '8px' }}
                >
                    <option value="none">None</option>
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="subtle">Subtle</option>
                </SelectField>
                {borderStyle !== 'none' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <SimpleColorPicker
                            color={borderColor || 'var(--border-color)'}
                            onChange={v => setField('borderColor', v)}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Border Color</span>
                    </div>
                )}
            </Section>
        </>
    );
});

ThemePanel.displayName = 'ThemePanel';

export default ThemePanel;
