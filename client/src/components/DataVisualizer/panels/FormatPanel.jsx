/**
 * FormatPanel — «Make it readable».
 *
 * De lo que se lee primero a los detalles:
 *   1. Numbers            cómo se escriben las cifras (en ejes, etiquetas, tooltip y KPI).
 *   2. Value axis         escala, cero, mínimo y máximo; el eje derecho.
 *   3. Axis titles & labels
 *   4. Grid & legend      rejilla, líneas de eje, leyenda (y leyenda interactiva).
 *   5. Labels & tooltip   cifras sobre las marcas y lo que dice el tooltip.
 *   6. Marks              lo propio de cada tipo (líneas, barras, anillo…).
 *   7. Interaction        acercar y mover.
 * La composición de la tarjeta vive en Style (es de la tarjeta, no de la figura).
 * Antes había márgenes y «Hide if space <»: eran del dibujo anterior y no hacían nada.
 */
import { memo } from 'react';
import { Section, Toggle, SelectField, InputField, SliderField, panelStyles } from './shared';
import { NUMBER_FORMAT_OPTIONS } from '../constants';
import { capacidades } from './capacidades';

const Dominio = ({ etiqueta, valor, onChange }) => (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
        <InputField label={`${etiqueta} min`} type="number" placeholder="Auto" value={valor[0] === 'auto' ? '' : valor[0]}
            onChange={v => onChange([v === '' ? 'auto' : v, valor[1]])} style={{ flex: 1 }} />
        <InputField label={`${etiqueta} max`} type="number" placeholder="Auto" value={valor[1] === 'auto' ? '' : valor[1]}
            onChange={v => onChange([valor[0], v === '' ? 'auto' : v])} style={{ flex: 1 }} />
    </div>
);

const FormatPanel = memo(({ state, setField, finalSeriesKeys, columns: columnas = [] }) => {
    const {
        chartType, numberFormat, decimalPlaces, yLogScale, yScaleType, zeroBaseline, yAxisDomain = ['auto', 'auto'],
        rightYAxisKey, rightYAxisDomain = ['auto', 'auto'], showXAxisTitle, showYAxisTitle, customAxisTitles = { x: '', y: '' },
        xAxisLabelAngle, axisLabelOpacity = 0.8, axisLabelSize = 11, axisLabelGap = 5, axisLabelMaxChars = 0,
        gridMode, showAxisLines, legendPosition, interactiveLegend, splitByKey, yAxisKeys = [],
        showLabels, dataLabelPosition, tooltipShowPercent, tooltipMode, tooltipFields = [],
        lineType, lineAreaFill, showDots, barStackMode, barRadius, barColorMode,
        donutThickness, donutLabelContent, donutLabelPosition, donutCenterKpi, scatterQuadrants, comboLineKeys, zoomMode,
    } = state;
    const cap = capacidades(chartType);
    const escala = yScaleType && yScaleType !== 'linear' ? yScaleType : (yLogScale ? 'log' : 'linear');
    const hayLeyenda = !!splitByKey || yAxisKeys.length > 1 || cap.anillo;

    const lineasCombo = comboLineKeys?.length ? comboLineKeys : (finalSeriesKeys || []).slice(-1);
    const alternarCombo = (key) => {
        const set = new Set(lineasCombo);
        if (set.has(key)) set.delete(key); else set.add(key);
        setField('comboLineKeys', [...set]);
    };
    const alternarCampo = (k) => setField('tooltipFields', tooltipFields.includes(k) ? tooltipFields.filter(x => x !== k) : [...tooltipFields, k]);

    return (
        <>
            {/* ── 1. Numbers ── */}
            <Section title="Numbers">
                <div style={{ display: 'flex', gap: '8px' }}>
                    <SelectField label="Format" value={numberFormat} onChange={v => setField('numberFormat', v)} options={NUMBER_FORMAT_OPTIONS} style={{ flex: 2 }} />
                    <SelectField label="Decimals" value={decimalPlaces} onChange={v => setField('decimalPlaces', Number(v))} style={{ flex: 1 }}>
                        <option value={-1}>Auto</option>
                        {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                    </SelectField>
                </div>
            </Section>

            {/* ── 2. Value axis ── */}
            {cap.escala && (
                <Section title={cap.horizontal ? 'Value axis (horizontal)' : 'Value axis'}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <SelectField label="Scale" value={escala} onChange={v => { setField('yScaleType', v); setField('yLogScale', v === 'log'); }} style={{ flex: 1 }}>
                            <option value="linear">Linear</option>
                            <option value="log">Logarithmic</option>
                            <option value="sqrt">Square root</option>
                        </SelectField>
                        <SelectField label="Start at zero" value={zeroBaseline || 'auto'} onChange={v => setField('zeroBaseline', v)} style={{ flex: 1 }}>
                            <option value="auto">Automatic</option>
                            <option value="on">Always</option>
                            <option value="off">Never</option>
                        </SelectField>
                    </div>
                    <Dominio etiqueta="" valor={yAxisDomain} onChange={v => setField('yAxisDomain', v)} />
                    {rightYAxisKey && (
                        <>
                            <label style={panelStyles.labelSmall}>Right axis ({rightYAxisKey})</label>
                            <Dominio etiqueta="" valor={rightYAxisDomain} onChange={v => setField('rightYAxisDomain', v)} />
                        </>
                    )}
                </Section>
            )}

            {/* ── 3. Axis titles & labels ── */}
            {cap.ejes && (
                <Section title="Axis titles & labels">
                    {[['x', 'Category axis title', showXAxisTitle, 'showXAxisTitle', state.xAxisKey], ['y', 'Value axis title', showYAxisTitle, 'showYAxisTitle', yAxisKeys.join(', ')]].map(([eje, rotulo, visible, clave, defecto]) => (
                        <div key={eje} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <label style={panelStyles.labelSmall}>{rotulo}</label>
                                <Toggle label="Show" checked={!!visible} onChange={v => setField(clave, v)} />
                            </div>
                            <input type="text" placeholder={defecto} value={customAxisTitles[eje] || ''} disabled={!visible}
                                onChange={e => setField('customAxisTitles', { ...customAxisTitles, [eje]: e.target.value })}
                                style={{ ...panelStyles.input, opacity: visible ? 1 : 0.4 }} />
                        </div>
                    ))}
                    {!cap.horizontal && !cap.orientable && (
                        <SelectField label="Category label rotation" value={xAxisLabelAngle} onChange={v => setField('xAxisLabelAngle', Number(v))} style={{ marginBottom: '8px' }}>
                            <option value={0}>0° (horizontal)</option>
                            <option value={45}>45°</option>
                            <option value={90}>90° (vertical)</option>
                        </SelectField>
                    )}
                    <SliderField label="Label size" value={axisLabelSize} min={8} max={24} onChange={v => setField('axisLabelSize', v)} suffix="px" />
                    <SliderField label={axisLabelMaxChars === 0 ? 'Max label length (auto)' : 'Max label length'} value={axisLabelMaxChars} min={0} max={40}
                        onChange={v => setField('axisLabelMaxChars', v)} suffix={axisLabelMaxChars === 0 ? '' : ' chars'} />
                    <SliderField label="Gap from axis" value={axisLabelGap} min={0} max={30} onChange={v => setField('axisLabelGap', v)} suffix="px" />
                    <SliderField label="Label intensity" value={Math.round(axisLabelOpacity * 100)} min={20} max={100} onChange={v => setField('axisLabelOpacity', v / 100)} suffix="%" />
                </Section>
            )}

            {/* ── 4. Grid & legend ── */}
            <Section title={cap.ejes ? 'Grid & legend' : 'Legend'}>
                {cap.ejes && (
                    <>
                        <SelectField label="Grid lines" value={gridMode} onChange={v => setField('gridMode', v)} style={{ marginBottom: '8px' }}>
                            <option value="both">Horizontal & vertical</option>
                            <option value="horizontal">Horizontal only</option>
                            <option value="vertical">Vertical only</option>
                            <option value="none">None</option>
                        </SelectField>
                        <Toggle label="Axis lines" checked={showAxisLines} onChange={v => setField('showAxisLines', v)} />
                    </>
                )}
                <SelectField label="Legend" value={legendPosition} onChange={v => setField('legendPosition', v)} style={{ marginTop: '6px' }}>
                    <option value="inline">In the subtitle</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="none">Hidden</option>
                </SelectField>
                {hayLeyenda && ['top', 'bottom', 'left', 'right'].includes(legendPosition) && !cap.anillo && (
                    <div style={{ marginTop: '6px' }}>
                        <Toggle label="Click the legend to highlight a series" checked={!!interactiveLegend} onChange={v => setField('interactiveLegend', v)} />
                    </div>
                )}
            </Section>

            {/* ── 5. Labels & tooltip ── */}
            <Section title="Labels & tooltip">
                {cap.etiquetas && (
                    <Toggle label="Values on the marks" checked={showLabels} onChange={v => setField('showLabels', v)} />
                )}
                {showLabels && cap.barra && (
                    <SelectField label="Label position" value={String(dataLabelPosition).startsWith('inside') ? 'inside-end' : 'outside'} onChange={v => setField('dataLabelPosition', v)} style={{ marginBottom: '6px' }}>
                        <option value="outside">Outside the bar</option>
                        <option value="inside-end">Inside the bar</option>
                    </SelectField>
                )}
                {showLabels && cap.anillo && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                        <SelectField label="Content" value={donutLabelContent} onChange={v => setField('donutLabelContent', v)} style={{ flex: 1 }}>
                            <option value="percent">Percentage</option>
                            <option value="value">Value</option>
                            <option value="name">Name</option>
                            <option value="name_percent">Name + %</option>
                            <option value="name_value">Name + value</option>
                        </SelectField>
                        <SelectField label="Position" value={donutLabelPosition} onChange={v => setField('donutLabelPosition', v)} style={{ flex: 1 }}>
                            <option value="outside">Outside</option>
                            <option value="inside">Inside</option>
                        </SelectField>
                    </div>
                )}
                {showLabels && cap.etiquetas && !cap.anillo && (
                    <SliderField label="Label size" value={state.dataLabelSize || 11} min={8} max={20} onChange={v => setField('dataLabelSize', v)} suffix="px" />
                )}
                {cap.suma && (
                    <SelectField label="Tooltip" value={tooltipMode === 'rich' ? 'rich' : (tooltipShowPercent ? 'percent' : 'standard')}
                        onChange={v => { setField('tooltipMode', v === 'rich' ? 'rich' : 'standard'); setField('tooltipShowPercent', v === 'percent'); }}
                        style={{ margin: '6px 0' }}>
                        <option value="standard">Value</option>
                        <option value="percent">Value + % of total</option>
                        <option value="rich">Value + change vs previous</option>
                    </SelectField>
                )}
                {cap.tooltipExtra && columnas.length > 0 && (
                    <div>
                        <label style={panelStyles.labelSmall}>Also show in the tooltip{cap.suma ? ' (numbers are added up)' : ''}</label>
                        <div style={{ maxHeight: '110px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', backgroundColor: 'var(--input-bg)' }}>
                            {columnas.filter(k => k !== state.xAxisKey && !yAxisKeys.includes(k) && k !== splitByKey).map(k => (
                                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={tooltipFields.includes(k)} onChange={() => alternarCampo(k)} style={{ accentColor: 'var(--accent-primary)' }} />
                                    {k}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </Section>

            {/* ── 6. Marks ── */}
            {(cap.linea || cap.combo) && (
                <Section title="Lines">
                    <SelectField label="Shape" value={lineType} onChange={v => setField('lineType', v)} style={{ marginBottom: '8px' }}>
                        <option value="monotone">Smooth</option>
                        <option value="linear">Straight</option>
                        <option value="step">Step</option>
                        <option value="stepBefore">Step before</option>
                        <option value="stepAfter">Step after</option>
                    </SelectField>
                    <Toggle label="Points" checked={showDots} onChange={v => setField('showDots', v)} />
                    {chartType === 'line' && <Toggle label="Fill the area under the line" checked={lineAreaFill} onChange={v => setField('lineAreaFill', v)} />}
                </Section>
            )}
            {cap.barra && (
                <Section title="Bars">
                    <SelectField label="Layout" value={barStackMode} onChange={v => setField('barStackMode', v)} style={{ marginBottom: '8px' }}>
                        <option value="none">Side by side</option>
                        <option value="stack">Stacked</option>
                        <option value="expand">Stacked to 100%</option>
                    </SelectField>
                    {barStackMode === 'none' && !splitByKey && yAxisKeys.length === 1 && (
                        <SelectField label="Color" value={barColorMode} onChange={v => setField('barColorMode', v)} style={{ marginBottom: '8px' }}>
                            <option value="series">One color</option>
                            <option value="dimension">One color per category</option>
                            <option value="intensity">Intensity by value</option>
                        </SelectField>
                    )}
                    <SliderField label="Corner radius" value={barRadius} min={0} max={20} onChange={v => setField('barRadius', v)} suffix="px" />
                </Section>
            )}
            {cap.anillo && (
                <Section title={chartType === 'donut' ? 'Donut' : 'Pie'}>
                    {chartType === 'donut' && (
                        <>
                            <SliderField label="Hole size" value={donutThickness} min={20} max={85} onChange={v => setField('donutThickness', v)} suffix="%" />
                            <SelectField label="In the center" value={donutCenterKpi} onChange={v => setField('donutCenterKpi', v)}>
                                <option value="none">Nothing</option>
                                <option value="total">Total</option>
                                <option value="average">Average</option>
                            </SelectField>
                        </>
                    )}
                </Section>
            )}
            {cap.dispersion && (
                <Section title="Scatter">
                    <Toggle label="Quadrants (mean of each axis)" checked={scatterQuadrants} onChange={v => setField('scatterQuadrants', v)} />
                </Section>
            )}
            {cap.combo && (
                <Section title="Combo">
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>Which series are lines — the rest are bars.</div>
                    {(finalSeriesKeys || []).length < 2 && <div style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>Pick at least 2 values in Data.</div>}
                    {(finalSeriesKeys || []).map(key => (
                        <Toggle key={key} label={key} checked={lineasCombo.includes(key)} onChange={() => alternarCombo(key)} />
                    ))}
                </Section>
            )}

            {/* ── 7. Interaction ── */}
            {cap.zoom && (
                <Section title="Interaction">
                    <SelectField label="Zoom and pan (wheel and drag)" value={zoomMode || 'auto'} onChange={v => setField('zoomMode', v)}>
                        <option value="auto">Automatic (scatter and long series)</option>
                        <option value="on">Always</option>
                        <option value="off">Never</option>
                    </SelectField>
                </Section>
            )}
        </>
    );
});

FormatPanel.displayName = 'FormatPanel';

export default FormatPanel;
