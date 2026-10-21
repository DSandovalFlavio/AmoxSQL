/**
 * ChainProgramar — "Schedule…" for a process (5.11, D1).
 *
 * The process's schedules on this machine (they don't travel with the file):
 * each one in a sentence, when it runs next and how the last run went, with
 * Pause, Run now and Remove. And the form to add one: the rule (every day,
 * week, month — the first business day, the last one, the Nth —, every N
 * hours), the next five dates while it's written, the parameters it runs with,
 * who gets notified and whether it catches up after the machine was off.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCalendarClock, LuCirclePause, LuCirclePlay, LuPlay, LuTrash2, LuX } from 'react-icons/lu';
import { API_BASE } from '../../api.js';

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, { method: metodo, headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

const DIAS = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
const DIA_LARGO = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const cuando = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function reglaDe(f) {
    switch (f.tipo) {
        case 'semanal': return { tipo: 'semanal', hora: f.hora, dia: Number(f.dia) };
        case 'mensual': return { tipo: 'mensual', hora: f.hora, modo: f.modo, ...(f.modo === 'dia' || f.modo === 'habil_n' ? { dia: Number(f.diaMes) } : {}) };
        case 'cada': return { tipo: 'cada', horas: Number(f.horas), desde: f.desde, hasta: f.hasta, ...(f.dias.length < 7 ? { dias: f.dias.map(Number) } : {}) };
        default: return f.soloHabiles ? { tipo: 'diaria', hora: f.hora, soloHabiles: true } : { tipo: 'diaria', hora: f.hora, ...(f.dias.length < 7 ? { dias: f.dias.map(Number) } : {}) };
    }
}

export default function ChainProgramar({ chainDefinition, filePath, onClose }) {
    const defs = useMemo(() => chainDefinition.parametros || [], [chainDefinition]);
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({
        tipo: 'mensual', hora: '07:00', dias: ['1', '2', '3', '4', '5', '6', '7'], soloHabiles: false,
        dia: '1', modo: 'primer_habil', diaMes: '1', horas: '2', desde: '08:00', hasta: '18:00',
    });
    const [valores, setValores] = useState(() => Object.fromEntries(defs.map(d => [d.nombre, d.tipo === 'fecha' ? 'hoy' : String(chainDefinition.variables?.[d.nombre] ?? '')])));
    const [avisar, setAvisar] = useState('siempre');
    const [ponerse, setPonerse] = useState(true);
    const [vista, setVista] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const cambiar = (patch) => setForm(f => ({ ...f, ...patch }));
    const regla = reglaDe(form);

    const cargar = useCallback(async () => {
        try { setDatos(await pedir('GET', `/api/programaciones?proceso=${encodeURIComponent(filePath)}`)); }
        catch (e) { setError(e.message); }
    }, [filePath]);
    useEffect(() => { cargar(); }, [cargar]);

    // Las próximas cinco, mientras se escribe la regla.
    const clave = JSON.stringify(regla);
    useEffect(() => {
        const t = setTimeout(() => pedir('POST', '/api/programaciones/vista-previa', { regla: JSON.parse(clave) }).then(setVista).catch(e => setVista({ error: e.message })), 250);
        return () => clearTimeout(t);
    }, [clave]);

    const crear = async () => {
        setGuardando(true); setError(null);
        try {
            await pedir('POST', '/api/programaciones', { proceso: filePath, regla, parametros: valores, avisar, ponerseAlDia: ponerse });
            await cargar();
        } catch (e) { setError(e.message); }
        finally { setGuardando(false); }
    };
    const accion = async (f) => { try { await f(); await cargar(); } catch (e) { setError(e.message); } };
    const sistema = datos?.sistema;

    const toggleDia = (d) => cambiar({ dias: form.dias.includes(d) ? form.dias.filter(x => x !== d) : [...form.dias, d].sort() });

    return createPortal(
        <div className="modal-overlay cvp-fondo" onClick={onClose}>
            <div className="modal-panel cvp-panel cpg-panel" role="dialog" aria-labelledby="cpg-titulo" onClick={e => e.stopPropagation()}>
                <div className="cvp-cabecera">
                    <div className="cvp-titulo"><LuCalendarClock size={15} /><span id="cpg-titulo">Schedule {chainDefinition.name || 'this process'}</span></div>
                    <button className="cvp-cerrar" onClick={onClose} aria-label="Close"><LuX size={15} /></button>
                </div>
                <div className="cvp-cuerpo">
                    {datos?.programaciones?.length > 0 && (
                        <section className="cpg-lista" aria-label="Schedules of this process">
                            {datos.programaciones.map(p => {
                                const pausada = !p.activa || (p.pausadaHasta && new Date(p.pausadaHasta) > new Date());
                                return (
                                    <div key={p.id} className={`cpg-prog${pausada ? ' cpg-prog--pausada' : ''}`}>
                                        <div className="cpg-prog-texto">
                                            <strong>{p.descripcion}</strong>
                                            <small>
                                                {pausada ? (p.pausadaHasta ? `Paused until ${cuando(p.pausadaHasta)}` : 'Paused') : `Next: ${cuando(p.proxima)}`}
                                                {p.ultima && <> · Last: <span className={p.ultima.estado === 'ok' ? 'cpg-ok' : p.ultima.estado === 'fallo' ? 'cpg-mal' : ''}>{p.ultima.estado === 'ok' ? 'finished' : p.ultima.estado === 'fallo' ? 'failed' : p.ultima.estado}</span> {cuando(p.ultima.inicio)}</>}
                                                {Object.keys(p.parametros || {}).length > 0 && <> · {Object.entries(p.parametros).map(([k, v]) => `${k}=${v}`).join(', ')}</>}
                                            </small>
                                        </div>
                                        <button type="button" className="edd-boton" title="Run now" aria-label="Run now" onClick={() => accion(() => pedir('POST', `/api/programaciones/${p.id}/correr`))}><LuPlay size={13} /></button>
                                        {pausada
                                            ? <button type="button" className="edd-boton" title="Resume" aria-label="Resume" onClick={() => accion(() => pedir('POST', `/api/programaciones/${p.id}/pausar`, { reanudar: true }))}><LuCirclePlay size={13} /></button>
                                            : <button type="button" className="edd-boton" title="Pause" aria-label="Pause" onClick={() => accion(() => pedir('POST', `/api/programaciones/${p.id}/pausar`, {}))}><LuCirclePause size={13} /></button>}
                                        <button type="button" className="edd-boton" title="Remove" aria-label="Remove" onClick={() => accion(() => pedir('DELETE', `/api/programaciones/${p.id}`))}><LuTrash2 size={13} /></button>
                                    </div>
                                );
                            })}
                        </section>
                    )}

                    <section className="cpg-nueva" aria-label="New schedule">
                        <h3 className="cpg-h">{datos?.programaciones?.length ? 'Add another' : 'When it runs'}</h3>
                        <div className="xls-modo cpg-tipos" role="radiogroup" aria-label="How often">
                            {[['diaria', 'Every day'], ['semanal', 'Every week'], ['mensual', 'Every month'], ['cada', 'Every few hours']].map(([v, t]) => (
                                <button key={v} type="button" role="radio" aria-checked={form.tipo === v} className={form.tipo === v ? 'activo' : ''} onClick={() => cambiar({ tipo: v })}>{t}</button>
                            ))}
                        </div>

                        <div className="cpg-campos">
                            {form.tipo === 'diaria' && (
                                <>
                                    <label className="cpg-check"><input type="checkbox" checked={form.soloHabiles} onChange={e => cambiar({ soloHabiles: e.target.checked })} /> Only business days (the group's calendar)</label>
                                    {!form.soloHabiles && (
                                        <div className="cpg-dias" role="group" aria-label="Days">
                                            {DIAS.map(([v, t]) => <button key={v} type="button" aria-pressed={form.dias.includes(v)} className={form.dias.includes(v) ? 'activo' : ''} onClick={() => toggleDia(v)}>{t}</button>)}
                                        </div>
                                    )}
                                </>
                            )}
                            {form.tipo === 'semanal' && (
                                <label className="lote-campo"><span>Day</span>
                                    <select className="cvp-input" value={form.dia} onChange={e => cambiar({ dia: e.target.value })}>{DIAS.map(([v]) => <option key={v} value={v}>{DIA_LARGO[v]}</option>)}</select>
                                </label>
                            )}
                            {form.tipo === 'mensual' && (
                                <div className="cpg-fila">
                                    <label className="lote-campo"><span>On</span>
                                        <select className="cvp-input" value={form.modo} onChange={e => cambiar({ modo: e.target.value })}>
                                            <option value="primer_habil">The first business day</option>
                                            <option value="ultimo_habil">The last business day</option>
                                            <option value="habil_n">A business day by number</option>
                                            <option value="dia">A day of the month</option>
                                        </select>
                                    </label>
                                    {(form.modo === 'dia' || form.modo === 'habil_n') && (
                                        <label className="lote-campo"><span>{form.modo === 'dia' ? 'Day' : 'Business day number'}</span>
                                            <input type="number" min="1" max={form.modo === 'dia' ? 31 : 23} className="cvp-input" value={form.diaMes} onChange={e => cambiar({ diaMes: e.target.value })} />
                                        </label>
                                    )}
                                </div>
                            )}
                            {form.tipo === 'cada' && (
                                <div className="cpg-fila">
                                    <label className="lote-campo"><span>Every (hours)</span><input type="number" min="1" max="12" className="cvp-input" value={form.horas} onChange={e => cambiar({ horas: e.target.value })} /></label>
                                    <label className="lote-campo"><span>From</span><input type="time" className="cvp-input" value={form.desde} onChange={e => cambiar({ desde: e.target.value })} /></label>
                                    <label className="lote-campo"><span>To</span><input type="time" className="cvp-input" value={form.hasta} onChange={e => cambiar({ hasta: e.target.value })} /></label>
                                </div>
                            )}
                            {form.tipo !== 'cada' && (
                                <label className="lote-campo cpg-hora"><span>At</span><input type="time" className="cvp-input" value={form.hora} onChange={e => cambiar({ hora: e.target.value })} /></label>
                            )}
                        </div>

                        <div className="cpg-vista" aria-live="polite">
                            {vista?.error
                                ? <span className="cvp-aviso">{vista.error}</span>
                                : vista && (
                                    <>
                                        <strong>{vista.descripcion}</strong>
                                        <ol>{(vista.proximas || []).map(d => <li key={d}>{cuando(d)}</li>)}</ol>
                                        {!vista.calendarioPropio && /business/.test(vista.descripcion || '') && <small className="cvp-nota">Business days: Monday to Friday, no holidays. Set the holidays in the group's page.</small>}
                                    </>
                                )}
                        </div>

                        {defs.length > 0 && (
                            <div className="cpg-params">
                                <h4 className="cpg-h4">It runs with</h4>
                                {defs.map(d => (
                                    <label key={d.nombre} className="lote-campo">
                                        <span>{d.etiqueta || d.nombre}</span>
                                        {d.tipo === 'fecha' ? (
                                            <div className="edd-fila">
                                                <select className="cvp-input" value={valores[d.nombre] === 'hoy' ? 'hoy' : 'fija'} onChange={e => setValores(v => ({ ...v, [d.nombre]: e.target.value === 'hoy' ? 'hoy' : '' }))}>
                                                    <option value="hoy">The day it was due</option>
                                                    <option value="fija">A fixed date</option>
                                                </select>
                                                {valores[d.nombre] !== 'hoy' && <input type="date" className="cvp-input" value={valores[d.nombre]} onChange={e => setValores(v => ({ ...v, [d.nombre]: e.target.value }))} />}
                                            </div>
                                        ) : d.tipo === 'lista' ? (
                                            <select className="cvp-input" value={valores[d.nombre]} onChange={e => setValores(v => ({ ...v, [d.nombre]: e.target.value }))}>
                                                <option value="">Choose…</option>
                                                {(d.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        ) : (
                                            <input className="cvp-input" value={valores[d.nombre]} onChange={e => setValores(v => ({ ...v, [d.nombre]: e.target.value }))} />
                                        )}
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="cpg-fila">
                            <label className="lote-campo"><span>Notify me</span>
                                <select className="cvp-input" value={avisar} onChange={e => setAvisar(e.target.value)}>
                                    <option value="siempre">Every time</option>
                                    <option value="fallo">Only if it fails</option>
                                    <option value="nunca">Never</option>
                                </select>
                            </label>
                            <label className="cpg-check cpg-check--abajo">
                                <input type="checkbox" checked={ponerse} onChange={e => setPonerse(e.target.checked)} />
                                Catch up if the computer was off (runs the latest missed one)
                            </label>
                        </div>

                        {error && <p className="chain-config-hint-error">{error}</p>}
                        <div className="lote-pie">
                            <span />
                            <button type="button" className="lote-correr" disabled={guardando || !!vista?.error} onClick={crear}><LuCalendarClock size={13} /> Schedule</button>
                        </div>
                    </section>

                    <footer className="cpg-sistema">
                        {sistema?.soportado ? (
                            <label className="cpg-check">
                                <input type="checkbox" checked={!!sistema.activo}
                                    onChange={e => accion(() => pedir('PUT', '/api/programaciones/sistema', { activo: e.target.checked }))} />
                                Run even when AmoxSQL is closed
                            </label>
                        ) : <span />}
                        <small className="cvp-nota">
                            {sistema?.activo
                                ? 'A Windows scheduled task wakes AmoxSQL at the next due time. It runs only while you are signed in to Windows.'
                                : 'Schedules run while AmoxSQL is open; when it opens, it catches up with what was missed.'}
                            {' '}Schedules belong to this computer: copying the project elsewhere does not copy them.
                        </small>
                    </footer>
                </div>
            </div>
        </div>,
        document.body
    );
}
