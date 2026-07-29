import { API_BASE } from '../api.js';
import { useState, useEffect, useMemo, useRef, memo, useDeferredValue, lazy, Suspense } from 'react';
import { LuTable, LuChartBar, LuSearch, LuChevronUp, LuChevronDown, LuSave, LuFileSpreadsheet, LuGauge, LuFileJson, LuClipboardCopy, LuFileDown, LuChevronDown as LuChevDown, LuExternalLink, LuFilter, LuPackage, LuGitCompare, LuLoader } from "react-icons/lu";

const CompareResults = lazy(() => import('./CompareResults'));
import SaveToDbModal from './SaveToDbModal';
import DataVisualizer from './DataVisualizer';
import DataProfiler from './DataProfiler';
import { useToast } from './ToastProvider';

const ResultsTable = ({ data, types, executionTime, query, currentEditorQuery, onDbChange, isReportMode = false, initialChartConfig = null, onConfigChange = null, onViewModeChange = null, initialViewMode = null, editorSettings = {}, onPopout = null, truncated = false, rowLimit = null }) => {
    const toast = useToast();
    // currentEditorQuery may be a string (notebook cells) or a getter function
    // (EditorPane passes a stable getter so typing doesn't break this memo).
    const resolveEditorQuery = () => (typeof currentEditorQuery === 'function' ? currentEditorQuery() : currentEditorQuery);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [isSaveDbModalOpen, setIsSaveDbModalOpen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showVaultPrompt, setShowVaultPrompt] = useState(false);
    const [vaultTitle, setVaultTitle] = useState('');
    const [vaultTags, setVaultTags] = useState('');
    const [vaultSaving, setVaultSaving] = useState(false);
    const [exportingAction, setExportingAction] = useState(null);

    // View State
    const [viewMode, setViewMode] = useState(initialViewMode || (initialChartConfig ? 'chart' : (editorSettings.defaultViewMode || 'table')));

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
    };

    // Report the active view UP (mount + every change) so the tab — and through
    // it the AI assistant — knows whether the user is on Table/Chart/Profile.
    // Single source of truth (vs. also firing in the click handler).
    useEffect(() => {
        if (onViewModeChange) onViewModeChange(viewMode);
    }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Enhanced Table State
    const [globalSearch, setGlobalSearch] = useState('');
    const deferredGlobalSearch = useDeferredValue(globalSearch);

    const [sortConfig, setSortConfig] = useState(null); // { key: string, direction: 'asc' | 'desc' }

    const [columnFilters, setColumnFilters] = useState({}); // { [key]: rawFilterString }
    const deferredColumnFilters = useDeferredValue(columnFilters);

    const [showFilters, setShowFilters] = useState(false); // Toggle filter row

    // --- Column Context Menu State ---
    const [contextMenu, setContextMenu] = useState(null); // { x, y, column }

    // --- Compare State ---
    const [storedForCompare, setStoredForCompare] = useState(null); // { data, label }
    const [compareOpen, setCompareOpen] = useState(false);

    // --- Column Resizing State ---
    const [columnWidths, setColumnWidths] = useState({}); // { [colName]: widthInPx }
    const [resizeState, setResizeState] = useState({ isResizing: false, column: null, startX: 0, startWidth: 0 });
    const resizeRafRef = useRef(null);

    // --- Column Resizing Logic ---
    const handleResizeMouseDown = (e, col) => {
        e.preventDefault();
        e.stopPropagation();
        setResizeState({
            isResizing: true,
            column: col,
            startX: e.clientX,
            startWidth: columnWidths[col] || 150
        });
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!resizeState.isResizing) return;
            const deltaX = e.clientX - resizeState.startX;
            const newWidth = Math.max(50, resizeState.startWidth + deltaX);
            if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
            resizeRafRef.current = requestAnimationFrame(() => {
                setColumnWidths(prev => ({ ...prev, [resizeState.column]: newWidth }));
            });
        };

        const handleMouseUp = () => {
            if (resizeState.isResizing) {
                if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
                setResizeState({ isResizing: false, column: null, startX: 0, startWidth: 0 });
            }
        };

        if (resizeState.isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [resizeState]);

    // --- Context Menu Dismiss ---
    useEffect(() => {
        if (!contextMenu) return;
        const dismiss = () => setContextMenu(null);
        window.addEventListener('click', dismiss);
        window.addEventListener('contextmenu', dismiss);
        window.addEventListener('scroll', dismiss, true);
        return () => {
            window.removeEventListener('click', dismiss);
            window.removeEventListener('contextmenu', dismiss);
            window.removeEventListener('scroll', dismiss, true);
        };
    }, [contextMenu]);

    // Reset page when data changes
    useEffect(() => {
        setCurrentPage(1);
        setGlobalSearch('');
        setSortConfig(null);
        setColumnFilters({});
    }, [data]);

    // --- Data Processing Pipeline ---

    // 1. Filtering (Global & Column)
    const filteredData = useMemo(() => {
        if (!data || data.length === 0) return [];
        return data.filter(row => {
            // Global Search
            if (deferredGlobalSearch) {
                const searchLower = deferredGlobalSearch.toLowerCase();
                const rowMatches = Object.values(row).some(val =>
                    String(val).toLowerCase().includes(searchLower)
                );
                if (!rowMatches) return false;
            }

            // Column Filters
            if (showFilters) {
                for (const [col, filterVal] of Object.entries(deferredColumnFilters)) {
                    if (!filterVal) continue;
                    const cellVal = row[col];
                    const filterLower = filterVal.toLowerCase();
                    if (!String(cellVal).toLowerCase().includes(filterLower)) {
                        return false; // Mismatch
                    }
                }
            }

            return true;
        });
    }, [data, deferredGlobalSearch, deferredColumnFilters, showFilters]);

    // 2. Sorting
    const sortedData = useMemo(() => {
        const sorted = [...filteredData];
        if (sortConfig) {
            sorted.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                // Numeric Sort
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                }

                // String Sort
                const strA = String(valA).toLowerCase();
                const strB = String(valB).toLowerCase();
                if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sorted;
    }, [filteredData, sortConfig]);

    // 3. Pagination
    const totalRows = sortedData.length;
    const effectivePageSize = isReportMode ? Math.min(totalRows, 200) : pageSize;
    const totalPages = Math.ceil(totalRows / effectivePageSize) || 1;
    const startIndex = isReportMode ? 0 : (currentPage - 1) * effectivePageSize;
    const endIndex = Math.min(startIndex + effectivePageSize, totalRows);
    const currentData = sortedData.slice(startIndex, endIndex);

    // Early Returns after all Hooks
    if (!data || data.length === 0) {
        return <div className="rt-no-results">No results{executionTime ? ` (${executionTime}ms)` : ''}</div>;
    }

    const columns = (data && data.length > 0 && data[0]) ? Object.keys(data[0]) : [];

    if (columns.length === 0) {
        return <div className="rt-no-results">No columns found in result.</div>;
    }

    // Handlers
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleFilterChange = (key, val) => {
        setColumnFilters(prev => ({ ...prev, [key]: val }));
        setCurrentPage(1); // Reset to first page on filter
    };

    const runExportWorker = async (action, exportData, columns = [], filenameSuffix = '') => {
        if (!exportData || exportData.length === 0) return;

        setExportingAction(action);

        try {
            const worker = new Worker('/exportWorker.js');

            const result = await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    if (e.data.status === 'success') resolve(e.data.result);
                    else reject(new Error(e.data.error));
                };
                worker.onerror = (err) => reject(err);

                worker.postMessage({
                    action,
                    data: exportData,
                    columns
                });
            });

            worker.terminate();

            const mimeType = action === 'exportCSV' ? 'text/csv;charset=utf-8;' : 'application/json';
            const suffix = action === 'exportCSV' ? 'csv' : 'json';
            const finalString = action === 'exportCSV' ? '\uFEFF' + result : result;

            const blob = new Blob([finalString], { type: mimeType });
            downloadBlob(blob, `query_results_${filenameSuffix}.${suffix}`);

        } catch (error) {
            console.error('Worker Export failed, falling back to main thread...', error);
            // Fallback (rarely needed)
            toast.error(`Export failed: ${error.message}`);
        } finally {
            setExportingAction(null);
            setShowExportMenu(false);
        }
    };

    const handleExportCsv = () => {
        if (!sortedData || sortedData.length === 0) return;
        const headers = Object.keys(sortedData[0]);
        runExportWorker('exportCSV', sortedData, headers, timestamp());
    };

    const handleExportJson = () => {
        if (!sortedData || sortedData.length === 0) return;
        runExportWorker('exportJSON', sortedData, [], timestamp());
    };

    const handleSaveToVault = async () => {
        if (!vaultTitle.trim()) return;
        setVaultSaving(true);
        try {
            const sqlContent = query || resolveEditorQuery() || '';
            const res = await fetch(`${API_BASE}/api/ai/vault`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: vaultTitle.trim(),
                    sqlContent,
                    tags: vaultTags.trim() || null,
                    resultSnapshot: JSON.stringify({ rowCount: totalRows, columns: columns.slice(0, 10) }),
                }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setShowVaultPrompt(false);
            setVaultTitle('');
            setVaultTags('');
        } catch (err) {
            console.error('Save to vault failed:', err);
        } finally {
            setVaultSaving(false);
        }
    };

    const handleCopyClipboard = () => {
        if (!sortedData || sortedData.length === 0) return;
        const headers = Object.keys(sortedData[0]);
        const tsv = [
            headers.join('\t'),
            ...sortedData.map(row => headers.map(h => row[h] === null ? '' : String(row[h])).join('\t'))
        ].join('\n');
        navigator.clipboard.writeText(tsv);
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const timestamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const handleSaveToDb = async (name, type) => {
        if (!query) return { success: false, error: "No query to save." };

        const cleanQuery = query.trim().replace(/;$/, '');
        const createSql = `CREATE ${type} "${name}" AS ${cleanQuery}`;

        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: createSql }),
            });
            const resData = await response.json();

            if (response.ok) {
                if (onDbChange) onDbChange();
                return { success: true, summary: `${type} '${name}' created successfully!` };
            } else {
                return { success: false, error: resData.error };
            }
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    const formatValue = (val) => {
        try {
            if (val === null || val === undefined) return <span className="rt-null">NULL</span>;

            if (typeof val === 'number') {
                if (Number.isInteger(val)) {
                    return val.toLocaleString();
                }
                const formatted = val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
                return (
                    <span title={String(val)} className="rt-float">
                        {formatted}
                    </span>
                );
            }

            if (typeof val === 'string') {
                if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z?$/.test(val)) {
                    return val.split('T')[0];
                }
                if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(val)) {
                    return val.replace('T', ' ').replace(/(\.000)?Z$/, '');
                }
            }
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        } catch (e) {
            return String(val);
        }
    };

    return (
        <div className="rt-container amox-fade-in">
            {/* Toolbar */}
            {!isReportMode && (
                <div className="rt-toolbar">
                    {/* Top Row: Controls & Stats */}
                    <div className="rt-toolbar-row">
                        <div className="rt-toolbar-left">
                            {/* View Switcher */}
                            <div className="rt-view-switcher">
                                <button className={`rt-view-btn${viewMode === 'table' ? ' active' : ''}`} onClick={() => handleViewModeChange('table')} aria-label="Table view">
                                    <LuTable size={13} /> Table
                                </button>
                                <button className={`rt-view-btn${viewMode === 'chart' ? ' active' : ''}`} onClick={() => handleViewModeChange('chart')} aria-label="Chart view">
                                    <LuChartBar size={13} /> Chart
                                </button>
                                <button className={`rt-view-btn${viewMode === 'profile' ? ' active' : ''}`} onClick={() => handleViewModeChange('profile')} aria-label="Profile view">
                                    <LuGauge size={13} /> Profile
                                </button>
                                {viewMode === 'table' && (
                                    <button className={`rt-view-btn rt-filter-btn${showFilters ? ' active' : ''}`} onClick={() => setShowFilters(f => !f)} aria-label="Toggle column filters">
                                        <LuFilter size={13} /> Filters
                                    </button>
                                )}
                            </div>

                            <span className="rt-stats">
                                {totalRows} result{totalRows !== 1 ? 's' : ''}
                                {columns.length > 0 && ` × ${columns.length} column${columns.length !== 1 ? 's' : ''}`}
                                {' '}({executionTime}ms)
                                {data.length !== totalRows && ` [Filtered from ${data.length}]`}
                                {truncated && (
                                    <span style={{ marginLeft: 8, color: 'var(--feedback-warning)', fontWeight: 500 }}
                                          title={`Result capped at ${rowLimit?.toLocaleString()} rows. Adjust "Max Rows" in Settings → Editor, or use LIMIT in your query, or Export for full data.`}>
                                        ⚠ first {rowLimit?.toLocaleString()} rows shown
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Right Actions */}
                        <div className="rt-toolbar-right">
                            {/* Global Search */}
                            {viewMode === 'table' && (
                                <div className="rt-search">
                                    <input
                                        type="text"
                                        className="rt-search-input"
                                        placeholder="Search..."
                                        value={globalSearch}
                                        onChange={(e) => { setGlobalSearch(e.target.value); setCurrentPage(1); }}
                                    />
                                    <span className="rt-search-icon">
                                        <LuSearch size={12} />
                                    </span>
                                </div>
                            )}

                            {/* Compare button */}
                            {!storedForCompare ? (
                                <button
                                    className="rt-action-btn"
                                    onClick={() => { setStoredForCompare({ data: sortedData, label: `Result A (${sortedData.length} rows)` }); toast.info('Snapshot stored. Run another query, then click Compare.'); }}
                                    aria-label="Store results for comparison"
                                    title="Store current results for comparison"
                                >
                                    <LuGitCompare size={12} /> Store A
                                </button>
                            ) : (
                                <>
                                    <button
                                        className="rt-action-btn rt-action-btn--accent"
                                        onClick={() => setCompareOpen(true)}
                                        aria-label="Compare results"
                                        title="Compare stored results with current"
                                    >
                                        <LuGitCompare size={12} /> Compare
                                    </button>
                                    <button
                                        className="rt-action-btn"
                                        onClick={() => { setStoredForCompare(null); setCompareOpen(false); }}
                                        title="Clear stored comparison"
                                        aria-label="Clear comparison"
                                        style={{ fontSize: '10px' }}
                                    >
                                        ✕
                                    </button>
                                </>
                            )}

                            {onPopout && (
                                <button className="rt-action-btn" onClick={onPopout} aria-label="Pop out results to separate window">
                                    <LuExternalLink size={12} /> Pop-out
                                </button>
                            )}
                            <button className="rt-action-btn" onClick={() => setIsSaveDbModalOpen(true)} aria-label="Save query as a table" title="Materializa la query completa como tabla/vista (no solo las filas mostradas)">
                                <LuSave size={12} /> Save as table…
                            </button>
                            <div className="toolbar-dropdown">
                                <button className="rt-action-btn" onClick={() => { setVaultTitle(''); setVaultTags(''); setShowVaultPrompt(v => !v); }}>
                                    <LuPackage size={12} /> Vault
                                </button>
                                {showVaultPrompt && (
                                    <div className="toolbar-dropdown-menu vault-save-dropdown">
                                        <div className="vault-save-dropdown-label">Save to Analysis Vault</div>
                                        <input
                                            type="text"
                                            className="vault-save-dropdown-input"
                                            value={vaultTitle}
                                            onChange={e => setVaultTitle(e.target.value)}
                                            placeholder="Analysis title..."
                                            autoFocus
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveToVault(); if (e.key === 'Escape') setShowVaultPrompt(false); }}
                                        />
                                        <input
                                            type="text"
                                            className="vault-save-dropdown-input"
                                            value={vaultTags}
                                            onChange={e => setVaultTags(e.target.value)}
                                            placeholder="Tags (comma separated)..."
                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveToVault(); if (e.key === 'Escape') setShowVaultPrompt(false); }}
                                        />
                                        <button
                                            className="vault-save-dropdown-btn"
                                            onClick={handleSaveToVault}
                                            disabled={!vaultTitle.trim() || vaultSaving}
                                        >
                                            <LuPackage size={12} />
                                            {vaultSaving ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Download Dropdown — the rows shown in THIS table (in-memory, instant).
                                Full export of the whole query lives in the editor toolbar ("Export"),
                                since it re-runs the query and belongs to the query, not the shown rows. */}
                            <div className="toolbar-dropdown">
                                <button className="rt-action-btn" onClick={() => setShowExportMenu(!showExportMenu)}>
                                    <LuFileDown size={12} /> Download ▾
                                </button>
                                {showExportMenu && (
                                    <div className="toolbar-dropdown-menu" style={{ right: 0, left: 'auto' }}>
                                        <div className="rt-dropdown-subtext">Las filas cargadas en esta tabla</div>
                                        {[{ label: 'Export CSV', icon: <LuFileSpreadsheet size={13} />, fn: handleExportCsv, action: 'exportCSV' },
                                        { label: 'Export JSON', icon: <LuFileJson size={13} />, fn: handleExportJson, action: 'exportJSON' },
                                        { label: 'Copy to Clipboard', icon: <LuClipboardCopy size={13} />, fn: handleCopyClipboard, action: 'copy' },
                                        ].map(item => {
                                            const isBusy = exportingAction === item.action;
                                            return (
                                                <div
                                                    key={item.label}
                                                    className={`toolbar-dropdown-item${isBusy ? ' rt-exporting' : ''}`}
                                                    onClick={() => { if (!exportingAction) item.fn(); }}
                                                    aria-disabled={isBusy}
                                                >
                                                    {isBusy ? <LuLoader size={13} className="spin" /> : item.icon} {isBusy ? 'Exporting...' : item.label}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            )}

            {/* Results Content */}
            <div className={`rt-content${isReportMode ? ' report-mode' : ''}`} style={viewMode === 'chart' ? { overflow: 'hidden', minHeight: '200px' } : undefined}>
                {/* Table */}
                <div style={{ display: viewMode === 'table' ? 'contents' : 'none' }}>
                    <table className="rt-table" style={{ fontSize: `${editorSettings.resultsFontSize || 13}px` }}>
                        <thead className="rt-thead">
                            <tr>
                                {columns.map((col) => {
                                    const isSorted = sortConfig?.key === col;
                                    return (
                                        <th
                                            key={col}
                                            className="rt-th"
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({ x: e.clientX, y: e.clientY, column: col });
                                            }}
                                            style={{ width: columnWidths[col] || 150 }}
                                        >
                                            <div className="rt-th-inner" onClick={() => handleSort(col)} title="Click to sort">
                                                <div className="rt-th-col">
                                                    <span className="rt-th-name">{col}</span>
                                                    {types && types[col] && (
                                                        <span className="rt-th-type">{types[col]}</span>
                                                    )}
                                                </div>
                                                <span className="rt-th-sort">
                                                    {isSorted && (sortConfig.direction === 'asc' ? <LuChevronUp size={10} /> : <LuChevronDown size={10} />)}
                                                </span>
                                            </div>
                                            <div
                                                className={`rt-th-resizer${resizeState.isResizing && resizeState.column === col ? ' active' : ''}`}
                                                onMouseDown={(e) => handleResizeMouseDown(e, col)}
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                            {showFilters && !isReportMode && (
                                <tr>
                                    {columns.map((col) => (
                                        <td key={`filter-${col}`} className="rt-filter-cell">
                                            <input
                                                type="text"
                                                className="rt-filter-input"
                                                placeholder={`Filter ${col}...`}
                                                value={columnFilters[col] || ''}
                                                onChange={(e) => handleFilterChange(col, e.target.value)}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {currentData.length > 0 ? (
                                currentData.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {columns.map((col) => (
                                            <td key={`${rowIndex}-${col}`} className="rt-td" title={row ? (typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')) : ''}>
                                                {formatValue(row ? row[col] : null)}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} className="rt-empty">
                                        No matching records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>

                    {/* Pagination Footer — below table */}
                    {!isReportMode && totalPages > 1 && (
                        <div className="rt-pagination-footer">
                            <div className="rt-pagination">
                                <button className="rt-pagination-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>&lt;</button>
                                <span className="rt-page-info">Page {currentPage} of {totalPages}</span>
                                <button className="rt-pagination-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>&gt;</button>
                                <select className="rt-page-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={500}>500</option>
                                    <option value={1000}>1000</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Chart */}
                <div className={`rt-panel chart${viewMode === 'chart' ? ' visible' : ' hidden'}`}>
                    <DataVisualizer data={data} isReportMode={isReportMode} query={query} initialChartConfig={initialChartConfig} onConfigChange={onConfigChange} isActive={viewMode === 'chart'} />
                </div>

                {/* Profile */}
                <div className={`rt-panel profile${viewMode === 'profile' ? ' visible' : ' hidden'}`}>
                    <DataProfiler data={data} isActive={viewMode === 'profile'} query={query} />
                </div>
            </div>

            <SaveToDbModal
                isOpen={isSaveDbModalOpen}
                onClose={() => setIsSaveDbModalOpen(false)}
                onSave={handleSaveToDb}
            />

            {/* Compare Results Modal */}
            {compareOpen && storedForCompare && (
                <Suspense fallback={null}>
                    <CompareResults
                        dataA={storedForCompare.data}
                        labelA={storedForCompare.label}
                        dataB={sortedData}
                        labelB={`Result B (${sortedData.length} rows)`}
                        onClose={() => setCompareOpen(false)}
                    />
                </Suspense>
            )}

            {/* Column Context Menu */}
            {contextMenu && (
                <div
                    className="column-context-menu"
                    style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 99999 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="column-context-menu-item" onClick={() => { navigator.clipboard.writeText(contextMenu.column); setContextMenu(null); }}>
                        <LuClipboardCopy size={13} /> Copy Column Name
                    </div>
                    <div className="column-context-menu-item" onClick={() => { navigator.clipboard.writeText(columns.join(', ')); setContextMenu(null); }}>
                        <LuClipboardCopy size={13} /> Copy All Column Names
                    </div>
                    <div className="column-context-menu-separator" />
                    <div className="column-context-menu-item" onClick={() => { setSortConfig({ key: contextMenu.column, direction: 'asc' }); setContextMenu(null); }}>
                        <LuChevronUp size={13} /> Sort Ascending
                    </div>
                    <div className="column-context-menu-item" onClick={() => { setSortConfig({ key: contextMenu.column, direction: 'desc' }); setContextMenu(null); }}>
                        <LuChevronDown size={13} /> Sort Descending
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(ResultsTable);
