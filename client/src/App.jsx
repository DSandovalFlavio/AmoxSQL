/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
import { useState, useRef, useEffect } from 'react';
import FileExplorer from './components/FileExplorer';
import DatabaseExplorer from './components/DatabaseExplorer';
import SaveQueryModal from './components/SaveQueryModal';
import ImportModal from './components/ImportModal';
import ImportExcelModal from './components/ImportExcelModal';
import LayoutManager from './components/LayoutManager';

// New Components
import WelcomeScreen from './components/WelcomeScreen';
import ProjectInfo from './components/ProjectInfo';
import DatabaseSelectionModal from './components/DatabaseSelectionModal';
import AiSidebar from './components/AiSidebar';


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

  // Initialize Data
  useEffect(() => {
    setAppPhase(PHASE.WELCOME);
  }, []);

  /* --- Project Workflow Handlers --- */

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
    return <WelcomeScreen onOpenProject={handleOpenProject} />;
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
        <div className="app-container" style={{ height: '100%' }}>
          <div className="sidebar" style={{ width: '280px', display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* Top Section: Project Info - Auto Height */}
            <ProjectInfo
              projectPath={projectPath}
              currentDb={currentDb}
              readOnly={dbReadOnly}
              onCloseProject={handleCloseProject}
            />

            <div style={{ height: '1px', backgroundColor: '#2C2E33', margin: '0 20px 10px 20px' }}></div>

            {/* Files - Flex 1 (approx 2/7 of total) */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <FileExplorer
                onFileClick={handleFileClick}
                onFileOpen={handleFileOpen}
                onNewFile={handleNewFile}
                onNewFolder={handleNewFolder}
                onImportFile={handleImportRequest}
                onQueryFile={(path) => layoutRef.current?.handleQueryFile(path)}
              />
            </div>

            {/* Database - Flex 2 (approx 4/7 of total) */}
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <DatabaseExplorer
                currentDb={currentDb}
                onRefresh={refreshDbTrigger}
                onTablesLoaded={setAvailableTables}
              />
            </div>
          </div>

          {/* Main Content with LayoutManager */}
          <div className="main-content">
            {/* Global Toolbar can drive LayoutManager */}
            <div className="toolbar">
              <div className="toolbar-left">
                <button onClick={() => layoutRef.current?.handleTriggerRun()} title="Run Active (Ctrl+Enter)">Run</button>
                <button onClick={() => layoutRef.current?.handleTriggerSave()} style={{ backgroundColor: '#2f425f', color: '#fff' }}>Save</button>
                <div style={{ width: '1px', height: '20px', backgroundColor: '#333', margin: '0 5px' }}></div>
                <button
                  onClick={() => layoutRef.current?.handleTriggerAnalyze()}
                  title="Analyze Query Plan"
                  style={{ backgroundColor: 'transparent', color: '#d0b0ff', border: '1px solid #d0b0ff' }}
                >
                  Analyze
                </button>
                <div style={{ width: '1px', height: '20px', backgroundColor: '#333', margin: '0 5px' }}></div>
                <button
                  onClick={() => setShowAiSidebar(!showAiSidebar)}
                  style={{ backgroundColor: showAiSidebar ? '#1A1B1E' : 'transparent', color: '#00ffff', border: '1px solid #00ffff' }}
                  title="Toggle AI Assistant"
                >
                  {showAiSidebar ? 'Close AI' : '🤖 AI Assistant'}
                </button>
              </div>
              <div style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>AmoxSQL v1.0</div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              <LayoutManager
                ref={layoutRef}
                projectPath={projectPath}
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
            />
          )}

        </div>
      )}


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
