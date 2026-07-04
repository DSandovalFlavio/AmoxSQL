import { API_BASE } from '../api.js';
import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { format } from 'sql-formatter';
import { SqlWorkerBridge } from '../utils/sqlWorkerBridge';

// Lazily fetch the DuckDB function catalog once and cache it on window (shared by the
// completion provider and the hover provider). Idempotent — safe to call repeatedly;
// the first call wins and later calls no-op even while the fetch is still in flight.
function ensureDuckdbFunctionCatalog() {
    if (window.__duckdbFunctionCatalog) return;
    window.__duckdbFunctionCatalog = [];
    fetch(`${API_BASE}/api/functions/catalog`)
        .then(r => r.json())
        .then(data => {
            window.__duckdbFunctionCatalog = (data.functions || []).map(fn => ({
                name: fn.function_name,
                insert: fn.snippet || `${fn.function_name}()`,
                detail: fn.category ? `${fn.category}${fn.documented ? '' : ' · auto'}` : (fn.function_type || 'Function'),
                doc: fn.doc || fn.description || '',
                type: fn.function_type ? fn.function_type.toLowerCase() : 'scalar'
            }));
        })
        .catch(err => console.warn('[Monaco] Failed to load function catalog', err));
}

// Resolve the output columns of a probe query (e.g. a CTE) by asking DuckDB to DESCRIBE it.
// Cached by probe SQL (the probe text changes when the query changes, so it self-invalidates).
// Aborts after 300ms and returns [] on any failure → the editor falls back to its heuristics.
const __describeCache = new Map();
async function describeColumns(probeSql) {
    if (!probeSql) return [];
    if (__describeCache.has(probeSql)) return __describeCache.get(probeSql);
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 300);
        const r = await fetch(`${API_BASE}/api/db/describe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: probeSql }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await r.json();
        const cols = Array.isArray(data.columns) ? data.columns : [];
        __describeCache.set(probeSql, cols);
        return cols;
    } catch {
        return []; // timeout / network / invalid query → graceful fallback
    }
}

// Drop cached DESCRIBE results when the base schema changes — a CTE/subquery's columns can
// shift if a referenced base table is (re)loaded with a different schema while the derived
// SQL text (the cache key) stays the same.
function clearDescribeCache() {
    __describeCache.clear();
}

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
let _cssProbeEl = null;
const cssVarToHex = (varName, fallback) => {
    if (typeof document === 'undefined') return fallback;
    try {
        // Reuse a single persistent hidden probe element. The browser resolves
        // ANY color format (oklch, rgba, …) to rgb() via getComputedStyle, which
        // Canvas can't do for oklch. Reusing the element avoids DOM churn when a
        // theme build reads ~18 variables in a row.
        if (!_cssProbeEl) {
            _cssProbeEl = document.createElement('div');
            _cssProbeEl.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0';
            document.body.appendChild(_cssProbeEl);
        }
        _cssProbeEl.style.color = `var(${varName})`;
        const resolved = getComputedStyle(_cssProbeEl).color; // 'rgb(r, g, b)' or 'rgba(r, g, b, a)'

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
export const buildMonacoTheme = (isDark) => {
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

/**
 * Cache built Monaco themes by theme id. buildMonacoTheme() reads ~18 live CSS
 * variables (each a getComputedStyle), so re-toggling between already-seen
 * themes should be instant rather than rebuilt every time.
 */
const _monacoThemeCache = new Map();
export const getMonacoTheme = (themeId, isDark) => {
    if (_monacoThemeCache.has(themeId)) return _monacoThemeCache.get(themeId);
    const built = buildMonacoTheme(isDark);
    _monacoThemeCache.set(themeId, built);
    return built;
};

const globalViewStateCache = new Map();

const SqlEditor = ({ value, onChange, ...props }) => {
    const disposablesRef = useRef([]);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const completionProviderRef = useRef(null);
    const workerBridgeRef = useRef(null);
    const activeTabIdRef = useRef(props.tabId);

    const broadcastHistoryRef = useRef([]);

    // Save view state on unmount
    useEffect(() => {
        return () => {
            if (editorRef.current && activeTabIdRef.current) {
                globalViewStateCache.set(activeTabIdRef.current, editorRef.current.saveViewState());
            }
        };
    }, []);

    // Intelligently sync external value changes (e.g., loading a new file, formatting, tab switch)
    // without suffering from "React Controlled Component Cursor Jump" during fast typing.
    useEffect(() => {
        if (!editorRef.current) return;
        
        // If the active tab changed, swap the view state
        if (props.tabId && props.tabId !== activeTabIdRef.current) {
            if (activeTabIdRef.current) {
                globalViewStateCache.set(activeTabIdRef.current, editorRef.current.saveViewState());
            }
            activeTabIdRef.current = props.tabId;
            editorRef.current.setValue(value || '');
            broadcastHistoryRef.current = [];
            
            const savedState = globalViewStateCache.get(props.tabId);
            if (savedState) {
                // Use a tiny timeout to ensure the model has updated before restoring state
                setTimeout(() => editorRef.current?.restoreViewState(savedState), 0);
            }
            return;
        }

        const currentModelValue = editorRef.current.getValue();
        
        // Exact match -> do nothing
        if (value === currentModelValue) return;

        // Detect if the incoming value is merely a stale echo of what we already typed
        const historyIndex = broadcastHistoryRef.current.indexOf(value);
        if (historyIndex !== -1) {
            // It's an echo. Throw away older history to save memory and IGNORE the prop.
            broadcastHistoryRef.current.splice(0, historyIndex + 1);
            return;
        }

        // If we reach here, it's a completely new/external value on the same tab (e.g. formatted)
        editorRef.current.setValue(value || '');
        broadcastHistoryRef.current = []; // reset history array
    }, [value, props.tabId]);

    const handleEditorChange = (newValue, event) => {
        broadcastHistoryRef.current.push(newValue);
        // Cap history to last 50 edits to prevent runaway memory
        if (broadcastHistoryRef.current.length > 50) {
            broadcastHistoryRef.current.shift();
        }

        onChange(newValue);
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

        // Prefetch the DuckDB function catalog so the very first completion already has
        // functions (otherwise the first keystroke of a session shows none until it loads).
        ensureDuckdbFunctionCatalog();

        // Restore view state if we have it cached (on mount)
        if (props.tabId && globalViewStateCache.has(props.tabId)) {
            setTimeout(() => {
                if (editorRef.current) editorRef.current.restoreViewState(globalViewStateCache.get(props.tabId));
            }, 0);
        }

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

            const getFormatterConfig = () => {
                try {
                    const saved = localStorage.getItem('amoxsql-formatter-config');
                    return saved ? { language: 'postgresql', ...JSON.parse(saved) } : { language: 'postgresql', tabWidth: 4, keywordCase: 'upper', linesBetweenQueries: 2 };
                } catch { return { language: 'postgresql', tabWidth: 4, keywordCase: 'upper', linesBetweenQueries: 2 }; }
            };

            try {
                const formatted = format(textToFormat, getFormatterConfig());

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

        // 4c. Format Code (Shift+Alt+F)
        editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, formatSql);

        // Query History (Ctrl+Shift+H)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyH, () => {
            if (props.onShowHistory) props.onShowHistory();
        });

        // 5. Find & Replace (Ctrl+H) — expose Monaco's built-in panel
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
            editor.getAction('editor.action.startFindReplaceAction').run();
        });

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

        // Reusable file schema scanner — used at init AND on text changes
        function scanAndCacheFileSchemas(text) {
            if (!window.__amoxSqlSchemaCache) return;

            const fileRegex = /['"]([^'"]+\.(csv|parquet|json|xlsx))['"]/gi;
            let fm;
            while ((fm = fileRegex.exec(text)) !== null) {
                const fileName = fm[1].toLowerCase();
                if (!window.__amoxSqlSchemaCache.tables[fileName]) {
                    window.__amoxSqlSchemaCache.tables[fileName] = [];
                    fetch(`${API_BASE}/api/db/file-schema?path=${encodeURIComponent(fm[1])}`)
                        .then(r => r.json())
                        .then(data => {
                            if (data && !data.error && Array.isArray(data)) {
                                const fileCols = data.map(c => ({ name: c.column_name, type: c.column_type }));
                                window.__amoxSqlSchemaCache.tables[fileName] = fileCols;
                                if (workerBridgeRef.current) {
                                    workerBridgeRef.current.updateSchema(window.__amoxSqlSchemaCache);
                                }
                                clearDescribeCache();
                            }
                        })
                        .catch(err => console.warn('[Monaco] File schema fetch failed:', err));
                }
            }
        }

        // Initialize Web Worker Bridge
        if (!workerBridgeRef.current) {
            workerBridgeRef.current = new SqlWorkerBridge();
            workerBridgeRef.current.init().then(() => {
                // CRITICAL: Sync initial document so Worker has the AST before first Ctrl+Space
                const initialText = editor.getValue();
                if (initialText) {
                    workerBridgeRef.current.syncDocument(initialText);
                }

                // Fetch Full Schema (Tables + Columns)
                fetch(`${API_BASE}/api/db/tables`)
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
                            workerBridgeRef.current.updateSchema(window.__amoxSqlSchemaCache);
                            clearDescribeCache();

                            // CRITICAL: Scan initial text for file references IMMEDIATELY
                            // so pre-filled queries (Direct Query, loaded files) have their
                            // file schemas ready before the user triggers autocomplete.
                            const currentText = editor.getValue();
                            if (currentText) {
                                scanAndCacheFileSchemas(currentText);
                            }
                        }
                    })
                    .catch(err => console.warn("Schema fetch failed", err));

                // If DBT Manifest API exists, fetch it
                fetch(`${API_BASE}/api/dbt/manifest`)
                    .then(res => {
                        if (res.ok) return res.json();
                        return { available: false };
                    })
                    .then(data => {
                        if (data && data.available) {
                            workerBridgeRef.current.updateDbtManifest(data);
                        }
                    })
                    .catch(() => {}); // Optional, so ignore errors
            });
        }
        
        let fileScanTimeout;
        const changeModelDisposable = editor.onDidChangeModelContent(() => {
            const text = editor.getValue();
            if (workerBridgeRef.current) {
                workerBridgeRef.current.syncDocument(text);
            }

            if (fileScanTimeout) clearTimeout(fileScanTimeout);
            fileScanTimeout = setTimeout(() => {
                scanAndCacheFileSchemas(text);
            }, 300);
        });
        disposablesRef.current.push(changeModelDisposable);

        // Always update the autocomplete resolver (ref pattern bypasses React HMR closure traps)
        completionProviderRef.current = async (model, position, token) => {
            const word = model.getWordUntilPosition(position);

            // Get full text and cursor offset
            const fullText = model.getValue();
            const linesBeforeCursor = fullText.split('\n').slice(0, position.lineNumber - 1);
            const charsInPreviousLines = linesBeforeCursor.reduce((sum, line) => sum + line.length + 1, 0);
            const cursorOffset = charsInPreviousLines + (position.column - 1);

            // --- FILE PATH AUTOCOMPLETE (inside single quotes) ---
            const textUntilCursor = fullText.substring(0, cursorOffset);
            
            // Only count quotes on the CURRENT LINE so multi-line text doesn't break it
            const currentLineText = linesBeforeCursor.length > 0 
                ? fullText.split('\n')[position.lineNumber - 1].substring(0, position.column - 1)
                : textUntilCursor;
                
            const singleQuotes = (currentLineText.match(/'/g) || []).length;
            if (singleQuotes % 2 === 1) {
                const match = currentLineText.match(/'([^']*)$/);
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
                    const response = await fetch(`${API_BASE}/api/files/list?path=${encodeURIComponent(dirToFetch)}`);
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

            // --- Call Worker Bridge ---
            let triggerContent = null;
            if (['{', "'"].includes(fullText[cursorOffset - 1])) {
                triggerContent = fullText[cursorOffset - 1];
            }
            const { suggestions: workerSuggestions, clause, derived } = await workerBridgeRef.current.getCompletions(position.lineNumber, position.column, triggerContent);

            // Abort if the user kept typing while the worker was processing
            if (token && token.isCancellationRequested) {
                return { suggestions: [] };
            }

            // Map worker results (NO forced range so Monaco automatically shifts the insertion coordinates)
            const suggestions = workerSuggestions.map(s => {
                return s;
            });

            // --- Engine-resolved columns (CTEs/subqueries) via DuckDB DESCRIBE ---
            // The worker can't compute a CTE's output columns (e.g. SELECT a+b AS total); ask the
            // engine on-demand. Off the per-keystroke path (Monaco filters the cached list), cached,
            // with graceful fallback. Skipped for templated (dbt/Jinja) files — raw Jinja isn't SQL.
            const isTemplated = fullText.includes('{{') || fullText.includes('{%');
            if (!isTemplated && derived) {
                if (derived.dotTarget) {
                    const cols = await describeColumns(derived.dotTarget.probeSql);
                    if (token && token.isCancellationRequested) return { suggestions: [] };
                    cols.forEach(c => suggestions.push({
                        label: c.name, kind: monaco.languages.CompletionItemKind.Field,
                        insertText: c.name, detail: `${c.type || 'Column'} (${derived.dotTarget.name})`,
                        sortText: '0_' + c.name,
                    }));
                    // After `cte.` the user wants columns only — no snippets/functions.
                    return { suggestions };
                }
                const isColumnClause = !['FROM', 'JOIN', 'ROOT', 'LIMIT', 'CTE'].includes(clause);
                if (isColumnClause && derived.relations && derived.relations.length) {
                    for (const rel of derived.relations) {
                        const cols = await describeColumns(rel.probeSql);
                        cols.forEach(c => suggestions.push({
                            label: c.name, kind: monaco.languages.CompletionItemKind.Field,
                            insertText: c.name, detail: `${c.type || 'Column'} (${rel.name})`,
                            filterText: c.name, sortText: '1_b_' + c.name,
                        }));
                    }
                    if (token && token.isCancellationRequested) return { suggestions: [] };
                }
            }

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
                    detail: snip.doc, sortText: '5_s_' + snip.name,
                    filterText: snip.name + ' ' + snip.name.toLowerCase()
                });
            });


            // DuckDB Functions — catalog is prefetched on mount; this is a lazy fallback.
            ensureDuckdbFunctionCatalog();
            // Determine allowed function types based on AST context
            let allowedFunctionTypes = ['scalar', 'macro'];
            if (clause === 'SELECT' || clause === 'ORDER BY' || clause === 'WINDOW') {
                allowedFunctionTypes = ['scalar', 'macro', 'aggregate', 'window'];
            } else if (clause === 'WHERE') {
                allowedFunctionTypes = ['scalar', 'macro']; // No aggregates in WHERE!
            } else if (clause === 'QUALIFY') {
                allowedFunctionTypes = ['scalar', 'macro', 'aggregate', 'window'];
            } else if (clause === 'FROM' || clause === 'JOIN') {
                allowedFunctionTypes = ['table', 'macro'];
            } else if (clause === 'HAVING') {
                allowedFunctionTypes = ['aggregate', 'scalar', 'macro'];
            } else if (clause === 'ROOT' || clause === 'CTE') {
                allowedFunctionTypes = []; // Do not suggest functions when starting a new query
            } else if (clause === 'LIMIT' || clause === 'GROUP BY') {
                allowedFunctionTypes = []; // No functions in LIMIT or GROUP BY
            }

            (window.__duckdbFunctionCatalog || []).forEach(fn => {
                // If it's a known type and not in the allowed list, skip it!
                if (allowedFunctionTypes.length > 0 && fn.type && !allowedFunctionTypes.includes(fn.type)) {
                    return;
                }
                // If allowedFunctionTypes is completely empty (ROOT), skip everything
                if (allowedFunctionTypes.length === 0) {
                    return;
                }

                suggestions.push({
                    label: fn.name, kind: monaco.languages.CompletionItemKind.Function,
                    insertText: fn.insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: `ƒ ${fn.detail || 'Function'}`,
                    documentation: { value: fn.doc, isTrusted: true },
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
            // Only surface dbt/Jinja helpers in templated files — they're noise in plain SQL.
            const isDbtContext = fullText.includes('{{') || fullText.includes('{%');
            if (isDbtContext) dbtItems.forEach(item => {
                suggestions.push({
                    label: `dbt: ${item.name}`, kind: monaco.languages.CompletionItemKind.Snippet,
                    insertText: item.insert, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    detail: 'DBT / Jinja', documentation: item.doc,
                    sortText: '6_' + item.name, filterText: item.name + ' ' + item.name.toLowerCase()
                });
            });

            // Return a COMPLETE list for the current clause context. Within a clause the
            // candidate set is stable (same tables/columns/keywords) — only the typed prefix
            // changes — so Monaco re-filters and re-ranks IN PLACE with its fuzzy scorer on
            // each keystroke, with no worker round-trip and no list rebuild. Real re-scoping
            // (after '.' or moving to another clause/word) is re-triggered by the trigger
            // characters below and by word boundaries closing the suggest session.
            // (Was `incomplete: true`, which re-invoked this provider on every keystroke.)
            return { suggestions };
        };

        // Register Completion Provider — GLOBAL and app-lifetime. Monaco invokes
        // one provider for EVERY 'sql' model (each notebook cell is its own
        // editor+worker), so the provider must route each request to the editor
        // instance that owns that model: its worker holds THAT document's AST.
        // Binding it to a single instance's ref (previous design) sent every
        // other cell's completions to the wrong worker — cursor position from
        // cell B against cell A's text → out-of-bounds → a console error per
        // keystroke. The resolver map routes by model URI instead.
        if (!window.__amoxSqlCompletionResolvers) {
            window.__amoxSqlCompletionResolvers = new Map();
        }
        if (!window.__monacoSqlProviderRegistered) {
            window.__monacoSqlProviderRegistered = true;

            // Intentionally NOT tied to any component's disposables: it lives for
            // the app's lifetime and routes via the resolver map. (Previously the
            // first-mounted editor owned it, and unmounting that editor killed
            // autocomplete for the whole app.)
            monaco.languages.registerCompletionItemProvider('sql', {
                triggerCharacters: ['.', '/', "'", '"', '{'],
                provideCompletionItems: (model, position, context, token) => {
                    const resolver = window.__amoxSqlCompletionResolvers.get(model.uri.toString());
                    return resolver ? resolver(model, position, token) : { suggestions: [] };
                }
            });

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
            // App-lifetime like the completion provider — not tied to this
            // instance's disposables (hover reads a global function catalog,
            // it does not depend on any particular editor).
            void hoverDisposable;
        }

        // Route this editor's model to THIS instance's resolver (and worker).
        const ownModelUri = editor.getModel()?.uri.toString();
        if (ownModelUri) {
            window.__amoxSqlCompletionResolvers.set(ownModelUri, (model, position, token) => (
                completionProviderRef.current
                    ? completionProviderRef.current(model, position, token)
                    : { suggestions: [] }
            ));
            disposablesRef.current.push({
                dispose: () => window.__amoxSqlCompletionResolvers.delete(ownModelUri),
            });
        }
    };

    // Cleanup on unmount. The global completion/hover providers are app-lifetime
    // (they route via the resolver map), so there is no flag reset here — this
    // instance only removes its own resolver entry (pushed as a disposable) and
    // its worker.
    useEffect(() => {
        return () => {
            disposablesRef.current.forEach(d => d && d.dispose && d.dispose());
            if (workerBridgeRef.current) workerBridgeRef.current.dispose();
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
        const isDark = !['light', 'ivory', 'mist', 'snow'].includes(props.theme);
        const themeName = isDark ? 'duckdb-dark' : 'duckdb-light';
        // Defer reading CSS variables to ensure App.jsx has updated document.body classes
        requestAnimationFrame(() => {
            if (!monacoRef.current) return;
            monacoRef.current.editor.defineTheme(themeName, getMonacoTheme(props.theme, isDark));
            monacoRef.current.editor.setTheme(themeName);
        });
    }, [props.theme]);

    const es = props.editorSettings || {};

    return (
        <Editor
            height="100%"
            language={props.language || 'sql'}
            defaultValue={value}
            onChange={handleEditorChange}
            theme={['light', 'ivory', 'mist', 'snow'].includes(props.theme) ? 'duckdb-light' : 'duckdb-dark'}
            beforeMount={handleEditorWillMount}
            options={{
                minimap: { enabled: es.minimap ?? false },
                fontSize: es.fontSize ?? 14,
                fontFamily: es.fontFamily ?? "'JetBrains Mono', 'Consolas', monospace",
                wordWrap: es.wordWrap ?? 'off',
                lineNumbers: es.lineNumbers ?? 'on',
                tabSize: es.tabSize ?? 4,
                mouseWheelZoom: es.mouseWheelZoom ?? true,
                smoothScrolling: es.smoothScrolling ?? false,
                cursorBlinking: es.cursorBlinking ?? 'blink',
                cursorStyle: es.cursorStyle ?? 'line',
                renderWhitespace: es.renderWhitespace ?? 'none',
                'bracketPairColorization.enabled': es.bracketPairColorization ?? true,
                guides: { bracketPairs: es.bracketPairsGuides ?? true },
                formatOnPaste: es.formatOnPaste ?? false,
                lineHeight: es.lineHeight ?? 0,
                automaticLayout: true,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                glyphMargin: true,
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 3,
                fixedOverflowWidgets: true,
                suggestLineHeight: 32,
                suggestFontSize: 13,
                // Pre-select the item last chosen for this prefix (selection memory).
                suggestSelection: 'recentlyUsedByPrefix',
                // Explicit auto-trigger timing. strings:true because AmoxSQL
                // completes file paths and dbt ref('…') inside quotes.
                quickSuggestions: { other: true, comments: false, strings: true },
                quickSuggestionsDelay: 10,
                suggestOnTriggerCharacters: true,
                suggest: {
                    showKeywords: false, // We provide our own contextual keywords
                    // NOTE: localityBonus intentionally OFF. It needs the Monaco editor worker
                    // to compute word ranges; this Vite/Electron build doesn't configure that
                    // worker, so it falls back to a SYNCHRONOUS main-thread document scan on
                    // every keystroke → input lag. Revisit only if the editor worker is wired up.
                }
            }}
            onMount={handleEditorDidMount}
        />
    );
};

export default React.memo(SqlEditor);
