/**
 * ChainCanvas — React Flow wrapper for the chain DAG builder.
 * Handles node/edge rendering, drag-and-drop from palette, connection validation.
 */
import { useCallback } from 'react';
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
import TableRefNode from './nodes/TableRefNode';
import MergeTablesNode from './nodes/MergeTablesNode';
import AssertNode from './nodes/AssertNode';
import JoinTablesNode from './nodes/JoinTablesNode';
import FilterNode from './nodes/FilterNode';
import GroupAggregateNode from './nodes/GroupAggregateNode';
import SelectColumnsNode from './nodes/SelectColumnsNode';
import DeduplicateNode from './nodes/DeduplicateNode';
import AddColumnNode from './nodes/AddColumnNode';
import SortNode from './nodes/SortNode';
import SampleNode from './nodes/SampleNode';
import PivotNode from './nodes/PivotNode';
import RenameTableNode from './nodes/RenameTableNode';
import CreateTableNode from './nodes/CreateTableNode';
import TypeCastNode from './nodes/TypeCastNode';
import WindowFunctionsNode from './nodes/WindowFunctionsNode';
import UnpivotNode from './nodes/UnpivotNode';
import HttpFetchNode from './nodes/HttpFetchNode';
import CleanNode from './nodes/CleanNode';
import DateOpsNode from './nodes/DateOpsNode';
import FlattenNode from './nodes/FlattenNode';
import BucketReadNode from './nodes/BucketReadNode';
import GSheetReadNode from './nodes/GSheetReadNode';
import AiEnrichNode from './nodes/AiEnrichNode';
import SchemaValidationNode from './nodes/SchemaValidationNode';
import NotificationNode from './nodes/NotificationNode';
import { NODE_TYPES } from './chainNodeTypes';
import { hasCycle, generateNodeId, generateEdgeId } from './chainUtils';

const nodeTypes = {
    sql_file: SqlFileNode,
    sql_inline: SqlInlineNode,
    import_file: ImportFileNode,
    import_folder: ImportFolderNode,
    export_file: ExportFileNode,
    checkpoint: CheckpointNode,
    table_ref: TableRefNode,
    merge_tables: MergeTablesNode,
    assert: AssertNode,
    join_tables: JoinTablesNode,
    filter: FilterNode,
    group_aggregate: GroupAggregateNode,
    select_columns: SelectColumnsNode,
    deduplicate: DeduplicateNode,
    add_column: AddColumnNode,
    sort: SortNode,
    sample: SampleNode,
    pivot: PivotNode,
    rename_table: RenameTableNode,
    create_table: CreateTableNode,
    type_cast: TypeCastNode,
    window_functions: WindowFunctionsNode,
    unpivot: UnpivotNode,
    http_fetch: HttpFetchNode,
    clean: CleanNode,
    date_ops: DateOpsNode,
    flatten: FlattenNode,
    bucket_read: BucketReadNode,
    gsheet_read: GSheetReadNode,
    ai_enrich: AiEnrichNode,
    schema_validation: SchemaValidationNode,
    notification: NotificationNode,
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
    onNodeDragStart,
    onNodeDragStop,
}) => {
    return (
        <div className="chain-canvas-container">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeDragStart={onNodeDragStart}
                onNodeDragStop={onNodeDragStop}
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
                        const status = node.data?.status;
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
