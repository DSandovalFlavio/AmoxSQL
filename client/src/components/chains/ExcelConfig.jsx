/**
 * ExcelConfig — the Excel node's settings (5.11, D3).
 *
 * Two ways to leave the result in Excel:
 *   - a new workbook: one sheet per connected node, in the order shown here,
 *     each with its name and, if needed, forced column formats;
 *   - the client's template: each connected node goes into a table of the
 *     template (it grows) or into a sheet starting at a cell.
 * Everything else about the format comes from the column types.
 */
import { useEffect, useMemo, useState } from 'react';
import { LuArrowDown, LuArrowUp, LuFolderOpen, LuPlus, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const FORMATOS = [
    { value: '', label: 'By its type' },
    { value: 'moneda', label: 'Currency ($1,234.50)' },
    { value: 'porcentaje', label: 'Percent (12.5%)' },
    { value: 'entero', label: 'Whole number (1,234)' },
    { value: 'decimal', label: 'Two decimals (1,234.50)' },
    { value: 'fecha', label: 'Date (2026-10-05)' },
    { value: 'texto', label: 'Text' },
];

/** The nodes connected to this one, in connection order. */
export function entradasDe(nodeId, chainDefinition) {
    const nodos = new Map((chainDefinition?.nodes || []).map(n => [n.id, n]));
    return (chainDefinition?.edges || [])
        .filter(e => e.target === nodeId && nodos.has(e.source))
        .map(e => ({ id: e.source, etiqueta: nodos.get(e.source).label || e.source }));
}

const ExcelConfig = ({ node, config, onChange, onChangeMulti, chainDefinition }) => {
    const modo = config.modo === 'plantilla' ? 'plantilla' : 'libro';
    const entradas = useMemo(() => entradasDe(node.id, chainDefinition), [node.id, chainDefinition]);

    const guardarComo = async () => {
        const r = await window.electronAPI?.saveFileDialog?.({
            defaultPath: config.outputPath || 'report.xlsx',
            filters: [{ name: 'Excel workbook', extensions: modo === 'plantilla' ? ['xlsx', 'xlsm'] : ['xlsx'] }],
        });
        if (r && !r.canceled && r.filePath) onChange('outputPath', r.filePath);
    };

    return (
        <div className="chain-config-section">
            <label>What to write</label>
            <div className="xls-modo" role="radiogroup" aria-label="What to write">
                <button type="button" role="radio" aria-checked={modo === 'libro'} className={modo === 'libro' ? 'activo' : ''}
                    onClick={() => onChange('modo', 'libro')}>A new workbook</button>
                <button type="button" role="radio" aria-checked={modo === 'plantilla'} className={modo === 'plantilla' ? 'activo' : ''}
                    onClick={() => onChange('modo', 'plantilla')}>Fill a template</button>
            </div>

            {modo === 'plantilla' && (
                <Plantilla config={config} onChangeMulti={onChangeMulti} entradas={entradas} />
            )}

            <label>Save as</label>
            <div className="chain-config-input-with-btn">
                <input type="text" className="chain-config-input" value={config.outputPath || ''} spellCheck={false}
                    onChange={(e) => onChange('outputPath', e.target.value)} placeholder="outputs/monthly_close_${mes}.xlsx" />
                {window.electronAPI?.saveFileDialog && (
                    <button className="chain-config-browse-btn" onClick={guardarComo} title="Choose where to save"><LuFolderOpen size={13} /></button>
                )}
            </div>
            <p className="chain-config-hint">
                Written aside and swapped in at the end. If someone has the file open in Excel, it waits a few seconds and then says who.
            </p>

            {modo === 'libro' && (
                <Hojas config={config} onChange={onChange} entradas={entradas} />
            )}
        </div>
    );
};

/** A new workbook: one sheet per input, ordered, named, with optional formats. */
function Hojas({ config, onChange, entradas }) {
    // The order the node says, then the inputs it does not mention yet.
    const filas = useMemo(() => {
        const dichas = (config.hojas || []).filter(h => entradas.some(e => e.id === h.desde));
        const resto = entradas.filter(e => !dichas.some(h => h.desde === e.id)).map(e => ({ desde: e.id }));
        return [...dichas, ...resto];
    }, [config.hojas, entradas]);
    const [abierta, setAbierta] = useState(null);
    const etiqueta = (id) => entradas.find(e => e.id === id)?.etiqueta || id;
    const guardar = (nuevas) => onChange('hojas', nuevas);
    const cambiar = (i, patch) => guardar(filas.map((h, k) => (k === i ? { ...h, ...patch } : h)));
    const mover = (i, d) => {
        const n = [...filas];
        const [x] = n.splice(i, 1);
        n.splice(i + d, 0, x);
        guardar(n);
    };

    if (!entradas.length) {
        return <p className="chain-config-hint chain-config-hint-info">Connect the nodes whose results go into the workbook: each one becomes a sheet.</p>;
    }
    return (
        <>
            <label>Sheets <span className="chain-config-optional">(one per connected node)</span></label>
            <ol className="xls-hojas">
                {filas.map((h, i) => {
                    const formatos = Object.entries(h.formatos || {});
                    return (
                        <li key={h.desde} className="xls-hoja">
                            <div className="xls-hoja-fila">
                                <span className="xls-hoja-num">{i + 1}</span>
                                <input type="text" className="chain-config-input" value={h.nombre ?? ''} placeholder={etiqueta(h.desde)}
                                    aria-label={`Sheet name for ${etiqueta(h.desde)}`} maxLength={31}
                                    onChange={(e) => cambiar(i, { nombre: e.target.value })} />
                                <button type="button" className="xls-icono" disabled={i === 0} onClick={() => mover(i, -1)} title="Move up" aria-label="Move up"><LuArrowUp size={12} /></button>
                                <button type="button" className="xls-icono" disabled={i === filas.length - 1} onClick={() => mover(i, 1)} title="Move down" aria-label="Move down"><LuArrowDown size={12} /></button>
                            </div>
                            <div className="xls-hoja-de">from <strong>{etiqueta(h.desde)}</strong>
                                {' · '}
                                <button type="button" className="xls-enlace" onClick={() => setAbierta(abierta === i ? null : i)}>
                                    {formatos.length ? `${formatos.length} column format${formatos.length > 1 ? 's' : ''}` : 'Column formats'}
                                </button>
                            </div>
                            {abierta === i && (
                                <Formatos formatos={h.formatos || {}} onChange={(f) => cambiar(i, { formatos: f })} />
                            )}
                        </li>
                    );
                })}
            </ol>
            <p className="chain-config-hint">
                Each column takes its format from its type: dates as dates, decimals with their places, whole numbers without separators (years and codes stay as they are). Headers are bold, fixed while scrolling, with a filter.
            </p>
        </>
    );
}

/** Forced formats for some columns of a sheet. */
function Formatos({ formatos, onChange }) {
    const filas = Object.entries(formatos);
    const [nueva, setNueva] = useState('');
    const quitar = (col) => { const f = { ...formatos }; delete f[col]; onChange(f); };
    return (
        <div className="xls-formatos">
            {filas.map(([col, f]) => (
                <div key={col} className="xls-formato">
                    <code>{col}</code>
                    <select className="chain-config-select" value={f} onChange={(e) => onChange({ ...formatos, [col]: e.target.value })} aria-label={`Format of ${col}`}>
                        {FORMATOS.filter(x => x.value).map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                    <button type="button" className="xls-icono" onClick={() => quitar(col)} title="Back to its type" aria-label={`Remove the format of ${col}`}><LuX size={12} /></button>
                </div>
            ))}
            <div className="xls-formato">
                <input type="text" className="chain-config-input" value={nueva} placeholder="column name" spellCheck={false}
                    onChange={(e) => setNueva(e.target.value)} aria-label="Column to format" />
                <button type="button" className="xls-icono" disabled={!nueva.trim()} title="Add" aria-label="Add a column format"
                    onClick={() => { onChange({ ...formatos, [nueva.trim()]: 'moneda' }); setNueva(''); }}><LuPlus size={12} /></button>
            </div>
        </div>
    );
}

/** The client's template: which table, or which sheet and cell, each input fills. */
function Plantilla({ config, onChangeMulti, entradas }) {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState(null);
    const ruta = config.plantilla || '';

    useEffect(() => {
        if (!ruta.trim()) { setInfo(null); setError(null); return; }
        let vivo = true;
        const t = setTimeout(() => {
            fetch(`${API_BASE}/api/excel/plantilla?path=${encodeURIComponent(ruta)}`)
                .then(async r => ({ ok: r.ok, d: await r.json() }))
                .then(({ ok, d }) => { if (!vivo) return; if (ok) { setInfo(d); setError(null); } else { setInfo(null); setError(d.error); } })
                .catch(e => { if (vivo) setError(e.message); });
        }, 300);
        return () => { vivo = false; clearTimeout(t); };
    }, [ruta]);

    const elegir = async () => {
        const r = await window.electronAPI?.openFileDialog?.({ filters: [{ name: 'Excel workbook', extensions: ['xlsx', 'xlsm', 'xltx', 'xltm'] }] });
        const p = typeof r === 'string' ? r : (r && !r.canceled && (r.filePaths?.[0] || r.filePath));
        if (p) onChangeMulti({ plantilla: p });
    };

    const destinos = config.destinos || [];
    const destinoDe = (id) => destinos.find(d => d.desde === id) || null;
    const poner = (id, d) => onChangeMulti({ destinos: [...destinos.filter(x => x.desde !== id), ...(d ? [{ ...d, desde: id }] : [])] });

    return (
        <>
            <label>Template</label>
            <div className="chain-config-input-with-btn">
                <input type="text" className="chain-config-input" value={ruta} spellCheck={false}
                    onChange={(e) => onChangeMulti({ plantilla: e.target.value })} placeholder="templates/client_report.xlsx" />
                {window.electronAPI?.openFileDialog && (
                    <button className="chain-config-browse-btn" onClick={elegir} title="Choose the template"><LuFolderOpen size={13} /></button>
                )}
            </div>
            {error && <p className="chain-config-hint chain-config-hint-error">{error}</p>}
            {info && (
                <p className="chain-config-hint">
                    {info.hojas.length} sheet{info.hojas.length === 1 ? '' : 's'}{info.tablas.length ? `, ${info.tablas.length} table${info.tablas.length === 1 ? '' : 's'}` : ', no tables'}.
                    Only the cells below are written; formulas, charts and formatting stay as they are, and the workbook recalculates when opened.
                </p>
            )}
            {info && !entradas.length && (
                <p className="chain-config-hint chain-config-hint-info">Connect the nodes whose results go into the template.</p>
            )}
            {info && entradas.map(e => {
                const d = destinoDe(e.id);
                const valor = d?.tabla ? `t:${d.tabla}` : d?.hoja ? `h:${d.hoja}` : '';
                const tabla = d?.tabla ? info.tablas.find(t => t.nombre === d.tabla) : null;
                return (
                    <div key={e.id} className="xls-destino">
                        <label>{e.etiqueta} goes into</label>
                        <select className="chain-config-select" value={valor} onChange={(ev) => {
                            const v = ev.target.value;
                            if (!v) return poner(e.id, null);
                            if (v.startsWith('t:')) return poner(e.id, { tabla: v.slice(2) });
                            poner(e.id, { hoja: v.slice(2), celda: d?.celda || 'A2', encabezado: !!d?.encabezado });
                        }}>
                            <option value="">Choose…</option>
                            {info.tablas.length > 0 && (
                                <optgroup label="A table (it grows with the data)">
                                    {info.tablas.map(t => <option key={t.nombre} value={`t:${t.nombre}`}>{t.nombre} · {t.hoja}</option>)}
                                </optgroup>
                            )}
                            <optgroup label="A sheet, starting at a cell">
                                {info.hojas.map(h => <option key={h} value={`h:${h}`}>{h}</option>)}
                            </optgroup>
                        </select>
                        {tabla && (
                            <p className="chain-config-hint">
                                Columns: {tabla.columnas.filter(c => !c.calculada).map(c => c.nombre).join(', ')}
                                {tabla.columnas.some(c => c.calculada) && <> · calculated by the table: {tabla.columnas.filter(c => c.calculada).map(c => c.nombre).join(', ')}</>}.
                                Matched by name, or by position if the names differ.
                            </p>
                        )}
                        {d?.hoja && (
                            <div className="xls-celda">
                                <label>
                                    First cell
                                    <input type="text" className="chain-config-input chain-config-input-sm" value={d.celda || ''} spellCheck={false}
                                        onChange={(ev) => poner(e.id, { ...d, celda: ev.target.value.toUpperCase() })} placeholder="B5" />
                                </label>
                                <label className="xls-check">
                                    <input type="checkbox" checked={!!d.encabezado} onChange={(ev) => poner(e.id, { ...d, encabezado: ev.target.checked })} />
                                    Write the column names first
                                </label>
                            </div>
                        )}
                    </div>
                );
            })}
            {info && (
                <p className="chain-config-hint">
                    Last time's data is cleared, and a formula next to the data is filled down. If the data would reach something that is not its own (a footer below), the run stops and says where.
                </p>
            )}
        </>
    );
}

export default ExcelConfig;
