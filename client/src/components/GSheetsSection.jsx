import { useState, useEffect, useRef } from 'react';
import {
    LuPlus, LuTrash2, LuRefreshCw, LuChevronDown, LuChevronRight,
    LuTable, LuExternalLink, LuCopy, LuCheck, LuLoader, LuX, LuFileSpreadsheet
} from 'react-icons/lu';

import { API_BASE as API } from '../api.js';

function GSheetsSection({ onQuerySheet }) {
    const [sheets, setSheets] = useState([]);
    const [status, setStatus] = useState({ isConfigured: false, extensionLoaded: false });
    const [isOpen, setIsOpen] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [addUrl, setAddUrl] = useState('');
    const [addError, setAddError] = useState('');
    const [addLoading, setAddLoading] = useState(false);
    const [expandedSheet, setExpandedSheet] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        fetchStatus();
        fetchSheets();
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`${API}/api/gsheets/status`);
            const data = await res.json();
            setStatus(data);
        } catch {}
    };

    const fetchSheets = async () => {
        try {
            const res = await fetch(`${API}/api/gsheets/sheets`);
            const data = await res.json();
            setSheets(data);
        } catch {}
    };

    const handleAdd = async () => {
        if (!addUrl.trim()) return;
        setAddLoading(true);
        setAddError('');
        try {
            const res = await fetch(`${API}/api/gsheets/sheets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: addUrl.trim() })
            });
            const data = await res.json();
            if (!res.ok) {
                setAddError(data.error || 'Failed to add sheet');
            } else {
                setSheets(prev => [...prev, data]);
                setAddUrl('');
                setIsAdding(false);
            }
        } catch (err) {
            setAddError(err.message);
        } finally {
            setAddLoading(false);
        }
    };

    const handleRemove = async (id) => {
        try {
            await fetch(`${API}/api/gsheets/sheets/${id}`, { method: 'DELETE' });
            setSheets(prev => prev.filter(s => s.id !== id));
        } catch {}
    };

    const handleQueryTab = (sheet, tabName) => {
        const sheetClause = tabName ? `, sheet='${tabName}'` : '';
        const sql = `SELECT * FROM read_gsheet('${sheet.spreadsheetId}'${sheetClause}) LIMIT 100`;
        onQuerySheet?.(sql, sheet.name, tabName);
    };

    const handleCopySnippet = (sheet, tabName) => {
        const sheetClause = tabName ? `, sheet='${tabName}'` : '';
        const snippet = `read_gsheet('${sheet.spreadsheetId}'${sheetClause})`;
        navigator.clipboard.writeText(snippet);
        setCopiedId(`${sheet.id}-${tabName || 'default'}`);
        setTimeout(() => setCopiedId(null), 2000);
    };

    useEffect(() => {
        if (isAdding && inputRef.current) inputRef.current.focus();
    }, [isAdding]);

    if (!status.isConfigured && sheets.length === 0) return null;

    return (
        <div className="gsheets-section">
            {/* Header */}
            <div className="gsheets-header" onClick={() => setIsOpen(!isOpen)}>
                <span className="gsheets-header-left">
                    {isOpen ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
                    <LuFileSpreadsheet size={13} style={{ color: 'var(--color-success)' }} />
                    <span className="gsheets-header-title">Google Sheets</span>
                    {sheets.length > 0 && <span className="gsheets-badge">{sheets.length}</span>}
                </span>
                <span className="gsheets-header-actions" onClick={e => e.stopPropagation()}>
                    <button
                        className="fe-header-btn"
                        onClick={() => { setIsAdding(true); setIsOpen(true); }}
                        title="Add Google Sheet"
                    >
                        <LuPlus size={13} />
                    </button>
                    <button className="fe-header-btn" onClick={() => { fetchSheets(); fetchStatus(); }} title="Refresh">
                        <LuRefreshCw size={12} />
                    </button>
                </span>
            </div>

            {isOpen && (
                <div className="gsheets-content">
                    {/* Add Sheet form */}
                    {isAdding && (
                        <div className="gsheets-add-form">
                            <input
                                ref={inputRef}
                                type="text"
                                className="gsheets-add-input"
                                placeholder="Paste Google Sheet URL..."
                                value={addUrl}
                                onChange={(e) => setAddUrl(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAdd();
                                    if (e.key === 'Escape') { setIsAdding(false); setAddUrl(''); setAddError(''); }
                                }}
                                disabled={addLoading}
                            />
                            <div className="gsheets-add-actions">
                                <button className="gsheets-add-btn" onClick={handleAdd} disabled={addLoading || !addUrl.trim()}>
                                    {addLoading ? <LuLoader size={12} className="spinning" /> : <LuCheck size={12} />}
                                </button>
                                <button className="gsheets-add-btn" onClick={() => { setIsAdding(false); setAddUrl(''); setAddError(''); }}>
                                    <LuX size={12} />
                                </button>
                            </div>
                            {addError && <div className="gsheets-error">{addError}</div>}
                        </div>
                    )}

                    {/* Sheet list */}
                    {sheets.length === 0 && !isAdding && (
                        <div className="gsheets-empty">
                            No sheets connected.
                            <button className="gsheets-empty-link" onClick={() => setIsAdding(true)}>
                                + Add one
                            </button>
                        </div>
                    )}

                    {sheets.map(sheet => (
                        <div key={sheet.id} className="gsheets-item-wrap">
                            <div
                                className="gsheets-item"
                                onClick={() => setExpandedSheet(expandedSheet === sheet.id ? null : sheet.id)}
                            >
                                <span className="gsheets-item-left">
                                    {expandedSheet === sheet.id ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />}
                                    <LuFileSpreadsheet size={13} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                                    <span className="gsheets-item-name" title={sheet.name}>{sheet.name}</span>
                                </span>
                                <span className="gsheets-item-actions" onClick={e => e.stopPropagation()}>
                                    <button
                                        className="gsheets-action-btn"
                                        onClick={() => window.open(sheet.url, '_blank')}
                                        title="Open in Google Sheets"
                                    >
                                        <LuExternalLink size={11} />
                                    </button>
                                    <button
                                        className="gsheets-action-btn gsheets-action-btn--danger"
                                        onClick={() => handleRemove(sheet.id)}
                                        title="Remove"
                                    >
                                        <LuTrash2 size={11} />
                                    </button>
                                </span>
                            </div>

                            {/* Expanded: show tabs as "tables" */}
                            {expandedSheet === sheet.id && (
                                <div className="gsheets-tabs">
                                    {(sheet.tabs && sheet.tabs.length > 0) ? sheet.tabs.map(tab => (
                                        <div key={tab.sheetId} className="gsheets-tab-item">
                                            <span
                                                className="gsheets-tab-link"
                                                onClick={() => handleQueryTab(sheet, tab.title)}
                                                title={`Query: SELECT * FROM read_gsheet('...', sheet='${tab.title}')`}
                                            >
                                                <LuTable size={12} style={{ color: 'var(--icon-csv)' }} />
                                                <span>{tab.title}</span>
                                            </span>
                                            <button
                                                className="gsheets-action-btn"
                                                onClick={() => handleCopySnippet(sheet, tab.title)}
                                                title="Copy read_gsheet() snippet"
                                            >
                                                {copiedId === `${sheet.id}-${tab.title}` ? <LuCheck size={10} /> : <LuCopy size={10} />}
                                            </button>
                                        </div>
                                    )) : (
                                        <div className="gsheets-tab-item">
                                            <span
                                                className="gsheets-tab-link"
                                                onClick={() => handleQueryTab(sheet, null)}
                                                title="Query default sheet"
                                            >
                                                <LuTable size={12} style={{ color: 'var(--icon-csv)' }} />
                                                <span>Sheet1 (default)</span>
                                            </span>
                                            <button
                                                className="gsheets-action-btn"
                                                onClick={() => handleCopySnippet(sheet, null)}
                                                title="Copy snippet"
                                            >
                                                {copiedId === `${sheet.id}-default` ? <LuCheck size={10} /> : <LuCopy size={10} />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default GSheetsSection;
