import { useEffect, useState } from 'react';
import { LuSparkles, LuTable, LuListChecks, LuDatabase, LuMessageSquareText } from 'react-icons/lu';
import { API_BASE } from '../../../api.js';

/**
 * El inicio de Deep Dive (plan UX, F5): una pregunta de negocio, no una tabla.
 *
 * Antes ofrecía «Show all tables · Describe schema · Sample data», acciones de
 * quien ya sabe SQL. Ahora propone preguntas sacadas del propio proyecto (sus
 * métricas, su glosario, sus columnas: `/api/ai/preguntas-sugeridas`, sin modelo),
 * dice qué datos puede mirar y cómo trabaja. Las acciones técnicas quedan como
 * enlaces pequeños para el analista.
 */
export default function InicioDeepDive({ onPreguntar }) {
    const [datos, setDatos] = useState(null);
    useEffect(() => {
        let vivo = true;
        fetch(`${API_BASE}/api/ai/preguntas-sugeridas`)
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (vivo) setDatos(d); })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);

    const preguntas = datos?.preguntas || [];
    const tablas = datos?.tablas || [];
    return (
        <div className="ddi0">
            <div className="ddi0-cab">
                <LuSparkles size={22} className="ddi0-icono" />
                <h2>What do you want to understand from your data?</h2>
                <p>Ask a business question. The analyst makes a plan, queries your tables on this computer and tells you what it finds, with the charts and the query behind every number.</p>
            </div>

            {preguntas.length > 0 && (
                <div className="ddi0-ideas" role="list" aria-label="Suggested questions">
                    {preguntas.map((p) => (
                        <button key={p.texto} role="listitem" className="ddi0-idea" onClick={() => onPreguntar(p.texto)}>
                            <span>{p.texto}</span>
                            <small>{p.origen}</small>
                        </button>
                    ))}
                </div>
            )}

            {tablas.length > 0 && (
                <div className="ddi0-alcance">
                    <span>It can look at</span>
                    {tablas.slice(0, 8).map(t => <span key={t} className="ddi0-tabla"><LuTable size={11} /> {t}</span>)}
                    {tablas.length > 8 && <span>and {tablas.length - 8} more</span>}
                    <span className="ddi0-sep">·</span>
                    <button className="ddi0-enlace" onClick={() => onPreguntar('Show me all tables')}>See the tables</button>
                    <button className="ddi0-enlace" onClick={() => onPreguntar('Profile the data quality of the main tables')}>Profile the data</button>
                </div>
            )}

            <ol className="ddi0-como" aria-label="How it works">
                <li><LuListChecks size={14} /><b>Plans</b><span>Splits your question into steps you can follow and skip.</span></li>
                <li><LuDatabase size={14} /><b>Queries</b><span>Runs SQL on your database, here on your computer.</span></li>
                <li><LuMessageSquareText size={14} /><b>Tells you</b><span>An answer with its charts, and where every number comes from.</span></li>
            </ol>
        </div>
    );
}
