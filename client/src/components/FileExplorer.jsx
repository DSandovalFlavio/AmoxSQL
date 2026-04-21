import { useState, useEffect, useRef, memo, useDeferredValue } from 'react';
import {
    LuFolder, LuFolderPlus, LuFilePlus, LuRefreshCw,
    LuArrowUp, LuEllipsisVertical, LuFileCode, LuBookOpen,
    LuTable, LuDatabase, LuFile, LuSearch, LuFileSpreadsheet, LuChartBar,
    LuPencil, LuTrash2, LuFileText, LuGitBranch, LuCopy, LuClipboard, LuType,
    LuLayoutList, LuLayers, LuCode
} from "react-icons/lu";
import DeleteConfirmModal from './DeleteConfirmModal';
import AlertDialog from './AlertDialog';
import FilePreviewModal from './FilePreviewModal';

const FileExplorer = ({ editorSettings = {}, onFileClick, onFileOpen, onNewFile, onNewFolder, onImportFile, onQueryFile, onPreviewFile, onEditChart, onEditChartWithSql, refreshTrigger }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);

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

    // File Preview State
    const [previewFilePath, setPreviewFilePath] = useState(null);

    // Sort/Group State
    const [sortMode, setSortMode] = useState(() => localStorage.getItem('amoxsql-fe-sort') || editorSettings?.defaultExplorerSort || 'default'); // 'default' | 'type' | 'name'

    useEffect(() => {
        if (editorSettings?.defaultExplorerSort && !localStorage.getItem('amoxsql-fe-sort')) {
            setSortMode(editorSettings.defaultExplorerSort);
        }
    }, [editorSettings?.defaultExplorerSort]);

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
            // SQL scripts & notebooks & markdown files → open in editor
            if (lowerName.endsWith('.sql') || lowerName.endsWith('.sqlnb') || lowerName.endsWith('.sqlchain') || lowerName.endsWith('.md')) {
                onFileOpen(file.path);
                // Chart configs → open chart editor
            } else if (lowerName.endsWith('.amoxvis')) {
                onEditChart && onEditChart(file.path);
                // Excel -> always open as direct query (SELECT * FROM ... LIMIT 100)
            } else if (lowerName.match(/\.(xlsx|xls)$/)) {
                onQueryFile && onQueryFile(file.path);
                // Structured Data Files → check user settings for preview vs query
            } else if (lowerName.match(/\.(csv|parquet|json)$/)) {
                const action = editorSettings?.defaultDataFileAction || 'preview';
                if (action === 'preview') {
                    setPreviewFilePath(file.path);
                } else {
                    onQueryFile && onQueryFile(file.path);
                }
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
        if (file.isDirectory) return <LuFolder size={14} color="var(--icon-folder)" />;
        if (lowerName.endsWith('.sql')) return <LuFileCode size={14} color="var(--icon-sql)" />;
        if (lowerName.endsWith('.sqlnb')) return <LuBookOpen size={14} color="var(--icon-notebook)" />;
        if (lowerName.endsWith('.sqlchain')) return <LuGitBranch size={14} color="var(--accent-primary)" />;
        if (lowerName.endsWith('.md')) return <LuFileText size={14} color="var(--icon-md)" />;
        if (lowerName.endsWith('.amoxvis')) return <LuChartBar size={14} color="var(--icon-parquet)" />;
        if (lowerName.match(/\.(xlsx|xls)$/i)) return <LuFileSpreadsheet size={14} color="var(--icon-excel)" />;
        if (lowerName.match(/\.csv$/i)) return <LuFileSpreadsheet size={14} color="var(--icon-csv)" />;
        if (lowerName.match(/\.parquet$/i)) return <LuTable size={14} color="var(--icon-parquet)" />;
        if (lowerName.match(/\.json$/i)) return <LuTable size={14} color="var(--icon-json)" />;
        if (lowerName.match(/\.(duckdb|db)$/i)) return <LuDatabase size={14} color="var(--icon-default)" />;
        return <LuFile size={14} color="var(--icon-default)" />;
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // --- Sort / Group helpers ---
    const getFileTypeGroup = (file) => {
        if (file.isDirectory) return '0_Folders';
        const n = file.name.toLowerCase();
        if (n.endsWith('.sql')) return '1_SQL Scripts';
        if (n.endsWith('.sqlnb')) return '2_Notebooks';
        if (n.endsWith('.sqlchain')) return '3_Chains';
        if (n.match(/\.(csv|parquet)$/)) return '4_Data Files';
        if (n.match(/\.(xlsx|xls|json)$/)) return '4_Data Files';
        if (n.endsWith('.amoxvis')) return '5_Charts';
        if (n.endsWith('.md')) return '6_Markdown';
        return '7_Other';
    };

    const sortedFiles = (() => {
        const filtered = files.filter(f => f.name.toLowerCase().includes(deferredSearchQuery.toLowerCase()));
        if (sortMode === 'name') {
            return [...filtered].sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        }
        if (sortMode === 'type') {
            return [...filtered].sort((a, b) => {
                const ga = getFileTypeGroup(a), gb = getFileTypeGroup(b);
                if (ga !== gb) return ga.localeCompare(gb);
                return a.name.localeCompare(b.name);
            });
        }
        // default: dirs first, then alpha
        return filtered;
    })();

    // Group by type when sortMode === 'type'
    const groupedFiles = (() => {
        if (sortMode !== 'type') return null;
        const groups = {};
        sortedFiles.forEach(f => {
            const g = getFileTypeGroup(f);
            const label = g.replace(/^\d+_/, ''); // strip sort prefix
            if (!groups[label]) groups[label] = [];
            groups[label].push(f);
        });
        return groups;
    })();

    const cycleSortMode = () => {
        const next = sortMode === 'default' ? 'name' : sortMode === 'name' ? 'type' : 'default';
        setSortMode(next);
        localStorage.setItem('amoxsql-fe-sort', next);
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
            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Files
                </span>
                <div className="fe-header-actions">
                    <button onClick={() => onNewFile(currentPath, 'sql')} title="New SQL File" className="fe-header-btn">
                        <LuFilePlus size={13} />
                    </button>
                    <button onClick={() => onNewFile(currentPath, 'sqlnb')} title="New SQL Notebook" className="fe-header-btn">
                        <LuBookOpen size={13} />
                    </button>
                    <button onClick={() => onNewFile(currentPath, 'md')} title="New Markdown" className="fe-header-btn">
                        <LuFileText size={13} />
                    </button>
                    <button onClick={() => onNewFolder(currentPath)} title="New Folder" className="fe-header-btn">
                        <LuFolderPlus size={13} />
                    </button>
                    <button
                        onClick={cycleSortMode}
                        title={sortMode === 'default' ? 'Sort: Default (dirs first)' : sortMode === 'name' ? 'Sort: By Name' : 'Sort: By Type (grouped)'}
                        className="fe-header-btn"
                        style={{ color: sortMode !== 'default' ? 'var(--accent-primary)' : undefined }}
                    >
                        {sortMode === 'type' ? <LuLayers size={13} /> : <LuLayoutList size={13} />}
                    </button>
                    <button onClick={() => fetchFiles(currentPath)} title="Refresh" className="fe-header-btn">
                        <LuRefreshCw size={13} />
                    </button>
                </div>
            </div>

            {/* Breadcrumb + Search */}
            <div className="fe-nav-section">
                {/* Breadcrumbs */}
                <div className="fe-breadcrumb">
                    {currentPath && (
                        <button onClick={handleUp} className="fe-breadcrumb-up" title="Go up">
                            <LuArrowUp size={12} />
                        </button>
                    )}
                    <span
                        onClick={() => setCurrentPath('')}
                        className="fe-breadcrumb-segment"
                        style={{ fontWeight: currentPath ? '400' : '600', color: currentPath ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                    >
                        /
                    </span>
                    {currentPath && currentPath.split('/').filter(Boolean).map((segment, idx, arr) => {
                        const segmentPath = arr.slice(0, idx + 1).join('/');
                        const isLast = idx === arr.length - 1;
                        return (
                            <span key={segmentPath} className="fe-breadcrumb-part">
                                <span className="fe-breadcrumb-sep">/</span>
                                <span
                                    onClick={() => { if (!isLast) setCurrentPath(segmentPath); }}
                                    className={`fe-breadcrumb-segment${isLast ? ' active' : ''}`}
                                    title={segment}
                                >
                                    {segment}
                                </span>
                            </span>
                        );
                    })}
                </div>

                {/* Search */}
                <div className="fe-search">
                    <LuSearch size={12} className="fe-search-icon" />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="fe-search-input"
                    />
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
                {!loading && !error && (() => {
                    const renderFileItem = (file) => (
                        <li
                            key={file.path}
                            className="file-item"
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
                            <span className="icon">{getIcon(file)}</span>
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
                            ) : (() => {
                                const lastDot = file.name.lastIndexOf('.');
                                const hasExt = !file.isDirectory && lastDot > 0;
                                const baseName = hasExt ? file.name.substring(0, lastDot) : file.name;
                                const extName = hasExt ? file.name.substring(lastDot) : '';
                                return (
                                <>
                                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseName}</span>
                                        <span style={{ flexShrink: 0 }}>{extName}</span>
                                    </span>
                                    {(editorSettings?.showFileSizes ?? true) && file.sizeBytes != null && (
                                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px', flexShrink: 0 }}>
                                            {formatBytes(file.sizeBytes)}
                                        </span>
                                    )}
                                    <span
                                        style={{ marginLeft: 'auto', flexShrink: 0, fontSize: '12px', color: 'var(--text-muted)', cursor: 'context-menu', padding: '0 0 0 5px', display: 'flex', alignItems: 'center' }}
                                        onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                                    >
                                        <LuEllipsisVertical size={14} />
                                    </span>
                                </>
                                );
                            })()}
                        </li>
                    );

                    if (groupedFiles) {
                        // Grouped by type view
                        return Object.entries(groupedFiles).map(([groupLabel, groupItems]) => (
                            <div key={groupLabel}>
                                <div style={{
                                    padding: '4px 10px 2px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    color: 'var(--text-muted)',
                                    userSelect: 'none',
                                    marginTop: '4px',
                                }}>
                                    {groupLabel}
                                </div>
                                {groupItems.map(renderFileItem)}
                            </div>
                        ));
                    }
                    return sortedFiles.map(renderFileItem);
                })()}
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
                    {/* Quick Preview — CSV/Parquet/JSON: shows modal with first 100 rows */}
                    {contextMenu.file.name.match(/\.(csv|parquet|json)$/i) && (
                        <div
                            onClick={() => { setPreviewFilePath(contextMenu.file.path); setContextMenu(null); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="context-menu-item"
                        >
                            <LuFileSpreadsheet size={14} /> Quick Preview
                        </div>
                    )}
                    {/* Direct Query Option for data files */}
                    {contextMenu.file.name.match(/\.(csv|xlsx|xls|parquet|json)$/i) && (
                        <div
                            onClick={() => { onQueryFile(contextMenu.file.path); setContextMenu(null); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                            className="context-menu-item"
                        >
                            <LuSearch size={14} /> Direct Query
                        </div>
                    )}

                    {/* Amoxvis Edit Charts Option */}
                    {contextMenu.file.name.endsWith('.amoxvis') && (
                        <>
                            <div
                                onClick={() => onEditChart && onEditChart(contextMenu.file.path)}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                                className="context-menu-item"
                            >
                                <LuChartBar size={14} /> Open Chart
                            </div>
                            <div
                                onClick={() => onEditChartWithSql && onEditChartWithSql(contextMenu.file.path)}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                                className="context-menu-item"
                            >
                                <LuCode size={14} /> Edit with SQL
                            </div>
                        </>
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
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--color-destructive)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="context-menu-item"
                    >
                        <LuTrash2 size={14} /> Delete
                    </div>

                    {/* Separator */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-default)', margin: '4px 8px' }} />

                    {/* Copy Path */}
                    <div
                        onClick={() => { navigator.clipboard.writeText(contextMenu.file.path.replace(/\//g, '/')); setContextMenu(null); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="context-menu-item"
                    >
                        <LuCopy size={14} /> Copy Path
                    </div>
                    {/* Copy Relative Path */}
                    <div
                        onClick={() => { navigator.clipboard.writeText(contextMenu.file.path.replace(/\\/g, '/')); setContextMenu(null); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="context-menu-item"
                    >
                        <LuClipboard size={14} /> Copy Relative Path
                    </div>
                    {/* Copy Name */}
                    <div
                        onClick={() => { navigator.clipboard.writeText(contextMenu.file.name); setContextMenu(null); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '8px' }}
                        className="context-menu-item"
                    >
                        <LuType size={14} /> Copy Name
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

            {previewFilePath && (
                <FilePreviewModal
                    filePath={previewFilePath}
                    onClose={() => setPreviewFilePath(null)}
                />
            )}
        </div>
    );
};

export default memo(FileExplorer);
