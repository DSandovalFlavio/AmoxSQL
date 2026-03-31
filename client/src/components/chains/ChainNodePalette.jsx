/**
 * ChainNodePalette — Draggable panel of node types grouped by category.
 * Users drag nodes from this palette onto the canvas to create new nodes.
 */
import { NODE_TYPES, NODE_CATEGORIES } from './chainNodeTypes';

const ChainNodePalette = ({ collapsed, onToggle }) => {
    const onDragStart = (event, nodeType) => {
        event.dataTransfer.setData('application/chain-node-type', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className={`chain-palette ${collapsed ? 'chain-palette-collapsed' : ''}`}>
            <div className="chain-palette-header" onClick={onToggle}>
                <span className="chain-palette-title">Nodes</span>
                <span className="chain-palette-toggle">{collapsed ? '›' : '‹'}</span>
            </div>

            {!collapsed && (
                <div className="chain-palette-list">
                    {NODE_CATEGORIES.map(category => (
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
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChainNodePalette;
