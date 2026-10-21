/**
 * La vista de workspaces (B3), fase 8 del plan de la 5.9 — pantalla 3 del
 * mockup. Es una pantalla APARTE: la bienvenida de siempre no cambia y sólo
 * gana un botón que lleva aquí (y uno aquí que vuelve).
 *
 * Enseña lo que corrió hace poco, una tarjeta por workspace (estado de sus
 * proyectos, próxima entrega, política de IA), los proyectos sin workspace y
 * los archivados; busca por nombre y ruta en todos los proyectos; y desde un
 * workspace se cambia el estado y la entrega de cada proyecto (8.2), se edita
 * su contexto y se exporta o importa como .amoxworkspace (8.3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    LuArrowLeft, LuPlus, LuFolderOpen, LuFolder, LuArchive, LuArchiveRestore, LuSearch,
    LuCircleCheck, LuCircleX, LuCircleDot, LuCalendarClock, LuDownload, LuUpload, LuFileText,
    LuPencil, LuShieldCheck, LuHardDrive, LuX, LuTriangleAlert, LuKeyRound, LuLoader,
} from 'react-icons/lu';
import { API_BASE } from '../../api.js';
import { useEtiqueta } from '../../etiqueta';
import { iniciales, archivarWorkspace } from './api';
import { resumenPolitica } from './WorkspacesPanel';
import ContextoWorkspace from './ContextoWorkspace';
import FuentesDelWorkspace from '../fuentes/FuentesDelWorkspace';
import DestinosDeEntrega from '../fuentes/DestinosDeEntrega';
import CalendarioDelWorkspace from './CalendarioDelWorkspace';

async function pedir(metodo, ruta, cuerpo) {
    const r = await fetch(`${API_BASE}${ruta}`, {
        method: metodo,
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `Request failed (${r.status})`);
    return d;
}

export const ESTADOS = [
    ['en_curso', 'In progress', 'ok'],
    ['en_revision', 'In review', 'warn'],
    ['entregado', 'Delivered', ''],
    ['pausado', 'Paused', ''],
];
const ESTADO = Object.fromEntries(ESTADOS.map(([k, t, c]) => [k, { texto: t, clase: c }]));

/** Las fechas de la base llegan como TIMESTAMP sin zona, en UTC. */
const aFecha = (t) => (t ? new Date(String(t).replace(' ', 'T') + (String(t).includes('Z') ? '' : 'Z')) : null);
function hace(t) {
    const d = aFecha(t);
    if (!d || Number.isNaN(d.getTime())) return '—';
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (dias <= 0) return 'today';
    if (dias === 1) return 'yesterday';
    if (dias < 7) return `${dias} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function hora(t) {
    const d = aFecha(t);
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}
function duracion(a, b) {
    const x = aFecha(a), y = aFecha(b);
    if (!x || !y) return '';
    const s = Math.max(0, Math.round((y - x) / 1000));
    return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}
const fechaCorta = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

function Avatar({ w, grande = false }) {
    return <span className={`wsv-av${grande ? ' wsv-av--grande' : ''}`} style={{ background: w.color || 'var(--surface-overlay)' }}>{iniciales(w.nombre)}</span>;
}

function ChipPolitica({ p }) {
    const t = resumenPolitica(p);
    return t ? <span className="wsv-chip wsv-chip--acc"><LuShieldCheck size={11} />{t}</span> : null;
}

/** Lo que corrió hace poco: una celda por ejecución. */
function Ejecuciones({ lista }) {
    if (!lista.length) return <p className="wsv-vacio">Nothing has run yet. Processes run from Data Flow or the command line show up here.</p>;
    return (
        <div className="wsv-runs">
            {lista.slice(0, 4).map(e => {
                const ok = e.estado === 'ok';
                const corre = e.estado === 'en_curso';
                return (
                    <div key={e.id} className={`wsv-run${!ok && !corre ? ' wsv-run--falla' : ''}`} title={e.proceso}>
                        <div className="wsv-run-q">
                            {ok ? <LuCircleCheck size={13} className="wsv-ok" /> : corre ? <LuCircleDot size={13} className="wsv-acc" /> : <LuCircleX size={13} className="wsv-err" />}
                            {e.nombreProceso}
                        </div>
                        <div className="wsv-run-d">
                            {[e.workspace, hace(e.inicio) === 'today' ? hora(e.inicio) : hace(e.inicio), ok ? duracion(e.inicio, e.fin) : (e.error || e.estado)].filter(Boolean).join(' · ')}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/** Enlazar una carpeta suelta sin abrirla. */
function SelectorEnlace({ workspaces, etiqueta, onElegir }) {
    return (
        <select className="wsv-select" value="" onChange={(e) => e.target.value && onElegir(e.target.value)} aria-label={`Link to a ${etiqueta.s}`}>
            <option value="">Link to a {etiqueta.s}…</option>
            {workspaces.map(w => <option key={w.id} value={w.id}>{w.nombre}</option>)}
        </select>
    );
}

/** Importar un .amoxworkspace: lo que trae, qué cambia, y qué sobrescribir. */
function Importar({ contenido, analisis, etiqueta, onCerrar, onHecho }) {
    const [sobrescribir, setSobrescribir] = useState(new Set());
    const [metadatos, setMetadatos] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const distintos = analisis.archivos.filter(a => a.estado === 'distinto');
    const hacer = async (opciones) => {
        setOcupado(true); setError(null);
        try { onHecho(await pedir('POST', '/api/workspaces-importar', { contenido, opciones })); }
        catch (err) { setError(err.message); setOcupado(false); }
    };
    const ETQ = { nuevo: 'new', igual: 'same', distinto: 'different' };
    return (
        <div className="ww-backdrop">
            <div className="ww-card wsx-card" role="dialog" aria-modal="true" aria-labelledby="wsv-imp-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuUpload size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="wsv-imp-titulo">Import “{analisis.workspace.nombre}”</h2>
                        <p className="ww-subtitle">
                            {analisis.existe
                                ? `This ${etiqueta.s} is already here${analisis.local?.nombre !== analisis.workspace.nombre ? ` as “${analisis.local?.nombre}”` : ''}. New files are added; choose which different ones to replace.`
                                : `A new ${etiqueta.s} with the same id, so the projects linked to it on other machines recognize it here too.`}
                        </p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={onCerrar} title="Close"><LuX size={16} /></button>
                </div>
                <div className="wsx-cuerpo">
                    <div className="wsv-imp-lista">
                        {analisis.archivos.length === 0 && <p className="wsv-vacio">No context files.</p>}
                        {analisis.archivos.map(a => (
                            <label key={a.ruta} className="wsv-imp-archivo">
                                {a.estado === 'distinto'
                                    ? <input type="checkbox" checked={sobrescribir.has(a.ruta)} onChange={(e) => setSobrescribir(s => { const n = new Set(s); e.target.checked ? n.add(a.ruta) : n.delete(a.ruta); return n; })} />
                                    : <span className="wsv-imp-hueco" />}
                                <code>{a.ruta}</code>
                                <span className={`wsv-chip${a.estado === 'nuevo' ? ' wsv-chip--ok' : a.estado === 'distinto' ? ' wsv-chip--warn' : ''}`}>{ETQ[a.estado]}</span>
                            </label>
                        ))}
                    </div>
                    {distintos.length > 0 && <p className="wsx-letra">Ticked files replace yours; the rest stay as they are.</p>}
                    {analisis.existe && (
                        <label className="wsx-check">
                            <input type="checkbox" checked={metadatos} onChange={(e) => setMetadatos(e.target.checked)} />
                            Also take the name, color, AI policy and brand from the file
                        </label>
                    )}
                    {analisis.credenciales.length > 0 && (
                        <p className="wsx-letra wsv-imp-cred">
                            <LuKeyRound size={12} /> Its projects use these credentials: <b>{analisis.credenciales.join(', ')}</b>. The file never carries their values — add them in Settings → Credentials.
                        </p>
                    )}
                    {error && <p className="wsx-error">{error}</p>}
                </div>
                <div className="ww-actions wsx-actions">
                    {analisis.existe && (
                        <button className="ww-btn-skip" type="button" style={{ marginRight: 'auto' }} disabled={ocupado} onClick={() => hacer({ comoNuevo: true })}>
                            Import as a separate {etiqueta.s}
                        </button>
                    )}
                    <button className="ww-btn-skip" type="button" onClick={onCerrar}>Cancel</button>
                    <button className="ww-btn-create" type="button" disabled={ocupado} onClick={() => hacer({ sobrescribir: [...sobrescribir], metadatos })}>
                        Import
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function VistaWorkspaces({ onVolver, onAbrir }) {
    const e = useEtiqueta();
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [sel, setSel] = useState(null);           // id de workspace | 'sueltos' | 'archivados' | null
    const [busca, setBusca] = useState('');
    const [resultados, setResultados] = useState(null);
    const [contexto, setContexto] = useState(null);
    const [importando, setImportando] = useState(null);
    const [aviso, setAviso] = useState(null);
    const archivoRef = useRef(null);

    const cargar = useCallback(() => pedir('GET', '/api/inicio').then(d => { setDatos(d); setError(null); }).catch(err => setError(err.message)), []);
    useEffect(() => {
        cargar();
        window.addEventListener('amox_workspaces_cambiaron', cargar);
        return () => window.removeEventListener('amox_workspaces_cambiaron', cargar);
    }, [cargar]);

    useEffect(() => {
        if (!busca.trim()) { setResultados(null); return undefined; }
        const t = setTimeout(() => pedir('GET', `/api/proyectos?q=${encodeURIComponent(busca)}`).then(d => setResultados(d.proyectos)).catch(() => {}), 150);
        return () => clearTimeout(t);
    }, [busca]);

    const ws = datos?.workspaces || [];
    const actual = useMemo(() => ws.find(w => w.id === sel) || null, [ws, sel]);
    const [suyos, setSuyos] = useState([]);
    useEffect(() => {
        if (!actual) { setSuyos([]); return; }
        pedir('GET', `/api/workspaces/${encodeURIComponent(actual.id)}/proyectos`).then(d => setSuyos(d.proyectos || [])).catch(() => setSuyos([]));
    }, [actual, datos]);

    const avisar = (t) => { setAviso(t); setTimeout(() => setAviso(null), 4000); };
    const ajustes = () => window.dispatchEvent(new CustomEvent('amox_abrir_ajustes', { detail: 'workspaces' }));
    const enlazar = async (ruta, workspaceId) => {
        try { await pedir('PUT', '/api/proyectos-enlace', { ruta, workspaceId }); cargar(); }
        catch (err) { avisar(err.message); }
    };
    const cambiarProyecto = async (id, cambio) => {
        try {
            const p = await pedir('PUT', `/api/proyectos/${encodeURIComponent(id)}`, cambio);
            setSuyos(l => l.map(x => (x.id === id ? { ...x, estado: p.estado, entrega: p.entrega } : x)));
            cargar();
        } catch (err) { avisar(err.message); }
    };
    const exportar = async (w) => {
        try {
            const paquete = await pedir('GET', `/api/workspaces/${encodeURIComponent(w.id)}/exportar`);
            const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${w.nombre.replace(/[^\w\-. ]+/g, '').trim() || 'workspace'}.amoxworkspace`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (err) { avisar(err.message); }
    };
    const elegirArchivo = async (ev) => {
        const f = ev.target.files?.[0];
        ev.target.value = '';
        if (!f) return;
        try {
            const contenido = await f.text();
            setImportando({ contenido, analisis: await pedir('POST', '/api/workspaces-importar/analizar', { contenido }) });
        } catch (err) { avisar(err.message); }
    };

    const hoy = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    const enSemana = ws.filter(w => w.proximaEntrega && (new Date(`${w.proximaEntrega.fecha}T12:00:00`) - Date.now()) < 7 * 86400000).length;

    // ── las piezas del panel principal ─────────────────────────────────────
    const filaProyecto = (p, { conEnlace = false } = {}) => (
        <tr key={p.id}>
            <td><b>{p.nombre}</b></td>
            <td className="wsv-mono" title={p.ruta}>{p.ruta}</td>
            <td>{p.existe === false ? <span className="wsv-chip wsv-chip--warn"><LuTriangleAlert size={11} />not found</span> : hace(p.ultimoAbierto || p.ultimo_abierto)}</td>
            <td className="wsv-td-acciones">
                {conEnlace && ws.length > 0 && <SelectorEnlace workspaces={ws} etiqueta={e} onElegir={(id) => enlazar(p.ruta, id)} />}
                <button className="wsv-btn" type="button" disabled={p.existe === false} onClick={() => onAbrir(p.ruta)}><LuFolderOpen size={13} />Open</button>
            </td>
        </tr>
    );

    let principal;
    if (resultados) {
        principal = (
            <>
                <div className="wsv-etq"><LuSearch size={12} />{resultados.length} project{resultados.length === 1 ? '' : 's'} for “{busca}”</div>
                <div className="wsv-caja">
                    <table className="wsv-tabla"><tbody>
                        {resultados.map(p => filaProyecto(p))}
                        {resultados.length === 0 && <tr><td className="wsv-vacio">No project matches.</td></tr>}
                    </tbody></table>
                </div>
            </>
        );
    } else if (actual) {
        const runs = (datos?.ejecuciones || []).filter(x => x.workspace === actual.nombre);
        principal = (
            <>
                <div className="wsv-cab">
                    <Avatar w={actual} grande />
                    <div className="wsv-cab-texto">
                        <h2>{actual.nombre}</h2>
                        <div className="wsv-fichas">
                            {actual.etiqueta && <span className="wsv-chip">{actual.etiqueta}</span>}
                            <ChipPolitica p={actual.politicaIa} />
                            {actual.marca?.paleta?.length > 0 && (
                                <span className="wsv-chip" title="Brand palette">
                                    {actual.marca.paleta.slice(0, 5).map((c, i) => <span key={i} className="wsv-muestra" style={{ background: c }} />)}
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="wsv-sep" />
                    <button className="wsv-btn" type="button" onClick={() => setContexto(actual)}><LuFileText size={13} />Context</button>
                    <button className="wsv-btn" type="button" onClick={ajustes}><LuPencil size={13} />Edit</button>
                    <button className="wsv-btn" type="button" onClick={() => exportar(actual)}><LuDownload size={13} />Export</button>
                </div>

                <div className="wsv-etq">Projects</div>
                <div className="wsv-caja">
                    <table className="wsv-tabla">
                        <thead><tr><th>Project</th><th>Status</th><th>Due</th><th>Last opened</th><th /></tr></thead>
                        <tbody>
                            {suyos.length === 0 && <tr><td colSpan={5} className="wsv-vacio">No project linked yet. Open a folder and link it from the title bar, or use “Link to a {e.s}” on an unassigned one.</td></tr>}
                            {suyos.map(p => (
                                <tr key={p.id}>
                                    <td><b>{p.nombre}</b><small className="wsv-mono">{p.ruta}</small></td>
                                    <td>
                                        <select className={`wsv-select wsv-estado wsv-estado--${ESTADO[p.estado]?.clase || 'nada'}`} value={p.estado || ''}
                                            onChange={(ev) => cambiarProyecto(p.id, { estado: ev.target.value || null })} aria-label={`Status of ${p.nombre}`}>
                                            <option value="">No status</option>
                                            {ESTADOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                                        </select>
                                    </td>
                                    <td>
                                        <input type="date" className="wsv-fecha" value={p.entrega ? String(p.entrega).slice(0, 10) : ''}
                                            onChange={(ev) => cambiarProyecto(p.id, { entrega: ev.target.value || null })} aria-label={`Due date of ${p.nombre}`} />
                                    </td>
                                    <td>{p.existe === false ? <span className="wsv-chip wsv-chip--warn">not found</span> : hace(p.ultimo_abierto)}</td>
                                    <td className="wsv-td-acciones">
                                        <button className="wsv-btn" type="button" disabled={p.existe === false} onClick={() => onAbrir(p.ruta)}><LuFolderOpen size={13} />Open</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <FuentesDelWorkspace key={actual.id} workspace={actual} avisar={avisar} />
                <DestinosDeEntrega key={`d-${actual.id}`} variante="tabla" workspace={actual} avisar={avisar} />
                <CalendarioDelWorkspace key={`c-${actual.id}`} workspace={actual} avisar={avisar} />

                <div className="wsv-etq"><LuCalendarClock size={12} />Recent runs</div>
                <Ejecuciones lista={runs} />

                <div className="wsv-pie-acciones">
                    <button className="wsv-btn wsv-btn--fant" type="button" onClick={async () => { try { await archivarWorkspace(actual.id, true); setSel(null); cargar(); } catch (err) { avisar(err.message); } }}>
                        <LuArchive size={13} />Archive {e.s}
                    </button>
                </div>
            </>
        );
    } else if (sel === 'sueltos') {
        principal = (
            <>
                <h2 className="wsv-h2">Not linked to any {e.s}</h2>
                <p className="wsv-sub">Projects work the same unlinked. Linking only writes the {e.s}'s id and name into the folder's project.json.</p>
                <div className="wsv-caja"><table className="wsv-tabla"><tbody>
                    {(datos?.sinWorkspace || []).map(p => filaProyecto(p, { conEnlace: true }))}
                    {(datos?.sinWorkspace || []).length === 0 && <tr><td className="wsv-vacio">Every project belongs to a {e.s}.</td></tr>}
                </tbody></table></div>
            </>
        );
    } else if (sel === 'archivados') {
        principal = (
            <>
                <h2 className="wsv-h2">Archived {e.p}</h2>
                <p className="wsv-sub">Out of the way, not deleted. Their projects and context are kept.</p>
                <div className="wsv-caja"><table className="wsv-tabla"><tbody>
                    {(datos?.archivados || []).map(w => (
                        <tr key={w.id}>
                            <td><span className="wsv-nombre"><Avatar w={w} />{w.nombre}</span></td>
                            <td>{w.proyectos} project{w.proyectos === 1 ? '' : 's'}</td>
                            <td className="wsv-td-acciones">
                                <button className="wsv-btn" type="button" onClick={async () => { await archivarWorkspace(w.id, false); cargar(); }}><LuArchiveRestore size={13} />Restore</button>
                            </td>
                        </tr>
                    ))}
                </tbody></table></div>
            </>
        );
    } else {
        principal = (
            <>
                <div className="wsv-fila">
                    <div>
                        <h2 className="wsv-h2">{hoy.charAt(0).toUpperCase() + hoy.slice(1)}</h2>
                        <p className="wsv-sub">
                            {ws.length} {ws.length === 1 ? e.s : e.p} · {datos?.totalProyectos ?? 0} projects{enSemana ? ` · ${enSemana} due this week` : ''}
                        </p>
                    </div>
                </div>

                <div className="wsv-etq"><LuCalendarClock size={12} />Recent runs, across all {e.p}</div>
                <Ejecuciones lista={datos?.ejecuciones || []} />

                <div className="wsv-etq">{e.P}</div>
                {ws.length === 0 && <p className="wsv-vacio">No {e.p} yet. <button className="wsv-enlace" type="button" onClick={ajustes}>Create the first one</button>.</p>}
                <div className="wsv-rej">
                    {ws.map(w => (
                        <button key={w.id} type="button" className="wsv-tarjeta" onClick={() => setSel(w.id)}>
                            <span className="wsv-tarjeta-t">
                                <Avatar w={w} />
                                <span className="wsv-tarjeta-nom"><b>{w.nombre}</b><small>{[w.etiqueta, `${w.proyectos} project${w.proyectos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small></span>
                                <span className="wsv-sep" />
                                <ChipPolitica p={w.politicaIa} />
                            </span>
                            <span className="wsv-estados">
                                {ESTADOS.filter(([k]) => w.porEstado?.[k]).map(([k, t, c]) => (
                                    <span key={k} className={`wsv-chip${c ? ` wsv-chip--${c}` : ''}`}>{w.porEstado[k]} {t.toLowerCase()}</span>
                                ))}
                                {!Object.keys(w.porEstado || {}).length && <span className="wsv-chip">no status set</span>}
                            </span>
                            <span className="wsv-prox">
                                <LuCalendarClock size={12} />
                                {w.proximaEntrega ? <>Next due: <b>{w.proximaEntrega.proyecto}</b> · {fechaCorta(w.proximaEntrega.fecha)}</> : 'No due dates'}
                            </span>
                        </button>
                    ))}
                </div>

                {(datos?.sinWorkspace || []).length > 0 && (
                    <>
                        <div className="wsv-etq">Not linked to any {e.s} yet</div>
                        <div className="wsv-caja"><table className="wsv-tabla"><tbody>
                            {datos.sinWorkspace.slice(0, 5).map(p => filaProyecto(p, { conEnlace: true }))}
                        </tbody></table></div>
                        {datos.sinWorkspace.length > 5 && <button className="wsv-enlace" type="button" onClick={() => setSel('sueltos')}>See all {datos.sinWorkspace.length}</button>}
                    </>
                )}
            </>
        );
    }

    return (
        <div className="wsv">
            <aside className="wsv-lateral">
                <button className="wsv-volver" type="button" onClick={onVolver}><LuArrowLeft size={14} />Welcome</button>
                <div className="wsv-enc">
                    <span>{e.P}</span>
                    <button type="button" onClick={ajustes} title={`New ${e.s}`} aria-label={`New ${e.s}`}><LuPlus size={14} /></button>
                </div>
                <nav className="wsv-lista" aria-label={e.P}>
                    <button type="button" className={`wsv-it${sel === null && !resultados ? ' wsv-it--on' : ''}`} onClick={() => { setSel(null); setBusca(''); }}>
                        <LuHardDrive size={13} />Overview
                    </button>
                    {ws.map(w => (
                        <button key={w.id} type="button" className={`wsv-it${sel === w.id ? ' wsv-it--on' : ''}`} onClick={() => { setSel(w.id); setBusca(''); }}>
                            <span className="wsv-punto" style={{ background: w.color || 'var(--text-tertiary)' }} />
                            <span className="wsv-it-nom">{w.nombre}</span>
                            <span className="wsv-n">{w.proyectos}</span>
                        </button>
                    ))}
                </nav>
                <hr />
                <nav className="wsv-lista">
                    <button type="button" className={`wsv-it${sel === 'sueltos' ? ' wsv-it--on' : ''}`} onClick={() => { setSel('sueltos'); setBusca(''); }}>
                        <LuFolder size={13} />Unassigned<span className="wsv-n">{datos?.sinWorkspace?.length ?? 0}</span>
                    </button>
                    <button type="button" className={`wsv-it${sel === 'archivados' ? ' wsv-it--on' : ''}`} onClick={() => { setSel('archivados'); setBusca(''); }}>
                        <LuArchive size={13} />Archived<span className="wsv-n">{datos?.archivados?.length ?? 0}</span>
                    </button>
                </nav>
                <div className="wsv-pie">
                    <LuHardDrive size={12} />{datos?.totalProyectos ?? 0} projects
                </div>
            </aside>

            <main className="wsv-principal">
                <div className="wsv-barra">
                    <label className="wsv-buscar">
                        <LuSearch size={13} />
                        <input value={busca} onChange={(ev) => setBusca(ev.target.value)} placeholder="Search all projects by name or folder" aria-label="Search all projects" />
                        {busca && <button type="button" onClick={() => setBusca('')} aria-label="Clear search"><LuX size={12} /></button>}
                    </label>
                    <span className="wsv-sep" />
                    <button className="wsv-btn wsv-btn--fant" type="button" onClick={() => window.dispatchEvent(new CustomEvent('amox_abrir_operacion'))}><LuCalendarClock size={13} />Operations</button>
                    <button className="wsv-btn wsv-btn--fant" type="button" onClick={() => archivoRef.current?.click()}><LuUpload size={13} />Import…</button>
                    <input ref={archivoRef} type="file" accept=".amoxworkspace,.json" hidden onChange={elegirArchivo} />
                    <button className="wsv-btn wsv-btn--pri" type="button" onClick={ajustes}><LuPlus size={13} />New {e.s}</button>
                </div>
                {error && <p className="wsx-error">{error}</p>}
                {!datos && !error ? <LuLoader size={16} className="stg-spin" /> : principal}
                {aviso && <div className="wsv-aviso" role="status">{aviso}</div>}
            </main>

            {contexto && <ContextoWorkspace workspace={contexto} onClose={() => setContexto(null)} />}
            {importando && (
                <Importar
                    contenido={importando.contenido}
                    analisis={importando.analisis}
                    etiqueta={e}
                    onCerrar={() => setImportando(null)}
                    onHecho={(r) => {
                        setImportando(null);
                        cargar();
                        setSel(r.workspace.id);
                        avisar(`Imported “${r.workspace.nombre}”${r.escritos.length ? ` — ${r.escritos.length} file${r.escritos.length === 1 ? '' : 's'} written` : ''}.`);
                    }}
                />
            )}
        </div>
    );
}
