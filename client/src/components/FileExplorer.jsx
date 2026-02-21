import { useState, useEffect, useRef } from 'react';
import {
    LuFolder, LuFolderPlus, LuFilePlus, LuRefreshCw,
    LuArrowUp, LuEllipsisVertical, LuFileCode, LuBookOpen,
    LuTable, LuDatabase, LuFile, LuSearch, LuFileSpreadsheet, LuChartBar
} from "react-icons/lu";

const FileExplorer = ({ onFileClick, onFileOpen, onNewFile, onNewFolder, onImportFile, onQueryFile, onEditChart }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
    const wrapperRef = useRef(null);

    useEffect(() => {
        fetchFiles(currentPath);
    }, [currentPath]);

    useEffect(() => {
        // Close context menu on click outside
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);


    const fetchFiles = async (path) => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`http://localhost:3001/api/files?path=${encodeURIComponent(path)}`);
            if (!response.ok) throw new Error('Failed to fetch files');
            let data = await response.json();

            // FILTER: Hide Database files
            data = data.filter(f => !f.name.endsWith('.duckdb') && !f.name.endsWith('.db'));

            // Sort: directories first, then files
            data.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });
            setFiles(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (file) => {
        if (file.isDirectory) {
            setCurrentPath(file.path.replace(/\\/g, '/'));
        } else {
            // Check extension
            if (file.name.toLowerCase().endsWith('.sql') || file.name.toLowerCase().endsWith('.sqlnb')) {
                onFileOpen(file.path);
            } else {
                onFileClick(file.path);
            }
        }
    };



    const handleUp = () => {
        if (!currentPath) return;
        const parts = currentPath.split('/');
        parts.pop();
        setCurrentPath(parts.join('/'));
    };

    const handleContextMenu = (e, file) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            file: file
        });
    };

    const getIcon = (file) => {
        const lowerName = file.name.toLowerCase();
        if (file.isDirectory) return <LuFolder size={14} color="#E8BD36" />;
        if (lowerName.endsWith('.sql')) return <LuFileCode size={14} color="#4FC1FF" />;
        if (lowerName.endsWith('.sqlnb')) return <LuBookOpen size={14} color="#9CDCFE" />;
        if (lowerName.endsWith('.amoxvis')) return <LuChartBar size={14} color="#FF69B4" />;
        if (lowerName.match(/\.(xlsx|xls|csv)$/i)) return <LuFileSpreadsheet size={14} color="#217346" />; // Green for Excel
        if (lowerName.match(/\.(parquet|json)$/i)) return <LuTable size={14} color="#CE9178" />;
        if (lowerName.match(/\.(duckdb|db)$/i)) return <LuDatabase size={14} color="#DCDCAA" />;
        return <LuFile size={14} color="#CCCCCC" />;
    };

    return (
        <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header: Matches DatabaseExplorer style */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', height: '32px' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Files
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => onNewFile(currentPath, 'sql')} title="New SQL File" style={{ padding: '0', background: 'transparent', color: 'var(--text-color)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <LuFilePlus size={14} />
                    </button>
                    <button onClick={() => onNewFile(currentPath, 'sqlnb')} title="New SQL Notebook" style={{ padding: '0', background: 'transparent', color: 'var(--text-color)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <LuBookOpen size={14} />
                    </button>
                    <button onClick={() => onNewFolder(currentPath)} title="New Folder" style={{ padding: '0', background: 'transparent', color: 'var(--text-color)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <LuFolderPlus size={14} />
                    </button>
                    <button onClick={() => fetchFiles(currentPath)} title="Refresh" style={{ padding: '0', background: 'transparent', color: 'var(--text-color)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <LuRefreshCw size={14} />
                    </button>
                </div>
            </div>
            <div style={{ padding: '5px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <button onClick={handleUp} disabled={!currentPath} style={{ padding: '2px 5px', fontSize: '10px', background: 'var(--sidebar-item-active-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <LuArrowUp size={10} />
                    </button>
                    <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {currentPath ? `/${currentPath}` : '/ (Root)'}
                    </span>
                </div>
                <div style={{ position: 'relative', marginTop: '5px' }}>
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            backgroundColor: 'var(--input-bg)',
                            color: 'var(--text-active)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            padding: '4px 8px 4px 24px',
                            fontSize: '11px',
                            outline: 'none'
                        }}
                    />
                    <LuSearch size={12} color="var(--text-muted)" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                </div>
            </div>
            <ul className="file-list">
                {loading && <div style={{ padding: '10px', color: 'var(--text-muted)' }}>Loading...</div>}
                {error && <div style={{ color: 'red', padding: '10px' }}>{error}</div>}
                {!loading && !error && files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((file) => (
                    <li
                        key={file.name}
                        className={`file-item`}
                        draggable={!file.isDirectory}
                        onDragStart={(e) => {
                            if (!file.isDirectory) {
                                e.dataTransfer.setData('text/plain', file.name);
                                e.dataTransfer.setData('application/json', JSON.stringify({ type: 'file', path: file.path, name: file.name }));
                            }
                        }}
                        onClick={() => handleNavigate(file)}
                        onContextMenu={(e) => handleContextMenu(e, file)}
                        title={file.name}
                    >
                        <span className="icon">
                            {getIcon(file)}
                        </span>
                        {file.name}
                        {/* Context Menu Trigger Hint (Three dots) - visible on hover via CSS usually, hard to do inline easily. 
                 Instead relying on Right Click as requested standard, but user asked for "three dots". 
                 Let's add a small dots button that appears or is always there. */}
                        <span
                            style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', cursor: 'context-menu', padding: '0 5px', display: 'flex', alignItems: 'center' }}
                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                        >
                            <LuEllipsisVertical size={14} />
                        </span>
                    </li>
                ))}
            </ul>

            {/* Context Menu Overlay */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    backgroundColor: 'var(--modal-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    zIndex: 9999,
                    minWidth: '150px'
                }}>
                    {/* Menu Items */}
                    {contextMenu.file.name.match(/\.(csv|parquet|json|xlsx|xls)$/i) && (
                        <div
                            onClick={() => onImportFile(contextMenu.file.path, false)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="context-menu-item"
                        >
                            <LuDatabase size={14} /> Import to Database...
                        </div>
                    )}
                    {/* Direct Query Option for CSVs */}
                    {contextMenu.file.name.match(/\.(csv)$/i) && (
                        <div
                            onClick={() => onQueryFile(contextMenu.file.path)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="context-menu-item"
                        >
                            <LuSearch size={14} /> Direct Query
                        </div>
                    )}

                    {/* Amoxvis Edit Charts Option */}
                    {contextMenu.file.name.endsWith('.amoxvis') && (
                        <div
                            onClick={() => onEditChart && onEditChart(contextMenu.file.path)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="context-menu-item"
                        >
                            <LuChartBar size={14} /> Edit Chart
                        </div>
                    )}

                    {/* Folder Options */}
                    {contextMenu.file.isDirectory && (
                        <div
                            onClick={() => onImportFile(contextMenu.file.path, true)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="context-menu-item"
                        >
                            <LuDatabase size={14} /> Import Folder to Database...
                        </div>
                    )}
                    {/* Generic */}
                    <div
                        onClick={() => { /* Rename logic todo */ console.log("Rename not implemented yet"); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <LuFileCode size={14} /> Rename
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileExplorer;
