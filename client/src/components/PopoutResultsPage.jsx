import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { LuLink, LuMinus, LuPin, LuSquare, LuX } from 'react-icons/lu';
import ResultsTable from './ResultsTable';
import { applyStoredTheme } from '../theme';
import './PopoutResultsPage.css';

const ajustesDelEditor = () => {
    try { return JSON.parse(localStorage.getItem('amoxsql-editor-settings')) || {}; } catch { return {}; }
};

const PopoutResultsPage = () => {
    const [resultsData, setResultsData] = useState(null);
    // Con Fijar, lo que llega se guarda sin enseñarlo: para comparar el resultado
    // de ahora con el de la siguiente ejecución.
    const [fijada, setFijada] = useState(false);
    const [nuevos, setNuevos] = useState(null);
    const fijadaRef = useRef(false);
    fijadaRef.current = fijada;
    const [ajustes] = useState(ajustesDelEditor);
    // La vista y el gráfico con los que se abrió; después manda esta ventana.
    const inicioRef = useRef(null);

    // Antes del primer pintado, para que la ventana no parpadee del tema por
    // defecto al tuyo. App.jsx no llega a aplicarlo aquí: sale antes.
    useLayoutEffect(() => { applyStoredTheme(); }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        const llegan = (data) => {
            if (!data) return;
            if (!inicioRef.current) inicioRef.current = { viewMode: data.viewMode, chartConfig: data.chartConfig };
            const conHora = { ...data, llegada: new Date() };
            if (fijadaRef.current) setNuevos(conHora);
            else setResultsData(conHora);
        };

        // Request initial data that was stored before React mounted
        window.electronAPI.requestPopoutData?.().then(llegan);

        // Listen for subsequent data updates (re-runs of this tab)
        return window.electronAPI.onPopoutData?.(llegan);
    }, []);

    useEffect(() => {
        if (resultsData?.cellTitle) document.title = `${resultsData.cellTitle} — Results`;
    }, [resultsData?.cellTitle]);

    if (!resultsData) {
        return (
            <div className="popout-loading popout-loading--drag">
                <div className="popout-loading-spinner" />
                <p>Waiting for results data…</p>
            </div>
        );
    }

    return (
        <div className="popout-container">
            {/* Hace de barra de ventana: la ventana es sin marco, como la
                principal, así que esta franja es la que se arrastra y la que
                lleva los controles. */}
            <div className="popout-header">
                <span className="popout-title">
                    <LuLink size={13} />
                    Detached Results
                    {resultsData.cellTitle && ` — ${resultsData.cellTitle}`}
                </span>
                <span className="popout-header-right">
                    {nuevos && (
                        <button className="popout-accion popout-accion--nuevos" onClick={() => { setResultsData(nuevos); setNuevos(null); }}
                            title="This tab ran again. Show the new results.">
                            Newer results
                        </button>
                    )}
                    <button className={`popout-accion${fijada ? ' popout-accion--activa' : ''}`} aria-pressed={fijada}
                        onClick={() => setFijada(v => !v)}
                        title={fijada ? 'Follow new runs of this tab' : 'Keep these results when the tab runs again'}>
                        <LuPin size={12} /> {fijada ? 'Pinned' : 'Pin'}
                    </button>
                    <span className="popout-badge">
                        {resultsData.data?.length || 0} rows
                        {resultsData.llegada && ` · ${resultsData.llegada.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                    <span className="window-controls">
                        <button onClick={() => window.electronAPI?.windowControl?.minimize()} className="control-btn minimize" title="Minimizar">
                            <LuMinus size={12} />
                        </button>
                        <button onClick={() => window.electronAPI?.windowControl?.maximize()} className="control-btn maximize" title="Maximizar">
                            <LuSquare size={10} />
                        </button>
                        <button onClick={() => window.electronAPI?.windowControl?.close()} className="control-btn close" title="Close">
                            <LuX size={12} />
                        </button>
                    </span>
                </span>
            </div>
            <div className="popout-body">
                <ResultsTable
                    data={resultsData.data}
                    types={resultsData.types}
                    executionTime={resultsData.executionTime}
                    query={resultsData.query || ''}
                    currentEditorQuery={resultsData.query || ''}
                    onDbChange={() => {}}
                    isReportMode={false}
                    initialChartConfig={inicioRef.current?.chartConfig || null}
                    initialViewMode={inicioRef.current?.viewMode || null}
                    onConfigChange={null}
                    onViewModeChange={null}
                    editorSettings={ajustes}
                    truncated={resultsData.truncated}
                    rowLimit={resultsData.rowLimit}
                />
            </div>
        </div>
    );
};

export default PopoutResultsPage;
