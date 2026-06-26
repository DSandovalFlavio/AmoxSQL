/**
 * NodeDocView — Renders a node's documentation from nodeDocs.js.
 * Shared by the config panel's "Info" tab and the palette's "?" popover so the
 * docs have a single source and a single look.
 */
import { NODE_TYPES } from './chainNodeTypes';
import { getNodeDocs } from './nodeDocs';
import { LuArrowRight, LuArrowLeft, LuLightbulb } from 'react-icons/lu';

const NodeDocView = ({ typeId, showHeader = true }) => {
    const nodeType = NODE_TYPES[typeId];
    const docs = getNodeDocs(typeId);

    if (!nodeType) return null;
    if (!docs) {
        return <div className="node-doc node-doc-empty">No documentation available for this node yet.</div>;
    }

    const Icon = nodeType.icon;

    return (
        <div className="node-doc">
            {showHeader && (
                <div className="node-doc-header">
                    <div
                        className="node-doc-icon"
                        style={{ backgroundColor: nodeType.color.bg, borderColor: nodeType.color.border }}
                    >
                        <Icon size={16} style={{ color: nodeType.color.accent }} />
                    </div>
                    <div>
                        <div className="node-doc-title">{nodeType.label}</div>
                        <div className="node-doc-summary">{docs.summary}</div>
                    </div>
                </div>
            )}

            {!showHeader && <div className="node-doc-summary node-doc-summary-lead">{docs.summary}</div>}

            {docs.whatItDoes && (
                <p className="node-doc-text">{docs.whatItDoes}</p>
            )}

            {docs.io && (
                <div className="node-doc-io">
                    <div className="node-doc-io-row">
                        <LuArrowLeft size={12} className="node-doc-io-in" />
                        <span className="node-doc-io-label">Input</span>
                        <span className="node-doc-io-val">{docs.io.in}</span>
                    </div>
                    <div className="node-doc-io-row">
                        <LuArrowRight size={12} className="node-doc-io-out" />
                        <span className="node-doc-io-label">Output</span>
                        <span className="node-doc-io-val">{docs.io.out}</span>
                    </div>
                </div>
            )}

            {docs.options?.length > 0 && (
                <div className="node-doc-section">
                    <div className="node-doc-section-title">Options</div>
                    <dl className="node-doc-options">
                        {docs.options.map((o, i) => (
                            <div key={i} className="node-doc-option">
                                <dt>{o.name}</dt>
                                <dd>{o.desc}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}

            {docs.examples?.length > 0 && (
                <div className="node-doc-section">
                    <div className="node-doc-section-title">Examples</div>
                    <ul className="node-doc-list">
                        {docs.examples.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                </div>
            )}

            {docs.tips?.length > 0 && (
                <div className="node-doc-section">
                    <div className="node-doc-section-title">Tips</div>
                    <ul className="node-doc-list node-doc-tips">
                        {docs.tips.map((t, i) => (
                            <li key={i}><LuLightbulb size={11} className="node-doc-tip-icon" />{t}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default NodeDocView;
