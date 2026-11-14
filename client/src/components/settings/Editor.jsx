/**
 * Settings › El editor: fuente, comportamiento, formateador y el catálogo de funciones.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { LuLoader, LuCheck, LuRows3, LuColumns3 } from 'react-icons/lu';
import { Toggle } from './comun';

export default function Editor({
    catalogStats,
    coveragePercent,
    currentLayout,
    editorSettings,
    formatterConfig,
    formatterSaved,
    handleRefreshCatalog,
    isRefreshingCatalog,
    onEditorSettingsChange,
    onLayoutChange,
    saveFormatterConfig,
    setFormatterConfig,
    setShowUndocumented,
    showUndocumented,
}) {
    return (
        <div className="stg-section">
            {<div className="stg-subtab-content">
            {/* Layout */}
            <div>
                <h3 className="stg-section-title">Layout</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    Choose how the SQL editor and results panel are arranged. Vertical is ideal for ultrawide monitors.
                </p>
                <div className="stg-layout-grid">
                    <div
                        onClick={() => onLayoutChange?.('horizontal')}
                        className={`stg-layout-card${currentLayout !== 'vertical' ? ' stg-layout-card--active' : ''}`}
                    >
                        <div className="stg-layout-label">
                            <div className="stg-radio">{currentLayout !== 'vertical' && <div className="stg-radio-dot" />}</div>
                            <LuRows3 size={18} /> Horizontal
                        </div>
                        <div className="stg-layout-preview stg-layout-preview--h">
                            <div className="stg-layout-preview-pane stg-layout-preview-pane--editor">EDITOR</div>
                            <div className="stg-layout-preview-pane stg-layout-preview-pane--results">RESULTS</div>
                        </div>
                    </div>
                    <div
                        onClick={() => onLayoutChange?.('vertical')}
                        className={`stg-layout-card${currentLayout === 'vertical' ? ' stg-layout-card--active' : ''}`}
                    >
                        <div className="stg-layout-label">
                            <div className="stg-radio">{currentLayout === 'vertical' && <div className="stg-radio-dot" />}</div>
                            <LuColumns3 size={18} /> Vertical
                        </div>
                        <div className="stg-layout-preview stg-layout-preview--v">
                            <div className="stg-layout-preview-pane stg-layout-preview-pane--editor">EDITOR</div>
                            <div className="stg-layout-preview-pane stg-layout-preview-pane--results">RESULTS</div>
                        </div>
                    </div>
                </div>
            </div>
            <hr className="stg-divider" />
            {/* Typography */}
            <div>
                <h3 className="stg-section-title">Typography</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <span className="stg-row-label">Font Family</span>
                        <select
                            className="stg-select stg-select--w200"
                            value={editorSettings.fontFamily || "'JetBrains Mono', 'Consolas', monospace"}
                            onChange={(e) => onEditorSettingsChange?.({ fontFamily: e.target.value })}
                        >
                            <option value="'JetBrains Mono', 'Consolas', monospace">JetBrains Mono</option>
                            <option value="'Fira Code', 'Consolas', monospace">Fira Code</option>
                            <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
                            <option value="'Consolas', monospace">Consolas</option>
                            <option value="'Monaco', 'Courier New', monospace">Monaco</option>
                            <option value="'Source Code Pro', monospace">Source Code Pro</option>
                            <option value="'Manrope', sans-serif">Manrope (sans-serif)</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Code Font Size</span>
                            <p className="stg-row-desc">Controls text size inside the SQL editor only</p>
                        </div>
                        <div className="stg-flex">
                            <input type="range" className="stg-range" min="10" max="24"
                                value={editorSettings.fontSize || 14}
                                onChange={(e) => onEditorSettingsChange?.({ fontSize: parseInt(e.target.value) })}
                            />
                            <span className="stg-range-value">{editorSettings.fontSize || 14}px</span>
                        </div>
                    </div>
                    <div className="stg-row">
                        <span className="stg-row-label">Tab Size</span>
                        <div className="stg-flex--gap-sm">
                            {[2, 4].map(size => (
                                <button
                                    key={size}
                                    onClick={() => onEditorSettingsChange?.({ tabSize: size })}
                                    className={`stg-tab-btn${(editorSettings.tabSize || 4) === size ? ' stg-tab-btn--active' : ''}`}
                                >{size} spaces</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <hr className="stg-divider" />

            {/* Display */}
            <div>
                <h3 className="stg-section-title">Display</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Minimap</span>
                            <p className="stg-row-desc">Show a preview of the code on the right edge</p>
                        </div>
                        <Toggle on={!!editorSettings.minimap} onChange={() => onEditorSettingsChange?.({ minimap: !editorSettings.minimap })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Word Wrap</span>
                            <p className="stg-row-desc">Wrap lines that exceed the editor width</p>
                        </div>
                        <Toggle on={editorSettings.wordWrap === 'on'} onChange={() => onEditorSettingsChange?.({ wordWrap: editorSettings.wordWrap === 'on' ? 'off' : 'on' })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Line Numbers</span>
                            <p className="stg-row-desc">Show line numbers in the gutter</p>
                        </div>
                        <Toggle on={(editorSettings.lineNumbers ?? 'on') === 'on'} onChange={() => onEditorSettingsChange?.({ lineNumbers: (editorSettings.lineNumbers ?? 'on') === 'on' ? 'off' : 'on' })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Bracket Pair Colorization</span>
                            <p className="stg-row-desc">Color matches brackets to make them easier to identify</p>
                        </div>
                        <Toggle on={(editorSettings.bracketPairColorization ?? true)} onChange={() => onEditorSettingsChange?.({ bracketPairColorization: !(editorSettings.bracketPairColorization ?? true) })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Render Whitespace</span>
                            <p className="stg-row-desc">Show dots for spaces and arrows for tabs</p>
                        </div>
                        <select
                            className="stg-select stg-select--w120"
                            value={editorSettings.renderWhitespace || 'none'}
                            onChange={(e) => onEditorSettingsChange?.({ renderWhitespace: e.target.value })}
                        >
                            <option value="none">None</option>
                            <option value="boundary">Boundary</option>
                            <option value="selection">Selection</option>
                            <option value="all">All</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Smooth Scrolling</span>
                            <p className="stg-row-desc">Enable animated smooth scrolling in the editor</p>
                        </div>
                        <Toggle on={(editorSettings.smoothScrolling ?? false)} onChange={() => onEditorSettingsChange?.({ smoothScrolling: !(editorSettings.smoothScrolling ?? false) })} />
                    </div>
                </div>
            </div>

            <hr className="stg-divider" />

            {/* Cursor */}
            <div>
                <h3 className="stg-section-title">Cursor</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <span className="stg-row-label">Cursor Style</span>
                        <select
                            className="stg-select stg-select--w120"
                            value={editorSettings.cursorStyle || 'line'}
                            onChange={(e) => onEditorSettingsChange?.({ cursorStyle: e.target.value })}
                        >
                            <option value="line">Line</option>
                            <option value="block">Block</option>
                            <option value="underline">Underline</option>
                            <option value="line-thin">Line Thin</option>
                            <option value="block-outline">Block Outline</option>
                            <option value="underline-thin">Underline Thin</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <span className="stg-row-label">Cursor Blinking</span>
                        <select
                            className="stg-select stg-select--w120"
                            value={editorSettings.cursorBlinking || 'blink'}
                            onChange={(e) => onEditorSettingsChange?.({ cursorBlinking: e.target.value })}
                        >
                            <option value="blink">Blink</option>
                            <option value="smooth">Smooth</option>
                            <option value="phase">Phase</option>
                            <option value="expand">Expand</option>
                            <option value="solid">Solid (No blink)</option>
                        </select>
                    </div>
                </div>
            </div>

            <hr className="stg-divider" />

            {/* Results */}
            <div>
                <h3 className="stg-section-title">Results</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <span className="stg-row-label">Results Font Size</span>
                        <div className="stg-flex">
                            <input type="range" className="stg-range" min="11" max="16"
                                value={editorSettings.resultsFontSize || 13}
                                onChange={(e) => onEditorSettingsChange?.({ resultsFontSize: parseInt(e.target.value) })}
                            />
                            <span className="stg-range-value">{editorSettings.resultsFontSize || 13}px</span>
                        </div>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Show Row Numbers</span>
                            <p className="stg-row-desc">Adds a row-number column on the left of the table</p>
                        </div>
                        <Toggle
                            on={editorSettings.showRowNumbers !== false}
                            onChange={() => onEditorSettingsChange?.({ showRowNumbers: editorSettings.showRowNumbers === false })}
                        />
                    </div>
                    {editorSettings.showRowNumbers !== false && (
                        <div className="stg-row">
                            <div>
                                <span className="stg-row-label">Pin Row Numbers</span>
                                <p className="stg-row-desc">Keeps the number column visible as you scroll sideways</p>
                            </div>
                            <Toggle
                                on={editorSettings.stickyRowNumbers !== false}
                                onChange={() => onEditorSettingsChange?.({ stickyRowNumbers: editorSettings.stickyRowNumbers === false })}
                            />
                        </div>
                    )}
                    <div className="stg-row">
                        <span className="stg-row-label">Default Results View</span>
                        <select
                            className="stg-select stg-select--w120"
                            value={editorSettings.defaultViewMode || 'table'}
                            onChange={(e) => onEditorSettingsChange?.({ defaultViewMode: e.target.value })}
                        >
                            <option value="table">Table</option>
                            <option value="chart">Chart</option>
                            <option value="profile">Profile</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Default Results Limit</span>
                            <p className="stg-row-desc">Maximum number of rows to return on quick SELECT operations</p>
                        </div>
                        <select
                            className="stg-select stg-select--w120"
                            value={editorSettings.queryResultLimit ?? 10000}
                            onChange={(e) => onEditorSettingsChange?.({ queryResultLimit: parseInt(e.target.value) })}
                        >
                            <option value={100}>100 rows</option>
                            <option value={500}>500 rows</option>
                            <option value={1000}>1,000 rows</option>
                            <option value={5000}>5,000 rows</option>
                            <option value={10000}>10,000 rows</option>
                            <option value={50000}>50,000 rows</option>
                            <option value={0}>No limit</option>
                        </select>
                    </div>
                    {editorSettings.queryResultLimit === 0 && (
                        <div className="stg-alert stg-alert--warning stg-mt8">
                            <strong>Warning:</strong> without a limit, a result can use a lot of memory and slow the interface. A safety limit of 1,000,000 rows or 256 MB still applies; use Export for more. We recommend using SQL notebooks with aggregate queries to explore very large data.
                        </div>
                    )}
                </div>
            </div>

            <hr className="stg-divider" />

            {/* Editor Intelligence */}
            <div>
                <h3 className="stg-section-title">Editor Intelligence</h3>
                <div className="stg-card stg-card--mt14">
                    <div className="stg-card-header">
                        <h4 className="stg-card-title">DuckDB Function Catalog</h4>
                        <button onClick={handleRefreshCatalog} disabled={isRefreshingCatalog} className="stg-btn">
                            {isRefreshingCatalog && <LuLoader size={12} className="stg-spin" />}
                            {catalogStats.cacheExists ? 'Refresh Cache' : 'Generate Cache'}
                        </button>
                    </div>
                    <p className="stg-card-desc">
                        The editor provides rich autocompletion and hover documentation for DuckDB functions.
                        We merge curated rich docs with live database introspection.
                    </p>
                    <div className="stg-mb6">
                        <div className="stg-row stg-row--mb6">
                            <span className="stg-stat-label">Rich Documentation Coverage</span>
                            <span className="stg-stat-label">{catalogStats.documented} / {catalogStats.total > 0 ? catalogStats.total : '?'}</span>
                        </div>
                        <div className="stg-progress">
                            <div className="stg-progress-fill" style={{ width: `${coveragePercent}%` }} />
                        </div>
                    </div>

                    {catalogStats.undocumented?.length > 0 && (
                        <div className="stg-mt10">
                            <button
                                onClick={() => setShowUndocumented(!showUndocumented)}
                                className="stg-undoc-toggle"
                            >
                                {showUndocumented ? 'Hide' : 'Show'} {catalogStats.undocumented.length} functions with basic auto-generated docs
                            </button>
                            {showUndocumented && (
                                <div className="stg-undoc-list">
                                    <div className="stg-undoc-grid">
                                        {catalogStats.undocumented.map((fn, i) => (
                                            <div key={i} title={fn.description} className="stg-undoc-item">
                                                {fn.function_name}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <hr className="stg-divider" />
            {/* Markdown Editor */}
            <div>
                <h3 className="stg-section-title">Markdown Editor</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Default View Mode</span>
                            <p className="stg-row-desc">Starting view when opening a .md file</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={editorSettings.markdownDefaultView || 'edit'}
                            onChange={(e) => onEditorSettingsChange?.({ markdownDefaultView: e.target.value })}
                        >
                            <option value="edit">Edit only</option>
                            <option value="split">Split (Edit + Preview)</option>
                            <option value="preview">Preview only</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Show Formatting Toolbar</span>
                            <p className="stg-row-desc">Display the markdown formatting toolbar in .md files</p>
                        </div>
                        <Toggle
                            on={editorSettings.markdownToolbarVisible ?? true}
                            onChange={() => onEditorSettingsChange?.({ markdownToolbarVisible: !(editorSettings.markdownToolbarVisible ?? true) })}
                        />
                    </div>
                </div>
            </div>
            </div>}
            {/* ── Formatting (merged into the same section) ── */}
            {<div className="stg-subtab-content">
            <div>
                <h3 className="stg-section-title">SQL Formatter</h3>
                <p className="stg-row-desc stg-row-desc--mb14">
                    Configure how SQL is formatted when using Ctrl+K / Shift+Alt+F.
                    Changes apply immediately to future format operations.
                </p>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Keyword Case</span>
                            <p className="stg-row-desc">Controls capitalization of SQL keywords (SELECT, FROM, WHERE…)</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={formatterConfig.keywordCase || 'upper'}
                            onChange={e => setFormatterConfig(c => ({ ...c, keywordCase: e.target.value }))}
                        >
                            <option value="upper">UPPER (SELECT, FROM)</option>
                            <option value="lower">lower (select, from)</option>
                            <option value="preserve">Preserve (as-is)</option>
                        </select>
                    </div>

                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Tab Width</span>
                            <p className="stg-row-desc">Number of spaces per indentation level</p>
                        </div>
                        <input
                            type="number"
                            className="stg-select stg-select--w200"
                            min={1} max={8}
                            value={formatterConfig.tabWidth ?? 4}
                            onChange={e => setFormatterConfig(c => ({ ...c, tabWidth: Math.max(1, Math.min(8, parseInt(e.target.value) || 4)) }))}
                        />
                    </div>

                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Lines Between Queries</span>
                            <p className="stg-row-desc">Blank lines inserted between separate SQL statements</p>
                        </div>
                        <input
                            type="number"
                            className="stg-select stg-select--w200"
                            min={0} max={3}
                            value={formatterConfig.linesBetweenQueries ?? 2}
                            onChange={e => setFormatterConfig(c => ({ ...c, linesBetweenQueries: Math.max(0, Math.min(3, parseInt(e.target.value) || 2)) }))}
                        />
                    </div>

                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Indent Style</span>
                            <p className="stg-row-desc">Controls how indentation is applied to clauses</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={formatterConfig.indentStyle || 'standard'}
                            onChange={e => setFormatterConfig(c => ({ ...c, indentStyle: e.target.value }))}
                        >
                            <option value="standard">Standard</option>
                            <option value="tabsLeftAlign">Tabs Left Align</option>
                        </select>
                    </div>

                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Format on Save</span>
                            <p className="stg-row-desc">Automatically format SQL when manually saving</p>
                        </div>
                        <Toggle on={(editorSettings.formatOnSave ?? false)} onChange={() => onEditorSettingsChange?.({ formatOnSave: !(editorSettings.formatOnSave ?? false) })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Format on Paste</span>
                            <p className="stg-row-desc">Format SQL automatically when pasting content</p>
                        </div>
                        <Toggle on={(editorSettings.formatOnPaste ?? false)} onChange={() => onEditorSettingsChange?.({ formatOnPaste: !(editorSettings.formatOnPaste ?? false) })} />
                    </div>
                </div>
            </div>

            <div className="stg-row" style={{ marginTop: 8 }}>
                <div>
                    <span className="stg-row-label">Save Formatter Settings</span>
                    <p className="stg-row-desc">Persist your current formatting preferences</p>
                </div>
                <button
                    className="stg-btn stg-btn--primary"
                    onClick={saveFormatterConfig}
                >
                    {formatterSaved ? <><LuCheck size={14} /> Saved!</> : 'Apply & Save'}
                </button>
            </div>
            </div>}
        </div>
    );
}
