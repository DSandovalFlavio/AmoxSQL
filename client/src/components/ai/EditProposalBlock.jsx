import { useMemo, useState } from 'react';
import { LuCheck, LuX, LuChevronDown, LuChevronRight, LuFilePen, LuScanSearch } from 'react-icons/lu';
import { diffLineas } from '../../utils/diffLineas.js';

/** Líneas iguales que se dejan alrededor de cada cambio; el resto se pliega. */
const CONTEXTO = 2;

/**
 * EditProposalBlock — a change the Assistant proposes, as a real diff (A4).
 *
 * It used to mark as "added" any line that didn't exist somewhere in the file (a
 * Set of lines): it never showed what goes away, and moved or repeated lines came
 * out wrong. Now it is a line diff (LCS): what goes out in red, what comes in in
 * green, with a little context and the rest folded.
 *
 * `titulo` names the change («Change to lines 18–20»); `onRevisar` (E2) takes the
 * user to the editor, where the same change is drawn on the file itself.
 */
const EditProposalBlock = ({ currentContent, proposedContent, description, titulo = 'Change to the file', onAccept, onReject, onRevisar, abierto = true }) => {
    const [showDiff, setShowDiff] = useState(abierto);
    const { operaciones, quitadas, agregadas } = useMemo(
        () => diffLineas(currentContent ?? '', proposedContent ?? ''),
        [currentContent, proposedContent],
    );

    // Solo lo que cambia y unas líneas alrededor; lo demás, «… N lines».
    const filas = useMemo(() => {
        const cerca = new Set();
        operaciones.forEach((o, i) => {
            if (o.tipo !== 'igual') for (let k = i - CONTEXTO; k <= i + CONTEXTO; k++) cerca.add(k);
        });
        const out = [];
        let saltadas = 0;
        operaciones.forEach((o, i) => {
            if (o.tipo === 'igual' && !cerca.has(i)) { saltadas++; return; }
            if (saltadas) { out.push({ tipo: 'plegadas', n: saltadas }); saltadas = 0; }
            out.push(o);
        });
        if (saltadas) out.push({ tipo: 'plegadas', n: saltadas });
        return out;
    }, [operaciones]);

    return (
        <div className="ai-edit-proposal">
            <div className="ai-edit-proposal__header">
                <button type="button" className="ai-propuesta__titulo" onClick={() => setShowDiff(v => !v)}>
                    {showDiff ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                    <LuFilePen size={13} />
                    <span>{titulo}</span>
                </button>
                <span className="ai-propuesta__cuenta">
                    <span className="ai-propuesta__suma">+{agregadas}</span>
                    <span className="ai-propuesta__resta">-{quitadas}</span>
                </span>
            </div>
            {description && <div className="ai-propuesta__desc-fila">{description}</div>}
            {showDiff && (
                <div className="ai-edit-proposal__diff">
                    {filas.slice(0, 200).map((f, i) => (f.tipo === 'plegadas' ? (
                        <div key={i} className="ai-edit-proposal__line ai-propuesta__plegadas">… {f.n} unchanged line{f.n === 1 ? '' : 's'}</div>
                    ) : (
                        <div key={i} className={`ai-edit-proposal__line${f.tipo === 'entra' ? ' ai-edit-proposal__line--added' : f.tipo === 'sale' ? ' ai-edit-proposal__line--removed' : ''}`}>
                            <span className="ai-edit-proposal__line-num">{f.tipo === 'entra' ? '' : f.a + 1}</span>
                            <span className="ai-edit-proposal__line-marker">{f.tipo === 'entra' ? '+' : f.tipo === 'sale' ? '−' : ' '}</span>
                            <span className="ai-edit-proposal__line-content">{f.texto || ' '}</span>
                        </div>
                    )))}
                    {filas.length > 200 && <div className="ai-edit-proposal__line ai-propuesta__plegadas">… and more</div>}
                </div>
            )}
            <div className="ai-propuesta__acciones ai-propuesta__acciones--pie">
                {onRevisar && (
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={onRevisar} title="Show this change in the editor">
                        <LuScanSearch size={12} /> Review
                    </button>
                )}
                <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={onReject} title="Reject — keep the file as it is">
                    <LuX size={12} /> Reject
                </button>
                <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--accept" onClick={onAccept} title="Accept — apply it in the editor (not saved to disk)">
                    <LuCheck size={12} /> Accept
                </button>
            </div>
        </div>
    );
};

export default EditProposalBlock;
