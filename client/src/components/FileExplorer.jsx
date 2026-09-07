import { API_BASE } from '../api.js';
import { useState, useEffect, useRef, memo, useDeferredValue, useLayoutEffect, useCallback } from 'react';
import {
    LuFolder, LuFolderPlus, LuFilePlus, LuRefreshCw,
    LuArrowUp, LuEllipsisVertical, LuFileCode, LuBookOpen,
    LuTable, LuDatabase, LuFile, LuSearch, LuFileSpreadsheet, LuChartBar,
    LuPencil, LuTrash2, LuFileText, LuGitBranch, LuCopy, LuClipboard, LuType,
    LuLayoutList, LuLayers, LuCode, LuColumns3, LuLoader, LuBrain,
    LuFileCode2, LuPackage, LuBot,
    LuFolderInput, LuEyeOff, LuExternalLink, LuScissors, LuCheck, LuSquare, LuSquareCheck, LuFiles, LuSparkles,
    LuPresentation
} from "react-icons/lu";
import DeleteConfirmModal from './DeleteConfirmModal';
import AlertDialog from './AlertDialog';
import FilePreviewModal from './FilePreviewModal';
import ExportAiContextModal from './ExportAiContextModal';
import ExportDataModal from './ExportDataModal';
import GSheetsSection from './GSheetsSection';

const FileExplorer = ({ editorSettings = {}, onFileClick, onFileOpen, onNewFile, onNewFolder, onImportFile, onQueryFile, onQuerySql, onPreviewFile, onEditChart, onEditChartWithSql, onCreateNotebookFromFiles, refreshTrigger }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearchQuery = useDeferredValue(searchQuery);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
    const contextMenuRef = useRef(null);
    const wrapperRef = useRef(null);

    // Auto-reposition context menu if it overflows the viewport
    useLayoutEffect(() => {
        if (!contextMenu || !contextMenuRef.current) return;
        const el = contextMenuRef.current;
        const rect = el.getBoundingClientRect();
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;
        const pad = 8; // safety padding from viewport edges
        let newY = contextMenu.y;
        let newX = contextMenu.x;

        // Flip vertically if overflowing bottom
        if (rect.bottom > viewH - pad) {
            newY = Math.max(pad, contextMenu.y - rect.height);
        }
        // Nudge left if overflowing right
        if (rect.right > viewW - pad) {
            newX = Math.max(pad, viewW - rect.width - pad);
        }

        if (newY !== contextMenu.y || newX !== contextMenu.x) {
            el.style.top = `${newY}px`;
            el.style.left = `${newX}px`;
        }
    }, [contextMenu]);

    // Rename State
    const [renamingFile, setRenamingFile] = useState(null); // file object being renamed
    const [renameValue, setRenameValue] = useState('');

    // Delete Modal State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState(null);
    const [deleteTargets, setDeleteTargets] = useState([]); // bulk delete: all files to remove

    // Alert Modal State
    const [alertData, setAlertData] = useState({ isOpen: false, message: '', title: 'Error', type: 'error' });

    // File Preview State
    const [previewFilePath, setPreviewFilePath] = useState(null);
    const [aiContextFile, setAiContextFile] = useState(null); // { path, name } for Export for AI
    const [exportSqlQuery, setExportSqlQuery] = useState(null); // string SQL for "Export results…" on a .sql file
    const [linkedChartsLoading, setLinkedChartsLoading] = useState(false);
    // Fase 3 — procedencia, reverse lookup: { x, y, charts: [{name, path}] }
    // popover listing the .amoxvis files linked to a .sql file, opened from
    // its context menu when there's more than one (a single match opens
    // directly, no popover needed).
    const [linkedChartsMenu, setLinkedChartsMenu] = useState(null);
    const [exportSqlLoading, setExportSqlLoading] = useState(false);

    // Column Copy Loading State
    const [copyingColumns, setCopyingColumns] = useState(false);

    // Drag & Drop State
    const [dragOverFolder, setDragOverFolder] = useState(null); // path of folder being hovered

    // Multi-select State
    const [selectedFiles, setSelectedFiles] = useState(new Set());
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const lastClickedRef = useRef(null);

    // Clipboard State (Cut / Copy)
    const [clipboardFiles, setClipboardFiles] = useState([]); // [{path, name, isDirectory}]
    const [clipboardMode, setClipboardMode] = useState(null); // 'cut' | 'copy' | null

    // Move-to modal
    const [moveToModal, setMoveToModal] = useState(null); // { files: [...] }
    const [folderList, setFolderList] = useState([]);

    // Git status badges: Map<relativePath → statusLetter>
    const [gitStatusMap, setGitStatusMap] = useState({});

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
        // Close context menu (and the linked-charts popover) on click outside
        const handleClick = () => { setContextMenu(null); setLinkedChartsMenu(null); };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);


    const fetchGitStatus = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/git/status`);
            const data = await res.json();
            if (!data.isRepo || !Array.isArray(data.files)) { setGitStatusMap({}); return; }
            const map = {};
            for (const f of data.files) {
                // Normalize separators, use last segment + relative path as key
                const norm = f.path.replace(/\\/g, '/');
                map[norm] = f.status;
            }
            setGitStatusMap(map);
        } catch { /* git unavailable or no repo — silent */ }
    };

    const fetchFiles = async (path, { silent = false } = {}) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_BASE}/api/files?path=${encodeURIComponent(path)}`);
            if (!response.ok) throw new Error('Failed to fetch files');
            let data = await response.json();

            // FILTER: Hide Database files
            data = data.filter(f => !f.name.endsWith('.duckdb') && !f.name.endsWith('.db') && !f.name.endsWith('.ducklake'));

            // Sort: directories first, then files
            data.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });
            setFiles(data);
            fetchGitStatus(); // non-blocking — update badges independently
        } catch (err) {
            setError(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleNavigate = (file) => {
        if (renamingFile) return; // Don't navigate while renaming
        if (file.isDirectory) {
            setCurrentPath(file.path.replace(/\\/g, '/'));
        } else {
            const lowerName = file.name.toLowerCase();
            // SQL scripts & notebooks & markdown & deck files → open in editor
            if (lowerName.endsWith('.sql') || lowerName.endsWith('.sqlnb') || lowerName.endsWith('.sqlchain') || lowerName.endsWith('.md') || lowerName.endsWith('.amoxdeck')) {
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

    // Special folder icons for canonical workspace folders
    const SPECIAL_FOLDER_ICONS = {
        queries:   <LuFileCode2 size={14} color="var(--icon-sql)" />,
        notebooks: <LuBookOpen  size={14} color="var(--icon-notebook)" />,
        charts:    <LuChartBar  size={14} color="var(--icon-parquet)" />,
        chains:    <LuGitBranch size={14} color="var(--accent-primary)" />,
        data:      <LuDatabase  size={14} color="var(--icon-sql)" />,
        exports:   <LuPackage   size={14} color="var(--text-muted)" />,
        context:   <LuBrain     size={14} color="var(--accent-primary)" />,
        agent:     <LuBot       size={14} color="var(--accent-primary)" />,
    };

    const getIcon = (file) => {
        const lowerName = file.name.toLowerCase();
        if (file.isDirectory) {
            if (SPECIAL_FOLDER_ICONS[lowerName]) return SPECIAL_FOLDER_ICONS[lowerName];
            return <LuFolder size={14} color="var(--icon-folder)" />;
        }
        if (lowerName.endsWith('.sql')) return <LuFileCode size={14} color="var(--icon-sql)" />;
        if (lowerName.endsWith('.sqlnb')) return <LuBookOpen size={14} color="var(--icon-notebook)" />;
        if (lowerName.endsWith('.sqlchain')) return <LuGitBranch size={14} color="var(--accent-primary)" />;
        if (lowerName.endsWith('.md')) return <LuFileText size={14} color="var(--icon-md)" />;
        if (lowerName.endsWith('.amoxdeck')) return <LuPresentation size={14} color="var(--accent-primary)" />;
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
    const SORT_MODES = ['default', 'name', 'type', 'extension', 'size'];
    const SORT_LABELS = {
        default: 'Default (dirs first)',
        name: 'By Name (A→Z)',
        type: 'By Category',
        extension: 'By Extension',
        size: 'By Size (largest first)'
    };

    const getFileTypeGroup = (file) => {
        if (file.isDirectory) return '0_Folders';
        const n = file.name.toLowerCase();
        if (n.endsWith('.sql')) return '1_SQL Scripts';
        if (n.endsWith('.sqlnb')) return '2_Notebooks';
        if (n.endsWith('.sqlchain')) return '3_Chains';
        if (n.match(/\.(csv|tsv|parquet)$/)) return '4_Tabular Data';
        if (n.match(/\.(json|jsonl|ndjson)$/)) return '5_JSON Data';
        if (n.match(/\.(xlsx|xls)$/)) return '6_Excel';
        if (n.endsWith('.amoxvis')) return '7_Charts';
        if (n.endsWith('.amoxdeck')) return '7b_Decks';
        if (n.match(/\.(md|mdx|txt|rst)$/)) return '8_Documentation';
        if (n.match(/\.(yml|yaml|toml|ini|env|cfg|conf)$/)) return '9_Config';
        return 'A_Other';
    };

    const getExtGroup = (file) => {
        if (file.isDirectory) return '0_Folders';
        const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
        return ext ? `1_.${ext}` : '2_No extension';
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
        if (sortMode === 'extension') {
            return [...filtered].sort((a, b) => {
                const ea = getExtGroup(a), eb = getExtGroup(b);
                if (ea !== eb) return ea.localeCompare(eb);
                return a.name.localeCompare(b.name);
            });
        }
        if (sortMode === 'size') {
            return [...filtered].sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return (b.sizeBytes || 0) - (a.sizeBytes || 0);
            });
        }
        // default: dirs first, then alpha
        return filtered;
    })();

    // Group files when in 'type' or 'extension' mode
    const groupedFiles = (() => {
        if (sortMode !== 'type' && sortMode !== 'extension') return null;
        const groupFn = sortMode === 'type' ? getFileTypeGroup : getExtGroup;
        const groups = {};
        sortedFiles.forEach(f => {
            const g = groupFn(f);
            const label = g.replace(/^\w+_/, ''); // strip sort prefix
            if (!groups[label]) groups[label] = [];
            groups[label].push(f);
        });
        return groups;
    })();

    const cycleSortMode = () => {
        const idx = SORT_MODES.indexOf(sortMode);
        const next = SORT_MODES[(idx + 1) % SORT_MODES.length];
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

            const response = await fetch(`${API_BASE}/api/file/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newPath })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Rename failed');
            }

            setRenamingFile(null);
            fetchFiles(currentPath, { silent: true });
        } catch (err) {
            setAlertData({ isOpen: true, message: `Rename failed: ${err.message}`, title: 'Rename Error', type: 'error' });
            setRenamingFile(null);
        }
    };

    // --- Delete Logic ---
    const handleDeleteClick = (file) => {
        setContextMenu(null);
        // If the clicked file is part of a multi-selection, delete the whole selection.
        const targets = (selectedFiles.size > 1 && selectedFiles.has(file.path))
            ? getSelectedFileObjects()
            : [file];
        setDeleteTargets(targets);
        setFileToDelete(file);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        const targets = deleteTargets.length > 0 ? deleteTargets : (fileToDelete ? [fileToDelete] : []);
        if (targets.length === 0) return;
        const failures = [];
        for (const t of targets) {
            try {
                const response = await fetch(`${API_BASE}/api/file/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: t.path, isDirectory: t.isDirectory })
                });
                if (!response.ok) {
                    const data = await response.json();
                    failures.push(`${t.name}: ${data.error || 'delete failed'}`);
                }
            } catch (err) {
                failures.push(`${t.name}: ${err.message}`);
            }
        }
        fetchFiles(currentPath);
        setFileToDelete(null);
        setDeleteTargets([]);
        setSelectedFiles(new Set());
        if (failures.length > 0) throw new Error(failures.join('\n'));
    };

    // --- Duplicate ---
    const duplicateFile = async (file) => {
        setContextMenu(null);
        try {
            const res = await fetch(`${API_BASE}/api/file/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePath: file.path })
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            fetchFiles(currentPath, { silent: true });
        } catch (err) {
            setAlertData({ isOpen: true, message: `Duplicate failed: ${err.message}`, title: 'Error', type: 'error' });
        }
    };

    // --- Add to .gitignore ---
    const addToGitignore = async (file) => {
        setContextMenu(null);
        const pattern = file.isDirectory ? `${file.path.replace(/\\/g, '/')}/` : file.path.replace(/\\/g, '/');
        try {
            const res = await fetch(`${API_BASE}/api/git/ignore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern })
            });
            const data = await res.json();
            if (data.alreadyExists) {
                setAlertData({ isOpen: true, message: `"${pattern}" is already in .gitignore`, title: 'Info', type: 'info' });
            }
        } catch (err) {
            setAlertData({ isOpen: true, message: `Failed: ${err.message}`, title: 'Error', type: 'error' });
        }
    };

    // --- Reveal in OS Explorer ---
    const revealInExplorer = async (file) => {
        setContextMenu(null);
        try {
            await fetch(`${API_BASE}/api/file/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: file.path })
            });
        } catch { /* silent */ }
    };

    // --- Move To... (opens folder picker) ---
    const openMoveTo = async (filesToMove) => {
        setContextMenu(null);
        try {
            const res = await fetch(`${API_BASE}/api/folders`);
            const folders = await res.json();
            setFolderList(folders);
            setMoveToModal({ files: filesToMove });
        } catch { /* silent */ }
    };

    const executeMoveToFolder = async (destPath) => {
        if (!moveToModal) return;
        try {
            for (const f of moveToModal.files) {
                await fetch(`${API_BASE}/api/file/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourcePath: f.path, destinationDir: destPath })
                });
            }
            fetchFiles(currentPath, { silent: true });
            setSelectedFiles(new Set());
        } catch (err) {
            setAlertData({ isOpen: true, message: `Move failed: ${err.message}`, title: 'Error', type: 'error' });
        } finally {
            setMoveToModal(null);
        }
    };

    // --- Drag & Drop to move ---
    const handleFolderDrop = async (e, targetFolder) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(null);
        try {
            const jsonData = e.dataTransfer.getData('application/json');
            if (!jsonData) return;
            const { path: sourcePath } = JSON.parse(jsonData);
            if (!sourcePath) return;
            const destDir = targetFolder.path;
            // Prevent dropping on self
            if (sourcePath === destDir || sourcePath.startsWith(destDir + '/')) return;

            // Optimistic removal — file disappears instantly
            setFiles(prev => prev.filter(f => f.path !== sourcePath));

            const res = await fetch(`${API_BASE}/api/file/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourcePath, destinationDir: destDir })
            });
            if (!res.ok) {
                const d = await res.json();
                setAlertData({ isOpen: true, message: d.error, title: 'Move Error', type: 'error' });
            }
            fetchFiles(currentPath, { silent: true });
        } catch { /* silent */ }
    };

    // --- Multi-select helpers ---
    const handleFileClick = (e, file) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            e.stopPropagation();
            setMultiSelectMode(true);
            setSelectedFiles(prev => {
                const next = new Set(prev);
                if (next.has(file.path)) next.delete(file.path);
                else next.add(file.path);
                return next;
            });
            lastClickedRef.current = file.path;
            return true; // signal: don't navigate
        }
        if (e.shiftKey && lastClickedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            setMultiSelectMode(true);
            const allPaths = sortedFiles.map(f => f.path);
            const fromIdx = allPaths.indexOf(lastClickedRef.current);
            const toIdx = allPaths.indexOf(file.path);
            if (fromIdx >= 0 && toIdx >= 0) {
                const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
                setSelectedFiles(prev => {
                    const next = new Set(prev);
                    for (let i = start; i <= end; i++) next.add(allPaths[i]);
                    return next;
                });
            }
            return true;
        }
        // Normal click: clear selection
        if (selectedFiles.size > 0) {
            setSelectedFiles(new Set());
            setMultiSelectMode(false);
        }
        lastClickedRef.current = file.path;
        return false;
    };

    const getSelectedFileObjects = () => sortedFiles.filter(f => selectedFiles.has(f.path));

    // Fase 4 — consolidar: turn a multi-selection of .sql / .amoxvis / .md
    // files into one notebook. Each becomes a cell in the SAME order they're
    // listed in the explorer; the notebook opens unsaved in the editor (the
    // editor itself is the preview — the user reviews/reorders/saves from
    // there, same as any other new file) rather than a bespoke dialog.
    const [creatingNotebook, setCreatingNotebook] = useState(false);
    const createNotebookFromSelection = async (files) => {
        if (creatingNotebook || !onCreateNotebookFromFiles) return;
        const supported = files.filter(f => !f.isDirectory && /\.(sql|amoxvis|md)$/i.test(f.name));
        if (supported.length === 0) {
            setAlertData({ isOpen: true, title: 'Create Notebook', type: 'info', message: 'None of the selected files can become notebook cells — pick .sql, .amoxvis, or .md files.' });
            return;
        }
        setCreatingNotebook(true);
        try {
            const cells = [];
            for (const f of supported) {
                const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(f.path)}`);
                const data = await res.json();
                if (data.error) continue; // skip unreadable files rather than failing the whole batch
                const id = Date.now().toString() + Math.random().toString(36).slice(2, 8);
                if (f.name.toLowerCase().endsWith('.amoxvis')) {
                    let config = {};
                    try { config = JSON.parse(data.content); } catch { /* malformed — falls through with empty query */ }
                    const { query, ...chartConfig } = config;
                    cells.push({ id, type: 'code', content: query || '', state: { chartConfig, viewMode: 'chart' } });
                } else if (f.name.toLowerCase().endsWith('.md')) {
                    cells.push({ id, type: 'markdown', content: data.content });
                } else {
                    cells.push({ id, type: 'code', content: data.content });
                }
            }
            if (cells.length === 0) {
                setAlertData({ isOpen: true, title: 'Create Notebook', type: 'error', message: 'Could not read any of the selected files.' });
                return;
            }
            const payload = JSON.stringify({ version: '3.0', cells, environment: {} }, null, 2);
            onCreateNotebookFromFiles(payload);
            setContextMenu(null);
            setSelectedFiles(new Set());
            setMultiSelectMode(false);
        } catch (err) {
            setAlertData({ isOpen: true, title: 'Create Notebook', type: 'error', message: err.message });
        } finally {
            setCreatingNotebook(false);
        }
    };

    // --- Clipboard Cut/Copy/Paste ---
    const cutFiles = (filesToCut) => {
        setClipboardFiles(filesToCut.map(f => ({ path: f.path, name: f.name, isDirectory: f.isDirectory })));
        setClipboardMode('cut');
        setContextMenu(null);
    };
    const copyFiles = (filesToCopy) => {
        setClipboardFiles(filesToCopy.map(f => ({ path: f.path, name: f.name, isDirectory: f.isDirectory })));
        setClipboardMode('copy');
        setContextMenu(null);
    };
    const pasteFiles = async () => {
        setContextMenu(null);
        if (clipboardFiles.length === 0) return;
        try {
            for (const f of clipboardFiles) {
                const endpoint = clipboardMode === 'cut' ? '/api/file/move' : '/api/file/copy';
                await fetch(`${API_BASE}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sourcePath: f.path, destinationDir: currentPath })
                });
            }
            if (clipboardMode === 'cut') { setClipboardFiles([]); setClipboardMode(null); }
            fetchFiles(currentPath, { silent: true });
            setSelectedFiles(new Set());
        } catch (err) {
            setAlertData({ isOpen: true, message: `Paste failed: ${err.message}`, title: 'Error', type: 'error' });
        }
    };

    // --- Keyboard shortcuts ---
    useEffect(() => {
        const el = wrapperRef.current;
        if (!el) return;
        const handler = (e) => {
            // Only handle when this panel is focused
            if (!el.contains(document.activeElement) && document.activeElement !== el) return;
            if (e.key === 'F2' && selectedFiles.size === 1) {
                const f = sortedFiles.find(f => selectedFiles.has(f.path));
                if (f) { e.preventDefault(); startRename(f); }
            }
            if (e.key === 'Delete' && selectedFiles.size > 0) {
                e.preventDefault();
                const items = getSelectedFileObjects();
                // handleDeleteClick detects the multi-selection and deletes all of it.
                if (items.length > 0) handleDeleteClick(items[0]);
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedFiles.size > 0) {
                e.preventDefault(); copyFiles(getSelectedFileObjects());
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedFiles.size > 0) {
                e.preventDefault(); cutFiles(getSelectedFileObjects());
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboardFiles.length > 0) {
                e.preventDefault(); pasteFiles();
            }
        };
        el.addEventListener('keydown', handler);
        return () => el.removeEventListener('keydown', handler);
    }, [selectedFiles, clipboardFiles, clipboardMode, sortedFiles]);

    // Clear selection when navigating
    useEffect(() => {
        setSelectedFiles(new Set());
        setMultiSelectMode(false);
    }, [currentPath]);

    return (
        <div ref={wrapperRef} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-secondary)' }}>
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
                    <button onClick={() => onNewFile(currentPath, 'amoxdeck')} title="New Report Flow Deck" className="fe-header-btn">
                        <LuPresentation size={13} />
                    </button>
                    <button onClick={() => onNewFolder(currentPath)} title="New Folder" className="fe-header-btn">
                        <LuFolderPlus size={13} />
                    </button>
                    <button
                        onClick={cycleSortMode}
                        title={`Sort: ${SORT_LABELS[sortMode]}`}
                        className="fe-header-btn"
                        style={{ color: sortMode !== 'default' ? 'var(--accent-primary)' : undefined }}
                    >
                        {sortMode === 'type' || sortMode === 'extension' ? <LuLayers size={13} /> : <LuLayoutList size={13} />}
                    </button>
                    <button onClick={() => fetchFiles(currentPath)} title="Refresh" className="fe-header-btn">
                        <LuRefreshCw size={13} />
                    </button>
                </div>
            </div>

            {/* Breadcrumb + Search */}
            <div className="fe-nav-section">
                {/* Search — always directly under the header */}
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

                {/* Breadcrumbs / path — depth shown by a color gradient (dim root → bright current) */}
                <div className="fe-breadcrumb">
                    {currentPath && (
                        <button onClick={handleUp} className="fe-breadcrumb-up" title="Go up">
                            <LuArrowUp size={12} />
                        </button>
                    )}
                    {(() => {
                        const parts = currentPath ? currentPath.split('/').filter(Boolean) : [];
                        const crumbs = [{ label: '/', path: '' }, ...parts.map((seg, idx) => ({
                            label: seg, path: parts.slice(0, idx + 1).join('/'),
                        }))];
                        const total = crumbs.length;
                        return crumbs.map((c, i) => {
                            const isLast = i === total - 1;
                            const pct = total > 1 ? Math.round((i / (total - 1)) * 100) : 100;
                            const color = `color-mix(in oklch, var(--text-primary) ${pct}%, var(--text-tertiary))`;
                            return (
                                <span key={c.path || 'root'} className="fe-breadcrumb-part">
                                    {i > 0 && <span className="fe-breadcrumb-sep">/</span>}
                                    <span
                                        onClick={() => { if (!isLast) setCurrentPath(c.path); }}
                                        className={`fe-breadcrumb-segment${isLast ? ' active' : ''}`}
                                        style={{ color, fontWeight: isLast ? 600 : 400 }}
                                        title={c.label}
                                    >
                                        {c.label}
                                    </span>
                                </span>
                            );
                        });
                    })()}
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
                            className={`file-item${selectedFiles.has(file.path) ? ' file-item--selected' : ''}${clipboardMode === 'cut' && clipboardFiles.some(c => c.path === file.path) ? ' file-item--cut' : ''}${dragOverFolder === file.path ? ' file-item--drop-target' : ''}`}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', file.name);
                                e.dataTransfer.setData('application/json', JSON.stringify({ type: file.isDirectory ? 'folder' : 'file', path: file.path, name: file.name }));
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={file.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder(file.path); } : undefined}
                            onDragLeave={file.isDirectory ? () => setDragOverFolder(null) : undefined}
                            onDrop={file.isDirectory ? (e) => handleFolderDrop(e, file) : undefined}
                            onClick={(e) => { if (!handleFileClick(e, file)) handleNavigate(file); }}
                            onContextMenu={(e) => handleContextMenu(e, file)}
                            title={file.name}
                        >
                            <span className="icon">
                                {multiSelectMode
                                    ? (selectedFiles.has(file.path)
                                        ? <LuSquareCheck size={14} color="var(--accent-primary)" />
                                        : <LuSquare size={14} color="var(--text-muted)" />)
                                    : getIcon(file)
                                }
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
                            ) : (() => {
                                const lastDot = file.name.lastIndexOf('.');
                                const hasExt = !file.isDirectory && lastDot > 0;
                                const baseName = hasExt ? file.name.substring(0, lastDot) : file.name;
                                const extName = hasExt ? file.name.substring(lastDot) : '';
                                // Compute git status badge for this file
                                const fileNorm = file.path.replace(/\\/g, '/');
                                // Match by exact path or by filename only (for root-level files)
                                const gitStatus = gitStatusMap[fileNorm]
                                    || gitStatusMap[file.name]
                                    || (Object.keys(gitStatusMap).find(k => k.endsWith('/' + file.name)) ? gitStatusMap[Object.keys(gitStatusMap).find(k => k.endsWith('/' + file.name))] : undefined);
                                const GIT_BADGE_COLORS = { M: 'var(--color-warning)', A: 'var(--color-success)', D: 'var(--color-error)', '?': undefined };
                                return (
                                <>
                                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{baseName}</span>
                                        <span style={{ flexShrink: 0 }}>{extName}</span>
                                    </span>
                                    {gitStatus && (
                                        <span
                                            className={`fe-git-badge fe-git-badge--${gitStatus}`}
                                            style={{ color: GIT_BADGE_COLORS[gitStatus] || 'var(--text-muted)', flexShrink: 0 }}
                                            title={gitStatus === 'M' ? 'Modified' : gitStatus === 'A' ? 'Added' : gitStatus === 'D' ? 'Deleted' : 'Untracked'}
                                        >
                                            {gitStatus}
                                        </span>
                                    )}
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
                        // Grouped view (type or extension)
                        return Object.entries(groupedFiles).map(([groupLabel, groupItems]) => (
                            <div key={groupLabel}>
                                <div style={{
                                    padding: '6px 10px 2px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    userSelect: 'none',
                                    marginTop: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <span>{groupLabel}</span>
                                    <span style={{ fontSize: '9px', opacity: 0.6, fontWeight: 500 }}>{groupItems.length}</span>
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
                <div ref={contextMenuRef} style={{
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

                }}>
                    {/* ── Multi-selection: consolidate into a notebook (Fase 4) ── */}
                    {selectedFiles.size > 1 && selectedFiles.has(contextMenu.file.path) && onCreateNotebookFromFiles && (
                        <>
                            <div
                                onClick={() => createNotebookFromSelection(getSelectedFileObjects())}
                                className="context-menu-item"
                            >
                                {creatingNotebook ? <LuLoader size={14} className="spin" /> : <LuBookOpen size={14} />} Create Notebook from Selection ({selectedFiles.size})
                            </div>
                            <div style={{ height: '1px', backgroundColor: 'var(--border-default)', margin: '4px 8px' }} />
                        </>
                    )}
                    {/* ── Type-specific actions ── */}
                    {contextMenu.file.name.match(/\.(csv|tsv|parquet|json|xlsx|xls)$/i) && (
                        <div onClick={() => onImportFile(contextMenu.file.path, false)} className="context-menu-item">
                            <LuDatabase size={14} /> Import to Database...
                        </div>
                    )}
                    {contextMenu.file.name.match(/\.(csv|parquet|json)$/i) && (
                        <div onClick={() => { setPreviewFilePath(contextMenu.file.path); setContextMenu(null); }} className="context-menu-item">
                            <LuFileSpreadsheet size={14} /> Quick Preview
                        </div>
                    )}
                    {contextMenu.file.name.match(/\.(csv|tsv|xlsx|xls|parquet|json)$/i) && (
                        <div onClick={() => { onQueryFile(contextMenu.file.path); setContextMenu(null); }} className="context-menu-item">
                            <LuSearch size={14} /> Direct Query
                        </div>
                    )}
                    {contextMenu.file.name.match(/\.(csv|tsv|xlsx|xls|parquet|json)$/i) && (
                        <div
                            onClick={async () => {
                                if (copyingColumns) return;
                                setCopyingColumns(true);
                                try {
                                    const res = await fetch(`${API_BASE}/api/files/inspect-columns?path=${encodeURIComponent(contextMenu.file.path)}`);
                                    const data = await res.json();
                                    const fName = contextMenu.file.name;
                                    let comment = '';
                                    if (data.sheetsWithColumns) {
                                        const sheetLines = Object.entries(data.sheetsWithColumns).map(([sheet, cols]) => {
                                            const colNames = cols.map(c => c.name).join(', ');
                                            return `-- Sheet "${sheet}": ${colNames}`;
                                        }).join('\n');
                                        comment = `-- Columns from: ${fName}\n${sheetLines}`;
                                    } else if (data.columns && data.columns.length > 0) {
                                        const colNames = data.columns.map(c => c.name).join(', ');
                                        comment = `-- Columns from: ${fName}\n-- ${colNames}`;
                                    } else {
                                        comment = `-- No columns found for: ${fName}`;
                                    }
                                    await navigator.clipboard.writeText(comment);
                                } catch (err) {
                                    console.error('Failed to copy column names:', err);
                                    await navigator.clipboard.writeText(`-- Error reading columns: ${err.message}`);
                                } finally { setCopyingColumns(false); setContextMenu(null); }
                            }}
                            className="context-menu-item"
                            style={copyingColumns ? { cursor: 'wait' } : undefined}
                        >
                            {copyingColumns ? <LuLoader size={14} className="spin" /> : <LuColumns3 size={14} />} {copyingColumns ? 'Reading...' : 'Copy Column Names'}
                        </div>
                    )}
                    {contextMenu.file.name.match(/\.(csv|tsv|txt|json|parquet|xlsx|xls)$/i) && (
                        <div
                            onClick={() => { setAiContextFile({ path: contextMenu.file.path, name: contextMenu.file.name }); setContextMenu(null); }}
                            className="context-menu-item"
                        >
                            <LuSparkles size={14} /> Metadata for AI...
                        </div>
                    )}
                    {contextMenu.file.name.endsWith('.amoxvis') && (
                        <>
                            <div onClick={() => onEditChart && onEditChart(contextMenu.file.path)} className="context-menu-item">
                                <LuChartBar size={14} /> Open Chart
                            </div>
                            <div onClick={() => onEditChartWithSql && onEditChartWithSql(contextMenu.file.path)} className="context-menu-item">
                                <LuCode size={14} /> Edit with SQL
                            </div>
                        </>
                    )}
                    {/* .sql — export the query's results to a file (reads the file from disk) */}
                    {contextMenu.file.name.match(/\.sql$/i) && (
                        <div
                            onClick={async () => {
                                if (exportSqlLoading) return;
                                const filePath = contextMenu.file.path;
                                setContextMenu(null);
                                setExportSqlLoading(true);
                                try {
                                    const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(filePath)}`);
                                    const data = await res.json();
                                    setExportSqlQuery(data.content || '');
                                } catch (err) {
                                    console.error('Failed to read SQL file for export:', err);
                                    setExportSqlQuery('');
                                } finally { setExportSqlLoading(false); }
                            }}
                            className="context-menu-item"
                        >
                            {exportSqlLoading ? <LuLoader size={14} className="spin" /> : <LuFileSpreadsheet size={14} />} Export results...
                        </div>
                    )}
                    {/* .sql — Fase 3 reverse lookup: which charts point back at this query */}
                    {contextMenu.file.name.match(/\.sql$/i) && (
                        <div
                            onClick={async (e) => {
                                if (linkedChartsLoading) return;
                                const filePath = contextMenu.file.path;
                                const anchor = { x: contextMenu.x, y: contextMenu.y };
                                setContextMenu(null);
                                setLinkedChartsLoading(true);
                                try {
                                    const res = await fetch(`${API_BASE}/api/charts/using-source?path=${encodeURIComponent(filePath)}`);
                                    const charts = await res.json();
                                    if (!Array.isArray(charts) || charts.length === 0) {
                                        setAlertData({ isOpen: true, message: 'No charts are linked to this query yet.', title: 'Charts using this query', type: 'info' });
                                    } else if (charts.length === 1) {
                                        onEditChart && onEditChart(charts[0].path);
                                    } else {
                                        setLinkedChartsMenu({ ...anchor, charts });
                                    }
                                } catch (err) {
                                    setAlertData({ isOpen: true, message: 'Failed to look up linked charts: ' + err.message, title: 'Error', type: 'error' });
                                } finally {
                                    setLinkedChartsLoading(false);
                                }
                            }}
                            className="context-menu-item"
                        >
                            {linkedChartsLoading ? <LuLoader size={14} className="spin" /> : <LuChartBar size={14} />} Charts using this query...
                        </div>
                    )}
                    {contextMenu.file.isDirectory && (
                        <div onClick={() => onImportFile(contextMenu.file.path, true)} className="context-menu-item">
                            <LuDatabase size={14} /> Import Folder to Database...
                        </div>
                    )}

                    {/* ── Folder: New File / New Folder Here ── */}
                    {contextMenu.file.isDirectory && (
                        <>
                            <div style={{ height: '1px', backgroundColor: 'var(--border-default)', margin: '4px 8px' }} />
                            <div onClick={() => { setContextMenu(null); onNewFile(contextMenu.file.path, 'sql'); }} className="context-menu-item">
                                <LuFilePlus size={14} /> New File Here...
                            </div>
                            <div onClick={() => { setContextMenu(null); onNewFolder(contextMenu.file.path); }} className="context-menu-item">
                                <LuFolderPlus size={14} /> New Folder Here
                            </div>
                        </>
                    )}

                    {/* ── File operations separator ── */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-default)', margin: '4px 8px' }} />

                    {/* Cut / Copy / Paste */}
                    <div onClick={() => cutFiles([contextMenu.file])} className="context-menu-item">
                        <LuScissors size={14} /> Cut
                    </div>
                    <div onClick={() => copyFiles([contextMenu.file])} className="context-menu-item">
                        <LuFiles size={14} /> Copy
                    </div>
                    {clipboardFiles.length > 0 && (
                        <div onClick={pasteFiles} className="context-menu-item">
                            <LuClipboard size={14} /> Paste {clipboardMode === 'cut' ? '(Move)' : '(Copy)'}
                        </div>
                    )}

                    {/* Duplicate / Move To / Rename */}
                    <div onClick={() => duplicateFile(contextMenu.file)} className="context-menu-item">
                        <LuCopy size={14} /> Duplicate
                    </div>
                    <div onClick={() => openMoveTo([contextMenu.file])} className="context-menu-item">
                        <LuFolderInput size={14} /> Move To...
                    </div>
                    <div onClick={() => startRename(contextMenu.file)} className="context-menu-item">
                        <LuPencil size={14} /> Rename
                    </div>

                    {/* ── Destructive separator ── */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-default)', margin: '4px 8px' }} />

                    <div onClick={() => addToGitignore(contextMenu.file)} className="context-menu-item">
                        <LuEyeOff size={14} /> Add to .gitignore
                    </div>
                    <div onClick={() => handleDeleteClick(contextMenu.file)} className="context-menu-item context-menu-item--danger">
                        <LuTrash2 size={14} /> Delete
                    </div>

                    {/* ── Utility separator ── */}
                    <div style={{ height: '1px', backgroundColor: 'var(--border-default)', margin: '4px 8px' }} />

                    <div onClick={() => revealInExplorer(contextMenu.file)} className="context-menu-item">
                        <LuExternalLink size={14} /> Reveal in Explorer
                    </div>
                    {/* "Copy Path" (backslash identity regex) was a redundant duplicate of the
                        normalized relative path below, and its label implied an absolute path it
                        never produced — removed. */}
                    <div onClick={() => { navigator.clipboard.writeText(contextMenu.file.path.replace(/\\/g, '/')); setContextMenu(null); }} className="context-menu-item">
                        <LuClipboard size={14} /> Copy Relative Path
                    </div>
                    <div onClick={() => { navigator.clipboard.writeText(contextMenu.file.name); setContextMenu(null); }} className="context-menu-item">
                        <LuType size={14} /> Copy Name
                    </div>
                </div>
            )}

            {/* Fase 3 — procedencia, reverse lookup popover: which charts are
                linked to the .sql file just right-clicked. Only shown when
                there's more than one match (a single match opens directly). */}
            {linkedChartsMenu && (
                <div style={{
                    position: 'fixed', top: linkedChartsMenu.y, left: linkedChartsMenu.x, zIndex: 1000,
                    minWidth: '220px', maxWidth: '320px',
                    backgroundColor: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                    borderRadius: '6px', boxShadow: 'var(--shadow-md)', padding: '4px', fontSize: '13px',
                }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ padding: '4px 8px', color: 'var(--text-tertiary)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                        {linkedChartsMenu.charts.length} charts use this query
                    </div>
                    {linkedChartsMenu.charts.map((c) => (
                        <div
                            key={c.path}
                            onClick={() => { onEditChart && onEditChart(c.path); setLinkedChartsMenu(null); }}
                            className="context-menu-item"
                        >
                            <LuChartBar size={14} /> {c.name}
                        </div>
                    ))}
                </div>
            )}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                itemName={deleteTargets.length > 1 ? `${deleteTargets.length} elementos` : fileToDelete?.name}
                itemType={deleteTargets.length > 1 ? 'Items' : (fileToDelete?.isDirectory ? 'Folder' : 'File')}
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

            <ExportDataModal
                isOpen={exportSqlQuery !== null}
                onClose={() => setExportSqlQuery(null)}
                query={exportSqlQuery || ''}
            />

            <ExportAiContextModal
                isOpen={!!aiContextFile}
                onClose={() => setAiContextFile(null)}
                fileRef={aiContextFile}
            />

            {/* Move To... Modal */}
            {moveToModal && (
                <div className="fe-move-modal-overlay" onClick={() => setMoveToModal(null)}>
                    <div className="fe-move-modal" onClick={e => e.stopPropagation()}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            Move {moveToModal.files.length === 1 ? `"${moveToModal.files[0].name}"` : `${moveToModal.files.length} items`} to...
                        </h4>
                        <div className="fe-move-folder-list">
                            {folderList.map(f => (
                                <div
                                    key={f.path}
                                    className="fe-move-folder-item"
                                    onClick={() => executeMoveToFolder(f.path)}
                                >
                                    <LuFolder size={14} color="var(--icon-folder)" />
                                    <span>{f.path || '/ (Root)'}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => setMoveToModal(null)}
                            style={{ marginTop: 10, padding: '6px 16px', fontSize: 12, background: 'var(--surface-inset)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Google Sheets section */}
            <GSheetsSection
                onQuerySheet={(sql) => {
                    // Open a new SQL tab seeded with the read_gsheet query.
                    // (onQueryFile expects a file PATH and rejects non-strings — use onQuerySql.)
                    onQuerySql?.(sql);
                }}
            />
        </div>
    );
};

export default memo(FileExplorer);
