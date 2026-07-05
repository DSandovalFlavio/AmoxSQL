/**
 * ChainAiPrompt — embedded canvas prompt for generating a pipeline DAG from
 * natural language. Floats at the bottom of the canvas; on submit it asks the
 * backend to produce a chain definition that the editor lays onto the canvas.
 */
import { useState } from 'react';
import { LuSparkles, LuLoader } from 'react-icons/lu';

const ChainAiPrompt = ({ onGenerate, loading, hasNodes }) => {
    const [text, setText] = useState('');

    const submit = () => {
        const t = text.trim();
        if (!t || loading) return;
        onGenerate(t);
    };

    return (
        <div
            style={{
                position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                zIndex: 8, width: 'min(660px, 82%)',
            }}
        >
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                    borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: '8px 10px',
                }}
            >
                <LuSparkles size={16} style={{ color: 'var(--accent-color-user)', flexShrink: 0 }} />
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    disabled={loading}
                    placeholder={hasNodes
                        ? 'Describe a change or a new pipeline… e.g. "add a dedup before the export"'
                        : 'Describe your pipeline… e.g. "import sales.csv, filter 2025, sum amount by region, export to parquet"'}
                    style={{
                        flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                        outline: 'none', color: 'var(--text-active)', fontSize: 13,
                    }}
                />
                <button
                    onClick={submit}
                    disabled={loading || !text.trim()}
                    title="Generate pipeline (Enter)"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        background: 'var(--accent-color-user)', color: 'var(--button-text-color)', border: 'none',
                        borderRadius: 7, padding: '6px 11px', fontSize: 12,
                        cursor: (loading || !text.trim()) ? 'default' : 'pointer',
                        opacity: (loading || !text.trim()) ? 0.6 : 1,
                    }}
                >
                    {loading ? <LuLoader size={14} className="chain-node-spin" /> : <LuSparkles size={14} />}
                    <span>{loading ? 'Generating…' : 'Generate'}</span>
                </button>
            </div>
        </div>
    );
};

export default ChainAiPrompt;
