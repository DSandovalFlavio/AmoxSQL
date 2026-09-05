/**
 * ChainNodePalette — Draggable panel of node types grouped by category.
 * Users drag nodes from this palette onto the canvas to create new nodes.
 * Each item has a "?" button that opens the node's documentation in a popover —
 * an explicit action, so it never conflicts with the drag gesture.
 */
import { useState, useMemo } from 'react';
import { LuCircleHelp, LuX, LuSearch } from 'react-icons/lu';
import { NODE_TYPES, NODE_CATEGORIES } from './chainNodeTypes';
import NodeDocView from './NodeDocView';

const ChainNodePalette = ({ collapsed, onToggle }) => {
    const [docsFor, setDocsFor] = useState(null);
    const [query, setQuery] = useState('');

    const onDragStart = (event, nodeType) => {
        event.dataTransfer.setData('application/chain-node-type', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const openDocs = (event, nodeType) => {
        event.stopPropagation();
        event.preventDefault();
        setDocsFor(nodeType);
    };

    // Fase 4 — 34 node types across 9 categories is a lot to scan by eye;
    // filtering by label/description lets you type "pivot" instead of hunting.
    const filteredCategories = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return NODE_CATEGORIES;
        return NODE_CATEGORIES
            .map(category => ({
                ...category,
                types: category.types.filter(typeId => {
                    const nt = NODE_TYPES[typeId];
                    return nt && (nt.label.toLowerCase().includes(q) || (nt.description || '').toLowerCase().includes(q));
                }),
            }))
            .filter(category => category.types.length > 0);
    }, [query]);

    return (
        <div className={`chain-palette ${collapsed ? 'chain-palette-collapsed' : ''}`}>
            <div className="chain-palette-header" onClick={onToggle}>
                <span className="chain-palette-title">Nodes</span>
                <span className="chain-palette-toggle">{collapsed ? '›' : '‹'}</span>
            </div>

            {!collapsed && (
                <>
                <div className="chain-palette-search">
                    <LuSearch size={12} />
                    <input
                        type="text"
                        placeholder="Search nodes…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
                <div className="chain-palette-list">
                    {filteredCategories.length === 0 && (
                        <div className="chain-palette-empty">No node types match "{query}"</div>
                    )}
                    {filteredCategories.map(category => (
                        <div key={category.id} className="chain-palette-category">
                            <div className="chain-palette-category-label">{category.label}</div>
                            {category.types.map(typeId => {
                                const nodeType = NODE_TYPES[typeId];
                                if (!nodeType) return null;
                                const Icon = nodeType.icon;
                                return (
                                    <div
                                        key={nodeType.id}
                                        className="chain-palette-item"
                                        draggable
                                        onDragStart={(e) => onDragStart(e, nodeType.id)}
                                        title={nodeType.description}
                                    >
                                        <div
                                            className="chain-palette-item-icon"
                                            style={{ backgroundColor: nodeType.color.bg, borderColor: nodeType.color.border }}
                                        >
                                            <Icon size={14} style={{ color: nodeType.color.accent }} />
                                        </div>
                                        <div className="chain-palette-item-info">
                                            <span className="chain-palette-item-label">{nodeType.label}</span>
                                        </div>
                                        <button
                                            className="chain-palette-item-help"
                                            onClick={(e) => openDocs(e, nodeType.id)}
                                            onMouseDown={(e) => e.stopPropagation()}
                                            draggable={false}
                                            title={`What does ${nodeType.label} do?`}
                                            aria-label={`Documentation for ${nodeType.label}`}
                                        >
                                            <LuCircleHelp size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
                </>
            )}

            {docsFor && (
                <div className="chain-doc-modal-backdrop" onClick={() => setDocsFor(null)}>
                    <div className="chain-doc-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="chain-doc-modal-close" onClick={() => setDocsFor(null)} aria-label="Close">
                            <LuX size={15} />
                        </button>
                        <NodeDocView typeId={docsFor} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChainNodePalette;
