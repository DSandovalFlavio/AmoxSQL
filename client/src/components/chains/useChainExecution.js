/**
 * useChainExecution — Hook for managing chain execution state.
 * Handles run lifecycle, polling, and status updates.
 */
import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = 'http://localhost:3001/api/chains';

export function useChainExecution() {
    const [runId, setRunId] = useState(null);
    const [runStatus, setRunStatus] = useState(null); // 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'
    const [nodeStatuses, setNodeStatuses] = useState({}); // nodeId -> { status, resultType, resultSummary, durationMs, errorMessage }
    const [isRunning, setIsRunning] = useState(false);
    const pollRef = useRef(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const pollStatus = useCallback(async (activeRunId) => {
        try {
            const res = await fetch(`${API_BASE}/run/${activeRunId}/status`);
            if (!res.ok) return;
            const data = await res.json();

            // Update node statuses
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

            // Stop polling when run is done
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

            const res = await fetch(`${API_BASE}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chainDefinition: chainDef, chainFile, mode, startNodeId }),
            });

            const data = await res.json();
            if (!res.ok) {
                setIsRunning(false);
                setRunStatus('failed');
                return { error: data.error || 'Failed to start run' };
            }

            setRunId(data.runId);
            setRunStatus(data.status);

            // If already completed (fast execution), update immediately
            if (['completed', 'failed', 'paused'].includes(data.status)) {
                setIsRunning(false);
                // Fetch final node statuses
                await pollStatus(data.runId);
            } else {
                // Start polling
                pollRef.current = setInterval(() => pollStatus(data.runId), 500);
            }

            return data;
        } catch (err) {
            setIsRunning(false);
            setRunStatus('failed');
            return { error: err.message };
        }
    }, [pollStatus]);

    const cancelRun = useCallback(async () => {
        if (!runId) return;
        try {
            await fetch(`${API_BASE}/run/${runId}/cancel`, { method: 'POST' });
            stopPolling();
            setIsRunning(false);
            setRunStatus('cancelled');
        } catch (err) {
            console.error('[Chain] Cancel error:', err);
        }
    }, [runId, stopPolling]);

    const resumeRun = useCallback(async (chainDef, chainFile, resumeNodeId) => {
        // Resume = run from the node after the checkpoint
        return startRun(chainDef, chainFile, { mode: 'from_node', startNodeId: resumeNodeId });
    }, [startRun]);

    const clearStatus = useCallback(() => {
        setRunId(null);
        setRunStatus(null);
        setNodeStatuses({});
        setIsRunning(false);
        stopPolling();
    }, [stopPolling]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    return {
        runId,
        runStatus,
        nodeStatuses,
        isRunning,
        startRun,
        cancelRun,
        resumeRun,
        clearStatus,
    };
}
