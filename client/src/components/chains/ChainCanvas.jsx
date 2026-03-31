/**
 * ChainCanvas — React Flow wrapper for the chain DAG builder.
 * Handles node/edge rendering, drag-and-drop from palette, connection validation.
 */
import { useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import SqlFileNode from './nodes/SqlFileNode';
import SqlInlineNode from './nodes/SqlInlineNode';
import ImportFileNode from './nodes/ImportFileNode';
import ImportFolderNode from './nodes/ImportFolderNode';
import ExportFileNode from './nodes/ExportFileNode';
import CheckpointNode from './nodes/CheckpointNode';
import { NODE_TYPES } from './chainNodeTypes';
import { hasCycle, generateNodeId, generateEdgeId } from './chainUtils';

const nodeTypes = {
    sql_file: SqlFileNode,
    sql_inline: SqlInlineNode,
    import_file: ImportFileNode,
    import_folder: ImportFolderNode,
    export_file: ExportFileNode,
    checkpoint: CheckpointNode,
};

const defaultEdgeOptions = {
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'oklch(0.5 0.02 250)', strokeWidth: 2 },
};

const ChainCanvas = ({
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeClick,
    onPaneClick,
    onDrop,
    onDragOver,
    nodeStatuses = {},
}) => {
    // Enrich nodes with execution status data (memoized)
    const enrichedNodes = useMemo(() =>
        nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                ...(nodeStatuses[node.id] || {}),
            },
        })),
    [nodes, nodeStatuses]);

    return (
        <div className="chain-canvas-container">
            <ReactFlow
                nodes={enrichedNodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                deleteKeyCode="Delete"
                multiSelectionKeyCode="Shift"
                snapToGrid
                snapGrid={[20, 20]}
                minZoom={0.2}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="oklch(0.3 0 0 / 0.3)"
                />
                <Controls
                    position="bottom-right"
                    showInteractive={false}
                    className="chain-controls"
                />
                <MiniMap
                    position="bottom-left"
                    nodeColor={(node) => {
                        const status = nodeStatuses[node.id]?.status;
                        if (status === 'success') return 'oklch(0.65 0.15 155)';
                        if (status === 'failed') return 'oklch(0.65 0.15 25)';
                        if (status === 'running') return 'oklch(0.65 0.15 250)';
                        const nt = NODE_TYPES[node.type];
                        return nt?.color?.accent || 'oklch(0.4 0 0)';
                    }}
                    maskColor="oklch(0.1 0 0 / 0.7)"
                    className="chain-minimap"
                />
            </ReactFlow>
        </div>
    );
};

export default ChainCanvas;
