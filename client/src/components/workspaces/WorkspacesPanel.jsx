/**
 * Settings → la sección de workspaces (B1, B8), con el nombre que eligió el
 * usuario: «Clients», «Teams»…
 *
 * Aquí se cambia esa palabra y se gestionan los workspaces: crear, renombrar,
 * etiqueta, color, archivar y recuperar. Enlazar una carpeta se hace desde la
 * barra de título, con la carpeta abierta.
 */
import { useCallback, useEffect, useState } from 'react';
import { LuPlus, LuPencil, LuArchive, LuArchiveRestore, LuCheck, LuX, LuLoader } from 'react-icons/lu';
import { useEtiqueta, elegirEtiqueta, formas, CLAVES } from '../../etiqueta';
import { listarWorkspaces, crearWorkspace, actualizarWorkspace, archivarWorkspace, COLORES, iniciales } from './api';

function Muestras({ valor, onChange }) {
    return (
        <div className="wsx-muestras" role="radiogroup" aria-label="Color">
            {COLORES.map(c => (
                <button key={c} type="button" role="radio" aria-checked={valor === c} aria-label={c}
                    className={`wsx-muestra ${valor === c ? 'wsx-muestra--on' : ''}`} style={{ background: c }}
                    onClick={() => onChange(c)} />
            ))}
        </div>
    );
}

/** Crear o editar: nombre, etiqueta y color. */
function Formulario({ inicial, etiqueta, onGuardar, onCancelar }) {
    const [nombre, setNombre] = useState(inicial?.nombre || '');
    const [tag, setTag] = useState(inicial?.etiqueta || '');
    const [color, setColor] = useState(inicial?.color || COLORES[0]);
    const listo = nombre.trim().length > 0;
    const guardar = () => { if (listo) onGuardar({ nombre: nombre.trim(), etiqueta: tag.trim(), color }); };
    return (
        <div className="stg-row wsx-form">
            <div className="wsx-form-campos">
                <input className="wsx-input" autoFocus placeholder={`${etiqueta.S} name`} value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') onCancelar(); }} />
                <input className="wsx-input wsx-input--corto" placeholder="Tag (optional)" value={tag}
                    onChange={e => setTag(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') onCancelar(); }} />
                <Muestras valor={color} onChange={setColor} />
            </div>
            <div className="wsx-form-botones">
                <button className="stg-btn" type="button" onClick={onCancelar} aria-label="Cancel"><LuX size={14} /></button>
                <button className="stg-btn stg-btn--primary" type="button" disabled={!listo} onClick={guardar}>
                    <LuCheck size={14} /> {inicial ? 'Save' : `Create ${etiqueta.s}`}
                </button>
            </div>
        </div>
    );
}

export default function WorkspacesPanel() {
    const e = useEtiqueta();
    const [activos, setActivos] = useState(null);
    const [archivados, setArchivados] = useState([]);
    const [verArchivados, setVerArchivados] = useState(false);
    const [editando, setEditando] = useState(null);   // id | 'nuevo' | null
    const [error, setError] = useState(null);

    const cargar = useCallback(async () => {
        try {
            const [a, b] = await Promise.all([listarWorkspaces(false), listarWorkspaces(true)]);
            setActivos(a); setArchivados(b); setError(null);
        } catch (err) {
            setActivos([]); setError(err.message);
        }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    const intentar = async (fn) => {
        try { await fn(); setEditando(null); } catch (err) { setError(err.message); }
        cargar();
    };

    return (
        <div className="stg-section">
            <h3 className="stg-section-title">What do you call them?</h3>
            <p className="stg-row-desc stg-row-desc--mb14">
                What groups your projects. It's the word AmoxSQL uses everywhere — and the one the assistant uses too.
            </p>
            <div className="wsx-palabras" role="radiogroup" aria-label="Grouping word">
                {CLAVES.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={e.clave === c}
                        className={`wsx-palabra ${e.clave === c ? 'wsx-palabra--on' : ''}`}
                        onClick={() => elegirEtiqueta(c).catch(err => setError(err.message))}>
                        {formas(c).P}
                    </button>
                ))}
            </div>

            <h3 className="stg-section-title" style={{ marginTop: 24 }}>Your {e.p}</h3>
            <p className="stg-row-desc stg-row-desc--mb14">
                A {e.s} lives in AmoxSQL, not in a folder. Link a project to it from the project menu in the title bar.
            </p>
            {error && <p className="stg-row-desc" role="alert" style={{ color: 'var(--feedback-error-text)' }}>{error}</p>}

            <div className="stg-group">
                {activos === null && <div className="stg-row"><LuLoader size={14} className="stg-spin" /></div>}
                {activos && activos.length === 0 && editando !== 'nuevo' && (
                    <div className="stg-row"><p className="stg-row-desc">No {e.p} yet.</p></div>
                )}
                {(activos || []).map(w => (
                    editando === w.id ? (
                        <Formulario key={w.id} inicial={w} etiqueta={e} onCancelar={() => setEditando(null)}
                            onGuardar={(datos) => intentar(() => actualizarWorkspace(w.id, datos))} />
                    ) : (
                        <div key={w.id} className="stg-row">
                            <div className="wsx-fila">
                                <span className="wsx-avatar" style={{ background: w.color || 'var(--surface-overlay)' }}>{iniciales(w.nombre)}</span>
                                <div style={{ minWidth: 0 }}>
                                    <span className="stg-row-label">{w.nombre}</span>
                                    <p className="stg-row-desc">
                                        {[w.etiqueta, `${w.proyectos} project${w.proyectos === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                            </div>
                            <div className="wsx-form-botones">
                                <button className="stg-btn" type="button" title="Edit" aria-label={`Edit ${w.nombre}`} onClick={() => setEditando(w.id)}>
                                    <LuPencil size={14} />
                                </button>
                                <button className="stg-btn" type="button" title="Archive" aria-label={`Archive ${w.nombre}`}
                                    onClick={() => intentar(() => archivarWorkspace(w.id, true))}>
                                    <LuArchive size={14} />
                                </button>
                            </div>
                        </div>
                    )
                ))}
                {editando === 'nuevo' ? (
                    <Formulario etiqueta={e} onCancelar={() => setEditando(null)}
                        onGuardar={(datos) => intentar(() => crearWorkspace(datos))} />
                ) : (
                    <div className="stg-row">
                        <button className="stg-btn" type="button" onClick={() => setEditando('nuevo')}>
                            <LuPlus size={14} /> New {e.s}
                        </button>
                    </div>
                )}
            </div>

            {archivados.length > 0 && (
                <>
                    <button className="stg-btn wsx-ver-archivados" type="button" onClick={() => setVerArchivados(v => !v)}>
                        <LuArchive size={13} /> {verArchivados ? 'Hide' : 'Show'} archived ({archivados.length})
                    </button>
                    {verArchivados && (
                        <div className="stg-group stg-group--mt14">
                            {archivados.map(w => (
                                <div key={w.id} className="stg-row">
                                    <div className="wsx-fila">
                                        <span className="wsx-avatar wsx-avatar--apagado">{iniciales(w.nombre)}</span>
                                        <span className="stg-row-label">{w.nombre}</span>
                                    </div>
                                    <button className="stg-btn" type="button" onClick={() => intentar(() => archivarWorkspace(w.id, false))}>
                                        <LuArchiveRestore size={14} /> Restore
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
