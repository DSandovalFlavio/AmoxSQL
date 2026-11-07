import { useEffect, useState } from 'react';
import { LuHand, LuCirclePause, LuCloudOff, LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { textoDeInterrupcion } from './informeDeepDive';

/**
 * Lo que el analista necesita de ti para seguir: una pregunta (`ask_user`), qué
 * hacer cuando se quedó sin ciclos, o cómo seguir cuando la ejecución se cortó
 * (una cuota agotada, un error del proveedor, Stop: plan UX F9).
 *
 * Vive **encima de la caja de texto** (F1). Antes salía en el panel derecho: quien
 * leía el hilo o escribía abajo no veía que el análisis le estaba esperando. Aquí la
 * caja de texto también responde: escribir y enviar es contestar.
 */
function useCuentaAtras(hasta) {
    const [ahora, setAhora] = useState(Date.now());
    useEffect(() => {
        if (!hasta || hasta <= Date.now()) return undefined;
        const t = setInterval(() => setAhora(Date.now()), 500);
        return () => clearInterval(t);
    }, [hasta]);
    return hasta ? Math.max(0, Math.ceil((hasta - ahora) / 1000)) : 0;
}

function Detalles({ texto }) {
    const [abierto, setAbierto] = useState(false);
    if (!texto) return null;
    return (
        <div className="dda-detalles">
            <button className="dda-detalles-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
                {abierto ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />} Details
            </button>
            {abierto && <pre className="dda-detalles-txt">{texto}</pre>}
        </div>
    );
}

function Opciones({ conIndicacion, setConIndicacion, indicacion, setIndicacion, seguir, etiquetaSeguir, onTerminar, onDetener, puedeTerminar = true }) {
    return (
        <>
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
                    {conIndicacion && indicacion.trim() ? 'Continue with this' : etiquetaSeguir}
                </button>
                {!conIndicacion && (
                    <button className="dda-opcion" onClick={() => setConIndicacion(true)} title="Tell the analyst how to continue">
                        Continue with instructions…
                    </button>
                )}
                {puedeTerminar && (
                    <button className="dda-opcion" onClick={() => { onTerminar(); setConIndicacion(false); }} title="Write the conclusions with what it already has, without new queries">
                        Finish with what it has
                    </button>
                )}
                <button className="dda-opcion dda-opcion--fant" onClick={() => { onDetener(); setConIndicacion(false); }}>
                    Leave it here
                </button>
            </div>
        </>
    );
}

export default function DecisionDelAnalista({
    pregunta,           // { question, options[], context } | null
    continuar,          // { resumed, pendingSteps } | null
    interrupcion,       // { motivo, diaria, segundos, proveedor, detalle, en } | null (F9)
    progreso,           // { hechos, total } — the plan, to say what is kept
    onElegir,           // (texto) → responde a la pregunta
    onContinuar,        // (indicacion?) → sigue el plan
    onTerminar,         // → cierra con lo que hay
    onDetener,          // → deja el análisis como está
}) {
    const [conIndicacion, setConIndicacion] = useState(false);
    const [indicacion, setIndicacion] = useState('');
    // "Continue in 31 s": armed by the user, it continues on its own at zero.
    const hasta = interrupcion?.motivo === 'cuota' && !interrupcion.diaria && interrupcion.segundos
        ? (interrupcion.en || Date.now()) + interrupcion.segundos * 1000 : null;
    const faltan = useCuentaAtras(hasta);
    const [armado, setArmado] = useState(false);
    useEffect(() => { setArmado(false); }, [interrupcion?.en]);

    const seguir = () => { onContinuar(conIndicacion && indicacion.trim() ? indicacion : undefined); setIndicacion(''); setConIndicacion(false); setArmado(false); };
    useEffect(() => {
        if (armado && faltan === 0) seguir();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [armado, faltan]);

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

    const comun = { conIndicacion, setConIndicacion, indicacion, setIndicacion, onTerminar, onDetener };

    if (interrupcion) {
        const t = textoDeInterrupcion(interrupcion);
        // Say what's kept only when something is: an empty run has nothing to keep.
        const guardado = progreso?.vacio
            ? ''
            : progreso?.total
                ? `What it did is kept: ${progreso.hechos} of ${progreso.total} steps done.`
                : 'What it did so far is kept.';
        const etiqueta = faltan > 0
            ? (armado ? `Continuing in ${faltan} s…` : `Continue in ${faltan} s`)
            : 'Continue';
        return (
            <div className="dda dda--corte" role="region" aria-label="The analysis stopped">
                <span className="dda-et">{interrupcion.motivo === 'detenido' ? <LuCirclePause size={13} /> : <LuCloudOff size={13} />} The analysis stopped</span>
                <p className="dda-pregunta">{t.titulo} <span className="dda-porque">{guardado}</span></p>
                {t.ayuda && <p className="dda-porque">{t.ayuda}</p>}
                <Opciones
                    {...comun}
                    etiquetaSeguir={etiqueta}
                    // Before the wait is over, the first click arms it; a second one cancels.
                    seguir={faltan > 0 && !(conIndicacion && indicacion.trim()) ? () => setArmado(a => !a) : seguir}
                    puedeTerminar={!interrupcion.diaria}
                />
                <Detalles texto={interrupcion.detalle} />
            </div>
        );
    }

    if (!continuar) return null;

    const pendientes = continuar.pendingSteps || 0;
    return (
        <div className="dda" role="region" aria-label="The analysis is paused">
            <span className="dda-et"><LuCirclePause size={13} /> {continuar.resumed ? 'This analysis was left unfinished' : 'The analyst ran out of iterations'}</span>
            <p className="dda-pregunta">
                {pendientes > 0
                    ? `${pendientes} ${pendientes === 1 ? 'step is' : 'steps are'} still pending. How do you want to go on?`
                    : 'How do you want to go on?'}
            </p>
            <Opciones {...comun} etiquetaSeguir="Continue" seguir={seguir} />
        </div>
    );
}
