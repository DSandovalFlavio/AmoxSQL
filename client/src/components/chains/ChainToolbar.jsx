/**
 * ChainToolbar — Top toolbar for the chain editor.
 * Organized in 3 sections: identity, run controls, actions.
 */
import {
    LuPlay, LuSquare, LuHistory, LuFileDown, LuFileUp,
    LuLayoutDashboard, LuSave,
    LuTrash2, LuTerminal, LuTriangleAlert, LuCircleAlert, LuFileCode2, LuVariable, LuInfo
} from 'react-icons/lu';

const ChainToolbar = ({
    chainName,
    isRunning,
    runStatus,
    onRun,
    onCancel,
    onSave,
    onExportYaml,
    onExportSql,
    onImportYaml,
    onAutoLayout,
    onToggleVariables,
    onToggleHistory,
    onToggleLogs,
    onShowGuide,
    onClearStatus,
    isDirty,
    errorCount = 0,
    warningCount = 0,
    progress = { completed: 0, total: 0 },
}) => {
    const hasErrors = errorCount > 0;
    const hasWarnings = warningCount > 0 && !hasErrors;

    return (
        <div className="chain-toolbar">
            {/* Left: studio brand / chain identity + Save */}
            <div className="chain-toolbar-left">
                <span className="chain-toolbar-studio" title="Data Flow — the visual studio where chains are built">Data Flow</span>
                {onShowGuide && (
                    <button
                        className="chain-toolbar-studio-help"
                        onClick={onShowGuide}
                        title="What is Data Flow?"
                        aria-label="What is Data Flow?"
                    >
                        <LuInfo size={13} />
                    </button>
                )}
                <span className="chain-toolbar-divider">/</span>
                <span className="chain-toolbar-title">{chainName || 'Untitled Chain'}</span>
                {isDirty && <span className="chain-toolbar-dirty">*</span>}
                <button
                    className={`chain-toolbar-btn chain-toolbar-btn-save ${isDirty ? 'chain-toolbar-btn-save-dirty' : ''}`}
                    onClick={onSave}
                    title="Save (Ctrl+S)"
                >
                    <LuSave size={14} />
                    <span>Save</span>
                </button>

                {/* Validation badge */}
                {(hasErrors || hasWarnings) && !isRunning && (
                    <div
                        className={`chain-toolbar-validation-badge ${hasErrors ? 'chain-toolbar-validation-error' : 'chain-toolbar-validation-warn'}`}
                        title={hasErrors ? `${errorCount} node error(s) — fix before running` : `${warningCount} warning(s)`}
                    >
                        {hasErrors ? <LuCircleAlert size={12} /> : <LuTriangleAlert size={12} />}
                        <span>{hasErrors ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : `${warningCount} warning${warningCount > 1 ? 's' : ''}`}</span>
                    </div>
                )}
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
                        <button
                            className={`chain-toolbar-btn chain-toolbar-btn-primary ${hasErrors ? 'chain-toolbar-btn-disabled' : ''}`}
                            onClick={onRun}
                            title={hasErrors ? `Fix ${errorCount} error(s) before running` : 'Run entire chain'}
                            disabled={hasErrors}
                        >
                            <LuPlay size={14} />
                            <span>Run All</span>
                        </button>

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
                <button className="chain-toolbar-btn-tool" onClick={onAutoLayout} title="Arrange all nodes — undoable">
                    <LuLayoutDashboard size={16} />
                    <span>Arrange All</span>
                </button>
                <button className="chain-toolbar-btn-tool" onClick={onToggleVariables} title="Define chain variables — reference as ${name} in any node">
                    <LuVariable size={16} />
                    <span>Variables</span>
                </button>

                <div className="chain-toolbar-separator" />

                <button className="chain-toolbar-btn-tool" onClick={onExportYaml} title="Export chain as YAML file">
                    <LuFileDown size={16} />
                    <span>Export</span>
                </button>
                <button className="chain-toolbar-btn-tool" onClick={onExportSql} title="Compile chain to a runnable SQL script">
                    <LuFileCode2 size={16} />
                    <span>SQL</span>
                </button>
                <button className="chain-toolbar-btn-tool" onClick={onImportYaml} title="Import chain from YAML file">
                    <LuFileUp size={16} />
                    <span>Import</span>
                </button>

                <div className="chain-toolbar-separator" />

                <button className="chain-toolbar-btn-tool" onClick={onToggleLogs} title="Toggle execution log panel">
                    <LuTerminal size={16} />
                    <span>Logs</span>
                </button>
                <button className="chain-toolbar-btn-tool" onClick={onToggleHistory} title="View execution history">
                    <LuHistory size={16} />
                    <span>History</span>
                </button>
            </div>
        </div>
    );
};

export default ChainToolbar;
