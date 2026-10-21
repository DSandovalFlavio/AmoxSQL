/**
 * VistaOperacion — the Operations panel (5.11, D7; Dec-24).
 *
 * Everything scheduled on this computer, from every group, in one place:
 *   - Today: what ran (finished / failed) and what is still due, in order;
 *   - Tomorrow;
 *   - every schedule, grouped by its group, with Run now and Pause;
 *   - the log of recent runs, filterable; a click opens the run's details.
 * "Pause everything until…" before a holiday, and the switch that lets the
 * Windows task run schedules with AmoxSQL closed.
 *
 * A view apart, like the workspaces view: it doesn't replace anything.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LuArrowLeft, LuCalendarClock, LuCircleAlert, LuCircleCheck, LuCirclePause, LuCirclePlay, LuClock,
    LuLoader, LuPlay, LuRefreshCw,
} from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { useEtiqueta } from '../../etiqueta';

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, { method: metodo, headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

const ORIGEN = { interfaz: 'Data Flow', linea_de_comandos: 'Command line', lote: 'Run for each', formulario: 'Form', programada: 'Scheduled', al_llegar: 'File arrived' };
const local = (t) => (t ? new Date(String(t).replace(' ', 'T')) : null);
const hora = (d) => (d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '');
const diaHora = (d) => (d ? d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const abrirEjecucion = (runId) => window.dispatchEvent(new CustomEvent('amox_abrir_ejecucion', { detail: { runId } }));

function Estado({ estado }) {
    const t = { ok: 'finished', fallo: 'failed', en_curso: 'running', interrumpida: 'interrupted', pausada: 'paused', cancelada: 'cancelled' }[estado] || estado;
    return <span className={`opx-pill opx-pill--${estado}`}>{t}</span>;
}

function Grupo({ nombre, color }) {
    if (!nombre) return <span className="opx-grupo opx-grupo--sin">No group</span>;
    return <span className="opx-grupo"><span className="opx-punto" style={color ? { background: color } : undefined} />{nombre}</span>;
}

export default function VistaOperacion({ onClose }) {
    const etq = useEtiqueta();
    const [d, setD] = useState(null);
    const [error, setError] = useState(null);
    const [filtro, setFiltro] = useState('todas');
    const [pausaHasta, setPausaHasta] = useState('');
    const [ocupado, setOcupado] = useState(null);

    const cargar = useCallback(async () => {
        try { setD(await pedir('GET', '/api/operacion')); setError(null); }
        catch (e) { setError(e.message); }
    }, []);
    useEffect(() => {
        cargar();
        const t = setInterval(cargar, 30000);
        return () => clearInterval(t);
    }, [cargar]);

    const accion = async (clave, f) => {
        setOcupado(clave);
        try { await f(); await cargar(); } catch (e) { setError(e.message); }
        finally { setOcupado(null); }
    };

    const hoy = d?.hoy;
    const cuenta = useMemo(() => {
        if (!hoy) return null;
        const bien = hoy.corridas.filter(x => x.estado === 'ok').length;
        const mal = hoy.corridas.filter(x => x.estado === 'fallo' || x.estado === 'interrumpida').length;
        const curso = hoy.corridas.filter(x => x.estado === 'en_curso').length;
        return { total: hoy.corridas.length + hoy.pendientes.length, bien, mal, curso, faltan: hoy.pendientes.length };
    }, [hoy]);

    const porGrupo = useMemo(() => {
        const m = new Map();
        for (const p of d?.programaciones || []) {
            const k = p.workspaceNombre || '';
            if (!m.has(k)) m.set(k, { nombre: p.workspaceNombre, color: p.workspaceColor, lista: [] });
            m.get(k).lista.push(p);
        }
        return [...m.values()].sort((a, b) => (a.nombre || '￿').localeCompare(b.nombre || '￿'));
    }, [d]);

    const bitacora = (d?.bitacora || []).filter(x => filtro === 'todas' || (filtro === 'fallos' ? x.estado === 'fallo' || x.estado === 'interrumpida' : x.programacionId));
    const pausada = d?.pausaGeneral;
    const hoyLinea = [
        ...(hoy?.corridas || []).map(x => ({ ...x, cuando: local(x.inicio), tipo: 'corrida' })),
        ...(hoy?.pendientes || []).map(x => ({ ...x, cuando: new Date(x.cuando), tipo: 'pendiente' })),
    ].sort((a, b) => a.cuando - b.cuando);

    return (
        <div className="opx" role="region" aria-label="Operations">
            <header className="opx-cabecera">
                <button type="button" className="opx-volver" onClick={onClose}><LuArrowLeft size={14} /> Back</button>
                <div className="opx-titulos">
                    <h1>Operations</h1>
                    <p>Everything scheduled on this computer, from every {etq.s}.</p>
                </div>
                <button type="button" className="opx-icono" onClick={cargar} title="Refresh" aria-label="Refresh"><LuRefreshCw size={14} /></button>
            </header>

            {error && <p className="chain-config-hint-error opx-error">{error}</p>}
            {!d && !error && <p className="opx-cargando"><LuLoader size={14} className="lote-gira" /> Loading…</p>}

            {d && (
                <div className="opx-cuerpo">
                    {pausada ? (
                        <div className="opx-pausa" role="status">
                            <LuCirclePause size={18} />
                            <div><strong>Everything is paused until {diaHora(new Date(pausada))}.</strong> Nothing scheduled runs until then; what was due is not caught up.</div>
                            <button type="button" className="lote-correr" disabled={ocupado === 'pausa'} onClick={() => accion('pausa', () => pedir('PUT', '/api/programaciones/pausa', { hasta: null }))}><LuCirclePlay size={13} /> Resume now</button>
                        </div>
                    ) : null}

                    <section className="opx-resumen" aria-label="Today">
                        <div className="opx-cifra"><span className="opx-num">{cuenta?.total ?? 0}</span><span>today</span></div>
                        <div className="opx-cifra opx-cifra--ok"><span className="opx-num">{cuenta?.bien ?? 0}</span><span>finished</span></div>
                        <div className={`opx-cifra${cuenta?.mal ? ' opx-cifra--mal' : ''}`}><span className="opx-num">{cuenta?.mal ?? 0}</span><span>failed</span></div>
                        <div className="opx-cifra"><span className="opx-num">{cuenta?.faltan ?? 0}</span><span>to come</span></div>
                        <div className="opx-cifra opx-cifra--suave"><span className="opx-num">{d.manana.pendientes.length}</span><span>tomorrow</span></div>
                        <div className="opx-controles">
                            {!pausada && (
                                <span className="opx-pausar">
                                    <input type="date" className="cvp-input" value={pausaHasta} min={new Date().toISOString().slice(0, 10)} onChange={e => setPausaHasta(e.target.value)} aria-label="Pause everything until" />
                                    <button type="button" className="cf-editar" disabled={!pausaHasta || ocupado === 'pausa'}
                                        onClick={() => accion('pausa', () => pedir('PUT', '/api/programaciones/pausa', { hasta: new Date(`${pausaHasta}T23:59:59`).toISOString() }))}>
                                        <LuCirclePause size={13} /> Pause everything until then
                                    </button>
                                </span>
                            )}
                            {d.sistema?.soportado && (
                                <label className="cpg-check">
                                    <input type="checkbox" checked={!!d.sistema.activo} onChange={e => accion('sistema', () => pedir('PUT', '/api/programaciones/sistema', { activo: e.target.checked }))} />
                                    Run even when AmoxSQL is closed
                                </label>
                            )}
                        </div>
                    </section>

                    <div className="opx-columnas">
                        <section className="opx-panel" aria-labelledby="opx-hoy">
                            <h2 id="opx-hoy">Today</h2>
                            {hoyLinea.length === 0 && <p className="opx-vacio">Nothing scheduled for today.</p>}
                            <ol className="opx-linea">
                                {hoyLinea.map((x, i) => (
                                    <li key={i} className={`opx-item opx-item--${x.tipo}`}>
                                        <span className="opx-hora">{hora(x.cuando)}</span>
                                        <span className="opx-item-texto">
                                            {x.tipo === 'corrida'
                                                ? <button type="button" className="opx-enlace" onClick={() => abrirEjecucion(x.id)}>{x.nombre}</button>
                                                : <span>{x.nombre}</span>}
                                            <Grupo nombre={x.workspaceNombre} color={x.workspaceColor} />
                                        </span>
                                        {x.tipo === 'corrida' ? <Estado estado={x.estado} /> : <span className={`opx-pill opx-pill--${x.pausadaGeneral ? 'pausada' : 'toca'}`}>{x.pausadaGeneral ? 'paused' : 'due'}</span>}
                                    </li>
                                ))}
                            </ol>
                            <h2 className="opx-h2-2">Tomorrow</h2>
                            {d.manana.pendientes.length === 0 && <p className="opx-vacio">Nothing for tomorrow.</p>}
                            <ol className="opx-linea">
                                {d.manana.pendientes.map((x, i) => (
                                    <li key={i} className="opx-item opx-item--pendiente">
                                        <span className="opx-hora">{hora(new Date(x.cuando))}</span>
                                        <span className="opx-item-texto"><span>{x.nombre}</span><Grupo nombre={x.workspaceNombre} color={x.workspaceColor} /></span>
                                        <span className={`opx-pill opx-pill--${x.pausadaGeneral ? 'pausada' : 'toca'}`}>{x.pausadaGeneral ? 'paused' : 'due'}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        <section className="opx-panel" aria-labelledby="opx-progs">
                            <h2 id="opx-progs">Schedules</h2>
                            {porGrupo.length === 0 && <p className="opx-vacio">No schedules yet. Open a process in Data Flow and choose ⋯ → Schedule….</p>}
                            {porGrupo.map(g => (
                                <div key={g.nombre || '-'} className="opx-bloque">
                                    <div className="opx-bloque-cab"><Grupo nombre={g.nombre} color={g.color} /> <span className="opx-n">{g.lista.length}</span></div>
                                    {g.lista.map(p => {
                                        const quieta = !p.activa || (p.pausadaHasta && new Date(p.pausadaHasta) > new Date());
                                        return (
                                            <div key={p.id} className={`opx-prog${quieta ? ' opx-prog--pausada' : ''}`}>
                                                <div className="opx-prog-texto">
                                                    <strong>{p.nombre}</strong>
                                                    <small>{p.descripcion} · {p.proyectoNombre}</small>
                                                    <small>
                                                        {quieta ? (p.pausadaHasta ? `Paused until ${diaHora(new Date(p.pausadaHasta))}` : 'Paused') : p.regla?.tipo === 'al_llegar' ? 'When a file arrives (only while AmoxSQL is open)' : <>Next: {diaHora(p.proxima ? new Date(p.proxima) : null)}</>}
                                                        {p.ultima && <> · Last: <button type="button" className="opx-enlace" onClick={() => abrirEjecucion(p.ultima.id)}><Estado estado={p.ultima.estado} /></button></>}
                                                    </small>
                                                </div>
                                                <button type="button" className="edd-boton" title="Run now" aria-label={`Run ${p.nombre} now`} disabled={ocupado === p.id}
                                                    onClick={() => accion(p.id, () => pedir('POST', `/api/programaciones/${p.id}/correr`))}>{ocupado === p.id ? <LuLoader size={13} className="lote-gira" /> : <LuPlay size={13} />}</button>
                                                {quieta
                                                    ? <button type="button" className="edd-boton" title="Resume" aria-label={`Resume ${p.nombre}`} onClick={() => accion(`p${p.id}`, () => pedir('POST', `/api/programaciones/${p.id}/pausar`, { reanudar: true }))}><LuCirclePlay size={13} /></button>
                                                    : <button type="button" className="edd-boton" title="Pause" aria-label={`Pause ${p.nombre}`} onClick={() => accion(`p${p.id}`, () => pedir('POST', `/api/programaciones/${p.id}/pausar`, {}))}><LuCirclePause size={13} /></button>}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </section>
                    </div>

                    <section className="opx-panel opx-bitacora" aria-labelledby="opx-bit">
                        <div className="opx-bit-cab">
                            <h2 id="opx-bit">Log</h2>
                            <div className="xls-modo opx-filtro" role="radiogroup" aria-label="Show">
                                {[['todas', 'All runs'], ['programadas', 'Scheduled'], ['fallos', 'Failed']].map(([v, t]) => (
                                    <button key={v} type="button" role="radio" aria-checked={filtro === v} className={filtro === v ? 'activo' : ''} onClick={() => setFiltro(v)}>{t}</button>
                                ))}
                            </div>
                        </div>
                        {bitacora.length === 0 && <p className="opx-vacio">No runs here yet.</p>}
                        <div className="opx-tabla-caja">
                            <table className="opx-tabla">
                                <thead><tr><th>When</th><th>Process</th><th>{etq.S}</th><th>How</th><th>Result</th></tr></thead>
                                <tbody>
                                    {bitacora.map(x => (
                                        <tr key={x.id} onClick={() => abrirEjecucion(x.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') abrirEjecucion(x.id); }}>
                                            <td className="opx-td-hora">{diaHora(local(x.inicio))}</td>
                                            <td><strong>{x.nombre}</strong><small>{x.proyectoNombre}</small></td>
                                            <td><Grupo nombre={x.workspaceNombre} color={x.workspaceColor} /></td>
                                            <td>{ORIGEN[x.origen] || x.origen}</td>
                                            <td className="opx-td-res">
                                                <Estado estado={x.estado} />
                                                {x.estado !== 'ok' && x.error ? <small>{String(x.error).split('\n')[0]}</small> : x.linea ? <small>{x.linea.replace(`${x.nombre} · `, '')}</small> : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

/** The title bar button: today's count, and red when something failed today. */
export function BotonOperacion() {
    const [c, setC] = useState(null);
    useEffect(() => {
        let vivo = true;
        const mirar = () => pedir('GET', '/api/operacion?limite=1').then(d => {
            if (!vivo) return;
            const mal = d.hoy.corridas.filter(x => x.estado === 'fallo').length;
            setC({ total: d.hoy.corridas.length + d.hoy.pendientes.length, mal, hay: d.programaciones.length > 0 });
        }).catch(() => {});
        mirar();
        const t = setInterval(mirar, 120000);
        return () => { vivo = false; clearInterval(t); };
    }, []);
    if (!c?.hay) return null;
    return (
        <button type="button" className={`opx-boton${c.mal ? ' opx-boton--mal' : ''}`} title={c.mal ? `${c.mal} scheduled run${c.mal === 1 ? '' : 's'} failed today` : `${c.total} scheduled today`}
            onClick={() => window.dispatchEvent(new CustomEvent('amox_abrir_operacion'))}>
            {c.mal ? <LuCircleAlert size={13} /> : <LuCalendarClock size={13} />}
            <span>{c.total}</span>
        </button>
    );
}
