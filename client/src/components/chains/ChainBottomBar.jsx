/**
 * ChainBottomBar — la única barra del estudio.
 *
 * Reúne lo que antes vivía en dos franjas fijas arriba (identidad y guardado,
 * más ocho botones de herramientas) y en el raíl de nodos de la izquierda.
 * Flota SOBRE el lienzo en vez de restarle altura, y lo secundario —variables,
 * SQL, exportar, importar, registro, historial— vive detrás de un solo botón en
 * lugar de ocupar sitio permanente.
 *
 * No hay barra superior: con ella desapareció también el nombre editable en el
 * sitio. Qué flujo se está editando ya lo dice la pestaña del archivo, así que
 * repetirlo aquí solo gastaba ancho; renombrar pasa a ser una opción del menú
 * de Guardar, que es donde se piensa en el archivo.
 *
 * El asistente es la segunda fila: al lado de las acciones se lee como otra
 * forma de actuar sobre el flujo, no como una franja aparte.
 *
 * Nota de disposición: la barra tapa la parte baja del lienzo, así que quien
 * ajuste la vista o coloque nodos nuevos debe descontar su alto — de ahí
 * BOTTOM_BAR_SAFE_AREA, que exportamos para no repetir el número.
 */
import { useState, useRef, useEffect } from 'react';
import {
    LuPlay, LuSquare, LuPlus, LuLayoutDashboard, LuMaximize, LuPanelRight,
    LuEllipsis, LuVariable, LuFileCode2, LuFileDown, LuFileUp, LuTerminal,
    LuHistory, LuSparkles, LuLoader, LuTrash2, LuCircleAlert, LuSave,
    LuChevronUp, LuPencil, LuInfo,
} from 'react-icons/lu';

/** Alto que la barra ocupa sobre el lienzo, en pixeles de pantalla. */
export const BOTTOM_BAR_SAFE_AREA = 96;

const ChainBottomBar = ({
    isRunning, runStatus, errorCount = 0, warningCount = 0, progress = { completed: 0, total: 0 },
    onRun, onCancel, onClearStatus,
    onAddSource, onAutoLayout, onFitView, zoom = 1,
    panelOpen, onTogglePanel,
    isDirty, onSave, onRename, onShowGuide,
    onToggleVariables, onExportSql, onExportYaml, onImportYaml, onToggleLogs, onToggleHistory,
    onGenerate, aiLoading, hasNodes,
}) => {
    // Un solo estado para los dos menús: así no pueden quedar los dos abiertos
    // a la vez ni pelearse dos manejadores de "pulsar fuera".
    const [menu, setMenu] = useState(null);   // 'more' | 'save' | null
    const [text, setText] = useState('');
    const barRef = useRef(null);

    useEffect(() => {
        if (!menu) return;
        const onDown = (e) => { if (barRef.current && !barRef.current.contains(e.target)) setMenu(null); };
        const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [menu]);

    const hasErrors = errorCount > 0;
    const pick = (fn) => () => { setMenu(null); fn?.(); };
    const submit = () => {
        const t = text.trim();
        if (!t || aiLoading) return;
        onGenerate?.(t);
        setText('');
    };

    return (
        <div className="chain-bottombar" ref={barRef} onClick={(e) => e.stopPropagation()}>
            <div className="chain-bottombar-row">
                <span className="chain-bb-studio">Data Flow</span>
                <button className="chain-bb-btn" onClick={onShowGuide} title="What is Data Flow?" aria-label="What is Data Flow?">
                    <LuInfo size={13} />
                </button>

                <span className="chain-bb-sep" />

                {isRunning ? (
                    <button className="chain-bb-btn chain-bb-stop" onClick={onCancel} title="Cancel execution">
                        <LuSquare size={12} />
                        <span>{progress.total > 0 ? `${progress.completed}/${progress.total}` : 'Cancel'}</span>
                    </button>
                ) : (
                    <button
                        className={`chain-bb-btn chain-bb-run ${hasErrors ? 'chain-bb-disabled' : ''}`}
                        onClick={onRun}
                        disabled={hasErrors}
                        title={hasErrors
                            ? `Fix ${errorCount} node error${errorCount > 1 ? 's' : ''} before running`
                            : (warningCount > 0 ? `Run the whole flow — ${warningCount} warning${warningCount > 1 ? 's' : ''}` : 'Run the whole flow')}
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

                {/* Guardar y, tras su flecha, lo que se hace AL archivo: renombrar */}
                <button
                    className={`chain-bb-btn chain-bb-save ${isDirty ? 'chain-bb-save-dirty' : ''}`}
                    onClick={onSave}
                    title={isDirty ? 'Save (Ctrl+S) — unsaved changes' : 'Save (Ctrl+S)'}
                >
                    <LuSave size={13} /><span>Save</span>
                    {isDirty && <span className="chain-bb-dot" aria-label="unsaved changes" />}
                </button>
                <button
                    className={`chain-bb-btn chain-bb-caret ${menu === 'save' ? 'chain-bb-on' : ''}`}
                    onClick={() => setMenu((m) => (m === 'save' ? null : 'save'))}
                    title="File actions"
                    aria-expanded={menu === 'save'}
                >
                    <LuChevronUp size={12} />
                </button>

                <button
                    className={`chain-bb-btn ${menu === 'more' ? 'chain-bb-on' : ''}`}
                    onClick={() => setMenu((m) => (m === 'more' ? null : 'more'))}
                    title="More actions"
                    aria-expanded={menu === 'more'}
                >
                    <LuEllipsis size={14} />
                </button>

                {menu === 'save' && (
                    <div className="chain-bb-menu chain-bb-menu-save">
                        <button onClick={pick(onRename)}>
                            <LuPencil size={12} /><span>Rename flow…</span>
                        </button>
                    </div>
                )}

                {menu === 'more' && (
                    <div className="chain-bb-menu">
                        <button onClick={pick(onToggleVariables)}><LuVariable size={12} /><span>Variables</span></button>
                        <button onClick={pick(onExportSql)}><LuFileCode2 size={12} /><span>View SQL</span></button>
                        <button onClick={pick(onExportYaml)}><LuFileDown size={12} /><span>Export</span></button>
                        <button onClick={pick(onImportYaml)}><LuFileUp size={12} /><span>Import</span></button>
                        <span className="chain-bb-menu-sep" />
                        <button onClick={pick(onToggleLogs)}><LuTerminal size={12} /><span>Log</span></button>
                        <button onClick={pick(onToggleHistory)}><LuHistory size={12} /><span>History</span></button>
                    </div>
                )}
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
