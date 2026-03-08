import { useState, useEffect, useRef } from 'react';
import {
    LuFolder, LuFolderPlus, LuFilePlus, LuRefreshCw,
    LuArrowUp, LuEllipsisVertical, LuFileCode, LuBookOpen,
    LuTable, LuDatabase, LuFile, LuSearch, LuFileSpreadsheet, LuChartBar,
    LuPencil, LuTrash2
} from "react-icons/lu";
import DeleteConfirmModal from './DeleteConfirmModal';
import AlertDialog from './AlertDialog';

const FileExplorer = ({ onFileClick, onFileOpen, onNewFile, onNewFolder, onImportFile, onQueryFile, onEditChart, refreshTrigger }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
    const wrapperRef = useRef(null);

    // Rename State
    const [renamingFile, setRenamingFile] = useState(null); // file object being renamed
    const [renameValue, setRenameValue] = useState('');

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState(null);

    // Alert Modal State
    const [alertData, setAlertData] = useState({ isOpen: false, message: '', title: 'Error', type: 'error' });

    useEffect(() => {
        fetchFiles(currentPath);
    }, [currentPath]);

    // Refresh when parent triggers (e.g. after folder creation)
    useEffect(() => {
        if (refreshTrigger > 0) fetchFiles(currentPath);
    }, [refreshTrigger]);

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
        if (renamingFile) return; // Don't navigate while renaming
        if (file.isDirectory) {
            setCurrentPath(file.path.replace(/\\/g, '/'));
        } else {
            const lowerName = file.name.toLowerCase();
            // SQL scripts & notebooks → open in editor
            if (lowerName.endsWith('.sql') || lowerName.endsWith('.sqlnb')) {
                onFileOpen(file.path);
                // Chart configs → open chart editor
            } else if (lowerName.endsWith('.amoxvis')) {
                onEditChart && onEditChart(file.path);
                // Data files → open as direct query (SELECT * FROM ... LIMIT 100)
            } else if (lowerName.match(/\.(csv|parquet|json|xlsx|xls)$/)) {
                onQueryFile && onQueryFile(file.path);
                // Everything else → open as text
            } else {
                onFileOpen(file.path);
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

    // --- Rename Logic ---
    const startRename = (file) => {
        setRenamingFile(file);
        setRenameValue(file.name);
        setContextMenu(null);
    };

    const commitRename = async () => {
        if (!renamingFile || !renameValue.trim() || renameValue === renamingFile.name) {
            setRenamingFile(null);
            return;
        }

        try {
            const oldPath = renamingFile.path;
            // Build new path: same directory, new name
            const pathParts = oldPath.replace(/\\/g, '/').split('/');
            pathParts[pathParts.length - 1] = renameValue.trim();
            const newPath = pathParts.join('/');

            const response = await fetch('http://localhost:3001/api/file/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newPath })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Rename failed');
            }

            setRenamingFile(null);
            fetchFiles(currentPath);
        } catch (err) {
            setAlertData({ isOpen: true, message: `Rename failed: ${err.message}`, title: 'Rename Error', type: 'error' });
            setRenamingFile(null);
        }
    };

    // --- Delete Logic ---
    const handleDeleteClick = (file) => {
        setContextMenu(null);
        setFileToDelete(file);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!fileToDelete) return;
        const response = await fetch('http://localhost:3001/api/file/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fileToDelete.path, isDirectory: fileToDelete.isDirectory })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Delete failed');
        }

        fetchFiles(currentPath);
        setFileToDelete(null);
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
            <div style={{ padding: '8px 16px 10px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {/* Breadcrumbs Navigation */}
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap', minHeight: '20px' }}>
                    <span
                        onClick={() => setCurrentPath('')}
                        style={{
                            fontSize: '11px', color: currentPath ? 'var(--accent-color-user)' : 'var(--text-active)',
                            cursor: 'pointer', padding: '1px 4px', borderRadius: '3px',
                            transition: 'background-color 120ms ease', fontWeight: currentPath ? '400' : '600'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        /
                    </span>
                    {currentPath && currentPath.split('/').filter(Boolean).map((segment, idx, arr) => {
                        const segmentPath = arr.slice(0, idx + 1).join('/');
                        const isLast = idx === arr.length - 1;
                        return (
                            <span key={segmentPath} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>›</span>
                                <span
                                    onClick={() => { if (!isLast) setCurrentPath(segmentPath); }}
                                    style={{
                                        fontSize: '11px',
                                        color: isLast ? 'var(--text-active)' : 'var(--accent-color-user)',
                                        cursor: isLast ? 'default' : 'pointer',
                                        padding: '1px 4px', borderRadius: '3px',
                                        fontWeight: isLast ? '600' : '400',
                                        transition: 'background-color 120ms ease',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        maxWidth: '100px'
                                    }}
                                    onMouseOver={(e) => { if (!isLast) e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    title={segment}
                                >
                                    {segment}
                                </span>
                            </span>
                        );
                    })}
                </div>
                <div style={{ position: 'relative', marginTop: '4px' }}>
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
                {!loading && !error && files.length === 0 && (
                    <div style={{ padding: '32px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <LuFolder size={32} color="var(--text-muted)" style={{ opacity: 0.4 }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>This folder is empty</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                onClick={() => onNewFile(currentPath, 'sql')}
                                style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', fontWeight: '600' }}
                            >
                                New SQL File
                            </button>
                            <button
                                onClick={() => onNewFolder(currentPath)}
                                style={{ fontSize: '11px', padding: '4px 10px' }}
                            >
                                New Folder
                            </button>
                        </div>
                    </div>
                )}
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
                        {renamingFile && renamingFile.name === file.name ? (
                            <input
                                autoFocus
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename();
                                    if (e.key === 'Escape') setRenamingFile(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    flex: 1,
                                    background: 'var(--input-bg)',
                                    color: 'var(--text-active)',
                                    border: '1px solid var(--accent-color-user)',
                                    borderRadius: '2px',
                                    padding: '1px 4px',
                                    fontSize: '13px',
                                    outline: 'none',
                                    minWidth: 0
                                }}
                            />
                        ) : (
                            <>
                                {file.name}
                                <span
                                    style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)', cursor: 'context-menu', padding: '0 5px', display: 'flex', alignItems: 'center' }}
                                    onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                                >
                                    <LuEllipsisVertical size={14} />
                                </span>
                            </>
                        )}
                    </li>
                ))}
            </ul>

            {/* Context Menu Overlay */}
            {contextMenu && (
                <div style={{
                    position: 'fixed',
                    top: contextMenu.y,
                    left: contextMenu.x,
                    backgroundColor: 'var(--surface-overlay)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                    boxShadow: 'var(--shadow-md)',
                    zIndex: 9999,
                    minWidth: '180px',
                    padding: '4px',
                    backdropFilter: 'blur(12px)'
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
                    {/* Direct Query Option for data files */}
                    {contextMenu.file.name.match(/\.(csv|xlsx|xls|parquet|json)$/i) && (
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
                    {/* Rename */}
                    <div
                        onClick={() => startRename(contextMenu.file)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="context-menu-item"
                    >
                        <LuPencil size={14} /> Rename
                    </div>
                    {/* Delete */}
                    <div
                        onClick={() => handleDeleteClick(contextMenu.file)}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#e06c75', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="context-menu-item"
                    >
                        <LuTrash2 size={14} /> Delete
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                itemName={fileToDelete?.name}
                itemType={fileToDelete?.isDirectory ? 'Folder' : 'File'}
            />

            <AlertDialog
                isOpen={alertData.isOpen}
                onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))}
                title={alertData.title}
                message={alertData.message}
                type={alertData.type}
            />
        </div>
    );
};

export default FileExplorer;
