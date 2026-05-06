import { API_BASE } from '../api.js';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    LuBold, LuItalic, LuStrikethrough, LuCode, LuQuote, LuList,
    LuListOrdered, LuListTodo, LuLink, LuTable, LuMinus, LuSave,
    LuChevronDown, LuBot, LuX, LuPencilLine, LuEye, LuColumns2, LuType,
    LuFileCode2, LuDownload,
} from 'react-icons/lu';
import mermaid from 'mermaid';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import './MarkdownEditor.css';
import { buildMonacoTheme } from './SqlEditor';

// ── Link Hover Preview Component ──────────────────────────────────────────────
const FileLinkHover = ({ href, children }) => {
    const [showPopover, setShowPopover] = useState(false);
    const [previewContent, setPreviewContent] = useState(null);
    const [loading, setLoading] = useState(false);
    const isSql = href?.endsWith('.sql');
    const isAmoxvis = href?.endsWith('.amoxvis');

    const handleMouseEnter = async () => {
        if (!isSql && !isAmoxvis) return;
        setShowPopover(true);
        if (previewContent || loading) return;
        setLoading(true);
        try {
            const cleanPath = href.replace(/^(\.\/|\/)/, '');
            const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(cleanPath)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (isSql) {
                const lines = data.content.split('\n');
                setPreviewContent(lines.slice(0, 20).join('\n') + (lines.length > 20 ? '\n...' : ''));
            } else if (isAmoxvis) {
                setPreviewContent(JSON.parse(data.content));
            }
        } catch (e) {
            setPreviewContent({ error: 'Failed to load preview' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <span className="mde-link-wrapper" onMouseEnter={handleMouseEnter} onMouseLeave={() => setShowPopover(false)} style={{ position: 'relative', display: 'inline-block' }}>
            <a href={href} style={{ textDecoration: 'underline', color: 'var(--accent-primary)', cursor: 'pointer' }}>{children}</a>
            {showPopover && (isSql || isAmoxvis) && (
                <span className="mde-link-popover" style={{
                    position: 'absolute', bottom: '100%', left: '0',
                    marginBottom: '8px', padding: '12px', background: 'var(--surface-overlay)',
                    border: '1px solid var(--border-default)', borderRadius: '8px', zIndex: 1000,
                    width: '350px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--text-color)',
                    textAlign: 'left', display: 'block'
                }}>
                    <span style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-active)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSql ? <LuFileCode2 size={14} /> : <LuEye size={14} />} Preview: {href.split('/').pop()}
                    </span>
                    {loading ? <span style={{ opacity: 0.7, display: 'block' }}>Loading preview...</span> : isSql ? (
                        <span style={{ margin: 0, padding: '8px', background: 'var(--surface-base)', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '11px', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-default)', display: 'block', whiteSpace: 'pre-wrap' }}>
                            {previewContent}
                        </span>
                    ) : isAmoxvis && previewContent && !previewContent.error ? (
                        <span style={{ background: 'var(--surface-base)', borderRadius: '4px', padding: '12px', border: '1px solid var(--border-default)', display: 'block' }}>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px', display: 'block' }}>Chart Configuration</span>
                            <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', opacity: 0.8 }}>
                                <span><strong>Type:</strong> {previewContent.config?.chartType || 'Auto'}</span>
                                <span><strong>X-Axis:</strong> {previewContent.config?.xAxisKey || '-'}</span>
                                <span style={{ gridColumn: 'span 2' }}><strong>Y-Axis:</strong> {(previewContent.config?.yAxisKeys || []).join(', ') || '-'}</span>
                            </span>
                        </span>
                    ) : (
                        <span style={{ color: '#ef4444', display: 'block' }}>{previewContent?.error || 'Error loading preview'}</span>
                    )}
                </span>
            )}
        </span>
    );
};

// ── Editor manipulation helpers ───────────────────────────────────────────────

function wrapSelection(editor, prefix, suffix = prefix) {
    const selection = editor.getSelection();
    const selected = editor.getModel().getValueInRange(selection);
    editor.executeEdits('mde', [{ range: selection, text: `${prefix}${selected}${suffix}`, forceMoveMarkers: true }]);
    editor.focus();
}

function toggleLinePrefix(editor, prefix) {
    const sel = editor.getSelection();
    const model = editor.getModel();
    const start = sel.startLineNumber;
    const end = sel.endLineNumber;
    const allHave = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        .every(n => model.getLineContent(n).startsWith(prefix));
    const edits = [];
    for (let n = start; n <= end; n++) {
        const line = model.getLineContent(n);
        if (allHave) {
            edits.push({ range: { startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: prefix.length + 1 }, text: '' });
        } else if (!line.startsWith(prefix)) {
            edits.push({ range: { startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: 1 }, text: prefix });
        }
    }
    if (edits.length) editor.executeEdits('mde', edits);
    editor.focus();
}

function insertBlock(editor, text) {
    editor.executeEdits('mde', [{ range: editor.getSelection(), text, forceMoveMarkers: true }]);
    editor.focus();
}

function removeHeadings(editor) {
    const sel = editor.getSelection();
    const model = editor.getModel();
    const edits = [];
    for (let n = sel.startLineNumber; n <= sel.endLineNumber; n++) {
        const match = model.getLineContent(n).match(/^(#{1,6} )/);
        if (match) {
            edits.push({ range: { startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: match[1].length + 1 }, text: '' });
        }
    }
    if (edits.length) editor.executeEdits('mde', edits);
    editor.focus();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEW_MODES = [
    { id: 'edit', Icon: LuPencilLine, title: 'Edit only' },
    { id: 'split', Icon: LuColumns2, title: 'Split view' },
    { id: 'preview', Icon: LuEye, title: 'Preview only' },
];

const LIGHT_THEMES = ['ivory', 'mist', 'light', 'snow'];

// ── Component ─────────────────────────────────────────────────────────────────

const MarkdownEditor = ({
    content,
    onChange,
    onSave,
    onRequestSaveAs,
    theme,
    editorSettings,
    onToggleAi,
    showAiSidebar,
    isActive,
}) => {
    const editorRef = useRef(null);
    const containerRef = useRef(null);
    const isResizingRef = useRef(false);
    const saveMenuRef = useRef(null);
    const tablePickerRef = useRef(null);
    const headingMenuRef = useRef(null);

    const [showSaveMenu, setShowSaveMenu] = useState(false);
    const [showTablePicker, setShowTablePicker] = useState(false);
    const [tableHover, setTableHover] = useState({ rows: 0, cols: 0 });
    const [showHeadingMenu, setShowHeadingMenu] = useState(false);
    const [splitPos, setSplitPos] = useState(null); // null = 50/50
    const [isExporting, setIsExporting] = useState(false);

    const [viewMode, setViewMode] = useState(() => {
        const saved = localStorage.getItem('amoxsql-md-view-mode');
        if (saved && ['edit', 'split', 'preview'].includes(saved)) return saved;
        return editorSettings?.markdownDefaultView || 'edit';
    });

    const toolbarVisible = editorSettings?.markdownToolbarVisible ?? true;

    const monacoTheme = LIGHT_THEMES.includes(theme) ? 'duckdb-light' : 'duckdb-dark';

    // ── Mermaid Component ─────────────────────────────────────────────────────
    const MermaidRenderer = useCallback(({ code }) => {
        const ref = useRef(null);
        const [svg, setSvg] = useState('');

        useEffect(() => {
            mermaid.initialize({
                startOnLoad: false,
                theme: LIGHT_THEMES.includes(theme) ? 'default' : 'dark',
                securityLevel: 'loose',
            });
            const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
            mermaid.render(id, code).then((result) => {
                setSvg(result.svg);
            }).catch((e) => {
                console.error('Mermaid render error', e);
                setSvg(`<div style="color:red; font-family:var(--font-mono); font-size:12px; padding:10px; border:1px solid red; border-radius:4px;">Mermaid Syntax Error</div>`);
            });
        }, [code, theme]);

        return <div ref={ref} dangerouslySetInnerHTML={{ __html: svg }} className="mermaid-diagram" style={{ display: 'flex', justifyContent: 'center', margin: '1em 0' }} />;
    }, [theme]);

    const CodeRenderer = useCallback(({ node, inline, className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || '');
        const lang = match ? match[1] : null;
        if (!inline && lang === 'mermaid') {
            return <MermaidRenderer code={String(children).replace(/\n$/, '')} />;
        }
        return (
            <code className={className} {...props}>
                {children}
            </code>
        );
    }, [MermaidRenderer]);

    const handleExportPdf = async () => {
        if (!containerRef.current || isExporting) return;
        setIsExporting(true);
        try {
            const previewBody = containerRef.current.querySelector('.mde-preview-body');
            if (!previewBody) return;
            const canvas = await html2canvas(previewBody, { scale: 2, useCORS: true, backgroundColor: LIGHT_THEMES.includes(theme) ? '#ffffff' : '#1e1e1e' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('Document.pdf');
        } catch (e) {
            console.error('Failed to export PDF', e);
        } finally {
            setIsExporting(false);
        }
    };


    const cycleView = useCallback(() => {
        setViewMode(prev => {
            const modes = ['edit', 'split', 'preview'];
            const next = modes[(modes.indexOf(prev) + 1) % modes.length];
            localStorage.setItem('amoxsql-md-view-mode', next);
            return next;
        });
    }, []);

    const switchView = (mode) => {
        setViewMode(mode);
        localStorage.setItem('amoxsql-md-view-mode', mode);
    };

    // ── Monaco mount ─────────────────────────────────────────────────────────

    const handleEditorWillMount = useCallback((monaco) => {
        monaco.editor.defineTheme('duckdb-dark', buildMonacoTheme(true));
        monaco.editor.defineTheme('duckdb-light', buildMonacoTheme(false));

        if (!monaco.languages._mdAutocompleteRegistered) {
            monaco.languages._mdAutocompleteRegistered = true;
            monaco.languages.registerCompletionItemProvider('markdown', {
                triggerCharacters: ['@'],
                provideCompletionItems: async (model, position) => {
                    const textUntilPosition = model.getValueInRange({
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    });
                    const match = textUntilPosition.match(/@([\w.-]*)$/);
                    if (!match) return { suggestions: [] };

                    const word = model.getWordUntilPosition(position);
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn - 1,
                        endColumn: word.endColumn
                    };

                    try {
                        const suggestions = [];

                        // 1. Fetch tables from Schema
                        const schemaRes = await fetch(`${API_BASE}/api/db/schemas`);
                        if (schemaRes.ok) {
                            const schemas = await schemaRes.json();
                            if (schemas && schemas.length) {
                                schemas.forEach(schemaObj => {
                                    schemaObj.tables.forEach(table => {
                                        suggestions.push({
                                            label: `@${table.name}`,
                                            kind: monaco.languages.CompletionItemKind.Class,
                                            detail: 'Table',
                                            insertText: `**${table.name}**`,
                                            range: range
                                        });
                                        if (table.columns) {
                                            table.columns.forEach(col => {
                                                suggestions.push({
                                                    label: `@${table.name}.${col.column_name}`,
                                                    kind: monaco.languages.CompletionItemKind.Field,
                                                    detail: `Column (${col.data_type})`,
                                                    insertText: `\`${table.name}.${col.column_name}\``,
                                                    range: range
                                                });
                                            });
                                        }
                                    });
                                });
                            }
                        }

                        // 2. Fetch Files (recursive)
                        const collectSqlFiles = async (dir = '') => {
                            const res = await fetch(`${API_BASE}/api/files/list?path=${encodeURIComponent(dir)}`);
                            if (!res.ok) return [];
                            const files = await res.json();
                            let sqlFiles = [];
                            for (const f of files) {
                                if (f.isDirectory) {
                                    const sub = await collectSqlFiles(dir ? `${dir}/${f.name}` : f.name);
                                    sqlFiles = sqlFiles.concat(sub);
                                } else if (f.name.endsWith('.sql') || f.name.endsWith('.amoxvis')) {
                                    sqlFiles.push(dir ? `${dir}/${f.name}` : f.name);
                                }
                            }
                            return sqlFiles;
                        };
                        const files = await collectSqlFiles('');
                        files.forEach(fullPath => {
                            const isSql = fullPath.endsWith('.sql');
                            suggestions.push({
                                label: `@${fullPath}`,
                                kind: monaco.languages.CompletionItemKind.File,
                                detail: isSql ? 'SQL File' : 'Amoxvis Chart',
                                insertText: `[${fullPath.split('/').pop()}](./${fullPath})`,
                                range: range
                            });
                        });

                        return { suggestions };
                    } catch (e) {
                        console.error('Autocomplete error', e);
                        return { suggestions: [] };
                    }
                }
            });
        }
    }, []);

    const handleEditorMount = useCallback((editor, monaco) => {
        editorRef.current = editor;
        const { CtrlCmd, Shift } = monaco.KeyMod;
        const { KeyS, KeyB, KeyI, KeyK, KeyV } = monaco.KeyCode;
        editor.addCommand(CtrlCmd | KeyS, () => onSave?.());
        editor.addCommand(CtrlCmd | KeyB, () => wrapSelection(editor, '**'));
        editor.addCommand(CtrlCmd | KeyI, () => wrapSelection(editor, '_'));
        editor.addCommand(CtrlCmd | KeyK, () => {
            const txt = editor.getModel().getValueInRange(editor.getSelection());
            insertBlock(editor, `[${txt || 'link text'}](url)`);
        });
        editor.addCommand(CtrlCmd | Shift | KeyV, () => cycleView());
    }, [onSave, cycleView]);

    // ── Close dropdowns on outside click ─────────────────────────────────────

    useEffect(() => {
        const handler = (e) => {
            if (saveMenuRef.current && !saveMenuRef.current.contains(e.target)) setShowSaveMenu(false);
            if (tablePickerRef.current && !tablePickerRef.current.contains(e.target)) setShowTablePicker(false);
            if (headingMenuRef.current && !headingMenuRef.current.contains(e.target)) setShowHeadingMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Split resizer ─────────────────────────────────────────────────────────

    const startResizing = (e) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!isResizingRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pos = e.clientX - rect.left;
            if (pos > 160 && pos < rect.width - 160) setSplitPos(pos);
        };
        const onMouseUp = () => {
            if (!isResizingRef.current) return;
            isResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    // ── Table insert ──────────────────────────────────────────────────────────

    const insertTable = (rows, cols) => {
        if (!editorRef.current) return;
        const header = '| ' + Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ') + ' |';
        const sep = '| ' + Array(cols).fill('---').join(' | ') + ' |';
        const row = '| ' + Array(cols).fill('   ').join(' | ') + ' |';
        const table = '\n' + [header, sep, ...Array(Math.max(0, rows - 1)).fill(row)].join('\n') + '\n';
        insertBlock(editorRef.current, table);
        setShowTablePicker(false);
    };

    const act = useCallback((fn) => { if (editorRef.current) fn(editorRef.current); }, []);

    // ── Monaco options ────────────────────────────────────────────────────────

    const monacoOptions = {
        fontSize: editorSettings?.fontSize || 14,
        fontFamily: editorSettings?.fontFamily || "'JetBrains Mono', 'Consolas', monospace",
        wordWrap: 'on',
        lineNumbers: editorSettings?.lineNumbers || 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderWhitespace: 'none',
        padding: { top: 16, bottom: 16 },
        contextmenu: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const editorPane = (
        <div className="mde-editor-pane">
            <Editor
                value={content}
                language="markdown"
                theme={monacoTheme}
                onChange={onChange}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorMount}
                options={monacoOptions}
            />
        </div>
    );

    const previewPane = (
        <div className="mde-preview-pane">
            <div className="mde-preview-body">
                {content?.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeRenderer, a: FileLinkHover }}>{content}</ReactMarkdown>
                ) : (
                    <span className="mde-preview-empty">Empty document — switch to Edit to start writing.</span>
                )}
            </div>
        </div>
    );

    const editorStyle = viewMode === 'split' && splitPos ? { width: splitPos } : undefined;
    const previewStyle = viewMode === 'split' && splitPos ? { width: `calc(100% - ${splitPos}px - 5px)` } : undefined;

    return (
        <div className={`mde-wrap${isActive ? ' active' : ''}`}>
            <div className="ep-editor-card mde-card">

                {/* ── Toolbar ── */}
                {toolbarVisible && (
                    <div className="ep-action-bar mde-toolbar">
                        <div className="ep-action-left">

                            {/* Headings */}
                            <div className="ep-action-group" ref={headingMenuRef}>
                                <button
                                    className="ep-action-btn mde-heading-btn"
                                    title="Headings"
                                    onClick={() => setShowHeadingMenu(v => !v)}
                                >
                                    <LuType size={13} />
                                    <span>H</span>
                                    <LuChevronDown size={9} />
                                </button>
                                {showHeadingMenu && (
                                    <div className="ep-action-dropdown mde-heading-dropdown">
                                        {[1, 2, 3, 4, 5, 6].map(n => (
                                            <div
                                                key={n}
                                                className="ep-action-dropdown-item mde-heading-item"
                                                style={{ fontSize: `${Math.max(11, 17 - n)}px` }}
                                                onClick={() => { act(e => toggleLinePrefix(e, '#'.repeat(n) + ' ')); setShowHeadingMenu(false); }}
                                            >
                                                {'#'.repeat(n)}&nbsp; Heading {n}
                                            </div>
                                        ))}
                                        <div className="ep-action-dropdown-item mde-heading-clear"
                                            onClick={() => { act(removeHeadings); setShowHeadingMenu(false); }}>
                                            Remove heading
                                        </div>
                                    </div>
                                )}
                            </div>

                            <span className="mde-sep" />

                            {/* Inline */}
                            <div className="ep-action-group">
                                <button className="ep-action-btn" title="Bold (Ctrl+B)" onClick={() => act(e => wrapSelection(e, '**'))}><LuBold size={13} /></button>
                                <button className="ep-action-btn" title="Italic (Ctrl+I)" onClick={() => act(e => wrapSelection(e, '_'))}><LuItalic size={13} /></button>
                                <button className="ep-action-btn" title="Strikethrough" onClick={() => act(e => wrapSelection(e, '~~'))}><LuStrikethrough size={13} /></button>
                                <button className="ep-action-btn" title="Inline code" onClick={() => act(e => wrapSelection(e, '`'))}><LuCode size={13} /></button>
                            </div>

                            <span className="mde-sep" />

                            {/* Blocks */}
                            <div className="ep-action-group">
                                <button className="ep-action-btn" title="Blockquote" onClick={() => act(e => toggleLinePrefix(e, '> '))}><LuQuote size={13} /></button>
                                <button className="ep-action-btn" title="Code block" onClick={() => act(e => {
                                    const txt = e.getModel().getValueInRange(e.getSelection());
                                    insertBlock(e, `\`\`\`\n${txt}\n\`\`\``);
                                })}><LuFileCode2 size={13} /></button>
                            </div>

                            <span className="mde-sep" />

                            {/* Lists */}
                            <div className="ep-action-group">
                                <button className="ep-action-btn" title="Bullet list" onClick={() => act(e => toggleLinePrefix(e, '- '))}><LuList size={13} /></button>
                                <button className="ep-action-btn" title="Numbered list" onClick={() => act(e => toggleLinePrefix(e, '1. '))}><LuListOrdered size={13} /></button>
                                <button className="ep-action-btn" title="Task list" onClick={() => act(e => toggleLinePrefix(e, '- [ ] '))}><LuListTodo size={13} /></button>
                            </div>

                            <span className="mde-sep" />

                            {/* Insert */}
                            <div className="ep-action-group">
                                <button className="ep-action-btn" title="Link (Ctrl+K)" onClick={() => act(e => {
                                    const txt = e.getModel().getValueInRange(e.getSelection());
                                    insertBlock(e, `[${txt || 'link text'}](url)`);
                                })}><LuLink size={13} /></button>

                                <div className="mde-table-anchor" ref={tablePickerRef}>
                                    <button className="ep-action-btn" title="Insert table" onClick={() => setShowTablePicker(v => !v)}><LuTable size={13} /></button>
                                    {showTablePicker && (
                                        <div className="mde-table-picker">
                                            <div className="mde-table-picker-label">
                                                {tableHover.cols > 0 ? `${tableHover.cols} × ${tableHover.rows} table` : 'Select size'}
                                            </div>
                                            <div className="mde-table-grid">
                                                {Array(6).fill(null).map((_, r) => (
                                                    <div key={r} className="mde-table-row">
                                                        {Array(6).fill(null).map((_, c) => (
                                                            <div
                                                                key={c}
                                                                className={`mde-table-cell${r < tableHover.rows && c < tableHover.cols ? ' on' : ''}`}
                                                                onMouseEnter={() => setTableHover({ rows: r + 1, cols: c + 1 })}
                                                                onMouseLeave={() => setTableHover({ rows: 0, cols: 0 })}
                                                                onClick={() => insertTable(tableHover.rows, tableHover.cols)}
                                                            />
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button className="ep-action-btn" title="Horizontal rule" onClick={() => act(e => insertBlock(e, '\n\n---\n\n'))}><LuMinus size={13} /></button>
                            </div>
                        </div>

                        <div className="ep-action-right">
                            <div className="ep-action-group">
                                <button
                                    className="ep-action-btn"
                                    title="Export as PDF"
                                    onClick={handleExportPdf}
                                    disabled={isExporting}
                                    style={{ opacity: isExporting ? 0.5 : 1 }}
                                >
                                    <LuDownload size={13} />
                                </button>
                            </div>

                            <span className="mde-sep" />

                            {/* View toggle */}
                            <div className="ep-action-group">
                                {VIEW_MODES.map(({ id, Icon, title }) => (
                                    <button
                                        key={id}
                                        className={`ep-action-btn${viewMode === id ? ' active' : ''}`}
                                        title={title}
                                        onClick={() => switchView(id)}
                                    >
                                        <Icon size={13} />
                                    </button>
                                ))}
                            </div>

                            {/* Save */}
                            <div className="ep-action-group" ref={saveMenuRef}>
                                <button className="ep-action-btn" onClick={onSave} title="Save (Ctrl+S)">
                                    <LuSave size={13} /> Save
                                </button>
                                <button className="ep-action-chevron" onClick={() => setShowSaveMenu(v => !v)}>
                                    <LuChevronDown size={10} />
                                </button>
                                {showSaveMenu && (
                                    <div className="ep-action-dropdown" style={{ right: 0, left: 'auto' }}>
                                        <div className="ep-action-dropdown-item" onClick={() => { onSave?.(); setShowSaveMenu(false); }}>Save</div>
                                        <div className="ep-action-dropdown-item" onClick={() => { onRequestSaveAs?.(); setShowSaveMenu(false); }}>Save As…</div>
                                    </div>
                                )}
                            </div>

                            {/* AI toggle */}
                            {onToggleAi && (
                                <button
                                    className={`ep-action-ai${showAiSidebar ? ' active' : ''}`}
                                    onClick={onToggleAi}
                                    title="Toggle AI Assistant"
                                >
                                    {showAiSidebar ? <LuX size={13} /> : <LuBot size={13} />}
                                    <span>{showAiSidebar ? 'Close AI' : 'AI'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Content ── */}
                <div className={`mde-content mde-content--${viewMode}`} ref={containerRef}>
                    {(viewMode === 'edit' || viewMode === 'split') && (
                        <div className="mde-editor-pane" style={editorStyle}>
                            <Editor
                                value={content}
                                language="markdown"
                                theme={monacoTheme}
                                onChange={onChange}
                                beforeMount={handleEditorWillMount}
                                onMount={handleEditorMount}
                                options={monacoOptions}
                            />
                        </div>
                    )}

                    {viewMode === 'split' && (
                        <div className="mde-split-handle" onMouseDown={startResizing} />
                    )}

                    {(viewMode === 'preview' || viewMode === 'split') && (
                        <div className="mde-preview-pane" style={previewStyle}>
                            <div className="mde-preview-body">
                                {content?.trim() ? (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeRenderer, a: FileLinkHover }}>{content}</ReactMarkdown>
                                ) : (
                                    <span className="mde-preview-empty">Empty document — switch to Edit to start writing.</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default MarkdownEditor;
