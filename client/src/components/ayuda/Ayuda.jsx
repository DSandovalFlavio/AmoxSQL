/**
 * Help — los atajos y las guías de Story Flow y Data Flow (6.0, M8).
 *
 * Vivían en Settings, mezclados con lo que se configura; aquí cada cosa en su
 * sitio: Settings es para cambiar la app, Help para aprender a usarla. Tiene la
 * misma forma que Settings (lateral + contenido) para que se reconozca, y cada
 * sección se carga la primera vez que se abre.
 *
 * Se abre con el evento `amox_abrir_ayuda` (`detail`: 'shortcuts' |
 * 'storyflow' | 'dataflow'), con Ctrl+Shift+/ y desde el menú de la aplicación.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LuX, LuKeyboard, LuSparkles, LuGitBranch } from 'react-icons/lu';
import { useEscape } from '../../hooks/useEscape';

const Atajos = lazy(() => import('./Atajos'));
const GuiaStoryFlow = lazy(() => import('./GuiaStoryFlow'));
const GuiaDataFlow = lazy(() => import('./GuiaDataFlow'));

const SECCIONES = [
    { id: 'shortcuts', icono: LuKeyboard, etiqueta: 'Keyboard Shortcuts', Contenido: Atajos },
    { id: 'storyflow', icono: LuSparkles, etiqueta: 'Story Flow', Contenido: GuiaStoryFlow },
    { id: 'dataflow', icono: LuGitBranch, etiqueta: 'Data Flow', Contenido: GuiaDataFlow },
];

export default function Ayuda({ seccion = 'shortcuts', onClose }) {
    const [activa, setActiva] = useState(seccion);
    const cuerpo = useRef(null);
    useEffect(() => { setActiva(seccion); }, [seccion]);
    useEffect(() => { if (cuerpo.current) cuerpo.current.scrollTop = 0; }, [activa]);
    useEscape(onClose);

    const actual = SECCIONES.find(s => s.id === activa) || SECCIONES[0];
    const { Contenido } = actual;

    return (
        <div className="stg-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="stg-modal" role="dialog" aria-label="Help">
                <div className="stg-sidebar">
                    <div className="stg-sidebar-title">Help</div>
                    {SECCIONES.map(({ id, icono: Icono, etiqueta }) => (
                        <div
                            key={id}
                            onClick={() => setActiva(id)}
                            className={`stg-tab${activa === id ? ' stg-tab--active' : ''}`}
                        >
                            <span className="ayuda-tab">
                                <Icono size={16} /> {etiqueta}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="stg-content">
                    <div className="stg-content-header">
                        <h2 className="stg-content-title">{actual.etiqueta}</h2>
                        <button onClick={onClose} className="stg-close-btn" aria-label="Close"><LuX size={18} /></button>
                    </div>
                    <div className="stg-content-body" ref={cuerpo}>
                        <Suspense fallback={null}><Contenido /></Suspense>
                    </div>
                </div>
            </div>
        </div>
    );
}
