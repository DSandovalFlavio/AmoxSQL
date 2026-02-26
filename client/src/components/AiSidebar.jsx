import { useState, useEffect, useRef } from 'react';
import { LuBot, LuX, LuLoader, LuDatabase, LuSettings, LuCpu, LuCloud, LuSparkles, LuTable, LuFile, LuBan } from 'react-icons/lu';

const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', size: 'Cloud' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', size: 'Cloud' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', size: 'Cloud' },
    { id: 'custom', label: 'Custom Model...', size: 'Cloud' }
];

const AiSidebar = ({ width, onClose, availableTables, onOpenSettings }) => {
    const [status, setStatus] = useState('LOADING'); // LOADING, READY, ERROR
    const [contextObjects, setContextObjects] = useState([]); // [{ type: 'table'|'file', name, path? }]
    const [isDragOver, setIsDragOver] = useState(false);
    const [question, setQuestion] = useState('');
    const [generatedSql, setGeneratedSql] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [isHoveringGenBtn, setIsHoveringGenBtn] = useState(false);
    const abortControllerRef = useRef(null);

    // Config State
    const [provider, setProvider] = useState('ollama');
    const [selectedModel, setSelectedModel] = useState('qwen2.5:1.5b');
    const [customModel, setCustomModel] = useState('');
    const [installedModels, setInstalledModels] = useState([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/settings/config');
                const configData = await res.json();

                const prov = configData.provider || 'ollama';
                setProvider(prov);

                if (prov === 'ollama') {
                    setIsModelsLoading(true);
                    try {
                        const modelsRes = await fetch('http://localhost:3001/api/settings/ollama/models');
                        const modelsData = await modelsRes.json();
                        const models = modelsData.models || [];
                        setInstalledModels(models);

                        if (models.length > 0) {
                            const found = models.find(m => m.name === configData.defaultModel);
                            setSelectedModel(found ? found.name : models[0].name);
                        } else {
                            setSelectedModel('');
                        }
                    } catch (e) {
                        console.error('Failed to load ollama models', e);
                    } finally {
                        setIsModelsLoading(false);
                    }
                } else {
                    // Gemini logic
                    const modelFound = GEMINI_MODELS.find(m => m.id === configData.defaultModel);
                    if (modelFound && modelFound.id !== 'custom') {
                        setSelectedModel(configData.defaultModel);
                    } else {
                        setSelectedModel('custom');
                        setCustomModel(configData.defaultModel || '');
                    }
                }

                setStatus('READY');
            } catch (e) {
                console.error("AI Status check failed", e);
                setStatus('ERROR');
            }
        };

        loadConfig();

        window.addEventListener('amox_settings_updated', loadConfig);
        return () => window.removeEventListener('amox_settings_updated', loadConfig);
    }, []);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);

        try {
            const dataStr = e.dataTransfer.getData('application/json');
            if (dataStr) {
                const data = JSON.parse(dataStr);
                // Prevent duplicates
                if (!contextObjects.some(obj => obj.name === data.name && obj.type === data.type)) {
                    setContextObjects(prev => [...prev, data]);
                }
            }
        } catch (err) {
            console.error("Drop failed:", err);
        }
    };

    const removeContextObj = (index) => {
        setContextObjects(prev => prev.filter((_, i) => i !== index));
    };

    const buildSchemaContext = async () => {
        if (contextObjects.length === 0) return '';

        let schemaStr = '';
        for (const obj of contextObjects) {
            if (obj.type === 'table') {
                const tableInfo = availableTables.find(t => t.name === obj.name);
                if (tableInfo) {
                    schemaStr += `CREATE TABLE ${tableInfo.name} (\n`;
                    schemaStr += tableInfo.columns.map(c => `  ${c.column_name} ${c.data_type}`).join(',\n');
                    schemaStr += `\n);\n\n`;
                } else {
                    schemaStr += `-- Warning: Could not find schema for table ${obj.name}\n\n`;
                }
            } else if (obj.type === 'file') {
                try {
                    const res = await fetch(`http://localhost:3001/api/db/file-schema?path=${encodeURIComponent(obj.path)}`);
                    if (res.ok) {
                        const columns = await res.json();
                        schemaStr += `CREATE TABLE '${obj.name}' (\n`;
                        schemaStr += columns.map(col => `  ${col.column_name} ${col.column_type}`).join(',\n');
                        schemaStr += `\n);\n\n`;
                    } else {
                        schemaStr += `-- Warning: Could not fetch schema for file ${obj.name}\n\n`;
                    }
                } catch (e) {
                    console.error("Could not fetch schema for file", obj.name);
                    schemaStr += `-- Error fetching schema for file ${obj.name}\n\n`;
                }
            }
        }
        return schemaStr;
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const handleGenerate = async () => {
        if (!question.trim()) return;

        setErrorMsg(null);
        if (contextObjects.length === 0) {
            setErrorMsg("Please drop at least one table or file to provide context.");
            return;
        }

        const modelToUse = selectedModel === 'custom' ? customModel : selectedModel;
        if (!modelToUse) {
            setErrorMsg("Please select or enter a model name.");
            return;
        }

        abortControllerRef.current = new AbortController();
        setIsGenerating(true);
        setIsHoveringGenBtn(false);
        setGeneratedSql('');

        try {
            const schema = await buildSchemaContext();

            const res = await fetch('http://localhost:3001/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schema,
                    question,
                    provider,
                    model: modelToUse
                }),
                signal: abortControllerRef.current.signal
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setGeneratedSql(data.sql);

            // Optionally, save the model as default config in the background
            fetch('http://localhost:3001/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defaultModel: modelToUse })
            }).catch(() => { });

        } catch (e) {
            if (e.name === 'AbortError') {
                setErrorMsg("Generation cancelled by user.");
            } else {
                setErrorMsg("Generation failed: " + e.message);
            }
        } finally {
            setIsGenerating(false);
            setIsHoveringGenBtn(false);
            abortControllerRef.current = null;
        }
    };

    return (
        <div style={{
            width: width, height: '100%',
            backgroundColor: 'var(--sidebar-bg)', borderLeft: '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', color: 'var(--text-color)', fontFamily: 'system-ui, sans-serif'
        }}>
            {/* Header - Aligned to app.jsx toolbar height */}
            <div style={{ height: '40px', padding: '0 16px', boxSizing: 'border-box', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LuBot size={16} style={{ color: 'var(--accent-color-user)' }} />
                    <span style={{ fontWeight: '500', color: 'var(--text-active)', fontSize: '13px' }}>AmoxSQL AI</span>
                </div>
                <button onClick={onClose} style={{ padding: 0, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <LuX size={16} />
                </button>
            </div>

            {status === 'LOADING' && (
                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <LuLoader size={30} style={{ marginBottom: '15px', animation: 'spin 2s linear infinite', color: 'var(--accent-color-user)' }} />
                    <h3 style={{ color: 'var(--text-active)', margin: '0 0 10px 0', fontSize: '14px' }}>Loading AI Engine...</h3>
                </div>
            )}

            {status === 'ERROR' && (
                <div style={{ padding: '20px', color: 'var(--feedback-error-text)', textAlign: 'center', fontSize: '13px' }}>
                    Error loading AI configuration. Check server logs.
                    <button onClick={() => setStatus('READY')} style={{ display: 'block', margin: '15px auto', padding: '5px 10px', backgroundColor: 'var(--feedback-error-text)', color: 'var(--button-text-color)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Retry</button>
                </div>
            )}

            {status === 'READY' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Section 0: Provider Details & Model */}
                    <div style={{ padding: '15px 20px', paddingBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {provider === 'ollama' ? <LuCpu size={14} color="var(--text-muted)" /> : <LuCloud size={14} color="var(--text-muted)" />}
                                <div style={{ fontSize: '12px', color: 'var(--text-active)', fontWeight: 'bold' }}>
                                    {provider === 'ollama' ? 'Ollama (Local Engine)' : 'Google Gemini'}
                                </div>
                            </div>
                        </div>

                        {provider === 'ollama' && isModelsLoading ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}>
                                <LuLoader size={12} style={{ animation: 'spin 2s linear infinite' }} /> Loading models...
                            </div>
                        ) : provider === 'ollama' && installedModels.length === 0 ? (
                            <div style={{
                                backgroundColor: 'var(--feedback-warning-bg)', border: '1px solid var(--feedback-warning-border)', borderRadius: '6px',
                                padding: '12px', fontSize: '12px', color: 'var(--feedback-warning-text)', display: 'flex', flexDirection: 'column', gap: '8px'
                            }}>
                                <span>No local models installed.</span>
                                <button onClick={() => { if (onOpenSettings) onOpenSettings('ai'); else alert('Open Settings > AI Assistant to install models.'); }} style={{
                                    backgroundColor: 'var(--feedback-warning-text)', color: 'var(--surface-base)', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                                }}>Install Models in Settings</button>
                            </div>
                        ) : (
                            <>
                                <select
                                    value={selectedModel}
                                    onChange={(e) => setSelectedModel(e.target.value)}
                                    style={{
                                        width: '100%', padding: '8px', fontSize: '12px',
                                        backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                        border: '1px solid var(--border-color)', borderRadius: '4px', outline: 'none', cursor: 'pointer'
                                    }}
                                >
                                    {provider === 'ollama' ? (
                                        installedModels.map(m => (
                                            <option key={m.name} value={m.name}>{m.name} ({(m.size / 1024 / 1024 / 1024).toFixed(1)}GB)</option>
                                        ))
                                    ) : (
                                        GEMINI_MODELS.map(m => (
                                            <option key={m.id} value={m.id}>{m.label} ({m.size})</option>
                                        ))
                                    )}
                                </select>

                                {selectedModel === 'custom' && provider === 'gemini' && (
                                    <input
                                        type="text"
                                        value={customModel}
                                        onChange={(e) => setCustomModel(e.target.value)}
                                        placeholder="e.g. gemini-1.5-pro"
                                        style={{
                                            width: '100%', padding: '8px', fontSize: '12px', marginTop: '8px',
                                            backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                            border: '1px solid var(--border-color)', borderRadius: '4px', boxSizing: 'border-box', outline: 'none'
                                        }}
                                    />
                                )}
                            </>
                        )}
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            {provider === 'ollama' ? 'Local models run entirely on your RAM.' : 'Cloud models require internet access & API Key.'}
                        </div>
                    </div>

                    {/* Section 1: Context (Drag & Drop Zone) */}
                    <div style={{ padding: '10px 20px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
                            <LuDatabase size={12} />
                            <span>Context Objects</span>
                        </div>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={handleDrop}
                            style={{
                                minHeight: '80px', maxHeight: '150px', overflowY: 'auto',
                                border: isDragOver ? '2px dashed var(--accent-color-user)' : '2px dashed var(--border-color)',
                                backgroundColor: isDragOver ? 'var(--accent-color-user-transparent)' : 'var(--input-bg)',
                                borderRadius: '6px', padding: '10px', transition: 'all 0.2s',
                                display: 'flex', flexDirection: 'column', gap: '6px'
                            }}
                        >
                            {contextObjects.length === 0 ? (
                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', margin: 'auto' }}>
                                    Drag and drop tables or files here...
                                </div>
                            ) : (
                                contextObjects.map((obj, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--sidebar-item-active-bg)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            {obj.type === 'table' ? <LuTable size={12} color="var(--accent-color-user)" /> : <LuFile size={12} color="#CE9178" />}
                                            <span style={{ fontSize: '12px', color: 'var(--text-active)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.name}</span>
                                        </div>
                                        <button onClick={() => removeContextObj(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                                            <LuX size={12} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Section 2: Question & Action */}
                    <div style={{ padding: '10px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {errorMsg && (
                            <div style={{ padding: '8px 12px', marginBottom: '10px', backgroundColor: 'var(--feedback-error-bg)', border: '1px solid var(--feedback-error-border)', color: 'var(--feedback-error-text)', borderRadius: '4px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{errorMsg}</span>
                                <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: 'var(--feedback-error-text)', cursor: 'pointer', padding: 0 }}>
                                    <LuX size={14} />
                                </button>
                            </div>
                        )}
                        <textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask a question about your data..."
                            style={{
                                width: '100%', flex: 1, minHeight: '80px', boxSizing: 'border-box',
                                backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '6px',
                                padding: '12px', color: 'var(--text-active)', fontSize: '13px', resize: 'none', outline: 'none',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button
                            onClick={isGenerating ? handleCancel : handleGenerate}
                            disabled={!isGenerating && (!question.trim() || (provider === 'ollama' && installedModels.length === 0))}
                            onMouseEnter={() => setIsHoveringGenBtn(true)}
                            onMouseLeave={() => setIsHoveringGenBtn(false)}
                            style={{
                                marginTop: '12px', padding: '10px',
                                backgroundColor: isGenerating
                                    ? (isHoveringGenBtn ? 'var(--feedback-error-text)' : 'var(--border-color)')
                                    : ((!question.trim() || (provider === 'ollama' && installedModels.length === 0)) ? 'var(--border-color)' : 'var(--accent-color-user)'),
                                color: isGenerating && !isHoveringGenBtn ? 'var(--text-color)' : 'var(--button-text-color)',
                                border: 'none', borderRadius: '4px', fontWeight: 'bold',
                                cursor: (!isGenerating && (!question.trim() || (provider === 'ollama' && installedModels.length === 0))) ? 'not-allowed' : 'pointer',
                                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s',
                                fontSize: '13px'
                            }}
                        >
                            {isGenerating ? (
                                isHoveringGenBtn ? <><LuBan size={16} /> Cancel Generation</> : <><LuLoader size={16} style={{ animation: 'spin 2s linear infinite' }} /> Thinking...</>
                            ) : (
                                <><LuSparkles size={16} /> Generate SQL</>
                            )}
                        </button>
                    </div>

                    {/* Section 3: Response */}
                    <div style={{ padding: '15px 20px', borderTop: '1px solid var(--border-color)', height: '35%', backgroundColor: 'var(--sidebar-item-active-bg)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Generated SQL</div>
                            {generatedSql && (
                                <button
                                    onClick={() => navigator.clipboard.writeText(generatedSql)}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent-color-user)', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', padding: 0 }}
                                >
                                    Copy Script
                                </button>
                            )}
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px' }}>
                            <pre style={{
                                margin: 0,
                                fontSize: '13px', color: 'var(--text-active)', whiteSpace: 'pre-wrap', fontFamily: 'monospace'
                            }}>
                                {generatedSql || <span style={{ color: 'var(--text-muted)' }}>Result will appear here...</span>}
                            </pre>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default AiSidebar;
