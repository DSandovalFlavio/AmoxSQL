/**
 * AmoxvisPane — Fullscreen Chart Editor for .amoxvis files
 *
 * Renders the DataVisualizer at full viewport size without the SQL editor.
 * Executes the stored query on mount, and provides controls for:
 * - Re-running the query
 * - Saving the chart config
 * - Switching to "Edit with SQL" mode (opens the same file as a SQL tab)
 */
import { API_BASE } from '../api.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LuCode, LuLoader, LuChevronDown, LuChevronRight, LuSquare, LuRefreshCw, LuBookOpen, LuSave } from 'react-icons/lu';
import DataVisualizer from './DataVisualizer';
import { useToast } from './ToastProvider';


const AmoxvisPane = ({ tab, onRunQuery, onSave, onOpenAsSql, onConfigChange }) => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [queryExpanded, setQueryExpanded] = useState(false);
    const isReadOnly = tab.readOnly || false;
    const toast = useToast();


    const config = tab.chartConfig || tab.initialChartConfig || {};
    const [currentQuery, setCurrentQuery] = useState(config.query || '');
    const configRef = useRef(config);

    // Keep configRef in sync
    useEffect(() => {
        configRef.current = tab.chartConfig || tab.initialChartConfig || {};
    }, [tab.chartConfig, tab.initialChartConfig]);

    // Auto-execute query on mount
    useEffect(() => {
        if (currentQuery) {
            executeQuery(currentQuery);
        }
    }, []); // Only on mount

    const executeQuery = async (q) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
            });
            const result = await response.json();

            if (response.ok) {
                setData(result.data);
            } else {
                setError(result.error || 'Query failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshSql = async () => {
        if (!tab.path) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(tab.path)}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            const diskConfig = JSON.parse(data.content);
            const diskQuery = diskConfig.query || '';
            
            setCurrentQuery(diskQuery);
            configRef.current = { ...configRef.current, query: diskQuery };
            
            executeQuery(diskQuery);
        } catch (err) {
            setError('Failed to refresh query: ' + err.message);
            setIsLoading(false);
        }
    };

    const handleConfigChange = useCallback((newConfig) => {
        const mergedConfig = { ...newConfig, query: currentQuery || configRef.current.query || '' };
        if (onConfigChange) onConfigChange(mergedConfig);
    }, [onConfigChange, currentQuery]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            {/* Mini Action Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                borderBottom: '1px solid var(--border-color)',
                backgroundColor: 'var(--panel-bg)',
                gap: '8px',
                flexShrink: 0,
            }}>
                {/* Left: Query Info + Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                    {/* Read-Only Gallery Banner */}
                    {isReadOnly && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '3px 10px', borderRadius: '4px',
                            background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15))',
                            border: '1px solid rgba(139,92,246,0.3)',
                            color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600,
                            letterSpacing: '0.3px',
                        }}>
                            <LuBookOpen size={12} /> Gallery Preview — Read Only
                        </div>
                    )}

                    {/* Save to Workspace (read-only mode) */}
                    {isReadOnly && (
                        <button
                            onClick={async () => {
                                try {
                                    const chartId = tab.path.split(/[/\\]/).pop().replace('.amoxvis', '');
                                    const res = await fetch(`${API_BASE}/api/gallery/copy-to-workspace`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ chartId }),
                                    });
                                    const result = await res.json();
                                    if (result.success) toast.success(`Saved to workspace: ${chartId}.amoxvis`);
                                    else toast.error(result.error || 'Failed to save');
                                } catch (err) {
                                    toast.error('Failed to save to workspace');
                                }
                            }}
                            title="Copy this chart to your current workspace"
                            style={{
                                display: 'flex', alignItems: 'center', gap: '5px',
                                padding: '4px 10px', borderRadius: '4px', border: 'none',
                                backgroundColor: 'var(--accent-primary)',
                                color: 'var(--surface-base)',
                                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            <LuSave size={12} /> Save to Workspace
                        </button>
                    )}

                    {/* Edit SQL (hidden in read-only) */}
                    {!isReadOnly && (
                    <button
                        onClick={() => onOpenAsSql && onOpenAsSql(tab)}
                        title="Edit data query in SQL Editor"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '4px',
                            border: '1px solid var(--border-default)',
                            backgroundColor: 'transparent',
                            color: 'var(--text-secondary)',
                            fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <LuCode size={13} /> Edit SQL
                    </button>
                    )}

                    {/* Refresh SQL (hidden in read-only) */}
                    {!isReadOnly && (
                    <button
                        onClick={handleRefreshSql}
                        disabled={isLoading}
                        title="Reload latest saved query from disk and re-run"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '4px', border: 'none',
                            backgroundColor: 'var(--accent-primary)',
                            color: 'var(--surface-base)',
                            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            transition: 'opacity 0.15s ease'
                        }}
                    >
                        <LuRefreshCw size={12} className={isLoading ? "spin" : ""} /> Reload
                    </button>
                    )}

                    {/* Collapsible Query Preview */}
                    <button
                        onClick={() => setQueryExpanded(v => !v)}
                        title="Show/Hide SQL query"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '4px 8px', borderRadius: '4px',
                            border: 'none', backgroundColor: 'transparent',
                            color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer',
                            fontFamily: "'JetBrains Mono', monospace",
                            maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}
                    >
                        {queryExpanded ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />}
                        {currentQuery ? currentQuery.substring(0, 80) + (currentQuery.length > 80 ? '...' : '') : 'No query'}
                    </button>
                </div>
            </div>

            {/* Chart Area */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', contain: 'layout paint', transform: 'translateZ(0)' }}>
                
                {/* Expanded Query Panel (Floating) */}
                {queryExpanded && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15,
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: 'var(--surface-overlay)',
                        boxShadow: 'var(--shadow-md)',
                        fontSize: '12px',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        maxHeight: '40%',
                        overflowY: 'auto',
                        lineHeight: '1.5',
                    }}>
                        {currentQuery || '-- No query stored in this chart config'}
                    </div>
                )}
                {isLoading && !data && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', color: 'var(--text-tertiary)', fontSize: '14px',
                        gap: '8px'
                    }}>
                        <LuLoader size={18} className="spin" /> Executing query...
                    </div>
                )}

                {error && (
                    <div style={{
                        padding: '20px', margin: '20px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--color-error-bg)',
                        border: '1px solid var(--color-error)',
                        color: 'var(--color-error)',
                        fontSize: '13px',
                        fontFamily: "'JetBrains Mono', monospace",
                        whiteSpace: 'pre-wrap'
                    }}>
                        {error}
                    </div>
                )}

                {data && data.length > 0 && (
                    <DataVisualizer
                        data={data}
                        query={currentQuery}
                        initialChartConfig={config}
                        onConfigChange={handleConfigChange}
                    />
                )}

                {data && data.length === 0 && !isLoading && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', color: 'var(--text-tertiary)', fontSize: '14px'
                    }}>
                        Query returned no data.
                    </div>
                )}
            </div>

        </div>
    );
};

export default AmoxvisPane;
