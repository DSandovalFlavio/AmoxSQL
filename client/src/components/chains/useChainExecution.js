/**
 * useChainExecution — Hook for managing chain execution state.
 * Handles run lifecycle, SSE log streaming, polling fallback, and progress tracking.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = 'http://localhost:3001/api/chains';

export function useChainExecution() {
    const [runId, setRunId] = useState(null);
    const [runStatus, setRunStatus] = useState(null);
    const [nodeStatuses, setNodeStatuses] = useState({});
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState({ completed: 0, total: 0 });
    const [logs, setLogs] = useState([]);

    const pollRef = useRef(null);
    const sseRef = useRef(null);

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
    }, [stopPolling]);

    const startRun = useCallback(async (chainDef, chainFile, { mode = 'full', startNodeId = null } = {}) => {
        try {
            setIsRunning(true);
            setNodeStatuses({});
            setRunStatus('running');
            setProgress({ completed: 0, total: chainDef.nodes?.length || 0 });
            setLogs([]);

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
