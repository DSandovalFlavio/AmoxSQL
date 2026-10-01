/**
 * Settings → la sección de workspaces (B1, B8), con el nombre que eligió el
 * usuario: «Clients», «Teams»…
 *
 * Aquí se cambia esa palabra y se gestionan los workspaces: crear, renombrar,
 * etiqueta, color, la política de IA (B4), la marca (B5), su contexto (B2),
 * archivar y recuperar. Enlazar una carpeta se hace desde la barra de título,
 * con la carpeta abierta.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    LuPlus, LuPencil, LuArchive, LuArchiveRestore, LuCheck, LuX, LuLoader,
    LuShieldCheck, LuFileText, LuImage, LuTrash2,
} from 'react-icons/lu';
import { useEtiqueta, elegirEtiqueta, formas, CLAVES } from '../../etiqueta';
import { listarWorkspaces, crearWorkspace, actualizarWorkspace, archivarWorkspace, COLORES, iniciales } from './api';
import ContextoWorkspace from './ContextoWorkspace';

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

/** Un grupo de opciones excluyentes, en pastillas. */
function Opciones({ valor, opciones, onChange, etiqueta }) {
    return (
        <div className="wsx-palabras" role="radiogroup" aria-label={etiqueta}>
            {opciones.map(([v, texto]) => (
                <button key={v} type="button" role="radio" aria-checked={valor === v}
                    className={`wsx-palabra ${valor === v ? 'wsx-palabra--on' : ''}`} onClick={() => onChange(v)}>
                    {texto}
                </button>
            ))}
        </div>
    );
}

/** Lo que dice la política, en una línea. */
export function resumenPolitica(p) {
    if (!p) return '';
    if (p.proveedores === 'local') return 'Local AI only';
    if (p.datos === 'esquema') return 'Cloud AI · schema only';
    if (p.datos === 'muestras') return 'Cloud AI · sample rows';
    return '';
}

/**
 * Una imagen pequeña para la portada de los decks: se reduce aquí, en el
 * cliente, a 480×200 como mucho y se guarda como PNG en data URL.
 */
function leerLogo(archivo) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onerror = () => reject(new Error('Could not read the image.'));
        lector.onload = () => {
            const url = String(lector.result || '');
            if (archivo.type === 'image/svg+xml') {
                if (url.length > 200 * 1024) return reject(new Error('The SVG is too large (200 KB at most).'));
                return resolve(url);
            }
            const img = new Image();
            img.onerror = () => reject(new Error('That file is not an image.'));
            img.onload = () => {
                const escala = Math.min(1, 480 / img.width, 200 / img.height);
                const lienzo = document.createElement('canvas');
                lienzo.width = Math.max(1, Math.round(img.width * escala));
                lienzo.height = Math.max(1, Math.round(img.height * escala));
                lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
                const png = lienzo.toDataURL('image/png');
                if (png.length > 280 * 1024) return reject(new Error('The image is still too large after resizing.'));
                resolve(png);
            };
            img.src = url;
        };
        lector.readAsDataURL(archivo);
    });
}

/** Crear o editar: nombre, etiqueta, color, política de IA y marca. */
function Formulario({ inicial, etiqueta, onGuardar, onCancelar }) {
    const [nombre, setNombre] = useState(inicial?.nombre || '');
    const [tag, setTag] = useState(inicial?.etiqueta || '');
    const [color, setColor] = useState(inicial?.color || COLORES[0]);
    const [proveedores, setProveedores] = useState(inicial?.politicaIa?.proveedores || 'nube');
    const [datos, setDatos] = useState(inicial?.politicaIa?.datos || 'filas');
    const [paleta, setPaleta] = useState(inicial?.marca?.paleta || []);
    const [logo, setLogo] = useState(inicial?.marca?.logo || null);
    const [error, setError] = useState(null);
    const listo = nombre.trim().length > 0;
    const guardar = () => {
        if (!listo) return;
        onGuardar({
            nombre: nombre.trim(), etiqueta: tag.trim(), color,
            politicaIa: { proveedores, datos },
            marca: { paleta, logo },
        });
    };
    const teclas = (e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') onCancelar(); };

    return (
        <div className="stg-row wsx-form wsx-form--completo">
            <div className="wsx-form-campos">
                <input className="wsx-input" autoFocus placeholder={`${etiqueta.S} name`} value={nombre}
                    onChange={e => setNombre(e.target.value)} onKeyDown={teclas} />
                <input className="wsx-input wsx-input--corto" placeholder="Tag (optional)" value={tag}
                    onChange={e => setTag(e.target.value)} onKeyDown={teclas} />
                <Muestras valor={color} onChange={setColor} />
            </div>

            <div className="wsx-bloque">
                <span className="wsx-bloque-titulo"><LuShieldCheck size={13} /> AI policy</span>
                <Opciones etiqueta="AI models" valor={proveedores} onChange={setProveedores}
                    opciones={[['nube', 'Local and cloud models'], ['local', 'Local models only']]} />
                {proveedores === 'nube' && (
                    <>
                        <p className="stg-row-desc">What a cloud model may see of the data:</p>
                        <Opciones etiqueta="Data sent to cloud models" valor={datos} onChange={setDatos}
                            opciones={[['esquema', 'Schema only'], ['muestras', 'A few sample rows'], ['filas', 'Everything']]} />
                    </>
                )}
                <p className="stg-row-desc">
                    {proveedores === 'local'
                        ? 'Nothing leaves this machine: the assistant only works with Ollama models.'
                        : datos === 'esquema'
                            ? 'Cloud models see table and column names, types and counts — never a value from a row.'
                            : datos === 'muestras'
                                ? 'Cloud models see the schema and up to 5 rows of each result.'
                                : 'No limits, as before. Local models are never limited.'}
                </p>
            </div>

            <div className="wsx-bloque">
                <span className="wsx-bloque-titulo"><LuImage size={13} /> Brand — new decks and charts start with it</span>
                <div className="wsx-paleta">
                    {paleta.map((c, i) => (
                        <span key={i} className="wsx-paleta-color">
                            <input type="color" value={c} aria-label={`Palette color ${i + 1}`}
                                onChange={e => setPaleta(p => p.map((x, j) => (j === i ? e.target.value : x)))} />
                            <button type="button" className="wsx-paleta-quitar" aria-label="Remove color"
                                onClick={() => setPaleta(p => p.filter((_, j) => j !== i))}><LuX size={10} /></button>
                        </span>
                    ))}
                    {paleta.length < 8 && (
                        <button type="button" className="stg-btn" onClick={() => setPaleta(p => [...p, p.length ? p[p.length - 1] : color])}>
                            <LuPlus size={13} /> Color
                        </button>
                    )}
                </div>
                <div className="wsx-logo">
                    {logo ? <img src={logo} alt="Logo" /> : <span className="stg-row-desc">No logo</span>}
                    <label className="stg-btn">
                        <LuImage size={13} /> {logo ? 'Replace' : 'Add logo'}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
                            onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (!f) return;
                                try { setLogo(await leerLogo(f)); setError(null); } catch (err) { setError(err.message); }
                            }} />
                    </label>
                    {logo && (
                        <button type="button" className="stg-btn" aria-label="Remove logo" onClick={() => setLogo(null)}>
                            <LuTrash2 size={13} />
                        </button>
                    )}
                </div>
                {error && <p className="wsx-error">{error}</p>}
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
    const [contexto, setContexto] = useState(null);   // workspace cuyo contexto se edita
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
                Its context — rules, metrics, glossary, skills — applies to all its projects.
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
                                        {[w.etiqueta, `${w.proyectos} project${w.proyectos === 1 ? '' : 's'}`, resumenPolitica(w.politicaIa)].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                            </div>
                            <div className="wsx-form-botones">
                                <button className="stg-btn" type="button" title="Context: rules, metrics, glossary, skills" aria-label={`Context of ${w.nombre}`} onClick={() => setContexto(w)}>
                                    <LuFileText size={14} />
                                </button>
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

            {contexto && <ContextoWorkspace workspace={contexto} onClose={() => setContexto(null)} />}
        </div>
    );
}
