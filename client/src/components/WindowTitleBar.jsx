import React, { useState, useEffect, useRef } from 'react';
import { LuDatabase, LuBrain, LuChevronDown, LuX, LuFolder, LuClock } from 'react-icons/lu';

const RECENT_KEY = 'amoxsql-recent-projects';

const WindowTitleBar = ({ projectPath, currentDb, readOnly, onCloseProject, onSwitchProject }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  const dropdownRef = useRef(null);

  // Extract project name from path
  const projectName = projectPath ? projectPath.split(/[/\\]/).pop() : '';

  // Determine DB connection info
  const isAttached = currentDb && typeof currentDb === 'string' && currentDb !== ':memory:';
  const dbName = isAttached ? currentDb.split(/[/\\]/).pop() : 'In-Memory';
  const modeLabel = isAttached ? (readOnly ? 'RO' : 'RW') : 'MEM';
  const modeClass = isAttached
    ? (readOnly ? 'wtb-mode--readonly' : 'wtb-mode--readwrite')
    : 'wtb-mode--memory';

  // Load recent projects when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      try {
        const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        // Filter out the current project
        setRecentProjects(saved.filter(p => p !== projectPath));
      } catch { setRecentProjects([]); }
    }
  }, [dropdownOpen, projectPath]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dropdownOpen]);

  const handleMinimize = () => {
    window.electronAPI.windowControl.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI.windowControl.maximize();
  };

  const handleClose = () => {
    window.electronAPI.windowControl.close();
  };

  const handleSwitchToRecent = (path) => {
    setDropdownOpen(false);
    if (onSwitchProject) {
      onSwitchProject(path);
    }
  };

  const handleCloseWorkspace = () => {
    setDropdownOpen(false);
    if (onCloseProject) {
      onCloseProject();
    }
  };

  return (
    <div className="window-title-bar">
      {/* Left: App Title */}
      <div className="drag-region wtb-left">
        <div className="app-icon-container">
          <span className="app-title">AmoxSQL</span>
        </div>
      </div>

      {/* Center: Workspace Widget */}
      <div className="drag-region wtb-center">
        {projectPath && (
          <div className="wtb-workspace-area" ref={dropdownRef}>
            <button
              className="wtb-workspace-widget"
              onClick={() => setDropdownOpen(prev => !prev)}
              title="Workspace options"
            >
              <LuFolder size={11} className="wtb-workspace-icon" />
              <span className="wtb-workspace-name">{projectName}</span>
              <span className="wtb-dot-separator">·</span>
              <span className={`wtb-mode-badge ${modeClass}`}>{modeLabel}</span>
              <span className="wtb-db-name">{dbName}</span>
              <LuChevronDown size={10} className={`wtb-chevron ${dropdownOpen ? 'wtb-chevron--open' : ''}`} />
            </button>

            {/* Close workspace quick button */}
            <button
              className="wtb-close-workspace"
              onClick={handleCloseWorkspace}
              title="Close Workspace"
            >
              <LuX size={12} />
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div className="wtb-dropdown">
                {/* Current workspace info */}
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

                {/* Recent workspaces */}
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

                {/* Actions */}
                <div className="wtb-dropdown-divider" />
                <button className="wtb-dropdown-item wtb-dropdown-item--danger" onClick={handleCloseWorkspace}>
                  <LuX size={12} className="wtb-dropdown-item-icon" />
                  <span>Close Workspace</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="window-controls">
        <button onClick={handleMinimize} className="control-btn minimize" title="Minimizar">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect fill="currentColor" width="10" height="1" x="1" y="6" />
          </svg>
        </button>
        <button onClick={handleMaximize} className="control-btn maximize" title="Maximizar">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path fill="currentColor" d="M2,2 L10,2 L10,10 L2,10 L2,2 Z M3,3 L9,3 L9,9 L3,9 L3,3 Z" />
          </svg>
        </button>
        <button onClick={handleClose} className="control-btn close" title="Cerrar">
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
