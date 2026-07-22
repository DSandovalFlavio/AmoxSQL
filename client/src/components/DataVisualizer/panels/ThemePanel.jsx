/**
 * ThemePanel — Color palette, background tonal adjustments, font, text size, border.
 * Tab: "Theme" — "How does it look?"
 */
import { memo } from 'react';
import { Section, Toggle, SelectField, SliderField, SimpleColorPicker, panelStyles } from './shared';
import { COLOR_PALETTES, FONT_OPTIONS, BACKGROUND_TONES } from '../constants';

const PalettePreview = memo(({ colors, isActive, onClick }) => (
    <div
        onClick={onClick}
        style={{
            display: 'flex', gap: '2px', padding: '4px 6px',
            cursor: 'pointer', borderRadius: '5px',
            border: isActive ? '2px solid var(--accent-color-user)' : '1px solid var(--border-color)',
            background: isActive ? 'var(--accent-subtle)' : 'transparent',
            transition: 'all 0.15s',
        }}
        className={isActive ? '' : 'dv-palette-preview'}
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
        fontFamily, textScale, seriesConfig, chartType, axisLabelOpacity = 0.8,
        fillStyle = 'gradient', cardStyle = {} } = state;

    const isDonut = chartType === 'donut';

    // Group palettes by category for display
    const paletteGroups = [
        { label: 'Modern', keys: ['default', 'vivid', 'neon'] },
        { label: 'Qualitative', keys: ['set1', 'set2', 'pastel', 'dark2'] },
        { label: 'Sequential', keys: ['blues', 'greens', 'reds', 'purples', 'ylorbr'] },
        { label: 'Diverging', keys: ['spectral', 'rdylbu', 'rdylgn', 'piyg'] },
        { label: 'Brand', keys: ['ocean', 'sunset', 'corporate'] },
        // Editorial palette system from Sterling (MIT) © La Matemaga —
        // https://github.com/LaMatemaga/sterling
        {
            label: 'Sterling · by La Matemaga',
            title: 'Editorial palette system from Sterling, by La Matemaga (MIT). Categoricals calibrated for light and dark surfaces; diverging reads violet=positive, teal=negative.',
            keys: ['sterling', 'sterlingDark', 'sterlingSequential', 'sterlingDiverging', 'sterlingHeat'],
        },
    ];

    return (
        <>
            {/* ── Color Palette ── */}
            <Section title="Color Palette">
                <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {paletteGroups.map(group => (
                        <div key={group.label} style={{ marginBottom: '8px' }}>
                            <span
                                title={group.title}
                                style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.3px' }}
                            >
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
                                        swatches={activeColors}
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
                                            swatches={activeColors}
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
                            color={customBgColor || 'var(--surface-base)'}
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
                <SliderField
                    label="Label Intensity"
                    value={Math.round(axisLabelOpacity * 100)}
                    min={20} max={100}
                    onChange={v => setField('axisLabelOpacity', v / 100)}
                    suffix="%"
                />
            </Section>

            {/* ── Fill ── */}
            {(chartType === 'line' || chartType === 'area') && (
                <Section title="Fill">
                    <SelectField
                        label="Area Fill"
                        value={fillStyle}
                        onChange={v => setField('fillStyle', v)}
                    >
                        <option value="gradient">Gradient (fade out)</option>
                        <option value="solid">Solid</option>
                    </SelectField>
                </Section>
            )}

            {/* ── Card ── */}
            <Section title="Card">
                <Toggle label="Drop shadow" checked={!!cardStyle.shadow}
                    onChange={v => setField('cardStyle', { ...cardStyle, shadow: v })} />
                <SliderField
                    label="Corner Radius"
                    value={cardStyle.radius ?? 8}
                    min={0} max={28}
                    onChange={v => setField('cardStyle', { ...cardStyle, radius: v })}
                    suffix="px"
                />
                <Toggle label="Gradient background" checked={!!cardStyle.gradient}
                    onChange={v => setField('cardStyle', { ...cardStyle, gradient: v })} />
                {cardStyle.gradient && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                        <SimpleColorPicker
                            color={cardStyle.gradientFrom || '#1e1f29'}
                            onChange={v => setField('cardStyle', { ...cardStyle, gradientFrom: v })}
                        />
                        <SimpleColorPicker
                            color={cardStyle.gradientTo || '#0f1015'}
                            onChange={v => setField('cardStyle', { ...cardStyle, gradientTo: v })}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>From → To</span>
                    </div>
                )}
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
