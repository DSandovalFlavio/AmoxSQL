import React, { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

const SqlEditor = ({ value, onChange, ...props }) => {
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
    };

    // Use a ref to ensure the event listener always has access to the latest prop
    // without needing to remove/re-add the listener on every render.
    const onDebugCteRef = React.useRef(props.onDebugCte);

    React.useEffect(() => {
        onDebugCteRef.current = props.onDebugCte;
    }, [props.onDebugCte]);

    const handleEditorDidMount = (editor, monaco) => {
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
                    color: #40c057;
                    font-size: 12px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100%;
                    font-family: Arial, sans-serif;
                }
                .cte-debug-glyph:hover::after {
                    text-shadow: 0 0 5px #40c057;
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
        editor.onDidChangeModelContent(updateCteDecorations);

        // Handle Click
        editor.onMouseDown((e) => {
            try {
                if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                    if (!e.target.position) return;

                    const line = e.target.position.lineNumber;
                    const model = editor.getModel();
                    if (!model) return;

                    // Get decorations on this line
                    const decorations = model.getLinesDecorations(line, line);
                    const target = decorations.find(d => d.options.glyphMarginClassName === 'cte-debug-glyph');

                    if (target) {
                        // Try to extract name from line content
                        const lineContent = model.getLineContent(line);
                        // Added 'i' flag for case insensitivity (AS vs as)
                        const m = /\b(\w+)\s+AS\s*\(/i.exec(lineContent);

                        const callback = onDebugCteRef.current; // Use the REF

                        if (m && m[1]) {
                            if (callback) {
                                callback(m[1]);
                            }
                        } else {
                            // Fallback: Try to get name from hover message if regex fails
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

        // Autocomplete Schema Fetch
        fetch('http://localhost:3001/api/schema')
            .then(res => res.json())
            .then(rows => {
                if (Array.isArray(rows)) {
                    const tables = rows.map(r => r.name);
                    monaco.languages.registerCompletionItemProvider('sql', {
                        provideCompletionItems: (model, position) => {
                            const word = model.getWordUntilPosition(position);
                            const range = {
                                startLineNumber: position.lineNumber,
                                endLineNumber: position.lineNumber,
                                startColumn: word.startColumn,
                                endColumn: word.endColumn,
                            };
                            const suggestions = tables.map(table => ({
                                label: table,
                                kind: monaco.languages.CompletionItemKind.Class,
                                insertText: table,
                                range: range
                            }));
                            return { suggestions: suggestions };
                        }
                    });
                }
            })
            .catch(err => console.warn("Autocomplete fetch failed", err));
    };

    return (
        <Editor
            height="100%"
            defaultLanguage="sql"
            value={value}
            onChange={handleEditorChange}
            theme="duckdb-dark"
            beforeMount={handleEditorWillMount}
            options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                glyphMargin: true, // IMPORTANT: Enable glyph margin
                lineDecorationsWidth: 10,
                lineNumbersMinChars: 3
            }}
            onMount={handleEditorDidMount}
        />
    );
};

export default SqlEditor;
