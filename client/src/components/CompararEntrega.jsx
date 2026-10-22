/**
 * Compare with the previous one (5.14, F3; Dec-52).
 *
 * Lo que un proceso entregó, frente a lo que había antes de reemplazarlo: la
 * copia que se guardó en `.amoxsql/entregas/`. Se leen los dos con el motor y,
 * por una columna clave, se ve qué filas aparecen, desaparecen o cambian. Sin
 * clave se comparan filas enteras.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuGitCompareArrows, LuX, LuPlus, LuMinus, LuPencil, LuTriangleAlert, LuLoader } from 'react-icons/lu';
import { API_BASE } from '../api.js';

const cuando = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const num = (n) => Number(n || 0).toLocaleString();

async function pedir(ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, cuerpo === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

function Tabla({ filas, columnas, cambios = false }) {
    if (!filas?.length) return <div className="cr-empty">No rows in this section</div>;
    const cols = columnas || Object.keys(filas[0]).filter(c => c !== '__cambiaron' && !/ \(before\)$/.test(c));
    return (
        <div className="cr-mini-table-wrap">
            <table className="cr-mini-table">
                <thead><tr>{cols.map(c => <th key={c} className="cr-mini-th">{c}</th>)}</tr></thead>
                <tbody>
                    {filas.map((f, i) => (
                        <tr key={i} className="cr-mini-row">
                            {cols.map(c => {
                                const cambio = cambios && f.__cambiaron?.includes(c);
                                return (
                                    <td key={c} className={`cr-mini-td${cambio ? ' cpe-cambio' : ''}`}>
                                        {cambio && <span className="cpe-antes">{f[`${c} (before)`] ?? 'NULL'}</span>}
                                        {f[c] == null ? <span className="cr-null">NULL</span> : String(f[c])}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function CompararEntrega({ copia, onClose }) {
    const [info, setInfo] = useState(null);        // { ruta, actual, copias, clave }
    const [elegida, setElegida] = useState(copia);
    const [clave, setClave] = useState(null);       // '' = sin clave
    const [r, setR] = useState(null);
    const [vista, setVista] = useState('cambian');
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        pedir(`/api/entregas?copia=${encodeURIComponent(copia)}`)
            .then(d => { setInfo(d); setClave(d.clave || ''); })
            .catch(e => setError(e.message));
    }, [copia]);

    const comparar = useCallback(async () => {
        setOcupado(true); setError(null);
        try {
            const d = await pedir('/api/entregas/comparar', { copia: elegida, clave: clave ? [clave] : [] });
            setR(d);
            setVista(d.cambian?.n ? 'cambian' : d.aparecen.n ? 'aparecen' : 'desaparecen');
        } catch (e) { setError(e.message); setR(null); }
        finally { setOcupado(false); }
    }, [elegida, clave]);

    useEffect(() => { if (info && clave !== null) comparar(); }, [info, elegida, clave, comparar]);

    const nombre = info?.ruta?.split(/[\\/]/).pop() || '';
    const anterior = info?.copias?.find(c => c.ruta === elegida);
    const comunes = r?.columnas?.comunes || [];
    const igual = r && !r.aparecen.n && !r.desaparecen.n && !(r.cambian?.n) && !r.columnas.anadidas.length && !r.columnas.quitadas.length;

    return createPortal((
        <div className="ww-backdrop">
            <div className="ww-card cpe-card" role="dialog" aria-modal="true" aria-labelledby="cpe-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuGitCompareArrows size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="cpe-titulo">Compare with the previous one</h2>
                        <p className="ww-subtitle">{nombre ? <><strong>{nombre}</strong> as it is now ({cuando(info?.actual?.escrita)}), against the copy saved before it was replaced.</> : 'Reading the two files…'}</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onClose} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-cuerpo cpe-cuerpo">
                    {info && (
                        <div className="fnt-fila cpe-elegir">
                            <label className="fnt-campo fnt-crece">
                                <span className="fnt-etiqueta">Previous delivery</span>
                                <select className="wsx-input" value={elegida} onChange={e => setElegida(e.target.value)}>
                                    {info.copias.map(c => <option key={c.ruta} value={c.ruta}>{cuando(c.escrita)} · {num(Math.round(c.bytes / 1024))} KB</option>)}
                                </select>
                            </label>
                            <label className="fnt-campo">
                                <span className="fnt-etiqueta">Match rows by</span>
                                <select className="wsx-input" value={clave || ''} onChange={e => setClave(e.target.value)}>
                                    <option value="">The whole row (no key)</option>
                                    {(comunes.length ? comunes : (clave ? [clave] : [])).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </label>
                        </div>
                    )}

                    {ocupado && !r && <p className="fnt-nota"><LuLoader size={13} className="spin" /> Comparing…</p>}
                    {r && (
                        <>
                            <p className="cpe-resumen">
                                <span>{num(r.filas.actual)} rows now, {num(r.filas.anterior)} before{anterior ? ` (${cuando(anterior.escrita)})` : ''}.</span>
                                {igual && <strong> Nothing changed.</strong>}
                            </p>
                            {(r.columnas.anadidas.length > 0 || r.columnas.quitadas.length > 0) && (
                                <p className="cpe-columnas">
                                    <LuTriangleAlert size={13} />
                                    <span>
                                        {r.columnas.anadidas.length > 0 && <>New columns: <code>{r.columnas.anadidas.join(', ')}</code>. </>}
                                        {r.columnas.quitadas.length > 0 && <>Gone: <code>{r.columnas.quitadas.join(', ')}</code>. </>}
                                        Rows are compared on the columns both have.
                                    </span>
                                </p>
                            )}
                            {r.repetidas > 0 && <p className="cpe-columnas"><LuTriangleAlert size={13} /><span>{num(r.repetidas)} values of <code>{r.clave.join(', ')}</code> repeat: it does not identify one row. Choose another column, or compare whole rows.</span></p>}
                            {!igual && (
                                <>
                                    <div className="cpe-pestanas" role="tablist">
                                        {r.cambian && <button type="button" role="tab" aria-selected={vista === 'cambian'} className={`cpe-pestana${vista === 'cambian' ? ' cpe-pestana--on' : ''}`} onClick={() => setVista('cambian')}><LuPencil size={12} /> {num(r.cambian.n)} changed</button>}
                                        <button type="button" role="tab" aria-selected={vista === 'aparecen'} className={`cpe-pestana cpe-pestana--mas${vista === 'aparecen' ? ' cpe-pestana--on' : ''}`} onClick={() => setVista('aparecen')}><LuPlus size={12} /> {num(r.aparecen.n)} new</button>
                                        <button type="button" role="tab" aria-selected={vista === 'desaparecen'} className={`cpe-pestana cpe-pestana--menos${vista === 'desaparecen' ? ' cpe-pestana--on' : ''}`} onClick={() => setVista('desaparecen')}><LuMinus size={12} /> {num(r.desaparecen.n)} gone</button>
                                    </div>
                                    {vista === 'cambian' && r.cambian && <Tabla filas={r.cambian.muestra} cambios />}
                                    {vista === 'aparecen' && <Tabla filas={r.aparecen.muestra} columnas={comunes} />}
                                    {vista === 'desaparecen' && <Tabla filas={r.desaparecen.muestra} columnas={comunes} />}
                                    {(r[vista]?.n || 0) > (r[vista]?.muestra?.length || 0) && <p className="fnt-nota">Showing the first {r[vista].muestra.length} of {num(r[vista].n)}.</p>}
                                </>
                            )}
                        </>
                    )}
                    {error && <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>}
                </div>

                <div className="ww-actions wsx-actions">
                    <span style={{ marginLeft: 'auto' }} />
                    <button className="ww-btn-create" type="button" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>
    ), document.body);
}
