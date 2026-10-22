/**
 * El contrato de una fuente (5.13, E2 + E3; Dec-37 a Dec-40).
 *
 * Lo que el archivo tiene que traer: sus columnas, de qué familia es cada una
 * (texto, número, fecha, sí/no) y unas reglas. Los procesos que leen la fuente
 * lo comprueban antes de su primer paso: si no se cumple, se paran (o avisan) y
 * dicen qué cambió. Nadie lo escribe desde cero: «Take today's columns» lo
 * propone con lo que trae hoy el archivo.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    LuFileCheck, LuX, LuPlus, LuTrash2, LuWandSparkles, LuCircleCheck, LuTriangleAlert, LuCheck, LuPlay,
} from 'react-icons/lu';
import { comprobarContrato, contratoDeHoy, guardarFuente, avisarCambio } from './api';
import { useEtiqueta } from '../../etiqueta';

const FAMILIAS = [['texto', 'Text'], ['numero', 'Number'], ['fecha', 'Date'], ['logico', 'Yes / no']];
const REGLAS = [
    ['no_nulos', 'No empty values'],
    ['unico', 'No repeated values'],
    ['rango', 'Within a range'],
    ['valores', 'Only these values'],
    ['filas_minimas', 'At least N rows'],
];

// Lo que vuelve a guardar la definición: sin el estado que añade la lista.
const ESTADO = ['origen', 'sobrescribe', 'ubicacionAqui', 'como', 'estado', 'actual', 'leidos', 'edadDias', 'vieja', 'error', 'modificada', 'bytes', 'archivos'];
const definicionDe = (f) => Object.fromEntries(Object.entries(f).filter(([k]) => !ESTADO.includes(k)));

export default function ContratoDeFuente({ fuente, workspaceId, onClose }) {
    const inicial = fuente.contrato || null;
    const [columnas, setColumnas] = useState(inicial?.columnas || []);
    const [reglas, setReglas] = useState(inicial?.reglas || []);
    const [estricto, setEstricto] = useState(!!inicial?.estricto);
    const [alFallar, setAlFallar] = useState(inicial?.alFallar || 'parar');
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [resultado, setResultado] = useState(null);   // lo que dijo «Check»
    const deWorkspace = fuente.origen === 'workspace' ? workspaceId : undefined;
    const e = useEtiqueta();

    const contrato = { columnas, reglas, estricto, alFallar };
    const vacio = !columnas.length && !reglas.length;

    const tomarDeHoy = async () => {
        if (columnas.length && !window.confirm('Replace the columns with what the file brings today? The rules stay.')) return;
        setOcupado(true); setError(null); setResultado(null);
        try {
            const c = await contratoDeHoy(fuente.nombre, deWorkspace);
            setColumnas(c.columnas || []);
        } catch (e) { setError(e.message); }
        finally { setOcupado(false); }
    };

    const comprobar = async () => {
        setOcupado(true); setError(null);
        try { setResultado(await comprobarContrato(fuente.nombre, contrato, deWorkspace)); }
        catch (e) { setError(e.message); setResultado(null); }
        finally { setOcupado(false); }
    };

    const guardar = async (sin = false) => {
        setOcupado(true); setError(null);
        try {
            await guardarFuente({
                workspaceId: deWorkspace,
                definicion: { ...definicionDe(fuente), contrato: sin ? null : contrato },
                anterior: fuente.nombre,
            });
            avisarCambio();
            onClose?.(true);
        } catch (e) { setError(e.message); setOcupado(false); }
    };

    const cambiarColumna = (i, cambio) => setColumnas(cs => cs.map((c, k) => (k === i ? { ...c, ...cambio } : c)));
    const cambiarRegla = (i, cambio) => setReglas(rs => rs.map((r, k) => (k === i ? { ...r, ...cambio } : r)));
    const nombres = columnas.map(c => c.nombre).filter(Boolean);

    return createPortal((
        <div className="ww-backdrop">
            <div className="ww-card fnt-card ctr-card" role="dialog" aria-modal="true" aria-labelledby="ctr-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuFileCheck size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="ctr-titulo">Contract of {fuente.nombre}</h2>
                        <p className="ww-subtitle">What the file has to bring. A process that reads this source checks it before its first step, and says what changed.</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={() => onClose?.(false)} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-cuerpo fnt-cuerpo">
                    <div className="fnt-campo">
                        <div className="ctr-titulo-seccion">
                            <span className="fnt-etiqueta">Columns</span>
                            <button type="button" className="fnt-enlace" onClick={tomarDeHoy} disabled={ocupado}>
                                <LuWandSparkles size={12} /> Take today's columns
                            </button>
                        </div>
                        {!columnas.length ? (
                            <p className="fnt-nota">No columns yet. <strong>Take today's columns</strong> fills them in from the file as it is now; then remove what does not matter.</p>
                        ) : (
                            <div className="ctr-tabla">
                                {columnas.map((c, i) => (
                                    <div key={i} className="ctr-columna">
                                        <input className="wsx-input fnt-mono" value={c.nombre} spellCheck={false} aria-label="Column name"
                                            onChange={e => cambiarColumna(i, { nombre: e.target.value })} />
                                        <select className="wsx-input ctr-familia" value={c.tipo} aria-label="Kind of value"
                                            onChange={e => cambiarColumna(i, { tipo: e.target.value })}>
                                            {FAMILIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                                        </select>
                                        <label className="wsx-check ctr-obligatoria" title="If it is missing, the contract fails">
                                            <input type="checkbox" checked={c.obligatoria !== false}
                                                onChange={e => cambiarColumna(i, { obligatoria: e.target.checked ? undefined : false })} />
                                            Required
                                        </label>
                                        <button type="button" className="ctr-quitar" title="Remove this column from the contract"
                                            onClick={() => setColumnas(cs => cs.filter((_, k) => k !== i))}><LuTrash2 size={13} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button type="button" className="fnt-enlace ctr-anadir" onClick={() => setColumnas(cs => [...cs, { nombre: '', tipo: 'texto' }])}>
                            <LuPlus size={12} /> Add a column
                        </button>
                        <span className="fnt-nota">Numbers and dates are read for what they are, whatever the cell looks like: an empty first row or a date typed as text no longer changes the column. A value that is not a number (<code>N/A</code>) is counted and named.</span>
                    </div>

                    <div className="fnt-campo">
                        <span className="fnt-etiqueta">Rules</span>
                        {reglas.map((r, i) => (
                            <div key={i} className="ctr-regla">
                                <select className="wsx-input" value={r.tipo} aria-label="Rule" onChange={e => cambiarRegla(i, { tipo: e.target.value })}>
                                    {REGLAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                                </select>
                                {r.tipo !== 'filas_minimas' && (
                                    <select className="wsx-input" value={r.columna || ''} aria-label="Column" onChange={e => cambiarRegla(i, { columna: e.target.value })}>
                                        <option value="" disabled>Column…</option>
                                        {nombres.map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                )}
                                {r.tipo === 'rango' && (
                                    <>
                                        <input className="wsx-input wsx-input--corto" placeholder="min" value={r.min ?? ''} aria-label="Minimum"
                                            onChange={e => cambiarRegla(i, { min: e.target.value === '' ? undefined : e.target.value })} />
                                        <input className="wsx-input wsx-input--corto" placeholder="max" value={r.max ?? ''} aria-label="Maximum"
                                            onChange={e => cambiarRegla(i, { max: e.target.value === '' ? undefined : e.target.value })} />
                                    </>
                                )}
                                {r.tipo === 'valores' && (
                                    <input className="wsx-input ctr-valores" placeholder="north, south, east" aria-label="Allowed values"
                                        value={Array.isArray(r.valores) ? r.valores.join(', ') : (r.valores || '')}
                                        onChange={e => cambiarRegla(i, { valores: e.target.value })} />
                                )}
                                {r.tipo === 'filas_minimas' && (
                                    <input className="wsx-input wsx-input--corto" type="number" min="0" value={r.filas ?? 1} aria-label="Rows"
                                        onChange={e => cambiarRegla(i, { filas: e.target.value })} />
                                )}
                                <button type="button" className="ctr-quitar" title="Remove this rule"
                                    onClick={() => setReglas(rs => rs.filter((_, k) => k !== i))}><LuTrash2 size={13} /></button>
                            </div>
                        ))}
                        <button type="button" className="fnt-enlace ctr-anadir"
                            onClick={() => setReglas(rs => [...rs, { tipo: 'no_nulos', columna: nombres[0] || '' }])}>
                            <LuPlus size={12} /> Add a rule
                        </button>
                    </div>

                    <label className="wsx-check fnt-check">
                        <input type="checkbox" checked={estricto} onChange={e => setEstricto(e.target.checked)} />
                        Strict: a column the contract does not name is also a failure
                    </label>

                    <div className="fnt-campo">
                        <span className="fnt-etiqueta">When the file does not match</span>
                        <div className="fnt-segmento" role="radiogroup">
                            <button type="button" role="radio" aria-checked={alFallar === 'parar'}
                                className={`fnt-segmento-op${alFallar === 'parar' ? ' fnt-segmento-op--on' : ''}`}
                                onClick={() => setAlFallar('parar')}>Stop the process</button>
                            <button type="button" role="radio" aria-checked={alFallar === 'avisar'}
                                className={`fnt-segmento-op${alFallar === 'avisar' ? ' fnt-segmento-op--on' : ''}`}
                                onClick={() => setAlFallar('avisar')}>Warn and go on</button>
                        </div>
                        <span className="fnt-nota">Either way it shows up in <strong>Needs attention</strong>, on the welcome screen and in its {e.s}, with the reason.</span>
                    </div>

                    {resultado && (
                        <div className={`ctr-resultado${resultado.ok ? '' : ' ctr-resultado--mal'}`}>
                            {resultado.ok
                                ? <><LuCircleCheck size={14} /> The file matches{resultado.filas != null ? ` · ${resultado.filas.toLocaleString()} rows` : ''}{resultado.ms != null ? ` · ${resultado.ms} ms` : ''}</>
                                : (
                                    <>
                                        <LuTriangleAlert size={14} />
                                        <div>
                                            <strong>The file does not match</strong>
                                            <ul>{resultado.fallos.map((f, i) => <li key={i}>{f.texto}</li>)}</ul>
                                        </div>
                                    </>
                                )}
                        </div>
                    )}
                    {error && <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>}
                </div>

                <div className="ww-actions wsx-actions">
                    <button className="ww-btn-skip fnt-btn" type="button" onClick={comprobar} disabled={ocupado || vacio}>
                        <LuPlay size={13} /> Check now
                    </button>
                    {inicial && (
                        <button className="ww-btn-skip" type="button" onClick={() => guardar(true)} disabled={ocupado}>Remove contract</button>
                    )}
                    <span style={{ marginLeft: 'auto' }} />
                    <button className="ww-btn-skip" type="button" onClick={() => onClose?.(false)}>Cancel</button>
                    <button className="ww-btn-create" type="button" onClick={() => guardar(false)} disabled={ocupado || vacio || columnas.some(c => !c.nombre.trim())}>
                        <LuCheck size={14} /> Save
                    </button>
                </div>
            </div>
        </div>
    ), document.body);
}
