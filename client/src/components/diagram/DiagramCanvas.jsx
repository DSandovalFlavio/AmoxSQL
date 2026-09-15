/**
 * El lienzo. React Flow con los nodos de AmoxDiagram.
 *
 * `ChainCanvas` fue la referencia y no la base: importa 34 tipos de nodo atados
 * a la ejecución de chains, validación de ciclos y configuración por nodo. De
 * ahí se copia el montaje y la resolución de colores del tema; nada más.
 */
import { useMemo } from 'react';
import {
    ReactFlow, Background, MiniMap, Controls, BackgroundVariant, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DiagramNode from './DiagramNode';
import DiagramGroupNode from './DiagramGroupNode';

const tiposDeNodo = { caja: DiagramNode, grupo: DiagramGroupNode };

const DiagramCanvas = ({ nodos, aristas, colores, onSeleccion, soloLectura = true }) => {
    const { fitView } = useReactFlow();

    const opcionesDeArista = useMemo(() => ({
        type: 'smoothstep',
        style: { stroke: colores.arista, strokeWidth: 1.6 },
    }), [colores.arista]);

    return (
        <div className="dgm-canvas">
            <ReactFlow
                nodes={nodos}
                edges={aristas}
                nodeTypes={tiposDeNodo}
                defaultEdgeOptions={opcionesDeArista}
                onSelectionChange={onSeleccion}
                // En la fase 1 el lienzo sólo lee. Mover una caja aquí sería
                // prometer algo que el formato no sostiene, y descubrir al
                // guardar que no se guardó es la peor forma de enterarse.
                nodesDraggable={!soloLectura}
                nodesConnectable={!soloLectura}
                elementsSelectable
                deleteKeyCode={soloLectura ? null : 'Delete'}
                multiSelectionKeyCode="Shift"
                minZoom={0.2}
                maxZoom={2.5}
                fitView
                fitViewOptions={{ padding: 0.14, maxZoom: 1.1 }}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={17} size={0.9} color={colores.puntos} />
                <Controls
                    position="bottom-right"
                    showInteractive={false}
                    onFitView={() => fitView({ padding: 0.14, maxZoom: 1.1 })}
                    className="dgm-controls"
                />
                <MiniMap
                    position="bottom-left"
                    pannable
                    zoomable
                    // El recuadro de un grupo en el minimapa sería una mancha que
                    // tapa sus propias cajas: se dibujan sólo las cajas.
                    nodeColor={(n) => (n.type === 'grupo' ? 'transparent' : colores.caja)}
                    nodeStrokeWidth={0}
                    maskColor={colores.mascara}
                    className="dgm-minimap"
                />
            </ReactFlow>
        </div>
    );
};

export default DiagramCanvas;
