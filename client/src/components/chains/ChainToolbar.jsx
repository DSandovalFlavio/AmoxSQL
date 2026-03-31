/**
 * ChainToolbar — Top toolbar for the chain editor.
 * Run controls, export, history toggle, auto-layout.
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
            <div className="chain-toolbar-left">
                <span className="chain-toolbar-title">{chainName || 'Execution Chain'}</span>
                {isDirty && <span className="chain-toolbar-dirty">*</span>}
            </div>

            <div className="chain-toolbar-center">
                {/* Run controls */}
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

            <div className="chain-toolbar-right">
                <button className="chain-toolbar-btn-icon" onClick={onAutoLayout} title="Auto-layout">
                    <LuLayoutDashboard size={18} />
                </button>
                <button className="chain-toolbar-btn-icon" onClick={onExportYaml} title="Export as YAML">
                    <LuFileDown size={18} />
                </button>
                <button className="chain-toolbar-btn-icon" onClick={onImportYaml} title="Import from YAML">
                    <LuFileUp size={18} />
                </button>

                <div className="chain-toolbar-separator" />

                <button className="chain-toolbar-btn-icon" onClick={onToggleHistory} title="Execution history">
                    <LuHistory size={18} />
                </button>
            </div>
        </div>
    );
};

export default ChainToolbar;
