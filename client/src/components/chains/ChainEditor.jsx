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
import { useDialog } from '../dialogs/DialogProvider';
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
import { validateChain, countErrors, countWarnings } from './chainValidation';
import ChainLogPanel from './ChainLogPanel';
import ChainDataPreview from './ChainDataPreview';
import ChainTemplateGallery from './ChainTemplateGallery';

import { API_BASE } from '../../api.js';

const ChainEditorInner = ({ content, onChange, filePath, onOpenFile, onSave }) => {
    const toast = useToast();
    const dialog = useDialog();
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
    const [logCollapsed, setLogCollapsed] = useState(true);
    const [previewTable, setPreviewTable] = useState(null);
    const [showTemplateGallery, setShowTemplateGallery] = useState(() => initialNodes.length === 0);
    const isDraggingRef = useRef(false);

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

    // Auto-save on changes (debounced to avoid lag during drag)
    const saveTimerRef = useRef(null);
    useEffect(() => {
        setIsDirty(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const chainDef = serialize();
            const json = JSON.stringify(chainDef, null, 2);
            onChange?.(json);
        }, 300);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [nodes, edges, chainMeta]);

    // --- Manual save (Ctrl+S / Save button) ---
    const handleSave = useCallback(() => {
        // Flush any pending debounced save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const chainDef = serialize();
        const json = JSON.stringify(chainDef, null, 2);
        onChange?.(json);
        // Trigger actual file save via LayoutManager
        setTimeout(() => {
            onSave?.();
            setIsDirty(false);
        }, 50);
    }, [serialize, onChange, onSave]);

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

    // --- Validation (recomputed on every node/edge change, skipped during drag) ---
    const validationResults = useMemo(() => validateChain(nodes, edges), [nodes, edges]);
    const errorCount = useMemo(() => countErrors(validationResults), [validationResults]);
    const warningCount = useMemo(() => countWarnings(validationResults), [validationResults]);

    // Stable refs so that the nodesWithValidation memo doesn't re-fire just because
    // callbacks (setPreviewTable) have a new identity.
    const setPreviewTableRef = useRef(setPreviewTable);
    setPreviewTableRef.current = setPreviewTable;
    const onPreviewCallback = useCallback((tbl) => setPreviewTableRef.current(tbl), []);

    // Merge validation + execution status into node data.
    // We keep a frozen copy while dragging so position updates don't trigger
    // React re-renders for every mouse-move frame.
    const frozenNodesWithValidation = useRef(null);
    const nodesWithValidation = useMemo(() => {
        const result = nodes.map(n => {
            const v = validationResults[n.id];
            return {
                ...n,
                data: {
                    ...n.data,
                    validationErrors: v?.errors || [],
                    validationWarnings: v?.warnings || [],
                    onPreview: onPreviewCallback,
                    status: execution.nodeStatuses[n.id]?.status || n.data.status,
                    resultType: execution.nodeStatuses[n.id]?.resultType || n.data.resultType,
                    resultSummary: execution.nodeStatuses[n.id]?.resultSummary || n.data.resultSummary,
                    durationMs: execution.nodeStatuses[n.id]?.durationMs || n.data.durationMs,
                    errorMessage: execution.nodeStatuses[n.id]?.errorMessage || n.data.errorMessage,
                },
            };
        });
        frozenNodesWithValidation.current = result;
        return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, validationResults, execution.nodeStatuses, onPreviewCallback]);

    const onNodeDragStart = useCallback(() => { isDraggingRef.current = true; }, []);
    const onNodeDragStop = useCallback(() => { isDraggingRef.current = false; }, []);

    // --- Execution ---
    const handleRun = useCallback(async () => {
        if (errorCount > 0) {
            toast.error(`Fix ${errorCount} error${errorCount > 1 ? 's' : ''} before running`);
            return;
        }
        setLogCollapsed(false);
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath);
        if (result?.error) {
            toast.error(`Chain failed: ${result.error}`);
        }
    }, [serialize, filePath, execution, toast, errorCount]);

    const handleRunFromNode = useCallback(async (nodeId) => {
        setLogCollapsed(false);
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
        const name = await dialog.promptAsync({
            title: 'New SQL file',
            message: 'File will be created at the project root',
            placeholder: 'transform.sql',
            confirmLabel: 'Create',
        });
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
    }, [selectedNode, updateNode, onOpenFile, toast, dialog]);

    // Open SQL file in editor
    const handleOpenFile = useCallback((filePath) => {
        onOpenFile?.(filePath);
    }, [onOpenFile]);

    // Load a template definition into the canvas
    const handleSelectTemplate = useCallback((definition) => {
        setShowTemplateGallery(false);
        if (!definition) return;
        if (definition.name) setChainMeta(m => ({ ...m, name: definition.name }));
        setNodes((definition.nodes || []).map(n => ({
            id: n.id,
            type: n.data?.nodeType || n.type,
            position: n.position || { x: 0, y: 0 },
            data: {
                label: n.data?.label || n.label || '',
                description: n.data?.description || n.description || '',
                nodeType: n.data?.nodeType || n.type,
                config: n.data?.config || n.config || {},
            },
        })));
        setEdges((definition.edges || []).map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'smoothstep',
            style: { stroke: 'oklch(0.5 0.02 250)', strokeWidth: 2 },
        })));
    }, []);

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
                onSave={handleSave}
                onExportYaml={handleExportYaml}
                onImportYaml={handleImportYaml}
                onAutoLayout={handleAutoLayout}
                onToggleHistory={() => setHistoryOpen(!historyOpen)}
                onToggleLogs={() => setLogCollapsed(v => !v)}
                onClearStatus={execution.clearStatus}
                selectedNodeId={selectedNode?.id}
                isDirty={isDirty}
                errorCount={errorCount}
                warningCount={warningCount}
                progress={execution.progress}
            />

            <div className="chain-editor-body">
                <ChainNodePalette
                    collapsed={paletteCollapsed}
                    onToggle={() => setPaletteCollapsed(!paletteCollapsed)}
                />

                <ChainCanvas
                    nodes={nodesWithValidation}
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
                        chainDefinition={serialize()}
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

            {/* Log panel */}
            <ChainLogPanel
                logs={execution.logs}
                isRunning={execution.isRunning}
                onClear={execution.clearLogs}
                collapsed={logCollapsed}
                onToggleCollapse={() => setLogCollapsed(v => !v)}
            />

            {/* Data preview modal */}
            {previewTable && (
                <ChainDataPreview
                    tableName={previewTable}
                    onClose={() => setPreviewTable(null)}
                />
            )}

            {/* Template gallery — shown when opening a new empty chain */}
            {showTemplateGallery && (
                <ChainTemplateGallery
                    onSelect={handleSelectTemplate}
                    onClose={() => setShowTemplateGallery(false)}
                />
            )}

            {/* Run status bar */}
            {execution.runStatus && (
                <div className={`chain-status-bar chain-status-${execution.runStatus}`}>
                    {execution.runStatus === 'running' && (
                        <>
                            <span className="chain-status-dot chain-status-dot-running" />
                            Executing...
                            {execution.progress.total > 0 && (
                                <span className="chain-status-progress">
                                    {execution.progress.completed} / {execution.progress.total} nodes
                                    {' '}({Math.round(execution.progress.completed / execution.progress.total * 100)}%)
                                </span>
                            )}
                        </>
                    )}
                    {execution.runStatus === 'completed' && '✓ Chain completed'}
                    {execution.runStatus === 'failed' && '✗ Chain failed — check logs'}
                    {execution.runStatus === 'paused' && '⏸ Paused at checkpoint'}
                    {execution.runStatus === 'cancelled' && 'Cancelled'}
                </div>
            )}

            {/* Progress bar strip */}
            {execution.isRunning && execution.progress.total > 0 && (
                <div className="chain-progress-bar">
                    <div
                        className="chain-progress-bar-fill"
                        style={{ width: `${Math.round(execution.progress.completed / execution.progress.total * 100)}%` }}
                    />
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
