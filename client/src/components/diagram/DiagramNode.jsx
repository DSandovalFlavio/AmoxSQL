/**
 * La caja del lienzo. **Un solo componente para las siete formas.**
 *
 * La tentación era un componente por forma, como hace Data Flow con sus 34
 * tipos de nodo. Ahí tiene sentido: cada tipo tiene campos, validación y una
 * ficha distinta. Aquí no — una decisión y un almacén se diferencian en el
 * contorno y en nada más, así que la forma es CSS y el componente es uno.
 *
 * El rombo y el paralelogramo se recortan con `clip-path`, y eso borra el
 * borde: un recorte no deja nada fuera, filete incluido. Se dibujan con un
 * `outline` hacia dentro sobre la capa recortada, que sí sobrevive.
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const DiagramNode = ({ data, selected }) => {
    const forma = data.forma || 'proceso';
    const entrantes = data.entrantes || 0;

    return (
        <div
            className={`dgm-node dgm-node--${forma}${selected ? ' dgm-node--sel' : ''}`}
            style={{ width: data.ancho, height: data.alto }}
            title={data.texto}
        >
            {/* Los conectores existen desde la fase 1 aunque todavía no se pueda
                conectar: montarlos después movería el borde de cada caja y el
                dibujo cambiaría sin que nadie hubiera tocado el diagrama. */}
            <Handle type="target" position={Position.Left} className="dgm-handle" />
            <span className="dgm-node-body"><span className="dgm-node-txt">{data.texto}</span></span>
            <Handle type="source" position={Position.Right} className="dgm-handle" />
            {entrantes > 1 && <span className="dgm-node-badge">×{entrantes}</span>}
        </div>
    );
};

export default memo(DiagramNode);
