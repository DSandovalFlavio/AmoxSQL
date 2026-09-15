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

const DiagramNode = ({ id, data, selected }) => {
    const forma = data.forma || 'proceso';
    const entrantes = data.entrantes || 0;
    const editando = data.editandoId === id;

    /**
     * El campo va **sin controlar**: su valor vive en el DOM y se lee al cerrar.
     *
     * Controlarlo obligaba a un estado local sembrado desde un efecto, que es
     * justo el patrón que provoca repintados en cascada — y aquí sobra, porque
     * el borrador sólo interesa en el instante en que se acepta. El `key` hace
     * que el campo se reponga si el texto cambia por otro camino.
     */
    const cerrar = (campo, guardar) => {
        const valor = (campo?.value || '').trim();
        if (guardar && valor && valor !== data.texto) data.onRenombrar?.(id, valor);
        data.onEditar?.(null);
    };

    return (
        <div
            className={`dgm-node dgm-node--${forma}${selected ? ' dgm-node--sel' : ''}`}
            style={{ width: data.ancho, height: data.alto }}
            title={editando ? undefined : data.texto}
        >
            {/* Los conectores existen desde la fase 1 aunque hasta la 2 no se
                pudiera conectar: montarlos después movería el borde de cada caja
                y el dibujo cambiaría sin que nadie hubiera tocado el diagrama. */}
            <Handle type="target" position={Position.Left} className="dgm-handle" />
            <span className="dgm-node-body">
                {editando ? (
                    <input
                        key={data.texto}
                        className="dgm-node-inp nodrag"
                        defaultValue={data.texto}
                        // Al entrar en edición el texto se selecciona entero: lo
                        // más frecuente es reemplazarlo, no añadirle una coma.
                        ref={(el) => { if (el) { el.focus(); el.select(); } }}
                        onBlur={(e) => cerrar(e.currentTarget, true)}
                        onKeyDown={(e) => {
                            // Se para la propagación para que `Delete` dentro del
                            // campo borre una letra y no la caja entera.
                            e.stopPropagation();
                            if (e.key === 'Enter') { e.preventDefault(); cerrar(e.currentTarget, true); }
                            if (e.key === 'Escape') { e.preventDefault(); cerrar(e.currentTarget, false); }
                        }}
                    />
                ) : (
                    <span className="dgm-node-txt">{data.texto}</span>
                )}
            </span>
            <Handle type="source" position={Position.Right} className="dgm-handle" />
            {entrantes > 1 && !editando && <span className="dgm-node-badge">×{entrantes}</span>}
        </div>
    );
};

export default memo(DiagramNode);
