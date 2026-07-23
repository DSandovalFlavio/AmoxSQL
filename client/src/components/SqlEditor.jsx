import { API_BASE } from '../api.js';
import React, { useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { format } from 'sql-formatter';
import { getSharedSqlWorkerBridge, initSharedSqlWorkerBridge } from '../utils/sqlWorkerBridge';
import { registerMonaco, MONACO_THEME_NAME } from '../monacoTheme.js';

// Per-editor-instance document id inside the SHARED SQL worker (one worker +
// one WASM pair for the whole app; documents keyed by this id).
let __sqlDocSeq = 0;

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
const DESCRIBE_CACHE_MAX = 200;
// Whitespace-insensitive key: while typing, the probe SQL changes by spacing/
// newlines constantly — without normalization almost every suggest session
// was a cache miss (a fresh HTTP DESCRIBE mid-typing).
function describeCacheKey(probeSql) {
    return probeSql.replace(/\s+/g, ' ').trim();
}
async function describeColumns(probeSql) {
    if (!probeSql) return [];
    const key = describeCacheKey(probeSql);
    if (__describeCache.has(key)) {
        const hit = __describeCache.get(key);
        // LRU touch (Map keeps insertion order)
        __describeCache.delete(key);
        __describeCache.set(key, hit);
        return hit;
    }
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
        __describeCache.set(key, cols);
        if (__describeCache.size > DESCRIBE_CACHE_MAX) {
            __describeCache.delete(__describeCache.keys().next().value);
        }
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

/* Monaco theming lives in ../monacoTheme.js (single amox theme, App-driven sync). */

const globalViewStateCache = new Map();

const SqlEditor = ({ value, onChange, ...props }) => {
    const disposablesRef = useRef([]);
    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const completionProviderRef = useRef(null);
    const workerBridgeRef = useRef(null);
    const docIdRef = useRef(`sqldoc_${++__sqlDocSeq}`);
    const activeTabIdRef = useRef(props.tabId);

    // Last value we emitted through onChange. While the parent's `value` prop
    // lags behind this (debounced state, slow renders), any differing incoming
    // value is a stale echo of our own edit — never a reason to rewrite the buffer.
    const lastBroadcastRef = useRef(null);

    // True while WE call editor.setValue() (external replacement / tab swap).
    // setValue fires the model-change event too, so without this flag the AI's
    // applied SQL would be recorded as a user "broadcast" and then block the NEXT
    // external apply as a false stale-echo — the "apply works once, then does
    // nothing until you reopen the file" bug.
    const programmaticRef = useRef(false);
    const setValueSilently = (editor, next) => {
        programmaticRef.current = true;
        try { editor.setValue(next || ''); }
        finally { programmaticRef.current = false; }
    };

    // Save view state on unmount
    useEffect(() => {
        return () => {
            if (editorRef.current && activeTabIdRef.current) {
                globalViewStateCache.set(activeTabIdRef.current, editorRef.current.saveViewState());
            }
        };
    }, []);

    // Sync external value changes (loading a file, formatting, tab switch).
    // The editor model OWNS the text: `setValue()` resets the cursor to (1,1)
    // and clears the undo stack, so it is applied only for genuine external
    // replacements — never under the user's cursor, never for echoes.
    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;

        // If the active tab changed, swap the buffer + view state
        if (props.tabId && props.tabId !== activeTabIdRef.current) {
            if (activeTabIdRef.current) {
                globalViewStateCache.set(activeTabIdRef.current, editor.saveViewState());
            }
            activeTabIdRef.current = props.tabId;
            setValueSilently(editor, value);
            lastBroadcastRef.current = null;

            const savedState = globalViewStateCache.get(props.tabId);
            if (savedState) {
                // Use a tiny timeout to ensure the model has updated before restoring state
                setTimeout(() => editorRef.current?.restoreViewState(savedState), 0);
            }
            return;
        }

        // Steady state: the parent reflects the buffer. From here on, a differing
        // value is a genuine external change again.
        if ((value ?? '') === editor.getValue()) {
            lastBroadcastRef.current = null;
            return;
        }

        // The user is typing here — the buffer is the source of truth.
        if (editor.hasTextFocus()) return;

        // The parent hasn't consumed our latest emission yet → stale echo.
        if (lastBroadcastRef.current !== null && editor.getValue() === lastBroadcastRef.current) return;

        // Genuine external replacement (file reload, format, AI edit applied).
        const viewState = editor.saveViewState();
        setValueSilently(editor, value);
        if (viewState) editor.restoreViewState(viewState);
    }, [value, props.tabId]);

    const handleEditorChange = (newValue, event) => {
        // Our own setValue() (tab swap / AI apply) — not a user edit. Don't record
        // it as a broadcast (would poison the stale-echo guard) and don't re-emit.
        if (programmaticRef.current) return;

        lastBroadcastRef.current = newValue;

        onChange(newValue);
        // Clear error markers when user edits the code
        if (editorRef.current && monacoRef.current) {
            monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'duckdb-error', []);
        }
    };

    const handleEditorWillMount = (monaco) => {
        // Register the monaco instance and define/activate the single `amox`
        // theme from the live tokens (App re-syncs it on theme/accent change).
        registerMonaco(monaco);

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

        // Monaco measures glyph widths at init; if the editor font finishes
        // loading afterwards, cursor and selection are painted with stale
        // widths (visually behind the real position). Re-measure once fonts
        // are ready.
        if (document.fonts?.ready) {
            document.fonts.ready.then(() => monaco.editor.remeasureFonts());
        }

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

        // Own decorations collection: cheaper than filtering getAllDecorations()
        // and immune to other decoration owners.
        const cteDecorations = editor.createDecorationsCollection([]);

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

            cteDecorations.set(newDecorations);
        };

        // Initial run & debounced listener (full-document regex — not per keystroke)
        updateCteDecorations();
        let cteDebounceTimer = null;
        const contentChangeDisposable = editor.onDidChangeModelContent(() => {
            if (cteDebounceTimer) clearTimeout(cteDebounceTimer);
            cteDebounceTimer = setTimeout(updateCteDecorations, 250);
        });
        disposablesRef.current.push(contentChangeDisposable);
        disposablesRef.current.push({ dispose: () => { if (cteDebounceTimer) clearTimeout(cteDebounceTimer); } });

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

        // Attach to the SHARED Web Worker bridge (one worker for all editors;
        // this instance's buffer lives under docIdRef inside it)
        if (!workerBridgeRef.current) {
            workerBridgeRef.current = getSharedSqlWorkerBridge();
            initSharedSqlWorkerBridge().then(() => {
                // CRITICAL: Sync initial document so Worker has the AST before first Ctrl+Space
                const initialText = editor.getValue();
                if (initialText) {
                    workerBridgeRef.current.syncDocument(docIdRef.current, initialText);
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
                workerBridgeRef.current.syncDocument(docIdRef.current, text);
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
            const { suggestions: workerSuggestions, clause, derived } = await workerBridgeRef.current.getCompletions(docIdRef.current, position.lineNumber, position.column, triggerContent);

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
                    // Probe all relations concurrently — serial awaits stacked
                    // up to N×300ms before the suggest list could resolve.
                    const colsPerRelation = await Promise.all(
                        derived.relations.map(rel => describeColumns(rel.probeSql))
                    );
                    if (token && token.isCancellationRequested) return { suggestions: [] };
                    derived.relations.forEach((rel, i) => {
                        colsPerRelation[i].forEach(c => suggestions.push({
                            label: c.name, kind: monaco.languages.CompletionItemKind.Field,
                            insertText: c.name, detail: `${c.type || 'Column'} (${rel.name})`,
                            filterText: c.name, sortText: '1_b_' + c.name,
                        }));
                    });
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
            // Shared worker: release only OUR document — never terminate it.
            if (workerBridgeRef.current) workerBridgeRef.current.removeDocument(docIdRef.current);
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

    // Monaco theme is now global (`amox`) and re-applied centrally from App.jsx
    // whenever the app theme or accent changes — no per-editor theme effect.

    // Stable identity: a fresh options object every render makes the <Editor>
    // wrapper call updateOptions() on each reconciliation.
    const editorOptions = useMemo(() => {
        const es = props.editorSettings || {};
        return {
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
        };
    }, [props.editorSettings]);

    return (
        <Editor
            height="100%"
            language={props.language || 'sql'}
            defaultValue={value}
            onChange={handleEditorChange}
            theme={MONACO_THEME_NAME}
            beforeMount={handleEditorWillMount}
            options={editorOptions}
            onMount={handleEditorDidMount}
        />
    );
};

export default React.memo(SqlEditor);
