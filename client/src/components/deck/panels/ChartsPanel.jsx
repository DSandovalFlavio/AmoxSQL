/**
 * ChartsPanel — Report Flow Studio "Charts" tab.
 *
 * Lists every `.amoxvis` file in the project (via the recursive
 * GET /api/files/find-by-extension endpoint) so a chart can be inserted into
 * the active slide with one click — the correct relative path, no hand-typed
 * `src:` typos.
 */
import { useState, useEffect, useCallback } from 'react';
import { LuLoaderCircle, LuTriangleAlert, LuRefreshCw, LuChartBar, LuFolder } from 'react-icons/lu';
import { API_BASE } from '../../../api.js';

function splitPath(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? { dir: '', name: path } : { dir: path.slice(0, idx), name: path.slice(idx + 1) };
}

const ChartsPanel = ({ onInsertChart }) => {
    const [state, setState] = useState({ status: 'loading', charts: [], error: null });

    const load = useCallback(async () => {
        setState((s) => ({ ...s, status: 'loading', error: null }));
        try {
            const res = await fetch(`${API_BASE}/api/files/find-by-extension?ext=.amoxvis`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to list charts');
            setState({ status: 'ready', charts: data, error: null });
        } catch (err) {
            setState({ status: 'error', charts: [], error: err.message });
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="deck-panel deck-panel--charts">
            <div className="deck-panel-row">
                <p className="deck-panel-hint">Click a chart to place it on the current slide (replaces its existing chart).</p>
                <button type="button" className="deck-panel-refresh" onClick={load} title="Refresh list">
                    <LuRefreshCw size={13} className={state.status === 'loading' ? 'spin' : ''} />
                </button>
            </div>

            {state.status === 'loading' && (
                <div className="deck-panel-status">
                    <LuLoaderCircle size={16} className="spin" />
                    <span>Loading charts…</span>
                </div>
            )}

            {state.status === 'error' && (
                <div className="deck-panel-status deck-panel-status--error">
                    <LuTriangleAlert size={14} />
                    <span>{state.error}</span>
                </div>
            )}

            {state.status === 'ready' && state.charts.length === 0 && (
                <div className="deck-panel-status">No .amoxvis charts found in this project yet.</div>
            )}

            {state.status === 'ready' && state.charts.length > 0 && (
                <div className="deck-chart-list">
                    {state.charts.map((chart) => {
                        const { dir, name } = splitPath(chart.path);
                        return (
                            <button
                                key={chart.path}
                                type="button"
                                className="deck-chart-item"
                                onClick={() => onInsertChart(chart.path)}
                                title={`Insert ${chart.path}`}
                            >
                                <LuChartBar size={14} className="deck-chart-item-icon" />
                                <div className="deck-chart-item-info">
                                    <span className="deck-chart-item-name">{name}</span>
                                    {dir && (
                                        <span className="deck-chart-item-dir">
                                            <LuFolder size={10} /> {dir}
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ChartsPanel;
