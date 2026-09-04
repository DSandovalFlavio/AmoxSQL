/**
 * useChainExecution — Hook for managing chain execution state.
 * Handles run lifecycle, SSE log streaming, polling fallback, and progress tracking.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

import { API_BASE as _API } from '../../api.js';
const API_BASE = `${_API}/api/chains`;

export function useChainExecution() {
    const [runId, setRunId] = useState(null);
    const [runStatus, setRunStatus] = useState(null);
    const [nodeStatuses, setNodeStatuses] = useState({});
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ completed: 0, total: 0 });
    const [logs, setLogs] = useState([]);

    const pollRef = useRef(null);
    const sseRef = useRef(null);
    // Nodes already turned into a log line this run — SSE already logs each
    // node as it completes, but /api/chains/run runs the chain to completion
    // BEFORE responding, so a chain that finishes before the client gets that
    // response (any small local chain — i.e. almost always) never has an SSE
    // connection open to hear those events at all. The fallback below
    // reconstructs the same log lines from the persisted node_runs once,
    // right after start; this set stops it from re-adding them if a live SSE
    // connection (a slower chain) logs the same node again on top.
    const loggedNodeIdsRef = useRef(new Set());

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const stopSSE = useCallback(() => {
        if (sseRef.current) {
            sseRef.current.close();
            sseRef.current = null;
        }
    }, []);

    const addLog = useCallback((entry) => {
        setLogs(prev => [...prev.slice(-499), { ...entry, id: Date.now() + Math.random() }]);
    }, []);

    const startSSE = useCallback((activeRunId) => {
        stopSSE();
        try {
            const es = new EventSource(`${API_BASE}/run/${activeRunId}/stream`);
            sseRef.current = es;

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'done') { es.close(); return; }

                    if (data.type === 'node_start') {
                        addLog({ type: 'info', nodeId: data.nodeId, nodeLabel: data.nodeLabel, message: `Starting: ${data.nodeLabel}`, timestamp: data.timestamp });
                        setNodeStatuses(prev => ({ ...prev, [data.nodeId]: { ...prev[data.nodeId], status: 'running' } }));
                    } else if (data.type === 'node_sql') {
                        addLog({ type: 'sql', nodeId: data.nodeId, nodeLabel: data.nodeLabel, message: data.sql, timestamp: data.timestamp });
                    } else if (data.type === 'node_complete') {
                        loggedNodeIdsRef.current.add(data.nodeId);
                        const rowCount = data.rowCount !== undefined ? ` → ${Number(data.rowCount).toLocaleString()} rows` : '';
                        const dur = data.durationMs ? ` (${data.durationMs < 1000 ? `${data.durationMs}ms` : `${(data.durationMs/1000).toFixed(1)}s`})` : '';
                        const dest = data.table ? ` → ${data.table}` : data.path ? ` → ${data.path}` : '';
                        addLog({ type: 'success', nodeId: data.nodeId, nodeLabel: data.nodeLabel, message: `${data.nodeLabel}${rowCount}${dest}${dur}`, timestamp: data.timestamp });
                        setNodeStatuses(prev => ({
                            ...prev,
                            [data.nodeId]: {
                                ...prev[data.nodeId],
                                status: 'success',
                                resultType: data.resultType,
                                durationMs: data.durationMs,
                                resultSummary: data.table ? { table: data.table, rowCount: data.rowCount } : data.path ? { path: data.path } : null,
                            },
                        }));
                    } else if (data.type === 'node_error') {
                        loggedNodeIdsRef.current.add(data.nodeId);
                        addLog({ type: 'error', nodeId: data.nodeId, nodeLabel: data.nodeLabel, message: data.error, timestamp: data.timestamp });
                        setNodeStatuses(prev => ({
                            ...prev,
                            [data.nodeId]: { ...prev[data.nodeId], status: 'failed', errorMessage: data.error },
                        }));
                    } else if (data.type === 'run_progress') {
                        setProgress({ completed: data.completed, total: data.total });
                    } else if (data.type === 'run_complete') {
                        setRunStatus(data.status);
                        addLog({ type: data.status === 'completed' ? 'success' : 'error', message: data.status === 'completed' ? `Chain completed (${data.totalNodes} nodes)` : `Chain failed: ${data.error || ''}`, timestamp: data.timestamp });
                        stopSSE();
                        setIsRunning(false);
                    } else if (data.type === 'run_paused') {
                        setRunStatus('paused');
                        addLog({ type: 'info', message: 'Chain paused at checkpoint', timestamp: data.timestamp });
                        stopSSE();
                        setIsRunning(false);
                    }
                } catch {}
            };

            es.onerror = () => {
                // Fallback to polling if SSE fails
                stopSSE();
                if (!pollRef.current) {
                    pollRef.current = setInterval(() => pollStatus(activeRunId), 800);
                }
            };
        } catch {
            // SSE not available, use polling
        }
    }, [stopSSE, addLog]);

    const pollStatus = useCallback(async (activeRunId) => {
        try {
            const res = await fetch(`${API_BASE}/run/${activeRunId}/status`);
            if (!res.ok) return;
            const data = await res.json();

            const statuses = {};
            for (const nr of (data.nodeRuns || [])) {
                statuses[nr.node_id] = {
                    status: nr.status,
                    resultType: nr.result_type,
                    resultSummary: nr.result_summary ? JSON.parse(nr.result_summary) : null,
                    durationMs: nr.duration_ms,
                    errorMessage: nr.error_message,
                };

                // Backfill this node's log lines once — mirrors what the SSE
                // node_sql/node_complete/node_error handlers would have logged,
                // for nodes SSE never got a chance to report (see loggedNodeIdsRef).
                if ((nr.status === 'success' || nr.status === 'failed') && !loggedNodeIdsRef.current.has(nr.node_id)) {
                    loggedNodeIdsRef.current.add(nr.node_id);
                    if (nr.sql_executed) {
                        addLog({ type: 'sql', nodeId: nr.node_id, nodeLabel: nr.node_label, message: nr.sql_executed, timestamp: nr.started_at });
                    }
                    if (nr.status === 'success') {
                        const summary = nr.result_summary ? JSON.parse(nr.result_summary) : null;
                        const rowCount = summary?.rowCount !== undefined ? ` → ${Number(summary.rowCount).toLocaleString()} rows` : '';
                        const dur = nr.duration_ms ? ` (${nr.duration_ms < 1000 ? `${nr.duration_ms}ms` : `${(nr.duration_ms / 1000).toFixed(1)}s`})` : '';
                        const dest = summary?.table ? ` → ${summary.table}` : summary?.path ? ` → ${summary.path}` : '';
                        addLog({ type: 'success', nodeId: nr.node_id, nodeLabel: nr.node_label, message: `${nr.node_label}${rowCount}${dest}${dur}`, timestamp: nr.finished_at });
                    } else {
                        addLog({ type: 'error', nodeId: nr.node_id, nodeLabel: nr.node_label, message: nr.error_message, timestamp: nr.finished_at });
                    }
                }
            }
            setNodeStatuses(statuses);
            setRunStatus(data.run?.status || null);

            if (data.run) {
                const completed = data.run.completed_nodes || 0;
                const total = data.run.total_nodes || 0;
                setProgress({ completed, total });
            }

            if (data.run && ['completed', 'failed', 'cancelled', 'paused'].includes(data.run.status)) {
                stopPolling();
                setIsRunning(false);
            }
        } catch (err) {
            console.error('[Chain] Poll error:', err);
        }
    }, [stopPolling, addLog]);

    const startRun = useCallback(async (chainDef, chainFile, { mode = 'full', startNodeId = null } = {}) => {
        try {
            setIsRunning(true);
            setNodeStatuses({});
            setRunStatus('running');
            setProgress({ completed: 0, total: chainDef.nodes?.length || 0 });
            setLogs([]);
            loggedNodeIdsRef.current = new Set();

            const res = await fetch(`${API_BASE}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chainDefinition: chainDef, chainFile, mode, startNodeId }),
            });

            const data = await res.json();
            if (!res.ok) {
                setIsRunning(false);
                setRunStatus('failed');
                addLog({ type: 'error', message: data.error || 'Failed to start run' });
                return { error: data.error || 'Failed to start run' };
            }

            setRunId(data.runId);
            setRunStatus(data.status);

            if (['completed', 'failed', 'paused'].includes(data.status)) {
                setIsRunning(false);
                await pollStatus(data.runId);
            } else {
                // Start SSE stream, with polling fallback
                startSSE(data.runId);
                // Also start polling as backup (slower interval)
                pollRef.current = setInterval(() => pollStatus(data.runId), 1500);
            }

            return data;
        } catch (err) {
            setIsRunning(false);
            setRunStatus('failed');
            addLog({ type: 'error', message: err.message });
            return { error: err.message };
        }
    }, [pollStatus, startSSE, addLog]);

    const cancelRun = useCallback(async () => {
        if (!runId) return;
        try {
            await fetch(`${API_BASE}/run/${runId}/cancel`, { method: 'POST' });
            stopPolling();
            stopSSE();
            setIsRunning(false);
            setRunStatus('cancelled');
            addLog({ type: 'info', message: 'Execution cancelled by user' });
        } catch (err) {
            console.error('[Chain] Cancel error:', err);
        }
    }, [runId, stopPolling, stopSSE, addLog]);

    const resumeRun = useCallback(async (chainDef, chainFile, resumeNodeId) => {
        return startRun(chainDef, chainFile, { mode: 'from_node', startNodeId: resumeNodeId });
    }, [startRun]);

    const clearStatus = useCallback(() => {
        setRunId(null);
        setRunStatus(null);
        setNodeStatuses({});
        setIsRunning(false);
        setProgress({ completed: 0, total: 0 });
        setLogs([]);
        loggedNodeIdsRef.current = new Set();
        stopPolling();
        stopSSE();
    }, [stopPolling, stopSSE]);

    const clearLogs = useCallback(() => setLogs([]), []);

    useEffect(() => {
        return () => { stopPolling(); stopSSE(); };
    }, [stopPolling, stopSSE]);

    return {
        runId,
        runStatus,
        nodeStatuses,
        isRunning,
        progress,
        logs,
        startRun,
        cancelRun,
        resumeRun,
        clearStatus,
        clearLogs,
    };
}
