/**
 * El recuadro de un grupo — una zona de la arquitectura.
 *
 * Va como nodo de React Flow y no como fondo dibujado aparte, para que el
 * encuadre, el minimapa y el zoom lo traten como a todo lo demás sin código
 * propio.
 *
 * **No usa `parentId`.** React Flow sabe anidar nodos dentro de otro y hacer que
 * arrastrar el padre arrastre a los hijos, pero eso convierte las coordenadas de
 * los hijos en relativas, y las que llegan de mermaid son absolutas. Mientras el
 * lienzo sólo lee, un recuadro suelto detrás dibuja lo mismo con la mitad de
 * piezas. Cuando la fase 4 permita meter y sacar cajas de un grupo habrá que
 * decidirlo de verdad, y la decisión se tomará con el gesto delante.
 */
import { memo } from 'react';

const DiagramGroupNode = ({ data, selected }) => (
    <div
        className={`dgm-group${selected ? ' dgm-group--sel' : ''}`}
        style={{ width: data.ancho, height: data.alto }}
    >
        <span className="dgm-group-tit">{data.titulo}</span>
    </div>
);

export default memo(DiagramGroupNode);
