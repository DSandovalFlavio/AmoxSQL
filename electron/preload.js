const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    windowControl: {
        minimize: () => ipcRenderer.send('window-control:minimize'),
        maximize: () => ipcRenderer.send('window-control:maximize'),
        close: () => ipcRenderer.send('window-control:close')
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
    // Preload script
    console.log('Electron Preloaded');
});
