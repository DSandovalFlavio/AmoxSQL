import React from 'react';

const WindowTitleBar = () => {
  const handleMinimize = () => {
    window.electronAPI.windowControl.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI.windowControl.maximize();
  };

  const handleClose = () => {
    window.electronAPI.windowControl.close();
  };

  return (
    <div className="window-title-bar">
      <div className="drag-region">
        <div className="app-icon-container">
            <span className="app-title">AmoxSQL</span>
        </div>
      </div>
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

export default WindowTitleBar;
