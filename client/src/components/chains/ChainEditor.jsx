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
import { LuCheck, LuX, LuPause, LuInfo } from 'react-icons/lu';
import { useToast } from '../ToastProvider';
import { useDialog } from '../dialogs/DialogProvider';
import ChainCanvas from './ChainCanvas';
import ChainToolbar from './ChainToolbar';
import ChainNodePalette from './ChainNodePalette';
import ChainNodeConfigPanel from './ChainNodeConfigPanel';
import ChainHistoryPanel from './ChainHistoryPanel';
import ChainVariablesPanel from './ChainVariablesPanel';
import ChainAiPrompt from './ChainAiPrompt';
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
import { DataFlowGuide } from './DataFlowGuide';
import { openTour, hasSeenTour } from '../onboarding/tourRegistry';

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
    const [showVariables, setShowVariables] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [showTemplateGallery, setShowTemplateGallery] = useState(() => initialNodes.length === 0);
    const [showGuide, setShowGuide] = useState(false);
    const isDraggingRef = useRef(false);

    // Execution hook
    const execution = useChainExecution();

    // First-run Data Flow tour. Rendering + replay are owned by the global
    // OnboardingHost via the tour registry.
    useEffect(() => {
        if (!hasSeenTour('dataflow')) openTour('dataflow');
    }, []);

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
        const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!reactFlowBounds) return;

        const position = {
            x: event.clientX - reactFlowBounds.left - 100,
            y: event.clientY - reactFlowBounds.top - 40,
        };

        const addNode = (nodeType, overrides = {}) => {
            const typeDef = NODE_TYPES[nodeType];
            if (!typeDef) return;
            const newNode = {
                id: generateNodeId(),
                type: nodeType,
                position,
                data: {
                    label: overrides.label || typeDef.label,
                    description: '',
                    nodeType,
                    config: { ...typeDef.defaultConfig, ...(overrides.config || {}) },
                },
            };
            setNodes((nds) => [...nds, newNode]);
            setSelectedNode(newNode);
        };

        // 1) Node dragged from the palette.
        const nodeType = event.dataTransfer.getData('application/chain-node-type');
        if (nodeType && NODE_TYPES[nodeType]) { addNode(nodeType); return; }

        // 2) Table / file / folder dragged from the Database or File Explorer
        //    (reuses the existing 'application/json' drag contract).
        const json = event.dataTransfer.getData('application/json');
        if (!json) return;
        let payload;
        try { payload = JSON.parse(json); } catch { return; }
        if (!payload) return;

        if (payload.type === 'table' && payload.name) {
            addNode('table_ref', { label: payload.name, config: { tableName: payload.name } });
        } else if (payload.type === 'folder' && payload.path) {
            const base = (payload.name || 'imported_data').replace(/\.[^.]+$/, '');
            addNode('import_folder', { label: payload.name || 'Import Folder', config: { folderPath: payload.path, tableName: base } });
        } else if (payload.type === 'file' && payload.path) {
            const extMatch = payload.path.match(/\.([^.\\/]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : '';
            const base = (payload.name || payload.path.split(/[\\/]/).pop() || 'imported_data').replace(/\.[^.]+$/, '');
            if (ext === 'sql') {
                addNode('sql_file', { label: payload.name || base, config: { filePath: payload.path } });
            } else {
                const FT = { csv: 'csv', tsv: 'tsv', parquet: 'parquet', json: 'json', jsonl: 'json', xlsx: 'xlsx', xls: 'xlsx' };
                addNode('import_file', { label: base, config: { sourcePath: payload.path, fileType: FT[ext] || 'csv', tableName: base } });
            }
        }
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

    // --- Compile to runnable SQL ---
    const handleExportSql = useCallback(async () => {
        try {
            const chainDef = serialize();
            const res = await fetch(`${API_BASE}/api/chains/export-sql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chainDefinition: chainDef, chainFile: filePath, variables: chainDef.variables }),
            });
            const data = await res.json();
            if (data.error) { toast.error(`Compile failed: ${data.error}`); return; }
            const blob = new Blob([data.sql], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${chainMeta.name.replace(/\s+/g, '_').toLowerCase()}.sql`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Chain compiled to SQL');
        } catch (err) {
            toast.error(`Compile failed: ${err.message}`);
        }
    }, [serialize, filePath, chainMeta.name, toast]);

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

    // --- AI: generate pipeline from a natural-language prompt (embedded canvas) ---
    const applyGeneratedChain = useCallback((chain) => {
        const layoutInput = chain.nodes.map(n => ({ id: n.id, position: { x: 0, y: 0 } }));
        let positions = new Map();
        try { positions = computeAutoLayout(layoutInput, chain.edges || []); } catch { /* fallback below */ }
        const newNodes = chain.nodes.map((n, i) => ({
            id: n.id,
            type: n.type,
            position: positions.get(n.id) || { x: 120 + (i % 4) * 240, y: 80 + Math.floor(i / 4) * 160 },
            data: { label: n.label || n.type, description: '', nodeType: n.type, config: n.config || {} },
        }));
        const newEdges = (chain.edges || []).map((e, i) => ({
            id: e.id || `ai-edge-${i}`,
            source: e.source,
            target: e.target,
            type: 'smoothstep',
            style: { stroke: 'oklch(0.5 0.02 250)', strokeWidth: 2 },
        }));
        setNodes(newNodes);
        setEdges(newEdges);
        setChainMeta(m => ({
            ...m,
            name: chain.name || m.name,
            variables: { ...m.variables, ...(chain.variables || {}) },
        }));
        setShowTemplateGallery(false);
        setSelectedNode(null);
    }, []);

    const handleAiGenerate = useCallback(async (prompt) => {
        setAiLoading(true);
        try {
            // When the canvas already has nodes, send the current chain so the AI EXTENDS/edits it.
            const extend = nodes.length > 0;
            const res = await fetch(`${API_BASE}/api/chains/ai/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, chainDefinition: extend ? serialize() : null }),
            });
            const data = await res.json();
            if (data.error) { toast.error(`AI: ${data.error}`); return; }
            const chain = data.chain;
            if (!chain?.nodes?.length) { toast.error('AI returned an empty pipeline'); return; }
            // Preview before applying: show the proposed flow and confirm.
            const flow = chain.nodes.map(n => n.label || n.type).join('  →  ');
            const ok = await dialog.confirmAsync({
                title: extend ? 'Apply AI changes' : 'Generated pipeline',
                message: `${chain.nodes.length} nodes:\n${flow}\n\n${extend ? 'This replaces the current chain on the canvas. ' : ''}Apply?`,
                confirmLabel: 'Apply',
            });
            if (!ok) return;
            applyGeneratedChain(chain);
            toast.success(`Pipeline applied — ${chain.nodes.length} nodes`);
        } catch (err) {
            toast.error(`AI generation failed: ${err.message}`);
        } finally {
            setAiLoading(false);
        }
    }, [nodes.length, serialize, dialog, toast, applyGeneratedChain]);

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
                onExportSql={handleExportSql}
                onImportYaml={handleImportYaml}
                onAutoLayout={handleAutoLayout}
                onToggleVariables={() => setShowVariables(true)}
                onToggleHistory={() => setHistoryOpen(!historyOpen)}
                onToggleLogs={() => setLogCollapsed(v => !v)}
                onShowGuide={() => setShowGuide(true)}
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

                <ChainAiPrompt
                    onGenerate={handleAiGenerate}
                    loading={aiLoading}
                    hasNodes={nodes.length > 0}
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
                        chainFile={filePath}
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

                {showVariables && (
                    <ChainVariablesPanel
                        variables={chainMeta.variables}
                        onChange={(vars) => setChainMeta(m => ({ ...m, variables: vars }))}
                        onClose={() => setShowVariables(false)}
                    />
                )}
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
                    {execution.runStatus === 'completed' && <><LuCheck size={13} /> Chain completed</>}
                    {execution.runStatus === 'failed' && <><LuX size={13} /> Chain failed — check logs</>}
                    {execution.runStatus === 'paused' && <><LuPause size={13} /> Paused at checkpoint</>}
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

            {/* "What is Data Flow?" reference drawer */}
            {showGuide && (
                <div onClick={() => setShowGuide(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
                    <div onClick={e => e.stopPropagation()} style={{ position: 'relative', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', padding: '20px 22px' }}>
                        <button onClick={() => setShowGuide(false)} title="Close" style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                            <LuX size={18} />
                        </button>
                        <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <LuInfo size={16} /> Data Flow
                        </h2>
                        <DataFlowGuide />
                    </div>
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
