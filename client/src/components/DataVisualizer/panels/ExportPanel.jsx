/**
 * ExportPanel — "Ship it".
 * Story Flow stage ⑥: tamaño de lienzo + formato de export + archivo de config.
 */
import { memo } from 'react';
import { LuDownload, LuSave, LuUpload, LuCopy, LuClipboardPaste, LuFileImage, LuMonitorPlay, LuLoaderCircle } from 'react-icons/lu';
import { Section } from './shared';
import { EXPORT_PRESETS } from '../constants';

const btnStyle = {
    width: '100%', textAlign: 'left', padding: '7px 10px',
    background: 'var(--panel-section-bg)', border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer',
    fontSize: '11px', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: '5px',
};

const iconStyle = { marginRight: 6, verticalAlign: 'middle' };

const ExportPanel = memo(({ onExport, onExportSvg, onExportPptx, isExportingPptx, onOpenSave, onLoadFile, onCopy, onPasteJson, onExportData, chartRef }) => {
    return (
        <>
            <Section title="Clipboard">
                <button onClick={onCopy} style={btnStyle} className="dv-export-item">
                    <span><LuCopy size={12} style={iconStyle} />Copy chart as image</span>
                </button>
            </Section>

            {onExportData && (
                <Section title="Data">
                    <button onClick={onExportData} style={btnStyle} className="dv-export-item">
                        <span><LuDownload size={12} style={iconStyle} />Download processed data (CSV)</span>
                    </button>
                </Section>
            )}

            <Section title="Canvas size">
                {EXPORT_PRESETS.map(p => (
                    <button key={p.label} onClick={() => onExport(p)} style={btnStyle} className="dv-export-item">
                        <span><LuDownload size={12} style={iconStyle} />{p.label}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{p.width}×{p.height}</span>
                    </button>
                ))}
                <button
                    onClick={() => onExport({
                        label: 'Original',
                        width: chartRef?.current?.offsetWidth || 1920,
                        height: chartRef?.current?.offsetHeight || 1080,
                    })}
                    style={btnStyle} className="dv-export-item"
                >
                    <span><LuDownload size={12} style={iconStyle} />Original size</span>
                </button>
            </Section>

            {(onExportSvg || onExportPptx) && (
                <Section title="Other formats">
                    {onExportSvg && (
                        <button onClick={onExportSvg} style={btnStyle} className="dv-export-item">
                            <span><LuFileImage size={12} style={iconStyle} />Vector image (SVG)</span>
                        </button>
                    )}
                    {onExportPptx && (
                        <button onClick={onExportPptx} disabled={isExportingPptx} style={{ ...btnStyle, opacity: isExportingPptx ? 0.6 : 1 }} className="dv-export-item">
                            <span>
                                {isExportingPptx
                                    ? <LuLoaderCircle size={12} style={iconStyle} className="spin" />
                                    : <LuMonitorPlay size={12} style={iconStyle} />}
                                {isExportingPptx ? 'Exporting…' : 'PowerPoint (editable)'}
                            </span>
                        </button>
                    )}
                </Section>
            )}

            <Section title="Configuration file">
                <button onClick={onOpenSave} style={btnStyle} className="dv-export-item">
                    <span><LuSave size={12} style={iconStyle} />Save as .amoxvis</span>
                </button>
                <button onClick={onLoadFile} style={btnStyle} className="dv-export-item">
                    <span><LuUpload size={12} style={iconStyle} />Load configuration</span>
                </button>
                <button onClick={onPasteJson} style={btnStyle} className="dv-export-item">
                    <span><LuClipboardPaste size={12} style={iconStyle} />Paste JSON from AI</span>
                </button>
            </Section>
        </>
    );
});

ExportPanel.displayName = 'ExportPanel';

export default ExportPanel;
