/**
 * StoryPanel — "Make it speak".
 * Story Flow stage ⑤: narrativa de texto + foco visual.
 * Secciones: Headline · Storytelling (title/subtitle/footnote + Auto Story)
 *            · Focus (Highlight) · Goal · Trend · Reference Line · Reference Area.
 * (Los márgenes se movieron a Format; las anotaciones libres llegan en la fase 3.)
 */
import { memo, useRef, useState } from 'react';
import { Section, Toggle, SelectField, InputField, SimpleColorPicker, panelStyles } from './shared';

const StoryPanel = memo(({ state, setField, onGenerateStory, xValues = [] }) => {
    const { chartType, chartTitle, chartSubtitle, chartFootnote, takeaway, textAlign,
        refLine, refArea, goalLine, trendLine, headline, highlightConfig, annotations,
    } = state;

    const titleRef = useRef(null);
    const subtitleRef = useRef(null);
    const footnoteRef = useRef(null);
    const takeawayRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [storyError, setStoryError] = useState(null);

    const isLine = chartType === 'line' || chartType === 'area';
    const isBar = chartType.startsWith('bar');
    const isHorizontal = chartType.startsWith('bar-horizontal');
    const isCombo = chartType === 'combo';
    const isScatter = chartType === 'scatter' || chartType === 'bubble';
    const isWaterfall = chartType === 'waterfall';
    // Feature support per chart type — MUST match what ChartRenderer actually draws,
    // so the panel never offers a control that does nothing.
    const supportsRef = isLine || isBar || isCombo || isScatter || isWaterfall;   // Goal / Reference line & area
    const supportsTrend = isLine || (isBar && !isHorizontal);                     // Trend / moving average
    const supportsHighlight = isLine || isBar;                                    // Highlight rule
    const supportsAnnotations = isLine || isBar || isCombo;                       // Free-form annotations

    const applyTexts = () => {
        if (titleRef.current) setField('chartTitle', titleRef.current.value);
        if (subtitleRef.current) setField('chartSubtitle', subtitleRef.current.value);
        if (footnoteRef.current) setField('chartFootnote', footnoteRef.current.value);
        if (takeawayRef.current) setField('takeaway', takeawayRef.current.value);
    };

    const handleGenerateStory = async () => {
        if (!onGenerateStory) return;
        setIsGenerating(true);
        setStoryError(null);
        try {
            const story = await onGenerateStory();
            if (story && !story.error) {
                if (titleRef.current) titleRef.current.value = story.chart_title || '';
                if (subtitleRef.current) subtitleRef.current.value = story.chart_subtitle || '';
                if (footnoteRef.current) footnoteRef.current.value = story.footnote || '';
                const tw = Array.isArray(story.key_insights) ? story.key_insights.join(' ') : '';
                if (takeawayRef.current) takeawayRef.current.value = tw;
                setField('chartTitle', story.chart_title || '');
                setField('chartSubtitle', story.chart_subtitle || '');
                setField('chartFootnote', story.footnote || '');
                setField('takeaway', tw);
            } else {
                setStoryError(story?.error || 'Could not generate story.');
            }
        } catch (err) {
            setStoryError('Error generating story.');
        } finally {
            setIsGenerating(false);
        }
    };

    const addBtnStyle = { flex: 1, padding: '6px', background: 'var(--surface-overlay)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 500 };
    const addAnnotation = (type) => {
        const base = { id: 'ann_' + Date.now(), type, x: xValues[0] ?? '', text: type === 'box' ? 'Region' : 'Note', color: '#fbbf24' };
        if (type === 'box') { base.x2 = xValues[xValues.length - 1] ?? base.x; base.y = ''; base.y2 = ''; }
        else { base.y = ''; }
        setField('annotations', [...(annotations || []), base]);
    };
    const updateAnnotation = (i, field, val) => setField('annotations', (annotations || []).map((a, idx) => idx === i ? { ...a, [field]: val } : a));
    const removeAnnotation = (i) => setField('annotations', (annotations || []).filter((_, idx) => idx !== i));

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
                <div style={{ marginBottom: '4px' }}>
                    <label style={panelStyles.labelSmall}>Takeaway (insight)</label>
                    <textarea ref={takeawayRef} placeholder="Key insight or recommendation..."
                        defaultValue={takeaway} rows={3}
                        style={{ ...panelStyles.input, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-disabled)', marginBottom: '6px' }}>
                    Tip: wrap text in **asterisks** to emphasize it in the accent color (title, subtitle & takeaway).
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button
                        onClick={applyTexts}
                        style={{
                            flex: 1, padding: '6px',
                            background: 'var(--accent-color-user)',
                            color: 'var(--button-text-color)',
                            border: 'none', borderRadius: '4px',
                            cursor: 'pointer', fontSize: '11px', fontWeight: '500',
                        }}
                    >
                        Apply
                    </button>
                    {onGenerateStory && (
                        <button
                            onClick={handleGenerateStory}
                            disabled={isGenerating}
                            title="Generate story from chart data using AI"
                            style={{
                                flex: 1, padding: '6px',
                                background: isGenerating ? 'var(--surface-raised)' : 'var(--surface-overlay)',
                                color: isGenerating ? 'var(--text-muted)' : 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: isGenerating ? 'default' : 'pointer',
                                fontSize: '11px', fontWeight: '500',
                            }}
                        >
                            {isGenerating ? 'Generating...' : 'Auto Story'}
                        </button>
                    )}
                </div>

                {storyError && (
                    <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--color-error, #e05555)', padding: '4px 6px', background: 'var(--surface-raised)', borderRadius: '3px' }}>
                        {storyError}
                    </div>
                )}
            </Section>

            {/* ── Annotations ── */}
            {supportsAnnotations && (
                <Section title="Annotations">
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                        <button onClick={() => addAnnotation('text')} style={addBtnStyle}>+ Text</button>
                        <button onClick={() => addAnnotation('box')} style={addBtnStyle}>+ Box</button>
                    </div>
                    {(!annotations || annotations.length === 0) && (
                        <div style={{ fontSize: '10px', color: 'var(--text-disabled)' }}>
                            Mark a point (Text) or a region (Box) on the chart.
                        </div>
                    )}
                    {(annotations || []).map((a, i) => (
                        <div key={a.id || i} style={{ border: '1px solid var(--border-color)', borderRadius: '5px', padding: '6px', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.3px' }}>{a.type}</span>
                                <button onClick={() => removeAnnotation(i)} title="Remove"
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px', lineHeight: 1 }}>✕</button>
                            </div>
                            <input type="text" value={a.text} onChange={e => updateAnnotation(i, 'text', e.target.value)}
                                placeholder="Annotation text..." style={{ ...panelStyles.input, marginBottom: '5px' }} />
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <select value={a.x} onChange={e => updateAnnotation(i, 'x', e.target.value)} style={{ ...panelStyles.select, flex: 1 }}>
                                    {xValues.map(v => <option key={String(v)} value={v}>{String(v)}</option>)}
                                </select>
                                {a.type === 'box' && (
                                    <select value={a.x2} onChange={e => updateAnnotation(i, 'x2', e.target.value)} style={{ ...panelStyles.select, flex: 1 }}>
                                        {xValues.map(v => <option key={String(v)} value={v}>{String(v)}</option>)}
                                    </select>
                                )}
                            </div>
                            {a.type === 'box' ? (
                                <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                    <input type="number" value={a.y} onChange={e => updateAnnotation(i, 'y', e.target.value)} placeholder="Y min" style={{ ...panelStyles.input, flex: 1 }} />
                                    <input type="number" value={a.y2} onChange={e => updateAnnotation(i, 'y2', e.target.value)} placeholder="Y max" style={{ ...panelStyles.input, flex: 1 }} />
                                </div>
                            ) : (
                                <input type="number" value={a.y} onChange={e => updateAnnotation(i, 'y', e.target.value)}
                                    placeholder="Y value (auto if empty)" style={{ ...panelStyles.input, marginBottom: '5px' }} />
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <SimpleColorPicker color={a.color} onChange={v => updateAnnotation(i, 'color', v)} />
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Color</span>
                            </div>
                        </div>
                    ))}
                </Section>
            )}

            {/* ── Focus: Highlight ── */}
            {supportsHighlight && (
                <Section title="Focus — Highlight">
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

            {/* ── Goal Line ── */}
            {supportsRef && (
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
            {supportsTrend && (
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
            {supportsRef && (
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
            {supportsRef && (
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
            )}
        </>
    );
});

StoryPanel.displayName = 'StoryPanel';

export default StoryPanel;
