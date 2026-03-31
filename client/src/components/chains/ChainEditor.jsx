/**
 * ChainEditor — Main container for the execution chain DAG builder.
 * Manages React Flow state, node CRUD, serialization, and execution.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    addEdge,
} from '@xyflow/react';
import { useToast } from '../ToastProvider';
import ChainCanvas from './ChainCanvas';
import ChainToolbar from './ChainToolbar';
import ChainNodePalette from './ChainNodePalette';
import ChainNodeConfigPanel from './ChainNodeConfigPanel';
import ChainHistoryPanel from './ChainHistoryPanel';
import { NODE_TYPES } from './chainNodeTypes';
import {
    hasCycle,
    computeAutoLayout,
    createEmptyChain,
    chainToYaml,
    yamlToChain,
    generateNodeId,
    generateEdgeId,
} from './chainUtils';
import { useChainExecution } from './useChainExecution';

const API_BASE = 'http://localhost:3001';

const ChainEditorInner = ({ content, onChange, filePath, onOpenFile }) => {
    const toast = useToast();
    const reactFlowWrapper = useRef(null);

    // Parse initial chain definition from file content
    const initialChain = useMemo(() => {
        try {
            if (!content) return createEmptyChain();
            const parsed = JSON.parse(content);
            return parsed;
        } catch {
            return createEmptyChain();
        }
    }, []);

    // React Flow state
    const initialNodes = useMemo(() =>
        (initialChain.nodes || []).map(n => ({
            id: n.id,
            type: n.type,
            position: n.position || { x: 0, y: 0 },
            data: {
                label: n.label || '',
                description: n.description || '',
                nodeType: n.type,
                config: n.config || {},
            },
        })), [initialChain]);

    const initialEdges = useMemo(() =>
        (initialChain.edges || []).map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'smoothstep',
            style: { stroke: 'oklch(0.5 0.02 250)', strokeWidth: 2 },
        })), [initialChain]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [chainMeta, setChainMeta] = useState({
        name: initialChain.name || 'New Chain',
        description: initialChain.description || '',
        variables: initialChain.variables || {},
    });

    const [selectedNode, setSelectedNode] = useState(null);
    const [paletteCollapsed, setPaletteCollapsed] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [sqlFiles, setSqlFiles] = useState([]);

    // Execution hook
    const execution = useChainExecution();

    // Load SQL files from project
    useEffect(() => {
        fetch(`${API_BASE}/api/files/list?path=&recursive=true`)
            .then(res => res.json())
            .then(data => {
                const files = (data.files || data || [])
                    .filter(f => typeof f === 'string' ? f.endsWith('.sql') : f.name?.endsWith('.sql'))
                    .map(f => typeof f === 'string' ? f : f.path || f.name);
                setSqlFiles(files);
            })
            .catch(() => {});
    }, []);

    // Serialize chain to JSON and notify parent
    const serialize = useCallback(() => {
        const chainDef = {
            version: '1.0',
            name: chainMeta.name,
            description: chainMeta.description,
            nodes: nodes.map(n => ({
                id: n.id,
                type: n.data.nodeType,
                label: n.data.label,
                description: n.data.description,
                position: n.position,
                config: n.data.config || {},
            })),
            edges: edges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
            })),
            variables: chainMeta.variables,
        };
        return chainDef;
    }, [nodes, edges, chainMeta]);

    // Auto-save on changes
    useEffect(() => {
        const chainDef = serialize();
        const json = JSON.stringify(chainDef, null, 2);
        onChange?.(json);
        setIsDirty(true);
    }, [nodes, edges, chainMeta]);

    // --- Connection handling ---
    const onConnect = useCallback((params) => {
        const newEdge = {
            ...params,
            id: generateEdgeId(),
            type: 'smoothstep',
            style: { stroke: 'oklch(0.5 0.02 250)', strokeWidth: 2 },
        };

        // Check for cycles before adding
        const tempEdges = [...edges, { id: newEdge.id, source: newEdge.source, target: newEdge.target }];
        if (hasCycle(nodes, tempEdges)) {
            toast.error('Cannot connect: this would create a cycle');
            return;
        }

        setEdges((eds) => addEdge(newEdge, eds));
    }, [nodes, edges, toast]);

    // --- Node selection ---
    const onNodeClick = useCallback((event, node) => {
        setSelectedNode(node);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    // --- Drag and drop from palette ---
    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback((event) => {
        event.preventDefault();
        const nodeType = event.dataTransfer.getData('application/chain-node-type');
        if (!nodeType || !NODE_TYPES[nodeType]) return;

        const typeDef = NODE_TYPES[nodeType];
        const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!reactFlowBounds) return;

        const position = {
            x: event.clientX - reactFlowBounds.left - 100,
            y: event.clientY - reactFlowBounds.top - 40,
        };

        const newNode = {
            id: generateNodeId(),
            type: nodeType,
            position,
            data: {
                label: typeDef.label,
                description: '',
                nodeType: nodeType,
                config: { ...typeDef.defaultConfig },
            },
        };

        setNodes((nds) => [...nds, newNode]);
        setSelectedNode(newNode);
    }, []);

    // --- Node update ---
    const updateNode = useCallback((nodeId, updates) => {
        setNodes((nds) =>
            nds.map((n) => {
                if (n.id !== nodeId) return n;
                const newData = { ...n.data };
                if (updates.label !== undefined) newData.label = updates.label;
                if (updates.description !== undefined) newData.description = updates.description;
                if (updates.config !== undefined) newData.config = updates.config;
                return { ...n, data: newData };
            })
        );
        // Update selectedNode reference
        setSelectedNode(prev => {
            if (!prev || prev.id !== nodeId) return prev;
            const newData = { ...prev.data };
            if (updates.label !== undefined) newData.label = updates.label;
            if (updates.description !== undefined) newData.description = updates.description;
            if (updates.config !== undefined) newData.config = updates.config;
            return { ...prev, data: newData };
        });
    }, []);

    // --- Node delete ---
    const deleteNode = useCallback((nodeId) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNode(null);
    }, []);

    // --- Execution ---
    const handleRun = useCallback(async () => {
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath);
        if (result?.error) {
            toast.error(`Chain failed: ${result.error}`);
        }
    }, [serialize, filePath, execution, toast]);

    const handleRunFromNode = useCallback(async (nodeId) => {
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath, { mode: 'from_node', startNodeId: nodeId });
        if (result?.error) toast.error(`Chain failed: ${result.error}`);
    }, [serialize, filePath, execution, toast]);

    const handleRunToNode = useCallback(async (nodeId) => {
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath, { mode: 'to_node', startNodeId: nodeId });
        if (result?.error) toast.error(`Chain failed: ${result.error}`);
    }, [serialize, filePath, execution, toast]);

    // --- YAML export/import ---
    const handleExportYaml = useCallback(() => {
        try {
            const chainDef = serialize();
            const yamlStr = chainToYaml(chainDef);
            const blob = new Blob([yamlStr], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${chainMeta.name.replace(/\s+/g, '_').toLowerCase()}.yaml`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Chain exported as YAML');
        } catch (err) {
            toast.error(`Export failed: ${err.message}`);
        }
    }, [serialize, chainMeta.name, toast]);

    const handleImportYaml = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.yaml,.yml';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const yamlStr = await file.text();
                const chain = yamlToChain(yamlStr);

                setChainMeta({ name: chain.name, description: chain.description, variables: chain.variables });
                setNodes(chain.nodes.map(n => ({
                    id: n.id,
                    type: n.type,
                    position: n.position,
                    data: {
                        label: n.label,
                        description: n.description,
                        nodeType: n.type,
                        config: n.config,
                    },
                })));
                setEdges(chain.edges.map(e => ({
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    type: 'smoothstep',
                    style: { stroke: 'oklch(0.5 0.02 250)', strokeWidth: 2 },
                })));

                toast.success('Chain imported from YAML');
            } catch (err) {
                toast.error(`Import failed: ${err.message}`);
            }
        };
        input.click();
    }, [toast]);

    // --- Auto-layout ---
    const handleAutoLayout = useCallback(() => {
        const positions = computeAutoLayout(nodes, edges);
        setNodes((nds) =>
            nds.map((n) => {
                const pos = positions.get(n.id);
                return pos ? { ...n, position: pos } : n;
            })
        );
        toast.info('Layout reorganized');
    }, [nodes, edges, toast]);

    // --- Create SQL file from canvas ---
    const handleCreateSqlFile = useCallback(async () => {
        const name = prompt('SQL file name (e.g., transform.sql):');
        if (!name) return;
        const fileName = name.endsWith('.sql') ? name : `${name}.sql`;

        try {
            const res = await fetch(`${API_BASE}/api/chains/create-sql-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: fileName }),
            });
            const data = await res.json();
            if (res.ok) {
                setSqlFiles(prev => [...prev, fileName]);
                // Update selected node config if it's a sql_file node
                if (selectedNode && selectedNode.data.nodeType === 'sql_file') {
                    updateNode(selectedNode.id, { config: { ...selectedNode.data.config, filePath: fileName } });
                }
                // Open the new file in the editor
                onOpenFile?.(data.path || fileName);
                toast.success(`Created ${fileName}`);
            } else {
                toast.error(data.error || 'Failed to create file');
            }
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        }
    }, [selectedNode, updateNode, onOpenFile, toast]);

    // Open SQL file in editor
    const handleOpenFile = useCallback((filePath) => {
        onOpenFile?.(filePath);
    }, [onOpenFile]);

    return (
        <div className="chain-editor" ref={reactFlowWrapper}>
            <ChainToolbar
                chainName={chainMeta.name}
                isRunning={execution.isRunning}
                runStatus={execution.runStatus}
                onRun={handleRun}
                onRunFromNode={handleRunFromNode}
                onRunToNode={handleRunToNode}
                onCancel={execution.cancelRun}
                onExportYaml={handleExportYaml}
                onImportYaml={handleImportYaml}
                onAutoLayout={handleAutoLayout}
                onToggleHistory={() => setHistoryOpen(!historyOpen)}
                onClearStatus={execution.clearStatus}
                selectedNodeId={selectedNode?.id}
                isDirty={isDirty}
            />

            <div className="chain-editor-body">
                <ChainNodePalette
                    collapsed={paletteCollapsed}
                    onToggle={() => setPaletteCollapsed(!paletteCollapsed)}
                />

                <ChainCanvas
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    nodeStatuses={execution.nodeStatuses}
                />

                {selectedNode && (
                    <ChainNodeConfigPanel
                        node={selectedNode}
                        onUpdate={updateNode}
                        onDelete={deleteNode}
                        onClose={() => setSelectedNode(null)}
                        onCreateSqlFile={handleCreateSqlFile}
                        onOpenFile={handleOpenFile}
                        sqlFiles={sqlFiles}
                    />
                )}

                <ChainHistoryPanel
                    chainFile={filePath}
                    isOpen={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                    onResumeRun={(run) => {
                        const chainDef = serialize();
                        execution.startRun(chainDef, filePath, { mode: 'from_node', startNodeId: run.failed_node_id || run.start_node_id });
                        setHistoryOpen(false);
                    }}
                />
            </div>

            {/* Run status bar */}
            {execution.runStatus && (
                <div className={`chain-status-bar chain-status-${execution.runStatus}`}>
                    {execution.runStatus === 'running' && 'Executing chain...'}
                    {execution.runStatus === 'completed' && 'Chain completed successfully'}
                    {execution.runStatus === 'failed' && 'Chain execution failed'}
                    {execution.runStatus === 'paused' && 'Chain paused at checkpoint'}
                    {execution.runStatus === 'cancelled' && 'Chain execution cancelled'}
                </div>
            )}
        </div>
    );
};

// Wrap with ReactFlowProvider
const ChainEditor = (props) => (
    <ReactFlowProvider>
        <ChainEditorInner {...props} />
    </ReactFlowProvider>
);

export default ChainEditor;
