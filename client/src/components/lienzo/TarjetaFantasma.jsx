import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LuSparkles } from 'react-icons/lu';
import EditProposalBlock from '../ai/EditProposalBlock';
import { describirTarjeta } from '../ai/archivos/lienzo.js';

/**
 * **Una tarjeta que propone el Assistant** (plan del Assistant, E5).
 *
 * Una tarjeta nueva aparece donde entraría, con borde discontinuo; un cambio de
 * SQL o de texto aparece debajo de su tarjeta, con lo que sale y lo que entra.
 * Las dos se aceptan o se rechazan aquí o desde el chat: decidir en un sitio vale
 * para los dos.
 */
export default function TarjetaFantasma({ data }) {
    const { tc, acciones } = data;
    const r = tc.result || {};
    const [error, setError] = useState(null);
    const aceptar = async () => {
        setError(null);
        const res = await acciones?.aceptar(tc);
        if (res?.error) setError(res.error);
    };
    const nueva = r.objetivo?.accion === 'nueva';
    return (
        <div id={`amx-prop-${tc.toolCallId}`} className={`lz-fantasma nodrag nowheel${nueva ? '' : ' lz-fantasma--cambio'}`}>
            <Handle type="target" position={Position.Left} className="lz-fantasma-ancla" isConnectable={false} />
            <div className="lz-fantasma-etq"><LuSparkles size={11} /> Assist proposes</div>
            <EditProposalBlock
                titulo={describirTarjeta(r)}
                currentContent={nueva ? [] : r.original}
                proposedContent={r.contenido}
                description={r.resumen}
                onAccept={aceptar}
                onReject={() => acciones?.rechazar(tc)}
            />
            {error && <div className="ai-propuesta__error">{error}</div>}
        </div>
    );
}
