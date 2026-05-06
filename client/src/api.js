/**
 * Centralized API base URL.
 * In Electron, reads the actual port from the preload (supports dynamic port
 * assignment when 3001 is busy). In Vite dev mode (no Electron), falls back to 3001.
 */
const port = window.electronAPI?.serverPort ?? 3001;
export const API_BASE = `http://localhost:${port}`;
