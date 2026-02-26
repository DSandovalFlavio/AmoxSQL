const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});

window.addEventListener('DOMContentLoaded', () => {
    // Preload script
    console.log('Electron Preloaded');
});
