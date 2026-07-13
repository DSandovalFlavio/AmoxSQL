# Auditoría de ubicación lógica de botones (toda la UI)

**Fecha:** 2026-07-13
**Origen:** tras arreglar el "Full Export" que vivía en resultados y re-ejecutaba la última query (stale) en vez de pertenecer a la query (editor). Se auditó TODA la interfaz buscando fallos de la misma clase.

**Clases de fallo buscadas:** (1) *wrong owner* — la acción opera sobre X pero vive en el contexto de Y; (2) *stale-state* — la ubicación hace que use un snapshot en vez del estado vivo; (3) *redundante/divergente* — misma acción en ≥2 lugares con comportamiento distinto; (4) *scope mismatch* — acción amplia entre acciones estrechas o viceversa; (5) *label↔location* — la etiqueta implica un alcance distinto al de su ubicación; (6) *gating* — se muestra cuando no puede funcionar.

**Cobertura:** editor + resultados; app bar / sidebar / explorador / command palette; notebook + AI; Story Flow / Report Flow / Data Flow / Settings.

Estado de verificación: ✔ = confirmado leyendo el código en esta sesión; ▸ = reportado por auditoría con file:line (alta confianza, sin re-verificar a mano).

---

## A. Fallos de UBICACIÓN LÓGICA (la clase pedida)

### A1 — "Metadata for AI" vive en el menú Download (filas mostradas) pero opera sobre la query del editor · MED ▸
`ResultsTable.jsx:541-543`. El menú "Download" dice *"Las filas cargadas en esta tabla"* y sus hermanos (CSV/JSON/Copy) usan `sortedData` (las filas visibles). Pero "Metadata for AI" alimenta `ExportAiContextModal` con `resolveEditorQuery() || query` (la **query del editor**), ignorando las filas. Misma clase que el bug del export: acción sobre la *query* dentro de un contenedor de *filas*.
**Reasignación:** sacarla del menú Download. Opción recomendada: moverla junto al botón **Export** del editor (ambas son "sobre la query"), o dejarla en resultados pero como botón propio separado con su propio texto ("Describe la query, no las filas").

### A2 — Analyze no resuelve variables; Run y Export sí · MED ✔
`LayoutManager.jsx:422` — `handleAnalyzeActive` manda `tab.content` crudo a `/api/db/explain`. Run (`:292`) y Export (`EditorPane` con `resolveVariables`) sustituyen `${var}`. Una query con variables corre y exporta bien pero **falla al Analizar**. Mismo dueño y texto vivo, pero inconsistencia de estado.
**Fix:** resolver variables en `handleAnalyzeActive` antes del fetch (pasar `queryVariables` y llamar `resolveVariables`, igual que `executeQuery`).

### A3 — Celda de notebook pasa contenido debounced (stale) para Metadata-for-AI / Vault · LOW ▸
`NotebookCell.jsx:539` pasa `currentEditorQuery={content}` (prop debounced ~400ms), no `contentRef.current` (buffer vivo). "Metadata for AI"/Vault dentro de la `ResultsTable` de la celda describen texto editado/sin correr mientras las filas reflejan la query vieja.
**Fix:** pasar un getter `currentEditorQuery={() => contentRef.current}` (ResultsTable ya soporta forma de función, `ResultsTable.jsx:16`).

### A4 — Vault y Metadata-for-AI discrepan en qué query gana · LOW ▸
`ResultsTable.jsx:280` Vault = `query || resolveEditorQuery()` (**snapshot primero**); `:667` Metadata = `resolveEditorQuery() || query` (**vivo primero**). Cuando el editor difiere de la última corrida, capturan SQL distinto sin razón visible.
**Fix:** una sola convención (vivo-primero, la dirección que fijó el fix del export) en ambos.

### A5 — "New File Here…" y los "New" del header ignoran la carpeta destino · MED ▸
`FileExplorer.jsx:963` (`onNewFile(file.path,'sql')`) y header `:626-637` pasan una carpeta, pero `App.handleNewFile` (`:756`) hace `createNew(type)` y descarta la ruta. "New File **Here**" no crea en la carpeta clicada.
**Fix:** propagar la carpeta a `createNew` (sembrar `path`/dir de guardado por defecto), o renombrar a "New File" y quitar la variante "Here".

### A6 — "Save to DB" entre herramientas de filas, pero persiste la query completa · LOW ▸
`ResultsTable.jsx:474-476` → `handleSaveToDb` hace `CREATE … AS <query>` (query completa), rodeado de acciones que respetan `sortedData` (search, filtros, Download). Su ubicación implica que guarda lo que se ve.
**Fix:** relabel a "Save query as table…" para que el alcance lea a nivel query.

### A7 — Context-menu "Sort Ascending" puede terminar en descendente · LOW ▸
`ResultsTable.jsx:697` llama `handleSort(col)` que **alterna**; si ya estaba asc, pasa a desc — contradice la etiqueta. El hermano "Sort Descending" (`:700`) fija `desc` directo.
**Fix:** `:697` → `setSortConfig({key:col, direction:'asc'})`.

### A8 — Settings: dos botones "Save" que ambos guardan TODO (y pierden GSheets) · MED-HIGH ▸
`SettingsModal.jsx:1774` ("Save AI Settings") y `:2201` ("Save Cloud Settings") llaman el mismo `handleSaveConfig` (`:767`) que postea el blob entero. "Save AI" también escribe credenciales S3/GCS y viceversa; las etiquetas mienten sobre su alcance (global). Peor: `gsheetsKeyPath` NO está en `handleSaveConfig` → quien escribe la ruta y da "Save Cloud Settings" la pierde (solo persiste con su propio "Save & Connect", `:2295`).
**Fix:** o un único botón honesto "Save Settings", o partir `handleSaveConfig` en savers por alcance (solo-AI / solo-cloud) para que cada botón escriba lo que promete; e incluir GSheets en el save de cloud.

### A9 — "Open in Story Flow" descarga un JSON en la ruta del sidebar · MED ▸
`ChatResultsBlock.jsx:329` — el botón dice "Open in Story Flow" pero `handleDownloadConfig` solo abre Story Flow si existe `onExportAmoxvis`; en el sidebar (`AiSidebar.jsx:646`) se renderiza `ChatMessage` **sin** esa prop, así que descarga `chart_config_*.json` y no abre nada.
**Fix:** pasar `onExportAmoxvis` de `AiSidebar` → `ChatMessage`, o hacer la etiqueta condicional ("Export config (.json)") cuando falta el callback.

### A10 — Deck "Image charts" (PPTX) no hace nada fuera de la vista Present · HIGH ▸
`DeckEditor.jsx:280` → `:106` — `handleExportPptx('image')` cosecha el DOM de `presentRef`, que solo existe en Present. En Design/Source produce slides con gráficos en blanco sin error visible. La etiqueta admite "(needs Present view)" pero el ítem nunca se deshabilita. Misma clase: lee un snapshot de DOM que puede no existir.
**Fix:** deshabilitar el ítem salvo en Present (con tooltip), o que el handler cambie a Present y espere el montaje antes de capturar.

---

## B. Bugs encontrados de paso (no son de ubicación, pero valiosos)

| # | Bug | Ubicación | Sev | Ver |
|---|---|---|---|---|
| B1 | **Save to Vault crashea**: usa `headers` (fuera de scope; debe ser `columns`) → `ReferenceError` antes del fetch | `ResultsTable.jsx:288` | HIGH | ✔ |
| B2 | **Import YAML reemplaza toda la chain sin confirmar** → pérdida de datos (la ruta de AI sí confirma, `:504`) | `ChainEditor.jsx:408-445` | HIGH | ▸ |
| B3 | **Ctrl+B duplicado** con `setShowSidebar` inexistente (código muerto tras el primer `return`; latente si se reordena) | `App.jsx:408-413` | MED | ✔ |
| B4 | **GSheets "Query Sheet"** llama `onQueryFile(null, sql, name)` — firma que nadie implementa → no hace nada | `FileExplorer.jsx:1093` | MED | ▸ |
| B5 | **"Retry" en AiSidebar no reintenta**: solo hace `setStatus('READY')`, no re-carga config | `AiSidebar.jsx:831,925` | MED | ▸ |
| B6 | **Delete con multi-selección borra solo uno** (context menu y tecla Delete usan `items[0]`) | `FileExplorer.jsx:596,1005` | MED | ▸ |
| B7 | **Runner de Execution Chain es código muerto** (`handleOpenChain`/`ExecutionChainModal` nunca se invocan) | `App.jsx:465-489,1429` | MED | ▸ |
| B8 | **"Copy Path"** usa regex identidad `/\//g→'/'`; entrega ruta relativa como "Copy Relative Path" | `FileExplorer.jsx:1015` | MED | ▸ |
| B9 | **"DBT: New Model"** en command palette solo abre el panel, no crea modelo | `CommandPalette.jsx:217` | LOW | ▸ |
| B10 | Tooltip "Ctrl+Shift+Enter" de Run All no está cableado | `SqlNotebook.jsx:442` | LOW | ▸ |
| B11 | Rama del selector de skills muerta (`isDiving` siempre false en el return del sidebar) | `AiSidebar.jsx:983` | LOW | ▸ |
| B12 | Múltiples gráficos de un turno colapsan a un `queryId` al recargar (¿superficie legacy?) | `AiSidebar.jsx:538-552` | MED? | ▸ |
| B13 | "Refresh all" del deck: spinner fijo de 600ms desacoplado de la recarga real | `DeckEditor.jsx:100` | LOW | ▸ |
| B14 | Gating tabular inconsistente: `.tsv/.txt` ofrecen Metadata-for-AI pero no Direct Query/Import | `FileExplorer.jsx:864,874,913` | LOW | ▸ |
| B15 | Props/estado muertos: `onPreviewFile` (FileExplorer), `showHistory`/`showHeaderMenu` (DatabaseExplorer), `onExportNotebook` (ChatResultsBlock), Run Query duplicado en palette | varios | LOW | ▸ |
| B16 | Fullscreen "PNG" pasa el evento como preset → siempre 1920×1080 "custom" | `DataVisualizer.jsx:411` | LOW | ▸ |
| B17 | "To Here" (chain) no abre el panel de logs como "Run All"/"From Here" | `ChainEditor.jsx:360` | LOW | ▸ |

---

## C. Ubicaciones verificadas CORRECTAS (contraejemplos)
- **Export** en el editor (fix reciente): usa `resolveVariables(activeTab.content)` — dueño y estado vivo correctos.
- **"Export results…"** en el menú `.sql` del explorador: lee el archivo de disco al hacer clic (fresco).
- **Notebook**: no replica el bug del export (la celda solo exporta filas en memoria; Run usa `contentRef.current` vivo). *Nota:* el notebook NO tiene export de query completa (gap de feature, no fallo de ubicación).
- **Story Flow Export**: `.amoxvis` usa `getConfigForSave()` vivo + el `query` del chart; PNG usa el DOM vivo del chart.
- **AI chart export**: ligado al `queryId` propio del chart, no a "la última query".
- **DatabaseExplorer / Data Flow toolbar / acciones por-slide del deck**: dueño y alcance correctos.
- **Command Palette**: se reconstruye por `useMemo` con deps de estado vivo (sin stale).

---

## D. Plan de implementación (por fases)

**F1 — Bugs de alto impacto (crash / pérdida de datos):** B1 (Vault crash), B2 (Import YAML confirmar), A10 (deck image export), A8 (Settings save/GSheets). Fixes pequeños y aislados.

**F2 — Fallos de ubicación de la clase pedida:** A1 (mover Metadata-for-AI), A2 (Analyze resuelve variables), A3 (getter en celda), A4 (convención de query única), A9 ("Open in Story Flow" en sidebar).

**F3 — Label/scope y consistencia:** A5 (New File Here), A6 (Save query as table), A7 (Sort Ascending), B5 (Retry), B6 (bulk delete), B4 (GSheets query).

**F4 — Limpieza / código muerto:** B3, B7, B8, B9, B10, B11, B13, B14, B15, B16, B17, B12.

Cada fase es independiente y se puede commitear por separado. Ninguna requiere cambios de esquema ni de servidor salvo B2/A8 (cliente) y, opcionalmente, un endpoint de ruta absoluta para B8.
