/**
 * Chain utility functions
 * - Topological sort
 * - Cycle detection
 * - Subgraph computation
 * - Auto-layout
 * - YAML conversion
 */
import yaml from 'js-yaml';

/**
 * Detect cycles in the DAG using DFS.
 * Returns true if a cycle is found.
 */
export function hasCycle(nodes, edges) {
    const adjacency = new Map();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const e of edges) {
        if (adjacency.has(e.source)) adjacency.get(e.source).push(e.target);
    }

    const visited = new Set();
    const stack = new Set();

    function dfs(nodeId) {
        if (stack.has(nodeId)) return true;
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);
        stack.add(nodeId);
        for (const neighbor of (adjacency.get(nodeId) || [])) {
            if (dfs(neighbor)) return true;
        }
        stack.delete(nodeId);
        return false;
    }

    for (const n of nodes) {
        if (dfs(n.id)) return true;
    }
    return false;
}

/**
 * Compute auto-layout positions for nodes using topological layering.
 * Returns a Map of nodeId -> { x, y }
 */
export function computeAutoLayout(nodes, edges) {
    const NODE_W = 220;
    const NODE_H = 80;
    const GAP_X = 100;
    const GAP_Y = 40;

    const nodeIds = new Set(nodes.map(n => n.id));
    const inDegree = new Map();
    const adjacency = new Map();

    for (const id of nodeIds) {
        inDegree.set(id, 0);
        adjacency.set(id, []);
    }
    for (const e of edges) {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
            adjacency.get(e.source).push(e.target);
            inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        }
    }

    // BFS layer assignment
    const layers = [];
    let queue = [...nodeIds].filter(id => inDegree.get(id) === 0);

    while (queue.length > 0) {
        layers.push([...queue]);
        const next = [];
        for (const id of queue) {
            for (const n of adjacency.get(id)) {
                inDegree.set(n, inDegree.get(n) - 1);
                if (inDegree.get(n) === 0) next.push(n);
            }
        }
        queue = next;
    }

    const positions = new Map();
    for (let col = 0; col < layers.length; col++) {
        const layerNodes = layers[col];
        const totalHeight = layerNodes.length * NODE_H + (layerNodes.length - 1) * GAP_Y;
        const startY = -(totalHeight / 2);

        for (let row = 0; row < layerNodes.length; row++) {
            positions.set(layerNodes[row], {
                x: 100 + col * (NODE_W + GAP_X),
                y: 100 + startY + row * (NODE_H + GAP_Y),
            });
        }
    }

    return positions;
}

/**
 * Where a single new node should land relative to the node it's connecting
 * from — directly to its right, nudged down past any existing node it would
 * otherwise overlap (Fase 4 — "layout incremental": adding one node repositions
 * only that node, unlike computeAutoLayout above which reflows everything).
 */
export function computeIncrementalPosition(sourceNode, allNodes) {
    const NODE_W = 220;
    const NODE_H = 90;
    const GAP_X = 100;
    const GAP_Y = 30;

    const x = sourceNode.position.x + NODE_W + GAP_X;
    let y = sourceNode.position.y;
    const collides = (testY) => allNodes.some(n =>
        Math.abs(n.position.x - x) < NODE_W * 0.6 && Math.abs(n.position.y - testY) < NODE_H * 0.6
    );
    let guard = 0;
    while (collides(y) && guard < 30) {
        y += NODE_H + GAP_Y;
        guard++;
    }
    return { x, y };
}

/**
 * Generate an empty .sqlchain template
 */
export function createEmptyChain(name = 'New Chain') {
    return {
        version: '1.0',
        name,
        description: '',
        nodes: [],
        edges: [],
        variables: {},
    };
}

/**
 * Convert chain definition to YAML (without positions)
 */
export function chainToYaml(chainDef) {
    const { version, name, description, nodes, edges, variables } = chainDef;
    const yamlObj = {
        version,
        name,
        description: description || undefined,
        nodes: nodes.map(n => ({
            id: n.id,
            type: n.type,
            label: n.label,
            description: n.description || undefined,
            config: n.config,
        })),
        edges: edges.map(e => ({
            source: e.source,
            target: e.target,
        })),
        variables: Object.keys(variables || {}).length > 0 ? variables : undefined,
    };

    return yaml.dump(yamlObj, { indent: 2, lineWidth: 120, noRefs: true });
}

/**
 * Parse YAML into a chain definition (with auto-layout for positions)
 */
export function yamlToChain(yamlStr) {
    const parsed = yaml.load(yamlStr);
    if (!parsed || !parsed.nodes) throw new Error('Invalid chain YAML: missing nodes');

    const nodes = (parsed.nodes || []).map(n => ({
        id: n.id || `node_${crypto.randomUUID().slice(0, 8)}`,
        type: n.type,
        label: n.label || n.type,
        description: n.description || '',
        position: { x: 0, y: 0 },
        config: n.config || {},
    }));

    const edges = (parsed.edges || []).map((e, i) => ({
        id: `edge_${i}`,
        source: e.source,
        target: e.target,
    }));

    // Auto-layout
    const positions = computeAutoLayout(nodes, edges);
    for (const node of nodes) {
        const pos = positions.get(node.id);
        if (pos) node.position = pos;
    }

    return {
        version: parsed.version || '1.0',
        name: parsed.name || 'Imported Chain',
        description: parsed.description || '',
        nodes,
        edges,
        variables: parsed.variables || {},
    };
}

/**
 * Resolve a CSS custom property to a concrete color at runtime.
 *
 * React Flow paints edges, the minimap and the background grid as SVG and does
 * not resolve `var(--token)` strings inside those props. Read the computed value
 * off the document root so the color reacts to the active theme. Falls back to a
 * mid-lightness color that reads acceptably in both light and dark modes.
 */
export function resolveThemeColor(token, fallback = 'oklch(0.5 0.02 250)') {
    if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
    try {
        const value = getComputedStyle(document.documentElement)
            .getPropertyValue(token)
            .trim();
        return value || fallback;
    } catch {
        return fallback;
    }
}

/**
 * Generate a unique node ID
 */
export function generateNodeId() {
    return `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generate a unique edge ID
 */
export function generateEdgeId() {
    return `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
