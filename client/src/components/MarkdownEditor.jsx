import React, { useState, useRef, useCallback, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    LuBold, LuItalic, LuStrikethrough, LuCode, LuQuote, LuList,
    LuListOrdered, LuListTodo, LuLink, LuTable, LuMinus, LuSave,
    LuChevronDown, LuBot, LuX, LuEdit2, LuEye, LuColumns2, LuType,
    LuFileCode2,
} from 'react-icons/lu';
import './MarkdownEditor.css';

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
    { id: 'edit', Icon: LuEdit2, title: 'Edit only' },
    { id: 'split', Icon: LuColumns2, title: 'Split view' },
    { id: 'preview', Icon: LuEye, title: 'Preview only' },
];

const LIGHT_THEMES = ['ivory', 'mist', 'light'];

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

    const [viewMode, setViewMode] = useState(() => {
        const saved = localStorage.getItem('amoxsql-md-view-mode');
        if (saved && ['edit', 'split', 'preview'].includes(saved)) return saved;
        return editorSettings?.markdownDefaultView || 'edit';
    });

    const toolbarVisible = editorSettings?.markdownToolbarVisible ?? true;

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

    const monacoTheme = LIGHT_THEMES.includes(theme) ? 'vs' : 'vs-dark';

    // ── Render ────────────────────────────────────────────────────────────────

    const editorPane = (
        <div className="mde-editor-pane">
            <Editor
                value={content}
                language="markdown"
                theme={monacoTheme}
                onChange={onChange}
                onMount={handleEditorMount}
                options={monacoOptions}
            />
        </div>
    );

    const previewPane = (
        <div className="mde-preview-pane">
            <div className="mde-preview-body">
                {content?.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
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
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
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
