/**
 * FormatPanel — "Make it readable".
 * Story Flow stage ③: fusiona la mecánica de Detail + Axes + Margins.
 * Compone AxisPanel (ejes, números, títulos) + DetailPanel (labels, grid,
 * leyenda, opciones por tipo de mark) sin el Highlight (que vive en Story).
 */
import { memo } from 'react';
import { Section, InputField } from './shared';
import AxisPanel from './AxisPanel';
import DetailPanel from './DetailPanel';

const FormatPanel = memo(({ state, setField, finalSeriesKeys }) => {
    const { marginTop, marginBottom, marginLeft, marginRight, titleSpacing } = state;

    return (
        <>
            <AxisPanel
                state={state}
                setField={setField}
                defaultXLabel={state.xAxisKey}
                defaultYLabel={state.yAxisKeys.join(', ')}
            />

            <DetailPanel
                state={state}
                setField={setField}
                finalSeriesKeys={finalSeriesKeys}
                showHighlight={false}
            />

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

FormatPanel.displayName = 'FormatPanel';

export default FormatPanel;
