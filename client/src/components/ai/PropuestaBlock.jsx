import { useState } from 'react';
import { LuCheck, LuX, LuFilePlus2, LuFilePen, LuHistory, LuRefreshCw, LuChevronDown, LuChevronRight, LuLoader, LuScanSearch, LuChartColumn, LuWorkflow, LuShare2 } from 'react-icons/lu';
import EditProposalBlock from './EditProposalBlock';
import { estadoDe, esArchivoNuevo } from './propuestas';
import { esDeRango, ubicarRango } from './archivos/rango.js';
import { esDeCelda } from './archivos/cuaderno.js';
import { describirPropuesta } from './archivos/index.js';
import { esDeLamina, laminaPropuesta } from './archivos/deck.js';
import { esDeGrafico, describirCambios } from './archivos/grafico.js';
import { esDePasos } from './archivos/flujo.js';
import { esDeTarjeta } from './archivos/lienzo.js';
import { esDeDiagrama, cambiosDeDiagrama } from './archivos/diagrama.js';
import { leerDiagrama } from '../diagram/diagramFile.js';

/**
 * **Una propuesta del Assistant, como lo que es** (plan del Assistant, E1/A1).
 *
 * Antes, una propuesta sin aplicar se pintaba con una palomita verde («Write
 * file ✓») y no tenía botones: parecía hecha y no lo estaba. Aquí cada estado
 * se ve distinto:
 *
 *   propuesta — Accept / Reject (un cambio del archivo) o Create / Dismiss (uno nuevo)
 *   aplicada  — «Applied to the editor» / «Created x.sql»
 *   rechazada — «Rejected»
 *   caducada  — el archivo cambió desde entonces: aceptarla borraría lo escrito
 *               después, así que se ofrece pedirla de nuevo
 *   anterior  — de antes de guardar el estado: no se sabe qué pasó
 *
 * Mientras el modelo escribe (`enCurso`), solo se anuncia: decidir sobre algo
 * que aún no terminó de llegar no tiene sentido.
 */
const PropuestaBlock = ({ tc, contenidoActual, enCurso = false, onAccept, onReject, onProponerDeNuevo, onRevisar }) => {
    const [ocupada, setOcupada] = useState(false);
    const [error, setError] = useState(null);
    const [verContenido, setVerContenido] = useState(false);
    const nuevo = esArchivoNuevo(tc);
    const r = tc.result || {};

    if (enCurso) {
        return (
            <div className="ai-propuesta ai-propuesta--compacta">
                {nuevo ? <LuFilePlus2 size={13} /> : <LuFilePen size={13} />}
                <span>{nuevo ? <>Proposing <code>{r.path}</code></> : esDeRango(r) ? `Proposing a change to ${describirPropuesta(r).replace(/^(Change to|Insert) /, '')}` : (esDeCelda(r) || esDeLamina(r) || esDeGrafico(r) || esDePasos(r) || esDeTarjeta(r) || esDeDiagrama(r)) ? `Proposing: ${describirPropuesta(r)}` : 'Proposing a change to this file'}</span>
            </div>
        );
    }

    const estado = estadoDe(tc, contenidoActual);
    const aceptar = async () => {
        if (!onAccept || ocupada) return;
        setOcupada(true);
        setError(null);
        const res = await onAccept(tc);
        setOcupada(false);
        if (res?.error) setError(res.error);
    };

    if (estado === 'aplicada' || estado === 'rechazada') {
        const aplicada = estado === 'aplicada';
        return (
            <div className={`ai-propuesta ai-propuesta--compacta${aplicada ? ' ai-propuesta--aplicada' : ''}`}>
                {aplicada ? <LuCheck size={13} /> : <LuX size={13} />}
                <span>
                    {aplicada
                        ? (nuevo ? <>Created <code>{r.path}</code></> : 'Applied to the editor')
                        : (nuevo ? <>Did not create <code>{r.path}</code></> : 'Rejected')}
                    {(r.description || r.resumen) && !nuevo ? <span className="ai-propuesta__desc"> — {r.description || r.resumen}</span> : null}
                </span>
            </div>
        );
    }

    if (estado === 'caducada' || estado === 'anterior') {
        return (
            <div className="ai-propuesta ai-propuesta--aviso">
                <div className="ai-propuesta__fila">
                    <LuHistory size={13} />
                    <span>
                        {estado === 'caducada'
                            ? (esDeRango(r)
                                ? 'Those lines changed since this was proposed, so it no longer fits.'
                                : esDeLamina(r) ? 'That slide changed since this was proposed, so it no longer fits.'
                                : esDeGrafico(r) ? 'Those chart settings changed since this was proposed, so it no longer fits.'
                                : esDePasos(r) ? 'Those steps changed since this was proposed, so it no longer fits.'
                                : esDeTarjeta(r) ? 'That card changed since this was proposed, so it no longer fits.'
                                : 'The file changed since this was proposed, so applying it would undo your edits.')
                            : nuevo
                                ? <>Proposed <code>{r.path}</code> in an earlier session.</>
                                : 'A change proposed in an earlier session. It may not match the file anymore.'}
                    </span>
                </div>
                <div className="ai-propuesta__acciones">
                    {onProponerDeNuevo && (
                        <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={() => onProponerDeNuevo(tc)}>
                            <LuRefreshCw size={12} /> Propose again
                        </button>
                    )}
                    {onReject && (
                        <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={() => onReject(tc)}>
                            <LuX size={12} /> Dismiss
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // E2: some lines of the file. The diff is just those lines; Review shows it in
    // the editor, drawn on the file itself.
    if (esDeRango(r)) {
        const donde = contenidoActual != null ? ubicarRango(contenidoActual, r) : null;
        return (
            <>
                <EditProposalBlock
                    titulo={describirPropuesta(r, donde)}
                    currentContent={r.objetivo.hasta >= r.objetivo.desde ? r.original : []}
                    proposedContent={r.contenido === '' ? [] : r.contenido}
                    description={r.resumen}
                    onRevisar={onRevisar ? () => onRevisar(tc.toolCallId) : undefined}
                    onAccept={aceptar}
                    onReject={() => onReject && onReject(tc)}
                />
                {error && <div className="ai-propuesta__error">{error}</div>}
            </>
        );
    }

    // E3: one cell of a notebook: its old text and the new one (a new cell, all
    // new). Review takes you to the cell, where the same change is drawn.
    if (esDeCelda(r)) {
        const nueva = r.objetivo.accion === 'despues_de';
        return (
            <>
                <EditProposalBlock
                    titulo={describirPropuesta(r)}
                    currentContent={nueva ? [] : r.original}
                    proposedContent={r.contenido}
                    description={r.resumen}
                    onRevisar={onRevisar ? () => onRevisar(tc.toolCallId) : undefined}
                    onAccept={aceptar}
                    onReject={() => onReject && onReject(tc)}
                />
                {error && <div className="ai-propuesta__error">{error}</div>}
            </>
        );
    }

    // E4: one slide of a deck. The diff is that slide's source as it would be
    // written; Review takes you to the slide, with Before / Proposal.
    if (esDeLamina(r)) {
        const nueva = r.objetivo.accion === 'despues_de';
        const propuesta = contenidoActual != null ? laminaPropuesta(contenidoActual, r) : null;
        return (
            <>
                <EditProposalBlock
                    titulo={describirPropuesta(r, propuesta?.donde)}
                    currentContent={nueva ? [] : r.original}
                    proposedContent={propuesta ? propuesta.raw : (r.lamina?.prosa || '')}
                    description={r.resumen}
                    onRevisar={onRevisar ? () => onRevisar(tc.toolCallId) : undefined}
                    onAccept={aceptar}
                    onReject={() => onReject && onReject(tc)}
                />
                {error && <div className="ai-propuesta__error">{error}</div>}
            </>
        );
    }

    // E4: a chart's settings. The list of what changes; Review shows Before /
    // Proposal on the figure itself.
    // E5: a Canvas card: its old SQL or text and the new one (a new card, all new).
    if (esDeTarjeta(r)) {
        return (
            <>
                <EditProposalBlock
                    titulo={describirPropuesta(r)}
                    currentContent={r.objetivo.accion === 'nueva' ? [] : r.original}
                    proposedContent={r.contenido}
                    description={r.resumen}
                    onRevisar={onRevisar ? () => onRevisar(tc.toolCallId) : undefined}
                    onAccept={aceptar}
                    onReject={() => onReject && onReject(tc)}
                />
                {error && <div className="ai-propuesta__error">{error}</div>}
            </>
        );
    }

    // E4/E5: a chart, a Data Flow or a diagram: the list of what changes; Review
    // shows it on the figure, the canvas or the drawing itself.
    if (esDeGrafico(r) || esDePasos(r) || esDeDiagrama(r)) {
        let lista = [];
        if (esDeGrafico(r)) lista = describirCambios(r);
        else if (esDePasos(r)) lista = r.cambios || [];
        else {
            const actual = contenidoActual != null ? leerDiagrama(contenidoActual).grafo : null;
            lista = actual ? cambiosDeDiagrama(actual, r).lista : [];
        }
        const Icono = esDeGrafico(r) ? LuChartColumn : esDePasos(r) ? LuWorkflow : LuShare2;
        return (
            <div className="ai-edit-proposal">
                <div className="ai-edit-proposal__header">
                    <span className="ai-propuesta__titulo"><Icono size={13} /> <span>{describirPropuesta(r)}</span></span>
                </div>
                {r.resumen && <div className="ai-propuesta__desc-fila">{r.resumen}</div>}
                <ul className="ai-propuesta__cambios">
                    {lista.slice(0, 12).map((c, i) => <li key={i}>{c}</li>)}
                    {lista.length > 12 && <li>… and {lista.length - 12} more</li>}
                </ul>
                <div className="ai-propuesta__acciones ai-propuesta__acciones--pie">
                    {onRevisar && (
                        <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={() => onRevisar(tc.toolCallId)} title="Show Before / Proposal on the chart">
                            <LuScanSearch size={12} /> Review
                        </button>
                    )}
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={() => onReject && onReject(tc)}>
                        <LuX size={12} /> Reject
                    </button>
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--accept" onClick={aceptar} disabled={ocupada}>
                        {ocupada ? <LuLoader size={12} className="ai-tool-spinner" /> : <LuCheck size={12} />} Accept
                    </button>
                </div>
                {error && <div className="ai-propuesta__error">{error}</div>}
            </div>
        );
    }

    if (!nuevo) {
        return (
            <>
                <EditProposalBlock
                    currentContent={contenidoActual || ''}
                    proposedContent={r.content || ''}
                    description={r.description}
                    onAccept={aceptar}
                    onReject={() => onReject && onReject(tc)}
                />
                {error && <div className="ai-propuesta__error">{error}</div>}
            </>
        );
    }

    const lineas = String(r.content || '').split('\n');
    return (
        <div className="ai-edit-proposal ai-propuesta-archivo">
            <div className="ai-edit-proposal__header">
                <button type="button" className="ai-propuesta__titulo" onClick={() => setVerContenido(v => !v)}>
                    {verContenido ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                    <LuFilePlus2 size={13} />
                    <span>New file</span>
                </button>
                <div className="ai-edit-proposal__actions">
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={() => onReject && onReject(tc)} title="Don't create it">
                        <LuX size={12} /> Dismiss
                    </button>
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--accept" onClick={aceptar} disabled={ocupada} title="Create the file and open it">
                        {ocupada ? <LuLoader size={12} className="ai-tool-spinner" /> : <LuCheck size={12} />} Create
                    </button>
                </div>
            </div>
            {/* The path on its own line: in a narrow panel the header cut it off. */}
            <div className="ai-propuesta__desc-fila">
                <code className="ai-propuesta__ruta">{r.path}</code>
                {r.description && <span>{r.description}</span>}
            </div>
            {verContenido && (
                <div className="ai-edit-proposal__diff">
                    {lineas.slice(0, 200).map((linea, i) => (
                        <div key={i} className="ai-edit-proposal__line">
                            <span className="ai-edit-proposal__line-num">{i + 1}</span>
                            <span className="ai-edit-proposal__line-content">{linea || ' '}</span>
                        </div>
                    ))}
                    {lineas.length > 200 && <div className="ai-edit-proposal__line ai-propuesta__mas">… {lineas.length - 200} more lines</div>}
                </div>
            )}
            {error && <div className="ai-propuesta__error">{error}</div>}
        </div>
    );
};

export default PropuestaBlock;
