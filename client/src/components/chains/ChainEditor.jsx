/**
 * ChainEditor — Main container for the execution chain DAG builder.
 * Manages React Flow state, node CRUD, serialization, and execution.
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    ReactFlowProvider,
    useNodesState,
    useEdgesState,
    useReactFlow,
    addEdge,
} from '@xyflow/react';
import { LuCheck, LuX, LuPause, LuInfo } from 'react-icons/lu';
import { useToast } from '../ToastProvider';
import { useDialog } from '../dialogs/DialogProvider';
import ChainCanvas from './ChainCanvas';
import ChainToolbar from './ChainToolbar';
import ChainNodePalette from './ChainNodePalette';
import ChainNodeConfigPopover from './ChainNodeConfigPopover';
import ChainInspector from './ChainInspector';
import NodeActionMenu from './NodeActionMenu';
import NodeTypePicker from './NodeTypePicker';
import NodeDocView from './NodeDocView';
import ChainHistoryPanel from './ChainHistoryPanel';
import ChainVariablesPanel from './ChainVariablesPanel';
import ChainAiPrompt from './ChainAiPrompt';
import { NODE_TYPES } from './chainNodeTypes';
import {
    hasCycle,
    computeAutoLayout,
    computeIncrementalPosition,
    createEmptyChain,
    chainToYaml,
    yamlToChain,
    generateNodeId,
    generateEdgeId,
    resolveThemeColor,
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
    const { screenToFlowPosition } = useReactFlow();
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
                disabled: !!n.disabled,
            },
        })), [initialChain]);

    const initialEdges = useMemo(() =>
        (initialChain.edges || []).map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'smoothstep',
            style: { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 },
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

    // Fase 1-3 (docs/dev/auditoria_dataflow_ux.md): the node carries its own
    // actions now, so the config editor is a popover anchored to whichever
    // node is being configured, not tied 1:1 to selection — and the
    // inspector stays visible for whichever node is selected OR pinned.
    const [configPopoverNodeId, setConfigPopoverNodeId] = useState(null);
    const [pinnedNodeId, setPinnedNodeId] = useState(null);
    const [inspectorTab, setInspectorTab] = useState('data');
    const [nodeMenu, setNodeMenu] = useState(null); // { nodeId, x, y }
    const [nodeDocsFor, setNodeDocsFor] = useState(null); // typeId

    // Fase 4 (docs/dev/auditoria_dataflow_ux.md): quick-add from a node's own
    // "+" handle, and one-shot undo for the full-canvas "Arrange All" layout.
    const [quickAdd, setQuickAdd] = useState(null); // { nodeId, x, y }
    const layoutUndoRef = useRef(null); // Map nodeId -> previous position, or null
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
                disabled: !!n.data.disabled,
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
            style: { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 },
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
    // Selecting a node only updates what the (always-visible) inspector shows —
    // it does NOT open the config popover. Configuring is its own explicit
    // action (the node's action bar, its "…" menu, or a double-click) so
    // clicking around the canvas to look at data never pops up a form.
    const onNodeClick = useCallback((event, node) => {
        setSelectedNode(node);
        setConfigPopoverNodeId(prev => (prev && prev !== node.id ? null : prev));
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setConfigPopoverNodeId(null);
        setNodeMenu(null);
    }, []);

    // --- Drag and drop from palette ---
    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    // Fase 4 — "insertar sobre arista": the point-to-segment distance from a
    // flow-space point to the line between two node centers, used to detect
    // whether a drop landed close enough to an edge to splice into it instead
    // of landing as a disconnected new node.
    const distToSegment = (p, a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };

    const onDrop = useCallback((event) => {
        event.preventDefault();
        const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
        if (!reactFlowBounds) return;

        // True flow-space point (accounts for pan/zoom) — needed both to place
        // the node correctly and to test proximity to existing edges below.
        const flowPoint = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const rawPosition = { x: flowPoint.x - 100, y: flowPoint.y - 40 };

        // Center-ish point of a node card, for edge-hit-testing and for the
        // "connect from the selected node" fallback below.
        const centerOf = (n) => ({ x: n.position.x + 110, y: n.position.y + 40 });

        let hitEdge = null;
        let bestDist = 44; // flow-space px — inside a node card's own footprint
        for (const e of edges) {
            const s = nodes.find(n => n.id === e.source);
            const t = nodes.find(n => n.id === e.target);
            if (!s || !t) continue;
            const d = distToSegment(flowPoint, centerOf(s), centerOf(t));
            if (d < bestDist) { bestDist = d; hitEdge = e; }
        }

        const edgeStyle = { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 };
        const connectFrom = !hitEdge ? selectedNode : null;

        const addNode = (nodeType, overrides = {}) => {
            const typeDef = NODE_TYPES[nodeType];
            if (!typeDef) return;
            const position = hitEdge ? rawPosition : (connectFrom ? computeIncrementalPosition(connectFrom, nodes) : rawPosition);
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
            if (hitEdge) {
                // Splice: the new node sits between the edge's two endpoints —
                // the old edge is replaced by two, not kept alongside them.
                setEdges((eds) => [
                    ...eds.filter(e => e.id !== hitEdge.id),
                    { id: generateEdgeId(), source: hitEdge.source, target: newNode.id, type: 'smoothstep', style: edgeStyle },
                    { id: generateEdgeId(), source: newNode.id, target: hitEdge.target, type: 'smoothstep', style: edgeStyle },
                ]);
            } else if (connectFrom) {
                setEdges((eds) => [...eds, { id: generateEdgeId(), source: connectFrom.id, target: newNode.id, type: 'smoothstep', style: edgeStyle }]);
            }
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
    }, [nodes, edges, selectedNode, screenToFlowPosition]);

    // --- Node update ---
    const applyNodeUpdates = (data, updates) => {
        const newData = { ...data };
        if (updates.label !== undefined) newData.label = updates.label;
        if (updates.description !== undefined) newData.description = updates.description;
        if (updates.config !== undefined) newData.config = updates.config;
        if (updates.disabled !== undefined) newData.disabled = updates.disabled;
        return newData;
    };

    const updateNode = useCallback((nodeId, updates) => {
        setNodes((nds) =>
            nds.map((n) => (n.id === nodeId ? { ...n, data: applyNodeUpdates(n.data, updates) } : n))
        );
        // Update selectedNode reference
        setSelectedNode(prev => (prev && prev.id === nodeId ? { ...prev, data: applyNodeUpdates(prev.data, updates) } : prev));
    }, []);

    // --- Node delete ---
    const deleteNode = useCallback((nodeId) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        setSelectedNode(null);
        setConfigPopoverNodeId(prev => (prev === nodeId ? null : prev));
        setPinnedNodeId(prev => (prev === nodeId ? null : prev));
    }, []);

    // --- Validation (recomputed on every node/edge change, skipped during drag) ---
    const validationResults = useMemo(() => validateChain(nodes, edges), [nodes, edges]);
    const errorCount = useMemo(() => countErrors(validationResults), [validationResults]);
    const warningCount = useMemo(() => countWarnings(validationResults), [validationResults]);

    // --- Stale/obsolete tracking (Fase 5 — "estado honesto") ---
    // A node's result badge (the green check, row count, "Table Created" text)
    // reflects whatever config was in effect the last time it actually ran —
    // without this, editing a filter's condition after running leaves the old
    // badge showing, which reads as "still valid" when it no longer is (H15).
    // lastRunSnapshots[nodeId] = { configStr, seq } as of the last time that
    // node's execution reached a terminal (success/failed) status: configStr
    // is its config at that moment, seq is the run-sequence number (below)
    // the run belonged to. Stamping is gated by runScopeRef — the set of node
    // ids the run in flight (or the one that just finished) actually targets
    // — rather than by "did the status value change from before". A
    // status-value transition check (e.g. only stamp on pending→success)
    // looks right but silently breaks the moment you re-run a node that was
    // ALREADY success/failed: re-running it produces the exact same status
    // value, so no transition is ever observed and the "outdated" badge
    // never clears even though the node just ran against its current
    // config. Gating by scope instead means "this node was part of the run
    // that just reported a terminal status for it" — true regardless of
    // whether the value changed.
    const [lastRunSnapshots, setLastRunSnapshots] = useState({});
    // { scope: Set<nodeId>|null, seq: number } for the run in flight / most
    // recently finished — null scope means "unscoped / full run".
    const runScopeRef = useRef({ scope: null, seq: 0 });
    const runSeqCounterRef = useRef(0);
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    useEffect(() => {
        const changes = {};
        let any = false;
        const { scope, seq } = runScopeRef.current;
        for (const [nodeId, ns] of Object.entries(execution.nodeStatuses)) {
            if (ns.status !== 'success' && ns.status !== 'failed') continue;
            if (scope && !scope.has(nodeId)) continue;
            const n = nodesRef.current.find(nd => nd.id === nodeId);
            if (!n) continue;
            const configStr = JSON.stringify(n.data.config || {});
            const prev = lastRunSnapshots[nodeId];
            if (!prev || prev.configStr !== configStr || prev.seq !== seq) {
                changes[nodeId] = { configStr, seq };
                any = true;
            }
        }
        if (any) setLastRunSnapshots(prev => ({ ...prev, ...changes }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [execution.nodeStatuses]);

    // Mirrors the server's from_node/to_node/only_node scoping so the client
    // knows which nodes a run actually targets, without waiting on the server
    // to say so — needed above to gate snapshot stamping to the run's scope.
    // Also bumps the run-sequence counter so staleNodeIds (below) can tell
    // "my parent's last completed run is newer than mine" apart from "my
    // parent's config currently disagrees with what it last ran" — the two
    // cases a rerun-in-isolation (Run only this node) can produce.
    const computeRunScope = useCallback((mode, startNodeId) => {
        runSeqCounterRef.current += 1;
        const seq = runSeqCounterRef.current;
        if (mode === 'full' || !startNodeId) return { scope: null, seq };
        if (mode === 'only_node') return { scope: new Set([startNodeId]), seq };
        const parentsMap = new Map(nodes.map(n => [n.id, []]));
        const childrenMap = new Map(nodes.map(n => [n.id, []]));
        for (const e of edges) {
            childrenMap.get(e.source)?.push(e.target);
            parentsMap.get(e.target)?.push(e.source);
        }
        const map = mode === 'to_node' ? parentsMap : childrenMap;
        const scope = new Set([startNodeId]);
        const queue = [startNodeId];
        while (queue.length) {
            const id = queue.shift();
            for (const next of (map.get(id) || [])) {
                if (!scope.has(next)) { scope.add(next); queue.push(next); }
            }
        }
        return { scope, seq };
    }, [nodes, edges]);

    // A node is stale if its own config drifted from its last-run snapshot,
    // if its direct upstream neighbor's last completed run is NEWER than its
    // own (e.g. someone used "Run only this node" on the parent alone, so the
    // parent's output moved but this node never re-ran against it, even
    // though the parent's own config now matches what it just ran with), or
    // if anything upstream of it is stale for either of those reasons.
    const staleNodeIds = useMemo(() => {
        const stale = new Set();
        for (const n of nodes) {
            const snap = lastRunSnapshots[n.id];
            if (snap !== undefined && snap.configStr !== JSON.stringify(n.data.config || {})) stale.add(n.id);
        }
        for (const e of edges) {
            const parentSnap = lastRunSnapshots[e.source];
            const childSnap = lastRunSnapshots[e.target];
            if (parentSnap && childSnap && parentSnap.seq > childSnap.seq) stale.add(e.target);
        }
        if (stale.size > 0) {
            const childrenMap = new Map(nodes.map(n => [n.id, []]));
            for (const e of edges) childrenMap.get(e.source)?.push(e.target);
            const queue = [...stale];
            while (queue.length) {
                const id = queue.shift();
                for (const childId of (childrenMap.get(id) || [])) {
                    if (!stale.has(childId)) { stale.add(childId); queue.push(childId); }
                }
            }
        }
        return stale;
    }, [nodes, edges, lastRunSnapshots]);

    // Stable ref so the nodesWithValidation memo doesn't re-fire just because the
    // action handler's own dependencies (nodes, execution, …) change identity —
    // the ref always holds the freshest closure (assigned near the bottom of this
    // component, after the handlers it calls are defined), the callback threaded
    // into node.data never does.
    const nodeActionRef = useRef(null);
    const onActionCallback = useCallback((action, id, coords) => nodeActionRef.current?.(action, id, coords), []);

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
                    onAction: onActionCallback,
                    status: execution.nodeStatuses[n.id]?.status || n.data.status,
                    resultType: execution.nodeStatuses[n.id]?.resultType || n.data.resultType,
                    resultSummary: execution.nodeStatuses[n.id]?.resultSummary || n.data.resultSummary,
                    durationMs: execution.nodeStatuses[n.id]?.durationMs || n.data.durationMs,
                    errorMessage: execution.nodeStatuses[n.id]?.errorMessage || n.data.errorMessage,
                    stale: staleNodeIds.has(n.id),
                },
            };
        });
        frozenNodesWithValidation.current = result;
        return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, validationResults, execution.nodeStatuses, onActionCallback, staleNodeIds]);

    const onNodeDragStart = useCallback(() => { isDraggingRef.current = true; }, []);
    const onNodeDragStop = useCallback(() => { isDraggingRef.current = false; }, []);

    // --- Execution ---
    const handleRun = useCallback(async () => {
        if (errorCount > 0) {
            toast.error(`Fix ${errorCount} error${errorCount > 1 ? 's' : ''} before running`);
            return;
        }
        setLogCollapsed(false);
        runScopeRef.current = computeRunScope('full', null);
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath);
        if (result?.error) {
            toast.error(`Chain failed: ${result.error}`);
        }
    }, [serialize, filePath, execution, toast, errorCount, computeRunScope]);

    const handleRunFromNode = useCallback(async (nodeId) => {
        setLogCollapsed(false);
        runScopeRef.current = computeRunScope('from_node', nodeId);
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath, { mode: 'from_node', startNodeId: nodeId });
        if (result?.error) toast.error(`Chain failed: ${result.error}`);
    }, [serialize, filePath, execution, toast, computeRunScope]);

    const handleRunToNode = useCallback(async (nodeId) => {
        setLogCollapsed(false);
        runScopeRef.current = computeRunScope('to_node', nodeId);
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath, { mode: 'to_node', startNodeId: nodeId });
        if (result?.error) toast.error(`Chain failed: ${result.error}`);
    }, [serialize, filePath, execution, toast, computeRunScope]);

    // Re-runs just this one node against whatever its parents last produced —
    // no ancestor re-executes (server-side mode: 'only_node', Fase 1).
    const handleRunOnlyNode = useCallback(async (nodeId) => {
        setLogCollapsed(false);
        runScopeRef.current = computeRunScope('only_node', nodeId);
        const chainDef = serialize();
        const result = await execution.startRun(chainDef, filePath, { mode: 'only_node', startNodeId: nodeId });
        if (result?.error) toast.error(`Chain failed: ${result.error}`);
    }, [serialize, filePath, execution, toast]);

    // --- Node-level actions (Fase 1): duplicate, disable, rename ---
    // Both handlers below read `nodes` from the outer closure rather than from
    // inside a setNodes(updater) callback — React 18 StrictMode double-invokes
    // updater functions in dev to catch impure reducers, and a side effect
    // inside one (setSelectedNode, or updateNode's own setNodes/setSelectedNode)
    // would then fire twice: duplicate ended up selecting a stale copy the
    // committed nodes array didn't actually contain, and disable would have
    // silently toggled on then back off.
    const handleDuplicateNode = useCallback((nodeId) => {
        const src = nodes.find(n => n.id === nodeId);
        if (!src) return;
        const copy = {
            id: generateNodeId(),
            type: src.type,
            position: { x: src.position.x + 40, y: src.position.y + 40 },
            data: {
                ...src.data,
                label: src.data.label ? `${src.data.label} copy` : src.data.label,
                config: JSON.parse(JSON.stringify(src.data.config || {})),
            },
        };
        setNodes((nds) => [...nds, copy]);
        setSelectedNode(copy);
    }, [nodes]);

    const handleToggleDisable = useCallback((nodeId) => {
        const src = nodes.find(n => n.id === nodeId);
        if (src) updateNode(nodeId, { disabled: !src.data.disabled });
    }, [nodes, updateNode]);

    const handleRenameNode = useCallback(async (nodeId) => {
        const current = nodes.find(n => n.id === nodeId);
        if (!current) return;
        const name = await dialog.promptAsync({
            title: 'Rename node',
            message: '',
            placeholder: current.data.label || 'Node name',
            confirmLabel: 'Rename',
        });
        if (name === null || name === undefined || !name.trim()) return;
        updateNode(nodeId, { label: name.trim() });
    }, [nodes, dialog, updateNode]);

    // --- Node action bar / "…" menu / right-click dispatch ---
    // Reassigned every render (not itself a hook) so it always closes over the
    // latest state — the STABLE identity threaded into node.data is
    // onActionCallback above, which just forwards here through the ref.
    nodeActionRef.current = (action, nodeId, coords) => {
        const target = nodes.find(n => n.id === nodeId) || null;
        switch (action) {
            case 'configure':
                setSelectedNode(target);
                setConfigPopoverNodeId(nodeId);
                break;
            case 'run-from':
                handleRunFromNode(nodeId);
                break;
            case 'run-to':
                handleRunToNode(nodeId);
                break;
            case 'view-data':
                setSelectedNode(target);
                setInspectorTab('data');
                break;
            case 'menu':
                setSelectedNode(target);
                setNodeMenu({ nodeId, x: coords?.x || 0, y: coords?.y || 0 });
                break;
            case 'quick-add':
                setSelectedNode(target);
                setQuickAdd({ nodeId, x: coords?.x || 0, y: coords?.y || 0 });
                break;
            default:
                break;
        }
    };

    // Fase 4 — "+" on a node's output handle: create the picked type, connect
    // it from that node, place it incrementally (not a full re-layout), and
    // open its config popover right away since adding-then-configuring is the
    // whole point of the gesture.
    const handleQuickAddType = useCallback((typeId) => {
        const sourceId = quickAdd?.nodeId;
        setQuickAdd(null);
        const source = nodes.find(n => n.id === sourceId);
        const typeDef = NODE_TYPES[typeId];
        if (!source || !typeDef) return;
        const newNode = {
            id: generateNodeId(),
            type: typeId,
            position: computeIncrementalPosition(source, nodes),
            data: { label: typeDef.label, description: '', nodeType: typeId, config: { ...typeDef.defaultConfig } },
        };
        setNodes((nds) => [...nds, newNode]);
        setEdges((eds) => [...eds, {
            id: generateEdgeId(), source: source.id, target: newNode.id,
            type: 'smoothstep', style: { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 },
        }]);
        setSelectedNode(newNode);
        setConfigPopoverNodeId(newNode.id);
    }, [quickAdd, nodes]);

    const handleMenuAction = useCallback((action) => {
        const nodeId = nodeMenu?.nodeId;
        if (!nodeId) return;
        switch (action) {
            case 'run-only': handleRunOnlyNode(nodeId); break;
            case 'view-sql':
                setSelectedNode(nodes.find(n => n.id === nodeId) || null);
                setInspectorTab('sql');
                break;
            case 'duplicate': handleDuplicateNode(nodeId); break;
            case 'toggle-disable': handleToggleDisable(nodeId); break;
            case 'rename': handleRenameNode(nodeId); break;
            case 'docs': {
                const n = nodes.find(n => n.id === nodeId);
                if (n) setNodeDocsFor(n.data.nodeType);
                break;
            }
            case 'delete': deleteNode(nodeId); break;
            default: break;
        }
    }, [nodeMenu, nodes, handleRunOnlyNode, handleDuplicateNode, handleToggleDisable, handleRenameNode, deleteNode]);

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

                // Importing replaces the whole canvas — confirm first if there's work
                // to lose (mirrors the AI-generate path, which also confirms).
                if (nodes.length > 0) {
                    const ok = await dialog.confirmAsync({
                        title: 'Import chain from YAML',
                        message: `This replaces the current chain on the canvas (${nodes.length} node${nodes.length === 1 ? '' : 's'}). Continue?`,
                        confirmLabel: 'Import',
                    });
                    if (!ok) return;
                }

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
                    style: { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 },
                })));

                toast.success('Chain imported from YAML');
            } catch (err) {
                toast.error(`Import failed: ${err.message}`);
            }
        };
        input.click();
    }, [toast, nodes, dialog]);

    // --- Auto-layout ---
    // Fase 4 — "Arrange All" reflows every node, which can undo a manual
    // arrangement the user cared about. Undoable: the pre-layout positions are
    // kept for one shot, offered as an action on the confirmation toast.
    const handleAutoLayout = useCallback(() => {
        const previousPositions = new Map(nodes.map(n => [n.id, n.position]));
        const positions = computeAutoLayout(nodes, edges);
        setNodes((nds) =>
            nds.map((n) => {
                const pos = positions.get(n.id);
                return pos ? { ...n, position: pos } : n;
            })
        );
        layoutUndoRef.current = previousPositions;
        toast.info('Nodes arranged', {
            action: {
                label: 'Undo',
                onClick: () => {
                    const prev = layoutUndoRef.current;
                    if (!prev) return;
                    setNodes((nds) => nds.map((n) => (prev.has(n.id) ? { ...n, position: prev.get(n.id) } : n)));
                    layoutUndoRef.current = null;
                },
            },
        });
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
            style: { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 },
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
            style: { stroke: resolveThemeColor('--border-strong'), strokeWidth: 2 },
        })));
    }, []);

    // The inspector follows the selection unless a node is pinned; the config
    // popover is independent of both (only open while explicitly configuring).
    const inspectorNodeId = pinnedNodeId || selectedNode?.id || null;
    const inspectorNode = inspectorNodeId ? (nodes.find(n => n.id === inspectorNodeId) || null) : null;
    const configPopoverNode = configPopoverNodeId ? (nodes.find(n => n.id === configPopoverNodeId) || null) : null;

    return (
        <div className="chain-editor" ref={reactFlowWrapper}>
            <ChainToolbar
                chainName={chainMeta.name}
                isRunning={execution.isRunning}
                runStatus={execution.runStatus}
                onRun={handleRun}
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

                {configPopoverNode && (
                    <ChainNodeConfigPopover
                        node={configPopoverNode}
                        onUpdate={updateNode}
                        onCreateSqlFile={handleCreateSqlFile}
                        onOpenFile={handleOpenFile}
                        sqlFiles={sqlFiles}
                        chainDefinition={serialize()}
                        chainFile={filePath}
                        onClose={() => setConfigPopoverNodeId(null)}
                    />
                )}

                {nodeMenu && (
                    <NodeActionMenu
                        x={nodeMenu.x}
                        y={nodeMenu.y}
                        disabled={!!nodes.find(n => n.id === nodeMenu.nodeId)?.data.disabled}
                        onAction={handleMenuAction}
                        onClose={() => setNodeMenu(null)}
                    />
                )}

                {quickAdd && (
                    <NodeTypePicker
                        x={quickAdd.x}
                        y={quickAdd.y}
                        onPick={handleQuickAddType}
                        onClose={() => setQuickAdd(null)}
                    />
                )}

                <ChainInspector
                    node={inspectorNode}
                    chainDefinition={serialize()}
                    chainFile={filePath}
                    logs={execution.logs}
                    pinned={!!pinnedNodeId}
                    onTogglePin={() => setPinnedNodeId(p => (p ? null : (selectedNode?.id || null)))}
                    activeTab={inspectorTab}
                    onTabChange={setInspectorTab}
                    onOpenFullPreview={setPreviewTable}
                />

                <ChainHistoryPanel
                    chainFile={filePath}
                    isOpen={historyOpen}
                    onClose={() => setHistoryOpen(false)}
                    onResumeRun={(run) => {
                        const startNodeId = run.failed_node_id || run.start_node_id;
                        runScopeRef.current = computeRunScope('from_node', startNodeId);
                        const chainDef = serialize();
                        execution.startRun(chainDef, filePath, { mode: 'from_node', startNodeId });
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
                <div onClick={() => setShowGuide(false)} style={{ position: 'fixed', inset: 0, background: 'var(--overlay-bg)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
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

            {/* Node documentation — reachable from a node's "…" menu, same view the palette's "?" uses */}
            {nodeDocsFor && (
                <div className="chain-doc-modal-backdrop" onClick={() => setNodeDocsFor(null)}>
                    <div className="chain-doc-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="chain-doc-modal-close" onClick={() => setNodeDocsFor(null)} aria-label="Close">
                            <LuX size={15} />
                        </button>
                        <NodeDocView typeId={nodeDocsFor} />
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
