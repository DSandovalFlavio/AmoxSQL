# Layout Manager, Tabs, Resultados y Visualizacion

## A) Layout Manager y Sistema de Tabs

### Archivo: `client/src/components/LayoutManager.jsx` (776 lineas)

### Arquitectura de Tabs

**Persistencia** (lineas 9-99):
- `sessionStorage` bajo key `'amoxsql-open-tabs'`
- Se persiste en cada cambio (useEffect lineas 35-53)
- Restaura tabs con contenido al montar (lineas 56-99)

**Estructura de Tab:**
```javascript
{
  id: string,        // Unico
  path: string,      // Ruta del archivo
  name: string,      // Nombre para mostrar
  type: string,      // sql, sqlnb, sqlchain, md, er-diagram
  content: string,   // Contenido del archivo
  results: object,   // Resultados de ejecucion
  dirty: boolean     // Cambios sin guardar
}
```

### Split-Pane (lineas 13-21)
- `splitEnabled`: Boolean activo/inactivo
- `activePane`: 'left' | 'right'
- Arrays separados: `leftTabs`, `rightTabs` con IDs activos
- Auto-merge: Panel derecho se cierra cuando queda vacio (lineas 560-565)

### Tab Management

| Funcion | Lineas | Descripcion |
|---------|--------|-------------|
| `handleTabClose` | 128-154 | Cierra tab, activa la anterior |
| `handleContentChange` | 119-126 | Busca tab en ambos paneles, marca dirty |
| `createNew` | 330-358 | Crea archivo untitled (normaliza tipo) |
| `openFile` | 376-401 | Abre existente, previene duplicados |
| `handleQueryFile` | 497-542 | Archivos dropped (CSV, Excel, SQL, JSON, Parquet) |

### Drag & Drop de Tabs (lineas 544-681)
- Reordenar dentro del panel (`handleReorder`, lineas 664-681)
- Mover entre paneles (`moveTabToPane`, lineas 631-661)
- Drop zones: left-edge, right-edge, left-pane, right-pane
- Listeners globales (lineas 567-629)

### Ejecucion de Queries (`executeQuery`, lineas 189-229)
```
1. POST http://localhost:3001/api/query con variables resueltas
2. Retorna: { data, types, executionTime }
3. Actualiza tab results + dirty flag
4. Invalida cache si detecta DDL/DML (lineas 213-216)
```

### Parseo de Errores DuckDB (lineas 157-187)
- Regex para extraer LINE/column: "LINE N:", "line N:C", posicion de caret
- Retorna `{line, column, message}` para highlighting inline

### Query Plan (lineas 272-327)
- Wraps query en `EXPLAIN (FORMAT JSON)`
- Parsea JSON output, cachea en estado
- Fallback para columna explain_value faltante

### Metodos Expuestos (useImperativeHandle, lineas 361-494)
- `getTabBarProps()` — Para WindowTitleBar
- `openFile()`, `createNew()` — Operaciones de archivo
- `handleTriggerRun()`, `handleTriggerSave()`, `handleTriggerAnalyze()`
- `updateActiveContent()`, `updateActiveChartConfig()` — Hooks de AI
- `getActiveTabInfo()` — Metadata del tab activo
- `handleEditChart()` — Abre `.amoxvis`, auto-ejecuta query

---

## B) EditorPane

### Archivo: `client/src/components/EditorPane.jsx` (567 lineas)

### Deteccion de Contenido (lineas 277-279)
```javascript
const isNotebook = activeTab.name.endsWith('.sqlnb') || activeTab.type === 'sqlnb';
const isChain = activeTab.name.endsWith('.sqlchain') || activeTab.type === 'sqlchain';
const isErDiagram = activeTab.type === 'er-diagram';
// Default: SQL editor
```

### Layouts de Resultados
- **Vertical**: Editor izquierda, resultados derecha (width-resizable)
- **Horizontal** (default): Editor arriba, resultados abajo (height-resizable)
- Resize: drag handler (lineas 525-528), ghost indicator (lineas 540-541)
- Min/max constraints por layout

### Action Bar (lineas 418-498)
- Run + Analyze buttons
- Save dropdown (Save, Save As)
- Variables toggle (muestra count)
- Timestamps: "Edited X ago", "Ran Y ago" (lineas 293-301)
- AI Toggle

### CTE Debugging (lineas 190-253)
- Parsea CTE por regex + matching de parentesis
- Construye query parcial + `SELECT * FROM cteName`
- Modal con resultados

### Popout Window (lineas 86-110)
- Envia resultados a ventana Electron separada
- `window.electronAPI.openPopout(payload)`

### Drop Zone (lineas 349-379)
- Counter-based show/hide para drag events
- Overlay con icono de carpeta y guia de importacion

---

## C) ResultsTable

### Archivo: `client/src/components/ResultsTable.jsx` (636 lineas)

### View Modes (lineas 19-25)
| Modo | Descripcion |
|------|-------------|
| `table` | Grid paginado con filtros y busqueda |
| `chart` | DataVisualizer con panel de config |
| `profile` | DataProfiler para analisis estadistico |

Default: `editorSettings.defaultViewMode` o `chart` si hay config existente

### Funcionalidades de Tabla

| Feature | Lineas | Detalle |
|---------|--------|---------|
| Paginacion | 175-181 | 50/100/500/1000 por pagina |
| Sorting | 195-201 | Click header para asc/desc |
| Busqueda global | 119-145 | Filtra todas las columnas |
| Filtros por columna | 132-141, 388 | Texto por columna (opcional) |
| Resize columnas | 42-92 | Drag border, persiste widths |
| Context menu | 39, 506-630 | Right-click: sort, copy, etc. |

### Formateo de Columnas (lineas 338-367)
- **NULL**: `<span className="rt-null">NULL</span>`
- **Numeros**: `toLocaleString()`, float max 4 decimales
- **Fechas ISO**: Split en 'T', remove 'Z'
- **Objetos**: `JSON.stringify()`
- Hover tooltips para valor completo

### Exportacion (lineas 208-262)

| Formato | Metodo | Detalle |
|---------|--------|---------|
| CSV | `handleExportCsv` | Con BOM character + headers |
| JSON | `handleExportJson` | Full rows |
| Clipboard | `handleCopyClipboard` | TSV format |
| Worker | `runExportWorker` | Thread separado para CSV/JSON |

### Save to Database (lineas 313-336)
- Modal: nombre + tipo (VIEW o TABLE)
- SQL: `CREATE {type} "{name}" AS {cleanQuery}`
- Exito → `onDbChange()` refresca schema

### Analysis Vault (lineas 264-288)
- Save to Vault: titulo + tags
- POST `/api/ai/vault` con query, resultado, tags

---

## D) DataVisualizer

### Directorio: `client/src/components/DataVisualizer/`

### 57 Tipos de Chart (constants.js)
- **Barras**: bar, bar-stacked, bar-100, bar-horizontal
- **Lineas/Areas**: line, area, area-stacked
- **Circular**: donut
- **Scatter**: scatter, bubble (con size)
- **Avanzados**: combo (bar+line), funnel, heatmap, treemap

### Config Schema (DEFAULT_CONFIG, 50+ propiedades)

```javascript
{
  // Core
  chartType, xAxisKey, yAxisKeys, rightYAxisKey, splitByKey, bubbleSizeKey,

  // Data
  dateAggregation, sortMode, limit, isCumulative,

  // Labels
  showLabels, dataLabelPosition, dataLabelSize, tooltipShowPercent,

  // Colors
  colorTheme, backgroundTone, customBgColor, borderStyle, fontFamily,

  // Number Format
  numberFormat, decimalPlaces, // compact, standard, currency, %

  // Grid & Axes
  gridMode, showAxisLines, yLogScale, yAxisDomain, xAxisLabelAngle,

  // Line
  lineType, lineAreaFill, showDots,

  // Bar
  barStackMode, barRadius, barColorMode,

  // Donut
  donutThickness, donutLabelContent, donutCenterKpi,

  // Scatter
  scatterQuadrants,

  // Combo
  comboLineKeys,

  // Series
  seriesConfig, // per-series overrides

  // Storytelling
  chartTitle, chartSubtitle, chartFootnote, textAlign,

  // References
  refLine, refArea, goalLine, trendLine, headline
}
```

### Panels (6 tabs)

| Panel | Funcion |
|-------|---------|
| ChartTypeSelector | Browse 57 tipos por categoria |
| DataPanel | xAxis/yAxis key, splitBy, bubbleSize |
| DetailPanel | Label position, size, rotation, tick format |
| AxisPanel | Titles, domain, log scale, label angles |
| ThemePanel | Color palette, background tone, font, border |
| AnnotationsPanel | Title, subtitle, footer, story mode |

### ChartRenderer.jsx (870 lineas)
- **Recharts**: LineChart, AreaChart, BarChart, ComposedChart, PieChart, ScatterChart, FunnelChart, Treemap
- Tooltip formatter inteligente por tipo de chart
- Custom Dot: highlight (min/max/exact match)
- Reference elements: ReferenceLine (goal/trend), ReferenceArea (shading)
- Data labels: position (top, center, bottom), size scaling

### Procesamiento de Datos (utils/dataProcessing.js)
```
1. GROUP & AGGREGATE by xAxis + splitBy
2. Sorting (x-asc, x-desc, y-asc, y-desc)
3. Cumulative sum opcional
4. Limit rows
5. Retorna: { processedData, finalSeriesKeys }
```

### Color Palettes (16+)
- **Nombradas**: default, vivid, set1, set2, pastel, dark2
- **Secuenciales**: blues, greens, reds, purples, ylorbr (8 colores)
- **Divergentes**: spectral, rdylbu, rdylgn, piyg (6-8 colores)
- **Brand**: ocean, sunset, corporate, neon (4-6 colores)

### Fuentes (7 familias)
- System Default, Inter, Roboto, Outfit, Source Sans Pro, JetBrains Mono, Poppins

### Export Presets (5 tamanos)
| Preset | Resolucion |
|--------|------------|
| PowerPoint 16:9 | 1920x1080 |
| PowerPoint 4:3 | 1440x1080 |
| Square 1:1 | 1080x1080 |
| Phone Story 9:16 | 1080x1920 |
| Wide Banner | 1200x628 |

### Archivos .amoxvis
- Formato: JSON
- Contenido: config serializada + query string
- Se puede cargar de vuelta al DataVisualizer
- Abrir via `handleEditChart()` en LayoutManager

---

## E) Data Profiler

### Archivo: `client/src/components/DataProfiler.jsx` (490 lineas)

### Fetch de Perfil (lineas 18-141)
- POST `/api/profile` con query
- Cache key: evita re-fetch si misma query
- Loading state durante fetch

### Datos por Columna (lineas 42-80)
- **Basico**: nombre, total rows, null count/%, unique count/%
- **Numerico**: min, max, mean, median, stddev, skewness, kurtosis, zeros, negativos
- **Texto**: max/min/avg length
- **Visuales**: histograma (5 bins) o top 5 valores

### Alertas (lineas 91-125)

| Severidad | Condicion |
|-----------|-----------|
| **Danger** | Filas duplicadas exactas, >95% missing, valor constante |
| **Warning** | >50% missing, alta cardinalidad (>90% unique), alta correlacion (>0.95) |
| **Info** | Alto skewness (\|3\|), muchos ceros (>50%), alta cardinalidad texto |

### Layout (lineas 179-487)
- **Overview**: # variables, # observaciones, missing %, duplicados
- **Variables**: Card por columna con distribucion + stats
- **Correlaciones**: Heatmap de Pearson (azul positivo, rojo negativo)

### Backend (server/index.js, lineas 1490-1642)
```
POST /api/profile
  -> DuckDB SUMMARIZE (stats core por columna)
  -> Stats globales: row count, duplicate rows
  -> Avanzado: SKEWNESS, KURTOSIS, zeros, text length
  -> Correlaciones: CORR() para todos los pares numericos
  -> Histogramas: 5 bins para numerico, top 5 para texto
  -> Retorna: { profile, visuals, advanced, global, correlations, executionTime }
```
