import { API_BASE } from '../api.js';
import { useState, useEffect, useLayoutEffect, useMemo, useRef, memo, useDeferredValue, lazy, Suspense } from 'react';
import { leerResultados, recordarResultados } from '../utils/memoriaDePestana';
import { LuTable, LuChartBar, LuSearch, LuChevronUp, LuChevronDown, LuSave, LuFileSpreadsheet, LuGauge, LuFileJson, LuClipboardCopy, LuFileDown, LuChevronDown as LuChevDown, LuExternalLink, LuFilter, LuPackage, LuGitCompare, LuLoader, LuColumns3, LuChevronLeft, LuChevronRight, LuTriangleAlert, LuPin, LuPinOff, LuX, LuSparkles, LuChartColumn, LuDatabase } from "react-icons/lu";

const CompareResults = lazy(() => import('./CompareResults'));
import SaveToDbModal from './SaveToDbModal';
import ArbolJson from './ArbolJson';
import { formatearNumero } from '../utils/formatoCelda';
import DataVisualizer from './DataVisualizer';
import DataProfiler from './DataProfiler';
import { useToast } from './ToastProvider';

// Rendered-cell budget: with results this wide (a real case hit 2700 columns from
// an Excel import), rendering every cell of every row freezes the UI — 50 rows ×
// 2700 cols is 135k <td>s, each doing its own JSON.stringify for the tooltip.
// pageSize adapts to keep rows × columns under this budget instead of a fixed 50.
const CELL_BUDGET = 15000;
// Beyond this many columns, show the "wide result" banner + column windowing.
const WIDE_THRESHOLD = 150;
// Max columns rendered at once for a wide result (paginated horizontally).
const MAX_VISIBLE_COLS = 60;
// Width of the row-number gutter, in px. Must match .rt-rownum-th/.rt-rownum-td
// in index.css — the sticky offsets of pinned columns are stacked on top of it.
const ROWNUM_WIDTH = 54;
// Fallback column width used by both the <th> and the sticky offset math. Must
// match the `columnWidths[col] || 150` default used when resizing.
const DEFAULT_COL_WIDTH = 150;

const ResultsTable = ({ data, types, executionTime, query, sourcePath = null, currentEditorQuery, onDbChange, isReportMode = false, initialChartConfig = null, onConfigChange = null, onViewModeChange = null, initialViewMode = null, editorSettings = {}, onPopout = null, truncated = false, rowLimit = null, splitEnabled = false, onGetOtherPaneResults = null, onCreateNew = null, lazyPanels = false, lectura = false, recordadoCon = null, onAbrirArchivo = null, clavePestana = null, onAsistir = null }) => {
    // Lo que tenía esta pestaña la última vez, si son los mismos datos (Dec-82).
    const [memoria] = useState(() => (clavePestana ? leerResultados(clavePestana, data) : null));
    const toast = useToast();
    // currentEditorQuery may be a string (notebook cells) or a getter function
    // (EditorPane passes a stable getter so typing doesn't break this memo).
    const resolveEditorQuery = () => (typeof currentEditorQuery === 'function' ? currentEditorQuery() : currentEditorQuery);
    const [currentPage, setCurrentPage] = useState(memoria?.currentPage ?? 1);
    const [pageSize, setPageSize] = useState(memoria?.pageSize ?? 50);
    const [isSaveDbModalOpen, setIsSaveDbModalOpen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showVaultPrompt, setShowVaultPrompt] = useState(false);
    // 6.0 (M5): «Save / Share ▾» — closes on a click outside or Escape.
    const [menuGuardar, setMenuGuardar] = useState(false);
    const menuGuardarRef = useRef(null);
    // The results panel clips what leaves it (overflow: hidden), and it usually sits at the
    // bottom of the window: the menu is fixed to the window, below the button or above it.
    const [posMenu, setPosMenu] = useState(null);
    const abrirMenuGuardar = () => {
        const r = menuGuardarRef.current?.getBoundingClientRect();
        if (r) {
            const arriba = window.innerHeight - r.bottom < 340 && r.top > 340;
            setPosMenu({ position: 'fixed', right: Math.max(8, window.innerWidth - r.right), left: 'auto', marginTop: 0,
                ...(arriba ? { top: 'auto', bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4, bottom: 'auto' }) });
        }
        setShowVaultPrompt(false);
        setMenuGuardar(v => !v);
    };
    useEffect(() => {
        if (!menuGuardar && !showVaultPrompt) return;
        const fuera = (e) => { if (!menuGuardarRef.current?.contains(e.target)) { setMenuGuardar(false); setShowVaultPrompt(false); } };
        const tecla = (e) => { if (e.key === 'Escape') { setMenuGuardar(false); setShowVaultPrompt(false); } };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', tecla);
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
    }, [menuGuardar, showVaultPrompt]);
    const [vaultTitle, setVaultTitle] = useState('');
    const [vaultTags, setVaultTags] = useState('');
    const [vaultSaving, setVaultSaving] = useState(false);
    const [exportingAction, setExportingAction] = useState(null);

    /**
     * Leer no es lo mismo que empotrar.
     *
     * `isReportMode` existia para meter una tabla dentro de una lamina, y por eso
     * ademas de quitar los mandos pagina de 200 en 200 y suelta la numeracion
     * fija. Para el modo lectura del cuaderno eso seria un mal negocio: sirve
     * dieciseis tablas a la vez, y cuadruplicar las filas de cada una deshace
     * justo lo que se acaba de arreglar. Asi que `lectura` quita los mandos y el
     * panel de edicion del grafico, y no toca nada mas: se sigue paginando de
     * cincuenta en cincuenta y el pie de paginas se queda, porque pasar paginas
     * es leer.
     */
    const sinMandos = isReportMode || lectura;

    // View State
    const vistaDeSalida = initialViewMode || (initialChartConfig ? 'chart' : (editorSettings.defaultViewMode || 'table'));
    const [viewMode, setViewMode] = useState(vistaDeSalida);

    const handleViewModeChange = (mode) => {
        setViewMode(mode);
    };

    // Which of the three panels have ever been asked for.
    //
    // All three are always in the DOM and only one is visible, which is fine for
    // ONE results table and expensive when there are sixteen — a notebook mounts
    // the chart builder and the profiler for every cell, including the fifteen
    // nobody is looking at. Measured on sixteen cells: the editors cost nothing
    // and the result panels blocked the main thread for 3.4 s of a single scroll.
    //
    // With `lazyPanels` a panel is built the first time it is selected, and then
    // it stays: switching back and forth must not rebuild a chart. The default is
    // off, so a single results table behaves exactly as before.
    const [panelesVistos, setPanelesVistos] = useState(() => new Set([vistaDeSalida]));
    useEffect(() => {
        setPanelesVistos((prev) => (prev.has(viewMode) ? prev : new Set(prev).add(viewMode)));
    }, [viewMode]);
    const montarPanel = (cual) => !lazyPanels || panelesVistos.has(cual);

    // Report the active view UP (mount + every change) so the tab — and through
    // it the AI assistant — knows whether the user is on Table/Chart/Profile.
    // Single source of truth (vs. also firing in the click handler).
    useEffect(() => {
        if (onViewModeChange) onViewModeChange(viewMode);
    }, [viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // Enhanced Table State
    const [globalSearch, setGlobalSearch] = useState(memoria?.globalSearch ?? '');
    const deferredGlobalSearch = useDeferredValue(globalSearch);

    const [sortConfig, setSortConfig] = useState(memoria?.sortConfig ?? null); // { key: string, direction: 'asc' | 'desc' }

    const [columnFilters, setColumnFilters] = useState(memoria?.columnFilters ?? {}); // { [key]: rawFilterString }
    const deferredColumnFilters = useDeferredValue(columnFilters);

    const [showFilters, setShowFilters] = useState(memoria?.showFilters ?? false); // Toggle filter row

    // --- Wide-result column windowing (Fase 0/1: perf guard for 100s-1000s of columns) ---
    const [selectedColumns, setSelectedColumns] = useState(memoria?.selectedColumns ?? null); // null = auto window; Set = manual pick, overrides windowing
    const [columnPage, setColumnPage] = useState(memoria?.columnPage ?? 0); // which MAX_VISIBLE_COLS window is showing (when no manual selection)
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [columnPickerSearch, setColumnPickerSearch] = useState('');

    // --- Pinned columns ---
    // Order is insertion order; the render orders them by their position in the
    // table so the sticky offsets stack in the same order the user sees.
    const [pinnedColumns, setPinnedColumns] = useState(memoria?.pinnedColumns ?? []);

    // --- Cell peek (triple-click a cell to read long text in full) ---
    const [cellPeek, setCellPeek] = useState(null); // { column, text, x, y }

    // --- Column Context Menu State ---
    const [contextMenu, setContextMenu] = useState(null); // { x, y, column }

    // --- Compare State ---
    const [storedForCompare, setStoredForCompare] = useState(null); // { data, label }
    const [compareOpen, setCompareOpen] = useState(false);

    // --- Column Resizing State ---
    const [columnWidths, setColumnWidths] = useState(memoria?.columnWidths ?? {}); // { [colName]: widthInPx }
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

    // --- Cell Peek Dismiss (Escape) ---
    useEffect(() => {
        if (!cellPeek) return;
        const onKey = (e) => { if (e.key === 'Escape') setCellPeek(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [cellPeek]);

    // Al volver a la pestaña, la tabla se deja como estaba: estado y scroll. El
    // scroll se lee aquí (efecto de layout) porque después ya no hay elemento.
    const contenidoRef = useRef(null);
    const estadoRef = useRef(null);
    estadoRef.current = { datos: data, currentPage, pageSize, globalSearch, sortConfig, columnFilters, showFilters, selectedColumns, columnPage, pinnedColumns, columnWidths };
    useLayoutEffect(() => {
        const el = contenidoRef.current;
        if (el && memoria) { el.scrollTop = memoria.scrollTop || 0; el.scrollLeft = memoria.scrollLeft || 0; }
        return () => {
            if (!clavePestana) return;
            recordarResultados(clavePestana, { ...estadoRef.current, scrollTop: el?.scrollTop || 0, scrollLeft: el?.scrollLeft || 0 });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset page when data changes
    const datosVistosRef = useRef(memoria ? data : null);
    useEffect(() => {
        // Son los datos con los que se restauró: no hay nada que reiniciar.
        if (datosVistosRef.current === data) return;
        datosVistosRef.current = data;
        setCurrentPage(1);
        setPinnedColumns([]);
        setCellPeek(null);
        setGlobalSearch('');
        setSortConfig(null);
        setColumnFilters({});
        setSelectedColumns(null);
        setColumnPage(0);
        setShowColumnPicker(false);
        setColumnPickerSearch('');

        // Adaptive default page size: keeps rendered cells under CELL_BUDGET.
        // For normal tables (<=300 columns) this still resolves to 50, same as
        // before — it only kicks in for unusually wide results.
        const colCount = data && data.length > 0 && data[0] ? Object.keys(data[0]).length : 0;
        if (colCount > 0) {
            setPageSize(Math.min(50, Math.max(5, Math.floor(CELL_BUDGET / colCount))));
        }
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

    // --- Wide-result column windowing ---
    // `columns` above is always the FULL list — exports, "copy all column names",
    // and the vault snapshot all keep using it untouched. `visibleColumns` is only
    // what gets rendered in the <table> DOM.
    const isWide = columns.length > WIDE_THRESHOLD;
    const totalColumnPages = Math.max(1, Math.ceil(columns.length / MAX_VISIBLE_COLS));
    const safeColumnPage = Math.min(columnPage, totalColumnPages - 1);
    const windowedColumns = (selectedColumns && selectedColumns.size > 0)
        ? columns.filter(c => selectedColumns.has(c))
        : (isWide
            ? columns.slice(safeColumnPage * MAX_VISIBLE_COLS, safeColumnPage * MAX_VISIBLE_COLS + MAX_VISIBLE_COLS)
            : columns);
    // A pinned column stays rendered even when the window/selection moves past
    // it — otherwise pinning a column and then paging the window would silently
    // drop the very column the user asked to keep in sight. Set lookups keep
    // this O(n) on a 2700-column result.
    const visibleColumns = pinnedColumns.length > 0
        ? (() => {
            const inWindow = new Set(windowedColumns);
            const pinned = new Set(pinnedColumns);
            return columns.filter(c => inWindow.has(c) || pinned.has(c));
        })()
        : windowedColumns;

    const toggleColumn = (col) => {
        setSelectedColumns(prev => {
            // First toggle seeds the manual selection from whatever's currently
            // visible, so unchecking one column keeps the rest of the window intact.
            const base = prev ? new Set(prev) : new Set(visibleColumns);
            if (base.has(col)) base.delete(col); else base.add(col);
            return base;
        });
    };

    // --- Row-number gutter + pinned columns ---
    const showRowNumbers = editorSettings.showRowNumbers !== false;
    // When off, the gutter still shows but scrolls away with the rest of the table.
    const rowNumSticky = showRowNumbers && editorSettings.stickyRowNumbers !== false && !isReportMode;

    const colWidthOf = (c) => columnWidths[c] || DEFAULT_COL_WIDTH;

    // A pinned column is sticky on BOTH edges at once: `left` keeps it from
    // scrolling off to the left, `right` keeps it from scrolling off to the
    // right. The browser clamps to whichever constraint the column is currently
    // violating, which is exactly the "drags along and parks on the edge it was
    // about to leave" behaviour — first column parks left, last column parks
    // right, a middle column flips sides depending on the scroll direction.
    // Offsets stack in visual order so several pinned columns never overlap.
    const pinnedOrdered = visibleColumns.filter(c => pinnedColumns.includes(c));
    const stickyOffsets = {};
    let accLeft = rowNumSticky ? ROWNUM_WIDTH : 0;
    for (const c of pinnedOrdered) {
        stickyOffsets[c] = { left: accLeft, right: 0 };
        accLeft += colWidthOf(c);
    }
    let accRight = 0;
    for (let i = pinnedOrdered.length - 1; i >= 0; i--) {
        stickyOffsets[pinnedOrdered[i]].right = accRight;
        accRight += colWidthOf(pinnedOrdered[i]);
    }

    const pinStyleFor = (col, base) => {
        const o = stickyOffsets[col];
        if (!o) return base;
        return { ...base, position: 'sticky', left: o.left, right: o.right };
    };

    const togglePin = (col) => {
        setPinnedColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
    };

    const openCellPeek = (e, col, val) => {
        const text = (val === null || val === undefined)
            ? ''
            : (typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val));
        const rect = e.currentTarget.getBoundingClientRect();
        // 6.0 (O5): a nested value (VARIANT, STRUCT, LIST…) opens as a tree.
        setCellPeek({ column: col, text, valor: (val && typeof val === 'object') ? val : undefined, x: rect.left, y: rect.bottom });
    };

    // Page-size options never let the user pick something that would blow the
    // cell budget back open on a wide result — the standard sizes are offered
    // only when they'd still fit, and the current (possibly adaptive) value is
    // always included so the <select> never shows a value that isn't an option.
    const maxSafePageSize = Math.max(5, Math.floor(CELL_BUDGET / visibleColumns.length));
    const pageSizeOptions = Array.from(new Set([
        pageSize,
        ...[50, 100, 500, 1000].filter(n => n <= maxSafePageSize),
    ])).sort((a, b) => a - b);

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
            setShowExportMenu(false); setMenuGuardar(false);
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

    const formatValue = (val, col) => {
        try {
            if (val === null || val === undefined) return <span className="rt-null">NULL</span>;

            // 6.0 (M1, F5): por el tipo de la columna; un DECIMAL o un BIGINT llegan como
            // texto y se veían sin separador de miles al lado de un DOUBLE que sí lo tenía.
            const numero = formatearNumero(val, types?.[col]);
            if (numero !== null) {
                return typeof val === 'number' && !Number.isInteger(val)
                    ? <span title={String(val)} className="rt-float">{numero}</span>
                    : numero;
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
            {!sinMandos && (
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
                                {viewMode === 'table' && columns.length > 20 && (
                                    <div className="toolbar-dropdown">
                                        <button
                                            className={`rt-view-btn${showColumnPicker ? ' active' : ''}`}
                                            onClick={() => setShowColumnPicker(v => !v)}
                                            aria-label="Choose visible columns"
                                            title="Pick which columns to show"
                                        >
                                            <LuColumns3 size={13} />
                                            {selectedColumns && selectedColumns.size > 0
                                                ? `${visibleColumns.length}/${columns.length}`
                                                : isWide ? `${visibleColumns.length}/${columns.length}` : 'Columns'}
                                        </button>
                                        {showColumnPicker && (
                                            <div className="toolbar-dropdown-menu rt-column-picker">
                                                <input
                                                    type="text"
                                                    className="vault-save-dropdown-input"
                                                    placeholder="Search columns..."
                                                    value={columnPickerSearch}
                                                    onChange={(e) => setColumnPickerSearch(e.target.value)}
                                                    autoFocus
                                                />
                                                <div className="rt-column-picker-actions">
                                                    <button onClick={() => setSelectedColumns(new Set(columns))}>Select all</button>
                                                    <button onClick={() => { setSelectedColumns(null); setColumnPage(0); }}>Reset</button>
                                                </div>
                                                <div className="rt-column-picker-list">
                                                    {columns
                                                        .filter(c => c.toLowerCase().includes(columnPickerSearch.toLowerCase()))
                                                        .map(c => (
                                                            <label key={c} className="rt-column-picker-item">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={visibleColumns.includes(c)}
                                                                    onChange={() => toggleColumn(c)}
                                                                />
                                                                <span>{c}</span>
                                                            </label>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <span className="rt-stats">
                                {totalRows} result{totalRows !== 1 ? 's' : ''}
                                {columns.length > 0 && ` × ${columns.length} column${columns.length !== 1 ? 's' : ''}`}
                                {' '}({executionTime}ms)
                                {data.length !== totalRows && ` [Filtered from ${data.length}]`}
                                {truncated && (
                                    <span style={{ marginLeft: 8, color: 'var(--feedback-warning)', fontWeight: 500 }}
                                          title={`Result capped at ${rowLimit?.toLocaleString()} rows, so the window stays responsive. Adjust "Max Rows" in Settings → Editor (there is a safety limit of 1,000,000 rows or 256 MB), use LIMIT or an aggregate in your query, or Export for the full data.`}>
                                        <LuTriangleAlert size={11} style={{ verticalAlign: '-1px' }} /> first {rowLimit?.toLocaleString()} rows shown
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
                            {/* E2: the result as a door to Assist (only a .sql's results). 6.0 (M5):
                                «Chart it» left — the Chart tab is right there, with its own Assist button
                                (and «Chart the result» stays among Assist's suggestions). */}
                            {onAsistir && (
                                <button className="rt-action-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => onAsistir('explicar_resultado')} title="Ask Assist what stands out in this result">
                                    <LuSparkles size={12} /> Explain
                                </button>
                            )}

                            {/* A stored result waiting to be compared stays in sight (it is a state, not an action). */}
                            {storedForCompare && (
                                <>
                                    <button
                                        className="rt-action-btn rt-action-btn--accent"
                                        onClick={() => setCompareOpen(true)}
                                        aria-label="Compare results"
                                        title={`Compare ${storedForCompare.label || 'the stored result'} with this one`}
                                    >
                                        <LuGitCompare size={12} /> Compare
                                    </button>
                                    <button
                                        className="rt-action-btn"
                                        onClick={() => { setStoredForCompare(null); setCompareOpen(false); }}
                                        title="Forget the stored result"
                                        aria-label="Clear comparison"
                                    >
                                        <LuX size={12} />
                                    </button>
                                </>
                            )}

                            {/* 6.0 (M5): what you do WITH a result, in one menu. Before: Store A ·
                                Pop-out · Save as table… · Vault · Download ▾, five buttons in a second row. */}
                            <div className="toolbar-dropdown" ref={menuGuardarRef}>
                                <button
                                    className={`rt-action-btn${menuGuardar || showVaultPrompt ? ' active' : ''}`}
                                    onClick={abrirMenuGuardar}
                                    aria-haspopup="menu"
                                    aria-expanded={menuGuardar}
                                    title="Save, compare, pop out or download this result"
                                >
                                    <LuSave size={12} /> Save / Share <LuChevDown size={11} />
                                </button>
                                {menuGuardar && (
                                    <div className="toolbar-dropdown-menu rt-menu-guardar" role="menu" style={posMenu || { right: 0, left: 'auto' }}>
                                        <div role="menuitem" className="toolbar-dropdown-item" title="Save the whole query as a table or view (not only the rows shown)"
                                            onClick={() => { setMenuGuardar(false); setIsSaveDbModalOpen(true); }}>
                                            <LuDatabase size={13} /> Save as table or view…
                                        </div>
                                        <div role="menuitem" className="toolbar-dropdown-item" title="Keep this analysis even if its file goes away"
                                            onClick={() => { setMenuGuardar(false); setVaultTitle(''); setVaultTags(''); setShowVaultPrompt(true); }}>
                                            <LuPackage size={13} /> Save to Analysis Vault…
                                        </div>
                                        {!storedForCompare && (
                                            <div role="menuitem" className="toolbar-dropdown-item" title="Keep these rows, run another query, then Compare"
                                                onClick={() => { setMenuGuardar(false); setStoredForCompare({ data: sortedData, label: `Result A (${sortedData.length} rows)` }); toast.info('Stored. Run another query, then click Compare.'); }}>
                                                <LuGitCompare size={13} /> Store for comparison
                                            </div>
                                        )}
                                        {/* Compare with the other split pane in one click: reads that pane's current results. */}
                                        {splitEnabled && !storedForCompare && (
                                            <div role="menuitem" className="toolbar-dropdown-item" title="Compare these results with the other pane"
                                                onClick={() => {
                                                    setMenuGuardar(false);
                                                    const other = onGetOtherPaneResults ? onGetOtherPaneResults() : null;
                                                    if (!other) { toast.info('The other pane has no results to compare against yet.'); return; }
                                                    setStoredForCompare(other);
                                                    setCompareOpen(true);
                                                }}>
                                                <LuGitCompare size={13} /> Compare with the other pane
                                            </div>
                                        )}
                                        {onPopout && (
                                            <div role="menuitem" className="toolbar-dropdown-item" title="Open these results in their own window"
                                                onClick={() => { setMenuGuardar(false); onPopout(); }}>
                                                <LuExternalLink size={13} /> Pop out
                                            </div>
                                        )}
                                        {/* Download: the rows shown in THIS table (in-memory, instant). Full export of
                                            the whole query lives in the editor toolbar ("Export"): it re-runs the query. */}
                                        <div className="rt-dropdown-subtext">Download the rows loaded here</div>
                                        {[{ label: 'CSV', icon: <LuFileSpreadsheet size={13} />, fn: handleExportCsv, action: 'exportCSV' },
                                        { label: 'JSON', icon: <LuFileJson size={13} />, fn: handleExportJson, action: 'exportJSON' },
                                        { label: 'Copy to clipboard', icon: <LuClipboardCopy size={13} />, fn: handleCopyClipboard, action: 'copy' },
                                        ].map(item => {
                                            const isBusy = exportingAction === item.action;
                                            return (
                                                <div
                                                    key={item.label}
                                                    role="menuitem"
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
                                {showVaultPrompt && (
                                    <div className="toolbar-dropdown-menu vault-save-dropdown" style={posMenu || { right: 0, left: 'auto' }}>
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
                        </div>
                    </div>

                    {/* Wide-result banner: only when the table has more columns than we
                        render at once. Explains why not everything is visible and links
                        straight to the picker instead of leaving the user to guess. */}
                    {viewMode === 'table' && isWide && (
                        <div className="rt-wide-banner">
                            <LuTriangleAlert size={13} />
                            <span>
                                Very wide result: {columns.length.toLocaleString()} columns.
                                {selectedColumns && selectedColumns.size > 0
                                    ? ` Showing the ${visibleColumns.length} you picked.`
                                    : ` Showing columns ${safeColumnPage * MAX_VISIBLE_COLS + 1}-${Math.min((safeColumnPage + 1) * MAX_VISIBLE_COLS, columns.length)}.`}
                            </span>
                            <button className="rt-wide-banner-link" onClick={() => setShowColumnPicker(true)}>
                                Pick columns
                            </button>
                            {!(selectedColumns && selectedColumns.size > 0) && totalColumnPages > 1 && (
                                <div className="rt-col-paginator">
                                    <button
                                        className="rt-col-paginator-btn"
                                        onClick={() => setColumnPage(p => Math.max(0, p - 1))}
                                        disabled={safeColumnPage === 0}
                                        aria-label="Previous columns"
                                    >
                                        <LuChevronLeft size={13} />
                                    </button>
                                    <span>{safeColumnPage + 1} / {totalColumnPages}</span>
                                    <button
                                        className="rt-col-paginator-btn"
                                        onClick={() => setColumnPage(p => Math.min(totalColumnPages - 1, p + 1))}
                                        disabled={safeColumnPage >= totalColumnPages - 1}
                                        aria-label="Next columns"
                                    >
                                        <LuChevronRight size={13} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Results Content */}
            <div ref={contenidoRef} className={`rt-content${isReportMode ? ' report-mode' : ''}`} style={viewMode === 'chart' ? { overflow: 'hidden', minHeight: '200px' } : undefined}>
                {/* Table */}
                <div style={{ display: viewMode === 'table' ? 'contents' : 'none' }}>
                    <table className="rt-table" style={{ fontSize: `${editorSettings.resultsFontSize || 13}px` }}>
                        <thead className="rt-thead">
                            <tr>
                                {showRowNumbers && (
                                    <th
                                        className={`rt-th rt-rownum-th${rowNumSticky ? ' rt-th--pinned' : ''}`}
                                        style={rowNumSticky ? { width: ROWNUM_WIDTH, position: 'sticky', left: 0 } : { width: ROWNUM_WIDTH }}
                                        title="Row number"
                                    >
                                        <div className="rt-th-inner rt-rownum-inner">#</div>
                                    </th>
                                )}
                                {visibleColumns.map((col) => {
                                    const isSorted = sortConfig?.key === col;
                                    const isPinned = !!stickyOffsets[col];
                                    return (
                                        <th
                                            key={col}
                                            className={`rt-th${isPinned ? ' rt-th--pinned' : ''}`}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({ x: e.clientX, y: e.clientY, column: col });
                                            }}
                                            style={pinStyleFor(col, { width: colWidthOf(col) })}
                                        >
                                            <div className="rt-th-inner" onClick={() => handleSort(col)} title="Click to sort">
                                                <div className="rt-th-col">
                                                    <span className="rt-th-name">{col}</span>
                                                    {types && types[col] && (
                                                        <span className="rt-th-type">{types[col]}</span>
                                                    )}
                                                </div>
                                                <button
                                                    className={`rt-th-pin${isPinned ? ' active' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); togglePin(col); }}
                                                    title={isPinned ? 'Unpin column' : 'Pin column'}
                                                    aria-label={isPinned ? `Unpin column ${col}` : `Pin column ${col}`}
                                                    aria-pressed={isPinned}
                                                >
                                                    {isPinned ? <LuPinOff size={11} /> : <LuPin size={11} />}
                                                </button>
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
                            {showFilters && !sinMandos && (
                                <tr>
                                    {showRowNumbers && (
                                        <td
                                            className={`rt-filter-cell rt-rownum-filter${rowNumSticky ? ' rt-th--pinned' : ''}`}
                                            style={rowNumSticky ? { position: 'sticky', left: 0 } : undefined}
                                        />
                                    )}
                                    {visibleColumns.map((col) => (
                                        <td
                                            key={`filter-${col}`}
                                            className={`rt-filter-cell${stickyOffsets[col] ? ' rt-th--pinned' : ''}`}
                                            style={pinStyleFor(col, undefined)}
                                        >
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
                                        {showRowNumbers && (
                                            <td
                                                className={`rt-td rt-rownum-td${rowNumSticky ? ' rt-td--pinned' : ''}`}
                                                style={rowNumSticky ? { position: 'sticky', left: 0 } : undefined}
                                            >
                                                {startIndex + rowIndex + 1}
                                            </td>
                                        )}
                                        {visibleColumns.map((col) => (
                                            <td
                                                key={`${rowIndex}-${col}`}
                                                className={`rt-td${stickyOffsets[col] ? ' rt-td--pinned' : ''}`}
                                                style={pinStyleFor(col, undefined)}
                                                // Triple-click opens the cell peek: long text (an LLM answer, a
                                                // JSON blob) is unreadable in a one-line ellipsised cell.
                                                onClick={(e) => {
                                                    const v = row ? row[col] : null;
                                                    // A nested value is unreadable in one line: one click opens its tree.
                                                    if (e.detail < 3 && !(v && typeof v === 'object')) return;
                                                    openCellPeek(e, col, v);
                                                }}
                                                // Tooltip text is computed lazily, only for the cell actually
                                                // hovered — not on every render for every cell. With a wide
                                                // result (thousands of columns) computing this eagerly for
                                                // every <td> (String()/JSON.stringify() × rows × cols) was
                                                // the single biggest render cost and froze the UI.
                                                onMouseEnter={(e) => {
                                                    const val = row ? row[col] : null;
                                                    e.currentTarget.title = (val && typeof val === 'object')
                                                        ? JSON.stringify(val)
                                                        : String(val ?? '');
                                                }}
                                            >
                                                {formatValue(row ? row[col] : null, col)}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={visibleColumns.length + (showRowNumbers ? 1 : 0)} className="rt-empty">
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
                                    {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Chart */}
                <div className={`rt-panel chart${viewMode === 'chart' ? ' visible' : ' hidden'}`}>
                    {montarPanel('chart') && <DataVisualizer data={data} tipos={types} truncado={truncated} isReportMode={isReportMode} lectura={lectura} query={query} sourcePath={sourcePath} initialChartConfig={initialChartConfig} onConfigChange={onConfigChange} isActive={viewMode === 'chart'} onCreateNew={onCreateNew} recordadoCon={recordadoCon} onAbrirArchivo={onAbrirArchivo} destinoIa={clavePestana} />}
                </div>

                {/* Profile */}
                <div className={`rt-panel profile${viewMode === 'profile' ? ' visible' : ' hidden'}`}>
                    {montarPanel('profile') && <DataProfiler data={data} isActive={viewMode === 'profile'} query={query} />}
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
                    <div className="column-context-menu-item" onClick={() => { togglePin(contextMenu.column); setContextMenu(null); }}>
                        {pinnedColumns.includes(contextMenu.column)
                            ? <><LuPinOff size={13} /> Unpin column</>
                            : <><LuPin size={13} /> Pin column</>}
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

            {/* Cell Peek — full, selectable, multi-line view of one cell's value.
                Opened with a triple-click on the cell. */}
            {cellPeek && (
                <>
                    <div className="rt-cell-peek-backdrop" onClick={() => setCellPeek(null)} />
                    <div
                        className="rt-cell-peek"
                        style={{
                            left: Math.max(8, Math.min(cellPeek.x, window.innerWidth - 448)),
                            top: Math.max(8, Math.min(cellPeek.y + 4, window.innerHeight - 268)),
                        }}
                    >
                        <div className="rt-cell-peek-head">
                            <span className="rt-cell-peek-col" title={cellPeek.column}>{cellPeek.column}</span>
                            <span className="rt-cell-peek-len">{cellPeek.text.length.toLocaleString()} chars</span>
                            <button
                                className="rt-cell-peek-btn"
                                onClick={() => { navigator.clipboard.writeText(cellPeek.text); toast.info('Copied'); }}
                                title="Copy content"
                                aria-label="Copy cell content"
                            >
                                <LuClipboardCopy size={12} />
                            </button>
                            <button
                                className="rt-cell-peek-btn"
                                onClick={() => setCellPeek(null)}
                                title="Close (Esc)"
                                aria-label="Close"
                            >
                                <LuX size={12} />
                            </button>
                        </div>
                        {cellPeek.valor !== undefined ? (
                            <div className="rt-cell-peek-body rt-cell-peek-arbol"><ArbolJson valor={cellPeek.valor} /></div>
                        ) : (
                            <textarea
                                className="rt-cell-peek-body"
                                readOnly
                                value={cellPeek.text}
                                autoFocus
                                spellCheck={false}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default memo(ResultsTable);
