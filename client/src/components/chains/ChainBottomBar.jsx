/**
 * ChainBottomBar — la barra flotante del lienzo.
 *
 * Reune lo que antes estaba repartido en dos franjas fijas arriba (ocho
 * botones de herramientas mas la fila del asistente) y en el rail de nodos de
 * la izquierda. Flota SOBRE el lienzo en vez de restarle altura, y lo
 * secundario —variables, SQL, exportar, importar, registro, historial— vive
 * detras de un solo boton en lugar de ocupar sitio permanente.
 *
 * El asistente es la segunda fila de esta misma barra: al lado de las acciones
 * se lee como otra forma de actuar sobre el flujo, no como una franja aparte.
 *
 * Nota de disposicion: la barra tapa la parte baja del lienzo, asi que quien
 * ajuste la vista o coloque nodos nuevos debe descontar su alto — de ahi
 * BOTTOM_BAR_SAFE_AREA, que exportamos para no repetir el numero.
 */
import { useState, useRef, useEffect } from 'react';
import {
    LuPlay, LuSquare, LuPlus, LuLayoutDashboard, LuMaximize, LuPanelRight,
    LuEllipsis, LuVariable, LuFileCode2, LuFileDown, LuFileUp, LuTerminal,
    LuHistory, LuSparkles, LuLoader, LuTrash2, LuCircleAlert,
} from 'react-icons/lu';

/** Alto que la barra ocupa sobre el lienzo, en pixeles de pantalla. */
export const BOTTOM_BAR_SAFE_AREA = 96;

const ChainBottomBar = ({
    isRunning, runStatus, errorCount = 0, progress = { completed: 0, total: 0 },
    onRun, onCancel, onClearStatus,
    onAddSource, onAutoLayout, onFitView, zoom = 1,
    panelOpen, onTogglePanel,
    onToggleVariables, onExportSql, onExportYaml, onImportYaml, onToggleLogs, onToggleHistory,
    onGenerate, aiLoading, hasNodes,
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [text, setText] = useState('');
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const hasErrors = errorCount > 0;
    const submit = () => {
        const t = text.trim();
        if (!t || aiLoading) return;
        onGenerate?.(t);
        setText('');
    };

    return (
        <div className="chain-bottombar" onClick={(e) => e.stopPropagation()}>
            <div className="chain-bottombar-row">
                {isRunning ? (
                    <button className="chain-bb-btn chain-bb-stop" onClick={onCancel} title="Cancel execution">
                        <LuSquare size={12} />
                        <span>
                            {progress.total > 0 ? `${progress.completed}/${progress.total}` : 'Cancel'}
                        </span>
                    </button>
                ) : (
                    <button
                        className={`chain-bb-btn chain-bb-run ${hasErrors ? 'chain-bb-disabled' : ''}`}
                        onClick={onRun}
                        disabled={hasErrors}
                        title={hasErrors ? `Fix ${errorCount} error(s) before running` : 'Run the whole flow'}
                    >
                        {hasErrors ? <LuCircleAlert size={12} /> : <LuPlay size={12} />}
                        <span>Run</span>
                    </button>
                )}

                {!isRunning && runStatus && runStatus !== 'running' && (
                    <button className="chain-bb-btn" onClick={onClearStatus} title="Clear execution results">
                        <LuTrash2 size={12} />
                    </button>
                )}

                <span className="chain-bb-sep" />

                <button className="chain-bb-btn" onClick={onAddSource} title="Add a data source — for flows that start from more than one file">
                    <LuPlus size={13} /><span>Source</span>
                </button>
                <button className="chain-bb-btn" onClick={onAutoLayout} title="Arrange all nodes — undoable">
                    <LuLayoutDashboard size={13} />
                </button>

                <span className="chain-bb-gap" />

                <span className="chain-bb-zoom" title="Canvas zoom">{Math.round(zoom * 100)} %</span>
                <button className="chain-bb-btn" onClick={onFitView} title="Fit the flow to the view">
                    <LuMaximize size={13} />
                </button>

                <span className="chain-bb-sep" />

                <button
                    className={`chain-bb-btn ${panelOpen ? 'chain-bb-on' : ''}`}
                    onClick={onTogglePanel}
                    title={panelOpen ? 'Hide the data panel' : 'Show the data panel'}
                >
                    <LuPanelRight size={13} />
                </button>

                <div className="chain-bb-more-wrap" ref={menuRef}>
                    <button
                        className={`chain-bb-btn ${menuOpen ? 'chain-bb-on' : ''}`}
                        onClick={() => setMenuOpen(v => !v)}
                        title="More actions"
                        aria-expanded={menuOpen}
                    >
                        <LuEllipsis size={14} />
                    </button>
                    {menuOpen && (
                        <div className="chain-bb-menu">
                            <button onClick={() => { setMenuOpen(false); onToggleVariables?.(); }}>
                                <LuVariable size={12} /><span>Variables</span>
                            </button>
                            <button onClick={() => { setMenuOpen(false); onExportSql?.(); }}>
                                <LuFileCode2 size={12} /><span>View SQL</span>
                            </button>
                            <button onClick={() => { setMenuOpen(false); onExportYaml?.(); }}>
                                <LuFileDown size={12} /><span>Export</span>
                            </button>
                            <button onClick={() => { setMenuOpen(false); onImportYaml?.(); }}>
                                <LuFileUp size={12} /><span>Import</span>
                            </button>
                            <span className="chain-bb-menu-sep" />
                            <button onClick={() => { setMenuOpen(false); onToggleLogs?.(); }}>
                                <LuTerminal size={12} /><span>Log</span>
                            </button>
                            <button onClick={() => { setMenuOpen(false); onToggleHistory?.(); }}>
                                <LuHistory size={12} /><span>History</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="chain-bottombar-row chain-bottombar-ai">
                <LuSparkles size={13} className="chain-bb-ai-icon" />
                <input
                    type="text"
                    className="chain-bb-ai-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    disabled={aiLoading}
                    placeholder={hasNodes
                        ? 'Describe a change… e.g. "add a dedup before the export"'
                        : 'Describe your pipeline… e.g. "import sales.csv, filter 2025, sum by region"'}
                />
                <button
                    className="chain-bb-ai-send"
                    onClick={submit}
                    disabled={aiLoading || !text.trim()}
                    title="Generate (Enter)"
                    aria-label="Generate"
                >
                    {aiLoading ? <LuLoader size={12} className="chain-node-spin" /> : <LuSparkles size={12} />}
                </button>
            </div>
        </div>
    );
};

export default ChainBottomBar;
