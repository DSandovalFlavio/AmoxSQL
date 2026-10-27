import { useState } from 'react';
import { LuX, LuCheck, LuTriangleAlert } from 'react-icons/lu';
import { esSpecVega } from '../vega/figura';

/** Los campos que nombra un spec de Vega-Lite (encodings, capas, facetas). */
function camposDe(spec, fuera = new Set()) {
    if (!spec || typeof spec !== 'object') return fuera;
    if (Array.isArray(spec)) { spec.forEach(x => camposDe(x, fuera)); return fuera; }
    for (const [k, v] of Object.entries(spec)) {
        if (k === 'field' && typeof v === 'string') fuera.add(v.split('.')[0].replace(/\\/g, ''));
        else if (k !== 'data' && k !== 'transform' && v && typeof v === 'object') camposDe(v, fuera);
    }
    return fuera;
}

/** Los campos que el propio spec crea (calculate, aggregate, window…). */
function camposCreados(spec, dentro = new Set()) {
    if (!spec || typeof spec !== 'object') return dentro;
    if (Array.isArray(spec)) { spec.forEach(x => camposCreados(x, dentro)); return dentro; }
    for (const [k, v] of Object.entries(spec)) {
        if (k === 'as') (Array.isArray(v) ? v : [v]).forEach(x => typeof x === 'string' && dentro.add(x));
        else if (v && typeof v === 'object') camposCreados(v, dentro);
    }
    return dentro;
}

/**
 * PasteJsonModal — Importa un gráfico pegando JSON: un spec de Vega-Lite (lo que
 * escribe la skill «Data & Viz» y cualquier chat) o la configuración plana de
 * los paneles. Se aplica vía loadConfig() (useChartState → LOAD_CONFIG): un spec
 * entra en modo código y los paneles toman lo que entienden (Dec-77).
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
    // Con avisos, el primer «Apply» los enseña y el segundo aplica.
    const [revisado, setRevisado] = useState(false);

    if (!isOpen) return null;

    const validate = (text) => {
        setError(null);
        setWarnings([]);
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            setError(`Invalid JSON: ${e.message}`);
            return null;
        }
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
            setError('The JSON has to be a Vega-Lite spec or a configuration object, not an array or a single value.');
            return null;
        }

        // Un spec de Vega-Lite: los datos son SIEMPRE el resultado, por nombre.
        if (esSpecVega(parsed)) {
            const warns = [];
            const d = parsed.data;
            if (!d || d.name !== 'dataset') {
                if (d) warns.push('Its data was replaced by this result ("data": {"name": "dataset"}).');
                parsed = { ...parsed, data: { name: 'dataset' } };
            }
            if (columns.length > 0) {
                const creados = camposCreados(parsed);
                for (const c of camposDe(parsed)) {
                    if (!columns.includes(c) && !creados.has(c)) warns.push(`Column "${c}" is not in the current result.`);
                }
            }
            setWarnings(warns);
            return { parsed, warns };
        }

        // Validación ligera de keys contra columnas conocidas
        const warns = [];
        if (columns.length > 0) {
            if (parsed.xAxisKey && !columns.includes(parsed.xAxisKey)) {
                warns.push(`Column "${parsed.xAxisKey}" (xAxisKey) is not in the current result.`);
            }
            if (Array.isArray(parsed.yAxisKeys)) {
                for (const k of parsed.yAxisKeys) {
                    if (!columns.includes(k)) warns.push(`Column "${k}" (yAxisKeys) is not in the current result.`);
                }
            }
            if (parsed.splitByKey && parsed.splitByKey !== '' && !columns.includes(parsed.splitByKey)) {
                warns.push(`Column "${parsed.splitByKey}" (splitByKey) is not in the current result.`);
            }
            setWarnings(warns);
        }
        return { parsed, warns };
    };

    const handleApply = () => {
        const r = validate(json);
        if (!r) return;
        if (!revisado && r.warns.length) { setRevisado(true); return; }
        setRevisado(false);
        onApply(r.parsed);
        setJson('');
        setError(null);
        setWarnings([]);
        onClose();
    };

    const handleChange = (e) => {
        setJson(e.target.value);
        setRevisado(false);
        setError(null);
        setWarnings([]);
    };

    return (
        <div
            className="modal-overlay"
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                backgroundColor: 'var(--overlay-bg)',
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
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-active)' }}>Paste a chart</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <LuX size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Paste a Vega-Lite spec (what the AmoxSQL Data &amp; Viz Skill and most assistants write) or a Story Flow configuration.
                        It draws the current result; the panels pick up what they understand and the rest stays as code.
                    </p>

                    <textarea
                        value={json}
                        onChange={handleChange}
                        placeholder={'{\n  "data": {"name": "dataset"},\n  "mark": "line",\n  "encoding": {\n    "x": {"field": "month", "type": "temporal"},\n    "y": {"field": "revenue", "type": "quantitative"}\n  }\n}'}
                        spellCheck={false}
                        style={{
                            width: '100%',
                            height: 220,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: 12,
                            lineHeight: 1.5,
                            padding: '10px 12px',
                            background: 'var(--input-bg)',
                            border: `1px solid ${error ? 'color-mix(in srgb, var(--color-error) 50%, transparent)' : 'var(--border-color)'}`,
                            borderRadius: 6,
                            color: 'var(--text-active)',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                        }}
                    />

                    {/* Error */}
                    {error && (
                        <div style={{ padding: '8px 12px', background: 'var(--color-error-bg)', border: '1px solid color-mix(in srgb, var(--color-error) 30%, transparent)', borderRadius: 6, fontSize: 12, color: 'var(--color-error)', lineHeight: 1.4 }}>
                            {error}
                        </div>
                    )}

                    {/* Column warnings (non-blocking) */}
                    {warnings.length > 0 && (
                        <div style={{ padding: '8px 12px', background: 'var(--color-warning-bg)', border: '1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)', borderRadius: 6, fontSize: 12, color: 'var(--color-warning)', lineHeight: 1.5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 600 }}>
                                <LuTriangleAlert size={13} /> Check before applying
                            </div>
                            {warnings.map((w, i) => <div key={i}>· {w}</div>)}
                            <div style={{ marginTop: 6, opacity: 0.8 }}>
                                Did you run the same query? Apply again to use it anyway.
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
                        Cancel
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
                        <LuCheck size={14} /> {revisado ? 'Apply anyway' : 'Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasteJsonModal;
