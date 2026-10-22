/**
 * «Donde lo dejaste» (5.14, F5; Dec-46).
 *
 * Al abrir un proyecto, una tarjeta en la zona del editor —no un diálogo: lo de
 * detrás se sigue viendo y se puede usar— con lo que hace falta para retomarlo:
 * las pestañas que volvieron, lo que falló sin nadie delante, la última
 * ejecución de cada proceso, la entrega, lo que cambió en git y las fuentes que
 * aquí no se leen. Se cierra con **Continue**. Si no hay nada que contar, no sale.
 */
import { useEffect, useState } from 'react';
import {
    LuHistory, LuCircleAlert, LuTriangleAlert, LuCircleCheck, LuCalendarClock, LuGitBranch, LuInbox, LuFiles, LuArrowRight,
} from 'react-icons/lu';
import { API_BASE } from '../api.js';
import { ESTADOS } from './workspaces/VistaWorkspaces';
import { marcarVistas } from './operacion/Atencion';

const ESTADO = Object.fromEntries(ESTADOS.map(([k, t]) => [k, t]));

/** Cuánto hace, en palabras cortas. `local`: hora local sin zona (ejecuciones). */
function hace(t, { local = false } = {}) {
    if (!t) return '';
    const d = local ? new Date(String(t).replace(' ', 'T')) : new Date(t);
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (Number.isNaN(min)) return '';
    if (min < 2) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    const dias = Math.round(h / 24);
    if (dias < 7) return dias === 1 ? 'yesterday' : `${dias} days ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** «due Thursday», «due today», «due 3 days ago». */
function entrega(fecha) {
    if (!fecha) return null;
    const d = new Date(`${fecha}T00:00:00`);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = Math.round((d - hoy) / 86400000);
    if (dias === 0) return { texto: 'due today', urgente: true };
    if (dias === 1) return { texto: 'due tomorrow', urgente: true };
    if (dias < 0) return { texto: `was due ${-dias === 1 ? 'yesterday' : `${-dias} days ago`}`, urgente: true };
    if (dias < 7) return { texto: `due ${d.toLocaleDateString(undefined, { weekday: 'long' })}`, urgente: false };
    return { texto: `due ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, urgente: false };
}

const abrirFicha = (runId) => {
    window.dispatchEvent(new CustomEvent('amox_abrir_ejecucion', { detail: { runId } }));
    marcarVistas([runId]);
};

export default function Retomar({ pestanas = [], onAbrirArchivo, onClose }) {
    const [d, setD] = useState(null);

    useEffect(() => {
        let vivo = true;
        fetch(`${API_BASE}/api/proyecto/retomar`).then(r => (r.ok ? r.json() : null)).then(x => { if (vivo) setD(x); }).catch(() => {});
        return () => { vivo = false; };
    }, []);

    if (!d) return null;
    if (!d.hayAlgo && !pestanas.length) return null;

    const p = d.proyecto || {};
    const e = entrega(p.entrega);
    const ultima = d.desdeLaUltimaVez;
    const git = d.git;

    return (
        <section className="rtm" aria-label="Where you left off">
            <header className="rtm-cab">
                <LuHistory size={16} />
                <div className="rtm-titulo">
                    <h2>Where you left off</h2>
                    <p>
                        {[p.nombre, p.ultimaVez ? `last opened ${hace(p.ultimaVez)}` : null, p.estado ? ESTADO[p.estado] || p.estado : null].filter(Boolean).join(' · ')}
                        {e && <span className={`rtm-entrega${e.urgente ? ' rtm-entrega--urgente' : ''}`}><LuCalendarClock size={12} /> {e.texto}</span>}
                    </p>
                </div>
            </header>

            {d.atencion?.length > 0 && (
                <div className="rtm-bloque rtm-bloque--mal">
                    <h3><LuCircleAlert size={13} /> Needs attention</h3>
                    <ul>
                        {d.atencion.slice(0, 4).map(x => (
                            <li key={x.id}>
                                <button type="button" className="rtm-enlace" onClick={() => abrirFicha(x.id)}>
                                    <strong>{x.nombre}</strong> <span className="rtm-meta">{hace(x.cuando, { local: true })}</span>
                                    <span className="rtm-razon">{x.razon}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="rtm-rejilla">
                {pestanas.length > 0 && (
                    <div className="rtm-bloque">
                        <h3><LuFiles size={13} /> Your tabs are back</h3>
                        <p className="rtm-lista">{pestanas.slice(0, 5).join(' · ')}{pestanas.length > 5 ? ` and ${pestanas.length - 5} more` : ''}</p>
                    </div>
                )}

                {d.procesos?.length > 0 && (
                    <div className="rtm-bloque">
                        <h3><LuArrowRight size={13} /> Last runs{ultima ? ` · since last time: ${ultima.ejecuciones} run${ultima.ejecuciones === 1 ? '' : 's'}${ultima.fallidas ? `, ${ultima.fallidas} failed` : ''}` : ''}</h3>
                        <ul>
                            {d.procesos.map(x => (
                                <li key={x.runId}>
                                    <button type="button" className="rtm-enlace rtm-enlace--fila" onClick={() => abrirFicha(x.runId)} title={x.linea || ''}>
                                        {x.estado === 'fallo' ? <LuCircleAlert size={12} className="rtm-mal" /> : x.estado === 'aviso' ? <LuTriangleAlert size={12} className="rtm-aviso" /> : <LuCircleCheck size={12} className="rtm-ok" />}
                                        <span className="rtm-nombre">{x.nombre}</span>
                                        <span className="rtm-meta">{hace(x.cuando, { local: true })}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {git && (git.sinGuardar > 0 || git.commitsDesde > 0) && (
                    <div className="rtm-bloque">
                        <h3><LuGitBranch size={13} /> {git.rama || 'Git'}</h3>
                        <p className="rtm-lista">
                            {[git.commitsDesde ? `${git.commitsDesde} new commit${git.commitsDesde === 1 ? '' : 's'} since last time${git.autores?.length ? ` (${git.autores.join(', ')})` : ''}` : null,
                                git.sinGuardar ? `${git.sinGuardar} file${git.sinGuardar === 1 ? '' : 's'} not committed` : null].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                )}

                {d.fuentes?.length > 0 && (
                    <div className="rtm-bloque">
                        <h3><LuInbox size={13} /> Sources</h3>
                        <ul>
                            {d.fuentes.slice(0, 4).map(f => <li key={f.nombre} className="rtm-lista"><strong>{f.nombre}</strong>: {f.problema}</li>)}
                        </ul>
                    </div>
                )}
            </div>

            <footer className="rtm-pie">
                {d.procesos?.[0]?.proceso && /\.sqlchain$/i.test(d.procesos[0].proceso) && onAbrirArchivo && (
                    <button type="button" className="rtm-btn" onClick={() => { onAbrirArchivo(d.procesos[0].proceso); onClose?.(); }}>
                        Open {d.procesos[0].nombre}
                    </button>
                )}
                <button type="button" className="rtm-btn rtm-btn--principal" onClick={onClose} autoFocus>Continue</button>
            </footer>
        </section>
    );
}
