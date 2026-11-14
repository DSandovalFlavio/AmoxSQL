/**
 * Settings › Cómo se comporta la app, y exportar / borrar la configuración.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { LuDownload, LuTrash2 } from 'react-icons/lu';
import { Toggle } from './comun';
import { migrateAccent } from '../../theme.js';

export default function Comportamiento({
    currentAccent,
    currentLayout,
    currentTheme,
    dialog,
    editorSettings,
    onAccentChange,
    onEditorSettingsChange,
    onLayoutChange,
    onThemeChange,
    onUiZoomChange,
    toast,
    uiZoomLevel,
}) {
    return (
        <div className="stg-section">
            {/* Workflow */}
            <div>
                <h3 className="stg-section-title">Workflow</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Auto Save</span>
                            <p className="stg-row-desc">Automatically save dirty files after a delay</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={editorSettings.autoSaveInterval || 0}
                            onChange={(e) => onEditorSettingsChange?.({ autoSaveInterval: parseInt(e.target.value) })}
                        >
                            <option value={0}>Off</option>
                            <option value={5000}>After 5 seconds</option>
                            <option value={15000}>After 15 seconds</option>
                            <option value={30000}>After 30 seconds</option>
                            <option value={60000}>After 1 minute</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Show Welcome Screen</span>
                            <p className="stg-row-desc">Show the welcome screen when AmoxSQL starts</p>
                        </div>
                        <Toggle on={(editorSettings.showWelcomeOnStart ?? true)} onChange={() => onEditorSettingsChange?.({ showWelcomeOnStart: !(editorSettings.showWelcomeOnStart ?? true) })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Toggle Sidebar on Active Tab Click</span>
                            <p className="stg-row-desc">Collapse the sidebar when clicking the currently active tab icon</p>
                        </div>
                        <Toggle on={(editorSettings.toggleSidebarOnActiveTabClick ?? true)} onChange={() => onEditorSettingsChange?.({ toggleSidebarOnActiveTabClick: !(editorSettings.toggleSidebarOnActiveTabClick ?? true) })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Default Data File Action</span>
                            <p className="stg-row-desc">What happens when clicking data files (.csv, .json, .parquet)</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={editorSettings.defaultDataFileAction || 'preview'}
                            onChange={(e) => onEditorSettingsChange?.({ defaultDataFileAction: e.target.value })}
                        >
                            <option value="preview">Open Quick Preview Modal</option>
                            <option value="query">Open Direct Query</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Confirm Default Operations</span>
                            <p className="stg-row-desc">Ask for confirmation before dropping tables</p>
                        </div>
                        <Toggle on={(editorSettings.confirmBeforeDrop ?? true)} onChange={() => onEditorSettingsChange?.({ confirmBeforeDrop: !(editorSettings.confirmBeforeDrop ?? true) })} />
                    </div>
                </div>
            </div>
            <hr className="stg-divider" />
            {/* File Explorer */}
            <div>
                <h3 className="stg-section-title">File Explorer</h3>
                <div className="stg-group stg-group--mt14">
                    {/* 6.0 (M11): la vista de árbol, opcional; carpeta a carpeta es la de serie. */}
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Explorer View</span>
                            <p className="stg-row-desc">One folder at a time with a path on top, or the whole project as a tree you unfold</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={editorSettings.explorerVista || 'carpetas'}
                            onChange={(e) => onEditorSettingsChange?.({ explorerVista: e.target.value })}
                        >
                            <option value="carpetas">Folders (default)</option>
                            <option value="arbol">Tree</option>
                        </select>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Show File Sizes in Explorer</span>
                            <p className="stg-row-desc">Display the size of files in the left sidebar</p>
                        </div>
                        <Toggle on={(editorSettings.showFileSizes ?? true)} onChange={() => onEditorSettingsChange?.({ showFileSizes: !(editorSettings.showFileSizes ?? true) })} />
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Default Explorer Sort View</span>
                            <p className="stg-row-desc">Starting view mode for the file explorer</p>
                        </div>
                        <select
                            className="stg-select stg-select--w200"
                            value={editorSettings.defaultExplorerSort || 'default'}
                            onChange={(e) => onEditorSettingsChange?.({ defaultExplorerSort: e.target.value })}
                        >
                            <option value="default">Default</option>
                            <option value="name">By Name</option>
                            <option value="modified">By Date Modified</option>
                            <option value="type">By Type Grouped</option>
                        </select>
                    </div>
                </div>
            </div>
            <hr className="stg-divider" />
            {/* Settings backup & reset */}
            <div>
                <h3 className="stg-section-title">Backup & Reset</h3>
                <div className="stg-group stg-group--mt14">
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Export Settings</span>
                            <p className="stg-row-desc">Save your current configuration to a JSON file</p>
                        </div>
                        <button className="stg-btn" onClick={() => {
                            const settings = { editor: editorSettings, theme: currentTheme, accent: currentAccent, layout: currentLayout, zoom: uiZoomLevel };
                            const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'amoxsql-settings.json';
                            a.click();
                        }}>
                            <LuDownload size={14} /> Export
                        </button>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label">Import Settings</span>
                            <p className="stg-row-desc">Load a previously exported configuration file</p>
                        </div>
                        <button className="stg-btn" onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'application/json';
                            input.onchange = (e) => {
                                const file = e.target.files[0];
                                const reader = new FileReader();
                                reader.onload = (re) => {
                                    try {
                                        const data = JSON.parse(re.target.result);
                                        if (data.editor) onEditorSettingsChange?.(data.editor);
                                        if (data.theme) onThemeChange?.(data.theme);
                                        if (data.accent) onAccentChange?.(migrateAccent(data.accent));
                                        if (data.layout) onLayoutChange?.(data.layout);
                                        if (data.zoom) onUiZoomChange?.(data.zoom);
                                        toast.success('Settings imported successfully');
                                    } catch {
                                        toast.error('Invalid settings file');
                                    }
                                };
                                reader.readAsText(file);
                            };
                            input.click();
                        }}>
                            <LuDownload size={14} style={{ transform: 'rotate(180deg)' }} /> Import
                        </button>
                    </div>
                    <div className="stg-row">
                        <div>
                            <span className="stg-row-label stg-text-danger">Reset to Defaults</span>
                            <p className="stg-row-desc">Restore all editor and appearance settings to factory defaults</p>
                        </div>
                        <button className="stg-btn stg-btn--danger-text" onClick={async () => {
                            const ok = await dialog.confirmAsync({
                                title: 'Reset to defaults?',
                                message: 'All UI and editor settings will be restored to factory defaults. Your queries and databases will NOT be affected.',
                                confirmLabel: 'Reset',
                                destructive: true,
                            });
                            if (ok) {
                                onEditorSettingsChange?.({});
                                onThemeChange?.('dark');
                                onAccentChange?.('cyan');
                                onLayoutChange?.('horizontal');
                                onUiZoomChange?.(1.0);
                                toast.success('Settings restored to defaults');
                            }
                        }}>
                            <LuTrash2 size={14} /> Reset
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
