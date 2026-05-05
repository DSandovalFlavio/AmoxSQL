const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
    saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
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
