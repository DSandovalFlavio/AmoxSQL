/**
 * ChainToolbar — Top toolbar for the chain editor.
 * Organized in 3 sections: identity, run controls, actions.
 */
import {
    LuPlay, LuSquare, LuHistory, LuFileDown, LuFileUp,
    LuLayoutDashboard, LuSave, LuChevronRight, LuChevronLeft,
    LuTrash2
} from 'react-icons/lu';

const ChainToolbar = ({
    chainName,
    isRunning,
    runStatus,
    onRun,
    onRunFromNode,
    onRunToNode,
    onCancel,
    onSave,
    onExportYaml,
    onImportYaml,
    onAutoLayout,
    onToggleHistory,
    onClearStatus,
    selectedNodeId,
    isDirty,
}) => {
    return (
        <div className="chain-toolbar">
            {/* Left: Chain identity + Save */}
            <div className="chain-toolbar-left">
                <span className="chain-toolbar-title">{chainName || 'Execution Chain'}</span>
                {isDirty && <span className="chain-toolbar-dirty">*</span>}
                <button
                    className={`chain-toolbar-btn chain-toolbar-btn-save ${isDirty ? 'chain-toolbar-btn-save-dirty' : ''}`}
                    onClick={onSave}
                    title="Save (Ctrl+S)"
                >
                    <LuSave size={14} />
                    <span>Save</span>
                </button>
            </div>

            {/* Center: Run controls */}
            <div className="chain-toolbar-center">
                {isRunning ? (
                    <button className="chain-toolbar-btn chain-toolbar-btn-danger" onClick={onCancel} title="Cancel execution">
                        <LuSquare size={14} />
                        <span>Cancel</span>
                    </button>
                ) : (
                    <>
                        <button className="chain-toolbar-btn chain-toolbar-btn-primary" onClick={onRun} title="Run entire chain">
                            <LuPlay size={14} />
                            <span>Run All</span>
                        </button>

                        {selectedNodeId && (
                            <>
                                <button
                                    className="chain-toolbar-btn"
                                    onClick={() => onRunFromNode(selectedNodeId)}
                                    title="Run from selected node forward"
                                >
                                    <LuChevronRight size={14} />
                                    <span>From Here</span>
                                </button>
                                <button
                                    className="chain-toolbar-btn"
                                    onClick={() => onRunToNode(selectedNodeId)}
                                    title="Run up to selected node"
                                >
                                    <LuChevronLeft size={14} />
                                    <span>To Here</span>
                                </button>
                            </>
                        )}

                        {runStatus && runStatus !== 'running' && (
                            <button
                                className="chain-toolbar-btn"
                                onClick={onClearStatus}
                                title="Clear execution results"
                            >
                                <LuTrash2 size={13} />
                                <span>Clear</span>
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Right: Tools */}
            <div className="chain-toolbar-right">
                <button className="chain-toolbar-btn-tool" onClick={onAutoLayout} title="Auto-layout: reorganize nodes">
                    <LuLayoutDashboard size={16} />
                    <span>Layout</span>
                </button>

                <div className="chain-toolbar-separator" />

                <button className="chain-toolbar-btn-tool" onClick={onExportYaml} title="Export chain as YAML file">
                    <LuFileDown size={16} />
                    <span>Export</span>
                </button>
                <button className="chain-toolbar-btn-tool" onClick={onImportYaml} title="Import chain from YAML file">
                    <LuFileUp size={16} />
                    <span>Import</span>
                </button>

                <div className="chain-toolbar-separator" />

                <button className="chain-toolbar-btn-tool" onClick={onToggleHistory} title="View execution history">
                    <LuHistory size={16} />
                    <span>History</span>
                </button>
            </div>
        </div>
    );
};

export default ChainToolbar;
