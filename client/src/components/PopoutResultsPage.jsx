import { useState, useEffect, useLayoutEffect } from 'react';
import { LuLink, LuMinus, LuSquare, LuX } from 'react-icons/lu';
import ResultsTable from './ResultsTable';
import { applyStoredTheme } from '../theme';
import './PopoutResultsPage.css';

const PopoutResultsPage = () => {
    const [resultsData, setResultsData] = useState(null);

    // Antes del primer pintado, para que la ventana no parpadee del tema por
    // defecto al tuyo. App.jsx no llega a aplicarlo aquí: sale antes.
    useLayoutEffect(() => { applyStoredTheme(); }, []);

    useEffect(() => {
        if (!window.electronAPI) return;

        // Request initial data that was stored before React mounted
        if (window.electronAPI.requestPopoutData) {
            window.electronAPI.requestPopoutData().then((data) => {
                if (data) {
                    console.log('[Popout] Got initial data:', data?.data?.length, 'rows');
                    setResultsData(data);
                }
            });
        }

        // Listen for subsequent data updates (re-runs)
        const cleanup = window.electronAPI.onPopoutData?.((data) => {
            console.log('[Popout] Received updated data:', data?.data?.length, 'rows');
            setResultsData(data);
        });

        return cleanup;
    }, []);

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
                    <span className="popout-badge">
                        {resultsData.data?.length || 0} rows
                    </span>
                    <span className="window-controls">
                        <button onClick={() => window.electronAPI?.windowControl?.minimize()} className="control-btn minimize" title="Minimizar">
                            <LuMinus size={12} />
                        </button>
                        <button onClick={() => window.electronAPI?.windowControl?.maximize()} className="control-btn maximize" title="Maximizar">
                            <LuSquare size={10} />
                        </button>
                        <button onClick={() => window.electronAPI?.windowControl?.close()} className="control-btn close" title="Cerrar">
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
                    initialChartConfig={null}
                    initialViewMode={null}
                    onConfigChange={null}
                    onViewModeChange={null}
                    editorSettings={{}}
                />
            </div>
        </div>
    );
};

export default PopoutResultsPage;
