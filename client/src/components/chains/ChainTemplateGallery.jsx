/**
 * ChainTemplateGallery — Modal to pick a starter template when creating a new chain.
 * Uses the same inline-style modal pattern as TableDetailsModal / SettingsModal.
 */
import { createPortal } from 'react-dom';
import { LuX, LuFileSpreadsheet, LuRefreshCw, LuDatabase, LuShieldCheck, LuArrowRight } from 'react-icons/lu';
import excelToParquet from './templates/excel-to-parquet.json';
import csvCleanup from './templates/csv-cleanup.json';
import multiSourceMerge from './templates/multi-source-merge.json';
import dataQualityCheck from './templates/data-quality-check.json';

const TEMPLATES = [
    {
        id: 'excel-to-parquet',
        name: 'Excel → Parquet',
        description: 'Load an Excel file and convert it to Parquet in one step.',
        icon: LuFileSpreadsheet,
        color: 'oklch(0.6 0.18 142)',
        tags: ['import', 'export', 'beginner'],
        definition: excelToParquet,
        nodeCount: 2,
    },
    {
        id: 'csv-cleanup',
        name: 'CSV Cleanup',
        description: 'Import a CSV, clean strings, deduplicate rows, and export a clean file.',
        icon: LuRefreshCw,
        color: 'oklch(0.6 0.18 250)',
        tags: ['clean', 'deduplicate', 'intermediate'],
        definition: csvCleanup,
        nodeCount: 4,
    },
    {
        id: 'multi-source-merge',
        name: 'Multi-Source Merge',
        description: 'Combine 3 CSV files with the same schema into a single Parquet output.',
        icon: LuDatabase,
        color: 'oklch(0.6 0.18 300)',
        tags: ['merge', 'union', 'intermediate'],
        definition: multiSourceMerge,
        nodeCount: 5,
    },
    {
        id: 'data-quality-check',
        name: 'Data Quality Check',
        description: 'Run assertions (not empty, no NULLs, unique IDs) before exporting validated data.',
        icon: LuShieldCheck,
        color: 'oklch(0.6 0.18 55)',
        tags: ['assert', 'validation', 'intermediate'],
        definition: dataQualityCheck,
        nodeCount: 5,
    },
];

const ChainTemplateGallery = ({ onSelect, onClose }) => {
    const modal = (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'var(--overlay-bg)',
                zIndex: 2000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',

            }}
            onClick={onClose}
        >
            <div
                className="modal-panel"
                style={{
                    width: 'min(92vw, 640px)',
                    maxHeight: '80vh',
                    backgroundColor: 'var(--surface-overlay)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-lg)',
                    border: '1px solid var(--border-default)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border-default)',
                    background: 'var(--surface-raised)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-active)', marginBottom: 2 }}>
                            Start from Template
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Choose a starter workflow or start blank
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <LuX size={16} />
                    </button>
                </div>

                {/* Template list */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {TEMPLATES.map(tpl => {
                        const Icon = tpl.icon;
                        return (
                            <button
                                key={tpl.id}
                                onClick={() => onSelect(tpl.definition)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '12px 14px',
                                    background: 'var(--surface-raised)',
                                    border: '1px solid var(--border-default)',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    width: '100%',
                                    transition: 'border-color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-color-user)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
                            >
                                <div style={{
                                    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: tpl.color, background: `color-mix(in oklch, ${tpl.color} 18%, transparent)`,
                                }}>
                                    <Icon size={20} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-active)', marginBottom: 3 }}>
                                        {tpl.name}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 6 }}>
                                        {tpl.description}
                                    </div>
                                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--hover-bg)', padding: '2px 6px', borderRadius: 8 }}>
                                            {tpl.nodeCount} nodes
                                        </span>
                                        {tpl.tags.map(t => (
                                            <span key={t} style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border-default)', padding: '2px 6px', borderRadius: 8 }}>
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <LuArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            </button>
                        );
                    })}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid var(--border-default)',
                    background: 'var(--surface-raised)',
                    display: 'flex', justifyContent: 'center',
                    flexShrink: 0,
                }}>
                    <button
                        onClick={() => onSelect(null)}
                        style={{
                            padding: '6px 18px',
                            background: 'none',
                            border: '1px solid var(--border-default)',
                            borderRadius: 6,
                            color: 'var(--text-secondary)',
                            fontSize: 12,
                            cursor: 'pointer',
                        }}
                    >
                        Start with blank chain
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default ChainTemplateGallery;
