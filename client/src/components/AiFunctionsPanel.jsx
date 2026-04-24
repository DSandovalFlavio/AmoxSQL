import { useState, useEffect, useCallback } from 'react';
import {
    LuZap, LuRefreshCw, LuPlus, LuTrash2, LuPencilLine, LuCheck,
    LuLoader, LuCircleAlert, LuExternalLink, LuCopy, LuPlay,
    LuBook, LuKey, LuBrain, LuMessageSquare, LuChevronDown, LuChevronRight,
    LuTriangleAlert,
} from 'react-icons/lu';
import { useToast } from './ToastProvider';

const TABS = [
    { id: 'models',   label: 'Models',   icon: LuBrain },
    { id: 'prompts',  label: 'Prompts',  icon: LuMessageSquare },
    { id: 'secrets',  label: 'Secrets',  icon: LuKey },
    { id: 'reference', label: 'Reference', icon: LuBook },
];

const PROVIDERS = ['ollama', 'openai', 'anthropic', 'azure'];
const TUPLE_FORMATS = ['json', 'xml', 'markdown'];

const FLOCK_FUNCTIONS = [
    { name: 'llm_complete',   cat: 'Scalar',    ret: 'JSON',    sig: "llm_complete({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})", doc: 'Text completion per row.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/scalar-functions/llm-complete', example: "SELECT llm_complete(\n  {'model_name': 'MyModel'},\n  {'prompt': 'Summarize this review:',\n   'context_columns': [{'data': review_text}]}\n) AS summary\nFROM reviews\nLIMIT 10;" },
    { name: 'llm_filter',     cat: 'Scalar',    ret: 'BOOLEAN', sig: "llm_filter({'model_name': 'name'}, {'prompt': 'Is this...?', 'context_columns': [{'data': col}]})", doc: 'Semantic boolean predicate — perfect in WHERE.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/scalar-functions/llm-filter', example: "SELECT *\nFROM reviews\nWHERE llm_filter(\n  {'model_name': 'MyModel'},\n  {'prompt': 'Is this review negative?',\n   'context_columns': [{'data': review_text}]}\n)\nLIMIT 20;" },
    { name: 'llm_embedding',  cat: 'Scalar',    ret: 'FLOAT[]', sig: "llm_embedding({'model_name': 'name'}, {'context_columns': [{'data': col}]})", doc: 'Returns a semantic embedding vector.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/scalar-functions/llm-embedding', example: "-- Build embeddings column\nALTER TABLE docs ADD COLUMN emb FLOAT[];\nUPDATE docs\nSET emb = llm_embedding(\n  {'model_name': 'embed_default'},\n  {'context_columns': [{'data': content}]}\n);\n\n-- Similarity search\nSELECT id, title,\n  array_cosine_similarity(emb, $query_emb) AS score\nFROM docs\nORDER BY score DESC LIMIT 10;" },
    { name: 'llm_reduce',     cat: 'Aggregate', ret: 'JSON',    sig: "llm_reduce({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})", doc: 'Collapses a GROUP BY into one LLM summary per group.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/aggregate-functions/llm-reduce', example: "SELECT category,\n  llm_reduce(\n    {'model_name': 'MyModel'},\n    {'prompt': 'Summarize these reviews in 2 sentences',\n     'context_columns': [{'data': review_text}]}\n  ) AS summary\nFROM reviews\nGROUP BY category;" },
    { name: 'llm_rerank',     cat: 'Aggregate', ret: 'JSON[]',  sig: "llm_rerank({'model_name': 'name'}, {'prompt': 'Rank by...', 'context_columns': [{'data': col}]})", doc: 'Reranks rows in a group by LLM-judged relevance.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/aggregate-functions/llm-rerank', example: "SELECT llm_rerank(\n  {'model_name': 'MyModel'},\n  {'prompt': 'Rank by relevance to \"best laptop under $1500\"',\n   'context_columns': [{'data': title}, {'data': description}]}\n) AS ranked\nFROM products;" },
    { name: 'llm_first',      cat: 'Aggregate', ret: 'JSON',    sig: "llm_first({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})", doc: 'Top-ranked row after reranking within an aggregate.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/aggregate-functions/llm-rerank', example: "SELECT category,\n  llm_first(\n    {'model_name': 'MyModel'},\n    {'prompt': 'Best product for a beginner',\n     'context_columns': [{'data': name}, {'data': description}]}\n  ) AS best_pick\nFROM products\nGROUP BY category;" },
    { name: 'llm_last',       cat: 'Aggregate', ret: 'JSON',    sig: "llm_last({'model_name': 'name'}, {'prompt': '...', 'context_columns': [{'data': col}]})", doc: 'Bottom-ranked row after reranking.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/aggregate-functions/llm-rerank', example: "-- Similar to llm_first but returns the least relevant match" },
    { name: 'fusion_rrf',     cat: 'Fusion',    ret: 'DOUBLE',  sig: 'fusion_rrf(rank1, rank2, ...)', doc: 'Reciprocal Rank Fusion — combines rankings from multiple retrievers.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/hybrid-search', example: "WITH results AS (\n  SELECT id,\n    fts_main_docs.match_bm25(id, 'duckdb') AS bm25,\n    array_cosine_similarity(emb, $q_emb)   AS sim\n  FROM docs\n)\nSELECT id,\n  fusion_rrf(\n    row_number() OVER (ORDER BY bm25 DESC),\n    row_number() OVER (ORDER BY sim  DESC)\n  ) AS score\nFROM results\nORDER BY score DESC LIMIT 20;" },
    { name: 'fusion_combsum', cat: 'Fusion',    ret: 'DOUBLE',  sig: 'fusion_combsum(score1, score2, ...)', doc: 'Sum of normalized scores.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/hybrid-search', example: "SELECT id, fusion_combsum(bm25_score, embed_score) AS score\nFROM search_results ORDER BY score DESC LIMIT 10;" },
    { name: 'fusion_combmnz', cat: 'Fusion',    ret: 'DOUBLE',  sig: 'fusion_combmnz(score1, score2, ...)', doc: 'Sum × count of non-zero hits. Boosts docs matched by multiple retrievers.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/hybrid-search', example: '' },
    { name: 'fusion_combmed', cat: 'Fusion',    ret: 'DOUBLE',  sig: 'fusion_combmed(score1, score2, ...)', doc: 'Median of normalized scores. Robust to outlier scorers.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/hybrid-search', example: '' },
    { name: 'fusion_combanz', cat: 'Fusion',    ret: 'DOUBLE',  sig: 'fusion_combanz(score1, score2, ...)', doc: 'Average of non-zero normalized scores.', docsUrl: 'https://dais-polymtl.github.io/flock/docs/hybrid-search', example: '' },
];

// ─── AiFunctionsPanel ─────────────────────────────────────────────────────────

const AiFunctionsPanel = ({ onInsertSql, onOpenWizard }) => {
    const [activeTab, setActiveTab] = useState('models');
    const [flockLoaded, setFlockLoaded] = useState(null); // null=loading, false, true
    const toast = useToast();

    const checkStatus = useCallback(async () => {
        setFlockLoaded(null);
        try {
            const res = await fetch('http://localhost:3001/api/flock/status');
            const data = await res.json();
            setFlockLoaded(!!data.loaded);
        } catch {
            setFlockLoaded(false);
        }
    }, []);

    useEffect(() => { checkStatus(); }, [checkStatus]);

    if (flockLoaded === null) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-tertiary)' }}>
            <LuLoader size={16} className="ext-spin" />
        </div>
    );

    if (!flockLoaded) return (
        <FlockNotLoaded onRefresh={checkStatus} onOpenWizard={onOpenWizard} />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <LuZap size={12} style={{ color: 'oklch(0.68 0.16 300)' }} /> AI FUNCTIONS
                </span>
                <button onClick={checkStatus} title="Refresh" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', padding: '2px', cursor: 'pointer', display: 'flex' }}>
                    <LuRefreshCw size={13} />
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)' }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        style={{
                            flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: '10px',
                            fontWeight: activeTab === t.id ? '700' : '500',
                            background: 'transparent',
                            color: activeTab === t.id ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                            borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent-primary)' : 'transparent'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                            transition: 'color 120ms ease',
                        }}
                    >
                        <t.icon size={11} /> {t.label}
                    </button>
                ))}
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
                {activeTab === 'models'    && <ModelsTab onInsertSql={onInsertSql} toast={toast} />}
                {activeTab === 'prompts'   && <PromptsTab onInsertSql={onInsertSql} toast={toast} />}
                {activeTab === 'secrets'   && <SecretsTab toast={toast} />}
                {activeTab === 'reference' && <ReferenceTab onInsertSql={onInsertSql} />}
            </div>
        </div>
    );
};

// ─── Not-loaded state ──────────────────────────────────────────────────────────

const FlockNotLoaded = ({ onRefresh, onOpenWizard }) => (
    <div style={{ padding: '20px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
        <div style={{
            width: 40, height: 40, borderRadius: '10px',
            background: 'color-mix(in oklch, oklch(0.68 0.16 300) 12%, transparent)',
            border: '1px solid color-mix(in oklch, oklch(0.68 0.16 300) 20%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <LuZap size={20} style={{ color: 'oklch(0.68 0.16 300)' }} />
        </div>
        <div>
            <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>Flock not loaded</div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                Install and load the Flock extension first. Open Extensions → Featured → Flock.
            </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onOpenWizard} style={{
                padding: '7px 14px', fontSize: '12px', fontWeight: '600',
                background: 'var(--accent-primary)', color: 'var(--surface-base)',
                border: 'none', borderRadius: '6px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
            }}>
                <LuZap size={12} /> Setup Flock
            </button>
            <button onClick={onRefresh} style={{
                padding: '7px 12px', fontSize: '12px',
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer',
            }}>
                <LuRefreshCw size={12} />
            </button>
        </div>
    </div>
);

// ─── Models Tab ───────────────────────────────────────────────────────────────

const ModelsTab = ({ onInsertSql, toast }) => {
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [testing, setTesting] = useState(null);
    const [form, setForm] = useState({ name: '', modelId: '', provider: 'ollama', tupleFormat: 'json', batchSize: 16, temperature: 0.2 });

    const fetchModels = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/flock/models');
            setModels(await res.json());
        } catch { setModels([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchModels(); }, [fetchModels]);

    const handleCreate = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/flock/models', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) { toast.success(`Model '${form.name}' created.`); setShowForm(false); setForm({ name: '', modelId: '', provider: 'ollama', tupleFormat: 'json', batchSize: 16, temperature: 0.2 }); fetchModels(); }
            else { const d = await res.json(); toast.error(d.error); }
        } catch (err) { toast.error(err.message); }
    };

    const handleDelete = async (name) => {
        try {
            await fetch(`http://localhost:3001/api/flock/models/${encodeURIComponent(name)}`, { method: 'DELETE' });
            toast.success(`Model '${name}' deleted.`); fetchModels();
        } catch (err) { toast.error(err.message); }
    };

    const handleTest = async (name) => {
        setTesting(name);
        try {
            const res = await fetch(`http://localhost:3001/api/flock/models/${encodeURIComponent(name)}/test`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) toast.success(`'${name}' responded: ${String(data.result).slice(0, 100)}`, 6000);
            else toast.error(data.error, 8000);
        } catch (err) { toast.error(err.message); }
        finally { setTesting(null); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    <LuPlus size={11} /> New Model
                </button>
            </div>

            {showForm && (
                <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--surface-inset)' }}>
                    <FieldInput label="Alias" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="QuackingModel" mono />
                    <FieldInput label="Ollama model ID" value={form.modelId} onChange={v => setForm(p => ({ ...p, modelId: v }))} placeholder="llama3.2" mono />
                    <FieldSelect label="Provider" value={form.provider} options={PROVIDERS} onChange={v => setForm(p => ({ ...p, provider: v }))} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <FieldSelect label="Tuple format" value={form.tupleFormat} options={TUPLE_FORMATS} onChange={v => setForm(p => ({ ...p, tupleFormat: v }))} />
                        <FieldInput label="Batch size" value={form.batchSize} onChange={v => setForm(p => ({ ...p, batchSize: Number(v) }))} type="number" />
                        <FieldInput label="Temperature" value={form.temperature} onChange={v => setForm(p => ({ ...p, temperature: Number(v) }))} type="number" step="0.1" />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowForm(false)} style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
                        <button onClick={handleCreate} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Create</button>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {loading ? <LoadingRow /> : models.length === 0 ? (
                    <EmptyState msg="No models registered. Click New Model to add one." />
                ) : models.map((m, i) => (
                    <div key={i} style={{ marginBottom: '6px', padding: '9px 10px', background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', borderRadius: '7px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span style={{ fontWeight: '600', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{m.model_name || m.name || JSON.stringify(m).slice(0, 40)}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <ActionBtn icon={LuPlay} title="Test" onClick={() => handleTest(m.model_name || m.name)} loading={testing === (m.model_name || m.name)} />
                                <ActionBtn icon={LuCopy} title="Copy model_name snippet" onClick={() => { navigator.clipboard.writeText(`{'model_name': '${m.model_name || m.name}'}`); toast.info('Copied', 2000); }} />
                                <ActionBtn icon={LuTrash2} title="Delete" onClick={() => handleDelete(m.model_name || m.name)} danger />
                            </div>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {m.provider && <span>{m.provider}</span>}
                            {m.model && <span style={{ fontFamily: 'var(--font-mono)' }}>{m.model}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Prompts Tab ──────────────────────────────────────────────────────────────

const PromptsTab = ({ onInsertSql, toast }) => {
    const [prompts, setPrompts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', text: '', global: false });

    const fetchPrompts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/flock/prompts');
            setPrompts(await res.json());
        } catch { setPrompts([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

    const handleCreate = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/flock/prompts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (res.ok) { toast.success(`Prompt '${form.name}' created.`); setShowForm(false); setForm({ name: '', text: '', global: false }); fetchPrompts(); }
            else { const d = await res.json(); toast.error(d.error); }
        } catch (err) { toast.error(err.message); }
    };

    const handleDelete = async (name) => {
        try {
            await fetch(`http://localhost:3001/api/flock/prompts/${encodeURIComponent(name)}`, { method: 'DELETE' });
            toast.success(`Prompt '${name}' deleted.`); fetchPrompts();
        } catch (err) { toast.error(err.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    <LuPlus size={11} /> New Prompt
                </button>
            </div>

            {showForm && (
                <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--surface-inset)' }}>
                    <FieldInput label="Name" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="sentiment-check" mono />
                    <div>
                        <label style={labelStyle}>TEXT (use {'{'}text{'}'} as placeholder)</label>
                        <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
                            placeholder="Is this review negative? {text}"
                            rows={3}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', fontSize: '11px', fontFamily: 'var(--font-mono)', background: 'var(--surface-base)', border: '1px solid var(--border-subtle)', borderRadius: '5px', color: 'var(--text-primary)', resize: 'vertical' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={form.global} onChange={e => setForm(p => ({ ...p, global: e.target.checked }))} /> Global scope (accessible from all databases)
                    </label>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowForm(false)} style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
                        <button onClick={handleCreate} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Create</button>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {loading ? <LoadingRow /> : prompts.length === 0 ? (
                    <EmptyState msg="No prompts defined. Create a reusable prompt template." />
                ) : prompts.map((p, i) => (
                    <div key={i} style={{ marginBottom: '6px', padding: '9px 10px', background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', borderRadius: '7px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '600', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{p.prompt_name || p.name || JSON.stringify(p).slice(0, 40)}</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <ActionBtn icon={LuCopy} title="Copy prompt_name snippet" onClick={() => { navigator.clipboard.writeText(`{'prompt_name': '${p.prompt_name || p.name}'}`); toast.info('Copied', 2000); }} />
                                <ActionBtn icon={LuTrash2} title="Delete" onClick={() => handleDelete(p.prompt_name || p.name)} danger />
                            </div>
                        </div>
                        {p.prompt && <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: 40, overflow: 'hidden' }}>{p.prompt}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Secrets Tab ──────────────────────────────────────────────────────────────

const SecretsTab = ({ toast }) => {
    const [secrets, setSecrets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showOllamaForm, setShowOllamaForm] = useState(false);
    const [ollamaUrl, setOllamaUrl] = useState('127.0.0.1:11434');

    const fetchSecrets = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/flock/secrets');
            setSecrets(await res.json());
        } catch { setSecrets([]); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchSecrets(); }, [fetchSecrets]);

    const handleAddOllama = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/flock/secrets/ollama', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiUrl: ollamaUrl, name: 'amoxsql_ollama', persistent: true }),
            });
            if (res.ok) { toast.success('Ollama secret created.'); setShowOllamaForm(false); fetchSecrets(); }
            else { const d = await res.json(); toast.error(d.error); }
        } catch (err) { toast.error(err.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowOllamaForm(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    <LuPlus size={11} /> Add Ollama Secret
                </button>
            </div>

            {showOllamaForm && (
                <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--surface-inset)' }}>
                    <FieldInput label="Ollama URL (host:port)" value={ollamaUrl} onChange={setOllamaUrl} placeholder="127.0.0.1:11434" mono />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowOllamaForm(false)} style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '5px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Cancel</button>
                        <button onClick={handleAddOllama} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Create</button>
                    </div>
                </div>
            )}

            <div style={{ padding: '8px 12px', fontSize: '10px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <LuTriangleAlert size={11} style={{ flexShrink: 0, marginTop: '1px' }} />
                API keys are stored by DuckDB's Secrets Manager (persistent = on disk at ~/.duckdb/stored_secrets/). Values are masked here.
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {loading ? <LoadingRow /> : secrets.length === 0 ? (
                    <EmptyState msg="No secrets found. Add one above." />
                ) : secrets.map((s, i) => (
                    <div key={i} style={{ marginBottom: '6px', padding: '9px 10px', background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', borderRadius: '7px' }}>
                        <div style={{ fontWeight: '600', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: '3px' }}>{s.name || 'unnamed'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', display: 'flex', gap: '8px' }}>
                            <span>type: {s.type}</span>
                            {s.persistent !== undefined && <span>{s.persistent ? 'persistent' : 'temporary'}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Reference Tab ────────────────────────────────────────────────────────────

const ReferenceTab = ({ onInsertSql }) => {
    const [expanded, setExpanded] = useState({});
    const cats = [...new Set(FLOCK_FUNCTIONS.map(f => f.cat))];

    const toggle = (name) => setExpanded(p => ({ ...p, [name]: !p[name] }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Docs link banner */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Official Flock documentation (always up to date)</span>
                <a href="https://dais-polymtl.github.io/flock/docs/what-is-flock" target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '10px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none', fontWeight: '600' }}>
                    <LuExternalLink size={10} /> Open docs
                </a>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {cats.map(cat => (
                    <div key={cat} style={{ marginBottom: '8px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-disabled)', padding: '6px 4px 3px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
                            {cat}
                        </div>
                        {FLOCK_FUNCTIONS.filter(f => f.cat === cat).map(fn => (
                            <div key={fn.name} style={{ marginBottom: '4px' }}>
                                <button
                                    onClick={() => toggle(fn.name)}
                                    style={{ width: '100%', background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                        {expanded[fn.name] ? <LuChevronDown size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} /> : <LuChevronRight size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                                        <span style={{ fontWeight: '600', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fn.name}</span>
                                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: 'var(--surface-overlay)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{fn.ret}</span>
                                    </div>
                                </button>
                                {expanded[fn.name] && (
                                    <div style={{ padding: '8px 10px 10px 30px', background: 'var(--surface-inset)', borderLeft: '2px solid var(--border-subtle)', marginLeft: '4px', borderRadius: '0 0 6px 6px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.5 }}>{fn.doc}</div>
                                        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', background: 'var(--surface-overlay)', padding: '5px 8px', borderRadius: '4px', marginBottom: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{fn.sig}</div>
                                        {fn.example && (
                                            <div style={{ marginBottom: '6px' }}>
                                                <div style={{ fontSize: '9px', color: 'var(--text-disabled)', marginBottom: '3px', fontWeight: '600', textTransform: 'uppercase' }}>Example</div>
                                                <pre style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', background: 'var(--surface-overlay)', padding: '6px 8px', borderRadius: '4px', margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{fn.example}</pre>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            {fn.example && onInsertSql && (
                                                <button onClick={() => onInsertSql(fn.example)} style={{ padding: '3px 8px', fontSize: '10px', fontWeight: '600', background: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <LuCopy size={10} /> Insert example
                                                </button>
                                            )}
                                            <a href={fn.docsUrl} target="_blank" rel="noopener noreferrer"
                                                style={{ padding: '3px 8px', fontSize: '10px', color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '4px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <LuExternalLink size={10} /> Docs
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Shared micro-components ──────────────────────────────────────────────────

const labelStyle = { fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '600', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' };

const FieldInput = ({ label, value, onChange, placeholder, type = 'text', step, mono }) => (
    <div style={{ flex: 1 }}>
        <label style={labelStyle}>{label}</label>
        <input type={type} step={step} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: '11px', fontFamily: mono ? 'var(--font-mono)' : undefined, background: 'var(--surface-base)', border: '1px solid var(--border-subtle)', borderRadius: '5px', color: 'var(--text-primary)' }} />
    </div>
);

const FieldSelect = ({ label, value, options, onChange }) => (
    <div style={{ flex: 1 }}>
        <label style={labelStyle}>{label}</label>
        <select value={value} onChange={e => onChange(e.target.value)}
            style={{ width: '100%', padding: '6px 8px', fontSize: '11px', background: 'var(--surface-base)', border: '1px solid var(--border-subtle)', borderRadius: '5px', color: 'var(--text-primary)' }}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    </div>
);

const ActionBtn = ({ icon: Icon, title, onClick, loading, danger }) => (
    <button onClick={onClick} title={title} disabled={loading}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: danger ? 'var(--feedback-error-text)' : 'var(--text-tertiary)', padding: '3px', display: 'flex', alignItems: 'center', opacity: loading ? 0.5 : 1 }}>
        {loading ? <LuLoader size={12} className="ext-spin" /> : <Icon size={12} />}
    </button>
);

const LoadingRow = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
        <LuLoader size={14} className="ext-spin" />
    </div>
);

const EmptyState = ({ msg }) => (
    <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{msg}</div>
);

export default AiFunctionsPanel;
