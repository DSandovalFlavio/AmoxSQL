import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { format } from 'sql-formatter';

/**
 * Monaco Editor Color Palettes — hex equivalents of CSS design tokens.
 *
 * These mirror the oklch / rgba values defined in index.css (:root and .light-theme).
 * Monaco requires bare hex strings and can't read CSS variables, so we maintain
 * this JS mapping. Keep in sync when updating design tokens in index.css.
 *
 * Hex values are derived from the oklch() approximations noted in CSS comments.
 * rgba text colors are flattened: rgba(255,255,255,a) → rgb(a*255) on dark,
 * rgba(0,0,0,a) → rgb(255 - a*255) on light.
 */
const MONACO_PALETTE = {
    dark: {
        // Surfaces (from oklch values in :root)
        bg:         '141517',  // --surface-base    oklch(0.145 0.006 270)
        raised:     '191B1F',  // --surface-raised  oklch(0.175 0.008 270)
        overlay:    '1F2125',  // --surface-overlay oklch(0.195 0.008 270)
        // Text (rgba flattened against dark bg)
        fg:         'EBEBEB',  // --text-primary    rgba(255,255,255,0.92)
        fgMuted:    '8F9099',  // --text-secondary  rgba(255,255,255,0.56)
        fgDim:      '5C5E66',  // --text-tertiary   rgba(255,255,255,0.36)
        fgDisabled: '333538',  // --text-disabled   rgba(255,255,255,0.20)
        // Accent
        accent:     '00DDDD',  // --accent-primary  oklch(0.905 0.155 195)
        // Syntax highlighting
        keyword:    '9B8FF2',  // --syntax-keyword  oklch(0.72 0.12 280)
        string:     'D4A76A',  // --syntax-string   oklch(0.76 0.10 70)
        number:     'E0A86E',  // --syntax-number   oklch(0.78 0.11 60)
        fn:         '6EC5D4',  // --syntax-function oklch(0.80 0.09 200)
        comment:    '5C5F66',  // --syntax-comment  oklch(0.46 0.01 270)
        type:       '4FC1FF',  // --syntax-type     oklch(0.79 0.12 235)
        operator:   'C4B99A',  // --syntax-operator oklch(0.78 0.06 60)
        variable:   'D1D3D8',  // --syntax-variable oklch(0.85 0.04 265)
        constant:   '5EC9A0',  // --syntax-constant oklch(0.80 0.10 150)
        error:      'E06C75',  // --feedback-error
    },
    light: {
        // Surfaces
        bg:         'FAFBFC',  // --surface-base    oklch(0.985 0.003 265)
        raised:     'F2F3F5',  // --surface-raised  oklch(0.965 0.004 265)
        overlay:    'FFFFFF',  // --surface-overlay oklch(1.000 0 0)
        // Text (rgba flattened against light bg)
        fg:         '141414',  // --text-primary    rgba(0,0,0,0.92)
        fgMuted:    '474747',  // --text-secondary  rgba(0,0,0,0.72)
        fgDim:      '737373',  // --text-tertiary   rgba(0,0,0,0.55)
        fgDisabled: 'A6A6A6',  // --text-disabled   rgba(0,0,0,0.35)
        // Accent
        accent:     '0059FF',  // --accent-primary  oklch(0.49 0.220 265)
        // Syntax highlighting (darker for light bg)
        keyword:    '5E6AD2',  // --syntax-keyword  oklch(0.48 0.16 280)
        string:     'B35E1A',  // --syntax-string   oklch(0.52 0.12 45)
        number:     'C46D1A',  // --syntax-number   oklch(0.55 0.13 55)
        fn:         '1E8A9E',  // --syntax-function oklch(0.50 0.12 200)
        comment:    'A0A3AA',  // --syntax-comment  oklch(0.55 0.02 270)
        type:       '1A8E80',  // --syntax-type     oklch(0.48 0.14 235)
        operator:   '6B6E76',  // --syntax-operator oklch(0.55 0.08 50)
        variable:   '3B3D42',  // --syntax-variable oklch(0.35 0.03 265)
        constant:   '1A8E60',  // --syntax-constant oklch(0.48 0.14 150)
        error:      'C13A3A',  // --feedback-error (light)
    },
};

/**
 * Resolve a CSS variable to a 6-digit hex color (without #).
 * Uses a temporary DOM element so the browser resolves oklch(), rgba(), etc.
 * Falls back to the provided default if resolution fails.
 */
const cssVarToHex = (varName, fallback) => {
    if (typeof document === 'undefined') return fallback;
    try {
        // Use a temp element — the browser resolves ANY color format (oklch, rgba, etc.)
        // to rgb() via getComputedStyle, which Canvas cannot do for oklch.
        const el = document.createElement('div');
        el.style.color = `var(${varName})`;
        document.body.appendChild(el);
        const resolved = getComputedStyle(el).color; // always returns rgb(r, g, b) or rgba(r, g, b, a)
        document.body.removeChild(el);

        if (!resolved || resolved === 'rgba(0, 0, 0, 0)') return fallback;

        // Parse rgb(r, g, b) or rgba(r, g, b, a)
        const match = resolved.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            const [, r, g, b] = match;
            return [r, g, b].map(c => Number(c).toString(16).padStart(2, '0')).join('');
        }

        return fallback;
    } catch {
        return fallback;
    }
};

/**
 * Build Monaco theme by reading live CSS variables from the active theme.
 * Falls back to MONACO_PALETTE when CSS variables aren't available (SSR, initial mount).
 */
const buildMonacoTheme = (isDark) => {
    const fallback = isDark ? MONACO_PALETTE.dark : MONACO_PALETTE.light;

    // Read surface/text/accent from live CSS variables
    const p = {
        bg:         cssVarToHex('--surface-base', fallback.bg),
        raised:     cssVarToHex('--surface-raised', fallback.raised),
        overlay:    cssVarToHex('--surface-overlay', fallback.overlay),
        fg:         cssVarToHex('--text-primary', fallback.fg),
        fgMuted:    cssVarToHex('--text-secondary', fallback.fgMuted),
        fgDim:      cssVarToHex('--text-tertiary', fallback.fgDim),
        fgDisabled: cssVarToHex('--text-disabled', fallback.fgDisabled),
        accent:     cssVarToHex('--accent-primary', fallback.accent),
        // Syntax colors — read from CSS variables, fall back to palette
        keyword:    cssVarToHex('--syntax-keyword', fallback.keyword),
        string:     cssVarToHex('--syntax-string', fallback.string),
        number:     cssVarToHex('--syntax-number', fallback.number),
        fn:         cssVarToHex('--syntax-function', fallback.fn),
        comment:    cssVarToHex('--syntax-comment', fallback.comment),
        type:       cssVarToHex('--syntax-type', fallback.type),
        operator:   cssVarToHex('--syntax-operator', fallback.operator),
        variable:   cssVarToHex('--syntax-variable', fallback.variable),
        constant:   cssVarToHex('--syntax-constant', fallback.constant),
        error:      cssVarToHex('--feedback-error', fallback.error),
    };

    // Derive selection highlight from raised surface
    const selBg = isDark
        ? `#${p.raised}` // use raised surface for selected row
        : `#${p.raised}`;

    return {
        base: isDark ? 'vs-dark' : 'vs',
        inherit: false,
        rules: [
            { token: '', foreground: p.fg, background: p.bg },
            { token: 'comment', foreground: p.comment, fontStyle: 'italic' },
            { token: 'comment.sql', foreground: p.comment, fontStyle: 'italic' },
            { token: 'keyword', foreground: p.keyword, fontStyle: 'bold' },
            { token: 'keyword.sql', foreground: p.keyword, fontStyle: 'bold' },
            { token: 'operator', foreground: p.operator },
            { token: 'operator.sql', foreground: p.operator },
            { token: 'delimiter', foreground: p.operator },
            { token: 'string', foreground: p.string },
            { token: 'string.sql', foreground: p.string },
            { token: 'number', foreground: p.number },
            { token: 'number.sql', foreground: p.number },
            { token: 'identifier', foreground: p.variable },
            { token: 'identifier.sql', foreground: p.variable },
            { token: 'identifier.quote', foreground: p.variable },
            { token: 'type', foreground: p.type },
            { token: 'type.sql', foreground: p.type },
            { token: 'predefined', foreground: p.fn },
            { token: 'predefined.sql', foreground: p.fn },
            { token: 'tag', foreground: p.keyword },
            { token: 'attribute.name', foreground: p.type },
            // Jinja / DBT
            { token: 'jinja.block', foreground: p.error, fontStyle: 'bold' },
            { token: 'jinja.tag', foreground: p.constant },
            { token: 'jinja.variable', foreground: p.fn },
            { token: 'jinja.comment', foreground: p.comment, fontStyle: 'italic' },
        ],
        colors: {
            'editor.background':                `#${p.bg}`,
            'editor.foreground':                `#${p.fg}`,
            'editor.lineHighlightBackground':   `#${p.raised}`,
            'editor.lineHighlightBorder':       '#00000000',
            'editorGutter.background':          `#${p.bg}`,
            'editorLineNumber.foreground':      `#${p.fgDisabled}`,
            'editorLineNumber.activeForeground': `#${p.fgDim}`,
            'editorCursor.foreground':          `#${p.accent}`,
            'editor.selectionBackground':       `#${p.keyword}30`,
            'editor.inactiveSelectionBackground': `#${p.keyword}18`,
            'editor.selectionHighlightBackground': `#${p.keyword}15`,
            'editor.findMatchBackground':       `#${p.string}40`,
            'editor.findMatchHighlightBackground': `#${p.string}25`,
            'editorIndentGuide.background':     `#${p.overlay}`,
            'editorIndentGuide.activeBackground': `#${p.overlay}`,
            'editorBracketMatch.background':    `#${p.keyword}20`,
            'editorBracketMatch.border':        `#${p.keyword}80`,
            'editorWidget.background':          `#${p.overlay}`,
            'editorWidget.border':              '#00000000',
            'editorSuggestWidget.background':   `#${p.overlay}`,
            'editorSuggestWidget.border':       '#00000000',
            'editorSuggestWidget.foreground':   `#${p.fg}`,
            'editorSuggestWidget.selectedBackground': selBg,
            'editorSuggestWidget.selectedForeground': `#${p.fg}`,
            'editorSuggestWidget.highlightForeground': `#${p.accent}`,
            'editorSuggestWidget.focusHighlightForeground': `#${p.accent}`,
            'editorHoverWidget.background':     `#${p.overlay}`,
            'editorHoverWidget.border':         '#00000000',
            'scrollbar.shadow':                 '#00000000',
            'scrollbarSlider.background':       isDark ? '#ffffff12' : '#00000010',
            'scrollbarSlider.hoverBackground':  isDark ? '#ffffff20' : '#00000020',
            'scrollbarSlider.activeBackground': isDark ? '#ffffff30' : '#00000030',
            'minimap.background':               `#${p.bg}`,
        }
    };
};

const SqlEditor = ({ value, onChange, ...props }) => {
    const disposablesRef = useRef([]);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const completionProviderRef = useRef(null);

    const handleEditorChange = (value, event) => {
        onChange(value);
        // Clear error markers when user edits the code
        if (editorRef.current && monacoRef.current) {
            monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'duckdb-error', []);
        }
    };

    const handleEditorWillMount = (monaco) => {
        // ── Build themes from CSS design tokens (single source of truth) ──
        monaco.editor.defineTheme('duckdb-dark', buildMonacoTheme(true));
        monaco.editor.defineTheme('duckdb-light', buildMonacoTheme(false));

        // Register custom Monarch tokenizer so JOIN modifiers and DuckDB keywords highlight correctly
        monaco.languages.setMonarchTokensProvider('sql', {
            defaultToken: 'identifier',
            ignoreCase: true,
            tokenPostfix: '.sql',
            keywords: [
                'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL',
                'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'ILIKE',
                'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT',
                'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE',
                'VIEW', 'INDEX', 'IF', 'EXISTS', 'WITH', 'RECURSIVE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
                'DISTINCT', 'ASC', 'DESC', 'CAST', 'OVER', 'PARTITION', 'WINDOW', 'ROWS', 'RANGE',
                'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'EXCLUDE',
                'LATERAL', 'UNNEST', 'PIVOT', 'UNPIVOT', 'QUALIFY', 'FETCH', 'RETURNING',
                'USING', 'DESCRIBE', 'SUMMARIZE', 'EXPLAIN', 'ANALYZE', 'REPLACE',
                'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'CHECK', 'DEFAULT',
                'TRUE', 'FALSE', 'ANY', 'SOME', 'ROLLUP', 'CUBE', 'GROUPING',
            ],
            typeKeywords: [
                'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'HUGEINT',
                'FLOAT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC',
                'VARCHAR', 'TEXT', 'STRING', 'CHAR', 'BLOB', 'BYTEA',
                'BOOLEAN', 'BOOL', 'DATE', 'TIME', 'TIMESTAMP', 'INTERVAL',
                'JSON', 'UUID', 'MAP', 'LIST', 'STRUCT', 'ARRAY',
            ],
            operators: ['=', '<>', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '%', '||', '::', '->>', '->'],
            tokenizer: {
                root: [
                    // Jinja/DBT blocks
                    [/\{\{/, 'jinja.variable', '@jinjaVariable'],
                    [/\{%/, 'jinja.tag', '@jinjaTag'],
                    [/\{#/, 'jinja.comment', '@jinjaComment'],
                    // Comments
                    [/--.*$/, 'comment'],
                    [/\/\*/, 'comment', '@comment'],
                    // Strings
                    [/'/, 'string', '@string'],
                    // Quoted identifiers
                    [/"/, 'identifier.quote', '@quotedIdentifier'],
                    // Numbers
                    [/\d+\.?\d*([eE][-+]?\d+)?/, 'number'],
                    [/\.\d+([eE][-+]?\d+)?/, 'number'],
                    // Identifiers and keywords
                    [/[a-zA-Z_]\w*/, {
                        cases: {
                            '@typeKeywords': 'type',
                            '@keywords': 'keyword',
                            '@default': 'identifier'
                        }
                    }],
                    // Operators
                    [/[<>=!]+/, 'operator'],
                    [/[+\-*/%|&~^]/, 'operator'],
                    [/::/, 'operator'],
                    [/->>?/, 'operator'],
                    // Delimiters
                    [/[;,.]/, 'delimiter'],
                    [/[()\[\]]/, 'delimiter.parenthesis'],
                ],
                string: [
                    [/[^']+/, 'string'],
                    [/''/, 'string.escape'],
                    [/'/, 'string', '@pop'],
                ],
                quotedIdentifier: [
                    [/[^"]+/, 'identifier.quote'],
                    [/"/, 'identifier.quote', '@pop'],
                ],
                comment: [
                    [/[^/*]+/, 'comment'],
                    [/\*\//, 'comment', '@pop'],
                    [/[/*]/, 'comment'],
                ],
                jinjaVariable: [
                    [/\}\}/, 'jinja.variable', '@pop'],
                    [/./, 'jinja.variable'],
                ],
                jinjaTag: [
                    [/%\}/, 'jinja.tag', '@pop'],
                    [/./, 'jinja.tag'],
                ],
                jinjaComment: [
                    [/#\}/, 'jinja.comment', '@pop'],
                    [/./, 'jinja.comment'],
                ],
            }
        });
    };

    // Use a ref to ensure the event listener always has access to the latest prop
    const onDebugCteRef = React.useRef(props.onDebugCte);

    React.useEffect(() => {
        onDebugCteRef.current = props.onDebugCte;
    }, [props.onDebugCte]);

    const handleEditorDidMount = (editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        // Clear any previous disposables (safety for re-mount scenarios)
        disposablesRef.current.forEach(d => d && d.dispose && d.dispose());
        disposablesRef.current = [];

        // --- KEYBOARD SHORTCUTS ---

        // 1. Run Query (Ctrl+Enter)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
            if (props.language === 'markdown') return;
            // If debugging CTE, we might want to run that? No, standard run.
            if (props.onRunQuery) {
                // Check for selection
                const selection = editor.getSelection();
                const model = editor.getModel();
                let queryToRun = model.getValue(); // Default to all

                if (selection && !selection.isEmpty()) {
                    queryToRun = model.getValueInRange(selection);
                }

                props.onRunQuery(queryToRun);
            }
        });

        // 2. Save (Ctrl+S)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            if (props.onSave) {
                props.onSave();
            }
        });

        // 3. Analyze / Explain (Ctrl+E)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
            if (props.onAnalyze) {
                props.onAnalyze();
            }
        });

        // 4. Format Code (Ctrl+K)
        const formatSql = () => {
            if (props.language === 'markdown') return;
            const model = editor.getModel();
            let textToFormat = model.getValue();
            let range = null;

            const selection = editor.getSelection();
            if (selection && !selection.isEmpty()) {
                textToFormat = model.getValueInRange(selection);
                range = selection;
            }

            try {
                const formatted = format(textToFormat, {
                    language: 'postgresql', // DuckDB is close to Postgres
                    tabWidth: 4,
                    keywordCase: 'upper',
                    linesBetweenQueries: 2
                });

                if (range) {
                    editor.executeEdits('format-sql', [{
                        range: range,
                        text: formatted,
                        forceMoveMarkers: true
                    }]);
                } else {
                    editor.executeEdits('format-sql', [{
                        range: model.getFullModelRange(),
                        text: formatted,
                        forceMoveMarkers: true
                    }]);
                }
            } catch (err) {
                console.error("Formatting failed:", err);
            }
        };

        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, formatSql);

        // 4b. Format Code (Ctrl+Shift+F) — secondary keybinding
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, formatSql);

        // 4c. Context menu action for Format SQL
        const formatAction = editor.addAction({
            id: 'format-sql-action',
            label: 'Format SQL (Ctrl+K / Ctrl+Shift+F)',
            contextMenuGroupId: '1_modification',
            contextMenuOrder: 1.5,
            run: formatSql
        });
        disposablesRef.current.push(formatAction);

        // Inject CSS for CTE Debug Glpyh
        const styleId = 'cte-debug-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                .cte-debug-glyph {
                    cursor: pointer;
                    background: transparent;
                }
                .cte-debug-glyph::after {
                    content: '▶';
                    color: var(--accent-color-user);
                    font-size: 12px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                    font-family: Arial, sans-serif;
                }
                .cte-debug-glyph:hover::after {
                    text-shadow: 0 0 5px var(--accent-color-user);
                    transform: scale(1.2);
                }
            `;
            document.head.appendChild(style);
        }

        const updateCteDecorations = () => {
            const model = editor.getModel();
            if (!model) return;

            const text = model.getValue();
            const regex = /\b(\w+)\s+AS\s*\(/gi;
            let match;
            const newDecorations = [];

            while ((match = regex.exec(text)) !== null) {
                const pos = model.getPositionAt(match.index);
                newDecorations.push({
                    range: new monaco.Range(pos.lineNumber, 1, pos.lineNumber, 1),
                    options: {
                        isWholeLine: false,
                        glyphMarginClassName: 'cte-debug-glyph',
                        glyphMarginHoverMessage: { value: `Run CTE: **${match[1]}**` }
                    }
                });
            }

            const existing = model.getAllDecorations()
                .filter(d => d.options.glyphMarginClassName === 'cte-debug-glyph')
                .map(d => d.id);

            editor.deltaDecorations(existing, newDecorations);
        };

        // Initial run & Listener
        updateCteDecorations();
        const contentChangeDisposable = editor.onDidChangeModelContent(updateCteDecorations);
        disposablesRef.current.push(contentChangeDisposable);

        // Handle Click
        const mouseDownDisposable = editor.onMouseDown((e) => {
            try {
                if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                    if (!e.target.position) return;
                    const line = e.target.position.lineNumber;
                    const model = editor.getModel();
                    if (!model) return;
                    const decorations = model.getLinesDecorations(line, line);
                    const target = decorations.find(d => d.options.glyphMarginClassName === 'cte-debug-glyph');
                    if (target) {
                        const lineContent = model.getLineContent(line);
                        const m = /\b(\w+)\s+AS\s*\(/i.exec(lineContent);
                        const callback = onDebugCteRef.current;
                        if (m && m[1]) {
                            if (callback) callback(m[1]);
                        } else {
                            const hoverVal = target.options?.glyphMarginHoverMessage?.value;
                            if (hoverVal) {
                                const nameMatch = /\*\*(\w+)\*\*/.exec(hoverVal);
                                if (nameMatch && nameMatch[1]) {
                                    if (callback) callback(nameMatch[1]);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Error handling glyph click:", err);
            }
        });
        disposablesRef.current.push(mouseDownDisposable);

        // --- ENHANCED AUTOCOMPLETE ---

        // Use a global cache so all editor instances share the latest schema
        if (!window.__amoxSqlSchemaCache) {
            window.__amoxSqlSchemaCache = { tables: {}, allColumns: [] };
        }

        // Fetch Full Schema (Tables + Columns)
        fetch('http://localhost:3001/api/db/tables')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    const tables = {};
                    const allColumns = new Set();
                    data.forEach(t => {
                        tables[t.name] = t.columns.map(c => ({
                            name: c.column_name,
                            type: c.data_type
                        }));
                        t.columns.forEach(c => allColumns.add(c.column_name));
                    });
                    window.__amoxSqlSchemaCache = {
                        tables: tables,
                        allColumns: Array.from(allColumns)
                    };
                }
            })
            .catch(err => console.warn("Schema fetch failed", err));

        // ═══════════════════════════════════════════════════════════════
        // AUTOCOMPLETE ENGINE v2 — Reverse-scan tokenizer architecture
        // ═══════════════════════════════════════════════════════════════

        // --- Phase 1: Isolate the current query (split by ;) ---
        const isolateCurrentQuery = (fullText, cursorOffset) => {
            // Find the ; before and after the cursor
            let start = 0;
            let end = fullText.length;
            for (let i = cursorOffset - 1; i >= 0; i--) {
                if (fullText[i] === ';') { start = i + 1; break; }
            }
            for (let i = cursorOffset; i < fullText.length; i++) {
                if (fullText[i] === ';') { end = i; break; }
            }
            const queryText = fullText.substring(start, end);
            const cursorInQuery = cursorOffset - start;
            return { queryText, cursorInQuery };
        };

        // --- Phase 2: Simple SQL tokenizer ---
        const SQL_STRUCTURAL_KEYWORDS = new Set([
            'SELECT', 'FROM', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL',
            'ON', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'SET', 'INTO',
            'VALUES', 'WITH', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER',
            'UNION', 'EXCEPT', 'INTERSECT', 'BY', 'AS', 'AND', 'OR', 'NOT', 'IN',
            'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
            'DISTINCT', 'CAST', 'OVER', 'PARTITION', 'WINDOW', 'QUALIFY', 'LATERAL', 'UNNEST',
            'PIVOT', 'UNPIVOT', 'FETCH', 'OFFSET', 'RETURNING', 'USING', 'DESCRIBE',
            'SUMMARIZE', 'EXPLAIN', 'EXISTS', 'ALL', 'ANY', 'SOME', 'ASC', 'DESC',
            'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'EXCLUDE', 'REPLACE',
        ]);

        const tokenizeSql = (text) => {
            const tokens = [];
            let i = 0;
            while (i < text.length) {
                const ch = text[i];

                // Skip whitespace
                if (/\s/.test(ch)) { i++; continue; }

                // Line comment
                if (ch === '-' && text[i + 1] === '-') {
                    const end = text.indexOf('\n', i);
                    i = end === -1 ? text.length : end + 1;
                    continue;
                }

                // Block comment
                if (ch === '/' && text[i + 1] === '*') {
                    const end = text.indexOf('*/', i + 2);
                    i = end === -1 ? text.length : end + 2;
                    continue;
                }

                // String literal (single-quoted)
                if (ch === "'") {
                    let j = i + 1;
                    while (j < text.length) {
                        if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; }
                        if (text[j] === "'") { j++; break; }
                        j++;
                    }
                    tokens.push({ type: 'STRING', value: text.substring(i, j), start: i, end: j });
                    i = j; continue;
                }

                // Quoted identifier (double-quoted)
                if (ch === '"') {
                    let j = i + 1;
                    while (j < text.length && text[j] !== '"') j++;
                    j++; // skip closing quote
                    tokens.push({ type: 'IDENTIFIER', value: text.substring(i, j), start: i, end: j });
                    i = j; continue;
                }

                // Dot
                if (ch === '.') {
                    tokens.push({ type: 'DOT', value: '.', start: i, end: i + 1 });
                    i++; continue;
                }

                // Comma
                if (ch === ',') {
                    tokens.push({ type: 'COMMA', value: ',', start: i, end: i + 1 });
                    i++; continue;
                }

                // Parentheses
                if (ch === '(' || ch === ')') {
                    tokens.push({ type: 'PAREN', value: ch, start: i, end: i + 1 });
                    i++; continue;
                }

                // Operators and other single chars
                if (/[=<>!+\-*/%|&~^]/.test(ch)) {
                    tokens.push({ type: 'OPERATOR', value: ch, start: i, end: i + 1 });
                    i++; continue;
                }

                // Semicolon (shouldn't appear since we isolated the query, but handle it)
                if (ch === ';') {
                    tokens.push({ type: 'SEMICOLON', value: ';', start: i, end: i + 1 });
                    i++; continue;
                }

                // Word (keyword or identifier)
                if (/[a-zA-Z_]/.test(ch)) {
                    let j = i + 1;
                    while (j < text.length && /[a-zA-Z0-9_]/.test(text[j])) j++;
                    const word = text.substring(i, j);
                    const upper = word.toUpperCase();
                    const type = SQL_STRUCTURAL_KEYWORDS.has(upper) ? 'KEYWORD' : 'IDENTIFIER';
                    tokens.push({ type, value: word, upper, start: i, end: j });
                    i = j; continue;
                }

                // Number
                if (/[0-9]/.test(ch)) {
                    let j = i + 1;
                    while (j < text.length && /[0-9.]/.test(text[j])) j++;
                    tokens.push({ type: 'NUMBER', value: text.substring(i, j), start: i, end: j });
                    i = j; continue;
                }

                // Jinja/DBT {{ }} {% %} — skip as opaque blocks
                if (ch === '{' && (text[i + 1] === '{' || text[i + 1] === '%')) {
                    const closer = text[i + 1] === '{' ? '}}' : '%}';
                    const end = text.indexOf(closer, i + 2);
                    i = end === -1 ? text.length : end + 2;
                    continue;
                }

                // Unknown char, skip
                i++;
            }
            return tokens;
        };

        // --- Phase 3: Resolve context via reverse scan ---
        const resolveContext = (tokens, cursorInQuery, queryText) => {
            const ctx = {
                mode: 'ROOT_COMMAND',
                clause: null,
                targetAlias: null,
                aliasMap: {},       // alias -> tableName
                tableAliases: {},   // tableName -> alias
                referencedTables: new Set()
            };

            // Find the token index at or just before the cursor
            let cursorTokenIdx = -1;
            for (let i = tokens.length - 1; i >= 0; i--) {
                if (tokens[i].start < cursorInQuery) {
                    cursorTokenIdx = i;
                    break;
                }
            }

            // A. Check DOT_PROPERTY: the token just before cursor is DOT
            // Scenario: "alias." or "alias.partialWord"
            if (cursorTokenIdx >= 0) {
                const lastToken = tokens[cursorTokenIdx];
                if (lastToken.type === 'DOT' && cursorTokenIdx > 0) {
                    // The token before the dot is the alias/table
                    const beforeDot = tokens[cursorTokenIdx - 1];
                    if (beforeDot.type === 'IDENTIFIER' || beforeDot.type === 'KEYWORD') {
                        ctx.mode = 'DOT_PROPERTY';
                        const raw = beforeDot.value.replace(/^"|"$/g, '');
                        ctx.targetAlias = raw.toLowerCase();
                    }
                }
                // Also handle: alias.partialWord (cursor is on the word after dot)
                if (ctx.mode !== 'DOT_PROPERTY' && cursorTokenIdx >= 1) {
                    const prev = tokens[cursorTokenIdx - 1];
                    if (prev.type === 'DOT' && cursorTokenIdx >= 2) {
                        const beforeDot = tokens[cursorTokenIdx - 2];
                        if (beforeDot.type === 'IDENTIFIER' || beforeDot.type === 'KEYWORD') {
                            ctx.mode = 'DOT_PROPERTY';
                            const raw = beforeDot.value.replace(/^"|"$/g, '');
                            ctx.targetAlias = raw.toLowerCase();
                        }
                    }
                }
            }

            // B. Reverse-scan for clause (skip if DOT_PROPERTY)
            if (ctx.mode !== 'DOT_PROPERTY') {
                // Walk backward from cursor to find the nearest structural clause keyword
                const CLAUSE_KEYWORDS = new Set([
                    'SELECT', 'FROM', 'JOIN', 'ON', 'WHERE', 'HAVING', 'LIMIT',
                    'SET', 'INTO', 'VALUES', 'WITH', 'INSERT', 'UPDATE', 'DELETE',
                    'CREATE', 'DROP', 'ALTER', 'UNION', 'EXCEPT', 'INTERSECT',
                    'DESCRIBE', 'SUMMARIZE', 'EXPLAIN',
                ]);
                // Compound keywords: GROUP BY, ORDER BY, PARTITION BY
                // We handle BY by looking at the token before it

                for (let i = cursorTokenIdx; i >= 0; i--) {
                    const tok = tokens[i];
                    if (tok.type !== 'KEYWORD') continue;
                    const up = tok.upper || tok.value.toUpperCase();

                    // Handle "BY" — look at the keyword before it
                    if (up === 'BY' && i > 0) {
                        const prev = tokens[i - 1];
                        if (prev.type === 'KEYWORD') {
                            const prevUp = prev.upper || prev.value.toUpperCase();
                            if (prevUp === 'GROUP' || prevUp === 'ORDER' || prevUp === 'PARTITION') {
                                ctx.clause = prevUp + ' BY';
                                break;
                            }
                        }
                        continue; // skip bare BY
                    }

                    // Handle JOIN modifiers: LEFT, RIGHT, INNER, FULL, CROSS, NATURAL
                    if (['LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL'].includes(up)) {
                        // Look ahead for JOIN
                        if (i + 1 < tokens.length) {
                            const next = tokens[i + 1];
                            if (next.type === 'KEYWORD' && (next.upper || next.value.toUpperCase()) === 'JOIN') {
                                ctx.clause = 'JOIN';
                                break;
                            }
                        }
                        // If no JOIN follows, treat as regular keyword (skip)
                        continue;
                    }

                    if (CLAUSE_KEYWORDS.has(up)) {
                        ctx.clause = up;
                        break;
                    }
                }

                // Map clause to mode
                if (['FROM', 'JOIN', 'INTO'].includes(ctx.clause)) {
                    ctx.mode = 'TABLE_LIST';
                } else if (['SELECT', 'WHERE', 'ON', 'GROUP BY', 'ORDER BY', 'PARTITION BY', 'HAVING', 'SET', 'WITH'].includes(ctx.clause)) {
                    ctx.mode = 'COLUMN_LIST';
                }
                // Everything else stays ROOT_COMMAND
            }

            // C. Extract aliases and referenced tables (forward scan of all tokens)
            for (let i = 0; i < tokens.length; i++) {
                const tok = tokens[i];
                if (tok.type !== 'KEYWORD') continue;
                const up = tok.upper || tok.value.toUpperCase();

                if (up === 'FROM' || up === 'JOIN') {
                    // Next token(s) should be the table name
                    let j = i + 1;
                    if (j >= tokens.length) continue;
                    const tableToken = tokens[j];
                    if (tableToken.type !== 'IDENTIFIER' && tableToken.type !== 'KEYWORD') continue;
                    const tableName = tableToken.value.replace(/^"|"$/g, '');
                    ctx.referencedTables.add(tableName);

                    // Check for alias: TABLE AS alias  or  TABLE alias
                    j++;
                    if (j < tokens.length) {
                        const maybeAs = tokens[j];
                        if (maybeAs.type === 'KEYWORD' && (maybeAs.upper || maybeAs.value.toUpperCase()) === 'AS') {
                            j++;
                            if (j < tokens.length && (tokens[j].type === 'IDENTIFIER' || tokens[j].type === 'KEYWORD')) {
                                const alias = tokens[j].value.replace(/^"|"$/g, '');
                                ctx.aliasMap[alias.toLowerCase()] = tableName;
                                ctx.tableAliases[tableName.toLowerCase()] = alias;
                            }
                        } else if (maybeAs.type === 'IDENTIFIER') {
                            // Implicit alias (no AS keyword) — but NOT if it's a structural keyword
                            const maybeUp = maybeAs.upper || maybeAs.value.toUpperCase();
                            const NOT_ALIAS = new Set(['ON', 'WHERE', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS',
                                'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'UNION', 'SET', 'SELECT', 'AND', 'OR',
                                'JOIN', 'NATURAL', 'INTO', 'VALUES', 'WITH', 'AS']);
                            if (!NOT_ALIAS.has(maybeUp)) {
                                const alias = maybeAs.value.replace(/^"|"$/g, '');
                                ctx.aliasMap[alias.toLowerCase()] = tableName;
                                ctx.tableAliases[tableName.toLowerCase()] = alias;
                            }
                        }
                    }
                }
            }

            return ctx;
        };

        // Always update the autocomplete resolver (ref pattern bypasses React HMR closure traps)
        completionProviderRef.current = async (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };

            // Get full text and cursor offset
            const fullText = model.getValue();
            const linesBeforeCursor = fullText.split('\n').slice(0, position.lineNumber - 1);
            const charsInPreviousLines = linesBeforeCursor.reduce((sum, line) => sum + line.length + 1, 0);
            const cursorOffset = charsInPreviousLines + (position.column - 1);

            // --- FILE PATH AUTOCOMPLETE (inside single quotes) ---
            const textUntilCursor = fullText.substring(0, cursorOffset);
            const singleQuotes = (textUntilCursor.match(/'/g) || []).length;
            if (singleQuotes % 2 === 1) {
                const match = textUntilCursor.match(/'([^']*)$/);
                const currentString = match ? match[1] : '';
                let dirToFetch = '';
                if (currentString.endsWith('/')) {
                    dirToFetch = currentString;
                } else {
                    const parts = currentString.split('/');
                    parts.pop();
                    dirToFetch = parts.join('/');
                }
                try {
                    const response = await fetch(`http://localhost:3001/api/files/list?path=${encodeURIComponent(dirToFetch)}`);
                    const files = await response.json();
                    return {
                        suggestions: files.map(f => ({
                            label: f.name,
                            kind: f.isDirectory ? monaco.languages.CompletionItemKind.Folder : monaco.languages.CompletionItemKind.File,
                            insertText: f.name,
                            detail: f.isDirectory ? 'Folder' : 'File',
                            sortText: (f.isDirectory ? '0_' : '1_') + f.name
                        }))
                    };
                } catch (e) {
                    return { suggestions: [] };
                }
            }

            // --- SQL CONTEXT RESOLUTION ---
            const schemaCache = window.__amoxSqlSchemaCache || { tables: {}, allColumns: [] };
            const { queryText, cursorInQuery } = isolateCurrentQuery(fullText, cursorOffset);
            const tokens = tokenizeSql(queryText);
            const ctx = resolveContext(tokens, cursorInQuery, queryText);
            const suggestions = [];



            // GUARD: If user is currently typing a structural SQL keyword (e.g. "FROM", "WHERE"),
            // return empty to prevent Monaco from showing stale function suggestions.
            // The keyword will self-complete via Monaco's own word suggestions.
            const TYPING_KEYWORDS = new Set([
                'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS',
                'ON', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'SET', 'INTO', 'VALUES', 'WITH',
                'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'IS', 'NULL',
                'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER',
                'UNION', 'EXCEPT', 'INTERSECT', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
                'CAST', 'AS', 'BY', 'NATURAL', 'USING', 'LATERAL', 'UNNEST', 'OVER', 'PARTITION',
                'WINDOW', 'QUALIFY', 'PIVOT', 'UNPIVOT', 'FETCH', 'OFFSET', 'RETURNING',
                'DESCRIBE', 'SUMMARIZE', 'EXPLAIN', 'EXISTS', 'ALL', 'ANY', 'SOME',
            ]);
            if (word.word.length > 0 && TYPING_KEYWORDS.has(word.word.toUpperCase())) {
                // The word being typed is itself a SQL keyword — don't pollute with functions
                // Instead offer just a few structural next-step keywords
                const kw = word.word.toUpperCase();
                suggestions.push({
                    label: kw, kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: kw + ' ', detail: 'Keyword', range,
                    sortText: '0_' + kw, filterText: kw + ' ' + kw.toLowerCase(),
                    preselect: true,
                });
                return { suggestions, incomplete: true };
            }

            // === MODE: DOT_PROPERTY — Only columns of the referenced table ===
            if (ctx.mode === 'DOT_PROPERTY') {
                const resolvedTable = ctx.aliasMap[ctx.targetAlias] || Object.keys(schemaCache.tables).find(t => t.toLowerCase() === ctx.targetAlias) || ctx.targetAlias;
                const columns = schemaCache.tables[resolvedTable];
                if (columns) {
                    columns.forEach(col => {
                        suggestions.push({
                            label: col.name,
                            kind: monaco.languages.CompletionItemKind.Field,
                            insertText: col.name,
                            detail: `${col.type || 'Column'} (${resolvedTable})`,
                            range, sortText: '0_' + col.name,
                            filterText: col.name,
                        });
                    });
                }
                return { suggestions, incomplete: true }; // STRICT: nothing else
            }

            // === MODE: TABLE_LIST — Only tables + structural keywords ===
            if (ctx.mode === 'TABLE_LIST') {
                Object.keys(schemaCache.tables).forEach(tableName => {
                    suggestions.push({
                        label: tableName,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: tableName,
                        detail: 'Table', range,
                        sortText: '0_' + tableName,
                        filterText: tableName + ' ' + tableName.toLowerCase()
                    });
                });
                ['WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'AS', 'ON',
                 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'CROSS JOIN',
                 'LATERAL', 'UNNEST', 'SELECT'].forEach(kw => {
                    suggestions.push({
                        label: kw, kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: kw, detail: 'Keyword', range,
                        sortText: '9_' + kw, filterText: kw + ' ' + kw.toLowerCase()
                    });
                });
                return { suggestions, incomplete: true }; // STRICT: nothing else
            }

            // === MODE: COLUMN_LIST — Columns, aliases, functions, keywords, snippets ===
            if (ctx.mode === 'COLUMN_LIST') {
                // Aliases
                Object.entries(ctx.aliasMap).forEach(([alias, table]) => {
                    suggestions.push({
                        label: alias, kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: alias, detail: `Alias → ${table}`, range,
                        sortText: '1_a_' + alias, filterText: alias
                    });
                });

                // Columns from referenced tables
                if (ctx.referencedTables.size > 0) {
                    const addedCols = new Set();
                    ctx.referencedTables.forEach(table => {
                        const cols = schemaCache.tables[table];
                        if (cols) {
                            const alias = ctx.tableAliases[table.toLowerCase()];
                            cols.forEach(col => {
                                const key = `${table}.${col.name}`;
                                if (!addedCols.has(key)) {
                                    addedCols.add(key);
                                    suggestions.push({
                                        label: col.name,
                                        kind: monaco.languages.CompletionItemKind.Field,
                                        insertText: alias ? `${alias}.${col.name}` : col.name,
                                        detail: `${col.type || 'Column'} (${alias || table})`,
                                        range, sortText: '1_b_' + col.name,
                                        filterText: col.name + ' ' + col.name.toLowerCase(),
                                    });
                                }
                            });
                        }
                    });
                } else if (schemaCache.allColumns) {
                    schemaCache.allColumns.forEach(col => {
                        suggestions.push({
                            label: col, kind: monaco.languages.CompletionItemKind.Field,
                            insertText: col, detail: 'Column', range,
                            sortText: '1_z_' + col, filterText: col + ' ' + col.toLowerCase(),
                        });
                    });
                }
            }

            // For both COLUMN_LIST and ROOT_COMMAND — add snippets, keywords, functions, dbt

            // Smart Snippets
            const smartSnippets = [
                { name: 'LEFT JOIN', insert: 'LEFT JOIN ${1:table_name} AS ${2:alias} ON ${2:alias}.${3:id} = ${4:other}.${3:id}', doc: 'Left Join Template' },
                { name: 'INNER JOIN', insert: 'JOIN ${1:table_name} AS ${2:alias} ON ${2:alias}.${3:id} = ${4:other}.${3:id}', doc: 'Inner Join Template' },
                { name: 'SUM_COL', insert: 'SUM(${1:column}) AS sum_${1:column}', doc: 'SUM with Alias' },
                { name: 'AVG_COL', insert: 'AVG(${1:column}) AS avg_${1:column}', doc: 'AVG with Alias' },
                { name: 'COUNT_COL', insert: 'COUNT(${1:column}) AS count_${1:column}', doc: 'COUNT with Alias' },
                { name: 'CTE', insert: 'WITH ${1:cte_name} AS (\n\tSELECT * FROM ${2:table}\n)\nSELECT * FROM ${1:cte_name};', doc: 'Common Table Expression' }
            ];
            smartSnippets.forEach(snip => {
                suggestions.push({
                    label: `✨ ${snip.name}`, kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: snip.insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: snip.doc, range, sortText: '5_s_' + snip.name,
                    filterText: snip.name + ' ' + snip.name.toLowerCase()
                });
            });

            // Keywords
            const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'WITH', 'AS', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'HAVING', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'UNION', 'UNION ALL', 'EXCEPT', 'INTERSECT', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'CREATE TABLE', 'CREATE VIEW', 'DROP TABLE', 'DROP VIEW', 'ALTER TABLE', 'OFFSET', 'FETCH', 'LATERAL', 'UNNEST', 'PIVOT', 'UNPIVOT', 'QUALIFY', 'WINDOW', 'OVER', 'PARTITION BY', 'ROWS', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT ROW', 'EXCLUDE', 'REPLACE', 'USING', 'NATURAL', 'RETURNING', 'DESCRIBE', 'SUMMARIZE', 'EXPLAIN', 'EXPLAIN ANALYZE'];
            keywords.forEach(kw => {
                suggestions.push({
                    label: kw, kind: monaco.languages.CompletionItemKind.Keyword,
                    insertText: kw, detail: 'Keyword', range,
                    filterText: kw + ' ' + kw.toLowerCase(), sortText: '3_' + kw
                });
            });

            // DuckDB Functions (lazy-loaded)
            if (!window.__duckdbFunctionCatalog) {
                window.__duckdbFunctionCatalog = [];
                fetch('http://localhost:3001/api/functions/catalog')
                    .then(r => r.json())
                    .then(data => {
                        window.__duckdbFunctionCatalog = (data.functions || []).map(fn => ({
                            name: fn.function_name,
                            insert: fn.snippet || `${fn.function_name}()`,
                            detail: fn.category ? `${fn.category}${fn.documented ? '' : ' · auto'}` : (fn.function_type || 'Function'),
                            doc: fn.doc || fn.description || ''
                        }));
                    })
                    .catch(err => console.warn('[Monaco] Failed to load function catalog', err));
            }
            (window.__duckdbFunctionCatalog || []).forEach(fn => {
                suggestions.push({
                    label: fn.name, kind: monaco.languages.CompletionItemKind.Function,
                    insertText: fn.insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: `ƒ ${fn.detail || 'Function'}`,
                    documentation: { value: fn.doc, isTrusted: true }, range,
                    sortText: '4_' + fn.name, filterText: fn.name + ' ' + fn.name.toLowerCase()
                });
            });

            // DBT / Jinja
            const dbtItems = [
                { name: 'ref', insert: "{{ ref('${1:model_name}') }}", doc: 'Reference another DBT model' },
                { name: 'source', insert: "{{ source('${1:source_name}', '${2:table_name}') }}", doc: 'Reference a DBT source table' },
                { name: 'config', insert: "{\n  config(\n    materialized='${1|view,table,incremental,ephemeral|}'\n  )\n}", doc: 'DBT model configuration block' },
                { name: 'is_incremental', insert: '{% if is_incremental() %}\n    WHERE ${1:updated_at} > (SELECT MAX(${1:updated_at}) FROM {{ this }})\n{% endif %}', doc: 'Incremental model guard (DBT)' },
                { name: 'this', insert: '{{ this }}', doc: 'Reference current model (incremental)' },
                { name: 'var', insert: "{{ var('${1:variable_name}') }}", doc: 'Access a DBT project variable' },
                { name: 'env_var', insert: "{{ env_var('${1:ENV_VARIABLE}') }}", doc: 'Access an environment variable' },
                { name: 'macro', insert: '{% macro ${1:macro_name}(${2:args}) %}\n    ${3:-- logic}\n{% endmacro %}', doc: 'Define a reusable Jinja macro' }
            ];
            dbtItems.forEach(item => {
                suggestions.push({
                    label: `dbt: ${item.name}`, kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: item.insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: 'DBT / Jinja', documentation: item.doc, range,
                    sortText: '6_' + item.name, filterText: item.name + ' ' + item.name.toLowerCase()
                });
            });

            return { suggestions, incomplete: true };
        };

        // Register Completion Provider
        if (!window.__monacoSqlProviderRegistered) {
            window.__monacoSqlProviderRegistered = true;

            const providerDisposable = monaco.languages.registerCompletionItemProvider('sql', {
                triggerCharacters: ['.', '/', "'", '"'],
                provideCompletionItems: (model, position) => {
                    if (completionProviderRef.current) {
                        return completionProviderRef.current(model, position);
                    }
                    return { suggestions: [] };
                }
            });

            // Store the provider disposable for cleanup
            disposablesRef.current.push(providerDisposable);

            // --- HOVER PROVIDER: DuckDB Function Documentation ---
            // Build lookup lazily from same catalog used by autocomplete
            const hoverLookup = {};
            // Will be populated on first hover if catalog exists
            const populateHover = () => {
                if (Object.keys(hoverLookup).length > 0) return;
                const catalog = window.__duckdbFunctionCatalog || [];
                catalog.forEach(fn => {
                    hoverLookup[fn.name.toLowerCase()] = fn;
                });
            };


            const hoverDisposable = monaco.languages.registerHoverProvider('sql', {
                provideHover: (model, position) => {
                    const word = model.getWordAtPosition(position);
                    if (!word) return null;
                    populateHover();

                    const fn = hoverLookup[word.word.toLowerCase()];
                    if (!fn) return null;

                    // Build rich hover with signature header + description + params
                    const contents = [];

                    // 1) Signature block — function name with syntax highlight style
                    const category = fn.detail || 'Function';
                    contents.push({
                        value: `\`\`\`\n${fn.name}(${fn.insert ? fn.insert.replace(/\$\{\d+:([^}]+)\}/g, '$1').replace(/\$\{\d+\|([^}]+)\|?\}/g, '$1').replace(fn.name, '').replace(/^\(/, '').replace(/\)$/, '') : '…'})\n\`\`\``,
                        isTrusted: true
                    });

                    // 2) Category badge + description
                    const descLines = [];
                    descLines.push(`\`${category}\``);
                    descLines.push('');
                    if (fn.doc) {
                        descLines.push(fn.doc);
                    }
                    contents.push({ value: descLines.join('\n'), isTrusted: true });

                    return {
                        range: new monaco.Range(
                            position.lineNumber, word.startColumn,
                            position.lineNumber, word.endColumn
                        ),
                        contents
                    };
                }
            });
            disposablesRef.current.push(hoverDisposable);
        }
    };

    // Cleanup disposables on unmount
    useEffect(() => {
        return () => {
            disposablesRef.current.forEach(d => d && d.dispose && d.dispose());
            disposablesRef.current = [];
            // Reset the global flag so completion provider can be re-registered by a new instance
            window.__monacoSqlProviderRegistered = false;
        };
    }, []);

    // React to errorMarker prop changes — set/clear Monaco markers
    useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return;
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        const model = editor.getModel();
        if (!model) return;

        if (props.errorMarker && props.language !== 'markdown') {
            const { line, column, message } = props.errorMarker;
            const safeLine = Math.min(Math.max(line, 1), model.getLineCount());
            const lineLength = model.getLineLength(safeLine);

            monaco.editor.setModelMarkers(model, 'duckdb-error', [{
                severity: monaco.MarkerSeverity.Error,
                message: message,
                startLineNumber: safeLine,
                startColumn: Math.min(column, lineLength + 1),
                endLineNumber: safeLine,
                endColumn: lineLength + 1,
            }]);

            // Reveal the error line in the editor
            editor.revealLineInCenter(safeLine);
        } else {
            monaco.editor.setModelMarkers(model, 'duckdb-error', []);
        }
    }, [props.errorMarker]);

    // ── Re-sync Monaco theme when app theme or accent changes ──
    useEffect(() => {
        if (!monacoRef.current) return;
        const isDark = props.theme !== 'light';
        const themeName = isDark ? 'duckdb-dark' : 'duckdb-light';
        // Re-read CSS variables (which may have changed) and redefine the theme
        monacoRef.current.editor.defineTheme(themeName, buildMonacoTheme(isDark));
        monacoRef.current.editor.setTheme(themeName);
    }, [props.theme]);

    const es = props.editorSettings || {};

    return (
        <Editor
            height="100%"
            language={props.language || 'sql'}
            value={value}
            onChange={handleEditorChange}
            theme={props.theme === 'light' ? 'duckdb-light' : 'duckdb-dark'}
            beforeMount={handleEditorWillMount}
            options={{
                minimap: { enabled: es.minimap ?? false },
                fontSize: es.fontSize ?? 14,
                fontFamily: es.fontFamily ?? "'JetBrains Mono', 'Consolas', monospace",
                wordWrap: es.wordWrap ?? 'off',
                lineNumbers: es.lineNumbers ?? 'on',
                tabSize: es.tabSize ?? 4,
                automaticLayout: true,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                glyphMargin: true,
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 3,
                fixedOverflowWidgets: true,
                suggestLineHeight: 32,
                suggestFontSize: 13,
                suggest: {
                    showKeywords: false, // We provide our own
                }
            }}
            onMount={handleEditorDidMount}
        />
    );
};

export default SqlEditor;
