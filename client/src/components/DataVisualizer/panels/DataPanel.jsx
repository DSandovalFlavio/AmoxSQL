/**
 * DataPanel — «What goes where?»
 *
 * En el orden en que se piensa una figura:
 *   1. Columns       qué columna va en cada canal (X, Y, color, tamaño, eje derecho, banda).
 *   2. Shape the data cómo se agrupan, acumulan, ordenan y recortan las filas.
 *   3. Small multiples la misma figura repetida por cada valor de una columna.
 *   4. Lo propio del tipo (cubos del histograma, orientación, porciones pequeñas).
 * Qué se enseña lo decide `capacidades.js`.
 */
import { memo } from 'react';
import { Section, SelectField, InputField, Toggle, panelStyles } from './shared';
import { capacidades } from './capacidades';

const opciones = (columns, vacio) => (
    <>
        {vacio && <option value="">{vacio}</option>}
        {columns.map(col => <option key={col} value={col}>{col}</option>)}
    </>
);

const DataPanel = memo(({ state, columns, isDateColumn, setField, onYAxisChange }) => {
    const { chartType, xAxisKey, yAxisKeys, rightYAxisKey, splitByKey, bubbleSizeKey,
        dateAggregation, sortMode, limit, isCumulative, binCount, histogramStats = [],
        errorLowKey, errorHighKey, bandLowKey, bandHighKey, orientation,
        facetKey, facetColumns } = state;
    const cap = capacidades(chartType);

    const alternarStat = (op) => setField('histogramStats', histogramStats.includes(op) ? histogramStats.filter(s => s !== op) : [...histogramStats, op]);

    let xLabel = 'Category (X)';
    let yLabel = 'Values (Y)';
    if (cap.anillo || cap.treemap) { xLabel = 'Segment'; yLabel = 'Size'; }
    if (cap.histograma || cap.densidad) xLabel = 'Value (a number)';
    if (cap.dispersion) { xLabel = 'Horizontal (X)'; yLabel = 'Vertical (Y)'; }
    if (cap.bump || cap.pendiente) xLabel = 'Moment (periods)';
    if (cap.unaY) yLabel = 'Value';
    if (cap.mancuerna) yLabel = 'The two values';

    const unaSola = cap.unaY || !!splitByKey;
    const sinY = cap.histograma || cap.densidad;

    return (
        <>
            {/* ── 1. Columns ── */}
            <Section title="Columns">
                <SelectField label={xLabel} value={xAxisKey} onChange={v => setField('xAxisKey', v)} style={{ marginBottom: '10px' }}>
                    {opciones(columns)}
                </SelectField>

                {!sinY && (
                    <div style={{ marginBottom: '10px' }}>
                        <label style={panelStyles.labelSmall}>
                            {yLabel}
                            {splitByKey && !cap.unaY && <span style={{ color: 'var(--accent-color-user)', marginLeft: 5 }}>(one, split by color)</span>}
                        </label>
                        {unaSola ? (
                            <select value={yAxisKeys[0] || ''} onChange={e => setField('yAxisKeys', [e.target.value])} style={panelStyles.select}>
                                {opciones(columns)}
                            </select>
                        ) : (
                            <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', backgroundColor: 'var(--input-bg)' }}>
                                {columns.map(col => (
                                    <label key={col} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 6px', cursor: 'pointer', fontSize: '11px', color: yAxisKeys.includes(col) ? 'var(--text-active)' : 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={yAxisKeys.includes(col)} onChange={() => onYAxisChange(col)}
                                            disabled={yAxisKeys.length === 1 && yAxisKeys.includes(col)} style={{ accentColor: 'var(--accent-primary)' }} />
                                        {col}
                                    </label>
                                ))}
                            </div>
                        )}
                        {cap.mancuerna && yAxisKeys.length !== 2 && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Pick exactly two values: the dumbbell joins them.</div>
                        )}
                    </div>
                )}

                {cap.intervalo && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <SelectField label="Interval low" value={errorLowKey} onChange={v => setField('errorLowKey', v)} style={{ flex: 1 }}>{opciones(columns, '(None)')}</SelectField>
                        <SelectField label="Interval high" value={errorHighKey} onChange={v => setField('errorHighKey', v)} style={{ flex: 1 }}>{opciones(columns, '(None)')}</SelectField>
                    </div>
                )}

                {cap.partir && (
                    <SelectField label={cap.densidad ? 'One curve per' : 'Color by (split into series)'} value={splitByKey} onChange={v => setField('splitByKey', v)} style={{ marginBottom: '8px' }}>
                        {opciones(columns, '(None)')}
                    </SelectField>
                )}

                {cap.tamano && (
                    <SelectField label="Size by" value={bubbleSizeKey} onChange={v => setField('bubbleSizeKey', v)} style={{ marginBottom: '8px' }}>
                        {opciones(columns, '(Uniform size)')}
                    </SelectField>
                )}

                {cap.derecha && yAxisKeys.length > 1 && !splitByKey && (
                    <SelectField label="Right axis (its own scale)" value={rightYAxisKey} onChange={v => setField('rightYAxisKey', v)} style={{ marginBottom: '8px' }}>
                        <option value="">(None)</option>
                        {yAxisKeys.map(col => <option key={col} value={col}>{col}</option>)}
                    </SelectField>
                )}

                {cap.banda && !splitByKey && yAxisKeys.length === 1 && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <SelectField label="Band low" value={bandLowKey} onChange={v => setField('bandLowKey', v)} style={{ flex: 1 }}>{opciones(columns, '(None)')}</SelectField>
                        <SelectField label="Band high" value={bandHighKey} onChange={v => setField('bandHighKey', v)} style={{ flex: 1 }}>{opciones(columns, '(None)')}</SelectField>
                    </div>
                )}
            </Section>

            {/* ── 2. Shape the data ── */}
            {(isDateColumn || cap.acumulado || !sinY) && (
                <Section title="Shape the data">
                    {isDateColumn && !sinY && (
                        <SelectField label="Group dates by" value={dateAggregation} onChange={v => setField('dateAggregation', v)} style={{ marginBottom: '8px' }}>
                            <option value="none">Exact date</option>
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="quarter">Quarter</option>
                            <option value="year">Year</option>
                        </SelectField>
                    )}
                    {cap.acumulado && (
                        <Toggle label="Running total (cumulative)" checked={isCumulative} onChange={v => setField('isCumulative', v)} />
                    )}
                    {!sinY && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                            <SelectField label="Sort by" value={sortMode} onChange={v => setField('sortMode', v)} style={{ flex: 2 }}>
                                <option value="x-asc">Label A → Z</option>
                                <option value="x-desc">Label Z → A</option>
                                <option value="y-desc">Value, largest first</option>
                                <option value="y-asc">Value, smallest first</option>
                                <option value="natural">As the query returns it</option>
                            </SelectField>
                            {cap.ranking && (
                                <InputField label="Top" type="number" value={limit === 0 ? '' : limit}
                                    onChange={v => setField('limit', v === '' || isNaN(v) ? 0 : v)} placeholder="All" style={{ flex: 1 }} />
                            )}
                        </div>
                    )}
                </Section>
            )}

            {/* ── 3. Small multiples ── */}
            {cap.facetas && (
                <Section title="Small multiples">
                    <SelectField label="One chart per" value={facetKey} onChange={v => setField('facetKey', v)} style={{ marginBottom: facetKey ? '8px' : 0 }}>
                        {opciones(columns.filter(c => c !== xAxisKey), '(None)')}
                    </SelectField>
                    {facetKey && (
                        <InputField label="Charts per row" type="number" min={1} max={8} value={facetColumns}
                            onChange={v => setField('facetColumns', Math.max(1, Math.min(8, Number(v) || 3)))} />
                    )}
                </Section>
            )}

            {/* ── 4. Lo propio del tipo ── */}
            {cap.histograma && (
                <Section title="Histogram">
                    <InputField label="Bins (at most)" type="number" min={2} max={200}
                        value={binCount} onChange={v => setField('binCount', v === '' || isNaN(v) ? 20 : v)} style={{ marginBottom: '8px' }} />
                    <Toggle label="Mark the mean" checked={histogramStats.includes('mean')} onChange={() => alternarStat('mean')} />
                    <Toggle label="Mark the median" checked={histogramStats.includes('median')} onChange={() => alternarStat('median')} />
                </Section>
            )}
            {cap.orientable && (
                <Section title="Orientation">
                    <SelectField value={orientation} onChange={v => setField('orientation', v)}>
                        <option value="horizontal">Categories on the left</option>
                        <option value="vertical">Categories along the bottom</option>
                    </SelectField>
                </Section>
            )}
            {cap.anillo && (
                <Section title="Small slices">
                    <InputField label="Group slices under (%) into «Others»" type="number" min={0} max={100}
                        value={state.donutGroupingThreshold} onChange={v => setField('donutGroupingThreshold', v)} />
                </Section>
            )}
        </>
    );
});

DataPanel.displayName = 'DataPanel';

export default DataPanel;
