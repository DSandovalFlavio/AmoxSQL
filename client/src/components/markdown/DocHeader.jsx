/**
 * DocHeader — dueño, estado, última revisión y etiquetas del documento,
 * editables como fichas en vez de escribiendo YAML a mano.
 *
 * Vive en la columna derecha, en vertical. Antes era una tira horizontal sobre
 * el texto: en horizontal solo caben cuatro campos apretados y el aviso de
 * caducidad no tiene sitio para hacerse notar. En vertical cada clave respira,
 * y *Marcar revisado* puede ser un botón de ancho completo en vez de un
 * apéndice.
 *
 * Una documentación de procesos sin fecha miente a los seis meses. El aviso de
 * «revisado hace 8 meses» es deliberadamente incómodo, y marcarlo pone la
 * fecha de hoy de un clic — que es lo único que hace que alguien la ponga.
 *
 * El bloque en disco sigue siendo front-matter YAML estándar: cualquier visor
 * lo entiende o lo ignora sin romperse.
 */
import { useState, useRef, useEffect } from 'react';
import { LuClock, LuCheck, LuPlus, LuX, LuChevronDown } from 'react-icons/lu';

const ESTADOS = ['borrador', 'vigente', 'obsoleto'];

/** Meses transcurridos, para decidir si la revisión ha caducado. */
function mesesDesde(iso) {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
}

function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function antiguedad(iso) {
    const m = mesesDesde(iso);
    if (m === null) return iso;
    if (m < 1) return 'este mes';
    if (m < 2) return 'hace un mes';
    if (m < 12) return `hace ${Math.round(m)} meses`;
    const a = Math.round(m / 12);
    return a === 1 ? 'hace un año' : `hace ${a} años`;
}

export default function DocHeader({ meta, umbralMeses = 6, onCambiar }) {
    const [menuEstado, setMenuEstado] = useState(false);
    const [nuevaEtiqueta, setNuevaEtiqueta] = useState(null);
    const menuRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const fuera = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuEstado(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, []);

    useEffect(() => { if (nuevaEtiqueta !== null) inputRef.current?.focus(); }, [nuevaEtiqueta]);

    if (!meta) return null;

    const meses = meta.revisado ? mesesDesde(meta.revisado) : null;
    const caducado = meses !== null && meses >= umbralMeses;
    const etiquetas = Array.isArray(meta.tags) ? meta.tags : [];

    const anadirEtiqueta = () => {
        const t = (nuevaEtiqueta || '').trim().replace(/[,[\]]/g, '');
        if (t && !etiquetas.includes(t)) onCambiar?.({ tags: [...etiquetas, t] });
        setNuevaEtiqueta(null);
    };

    return (
        <div className="mde-doc-header">
            <div className="mde-dh-row">
                <span className="mde-dh-k">Dueño</span>
                <input
                    className="mde-dh-owner"
                    value={meta.owner || ''}
                    placeholder="sin asignar"
                    onChange={(e) => onCambiar?.({ owner: e.target.value })}
                    spellCheck={false}
                />
            </div>

            <div className="mde-dh-row">
                <span className="mde-dh-k">Estado</span>
                <div className="mde-dh-anchor" ref={menuRef}>
                    <button className={`mde-dh-estado ${meta.estado || 'borrador'}`} onClick={() => setMenuEstado(v => !v)}>
                        {meta.estado || 'borrador'} <LuChevronDown size={9} />
                    </button>
                    {menuEstado && (
                        <div className="mde-dh-menu">
                            {ESTADOS.map(e => (
                                <div key={e} className="mde-dh-menu-item" onClick={() => { onCambiar?.({ estado: e }); setMenuEstado(false); }}>
                                    {e}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="mde-dh-row">
                <span className="mde-dh-k">Revisado</span>
                {meta.revisado ? (
                    <span className={`mde-dh-fecha${caducado ? ' caducado' : ''}`} title={meta.revisado}>
                        <LuClock size={10} /> {antiguedad(meta.revisado)}
                    </span>
                ) : (
                    <span className="mde-dh-fecha caducado"><LuClock size={10} /> nunca</span>
                )}
            </div>

            <div className="mde-dh-row mde-dh-row--top">
                <span className="mde-dh-k">Etiquetas</span>
                <span className="mde-dh-etiquetas">
                    {etiquetas.map(t => (
                        <span key={t} className="mde-dh-tag">
                            {t}
                            <button
                                className="mde-dh-tag-x"
                                title={`Quitar «${t}»`}
                                onClick={() => onCambiar?.({ tags: etiquetas.filter(x => x !== t) })}
                            >
                                <LuX size={8} />
                            </button>
                        </span>
                    ))}
                    {nuevaEtiqueta === null ? (
                        <button className="mde-dh-tag-add" title="Añadir etiqueta" onClick={() => setNuevaEtiqueta('')}>
                            <LuPlus size={9} />
                        </button>
                    ) : (
                        <input
                            ref={inputRef}
                            className="mde-dh-tag-input"
                            value={nuevaEtiqueta}
                            onChange={(e) => setNuevaEtiqueta(e.target.value)}
                            onBlur={anadirEtiqueta}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') anadirEtiqueta();
                                if (e.key === 'Escape') setNuevaEtiqueta(null);
                            }}
                            placeholder="etiqueta"
                            spellCheck={false}
                        />
                    )}
                </span>
            </div>

            {/* Solo cuando hace falta. Un botón que siempre está es un botón que
                nadie mira; este aparece justo el día que el documento caduca. */}
            {(caducado || !meta.revisado) && (
                <button className="mde-dh-revisar" onClick={() => onCambiar?.({ revisado: hoyIso() })}>
                    <LuCheck size={11} /> Marcar revisado hoy
                </button>
            )}
        </div>
    );
}
