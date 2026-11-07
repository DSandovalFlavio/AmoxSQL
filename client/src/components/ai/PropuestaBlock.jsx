import { useState } from 'react';
import { LuCheck, LuX, LuFilePlus2, LuFilePen, LuHistory, LuRefreshCw, LuChevronDown, LuChevronRight, LuLoader } from 'react-icons/lu';
import EditProposalBlock from './EditProposalBlock';
import { estadoDe, esArchivoNuevo } from './propuestas';

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
const PropuestaBlock = ({ tc, contenidoActual, enCurso = false, onAccept, onReject, onProponerDeNuevo }) => {
    const [ocupada, setOcupada] = useState(false);
    const [error, setError] = useState(null);
    const [verContenido, setVerContenido] = useState(false);
    const nuevo = esArchivoNuevo(tc);
    const r = tc.result || {};

    if (enCurso) {
        return (
            <div className="ai-propuesta ai-propuesta--compacta">
                {nuevo ? <LuFilePlus2 size={13} /> : <LuFilePen size={13} />}
                <span>{nuevo ? <>Proposing <code>{r.path}</code></> : 'Proposing a change to this file'}</span>
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
                    {r.description && !nuevo ? <span className="ai-propuesta__desc"> — {r.description}</span> : null}
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
                            ? 'The file changed since this was proposed, so applying it would undo your edits.'
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
