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

    const isDonut = chartType === 'donut';
    const isScatter = chartType === 'scatter' || chartType === 'bubble';
    const isHorizontal = chartType.startsWith('bar-horizontal');

    // Field roles are orientation-independent: xAxisKey is ALWAYS the
    // dimension/category and yAxisKeys are ALWAYS the measures. Horizontal
    // vs vertical only swaps which screen axis they render on (handled by the
    // renderer) — so the labels must NOT flip with orientation.
    let xLabel = 'Category';
    let yLabel = 'Values';
    if (isDonut) { xLabel = 'Segment Label'; yLabel = 'Segment Size'; }

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
                <div style={{ marginBottom: '10px' }}>
                    <label style={panelStyles.label}>
                        {yLabel}
                        {splitByKey && (
                            <span style={{ color: 'var(--accent-color-user)', fontStyle: 'italic', marginLeft: 5, fontSize: '10px' }}>
                                (Value to Pivot)
                            </span>
                        )}
                    </label>
                    {splitByKey ? (
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

                {/* Secondary Y-Axis (Right) */}
                {yAxisKeys.length > 0 && !splitByKey && !isDonut && !isHorizontal && (
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
            {!isDonut && (
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
