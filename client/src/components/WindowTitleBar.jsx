import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LuDatabase, LuBrain, LuChevronDown, LuX, LuFolder, LuClock,
  LuSearch, LuSettings, LuKeyboard, LuRefreshCw,
} from 'react-icons/lu';

const RECENT_KEY = 'amoxsql-recent-projects';

// La marca de AmoxSQL a tamaño de icono: los mismos paths que Logo.jsx, sin el
// gradiente ni el glow (a 16px no se leen y solo ensucian).
const LogoMark = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 400 400" aria-hidden="true">
    <g transform="translate(50, 0) scale(0.8)">
      <g stroke="currentColor" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M 135 285 Q 125 290 115 275 L 185 75 Q 200 45 215 75 L 285 275 Q 275 290 265 285" />
        <path d="M 130 210 Q 200 330 270 210" />
      </g>
    </g>
  </svg>
);

const WindowTitleBar = ({
  projectPath, currentDb, readOnly, onCloseProject, onSwitchProject,
  onOpenCommandPalette, onOpenSettings, onOpenShortcuts,
}) => {
  // Un solo menú abierto a la vez: 'app' | 'workspace' | null.
  const [openMenu, setOpenMenu] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const appRef = useRef(null);
  const wsRef = useRef(null);

  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() : '';

  const isAttached = currentDb && typeof currentDb === 'string' && currentDb !== ':memory:';
  const dbName = isAttached ? currentDb.split(/[/\\]/).pop() : 'In-Memory';
  const modeLabel = isAttached ? (readOnly ? 'RO' : 'RW') : 'MEM';
  const modeClass = isAttached
    ? (readOnly ? 'wtb-mode--readonly' : 'wtb-mode--readwrite')
    : 'wtb-mode--memory';

  useEffect(() => {
    if (openMenu !== 'workspace') return;
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      setRecentProjects(saved.filter(p => p !== projectPath));
    } catch { setRecentProjects([]); }
  }, [openMenu, projectPath]);

  // Un único cierre para los dos menús: se cierra si el clic cae fuera de ambos.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => {
      if (appRef.current?.contains(e.target)) return;
      if (wsRef.current?.contains(e.target)) return;
      setOpenMenu(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const runAndClose = useCallback((fn) => () => { setOpenMenu(null); fn?.(); }, []);

  const handleSwitchToRecent = (path) => { setOpenMenu(null); onSwitchProject?.(path); };
  const handleCloseWorkspace = () => { setOpenMenu(null); onCloseProject?.(); };

  return (
    <div className="window-title-bar">
      {/* Izquierda: menú de aplicación + breadcrumb del workspace */}
      <div className="drag-region wtb-left">
        <div className="wtb-menu-anchor" ref={appRef}>
          <button
            className={`wtb-appmenu${openMenu === 'app' ? ' wtb-appmenu--open' : ''}`}
            onClick={() => setOpenMenu(m => (m === 'app' ? null : 'app'))}
            title="AmoxSQL"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'app'}
          >
            <LogoMark size={16} />
          </button>

          {openMenu === 'app' && (
            <div className="wtb-dropdown wtb-dropdown--app" role="menu">
              <button className="wtb-dropdown-item" role="menuitem" onClick={runAndClose(onOpenCommandPalette)}>
                <LuSearch size={13} className="wtb-dropdown-item-icon" />
                <span>Command Palette</span>
                <span className="wtb-dropdown-item-key">Ctrl K</span>
              </button>
              <button className="wtb-dropdown-item" role="menuitem" onClick={runAndClose(onOpenSettings)}>
                <LuSettings size={13} className="wtb-dropdown-item-icon" />
                <span>Settings</span>
                <span className="wtb-dropdown-item-key">Ctrl ,</span>
              </button>
              <button className="wtb-dropdown-item" role="menuitem" onClick={runAndClose(onOpenShortcuts)}>
                <LuKeyboard size={13} className="wtb-dropdown-item-icon" />
                <span>Keyboard Shortcuts</span>
              </button>
              <div className="wtb-dropdown-divider" />
              <button className="wtb-dropdown-item" role="menuitem" onClick={runAndClose(() => window.location.reload())}>
                <LuRefreshCw size={13} className="wtb-dropdown-item-icon" />
                <span>Reload Window</span>
              </button>
            </div>
          )}
        </div>

        {projectPath && (
          <div className="wtb-menu-anchor" ref={wsRef}>
            <button
              className="wtb-crumb"
              onClick={() => setOpenMenu(m => (m === 'workspace' ? null : 'workspace'))}
              title={projectPath}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'workspace'}
            >
              <span className="wtb-crumb-project">{projectName}</span>
              <span className="wtb-crumb-sep">/</span>
              <span className="wtb-crumb-db">{dbName}</span>
              <span className={`wtb-mode-badge ${modeClass}`}>{modeLabel}</span>
              <LuChevronDown size={10} className={`wtb-chevron ${openMenu === 'workspace' ? 'wtb-chevron--open' : ''}`} />
            </button>

            {openMenu === 'workspace' && (
              <div className="wtb-dropdown" role="menu">
                <div className="wtb-dropdown-section-label">Current Workspace</div>
                <div className="wtb-dropdown-current">
                  <div className="wtb-dropdown-current-row">
                    <LuFolder size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                    <span className="wtb-dropdown-current-name">{projectName}</span>
                  </div>
                  <div className="wtb-dropdown-current-row wtb-dropdown-current-db">
                    {isAttached
                      ? <LuDatabase size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      : <LuBrain size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    }
                    <span>{dbName}</span>
                    <span className={`wtb-mode-badge ${modeClass}`}>{modeLabel}</span>
                  </div>
                </div>

                {recentProjects.length > 0 && (
                  <>
                    <div className="wtb-dropdown-divider" />
                    <div className="wtb-dropdown-section-label">Recent Workspaces</div>
                    {recentProjects.map((path, i) => {
                      const name = path.split(/[/\\]/).pop();
                      return (
                        <button
                          key={i}
                          className="wtb-dropdown-item"
                          role="menuitem"
                          onClick={() => handleSwitchToRecent(path)}
                          title={path}
                        >
                          <LuClock size={12} className="wtb-dropdown-item-icon" />
                          <span className="wtb-dropdown-item-name">{name}</span>
                          <span className="wtb-dropdown-item-path">{path}</span>
                        </button>
                      );
                    })}
                  </>
                )}

                <div className="wtb-dropdown-divider" />
                <button className="wtb-dropdown-item wtb-dropdown-item--danger" role="menuitem" onClick={handleCloseWorkspace}>
                  <LuX size={12} className="wtb-dropdown-item-icon" />
                  <span>Close Workspace</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Centro: omnibox. Por ahora solo comandos — el texto no promete archivos
          ni tablas hasta que esa búsqueda exista (fase 8 del plan). */}
      <div className="drag-region wtb-center">
        {projectPath && (
          <button className="wtb-omnibox" onClick={() => onOpenCommandPalette?.()}>
            <LuSearch size={13} className="wtb-omnibox-icon" />
            <span className="wtb-omnibox-text">Search commands...</span>
            <span className="wtb-omnibox-kbd">Ctrl K</span>
          </button>
        )}
      </div>

      {/* Derecha: controles de ventana */}
      <div className="window-controls">
        <button onClick={() => window.electronAPI?.windowControl?.minimize()} className="control-btn minimize" title="Minimizar">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect fill="currentColor" width="10" height="1" x="1" y="6" />
          </svg>
        </button>
        <button onClick={() => window.electronAPI?.windowControl?.maximize()} className="control-btn maximize" title="Maximizar">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path fill="currentColor" d="M2,2 L10,2 L10,10 L2,10 L2,2 Z M3,3 L9,3 L9,9 L3,9 L3,3 Z" />
          </svg>
        </button>
        <button onClick={() => window.electronAPI?.windowControl?.close()} className="control-btn close" title="Cerrar">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path fill="currentColor" d="M1,1 L11,11 M1,11 L11,1 Z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Memoized: App re-renders must not reconcile the window chrome when props are stable.
export default React.memo(WindowTitleBar);
