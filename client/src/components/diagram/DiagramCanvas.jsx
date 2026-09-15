/**
 * El lienzo. React Flow con los nodos de AmoxDiagram.
 *
 * `ChainCanvas` fue la referencia y no la base: importa 34 tipos de nodo atados
 * a la ejecución de chains, validación de ciclos y configuración por nodo. De
 * ahí se copia el montaje y la resolución de colores del tema; nada más.
 *
 * ## La selección es nuestra, no de React Flow
 *
 * Lo habitual es dejar que React Flow lleve su propia copia de nodos y aristas
 * y sincronizarla. Aquí no: **la verdad es el archivo**, y el lienzo se deriva
 * de él en cada render. Dos copias del mismo grafo es exactamente como se
 * acaban viendo cosas distintas en el dibujo y en el texto.
 *
 * Así que la selección se marca en los nodos derivados y los manejadores de
 * cambio son vacíos a propósito: nada de lo que React Flow quiera modificar por
 * su cuenta debe llegar al archivo sin pasar por una operación.
 *
 * ## Las cajas se pueden arrastrar, y no se mueven
 *
 * Parece un defecto y es el diseño. Mermaid no guarda coordenadas: si se dejara
 * fijarlas, el usuario colocaría una caja, guardaría, y al reabrir la
 * encontraría en otro sitio. Dejando que el gesto ocurra podemos **explicarlo
 * la primera vez** en lugar de que lo descubra a base de intentarlo.
 */
import { useMemo } from 'react';
import {
    ReactFlow, Background, MiniMap, Controls, BackgroundVariant, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DiagramNode from './DiagramNode';
import DiagramGroupNode from './DiagramGroupNode';

const tiposDeNodo = { caja: DiagramNode, grupo: DiagramGroupNode };
const nada = () => {};

const DiagramCanvas = ({
    nodos, aristas, colores, soloLectura = false,
    onElegirNodo, onElegirArista, onLimpiarSeleccion,
    onConectar, onDobleClicLienzo, onIntentarMover,
}) => {
    const { fitView } = useReactFlow();

    const opcionesDeArista = useMemo(() => ({
        type: 'smoothstep',
        style: { stroke: colores.arista, strokeWidth: 1.6 },
    }), [colores.arista]);

    return (
        <div
            className="dgm-canvas"
            onDoubleClick={(e) => {
                // Sólo cuando el doble clic cae en el vacío: sobre una caja es el
                // gesto de renombrar, y sobre el fondo el de crear.
                if (e.target.classList?.contains('react-flow__pane')) onDobleClicLienzo?.();
            }}
        >
            <ReactFlow
                nodes={nodos}
                edges={aristas}
                nodeTypes={tiposDeNodo}
                defaultEdgeOptions={opcionesDeArista}
                onNodesChange={nada}
                onEdgesChange={nada}
                onNodeClick={(_, n) => n.type === 'caja' && onElegirNodo?.(n.id)}
                onEdgeClick={(_, a) => onElegirArista?.(a.data?.indice)}
                onPaneClick={() => onLimpiarSeleccion?.()}
                onConnect={onConectar}
                onNodeDragStart={onIntentarMover}
                nodesDraggable={!soloLectura}
                nodesConnectable={!soloLectura}
                elementsSelectable
                // El borrado lo lleva el editor: React Flow lo aplicaría a su
                // copia, y aquí lo que se toca es el grafo.
                deleteKeyCode={null}
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
