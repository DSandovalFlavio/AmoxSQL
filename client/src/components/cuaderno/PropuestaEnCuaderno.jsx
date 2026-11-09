import { useState } from 'react';
import { LuSparkles, LuCheck, LuX } from 'react-icons/lu';
import EditProposalBlock from '../ai/EditProposalBlock';
import { describirCelda } from '../ai/archivos/cuaderno.js';

/**
 * **Una propuesta del Assistant, en el cuaderno** (plan del Assistant, E3).
 *
 * El cambio de una celda se revisa debajo de esa celda: lo que sale y lo que
 * entra, con Accept / Reject. Una celda nueva aparece como **fantasma** en el
 * sitio donde entraría, con borde discontinuo, hasta que se acepta o se rechaza.
 * Las dos comparten acciones con el chat: aceptar en un sitio vale para los dos.
 */

const useAceptar = (tc, acciones) => {
    const [error, setError] = useState(null);
    const [ocupada, setOcupada] = useState(false);
    const aceptar = async () => {
        if (!acciones || ocupada) return;
        setOcupada(true);
        setError(null);
        const r = await acciones.aceptar(tc);
        setOcupada(false);
        if (r?.error) setError(r.error);
    };
    return { aceptar, error, ocupada };
};

export function RevisionDeCelda({ tc, acciones }) {
    const r = tc.result || {};
    const { aceptar, error } = useAceptar(tc, acciones);
    return (
        <div id={`amx-prop-${tc.toolCallId}`} className="cdn-propuesta" style={{ gridColumn: 2 }}>
            <div className="cdn-propuesta-etq"><LuSparkles size={11} /> Assist proposes</div>
            <EditProposalBlock
                titulo={describirCelda(r)}
                currentContent={r.original}
                proposedContent={r.contenido}
                description={r.resumen}
                onAccept={aceptar}
                onReject={() => acciones?.rechazar(tc)}
            />
            {error && <div className="ai-propuesta__error">{error}</div>}
        </div>
    );
}

export function CeldaFantasma({ tc, acciones }) {
    const r = tc.result || {};
    const { aceptar, error, ocupada } = useAceptar(tc, acciones);
    const sql = r.objetivo?.celdaTipo !== 'texto';
    return (
        <div id={`amx-prop-${tc.toolCallId}`} className="cdn-fila cdn-fila--fantasma">
            <div />
            <div className="cdn-fantasma">
                <div className="cdn-fantasma-cab">
                <span className="cdn-fantasma-etq">
                    <LuSparkles size={11} /> Proposed · new {sql ? `SQL cell${r.objetivo?.nombre ? ` ${r.objetivo.nombre}` : ''}` : 'text cell'}
                </span>
                <span className="cdn-fantasma-acciones">
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--reject" onClick={() => acciones?.rechazar(tc)}>
                        <LuX size={12} /> Reject
                    </button>
                    <button type="button" className="ai-edit-proposal__btn ai-edit-proposal__btn--accept" onClick={aceptar} disabled={ocupada}>
                        <LuCheck size={12} /> Accept
                    </button>
                </span>
                </div>
                {r.resumen && <div className="cdn-fantasma-desc">{r.resumen}</div>}
                <pre className={`cdn-fantasma-cuerpo${sql ? ' cdn-fantasma-cuerpo--sql' : ''}`}>{r.contenido}</pre>
                {error && <div className="ai-propuesta__error">{error}</div>}
            </div>
        </div>
    );
}
