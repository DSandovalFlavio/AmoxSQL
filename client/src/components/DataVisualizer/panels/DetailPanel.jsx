/**
 * DetailPanel — Data labels, percentages, grid lines, and chart-specific detail settings.
 * Tab: "Detail" — "Fine-tune the data display"
 */
import { memo } from 'react';
import { Section, Toggle, SelectField, SliderField, SimpleColorPicker, panelStyles } from './shared';

const DetailPanel = memo(({ state, setField, finalSeriesKeys, showHighlight = true }) => {
    const { chartType, showLabels, dataLabelPosition, tooltipShowPercent, tooltipMode,
        gridMode, showAxisLines, legendPosition,
        // Line specific
        lineType, lineAreaFill, showDots, isCumulative,
        // Bar specific
        barStackMode, barRadius, barColorMode,
        // Donut specific
        donutThickness, donutLabelContent, donutLabelPosition, donutCenterKpi,
        // Scatter specific
        scatterQuadrants,
        // Combo specific
        comboLineKeys,
        // Highlight
        highlightConfig,
    } = state;

    const isLine = chartType === 'line' || chartType === 'area';
    const isBar = chartType === 'bar' || chartType.startsWith('bar-horizontal') || chartType === 'bar-stacked' || chartType === 'bar-100' || chartType === 'bar-horizontal-stacked' || chartType === 'bar-horizontal-100';
    const isDonut = chartType === 'donut';
    const isScatter = chartType === 'scatter' || chartType === 'bubble';
    const isCombo = chartType === 'combo';

    // Effective combo line set: explicit selection, or auto (2nd series onward)
    const effectiveComboLines = (comboLineKeys && comboLineKeys.length > 0)
        ? comboLineKeys
        : (finalSeriesKeys || []).slice(1);
    const toggleComboLine = (key) => {
        const set = new Set(effectiveComboLines);
        if (set.has(key)) set.delete(key); else set.add(key);
        setField('comboLineKeys', Array.from(set));
    };

    return (
        <>
            {/* ── Labels & Annotations ── */}
            <Section title="Data Labels">
                <Toggle label="Show Data Labels" checked={showLabels}
                    onChange={v => setField('showLabels', v)} />
                {tooltipMode !== 'rich' && (
                    <Toggle label="Show % of Total in Tooltip" checked={tooltipShowPercent}
                        onChange={v => setField('tooltipShowPercent', v)} />
                )}
                <SelectField
                    label="Tooltip Style"
                    value={tooltipMode}
                    onChange={v => setField('tooltipMode', v)}
                    style={{ marginTop: '6px' }}
                >
                    <option value="standard">Standard</option>
                    <option value="rich">Rich (value + Δ vs previous)</option>
                </SelectField>

                {showLabels && !isDonut && (
                    <SelectField
                        label="Label Position"
                        value={dataLabelPosition}
                        onChange={v => setField('dataLabelPosition', v)}
                        style={{ marginTop: '6px' }}
                    >
                        <option value="outside">Outside</option>
                        <option value="inside-center">Inside Center</option>
                        <option value="inside-start">Inside Start</option>
                        <option value="inside-end">Inside End</option>
                    </SelectField>
                )}

                {showLabels && !isDonut && (
                    <>
                        <SliderField
                            label="Label Size"
                            value={state.dataLabelSize || 11}
                            min={8} max={20}
                            onChange={v => setField('dataLabelSize', v)}
                            suffix="px"
                        />
                        <SliderField
                            label="Hide if space <"
                            value={state.dataLabelMinSpace ?? 30}
                            min={0} max={100}
                            onChange={v => setField('dataLabelMinSpace', v)}
                            suffix="px"
                        />
                    </>
                )}

                {isDonut && showLabels && (
                    <>
                        <SelectField
                            label="Label Content"
                            value={donutLabelContent}
                            onChange={v => setField('donutLabelContent', v)}
                            style={{ marginTop: '6px', marginBottom: '6px' }}
                        >
                            <option value="percent">Percentage Only</option>
                            <option value="value">Value Only</option>
                            <option value="name">Name Only</option>
                            <option value="name_percent">Name + Percentage</option>
                            <option value="name_value">Name + Value</option>
                        </SelectField>
                        <SelectField
                            label="Label Position"
                            value={donutLabelPosition}
                            onChange={v => setField('donutLabelPosition', v)}
                        >
                            <option value="outside">Outside</option>
                            <option value="inside">Inside</option>
                        </SelectField>
                    </>
                )}
            </Section>

            {/* ── Grid & Legend ── */}
            <Section title="Grid & Legend">
                <SelectField
                    label="Grid Lines"
                    value={gridMode}
                    onChange={v => setField('gridMode', v)}
                    style={{ marginBottom: '8px' }}
                >
                    <option value="both">Both (Horizontal & Vertical)</option>
                    <option value="horizontal">Horizontal Only</option>
                    <option value="vertical">Vertical Only</option>
                    <option value="none">None</option>
                </SelectField>

                <Toggle label="Show Axis Lines & Ticks" checked={showAxisLines}
                    onChange={v => setField('showAxisLines', v)} />

                <SelectField
                    label="Legend Position"
                    value={legendPosition}
                    onChange={v => setField('legendPosition', v)}
                    style={{ marginTop: '6px' }}
                >
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="none">Hidden</option>
                </SelectField>
            </Section>

            {/* ── Line-Specific ── */}
            {(isLine || isCombo) && (
                <Section title="Line Options">
                    <SelectField
                        label="Interpolation"
                        value={lineType}
                        onChange={v => setField('lineType', v)}
                        style={{ marginBottom: '8px' }}
                    >
                        <option value="monotone">Smooth (Natural)</option>
                        <option value="linear">Linear (Straight)</option>
                        <option value="step">Step</option>
                        <option value="stepBefore">Step Before</option>
                        <option value="stepAfter">Step After</option>
                    </SelectField>
                    <Toggle label="Fill Area (Area Chart)" checked={lineAreaFill}
                        onChange={v => setField('lineAreaFill', v)} />
                    <Toggle label="Show Points" checked={showDots}
                        onChange={v => setField('showDots', v)} />
                    <Toggle label="Cumulative Sum (Running Total)" checked={isCumulative}
                        onChange={v => setField('isCumulative', v)} />
                </Section>
            )}

            {/* ── Bar-Specific ── */}
            {isBar && (
                <Section title="Bar Options">
                    <SelectField
                        label="Bar Layout"
                        value={barStackMode}
                        onChange={v => setField('barStackMode', v)}
                        style={{ marginBottom: '8px' }}
                    >
                        <option value="none">Grouped (Side-by-side)</option>
                        <option value="stack">Stacked (Absolute)</option>
                        <option value="expand">100% Stacked (Proportional)</option>
                    </SelectField>
                    <SliderField
                        label="Corner Radius"
                        value={barRadius} min={0} max={20}
                        onChange={v => setField('barRadius', v)}
                        suffix="px"
                    />
                    {barStackMode === 'none' && (
                        <SelectField
                            label="Color Mode"
                            value={barColorMode}
                            onChange={v => setField('barColorMode', v)}
                        >
                            <option value="series">By Series (Uniform)</option>
                            <option value="dimension">By Category (Varied)</option>
                            <option value="intensity">Color Intensity by Value</option>
                        </SelectField>
                    )}
                </Section>
            )}

            {/* ── Donut-Specific ── */}
            {isDonut && (
                <Section title="Donut Options">
                    <SliderField
                        label="Inner Radius (Thickness)"
                        value={donutThickness} min={0} max={90}
                        onChange={v => setField('donutThickness', v)}
                    />
                    <SelectField
                        label="Center Metric"
                        value={donutCenterKpi}
                        onChange={v => setField('donutCenterKpi', v)}
                    >
                        <option value="none">None</option>
                        <option value="total">Sum of Values (Total)</option>
                        <option value="average">Average of Values</option>
                    </SelectField>
                </Section>
            )}

            {/* ── Scatter-Specific ── */}
            {isScatter && (
                <Section title="Scatter Options">
                    <Toggle label="Show Automatic Quadrants (Mean Crosshairs)" checked={scatterQuadrants}
                        onChange={v => setField('scatterQuadrants', v)} />
                </Section>
            )}

            {/* ── Combo-Specific ── */}
            {isCombo && (
                <Section title="Combo Options">
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                        Toggle which series render as a line — the rest are bars.
                    </div>
                    {(finalSeriesKeys || []).length < 2 && (
                        <div style={{ fontSize: '9px', color: 'var(--text-disabled)' }}>
                            Add at least 2 series (Values) to mix bars and lines.
                        </div>
                    )}
                    {(finalSeriesKeys || []).map(key => (
                        <Toggle
                            key={key}
                            label={`Line: ${key}`}
                            checked={effectiveComboLines.includes(key)}
                            onChange={() => toggleComboLine(key)}
                        />
                    ))}
                </Section>
            )}

            {/* ── Highlight Rules ── */}
            {showHighlight && (isBar || isLine || isCombo) && (
                <Section title="Highlight Rule">
                    <SelectField
                        value={highlightConfig.type}
                        onChange={v => setField('highlightConfig', { ...highlightConfig, type: v })}
                        style={{ marginBottom: '8px' }}
                    >
                        <option value="none">None</option>
                        <option value="max">Max Value</option>
                        <option value="min">Min Value</option>
                        <option value="exact">Specific Category</option>
                    </SelectField>

                    {highlightConfig.type === 'exact' && (
                        <input
                            type="text" placeholder="Category to highlight..."
                            value={highlightConfig.value}
                            onChange={e => setField('highlightConfig', { ...highlightConfig, value: e.target.value })}
                            style={{ ...panelStyles.input, marginBottom: '8px' }}
                        />
                    )}

                    {highlightConfig.type !== 'none' && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <SimpleColorPicker
                                color={highlightConfig.color}
                                onChange={val => setField('highlightConfig', { ...highlightConfig, color: val })}
                            />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Highlight Color</span>
                        </div>
                    )}
                </Section>
            )}
        </>
    );
});

DetailPanel.displayName = 'DetailPanel';

export default DetailPanel;
