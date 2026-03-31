/**
 * ChainHistoryPanel — Drawer showing recent execution runs.
 * Each run is expandable to show per-node status.
 */
import { useState, useEffect } from 'react';
import {
    LuX, LuCheck, LuCircleAlert, LuLoader, LuMinus,
    LuChevronDown, LuChevronRight, LuTrash2, LuClock, LuPlay
} from 'react-icons/lu';
import { RESULT_TYPE_LABELS } from './chainNodeTypes';

const API_BASE = 'http://localhost:3001/api/chains';

const statusIcons = {
    running: <LuLoader size={12} className="chain-node-spin" style={{ color: 'oklch(0.7 0.15 250)' }} />,
    completed: <LuCheck size={12} style={{ color: 'oklch(0.7 0.15 155)' }} />,
    failed: <LuCircleAlert size={12} style={{ color: 'oklch(0.7 0.15 25)' }} />,
    cancelled: <LuMinus size={12} style={{ color: 'oklch(0.5 0 0)' }} />,
    paused: <LuClock size={12} style={{ color: 'oklch(0.7 0.15 85)' }} />,
    success: <LuCheck size={12} style={{ color: 'oklch(0.7 0.15 155)' }} />,
    skipped: <LuMinus size={12} style={{ color: 'oklch(0.5 0 0)' }} />,
    pending: <LuClock size={12} style={{ color: 'oklch(0.5 0 0)' }} />,
};

const ChainHistoryPanel = ({ chainFile, isOpen, onClose, onResumeRun }) => {
    const [runs, setRuns] = useState([]);
    const [expandedRun, setExpandedRun] = useState(null);
    const [nodeRuns, setNodeRuns] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && chainFile) fetchRuns();
    }, [isOpen, chainFile]);

    const fetchRuns = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/history?chainFile=${encodeURIComponent(chainFile)}&limit=20`);
            const data = await res.json();
            setRuns(data.runs || []);
        } catch (err) {
            console.error('[Chain History] Fetch error:', err);
        }
        setLoading(false);
    };

    const toggleRun = async (runId) => {
        if (expandedRun === runId) {
            setExpandedRun(null);
            return;
        }
        setExpandedRun(runId);
        if (!nodeRuns[runId]) {
            try {
                const res = await fetch(`${API_BASE}/history/${runId}`);
                const data = await res.json();
                setNodeRuns(prev => ({ ...prev, [runId]: data.nodeRuns || [] }));
            } catch (err) {
                console.error('[Chain History] Detail error:', err);
            }
        }
    };

    const deleteRun = async (runId) => {
        try {
            await fetch(`${API_BASE}/history/${runId}`, { method: 'DELETE' });
            setRuns(prev => prev.filter(r => r.id !== runId));
            if (expandedRun === runId) setExpandedRun(null);
        } catch (err) {
            console.error('[Chain History] Delete error:', err);
        }
    };

    const formatDate = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (start, end) => {
        if (!start || !end) return '';
        const ms = new Date(end) - new Date(start);
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    if (!isOpen) return null;

    return (
        <div className="chain-history-panel">
            <div className="chain-history-header">
                <span>Execution History</span>
                <button className="chain-config-close" onClick={onClose}>
                    <LuX size={14} />
                </button>
            </div>

            <div className="chain-history-body">
                {loading && <div className="chain-history-loading">Loading...</div>}

                {!loading && runs.length === 0 && (
                    <div className="chain-history-empty">No executions yet</div>
                )}

                {runs.map(run => (
                    <div key={run.id} className="chain-history-run">
                        <div className="chain-history-run-header" onClick={() => toggleRun(run.id)}>
                            <span className="chain-history-run-expand">
                                {expandedRun === run.id ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                            </span>
                            {statusIcons[run.status]}
                            <span className="chain-history-run-date">{formatDate(run.started_at)}</span>
                            <span className="chain-history-run-mode">{run.run_mode}</span>
                            <span className="chain-history-run-count">
                                {run.completed_nodes}/{run.total_nodes}
                            </span>
                            {run.finished_at && (
                                <span className="chain-history-run-duration">
                                    {formatDuration(run.started_at, run.finished_at)}
                                </span>
                            )}
                            <button
                                className="chain-history-run-delete"
                                onClick={(e) => { e.stopPropagation(); deleteRun(run.id); }}
                                title="Delete run"
                            >
                                <LuTrash2 size={11} />
                            </button>
                        </div>

                        {expandedRun === run.id && nodeRuns[run.id] && (
                            <div className="chain-history-nodes">
                                {nodeRuns[run.id].map(nr => (
                                    <div key={nr.id} className="chain-history-node">
                                        {statusIcons[nr.status]}
                                        <span className="chain-history-node-label">{nr.node_label || nr.node_id}</span>
                                        <span className="chain-history-node-type">{nr.node_type}</span>
                                        {nr.duration_ms !== undefined && nr.duration_ms !== null && (
                                            <span className="chain-history-node-duration">{nr.duration_ms}ms</span>
                                        )}
                                        {nr.result_type && (
                                            <span className="chain-history-node-result">
                                                {RESULT_TYPE_LABELS[nr.result_type] || nr.result_type}
                                            </span>
                                        )}
                                        {nr.error_message && (
                                            <span className="chain-history-node-error" title={nr.error_message}>
                                                {nr.error_message.slice(0, 50)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {run.status === 'paused' && (
                            <button
                                className="chain-history-resume"
                                onClick={() => onResumeRun && onResumeRun(run)}
                            >
                                <LuPlay size={12} />
                                <span>Resume</span>
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ChainHistoryPanel;
