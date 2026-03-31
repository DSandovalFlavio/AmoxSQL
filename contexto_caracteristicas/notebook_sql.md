# Sistema de SQL Notebook (.sqlnb)

## Arquitectura General

El sistema de notebooks permite crear documentos interactivos con celdas SQL, Markdown e Input, con ejecucion secuencial, variables reactivas y persistencia de estado embebida.

---

## Archivos Clave

| Archivo | Responsabilidad |
|---------|----------------|
| `client/src/components/SqlNotebook.jsx` (627 lineas) | Orquestador: celdas, ejecucion, estado, serializacion |
| `client/src/components/NotebookCell.jsx` (512 lineas) | Celda individual: SQL editor, Markdown, Input, CTE debug |
| `client/src/utils/notebookParser.js` (143 lineas) | Formato de archivo JSON v3.0, legacy v2.0, migracion sidecar |
| `client/src/components/EditorPane.jsx` (lineas 277-413) | Deteccion de .sqlnb y renderizado de notebook |
| `server/index.js` (lineas 1974-2006) | Endpoints de notebook-state (sidecar) |

---

## Formato de Archivo (.sqlnb)

### JSON v3.0 (Actual)

```json
{
  "version": "3.0",
  "cells": [
    {
      "id": "1234567890",
      "type": "code",
      "content": "SELECT * FROM table WHERE date = {{startDate}}",
      "metadata": {},
      "state": {
        "chartConfig": { ... },
        "viewMode": "chart",
        "resultHeight": 500,
        "result": {
          "data": [...],
          "executionTime": 245,
          "totalRows": 100,
          "truncated": false
        }
      }
    },
    {
      "id": "1234567891",
      "type": "input",
      "content": "2024-01-01",
      "metadata": { "varName": "startDate", "inputType": "date" }
    },
    {
      "id": "1234567892",
      "type": "markdown",
      "content": "# Analisis de ventas\nResumen del periodo..."
    }
  ],
  "environment": {
    "startDate": "2024-01-01"
  }
}
```

### Legacy v2.0 (Marcadores)
```sql
-- !CELL:CODE!
SELECT * FROM users;
-- !CELL:MARKDOWN!
-- # Titulo
-- Descripcion aqui
```
- Sin estado embebido (se persiste en `.sqlnb.state.json` sidecar)
- Migracion automatica one-time a v3.0 al abrir

### Constantes
- `MAX_CACHED_ROWS = 500` — Resultados truncados en serializacion
- IDs generados: `Date.now().toString() + Math.random().toString()`

---

## Tipos de Celda

### 1. Code (SQL)
- Editor Monaco embebido con autocompletado completo
- Ejecucion: Ctrl+Enter o boton Run
- Resultados en `ResultsTable` con chart/profile
- CTE Debugging: extrae definicion CTE y ejecuta aislada
- Popout: envia resultados a ventana Electron separada
- Resize de panel de resultados (150px - 1200px, default 400px)

### 2. Markdown
- Doble click para editar (textarea)
- Preview con ReactMarkdown
- Blur para guardar
- Prefijo `-- ` en formato legacy v2.0

### 3. Input (Variables)
- Variable con nombre en `{{ }}` brackets
- Tipos: text, number, date
- Dispara ejecucion reactiva de celdas dependientes
- Metadata: `{ varName, inputType }`

---

## Motor de Ejecucion

### Ejecucion Individual (`handleRun`, lineas 272-293)
```
1. injectEnvironmentVariables(query, env) — Reemplaza {{varName}}
2. setResults[cellId] = { loading: true }
3. await onRunQuery(injectedQuery) — POST /api/query
4. setResults[cellId] = { data, types, executionTime, executedQuery }
5. saveStateOnly() — Debounced 1000ms
```

### Inyeccion de Variables (`injectEnvironmentVariables`, lineas 262-270)
```javascript
// Regex: \{\{\s*varName\s*\}\}
// Strings: 'value' (con comillas)
// Numbers: 123 (sin comillas)
// Ejemplo: "WHERE date = {{startDate}}" -> "WHERE date = '2024-01-01'"
```

### Ejecucion Batch (`runCellsSequentially`, lineas 296-324)
- Filtra solo celdas code no vacias
- Ejecuta secuencialmente
- **Se detiene en el primer error**: `if (result?.error) break;`
- Tracking de progreso: `batchProgress = { current, total }`

### Atajos de Ejecucion (lineas 326-340)
- `runAll()` — Todas las celdas en orden
- `runAbove(cellId)` — Desde la primera hasta la celda indicada
- `runBelow(cellId)` — Desde la celda indicada hasta la ultima

### Ejecucion Reactiva / DAG (lineas 350-365)
```
Input cell cambia valor
  -> handleEnvironmentChange(key, value)
  -> setEnvironment(newEnv)
  -> Scan ALL cells: regex.test(cell.content) para {{key}}
  -> Para cada match: handleRun(cell.id, null, newEnv)
```
- **No hay grafo de dependencias explicito** — inferencia por regex
- Ejecucion secuencial de celdas dependientes

---

## Persistencia de Estado

### Timeline de Guardado
1. **Mount** (lineas 53-87): Parse JSON, extrae cells/environment/state, migracion sidecar
2. **Cambio de contenido**: Debounce 500ms → `save(updatedCells)`
3. **Cambio de estado visual**: Debounce 1000ms → `saveStateOnly()`
4. **Boton Save**: Inmediato → `onSave()` → App escribe via `/api/file`

### Serializacion (`serializeNotebookContent`, parser lineas 103-142)
- Extrae `.state` de cada celda
- Limpia state: solo `chartConfig`, `viewMode`, `resultHeight`, `result`
- Solo incluye `resultHeight` si != 400 (default)
- Trunca resultados cacheados a 500 filas
- Si data > 500: `{ data: data.slice(0,500), totalRows, truncated: true }`
- Retorna JSON pretty-printed (2-space indent)

### Migracion Sidecar (lineas 89-129)
- Busca `{filePath}.state.json` via GET `/api/notebook-state`
- Mapea estado index-based (v2.0) a ID-based (v3.0)
- Solo aplica si estado v3.0 esta vacio
- **Prioridad**: v3.0 embebido > v2.0 sidecar

---

## CTE Debugging (NotebookCell.jsx, lineas 169-228)

```
1. Click "Debug CTE" en menu contextual
2. Parsea definicion CTE por matching de parentesis balanceados
3. Construye query: {CTE parcial} SELECT * FROM cteName LIMIT 100
4. Inyecta variables de ambiente
5. POST /api/query
6. Muestra resultados en DebugResultModal
```

---

## Popout Window (NotebookCell.jsx, lineas 47-82)

- Electron API: `window.electronAPI.openPopout(payload)`
- Payload: `{ data, types, executionTime, query, cellTitle }`
- Auto-update cuando cambian resultados
- Placeholder en celda: "Results are actively displayed in a detached window"

---

## Modos de Vista

### Edit Mode (default)
- Todas las celdas editables
- Toolbar completo con controles
- Drag & drop para reordenar

### Report Mode
- Layout centrado, fondo blanco, max-width 900px
- Toggle "Show Code" / "Code Hidden"
- Boton Print para impresion
- Export HTML con `generateHtmlReport()`

### Presentation Mode (lineas 480-487)
- Overlay fullscreen (z-index: 99999)
- Portal rendering a document.body
- Esc para salir

---

## Operaciones de Celda

| Operacion | Metodo | Detalle |
|-----------|--------|---------|
| Agregar | `addCell(type)` | ID = timestamp, se inserta al final |
| Eliminar | `deleteCell(id)` → `confirmDeleteCell()` | Modal de confirmacion, limpia state/results |
| Mover | `moveCell(id, direction)` | Reordena up/down en array |
| Editar | `updateCell(id, content, metadata)` | Debounced 500ms |
| Drag & Drop | `handleCellDrag*` | Calcula indice de drop, guarda despues |

---

## Integracion con EditorPane

```javascript
// EditorPane.jsx lineas 277-279
const isNotebook = activeTab.name.endsWith('.sqlnb') || activeTab.type === 'sqlnb';

// Renderizado lineas 401-413
<SqlNotebook
  key={activeTab.id}
  content={activeTab.content}
  onChange={(val) => onContentChange(activeTab.id, val)}
  onRunQuery={(q) => onRunQuery(activeTab.id, q)}
  onSave={() => onSave && onSave()}
  filePath={activeTab.path || null}
  onToggleAi={onToggleAi}
  showAiSidebar={showAiSidebar}
/>
```

---

## CSS Classes Principales

| Clase | Proposito |
|-------|-----------|
| `.snb-toolbar` | Toolbar principal del notebook |
| `.snb-mode-switcher` | Toggle Edit/Report (pill) |
| `.snb-btn--run`, `.snb-btn--stop` | Botones de ejecucion |
| `.nb-cell` | Contenedor de celda |
| `.nb-cell.dragging` | Opacity 0.4 durante drag |
| `.nb-accent--code/input/text` | Borde izquierdo por tipo |
| `.nb-type-badge` | Indicador de tipo de celda |
| `.nb-results-height` | Panel de resultados scrollable |
| `.nb-resize-handle` | Handle para redimensionar |
| `.nb-input-var-wrap` | Variable `{{}}` con estilo |
| `.notebook-fullview-overlay` | Overlay de presentacion |
