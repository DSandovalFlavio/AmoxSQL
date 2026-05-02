# AmoxSQL — Arquitectura General

> Descripción de los 3 procesos, flujos de comunicación, IPC bridge y diferencias dev/prod.

---

## 1. Los 3 Procesos en Runtime

AmoxSQL corre con 3 procesos distintos que se comunican de formas específicas:

```
┌─────────────────────────────────────────────────────────────────┐
│  ELECTRON MAIN PROCESS  (electron/main.js)                     │
│  · Crea la BrowserWindow                                       │
│  · Single-instance lock                                        │
│  · Native dialogs (folder picker)                              │
│  · Keyboard shortcuts (zoom)                                   │
│  · Spawna el Express server como utilityProcess                │
└─────────────┬───────────────────────────────────┬──────────────┘
              │ IPC (ipcMain/ipcRenderer)           │ spawn
              │ Solo para: dialogs, zoom,           │ (utilityProcess)
              │ window controls, popout             │
              ▼                                     ▼
┌─────────────────────────┐         ┌──────────────────────────────┐
│  RENDERER PROCESS       │         │  UTILITY PROCESS             │
│  (React + Vite)         │         │  (Express + DuckDB)          │
│  · UI completa          │◄───────►│  · Puerto 3001               │
│  · Monaco Editor        │  HTTP   │  · 70+ endpoints REST        │
│  · Charts (Recharts)    │  fetch  │  · DatabaseManager           │
│  · AI Chat UI           │         │  · AiManager + agenticLoop   │
│                         │ SSE     │  · Filesystem (files)        │
│                         │◄───────►│                              │
└─────────────────────────┘         └──────────────────────────────┘
```

### Por qué esta separación

- **Main ↔ Renderer vía IPC:** Solo para operaciones nativas que el renderer no puede hacer directamente (abrir dialogs nativos, controlar la ventana, zoom del webContents).
- **Renderer ↔ Express vía HTTP/SSE:** Todo lo relacionado con datos. El renderer hace fetch a `http://localhost:3001/api/*`. Esto permite debuggear la API con curl o Postman independientemente de la UI.
- **DuckDB en el utilityProcess:** Los bindings nativos de DuckDB no pueden correr en el contexto del renderer (sandboxed). Además, las queries pueden bloquear el thread — aislarlas en el utilityProcess garantiza que la UI nunca se congele.

---

## 2. Electron Main Process (`electron/main.js`)

### Responsabilidades
- Crear y gestionar la `BrowserWindow`
- Single-instance lock (evitar dos instancias del mismo .duckdb → corrupción)
- Handlers de IPC para dialogs y window controls
- Spawnar el server como `utilityProcess` en producción

### Single-Instance Lock

```javascript
// main.js
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit(); // Segunda instancia → cerrar inmediatamente
} else {
  app.on('second-instance', () => {
    // Enfocar la ventana existente si el usuario abre otra instancia
    if (mainWindow) mainWindow.focus();
  });
}
```

### Ciclo de vida del server

**Desarrollo:**
```javascript
// En dev, el server corre directamente (nodemon lo gestiona)
// main.js asume que ya está corriendo en :3001
mainWindow.loadURL('http://localhost:5173'); // Vite dev server
```

**Producción:**
```javascript
// main.js spawna el server como utilityProcess
const serverProcess = utilityProcess.fork(
  path.join(__dirname, '../server/server-worker.js'),
  [], { stdio: 'pipe' }
);
// stdout del server se redirige al proceso padre para logs
serverProcess.stdout.on('data', data => console.log('[Server]', data.toString()));

mainWindow.loadFile(path.join(__dirname, '../client/dist/index.html'));
```

---

## 3. Renderer Process (React + Vite)

### Comunicación con el servidor

El renderer **nunca** usa IPC para datos. Toda comunicación con DuckDB y el filesystem pasa por HTTP:

```javascript
// ✅ Correcto — fetch a la API REST
const response = await fetch('http://localhost:3001/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sql })
});
const result = await response.json();

// ❌ Incorrecto — no usar IPC para datos
window.electronAPI.runQuery(sql); // No existe y no debe existir
```

### Streaming SSE para AI

Para el chat AI, el renderer consume un stream SSE:

```javascript
const response = await fetch('http://localhost:3001/api/ai/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, mode, ... })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Procesar eventos SSE: data: {...}\n\n
  processSSEChunk(chunk);
}
```

---

## 4. IPC Bridge — `window.electronAPI`

`electron/preload.js` expone una API estrecha al renderer via `contextBridge`. Esta es la única forma correcta de llamar a capacidades nativas de Electron desde React.

```javascript
// Disponible en el renderer como window.electronAPI
{
  // Abrir selector nativo de carpetas
  selectFolder: () => Promise<string | null>

  // Abrir URL en el browser del sistema
  openExternal: (url: string) => Promise<void>

  // Controles de ventana
  windowControl: {
    minimize: () => void,
    maximize: () => void,  // toggle maximize/restore
    close: () => void
  }

  // Zoom del webContents
  zoom: {
    setFactor: (factor: number) => void,   // 0.5 a 2.0
    getFactor: () => number,
    onChanged: (callback: (factor) => void) => () => void  // retorna unsubscribe
  }

  // Ventana popout para resultados
  openPopout: (data: object) => Promise<boolean>
  onPopoutClosed: (callback: () => void) => () => void
  onPopoutData: (callback: (data) => void) => () => void
  isPopoutWindow: () => Promise<boolean>
  requestPopoutData: () => Promise<object>
}
```

### Keyboard Shortcuts Globales (main.js)

```
Ctrl++ / Ctrl+= → zoom +0.1
Ctrl+-           → zoom -0.1
Ctrl+0           → zoom reset (1.0)
```

Estos son interceptados en `main.js` antes de que lleguen al renderer.

---

## 5. Express Server (`server/index.js`)

### Configuración Base

```javascript
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Fix BigInt serialization (DuckDB devuelve BigInt)
BigInt.prototype.toJSON = function() { return this.toString(); };

const PORT = 3001;
```

### Grupos de Endpoints

| Prefijo | Responsabilidad |
|---------|----------------|
| `/api/project/*` | Abrir proyecto, escanear DBs |
| `/api/files/*` | CRUD de archivos del proyecto |
| `/api/db/*` | Conectar/desconectar DuckDB, schemas, importar |
| `/api/query` | Ejecutar SQL |
| `/api/profile` | Perfilado estadístico de tablas |
| `/api/ai/*` | Chat AI, conversaciones, config de modelos |
| `/api/dbt/*` | Integración dbt (docs, manifest) |
| `/api/export-data` | Export CSV/Parquet/Excel |
| `/api/notebook-state` | Sidecar state de notebooks |
| `/api/snippets` | Snippets guardados por el usuario |
| `/api/bookmarks` | Bookmarks de queries |
| `/api/settings/*` | Config, gestión de modelos Ollama |

### Variable Global `ROOT_DIR`

El server mantiene una variable global `ROOT_DIR` que apunta al proyecto abierto actualmente:

```javascript
let ROOT_DIR = null; // null si no hay proyecto abierto

// Se actualiza cuando el usuario abre un proyecto
app.post('/api/project/open', (req, res) => {
  ROOT_DIR = req.body.path;
  // ...
});
```

Muchos endpoints usan `ROOT_DIR` para resolver rutas relativas de archivos del proyecto.

---

## 6. DatabaseManager (`server/DatabaseManager.js`)

Singleton que gestiona la conexión DuckDB.

```
Instancia única (singleton)
    ├── _systemInstance: DuckDBInstance(':memory:')   ← siempre vivo
    └── _attachedPath:   ruta del .duckdb del usuario ← null si no conectado

Flujo de conexión:
connect(dbPath)
    ├── Si ya hay una DB attached → reinitializeSystem()
    ├── ATTACH 'path.duckdb' AS user_db
    ├── USE user_db
    └── _initHistory() → CREATE TABLE IF NOT EXISTS amox_query_history

Tipos de queries:
    query(sql)            → resultado rows[]
    queryWithMetadata(sql)→ { rows[], types{colName: type} }
    systemQuery(sql)      → igual que query() pero no se loguea en history
```

### Esquemas Internos Ocultos

```javascript
// server/index.js
const INTERNAL_SCHEMAS = ['information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains'];
const INTERNAL_TABLES_MAIN = ['amox_query_history'];
```

Todos los endpoints que listan tablas usan `userTablesWhereClause()` para filtrar estos schemas.

---

## 7. Configuración del Usuario

**Ubicación:** `~/.amoxsql/config.json`

```json
{
  "recentProjects": ["path/to/project1", "path/to/project2"],
  "lastProject": "path/to/last/opened",
  "aiConfig": {
    "provider": "ollama",
    "model": "llama3.1:8b",
    "tier": "medium"
  }
}
```

El server lee y escribe este archivo. El renderer lo accede via endpoints `/api/settings/*`.

---

## 8. Flujo Dev vs Producción

### Desarrollo (`npm start`)

```
concurrently:
  [0] cd client && npm run dev     → Vite en :5173
  [1] wait-on :5173 && electron .  → Electron carga :5173
                                     server corre con nodemon en :3001
```

Electron en dev abre DevTools automáticamente. El server se puede reiniciar sin reiniciar Electron (nodemon).

### Producción (`npm run dist`)

```
npm run client:build → client/dist/ (HTML + JS + CSS bundleado)
electron-builder    → empaqueta todo en instalador NSIS (Windows)
```

En producción:
- El renderer carga `client/dist/index.html` (no Vite)
- El server corre como `utilityProcess` spawneado por `main.js`
- Los módulos nativos (DuckDB) están precompilados para el ABI de Electron

**Si DuckDB falla al cargar en la build:** re-correr `npm run postinstall` para recompilar contra el ABI correcto.

---

## 9. Debugging

### Debuggear el Renderer (React)

En desarrollo, DevTools se abren automáticamente. En cualquier momento: `Ctrl+Shift+I` o `F12`.

### Debuggear el Server (Express)

En desarrollo, los logs del server aparecen en la terminal donde corrió `npm start`:
```
[1] [Server] Listening on port 3001
[1] [AI] Loaded 3 skills
[1] [DB] Connected to /path/to/db.duckdb
```

Para inspeccionar el server con node debugger:
```bash
# En una terminal separada (no npm start)
node --inspect server/index.js
# Luego abrir chrome://inspect en Chrome
```

### Debuggear el utilityProcess (Producción)

En la build de producción, el stdout del utilityProcess se redirige al main process. Los logs aparecen en:
- Windows: `%APPDATA%\amoxsql\logs\` (si electron-builder configura logging)
- O en la consola de Electron si se abre desde terminal: `& "path/to/AmoxSQL.exe"`
