/**
 * Pantalla 5 del mockup: ¿a qué workspace pertenece esta carpeta? (B1, 6.2)
 *
 * Sale al abrir una carpeta sin enlazar —si hay a quién enlazarla y no se dijo
 * «no volver a preguntar»—, al abrir una que trae un workspace que esta máquina
 * no conoce, y cuando el usuario lo pide desde la barra de título.
 *
 * El enlace se guarda en el project.json de la carpeta (id y nombre, nada más),
 * así que viaja con ella.
 */
import { useEffect, useState } from 'react';
import { LuFolder, LuPlus, LuCheck, LuArrowRight, LuX, LuLink2Off } from 'react-icons/lu';
import { useEtiqueta } from '../../etiqueta';
import { listarWorkspaces, crearWorkspace, enlazarProyecto, COLORES, iniciales } from './api';

export default function EnlazarProyecto({ enlace, onClose }) {
    const e = useEtiqueta();
    const [lista, setLista] = useState([]);
    const [elegido, setElegido] = useState(enlace?.workspace?.id || null);
    const [creando, setCreando] = useState(false);
    const [nombre, setNombre] = useState('');
    const [color, setColor] = useState(COLORES[0]);
    const [noPreguntar, setNoPreguntar] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    // De otra máquina: primero se ofrece crear el que trae; «Choose another» lo cambia.
    const [otraMaquina, setOtraMaquina] = useState(enlace?.estado === 'desconocido');

    useEffect(() => {
        listarWorkspaces().then(l => { setLista(l); if (!l.length && !otraMaquina) setCreando(true); }).catch(err => setError(err.message));
    }, []);

    const cerrar = (resultado) => onClose?.(resultado);
    const hacer = async (fn) => {
        setOcupado(true); setError(null);
        try { cerrar(await fn()); } catch (err) { setError(err.message); setOcupado(false); }
    };

    const ruta = enlace?.proyecto?.ruta || '';
    const enlazadoYa = enlace?.estado === 'enlazado';

    if (otraMaquina && enlace?.enArchivo) {
        const w = enlace.enArchivo;
        return (
            <div className="ww-backdrop">
                <div className="ww-card wsx-card" role="dialog" aria-modal="true" aria-labelledby="wsx-enlazar-titulo">
                    <div className="ww-header">
                        <div className="ww-header-icon"><LuFolder size={20} /></div>
                        <div className="ww-header-text">
                            <h2 className="ww-title" id="wsx-enlazar-titulo">This project belongs to the {e.s} “{w.nombre}”</h2>
                            <p className="ww-subtitle">That {e.s} isn't on this machine yet. Create it here to keep the link — or choose another one.</p>
                        </div>
                        <button className="ww-close-btn" type="button" onClick={() => cerrar(null)} title="Close"><LuX size={16} /></button>
                    </div>
                    <div className="wsx-cuerpo">
                        <div className="wsx-ruta"><LuFolder size={13} />{ruta}</div>
                        {error && <p className="wsx-error">{error}</p>}
                    </div>
                    <div className="ww-actions wsx-actions">
                        <button className="ww-btn-skip" type="button" style={{ marginRight: 'auto' }}
                            onClick={() => hacer(() => enlazarProyecto(null))}>Leave unlinked</button>
                        <button className="ww-btn-skip" type="button" onClick={() => setOtraMaquina(false)}>Choose another…</button>
                        <button className="ww-btn-create" type="button" disabled={ocupado}
                            onClick={() => hacer(async () => {
                                await crearWorkspace({ id: w.id, nombre: w.nombre });
                                return enlazarProyecto(w.id);
                            })}>
                            Create “{w.nombre}” <LuArrowRight size={15} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const crearYElegir = async () => {
        const n = nombre.trim();
        if (!n) return;
        setOcupado(true); setError(null);
        try {
            const w = await crearWorkspace({ nombre: n, color });
            setLista(l => [...l, { ...w, proyectos: 0 }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setElegido(w.id);
            setCreando(false);
            setNombre('');
        } catch (err) {
            setError(err.message);
        }
        setOcupado(false);
    };

    return (
        <div className="ww-backdrop">
            <div className="ww-card wsx-card" role="dialog" aria-modal="true" aria-labelledby="wsx-enlazar-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuFolder size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="wsx-enlazar-titulo">Which {e.s} does this project belong to?</h2>
                        <p className="ww-subtitle">
                            {enlazadoYa ? `It's linked to “${enlace.workspace.nombre}”. Pick another one, or unlink it.` : "You're opening a folder that isn't linked yet."}
                        </p>
                    </div>
                    <button className="ww-close-btn" type="button" onClick={() => cerrar(null)} title="Close"><LuX size={16} /></button>
                </div>

                <div className="wsx-cuerpo">
                    <div className="wsx-ruta"><LuFolder size={13} />{ruta}</div>

                    {lista.length > 0 && (
                        <div className="wsx-elige" role="radiogroup" aria-label={e.P}>
                            {lista.map(w => {
                                const on = elegido === w.id;
                                return (
                                    <button key={w.id} type="button" role="radio" aria-checked={on}
                                        className={`wsx-ws ${on ? 'wsx-ws--on' : ''}`} onClick={() => setElegido(w.id)}>
                                        <span className="wsx-avatar" style={{ background: w.color || 'var(--surface-overlay)' }}>{iniciales(w.nombre)}</span>
                                        <span className="wsx-ws-texto">
                                            <b>{w.nombre}</b>
                                            <small>{[w.etiqueta, `${w.proyectos} project${w.proyectos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small>
                                        </span>
                                        <span className="wsx-radio">{on && <LuCheck size={11} />}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {creando ? (
                        <div className="wsx-nuevo">
                            <input className="wsx-input" autoFocus placeholder={`${e.S} name`} value={nombre}
                                onChange={ev => setNombre(ev.target.value)}
                                onKeyDown={ev => { if (ev.key === 'Enter') crearYElegir(); if (ev.key === 'Escape' && lista.length) setCreando(false); }} />
                            <div className="wsx-muestras" role="radiogroup" aria-label="Color">
                                {COLORES.map(c => (
                                    <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                                        className={`wsx-muestra ${color === c ? 'wsx-muestra--on' : ''}`} style={{ background: c }}
                                        onClick={() => setColor(c)} />
                                ))}
                            </div>
                            <button className="ww-btn-create" type="button" disabled={!nombre.trim() || ocupado} onClick={crearYElegir}>
                                Create {e.s}
                            </button>
                        </div>
                    ) : (
                        <button className="ww-btn-skip wsx-nuevo-btn" type="button" onClick={() => setCreando(true)}>
                            <LuPlus size={13} /> New {e.s}…
                        </button>
                    )}

                    <p className="wsx-letra">
                        Saved in the folder's <code>project.json</code> as the {e.s}'s id and name — nothing else.
                        On another machine without it, AmoxSQL offers to create it.
                    </p>
                    {error && <p className="wsx-error">{error}</p>}
                </div>

                <div className="ww-actions wsx-actions">
                    {enlazadoYa ? (
                        <button className="ww-btn-skip" type="button" style={{ marginRight: 'auto' }} disabled={ocupado}
                            onClick={() => hacer(() => enlazarProyecto(null))}>
                            <LuLink2Off size={13} /> Unlink
                        </button>
                    ) : (
                        <span className="wsx-dejar">
                            <button className="ww-btn-skip" type="button" disabled={ocupado}
                                onClick={() => hacer(() => enlazarProyecto(null, noPreguntar))}>Leave unlinked</button>
                            <label className="wsx-check">
                                <input type="checkbox" checked={noPreguntar} onChange={ev => setNoPreguntar(ev.target.checked)} />
                                Don't ask again for this project
                            </label>
                        </span>
                    )}
                    <button className="ww-btn-create" type="button" disabled={!elegido || ocupado || (enlazadoYa && elegido === enlace.workspace.id)}
                        onClick={() => hacer(() => enlazarProyecto(elegido))}>
                        Link <LuArrowRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
