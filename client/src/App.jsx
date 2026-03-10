/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
import { useState, useRef, useEffect, Suspense, lazy, useCallback, useMemo } from 'react';
import FileExplorer from './components/FileExplorer';
import DatabaseExplorer from './components/DatabaseExplorer';
import ExtensionExplorer from './components/ExtensionExplorer';
import SnippetsPanel from './components/SnippetsPanel';
import DbtPanel from './components/DbtPanel';
import QueryHistoryPanel from './components/QueryHistoryPanel';
import SaveQueryModal from './components/SaveQueryModal';
import ImportModal from './components/ImportModal';
import ImportExcelModal from './components/ImportExcelModal';
import LayoutManager from './components/LayoutManager';

// New Components
import WelcomeScreen from './components/WelcomeScreen';
import ProjectInfo from './components/ProjectInfo';
import DatabaseSelectionModal from './components/DatabaseSelectionModal';
import AiSidebar from './components/AiSidebar';
import StatusBar from './components/StatusBar';
import CommandPalette, { buildDefaultActions } from './components/CommandPalette';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import DataQualityModal from './components/DataQualityModal';
import SchemaDiffModal from './components/SchemaDiffModal';
import ExecutionChainModal from './components/ExecutionChainModal';
import { useToast } from './components/ToastProvider';

import SettingsModal from './components/SettingsModal';
import { LuBot, LuX, LuPlay, LuSave, LuActivity, LuSettings, LuFolder, LuDatabase, LuFilePlus, LuPuzzle, LuCode, LuHistory, LuPanelLeftClose, LuPanelLeftOpen, LuLink, LuContainer } from "react-icons/lu";

import './index.css';

// App Phases
const PHASE = {
  WELCOME: 'WELCOME',
  SELECTING_DB: 'SELECTING_DB',
  IDE: 'IDE'
};

function App() {
  const [appPhase, setAppPhase] = useState(PHASE.WELCOME);
  const toast = useToast();

  const layoutRef = useRef(null);

  // File Management State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSaveContent, setPendingSaveContent] = useState('');

  // Database State
  const [currentDb, setCurrentDb] = useState(':memory:');
  const [dbReadOnly, setDbReadOnly] = useState(false);
  const [refreshDbTrigger, setRefreshDbTrigger] = useState(0);
  const [fileRefreshTrigger, setFileRefreshTrigger] = useState(0);

  // Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
  const [importTargetFile, setImportTargetFile] = useState(null);
  const [importIsFolder, setImportIsFolder] = useState(false);

  // Project State
  const [projectPath, setProjectPath] = useState('');
  // We repurpose dbSelectModal state to be part of the flow
  const [foundDbs, setFoundDbs] = useState([]);

  // AI Integration State
  const [showAiSidebar, setShowAiSidebar] = useState(false);

  // Toolbar Dropdown State
  const [showToolbarSaveMenu, setShowToolbarSaveMenu] = useState(false);
  const [showToolbarNewMenu, setShowToolbarNewMenu] = useState(false);
  const [availableTables, setAvailableTables] = useState([]);

  // Sidebar Architecture State
  const [activeSidebarTab, setActiveSidebarTab] = useState('files'); // 'files', 'schema', or 'extensions'
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(
    () => parseInt(localStorage.getItem('amoxsql-sidebar-width')) || 280
  );
  const isResizingSidebar = useRef(false);

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Status Bar State — last query info
  const [lastQueryInfo, setLastQueryInfo] = useState(null);

  // Keyboard Shortcuts Modal
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Data Quality & Schema Diff Modals
  const [qualityCheckTable, setQualityCheckTable] = useState(null);
  const [isSchemaDiffOpen, setIsSchemaDiffOpen] = useState(false);

  // Execution Chain Modal
  const [isChainOpen, setIsChainOpen] = useState(false);
  const [sqlFileList, setSqlFileList] = useState([]);

  /* --- Project Workflow Handlers --- */

  // Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('amoxsql-theme') || 'dark');
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('amoxsql-accent') || 'cyan'); // 'cyan' | 'linear' | 'amox-2' .. 'amox-10'
  const [editorLayout, setEditorLayout] = useState(() => localStorage.getItem('amoxsql-editor-layout') || 'horizontal'); // 'horizontal' | 'vertical'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Editor & UI Preferences (centralized)
  const [editorSettings, setEditorSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('amoxsql-editor-settings');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const mergedEditorSettings = {
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    minimap: false,
    wordWrap: 'off',
    lineNumbers: 'on',
    tabSize: 4,
    resultsFontSize: 13,
    defaultViewMode: 'table',
    ...editorSettings,
  };

  // Apply Theme & Accent Classes
  useEffect(() => {
    localStorage.setItem('amoxsql-theme', theme);
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('amoxsql-accent', accentColor);
    // Remove all accent classes first
    const classes = [...document.body.classList].filter(c => c.startsWith('accent-'));
    classes.forEach(c => document.body.classList.remove(c));
    // Apply new accent class (cyan = default, no class needed)
    if (accentColor !== 'cyan') {
      document.body.classList.add(`accent-${accentColor}`);
    }
  }, [accentColor]);

  useEffect(() => {
    localStorage.setItem('amoxsql-editor-layout', editorLayout);
  }, [editorLayout]);

  useEffect(() => {
    localStorage.setItem('amoxsql-editor-settings', JSON.stringify(editorSettings));
  }, [editorSettings]);

  useEffect(() => {
    localStorage.setItem('amoxsql-sidebar-width', String(sidebarWidth));
  }, [sidebarWidth]);

  // Initialize Data
  useEffect(() => {
    setAppPhase(PHASE.WELCOME);
  }, []);

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handler = (e) => {
      // Command Palette: Ctrl+Shift+P
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }
      // Only handle shortcuts in IDE phase
      if (appPhase !== PHASE.IDE) return;

      // Toggle Sidebar: Ctrl+B
      if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
        return;
      }

      // Save: Ctrl+S
      if (e.ctrlKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        layoutRef.current?.handleTriggerSave();
        return;
      }
      // Analyze: Ctrl+Shift+A
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        layoutRef.current?.handleTriggerAnalyze();
        return;
      }
      // File Explorer: Ctrl+Shift+E
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setActiveSidebarTab('files');
        return;
      }
      // Database Explorer: Ctrl+Shift+D
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setActiveSidebarTab('schema');
        return;
      }
      // Settings: Ctrl+,
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }
      // Keyboard Shortcuts: Ctrl+Shift+/
      if (e.ctrlKey && e.shiftKey && e.key === '/') {
        e.preventDefault();
        setIsShortcutsOpen(true);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appPhase]);

  /* --- Execution Chain Handler --- */
  const handleOpenChain = useCallback(async () => {
    try {
      const collectSqlFiles = async (dir = '') => {
        const res = await fetch(`http://localhost:3001/api/files?path=${encodeURIComponent(dir)}`);
        const files = await res.json();
        let sqlFiles = [];
        for (const f of files) {
          if (f.isDirectory) {
            const sub = await collectSqlFiles(f.path);
            sqlFiles = sqlFiles.concat(sub);
          } else if (f.name.endsWith('.sql')) {
            sqlFiles.push(f.path);
          }
        }
        return sqlFiles;
      };
      const files = await collectSqlFiles();
      setSqlFileList(files);
      setIsChainOpen(true);
    } catch (err) {
      console.error('Failed to collect SQL files:', err);
      setSqlFileList([]);
      setIsChainOpen(true);
    }
  }, []);

  // Command Palette actions
  const commandPaletteActions = useMemo(() => {
    if (appPhase !== PHASE.IDE) return [];
    return [
      ...buildDefaultActions({
        layoutRef,
        setActiveSidebarTab,
        setShowAiSidebar,
        showAiSidebar,
        setIsSettingsOpen,
        theme,
        setTheme,
        setIsShortcutsOpen,
      }),
      { id: 'run-chain', label: 'Run Execution Chain...', category: 'Query', icon: LuLink, action: handleOpenChain },
    ];
  }, [appPhase, showAiSidebar, theme, handleOpenChain]);

  const startIdeSession = useCallback(async (dbPath, readOnly) => {
    // 1. Configure DB
    if (dbPath === ':memory:') {
      await fetch('http://localhost:3001/api/db/close', { method: 'POST' });
      setCurrentDb(':memory:');
      setDbReadOnly(false);
    } else {
      // Ensure clean slate
      await fetch('http://localhost:3001/api/db/close', { method: 'POST' });
      await new Promise(r => setTimeout(r, 200));

      try {
        const response = await fetch('http://localhost:3001/api/db/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: dbPath, readOnly: readOnly })
        });
        if (response.ok) {
          const d = await response.json();
          setCurrentDb(d.path);
          setDbReadOnly(!!readOnly);
        } else {
          toast.warning("Connect failed. Starting in memory.");
          setCurrentDb(':memory:');
          setDbReadOnly(false);
        }
      } catch (e) {
        console.error(e);
        setCurrentDb(':memory:');
        setDbReadOnly(false);
      }
    }

    // 2. Enter IDE Phase
    setAppPhase(PHASE.IDE);
    setRefreshDbTrigger(prev => prev + 1);
  }, [toast]);

  const handleOpenProject = useCallback(async (path) => {
    try {
      const response = await fetch('http://localhost:3001/api/project/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await response.json();

      if (response.ok) {
        setProjectPath(data.path);

        // 2. Scan for Databases
        try {
          const scanRes = await fetch('http://localhost:3001/api/project/scan-dbs');
          const dbs = await scanRes.json();

          // Found DBs or Empty Project: Go to Selection Phase
          setFoundDbs(dbs || []);
          setAppPhase(PHASE.SELECTING_DB);
        } catch (scanErr) {
          console.warn("DB Scan failed, defaulting to memory", scanErr);
          await startIdeSession(':memory:', false);
        }
      } else {
        toast.error("Failed to open folder: " + data.error);
      }
    } catch (err) {
      toast.error("Error opening folder: " + err.message);
    }
  }, [startIdeSession, toast]);

  const handleDbSelection = useCallback((selection) => {
    startIdeSession(selection.path, selection.readOnly);
  }, [startIdeSession]);

  const handleCloseProject = useCallback(() => {
    // Reset everything to Welcome State
    setAppPhase(PHASE.WELCOME);
    setProjectPath('');
  }, []);


  /* --- File Handlers --- */
  const handleFileOpen = useCallback(async (path) => {
    try {
      const response = await fetch(`http://localhost:3001/api/file?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // determine type
      const type = path.endsWith('.sqlnb') ? 'sqlnb' : 'sql';
      layoutRef.current?.openFile(path, data.content, type);

    } catch (err) {
      toast.error(`Failed to open file: ${err.message}`);
    }
  }, [toast]);

  const handleFileClick = useCallback((path) => {
    // Ideally this is handled by LayoutManager if it's already open?
    // But we need to switch tabs. LayoutManager.openFile handles both open and focus.
    // We assume file click means "Open/Focus". 
    // BUT FileExplorer usually provides just path. We need CONTENT to open a file.
    handleFileOpen(path);
  }, [handleFileOpen]);

  const handleImportRequest = useCallback((filePath, isFolder = false) => {
    setImportTargetFile(filePath);
    setImportIsFolder(isFolder);

    // Check for Excel
    if (!isFolder && (filePath.toLowerCase().endsWith('.xlsx') || filePath.toLowerCase().endsWith('.xls'))) {
      setIsExcelImportModalOpen(true);
    } else {
      setIsImportModalOpen(true);
    }
  }, []);

  const performImport = useCallback(async (tableName, cleanColumns, overridePath = null) => {
    try {
      const finalPath = overridePath || importTargetFile;
      const response = await fetch('http://localhost:3001/api/db/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: finalPath,
          tableName: tableName,
          cleanColumns: cleanColumns
        })
      });
      const data = await response.json();
      if (response.ok) {
        setRefreshDbTrigger(prev => prev + 1);
        return { success: true, summary: `Import successful! Table '${tableName}' created.` };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [importTargetFile]);



  const performExcelImport = useCallback(async (config) => {
    try {
      const response = await fetch('http://localhost:3001/api/db/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await response.json();

      if (response.ok) {
        setRefreshDbTrigger(prev => prev + 1);
        return { success: true, summary: data.summary };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const handleNewFile = useCallback(async (currentPath, type = 'sql') => {
    layoutRef.current?.createNew(type);
  }, []);

  const handleNewFolder = useCallback(async (currentPath) => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;
    const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;

    try {
      const response = await fetch('http://localhost:3001/api/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      toast.success(`Folder "${folderName}" created`);
      setFileRefreshTrigger(t => t + 1);
    } catch (err) {
      toast.error(`Failed to create folder: ${err.message}`);
    }
  }, []);

  const performSave = useCallback(async (filePath, content) => {
    try {
      const response = await fetch('http://localhost:3001/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      return { success: true, summary: "File saved successfully!" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const handleSaveAs = useCallback(async (filename, description) => {
    let contentToSave = pendingSaveContent;
    if (description) {
      contentToSave = `/*\n * Description: ${description}\n */\n\n${contentToSave}`;
    }
    if (!filename.endsWith('.sql') && !filename.endsWith('.sqlnb')) {
      filename += '.sql';
    }

    const result = await performSave(filename, contentToSave);

    if (result.success) {
      // Notify LayoutManager that the file is now saved with this path
      layoutRef.current?.finishSaveAs(filename);
    }

    return result;
  }, [pendingSaveContent, performSave]);

  // --- Main Render Logic ---

  if (appPhase === PHASE.WELCOME) {
    return (
      <>
        <WelcomeScreen onOpenProject={handleOpenProject} onOpenSettings={() => setIsSettingsOpen(true)} />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentTheme={theme}
          onThemeChange={setTheme}
          currentAccent={accentColor}
          onAccentChange={setAccentColor}
          currentLayout={editorLayout}
          onLayoutChange={setEditorLayout}
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>

      {/* Command Palette — Global */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={commandPaletteActions}
      />

      {/* Modal Overlay for DB Selection Phase */}
      <DatabaseSelectionModal
        isOpen={appPhase === PHASE.SELECTING_DB}
        dbFiles={foundDbs}
        onSelect={handleDbSelection}
        onCancel={() => startIdeSession(':memory:', false)}
      />

      {appPhase === PHASE.IDE && (
        <div className="app-container" style={{ height: '100%', display: 'flex' }}>

          {/* Activity Bar — Linear Style */}
          <div className="activity-bar">
            <button
              onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setActiveSidebarTab('files'); }}
              className={`activity-bar-btn ${activeSidebarTab === 'files' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
              title="Explorer (Ctrl+Shift+E)"
            >
              <LuFolder size={20} />
            </button>
            <button
              onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setActiveSidebarTab('schema'); }}
              className={`activity-bar-btn ${activeSidebarTab === 'schema' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
              title="Database Schema (Ctrl+Shift+D)"
            >
              <LuDatabase size={20} />
            </button>
            <button
              onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setActiveSidebarTab('extensions'); }}
              className={`activity-bar-btn ${activeSidebarTab === 'extensions' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
              title="Extensions"
            >
              <LuPuzzle size={20} />
            </button>
            <button
              onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setActiveSidebarTab('dbt'); }}
              className={`activity-bar-btn ${activeSidebarTab === 'dbt' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
              title="DBT Studio"
            >
              <LuContainer size={20} />
            </button>
            <button
              onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setActiveSidebarTab('snippets'); }}
              className={`activity-bar-btn ${activeSidebarTab === 'snippets' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
              title="SQL Snippets"
            >
              <LuCode size={20} />
            </button>
            <button
              onClick={() => { if (sidebarCollapsed) setSidebarCollapsed(false); setActiveSidebarTab('history'); }}
              className={`activity-bar-btn ${activeSidebarTab === 'history' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
              title="Query History"
            >
              <LuHistory size={20} />
            </button>
            {/* Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(prev => !prev)}
              className="activity-bar-collapse-btn"
              title={sidebarCollapsed ? 'Show Sidebar (Ctrl+B)' : 'Hide Sidebar (Ctrl+B)'}
              style={{ marginTop: 'auto' }}
            >
              {sidebarCollapsed ? <LuPanelLeftOpen size={18} /> : <LuPanelLeftClose size={18} />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="activity-bar-btn activity-bar-btn--bottom"
              title="Settings (Ctrl+,)"
              style={{ marginTop: '0' }}
            >
              <LuSettings size={20} />
            </button>
          </div>

          <div className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`} style={sidebarCollapsed ? {} : { width: `${sidebarWidth}px` }}>

            {/* Top Section: Project Info */}
            <ProjectInfo
              projectPath={projectPath}
              currentDb={currentDb}
              readOnly={dbReadOnly}
              onCloseProject={handleCloseProject}
            />

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 16px 8px 16px' }}></div>

            {/* Content Switcher */}
            {activeSidebarTab === 'files' && (
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <FileExplorer
                  onFileClick={handleFileClick}
                  onFileOpen={handleFileOpen}
                  onNewFile={handleNewFile}
                  onNewFolder={handleNewFolder}
                  onImportFile={handleImportRequest}
                  onQueryFile={(path) => layoutRef.current?.handleQueryFile(path)}
                  onEditChart={(path) => layoutRef.current?.handleEditChart(path)}
                  refreshTrigger={fileRefreshTrigger}
                />
              </div>
            )}

            {activeSidebarTab === 'schema' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <DatabaseExplorer
                  currentDb={currentDb}
                  onRefresh={refreshDbTrigger}
                  onTablesLoaded={setAvailableTables}
                  onSelectQuery={(query) => layoutRef.current?.createNew('sql', query)}
                  onQualityCheck={(tableName) => setQualityCheckTable(tableName)}
                />
              </div>
            )}

            {activeSidebarTab === 'extensions' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ExtensionExplorer />
              </div>
            )}

            {activeSidebarTab === 'dbt' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <DbtPanel projectPath={projectPath} onFileOpen={handleFileOpen} />
              </div>
            )}

            {activeSidebarTab === 'snippets' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <SnippetsPanel onInsert={(sql) => layoutRef.current?.createNew('sql', sql)} />
              </div>
            )}

            {activeSidebarTab === 'history' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <QueryHistoryPanel onSelect={(sql) => layoutRef.current?.createNew('sql', sql)} />
              </div>
            )}
          </div>

          {/* Sidebar Resize Handle */}
          {!sidebarCollapsed && (
            <div
              className={`sidebar-resize-handle ${isResizingSidebar.current ? 'sidebar-resize-handle--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                isResizingSidebar.current = true;
                const startX = e.clientX;
                const startWidth = sidebarWidth;
                const onMouseMove = (ev) => {
                  const delta = ev.clientX - startX;
                  const newWidth = Math.min(480, Math.max(200, startWidth + delta));
                  setSidebarWidth(newWidth);
                };
                const onMouseUp = () => {
                  isResizingSidebar.current = false;
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                };
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            />
          )}

          {/* Main Content with LayoutManager */}
          <div className="main-content">
            {/* Global Toolbar — Linear Style */}
            <div className="toolbar">
              <div className="toolbar-left">
                <button onClick={() => layoutRef.current?.handleTriggerRun()} title="Run Active (Ctrl+Enter)" style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: 'var(--accent-primary)', color: 'var(--surface-base)', border: 'none', fontWeight: '600' }}>
                  <LuPlay size={14} fill="currentColor" /> Run
                </button>
                <button
                  onClick={() => layoutRef.current?.handleTriggerAnalyze()}
                  title="Analyze Query Plan (Ctrl+Shift+E)"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-primary)', padding: '4px 8px' }}
                >
                  <LuActivity size={14} />
                </button>

                {/* Save Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setShowToolbarSaveMenu(v => !v); setShowToolbarNewMenu(false); }}
                    title="Save (Ctrl+S)"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                  >
                    <LuSave size={14} /> Save ▾
                  </button>
                  {showToolbarSaveMenu && (
                    <div style={{
                      position: 'absolute', left: 0, top: '100%', marginTop: '4px',
                      backgroundColor: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                      borderRadius: '8px', boxShadow: 'var(--shadow-md)', zIndex: 999,
                      padding: '4px', minWidth: '160px', backdropFilter: 'blur(12px)',
                      animation: 'dropdown-in 0.15s ease-out',
                    }}>
                      <div onClick={() => { layoutRef.current?.handleTriggerSave(); setShowToolbarSaveMenu(false); }}
                        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', transition: 'background-color 120ms ease' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        <LuSave size={14} /> Save
                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>Ctrl+S</span>
                      </div>
                      <div onClick={() => {
                        const content = layoutRef.current?.handleTriggerSave;
                        setPendingSaveContent('');
                        setIsSaveModalOpen(true);
                        setShowToolbarSaveMenu(false);
                      }}
                        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', transition: 'background-color 120ms ease' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        <LuSave size={14} /> Save As…
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-default)', margin: '0 4px' }}></div>

                {/* New Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setShowToolbarNewMenu(v => !v); setShowToolbarSaveMenu(false); }}
                    title="Create New File"
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                  >
                    <LuFilePlus size={14} /> New ▾
                  </button>
                  {showToolbarNewMenu && (
                    <div style={{
                      position: 'absolute', left: 0, top: '100%', marginTop: '4px',
                      backgroundColor: 'var(--surface-overlay)', border: '1px solid var(--border-default)',
                      borderRadius: '8px', boxShadow: 'var(--shadow-md)', zIndex: 999,
                      padding: '4px', minWidth: '170px', backdropFilter: 'blur(12px)',
                      animation: 'dropdown-in 0.15s ease-out',
                    }}>
                      <div onClick={() => { layoutRef.current?.createNew('sql'); setShowToolbarNewMenu(false); }}
                        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', transition: 'background-color 120ms ease' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        <LuCode size={14} /> SQL Query
                      </div>
                      <div onClick={() => { layoutRef.current?.createNew('notebook'); setShowToolbarNewMenu(false); }}
                        style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '6px', transition: 'background-color 120ms ease' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--hover-bg)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        <LuFilePlus size={14} /> Notebook
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-default)', margin: '0 4px' }}></div>
                <button
                  onClick={handleOpenChain}
                  title="Run Execution Chain"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                >
                  <LuLink size={14} /> Chain
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => setShowAiSidebar(!showAiSidebar)}
                  title="Toggle AI Assistant"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: showAiSidebar ? 'var(--active-bg)' : 'transparent', color: 'var(--accent-primary)', borderColor: showAiSidebar ? 'var(--accent-primary)' : 'var(--border-default)' }}
                >
                  {showAiSidebar ? <><LuX /> Close AI</> : <><LuBot /> AI Assistant</>}
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <LayoutManager
                ref={layoutRef}
                projectPath={projectPath}
                theme={theme}
                editorLayout={editorLayout}
                editorSettings={mergedEditorSettings}
                onDbChange={() => setRefreshDbTrigger(p => p + 1)}
                onRequestSaveAs={(content) => {
                  setPendingSaveContent(content);
                  setIsSaveModalOpen(true);
                }}
                onQueryResult={setLastQueryInfo}
              />
            </div>

            {/* Status Bar */}
            <StatusBar
              currentDb={currentDb}
              dbReadOnly={dbReadOnly}
              lastQueryInfo={lastQueryInfo}
            />
          </div>
          {/* Right Sidebar: AI Assistant */}
          <div style={{
            width: showAiSidebar ? '350px' : '0px',
            opacity: showAiSidebar ? 1 : 0,
            overflow: 'hidden',
            transition: 'width 0.2s ease, opacity 0.2s ease',
            flexShrink: 0,
            pointerEvents: showAiSidebar ? 'auto' : 'none',
          }}>
            <AiSidebar
              width="350px"
              onClose={() => setShowAiSidebar(false)}
              availableTables={availableTables}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </div>

        </div>
      )}


      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={theme}
        onThemeChange={setTheme}
        currentAccent={accentColor}
        onAccentChange={setAccentColor}
        currentLayout={editorLayout}
        onLayoutChange={setEditorLayout}
        editorSettings={mergedEditorSettings}
        onEditorSettingsChange={(updates) => setEditorSettings(prev => ({ ...prev, ...updates }))}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <DataQualityModal
        isOpen={!!qualityCheckTable}
        onClose={() => setQualityCheckTable(null)}
        tableName={qualityCheckTable}
      />

      <SchemaDiffModal
        isOpen={isSchemaDiffOpen}
        onClose={() => setIsSchemaDiffOpen(false)}
        tables={availableTables}
      />

      <SaveQueryModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSaveAs}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        initialFile={importTargetFile || ''}
        isFolder={importIsFolder}
        onClose={() => setIsImportModalOpen(false)}

        onImport={performImport}
      />

      <ImportExcelModal
        isOpen={isExcelImportModalOpen}
        initialFile={importTargetFile || ''}
        onClose={() => setIsExcelImportModalOpen(false)}
        onImport={(config) => performExcelImport(config)}
      />

      <ExecutionChainModal
        isOpen={isChainOpen}
        onClose={() => setIsChainOpen(false)}
        sqlFiles={sqlFileList}
      />
    </div>
  );
}

export default App;
