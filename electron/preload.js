const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Read the actual server port synchronously before the React app loads.
// Falls back to 3001 if running outside Electron (e.g. Vite dev server).
const serverPort = ipcRenderer.sendSync('server:get-port');

// macOS: los botones nativos no cambian con el zoom de la interfaz, pero el hueco
// que les deja la barra sí. El CSS lo compensa con esta variable.
const enMac = process.platform === 'darwin';
const marcarZoom = (factor) => {
    if (enMac) document.documentElement?.style.setProperty('--zoom-ventana', String(factor));
};
if (enMac) {
    ipcRenderer.on('zoom:changed', (_event, factor) => marcarZoom(factor));
    ipcRenderer.on('ventana:pantalla-completa', (_event, activa) => {
        document.documentElement?.toggleAttribute('data-pantalla-completa', activa);
    });
}

contextBridge.exposeInMainWorld('electronAPI', {
    serverPort,
    platform: process.platform,
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    openFileDialog: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
    saveFileDialog: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
    showItemInFolder: (itemPath) => ipcRenderer.invoke('shell:showItemInFolder', itemPath),
    // Abrir con su programa un documento que dejó un proceso (5.11, D5).
    openPath: (itemPath) => ipcRenderer.invoke('shell:openPath', itemPath),
    // El clic en un aviso de una ejecución (5.11, D2): abrirla en la aplicación.
    onAbrirEjecucion: (callback) => {
        const handler = (_event, runId) => callback(runId);
        ipcRenderer.on('amox:abrir-ejecucion', handler);
        return () => ipcRenderer.removeListener('amox:abrir-ejecucion', handler);
    },
    // Devuelve el PDF en base64, o { error }. Texto real, no una captura.
    exportPdf: (opts) => ipcRenderer.invoke('export:pdf', opts),
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
        setFactor: (factor) => {
            webFrame.setZoomFactor(factor);
            marcarZoom(factor);
        },
        getFactor: () => webFrame.getZoomFactor(),
        onChanged: (callback) => {
            const handler = (_event, factor) => callback(factor);
            ipcRenderer.on('zoom:changed', handler);
            return () => ipcRenderer.removeListener('zoom:changed', handler);
        },
    },
    // Pop-out Results Window
    openPopout: (data) => ipcRenderer.invoke('popout:open', data),
    updatePopout: (data) => ipcRenderer.invoke('popout:update', data),
    focusPopout: (tabId) => ipcRenderer.invoke('popout:focus', tabId),
    closePopout: (tabId) => ipcRenderer.invoke('popout:close', tabId),
    closeAllPopouts: () => ipcRenderer.invoke('popout:closeAll'),
    onPopoutClosed: (callback) => {
        const handler = (_event, tabId) => callback(tabId);
        ipcRenderer.on('popout:closed', handler);
        return () => ipcRenderer.removeListener('popout:closed', handler);
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
                marcarZoom(factor);
            }
        }
    } catch (e) { /* ignore */ }
    console.log('Electron Preloaded');
});
