/**
 * ChainNodeConfigPopover — anchors ChainNodeConfigPanel's fields to the
 * selected node instead of a fixed drawer (Fase 3 of
 * docs/dev/auditoria_dataflow_ux.md). Opens below the node, flips above if
 * it doesn't fit, and tracks the node across pan/zoom/drag.
 *
 * Position comes straight from the node's own DOM rect rather than doing
 * flow-to-screen coordinate math — react-flow already keeps that element's
 * layout in sync with pan/zoom/drag every frame, so reading it here is both
 * simpler and never out of sync. useViewport() is only called to force this
 * component to re-render on pan/zoom (its value isn't otherwise used) since
 * a DOM read during render doesn't subscribe to anything on its own.
 */
import { useState } from 'react';
import { useViewport } from '@xyflow/react';
import { LuX, LuMaximize2, LuMinimize2 } from 'react-icons/lu';
import ChainNodeConfigPanel from './ChainNodeConfigPanel';
import { NODE_TYPES } from './chainNodeTypes';

const ChainNodeConfigPopover = ({ node, onUpdate, onCreateSqlFile, onOpenFile, sqlFiles, chainDefinition, chainFile, onClose }) => {
    useViewport();
    const [expanded, setExpanded] = useState(false);

    if (!node) return null;
    const el = document.querySelector(`.react-flow__node[data-id="${window.CSS?.escape ? CSS.escape(node.id) : node.id}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();

    const width = expanded ? 440 : 300;
    const maxHeight = Math.min(expanded ? 620 : 440, window.innerHeight - 32);

    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < maxHeight + 16 && rect.top > maxHeight + 16;
    const top = openAbove ? Math.max(8, rect.top - maxHeight - 10) : rect.bottom + 10;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const arrowLeft = Math.min(Math.max(14, rect.left + rect.width / 2 - left - 5), width - 20);

    const nodeType = NODE_TYPES[node.data.nodeType] || NODE_TYPES.sql_file;
    const Icon = nodeType.icon;

    return (
        <div
            className="chain-config-popover"
            style={{ left, top, width, maxHeight }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            <div
                className={`chain-config-popover-arrow ${openAbove ? 'chain-config-popover-arrow-below' : 'chain-config-popover-arrow-above'}`}
                style={{ left: arrowLeft }}
            />
            <div className="chain-config-header">
                <div className="chain-config-header-left">
                    <Icon size={14} style={{ color: nodeType.color.accent }} />
                    <span>{nodeType.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                    <button className="chain-config-close" onClick={() => setExpanded(v => !v)} title={expanded ? 'Compact view' : 'Expand — more room for this node’s fields'}>
                        {expanded ? <LuMinimize2 size={13} /> : <LuMaximize2 size={13} />}
                    </button>
                    <button className="chain-config-close" onClick={onClose} title="Close">
                        <LuX size={14} />
                    </button>
                </div>
            </div>
            <div className="chain-config-popover-scroll">
                <ChainNodeConfigPanel
                    node={node}
                    onUpdate={onUpdate}
                    onCreateSqlFile={onCreateSqlFile}
                    onOpenFile={onOpenFile}
                    sqlFiles={sqlFiles}
                    chainDefinition={chainDefinition}
                    chainFile={chainFile}
                />
            </div>
        </div>
    );
};

export default ChainNodeConfigPopover;
