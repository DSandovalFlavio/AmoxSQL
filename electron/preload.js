const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder')
});

window.addEventListener('DOMContentLoaded', () => {
    // Preload script
    console.log('Electron Preloaded');
});
