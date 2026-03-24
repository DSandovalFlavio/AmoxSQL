import { LuDatabase, LuCpu, LuClock, LuRows3, LuCommand } from 'react-icons/lu';

const StatusBar = ({ currentDb, dbReadOnly, lastQueryInfo, aiProvider }) => {
    const dbLabel = currentDb === ':memory:' ? 'In-Memory' : currentDb?.split(/[\\/]/).pop() || 'No DB';
    const modeLabel = currentDb === ':memory:' ? '' : (dbReadOnly ? 'RO' : 'RW');

    return (
        <div className="status-bar">
            {/* Left Side */}
            <div className="status-bar-section">
                <div className="status-bar-item accent">
                    <LuDatabase size={11} />
                    <span>{dbLabel}</span>
                    {modeLabel && (
                        <span className="status-bar-badge">{modeLabel}</span>
                    )}
                </div>

                {lastQueryInfo?.executionTime != null && (
                    <>
                        <div className="status-bar-divider" />
                        <div className="status-bar-item">
                            <LuClock size={10} />
                            <span>{lastQueryInfo.executionTime}</span>
                        </div>
                    </>
                )}

                {lastQueryInfo?.rowCount != null && (
                    <>
                        <div className="status-bar-divider" />
                        <div className="status-bar-item">
                            <LuRows3 size={10} />
                            <span>{lastQueryInfo.rowCount.toLocaleString()} rows</span>
                        </div>
                    </>
                )}
            </div>

            {/* Right Side */}
            <div className="status-bar-section">
                {aiProvider && (
                    <>
                        <div className="status-bar-item">
                            <LuCpu size={10} />
                            <span>{aiProvider}</span>
                        </div>
                        <div className="status-bar-divider" />
                    </>
                )}
                <div className="status-bar-item">
                    <LuCommand size={10} />
                    <span>Ctrl+Shift+P</span>
                </div>
            </div>
        </div>
    );
};

export default StatusBar;
