import { useEffect, useRef, useState } from 'react';
import { LuCode, LuX, LuBrain, LuChevronDown, LuChevronRight } from 'react-icons/lu';
import SqlActivityBlock from '../SqlActivityBlock';
import ToolCallBlock from '../ToolCallBlock';
import { useEscape } from '../../../hooks/useEscape';

/**
 * «How I got this» (plan UX, entrega 2, F3): el proceso de una parte del informe,
 * bajo demanda. Las consultas con sus filas, lo demás que hizo el analista y su
 * razonamiento en esa parte. Es el inspector de antes, pero ya no ocupa una
 * columna fija: se abre desde una sección, un número de la respuesta o una cita,
 * y se cierra con Escape.
 */
function Razonamiento({ trozos }) {
    const [abierto, setAbierto] = useState(false);
    if (!trozos.length) return null;
    return (
        <div className="ddp-razon">
            <button className="ddp-razon-cab" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
                <LuBrain size={12} /> <span>How the analyst reasoned here</span>
                {abierto ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
            </button>
            {abierto && trozos.map((t, i) => <p key={i} className="ddp-razon-txt">{t}</p>)}
        </div>
    );
}

export default function ComoLoObtuve({ seccion, focoQueryId, enCurso, onClose, onRunSql, onAskAbout }) {
    useEscape(onClose);
    const cuerpoRef = useRef(null);

    // Abierto desde un número de la respuesta: llevar a esa consulta.
    useEffect(() => {
        if (!focoQueryId) return;
        const el = cuerpoRef.current?.querySelector(`[data-query-id="${CSS.escape(focoQueryId)}"]`);
        el?.scrollIntoView({ block: 'start' });
    }, [focoQueryId, seccion?.key]);

    if (!seccion) return null;
    const trabajo = seccion.herramientas.filter(tc => tc.toolName !== 'update_plan' && tc.toolName !== 'create_plan');

    return (
        <aside className="ddp" aria-label="How I got this">
            <header className="ddp-cab">
                <LuCode size={14} />
                <div className="ddp-titulo">
                    <b>How I got this</b>
                    {seccion.titulo && <span>{seccion.numero ? `${seccion.numero} · ` : ''}{seccion.titulo}</span>}
                </div>
                <button className="ddp-cerrar" onClick={onClose} title="Close (Esc)" aria-label="Close"><LuX size={14} /></button>
            </header>
            <div className="ddp-cuerpo" ref={cuerpoRef}>
                <Razonamiento trozos={seccion.razonamiento} />
                {trabajo.length === 0 && (
                    <p className="ddp-vacio">No queries in this part: the analyst wrote it from what it had already found.</p>
                )}
                {trabajo.map((tc, i) => (
                    <div key={tc.toolCallId || i}
                        className={`ddp-paso${focoQueryId && tc.result?.queryId === focoQueryId ? ' ddp-paso--foco' : ''}`}
                        data-query-id={tc.result?.queryId || undefined}>
                        {tc.toolName === 'execute_sql'
                            ? <SqlActivityBlock tc={tc} onRunSql={onRunSql} onAskAbout={onAskAbout} abierto />
                            : <ToolCallBlock toolName={tc.toolName} args={tc.args} result={tc.result} isLoading={enCurso && !tc.result} />}
                    </div>
                ))}
            </div>
        </aside>
    );
}
