# AmoxSQL — Mapa Completo de la Aplicación (v3.5.0)

> Cartografía integral de features, componentes, endpoints, flujos de datos, estado y formatos de
> archivo. Complementa a [arquitectura.md](arquitectura.md) (topología de procesos) y a los docs
> por feature de `contexto_caracteristicas/`. Generado como parte de la auditoría 2026-07-04
> ([auditoria_rendimiento_2026-07.md](auditoria_rendimiento_2026-07.md)); actualizar al añadir
> features, endpoints o formatos.

---

## 1. Inventario de features

| Feature (nombre oficial) | Componentes principales | Endpoints | Formatos |
|---|---|---|---|
| **Fases de la app** (WELCOME → IDE) | `App.jsx`, `WelcomeScreen.jsx`, `WorkspaceWizard.jsx` | `/api/project/*` | — |
| **Editor SQL** — Monaco + autocomplete DuckDB + CTE debug + variables `${VAR}` | `SqlEditor.jsx` (57KB), `EditorPane.jsx`, `VariablesBar.jsx` | `POST /api/query`, `/api/query/cancel/:id`, `/api/db/describe` | `.sql` |
| **SQL Notebook** — celdas CODE/MARKDOWN/INPUT, ejecución individual o secuencial | `SqlNotebook.jsx`, `NotebookCell.jsx`, `MarkdownEditor.jsx` | `/api/file`, `/api/notebook-state`, `/api/query` | `.sqlnb` + sidecar `.sqlnb.state.json` |
| **ResultsTable** — resultados paginados (NO virtualizar — vetado), sort/filter, pop-out | `ResultsTable.jsx` (38KB), `PopoutResultsPage.jsx` | `/api/export-data`, `/api/profile` | — |
| **Data Profiler** — perfilado estadístico (SUMMARIZE) | `DataProfiler.jsx` | `POST /api/profile` | — |
| **Story Flow** — visualización narrativa en 6 etapas (Type→Data→Format→Style→Story→Export), 15+ tipos Recharts, anotaciones/takeaway/énfasis, tour | `DataVisualizer/` (~17 comps), `StoryFlowGuide.jsx`, `AmoxvisPane.jsx` | `/api/ai/chart-story`, `/api/files/write-binary` | `.amoxvis` |
| **Report Flow** — decks markdown-first con gráficos refrescables, export Office editable | `deck/DeckEditor.jsx`, `SlideDesigner.jsx`, `AmoxChartEmbed.jsx` | `/api/file` | `.amoxdeck` → `.pptx`/`.docx`/HTML |
| **Data Flow (Chains)** — DAG visual de pipelines, 35+ tipos de nodo, checkpoints, SSE de logs | `chains/` (~42 archivos), `ChainEditor.jsx`, `ChainCanvas.jsx` | `/api/chains/*` | `.sqlchain` |
| **Deep Dive / AI Sidebar** — chat agentic con streaming, tools, plan, inspector, memorias, skills, vault | `AiSidebar.jsx`, `ai/` (~20 comps), `AiDivingPanel.jsx`, `DeepDiveInspector.jsx` | `/api/ai/*` (SSE: `/api/ai/chat/stream`) | `RULES.md`, `agent/skills/`, `.amoxsql/context/` |
| **Database Explorer / ER Diagram** | `DatabaseExplorer.jsx`, `ErDiagram.jsx`, `TableDetailsModal.jsx` | `/api/db/schemas`, `/api/db/er-schema`, `/api/db/table-details` | — |
| **File Explorer** — CRUD, drag-drop, context menu | `FileExplorer.jsx` (54KB) | `/api/files/*`, `/api/file/*`, `/api/folder` | — |
| **DBT** — detección, manifest, lineage, ejecución | `DbtPanel.jsx` (57KB), `DbtLineageGraph.jsx` | `/api/dbt/*` | — |
| **Git** — status, stage, commit, branches, stash, diff | `GitPanel.jsx` | `/api/git/*` | — |
| **Import/Export** — CSV/Parquet/JSON/Excel in, CSV/Parquet/Excel out, cloud | `ImportModal.jsx`, `ImportExcelModal.jsx`, `ExportDataModal.jsx` | `/api/db/import*`, `/api/export-data`, `/api/export/cloud` | — |
| **Snippets / Bookmarks / Historial** | `SnippetsPanel.jsx`, `QueryHistoryPanel.jsx` | `/api/snippets`, `/api/bookmarks`, `/api/db/history` | — |
| **Extensiones DuckDB** | `ExtensionExplorer.jsx` | `/api/db/extensions*` | — |
| **Google Sheets** | `GSheetsSection.jsx`, nodo `GSheetRead` | `/api/gsheets/*` | — |
| **Command Palette** (Ctrl+Shift+P) | `CommandPalette.jsx` | — | — |
| **Settings** — tema, acentos, modelos AI (Ollama/Gemini/Anthropic/OpenAI/Vertex), editor, extensiones | `SettingsModal.jsx` (97KB) | `/api/settings/*` | `~/.amoxsql/config.json` |
| **Query Plan / Data Quality / Schema Diff** | `QueryPlanViewer.jsx`, `DataQualityModal.jsx`, `SchemaDiffModal.jsx` | `/api/db/explain` | — |

## 2. Mapa de componentes (`client/src/components/`, ~153 archivos)

### Raíz — shell y paneles
- `App.jsx` (44KB) — root: fases, tema/acento, sidebar (keep-alive por `visitedSidebarTabs`), modales lazy, título/tabs, zoom.
- `LayoutManager.jsx` (47KB) — dueño de tabs y splits (left/right), persistencia de tabs, drafts, imperative handle (`layoutRef`).
- `EditorPane.jsx` (32KB) — contenedor de un pane: detecta `.sqlnb`/`.amoxdeck`/`.amoxvis`/`.md`/`.sqlchain` y monta el editor correspondiente; action bar; ResultsTable.
- `WindowTitleBar.jsx` / `TabBar.jsx` / `MenuBar.jsx` — chrome de ventana (frameless).
- `ToastProvider.jsx` / `dialogs/DialogProvider.jsx` — contexts de notificaciones y diálogos.
- Paneles sidebar (keep-alive): `FileExplorer`, `DatabaseExplorer`, `ExtensionExplorer`, `DbtPanel`, `SnippetsPanel`, `QueryHistoryPanel`, `GitPanel`, `ai/ConversationList`, `ai/AnalysisVault`.
- Modales (mayoría lazy): `SettingsModal`, `ImportModal`, `ImportExcelModal`, `ExportDataModal`, `ExportAiContextModal`, `DataQualityModal`, `QueryPlanModal`, `SchemaDiffModal`, `TableDetailsModal`, `TablePreviewModal`, `FilePreviewModal`, `SaveQueryModal`, `SaveToDbModal`, `QueryHistoryModal`, `OpenProjectModal`, `DeleteConfirmModal`, `ChartGalleryModal`, `ExecutionChainModal`.
- Editores/vistas de contenido: `SqlEditor`, `SqlNotebook`+`NotebookCell`, `MarkdownEditor`, `ResultsTable`, `DataProfiler`, `ErDiagram`, `AmoxvisPane`, `CompareResults`, `QueryPlanViewer`.
- `onboarding/` — `OnboardingHost`, `Tour`.

### `DataVisualizer/` (Story Flow)
`DataVisualizer.jsx` (orquestador de 6 etapas) · `StoryFlowGuide.jsx` (tour) ·
`panels/`: ChartTypeSelector, DataPanel, FormatPanel, StylePanel, StoryPanel, ExportPanel, AxisPanel, DetailPanel, ThemePanel, PasteJsonModal, shared ·
`renderers/`: ChartRenderer (wrapper Recharts, memoizado), RichTooltip ·
`overlays/HeadlineOverlay.jsx` · `utils/richText.jsx`.

### `ai/` (Deep Dive y asistente)
`AiAssistantPanel` (chat estándar/notebook) · `AiDivingPanel` (Deep Dive) · `DeepDiveTranscript` / `DeepDiveInspector` / `AgentPlanPanel` / `deepDiveTurns.js` (derivación de turnos) · `ChatMessage` (markdown + bloques) · `SqlBlock` / `SqlActivityBlock` / `ToolCallBlock` / `ChatResultsBlock` / `EditProposalBlock` · `ConversationList` / `FileConversationList` · `MemoriesPanel` / `SkillsPanel` / `SessionInventory` / `AnalysisVault` / `AiContextPanel` / `AiModesGuide` · `ModelDropdown` · `useAiChat.js` (hook consumidor del SSE — compartido por Deep Dive y notebook) · `exportConversation.js`.

### `chains/` (Data Flow)
`ChainEditor` (orquestador) · `ChainCanvas` (viewport) · `ChainNodePalette` / `ChainNodeConfigPanel` / `ChainToolbar` / `ChainVariablesPanel` / `ChainDataPreview` / `ChainHistoryPanel` / `ChainLogPanel` / `ChainTemplateGallery` / `ChainAiPrompt` / `DataFlowGuide` / `NodeDocView` · `chainNodeTypes.js`, `chainUtils.js`, `chainValidation.js`, `useChainExecution.js` (polling solo durante ejecución) · `nodes/` — 35+ tipos (Import/Export, Join, GroupAggregate, Filter, Pivot/Unpivot, WindowFunctions, TypeCast, Clean, Deduplicate, Assert, SchemaValidation, Checkpoint, HttpFetch, GSheetRead, BucketRead, AiEnrich, SqlInline/SqlFile, etc.). Ver memoria "Anatomía de un nodo de Chains" para añadir nodos.

### `deck/` (Report Flow)
`DeckEditor` (markdown + preview) · `SlideDesigner` (edición visual slide activa) · `SlidePreview` · `AmoxChartEmbed` (monta un `.amoxvis` → DataVisualizer) · `DeckSidePanel` · `deckLayoutPreviews` · `panels/`: SlidesPanel, ChartsPanel, LayoutsPanel.

### `markdown/`
`MarkdownPreview.jsx` — renderer con soporte de bloques ` ```amoxchart ` (usado por notebook, deck y editor markdown).

### Utilidades clave (`client/src/utils/` y afines)
`notebookParser.js` (parse/serialize `.sqlnb` v2/v3 + legacy) · `deckParser.js` (`.amoxdeck`) · `generateHtmlReport.js` / `generatePptxReport.js` / `generateWordReport.js` · `draftSaver.js` (drafts a localStorage) · `client/src/workers/sqlLanguageWorker.js` + `sqlWorkerBridge.js` (tree-sitter SQL en Web Worker) · `client/src/api.js` (`API_BASE` con puerto dinámico) · `client/src/state/sidebarCache.js`.

## 3. Mapa del server

### Módulos
| Módulo | Rol |
|---|---|
| `server/index.js` (~88KB) | Todos los endpoints REST + SSE |
| `server/DatabaseManager.js` | Singleton DuckDB Neo: conexión, query con metadata, historial, interrupt |
| `server/AiManager.js` | Providers (Ollama/Gemini/Anthropic/OpenAI/Vertex), `chat()` con tool-loop, legacy `generateQuery()` |
| `server/ChainExecutor.js` (113KB) | Ejecución de DAGs `.sqlchain` (topological sort, checkpoints, SSE de logs) |
| `server/ChainPersistence.js` | Schema `amoxsql_chains` (historial de runs) |
| `server/projectScaffolder.js` | Setup de carpetas de workspace |
| `server/git/gitManager.js` | Wrapper de operaciones git |

### Subsistema `server/ai/`
| Módulo | Rol |
|---|---|
| `agenticLoop.js` (32KB) | Loop agentic streaming (async generator → eventos SSE), planner por defecto |
| `tools.js` (64KB) | execute_sql, list_tables, describe_table, display_chart, suggest_followups |
| `tools_planner.js` | create_plan, update_plan, final_answer, ask_user |
| `prompt/` | Composer modular del system prompt (`index.js` + schema/tools/modes/context; `buildSystemParts` para prompt caching de Anthropic) |
| `persistence.js` (35KB) | CRUD en `amoxsql_ai` (conversaciones, mensajes, resultados, cache, plans, métricas, scratchpad) |
| `memory.js` / `skills.js` / `contextLoader.js` / `userRules.js` | Memorias cross-conversación / skills de `agent/skills/` / `.amoxsql/context/` / `RULES.md` |
| `modelProfiles.js` | Perfiles de capacidad por modelo |
| `promptOnlyMode.js` | Fallback sin tool-calling |
| `compaction.js` | Gestión de ventana de contexto |
| `profiling.js` / `chartStory.js` / `findingsLinter.js` / `joinSanityCheck.js` / `chainGenerator.js` / `testRunner.js` / `_sqlHelpers.js` | Auxiliares |

### Endpoints por prefijo (~110 en total)
- **`/api/project/*`** — path, open, scaffold(-status), config GET/PUT, folder-defs, scan-dbs.
- **`/api/query`** — ejecutar SQL (con `applyRowLimit`); `/api/query/cancel/:queryId`.
- **`/api/db/*`** — connect, close, location, version, tables, schemas, er-schema, file-schema, history, describe, explain, table-details, import, import-excel, extensions (list/install/load).
- **`/api/files/*` + `/api/file/*` + `/api/folder(s)`** — listado (recursivo/por path), CRUD, rename/move/copy/reveal, find-by-extension, write-binary, inspect-excel, inspect-columns.
- **`/api/ai/*`** — status/init/context-status/context-setup; `chat` (legacy) y **`chat/stream` (SSE principal)**; chart-story; conversaciones (CRUD, by-file, star, title, title/auto, session-name, context-objects, messages, query-results, chart-configs); skills (list/:id); sessions + artifacts; memories (CRUD); vault (CRUD); query-cache/:queryId; tests (list/run); export-context; generate (deprecated).
- **`/api/chains/*`** — run (+status/cancel/resume/`stream` SSE), history (CRUD), validate, export-yaml/import-yaml, export-sql, create-sql-file, scan-folder, preview-node, schema/infer, detect-result-type, ai/generate.
- **`/api/dbt/*`** — validate-env, conda-envs, check-env-dbt, detect, init, manifest, profiles GET/POST, project-config GET/POST, template/{model,source,test,macro}, command, execute.
- **`/api/git/*`** — available, status, init, stage/unstage, commit, diff, log, branches, branch (create/delete), checkout, discard, stash (push/pop/list).
- **`/api/settings/*`** — config GET/POST, models/:provider, gemini/models, ollama/models(+enriched)/pull, cloud/test-adc.
- **`/api/gsheets/*`** — setup, status, sheets (CRUD), preview/:id, test.
- **Otros** — `/api/profile`, `/api/export-data`, `/api/export/cloud(+test)`, `/api/notebook-state` GET/POST, `/api/snippets`, `/api/bookmarks`, `/api/functions/{refresh,catalog,coverage}`, `/api/schema`, `/api/shutdown`.

## 4. Flujos de datos clave

### A) Query del editor → ResultsTable
`SqlEditor` (Ctrl+Enter) → `POST /api/query {sql, params}` → `DatabaseManager.queryWithMetadata` (DuckDB Neo; auto-log a historial) → `{queryId, rows, columns, rowCount, executionTime}` → `ResultsTable` pagina/ordena/filtra → export opcional vía `/api/export-data`.

### B) Turno AI con tools (streaming)
`useAiChat` → `POST /api/ai/chat/stream` (fetch + ReadableStream) → server: `buildTableContext` + system prompt (schema/skills/rules/memories/context) → `agenticLoop` con `streamText` del AI SDK → eventos SSE `text-delta` / `tool-call` / `tool-result` / `finish` → tools ejecutan contra DuckDB (execute_sql cachea en `query_cache`) → cliente renderiza turnos (transcript + inspector en Deep Dive) → persistencia por turno en `amoxsql_ai` → extracción de memorias en background al cerrar el turno.

### C) Notebook + sidecar
Abrir: `GET /api/file` → `parseNotebookContent` → celdas; `GET /api/notebook-state` → resultados/charts cacheados (migración de sidecar legacy). Editar: Monaco → debounce 300ms → `cells` → debounce 500ms → `serializeNotebookContent` (v3.0 embebe resultados) → `onChange` → tab content. Guardar: `POST /api/file` (+ estado). ⚠️ Ver auditoría G9: los resultados embebidos en `tab.content` son un problema de rendimiento; el plan es moverlos 100% al sidecar.

### D) Story Flow → `.amoxvis` → Report Flow
ResultsTable "Visualize" → `DataVisualizer` (6 etapas) → guardar config JSON como `.amoxvis` → reabrible en `AmoxvisPane`, embebible en `.amoxdeck` (bloque ` ```amoxchart ` con `src:` + `overrides:`) → export PPTX/Word/HTML con gráficos nativos/refrescables.

### E) Arranque
`electron/main.js` (single-instance lock) → prod: `utilityProcess.fork(server)` con puerto 3001 o asignado por el SO → puerto al renderer vía `process.parentPort`/preload → `window.__API_PORT__` → `API_BASE`. Dev: Vite :5173 + server en terminal; DevTools auto-abierto. Preload expone solo `electronAPI` (dialogs, window controls, zoom nativo por `setZoomFactor`, popout). Al abrir proyecto: `DatabaseManager.connect` + init de schemas `amoxsql_ai` y `amoxsql_chains`.

## 5. Estado y persistencia

- **localStorage**: `amoxsql-theme`, `amoxsql-accent`, `amoxsql-editor-layout`, `amoxsql-editor-settings`, `amoxsql-sidebar-width`, `amoxsql-ui-zoom`, drafts de archivos (draftSaver) y tabs (LayoutManager).
- **sessionStorage**: `amoxsql-open-tabs`.
- **`~/.amoxsql/config.json`**: proyectos recientes, provider/modelo AI, defaults de editor/export.
- **Schemas DuckDB internos** (ocultos del explorador por prefijo `amoxsql%`; intermedias de chains `__chain_*`):
  - `amoxsql_ai`: conversations, messages, query_results, chart_configs, memories, session_artifacts, analysis_vault, query_cache, plans, conversation_metrics, scratchpad; + historial de queries.
  - `amoxsql_chains`: execution_history, node_outputs.
- **Sidecars**: `.sqlnb.state.json` (resultados/charts por celda).

## 6. Formatos de archivo propios

| Formato | Estructura | Parser/Loader |
|---|---|---|
| `.sqlnb` | JSON v3.0: `{version, cells:[{id,type:code\|markdown\|input,content,...}], environment, metadata}` (v3 embebe resultados; legacy con marcadores `-- !CELL:*!` soportado) | `client/src/utils/notebookParser.js` |
| `.sqlnb.state.json` | `{cellResults, cellCharts, cellErrors, lastSavedAt}` | endpoint `/api/notebook-state` |
| `.amoxvis` | JSON: `{version, type, data{source,columns}, format{scales,domains,formats}, style{palette,legend,...}, story{title,annotations,takeaway,emphasis}, metadata}` | carga directa JSON → DataVisualizer |
| `.amoxdeck` | Markdown: front-matter YAML (`title, theme, aspect, variables`) + slides separadas por `---` + `<!-- layout: title\|content\|content-chart\|chart-full\|two-col -->` + bloques ` ```amoxchart ` (`src:` a un `.amoxvis`, `overrides:`) | `client/src/utils/deckParser.js` |
| `.sqlchain` | JSON: `{version, id, name, nodes:[{id,type,config}], edges:[{from,to}], variables, config{checkpoints,...}}` | `chains/chainNodeTypes.js` + `server/ChainExecutor.js` |
| `RULES.md` | Markdown libre: definiciones de negocio, guías SQL, columnas prohibidas — inyectado al system prompt | `server/ai/userRules.js` |
| `agent/skills/<id>/SKILL.md` | Front-matter YAML (`name, description, keywords, next`) + cuerpo markdown; ~15 skills incluidas | `server/ai/skills.js` (mtime-cached) |
| `.amoxsql/context/*.md\|yml` | `metrics.yml`, `joins.yml`, `glossary.md`, `examples/*.sql` — semantic layer local | `server/ai/contextLoader.js` |

## 7. Cifras de referencia

~153 componentes React · ~110 endpoints REST + 2 SSE (`/api/ai/chat/stream`, `/api/chains/run/:id/stream`) · 35+ tipos de nodo de Data Flow · 15+ tipos de gráfico Story Flow · 5 layouts de Report Flow · 5 tools del agente + 4 del planner · 15 skills. Todo el tráfico renderer↔server es HTTP/SSE local; IPC solo para dialogs, ventana, zoom y popout.
