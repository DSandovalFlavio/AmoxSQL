/**
 * AxisPanel — Axis configuration, number format, scale, titles, rotation.
 * Tab: "Axes" — "Configure the scales"
 */
import { memo } from 'react';
import { Section, Toggle, SelectField, InputField, SliderField, panelStyles } from './shared';
import { NUMBER_FORMAT_OPTIONS } from '../constants';

const AxisPanel = memo(({ state, setField, defaultXLabel, defaultYLabel }) => {
    const { chartType, numberFormat, decimalPlaces, showAxisLines, yLogScale,
        yAxisDomain, rightYAxisKey, rightYAxisDomain = ['auto', 'auto'],
        showXAxisTitle, showYAxisTitle,
        customAxisTitles, xAxisLabelAngle, gridMode,
        axisLabelOpacity = 1, axisLabelSize = 11, axisLabelGap = 5, axisLabelMaxChars = 0 } = state;

    const isHorizontal = chartType.startsWith('bar-horizontal');
    const isDonut = chartType === 'donut';
    const isCartesian = !isDonut;

    if (!isCartesian) return null;

    return (
        <>
            {/* ── Number Format ── */}
            <Section title="Number Format">
                <SelectField
                    label="Abbreviation"
                    value={numberFormat}
                    onChange={v => setField('numberFormat', v)}
                    options={NUMBER_FORMAT_OPTIONS}
                    style={{ marginBottom: '8px' }}
                />
                <SelectField
                    label="Decimal Places"
                    value={decimalPlaces}
                    onChange={v => setField('decimalPlaces', Number(v))}
                    style={{ marginBottom: '8px' }}
                >
                    <option value={-1}>Auto</option>
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                </SelectField>
            </Section>

            {/* ── Axis Labels ── */}
            <Section title="Axis Labels">
                <SliderField
                    label="Label Size"
                    value={axisLabelSize}
                    min={8} max={24}
                    onChange={v => setField('axisLabelSize', v)}
                    suffix="px"
                />
                <SliderField
                    label="Label Intensity"
                    value={Math.round(axisLabelOpacity * 100)}
                    min={20} max={100}
                    onChange={v => setField('axisLabelOpacity', v / 100)}
                    suffix="%"
                />
                <SliderField
                    label="Gap from Axis"
                    value={axisLabelGap}
                    min={0} max={30}
                    onChange={v => setField('axisLabelGap', v)}
                    suffix="px"
                />
                <SliderField
                    label={axisLabelMaxChars === 0 ? 'Max Length (auto)' : 'Max Length'}
                    value={axisLabelMaxChars}
                    min={0} max={40}
                    onChange={v => setField('axisLabelMaxChars', v)}
                    suffix={axisLabelMaxChars === 0 ? '' : ' chars'}
                />
                {(chartType === 'line' || chartType === 'bar' || chartType === 'area' || chartType === 'combo' || chartType === 'waterfall') && (
                    <SelectField
                        label="Label Rotation"
                        value={xAxisLabelAngle}
                        onChange={v => setField('xAxisLabelAngle', Number(v))}
                        style={{ marginTop: '4px' }}
                    >
                        <option value={0}>0° (Horizontal)</option>
                        <option value={45}>45°</option>
                        <option value={90}>90° (Vertical)</option>
                    </SelectField>
                )}
            </Section>

            {/* ── Vertical Axis ── */}
            <Section title={isHorizontal ? 'Horizontal Axis (Values)' : 'Vertical Axis (Y)'}>
                <Toggle label="Logarithmic Scale" checked={yLogScale}
                    onChange={v => setField('yLogScale', v)} />

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px', marginBottom: '8px' }}>
                    <InputField
                        label={isHorizontal ? 'Min Value' : 'Y Min'}
                        type="number"
                        placeholder="Auto"
                        value={yAxisDomain[0] === 'auto' ? '' : yAxisDomain[0]}
                        onChange={v => setField('yAxisDomain', [v === '' ? 'auto' : v, yAxisDomain[1]])}
                        style={{ flex: 1 }}
                    />
                    <InputField
                        label={isHorizontal ? 'Max Value' : 'Y Max'}
                        type="number"
                        placeholder="Auto"
                        value={yAxisDomain[1] === 'auto' ? '' : yAxisDomain[1]}
                        onChange={v => setField('yAxisDomain', [yAxisDomain[0], v === '' ? 'auto' : v])}
                        style={{ flex: 1 }}
                    />
                </div>
            </Section>

            {/* ── Secondary Axis (Right) ── */}
            {rightYAxisKey && (
                <Section title="Secondary Axis (Right)">
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <InputField
                            label="Min" type="number" placeholder="Auto"
                            value={rightYAxisDomain[0] === 'auto' ? '' : rightYAxisDomain[0]}
                            onChange={v => setField('rightYAxisDomain', [v === '' ? 'auto' : v, rightYAxisDomain[1]])}
                            style={{ flex: 1 }}
                        />
                        <InputField
                            label="Max" type="number" placeholder="Auto"
                            value={rightYAxisDomain[1] === 'auto' ? '' : rightYAxisDomain[1]}
                            onChange={v => setField('rightYAxisDomain', [rightYAxisDomain[0], v === '' ? 'auto' : v])}
                            style={{ flex: 1 }}
                        />
                    </div>
                </Section>
            )}

            {/* ── Axis Titles ── */}
            <Section title="Axis Titles">
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={panelStyles.labelSmall}>
                            Category Axis Title
                        </label>
                        <Toggle label="Show" checked={showXAxisTitle}
                            onChange={v => setField('showXAxisTitle', v)} />
                    </div>
                    <input
                        type="text" placeholder={defaultXLabel}
                        value={customAxisTitles.x}
                        onChange={e => setField('customAxisTitles', { ...customAxisTitles, x: e.target.value })}
                        style={{ ...panelStyles.input, opacity: showXAxisTitle ? 1 : 0.4 }}
                        disabled={!showXAxisTitle}
                    />
                </div>
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label style={panelStyles.labelSmall}>
                            Value Axis Title
                        </label>
                        <Toggle label="Show" checked={showYAxisTitle}
                            onChange={v => setField('showYAxisTitle', v)} />
                    </div>
                    <input
                        type="text" placeholder={defaultYLabel}
                        value={customAxisTitles.y}
                        onChange={e => setField('customAxisTitles', { ...customAxisTitles, y: e.target.value })}
                        style={{ ...panelStyles.input, opacity: showYAxisTitle ? 1 : 0.4 }}
                        disabled={!showYAxisTitle}
                    />
                </div>

            </Section>
        </>
    );
});

AxisPanel.displayName = 'AxisPanel';

export default AxisPanel;
