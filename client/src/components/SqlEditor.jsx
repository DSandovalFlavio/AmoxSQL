import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { format } from 'sql-formatter';

const SqlEditor = ({ value, onChange, ...props }) => {
    const disposablesRef = useRef([]);

    const handleEditorChange = (value, event) => {
        onChange(value);
    };

    const handleEditorWillMount = (monaco) => {
        monaco.editor.defineTheme('duckdb-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: '', background: '1e1f22' }
            ],
            colors: {
                'editor.background': '#1e1f22',
                'editor.lineHighlightBackground': '#2b2d30',
                'editorGutter.background': '#1e1f22',
            }
        });

        monaco.editor.defineTheme('duckdb-light', {
            base: 'vs',
            inherit: true,
            rules: [
                { token: '', background: 'ffffff' }
            ],
            colors: {
                'editor.background': '#ffffff',
                'editor.lineHighlightBackground': '#f1f3f5',
                'editorGutter.background': '#ffffff',
            }
        });
    };

    // Use a ref to ensure the event listener always has access to the latest prop
    const onDebugCteRef = React.useRef(props.onDebugCte);

    React.useEffect(() => {
        onDebugCteRef.current = props.onDebugCte;
    }, [props.onDebugCte]);

    const handleEditorDidMount = (editor, monaco) => {
        // Clear any previous disposables (safety for re-mount scenarios)
        disposablesRef.current.forEach(d => d && d.dispose && d.dispose());
        disposablesRef.current = [];

        // --- KEYBOARD SHORTCUTS ---

        // 1. Run Query (Ctrl+Enter)
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
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
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
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
        });

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

        let schemaCache = { tables: {}, columns: {} };

        // Fetch Full Schema (Tables + Columns)
        fetch('http://localhost:3001/api/db/tables')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Structure: [{ name: 'table1', columns: [{column_name: 'col1', data_type: 'INTEGER'}, ...] }, ...]
                    const tables = {};
                    const allColumns = new Set();

                    data.forEach(t => {
                        tables[t.name] = t.columns.map(c => ({
                            name: c.column_name,
                            type: c.data_type
                        }));
                        t.columns.forEach(c => allColumns.add(c.column_name));
                    });

                    schemaCache = {
                        tables: tables,
                        allColumns: Array.from(allColumns)
                    };
                }
            })
            .catch(err => console.warn("Schema fetch failed", err));


        // Register Completion Provider
        if (!window.__monacoSqlProviderRegistered) {
            window.__monacoSqlProviderRegistered = true;
            const providerDisposable = monaco.languages.registerCompletionItemProvider('sql', {
                triggerCharacters: ['.', '/', "'", '"'],
                provideCompletionItems: async (model, position) => {
                    const textUntilPosition = model.getValueInRange({
                        startLineNumber: position.lineNumber,
                        startColumn: 1,
                        endLineNumber: position.lineNumber,
                        endColumn: position.column
                    });

                    const word = model.getWordUntilPosition(position);
                    const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn,
                    };

                    // 1. FILE PATH AUTOCOMPLETE (Context: Inside quotes)
                    // Regex to check if we are inside a string literal (single or double quotes)
                    // Simple check: count quotes to left. If odd, we are open.
                    const singleQuotes = (textUntilPosition.match(/'/g) || []).length;
                    const doubleQuotes = (textUntilPosition.match(/"/g) || []).length;

                    // Heuristic: If odd single/double quotes, we are likely in a string.
                    // We also check if the last char is / to trigger path suggestion
                    const isInsideSingleString = singleQuotes % 2 === 1;
                    // const isInsideDoubleString = doubleQuotes % 2 === 1; // SQL identifiers use double quotes, usually not file paths

                    if (isInsideSingleString) {
                        // Extract the string content being typed
                        const match = textUntilPosition.match(/'([^']*)$/);
                        const currentString = match ? match[1] : '';

                        // Determine Directory to fetch
                        // If ending with /, fetch that dir.
                        // If not, fetch the parent dir.
                        let dirToFetch = '';
                        if (currentString.endsWith('/')) {
                            dirToFetch = currentString;
                        } else {
                            const parts = currentString.split('/');
                            parts.pop(); // Remove partial filename
                            dirToFetch = parts.join('/');
                        }

                        // Call backend to list files
                        try {
                            const response = await fetch(`http://localhost:3001/api/files/list?path=${encodeURIComponent(dirToFetch)}`);
                            const files = await response.json();

                            // Map to suggestions
                            // Note: ranges are handled by Monaco automatically if we don't specify, usually defaulting to 'wordUntilPosition'.
                            // However, since we might be completing a complex path, checking the range is good.
                            // Here we just let Monaco handle the filtering of the returned list against the "word" at cursor.

                            const suggestions = files.map(f => ({
                                label: f.name,
                                kind: f.isDirectory ? monaco.languages.CompletionItemKind.Folder : monaco.languages.CompletionItemKind.File,
                                insertText: f.name,
                                detail: f.isDirectory ? 'Folder' : 'File',
                                // Force sort order: folders then files
                                sortText: (f.isDirectory ? '0_' : '1_') + f.name
                            }));

                            return { suggestions: suggestions };
                        } catch (e) {
                            return { suggestions: [] };
                        }
                    }

                    // 2. SQL AUTOCOMPLETE (Tables & Columns)
                    const suggestions = [];

                    // Check for "Table." context
                    // Get the text before the current word
                    // Handle both simple (users.) and quoted ("My Table".) identifiers
                    const textBeforeCursor = textUntilPosition.substring(0, textUntilPosition.length - word.word.length);
                    const tableMatch = textBeforeCursor.match(/(?:(\w+)|"([^"]+)")\.\s*$/);

                    if (tableMatch) {
                        // Group 1 is simple, Group 2 is quoted
                        const tableName = tableMatch[1] || tableMatch[2];
                        const columns = schemaCache.tables[tableName];

                        if (columns) {
                            // Return ONLY columns for this table
                            columns.forEach(col => {
                                suggestions.push({
                                    label: col.name, // Access .name property from our improved schema structure
                                    kind: monaco.languages.CompletionItemKind.Field,
                                    insertText: col.name,
                                    detail: col.type || 'Column',
                                    range: range
                                });
                            });
                            return { suggestions: suggestions };
                        }
                    }

                    // Default Context (Global)

                    // Tables
                    Object.keys(schemaCache.tables).forEach(tableName => {
                        suggestions.push({
                            label: tableName,
                            kind: monaco.languages.CompletionItemKind.Class,
                            insertText: tableName,
                            detail: 'Table',
                            range: range
                        });
                    });

                    // Columns (Global, but lower priority)
                    if (schemaCache.allColumns) {
                        schemaCache.allColumns.forEach(col => {
                            suggestions.push({
                                label: col,
                                kind: monaco.languages.CompletionItemKind.Field,
                                insertText: col,
                                detail: 'Column',
                                range: range,
                                sortText: 'z_' + col // Show columns after tables
                            });
                        });
                    }

                    // Keywords (Basic)
                    const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'WITH', 'AS', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'HAVING', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'UNION', 'ALL', 'EXCEPT', 'INTERSECT', 'read_csv', 'read_parquet', 'read_json', 'read_xlsx'];
                    keywords.forEach(kw => {
                        suggestions.push({
                            label: kw,
                            kind: monaco.languages.CompletionItemKind.Keyword,
                            insertText: kw,
                            range: range,
                            sortText: 'y_' + kw
                        });
                    });

                    return { suggestions: suggestions };
                }
            });

            // Store the provider disposable for cleanup
            disposablesRef.current.push(providerDisposable);
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

    return (
        <Editor
            height="100%"
            defaultLanguage="sql"
            value={value}
            onChange={handleEditorChange}
            theme={props.theme === 'light' ? 'duckdb-light' : 'duckdb-dark'}
            beforeMount={handleEditorWillMount}
            options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                glyphMargin: true,
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 3,
                suggest: {
                    showKeywords: false, // We provide our own
                }
            }}
            onMount={handleEditorDidMount}
        />
    );
};

export default SqlEditor;
