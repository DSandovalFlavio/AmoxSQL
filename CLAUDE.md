# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AmoxSQL — Project Guide

## Overview
**AmoxSQL** is a desktop SQL IDE for local data analysis, built with Electron + React + Express + DuckDB.
- **Version**: 3.4.0
- **Author**: Flavio Sandoval (@dsandovalflavio)
- **License**: AmoxSQL Community License (Source Available)
- **Tagline**: "The Modern Codex for Local Data Analysis"

## Runtime Topology (big picture)
Three processes cooperate at runtime:
1. **Electron main** ([electron/main.js](electron/main.js)) — owns the BrowserWindow, holds the single-instance lock, handles native dialogs / window controls via `ipcMain`, and **spawns the Express server as a `utilityProcess`** on a dynamically assigned port (prefers 3001, falls back to OS-assigned if busy).
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
- `SqlNotebook.jsx` (20KB) — Notebook interface with cells
- `NotebookCell.jsx` (28KB) — Individual cell (SQL, Markdown, Input)
- `ResultsTable.jsx` (38KB) — Paginated results with sort/filter
- `DataVisualizer/` — **"Story Flow"**, the data-visualization section (official name): 15+ Recharts chart types organized in a 6-stage flow (Type → Data → Format → Style → Story → Export), with storytelling layer (annotations, takeaway, emphasis), bundled fonts, an in-app guide + first-run tour (`StoryFlowGuide.jsx`). Config persists to `.amoxvis`.
- `DataProfiler.jsx` (30KB) — Statistical profiling
- `AiSidebar.jsx` (36KB) — AI chat assistant
- `SettingsModal.jsx` (97KB) — Full settings UI
- `LayoutManager.jsx` — Split-pane layout with tabs
- `EditorPane.jsx` — Editor container, detects .sqlnb for notebook mode
- `DatabaseExplorer.jsx` — Schema browser
- `FileExplorer.jsx` — Project file browser
- `DbtPanel.jsx` — DBT integration
- `ErDiagram.jsx` — ER diagram visualization
- `CommandPalette.jsx` — Ctrl+Shift+P quick actions

### Backend (server/)
- `index.js` (88KB) — All REST endpoints
- `DatabaseManager.js` (10KB) — DuckDB connection lifecycle
- `AiManager.js` (14KB) — Provider management (Ollama, Gemini, Anthropic, OpenAI, Vertex) + legacy `generateQuery()` and the tool-loop `chat()`
- `ai/agenticLoop.js` — Main tool-calling loop (drives multi-step AI turns)
- `ai/tools.js` — AI tool definitions (execute_sql, list_tables, describe_table, display_chart, suggest_followups)
- `ai/tools_planner.js` — Tool set for the experimental planner mode (`experimental.planner` in config)
- `ai/systemPrompt.js` — Thin re-export of `ai/prompt/index.js` (kept for back-compat `require` paths)
- `ai/prompt/` — Modular system-prompt composer: `index.js` (entry, also `buildSystemParts` for Anthropic prompt caching), `schema.js`, `tools.js`, `modes.js`, `context.js`
- `ai/skills.js` — **Loader** for project-level skills; reads markdown from the project's `agent/skills/<id>/SKILL.md` (front-matter: name, description, keywords, next), mtime-cached
- `ai/contextLoader.js` — Loads per-project context files (e.g. `.amoxsql/context/`) into the prompt
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

### Utilities
- `client/src/utils/notebookParser.js` — Parse/serialize .sqlnb files (JSON v2.0 + legacy marker format)
- `client/src/utils/generateHtmlReport.js` — Self-contained HTML report export with charts as PNG

## File Formats
- `.sql` — Plain SQL files
- `.sqlnb` — SQL Notebook (JSON v2.0 with cells array + environment)
- `.sqlnb.state.json` — Sidecar file for notebook visual state (results cache, chart configs)
- `.amoxvis` — Chart configuration files
- `.amoxdeck` — **Report Flow** deck: markdown-first presentation (front-matter + slides split by `---` + `<!-- layout: X -->` directives + fenced ` ```amoxchart ` blocks referencing a `.amoxvis`). Edited visually via the in-tab Report Flow Studio (`client/src/components/deck/`); parsed by `client/src/utils/deckParser.js`. Exports to native/editable PowerPoint (`generatePptxReport.js`) and Word.
- `RULES.md` — Per-project AI behavior rules
- `agent/skills/<id>/SKILL.md` — Project-level AI skills (markdown + YAML front-matter), loaded by `ai/skills.js`. The repo ships a starter set (eda-initial, data-quality, sql-optimization, time-series, cohort-comparison, metric-investigation, data-storytelling, analysis-planning).
- `.amoxsql/context/*.md` — Per-project context fed to the AI (see `templates/.amoxsql/context/`)

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
- `/api/notebook-state` — Notebook sidecar state persistence
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

## Further Reading (in-repo docs, mostly Spanish)
- `docs/dev/arquitectura.md`, `decisiones_tecnicas.md`, `patrones_react.md`, `guia_estilos.md` — deeper architecture, design decisions, React patterns, and style guide
- `docs/dev/auditoria_visualizaciones.md`, `plan_story_flow.md` — **Story Flow** (the data-viz section): capability audit + phased implementation plan/status
- `contexto_caracteristicas/*.md` — per-feature deep dives (AI system, notebook, autocomplete, layout/tabs, DB ops, file formats)
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` — contribution flow, security policy, version history
