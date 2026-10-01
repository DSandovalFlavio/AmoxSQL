/**
 * Centralized API base URL.
 * In Electron, reads the actual port from the preload (supports dynamic port
 * assignment when 3001 is busy). In Vite dev mode (no Electron), falls back to 3001.
 */
// Only in development: `?apiPort=N` points the renderer at another server, so
// a throwaway server (temporary AMOXSQL_HOME) can be checked in a browser
// without touching the session of the running app.
const devPort = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get('apiPort')) || null : null;
const port = window.electronAPI?.serverPort ?? devPort ?? 3001;
export const API_BASE = `http://localhost:${port}`;
