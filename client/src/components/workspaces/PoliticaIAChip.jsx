/**
 * La política de IA que rige ahora (B4), donde se habla con el asistente: el
 * usuario tiene que saber, antes de preguntar, qué puede ver el modelo. Sólo
 * aparece si la política restringe algo; la regla la aplica el servidor, esto
 * sólo la cuenta.
 */
import { LuShieldCheck } from 'react-icons/lu';
import { useEnlace } from './WorkspacesHost';
import { useEtiqueta } from '../../etiqueta';
import { resumenPolitica } from './WorkspacesPanel';

export default function PoliticaIAChip({ compacto = false }) {
    const enlace = useEnlace();
    const e = useEtiqueta();
    const w = enlace?.estado === 'enlazado' ? enlace.workspace : null;
    const texto = resumenPolitica(w?.politicaIa);
    if (!texto) return null;
    const titulo = `AI policy of the ${e.s} “${w.nombre}”: ${texto}. AmoxSQL enforces it before anything is sent to a model.`;
    return (
        <span className={`wsx-politica${compacto ? ' wsx-politica--compacto' : ''}`} title={titulo} aria-label={titulo}>
            <LuShieldCheck size={compacto ? 11 : 12} />
            {!compacto && texto}
        </span>
    );
}
