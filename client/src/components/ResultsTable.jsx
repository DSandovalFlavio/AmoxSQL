import { useState, useEffect } from 'react';
import { LuTable, LuChartBar, LuSearch, LuChevronUp, LuChevronDown, LuSave, LuFileSpreadsheet } from "react-icons/lu";
import SaveToDbModal from './SaveToDbModal';
import DataVisualizer from './DataVisualizer';

const ResultsTable = ({ data, executionTime, query, onDbChange, isReportMode = false }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [isSaveDbModalOpen, setIsSaveDbModalOpen] = useState(false);

    // View State
    const [viewMode, setViewMode] = useState('table');

    // Enhanced Table State
    const [globalSearch, setGlobalSearch] = useState('');
    const [sortConfig, setSortConfig] = useState(null); // { key: string, direction: 'asc' | 'desc' }
    const [columnFilters, setColumnFilters] = useState({}); // { [key]: rawFilterString }
    const [showFilters, setShowFilters] = useState(false); // Toggle filter row

    // Reset page when data changes
    useEffect(() => {
        setCurrentPage(1);
        setGlobalSearch('');
        setSortConfig(null);
        setColumnFilters({});
    }, [data]);

    if (!data || data.length === 0) {
        return <div style={{ padding: '10px' }}>No results{executionTime ? ` (${executionTime}ms)` : ''}</div>;
    }

    const columns = (data && data.length > 0 && data[0]) ? Object.keys(data[0]) : [];

    if (columns.length === 0) {
        return <div style={{ padding: '10px' }}>No columns found in result.</div>;
    }

    // --- Data Processing Pipeline ---

    // 1. Filtering (Global & Column)
    const filteredData = data.filter(row => {
        // Global Search
        if (globalSearch) {
            const searchLower = globalSearch.toLowerCase();
            const rowMatches = Object.values(row).some(val =>
                String(val).toLowerCase().includes(searchLower)
            );
            if (!rowMatches) return false;
        }

        // Column Filters
        if (showFilters) {
            for (const [col, filterVal] of Object.entries(columnFilters)) {
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

    // 2. Sorting
    const sortedData = [...filteredData];
    if (sortConfig) {
        sortedData.sort((a, b) => {
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

    // 3. Pagination
    const totalRows = sortedData.length;
    const totalPages = Math.ceil(totalRows / pageSize) || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);
    const currentData = sortedData.slice(startIndex, endIndex);

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

    const handleExportCsv = () => {
        if (!sortedData || sortedData.length === 0) return;

        const headers = Object.keys(sortedData[0]);
        const csvContent = [
            headers.join(','),
            ...sortedData.map(row => headers.map(header => {
                const cell = row[header] === null ? '' : String(row[header]);
                if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                    return `"${cell.replace(/"/g, '""')}"`;
                }
                return cell;
            }).join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `query_results_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSaveToDb = async (name, type) => {
        if (!query) return { success: false, error: "No query to save." };

        const cleanQuery = query.trim().replace(/;$/, '');
        const createSql = `CREATE ${type} "${name}" AS ${cleanQuery}`;

        try {
            const response = await fetch('http://localhost:3001/api/query', {
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
            if (val === null || val === undefined) return <span style={{ color: '#555', fontStyle: 'italic' }}>NULL</span>;

            if (typeof val === 'number') {
                if (Number.isInteger(val)) {
                    return val.toLocaleString();
                }
                // Floats: Limit decimals but show full value on hover
                // Using 'en-US' or undefined to get dot/comma based on locale, but typically dot for decimals in dev tools is preferred. 
                // Let's use undefined to respect browser locale or force standard if needed. 
                const formatted = val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
                return (
                    <span title={String(val)} style={{ cursor: 'help', borderBottom: '1px dotted #555' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header / Toolbar */}
            {!isReportMode && (
                <div style={{ padding: '8px 12px', background: 'var(--panel-bg)', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>

                    {/* Top Row: Controls & Stats */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            {/* View Switcher */}
                            <div style={{ display: 'flex', backgroundColor: 'var(--input-bg)', borderRadius: '4px', padding: '2px', border: '1px solid var(--border-color)' }}>
                                <button onClick={() => setViewMode('table')} style={{ padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', backgroundColor: viewMode === 'table' ? 'var(--accent-color-user)' : 'transparent', color: viewMode === 'table' ? 'var(--button-text-color)' : 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <LuTable size={14} /> Table
                                </button>
                                <button onClick={() => setViewMode('chart')} style={{ padding: '4px 12px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', backgroundColor: viewMode === 'chart' ? 'var(--accent-color-user)' : 'transparent', color: viewMode === 'chart' ? 'var(--button-text-color)' : 'var(--text-muted)', borderRadius: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <LuChartBar size={14} /> Chart
                                </button>
                            </div>

                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                {totalRows} result{totalRows !== 1 ? 's' : ''} ({executionTime}ms)
                                {data.length !== totalRows && ` [Filtered from ${data.length}]`}
                            </span>
                        </div>

                        {/* Right Actions */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {/* Global Search */}
                            {viewMode === 'table' && (
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        placeholder="Global Search..."
                                        value={globalSearch}
                                        onChange={(e) => { setGlobalSearch(e.target.value); setCurrentPage(1); }}
                                        style={{
                                            backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-active)',
                                            padding: '4px 8px 4px 28px', borderRadius: '4px', fontSize: '12px', width: '180px'
                                        }}
                                    />
                                    <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', opacity: 0.5, display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                                        <LuSearch size={14} />
                                    </span>
                                </div>
                            )}

                            {/* Export / Save */}
                            <button onClick={() => setIsSaveDbModalOpen(true)} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', backgroundColor: 'var(--sidebar-item-hover-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <LuSave size={14} /> Save As
                            </button>
                            <button onClick={handleExportCsv} style={{ padding: '4px 10px', fontSize: '11px', fontWeight: '600', backgroundColor: 'var(--sidebar-item-hover-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <LuFileSpreadsheet size={14} /> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Bottom Row: Pagination & Filters Toggle */}
                    {viewMode === 'table' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={showFilters} onChange={(e) => setShowFilters(e.target.checked)} style={{ accentColor: 'var(--accent-color-user)' }} />
                                    Show Column Filters
                                </label>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: '2px 6px', background: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', cursor: 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}>&lt;</button>
                                <span> Page {currentPage} of {totalPages} </span>
                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: '2px 6px', background: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', cursor: 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}>&gt;</button>
                                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ marginLeft: '10px', background: 'var(--input-bg)', color: 'var(--text-active)', border: '1px solid var(--border-color)', padding: '2px', borderRadius: '3px' }}>
                                    <option value={50}>50 rows</option>
                                    <option value={100}>100 rows</option>
                                    <option value={500}>500 rows</option>
                                    <option value={1000}>1000 rows</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Results Content */}
            <div style={{ flex: 1, overflow: viewMode === 'chart' ? 'hidden' : 'auto', border: '1px solid var(--border-color)', marginTop: '10px', borderRadius: '4px', display: 'flex', flexDirection: 'column' }}>
                {viewMode === 'table' ? (
                    <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                            <tr>
                                {columns.map((col) => {
                                    const isSorted = sortConfig?.key === col;

                                    return (
                                        <th
                                            key={col}
                                            style={{
                                                cursor: 'pointer', userSelect: 'none', position: 'relative',
                                                backgroundColor: 'var(--table-header-bg)',
                                                color: 'var(--text-active)',
                                                borderRight: '1px solid var(--border-color)',
                                                borderBottom: '1px solid var(--border-color)', // Always have bottom border
                                                minWidth: '100px'
                                            }}
                                            onClick={() => handleSort(col)}
                                            title="Click to sort"
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{col}</span>
                                                <span style={{ fontSize: '10px', opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                                                    {isSorted && (sortConfig.direction === 'asc' ? <LuChevronUp size={10} /> : <LuChevronDown size={10} />)}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                            {/* Filter Row */}
                            {showFilters && !isReportMode && (
                                <tr>
                                    {columns.map((col) => (
                                        <td key={`filter-${col}`} style={{ padding: '4px', backgroundColor: 'var(--table-header-bg)', borderBottom: '1px solid var(--border-color)' }}>
                                            <input
                                                type="text"
                                                placeholder={`Filter ${col}...`}
                                                value={columnFilters[col] || ''}
                                                onChange={(e) => handleFilterChange(col, e.target.value)}
                                                style={{
                                                    width: '100%', border: '1px solid var(--border-color)', background: 'var(--input-bg)', color: 'var(--text-active)',
                                                    fontSize: '11px', padding: '2px 4px', borderRadius: '2px'
                                                }}
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
                                            <td key={`${rowIndex}-${col}`}>{formatValue(row ? row[col] : null)}</td>
                                        ))}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={columns.length} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                                        No matching records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <DataVisualizer data={data} isReportMode={isReportMode} />
                )}
            </div>

            <SaveToDbModal
                isOpen={isSaveDbModalOpen}
                onClose={() => setIsSaveDbModalOpen(false)}
                onSave={handleSaveToDb}
            />
        </div>
    );
}

export default ResultsTable;
