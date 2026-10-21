/**
 * ChainVariablesPanel — the process's parameters (5.11, D4).
 *
 * Each one is referenced in a node's configuration as ${name}. Its value here
 * is the default: the command line (--param), a batch, the form (D5) or a
 * schedule (D1) can give another one. A parameter may declare its TYPE — text,
 * number, date, list, yes/no —: then a value from outside is checked before
 * running and goes into the SQL with its type (see server/parametros.js).
 * "As written" keeps the old behaviour: the value is pasted as text.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LuX, LuPlus, LuMinus, LuVariable } from 'react-icons/lu';

const TIPOS = [
    { value: '', label: 'As written' },
    { value: 'texto', label: 'Text' },
    { value: 'numero', label: 'Number' },
    { value: 'fecha', label: 'Date' },
    { value: 'lista', label: 'List' },
    { value: 'logico', label: 'Yes / no' },
];

const filasDe = (variables, parametros) => {
    const defs = new Map((parametros || []).map(p => [p.nombre, p]));
    const nombres = [...new Set([...Object.keys(variables || {}), ...defs.keys()])];
    return nombres.map(k => {
        const d = defs.get(k) || {};
        return {
            key: k,
            value: String(variables?.[k] ?? ''),
            tipo: d.tipo || '',
            etiqueta: d.etiqueta || '',
            opciones: (d.opciones || []).join(', '),
        };
    });
};

/** The input for a default value, by type. */
function Valor({ fila, onChange }) {
    const comun = { className: 'cvp-input', value: fila.value, onChange: (e) => onChange(e.target.value), 'aria-label': `Default value of ${fila.key || 'the parameter'}` };
    if (fila.tipo === 'fecha') return <input type="date" {...comun} />;
    if (fila.tipo === 'numero') return <input type="number" step="any" {...comun} />;
    if (fila.tipo === 'logico') {
        return (
            <select {...comun}>
                <option value="">—</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
            </select>
        );
    }
    if (fila.tipo === 'lista') {
        const ops = fila.opciones.split(',').map(s => s.trim()).filter(Boolean);
        return (
            <select {...comun}>
                <option value="">—</option>
                {ops.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        );
    }
    return <input type="text" placeholder="value" {...comun} />;
}

const ChainVariablesPanel = ({ variables = {}, parametros = [], onChange, onClose }) => {
    const [rows, setRows] = useState(() => filasDe(variables, parametros));

    const commit = (newRows) => {
        setRows(newRows);
        const vars = {};
        const defs = [];
        for (const r of newRows) {
            const k = r.key.trim();
            if (!k) continue;
            vars[k] = r.value;
            if (r.tipo) {
                defs.push({
                    nombre: k, tipo: r.tipo,
                    ...(r.etiqueta.trim() ? { etiqueta: r.etiqueta.trim() } : {}),
                    ...(r.tipo === 'lista' ? { opciones: r.opciones.split(',').map(s => s.trim()).filter(Boolean) } : {}),
                });
            }
        }
        onChange?.({ variables: vars, parametros: defs });
    };

    const addRow = () => commit([...rows, { key: '', value: '', tipo: '', etiqueta: '', opciones: '' }]);
    const updateRow = (i, patch) => commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const removeRow = (i) => commit(rows.filter((_, j) => j !== i));
    const nombreMalo = (k) => k.trim() && !/^[A-Za-z_]\w*$/.test(k.trim());

    const modal = (
        <div className="modal-overlay cvp-fondo" onClick={onClose}>
            <div className="modal-panel cvp-panel" role="dialog" aria-labelledby="cvp-titulo" onClick={e => e.stopPropagation()}>
                <div className="cvp-cabecera">
                    <div className="cvp-titulo">
                        <LuVariable size={15} />
                        <span id="cvp-titulo">Parameters</span>
                    </div>
                    <button className="cvp-cerrar" onClick={onClose} aria-label="Close"><LuX size={15} /></button>
                </div>

                <div className="cvp-cuerpo">
                    <p className="cvp-intro">
                        Use them anywhere in a node's configuration as <code>{'${name}'}</code>: SQL, file names, filter values.
                        The value here is the default; the command line, a batch or the form can give another one.
                        With a <strong>type</strong>, a value that comes from outside is checked before running and goes into the SQL with its type,
                        so it can never change the query.
                    </p>

                    {rows.length === 0 && <div className="cvp-vacio">No parameters yet.</div>}

                    {rows.length > 0 && (
                        <div className="cvp-tabla" role="table" aria-label="Parameters">
                            <div className="cvp-fila cvp-fila--cab" role="row">
                                <span role="columnheader">Name</span>
                                <span role="columnheader">Type</span>
                                <span role="columnheader">Default</span>
                                <span role="columnheader">Label in the form</span>
                                <span />
                            </div>
                            {rows.map((r, i) => (
                                <div key={i} className="cvp-grupo" role="rowgroup">
                                    <div className="cvp-fila" role="row">
                                        <input className={`cvp-input cvp-mono${nombreMalo(r.key) ? ' cvp-input--mal' : ''}`} placeholder="name" value={r.key} spellCheck={false}
                                            aria-label="Name" onChange={e => updateRow(i, { key: e.target.value })} />
                                        <select className="cvp-input" value={r.tipo} aria-label={`Type of ${r.key || 'the parameter'}`} onChange={e => updateRow(i, { tipo: e.target.value })}>
                                            {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <Valor fila={r} onChange={(v) => updateRow(i, { value: v })} />
                                        <input className="cvp-input" placeholder={r.key || 'label'} value={r.etiqueta} disabled={!r.tipo}
                                            aria-label={`Label of ${r.key || 'the parameter'}`} onChange={e => updateRow(i, { etiqueta: e.target.value })} />
                                        <button className="cvp-quitar" onClick={() => removeRow(i)} title="Remove" aria-label={`Remove ${r.key || 'the parameter'}`}><LuMinus size={13} /></button>
                                    </div>
                                    {r.tipo === 'lista' && (
                                        <div className="cvp-opciones">
                                            <label>
                                                Options <small>(separated by commas)</small>
                                                <input className="cvp-input" value={r.opciones} placeholder="north, south, center" onChange={e => updateRow(i, { opciones: e.target.value })} />
                                            </label>
                                        </div>
                                    )}
                                    {nombreMalo(r.key) && <div className="cvp-aviso">A name uses letters, digits and _, and starts with a letter.</div>}
                                </div>
                            ))}
                        </div>
                    )}

                    <button className="cvp-anadir" onClick={addRow}><LuPlus size={13} /> Add parameter</button>
                    <p className="cvp-nota">
                        Without a type ("As written") the value is pasted as text, as before. From the command line, such a value can only be a number
                        or a single word where it goes into the SQL as code.
                    </p>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default ChainVariablesPanel;
