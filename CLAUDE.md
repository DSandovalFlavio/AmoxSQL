# AmoxSQL — Project Guide

## Overview
**AmoxSQL** is a desktop SQL IDE for local data analysis, built with Electron + React + Express + DuckDB.
- **Version**: 1.9.5
- **Author**: Flavio Sandoval (@dsandovalflavio)
- **License**: AmoxSQL Community License (Source Available)
- **Tagline**: "The Modern Codex for Local Data Analysis"

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
| AI        | Ollama (local), Google Gemini (cloud)     |
| Build     | electron-builder (NSIS/Windows)           |

## Key Commands
```bash
npm start              # Dev: Vite + Electron concurrently
npm run client:dev     # Frontend only (port 5173)
npm run client:build   # Production build
npm run dist           # Build executable (electron-builder)
```

## Project Structure — Key Files

### Frontend (client/src/components/)
- `App.jsx` (44KB) — Root, phases: WELCOME → SELECTING_DB → IDE
- `SqlEditor.jsx` (57KB) — Monaco editor, autocomplete, CTE debug
- `SqlNotebook.jsx` (20KB) — Notebook interface with cells
- `NotebookCell.jsx` (28KB) — Individual cell (SQL, Markdown, Input)
- `ResultsTable.jsx` (38KB) — Paginated results with sort/filter
- `DataVisualizer/` — 12+ chart types (Recharts)
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
- `AiManager.js` (14KB) — Ollama/Gemini provider management
- `ai/tools.js` — AI tool definitions (execute_sql, list_tables, describe_table, display_chart, suggest_followups)
- `ai/systemPrompt.js` — Dynamic prompt builder with schema context
- `ai/persistence.js` — Conversation storage in DuckDB
- `ai/memory.js` — Cross-conversation memory extraction
- `ai/compaction.js` — Context window token management
- `ai/userRules.js` — RULES.md loader for custom AI behavior

### Utilities
- `client/src/utils/notebookParser.js` — Parse/serialize .sqlnb files (JSON v2.0 + legacy marker format)
- `client/src/utils/generateHtmlReport.js` — Self-contained HTML report export with charts as PNG

## File Formats
- `.sql` — Plain SQL files
- `.sqlnb` — SQL Notebook (JSON v2.0 with cells array + environment)
- `.sqlnb.state.json` — Sidecar file for notebook visual state (results cache, chart configs)
- `.amoxvis` — Chart configuration files
- `RULES.md` — Per-project AI behavior rules

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
