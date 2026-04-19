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
import AiAssistantPanel from './components/ai/AiAssistantPanel';
import AiDivingPanel from './components/ai/AiDivingPanel';
// StatusBar removed — info redundant with ResultsTable + WindowTitleBar
import CommandPalette, { buildDefaultActions } from './components/CommandPalette';
import { useToast } from './components/ToastProvider';
import { useDialog } from './components/dialogs/DialogProvider';
import WindowTitleBar from './components/WindowTitleBar';
import TabBar from './components/TabBar';

// Ultra-heavy lazy loaded Modals (Zero Cost Startup)
// KeyboardShortcutsModal removed — shortcuts now integrated in SettingsModal
const DataQualityModal = lazy(() => import('./components/DataQualityModal'));
const SchemaDiffModal = lazy(() => import('./components/SchemaDiffModal'));
const ExecutionChainModal = lazy(() => import('./components/ExecutionChainModal'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
import { LuBot, LuX, LuPlay, LuSave, LuActivity, LuSettings, LuFolder, LuDatabase, LuFilePlus, LuPuzzle, LuCode, LuHistory, LuPanelLeftClose, LuPanelLeftOpen, LuLink, LuContainer, LuFileText, LuSparkles, LuPackage } from "react-icons/lu";
const AnalysisVault = lazy(() => import('./components/ai/AnalysisVault'));

import './index.css';

// Pop-out Results Page (standalone view for child window)
import PopoutResultsPage from './components/PopoutResultsPage';

// App Phases
const PHASE = {
  WELCOME: 'WELCOME',
  IDE: 'IDE'
};

// Check if this window is a pop-out results window
const isPopoutMode = new URLSearchParams(window.location.search).get('popout') === 'true';

function App() {
  // If this is a pop-out child window, render ONLY the results page
  if (isPopoutMode) {
    return <PopoutResultsPage />;
  }

  const [appPhase, setAppPhase] = useState(PHASE.WELCOME);
  const toast = useToast();
  const dialog = useDialog();

  const layoutRef = useRef(null);

  // Tab bar state — synced from LayoutManager for rendering in WindowTitleBar
  const [titleBarTabs, setTitleBarTabs] = useState(null);

  // File Management State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSaveContent, setPendingSaveContent] = useState('');
  const [pendingSaveTab, setPendingSaveTab] = useState(null);

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
  const [activeTabInfo, setActiveTabInfo] = useState(null); // Info from active editor tab for AI assistant
  // showVault removed — vault is now a sidebar tab ('vault')

  const [availableTables, setAvailableTables] = useState([]);

  // Sidebar Architecture State
  const [activeSidebarTab, setActiveSidebarTab] = useState('files'); // 'files', 'schema', or 'extensions'
  // Keep-alive: panels se montan la primera vez que se visitan y permanecen montados
  // controlando visibilidad con display. Evita remount/refetch al cambiar de pestaña.
  const [visitedSidebarTabs, setVisitedSidebarTabs] = useState(() => new Set(['files']));
  useEffect(() => {
    setVisitedSidebarTabs(prev => prev.has(activeSidebarTab) ? prev : new Set(prev).add(activeSidebarTab));
  }, [activeSidebarTab]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(
    () => parseInt(localStorage.getItem('amoxsql-sidebar-width')) || 280
  );
  const isResizingSidebar = useRef(false);

  // Command Palette State
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);


  // AI Panel Width (resizable)
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    return parseInt(localStorage.getItem('amoxsql-ai-panel-width')) || 380;
  });
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('amoxsql-ai-panel-width', aiPanelWidth.toString()), 150);
    return () => clearTimeout(t);
  }, [aiPanelWidth]);

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
  const [uiZoomLevel, setUiZoomLevel] = useState(() => {
    return parseFloat(localStorage.getItem('amoxsql-ui-zoom')) || 1.0;
  });

  // Persist zoom to localStorage (main process handles the actual zoom)
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('amoxsql-ui-zoom', uiZoomLevel.toString()), 150);
    return () => clearTimeout(t);
  }, [uiZoomLevel]);

  // Listen for zoom changes from main process (Ctrl+Plus/Minus/0)
  useEffect(() => {
    if (window.electronAPI?.zoom?.onChanged) {
      const cleanup = window.electronAPI.zoom.onChanged((factor) => {
        const rounded = Math.round(factor * 10) / 10;
        setUiZoomLevel(rounded);
      });
      return cleanup;
    }
  }, []);

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
    mouseWheelZoom: true,
    bracketPairColorization: true,
    renderWhitespace: 'none',
    smoothScrolling: false,
    cursorStyle: 'line',
    cursorBlinking: 'blink',
    formatOnSave: false,
    formatOnPaste: false,
    showWelcomeOnStart: true,
    confirmBeforeDrop: true,
    queryResultLimit: 10000,
    autoSaveInterval: 0,
    ...editorSettings,
  };

  // Implement Auto-Save
  useEffect(() => {
    if (!mergedEditorSettings.autoSaveInterval || mergedEditorSettings.autoSaveInterval <= 0) return;
    const interval = setInterval(() => {
      // Trigger save transparently without showing a success toast if possible.
      // layoutRef.current.handleTriggerSave() will save the dirty active tab.
      if (layoutRef.current) {
        layoutRef.current.handleTriggerSave(true); // Assuming we can pass a boolean to make it silent, or just let it save.
      }
    }, mergedEditorSettings.autoSaveInterval);
    return () => clearInterval(interval);
  }, [mergedEditorSettings.autoSaveInterval]);

  // Apply Theme & Accent Classes
  useEffect(() => {
    localStorage.setItem('amoxsql-theme', theme);
    // Remove all theme classes first
    const themeClasses = ['light-theme', 'theme-onyx', 'theme-carbon', 'theme-graphite', 'theme-nord', 'theme-ivory', 'theme-mist'];
    themeClasses.forEach(c => document.body.classList.remove(c));
    // Apply the selected theme class (dark/obsidian = default, no class)
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else if (theme === 'ivory' || theme === 'mist') {
      // Light variant themes get their own class (they define their own light surfaces)
      document.body.classList.add(`theme-${theme}`);
    } else if (theme !== 'dark') {
      document.body.classList.add(`theme-${theme}`);
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
    const t = setTimeout(() => localStorage.setItem('amoxsql-editor-settings', JSON.stringify(editorSettings)), 300);
    return () => clearTimeout(t);
  }, [editorSettings]);

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('amoxsql-sidebar-width', String(sidebarWidth)), 150);
    return () => clearTimeout(t);
  }, [sidebarWidth]);

  // Initialize Data
  useEffect(() => {
    setAppPhase(PHASE.WELCOME);
  }, []);

  // --- Global Keyboard Shortcuts ---
  useEffect(() => {
    const handler = (e) => {
      // Zoom is handled by Electron main process (before-input-event)
      // React only receives the result via IPC 'zoom:changed'

      // Command Palette: Ctrl+Shift+P
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }
      // Only handle shortcuts in IDE phase
      if (appPhase !== PHASE.IDE) return;

      // Run Query: Ctrl+Enter (global fallback) or F5
      if ((e.ctrlKey && !e.shiftKey && e.key === 'Enter') || e.key === 'F5') {
        e.preventDefault();
        layoutRef.current?.handleTriggerRun();
        return;
      }

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
      // Save As: Ctrl+Shift+S
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        layoutRef.current?.handleTriggerSaveAs();
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
      // Keyboard Shortcuts: Ctrl+Shift+/ — open Settings on Shortcuts tab
      if (e.ctrlKey && e.shiftKey && e.key === '/') {
        e.preventDefault();
        setIsSettingsOpen(true);
        setSettingsInitialTab('shortcuts');
        return;
      }
      // Close Tab: Ctrl+W
      if (e.ctrlKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault();
        layoutRef.current?.closeActiveTab();
        return;
      }
      // New SQL File: Ctrl+N
      if (e.ctrlKey && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        layoutRef.current?.createNew('sql');
        return;
      }
      // New Notebook: Ctrl+Shift+N
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        layoutRef.current?.createNew('notebook');
        return;
      }
      // Next Tab: Ctrl+Tab
      if (e.ctrlKey && !e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        layoutRef.current?.navigateTab(1);
        return;
      }
      // Previous Tab: Ctrl+Shift+Tab
      if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        layoutRef.current?.navigateTab(-1);
        return;
      }
      // Toggle AI Assistant: Ctrl+L
      if (e.ctrlKey && !e.shiftKey && e.key === 'l') {
        e.preventDefault();
        setShowAiSidebar(v => !v);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appPhase]);

  // Listen for file system changes from AI tools (e.g., build_notebook)
  useEffect(() => {
    const handleFilesChanged = () => setFileRefreshTrigger(t => t + 1);
    window.addEventListener('amox_files_changed', handleFilesChanged);
    return () => window.removeEventListener('amox_files_changed', handleFilesChanged);
  }, []);

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
          } else if (f.name.endsWith('.sql') || f.name.endsWith('.md')) {
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

  // settingsInitialTab controls which tab opens in SettingsModal
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);

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
        setSettingsInitialTab,
        theme,
        setTheme,

        setUiZoomLevel,
        setEditorSettings,
      }),
    ];
  }, [appPhase, showAiSidebar, theme]);

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

  const handleWorkspaceSelect = useCallback(async (path) => {
    try {
      const response = await fetch('http://localhost:3001/api/project/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await response.json();

      if (response.ok) {
        setProjectPath(data.path);

        // Save to recent projects
        try {
          const RECENT_KEY = 'amoxsql-recent-projects';
          const MAX_RECENT = 5;
          const existing = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
          const filtered = existing.filter(p => p !== data.path);
          filtered.unshift(data.path);
          localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
        } catch (e) { /* ignore localStorage errors */ }

        // 2. Scan for Databases
        try {
          const scanRes = await fetch('http://localhost:3001/api/project/scan-dbs');
          const dbs = await scanRes.json();
          return { success: true, path: data.path, dbs: dbs || [] };
        } catch (scanErr) {
          console.warn("DB Scan failed", scanErr);
          return { success: true, path: data.path, dbs: [] };
        }
      } else {
        toast.error("Failed to open folder: " + data.error);
        return { success: false };
      }
    } catch (err) {
      toast.error("Error opening folder: " + err.message);
      return { success: false };
    }
  }, [toast]);

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
      const type = path.endsWith('.sqlnb') ? 'sqlnb' : path.endsWith('.sqlchain') ? 'sqlchain' : path.endsWith('.md') ? 'md' : 'sql';
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
    const folderName = await dialog.promptAsync({
      title: 'New Folder',
      message: currentPath ? `Create inside /${currentPath}` : 'Create in project root',
      placeholder: 'folder name',
      confirmLabel: 'Create',
    });
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
  }, [dialog, toast]);

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
      if (!filename.endsWith('.md')) {
        contentToSave = `/*\n * Description: ${description}\n */\n\n${contentToSave}`;
      }
    }
    if (!filename.endsWith('.sql') && !filename.endsWith('.sqlnb') && !filename.endsWith('.sqlchain') && !filename.endsWith('.md')) {
      if (pendingSaveTab && pendingSaveTab.type === 'sqlnb') {
        filename += '.sqlnb';
      } else if (pendingSaveTab && pendingSaveTab.type === 'sqlchain') {
        filename += '.sqlchain';
      } else if (pendingSaveTab && pendingSaveTab.type === 'md') {
        filename += '.md';
      } else {
        filename += '.sql';
      }
    }

    const result = await performSave(filename, contentToSave);

    if (result.success) {
      // Notify LayoutManager that the file is now saved with this path
      layoutRef.current?.finishSaveAs(filename);
    }

    return result;
  }, [pendingSaveContent, performSave]);

  const handleExportNotebook = useCallback(async (title, query, markdownContext) => {
    const filename = `AI_Analysis_${Date.now()}.sqlnb`;
    const cells = [
      {
        id: `m_${Date.now()}`,
        type: 'markdown',
        content: `## ${title || 'AI Analysis'}\n\n${markdownContext || 'Generated by AmoxSQL AI.'}`
      },
      {
        id: `c_${Date.now()}`,
        type: 'code',
        content: query || ''
      }
    ];

    try {
      const response = await fetch('http://localhost:3001/api/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filename, content: JSON.stringify(cells, null, 2) })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Tell LayoutManager to open the new notebook
      layoutRef.current?.loadFile(filename);
      setFileRefreshTrigger(t => t + 1);
      toast.success(`Exported to ${filename}`);
    } catch (err) {
      toast.error(`Failed to export notebook: ${err.message}`);
    }
  }, []);

// Removed duplicated handleCloseProject

  const handleSidebarTabClick = (tabId) => {
    // Si la configuración no existe, por defecto es true
    const shouldToggle = editorSettings.toggleSidebarOnActiveTabClick ?? true;
    
    if (activeSidebarTab === tabId && !sidebarCollapsed) {
      if (shouldToggle) {
        setSidebarCollapsed(true);
      }
    } else {
      if (sidebarCollapsed) setSidebarCollapsed(false);
      setActiveSidebarTab(tabId);
    }
  };

  // --- Main Render Logic ---

  if (appPhase === PHASE.WELCOME) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
        <WindowTitleBar
          projectPath=""
          currentDb=""
          readOnly={false}
          onCloseProject={handleCloseProject}
          onSwitchProject={(path) => { setProjectPath(path); setAppPhase(PHASE.WELCOME); }}
        />
        <WelcomeScreen 
          initialPath={projectPath}
          onSelectWorkspace={handleWorkspaceSelect} 
          onStartSession={startIdeSession} 
          onOpenSettings={() => setIsSettingsOpen(true)} 
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentTheme={theme}
          onThemeChange={setTheme}
          currentAccent={accentColor}
          onAccentChange={setAccentColor}
          currentLayout={editorLayout}
          onLayoutChange={setEditorLayout}
          uiZoomLevel={uiZoomLevel}
          onUiZoomChange={setUiZoomLevel}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <WindowTitleBar
        projectPath={projectPath}
        currentDb={currentDb}
        readOnly={dbReadOnly}
        onCloseProject={handleCloseProject}
        onSwitchProject={(path) => { setProjectPath(path); setAppPhase(PHASE.WELCOME); }}
      />

      {/* Command Palette — Global */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={commandPaletteActions}
      />

      {/* Command Palette — Global */}

      {appPhase === PHASE.IDE && (
        <div className="app-container" style={{ height: '100%', display: 'flex' }}>

          {/* Left Panel Card — Activity Bar + Sidebar unified */}
          <div className="left-panel-card">
            <div className="activity-bar">
              <button
                onClick={() => handleSidebarTabClick('files')}
                className={`activity-bar-btn ${activeSidebarTab === 'files' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Explorer (Ctrl+Shift+E)"
              >
                <LuFolder size={20} />
              </button>
              <button
                onClick={() => handleSidebarTabClick('schema')}
                className={`activity-bar-btn ${activeSidebarTab === 'schema' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Database Schema (Ctrl+Shift+D)"
              >
                <LuDatabase size={20} />
              </button>
              <button
                onClick={() => handleSidebarTabClick('extensions')}
                className={`activity-bar-btn ${activeSidebarTab === 'extensions' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Extensions"
              >
                <LuPuzzle size={20} />
              </button>
              <button
                onClick={() => handleSidebarTabClick('dbt')}
                className={`activity-bar-btn ${activeSidebarTab === 'dbt' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="DBT Studio"
              >
                <LuContainer size={20} />
              </button>
              <button
                onClick={() => handleSidebarTabClick('snippets')}
                className={`activity-bar-btn ${activeSidebarTab === 'snippets' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="SQL Snippets"
              >
                <LuCode size={20} />
              </button>
              <button
                onClick={() => handleSidebarTabClick('history')}
                className={`activity-bar-btn ${activeSidebarTab === 'history' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Query History"
              >
                <LuHistory size={20} />
              </button>
              {/* Analysis Vault */}
              <button
                onClick={() => handleSidebarTabClick('vault')}
                className={`activity-bar-btn ${activeSidebarTab === 'vault' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Analysis Vault"
              >
                <LuPackage size={20} />
              </button>

              <div className="activity-bar-spacer" />

              {/* Data Diving toggle */}
              <button
                onClick={() => layoutRef.current?.createNew('datadiving')}
                className="activity-bar-btn"
                title="New Data Diving Session"
              >
                <LuSparkles size={20} />
              </button>

              {/* Execution Chain */}
              <button
                onClick={() => layoutRef.current?.createNew('sqlchain')}
                className="activity-bar-btn"
                title="New Execution Chain"
              >
                <LuLink size={20} />
              </button>

              <div className="activity-bar-separator" />

              <button
                onClick={() => setSidebarCollapsed(prev => !prev)}
                className="activity-bar-collapse-btn"
                title={sidebarCollapsed ? 'Show Sidebar (Ctrl+B)' : 'Hide Sidebar (Ctrl+B)'}
              >
                {sidebarCollapsed ? <LuPanelLeftOpen size={18} /> : <LuPanelLeftClose size={18} />}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="activity-bar-btn activity-bar-btn--bottom"
                title="Settings (Ctrl+,)"
              >
                <LuSettings size={20} />
              </button>
            </div>

            <div className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`} style={sidebarCollapsed ? {} : { width: `${sidebarWidth}px` }}>

            {/* Content Switcher — keep-alive: cada panel se monta en la primera visita
                y permanece montado. display:none/flex controla visibilidad. */}
            {visitedSidebarTabs.has('files') && (
              <div style={{ flex: 1, overflow: 'hidden', display: activeSidebarTab === 'files' ? 'flex' : 'none', flexDirection: 'column' }}>
                <FileExplorer
                  editorSettings={editorSettings}
                  onFileClick={handleFileClick}
                  onFileOpen={handleFileOpen}
                  onNewFile={handleNewFile}
                  onNewFolder={handleNewFolder}
                  onImportFile={handleImportRequest}
                  onQueryFile={(path) => layoutRef.current?.handleQueryFile(path)}
                  onPreviewFile={(path) => layoutRef.current?.handleQueryFile(path)}
                  onEditChart={(path) => layoutRef.current?.handleEditChart(path)}
                  onEditChartWithSql={(path) => layoutRef.current?.handleEditChartWithSql(path)}
                  refreshTrigger={fileRefreshTrigger}
                />
              </div>
            )}

            {visitedSidebarTabs.has('schema') && (
              <div style={{ flex: 1, display: activeSidebarTab === 'schema' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <DatabaseExplorer
                  currentDb={currentDb}
                  onRefresh={refreshDbTrigger}
                  onTablesLoaded={setAvailableTables}
                  onSelectQuery={(query) => layoutRef.current?.createNew('sql', query)}
                  onQualityCheck={(tableName) => setQualityCheckTable(tableName)}
                  onOpenErDiagram={() => layoutRef.current?.createNew('er-diagram')}
                />
              </div>
            )}

            {visitedSidebarTabs.has('extensions') && (
              <div style={{ flex: 1, display: activeSidebarTab === 'extensions' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <ExtensionExplorer />
              </div>
            )}

            {visitedSidebarTabs.has('dbt') && (
              <div style={{ flex: 1, display: activeSidebarTab === 'dbt' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <DbtPanel projectPath={projectPath} onFileOpen={handleFileOpen} />
              </div>
            )}

            {visitedSidebarTabs.has('snippets') && (
              <div style={{ flex: 1, display: activeSidebarTab === 'snippets' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <SnippetsPanel onInsert={(sql) => layoutRef.current?.createNew('sql', sql)} />
              </div>
            )}

            {visitedSidebarTabs.has('history') && (
              <div style={{ flex: 1, display: activeSidebarTab === 'history' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <QueryHistoryPanel onSelect={(sql) => layoutRef.current?.createNew('sql', sql)} />
              </div>
            )}

            {visitedSidebarTabs.has('vault') && (
              <div style={{ flex: 1, display: activeSidebarTab === 'vault' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>}>
                  <AnalysisVault
                    onOpenInEditor={(sql) => {
                      layoutRef.current?.createNew('sql', sql);
                    }}
                    onClose={() => setActiveSidebarTab('files')}
                  />
                </Suspense>
              </div>
            )}
            </div>{/* end .sidebar */}

            {/* Sidebar Resize Handle — inside the card */}
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
          </div>

          {/* Main Content with LayoutManager */}
          <div className="main-content">
            {/* Tab Bar Card — floating, only above editor + AI area, hidden when no tabs */}
            {titleBarTabs && titleBarTabs.tabs.length > 0 && (
              <div className="tab-bar-card">
                <TabBar
                  tabs={titleBarTabs.tabs}
                  activeTabId={titleBarTabs.activeTabId}
                  onTabClick={(id) => {
                    const props = layoutRef.current?.getTabBarProps();
                    if (props) props.onTabClick(id);
                  }}
                  onTabClose={(id) => {
                    const props = layoutRef.current?.getTabBarProps();
                    if (props) props.onTabClose(id);
                  }}
                  paneId={titleBarTabs.paneId}
                  onDragStart={(e, tabId, paneId) => {
                    const props = layoutRef.current?.getTabBarProps();
                    if (props?.onDragStart) props.onDragStart(e, tabId, paneId);
                  }}
                  onReorder={(src, target, paneId) => {
                    const props = layoutRef.current?.getTabBarProps();
                    if (props?.onReorder) props.onReorder(src, target, paneId);
                  }}
                  onCreateNew={(type) => {
                    const props = layoutRef.current?.getTabBarProps();
                    if (props?.onCreateNew) props.onCreateNew(type);
                  }}
                />
              </div>
            )}

            {/* Content Area containing Editor AND AI Sidebar */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'hidden', display: 'block' }}>
                <LayoutManager
                  ref={layoutRef}
                  projectPath={projectPath}
                  theme={theme}
                  editorLayout={editorLayout}
                  editorSettings={mergedEditorSettings}
                  onDbChange={() => setRefreshDbTrigger(p => p + 1)}
                  onRequestSaveAs={(content, tab) => {
                    setPendingSaveContent(content);
                    setPendingSaveTab(tab);
                    setIsSaveModalOpen(true);
                  }}
                  onQueryResult={() => {}}
                  showAiSidebar={showAiSidebar}
                  onToggleAi={() => setShowAiSidebar(v => !v)}
                  onTabsChange={(tabData) => {
                    setTitleBarTabs(tabData);
                    // Update active tab info for AI assistant
                    const info = layoutRef.current?.getActiveTabInfo();
                    setActiveTabInfo(info || null);
                  }}
                  availableTables={availableTables}
                  onExportNotebook={handleExportNotebook}
                  onShowHistorySidebar={() => {
                    setSidebarCollapsed(false);
                    setActiveSidebarTab('history');
                  }}
                />
              </div>

              {/* Right Panel: AI Assistant (sidebar) or Data Diving (full screen) */}
              <div style={{
                width: showAiSidebar ? `${aiPanelWidth}px` : '0px',
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: 'auto',
                opacity: showAiSidebar ? 1 : 0,
                overflow: 'hidden',
                transition: 'width 0.2s ease, opacity 0.2s ease',
                pointerEvents: showAiSidebar ? 'auto' : 'none',
                margin: showAiSidebar ? '6px 8px 6px 0' : '0',
                borderRadius: 'var(--radius-lg)',
                border: showAiSidebar ? '1px solid var(--border-subtle)' : 'none',
                boxShadow: 'none',
                position: 'relative',
              }}>
                <AiAssistantPanel
                  activeFilePath={activeTabInfo?.path || null}
                  activeFileType={activeTabInfo?.type || null}
                  activeFileContent={activeTabInfo?.content || null}
                  activeResult={activeTabInfo?.results || null}
                  activeChartConfig={activeTabInfo?.chartConfig || null}
                  onEditFile={(result) => layoutRef.current?.updateActiveContent(result.content || result)}
                    onUpdateChartConfig={(result) => layoutRef.current?.updateActiveChartConfig(result.changes || result)}
                    onAppendToFile={(sql) => layoutRef.current?.appendToActiveContent(sql)}
                    onRunSql={(sql) => layoutRef.current?.createNew('sql', sql)}
                    onClose={() => setShowAiSidebar(false)}
                    availableTables={availableTables}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onResize={setAiPanelWidth}
                    panelWidth={aiPanelWidth}
                    onOpenDataDiving={(convId) => layoutRef.current?.createNew('datadiving', convId)}
                  />
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Ultra-Heavy Modals: Lazy Loaded to prevent V8 main-thread locking on boot */}
      <Suspense fallback={null}>

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => { setIsSettingsOpen(false); setSettingsInitialTab(null); }}
          currentTheme={theme}
          onThemeChange={setTheme}
          currentAccent={accentColor}
          onAccentChange={setAccentColor}
          currentLayout={editorLayout}
          onLayoutChange={setEditorLayout}
          editorSettings={mergedEditorSettings}
          onEditorSettingsChange={(updates) => setEditorSettings(prev => ({ ...prev, ...updates }))}
          initialTab={settingsInitialTab}
          onTabReset={() => setSettingsInitialTab(null)}
          uiZoomLevel={uiZoomLevel}
          onUiZoomChange={setUiZoomLevel}
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
          initialName={pendingSaveTab?.name?.replace(/^Edit: /, '') || ''}
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
          dbPath={currentDb}
          readOnly={dbReadOnly}
          refreshTrigger={refreshDbTrigger}
        />
      </Suspense>

    </div>
  );
}

export default App;
