/**
 * Lo que va encima del árbol de archivos (6.0, M11): las pestañas abiertas y
 * los favoritos. Cada sección se pliega y recuerda si estaba plegada; los
 * favoritos sólo aparecen cuando hay alguno.
 */
import { useState } from 'react';
import { LuChevronRight, LuX, LuStar } from 'react-icons/lu';

const CLAVE_PLEGADAS = 'amoxsql-fe-secciones';
const leerPlegadas = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE_PLEGADAS) || 'null') || { abiertos: true, favoritos: false }; }
    catch { return { abiertos: true, favoritos: false }; }
};

function useSeccion(id) {
    const [plegadas, setPlegadas] = useState(leerPlegadas);
    const plegada = !!plegadas[id];
    const alternar = () => setPlegadas(prev => {
        const n = { ...leerPlegadas(), ...prev, [id]: !prev[id] };
        try { localStorage.setItem(CLAVE_PLEGADAS, JSON.stringify(n)); } catch { /* sólo esta sesión */ }
        return n;
    });
    return [plegada, alternar];
}

function Cabecera({ titulo, cuantos, plegada, onAlternar }) {
    return (
        <button type="button" className="fe-seccion-cabecera" onClick={onAlternar} aria-expanded={!plegada}>
            <LuChevronRight size={12} className={`fe-flecha${plegada ? '' : ' fe-flecha--abierta'}`} />
            <span className="fe-seccion-titulo">{titulo}</span>
            <span className="fe-seccion-n">{cuantos}</span>
        </button>
    );
}

const carpetaDe = (ruta) => {
    const partes = String(ruta || '').replace(/\\/g, '/').split('/');
    return partes.length > 1 ? partes.slice(0, -1).join('/') : '';
};

/** Las pestañas abiertas, en los dos paneles si está partido. */
export function EditoresAbiertos({ pestanas, icono, onActivar, onCerrar }) {
    const [plegada, alternar] = useSeccion('abiertos');
    if (!pestanas) return null;
    const grupos = pestanas.splitEnabled
        ? [['left', 'Left', pestanas.left], ['right', 'Right', pestanas.right]]
        : [[pestanas.paneId || 'left', null, { tabs: pestanas.tabs, activeTabId: pestanas.activeTabId }]];
    const total = grupos.reduce((n, [, , g]) => n + (g?.tabs?.length || 0), 0);
    if (!total) return null;
    return (
        <div className="fe-seccion">
            <Cabecera titulo="Open Editors" cuantos={total} plegada={plegada} onAlternar={alternar} />
            {!plegada && (
                <ul className="fe-seccion-lista">
                    {grupos.map(([pane, etiqueta, g]) => (g?.tabs?.length ? [
                        etiqueta && <li key={`g-${pane}`} className="fe-seccion-grupo">{etiqueta}</li>,
                        ...g.tabs.map(t => (
                            <li
                                key={t.id}
                                className={`fe-seccion-fila${t.id === g.activeTabId ? ' fe-seccion-fila--activa' : ''}`}
                                onClick={() => onActivar(pane, t.id)}
                                onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onCerrar(t.id); } }}
                                title={t.path || t.name}
                            >
                                <span className="icon">{icono({ name: t.name, path: t.path, isDirectory: false })}</span>
                                <span className="fe-seccion-nombre">{t.name}</span>
                                {t.path && carpetaDe(t.path) && <span className="fe-seccion-carpeta">{carpetaDe(t.path)}</span>}
                                {t.dirty && <span className="fe-seccion-sucia" aria-label="Unsaved changes" />}
                                <button
                                    type="button"
                                    className="fe-seccion-quitar"
                                    title="Close"
                                    onClick={(e) => { e.stopPropagation(); onCerrar(t.id); }}
                                >
                                    <LuX size={12} />
                                </button>
                            </li>
                        )),
                    ] : null))}
                </ul>
            )}
        </div>
    );
}

/** Los archivos y carpetas que el usuario marcó para tener a mano. */
export function Favoritos({ favoritos, icono, archivoActivo, onAbrir, onQuitar }) {
    const [plegada, alternar] = useSeccion('favoritos');
    if (!favoritos?.length) return null;
    return (
        <div className="fe-seccion">
            <Cabecera titulo="Favorites" cuantos={favoritos.length} plegada={plegada} onAlternar={alternar} />
            {!plegada && (
                <ul className="fe-seccion-lista">
                    {favoritos.map(f => (
                        <li
                            key={f.path}
                            className={`fe-seccion-fila${archivoActivo && f.path === archivoActivo ? ' fe-seccion-fila--activa' : ''}`}
                            onClick={() => onAbrir(f)}
                            title={f.path}
                        >
                            <span className="icon">{icono(f)}</span>
                            <span className="fe-seccion-nombre">{f.name}</span>
                            {carpetaDe(f.path) && <span className="fe-seccion-carpeta">{carpetaDe(f.path)}</span>}
                            <button
                                type="button"
                                className="fe-seccion-quitar"
                                title="Remove from Favorites"
                                onClick={(e) => { e.stopPropagation(); onQuitar(f); }}
                            >
                                <LuStar size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
