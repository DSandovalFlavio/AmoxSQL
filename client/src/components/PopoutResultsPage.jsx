import { useState, useEffect } from 'react';
import ResultsTable from './ResultsTable';
import './PopoutResultsPage.css';

const PopoutResultsPage = () => {
    const [resultsData, setResultsData] = useState(null);

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
            <div className="popout-loading">
                <div className="popout-loading-spinner" />
                <p>Waiting for results data…</p>
            </div>
        );
    }

    return (
        <div className="popout-container">
            <div className="popout-header">
                <span className="popout-title">
                    🔗 Detached Results
                    {resultsData.cellTitle && ` — ${resultsData.cellTitle}`}
                </span>
                <span className="popout-badge">
                    {resultsData.data?.length || 0} rows
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
