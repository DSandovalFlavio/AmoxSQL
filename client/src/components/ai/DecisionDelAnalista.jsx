import { useState } from 'react';
import { LuHand, LuCirclePause } from 'react-icons/lu';

/**
 * Lo que el analista necesita de ti para seguir: una pregunta (`ask_user`) o
 * qué hacer cuando se quedó sin ciclos.
 *
 * Vive **encima de la caja de texto** (plan UX de Deep Dive, F1). Antes salía en el
 * panel derecho, entre el plan y los artefactos: quien leía el hilo o escribía
 * abajo a la izquierda no veía que el análisis le estaba esperando. Aquí la caja
 * de texto también responde: escribir y enviar es contestar.
 */
export default function DecisionDelAnalista({
    pregunta,           // { question, options[], context } | null
    continuar,          // { resumed, pendingSteps } | null
    onElegir,           // (texto) → responde a la pregunta
    onContinuar,        // (indicacion?) → sigue el plan
    onTerminar,         // → cierra con lo que hay
    onDetener,          // → deja el análisis como está
}) {
    const [conIndicacion, setConIndicacion] = useState(false);
    const [indicacion, setIndicacion] = useState('');

    if (pregunta) {
        return (
            <div className="dda" role="region" aria-label="The analyst needs your answer">
                <span className="dda-et"><LuHand size={13} /> The analyst needs your answer</span>
                <p className="dda-pregunta">{pregunta.question}</p>
                {pregunta.context && <p className="dda-porque">{pregunta.context}</p>}
                {pregunta.options?.length > 0 && (
                    <div className="dda-opciones">
                        {pregunta.options.map((op, i) => (
                            <button key={i} className={`dda-opcion${i === 0 ? ' dda-opcion--prim' : ''}`} onClick={() => onElegir(op)}>
                                {op}
                            </button>
                        ))}
                    </div>
                )}
                <p className="dda-pista">{pregunta.options?.length ? 'Pick an option, or type your own answer below.' : 'Type your answer below.'}</p>
            </div>
        );
    }

    if (!continuar) return null;

    const pendientes = continuar.pendingSteps || 0;
    const seguir = () => { onContinuar(conIndicacion && indicacion.trim() ? indicacion : undefined); setIndicacion(''); setConIndicacion(false); };
    return (
        <div className="dda" role="region" aria-label="The analysis is paused">
            <span className="dda-et"><LuCirclePause size={13} /> {continuar.resumed ? 'This analysis was left unfinished' : 'The analyst ran out of iterations'}</span>
            <p className="dda-pregunta">
                {pendientes > 0
                    ? `${pendientes} ${pendientes === 1 ? 'step is' : 'steps are'} still pending. How do you want to go on?`
                    : 'How do you want to go on?'}
            </p>
            {conIndicacion && (
                <textarea
                    className="dda-indicacion"
                    placeholder="What should it focus on? For example: finish step 3 and skip the rest."
                    value={indicacion}
                    onChange={e => setIndicacion(e.target.value)}
                    rows={2}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) seguir(); }}
                />
            )}
            <div className="dda-opciones">
                <button className="dda-opcion dda-opcion--prim" onClick={seguir}>
                    {conIndicacion && indicacion.trim() ? 'Continue with this' : 'Continue'}
                </button>
                {!conIndicacion && (
                    <button className="dda-opcion" onClick={() => setConIndicacion(true)} title="Tell the analyst how to continue">
                        Continue with instructions…
                    </button>
                )}
                <button className="dda-opcion" onClick={() => { onTerminar(); setConIndicacion(false); }} title="Write the conclusions with what it already has, without new queries">
                    Finish with what it has
                </button>
                <button className="dda-opcion dda-opcion--fant" onClick={() => { onDetener(); setConIndicacion(false); }}>
                    Leave it here
                </button>
            </div>
        </div>
    );
}
