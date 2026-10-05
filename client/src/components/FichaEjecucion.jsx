/**
 * FichaEjecucion — one run, for someone who didn't watch it (5.11, D2).
 *
 * Opens from a notification's click, the Operations log and anywhere that
 * fires `amox_abrir_ejecucion` with { runId }. It says how it went in one
 * line, what it left (with Open and Show in folder), what it read, its
 * parameters, where it came from (a schedule, the command line, a form…), and
 * each step with its time and rows — and where it failed. Run again repeats it
 * with the same values.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    LuCircleAlert, LuCircleCheck, LuExternalLink, LuFile, LuFileSpreadsheet, LuFolderOpen, LuHistory,
    LuLoader, LuPencil, LuRotateCcw, LuX,
} from 'react-icons/lu';
import { API_BASE } from '../api.js';

const ORIGEN = {
    interfaz: 'Run from Data Flow',
    linea_de_comandos: 'Command line',
    lote: 'Run for each',
    formulario: 'Form',
    programada: 'Scheduled',
};
const ESTADO = { ok: 'Finished', fallo: 'Failed', en_curso: 'Running', interrumpida: 'Interrupted', cancelada: 'Cancelled', pausada: 'Paused at a checkpoint' };

// `inicio` y `fin` vienen en la hora de esta máquina, sin zona.
const local = (t) => (t ? new Date(String(t).replace(' ', 'T')) : null);
const fecha = (d) => (d ? d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const duracion = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const tamano = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

export default function FichaEjecucion({ runId, onClose, onAbrirProceso }) {
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    const [repitiendo, setRepitiendo] = useState(false);

    const cargar = useCallback(async (id) => {
        try {
            const r = await fetch(`${API_BASE}/api/ejecuciones/${encodeURIComponent(id)}`);
            const x = await r.json();
            if (!r.ok) throw new Error(x.error);
            setD(x); setError(null);
        } catch (e) { setError(e.message); }
    }, []);
    useEffect(() => { setD(null); cargar(runId); }, [runId, cargar]);

    const repetir = async () => {
        setRepitiendo(true);
        try {
            const r = await fetch(`${API_BASE}/api/ejecuciones/${encodeURIComponent(runId)}/repetir`, { method: 'POST' });
            const x = await r.json();
            if (!r.ok) throw new Error(x.error);
            if (x.runId) await cargar(x.runId);
        } catch (e) { setError(e.message); }
        finally { setRepitiendo(false); }
    };

    const e = d?.ejecucion;
    const res = d?.resumen;
    const ok = e?.estado === 'ok';
    const ini = local(e?.inicio), fin = local(e?.fin);
    const nombre = res?.nombre || (e?.proceso || '').split(/[\\/]/).pop()?.replace(/\.sqlchain$/i, '') || 'Process';

    return createPortal(
        <div className="modal-overlay cvp-fondo" onClick={onClose}>
            <div className="modal-panel cvp-panel fej-panel" role="dialog" aria-labelledby="fej-titulo" onClick={ev => ev.stopPropagation()}>
                <div className="cvp-cabecera">
                    <div className="cvp-titulo"><LuHistory size={15} /><span id="fej-titulo">{nombre}</span></div>
                    <button className="cvp-cerrar" onClick={onClose} aria-label="Close"><LuX size={15} /></button>
                </div>
                <div className="cvp-cuerpo">
                    {!d && !error && <p className="cvp-nota"><LuLoader size={12} className="lote-gira" /> Loading…</p>}
                    {error && <p className="chain-config-hint-error">{error}</p>}
                    {e && (
                        <>
                            <div className={`fej-estado fej-estado--${ok ? 'ok' : e.estado === 'en_curso' ? 'curso' : 'mal'}`}>
                                {ok ? <LuCircleCheck size={18} /> : e.estado === 'en_curso' ? <LuLoader size={18} className="lote-gira" /> : <LuCircleAlert size={18} />}
                                <div>
                                    <strong>{ESTADO[e.estado] || e.estado}{res?.duracionMs != null ? ` in ${duracion(res.duracionMs)}` : ''}</strong>
                                    {!ok && res?.fallo && <p>{res.fallo.paso ? <>The step <b>{res.fallo.paso}</b> failed: </> : null}{String(res.fallo.error || e.error || '').split('\n')[0]}</p>}
                                    {!ok && !res?.fallo && e.error && <p>{String(e.error).split('\n')[0]}</p>}
                                </div>
                            </div>

                            <dl className="fej-datos">
                                <dt>When</dt><dd>{fecha(ini)}{fin ? ` → ${fin.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</dd>
                                <dt>How</dt>
                                <dd>
                                    {ORIGEN[e.origen] || e.origen}
                                    {d.programacion && <> · {d.programacion.borrada ? 'a schedule that was removed' : d.programacion.descripcion}{e.prevista ? ` · due ${fecha(new Date(e.prevista))}` : ''}</>}
                                </dd>
                                {Object.keys(e.parametros || {}).length > 0 && (<><dt>With</dt><dd className="fej-params">{Object.entries(e.parametros).map(([k, v]) => <code key={k}>{k} = {String(v)}</code>)}</dd></>)}
                                <dt>Process</dt><dd className="fej-ruta" title={e.proceso}>{e.proceso}</dd>
                            </dl>

                            {res?.guardados?.length > 0 && (
                                <section>
                                    <h3 className="cpg-h">It left</h3>
                                    <ul className="cf-archivos">
                                        {res.guardados.map(g => {
                                            const n = g.ruta.split(/[\\/]/).pop();
                                            const Icono = /\.xls[xm]$/i.test(n) ? LuFileSpreadsheet : LuFile;
                                            return (
                                                <li key={g.ruta} className="cf-archivo">
                                                    <Icono size={18} aria-hidden="true" />
                                                    <div className="cf-archivo-texto">
                                                        <strong title={g.ruta}>{n}</strong>
                                                        <small>{[g.paso, g.filas != null ? `${Number(g.filas).toLocaleString()} rows` : null, tamano(g.bytes), g.existe === false ? 'no longer there' : null].filter(Boolean).join(' · ')}</small>
                                                    </div>
                                                    {g.existe && !g.remoto && window.electronAPI?.openPath && <button type="button" className="cf-boton" onClick={() => window.electronAPI.openPath(g.ruta)}><LuExternalLink size={13} /> Open</button>}
                                                    {g.existe && !g.remoto && window.electronAPI?.showItemInFolder && <button type="button" className="cf-boton" onClick={() => window.electronAPI.showItemInFolder(g.ruta)}><LuFolderOpen size={13} /> Show in folder</button>}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            )}
                            {res?.leidos?.length > 0 && <p className="cf-leidos">Read: {res.leidos.map(l => `${l.paso}${l.filas != null ? ` (${Number(l.filas).toLocaleString()} rows)` : ''}`).join(', ')}.</p>}

                            {d.pasos?.length > 0 && (
                                <section>
                                    <h3 className="cpg-h">Steps</h3>
                                    <ol className="fej-pasos">
                                        {d.pasos.map((p, i) => (
                                            <li key={i} className={`fej-paso fej-paso--${p.estado}`}>
                                                <span className="fej-icono" aria-hidden="true">{p.estado === 'success' ? <LuCircleCheck size={13} /> : p.estado === 'failed' ? <LuCircleAlert size={13} /> : <span className="lote-punto" />}</span>
                                                <span className="fej-nodo">{p.nodo}</span>
                                                <span className="fej-meta">{[p.filas != null ? `${Number(p.filas).toLocaleString()} rows` : null, duracion(p.ms), p.estado === 'skipped' ? 'skipped' : null].filter(Boolean).join(' · ')}</span>
                                                {p.error && <span className="fej-error">{String(p.error).split('\n')[0]}</span>}
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            )}

                            <div className="lote-pie">
                                {d.procesoEnProyecto && onAbrirProceso
                                    ? <button type="button" className="cf-editar" onClick={() => { onAbrirProceso(d.procesoEnProyecto); onClose(); }}><LuPencil size={13} /> Open the process</button>
                                    : <span className="cvp-nota">{e.proyecto ? `Project: ${e.proyecto}` : ''}</span>}
                                <button type="button" className="lote-correr" disabled={repitiendo || e.estado === 'en_curso'} onClick={repetir}>
                                    {repitiendo ? <LuLoader size={13} className="lote-gira" /> : <LuRotateCcw size={13} />} Run again
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
