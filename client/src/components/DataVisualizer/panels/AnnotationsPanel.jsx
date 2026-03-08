/**
 * AnnotationsPanel — Storytelling text, headline number, goal line, trends,
 * reference elements, and margins.
 * Tab: "Annotate" — "Tell the story"
 */
import { memo, useRef } from 'react';
import { Section, Toggle, SelectField, InputField, SimpleColorPicker, panelStyles, Divider } from './shared';

const AnnotationsPanel = memo(({ state, setField }) => {
    const { chartType, chartTitle, chartSubtitle, chartFootnote, textAlign,
        refLine, refArea, goalLine, trendLine,
        headline, marginTop, marginBottom, marginLeft, marginRight, titleSpacing
    } = state;

    const titleRef = useRef(null);
    const subtitleRef = useRef(null);
    const footnoteRef = useRef(null);

    const isDonut = chartType === 'donut';
    const hasAxes = chartType !== 'donut';

    const applyTexts = () => {
        if (titleRef.current) setField('chartTitle', titleRef.current.value);
        if (subtitleRef.current) setField('chartSubtitle', subtitleRef.current.value);
        if (footnoteRef.current) setField('chartFootnote', footnoteRef.current.value);
    };

    return (
        <>
            {/* ── Headline Number ── */}
            <Section title="Headline Number">
                <Toggle label="Show Headline KPI" checked={headline.visible}
                    onChange={v => setField('headline', { ...headline, visible: v })} />

                {headline.visible && (
                    <>
                        <SelectField
                            label="Metric"
                            value={headline.metric}
                            onChange={v => setField('headline', { ...headline, metric: v })}
                            style={{ marginBottom: '6px' }}
                        >
                            <option value="total">Total (Sum)</option>
                            <option value="average">Average</option>
                            <option value="last">Last Value</option>
                            <option value="first">First Value</option>
                        </SelectField>
                        <SelectField
                            label="Compare With"
                            value={headline.compareWith}
                            onChange={v => setField('headline', { ...headline, compareWith: v })}
                            style={{ marginBottom: '6px' }}
                        >
                            <option value="none">No Comparison</option>
                            <option value="first">First Value</option>
                            <option value="previous">Previous Value</option>
                        </SelectField>
                        <SelectField
                            label="Font Size"
                            value={headline.size}
                            onChange={v => setField('headline', { ...headline, size: v })}
                        >
                            <option value="auto">Auto</option>
                            <option value="custom">Custom</option>
                        </SelectField>
                        {headline.size === 'custom' && (
                            <InputField
                                label="Size (px)"
                                type="number" min={12} max={72}
                                value={headline.customSize}
                                onChange={v => setField('headline', { ...headline, customSize: v })}
                                style={{ marginTop: '4px' }}
                            />
                        )}
                    </>
                )}
            </Section>

            {/* ── Title & Subtitle ── */}
            <Section title="Storytelling">
                <SelectField
                    label="Text Alignment"
                    value={textAlign}
                    onChange={v => setField('textAlign', v)}
                    style={{ marginBottom: '8px' }}
                >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                </SelectField>

                <div style={{ marginBottom: '6px' }}>
                    <label style={panelStyles.labelSmall}>Title</label>
                    <input ref={titleRef} type="text" placeholder="Chart Title"
                        defaultValue={chartTitle} style={panelStyles.input} />
                </div>
                <div style={{ marginBottom: '6px' }}>
                    <label style={panelStyles.labelSmall}>Subtitle</label>
                    <input ref={subtitleRef} type="text" placeholder="Chart Subtitle"
                        defaultValue={chartSubtitle} style={panelStyles.input} />
                </div>
                <div style={{ marginBottom: '6px' }}>
                    <label style={panelStyles.labelSmall}>Footnote</label>
                    <input ref={footnoteRef} type="text" placeholder="Data source or footnote"
                        defaultValue={chartFootnote} style={panelStyles.input} />
                </div>
                <button
                    onClick={applyTexts}
                    style={{
                        width: '100%', padding: '6px',
                        background: 'var(--accent-color-user)',
                        color: 'var(--button-text-color)',
                        border: 'none', borderRadius: '4px',
                        cursor: 'pointer', fontSize: '11px',
                        marginTop: '4px', fontWeight: '500',
                    }}
                >
                    Apply Text
                </button>
            </Section>

            {/* ── Goal Line ── */}
            {hasAxes && (
                <Section title="Goal Line">
                    <Toggle label="Show Goal Line" checked={goalLine.enabled}
                        onChange={v => setField('goalLine', { ...goalLine, enabled: v })} />

                    {goalLine.enabled && (
                        <>
                            <InputField
                                label="Y Value" type="text"
                                value={goalLine.value}
                                onChange={v => setField('goalLine', { ...goalLine, value: v })}
                                placeholder="Enter value..."
                                style={{ marginBottom: '6px' }}
                            />
                            <InputField
                                label="Label" type="text"
                                value={goalLine.label}
                                onChange={v => setField('goalLine', { ...goalLine, label: v })}
                                placeholder="e.g. Goal"
                                style={{ marginBottom: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                                <SimpleColorPicker
                                    color={goalLine.color}
                                    onChange={v => setField('goalLine', { ...goalLine, color: v })}
                                />
                                <SelectField
                                    value={goalLine.style}
                                    onChange={v => setField('goalLine', { ...goalLine, style: v })}
                                    style={{ flex: 1 }}
                                >
                                    <option value="solid">Solid</option>
                                    <option value="dashed">Dashed</option>
                                    <option value="dotted">Dotted</option>
                                </SelectField>
                            </div>
                        </>
                    )}
                </Section>
            )}

            {/* ── Trend Line ── */}
            {hasAxes && (
                <Section title="Trend & Average">
                    <SelectField
                        label="Overlay"
                        value={trendLine.type}
                        onChange={v => setField('trendLine', { ...trendLine, type: v })}
                        style={{ marginBottom: '6px' }}
                    >
                        <option value="none">None</option>
                        <option value="linear">Linear Trend</option>
                        <option value="moving-average">Moving Average</option>
                    </SelectField>

                    {trendLine.type === 'moving-average' && (
                        <InputField
                            label="Window Size"
                            type="number" min={2} max={50}
                            value={trendLine.windowSize}
                            onChange={v => setField('trendLine', { ...trendLine, windowSize: v })}
                            style={{ marginBottom: '6px' }}
                        />
                    )}

                    {trendLine.type !== 'none' && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <SimpleColorPicker
                                color={trendLine.color}
                                onChange={v => setField('trendLine', { ...trendLine, color: v })}
                            />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Trend Color</span>
                        </div>
                    )}
                </Section>
            )}

            {/* ── Reference Line ── */}
            {hasAxes && (
                <Section title="Reference Line">
                    <InputField
                        label="Y Value" type="text"
                        value={refLine.value}
                        onChange={v => setField('refLine', { ...refLine, value: v })}
                        placeholder="Enter value..."
                        style={{ marginBottom: '6px' }}
                    />
                    <InputField
                        label="Label" type="text"
                        value={refLine.label}
                        onChange={v => setField('refLine', { ...refLine, label: v })}
                        placeholder="e.g. Target"
                        style={{ marginBottom: '6px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <SimpleColorPicker
                            color={refLine.color}
                            onChange={v => setField('refLine', { ...refLine, color: v })}
                        />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Color</span>
                    </div>
                </Section>
            )}

            {/* ── Reference Area ── */}
            <Section title="Reference Area">
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <InputField label="X Start" value={refArea.x1} onChange={v => setField('refArea', { ...refArea, x1: v })} placeholder="Start" style={{ flex: 1 }} />
                    <InputField label="X End" value={refArea.x2} onChange={v => setField('refArea', { ...refArea, x2: v })} placeholder="End" style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <InputField label="Y Start" value={refArea.y1} onChange={v => setField('refArea', { ...refArea, y1: v })} placeholder="Start" style={{ flex: 1 }} />
                    <InputField label="Y End" value={refArea.y2} onChange={v => setField('refArea', { ...refArea, y2: v })} placeholder="End" style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <SimpleColorPicker
                        color={refArea.color}
                        onChange={v => setField('refArea', { ...refArea, color: v })}
                    />
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Area Color</span>
                </div>
            </Section>

            {/* ── Margins & Spacing ── */}
            <Section title="Margins & Spacing">
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <InputField label="Title Gap" type="number" value={titleSpacing}
                        onChange={v => setField('titleSpacing', v)} style={{ flex: 1 }} />
                    <InputField label="Top" type="number" value={marginTop}
                        onChange={v => setField('marginTop', v)} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <InputField label="Bottom" type="number" value={marginBottom}
                        onChange={v => setField('marginBottom', v)} style={{ flex: 1 }} />
                    <InputField label="Left" type="number" value={marginLeft}
                        onChange={v => setField('marginLeft', v)} style={{ flex: 1 }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <InputField label="Right" type="number" value={marginRight}
                        onChange={v => setField('marginRight', v)} style={{ flex: 1 }} />
                    <div style={{ flex: 1 }} />
                </div>
            </Section>
        </>
    );
});

AnnotationsPanel.displayName = 'AnnotationsPanel';

export default AnnotationsPanel;
