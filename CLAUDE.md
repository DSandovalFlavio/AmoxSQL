# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AmoxSQL — Project Guide

## Overview
**AmoxSQL** is a desktop SQL IDE for local data analysis, built with Electron + React + Express + DuckDB.
- **Version**: 5.14.0
- **Author**: Flavio Sandoval (@dsandovalflavio)
- **License**: AmoxSQL Community License (Source Available)
- **Tagline**: "The Modern Codex for Local Data Analysis"

## Runtime Topology (big picture)
Three processes cooperate at runtime:
1. **Electron main** ([electron/main.js](electron/main.js)) — owns the BrowserWindow, shows system notifications and manages the optional Windows scheduled task ([electron/programador.js](electron/programador.js): one task, `AmoxSQL.exe tick` at the next due time, InteractiveToken, off by default), holds the single-instance lock, handles native dialogs / window controls via `ipcMain`, and **spawns the Express server as a `utilityProcess`** on a dynamically assigned port (prefers 3001, falls back to OS-assigned if busy).
2. **Express server** ([server/index.js](server/index.js)) — all REST endpoints + DuckDB connection. The renderer talks to it over HTTP, not IPC. The actual port is communicated to the renderer via `process.parentPort` and stored in `window.__API_PORT__`.
3. **Renderer (React)** — in dev, loaded from Vite on `http://localhost:5173`; in prod, from `client/dist/`. The preload bridge ([electron/preload.js](electron/preload.js)) exposes only a narrow `window.electronAPI` for dialogs, shell-open, and window controls. Data calls go to `http://localhost:{dynamic_port}` via `API_BASE` from `client/src/api.js`.

When debugging "it works in dev but not in the built app," check (a) Vite dev server vs `client/dist` loading in `main.js`, and (b) whether the utility process spawned the server — server stdout is piped through main.

## Architecture

```
Electron Shell
├── electron/main.js          — Main process, IPC, window management
├── electron/preload.js       — Context bridge (electronAPI)
├── client/                   — React 19 SPA (Vite 7)
│   ├── src/App.jsx           — Root component, phase management
│   ├── src/components/       — 64+ components
│   └── src/utils/            — HTML report gen, notebook parser
└── server/                   — Express 5 backend (port 3001)
    ├── index.js              — 70+ REST endpoints (~2300 lines)
    ├── DatabaseManager.js    — DuckDB Neo API connection
    ├── AiManager.js          — AI provider abstraction
    └── ai/                   — AI subsystem (tools, prompts, memory, persistence)
```

## Tech Stack
| Layer     | Technology                                |
|-----------|-------------------------------------------|
| Desktop   | Electron 33                               |
| Frontend  | React 19.2, Vite 7.2, Monaco Editor 4.7  |
| Charts    | Recharts 3.7                              |
| Backend   | Express 5.2 (Node.js)                     |
| Database  | DuckDB (Neo API nativa @duckdb/node-api)  |
| AI SDK    | Vercel AI SDK 6.0 + Zod                   |
| AI        | Ollama (local) + cloud: Google Gemini, Anthropic, OpenAI, Google Vertex (MiniMax key reserved) |
| Build     | electron-builder (NSIS/Windows)           |

## Key Commands
```bash
pnpm install           # Install deps (raíz). Repetir dentro de client/ para el frontend.
pnpm start             # Dev: concurrently runs Vite, waits on :5173, then launches Electron
pnpm client:dev        # Frontend only (Vite on port 5173)
pnpm client:build      # Production build → client/dist/
pnpm dist              # client:build + electron-builder (NSIS installer, Windows)
```

**Package manager: pnpm 11+ (obligatorio).** No usar `npm install` ni `yarn`. pnpm 11 aplica `minimumReleaseAge=1440` (cuarentena de 24h para versiones recién publicadas) y allowlist explícita de scripts de instalación — defensa contra ataques tipo Shai‑Hulud / TeamPCP. Config en `pnpm-workspace.yaml` (raíz y `client/`).

**No test, lint, or typecheck scripts exist** in `package.json` — don't claim to have run them. If you change code, verify by running the app and exercising the affected UI path.

The `postinstall` hook runs `electron-builder install-app-deps` to rebuild native modules (notably `@duckdb/node-api`) against Electron's Node ABI. If DuckDB fails to load after `pnpm install`, re-run `pnpm run postinstall`.

**Si pnpm reporta `ERR_PNPM_IGNORED_BUILDS`** al añadir una dep nueva con script de install: revisar el script, y si es legítimo añadirlo a `allowBuilds` en `pnpm-workspace.yaml` con `true`; si no se necesita ejecutar, marcarlo con `false` explícitamente para silenciar la advertencia.

## Project Structure — Key Files

### Frontend (client/src/components/)
- `App.jsx` (44KB) — Root, phases: WELCOME → SELECTING_DB → IDE
- `SqlEditor.jsx` (57KB) — Monaco editor, autocomplete, CTE debug
- `cuaderno/` — **the notebook**, rebuilt: `CuadernoEditor.jsx` (container), `Celda.jsx` / `CeldaTexto.jsx` (fixed-height cells), `PantallaCompleta.jsx` (one cell, whole tab), `Barra.jsx` (right sidebar: outline, live views, parameters), plus the pure halves `claves.js`, `vistasVivas.js`, `grafo.js` and `exportar.js`. Each SQL cell leaves a temp view named after the cell; `grafo.js` derives dependencies from what each cell reads and drives «Actualizar»
- `ResultsTable.jsx` (38KB) — Paginated results with sort/filter
- `DataVisualizer/` — **"Story Flow"**, the data-visualization section (official name): 15+ Recharts chart types organized in a 6-stage flow (Type → Data → Format → Style → Story → Export), with storytelling layer (annotations, takeaway, emphasis), bundled fonts, an in-app guide + first-run tour (`StoryFlowGuide.jsx`). Config persists to `.amoxvis`.
- `DataProfiler.jsx` (30KB) — Statistical profiling
- `AiSidebar.jsx` (36KB) — AI chat assistant
- `SettingsModal.jsx` (97KB) — Full settings UI
- `LayoutManager.jsx` — Split-pane layout with tabs
- `EditorPane.jsx` — Editor container, detects .sqlnb for notebook mode
- `DatabaseExplorer.jsx` — Schema browser
- `FileExplorer.jsx` — Project file browser
- `DbtPanel.jsx` — DBT Studio. Its pieces live in `dbt/` (5.12): `EntornoDbt.jsx` (the project's environment, **Set up dbt…**), `BarraTarget.jsx`, `BarraModelo.jsx` (above a model in the editor: Compiled · Preview · Run · ±stream · Test; «Promote to dbt model» above a loose `.sql`), `useCorrerDbt.js` (run dbt from any screen, with the production confirmation), `PuenteDbt.jsx`. dbt completion is `client/src/utils/dbtCompletado.js` (pure), wired in `SqlEditor.jsx`; the catalog refreshes on the `amox_dbt_cambio` event
- `lago/Lago.jsx` — DuckLake in the explorer (5.12): New lake…, Lake versions, As it was, maintenance
- `ErDiagram.jsx` — ER diagram visualization
- `CommandPalette.jsx` — Ctrl+Shift+P quick actions

### Backend (server/)
- `index.js` (88KB) — All REST endpoints
- `DatabaseManager.js` (10KB) — DuckDB connection lifecycle. The user DB is attached as `user_db` — unless it has views that name its catalog by the file's name (what dbt and the engine itself write: `"tienda"."main"."x"`), then it is attached under that name (`_ajustarAlias`, also after `recuperar()`). Code must read `dbManager.alias`, never assume `user_db`. `ponerSesion(clave, sentencias)` (5.13): statements every connection needs (TEMP macros are per connection and there are several lanes), applied to the existing lanes and to every lane opened later, also after an engine restart
- `AiManager.js` (14KB) — Provider management (Ollama, Gemini, Anthropic, OpenAI, Vertex) + legacy `generateQuery()` and the tool-loop `chat()`
- `ai/agenticLoop.js` — Main tool-calling loop (drives multi-step AI turns)
- `ai/tools.js` — AI tool definitions (execute_sql, list_tables, describe_table, display_chart, suggest_followups)
- `ai/tools_planner.js` — Tool set for the experimental planner mode (`experimental.planner` in config)
- `ai/systemPrompt.js` — Thin re-export of `ai/prompt/index.js` (kept for back-compat `require` paths)
- `ai/prompt/` — Modular system-prompt composer: `index.js` (entry, also `buildSystemParts` for Anthropic prompt caching), `schema.js`, `tools.js`, `modes.js`, `context.js`
- `ai/skills.js` — **Loader** for project-level skills; reads markdown from the project's `agent/skills/<id>/SKILL.md` (front-matter: name, description, keywords, next), mtime-cached
- `ai/contextLoader.js` — Loads the project's `context/` folder (metrics.yml, joins.yml, glossary.md, examples/) into the prompt — NOT `.amoxsql/context/`
- `ai/modelProfiles.js` — Per-model capability / parameter profiles (Ollama + cloud)
- `ai/promptOnlyMode.js` — Fallback path when the active model can't do tool-calling (virtual table mapping, SQL block extraction)
- `ai/profiling.js` — Table/column profiling used as AI context
- `ai/chartStory.js` — Narrative generation for charts
- `ai/findingsLinter.js`, `ai/joinSanityCheck.js` — Validation passes over AI output / generated SQL
- `ai/compaction.js` — Context window token management
- `ai/persistence.js` — Conversation storage in DuckDB (`amoxsql_ai` schema)
- `ai/memory.js` — Cross-conversation memory extraction
- `ai/userRules.js` — `RULES.md` loader for custom per-project AI behavior
- `ai/testRunner.js` — Local test harness for AI flows
- `ai/_sqlHelpers.js` — Shared SQL utilities for tools
- `ai/politica.js` — A workspace's **AI policy** (local only · schema only · samples · everything), enforced server-side: provider check in `AiManager.getModel` + a model middleware that filters every tool result before it reaches a cloud model
- `ai/capaWorkspace.js` — Layers the workspace's context (rules, metrics, glossary, skills from `~/.amoxsql/workspaces/<id>/`) under the project's
- `central/` — **AmoxSQL's own database** (`~/.amoxsql/amoxsql.duckdb`): workspaces, projects, credentials (encrypted), runs, preferences. Versioned migrations in `central/migraciones.js` — a published migration is never edited; add a new one. v4 (5.11): `destinos_locales`, `programaciones`, and `ejecuciones.programacion_id / prevista / resumen`
- `secretos.js` — Credentials encrypted with the OS keychain (`safeStorage` in Electron main, bridged over `parentPort`); the renderer never receives a key value
- `workspaces.js` — Workspaces (B1), the user's word for them (B8), linking folders, the workspaces view summary, `.amoxworkspace` export/import
- `excel.js` — **The one place that composes an Excel read** (5.10, C2): sources, the import dialog and Data Flow all go through it. Always `empty_as_varchar`, never `ignore_errors`; an open range `A4:E` becomes `A4:E1048576` + `stop_at_empty`; fill-down; sheet union with `_hoja`; a file that is not a workbook is recognized by its signature (`.xls`/encrypted, damaged, CSV in disguise). Sheet names come from `xlsxMeta.js` (reads the ZIP directly, ZIP64 included); the third-party workbook parser was removed
- `fuentes.js` — **Named sources** (5.10, C1): definitions, per-machine locations, and the in-memory catalog `fuentes`
- `llegadas.js` — **The file that just arrived** (5.10, C3): watches the folder of each folder-type source, waits until a new file stops changing (a synced folder writes in several passes), remounts the catalog and notifies `/api/fuentes/llegadas`
- `procedencia.js` — **Where each table came from** (5.10, C5): every load path (import, Excel import, Data Flow's Import File/Folder, `CREATE TABLE … AS … fuentes."x"`) writes `COMMENT ON TABLE` with a human line plus a JSON (`{"amoxsql":"procedencia",…}`: files with size and mtime, sheet/range, source, rows, when). The explorer and the AI read it back; a file that changed since is flagged
- `publicar.js` — **Publishing a file** (5.10, C6, Data Flow's Publish node): checks the schema against what is already published (a removed or retyped column stops it), writes `.<name>.amoxtmp` with `KV_METADATA` (source, date, process, workspace, rows, schema) and renames it with retries — any open handle blocks a replace on Windows —, then registers the named source
- `xlsxEscribir.js` — **Writing Excel** (5.11, D3): a formatted workbook, one sheet per query, with no library. The query is materialized in a temp table, measured (rows, widths), and read in batches by `rowid`; the sheet is compressed as it streams. The format comes from the column TYPE (dates as serials with a date format, `DECIMAL(p,s)` with its places, integers without separators, a BIGINT Excel can't hold exactly as text). Used by the Excel node, Export File (xlsx) and `/api/export-data`. Written aside and renamed (Dec-13)
- `xlsxPlantilla.js` — **Filling the client's template** (5.11, D3): copies the workbook byte by byte and rewrites only the data cells — an Excel table (grows/shrinks, calculated columns get their formula, the totals row moves) or a sheet from a cell (old data cleared, a formula next to it filled down). Chart ranges, defined names, conditional formatting, validations and pivot sources that covered the old rows are extended; `fullCalcOnLoad`, `calcChain.xml` dropped. Stops before writing over something below. `describirPlantilla` lists sheets and tables for the UI (`/api/excel/plantilla`)
- `programacion/` — **Scheduled processes** (5.11, D1; Dec-15–18): `reglas.js` (readable rules — daily, weekly, monthly incl. first/last/Nth business day, every N hours — pure `siguiente`/`ocurrencias`/`describir`), `calendario.js` (the workspace's working days and holidays, `calendario.json`, travels), `programaciones.js` (CRUD on the central table `programaciones`; `tick(ahora)` runs the LATEST missed occurrence of each, never one older than 7 days, keyed by (programacion_id, prevista) in `ejecuciones` so it never runs twice; general pause in preferences), `programador.js` (runs an occurrence in an isolated context with `origen: 'programada'`, saves its summary, notifies per schedule; the open app's 1-minute clock; tells Electron main the next due time). Times are stored as UTC ISO in TIMESTAMP columns and read back as UTC (`deBase`). `AmoxSQL.exe tick` is an order like `run`. D8: a rule `{ tipo: 'al_llegar', fuente }` runs when the folder source's watcher (`llegadas.js`) reports a stable file, debounced (`programador.alLlegar`), only with the app open. `GET /api/operacion` feeds the **Operations** panel (`client/src/components/operacion/VistaOperacion.jsx`, opened with the `amox_abrir_operacion` event; `BotonOperacion` in the title bar)
- `destinos.js` — **Delivery destinations** (5.11, D6; Dec-21): a named folder where processes leave files. Same two halves as a source: the definition (`destinos/<name>.json` in the workspace or `.amoxsql/destinos/` in the project: `nombre`, `descripcion`, `subcarpeta` with date tokens, `ubicacion` if relative/URL) travels; the folder on this machine goes to the central table `destinos_locales` (migration 4). `rutaDeEntrega` builds the final path (never creates the destination's own folder: an unreachable drive is an error); `ponerFechas` resolves `{fecha}`, `{fecha:AAAA-MM}`, `{hora}` with the run's reference date (the scheduled occurrence's, for D1). Excel / Export File / Publish nodes take `config.destino`; `ChainExecutor.rutaDeSalida`
- `parametros.js` — **A process's parameters** (5.11, D4; Dec-19): typed definitions in `.sqlchain → parametros` (defaults stay in `variables`), validation, and the context-aware rewrite of `${x}`: in SQL, a typed parameter becomes `getvariable('x')` (set with `SET VARIABLE` on the step's connection), inside quotes it is text with quotes doubled, in an identifier quotes doubled; in a file name a value from outside cannot carry folders or `..`. The author's own values are pasted exactly as before (5.10 processes run unchanged); values from outside (command line, form, batch, schedule — `deFuera`) can never change the query. Also the batch reader (`--batch` CSV/JSON)
- `zip.js` — ZIP without libraries: `abrir()` lists every entry (ZIP64 included) and hands out raw or inflated bytes; `EscritorZip` adds small entries, streams big ones (data descriptor) and copies entries of another ZIP without recompressing
- `motor.js` — **Every engine instance is created here** (`crearInstancia`), with `enable_external_file_cache = false`: with the cache on, reading a file that was replaced by a rename served bytes of the old one
- `dbtConvivir.js` — **dbt without locks** (5.10, I1): reads from `profiles.yml` which files a dbt command will open; if one is AmoxSQL's database, `dbManager.prestar()` detaches it (engine, temp views, sources and extensions survive) and `recuperar()` re-attaches it when dbt ends, however it ends. Meanwhile `/api/query` answers 409 saying why
- `dbt/` — **dbt inside AmoxSQL** (5.12, family I; Dec-26–36). `correr.js`: the one runner — the UI text is parsed into arguments (`&&`, `|`, `;`, redirections, `$(` rejected), spawned with no shell and no timeout, `DBT_USE_COLORS=false`, cancel kills the tree; the environment comes from `project.json → dbt.entorno` (types `amoxsql | python | conda | sistema` only: a `directo` exe is never read from the file, it travels with the project). `entorno.js`: **Set up dbt…** (venv + pinned `dbt-core`/`dbt-duckdb`/`duckdb` = the engine's version, under `<home>/entornos/`). `ejecutar.js`: a dbt run is a row in `ejecuciones` with no migration (`proceso` = the command text, summary in `resumen`); `resultados.js` turns `run_results.json` + manifest into the summary (`aviso` when a test warns and dbt exits 0). `proyecto.js`: targets, the active one (`--target` added unless the command names one), production and the typed confirmation (409 only when another target exists), `crear` (seed + one model per layer, `persist_docs`, `store_failures`, a single `prod`). `modelo.js`: what each file is, compile only when stale, the preview (compiled SQL in AmoxSQL's engine; catalog rewritten to the attached alias, or the target DB attached read-only), go-to-definition. `catalogo.js`: completion's catalog (never launches dbt). `linaje.js`: each run accumulates the last state per node in `target/amox_ultimos.json`; row counts by AmoxSQL (tables only). `fuentes.js` + `puente.js`: AmoxSQL sources as `source('amoxsql', …)` via `env_var('AMOXSQL_FUENTE_<N>')` (the full read in parentheses) in `models/sources/amoxsql.yml`; promote a query to a model (`ref()`/`source()`, the original untouched). Scheduling: `programador.correrOcurrencia` and `AmoxSQL.exe dbt <cmd> --project <dir>` take a command that starts with `dbt `
- `lago.js` — **DuckLake** (5.12, I8): create (`<n>.ducklake` or `<n>.ducklake.sqlite`, data in `<catalog>.files/`), versions (table ids mapped to names through `__ducklake_metadata_<alias>`), «as it was» / «what changed» as SQL, maintenance with a dry-run preview of exactly what is deleted (Dec-33)
- `contrato.js` — **A source's contract** (5.13, E2+E3; Dec-37–40): columns by family (texto · numero · fecha · logico) and rules (no_nulos · unico · rango · valores · filas_minimas) in `fuentes/<n>.json → contrato`. With a contract an Excel/CSV source is read with `all_varchar` and each column converted (an empty first cell or an «N/A» no longer breaks the type); checked with one DESCRIBE + ONE query, before a Data Flow run's first step (step «Source contract»; `alFallar` parar|avisar) and before dbt; never on interactive queries. `fuentes.comprobarContrato` / `contratoDeHoy`
- `medidas.js` — **Workspace measures as functions** (5.13, Dec-41): each metric of `metrics.yml` (workspace `contexto/` + project `context/`, project wins) becomes `CREATE TEMP MACRO name(<its columns>)`, created on every lane via `dbManager.ponerSesion` and in isolated contexts; a name that is already an engine function is never created (a TEMP `sum` shadows `sum()` for the whole session). `GET /api/medidas`; the editor completes and hovers them; the assistant gets the call form
- `descripciones.js` — Table/view/column descriptions (5.12, Dec-30): the engine's comments, else the dbt YAML from the manifest when the attached DB is the target's. Fed to the explorer (`/api/db/schemas`) and the assistant
- `ejecucion/atencion.js` — **«Needs attention»** (5.13, Dec-45): unattended runs (programada · linea_de_comandos · lote) that failed or warned in 30 days, only if it's the latest run of that process, minus the seen ones (preference `atencion_vistas`). Shown on the welcome screen (only when non-empty — the one exception to «the welcome screen is untouchable», asked by the author) and on each workspace's page (`client/src/components/operacion/Atencion.jsx`)
- `ejecucion/limites.js` · `reintentos.js` · `fechaDeLosDatos.js` (5.13): background runs with AmoxSQL open get `threads`/`memory_limit`/`temp_directory` (preference `limites_fondo`, shown in the run record; the `proyecto` base isn't limited); network steps retry only transient errors (default 2×30 s scheduled, 0 from the UI, `config.reintentos`); the data date = newest file a run read, written to Excel (custom properties, optional line, template name `datos_al`), Publish (`amoxsql.datos_al`), the summary line and the Report Flow footer field `data`
- **5.14 «El día a día»** (Dec-46–53): `retomar.js` (`GET /api/proyecto/retomar`, the «Where you left off» card `Retomar.jsx`; tabs are saved per project, `amoxsql-layout-v1:<folder>`), `paquete.js` (the `.amoxproject`: what always travels, the data you choose, never `.git`/`.env*`/keys/work folder/deliveries; `project.json` without `id`; extraction only into a new or empty folder), `hermanos.js` (look at another project of the workspace: its DB attached `READ_ONLY` under the project's normalized name, only from the list; those catalogs are left out of `userTablesWhereClause`; `OtrosProyectos.jsx` in the explorer), `entregas.js` (Excel / Export File / Publish save the file they replace in `<project>/.amoxsql/entregas/<name>-<hash>/` with `indice.json`, last 5, ≤ 200 MB, never remote; `conAnterior` undoes the copy if the write fails; `comparar` by key or whole rows, as text; `CompararEntrega.jsx` from the run record), `diffDeProcesos.js` (pure: a `.sqlchain` diff in steps, fields, connections, parameters and variables; positions ignored; `GET /api/procesos/cambios` with HEAD / index / disk via `gitManager.getFileAt`; the Git panel's **Steps** view and Data Flow's **What changed**). Workspace snippets: `GET/POST /api/snippets/workspace` → `<home>/workspaces/<id>/snippets.json`
- `ejecucion/` — Data Flow runs: isolated contexts (memory / work database / project), the central run history, and the command line (`AmoxSQL.exe run … [--param n=v] [--batch runs.csv]`, see `ordenes.js`). `ejecutarProceso({ variables, deFuera, origen })`: `deFuera` are values that did not come from the author; `origen` ∈ interfaz · linea_de_comandos · lote · formulario. `GET /api/ejecuciones/:id` (5.11, D2) is one run for the client's `FichaEjecucion.jsx` (opened from a notification's click via `electronAPI.onAbrirEjecucion`, or anywhere with the `amox_abrir_ejecucion` window event); `POST /api/ejecuciones/:id/repetir` runs it again (a scheduled one as the same occurrence). `resumen.js` (5.11) turns a run's steps into what it read, what it left (files, with whether they still exist) and where it failed, plus one line for a notification — used by the form (D5) and the notifications (D2), `GET /api/chains/run/:runId/resumen`

### Utilities
- `client/src/utils/cuadernoFile.js` — Read/write `.sqlnb` (markdown + front matter); also reads JSON v3.0, v2.0 and the legacy `-- !CELL:` markers, and saves them in the new format
- `client/src/utils/celdaSql.js` — What can be known about a cell before running it (wrappable? what does it read? does it write?)
- `client/src/utils/vistaDeCelda.js` — Composes the implicit view: `CREATE OR REPLACE TEMP VIEW` + `COMMENT ON` + the reader

## File Formats
- `.sql` — Plain SQL files
- `.sqlnb` — Notebook: **markdown with front matter** (`parametros`), SQL cells as fenced ` ```sql ` blocks preceded by `<!-- celda: nombre -->` (marks: `materializada`, and since 5.14 `borrador` — a draft runs but stays out of Word and the deck; `<!-- celda borrador -->` without a name, `<!-- texto borrador -->` before a text cell). Reads JSON v3.0, v2.0 and legacy markers, and saves them in the new format. Parameters use `{{name}}`, shared with `.amoxdeck`
- `.sqlnb.state.json` — Visual state alongside the notebook (cell mode, split, chart configs), keyed by cell **name**, never by position
- `.amoxvis` — Chart configuration files
- `.sqlchain` — A **Data Flow** process (JSON): `nodes`, `edges`, `variables` (defaults of `${name}`), and since 5.11 `parametros: [{ nombre, tipo: texto|numero|fecha|lista|logico, etiqueta, opciones }]` (D4) and `vista: 'formulario'` (opens as a form, D5). The Excel node is `type: 'excel'`
- `.amoxdeck` — **Report Flow** deck: markdown-first presentation (front-matter + slides split by `---` + `<!-- layout: X -->` directives + fenced ` ```amoxchart ` blocks referencing a `.amoxvis`). Edited visually via the in-tab Report Flow Studio (`client/src/components/deck/`); parsed by `client/src/utils/deckParser.js`. Exports to native/editable PowerPoint (`generatePptxReport.js`) and Word.
- `.amoxdiagram` — **AmoxDiagram** diagram: front-matter + one fenced ` ```mermaid ` flowchart block. Edited visually in its own tab (`client/src/components/diagram/`); parsed by `client/src/components/markdown/mermaidFlow.js`, which reads and writes the same subset in both directions. A mermaid block inside a `.md` opens in the same editor and is written back into that block alone (`diagramMerge.js` guards the round trip). **Positions are not stored** — mermaid computes them and the editor reads them back from the rendered SVG (`mermaidGeometria.js`), so the canvas shows what the document will draw.
- `.amoxproject` — A **project in one file** (5.14, G2/G3): a ZIP with `amoxproject.json` (name, whether it is a template, files, data, what it needs); written/read by `server/paquete.js`
- `.amoxworkspace` — A **workspace** exported to share it (5.9, B6): plain JSON `{ formato: 'amoxworkspace', version: 1, exportado, workspace: { id, nombre, etiqueta, color, politicaIa, marca }, contexto: { '<ruta>': '<texto>' }, requiere: { credenciales: [{ nombre, tipo }], extensiones } }`. Carries credential **names** only, never values. Importing keeps the same `id` (so folders linked elsewhere recognize it) and merges file by file. Written/read by `server/workspaces.js`
- `.amoxsql/project.json` — Per-folder manifest: `requiere` (credential names, extensions, and since 5.10 `fuentes`: names of the named sources it uses), and since 5.9 `id`, `workspace: { id, nombre }`, `estado`, `entrega`; since 5.10 `lecturas: { '<file, relative to the project>': { hoja | hojas, rango, encabezado, normalizar, rellenar } }` — how each Excel was last read (the import dialog pre-fills from it, Data Flow's Import File uses it when the node says nothing). Writers must merge (`scaffolder.saveProjectConfig`)
- `fuentes/<nombre>.json` — A **named source** (5.10, C1) definition: `{ nombre, tipo: 'archivo', descripcion?, formato?, ubicacion?, excel?: { hoja, rango, encabezado }, csv?: { delimitador, encabezado } }`. Since C4 also `tipo: 'bucket'` (`patron`, `hive`, `credencial`) and `tipo: 'lago'` (`formato: delta | iceberg | ducklake`, `tabla`, `credencial`); a URL `ubicacion` is the same on every machine, and `credencial` names a cloud credential whose secret is created TEMPORARY with a `SCOPE` on the source's prefix. Since C3 `tipo: 'carpeta'` adds `patron`, `criterio: 'reciente' | 'todos'` (the newest file that finished arriving, or all of them with `_archivo`) and `subcarpetas`. Lives in `<home>/workspaces/<id>/fuentes/` (travels in the `.amoxworkspace`) or `<project>/.amoxsql/fuentes/` (wins by name). The per-machine location is NOT here: it goes to the central table `fuentes_locales`, unless `ubicacion` is a URL or a path relative to the project. Each source is a view of the in-memory catalog `fuentes`, queried as `fuentes."name"`. `server/fuentes.js`
- `RULES.md` — Per-project AI behavior rules
- `agent/skills/<id>/SKILL.md` — Project-level AI skills (markdown + YAML front-matter), loaded by `ai/skills.js`. The repo ships a starter set (eda-initial, data-quality, sql-optimization, time-series, cohort-comparison, metric-investigation, data-storytelling, analysis-planning).
- `context/` (project root) — Per-project context fed to the AI: `metrics.yml`, `joins.yml`, `glossary.md`, `examples/*.sql` (template in `templates/.amoxsql/context/`; the scaffolder creates `context/`). Since 5.13 each metric is also a SQL function (`server/medidas.js`)

## State Management
- **No Redux/Zustand** — React Context (ToastProvider) + local useState + localStorage/sessionStorage
- **localStorage keys**: `amoxsql-theme`, `amoxsql-accent`, `amoxsql-editor-layout`, `amoxsql-editor-settings`, `amoxsql-sidebar-width`, `amoxsql-ui-zoom`
- **sessionStorage**: `amoxsql-open-tabs`

## API Server (port 3001)
- `/api/project/*` — Project management
- `/api/files/*` — File CRUD
- `/api/db/*` — Database operations (connect, query, schema, import)
- `/api/query` — Execute SQL
- `/api/profile` — Data profiling
- `/api/ai/*` — AI chat, conversations, config
- `/api/dbt/*` — DBT integration
- `/api/export-data` — Data export (CSV, Parquet, Excel)
- `/api/cuaderno/celda` — Runs a notebook cell: leaves its temp view and returns the rows (two pieces in one call, so the row limit still applies to the reader)
- `/api/cuaderno/vistas` — The session's live temp views and tables, with their descriptions
- `/api/notebook-state` — Notebook visual state persistence (the endpoint REWRITES the whole file; callers must preserve keys that are not theirs)
- `/api/snippets`, `/api/bookmarks` — User snippets and bookmarks
- `/api/settings/*` — Config and Ollama model management

## Conventions
- CSS Variables for theming (30+ tokens), dark/light themes
- Lazy loading for heavy modals (React.lazy)
- All AI tools use Zod schemas for validation
- DuckDB query history auto-tracked in `amox_query_history` table
- AI conversations persisted in `amoxsql_ai` schema within DuckDB
- Config stored at `~/.amoxsql/config.json`
- **Desktop-native mindset**: DuckDB is local and fast — do not reason about network latency, loading spinners, or caching like a web app. Call queries directly.
- **Do NOT introduce list/table virtualization** (e.g. `@tanstack/react-virtual`). Prior attempts hurt performance in this app; `ResultsTable` paginates instead.
- **No emojis in the UI** — always use Lucide icons (`react-icons/lu`). The only exception is the Markdown export in `client/src/components/ai/exportConversation.js` (it's text, not UI).
- **No references to external technologies or products** in code, prompts, comments, UI text, or docs. Only what the product is built on or integrates may be named: the LLM providers (Ollama, Google Gemini, Anthropic, OpenAI, Google Vertex), DuckDB (the engine), AmoxSQL itself, and the project's own dependencies (React, Vite, Electron, Recharts, Express, Vercel AI SDK, Zod, Monaco, etc.).

## Further Reading (in-repo docs)
- **`docs/`** — the **user-facing documentation** (bilingual ES/EN, ~57 pages/language). Start at `docs/README.md` (master index). This is the place for how each feature works from a user's perspective.
- `docs/dev/arquitectura.md`, `decisiones_tecnicas.md`, `patrones_react.md`, `guia_estilos.md` — deeper architecture, design decisions, React patterns, and style guide (internal, mostly Spanish)
- `docs/dev/auditoria_visualizaciones.md`, `plan_story_flow.md` — **Story Flow** (the data-viz section): capability audit + phased implementation plan/status
- `contexto_caracteristicas/*.md` — per-feature deep dives (AI system, notebook, autocomplete, layout/tabs, DB ops, file formats)
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` — contribution flow, security policy, version history
