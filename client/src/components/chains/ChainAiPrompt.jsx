/**
 * ChainAiPrompt — a second toolbar row for generating a pipeline DAG from
 * natural language. Used to float over the bottom of the canvas as a
 * detached pill; moved into the toolbar (docs/dev/auditoria_dataflow_ux.md
 * feedback) so it has a permanent, non-overlapping home instead of covering
 * whatever node happens to be underneath it, and reads as part of the
 * editor's chrome rather than a floating afterthought.
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
        <div className="chain-ai-bar">
            <LuSparkles size={14} className="chain-ai-bar-icon" />
            <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                disabled={loading}
                className="chain-ai-bar-input"
                placeholder={hasNodes
                    ? 'Describe a change or a new pipeline… e.g. "add a dedup before the export"'
                    : 'Describe your pipeline… e.g. "import sales.csv, filter 2025, sum amount by region, export to parquet"'}
            />
            <button
                onClick={submit}
                disabled={loading || !text.trim()}
                title="Generate pipeline (Enter)"
                className="chain-ai-bar-btn"
            >
                {loading ? <LuLoader size={13} className="chain-node-spin" /> : <LuSparkles size={13} />}
                <span>{loading ? 'Generating…' : 'Generate'}</span>
            </button>
        </div>
    );
};

export default ChainAiPrompt;
