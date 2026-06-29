import { useState } from 'react';
import { LuX, LuCheck, LuTriangleAlert } from 'react-icons/lu';

/**
 * PasteJsonModal — Importa una configuración de gráfico pegando JSON.
 * El JSON se valida y aplica vía loadConfig() (useChartState → LOAD_CONFIG),
 * que ya hace merge con DEFAULT_CONFIG y migraciones legacy.
 *
 * Props:
 *   isOpen      - boolean
 *   onClose     - () => void
 *   onApply     - (config: object) => void   ← llama a loadConfig()
 *   columns     - string[]  columnas del dataset actual (para validar keys)
 */
const PasteJsonModal = ({ isOpen, onClose, onApply, columns = [] }) => {
    const [json, setJson] = useState('');
    const [error, setError] = useState(null);
    const [warnings, setWarnings] = useState([]);

    if (!isOpen) return null;

    const validate = (text) => {
        setError(null);
        setWarnings([]);
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            setError(`JSON inválido: ${e.message}`);
            return null;
        }
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
            setError('El JSON debe ser un objeto de configuración, no un array ni un valor primitivo.');
            return null;
        }

        // Validación ligera de keys contra columnas conocidas
        if (columns.length > 0) {
            const warns = [];
            if (parsed.xAxisKey && !columns.includes(parsed.xAxisKey)) {
                warns.push(`xAxisKey "${parsed.xAxisKey}" no encontrada en los datos actuales.`);
            }
            if (Array.isArray(parsed.yAxisKeys)) {
                for (const k of parsed.yAxisKeys) {
                    if (!columns.includes(k)) warns.push(`yAxisKeys: "${k}" no encontrada en los datos actuales.`);
                }
            }
            if (parsed.splitByKey && parsed.splitByKey !== '' && !columns.includes(parsed.splitByKey)) {
                warns.push(`splitByKey "${parsed.splitByKey}" no encontrada en los datos actuales.`);
            }
            setWarnings(warns);
        }
        return parsed;
    };

    const handleApply = () => {
        const parsed = validate(json);
        if (!parsed) return;
        onApply(parsed);
        setJson('');
        setError(null);
        setWarnings([]);
        onClose();
    };

    const handleChange = (e) => {
        setJson(e.target.value);
        setError(null);
        setWarnings([]);
    };

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
                    borderRadius: '12px', padding: '24px', width: '520px',
                    boxShadow: 'var(--shadow-lg)', maxHeight: '85vh', overflowY: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-active)' }}>Pegar configuración JSON</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <LuX size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Pega el JSON de configuración generado por tu asistente de AI.
                        La configuración se aplicará a los datos cargados actualmente en Story Flow.
                    </p>

                    <textarea
                        value={json}
                        onChange={handleChange}
                        placeholder={'{\n  "chartType": "line",\n  "xAxisKey": "mes",\n  "yAxisKeys": ["ingresos"],\n  "chartTitle": "Ingresos mensuales"\n}'}
                        spellCheck={false}
                        style={{
                            width: '100%',
                            height: 220,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 12,
                            lineHeight: 1.5,
                            padding: '10px 12px',
                            background: 'var(--input-bg)',
                            border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'var(--border-color)'}`,
                            borderRadius: 6,
                            color: 'var(--text-active)',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                        }}
                    />

                    {/* Error */}
                    {error && (
                        <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 12, color: '#ef4444', lineHeight: 1.4 }}>
                            {error}
                        </div>
                    )}

                    {/* Column warnings (non-blocking) */}
                    {warnings.length > 0 && (
                        <div style={{ padding: '8px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, fontSize: 12, color: '#f59e0b', lineHeight: 1.5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 600 }}>
                                <LuTriangleAlert size={13} /> Columnas no encontradas en los datos actuales
                            </div>
                            {warnings.map((w, i) => <div key={i}>· {w}</div>)}
                            <div style={{ marginTop: 6, opacity: 0.8 }}>
                                La configuración se aplicará de todas formas. Verifica que ejecutaste la misma query.
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            background: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={!json.trim()}
                        style={{
                            padding: '8px 14px', borderRadius: 6, cursor: json.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
                            background: 'var(--accent-primary)', color: 'var(--button-text-color)', border: '1px solid var(--accent-primary)',
                            display: 'flex', alignItems: 'center', gap: 6, opacity: json.trim() ? 1 : 0.6,
                        }}
                    >
                        <LuCheck size={14} /> Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasteJsonModal;
