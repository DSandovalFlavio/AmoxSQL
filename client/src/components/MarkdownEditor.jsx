import { API_BASE } from '../api.js';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
    LuBold, LuItalic, LuStrikethrough, LuCode, LuQuote, LuList,
    LuListOrdered, LuListTodo, LuLink, LuTable, LuMinus, LuSave,
    LuChevronDown, LuBot, LuX, LuPencilLine, LuEye, LuColumns2, LuType,
    LuFileCode2, LuDownload, LuListTree, LuAlignCenter, LuStretchHorizontal,
} from 'react-icons/lu';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import './MarkdownEditor.css';
import { registerMonaco, MONACO_THEME_NAME, isLightTheme } from '../monacoTheme.js';
import MarkdownPreview from './markdown/MarkdownPreview';
import { extractToc } from './markdown/markdownUtils';

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
    onOpenFile,
    filePath,
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

    const [widthMode, setWidthMode] = useState(() => {
        const saved = localStorage.getItem('amoxsql-md-width-mode');
        return saved === 'full' ? 'full' : 'compact';
    });
    const [showToc, setShowToc] = useState(false);

    const toolbarVisible = editorSettings?.markdownToolbarVisible ?? true;

    const toc = useMemo(() => extractToc(content), [content]);

    // ── PDF export ─────────────────────────────────────────────────────────────
    const handleExportPdf = async () => {
        if (!containerRef.current || isExporting) return;
        setIsExporting(true);
        try {
            const previewBody = containerRef.current.querySelector('.mde-preview-body');
            if (!previewBody) return;
            const canvas = await html2canvas(previewBody, { scale: 2, useCORS: true, backgroundColor: isLightTheme(theme) ? '#ffffff' : '#1e1e1e' });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;
            // Multi-page: slice the tall image across A4 pages instead of squashing it.
            let heightLeft = imgHeight;
            let position = 0;
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
            while (heightLeft > 0) {
                position -= pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
            }
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

    const toggleWidth = () => {
        setWidthMode(prev => {
            const next = prev === 'compact' ? 'full' : 'compact';
            localStorage.setItem('amoxsql-md-width-mode', next);
            return next;
        });
    };

    const scrollToHeading = (slug) => {
        const el = document.getElementById(slug);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ── Image paste / drop ──────────────────────────────────────────────────────
    const handleImageFile = useCallback(async (file) => {
        if (!file || !file.type?.startsWith('image/')) return false;
        const ext = (file.type.split('/')[1] || 'png').replace('+xml', '');
        const relPath = `assets/image-${Date.now()}.${ext}`;
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
            const res = await fetch(`${API_BASE}/api/files/write-binary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: relPath, dataBase64: dataUrl }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const ed = editorRef.current;
            if (ed) insertBlock(ed, `\n![image](./${data.path})\n`);
            return true;
        } catch (e) {
            console.error('Image upload failed', e);
            return false;
        }
    }, []);

    // ── Monaco mount ─────────────────────────────────────────────────────────

    const handleEditorWillMount = useCallback((monaco) => {
        registerMonaco(monaco);

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

        // Image paste / drop → save into project assets + insert markdown
        const dom = editor.getDomNode();
        if (dom && !dom._mdeImgBound) {
            dom._mdeImgBound = true;
            dom.addEventListener('paste', (e) => {
                const items = e.clipboardData?.items || [];
                for (const it of items) {
                    if (it.kind === 'file' && it.type.startsWith('image/')) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleImageFile(it.getAsFile());
                        return;
                    }
                }
            }, true);
            dom.addEventListener('drop', (e) => {
                const files = e.dataTransfer?.files || [];
                for (const f of files) {
                    if (f.type.startsWith('image/')) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleImageFile(f);
                        return;
                    }
                }
            }, true);
        }
    }, [onSave, cycleView, handleImageFile]);

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

    const editorStyle = viewMode === 'split' && splitPos ? { width: splitPos } : undefined;
    const previewStyle = viewMode === 'split' && splitPos ? { width: `calc(100% - ${splitPos}px - 5px)` } : undefined;
    const tocEnabled = viewMode !== 'edit';

    // ── Render ────────────────────────────────────────────────────────────────

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
                            {/* Outline + width + export */}
                            <div className="ep-action-group">
                                <button
                                    className={`ep-action-btn${showToc && tocEnabled ? ' active' : ''}`}
                                    title={tocEnabled ? 'Toggle outline' : 'Outline (needs preview)'}
                                    onClick={() => setShowToc(v => !v)}
                                    disabled={!tocEnabled}
                                    style={{ opacity: tocEnabled ? 1 : 0.4 }}
                                >
                                    <LuListTree size={13} />
                                </button>
                                <button
                                    className="ep-action-btn"
                                    title={widthMode === 'compact' ? 'Compact (centered) — click for full width' : 'Full width — click for compact'}
                                    onClick={toggleWidth}
                                >
                                    {widthMode === 'compact' ? <LuAlignCenter size={13} /> : <LuStretchHorizontal size={13} />}
                                </button>
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
                                    title="Toggle Assist"
                                >
                                    {showAiSidebar ? <LuX size={13} /> : <LuBot size={13} />}
                                    <span>{showAiSidebar ? 'Close Assist' : 'Assist'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Content ── */}
                <div className={`mde-content mde-content--${viewMode}`} ref={containerRef}>

                    {tocEnabled && showToc && (
                        <div className="mde-toc">
                            <div className="mde-toc-title">Outline</div>
                            {toc.length === 0 ? (
                                <div className="mde-toc-empty">No headings</div>
                            ) : (
                                <ul className="mde-toc-list">
                                    {toc.map((h, i) => (
                                        <li
                                            key={i}
                                            className="mde-toc-item"
                                            style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                                            onClick={() => scrollToHeading(h.slug)}
                                            title={h.text}
                                        >
                                            {h.text}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {(viewMode === 'edit' || viewMode === 'split') && (
                        <div className="mde-editor-pane" style={editorStyle}>
                            <Editor
                                value={content}
                                language="markdown"
                                theme={MONACO_THEME_NAME}
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
                            <MarkdownPreview
                                content={content}
                                theme={theme}
                                onOpenFile={onOpenFile}
                                widthMode={widthMode}
                                filePath={filePath}
                            />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default MarkdownEditor;
