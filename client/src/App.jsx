/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
import { useState, useRef, useEffect } from 'react';
import FileExplorer from './components/FileExplorer';
import DatabaseExplorer from './components/DatabaseExplorer';
import ExtensionExplorer from './components/ExtensionExplorer';
import SaveQueryModal from './components/SaveQueryModal';
import ImportModal from './components/ImportModal';
import ImportExcelModal from './components/ImportExcelModal';
import LayoutManager from './components/LayoutManager';

// New Components
import WelcomeScreen from './components/WelcomeScreen';
import ProjectInfo from './components/ProjectInfo';
import DatabaseSelectionModal from './components/DatabaseSelectionModal';
import AiSidebar from './components/AiSidebar';


import SettingsModal from './components/SettingsModal';
import { LuBot, LuX, LuPlay, LuSave, LuActivity, LuSettings, LuFolder, LuDatabase, LuFilePlus, LuPuzzle } from "react-icons/lu";

import './index.css';

// App Phases
const PHASE = {
  WELCOME: 'WELCOME',
  SELECTING_DB: 'SELECTING_DB',
  IDE: 'IDE'
};

function App() {
  const [appPhase, setAppPhase] = useState(PHASE.WELCOME);

  const layoutRef = useRef(null);

  // File Management State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSaveContent, setPendingSaveContent] = useState('');

  // Database State
  const [currentDb, setCurrentDb] = useState(':memory:');
  const [dbReadOnly, setDbReadOnly] = useState(false);
  const [refreshDbTrigger, setRefreshDbTrigger] = useState(0);

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
  const [availableTables, setAvailableTables] = useState([]);

  // Sidebar Architecture State
  const [activeSidebarTab, setActiveSidebarTab] = useState('files'); // 'files', 'schema', or 'extensions'

  /* --- Project Workflow Handlers --- */

  // Theme State
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('cyan'); // 'cyan' | 'linear' | 'amox-2' .. 'amox-10'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Apply Theme & Accent Classes
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [theme]);

  useEffect(() => {
    // Remove all accent classes first
    const classes = [...document.body.classList].filter(c => c.startsWith('accent-'));
    classes.forEach(c => document.body.classList.remove(c));
    // Apply new accent class (cyan = default, no class needed)
    if (accentColor !== 'cyan') {
      document.body.classList.add(`accent-${accentColor}`);
    }
  }, [accentColor]);

  // Initialize Data
  useEffect(() => {
    setAppPhase(PHASE.WELCOME);
  }, []);

  const handleOpenProject = async (path) => {
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
        alert("Failed to open folder: " + data.error);
      }
    } catch (err) {
      alert("Error opening folder: " + err.message);
    }
  };

  const startIdeSession = async (dbPath, readOnly) => {
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
          alert("Connect failed. Starting in memory.");
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
  };

  const handleDbSelection = (selection) => {
    startIdeSession(selection.path, selection.readOnly);
  };

  const handleCloseProject = () => {
    // Reset everything to Welcome State
    setAppPhase(PHASE.WELCOME);
    setProjectPath('');
  };

  /* --- File Handlers --- */
  const handleFileClick = (path) => {
    // Ideally this is handled by LayoutManager if it's already open?
    // But we need to switch tabs. LayoutManager.openFile handles both open and focus.
    // We assume file click means "Open/Focus". 
    // BUT FileExplorer usually provides just path. We need CONTENT to open a file.
    handleFileOpen(path);
  };

  const handleFileOpen = async (path) => {
    try {
      const response = await fetch(`http://localhost:3001/api/file?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // determine type
      const type = path.endsWith('.sqlnb') ? 'sqlnb' : 'sql';
      layoutRef.current?.openFile(path, data.content, type);

    } catch (err) {
      alert(`Failed to open file: ${err.message}`);
    }
  };

  const handleImportRequest = (filePath, isFolder = false) => {
    setImportTargetFile(filePath);
    setImportIsFolder(isFolder);

    // Check for Excel
    if (!isFolder && (filePath.toLowerCase().endsWith('.xlsx') || filePath.toLowerCase().endsWith('.xls'))) {
      setIsExcelImportModalOpen(true);
    } else {
      setIsImportModalOpen(true);
    }
  };

  const performImport = async (tableName, cleanColumns, overridePath = null) => {
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
  };



  const performExcelImport = async (config) => {
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
  };

  const handleNewFile = async (currentPath, type = 'sql') => {
    layoutRef.current?.createNew(type);
  };

  const handleNewFolder = async (currentPath) => {
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
      alert("Folder created! Refreshing...");
    } catch (err) {
      alert(`Failed to create folder: ${err.message}`);
    }
  };

  const performSave = async (filePath, content) => {
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
  };

  const handleSaveAs = async (filename, description) => {
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
  };

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
        />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>

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
          <div className="activity-bar" style={{ width: '48px', backgroundColor: 'var(--surface-base)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '12px', zIndex: 10 }}>
            <button
              onClick={() => setActiveSidebarTab('files')}
              style={{ background: 'transparent', border: 'none', color: activeSidebarTab === 'files' ? 'var(--accent-primary)' : 'var(--text-tertiary)', padding: '10px 0', cursor: 'pointer', width: '100%', borderLeft: activeSidebarTab === 'files' ? '2px solid var(--accent-primary)' : '2px solid transparent', transition: 'color var(--transition-fast)' }}
              title="Explorer"
            >
              <LuFolder size={20} />
            </button>
            <button
              onClick={() => setActiveSidebarTab('schema')}
              style={{ background: 'transparent', border: 'none', color: activeSidebarTab === 'schema' ? 'var(--accent-primary)' : 'var(--text-tertiary)', padding: '10px 0', marginTop: '4px', cursor: 'pointer', width: '100%', borderLeft: activeSidebarTab === 'schema' ? '2px solid var(--accent-primary)' : '2px solid transparent', transition: 'color var(--transition-fast)' }}
              title="Database Schema"
            >
              <LuDatabase size={20} />
            </button>
            <button
              onClick={() => setActiveSidebarTab('extensions')}
              style={{ background: 'transparent', border: 'none', color: activeSidebarTab === 'extensions' ? 'var(--accent-primary)' : 'var(--text-tertiary)', padding: '10px 0', marginTop: '4px', cursor: 'pointer', width: '100%', borderLeft: activeSidebarTab === 'extensions' ? '2px solid var(--accent-primary)' : '2px solid transparent', transition: 'color var(--transition-fast)' }}
              title="Extensions"
            >
              <LuPuzzle size={20} />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="Settings"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', padding: '10px 0', marginTop: 'auto', marginBottom: '12px', cursor: 'pointer', width: '100%', transition: 'color var(--transition-fast)' }}
            >
              <LuSettings size={20} />
            </button>
          </div>

          <div className="sidebar" style={{ width: '280px', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--surface-raised)', borderRight: '1px solid var(--border-subtle)' }}>

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
                />
              </div>
            )}

            {activeSidebarTab === 'extensions' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ExtensionExplorer />
              </div>
            )}
          </div>

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
                  title="Analyze Query Plan"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-primary)' }}
                >
                  <LuActivity size={14} /> Analyze
                </button>
                <button onClick={() => layoutRef.current?.handleTriggerSave()} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <LuSave size={14} /> Save
                </button>
                <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-default)', margin: '0 4px' }}></div>
                <button
                  onClick={() => layoutRef.current?.createNew('sql')}
                  title="Create New SQL Query"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                >
                  <LuFilePlus size={14} /> New SQL
                </button>
                <button
                  onClick={() => layoutRef.current?.createNew('notebook')}
                  title="Create New Analytics Notebook"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                >
                  <LuFilePlus size={14} /> New Notebook
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
                onDbChange={() => setRefreshDbTrigger(p => p + 1)}
                onRequestSaveAs={(content) => {
                  setPendingSaveContent(content);
                  setIsSaveModalOpen(true);
                }}
              />
            </div>
          </div>
          {/* Right Sidebar: AI Assistant */}
          {showAiSidebar && (
            <AiSidebar
              width="350px"
              onClose={() => setShowAiSidebar(false)}
              availableTables={availableTables}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

        </div>
      )}


      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={theme}
        onThemeChange={setTheme}
        currentAccent={accentColor}
        onAccentChange={setAccentColor}
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
    </div>
  );
}

export default App;
