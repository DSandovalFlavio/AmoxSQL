/**
 * AmoxSQL - The Modern Codex for Local Data Analysis
 * Copyright (c) 2026 Flavio Sandoval. All rights reserved.
 * Licensed under the AmoxSQL Community License. See LICENSE in the project root.
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');

// IPC Handler: Open native folder picker dialog
ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder'
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
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

// FORCE PROD IF PACKAGED - MUST BE BEFORE REQUIRE SERVER
// This ensures server/index.js sees the environment variable at module load time.
if (app.isPackaged) {
    process.env.NODE_ENV = 'production';
}

const { startServer } = require('../server/index.js');

let mainWindow;
let popoutWindow = null;
let pendingPopoutData = null;
const SERVER_PORT = 3001;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
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
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        console.log(`[Main] Loading content from http://localhost:${SERVER_PORT}`);
        mainWindow.loadURL(`http://localhost:${SERVER_PORT}`)
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
        : `http://localhost:${SERVER_PORT}`;

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
            preload: path.join(__dirname, 'preload.js')
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
const initApp = async () => {
    try {
        console.log("Starting Local Server...");
        await startServer(SERVER_PORT);
        console.log("Server Started. Creating Window...");
        createWindow();
    } catch (err) {
        console.error("Failed to start server:", err);
        app.quit();
    }
};

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
