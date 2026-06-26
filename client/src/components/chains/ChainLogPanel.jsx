/**
 * ChainLogPanel — Real-time execution log panel.
 * Shows structured logs per node: SQL executed, timing, row counts, errors.
 */
import { useRef, useEffect, useState } from 'react';
import {
    LuX, LuCopy, LuTrash2, LuChevronDown, LuChevronUp, LuFilter,
    LuInfo, LuCheck, LuTriangleAlert, LuChevronRight,
} from 'react-icons/lu';

const LOG_TYPE_STYLES = {
    info: { color: 'var(--text-secondary)', Icon: LuInfo },
    success: { color: 'oklch(0.75 0.15 155)', Icon: LuCheck },
    error: { color: 'oklch(0.7 0.18 25)', Icon: LuX },
    sql: { color: 'oklch(0.65 0.08 260)', Icon: LuChevronRight },
    warn: { color: 'oklch(0.75 0.15 85)', Icon: LuTriangleAlert },
};

const ChainLogPanel = ({ logs = [], isRunning, onClear, collapsed, onToggleCollapse }) => {
    const bottomRef = useRef(null);
    const containerRef = useRef(null);
    const [pinToBottom, setPinToBottom] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [showFilter, setShowFilter] = useState(false);

    // Auto-scroll when pinned
    useEffect(() => {
        if (pinToBottom && bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, pinToBottom]);

    const handleScroll = () => {
        const el = containerRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
        setPinToBottom(atBottom);
    };

    const handleCopy = () => {
        const text = filteredLogs.map(l => {
            const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }) : '';
            const label = l.nodeLabel ? `[${l.nodeLabel}] ` : '';
            return `${time} ${label}${l.message}`;
        }).join('\n');
        navigator.clipboard.writeText(text).catch(() => {});
    };

    const filteredLogs = filterType === 'all' ? logs : logs.filter(l => l.type === filterType);

    const formatTime = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 });
        } catch { return ''; }
    };

    if (collapsed) {
        return (
            <div className="chain-log-panel chain-log-panel-collapsed" onClick={onToggleCollapse}>
                <div className="chain-log-panel-collapsed-bar">
                    <span className="chain-log-panel-title">
                        {isRunning && <span className="chain-log-running-dot" />}
                        Execution Logs
                        {logs.length > 0 && <span className="chain-log-count">{logs.length}</span>}
                    </span>
                    <LuChevronUp size={14} />
                </div>
            </div>
        );
    }

    return (
        <div className="chain-log-panel">
            <div className="chain-log-header">
                <div className="chain-log-header-left">
                    {isRunning && <span className="chain-log-running-dot" />}
                    <span className="chain-log-panel-title">Execution Logs</span>
                    {logs.length > 0 && <span className="chain-log-count">{logs.length}</span>}
                </div>

                <div className="chain-log-header-right">
                    <button
                        className="chain-log-btn"
                        onClick={() => setShowFilter(v => !v)}
                        title="Filter by type"
                        style={{ color: filterType !== 'all' ? 'oklch(0.65 0.15 250)' : undefined }}
                    >
                        <LuFilter size={13} />
                    </button>
                    {showFilter && (
                        <div className="chain-log-filter-popup">
                            {['all', 'info', 'success', 'error', 'sql'].map(t => (
                                <button
                                    key={t}
                                    className={`chain-log-filter-option ${filterType === t ? 'active' : ''}`}
                                    onClick={() => { setFilterType(t); setShowFilter(false); }}
                                >
                                    {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>
                    )}
                    <button className="chain-log-btn" onClick={handleCopy} title="Copy logs to clipboard">
                        <LuCopy size={13} />
                    </button>
                    <button className="chain-log-btn" onClick={onClear} title="Clear logs">
                        <LuTrash2 size={13} />
                    </button>
                    <button className="chain-log-btn" onClick={onToggleCollapse} title="Collapse log panel">
                        <LuChevronDown size={13} />
                    </button>
                </div>
            </div>

            <div className="chain-log-body" ref={containerRef} onScroll={handleScroll}>
                {filteredLogs.length === 0 ? (
                    <div className="chain-log-empty">
                        {isRunning ? 'Waiting for execution events...' : 'No logs yet. Run the chain to see logs.'}
                    </div>
                ) : (
                    filteredLogs.map((log) => {
                        const style = LOG_TYPE_STYLES[log.type] || LOG_TYPE_STYLES.info;
                        const PrefixIcon = style.Icon;
                        return (
                            <div key={log.id} className={`chain-log-entry chain-log-entry-${log.type}`}>
                                <span className="chain-log-time">{formatTime(log.timestamp)}</span>
                                <span className="chain-log-prefix" style={{ color: style.color }}><PrefixIcon size={12} /></span>
                                {log.nodeLabel && (
                                    <span className="chain-log-node-label">[{log.nodeLabel}]</span>
                                )}
                                <span
                                    className={`chain-log-message ${log.type === 'sql' ? 'chain-log-sql' : ''}`}
                                    style={{ color: style.color }}
                                >
                                    {log.message}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {!pinToBottom && (
                <button
                    className="chain-log-scroll-bottom"
                    onClick={() => { setPinToBottom(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                    title="Scroll to bottom"
                >
                    <LuChevronDown size={14} />
                    <span>Jump to bottom</span>
                </button>
            )}
        </div>
    );
};

export default ChainLogPanel;
