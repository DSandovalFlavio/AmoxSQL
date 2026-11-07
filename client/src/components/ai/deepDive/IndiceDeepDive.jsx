import { LuCircleCheck, LuCircle, LuCircleMinus, LuCircleX, LuCirclePause, LuLoader, LuSparkles, LuMessageSquare, LuChartColumn, LuBookOpen, LuNotebookPen, LuDownload, LuSkipForward, LuPresentation } from 'react-icons/lu';

/**
 * El índice del informe (plan UX, entrega 2): el plan convertido en algo que se
 * usa. Cada paso lleva a su sección; el que corre gira; uno que no se hizo lo dice.
 * Debajo, lo que la sesión deja: sus gráficos (llevan a donde están) y sus notebooks.
 */
const ICONO = {
    done: [LuCircleCheck, 'ok', 'Done'],
    in_progress: [LuLoader, 'vivo', 'In progress'],
    interrupted: [LuCirclePause, 'aviso', 'Interrupted'],
    failed: [LuCircleX, 'error', 'Failed'],
    skipped: [LuCircleMinus, 'gris', 'Skipped'],
    not_done: [LuCircleMinus, 'gris', 'Not done'],
    pending: [LuCircle, 'gris', 'Pending'],
};

export default function IndiceDeepDive({ episodios, isGenerating, onIr, onSaltar, entregables, onGuardarNotebook, onExportar, onAbrirArchivo, onReportFlow, enviandoDeck }) {
    const ultimo = episodios[episodios.length - 1];
    return (
        <nav className="ddr-indice" aria-label="Contents of this analysis">
            <div className="ddr-ind-scroll">
                {episodios.map((e) => {
                    // Also while it runs (F6): the skip reaches the analyst at its next step.
                    const sePuedeSaltar = e === ultimo && !e.respuesta;
                    return (
                        <div key={e.id} className="ddr-ind-ep">
                            <button className="ddr-ind-preg" onClick={() => onIr(e.id)} title={e.pregunta}>
                                <LuMessageSquare size={12} /> <span>{e.pregunta || 'Analysis'}</span>
                            </button>
                            {e.respuesta && (
                                <button className="ddr-ind-item ddr-ind-item--resp" onClick={() => onIr(`${e.id}-respuesta`)}>
                                    <LuSparkles size={13} /> <span>Answer</span>
                                </button>
                            )}
                            {e.indice?.length > 0 && (
                                <ol className="ddr-ind-pasos">
                                    {e.indice.map(p => {
                                        const vivo = p.estado === 'in_progress' && e.enCurso;
                                        const [Icono, cls, texto] = ICONO[vivo ? 'in_progress' : p.estado] || ICONO.pending;
                                        const destino = p.tieneSeccion ? `${e.id}-${p.id}` : null;
                                        return (
                                            <li key={p.id} className={`ddr-ind-paso ddr-ind-paso--${cls}`}>
                                                <button className="ddr-ind-item" disabled={!destino} onClick={() => destino && onIr(destino)}
                                                    title={p.nota ? `${texto}: ${p.nota}` : texto}>
                                                    <Icono size={13} className={vivo ? 'ddr-gira' : undefined} aria-label={texto} />
                                                    <span className="ddr-ind-num">{p.numero}</span>
                                                    <span className="ddr-ind-txt">{p.descripcion || `Step ${p.numero}`}</span>
                                                </button>
                                                {sePuedeSaltar && p.estado === 'pending' && onSaltar && (
                                                    <button className="ddr-ind-saltar" onClick={() => onSaltar(p.id)} title="Skip this step when the analysis continues">
                                                        <LuSkipForward size={11} /> Skip
                                                    </button>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="ddr-ind-salidas">
                <div className="ddr-ind-t">Deliverables</div>
                {entregables.graficos.map(g => (
                    <button key={g.id} className="ddr-ind-item" onClick={() => onIr(g.id)} title={g.titulo}>
                        <LuChartColumn size={13} /> <span className="ddr-ind-txt">{g.titulo}</span>
                    </button>
                ))}
                {entregables.notebooks.map(n => (
                    <button key={n.ruta} className="ddr-ind-item" onClick={() => onAbrirArchivo?.(n.ruta)} title={n.ruta}>
                        <LuBookOpen size={13} /> <span className="ddr-ind-txt">{n.nombre}</span>
                    </button>
                ))}
                {onReportFlow && (
                    <button className="ddr-ind-item ddr-ind-item--accion" onClick={onReportFlow} disabled={isGenerating || enviandoDeck}
                        title="A deck with the answer, one slide per chart, next steps and caveats. Export it to PowerPoint or Word from Report Flow.">
                        <LuPresentation size={13} /> <span>{enviandoDeck ? 'Creating the deck…' : 'Send to Report Flow'}</span>
                    </button>
                )}
                <button className="ddr-ind-item ddr-ind-item--accion" onClick={onGuardarNotebook} disabled={isGenerating}>
                    <LuNotebookPen size={13} /> <span>Save as notebook</span>
                </button>
                <button className="ddr-ind-item ddr-ind-item--accion" onClick={onExportar}>
                    <LuDownload size={13} /> <span>Export as Markdown</span>
                </button>
            </div>
        </nav>
    );
}
