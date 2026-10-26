/**
 * DataPanel — X/Y axis mapping, split-by, date aggregation, sort, limit.
 * Tab: "Data" — "Which data goes where?"
 */
import { memo } from 'react';
import { Section, SelectField, InputField, Toggle, panelStyles } from './shared';
import { LuCalendar, LuGitMerge, LuCircle } from 'react-icons/lu';

const DataPanel = memo(({ state, columns, isDateColumn, setField, onYAxisChange }) => {
    const { chartType, xAxisKey, yAxisKeys, rightYAxisKey, splitByKey, bubbleSizeKey,
        dateAggregation, sortMode, limit } = state;

    /* La tarta comparte renderizador con el anillo, así que sus controles de
       ETIQUETA le aplican igual. Solo el grosor y la cifra del centro son del
       anillo: una tarta no tiene hueco donde ponerlos. */
    const esCircular = chartType === 'donut' || chartType === 'pie';
    const isDonut = esCircular;                  // etiquetas, segmentos, colores por categoría
    const soloAnillo = chartType === 'donut';    // grosor y cifra del centro
    const isScatter = chartType === 'scatter' || chartType === 'bubble';
    const isHorizontal = chartType.startsWith('bar-horizontal');
    // 5.17: distribución e intervalos. El histograma solo necesita UNA columna
    // numérica (la cuenta la hace la figura); caja e intervalo, una sola Y.
    const isHist = chartType === 'histogram';
    const isBox = chartType === 'boxplot';
    const isErr = chartType === 'errorbar';
    const unaSolaY = isBox || isErr;
    const { binCount, histogramStats = [], errorLowKey, errorHighKey, orientation } = state;
    const alternarStat = (op) => setField('histogramStats', histogramStats.includes(op) ? histogramStats.filter(s => s !== op) : [...histogramStats, op]);

    // Field roles are orientation-independent: xAxisKey is ALWAYS the
    // dimension/category and yAxisKeys are ALWAYS the measures. Horizontal
    // vs vertical only swaps which screen axis they render on (handled by the
    // renderer) — so the labels must NOT flip with orientation.
    let xLabel = 'Category';
    let yLabel = 'Values';
    if (isDonut) { xLabel = 'Segment Label'; yLabel = 'Segment Size'; }
    if (isHist) xLabel = 'Value (a number)';
    if (unaSolaY) yLabel = 'Value';

    return (
        <>
            {/* ── Channels ── */}
            <Section title="Channels">
                {/* X-Axis */}
                <div style={{ marginBottom: '10px' }}>
                    <label style={panelStyles.label}>{xLabel}</label>
                    <select
                        value={xAxisKey}
                        onChange={e => setField('xAxisKey', e.target.value)}
                        style={panelStyles.select}
                    >
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </div>

                {/* Y-Axis */}
                {!isHist && (
                <div style={{ marginBottom: '10px' }}>
                    <label style={panelStyles.label}>
                        {yLabel}
                        {splitByKey && (
                            <span style={{ color: 'var(--accent-color-user)', fontStyle: 'italic', marginLeft: 5, fontSize: '10px' }}>
                                (Value to Pivot)
                            </span>
                        )}
                    </label>
                    {(splitByKey || unaSolaY) ? (
                        <select
                            value={yAxisKeys[0] || ''}
                            onChange={e => setField('yAxisKeys', [e.target.value])}
                            style={panelStyles.select}
                        >
                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                    ) : (
                        <div style={{
                            maxHeight: '140px', overflowY: 'auto',
                            border: '1px solid var(--border-color)', padding: '4px',
                            borderRadius: '4px', backgroundColor: 'var(--input-bg)'
                        }}>
                            {columns.map(col => (
                                <label key={col} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '3px 6px', cursor: 'pointer', fontSize: '11px',
                                    color: yAxisKeys.includes(col) ? 'var(--text-active)' : 'var(--text-secondary)',
                                    borderRadius: '3px',
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={yAxisKeys.includes(col)}
                                        onChange={() => onYAxisChange(col)}
                                        disabled={yAxisKeys.length === 1 && yAxisKeys.includes(col)}
                                        style={{ accentColor: 'var(--accent-primary)' }}
                                    />
                                    {col}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
                )}

                {/* Intervalo: de qué columnas salen el mínimo y el máximo */}
                {isErr && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <SelectField label="Interval low" value={errorLowKey} onChange={v => setField('errorLowKey', v)} style={{ flex: 1 }}>
                            <option value="">(None)</option>
                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </SelectField>
                        <SelectField label="Interval high" value={errorHighKey} onChange={v => setField('errorHighKey', v)} style={{ flex: 1 }}>
                            <option value="">(None)</option>
                            {columns.map(col => <option key={col} value={col}>{col}</option>)}
                        </SelectField>
                    </div>
                )}

                {(isBox || isErr) && (
                    <SelectField label="Orientation" value={orientation} onChange={v => setField('orientation', v)} style={{ marginBottom: '8px' }}>
                        <option value="horizontal">Categories on the left</option>
                        <option value="vertical">Categories along the bottom</option>
                    </SelectField>
                )}

                {/* Histograma: cubos y estadísticos */}
                {isHist && (
                    <>
                        <InputField label="Bins (at most)" type="number" min={2} max={200}
                            value={binCount} onChange={v => setField('binCount', v === '' || isNaN(v) ? 20 : v)}
                            style={{ marginBottom: '8px' }} />
                        <Toggle label="Mark the mean" checked={histogramStats.includes('mean')} onChange={() => alternarStat('mean')} />
                        <Toggle label="Mark the median" checked={histogramStats.includes('median')} onChange={() => alternarStat('median')} />
                    </>
                )}

                {/* Secondary Y-Axis (Right) */}
                {yAxisKeys.length > 0 && !splitByKey && !isDonut && !isHorizontal && !isHist && !unaSolaY && (
                    <SelectField
                        label="Secondary Y-Axis (Right)"
                        value={rightYAxisKey}
                        onChange={v => setField('rightYAxisKey', v)}
                        style={{ marginBottom: '8px' }}
                    >
                        <option value="">(None)</option>
                        {yAxisKeys.map(col => <option key={col} value={col}>{col}</option>)}
                    </SelectField>
                )}
            </Section>

            {/* ── Sorting & Limits ── */}
            {!isHist && (
            <Section title="Sort & Limit">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <SelectField
                        label="Sort By"
                        value={sortMode}
                        onChange={v => setField('sortMode', v)}
                        style={{ flex: 2 }}
                    >
                        <option value="x-asc">Label Asc</option>
                        <option value="x-desc">Label Desc</option>
                        <option value="y-desc">Value Desc ↓</option>
                        <option value="y-asc">Value Asc ↑</option>
                    </SelectField>
                    <InputField
                        label="Limit"
                        type="number"
                        value={limit === 0 ? '' : limit}
                        onChange={v => setField('limit', v === '' || isNaN(v) ? 0 : v)}
                        placeholder="All"
                        style={{ flex: 1 }}
                    />
                </div>
            </Section>
            )}

            {/* ── Date Aggregation ── */}
            {isDateColumn && (
                <Section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                        <LuCalendar size={12} style={{ color: 'var(--accent-color-user)' }} />
                        <span style={{ fontSize: '10px', fontWeight: '600', color: 'var(--accent-color-user)', textTransform: 'uppercase' }}>
                            Date Aggregation
                        </span>
                    </div>
                    <select
                        value={dateAggregation}
                        onChange={e => setField('dateAggregation', e.target.value)}
                        style={panelStyles.select}
                    >
                        <option value="none">Raw Data (Daily/Exact)</option>
                        <option value="month">Group by Month</option>
                        <option value="year">Group by Year</option>
                    </select>
                </Section>
            )}

            {/* ── Split By ── */}
            {!isDonut && !unaSolaY && (
                <Section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                        <LuGitMerge size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span style={{ fontSize: '10px', fontWeight: '500', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                            Split By Column
                        </span>
                    </div>
                    <select
                        value={splitByKey}
                        onChange={e => setField('splitByKey', e.target.value)}
                        style={panelStyles.select}
                    >
                        <option value="">(None)</option>
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </Section>
            )}

            {/* ── Bubble Size (Scatter only) ── */}
            {isScatter && (
                <Section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
                        <LuCircle size={12} style={{ color: 'var(--text-tertiary)' }} />
                        <span style={{ fontSize: '10px', fontWeight: '500', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                            Bubble Size
                        </span>
                    </div>
                    <select
                        value={bubbleSizeKey}
                        onChange={e => setField('bubbleSizeKey', e.target.value)}
                        style={panelStyles.select}
                    >
                        <option value="">(Uniform Size)</option>
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                </Section>
            )}

            {/* ── Donut Grouping ── */}
            {isDonut && (
                <Section title="Donut Options">
                    <InputField
                        label="Group Small Slices (%)"
                        type="number"
                        min={0} max={100}
                        value={state.donutGroupingThreshold}
                        onChange={v => setField('donutGroupingThreshold', v)}
                    />
                    <span style={{ fontSize: '9px', color: 'var(--text-disabled)', marginTop: '2px', display: 'block' }}>
                        Slices {'<'} this % will be grouped into "Others".
                    </span>
                </Section>
            )}
        </>
    );
});

DataPanel.displayName = 'DataPanel';

export default DataPanel;
