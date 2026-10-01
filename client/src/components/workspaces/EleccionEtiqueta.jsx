/**
 * Pantalla 1 del mockup: la primera vez que se abre la 5.9, el usuario elige
 * cómo llama a lo que agrupa sus proyectos (B8). Si viene de la 5.8, aquí
 * mismo se le explica, una sola vez, que sus «workspaces» ahora son proyectos.
 */
import { useState } from 'react';
import { LuBriefcase, LuUsers, LuTag, LuPackage, LuLayers, LuArrowRight, LuInfo, LuCheck } from 'react-icons/lu';
import { useEtiqueta, elegirEtiqueta, formas } from '../../etiqueta';

const OPCIONES = [
    { clave: 'clients', icono: LuBriefcase, nota: 'An agency or a consultancy: each client brings its own projects' },
    { clave: 'teams', icono: LuUsers, nota: 'Areas inside one company: finance, marketing, operations' },
    { clave: 'brands', icono: LuTag, nota: 'Several brands under one roof' },
    { clave: 'products', icono: LuPackage, nota: 'A product team with one line of analysis per product' },
    { clave: 'workspaces', icono: LuLayers, nota: 'A neutral word, if none of the others fits' },
];

export default function EleccionEtiqueta({ onDone }) {
    const e = useEtiqueta();
    const [clave, setClave] = useState(e.elegida ? e.clave : 'clients');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);
    const elegida = formas(clave);

    const seguir = async () => {
        setGuardando(true);
        setError(null);
        try {
            await elegirEtiqueta(clave);
            onDone?.(clave);
        } catch (err) {
            setError(err.message);
            setGuardando(false);
        }
    };

    return (
        <div className="ww-backdrop">
            <div className="ww-card wsx-card" role="dialog" aria-modal="true" aria-labelledby="wsx-eleccion-titulo">
                <div className="ww-header">
                    <div className="ww-header-icon"><LuLayers size={20} /></div>
                    <div className="ww-header-text">
                        <h2 className="ww-title" id="wsx-eleccion-titulo">How do you organize your work?</h2>
                        <p className="ww-subtitle">
                            Projects are grouped by this — and it's the word you'll see everywhere in AmoxSQL.
                        </p>
                    </div>
                </div>

                <div className="wsx-opciones" role="radiogroup" aria-label="Grouping word">
                    {OPCIONES.map(o => {
                        const f = formas(o.clave);
                        const Icono = o.icono;
                        const on = clave === o.clave;
                        return (
                            <button key={o.clave} type="button" role="radio" aria-checked={on}
                                className={`wsx-opcion ${on ? 'wsx-opcion--on' : ''}`}
                                onClick={() => setClave(o.clave)}>
                                <Icono size={17} className="wsx-opcion-icono" />
                                <span className="wsx-opcion-texto">
                                    <b>{f.P}</b>
                                    <small>{o.nota}</small>
                                </span>
                                <span className="wsx-radio">{on && <LuCheck size={11} />}</span>
                            </button>
                        );
                    })}
                </div>

                {e.actualizacion && (
                    <div className="wsx-aviso">
                        <LuInfo size={15} />
                        <p>
                            <b>Upgrading from 5.8?</b> Your workspaces are now called <b>projects</b>. {elegida.P} group them.
                            <small>Nothing moved on disk: every folder you had is still here, as a project.</small>
                        </p>
                    </div>
                )}

                <div className="ww-actions wsx-actions">
                    <small className="wsx-nota">{error || 'You can change this later in Settings.'}</small>
                    <button className="ww-btn-create" type="button" onClick={seguir} disabled={guardando}>
                        Continue <LuArrowRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
