const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Read the actual server port synchronously before the React app loads.
// Falls back to 3001 if running outside Electron (e.g. Vite dev server).
const serverPort = ipcRenderer.sendSync('server:get-port');

contextBridge.exposeInMainWorld('electronAPI', {
    serverPort,
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
    saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (itemPath) => ipcRenderer.invoke('shell:showItemInFolder', itemPath),
    // Lets main.js default export downloads (chart PNG, HTML/Word/PPT
    // reports) into the current project's charts/ or reports/ folder.
    setProjectRoot: (rootPath) => ipcRenderer.send('project:set-root', rootPath),
    onDownloadCompleted: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('export:download-completed', handler);
        return () => ipcRenderer.removeListener('export:download-completed', handler);
    },
    windowControl: {
        minimize: () => ipcRenderer.send('window-control:minimize'),
        maximize: () => ipcRenderer.send('window-control:maximize'),
        close: () => ipcRenderer.send('window-control:close')
    },
    // UI Zoom
    zoom: {
        setFactor: (factor) => webFrame.setZoomFactor(factor),
        getFactor: () => webFrame.getZoomFactor(),
        onChanged: (callback) => {
            const handler = (_event, factor) => callback(factor);
            ipcRenderer.on('zoom:changed', handler);
            return () => ipcRenderer.removeListener('zoom:changed', handler);
        },
    },
    // Pop-out Results Window
    openPopout: (data) => ipcRenderer.invoke('popout:open', data),
    onPopoutClosed: (callback) => {
        ipcRenderer.on('popout:closed', callback);
        return () => ipcRenderer.removeListener('popout:closed', callback);
    },
    // Child window: receive popout data
    onPopoutData: (callback) => {
        ipcRenderer.on('popout:data', (_event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('popout:data');
    },
    isPopoutWindow: () => ipcRenderer.invoke('popout:isPopout'),
    requestPopoutData: () => ipcRenderer.invoke('popout:requestData'),
});

window.addEventListener('DOMContentLoaded', () => {
    // Restore saved zoom level on startup
    try {
        const saved = localStorage.getItem('amoxsql-ui-zoom');
        if (saved) {
            const factor = parseFloat(saved);
            if (factor >= 0.5 && factor <= 2.0) {
                webFrame.setZoomFactor(factor);
            }
        }
    } catch (e) { /* ignore */ }
    console.log('Electron Preloaded');
});
