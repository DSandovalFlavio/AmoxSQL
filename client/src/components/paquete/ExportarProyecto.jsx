/**
 * Exportar un proyecto a un `.amoxproject` (5.14, G3; Dec-47). «Save as template…»
 * es lo mismo sin datos (G2).
 *
 * Lo del proyecto viaja siempre (procesos, consultas, cuadernos, contexto, fuentes);
 * los datos se eligen y van desmarcados, salvo la plantilla de Excel que llena un
 * nodo. Nunca viajan credenciales (sólo sus nombres), `.git` ni `.env`.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuPackage, LuX, LuCheck, LuDatabase, LuFileSpreadsheet, LuFolderOpen, LuTriangleAlert, LuShieldCheck } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

const tamano = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

export default function ExportarProyecto({ plantilla = false, proyecto = 'project', onClose }) {
    const [c, setC] = useState(null);
    const [elegidos, setElegidos] = useState(new Set());
    const [error, setError] = useState(null);
    const [ocupado, setOcupado] = useState(false);
    const [hecho, setHecho] = useState(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/proyecto/paquete`).then(r => r.json()).then(d => {
            if (d.error) throw new Error(d.error);
            setC(d);
            setElegidos(new Set(d.datos.filter(x => x.marcado).map(x => x.rel)));
        }).catch(e => setError(e.message));
    }, []);

    const datosElegidos = useMemo(() => (c?.datos || []).filter(d => elegidos.has(d.rel)), [c, elegidos]);
    const total = useMemo(() => (c?.proyecto || []).reduce((s, a) => s + a.tamano, 0) + datosElegidos.reduce((s, d) => s + d.tamano, 0), [c, datosElegidos]);

    const exportar = async () => {
        const nombre = `${proyecto}${plantilla ? '-template' : ''}.amoxproject`;
        const r = await window.electronAPI?.saveFileDialog?.({ defaultPath: nombre, filters: [{ name: 'AmoxSQL project', extensions: ['amoxproject'] }] });
        if (!r || r.canceled || !r.filePath) return;
        setOcupado(true); setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/proyecto/exportar`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destino: r.filePath, incluir: [...elegidos], plantilla: false }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            setHecho(d);
        } catch (e) { setError(e.message); }
        finally { setOcupado(false); }
    };

    const cambiar = (rel) => setElegidos(s => { const n = new Set(s); if (n.has(rel)) n.delete(rel); else n.add(rel); return n; });

    return createPortal((
        <div className="ww-backdrop">
            <div className="ww-card pqt-card" role="dialog" aria-modal="true" aria-labelledby="pqt-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuPackage size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="pqt-titulo">{plantilla ? 'Save as template' : 'Export project'}</h2>
                        <p className="ww-subtitle">{plantilla
                            ? 'A package with the structure of this project and no data, to start the next one from it.'
                            : 'One file with the project, to pass it to someone (or to another computer of yours) when git is not an option.'}</p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onClose} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-cuerpo fnt-cuerpo">
                    {!c && !error && <p className="fnt-nota">Looking at the project…</p>}
                    {c && !hecho && (
                        <>
                            <p className="pqt-siempre"><LuCheck size={13} /><span><strong>{c.proyecto.length} files of the project</strong> always go: processes, queries, notebooks, charts, decks, the assistant's context, sources and destinations.</span></p>
                            <p className="pqt-siempre"><LuShieldCheck size={13} /><span>Credentials never go, only their names. Nor <code>.git</code>, <code>.env</code> or the work folder.</span></p>
                            {c.datos.length > 0 && (
                                <div className="fnt-campo">
                                    <span className="fnt-etiqueta">Data {plantilla ? <small>(a template carries only what its processes need)</small> : <small>(choose what goes)</small>}</span>
                                    <ul className="pqt-datos">
                                        {c.datos.map(d => (
                                            <li key={d.rel}>
                                                <label className={`wsx-check${d.demasiado ? ' pqt-no' : ''}`} title={d.demasiado ? 'Larger than 1 GB: a package is not a backup' : ''}>
                                                    <input type="checkbox" checked={elegidos.has(d.rel)} disabled={d.demasiado} onChange={() => cambiar(d.rel)} />
                                                    {d.tipo === 'base' ? <LuDatabase size={13} /> : <LuFileSpreadsheet size={13} />}
                                                    <span className="pqt-ruta">{d.rel}</span>
                                                    <span className="pqt-meta">{tamano(d.tamano)}{d.motivo ? ` · ${d.motivo}` : ''}</span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <p className="fnt-nota">About {tamano(total)} before compressing.</p>
                        </>
                    )}
                    {hecho && (
                        <div className="pqt-hecho">
                            <LuCheck size={15} />
                            <div>
                                <strong>Exported</strong>: {hecho.archivos} files{hecho.datos.length ? ` and ${hecho.datos.length} data file${hecho.datos.length === 1 ? '' : 's'}` : ''}, {tamano(hecho.bytes)}.
                                <div className="pqt-ruta">{hecho.ruta}</div>
                            </div>
                        </div>
                    )}
                    {error && <p className="wsx-error fnt-error"><LuTriangleAlert size={13} /> {error}</p>}
                </div>

                <div className="ww-actions wsx-actions">
                    {hecho ? (
                        <>
                            <button className="ww-btn-skip" type="button" onClick={() => window.electronAPI?.showItemInFolder?.(hecho.ruta)}><LuFolderOpen size={13} /> Show in folder</button>
                            <span style={{ marginLeft: 'auto' }} />
                            <button className="ww-btn-create" type="button" onClick={onClose}>Done</button>
                        </>
                    ) : (
                        <>
                            <span style={{ marginLeft: 'auto' }} />
                            <button className="ww-btn-skip" type="button" onClick={onClose}>Cancel</button>
                            <button className="ww-btn-create" type="button" onClick={exportar} disabled={!c || ocupado}>
                                <LuPackage size={14} /> {ocupado ? 'Exporting…' : 'Export…'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    ), document.body);
}
