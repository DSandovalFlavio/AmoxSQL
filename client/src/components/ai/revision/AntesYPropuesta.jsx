import { useState } from 'react';
import { LuSparkles, LuCheck, LuX, LuChevronRight, LuLoader } from 'react-icons/lu';

/**
 * **Antes / Propuesta** (plan del Assistant, E4): la revisión de lo que no se lee
 * como un diff de líneas — una lámina, un gráfico —. Una barra encima del mismo
 * lienzo: qué cambia, un conmutador para ver la lámina o la figura como está y
 * como quedaría, y Accept / Reject. El lienzo lo pinta quien la usa: aquí solo se
 * dice cuál de los dos se ve.
 *
 * Acepta y rechaza con las mismas acciones del chat: decidir en un sitio vale para
 * los dos.
 */
export default function AntesYPropuesta({
    titulo, cambios = [], resumen, vista, onVista, tc, acciones, indice = 0, total = 1, onSiguiente,
}) {
    const [ocupada, setOcupada] = useState(false);
    const [error, setError] = useState(null);
    const aceptar = async () => {
        if (!acciones || ocupada) return;
        setOcupada(true);
        setError(null);
        const r = await acciones.aceptar(tc);
        setOcupada(false);
        if (r?.error) setError(r.error);
    };
    return (
        <div className="amx-ayp" role="group" aria-label="Assist proposal" id={tc ? `amx-prop-${tc.toolCallId}` : undefined}>
            <div className="amx-ayp-fila">
                <LuSparkles size={13} className="amx-ayp-icono" />
                <span className="amx-ayp-titulo">{titulo}</span>
                {resumen && <span className="amx-ayp-resumen" title={resumen}>{resumen}</span>}
                <span className="amx-ayp-hueco" />
                <span className="amx-ayp-mandos">
                <div className="seg amx-ayp-seg" role="tablist" aria-label="Before or proposal">
                    <button type="button" role="tab" aria-selected={vista === 'antes'} className={`seg-item${vista === 'antes' ? ' seg-item--active' : ''}`} onClick={() => onVista('antes')}>Before</button>
                    <button type="button" role="tab" aria-selected={vista === 'propuesta'} className={`seg-item${vista === 'propuesta' ? ' seg-item--active' : ''}`} onClick={() => onVista('propuesta')}>Proposal</button>
                </div>
                <button type="button" className="amx-rev-btn" onClick={() => acciones?.rechazar(tc)} title="Reject — keep it as it is">
                    <LuX size={12} /> Reject
                </button>
                <button type="button" className="amx-rev-btn amx-rev-btn--ok" onClick={aceptar} disabled={ocupada} title="Accept — apply it (not saved to disk until you save)">
                    {ocupada ? <LuLoader size={12} className="spin" /> : <LuCheck size={12} />} Accept
                </button>
                {total > 1 && (
                    <button type="button" className="amx-rev-btn amx-rev-btn--fant" onClick={onSiguiente} title="Next proposal">
                        {indice + 1} of {total} <LuChevronRight size={12} />
                    </button>
                )}
                </span>
            </div>
            {cambios.length > 0 && (
                <ul className="amx-ayp-cambios">
                    {cambios.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
            )}
            {error && <div className="ai-propuesta__error">{error}</div>}
        </div>
    );
}
