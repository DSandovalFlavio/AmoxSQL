import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LuSparkles, LuLightbulb, LuCode, LuMessageSquareQuote, LuDatabase, LuLoader, LuUser, LuChartColumn, LuCircleCheck, LuTriangleAlert, LuCloudOff, LuHourglass } from 'react-icons/lu';
import { NarrativeCard, makeMdComponents, citeUrlTransform } from '../ChatMessage';
import { textoDeInterrupcion } from '../informeDeepDive';
import StreamingMarkdown from '../StreamingMarkdown';
import ChatResultsBlock from '../ChatResultsBlock';

/**
 * El informe de Deep Dive (plan UX, entrega 2). Una columna de lectura:
 *
 *   tu pregunta
 *   RESPUESTA (en cuanto existe, arriba: pirámide invertida)
 *   Cómo llegué — cada paso del plan con su narración, sus gráficos y su conclusión
 *
 * Los gráficos están en la historia, no detrás de un clic. El proceso técnico
 * (consultas, filas, razonamiento) se abre bajo demanda con «How I got this».
 */

const ESTADO = {
    done: { texto: 'Done', cls: 'ok' },
    in_progress: { texto: 'In progress', cls: 'vivo' },
    interrupted: { texto: 'Interrupted', cls: 'aviso' },
    failed: { texto: 'Failed', cls: 'error' },
    skipped: { texto: 'Skipped', cls: 'gris' },
    not_done: { texto: 'Not done', cls: 'gris' },
};

/** Prosa del analista. Memo por texto: lo ya escrito no se vuelve a analizar en cada flush. */
const Prosa = memo(function Prosa({ texto, enVivo, onVerConsulta }) {
    const componentes = useMemo(() => makeMdComponents((qid) => onVerConsulta?.(qid)), [onVerConsulta]);
    return (
        <div className="ddr-prosa markdown-body">
            {enVivo
                ? <StreamingMarkdown content={texto} components={componentes} urlTransform={citeUrlTransform} />
                : <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes} urlTransform={citeUrlTransform}>{texto}</ReactMarkdown>}
        </div>
    );
});

function filasDe(tcs) {
    return tcs.reduce((n, tc) => n + (tc.result?.rowCount || 0), 0);
}

function Bloques({ seccion, enVivo, allMessages, acciones }) {
    const ultimoTexto = enVivo ? seccion.bloques.map(b => b.tipo).lastIndexOf('texto') : -1;
    return seccion.bloques.map((b, i) => {
        if (b.tipo === 'texto') return <Prosa key={i} texto={b.texto} enVivo={i === ultimoTexto} onVerConsulta={acciones.verConsulta} />;
        if (b.tipo === 'usuario') {
            // A "Continue" after a stop: say where it stopped before resuming.
            const corte = b.tras ? textoDeInterrupcion(b.tras) : null;
            return (
                <div key={i} className="ddr-tu-bloque">
                    {corte && <p className="ddr-corte ddr-corte--pasado"><LuCloudOff size={12} /> <span>{corte.titulo}</span></p>}
                    <p className="ddr-tu"><LuUser size={12} /> <span>{b.texto}</span></p>
                </div>
            );
        }
        if (b.tipo === 'grafico') {
            return (
                <div key={i} id={`${seccion.key}-g${i}`} className="ddr-grafico">
                    <ChatResultsBlock
                        chartConfig={b.tc.result.chartConfig}
                        allMessages={allMessages}
                        isDiving
                        onAskAbout={acciones.preguntar}
                        onExportNotebook={acciones.exportarNotebook}
                        onExportAmoxvis={acciones.exportarAmoxvis}
                    />
                </div>
            );
        }
        if (b.tipo === 'consultas') {
            const errores = b.tcs.filter(tc => tc.result?.error).length;
            const enCurso = b.tcs.some(tc => !tc.result);
            return (
                <button key={i} className="ddr-consultas" onClick={() => acciones.verSeccion(seccion, b.tcs[0]?.result?.queryId)}
                    title="See the queries, their rows and how the analyst used them">
                    {enCurso ? <LuLoader size={12} className="ddr-gira" /> : <LuDatabase size={12} />}
                    <span>
                        {enCurso ? 'Running a query…' : `Ran ${b.tcs.length} ${b.tcs.length === 1 ? 'query' : 'queries'}`}
                        {!enCurso && filasDe(b.tcs) > 0 && ` · ${filasDe(b.tcs).toLocaleString()} rows`}
                        {errores > 0 && ` · ${errores} failed`}
                    </span>
                    <span className="ddr-consultas-ver">See the data</span>
                </button>
            );
        }
        return null;
    });
}

function Seccion({ seccion, episodio, allMessages, acciones }) {
    const estado = ESTADO[seccion.estado];
    const vivo = episodio.enCurso && seccion.estado === 'in_progress';
    const tieneTrabajo = seccion.herramientas.some(tc => tc.toolName !== 'update_plan') || seccion.razonamiento.length > 0;
    return (
        <section id={seccion.key} className={`ddr-sec${vivo ? ' ddr-sec--vivo' : ''}`}>
            {(seccion.titulo || seccion.numero) && (
                <header className="ddr-sec-cab">
                    {seccion.numero && <span className="ddr-sec-num">{seccion.numero}</span>}
                    <h3>{seccion.titulo}</h3>
                    {estado && <span className={`ddr-estado ddr-estado--${estado.cls}`}>{vivo ? <><LuLoader size={11} className="ddr-gira" /> Working</> : estado.texto}</span>}
                    <span className="ddr-sec-acc">
                        {tieneTrabajo && (
                            <button className="ddr-enlace" onClick={() => acciones.verSeccion(seccion)}><LuCode size={12} /> How I got this</button>
                        )}
                        {seccion.stepId && (
                            <button className="ddr-enlace ddr-enlace--gris" title="Ask the analyst about this step"
                                onClick={() => acciones.preguntar({
                                    type: 'step', stepId: seccion.stepId, stepLabel: seccion.titulo, insight: seccion.nota || '',
                                    label: `Step: ${seccion.titulo}`, key: `step:${seccion.stepId}`,
                                })}>
                                <LuMessageSquareQuote size={12} /> Ask
                            </button>
                        )}
                    </span>
                </header>
            )}
            <Bloques seccion={seccion} enVivo={episodio.enCurso} allMessages={allMessages} acciones={acciones} />
            {seccion.nota && (
                <p className="ddr-concl"><LuLightbulb size={13} /> <span>{seccion.nota}</span></p>
            )}
            {!seccion.titulo && !seccion.numero && tieneTrabajo && !episodio.enCurso && (
                <button className="ddr-enlace ddr-enlace--suelto" onClick={() => acciones.verSeccion(seccion)}><LuCode size={12} /> How I got this</button>
            )}
        </section>
    );
}

/** Una línea de confianza en palabras: de qué sale la respuesta y qué quedó fuera. */
function Confianza({ episodio }) {
    const pasos = episodio.indice || [];
    const hechos = pasos.filter(p => p.estado === 'done').length;
    const noHechos = pasos.filter(p => p.estado === 'not_done' || p.estado === 'interrupted' || p.estado === 'failed').length;
    const salvedades = episodio.respuesta?.resultado?.caveats?.length || 0;
    return (
        <div className="ddr-confianza">
            {pasos.length > 0 && (
                <span className={`ddr-chip${noHechos ? ' ddr-chip--aviso' : ''}`}>
                    {noHechos ? <LuTriangleAlert size={11} /> : <LuCircleCheck size={11} />}
                    {hechos} of {pasos.length} steps{noHechos ? ` · ${noHechos} not done` : ''}
                </span>
            )}
            <span className="ddr-chip"><LuDatabase size={11} /> {episodio.consultas} {episodio.consultas === 1 ? 'query' : 'queries'}</span>
            {episodio.graficos > 0 && <span className="ddr-chip"><LuChartColumn size={11} /> {episodio.graficos} {episodio.graficos === 1 ? 'chart' : 'charts'}</span>}
            {salvedades > 0 && <span className="ddr-chip ddr-chip--aviso"><LuTriangleAlert size={11} /> {salvedades} {salvedades === 1 ? 'caveat' : 'caveats'}</span>}
        </div>
    );
}

const Episodio = memo(function Episodio({ episodio, esUltimo, anclaRef, allMessages, acciones }) {
    const { respuesta } = episodio;
    const hayCamino = episodio.intro.bloques.length > 0 || episodio.secciones.length > 0;
    return (
        <article id={episodio.id} className="ddr-ep">
            {episodio.pregunta && <h2 className="ddr-pregunta">{episodio.pregunta}</h2>}

            {respuesta && (
                <div id={`${episodio.id}-respuesta`} className="ddr-respuesta" ref={esUltimo ? anclaRef : undefined}>
                    <span className="ddr-respuesta-et"><LuSparkles size={13} /> Answer</span>
                    {respuesta.prosa && <Prosa texto={respuesta.prosa} onVerConsulta={acciones.verConsulta} />}
                    <Confianza episodio={episodio} />
                    <NarrativeCard
                        result={respuesta.resultado}
                        onFollowUp={acciones.seguir}
                        onAskAbout={acciones.preguntar}
                        onVerConsulta={acciones.verConsulta}
                    />
                </div>
            )}

            {respuesta && hayCamino && <div className="ddr-camino">How I got there</div>}

            {episodio.intro.bloques.length > 0 && (
                <Seccion seccion={episodio.intro} episodio={episodio} allMessages={allMessages} acciones={acciones} />
            )}
            {episodio.secciones.map(s => (
                <Seccion key={s.key} seccion={s} episodio={episodio} allMessages={allMessages} acciones={acciones} />
            ))}

            {episodio.enCurso && (
                acciones.esperandoCuota
                    ? <p className="ddr-trabajando"><LuHourglass size={13} /> Waiting for the model's quota. The analysis resumes on its own.</p>
                    : <p className="ddr-trabajando"><LuLoader size={13} className="ddr-gira" /> The analyst is working…</p>
            )}

            {/* F9: the run stopped short. What's above is kept; say why it stopped. */}
            {!episodio.enCurso && episodio.interrupcion && (() => {
                const t = textoDeInterrupcion(episodio.interrupcion);
                const vacio = !respuesta && !hayCamino;
                return (
                    <p className={`ddr-corte${vacio ? ' ddr-corte--vacio' : ''}`}>
                        <LuCloudOff size={13} />
                        <span><b>{vacio ? 'No answer yet. ' : 'Stopped here. '}</b>{t.titulo}{!vacio && ' Everything above is kept.'}</span>
                    </p>
                );
            })()}
        </article>
    );
});

/**
 * @param episodios  de `armarInforme`
 * @param anclaRef   el ref que `useAiChat` desplaza a la vista: se pone en la
 *                   respuesta del último episodio cuando existe (al terminar, o al
 *                   abrir un análisis hecho, se llega a la respuesta, no al final).
 */
export default function InformeDeepDive({ episodios, anclaRef, allMessages, acciones }) {
    return (
        <div className="ddr-hoja">
            {episodios.map((e, i) => (
                <Episodio key={e.id} episodio={e} esUltimo={i === episodios.length - 1} anclaRef={anclaRef}
                    allMessages={allMessages} acciones={acciones} />
            ))}
        </div>
    );
}
