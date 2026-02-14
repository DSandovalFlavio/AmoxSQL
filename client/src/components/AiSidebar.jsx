import { useState, useEffect } from 'react';

const AiSidebar = ({ width, onClose, availableTables }) => {
    const [status, setStatus] = useState('IDLE'); // IDLE, DOWNLOADING, LOADING, READY, ERROR
    const [progress, setProgress] = useState(0);
    const [selectedTables, setSelectedTables] = useState([]);

    const [question, setQuestion] = useState('');
    const [generatedSql, setGeneratedSql] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Poll status on mount
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/ai/status');
                const data = await res.json();
                setStatus(data.status);
                setProgress(data.progress);
            } catch (e) {
                console.error("AI Status check failed", e);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    // Helper to get schema for selected tables
    const buildSchemaContext = () => {
        // availableTables is [{ name, columns: [{column_name, data_type}] }]
        // Filter by selectedTables
        // If none selected, maybe use all? Or warn?
        // Let's use selected ones.

        const tablesToUse = availableTables.filter(t => selectedTables.includes(t.name));
        if (tablesToUse.length === 0) return '';

        let schemaStr = '';
        tablesToUse.forEach(t => {
            schemaStr += `CREATE TABLE ${t.name} (\n`;
            schemaStr += t.columns.map(c => `  ${c.column_name} ${c.data_type}`).join(',\n');
            schemaStr += `\n);\n\n`;
        });
        return schemaStr;
    };

    const handleCreateAiSession = async () => {
        await fetch('http://localhost:3001/api/ai/init', { method: 'POST' });
        setStatus('DOWNLOADING'); // Optimistic update
    };

    const handleGenerate = async () => {
        if (!question.trim()) return;

        const schema = buildSchemaContext();
        if (!schema) {
            alert("Please select at least one table to provide context.");
            return;
        }

        setIsGenerating(true);
        setGeneratedSql('');

        try {
            const res = await fetch('http://localhost:3001/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schema, question })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setGeneratedSql(data.sql);
        } catch (e) {
            alert("Generation failed: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleTable = (name) => {
        setSelectedTables(prev =>
            prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
        );
    };

    return (
        <div style={{
            width: width,
            height: '100%',
            backgroundColor: '#1A1B1E',
            borderLeft: '1px solid #2C2E33',
            display: 'flex',
            flexDirection: 'column',
            color: '#c9c9c9',
            fontFamily: 'system-ui, sans-serif'
        }}>
            {/* Header */}
            <div style={{ padding: '15px', borderBottom: '1px solid #2C2E33', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🤖</span>
                    <span style={{ fontWeight: 'bold', color: '#fff' }}>AmoxSQL AI</span>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}>×</button>
            </div>

            {/* Init / Status View */}
            {(status === 'IDLE' || status === 'DOWNLOADING' || status === 'LOADING') && (
                <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    {status === 'IDLE' ? (
                        <>
                            <div style={{ fontSize: '40px', marginBottom: '20px' }}>🧠</div>
                            <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>Enable Intelligence</h3>
                            <p style={{ fontSize: '13px', color: '#888', lineHeight: '1.5' }}>
                                Download the Qwen3-0.6B model (~660MB) to enable local query generation.
                            </p>
                            <button
                                onClick={handleCreateAiSession}
                                style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#00ffff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', color: '#141517' }}
                            >
                                Download & Start
                            </button>
                        </>
                    ) : status === 'LOADING' ? (
                        <>
                            <div style={{ fontSize: '30px', marginBottom: '15px', animation: 'spin 2s linear infinite' }}>⚙️</div>
                            <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>Loading Model...</h3>
                            <p style={{ fontSize: '13px', color: '#888' }}>Initializing Llama Engine.</p>
                        </>
                    ) : (
                        <>
                            <div style={{ marginBottom: '15px', color: '#00ffff', fontWeight: 'bold' }}>Downloading Model...</div>
                            <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, height: '100%', background: '#00ffff', transition: 'width 0.3s' }}></div>
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#888' }}>{progress}%</div>
                        </>
                    )}
                </div>
            )
            }

            {/* ERROR View */}
            {
                status === 'ERROR' && (
                    <div style={{ padding: '20px', color: '#ff6b6b', textAlign: 'center' }}>
                        Error loading AI engine. Check server logs.
                        <button onClick={handleCreateAiSession} style={{ display: 'block', margin: '15px auto', padding: '5px 10px' }}>Retry</button>
                    </div>
                )
            }

            {/* READY View */}
            {
                status === 'READY' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* Section 1: Context (Tables) */}
                        <div style={{ padding: '15px', borderBottom: '1px solid #2C2E33', maxHeight: '30%' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#888', marginBottom: '10px' }}>Context (Select Tables)</div>
                            <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                                {availableTables.map(t => (
                                    <label key={t.name} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedTables.includes(t.name)}
                                            onChange={() => toggleTable(t.name)}
                                            style={{ marginRight: '8px' }}
                                        />
                                        <span style={{ color: selectedTables.includes(t.name) ? '#fff' : '#888' }}>{t.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Section 2: Question */}
                        <div style={{ padding: '15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#888', marginBottom: '10px' }}>Your Question</div>
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="Ex: What is the total revenue by category?"
                                style={{
                                    width: '100%', flex: 1,
                                    backgroundColor: '#141517', border: '1px solid #333', borderRadius: '4px',
                                    padding: '10px', color: '#fff', fontSize: '13px', resize: 'none', outline: 'none'
                                }}
                            />
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || !question.trim()}
                                style={{
                                    marginTop: '10px', padding: '10px',
                                    backgroundColor: isGenerating ? '#333' : '#00ffff', color: '#141517',
                                    border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: isGenerating ? 'wait' : 'pointer'
                                }}
                            >
                                {isGenerating ? 'Thinking...' : 'Generate SQL ✨'}
                            </button>
                        </div>

                        {/* Section 3: Response */}
                        <div style={{ padding: '15px', borderTop: '1px solid #2C2E33', height: '40%', backgroundColor: '#141517' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#888' }}>Generated SQL</div>
                                {generatedSql && (
                                    <button
                                        onClick={() => navigator.clipboard.writeText(generatedSql)}
                                        style={{ background: 'none', border: 'none', color: '#00ffff', fontSize: '11px', cursor: 'pointer' }}
                                    >
                                        Copy
                                    </button>
                                )}
                            </div>
                            <pre style={{
                                margin: 0, height: 'calc(100% - 25px)', overflow: 'auto',
                                fontSize: '12px', color: '#a5d6ff', whiteSpace: 'pre-wrap', fontFamily: 'monospace'
                            }}>
                                {generatedSql || <span style={{ color: '#444' }}>Result will appear here...</span>}
                            </pre>
                        </div>

                    </div>
                )
            }
        </div >
    );
};

export default AiSidebar;
