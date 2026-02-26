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

// FORCE PROD IF PACKAGED - MUST BE BEFORE REQUIRE SERVER
// This ensures server/index.js sees the environment variable at module load time.
if (app.isPackaged) {
    process.env.NODE_ENV = 'production';
}

const { startServer } = require('../server/index.js');

let mainWindow;
const SERVER_PORT = 3001;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, '../assets/icon.ico'), // Ensure this exists or use png
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'), // Optional handling
        },
        autoHideMenuBar: true,
        backgroundColor: '#0F1012'
    });

    // Load the App
    if (!app.isPackaged) {
        // Dev Mode: Load Vite Dev Server
        // We assume 'npm start' runs 'concurrently "npm run client:dev" ...'
        // Wait for it? simpler to just load.
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Prod Mode: Load the Express server which serves the React Build
        console.log(`[Main] Loading content from http://localhost:${SERVER_PORT}`);
        mainWindow.loadURL(`http://localhost:${SERVER_PORT}`)
            .catch(e => {
                console.error("Failed to load app content:", e);
                // We could load a local error.html here if needed
            });
    }
};

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
