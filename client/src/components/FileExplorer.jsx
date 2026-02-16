import { useState, useEffect, useRef } from 'react';

const FileExplorer = ({ onFileClick, onFileOpen, onNewFile, onNewFolder, onImportFile, onQueryFile }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
        if (file.isDirectory) return '📁';
        if (file.name.toLowerCase().endsWith('.sql')) return '📄';
        if (file.name.toLowerCase().endsWith('.sqlnb')) return '📓';
        if (file.name.match(/\.(csv|parquet|json)$/i)) return '📊';
        if (file.name.match(/\.(duckdb|db)$/i)) return '🦆';
        return '📃';
    };

    return (
        <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header: Matches DatabaseExplorer style */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', height: '32px' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: '#00ffff' }}>
                    Files
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => onNewFile(currentPath, 'sql')} title="New SQL File" style={{ padding: '0', background: 'transparent', color: '#909296', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                        +📄
                    </button>
                    <button onClick={() => onNewFile(currentPath, 'sqlnb')} title="New SQL Notebook" style={{ padding: '0', background: 'transparent', color: '#909296', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                        +📓
                    </button>
                    <button onClick={() => onNewFolder(currentPath)} title="New Folder" style={{ padding: '0', background: 'transparent', color: '#909296', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                        +📁
                    </button>
                    <button onClick={() => fetchFiles(currentPath)} title="Refresh" style={{ padding: '0', background: 'transparent', color: '#909296', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                        ↻
                    </button>
                </div>
            </div>
            <div style={{ padding: '5px 20px', borderBottom: '1px solid #333', display: 'flex', gap: '5px', alignItems: 'center' }}>
                <button onClick={handleUp} disabled={!currentPath} style={{ padding: '2px 5px', fontSize: '10px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer' }}>
                    ⬆
                </button>
                <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#aaa', whiteSpace: 'nowrap' }}>
                    {currentPath ? `/${currentPath}` : '/ (Root)'}
                </span>
            </div>
            <ul className="file-list">
                {loading && <div style={{ padding: '10px', color: '#888' }}>Loading...</div>}
                {error && <div style={{ color: 'red', padding: '10px' }}>{error}</div>}
                {!loading && !error && files.map((file) => (
                    <li
                        key={file.name}
                        className={`file-item`}
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
                            style={{ marginLeft: 'auto', fontSize: '12px', color: '#666', cursor: 'context-menu', padding: '0 5px' }}
                            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                        >
                            ⋮
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
                    backgroundColor: '#2b2d30',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    zIndex: 9999,
                    minWidth: '150px'
                }}>
                    {/* Menu Items */}
                    {contextMenu.file.name.match(/\.(csv|parquet|json|xlsx|xls)$/i) && (
                        <div
                            onClick={() => onImportFile(contextMenu.file.path, false)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#fff', borderBottom: '1px solid #333' }}
                            className="context-menu-item"
                        >
                            📥 Import to Database...
                        </div>
                    )}
                    {/* Direct Query Option for CSVs */}
                    {contextMenu.file.name.match(/\.(csv)$/i) && (
                        <div
                            onClick={() => onQueryFile(contextMenu.file.path)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#fff', borderBottom: '1px solid #333' }}
                            className="context-menu-item"
                        >
                            🔎 Direct Query
                        </div>
                    )}

                    {/* Folder Options */}
                    {contextMenu.file.isDirectory && (
                        <div
                            onClick={() => onImportFile(contextMenu.file.path, true)}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#fff', borderBottom: '1px solid #333' }}
                            className="context-menu-item"
                        >
                            📥 Import Folder to Database...
                        </div>
                    )}
                    {/* Generic */}
                    <div
                        onClick={() => { /* Rename logic todo */ console.log("Rename not implemented yet"); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#bbb' }}
                    >
                        ✏️ Rename
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileExplorer;
