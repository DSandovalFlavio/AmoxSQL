/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
import { API_BASE } from './api.js';
import { themeClassFor, modeClassFor } from './theme.js';
import { syncMonacoTheme } from './monacoTheme.js';
import { useState, useRef, useEffect, Suspense, lazy, useCallback, useMemo } from 'react';
import FileExplorer from './components/FileExplorer';
import DatabaseExplorer from './components/DatabaseExplorer';
import ExtensionExplorer from './components/ExtensionExplorer';
import SnippetsPanel from './components/SnippetsPanel';
import DbtPanel from './components/DbtPanel';
import GitPanel from './components/GitPanel';
import QueryHistoryPanel from './components/QueryHistoryPanel';
import SaveQueryModal from './components/SaveQueryModal';
import ImportModal from './components/ImportModal';
import ImportExcelModal from './components/ImportExcelModal';
import LayoutManager from './components/LayoutManager';

// New Components
import WelcomeScreen from './components/WelcomeScreen';
import WorkspaceWizard from './components/WorkspaceWizard';
import AiAssistantPanel from './components/ai/AiAssistantPanel';
import AiDivingPanel from './components/ai/AiDivingPanel';
import ConversationList from './components/ai/ConversationList';
// StatusBar removed — info redundant with ResultsTable + WindowTitleBar
import CommandPalette, { buildDefaultActions } from './components/CommandPalette';
import { useToast } from './components/ToastProvider';
import { useDialog } from './components/dialogs/DialogProvider';
import WindowTitleBar from './components/WindowTitleBar';
import TabBar from './components/TabBar';

// Ultra-heavy lazy loaded Modals (Zero Cost Startup)
// KeyboardShortcutsModal removed — shortcuts now integrated in SettingsModal
const DataQualityModal    = lazy(() => import('./components/DataQualityModal'));
const SchemaDiffModal     = lazy(() => import('./components/SchemaDiffModal'));
const SettingsModal       = lazy(() => import('./components/SettingsModal'));
const ChartGalleryModal   = lazy(() => import('./components/ChartGalleryModal'));
import { LuBot, LuX, LuPlay, LuSave, LuActivity, LuSettings, LuFolder, LuDatabase, LuFilePlus, LuPuzzle, LuCode, LuHistory, LuPanelLeftClose, LuPanelLeftOpen, LuLink, LuContainer, LuFileText, LuSparkles, LuPackage, LuZap, LuLayoutGrid, LuGitBranch, LuSquareFunction, LuPencil, LuClipboardCopy, LuFolderOpen, LuArrowLeftRight, LuCopyPlus, LuUnlink } from "react-icons/lu";
const AnalysisVault = lazy(() => import('./components/ai/AnalysisVault'));
// Lazy: pulls react-markdown (for the curated docs' GFM tables) into its own chunk.
const FunctionReference   = lazy(() => import('./components/FunctionReference'));
import OnboardingHost from './components/onboarding/OnboardingHost';
import { openTour, hasSeenTour } from './components/onboarding/tourRegistry';

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
  // Read by stable (deps-less) callbacks below that need the LATEST tab
  // metadata without becoming unstable themselves every time a tab changes.
  const titleBarTabsRef = useRef(null);
  titleBarTabsRef.current = titleBarTabs;

  // Tab context menu — {x, y, tabId, paneId}. Rendered here (not inside
  // TabBar) so TabBar's memo isn't defeated by menu-open re-renders.
  const [tabContextMenu, setTabContextMenu] = useState(null);

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


  // Workspace Wizard — shown after first open of a new project
  const [showWorkspaceWizard, setShowWorkspaceWizard] = useState(false);

  // Chart Gallery Modal
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Sidebar Architecture State
  const [activeSidebarTab, setActiveSidebarTab] = useState('files'); // 'files', 'schema', 'extensions', 'aifunctions', etc.
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
  // Live drag preview mutates these elements' style.width directly; React
  // state commits ONCE on mouseup (a setState per mousemove re-rendered App
  // — and with it the whole IDE — on every pixel of drag).
  const sidebarElRef = useRef(null);
  const aiPanelOuterRef = useRef(null);
  const aiPanelInnerRef = useRef(null);
  const previewAiPanelWidth = useCallback((w) => {
    if (aiPanelOuterRef.current) aiPanelOuterRef.current.style.width = `${w}px`;
    if (aiPanelInnerRef.current) aiPanelInnerRef.current.style.width = `${w}px`;
  }, []);

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

  /* --- Project Workflow Handlers --- */

  // Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('amoxsql-theme') || 'dark');
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('amoxsql-accent') || 'cyan'); // 'cyan' | 'linear' | 'amox-2' .. 'amox-10'
  // Luminosidad del acento. null = sin personalizar, se usa la L propia del preset.
  // Guardarla como null en vez de un número evita aplanar la rampa amox-2..amox-10,
  // que varía L y tono a la vez: cada preset conserva su identidad hasta que el
  // usuario decide apartarse de ella.
  const [accentL, setAccentL] = useState(() => {
    const v = parseFloat(localStorage.getItem('amoxsql-accent-l'));
    return Number.isFinite(v) ? v : null;
  });
  // L efectiva (la del override si lo hay, si no la propia del preset). Se calcula
  // aquí y no en el modal de ajustes: React corre los efectos de hijo ANTES que
  // los del padre, así que el modal leería el estilo calculado antes de que este
  // componente hubiera cambiado la clase o quitado el override — y mostraría el
  // valor anterior.
  const [effectiveAccentL, setEffectiveAccentL] = useState(0.73);
  // Resplandor del fondo: esquina y fuerza.
  const [glowCorner, setGlowCorner] = useState(() => localStorage.getItem('amoxsql-glow-corner') || 'tl');
  const [glowStrength, setGlowStrength] = useState(() => {
    const v = parseInt(localStorage.getItem('amoxsql-glow-strength'), 10);
    return Number.isFinite(v) ? v : 30;
  });
  // Cambiar de preset devuelve el slider a la L propia de ese acento. Se hace en
  // el manejador y NO en un efecto sobre accentColor: en StrictMode los efectos
  // corren dos veces al montar y la segunda pasada borraba la preferencia
  // guardada. Atarlo a la acción del usuario en vez de al ciclo de vida lo evita.
  const handleAccentChange = useCallback((id) => {
    setAccentColor(id);
    setAccentL(null);
  }, []);
  const [interfaceFont, setInterfaceFont] = useState(() => localStorage.getItem('amoxsql-ui-font') || 'manrope'); // interface font (separate from editor font)
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

  // Tell main.js the current project root, so exported files (chart PNG,
  // HTML/Word/PPT reports) default their Save As dialog into this project's
  // charts/ or reports/ folder instead of the OS Downloads folder.
  useEffect(() => {
    if (projectPath && window.electronAPI?.setProjectRoot) {
      window.electronAPI.setProjectRoot(projectPath);
    }
  }, [projectPath]);

  // Toast + "Reveal in Explorer" once an export finishes saving.
  useEffect(() => {
    if (!window.electronAPI?.onDownloadCompleted) return;
    return window.electronAPI.onDownloadCompleted(({ path: savedPath, filename }) => {
      toast.success(`Guardado: ${filename}`, {
        action: window.electronAPI?.showItemInFolder
          ? { label: 'Revelar en el explorador', onClick: () => window.electronAPI.showItemInFolder(savedPath) }
          : undefined,
      });
    });
  }, [toast]);

  const [editorSettings, setEditorSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('amoxsql-editor-settings');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  // Memoized so its identity is stable across re-renders — otherwise a new object
  // every render would re-render every consumer (LayoutManager/editor) on each nav.
  const mergedEditorSettings = useMemo(() => ({
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    minimap: false,
    wordWrap: 'off',
    lineNumbers: 'on',
    tabSize: 4,
    resultsFontSize: 13,
    showRowNumbers: true,
    stickyRowNumbers: true,
    defaultViewMode: 'table',
    mouseWheelZoom: true,
    bracketPairColorization: true,
    renderWhitespace: 'none',
    smoothScrolling: false,
    cursorStyle: 'line',
    cursorBlinking: 'blink',
    formatOnSave: false,
    formatOnPaste: false,
    markdownDefaultView: 'edit',
    markdownToolbarVisible: true,
    showWelcomeOnStart: true,
    confirmBeforeDrop: true,
    queryResultLimit: 10000,
    autoSaveInterval: 0,
    ...editorSettings,
  }), [editorSettings]);

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

  // Apply Theme & Mode Classes
  useEffect(() => {
    localStorage.setItem('amoxsql-theme', theme);
    // Remove all theme classes first
    const themeClasses = ['light-theme', 'theme-onyx', 'theme-amoxdark', 'theme-ayu', 'theme-nord', 'theme-islands', 'theme-sterlingdark', 'theme-sterlingdeep', 'theme-ivory', 'theme-mist', 'theme-amoxlight', 'theme-sterlinglight'];
    themeClasses.forEach(c => document.body.classList.remove(c));
    document.body.classList.remove('mode-light', 'mode-dark');
    // Theme class carries per-theme surfaces (dark/obsidian = default, no class)
    const themeClass = themeClassFor(theme);
    if (themeClass) document.body.classList.add(themeClass);
    // Mode class carries everything that only depends on light-vs-dark, so that
    // ivory/mist/snow (which have their OWN theme class, not `.light-theme`)
    // still receive the light scrollbars, editor chrome, feedback ramps, etc.
    document.body.classList.add(modeClassFor(theme));
    // Re-theme Monaco from the now-current tokens (single `amox` theme, global).
    syncMonacoTheme();
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
    // The accent changes --accent-primary → re-theme Monaco (cursor/highlight).
    syncMonacoTheme();
  }, [accentColor]);

  // Luminosidad del acento. Se aplica como estilo inline sobre body para ganarle
  // a la clase .accent-*; al quitarla reaparece la L propia del preset.
  // Depende también de accentColor: al cambiar de preset sin override activo, la
  // L efectiva cambia aunque accentL siga siendo null. Va declarado DESPUÉS del
  // efecto del acento, así que la clase ya está puesta cuando se lee.
  useEffect(() => {
    if (accentL == null) {
      document.body.style.removeProperty('--acc-l');
      localStorage.removeItem('amoxsql-accent-l');
    } else {
      document.body.style.setProperty('--acc-l', String(accentL));
      localStorage.setItem('amoxsql-accent-l', String(accentL));
    }
    const v = parseFloat(getComputedStyle(document.body).getPropertyValue('--acc-l'));
    setEffectiveAccentL(Number.isFinite(v) ? v : 0.73);
    syncMonacoTheme();
  }, [accentL, accentColor]);

  // Esquina del resplandor del fondo.
  useEffect(() => {
    localStorage.setItem('amoxsql-glow-corner', glowCorner);
    [...document.body.classList].filter(c => c.startsWith('glow-')).forEach(c => document.body.classList.remove(c));
    document.body.classList.add(`glow-${glowCorner}`);
  }, [glowCorner]);

  // Fuerza del resplandor. Se escribe --glow-strength-user (no el efectivo), para
  // que el modo claro pueda seguir escalándolo y no se ensucie el fondo.
  useEffect(() => {
    localStorage.setItem('amoxsql-glow-strength', String(glowStrength));
    document.body.style.setProperty('--glow-strength-user', `${glowStrength}%`);
  }, [glowStrength]);

  useEffect(() => {
    localStorage.setItem('amoxsql-editor-layout', editorLayout);
  }, [editorLayout]);

  // Apply interface font (separate from the code editor font, which uses --font-mono)
  useEffect(() => {
    localStorage.setItem('amoxsql-ui-font', interfaceFont);
    const FAMILIES = {
      manrope: "'Manrope', system-ui, sans-serif",
      inter: "'Inter', system-ui, sans-serif",
      lato: "'Lato', system-ui, sans-serif",
      'ibm-plex': "'IBM Plex Sans', system-ui, sans-serif",
      'space-grotesk': "'Space Grotesk', system-ui, sans-serif",
      lora: "'Lora', Georgia, serif",
      system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    };
    document.documentElement.style.setProperty('--font-sans', FAMILIES[interfaceFont] || FAMILIES.manrope);
  }, [interfaceFont]);

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

      // Command Palette: Ctrl+K — alias visible del Ctrl+Shift+P de siempre.
      // Es el atajo que anuncia el omnibox de la barra, y el que hace que la
      // paleta deje de ser un secreto de teclado.
      if (e.ctrlKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
        return;
      }
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
      // Toggle Split View: Ctrl+\
      if (e.ctrlKey && !e.shiftKey && e.key === '\\') {
        e.preventDefault();
        layoutRef.current?.toggleSplit();
        return;
      }
      // Duplicate active tab to the other pane: Ctrl+Shift+\ — the "compare
      // a variant of this query" gesture, paired with Ctrl+\ (toggle split).
      if (e.ctrlKey && e.shiftKey && e.key === '|') {
        e.preventDefault();
        layoutRef.current?.duplicateActiveTabToOtherPane();
        return;
      }
      // Run both panes: Ctrl+Shift+R. NOT Ctrl+Shift+Enter — SqlNotebook
      // already owns that globally for "Run All Cells" (its own window
      // keydown listener, fires whenever any notebook tab is mounted), and
      // window-level listeners don't stop each other via preventDefault.
      if (e.ctrlKey && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        layoutRef.current?.runBothPanes();
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

  // Listen for gallery chart open requests (from Settings > Chart Gallery)
  useEffect(() => {
    const handler = async (e) => {
      const { path: chartPath, readOnly } = e.detail;
      try {
        const res = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(chartPath)}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        layoutRef.current?.openFile(chartPath, data.content, 'amoxvis', { readOnly });
      } catch (err) {
        console.error('[Gallery] Failed to open chart:', err);
      }
    };
    window.addEventListener('amox_open_gallery_chart', handler);
    return () => window.removeEventListener('amox_open_gallery_chart', handler);
  }, []);

  // Listen for "Open Workspace Wizard" event from SettingsModal
  useEffect(() => {
    const handler = () => setShowWorkspaceWizard(true);
    window.addEventListener('amox_open_workspace_wizard', handler);
    return () => window.removeEventListener('amox_open_workspace_wizard', handler);
  }, []);

  // Open the AI panel when something requests a prompt (e.g. "Optimize with AI" from the
  // query plan). The AiAssistantPanel prefills the composer from the same event.
  useEffect(() => {
    const handler = () => setShowAiSidebar(true);
    window.addEventListener('amox_ai_prompt', handler);
    return () => window.removeEventListener('amox_ai_prompt', handler);
  }, []);

  // settingsInitialTab controls which tab opens in SettingsModal
  const [settingsInitialTab, setSettingsInitialTab] = useState(null);

  // AI skill activation from Command Palette — opens AI panel and dispatches skill event
  const handleActivateSkill = useCallback((skillId) => {
    setShowAiSidebar(true);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('amox_activate_skill', { detail: { skillId } }));
    }, 100);
  }, [setShowAiSidebar]);

  // Command Palette actions
  // Stable TabBar handler sets (per pane): inline arrows here re-created on
  // every App render would defeat memo(TabBar). All of them delegate to the
  // imperative LayoutManager API via layoutRef, so they can be identity-stable.
  const makeTabBarHandlers = useCallback((pane) => ({
    onTabClick: (id) => {
      const p = layoutRef.current?.getTabBarProps(pane);
      if (p) p.onTabClick(id);
    },
    onTabClose: (id) => {
      const p = layoutRef.current?.getTabBarProps(pane);
      if (p) p.onTabClose(id);
    },
    onDragStart: (e, tabId, paneId) => {
      const p = layoutRef.current?.getTabBarProps(pane);
      if (p?.onDragStart) p.onDragStart(e, tabId, pane ?? paneId);
    },
    onReorder: (src, target, paneId) => {
      const p = layoutRef.current?.getTabBarProps(pane);
      if (p?.onReorder) p.onReorder(src, target, pane ?? paneId);
    },
    onCreateNew: (type) => {
      const p = layoutRef.current?.getTabBarProps(pane);
      if (p?.onCreateNew) p.onCreateNew(type);
    },
    onTabContextMenu: (e, tabId, paneId) => {
      setTabContextMenu({ x: e.clientX, y: e.clientY, tabId, paneId: pane ?? paneId });
    },
    onTabRename: (tabId) => requestTabRename(tabId),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const leftTabBarHandlers = useMemo(() => makeTabBarHandlers('left'), [makeTabBarHandlers]);
  const rightTabBarHandlers = useMemo(() => makeTabBarHandlers('right'), [makeTabBarHandlers]);
  const singleTabBarHandlers = useMemo(() => makeTabBarHandlers(undefined), [makeTabBarHandlers]);

  // Tab metadata lookup for the context menu — reads the LATEST tabs via the
  // ref above, not the closed-over `titleBarTabs`, so this stays a stable
  // dependency for `requestTabRename` below (referenced from the deps-less
  // `makeTabBarHandlers`, which must never go stale).
  const findTabMeta = useCallback((tabId) => {
    const tbt = titleBarTabsRef.current;
    if (!tbt) return null;
    return tbt.left?.tabs.find(t => t.id === tabId) || tbt.right?.tabs.find(t => t.id === tabId) || null;
  }, []);

  // Shared by the context menu's "Renombrar" item AND double-clicking a tab
  // label. An unsaved tab (no path yet) has nothing on disk to rename —
  // redirect straight to Save As instead.
  const requestTabRename = useCallback(async (tabId) => {
    const meta = findTabMeta(tabId);
    if (!meta) return;
    if (!meta.path) {
      layoutRef.current?.requestSaveAsForTab(tabId);
      return;
    }
    const newName = await dialog.promptAsync({
      title: 'Renombrar archivo',
      message: `Nuevo nombre para "${meta.name}"`,
      defaultValue: meta.name,
      validate: (v) => (!v.trim() ? 'El nombre no puede estar vacío' : null),
    });
    if (!newName || newName.trim() === meta.name) return;
    const result = await layoutRef.current?.renameTab(tabId, newName.trim());
    if (result && !result.success) {
      toast.error(`No se pudo renombrar: ${result.error}`);
    }
  }, [findTabMeta, dialog, toast]);

  // Dismiss the tab context menu on outside click / scroll — same pattern as
  // ResultsTable's column context menu.
  useEffect(() => {
    if (!tabContextMenu) return;
    const dismiss = () => setTabContextMenu(null);
    window.addEventListener('click', dismiss);
    window.addEventListener('contextmenu', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('contextmenu', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [tabContextMenu]);

  const handleTabMenuAction = (action) => {
    const menu = tabContextMenu;
    setTabContextMenu(null);
    if (!menu) return;
    const { tabId, paneId } = menu;
    const meta = findTabMeta(tabId);

    switch (action) {
      case 'rename':
        requestTabRename(tabId);
        break;
      case 'save':
        layoutRef.current?.saveTab(tabId);
        break;
      case 'saveAs':
        layoutRef.current?.requestSaveAsForTab(tabId);
        break;
      case 'copyPath':
        if (meta?.path) navigator.clipboard.writeText(meta.path);
        break;
      case 'reveal': {
        if (meta?.path && window.electronAPI?.showItemInFolder) {
          const base = projectPath.replace(/\\/g, '/').replace(/\/+$/, '');
          window.electronAPI.showItemInFolder(`${base}/${meta.path}`);
        }
        break;
      }
      case 'moveToOtherPane':
        layoutRef.current?.moveTabToOtherPane(tabId);
        break;
      case 'duplicate':
        layoutRef.current?.duplicateTabToOtherPane(tabId);
        break;
      case 'close': {
        const p = layoutRef.current?.getTabBarProps(paneId);
        if (p) p.onTabClose(tabId);
        break;
      }
      case 'closeOthers':
        layoutRef.current?.closeOtherTabs(tabId);
        break;
      case 'closeToRight':
        layoutRef.current?.closeTabsToRight(tabId);
        break;
      case 'closeAll':
        layoutRef.current?.closeAllTabsInPane(paneId);
        break;
      default:
        break;
    }
  };

  const handleSwitchProject = useCallback((path) => {
    setProjectPath(path);
    setAppPhase(PHASE.WELCOME);
  }, []);

  const handleCloseCommandPalette = useCallback(() => setIsCommandPaletteOpen(false), []);

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
        onActivateSkill: handleActivateSkill,
      }),
    ];
  }, [appPhase, showAiSidebar, theme, handleActivateSkill]);

  // Global first-run onboarding: orient brand-new users on their first IDE
  // session. Delayed slightly so the layout settles before the tour appears.
  useEffect(() => {
    if (appPhase !== PHASE.IDE || hasSeenTour('getting-started')) return;
    const t = setTimeout(() => openTour('getting-started'), 500);
    return () => clearTimeout(t);
  }, [appPhase]);

  // Warm heavy lazy modals during idle so their first open is instant (not a
  // chunk download). Cheap, non-blocking — deferred to requestIdleCallback.
  useEffect(() => {
    if (appPhase !== PHASE.IDE) return;
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const id = idle(() => { import('./components/SettingsModal'); });
    return () => { (window.cancelIdleCallback || clearTimeout)(id); };
  }, [appPhase]);

  const startIdeSession = useCallback(async (dbPath, readOnly) => {
    // 1. Configure DB
    if (dbPath === ':memory:') {
      await fetch(`${API_BASE}/api/db/close`, { method: 'POST' });
      setCurrentDb(':memory:');
      setDbReadOnly(false);
    } else {
      // Ensure clean slate
      await fetch(`${API_BASE}/api/db/close`, { method: 'POST' });
      await new Promise(r => setTimeout(r, 200));

      try {
        const response = await fetch(`${API_BASE}/api/db/connect`, {
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

    // 3. Check if workspace wizard should be shown (new/empty project)
    try {
      const statusRes = await fetch(`${API_BASE}/api/project/scaffold-status`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.isNewProject && !statusData.wizardCompleted) {
          setShowWorkspaceWizard(true);
        }
      }
    } catch { /* non-critical, ignore */ }
  }, [toast]);

  const handleWorkspaceSelect = useCallback(async (path) => {
    try {
      const response = await fetch(`${API_BASE}/api/project/open`, {
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
          const scanRes = await fetch(`${API_BASE}/api/project/scan-dbs`);
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
      const response = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // determine type
      const type = path.endsWith('.sqlnb') ? 'sqlnb' : path.endsWith('.sqlchain') ? 'sqlchain' : path.endsWith('.amoxdeck') ? 'amoxdeck' : path.endsWith('.md') ? 'md' : 'sql';
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

  const performImport = useCallback(async (tableName, cleanColumns, overridePath = null, schema = null) => {
    try {
      const finalPath = overridePath || importTargetFile;
      const response = await fetch(`${API_BASE}/api/db/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: finalPath,
          tableName: tableName,
          cleanColumns: cleanColumns,
          schema: schema
        })
      });
      const data = await response.json();
      if (response.ok) {
        setRefreshDbTrigger(prev => prev + 1);
        const where = schema && schema !== 'main' ? `${schema}.${tableName}` : tableName;
        return { success: true, summary: `Import successful! Table '${where}' created.` };
      } else {
        return { success: false, error: data.error };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [importTargetFile]);



  const performExcelImport = useCallback(async (config) => {
    try {
      const response = await fetch(`${API_BASE}/api/db/import-excel`, {
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
      const response = await fetch(`${API_BASE}/api/folder`, {
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
      const response = await fetch(`${API_BASE}/api/file`, {
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
      if (!filename.endsWith('.md') && !filename.endsWith('.amoxdeck')) {
        contentToSave = `/*\n * Description: ${description}\n */\n\n${contentToSave}`;
      }
    }
    if (!filename.endsWith('.sql') && !filename.endsWith('.sqlnb') && !filename.endsWith('.sqlchain') && !filename.endsWith('.md') && !filename.endsWith('.amoxdeck')) {
      if (pendingSaveTab && pendingSaveTab.type === 'sqlnb') {
        filename += '.sqlnb';
      } else if (pendingSaveTab && pendingSaveTab.type === 'sqlchain') {
        filename += '.sqlchain';
      } else if (pendingSaveTab && pendingSaveTab.type === 'amoxdeck') {
        filename += '.amoxdeck';
      } else if (pendingSaveTab && pendingSaveTab.type === 'md') {
        filename += '.md';
      } else {
        filename += '.sql';
      }
    }

    const result = await performSave(filename, contentToSave);

    if (result.success) {
      // Notify LayoutManager that the file is now saved with this path.
      // Pass the tab id captured when Save As was first requested — the modal
      // is async, so re-deriving "the active tab" here could target the wrong
      // pane's tab if the user switched panes while the dialog was open.
      layoutRef.current?.finishSaveAs(filename, pendingSaveTab?.id);
    }

    return result;
  }, [pendingSaveContent, pendingSaveTab, performSave]);

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
      const response = await fetch(`${API_BASE}/api/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filename, content: JSON.stringify(cells, null, 2) })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Tell LayoutManager to open the new notebook
      layoutRef.current?.handleQueryFile(filename);
      setFileRefreshTrigger(t => t + 1);
      toast.success(`Exported to ${filename}`);
    } catch (err) {
      toast.error(`Failed to export notebook: ${err.message}`);
    }
  }, []);

  const handleExportAmoxvis = useCallback(async (title, query, config) => {
    const safeTitle = (title || 'chart').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `AI_${safeTitle}_${Date.now()}.amoxvis`;
    // Flat format (canonical): chart fields at top level + query, matching what
    // Story Flow's own "Save as .amoxvis" writes and what the loader expects.
    // (A nested { config } shape would make DataVisualizer auto-detect defaults.)
    const amoxvisContent = {
      ...(config || {}),
      query: query || '',
    };

    try {
      const response = await fetch(`${API_BASE}/api/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filename, content: JSON.stringify(amoxvisContent, null, 2) })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      layoutRef.current?.openFile(filename, JSON.stringify(amoxvisContent, null, 2), 'amoxvis');
      setFileRefreshTrigger(t => t + 1);
      toast.success(`Exported chart to ${filename}`);
    } catch (err) {
      toast.error(`Failed to export chart: ${err.message}`);
    }
  }, [toast]);

  // Create a new editable .amoxvis chart tab on request (e.g. "Plot" from the data profiler).
  useEffect(() => {
    const handler = (e) => {
      const { title, query, config } = e.detail || {};
      if (query) handleExportAmoxvis(title || 'chart', query, config || {});
    };
    window.addEventListener('amox_create_chart', handler);
    return () => window.removeEventListener('amox_create_chart', handler);
  }, [handleExportAmoxvis]);

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

  // ── Stable callbacks for LayoutManager (avoid re-rendering the editor on nav) ──
  const handleDbChange = useCallback(() => setRefreshDbTrigger(p => p + 1), []);
  const handleRequestSaveAs = useCallback((content, tab) => {
    setPendingSaveContent(content);
    setPendingSaveTab(tab);
    setIsSaveModalOpen(true);
  }, []);
  const handleQueryResultNoop = useCallback(() => {}, []);
  const handleToggleAi = useCallback(() => setShowAiSidebar(v => !v), []);
  const handleTabsChange = useCallback((tabData) => {
    // tabData now carries only lightweight tab metadata (id/name/dirty/path/type)
    // and fires only when that metadata changes — never per keystroke (G1).
    setTitleBarTabs(tabData);
    const active = (tabData.tabs || []).find(t => t.id === tabData.activeTabId) || null;
    setActiveTabInfo(active ? { path: active.path || null, type: active.type || null, name: active.name } : null);
  }, []);
  // On-demand reader for the AI panel (G8): content/results/chartConfig are read
  // from the layout at send time instead of flowing as reactive props per keystroke.
  const getActiveEditorInfo = useCallback(() => layoutRef.current?.getActiveTabInfo() || null, []);
  const handleShowHistorySidebar = useCallback(() => {
    setSidebarCollapsed(false);
    setActiveSidebarTab('history');
  }, []);

  // ── Stable callbacks for sidebar panels (so their memo() is effective on nav) ──
  const handleCreateSqlTab = useCallback((sql) => layoutRef.current?.createNew('sql', sql), []);
  // Fase 4 — historial a archivo: crea un tab .sql nuevo con esta query y
  // dispara Save As directo, en vez de solo insertarla en un tab sin ruta.
  const handleSaveHistoryQueryAsFile = useCallback((sql) => layoutRef.current?.saveHistoryQueryAsFile(sql), []);
  const handleQueryFileTab = useCallback((path) => layoutRef.current?.handleQueryFile(path), []);
  const handleEditChartTab = useCallback((path) => layoutRef.current?.handleEditChart(path), []);
  const handleEditChartWithSqlTab = useCallback((path) => layoutRef.current?.handleEditChartWithSql(path), []);
  const handleOpenQualityCheck = useCallback((t) => setQualityCheckTable(t), []);
  const handleOpenErDiagram = useCallback((schema) => layoutRef.current?.createNew('er-diagram', schema), []);
  const handleOpenDbtLineage = useCallback(() => layoutRef.current?.createNew('dbt-lineage'), []);
  const handleVaultClose = useCallback(() => setActiveSidebarTab('files'), []);
  const handleOpenDataDiving = useCallback((convId) => layoutRef.current?.openDataDiving(convId), []);
  const handleNewDataDiving = useCallback(() => layoutRef.current?.openDataDiving(null), []);

  // --- Main Render Logic ---

  if (appPhase === PHASE.WELCOME) {
    return (
      <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
        <WindowTitleBar
          projectPath=""
          currentDb=""
          readOnly={false}
          onCloseProject={handleCloseProject}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => { setIsSettingsOpen(true); setSettingsInitialTab('shortcuts'); }}
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
          onAccentChange={handleAccentChange}
          accentL={accentL}
          effectiveAccentL={effectiveAccentL}
          isLightMode={modeClassFor(theme) === 'mode-light'}
          onAccentLChange={setAccentL}
          glowCorner={glowCorner}
          onGlowCornerChange={setGlowCorner}
          glowStrength={glowStrength}
          onGlowStrengthChange={setGlowStrength}
          currentInterfaceFont={interfaceFont}
          onInterfaceFontChange={setInterfaceFont}
          currentLayout={editorLayout}
          onLayoutChange={setEditorLayout}
          uiZoomLevel={uiZoomLevel}
          onUiZoomChange={setUiZoomLevel}
        />
      </div>
    );
  }

  // Tab-bar-card widths in split mode, computed in PIXELS from LayoutManager's
  // measured .lm-panes width — NOT CSS percentages. This row and the editor
  // panes below it are separate DOM regions with different padding/margin
  // models (this row had its own padding + a gap + the link button between
  // cards; the editor panes just have a 6px splitter), so the same
  // `splitRatio` as a plain percentage lands each row's second pane at a
  // different pixel — visibly misaligned tab bar vs. editor card underneath
  // it. Matching the exact arithmetic LayoutManager uses for its own pane
  // slots (minus the splitter width, minus each editor card's own 8px inset)
  // is what actually keeps them lined up as you drag the divider.
  const TAB_SPLITTER_WIDTH = 6; // must match LayoutManager's SPLITTER_WIDTH / .lm-splitter
  const TAB_CARD_INSET = 8;     // must match .ep-inner's horizontal padding
  const tabSplitRatio = titleBarTabs?.splitRatio ?? 0.5;
  const tabPanesWidth = titleBarTabs?.lmPanesWidth || 0;
  const tabGeometryReady = tabPanesWidth > (TAB_SPLITTER_WIDTH + TAB_CARD_INSET * 4);
  const tabSlot1Width = (tabPanesWidth - TAB_SPLITTER_WIDTH) * tabSplitRatio;
  const tabSlot2Width = (tabPanesWidth - TAB_SPLITTER_WIDTH) * (1 - tabSplitRatio);
  const tabCard1Style = tabGeometryReady
    ? { flex: '0 0 auto', width: tabSlot1Width - TAB_CARD_INSET * 2, marginLeft: TAB_CARD_INSET, marginRight: 3, minWidth: 0 }
    : { flex: `0 0 ${tabSplitRatio * 100}%`, margin: 0, minWidth: 0 };
  const tabCard2Style = tabGeometryReady
    ? { flex: '0 0 auto', width: tabSlot2Width - TAB_CARD_INSET * 2, marginLeft: 3, marginRight: TAB_CARD_INSET, minWidth: 0 }
    : { flex: `0 0 ${(1 - tabSplitRatio) * 100}%`, margin: 0, minWidth: 0 };

  // .app-shell es el padre común de la barra de ventana y del contenido: ahí vive
  // el resplandor de acento del fondo, y la barra (transparente) lo deja pasar.
  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
      <WindowTitleBar
        projectPath={projectPath}
        currentDb={currentDb}
        readOnly={dbReadOnly}
        onCloseProject={handleCloseProject}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenShortcuts={() => { setIsSettingsOpen(true); setSettingsInitialTab('shortcuts'); }}
        onSwitchProject={handleSwitchProject}
      />

      {/* Command Palette — Global */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={handleCloseCommandPalette}
        actions={commandPaletteActions}
      />


      {/* Workspace Scaffolding Wizard — shown on first open of new projects */}
      {showWorkspaceWizard && (
        <WorkspaceWizard
          projectPath={projectPath}
          onComplete={(created) => {
            setShowWorkspaceWizard(false);
            if (created && created.length > 0) {
              setFileRefreshTrigger(prev => prev + 1);
              toast.success(`Workspace created with ${created.length} folder${created.length !== 1 ? 's' : ''}`);
            }
          }}
          onSkip={() => setShowWorkspaceWizard(false)}
        />
      )}

      {appPhase === PHASE.IDE && (
        <div className="app-container app-enter" style={{ height: '100%', display: 'flex' }}>

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
                onClick={() => handleSidebarTabClick('functions')}
                className={`activity-bar-btn ${activeSidebarTab === 'functions' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="DuckDB Function Reference"
              >
                <LuSquareFunction size={20} />
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
              {/* Source Control */}
              <button
                onClick={() => handleSidebarTabClick('git')}
                className={`activity-bar-btn ${activeSidebarTab === 'git' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Source Control"
              >
                <LuGitBranch size={20} />
              </button>
              {/* Deep Dive — autonomous analyst conversations */}
              <button
                onClick={() => handleSidebarTabClick('deepdive')}
                className={`activity-bar-btn ${activeSidebarTab === 'deepdive' && !sidebarCollapsed ? 'activity-bar-btn--active' : ''}`}
                title="Deep Dive — autonomous analyst conversations"
              >
                <LuSparkles size={20} />
              </button>

              <div className="activity-bar-spacer" />

              {/* Chart Gallery */}
              <button
                onClick={() => setIsGalleryOpen(true)}
                className="activity-bar-btn"
                title="Chart Gallery"
              >
                <LuLayoutGrid size={20} />
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

            <div ref={sidebarElRef} className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''}`} style={sidebarCollapsed ? {} : { width: `${sidebarWidth}px` }}>

            {/* Content Switcher — keep-alive: cada panel se monta en la primera visita
                y permanece montado. display:none/flex controla visibilidad. */}
            {visitedSidebarTabs.has('files') && (
              <div className={activeSidebarTab === 'files' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, overflow: 'hidden', display: activeSidebarTab === 'files' ? 'flex' : 'none', flexDirection: 'column' }}>
                <FileExplorer
                  editorSettings={editorSettings}
                  onFileClick={handleFileClick}
                  onFileOpen={handleFileOpen}
                  onNewFile={handleNewFile}
                  onNewFolder={handleNewFolder}
                  onImportFile={handleImportRequest}
                  onQueryFile={handleQueryFileTab}
                  onQuerySql={(sql) => layoutRef.current?.createNew('sql', sql)}
                  onPreviewFile={handleQueryFileTab}
                  onEditChart={handleEditChartTab}
                  onEditChartWithSql={handleEditChartWithSqlTab}
                  onCreateNotebookFromFiles={(payload) => layoutRef.current?.createNew('sqlnb', payload)}
                  refreshTrigger={fileRefreshTrigger}
                />
              </div>
            )}

            {visitedSidebarTabs.has('schema') && (
              <div className={activeSidebarTab === 'schema' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'schema' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <DatabaseExplorer
                  currentDb={currentDb}
                  onRefresh={refreshDbTrigger}
                  onTablesLoaded={setAvailableTables}
                  onSelectQuery={handleCreateSqlTab}
                  onQualityCheck={handleOpenQualityCheck}
                  onOpenErDiagram={handleOpenErDiagram}
                />
              </div>
            )}

            {visitedSidebarTabs.has('extensions') && (
              <div className={activeSidebarTab === 'extensions' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'extensions' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <ExtensionExplorer />
              </div>
            )}


            {visitedSidebarTabs.has('dbt') && (
              <div className={activeSidebarTab === 'dbt' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'dbt' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <DbtPanel projectPath={projectPath} onFileOpen={handleFileOpen} onOpenDbtLineage={handleOpenDbtLineage} />
              </div>
            )}

            {visitedSidebarTabs.has('snippets') && (
              <div className={activeSidebarTab === 'snippets' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'snippets' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <SnippetsPanel onInsert={handleCreateSqlTab} />
              </div>
            )}

            {visitedSidebarTabs.has('functions') && (
              <div className={activeSidebarTab === 'functions' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'functions' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>}>
                  <FunctionReference />
                </Suspense>
              </div>
            )}

            {visitedSidebarTabs.has('history') && (
              <div className={activeSidebarTab === 'history' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'history' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <QueryHistoryPanel onSelect={handleCreateSqlTab} onSaveAsFile={handleSaveHistoryQueryAsFile} />
              </div>
            )}

            {visitedSidebarTabs.has('vault') && (
              <div className={activeSidebarTab === 'vault' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'vault' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <Suspense fallback={<div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading...</div>}>
                  <AnalysisVault
                    onOpenInEditor={handleCreateSqlTab}
                    onClose={handleVaultClose}
                  />
                </Suspense>
              </div>
            )}

            {visitedSidebarTabs.has('git') && (
              <div className={activeSidebarTab === 'git' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'git' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <GitPanel projectPath={projectPath} />
              </div>
            )}
            {visitedSidebarTabs.has('deepdive') && (
              <div className={activeSidebarTab === 'deepdive' ? 'sidebar-keepalive--show' : undefined} style={{ flex: 1, display: activeSidebarTab === 'deepdive' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <ConversationList
                  mode="diving"
                  activeId={null}
                  onSelect={handleOpenDataDiving}
                  onNew={handleNewDataDiving}
                />
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
                  let lastWidth = startWidth;
                  const onMouseMove = (ev) => {
                    const delta = ev.clientX - startX;
                    lastWidth = Math.min(480, Math.max(200, startWidth + delta));
                    // Direct DOM mutation during drag — no App re-render per pixel
                    if (sidebarElRef.current) sidebarElRef.current.style.width = `${lastWidth}px`;
                  };
                  const onMouseUp = () => {
                    isResizingSidebar.current = false;
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    setSidebarWidth(lastWidth); // single commit (also persists via effect)
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              />
            )}
          </div>

           {/* Main Content with LayoutManager */}
          <div className="main-content">
            {/* Tab Bar Area — floating, only above editor + AI area, hidden when no tabs */}
            {titleBarTabs && (titleBarTabs.tabs.length > 0 || (titleBarTabs.splitEnabled && (titleBarTabs.left?.tabs.length > 0 || titleBarTabs.right?.tabs.length > 0))) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: titleBarTabs.splitEnabled ? '6px 0 4px 0' : '6px 8px 4px 8px', flexShrink: 0 }}>
                {titleBarTabs.splitEnabled ? (
                  <>
                    <div
                      className="tab-bar-card"
                      style={tabCard1Style}
                      onMouseDown={() => layoutRef.current?.focusPane('left')}
                    >
                      <TabBar
                        tabs={titleBarTabs.left?.tabs || []}
                        activeTabId={titleBarTabs.left?.activeTabId}
                        paneId="left"
                        {...leftTabBarHandlers}
                      />
                    </div>
                    {/* Results-link toggle — lives HERE (between the two tab
                        bars) rather than on the pane splitter below, so it
                        doesn't widen the gap between panes. Icon only, no
                        button chrome, to keep that gap minimal. Its own
                        width (16px) plus the 3px margins on each side of it
                        above is exactly the 22px gap the editor cards below
                        have (8px inset + 6px splitter + 8px inset) — see the
                        tabCard*Style comment. */}
                    <button
                      className={`tab-link-btn${titleBarTabs.resultsLinked ? ' active' : ''}`}
                      onClick={() => layoutRef.current?.toggleResultsLinked()}
                      title={titleBarTabs.resultsLinked ? 'Alturas de resultados enlazadas — clic para independizar' : 'Enlazar la altura de resultados entre los dos paneles'}
                      aria-label={titleBarTabs.resultsLinked ? 'Unlink results panel heights' : 'Link results panel heights'}
                      aria-pressed={!!titleBarTabs.resultsLinked}
                    >
                      {titleBarTabs.resultsLinked ? <LuLink size={11} /> : <LuUnlink size={11} />}
                    </button>
                    <div
                      className="tab-bar-card"
                      style={tabCard2Style}
                      onMouseDown={() => layoutRef.current?.focusPane('right')}
                    >
                      <TabBar
                        tabs={titleBarTabs.right?.tabs || []}
                        activeTabId={titleBarTabs.right?.activeTabId}
                        paneId="right"
                        {...rightTabBarHandlers}
                      />
                    </div>
                  </>
                ) : (
                  <div className="tab-bar-card" style={{ flex: 1, margin: 0, minWidth: 0 }}>
                    <TabBar
                      tabs={titleBarTabs.tabs}
                      activeTabId={titleBarTabs.activeTabId}
                      paneId={titleBarTabs.paneId}
                      {...singleTabBarHandlers}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Tab Context Menu — right-click on a tab */}
            {tabContextMenu && (() => {
              const meta = findTabMeta(tabContextMenu.tabId);
              const paneTabs = tabContextMenu.paneId === 'left' ? titleBarTabs?.left?.tabs : titleBarTabs?.right?.tabs;
              const idxInPane = paneTabs ? paneTabs.findIndex(t => t.id === tabContextMenu.tabId) : -1;
              const hasTabsToRight = idxInPane >= 0 && idxInPane < (paneTabs.length - 1);
              const hasOtherTabs = (paneTabs?.length || 0) > 1;
              const canReveal = !!(meta?.path && window.electronAPI?.showItemInFolder);
              return (
                <div
                  className="column-context-menu"
                  style={{ position: 'fixed', top: tabContextMenu.y, left: tabContextMenu.x, zIndex: 99999 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="column-context-menu-item" onClick={() => handleTabMenuAction('rename')}>
                    <LuPencil size={13} /> Renombrar…
                  </div>
                  <div className="column-context-menu-item" onClick={() => handleTabMenuAction('save')}>
                    <LuSave size={13} /> Guardar
                  </div>
                  <div className="column-context-menu-item" onClick={() => handleTabMenuAction('saveAs')}>
                    <LuSave size={13} /> Guardar como…
                  </div>
                  {meta?.path && (
                    <div className="column-context-menu-item" onClick={() => handleTabMenuAction('copyPath')}>
                      <LuClipboardCopy size={13} /> Copiar ruta
                    </div>
                  )}
                  {canReveal && (
                    <div className="column-context-menu-item" onClick={() => handleTabMenuAction('reveal')}>
                      <LuFolderOpen size={13} /> Revelar en el explorador
                    </div>
                  )}
                  <div className="column-context-menu-separator" />
                  <div className="column-context-menu-item" onClick={() => handleTabMenuAction('moveToOtherPane')}>
                    <LuArrowLeftRight size={13} /> {tabContextMenu.paneId === 'left' ? 'Mover al panel derecho' : 'Mover al panel izquierdo'}
                  </div>
                  <div className="column-context-menu-item" onClick={() => handleTabMenuAction('duplicate')}>
                    <LuCopyPlus size={13} /> Abrir una copia al lado
                  </div>
                  <div className="column-context-menu-separator" />
                  <div className="column-context-menu-item" onClick={() => handleTabMenuAction('close')}>
                    <LuX size={13} /> Cerrar
                  </div>
                  {hasOtherTabs && (
                    <div className="column-context-menu-item" onClick={() => handleTabMenuAction('closeOthers')}>
                      <LuX size={13} /> Cerrar las demás
                    </div>
                  )}
                  {hasTabsToRight && (
                    <div className="column-context-menu-item" onClick={() => handleTabMenuAction('closeToRight')}>
                      <LuX size={13} /> Cerrar las de la derecha
                    </div>
                  )}
                  {hasOtherTabs && (
                    <div className="column-context-menu-item" onClick={() => handleTabMenuAction('closeAll')}>
                      <LuX size={13} /> Cerrar todas
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Content Area containing Editor AND AI Sidebar */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'hidden', display: 'block' }}>
                <LayoutManager
                  ref={layoutRef}
                  projectPath={projectPath}
                  theme={theme}
                  editorLayout={editorLayout}
                  editorSettings={mergedEditorSettings}
                  onDbChange={handleDbChange}
                  onRequestSaveAs={handleRequestSaveAs}
                  onQueryResult={handleQueryResultNoop}
                  showAiSidebar={showAiSidebar}
                  onToggleAi={handleToggleAi}
                  onTabsChange={handleTabsChange}
                  availableTables={availableTables}
                  onExportNotebook={handleExportNotebook}
                  onExportAmoxvis={handleExportAmoxvis}
                  onShowHistorySidebar={handleShowHistorySidebar}
                />
              </div>

              {/* Right Panel: AI Assistant (sidebar) or Data Diving (full screen) */}
              <div ref={aiPanelOuterRef} style={{
                width: showAiSidebar ? `${aiPanelWidth}px` : '0px',
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: 'auto',
                opacity: showAiSidebar ? 1 : 0,
                overflow: 'hidden',
                contain: 'layout paint',
                transition: 'width 0.2s ease, opacity 0.2s ease',
                pointerEvents: showAiSidebar ? 'auto' : 'none',
                margin: showAiSidebar ? '6px 8px 6px 0' : '0',
                borderRadius: 'var(--radius-lg)',
                border: showAiSidebar ? '1px solid var(--border-subtle)' : 'none',
                boxShadow: 'none',
                position: 'relative',
              }}>
                {/* Fixed-width, right-anchored inner: the panel is laid out once at
                    aiPanelWidth and the outer clip "reveals" it as width animates, so its
                    heavy content (chat/markdown) never reflows frame-by-frame on open. */}
                <div ref={aiPanelInnerRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${aiPanelWidth}px`, display: 'flex' }}>
                <AiAssistantPanel
                  activeFilePath={activeTabInfo?.path || null}
                  activeFileType={activeTabInfo?.type || null}
                  getActiveTabInfo={getActiveEditorInfo}
                  onEditFile={(result) => layoutRef.current?.updateActiveContent(result.content || result)}
                    onUpdateChartConfig={(result) => layoutRef.current?.updateActiveChartConfig(result.changes || result)}
                    onAppendToFile={(sql) => layoutRef.current?.appendToActiveContent(sql)}
                    onRunSql={(sql) => layoutRef.current?.createNew('sql', sql)}
                    onClose={() => setShowAiSidebar(false)}
                    availableTables={availableTables}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onResize={setAiPanelWidth}
                    onResizePreview={previewAiPanelWidth}
                    panelWidth={aiPanelWidth}
                    onOpenDataDiving={(convId) => layoutRef.current?.createNew('datadiving', convId)}
                  />
                </div>
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
          onAccentChange={handleAccentChange}
          accentL={accentL}
          effectiveAccentL={effectiveAccentL}
          isLightMode={modeClassFor(theme) === 'mode-light'}
          onAccentLChange={setAccentL}
          glowCorner={glowCorner}
          onGlowCornerChange={setGlowCorner}
          glowStrength={glowStrength}
          onGlowStrengthChange={setGlowStrength}
          currentInterfaceFont={interfaceFont}
          onInterfaceFontChange={setInterfaceFont}
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
          tableName={qualityCheckTable?.name}
          schema={qualityCheckTable?.schema}
        />

        <SchemaDiffModal
          isOpen={isSchemaDiffOpen}
          onClose={() => setIsSchemaDiffOpen(false)}
          tables={availableTables}
        />

        <Suspense fallback={null}>
          <ChartGalleryModal
            isOpen={isGalleryOpen}
            onClose={() => setIsGalleryOpen(false)}
          />
        </Suspense>

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
      </Suspense>

      {/* Global onboarding host — owns all first-run/replay tour rendering */}
      <OnboardingHost />

    </div>
  );
}

export default App;
