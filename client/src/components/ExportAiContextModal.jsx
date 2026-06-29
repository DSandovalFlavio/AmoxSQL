import { API_BASE } from '../api.js';
import { useState, useEffect, useMemo } from 'react';
import { LuX, LuCopy, LuDownload, LuCheck, LuTriangleAlert, LuSparkles } from 'react-icons/lu';
import { useToast } from './ToastProvider';

const SIZE_WARN_BYTES = 12 * 1024; // 12 KB — typical limit for external AI chats

const normalizePath = (p) => (p || '').replace(/\\/g, '/');
const fileExt = (name) => (name || '').split('.').pop()?.toLowerCase() || '';
const isExcel = (name) => ['xlsx', 'xls'].includes(fileExt(name));

/** Construye una query DuckDB para leer un archivo según su extensión. */
function buildFileQuery(path, name, sheet) {
    const p = normalizePath(path);
    const ext = fileExt(name);
    if (ext === 'parquet') return `SELECT * FROM read_parquet('${p}')`;
    if (ext === 'json') return `SELECT * FROM read_json_auto('${p}')`;
    if (ext === 'xlsx' || ext === 'xls') return `SELECT * FROM read_xlsx('${p}', sheet='${sheet || 'Sheet1'}')`;
    // csv, tsv, txt — read_csv_auto detecta delimitador (coma, tab, etc.)
    return `SELECT * FROM read_csv_auto('${p}')`;
}

/**
 * ExportAiContextModal — Genera un documento de contexto listo para pegar
 * en un chat de AI externo, con schema DuckDB, muestra de datos y perfil opcional.
 *
 * Modos:
 *   - Resultados:  pasar `query` (la query ya ejecutada).
 *   - Archivo:     pasar `fileRef = { path, name }`. Para Excel muestra selector de hoja.
 */
const ExportAiContextModal = ({ isOpen, onClose, query: queryProp, fileRef = null }) => {
    const toast = useToast();
    const [sampleRows, setSampleRows] = useState(20);
    const [includeProfile, setIncludeProfile] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // { markdown, rowCount, columnCount, estimatedBytes }
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    // Excel sheet handling (only when fileRef is an Excel file)
    const [sheets, setSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [loadingSheets, setLoadingSheets] = useState(false);

    const excelMode = fileRef && isExcel(fileRef.name);

    // Reset state on close
    useEffect(() => {
        if (!isOpen) {
            setResult(null);
            setError(null);
            setCopied(false);
            setSheets([]);
            setSelectedSheet('');
        }
    }, [isOpen]);

    // Fetch Excel sheets when opening on an Excel file
    useEffect(() => {
        if (!isOpen || !excelMode) return;
        let cancelled = false;
        (async () => {
            setLoadingSheets(true);
            try {
                const res = await fetch(`${API_BASE}/api/files/inspect-columns?path=${encodeURIComponent(fileRef.path)}`);
                const data = await res.json();
                if (cancelled) return;
                const list = data.sheets || [];
                setSheets(list);
                setSelectedSheet(list[0] || 'Sheet1');
            } catch {
                if (!cancelled) { setSheets([]); setSelectedSheet('Sheet1'); }
            } finally {
                if (!cancelled) setLoadingSheets(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, excelMode, fileRef?.path]);

    // The effective query to send to the backend
    const effectiveQuery = useMemo(() => {
        if (fileRef) return buildFileQuery(fileRef.path, fileRef.name, selectedSheet);
        return queryProp;
    }, [fileRef, queryProp, selectedSheet]);

    const sourceLabel = fileRef ? fileRef.name : 'query activa';

    if (!isOpen) return null;

    const handleGenerate = async () => {
        if (!effectiveQuery) {
            setError('No hay una fuente de datos para exportar.');
            return;
        }
        setLoading(true);
        setError(null);
        setResult(null);
        setCopied(false);
        try {
            const res = await fetch(`${API_BASE}/api/ai/export-context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: effectiveQuery, sampleRows, includeProfile }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al generar el contexto');
            setResult(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (!result?.markdown) return;
        try {
            await navigator.clipboard.writeText(result.markdown);
            setCopied(true);
            toast.success('Contexto copiado al portapapeles');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('No se pudo copiar al portapapeles');
        }
    };

    const handleDownload = () => {
        if (!result?.markdown) return;
        const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'amoxsql-context.md';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Contexto descargado como amoxsql-context.md');
    };

    const sizeKb = result ? (result.estimatedBytes / 1024).toFixed(1) : null;
    const sizeWarn = result && result.estimatedBytes > SIZE_WARN_BYTES;

    return (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                backgroundColor: 'rgba(0,0,0,0.6)',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
            }}
            onClick={onClose}
        >
            <div
                className="modal-panel"
                style={{
                    backgroundColor: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                    borderRadius: '12px', padding: '24px', width: '480px',
                    boxShadow: 'var(--shadow-lg)', maxHeight: '85vh', overflowY: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <LuSparkles size={16} /> Export for AI
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <LuX size={18} />
                    </button>
                </div>

                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Genera un documento de contexto con el schema y muestra de <strong>{sourceLabel}</strong>.
                    Pégalo en tu asistente de AI junto con la Skill descargable desde Configuración.
                </p>

                {/* Excel sheet selector */}
                {excelMode && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
                            Hoja de Excel
                        </label>
                        <select
                            value={selectedSheet}
                            onChange={(e) => { setSelectedSheet(e.target.value); setResult(null); }}
                            disabled={loadingSheets}
                            style={{
                                width: '100%', padding: '8px 10px', fontSize: 13,
                                backgroundColor: 'var(--input-bg)', color: 'var(--text-active)',
                                border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer',
                            }}
                        >
                            {loadingSheets && <option>Cargando hojas…</option>}
                            {!loadingSheets && sheets.length === 0 && <option value="Sheet1">Sheet1</option>}
                            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                )}

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
                    {/* Sample rows slider */}
                    <div>
                        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span>Filas de muestra</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-active)' }}>{sampleRows}</span>
                        </label>
                        <input
                            type="range" min={5} max={200} step={5} value={sampleRows}
                            onChange={(e) => { setSampleRows(Number(e.target.value)); setResult(null); }}
                            style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            <span>5</span><span>200</span>
                        </div>
                    </div>

                    {/* Profile toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                        <input
                            type="checkbox" checked={includeProfile}
                            onChange={(e) => { setIncludeProfile(e.target.checked); setResult(null); }}
                            style={{ width: 15, height: 15, cursor: 'pointer' }}
                        />
                        <span>
                            Incluir perfil estadístico
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                                (nulls %, únicos, min/max, top valores)
                            </span>
                        </span>
                    </label>
                </div>

                {/* Generate button */}
                <button
                    onClick={handleGenerate}
                    disabled={loading || !effectiveQuery || (excelMode && loadingSheets)}
                    style={{
                        width: '100%', padding: '10px', borderRadius: 6, cursor: loading ? 'wait' : 'pointer',
                        backgroundColor: 'var(--accent-primary)', color: 'var(--button-text-color)',
                        border: '1px solid var(--accent-primary)', fontSize: 13, fontWeight: 600,
                        opacity: (loading || !effectiveQuery) ? 0.6 : 1,
                    }}
                >
                    {loading ? 'Generando…' : result ? 'Regenerar contexto' : 'Generar contexto'}
                </button>

                {/* Error */}
                {error && (
                    <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: '#ef4444' }}>
                        {error}
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                        {/* Metadata strip */}
                        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-muted)', alignItems: 'center', flexWrap: 'wrap' }}>
                            <span>{result.columnCount} columnas</span>
                            <span>·</span>
                            <span>{Number(result.rowCount).toLocaleString()} filas totales</span>
                            <span>·</span>
                            <span style={{ color: sizeWarn ? '#f59e0b' : 'inherit' }}>
                                {sizeWarn && <LuTriangleAlert size={12} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
                                ≈ {sizeKb} KB
                                {sizeWarn && ' — puede exceder el límite de algunos chats'}
                            </span>
                        </div>

                        {/* Preview */}
                        <div style={{
                            background: 'var(--input-bg)', border: '1px solid var(--border-color)', borderRadius: 6,
                            padding: '10px 12px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 1.5,
                            maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', userSelect: 'text',
                        }}>
                            {result.markdown.slice(0, 1200)}{result.markdown.length > 1200 ? '\n…' : ''}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={handleCopy}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                                    background: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                                }}
                            >
                                {copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                            <button
                                onClick={handleDownload}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                                    background: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                                }}
                            >
                                <LuDownload size={14} />
                                Descargar .md
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportAiContextModal;
