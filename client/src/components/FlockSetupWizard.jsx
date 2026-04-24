import { useState, useEffect } from 'react';
import { LuX, LuZap, LuCheck, LuLoader, LuCircleAlert, LuChevronRight, LuExternalLink, LuTriangleAlert } from 'react-icons/lu';
import { useToast } from './ToastProvider';

const STEPS = ['Configure Ollama', 'Register Models', 'Smoke Test'];

const EMBEDDING_PATTERNS = /embed|nomic|mxbai|bge|e5|gte/i;

const FlockSetupWizard = ({ onClose, onComplete }) => {
    const [step, setStep] = useState(0);
    const toast = useToast();

    // Step 0 state
    const [ollamaUrl, setOllamaUrl] = useState('127.0.0.1:11434');
    const [secretStatus, setSecretStatus] = useState(null); // null | 'creating' | 'ok' | 'exists' | 'error'
    const [secretError, setSecretError] = useState('');

    // Step 1 state
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModels, setSelectedModels] = useState({});
    const [modelsLoading, setModelsLoading] = useState(false);

    // Step 2 state
    const [testModel, setTestModel] = useState('');
    const [testStatus, setTestStatus] = useState(null); // null | 'running' | 'ok' | 'error'
    const [testResult, setTestResult] = useState('');
    const [testError, setTestError] = useState('');

    // Fetch Ollama URL from AmoxSQL AI config
    useEffect(() => {
        fetch('http://localhost:3001/api/settings/ai')
            .then(r => r.json())
            .then(d => { if (d.ollamaUrl) setOllamaUrl(d.ollamaUrl.replace(/^https?:\/\//, '')); })
            .catch(() => {});
    }, []);

    // Step 0 → Create Ollama secret
    const handleCreateSecret = async () => {
        setSecretStatus('creating');
        setSecretError('');
        try {
            const res = await fetch('http://localhost:3001/api/flock/secrets/ollama', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiUrl: ollamaUrl, name: 'amoxsql_ollama', persistent: true }),
            });
            const data = await res.json();
            if (res.ok) {
                setSecretStatus('ok');
            } else if (/already exists/i.test(data.error)) {
                setSecretStatus('exists');
            } else {
                setSecretStatus('error');
                setSecretError(data.error || 'Unknown error');
            }
        } catch (err) {
            setSecretStatus('error');
            setSecretError(err.message);
        }
    };

    const handleToStep1 = async () => {
        setModelsLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/settings/ollama/models');
            const data = await res.json();
            const models = (data.models || []).map(m => ({
                id: m.name,
                alias: m.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''),
                isEmbedding: EMBEDDING_PATTERNS.test(m.name),
            }));
            setAvailableModels(models);
            // Pre-select all non-embedding models + any embedding model
            const initial = {};
            models.forEach(m => { initial[m.id] = true; });
            setSelectedModels(initial);
            if (models.length > 0) setTestModel(models.find(m => !m.isEmbedding)?.alias || models[0].alias);
        } catch (err) {
            toast.error('Could not list Ollama models: ' + err.message);
        } finally {
            setModelsLoading(false);
        }
        setStep(1);
    };

    // Step 1 → Register selected models
    const handleRegisterModels = async () => {
        const toRegister = availableModels.filter(m => selectedModels[m.id]);
        try {
            const res = await fetch('http://localhost:3001/api/flock/bootstrap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ollamaUrl,
                    models: toRegister.map(m => ({ id: m.id, alias: m.alias })),
                }),
            });
            const data = await res.json();
            const errors = data.errors || [];
            if (errors.length > 0) {
                toast.warning(`${errors.length} model(s) had issues — check the Reference panel.`);
            }
            if (toRegister.length > 0) {
                const firstNonEmbed = toRegister.find(m => !m.isEmbedding);
                if (firstNonEmbed) setTestModel(firstNonEmbed.alias);
            }
        } catch (err) {
            toast.error('Bootstrap error: ' + err.message);
        }
        setStep(2);
    };

    // Step 2 → Smoke test
    const handleTest = async () => {
        if (!testModel) return;
        setTestStatus('running');
        setTestResult('');
        setTestError('');
        try {
            const res = await fetch(`http://localhost:3001/api/flock/models/${encodeURIComponent(testModel)}/test`, {
                method: 'POST',
            });
            const data = await res.json();
            if (res.ok) {
                const val = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
                setTestResult(val);
                setTestStatus('ok');
            } else {
                setTestStatus('error');
                setTestError(data.error || 'Test failed');
            }
        } catch (err) {
            setTestStatus('error');
            setTestError(err.message);
        }
    };

    const handleFinish = () => {
        toast.success('Flock is ready! Open the AI Functions panel to manage models and prompts.', 6000);
        onComplete?.();
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
        }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-default)',
                borderRadius: '12px',
                width: '520px',
                maxHeight: '80vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
            }}>
                {/* Header */}
                <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '8px',
                            background: 'color-mix(in oklch, oklch(0.68 0.16 300) 15%, transparent)',
                            border: '1px solid color-mix(in oklch, oklch(0.68 0.16 300) 25%, transparent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <LuZap size={16} style={{ color: 'oklch(0.68 0.16 300)' }} />
                        </div>
                        <div>
                            <div style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>Flock Setup</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>SQL-native LLM functions for DuckDB</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px' }}>
                        <LuX size={16} />
                    </button>
                </div>

                {/* Stepper */}
                <div style={{ display: 'flex', gap: '0', padding: '20px 24px 0', alignItems: 'center' }}>
                    {STEPS.map((s, i) => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? '1' : undefined }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <div style={{
                                    width: 22, height: 22, borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '10px', fontWeight: '700',
                                    background: i < step ? 'var(--feedback-success-text)' : i === step ? 'var(--accent-primary)' : 'var(--surface-inset)',
                                    color: i <= step ? 'var(--surface-base)' : 'var(--text-disabled)',
                                    border: `1px solid ${i === step ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                                }}>
                                    {i < step ? <LuCheck size={11} /> : i + 1}
                                </div>
                                <span style={{ fontSize: '11px', color: i === step ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: i === step ? '600' : '400' }}>
                                    {s}
                                </span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)', margin: '0 8px' }} />
                            )}
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                    {/* Step 0 — Ollama Secret */}
                    {step === 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                Flock needs to know where your Ollama server is running. This creates a persistent DuckDB secret so your SQL functions can reach it automatically.
                            </p>
                            <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                                    OLLAMA URL
                                </label>
                                <input
                                    value={ollamaUrl}
                                    onChange={e => setOllamaUrl(e.target.value)}
                                    placeholder="127.0.0.1:11434"
                                    style={{
                                        width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                                        fontSize: '12px', fontFamily: 'var(--font-mono)',
                                        background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px', color: 'var(--text-primary)',
                                    }}
                                />
                                <div style={{ fontSize: '10px', color: 'var(--text-disabled)', marginTop: '4px' }}>
                                    Just host:port — no http:// prefix needed.
                                </div>
                            </div>

                            {secretStatus === 'error' && (
                                <div style={{ display: 'flex', gap: '6px', padding: '8px 10px', borderRadius: '6px', background: 'var(--feedback-error-bg)', color: 'var(--feedback-error-text)', fontSize: '12px' }}>
                                    <LuCircleAlert size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                                    {secretError}
                                </div>
                            )}
                            {(secretStatus === 'ok' || secretStatus === 'exists') && (
                                <div style={{ display: 'flex', gap: '6px', padding: '8px 10px', borderRadius: '6px', background: 'var(--feedback-success-bg)', color: 'var(--feedback-success-text)', fontSize: '12px' }}>
                                    <LuCheck size={14} />
                                    {secretStatus === 'exists' ? 'Secret already exists — using existing config.' : 'Secret created successfully.'}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                {(secretStatus === null || secretStatus === 'error') && (
                                    <button onClick={handleCreateSecret} disabled={secretStatus === 'creating'} style={btnPrimary}>
                                        {secretStatus === 'creating' ? <LuLoader size={13} className="ext-spin" /> : <LuZap size={13} />}
                                        Create Secret
                                    </button>
                                )}
                                {(secretStatus === 'ok' || secretStatus === 'exists') && (
                                    <button onClick={handleToStep1} style={btnPrimary} disabled={modelsLoading}>
                                        {modelsLoading ? <LuLoader size={13} className="ext-spin" /> : <>Next <LuChevronRight size={13} /></>}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 1 — Register Models */}
                    {step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                Select which Ollama models to register with Flock. Each will get an alias you can use in SQL: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{'llm_complete({\'model_name\': \'alias\'}, ...)'}</code>
                            </p>

                            {availableModels.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                    No Ollama models found. Pull a model first with <code style={{ fontFamily: 'var(--font-mono)' }}>ollama pull llama3.2</code>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                                    {availableModels.map(m => (
                                        <label key={m.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '8px 10px', borderRadius: '6px',
                                            background: selectedModels[m.id] ? 'color-mix(in oklch, var(--accent-primary) 8%, transparent)' : 'var(--surface-inset)',
                                            border: `1px solid ${selectedModels[m.id] ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                                            cursor: 'pointer', transition: 'all 120ms ease',
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={!!selectedModels[m.id]}
                                                onChange={e => setSelectedModels(prev => ({ ...prev, [m.id]: e.target.checked }))}
                                                style={{ margin: 0 }}
                                            />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{m.id}</div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                                                    alias: <span style={{ fontFamily: 'var(--font-mono)' }}>{m.alias}</span>
                                                    {m.isEmbedding && <span style={{ marginLeft: '8px', color: 'oklch(0.68 0.16 300)', fontWeight: '600' }}>EMBEDDING</span>}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setStep(0)} style={btnSecondary}>Back</button>
                                <button onClick={handleRegisterModels} style={btnPrimary}
                                    disabled={!Object.values(selectedModels).some(Boolean)}>
                                    Register Selected <LuChevronRight size={13} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2 — Smoke Test */}
                    {step === 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                                Let's verify everything works. Pick a model and run a quick test query.
                            </p>

                            <div>
                                <label style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                                    MODEL TO TEST
                                </label>
                                <select
                                    value={testModel}
                                    onChange={e => setTestModel(e.target.value)}
                                    style={{
                                        width: '100%', padding: '7px 10px', fontSize: '12px',
                                        background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)',
                                        borderRadius: '6px', color: 'var(--text-primary)',
                                        fontFamily: 'var(--font-mono)',
                                    }}
                                >
                                    {availableModels.filter(m => selectedModels[m.id] && !m.isEmbedding).map(m => (
                                        <option key={m.alias} value={m.alias}>{m.alias} ({m.id})</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{
                                padding: '10px 12px', borderRadius: '6px',
                                background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)',
                                fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)',
                                lineHeight: 1.6,
                            }}>
                                {`SELECT llm_complete(\n  {'model_name': '${testModel || 'your_model'}'},\n  {'prompt': 'Reply with exactly: OK'}\n);`}
                            </div>

                            {testStatus === 'running' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                    <LuLoader size={14} className="ext-spin" /> Calling Ollama via Flock…
                                </div>
                            )}
                            {testStatus === 'ok' && (
                                <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--feedback-success-bg)', fontSize: '12px', color: 'var(--feedback-success-text)', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    <LuCheck size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                                    <span><strong>Success!</strong> Model responded: <span style={{ fontFamily: 'var(--font-mono)' }}>{String(testResult).slice(0, 200)}</span></span>
                                </div>
                            )}
                            {testStatus === 'error' && (
                                <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--feedback-error-bg)', fontSize: '12px', color: 'var(--feedback-error-text)', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                                    <LuCircleAlert size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                                    <span>{testError}</span>
                                </div>
                            )}

                            <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'color-mix(in oklch, oklch(0.78 0.18 80) 8%, transparent)', border: '1px solid color-mix(in oklch, oklch(0.78 0.18 80) 20%, transparent)', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', gap: '6px' }}>
                                <LuTriangleAlert size={12} style={{ flexShrink: 0, marginTop: '1px', color: 'oklch(0.78 0.18 80)' }} />
                                <span>Gemini is used by the AI Assistant chat. Flock SQL functions work with Ollama, OpenAI, Azure, and Anthropic — not Gemini directly.</span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                                <a href="https://dais-polymtl.github.io/flock/docs/what-is-flock" target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: '11px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                                    <LuExternalLink size={11} /> Official docs
                                </a>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setStep(1)} style={btnSecondary}>Back</button>
                                    {testStatus !== 'ok' && (
                                        <button onClick={handleTest} disabled={!testModel || testStatus === 'running'} style={btnPrimary}>
                                            {testStatus === 'running' ? <LuLoader size={13} className="ext-spin" /> : <LuZap size={13} />}
                                            Run Test
                                        </button>
                                    )}
                                    <button onClick={handleFinish} style={{ ...btnPrimary, background: 'var(--feedback-success-text)' }}>
                                        <LuCheck size={13} /> Finish Setup
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '7px 14px', fontSize: '12px', fontWeight: '600',
    background: 'var(--accent-primary)', color: 'var(--surface-base)',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    transition: 'opacity 120ms ease',
};

const btnSecondary = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '7px 14px', fontSize: '12px', fontWeight: '600',
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer',
};

export default FlockSetupWizard;
