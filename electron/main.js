/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require('electron');
const path = require('path');

// ─── Single instance lock ─────────────────────────────────────────────────────
// Prevents opening the same .duckdb file from two instances simultaneously,
// which would cause race conditions and potential data corruption.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    // Another instance is already running — hand focus to it and exit.
    app.quit();
}

// IPC Handler: Open native folder picker dialog
// Synchronous IPC so the preload can read the port before the React app loads
ipcMain.on('server:get-port', (event) => {
    event.returnValue = actualServerPort;
});

ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// IPC Handler: Open file picker dialog
ipcMain.handle('dialog:openFile', async (_event, opts = {}) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        title: opts.title || 'Select File',
        filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
        defaultPath: opts.defaultPath,
    });
    return result;
});

// IPC Handler: Save file picker dialog
ipcMain.handle('dialog:saveFile', async (_event, opts = {}) => {
    const result = await dialog.showSaveDialog({
        title: opts.title || 'Save File',
        filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
        defaultPath: opts.defaultPath,
    });
    return result;
});

// IPC Handler: Open URL in the system's default browser
ipcMain.handle('shell:openExternal', async (_event, url) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
        await shell.openExternal(url);
    }
});

// IPC Handler: Window controls
ipcMain.on('window-control:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-control:maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.on('window-control:close', () => {
    if (mainWindow) mainWindow.close();
});

let mainWindow;
let popoutWindow = null;
let pendingPopoutData = null;
let serverProcess = null;
const SERVER_PORT = 3001;
let actualServerPort = SERVER_PORT;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

// ─── Graceful shutdown helper ─────────────────────────────────────────────────
// Asks the Express server to cleanly close all DuckDB connections before exit.
// Tolerates failures silently (e.g. server already dead) so quit always proceeds.
async function shutdownServer() {
    try {
        await fetch(`http://localhost:${actualServerPort}/api/shutdown`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(4000),
        });
    } catch {
        // Best-effort — server may already be shutting down
    }
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, '../assets/icon.ico'),
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false, // queries en background no se ralentizan
            spellcheck: false,
        },
        autoHideMenuBar: true,
        backgroundColor: '#0F1012'
    });

    // === ZOOM SYSTEM ===
    // Zoom is managed centrally from main process via webContents.setZoomFactor().
    // We intercept Ctrl+Plus/Minus/0, preventDefault to stop Chromium's default,
    // then apply our own zoom factor and notify the renderer to sync UI state.
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.control && !input.shift && !input.alt && input.type === 'keyDown') {
            if (input.key === '=' || input.key === '+') {
                event.preventDefault();
                const current = mainWindow.webContents.getZoomFactor();
                const next = Math.min(current + 0.1, 2.0);
                mainWindow.webContents.setZoomFactor(next);
                mainWindow.webContents.send('zoom:changed', next);
            } else if (input.key === '-') {
                event.preventDefault();
                const current = mainWindow.webContents.getZoomFactor();
                const next = Math.max(current - 0.1, 0.5);
                mainWindow.webContents.setZoomFactor(next);
                mainWindow.webContents.send('zoom:changed', next);
            } else if (input.key === '0') {
                event.preventDefault();
                mainWindow.webContents.setZoomFactor(1.0);
                mainWindow.webContents.send('zoom:changed', 1.0);
            }
        }
    });

    // Load the App
    if (!app.isPackaged) {
        // AMOX_DEV_URL lets a second checkout/worktree run alongside another
        // Vite instance without fighting over the default port.
        mainWindow.loadURL(process.env.AMOX_DEV_URL || 'http://localhost:5173');
        // DevTools degrades typing/rendering noticeably; opt in with AMOX_DEVTOOLS=1
        // (or open manually with Ctrl+Shift+I).
        if (process.env.AMOX_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools();
        }
    } else {
        console.log(`[Main] Loading content from http://localhost:${actualServerPort}`);
        mainWindow.loadURL(`http://localhost:${actualServerPort}`)
            .catch(e => {
                console.error("Failed to load app content:", e);
            });
    }
};

// --- Pop-out Results Window IPC ---

ipcMain.handle('popout:open', async (_event, data) => {
    // If there's already a popout window, focus it and send new data
    if (popoutWindow && !popoutWindow.isDestroyed()) {
        popoutWindow.focus();
        popoutWindow.webContents.send('popout:data', data);
        return true;
    }

    pendingPopoutData = data;

    const baseUrl = !app.isPackaged
        ? 'http://localhost:5173'
        : `http://localhost:${actualServerPort}`;

    popoutWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        frame: true,
        autoHideMenuBar: true,
        backgroundColor: '#0F1012',
        icon: path.join(__dirname, '../assets/icon.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false,
            spellcheck: false,
        }
    });

    popoutWindow.loadURL(`${baseUrl}?popout=true`);

    popoutWindow.webContents.on('did-finish-load', () => {
        // Data will be requested by the child via popout:requestData
        // We keep pendingPopoutData available for that request
    });

    popoutWindow.on('closed', () => {
        popoutWindow = null;
        pendingPopoutData = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('popout:closed');
        }
    });

    return true;
});

// Child window requests its initial data after React mounts
ipcMain.handle('popout:requestData', () => {
    const data = pendingPopoutData;
    pendingPopoutData = null;
    return data;
});

ipcMain.handle('popout:isPopout', (event) => {
    if (popoutWindow && !popoutWindow.isDestroyed()) {
        return event.sender === popoutWindow.webContents;
    }
    return false;
});

// Start Server & App
const initApp = () => {
    console.log("Starting Local Server in utility process...");

    serverProcess = utilityProcess.fork(
        path.join(__dirname, 'server-worker.js'),
        [],
        {
            serviceName: 'AmoxSQL Server',
            env: {
                ...process.env,
                NODE_ENV: app.isPackaged ? 'production' : (process.env.NODE_ENV || 'development'),
            },
        }
    );

    // Safety net: if server never sends 'ready' within 30 s, show an error dialog
    // instead of leaving the user with a blank screen / no window.
    let serverReady = false;
    const startupTimeout = setTimeout(() => {
        if (!serverReady) {
            console.error('[Main] Server startup timed out after 30 s');
            dialog.showErrorBox(
                'AmoxSQL — Error de inicio',
                'El servidor interno no respondió en 30 segundos.\n\n' +
                'Esto puede deberse a un conflicto en el puerto 3001 o a un problema ' +
                'con el módulo de base de datos.\n\n' +
                'La aplicación se cerrará. Revisa el registro de errores si el problema persiste.'
            );
            app.quit();
        }
    }, 30000);

    serverProcess.on('message', (msg) => {
        if (msg.type === 'ready') {
            serverReady = true;
            clearTimeout(startupTimeout);
            actualServerPort = msg.port || SERVER_PORT;
            console.log(`Server ready on port ${actualServerPort}. Creating window...`);
            createWindow();
        } else if (msg.type === 'error') {
            serverReady = true; // prevent double-dialog
            clearTimeout(startupTimeout);
            console.error("Server failed to start:", msg.message);
            dialog.showErrorBox(
                'AmoxSQL — Error de inicio',
                `El servidor interno no pudo iniciarse:\n\n${msg.message}\n\nLa aplicación se cerrará.`
            );
            app.quit();
        }
    });

    serverProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Server process exited unexpectedly (code ${code})`);
        }
    });

    serverProcess.postMessage({ type: 'start', port: SERVER_PORT });
};

// ─── Second-instance handler ──────────────────────────────────────────────────
// If the user tries to open a second instance, focus the existing main window.
app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

// ─── Graceful quit ────────────────────────────────────────────────────────────
// Give DuckDB time to flush any in-flight writes before the process dies.
app.on('before-quit', async (event) => {
    event.preventDefault();
    await shutdownServer();
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
    app.removeAllListeners('before-quit');
    app.quit();
});

app.whenReady().then(initApp);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
